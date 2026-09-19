-- League of Legends PROTOTYPE — manual Riot ID + temporary third-party data source (GamID TESTING only).
--
-- The domain model is source-neutral: it stores a Riot ID, a Riot platform id, and normalized Solo/Duo rank fields, plus
-- generic provenance (how the identity was provided, which data source filled it, its URL and timestamps). The temporary
-- data source is only a value of data_source, so a later official Riot RSO + Riot API source replaces it without a
-- schema redesign. A manually entered Riot ID is NOT proof of ownership, so a temporary source can never be VERIFIED.
--
-- Private by default: rows are owner-only, never part of any public RPC, and only normalized fields are stored (never HTML
-- or a raw response). Lookups are rate-limited in the database BEFORE any outbound request is made, through a one-time
-- reservation that also binds the later write to the authenticated owner.

create table public.league_profiles (
  league_profile_id uuid primary key default gen_random_uuid(),
  entity_id uuid not null unique references public.entities(entity_id) on delete cascade,
  game_name text not null check (char_length(game_name) between 1 and 32),
  tag_line text not null check (char_length(tag_line) between 1 and 16),
  platform_id text not null check (platform_id in ('NA1', 'EUW1', 'EUN1', 'KR', 'JP1', 'BR1', 'LA1', 'LA2', 'OC1', 'TR1', 'RU', 'ME1', 'SG2', 'TW2', 'VN2', 'PH2', 'TH2')),
  identity_source text not null default 'MANUAL_RIOT_ID' check (identity_source in ('MANUAL_RIOT_ID')),
  data_source text not null check (data_source in ('OPGG_TEMPORARY')),
  trust_status text not null default 'MANUAL' check (trust_status in ('VERIFIED', 'CONNECTED', 'MANUAL')),
  solo_rank_state text not null check (solo_rank_state in ('RANKED', 'UNRANKED', 'NOT_REPORTED')),
  solo_tier text check (solo_tier is null or solo_tier in ('IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER')),
  solo_division text check (solo_division is null or solo_division in ('I', 'II', 'III', 'IV')),
  solo_lp integer check (solo_lp is null or solo_lp between 0 and 10000),
  solo_wins integer check (solo_wins is null or solo_wins between 0 and 100000),
  solo_losses integer check (solo_losses is null or solo_losses between 0 and 100000),
  profile_icon_id integer check (profile_icon_id is null or profile_icon_id between 0 and 100000),
  source_url text not null check (char_length(source_url) <= 300 and source_url ~ '^https://'),
  source_updated_at timestamptz,
  fetched_at timestamptz not null,
  last_attempt_at timestamptz not null,
  last_result text not null check (last_result in ('OK', 'NOT_FOUND', 'UNAVAILABLE', 'STRUCTURE_CHANGED', 'IDENTITY_MISMATCH')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_profiles_temporary_source_is_never_verified check (data_source <> 'OPGG_TEMPORARY' or trust_status = 'MANUAL'),
  constraint league_profiles_rank_fields_match_state check (
    (solo_rank_state = 'RANKED' and solo_tier is not null and solo_lp is not null)
    or (solo_rank_state <> 'RANKED' and solo_tier is null and solo_division is null and solo_lp is null)
  )
);

-- Reservation + throttle ledger. One row per lookup attempt (any outcome); it is also the one-time authorization for the
-- single write that follows, so a lookup result can only ever be saved for the owner who reserved it.
create table private.league_lookup_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  action text not null check (action in ('add', 'refresh')),
  requested_game_name text not null,
  requested_tag_line text not null,
  requested_platform_id text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  outcome text check (outcome in ('OK', 'NOT_FOUND', 'UNAVAILABLE', 'STRUCTURE_CHANGED', 'IDENTITY_MISMATCH', 'EXPIRED', 'INVALID_DATA', 'ALREADY_EXISTS', 'NO_PROFILE'))
);
create index league_lookup_attempts_entity_created_idx on private.league_lookup_attempts (entity_id, created_at desc);

alter table public.league_profiles enable row level security;
alter table private.league_lookup_attempts enable row level security;

create policy "owners read their own league profile"
on public.league_profiles for select to authenticated
using (exists (
  select 1 from public.entity_memberships m
  where m.entity_id = league_profiles.entity_id and m.user_id = (select auth.uid()) and m.role = 'OWNER'
));

revoke all on table public.league_profiles, private.league_lookup_attempts from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Owner-facing (authenticated)
-- ---------------------------------------------------------------------------------------------

