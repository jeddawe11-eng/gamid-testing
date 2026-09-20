-- Provider-neutral optional Game Profile attachment (foundation for expandable Game Profiles in My Games). TESTING only.
--
-- FOUNDATION ONLY. This adds the place a normalized Game Profile can live; it does NOT fetch, poll, scrape or seed any stats, it is not wired
-- to any stats provider, and it adds NO row. Marvel Rivals (or any other game) simply has no Game Profile until a real, legitimate adapter
-- attaches one later.
--
-- Five separate concepts stay separate (each in its own place, never inferred from another):
--   1. DISCOVERED GAME   public.discovered_games (unchanged): "this connected account can access game X", provenance DISCOVERED_FROM_<PROVIDER>.
--   2. GAME IDENTITY     identity_source + identity_ref on a Game Profile: the in-game identity the profile is about (e.g. MANUAL_UID + a UID).
--   3. STATS PROVIDER    data_source + data_source_class: where the numbers came from and how much that source is trusted.
--   4. NORMALIZED PROFILE fields (a validated, size-bounded list of {key,label,value,kind}) - the only thing the UI may render. No game-specific columns.
--   5. OWNERSHIP / TRUST trust_status VERIFIED | CONNECTED | MANUAL (the same vocabulary as league_profiles) + verification_basis.
--
-- A Game Profile belongs to (identity, game_key), NOT to a discovery row: the same game discovered through Steam, Discord, PlayStation or Xbox
-- points to ONE profile (game_key is the join, the same key public.known_game_sources already uses), so provenance never forces duplicate profiles.
-- Nothing here reads discovered_games: discovery alone can never create, upgrade or verify a Game Profile.
--
-- Privacy: private by default (is_public = false, and no function here can turn it on); the owner reads through an RPC; there is NO table grant to any
-- client role; the accepted public-safe boundary (get_public_identity / get_public_identity_by_qr) is NOT touched. A separate private projection
-- (private.public_game_profiles) is the single gate any future public presenter must use: it returns only public rows of published identities and never
-- the identity reference or the verification details. Playtime can never ride in a Game Profile (field keys naming playtime/hours are rejected), so the
-- existing "Show playtime on my GamID" switch cannot be bypassed.

-- ---------------------------------------------------------------------------------------------
-- 1. Field payload validation (controlled, extensible, game-agnostic)
-- ---------------------------------------------------------------------------------------------
create function private.game_profile_fields_valid(candidate jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  item jsonb;
  field_key text;
  seen text[] := '{}';
begin
  if candidate is null or jsonb_typeof(candidate) <> 'array' or jsonb_array_length(candidate) > 12 then return false; end if;
  for item in select value from jsonb_array_elements(candidate) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(item) k where k not in ('key', 'label', 'value', 'kind')) then return false; end if;
    if jsonb_typeof(item -> 'key') is distinct from 'string' or jsonb_typeof(item -> 'label') is distinct from 'string' then return false; end if;
    field_key := item ->> 'key';
    if field_key !~ '^[a-z][a-z0-9_]{0,31}$' then return false; end if;
    if field_key ~ '(playtime|hours|minutes_played|time_played)' then return false; end if;   -- playtime has its own owner switch and can never ride in a profile
    if field_key = any (seen) then return false; end if;
    seen := seen || field_key;
    if char_length(item ->> 'label') not between 1 and 40 then return false; end if;
    if jsonb_typeof(item -> 'value') = 'string' then
      if char_length(item ->> 'value') not between 1 and 80 then return false; end if;
    elsif jsonb_typeof(item -> 'value') is distinct from 'number' then
      return false;
    end if;
    if item ? 'kind' and (jsonb_typeof(item -> 'kind') is distinct from 'string' or (item ->> 'kind') not in ('text', 'number', 'percent', 'rank')) then return false; end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. The optional Game Profile attachment
