-- Steam Connection Foundation (second Gaming Connections provider). TESTING only.
--
-- A Steam connection is the SteamID64 that Steam itself authenticated through Steam's OpenID 2.0 browser flow, attached to the
-- caller's existing permanent GamID identity. It reuses the provider-neutral Gaming Connections engine:
--   * public.connection_provider_catalog / public.gaming_connections            (one row per provider per identity, one identity per external account)
--   * private.connection_oauth_attempts                                        (short-lived, single-use, hash-only server-side state ledger)
--   * public.get_my_connections / public.disconnect_my_connection / public.start_connection_attempt (already provider-neutral)
--   * public.public_section_catalog + the section-visibility RPCs + the public-safe boundary from Public Profile Expansion Phase 1
-- Steam is NOT forced into Discord assumptions: it has its own provider-bound state consumption and its own completion function.
--
-- What this migration does NOT do: no game-library discovery, no game ownership, no Marvel Rivals, no Steam Web API. The only
-- identity result is the authenticated SteamID64. A Steam connection is a CONNECTED platform identity - never a VERIFIED game profile.
--
-- Nothing here touches, updates, or deletes any existing connection row (including the real Discord connection).

-- ---------------------------------------------------------------------------------------------
-- 1. Provider registry rows (config, not user data)
-- ---------------------------------------------------------------------------------------------
insert into public.connection_provider_catalog (provider_key, label, sort_order) values ('steam', 'Steam', 15);

insert into public.public_section_catalog (section_key, label, section_kind, sort_order) values ('steam', 'Steam', 'CONNECTION', 15);

-- ---------------------------------------------------------------------------------------------
-- 2. Provenance + hard integrity for Steam rows
--    auth_method records HOW the identity was authenticated. It is set for Steam rows; existing Discord rows are deliberately
--    NOT back-filled (NULL) so the accepted Discord connection is left exactly as it is.
--    The CHECK makes it impossible - by any code path - for a 'steam' row to hold anything but a SteamID64 in the individual
--    account range, to be anything but CONNECTED (never VERIFIED), or to lack its Steam OpenID provenance.
-- ---------------------------------------------------------------------------------------------
alter table public.gaming_connections
  add column auth_method text check (auth_method is null or auth_method ~ '^[A-Z][A-Z0-9_]{2,39}$');

alter table public.gaming_connections
  add constraint gaming_connections_steam_identity_check check (
    provider_key <> 'steam'
    or (
      provider_account_id ~ '^[0-9]{17}$'
      and provider_account_id collate "C" between '76561197960265729' and '76561202255233023'
      and trust_status = 'CONNECTED'
      -- IS NOT DISTINCT FROM (not "="): a CHECK passes on NULL, so a missing auth_method must be an explicit failure.
      and auth_method is not distinct from 'STEAM_OPENID_2_0'
    )
  );