-- Throttle policy (enforced BEFORE any outbound request): at most one lookup per 60 s per identity, at most 6 per hour
-- (failures count), and an explicit Refresh at most once per 10 minutes.
create function private.reserve_league_lookup_impl(
  candidate_action text,
  candidate_platform_id text,
  candidate_game_name text,
  candidate_tag_line text
)
returns table (reservation_id uuid, status text, retry_after_seconds integer, game_name text, tag_line text, platform_id text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  action_key text := lower(btrim(candidate_action));
  owned_entity_id uuid;
  profile public.league_profiles%rowtype;
  wait_seconds integer;
  recent_count integer;
  last_any timestamptz;
  new_id uuid;
  req_name text;
  req_tag text;
  req_platform text;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from auth.users u where u.id = caller and u.email_confirmed_at is not null) then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_VERIFIED';
  end if;
  if action_key is null or action_key not in ('add', 'refresh') then raise exception using errcode = '22023', message = 'INVALID_ACTION'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  -- serialize this identity's lookups so concurrent requests cannot both pass the throttle
  perform pg_advisory_xact_lock(hashtextextended('league-lookup:' || owned_entity_id::text, 0));

  select * into profile from public.league_profiles p where p.entity_id = owned_entity_id;

  if action_key = 'add' then
    if found then
      return query select null::uuid, 'ALREADY_EXISTS'::text, null::integer, null::text, null::text, null::text;
      return;
    end if;
    req_name := btrim(candidate_game_name);
    req_tag := btrim(candidate_tag_line);
    req_platform := upper(btrim(candidate_platform_id));
    if req_name is null or char_length(req_name) not between 1 and 32
       or req_tag is null or char_length(req_tag) not between 1 and 16
       or req_name ~ '[#/\\[:cntrl:]]' or req_tag ~ '[#/\\\s[:cntrl:]-]'
       or req_platform is null or req_platform not in ('NA1', 'EUW1', 'EUN1', 'KR', 'JP1', 'BR1', 'LA1', 'LA2', 'OC1', 'TR1', 'RU', 'ME1', 'SG2', 'TW2', 'VN2', 'PH2', 'TH2') then
      return query select null::uuid, 'INVALID_INPUT'::text, null::integer, null::text, null::text, null::text;
      return;
    end if;
  else
    if not found then
      return query select null::uuid, 'NO_PROFILE'::text, null::integer, null::text, null::text, null::text;
      return;
    end if;
    -- a refresh can only ever re-check the stored identity; it can never change it
    req_name := profile.game_name; req_tag := profile.tag_line; req_platform := profile.platform_id;
    wait_seconds := ceil(extract(epoch from (profile.last_attempt_at + interval '10 minutes' - now())))::integer;
    if wait_seconds > 0 then
      return query select null::uuid, 'COOLDOWN'::text, wait_seconds, null::text, null::text, null::text;
      return;
    end if;
  end if;

  delete from private.league_lookup_attempts a where a.entity_id = owned_entity_id and a.created_at < now() - interval '2 days';

  select max(a.created_at) into last_any from private.league_lookup_attempts a where a.entity_id = owned_entity_id;
  wait_seconds := ceil(extract(epoch from (last_any + interval '60 seconds' - now())))::integer;
  if last_any is not null and wait_seconds > 0 then
    return query select null::uuid, 'COOLDOWN'::text, wait_seconds, null::text, null::text, null::text;
    return;
  end if;

  select count(*) into recent_count from private.league_lookup_attempts a where a.entity_id = owned_entity_id and a.created_at > now() - interval '1 hour';
  if recent_count >= 6 then
    select ceil(extract(epoch from (a.created_at + interval '1 hour' - now())))::integer into wait_seconds
    from private.league_lookup_attempts a where a.entity_id = owned_entity_id and a.created_at > now() - interval '1 hour'
    order by a.created_at desc offset 5 limit 1;
    return query select null::uuid, 'RATE_LIMITED'::text, greatest(coalesce(wait_seconds, 60), 1), null::text, null::text, null::text;
    return;
  end if;

  insert into private.league_lookup_attempts (entity_id, action, requested_game_name, requested_tag_line, requested_platform_id)
  values (owned_entity_id, action_key, req_name, req_tag, req_platform)
  returning attempt_id into new_id;

  return query select new_id, 'OK'::text, null::integer, req_name, req_tag, req_platform;
end;
$$;