-- ---------------------------------------------------------------------------------------------
create table public.game_profiles (
  game_profile_id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  game_key text not null check (game_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  identity_source text not null check (identity_source ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  identity_ref text check (identity_ref is null or char_length(identity_ref) between 1 and 128),
  data_source text not null check (data_source ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  data_source_class text not null check (data_source_class in ('OFFICIAL', 'THIRD_PARTY', 'UNOFFICIAL_TEMPORARY')),
  trust_status text not null default 'MANUAL' check (trust_status in ('VERIFIED', 'CONNECTED', 'MANUAL')),
  verification_basis text check (verification_basis is null or verification_basis in ('OFFICIAL_ACCOUNT_LINK', 'PLATFORM_OAUTH', 'CHALLENGE_PROOF')),
  fields jsonb not null default '[]'::jsonb check (private.game_profile_fields_valid(fields)),
  schema_version smallint not null default 1 check (schema_version = 1),
  fetched_at timestamptz,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- one profile per game per identity, whichever provider discovered the game
  constraint game_profiles_one_per_game unique (entity_id, game_key),
  -- a manually supplied identity is never verified and carries no verification basis
  constraint game_profiles_manual_has_no_basis check (trust_status <> 'MANUAL' or verification_basis is null),
  -- CONNECTED / VERIFIED must say how; a temporary/unofficial stats source can never lift a profile above MANUAL (same rule as league_profiles)
  constraint game_profiles_connected_needs_basis check (trust_status <> 'CONNECTED' or (verification_basis is not null and data_source_class <> 'UNOFFICIAL_TEMPORARY')),
  constraint game_profiles_verified_needs_official_basis check (trust_status <> 'VERIFIED' or (verification_basis is not null and data_source_class = 'OFFICIAL'))
);
create index game_profiles_entity_idx on public.game_profiles (entity_id);

alter table public.game_profiles enable row level security;

create policy "owners read their own game profiles"
on public.game_profiles for select to authenticated
using (exists (
  select 1 from public.entity_memberships m
  where m.entity_id = game_profiles.entity_id and m.user_id = (select auth.uid()) and m.role = 'OWNER'
));

-- No client role has any table privilege: reads go through the RPC below, writes through the backend-only function.
revoke all on table public.game_profiles from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Owner-facing read (authenticated): the caller's own profiles only. A database read - it never contacts any provider.
-- ---------------------------------------------------------------------------------------------
create function private.get_my_game_profiles_impl()
returns table (
  game_key text, identity_source text, identity_ref text, data_source text, data_source_class text, trust_status text,
  verification_basis text, fields jsonb, schema_version smallint, fetched_at timestamptz, updated_at timestamptz, is_public boolean
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
  select g.game_key, g.identity_source, g.identity_ref, g.data_source, g.data_source_class, g.trust_status,
    g.verification_basis, g.fields, g.schema_version, g.fetched_at, g.updated_at, g.is_public
  from public.game_profiles g
  where g.entity_id = owned_entity_id
  order by g.game_key;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Backend-only writer (service_role): the slot a future, legitimate stats adapter will use. Nothing calls it today.
--    It validates through the table constraints, never touches is_public (a profile is never auto-published: an update keeps whatever the owner
--    chose, a new row starts private) and does not look at discovered games at all.
-- ---------------------------------------------------------------------------------------------
create function private.save_game_profile_impl(
  candidate_entity_id uuid, candidate_game_key text, candidate_identity_source text, candidate_identity_ref text,
  candidate_data_source text, candidate_data_source_class text, candidate_trust_status text, candidate_verification_basis text,
  candidate_fields jsonb, candidate_fetched_at timestamptz
)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.entities e where e.entity_id = candidate_entity_id and e.entity_type = 'SOLO') then
    raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND';
  end if;
  begin
    insert into public.game_profiles as g (entity_id, game_key, identity_source, identity_ref, data_source, data_source_class, trust_status, verification_basis, fields, fetched_at)
    values (candidate_entity_id, candidate_game_key, candidate_identity_source, candidate_identity_ref, candidate_data_source, candidate_data_source_class,
      coalesce(candidate_trust_status, 'MANUAL'), candidate_verification_basis, candidate_fields, candidate_fetched_at)
    on conflict on constraint game_profiles_one_per_game do update
    set identity_source = excluded.identity_source, identity_ref = excluded.identity_ref, data_source = excluded.data_source,
        data_source_class = excluded.data_source_class, trust_status = excluded.trust_status, verification_basis = excluded.verification_basis,
        fields = excluded.fields, fetched_at = excluded.fetched_at, updated_at = now();
  exception when check_violation or not_null_violation or invalid_text_representation then
    return 'INVALID_PROFILE';
  end;
  return 'SAVED';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. The one gate any FUTURE public presenter must use. Granted to no client role and not wired into the public boundary today.
--    Only rows the owner marked public, only for a published identity, and never the identity reference or the verification details.
-- ---------------------------------------------------------------------------------------------
create function private.public_game_profiles(candidate_entity_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'game_key', g.game_key, 'data_source', g.data_source, 'data_source_class', g.data_source_class,
      'trust_status', g.trust_status, 'fields', g.fields, 'fetched_at', g.fetched_at) order by g.game_key), '[]'::jsonb)
  from public.game_profiles g
  join public.entities e on e.entity_id = g.entity_id
  where g.entity_id = candidate_entity_id and g.is_public and e.visibility = 'PUBLIC';
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Public wrappers (established security-invoker + private-impl pattern) and privileges
-- ---------------------------------------------------------------------------------------------
create function public.get_my_game_profiles()
returns table (
  game_key text, identity_source text, identity_ref text, data_source text, data_source_class text, trust_status text,
  verification_basis text, fields jsonb, schema_version smallint, fetched_at timestamptz, updated_at timestamptz, is_public boolean
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_game_profiles_impl(); $$;

create function public.save_game_profile(
  candidate_entity_id uuid, candidate_game_key text, candidate_identity_source text, candidate_identity_ref text,
  candidate_data_source text, candidate_data_source_class text, candidate_trust_status text, candidate_verification_basis text,
  candidate_fields jsonb, candidate_fetched_at timestamptz
)
returns text
language plpgsql volatile security invoker
set search_path = ''
as $$ begin if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if; return private.save_game_profile_impl(candidate_entity_id, candidate_game_key, candidate_identity_source, candidate_identity_ref, candidate_data_source, candidate_data_source_class, candidate_trust_status, candidate_verification_basis, candidate_fields, candidate_fetched_at); end; $$;

revoke all on function
  private.game_profile_fields_valid(jsonb), private.get_my_game_profiles_impl(),
  private.save_game_profile_impl(uuid, text, text, text, text, text, text, text, jsonb, timestamptz), private.public_game_profiles(uuid),
  public.get_my_game_profiles(), public.save_game_profile(uuid, text, text, text, text, text, text, text, jsonb, timestamptz)
from public, anon, authenticated;

grant execute on function private.get_my_game_profiles_impl(), public.get_my_game_profiles() to authenticated;
grant execute on function private.save_game_profile_impl(uuid, text, text, text, text, text, text, text, jsonb, timestamptz),
  public.save_game_profile(uuid, text, text, text, text, text, text, text, jsonb, timestamptz) to service_role;