-- ---------------------------------------------------------------------------------------------
-- 3. Provider isolation of the shared attempt ledger
--    A state issued for one provider must never be usable by another provider's callback (state substitution across providers).
--    The two Discord implementations are re-declared IDENTICALLY except that they now only accept 'discord' attempts; for every
--    Discord attempt their behavior is unchanged. A non-Discord state is reported as INVALID_STATE and is left unconsumed.
-- ---------------------------------------------------------------------------------------------
create or replace function private.consume_connection_attempt_impl(candidate_state text)
returns table (attempt_id uuid, owner_user_id uuid, owner_entity_id uuid, provider text, status text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  att private.connection_oauth_attempts%rowtype;
begin
  if candidate_state is null or candidate_state !~ '^[0-9a-f]{64}$' then
    return query select null::uuid, null::uuid, null::uuid, null::text, 'INVALID_STATE'::text;
    return;
  end if;

  select * into att from private.connection_oauth_attempts t
  where t.state_hash = sha256(convert_to(candidate_state, 'UTF8'))
    and t.provider_key = 'discord'
  for update;

  if not found then
    return query select null::uuid, null::uuid, null::uuid, null::text, 'INVALID_STATE'::text;
    return;
  end if;
  if att.consumed_at is not null then
    return query select null::uuid, null::uuid, null::uuid, null::text, 'REPLAYED'::text;
    return;
  end if;

  update private.connection_oauth_attempts t set consumed_at = now() where t.attempt_id = att.attempt_id;

  if att.expires_at < now() then
    update private.connection_oauth_attempts t set completed_at = now(), outcome = 'EXPIRED' where t.attempt_id = att.attempt_id;
    return query select null::uuid, null::uuid, null::uuid, null::text, 'EXPIRED'::text;
    return;
  end if;

  return query select att.attempt_id, att.user_id, att.entity_id, att.provider_key, 'OK'::text;
end;
$$;

create or replace function private.complete_connection_attempt_impl(
  candidate_attempt_id uuid,
  candidate_account_id text,
  candidate_username text,
  candidate_display_name text,
  candidate_avatar_url text
)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  att private.connection_oauth_attempts%rowtype;
  existing public.gaming_connections%rowtype;
  result text;
begin
  select * into att from private.connection_oauth_attempts t where t.attempt_id = candidate_attempt_id for update;
  if not found or att.consumed_at is null or att.provider_key <> 'discord' then return 'INVALID_STATE'; end if;
  if att.completed_at is not null then return 'REPLAYED'; end if;

  if candidate_account_id is null or char_length(candidate_account_id) not between 1 and 64 then
    update private.connection_oauth_attempts t set completed_at = now(), outcome = 'PROVIDER_ERROR' where t.attempt_id = att.attempt_id;
    return 'PROVIDER_ERROR';
  end if;

  if not exists (
    select 1 from public.entity_memberships m
    where m.user_id = att.user_id and m.entity_id = att.entity_id and m.role = 'OWNER'
  ) then
    update private.connection_oauth_attempts t set completed_at = now(), outcome = 'IDENTITY_NOT_FOUND' where t.attempt_id = att.attempt_id;
    return 'IDENTITY_NOT_FOUND';
  end if;

  select * into existing from public.gaming_connections g
  where g.entity_id = att.entity_id and g.provider_key = att.provider_key
  for update;

  if found then
    if existing.provider_account_id <> candidate_account_id then result := 'OWNER_HAS_OTHER_ACCOUNT';
    else
      update public.gaming_connections g
      set provider_username = candidate_username, provider_display_name = candidate_display_name,
          provider_avatar_url = candidate_avatar_url, updated_at = now()
      where g.connection_id = existing.connection_id;
      result := 'RECONNECTED';
    end if;
  else
    begin
      insert into public.gaming_connections (entity_id, provider_key, provider_account_id, provider_username, provider_display_name, provider_avatar_url)
      values (att.entity_id, att.provider_key, candidate_account_id, candidate_username, candidate_display_name, candidate_avatar_url);
      result := 'CONNECTED';
    exception when unique_violation then
      select * into existing from public.gaming_connections g where g.entity_id = att.entity_id and g.provider_key = att.provider_key;
      if found and existing.provider_account_id = candidate_account_id then result := 'RECONNECTED';
      elsif found then result := 'OWNER_HAS_OTHER_ACCOUNT';
      else result := 'ACCOUNT_ALREADY_LINKED';
      end if;
    end;
  end if;

  update private.connection_oauth_attempts t set completed_at = now(), outcome = result where t.attempt_id = att.attempt_id;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Backend-only (service_role) Steam functions
-- ---------------------------------------------------------------------------------------------

-- Validates and one-time-consumes an attempt by its state value, ONLY if it was issued for the expected provider. The row is
-- locked so concurrent or replayed callbacks serialize; only the first caller ever receives 'OK'. A state that belongs to another
-- provider is INVALID_STATE and stays unconsumed.
create function private.consume_connection_attempt_for_impl(candidate_state text, expected_provider text)
returns table (attempt_id uuid, owner_user_id uuid, owner_entity_id uuid, provider text, status text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  att private.connection_oauth_attempts%rowtype;
begin
  if candidate_state is null or candidate_state !~ '^[0-9a-f]{64}$' or expected_provider is null then
    return query select null::uuid, null::uuid, null::uuid, null::text, 'INVALID_STATE'::text;
    return;
  end if;

  select * into att from private.connection_oauth_attempts t
  where t.state_hash = sha256(convert_to(candidate_state, 'UTF8'))
    and t.provider_key = expected_provider
  for update;

  if not found then
    return query select null::uuid, null::uuid, null::uuid, null::text, 'INVALID_STATE'::text;
    return;
  end if;
  if att.consumed_at is not null then
    return query select null::uuid, null::uuid, null::uuid, null::text, 'REPLAYED'::text;
    return;
  end if;

  update private.connection_oauth_attempts t set consumed_at = now() where t.attempt_id = att.attempt_id;

  if att.expires_at < now() then
    update private.connection_oauth_attempts t set completed_at = now(), outcome = 'EXPIRED' where t.attempt_id = att.attempt_id;
    return query select null::uuid, null::uuid, null::uuid, null::text, 'EXPIRED'::text;
    return;
  end if;

  return query select att.attempt_id, att.user_id, att.entity_id, att.provider_key, 'OK'::text;
end;
$$;

-- Links the Steam-authenticated SteamID64 to the identity that initiated the (already consumed) Steam attempt.
-- Never silently moves a Steam account between identities and never lets one SteamID64 belong to two identities.
-- A repeat sign-in with the SAME Steam account is RECONNECTED and never touches the visibility switch.
create function private.complete_steam_connection_attempt_impl(candidate_attempt_id uuid, candidate_steam_id text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  att private.connection_oauth_attempts%rowtype;
  existing public.gaming_connections%rowtype;
  result text;
begin
  select * into att from private.connection_oauth_attempts t where t.attempt_id = candidate_attempt_id for update;
  if not found or att.consumed_at is null or att.provider_key <> 'steam' then return 'INVALID_STATE'; end if;
  if att.completed_at is not null then return 'REPLAYED'; end if;

  if candidate_steam_id is null
     or candidate_steam_id !~ '^[0-9]{17}$'
     or candidate_steam_id collate "C" not between '76561197960265729' and '76561202255233023' then
    update private.connection_oauth_attempts t set completed_at = now(), outcome = 'PROVIDER_ERROR' where t.attempt_id = att.attempt_id;
    return 'PROVIDER_ERROR';
  end if;

  if not exists (
    select 1 from public.entity_memberships m
    where m.user_id = att.user_id and m.entity_id = att.entity_id and m.role = 'OWNER'
  ) then
    update private.connection_oauth_attempts t set completed_at = now(), outcome = 'IDENTITY_NOT_FOUND' where t.attempt_id = att.attempt_id;
    return 'IDENTITY_NOT_FOUND';
  end if;

  select * into existing from public.gaming_connections g
  where g.entity_id = att.entity_id and g.provider_key = 'steam'
  for update;

  if found then
    if existing.provider_account_id <> candidate_steam_id then result := 'OWNER_HAS_OTHER_ACCOUNT';
    else
      update public.gaming_connections g set updated_at = now() where g.connection_id = existing.connection_id;
      result := 'RECONNECTED';
    end if;
  else
    begin
      -- is_public is left at its default (false): a new Steam connection is always private.
      -- provider_username carries the SteamID64 for the owner's own card (no Steam Web API is called to fetch a display name).
      insert into public.gaming_connections (entity_id, provider_key, provider_account_id, provider_username, trust_status, auth_method)
      values (att.entity_id, 'steam', candidate_steam_id, candidate_steam_id, 'CONNECTED', 'STEAM_OPENID_2_0');
      result := 'CONNECTED';
    exception when unique_violation then
      select * into existing from public.gaming_connections g where g.entity_id = att.entity_id and g.provider_key = 'steam';
      if found and existing.provider_account_id = candidate_steam_id then result := 'RECONNECTED';
      elsif found then result := 'OWNER_HAS_OTHER_ACCOUNT';
      else result := 'ACCOUNT_ALREADY_LINKED';
      end if;
    end;
  end if;

  update private.connection_oauth_attempts t set completed_at = now(), outcome = result where t.attempt_id = att.attempt_id;
  return result;
end;
$$;

create function public.consume_connection_attempt_for(candidate_state text, expected_provider text)
returns table (attempt_id uuid, owner_user_id uuid, owner_entity_id uuid, provider text, status text)
language plpgsql volatile security invoker
set search_path = ''
as $$ begin if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if; return query select * from private.consume_connection_attempt_for_impl(candidate_state, expected_provider); end; $$;

create function public.complete_steam_connection_attempt(candidate_attempt_id uuid, candidate_steam_id text)
returns text
language plpgsql volatile security invoker
set search_path = ''
as $$ begin if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if; return private.complete_steam_connection_attempt_impl(candidate_attempt_id, candidate_steam_id); end; $$;

revoke all on function
  private.consume_connection_attempt_for_impl(text, text), private.complete_steam_connection_attempt_impl(uuid, text),
  public.consume_connection_attempt_for(text, text), public.complete_steam_connection_attempt(uuid, text)
from public, anon, authenticated;

grant execute on function
  private.consume_connection_attempt_for_impl(text, text), private.complete_steam_connection_attempt_impl(uuid, text),
  public.consume_connection_attempt_for(text, text), public.complete_steam_connection_attempt(uuid, text)
to service_role;

-- ---------------------------------------------------------------------------------------------
-- 5. Steam inside the generic section-visibility architecture ("Show on my GamID", OFF by default)
--    Same functions (same signatures and grants); one added branch each. The switch lives on the connection row, so a
--    disconnect deletes it and a later reconnect starts OFF again.
-- ---------------------------------------------------------------------------------------------
create or replace function private.get_my_section_visibility_impl()
returns table (section_key text, label text, is_set_up boolean, is_public boolean)
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
  select c.section_key, c.label,
    case c.section_key
      when 'discord' then exists (select 1 from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = 'discord')
      when 'steam' then exists (select 1 from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = 'steam')
      when 'league' then exists (select 1 from public.league_profiles l where l.entity_id = owned_entity_id)
      when 'education_work' then exists (
        select 1 from public.profiles p
        where p.entity_id = owned_entity_id
          and (p.education_work_status is not null or nullif(btrim(coalesce(p.institution, '')), '') is not null or nullif(btrim(coalesce(p.field_of_study, '')), '') is not null))
      else false
    end,
    case c.section_key
      when 'discord' then coalesce((select g.is_public from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = 'discord'), false)
      when 'steam' then coalesce((select g.is_public from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = 'steam'), false)
      when 'league' then coalesce((select l.is_public from public.league_profiles l where l.entity_id = owned_entity_id), false)
      when 'education_work' then coalesce((select p.show_education_work from public.profiles p where p.entity_id = owned_entity_id), false)
      else false
    end
  from public.public_section_catalog c
  where c.active
  order by c.sort_order, c.section_key;
end;
$$;

create or replace function private.set_my_section_visibility_impl(candidate_section text, candidate_visible boolean)
returns table (section_key text, is_public boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  key text := lower(btrim(candidate_section));
  owned_entity_id uuid;
  changed integer;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if candidate_visible is null then raise exception using errcode = '22023', message = 'INVALID_VISIBILITY'; end if;
  if key is null or not exists (select 1 from public.public_section_catalog c where c.section_key = key and c.active) then
    raise exception using errcode = '22023', message = 'INVALID_SECTION';
  end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  if key = 'discord' then
    update public.gaming_connections g set is_public = candidate_visible where g.entity_id = owned_entity_id and g.provider_key = 'discord';
    get diagnostics changed = row_count;
    if changed = 0 then raise exception using errcode = 'P0002', message = 'SECTION_NOT_SET_UP'; end if;
  elsif key = 'steam' then
    update public.gaming_connections g set is_public = candidate_visible where g.entity_id = owned_entity_id and g.provider_key = 'steam';
    get diagnostics changed = row_count;
    if changed = 0 then raise exception using errcode = 'P0002', message = 'SECTION_NOT_SET_UP'; end if;
  elsif key = 'league' then
    update public.league_profiles l set is_public = candidate_visible where l.entity_id = owned_entity_id;
    get diagnostics changed = row_count;
    if changed = 0 then raise exception using errcode = 'P0002', message = 'SECTION_NOT_SET_UP'; end if;
  elsif key = 'education_work' then
    update public.profiles p set show_education_work = candidate_visible where p.entity_id = owned_entity_id;
    get diagnostics changed = row_count;
    if changed = 0 then raise exception using errcode = 'P0002', message = 'SECTION_NOT_SET_UP'; end if;
  else
    raise exception using errcode = '22023', message = 'INVALID_SECTION';
  end if;

  return query select key, candidate_visible;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. The anonymous public-safe boundary: same function and columns; one more allowlisted section.
--    Steam is present ONLY when the GamID is published AND the owner switched Steam ON, and then exposes ONLY the SteamID64
--    (the identity the owner chose to show; it is the public identifier of a Steam profile) and the trust label (CONNECTED).
--    NOT exposed: the attempt ledger/state, connection or entity ids, timestamps, auth_method, any game/library data.
-- ---------------------------------------------------------------------------------------------
create or replace function private.get_public_identity_impl(candidate_handle text)
returns table (
  gamid_handle text,
  display_name text,
  avatar_media_reference text,
  bio text,
  role_keys text[],
  primary_role_key text,
  role_catalog jsonb,
  education_work_status text,
  institution text,
  field_of_study text,
  education_work_catalog jsonb,
  intro_transition_key text,
  intro_derivative_path text,
  public_sections jsonb
)
language sql stable security definer
set search_path = ''
as $$
  select e.gamid_handle, e.display_name, e.avatar_media_reference, p.bio,
    coalesce((select array_agg(r.role_key order by r.sort_order) from public.profile_gaming_roles r where r.profile_id = p.profile_id), array[]::text[]),
    (select r.role_key from public.profile_gaming_roles r where r.profile_id = p.profile_id and r.is_primary),
    (select jsonb_agg(jsonb_build_object('key', c.role_key, 'label', c.label) order by c.sort_order) from public.gaming_role_catalog c where c.active),
    -- Education & Work: returned only while its switch is ON, otherwise NULL (the values never leave the database)
    case when p.show_education_work then p.education_work_status end,
    case when p.show_education_work then p.institution end,
    case when p.show_education_work then p.field_of_study end,
    case when p.show_education_work then (select jsonb_agg(jsonb_build_object('key', c.status_key, 'label', c.label) order by c.sort_order) from public.education_work_status_catalog c where c.active) end,
    coalesce(s.transition_key, 'fade'),
    active.derivative_path,
    -- Optional sections: ONLY those whose switch is ON appear, and only the approved presentation fields.
    (
      select coalesce(jsonb_object_agg(x.section_key, x.payload), '{}'::jsonb)
      from (
        -- Discord: display name, username, trust label. NOT exposed: the Discord account id (and the avatar URL, which embeds it),
        -- tokens, timestamps, connection ids, diagnostics/discovery.
        select 'discord'::text as section_key,
          jsonb_strip_nulls(jsonb_build_object(
            'display_name', g.provider_display_name, 'username', g.provider_username, 'trust_status', g.trust_status)) as payload
        from public.gaming_connections g
        where g.entity_id = e.entity_id and g.provider_key = 'discord' and g.is_public
        union all
        -- Steam: the SteamID64 Steam authenticated, and the trust label (CONNECTED - never VERIFIED, and no game claim of any kind).
        select 'steam'::text,
          jsonb_strip_nulls(jsonb_build_object(
            'steam_id', g.provider_account_id, 'trust_status', g.trust_status))
        from public.gaming_connections g
        where g.entity_id = e.entity_id and g.provider_key = 'steam' and g.is_public
        union all
        -- League: Riot ID, region, Solo/Duo rank, icon id, and the truth about where it came from (manual / unverified source)
        -- with freshness. NOT exposed: source URL, lookup state/errors, throttle ledger, reservations, internal ids.
        select 'league'::text,
          jsonb_strip_nulls(jsonb_build_object(
            'game_name', l.game_name, 'tag_line', l.tag_line, 'platform_id', l.platform_id,
            'rank_state', l.solo_rank_state, 'tier', l.solo_tier, 'division', l.solo_division, 'lp', l.solo_lp,
            'wins', l.solo_wins, 'losses', l.solo_losses, 'profile_icon_id', l.profile_icon_id,
            'trust_status', l.trust_status, 'identity_source', l.identity_source, 'data_source', l.data_source,
            'updated_at', l.fetched_at))
        from public.league_profiles l
        where l.entity_id = e.entity_id and l.is_public
      ) x
    )
  from public.entities e
  join public.profiles p on p.entity_id = e.entity_id
  left join public.profile_intro_settings s on s.profile_id = p.profile_id
  left join public.intro_processing_jobs active on active.job_id = s.active_job_id and active.state = 'ready'
  where e.gamid_handle = private.normalize_handle(candidate_handle)
    and e.entity_type = 'SOLO'
    and e.visibility = 'PUBLIC'
  limit 1;
$$;