create function private.get_my_league_profile_impl()
returns table (
  game_name text,
  tag_line text,
  platform_id text,
  identity_source text,
  data_source text,
  trust_status text,
  solo_rank_state text,
  solo_tier text,
  solo_division text,
  solo_lp integer,
  solo_wins integer,
  solo_losses integer,
  profile_icon_id integer,
  source_url text,
  source_updated_at timestamptz,
  fetched_at timestamptz,
  last_attempt_at timestamptz,
  last_result text,
  refresh_available_at timestamptz,
  is_public boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  return query
  select p.game_name, p.tag_line, p.platform_id, p.identity_source, p.data_source, p.trust_status, p.solo_rank_state,
    p.solo_tier, p.solo_division, p.solo_lp, p.solo_wins, p.solo_losses, p.profile_icon_id, p.source_url,
    p.source_updated_at, p.fetched_at, p.last_attempt_at, p.last_result, p.last_attempt_at + interval '10 minutes', p.is_public
  from public.league_profiles p
  where p.entity_id = owned_entity_id;
end;
$$;

create function private.remove_my_league_profile_impl()
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
  removed integer;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  -- The throttle ledger is deliberately kept, so remove + add cannot be used to sidestep the rate limit.
  delete from public.league_profiles p where p.entity_id = owned_entity_id;
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Backend-only (service_role): persist or record the outcome of a reserved lookup
-- ---------------------------------------------------------------------------------------------

create function private.save_league_lookup_impl(
  candidate_reservation_id uuid,
  candidate_data_source text,
  candidate_game_name text,
  candidate_tag_line text,
  candidate_platform_id text,
  candidate_rank_state text,
  candidate_tier text,
  candidate_division text,
  candidate_lp integer,
  candidate_wins integer,
  candidate_losses integer,
  candidate_profile_icon_id integer,
  candidate_source_url text,
  candidate_source_updated_at timestamptz
)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  att private.league_lookup_attempts%rowtype;
  existing public.league_profiles%rowtype;
  outcome_text text;
begin
  select * into att from private.league_lookup_attempts a where a.attempt_id = candidate_reservation_id for update;
  if not found or att.completed_at is not null then return 'INVALID_RESERVATION'; end if;

  if att.created_at < now() - interval '3 minutes' then
    update private.league_lookup_attempts a set completed_at = now(), outcome = 'EXPIRED' where a.attempt_id = att.attempt_id;
    return 'EXPIRED';
  end if;

  -- what came back must be the player that was asked for (case-insensitive: the source may canonicalize capitalization)
  if lower(coalesce(candidate_game_name, '')) <> lower(att.requested_game_name)
     or lower(coalesce(candidate_tag_line, '')) <> lower(att.requested_tag_line)
     or coalesce(candidate_platform_id, '') <> att.requested_platform_id then
    update private.league_lookup_attempts a set completed_at = now(), outcome = 'IDENTITY_MISMATCH' where a.attempt_id = att.attempt_id;
    if att.action = 'refresh' then
      update public.league_profiles p set last_attempt_at = now(), last_result = 'IDENTITY_MISMATCH' where p.entity_id = att.entity_id;
    end if;
    return 'IDENTITY_MISMATCH';
  end if;

  begin
    if att.action = 'add' then
      insert into public.league_profiles (
        entity_id, game_name, tag_line, platform_id, data_source, solo_rank_state, solo_tier, solo_division, solo_lp,
        solo_wins, solo_losses, profile_icon_id, source_url, source_updated_at, fetched_at, last_attempt_at, last_result
      ) values (
        att.entity_id, candidate_game_name, candidate_tag_line, att.requested_platform_id, candidate_data_source, candidate_rank_state,
        candidate_tier, candidate_division, candidate_lp, candidate_wins, candidate_losses, candidate_profile_icon_id,
        candidate_source_url, candidate_source_updated_at, now(), now(), 'OK'
      );
    else
      select * into existing from public.league_profiles p where p.entity_id = att.entity_id for update;
      if not found then
        update private.league_lookup_attempts a set completed_at = now(), outcome = 'NO_PROFILE' where a.attempt_id = att.attempt_id;
        return 'NO_PROFILE';
      end if;
      update public.league_profiles p set
        game_name = candidate_game_name, tag_line = candidate_tag_line, data_source = candidate_data_source,
        solo_rank_state = candidate_rank_state, solo_tier = candidate_tier, solo_division = candidate_division, solo_lp = candidate_lp,
        solo_wins = candidate_wins, solo_losses = candidate_losses, profile_icon_id = candidate_profile_icon_id,
        source_url = candidate_source_url, source_updated_at = candidate_source_updated_at,
        fetched_at = now(), last_attempt_at = now(), last_result = 'OK', updated_at = now()
      where p.entity_id = att.entity_id;
    end if;
    outcome_text := 'OK';
  exception
    when unique_violation then outcome_text := 'ALREADY_EXISTS';
    when check_violation or not_null_violation or invalid_text_representation then outcome_text := 'INVALID_DATA';
  end;

  update private.league_lookup_attempts a set completed_at = now(), outcome = outcome_text where a.attempt_id = att.attempt_id;
  return case outcome_text when 'OK' then 'SAVED' else outcome_text end;
end;
$$;

create function private.finish_league_lookup_impl(candidate_reservation_id uuid, candidate_outcome text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  att private.league_lookup_attempts%rowtype;
begin
  if candidate_outcome is null or candidate_outcome not in ('NOT_FOUND', 'UNAVAILABLE', 'STRUCTURE_CHANGED', 'IDENTITY_MISMATCH') then
    raise exception using errcode = '22023', message = 'INVALID_OUTCOME';
  end if;
  select * into att from private.league_lookup_attempts a where a.attempt_id = candidate_reservation_id for update;
  if not found or att.completed_at is not null then return; end if;
  update private.league_lookup_attempts a set completed_at = now(), outcome = candidate_outcome where a.attempt_id = att.attempt_id;
  -- a failed refresh keeps the last good data and only records that the last attempt failed
  if att.action = 'refresh' then
    update public.league_profiles p set last_attempt_at = now(), last_result = candidate_outcome where p.entity_id = att.entity_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Public wrappers (established security-invoker + private-impl pattern)
-- ---------------------------------------------------------------------------------------------

create function public.reserve_league_lookup(candidate_action text, candidate_platform_id text, candidate_game_name text, candidate_tag_line text)
returns table (reservation_id uuid, status text, retry_after_seconds integer, game_name text, tag_line text, platform_id text)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.reserve_league_lookup_impl(candidate_action, candidate_platform_id, candidate_game_name, candidate_tag_line); $$;

create function public.get_my_league_profile()
returns table (
  game_name text, tag_line text, platform_id text, identity_source text, data_source text, trust_status text, solo_rank_state text,
  solo_tier text, solo_division text, solo_lp integer, solo_wins integer, solo_losses integer, profile_icon_id integer,
  source_url text, source_updated_at timestamptz, fetched_at timestamptz, last_attempt_at timestamptz, last_result text,
  refresh_available_at timestamptz, is_public boolean
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_league_profile_impl(); $$;

create function public.remove_my_league_profile()
returns boolean
language sql volatile security invoker
set search_path = ''
as $$ select private.remove_my_league_profile_impl(); $$;

create function public.save_league_lookup(
  candidate_reservation_id uuid, candidate_data_source text, candidate_game_name text, candidate_tag_line text, candidate_platform_id text,
  candidate_rank_state text, candidate_tier text, candidate_division text, candidate_lp integer, candidate_wins integer, candidate_losses integer,
  candidate_profile_icon_id integer, candidate_source_url text, candidate_source_updated_at timestamptz
)
returns text
language plpgsql volatile security invoker
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if;
  return private.save_league_lookup_impl(
    candidate_reservation_id, candidate_data_source, candidate_game_name, candidate_tag_line, candidate_platform_id,
    candidate_rank_state, candidate_tier, candidate_division, candidate_lp, candidate_wins, candidate_losses,
    candidate_profile_icon_id, candidate_source_url, candidate_source_updated_at
  );
end;
$$;

create function public.finish_league_lookup(candidate_reservation_id uuid, candidate_outcome text)
returns void
language plpgsql volatile security invoker
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if;
  perform private.finish_league_lookup_impl(candidate_reservation_id, candidate_outcome);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges: owner RPCs -> authenticated only; result persistence -> service_role only
-- ---------------------------------------------------------------------------------------------

revoke all on function
  private.reserve_league_lookup_impl(text, text, text, text), private.get_my_league_profile_impl(), private.remove_my_league_profile_impl(),
  private.save_league_lookup_impl(uuid, text, text, text, text, text, text, text, integer, integer, integer, integer, text, timestamptz),
  private.finish_league_lookup_impl(uuid, text),
  public.reserve_league_lookup(text, text, text, text), public.get_my_league_profile(), public.remove_my_league_profile(),
  public.save_league_lookup(uuid, text, text, text, text, text, text, text, integer, integer, integer, integer, text, timestamptz),
  public.finish_league_lookup(uuid, text)
from public, anon, authenticated;

grant execute on function
  private.reserve_league_lookup_impl(text, text, text, text), private.get_my_league_profile_impl(), private.remove_my_league_profile_impl(),
  public.reserve_league_lookup(text, text, text, text), public.get_my_league_profile(), public.remove_my_league_profile()
to authenticated;

grant execute on function
  private.save_league_lookup_impl(uuid, text, text, text, text, text, text, text, integer, integer, integer, integer, text, timestamptz),
  private.finish_league_lookup_impl(uuid, text),
  public.save_league_lookup(uuid, text, text, text, text, text, text, text, integer, integer, integer, integer, text, timestamptz),
  public.finish_league_lookup(uuid, text)
to service_role;
