-- Steam My Games (game discovery for an already-connected Steam account). TESTING only.
--
-- DISCOVERY ONLY. The connected Steam account (the CONNECTED platform identity from the Steam Connection Foundation) is asked, on an
-- explicit owner action, which games Steam's official Web API (IPlayerService/GetOwnedGames) says that account can access. The result is
-- stored as provider-neutral "discovered games" that can later feed the generic GamID Games system. It is NOT proof of any in-game
-- player profile, character, UID, rank, or stats, and nothing here can ever be marked VERIFIED (a table CHECK ties the trust label to
-- "DISCOVERED_FROM_<PROVIDER>").
--
-- Security shape (same as the League/Steam foundations):
--   * The browser never supplies a SteamID. The owner reserves a refresh (as themselves -> auth.uid()); the SteamID64 is then read
--     from THEIR stored connection by a service_role-only function bound to that one-time reservation.
--   * Throttling is enforced in the database BEFORE any outbound request (spacing, per-hour, per-day; failures count).
--   * A failed / private / malformed refresh only records its outcome; the last good list is kept.
--   * Discovered games are PRIVATE: no table grant, no public function, no change to the public-safe boundary.
-- Nothing here touches, updates, or deletes any existing row (connections, League, Discord, visibility flags, @black).

-- ---------------------------------------------------------------------------------------------
-- 1. Recognition map (config, provider-neutral). It only NAMES a discovered game; it never verifies anything.
-- ---------------------------------------------------------------------------------------------
create table public.known_game_sources (
  source_provider text not null check (source_provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  external_game_id text not null check (char_length(external_game_id) between 1 and 64),
  game_key text not null check (game_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  display_name text not null check (char_length(display_name) between 1 and 100),
  primary key (source_provider, external_game_id)
);

-- Marvel Rivals' Steam App ID. Recognition only: "the connected Steam account's accessible game data includes it".
insert into public.known_game_sources (source_provider, external_game_id, game_key, display_name) values ('steam', '2767030', 'marvel_rivals', 'Marvel Rivals');

-- ---------------------------------------------------------------------------------------------
-- 2. Discovered games (private, owner-scoped, provider-neutral)
-- ---------------------------------------------------------------------------------------------
create table public.discovered_games (
  connection_id uuid not null references public.gaming_connections(connection_id) on delete cascade,
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  source_provider text not null check (source_provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  external_game_id text not null check (char_length(external_game_id) between 1 and 64),
  game_name text check (game_name is null or char_length(game_name) between 1 and 200),
  icon_ref text check (icon_ref is null or char_length(icon_ref) <= 100),
  playtime_minutes integer check (playtime_minutes is null or playtime_minutes >= 0),
  trust_status text not null check (trust_status = 'DISCOVERED_FROM_' || upper(source_provider)),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (connection_id, external_game_id),
  -- Steam specifics: the app id is a uint32 and the icon is Steam's 40-hex image hash (both validated again in the save function)
  constraint discovered_games_steam_shape check (
    source_provider <> 'steam'
    or (external_game_id ~ '^[0-9]{1,10}$' and (icon_ref is null or icon_ref ~ '^[0-9a-f]{40}$'))
  )
);
create index discovered_games_entity_idx on public.discovered_games (entity_id);

-- ---------------------------------------------------------------------------------------------
-- 3. Discovery state: what the LAST attempt found (separate from the games, so a failed refresh cannot erase the last good list)
-- ---------------------------------------------------------------------------------------------
create table public.game_discovery_state (
  connection_id uuid primary key references public.gaming_connections(connection_id) on delete cascade,
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  source_provider text not null check (source_provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  last_result text not null check (last_result in ('AVAILABLE', 'EMPTY', 'UNAVAILABLE', 'TEMPORARY_ERROR', 'SERVICE_ERROR', 'MALFORMED')),
  last_attempt_at timestamptz not null default now(),
  last_success_at timestamptz,
  game_count integer check (game_count is null or game_count >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- 4. Reservation + throttle ledger. One row per refresh attempt (any outcome); also the one-time authorization for the fetch and the
--    single write that follows. Deliberately NOT tied to the connection row (only to the identity), so disconnecting and reconnecting
--    cannot be used to reset the throttle.
-- ---------------------------------------------------------------------------------------------
create table private.game_discovery_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  connection_id uuid not null,
  source_provider text not null check (source_provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_account_id text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  outcome text check (outcome in ('AVAILABLE', 'EMPTY', 'UNAVAILABLE', 'TEMPORARY_ERROR', 'SERVICE_ERROR', 'MALFORMED', 'EXPIRED', 'CONNECTION_CHANGED', 'INVALID_DATA'))
);
create index game_discovery_attempts_entity_created_idx on private.game_discovery_attempts (entity_id, source_provider, created_at desc);

alter table public.known_game_sources enable row level security;
alter table public.discovered_games enable row level security;
alter table public.game_discovery_state enable row level security;
alter table private.game_discovery_attempts enable row level security;

create policy "owners read their own discovered games"
on public.discovered_games for select to authenticated
using (exists (
  select 1 from public.entity_memberships m
  where m.entity_id = discovered_games.entity_id and m.user_id = (select auth.uid()) and m.role = 'OWNER'
));

create policy "owners read their own game discovery state"
on public.game_discovery_state for select to authenticated
using (exists (
  select 1 from public.entity_memberships m
  where m.entity_id = game_discovery_state.entity_id and m.user_id = (select auth.uid()) and m.role = 'OWNER'
));

-- No client role has any table privilege: everything goes through the functions below.
revoke all on table public.known_game_sources, public.discovered_games, public.game_discovery_state, private.game_discovery_attempts from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Owner-facing (authenticated) implementations
-- ---------------------------------------------------------------------------------------------

-- Throttle policy (enforced BEFORE any outbound request; failed attempts count): at least 120 s between attempts, at most 6 per hour
-- and 20 per day per identity. Steam is only ever asked because the owner pressed the button - no polling exists.
create function private.reserve_steam_games_refresh_impl()
returns table (reservation_id uuid, status text, retry_after_seconds integer)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
  conn public.gaming_connections%rowtype;
  wait_seconds integer;
  last_any timestamptz;
  recent_count integer;
  new_id uuid;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from auth.users u where u.id = caller and u.email_confirmed_at is not null) then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_VERIFIED';
  end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  -- serialize this identity's refreshes so concurrent requests cannot both pass the throttle
  perform pg_advisory_xact_lock(hashtextextended('steam-games:' || owned_entity_id::text, 0));

  -- The Steam account is resolved HERE, from the caller's own stored connection. Nothing the client sends can influence it.
  select * into conn from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = 'steam';
  if not found then
    return query select null::uuid, 'NOT_CONNECTED'::text, null::integer;
    return;
  end if;

  delete from private.game_discovery_attempts a where a.entity_id = owned_entity_id and a.created_at < now() - interval '2 days';

  select max(a.created_at) into last_any from private.game_discovery_attempts a where a.entity_id = owned_entity_id and a.source_provider = 'steam';
  wait_seconds := ceil(extract(epoch from (last_any + interval '120 seconds' - now())))::integer;
  if last_any is not null and wait_seconds > 0 then
    return query select null::uuid, 'COOLDOWN'::text, wait_seconds;
    return;
  end if;

  select count(*) into recent_count from private.game_discovery_attempts a
  where a.entity_id = owned_entity_id and a.source_provider = 'steam' and a.created_at > now() - interval '1 hour';
  if recent_count >= 6 then
    select ceil(extract(epoch from (a.created_at + interval '1 hour' - now())))::integer into wait_seconds
    from private.game_discovery_attempts a where a.entity_id = owned_entity_id and a.source_provider = 'steam' and a.created_at > now() - interval '1 hour'
    order by a.created_at desc offset 5 limit 1;
    return query select null::uuid, 'RATE_LIMITED'::text, greatest(coalesce(wait_seconds, 60), 1);
    return;
  end if;
  select count(*) into recent_count from private.game_discovery_attempts a
  where a.entity_id = owned_entity_id and a.source_provider = 'steam' and a.created_at > now() - interval '1 day';
  if recent_count >= 20 then
    select ceil(extract(epoch from (a.created_at + interval '1 day' - now())))::integer into wait_seconds
    from private.game_discovery_attempts a where a.entity_id = owned_entity_id and a.source_provider = 'steam' and a.created_at > now() - interval '1 day'
    order by a.created_at desc offset 19 limit 1;
    return query select null::uuid, 'RATE_LIMITED'::text, greatest(coalesce(wait_seconds, 3600), 1);
    return;
  end if;

  insert into private.game_discovery_attempts (user_id, entity_id, connection_id, source_provider)
  values (caller, owned_entity_id, conn.connection_id, 'steam')
  returning attempt_id into new_id;

  return query select new_id, 'OK'::text, null::integer;
end;
$$;

-- What the owner may see: the last good list (never anything about another identity), newest data first by playtime.
create function private.get_my_discovered_games_impl(candidate_provider text, candidate_limit integer, candidate_offset integer)
returns table (
  external_game_id text,
  game_name text,
  icon_ref text,
  playtime_minutes integer,
  trust_status text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  recognized_game_key text,
  recognized_name text
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  provider text := lower(btrim(candidate_provider));
  owned_entity_id uuid;
  max_rows integer := least(greatest(coalesce(candidate_limit, 1000), 1), 1000);
  skip_rows integer := greatest(coalesce(candidate_offset, 0), 0);
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if provider is null or provider <> 'steam' then raise exception using errcode = '22023', message = 'INVALID_PROVIDER'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  return query
  select d.external_game_id, d.game_name, d.icon_ref, d.playtime_minutes, d.trust_status, d.first_seen_at, d.last_seen_at, k.game_key, k.display_name
  from public.discovered_games d
  join public.gaming_connections g on g.connection_id = d.connection_id and g.entity_id = owned_entity_id and g.provider_key = provider
  left join public.known_game_sources k on k.source_provider = d.source_provider and k.external_game_id = d.external_game_id
  where d.entity_id = owned_entity_id and d.source_provider = provider
  order by d.playtime_minutes desc nulls last, lower(coalesce(d.game_name, '')), d.external_game_id
  limit max_rows offset skip_rows;
end;
$$;

create function private.get_my_game_discovery_state_impl(candidate_provider text)
returns table (
  is_connected boolean,
  last_result text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  game_count integer,
  refresh_available_at timestamptz,
  recognized_games jsonb
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  provider text := lower(btrim(candidate_provider));
  owned_entity_id uuid;
  conn public.gaming_connections%rowtype;
  st public.game_discovery_state%rowtype;
  last_any timestamptz;
  recognized jsonb;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if provider is null or provider <> 'steam' then raise exception using errcode = '22023', message = 'INVALID_PROVIDER'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  select * into conn from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = provider;
  if not found then
    return query select false, null::text, null::timestamptz, null::timestamptz, null::integer, null::timestamptz, '[]'::jsonb;
    return;
  end if;

  select * into st from public.game_discovery_state s where s.connection_id = conn.connection_id;
  select max(a.created_at) into last_any from private.game_discovery_attempts a where a.entity_id = owned_entity_id and a.source_provider = provider;

  -- Games named by the recognition map, found across the WHOLE stored list (not just the page the client loaded).
  select coalesce(jsonb_agg(jsonb_build_object('game_key', k.game_key, 'display_name', k.display_name, 'playtime_minutes', d.playtime_minutes) order by k.display_name), '[]'::jsonb)
  into recognized
  from public.discovered_games d
  join public.known_game_sources k on k.source_provider = d.source_provider and k.external_game_id = d.external_game_id
  where d.connection_id = conn.connection_id;

  return query select true, st.last_result, st.last_attempt_at, st.last_success_at, st.game_count,
    case when last_any is null then null::timestamptz else last_any + interval '120 seconds' end, recognized;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Backend-only (service_role) implementations used by the Edge Function
-- ---------------------------------------------------------------------------------------------

-- One-time start of the outbound fetch for a reservation. Returns the SteamID64 of THE RESERVING OWNER's stored connection and snapshots
-- it on the reservation, so the result can only ever be saved for that exact account.
create function private.begin_steam_games_fetch_impl(candidate_reservation_id uuid)
returns table (status text, steam_id text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  att private.game_discovery_attempts%rowtype;
  conn public.gaming_connections%rowtype;
begin
  select * into att from private.game_discovery_attempts a where a.attempt_id = candidate_reservation_id for update;
  if not found or att.completed_at is not null or att.source_provider <> 'steam' then
    return query select 'INVALID_RESERVATION'::text, null::text;
    return;
  end if;
  if att.started_at is not null then
    return query select 'ALREADY_STARTED'::text, null::text;
    return;
  end if;
  if att.created_at < now() - interval '3 minutes' then
    update private.game_discovery_attempts a set completed_at = now(), outcome = 'EXPIRED' where a.attempt_id = att.attempt_id;
    return query select 'EXPIRED'::text, null::text;
    return;
  end if;

  select * into conn from public.gaming_connections g
  where g.connection_id = att.connection_id and g.entity_id = att.entity_id and g.provider_key = 'steam';
  if not found then
    update private.game_discovery_attempts a set completed_at = now(), outcome = 'CONNECTION_CHANGED' where a.attempt_id = att.attempt_id;
    return query select 'CONNECTION_CHANGED'::text, null::text;
    return;
  end if;

  update private.game_discovery_attempts a set started_at = now(), provider_account_id = conn.provider_account_id where a.attempt_id = att.attempt_id;
  return query select 'OK'::text, conn.provider_account_id;
end;
$$;

-- Applies the outcome of the one fetch. Only AVAILABLE / EMPTY change the stored game list; every other outcome only records that the
-- last attempt failed, and the last good list stays exactly as it was.
create function private.save_steam_games_result_impl(candidate_reservation_id uuid, candidate_outcome text, candidate_games jsonb)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  att private.game_discovery_attempts%rowtype;
  conn public.gaming_connections%rowtype;
  run_ts timestamptz := clock_timestamp();
  outcome_key text := upper(btrim(coalesce(candidate_outcome, '')));
  kept integer;
begin
  if outcome_key not in ('AVAILABLE', 'EMPTY', 'UNAVAILABLE', 'TEMPORARY_ERROR', 'SERVICE_ERROR', 'MALFORMED') then
    raise exception using errcode = '22023', message = 'INVALID_OUTCOME';
  end if;

  select * into att from private.game_discovery_attempts a where a.attempt_id = candidate_reservation_id for update;
  if not found or att.completed_at is not null or att.started_at is null or att.source_provider <> 'steam' then return 'INVALID_RESERVATION'; end if;

  if att.created_at < now() - interval '3 minutes' then
    update private.game_discovery_attempts a set completed_at = now(), outcome = 'EXPIRED' where a.attempt_id = att.attempt_id;
    return 'EXPIRED';
  end if;

  -- the connection must still be the very same Steam account that was fetched
  select * into conn from public.gaming_connections g
  where g.connection_id = att.connection_id and g.entity_id = att.entity_id and g.provider_key = 'steam' and g.provider_account_id = att.provider_account_id
  for update;
  if not found then
    update private.game_discovery_attempts a set completed_at = now(), outcome = 'CONNECTION_CHANGED' where a.attempt_id = att.attempt_id;
    return 'CONNECTION_CHANGED';
  end if;

  if outcome_key = 'AVAILABLE' then
    if candidate_games is null or jsonb_typeof(candidate_games) <> 'array' or jsonb_array_length(candidate_games) not between 1 and 10000 then
      outcome_key := 'MALFORMED';
    end if;
  end if;

  if outcome_key in ('AVAILABLE', 'EMPTY') then
    begin
      if outcome_key = 'AVAILABLE' then
        -- one row per app id even if the source repeated it (keeps the entry with the most playtime); first_seen_at survives a refresh
        insert into public.discovered_games (connection_id, entity_id, source_provider, external_game_id, game_name, icon_ref, playtime_minutes, trust_status, first_seen_at, last_seen_at)
        select distinct on (x.appid) conn.connection_id, conn.entity_id, 'steam', x.appid, nullif(btrim(x.name), ''), x.icon, x.playtime, 'DISCOVERED_FROM_STEAM', run_ts, run_ts
        from jsonb_to_recordset(candidate_games) as x(appid text, name text, icon text, playtime integer)
        order by x.appid, x.playtime desc nulls last, (x.name is null)
        on conflict (connection_id, external_game_id) do update
        set game_name = excluded.game_name, icon_ref = excluded.icon_ref, playtime_minutes = excluded.playtime_minutes, last_seen_at = run_ts;
      end if;
      -- games Steam no longer returns are removed ONLY on a successful (or genuinely empty) discovery
      delete from public.discovered_games d where d.connection_id = conn.connection_id and d.last_seen_at < run_ts;
      select count(*) into kept from public.discovered_games d where d.connection_id = conn.connection_id;
    exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      -- the subtransaction rolled back: the previous list is untouched
      update private.game_discovery_attempts a set completed_at = now(), outcome = 'INVALID_DATA' where a.attempt_id = att.attempt_id;
      insert into public.game_discovery_state as s (connection_id, entity_id, source_provider, last_result, last_attempt_at)
      values (conn.connection_id, conn.entity_id, 'steam', 'MALFORMED', now())
      on conflict (connection_id) do update set last_result = 'MALFORMED', last_attempt_at = now(), updated_at = now();
      return 'INVALID_DATA';
    end;

    insert into public.game_discovery_state as s (connection_id, entity_id, source_provider, last_result, last_attempt_at, last_success_at, game_count)
    values (conn.connection_id, conn.entity_id, 'steam', outcome_key, now(), now(), kept)
    on conflict (connection_id) do update
    set last_result = outcome_key, last_attempt_at = now(), last_success_at = now(), game_count = kept, updated_at = now();
  else
    -- a failed / private / malformed attempt keeps the last good list and the last good count and timestamp
    insert into public.game_discovery_state as s (connection_id, entity_id, source_provider, last_result, last_attempt_at)
    values (conn.connection_id, conn.entity_id, 'steam', outcome_key, now())
    on conflict (connection_id) do update set last_result = outcome_key, last_attempt_at = now(), updated_at = now();
  end if;

  update private.game_discovery_attempts a set completed_at = now(), outcome = outcome_key where a.attempt_id = att.attempt_id;
  return 'SAVED';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Public wrappers (established security-invoker + private-impl pattern)
-- ---------------------------------------------------------------------------------------------
create function public.reserve_steam_games_refresh()
returns table (reservation_id uuid, status text, retry_after_seconds integer)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.reserve_steam_games_refresh_impl(); $$;

create function public.get_my_discovered_games(candidate_provider text, candidate_limit integer default 1000, candidate_offset integer default 0)
returns table (
  external_game_id text, game_name text, icon_ref text, playtime_minutes integer, trust_status text,
  first_seen_at timestamptz, last_seen_at timestamptz, recognized_game_key text, recognized_name text
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_discovered_games_impl(candidate_provider, candidate_limit, candidate_offset); $$;

create function public.get_my_game_discovery_state(candidate_provider text)
returns table (is_connected boolean, last_result text, last_attempt_at timestamptz, last_success_at timestamptz, game_count integer, refresh_available_at timestamptz, recognized_games jsonb)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_game_discovery_state_impl(candidate_provider); $$;

create function public.begin_steam_games_fetch(candidate_reservation_id uuid)
returns table (status text, steam_id text)
language plpgsql volatile security invoker
set search_path = ''
as $$ begin if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if; return query select * from private.begin_steam_games_fetch_impl(candidate_reservation_id); end; $$;

create function public.save_steam_games_result(candidate_reservation_id uuid, candidate_outcome text, candidate_games jsonb)
returns text
language plpgsql volatile security invoker
set search_path = ''
as $$ begin if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if; return private.save_steam_games_result_impl(candidate_reservation_id, candidate_outcome, candidate_games); end; $$;

-- ---------------------------------------------------------------------------------------------
-- 8. Function privileges: owner-facing -> authenticated only; Edge Function -> service_role only
-- ---------------------------------------------------------------------------------------------
revoke all on function
  private.reserve_steam_games_refresh_impl(), private.get_my_discovered_games_impl(text, integer, integer), private.get_my_game_discovery_state_impl(text),
  private.begin_steam_games_fetch_impl(uuid), private.save_steam_games_result_impl(uuid, text, jsonb),
  public.reserve_steam_games_refresh(), public.get_my_discovered_games(text, integer, integer), public.get_my_game_discovery_state(text),
  public.begin_steam_games_fetch(uuid), public.save_steam_games_result(uuid, text, jsonb)
from public, anon, authenticated;

grant execute on function
  private.reserve_steam_games_refresh_impl(), private.get_my_discovered_games_impl(text, integer, integer), private.get_my_game_discovery_state_impl(text),
  public.reserve_steam_games_refresh(), public.get_my_discovered_games(text, integer, integer), public.get_my_game_discovery_state(text)
to authenticated;

grant execute on function
  private.begin_steam_games_fetch_impl(uuid), private.save_steam_games_result_impl(uuid, text, jsonb),
  public.begin_steam_games_fetch(uuid), public.save_steam_games_result(uuid, text, jsonb)
to service_role;
