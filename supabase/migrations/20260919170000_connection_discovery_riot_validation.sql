-- Gaming Connections — Riot discovery VALIDATION (diagnostic only, GamID TESTING).
--
-- Question this answers: when a user authorizes Discord's `identify connections` scopes, does Discord's official
-- GET /users/@me/connections return a Riot Games entry, and which safe fields does it carry?
--
-- Only the result for the Riot entry (if any) is retained. Unrelated external accounts returned by Discord are never
-- stored, and the raw external id is never stored (only its shape, length, and a SHA-256 fingerprint that is never
-- returned to any client). Rows are private to the connection owner, are removed with the connection (disconnect), and are
-- not part of any public RPC. No Discord OAuth token is stored.

create table public.connection_discovery_results (
  connection_id uuid not null references public.gaming_connections(connection_id) on delete cascade,
  discovered_provider text not null check (discovered_provider in ('riot')),
  status text not null check (status in ('FOUND', 'ABSENT', 'UNAVAILABLE')),
  checked_at timestamptz not null default now(),
  total_returned integer check (total_returned is null or total_returned between 0 and 1000),
  match_count integer check (match_count is null or match_count between 0 and 100),
  external_type text check (external_type is null or (char_length(external_type) between 1 and 40 and external_type ~ '^[A-Za-z0-9_.-]+$')),
  external_name text check (external_name is null or char_length(external_name) between 1 and 128),
  external_id_shape text check (external_id_shape is null or external_id_shape in ('uuid', 'digits', 'alnum', 'other')),
  external_id_length integer check (external_id_length is null or external_id_length between 1 and 200),
  external_id_sha256 text check (external_id_sha256 is null or external_id_sha256 ~ '^[0-9a-f]{64}$'),
  verified boolean,
  revoked boolean,
  friend_sync boolean,
  visibility smallint check (visibility is null or visibility between 0 and 9),
  returned_fields text[] not null default '{}' check (cardinality(returned_fields) <= 24),
  primary key (connection_id, discovered_provider),
  constraint connection_discovery_found_has_type check (status <> 'FOUND' or external_type is not null),
  constraint connection_discovery_only_found_has_details check (
    status = 'FOUND' or (
      external_type is null and external_name is null and external_id_shape is null and external_id_length is null
      and external_id_sha256 is null and verified is null and revoked is null and friend_sync is null and visibility is null
      and cardinality(returned_fields) = 0
    )
  )
);

alter table public.connection_discovery_results enable row level security;

create policy "owners read their own connection discovery"
on public.connection_discovery_results for select to authenticated
using (exists (
  select 1
  from public.gaming_connections g
  join public.entity_memberships m on m.entity_id = g.entity_id
  where g.connection_id = connection_discovery_results.connection_id
    and m.user_id = (select auth.uid()) and m.role = 'OWNER'
));

revoke all on table public.connection_discovery_results from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Backend-only: record the (already minimized) discovery result for a just-completed link
-- ---------------------------------------------------------------------------------------------
create function private.record_connection_discovery_impl(
  candidate_attempt_id uuid,
  candidate_account_id text,
  candidate_provider text,
  candidate_status text,
  candidate_total integer,
  candidate_match_count integer,
  candidate_type text,
  candidate_name text,
  candidate_id_shape text,
  candidate_id_length integer,
  candidate_id_sha256 text,
  candidate_verified boolean,
  candidate_revoked boolean,
  candidate_friend_sync boolean,
  candidate_visibility integer,
  candidate_fields text[]
)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  att private.connection_oauth_attempts%rowtype;
  target_connection uuid;
  found_entry boolean := candidate_status = 'FOUND';
  clean_fields text[];
begin
  if candidate_provider is distinct from 'riot' then return 'INVALID_PROVIDER'; end if;
  if candidate_status is null or candidate_status not in ('FOUND', 'ABSENT', 'UNAVAILABLE') then return 'INVALID_STATUS'; end if;

  select * into att from private.connection_oauth_attempts t where t.attempt_id = candidate_attempt_id;
  if not found or att.consumed_at is null or att.completed_at is null or coalesce(att.outcome, '') not in ('CONNECTED', 'RECONNECTED') then
    return 'INVALID_ATTEMPT';
  end if;

  select g.connection_id into target_connection
  from public.gaming_connections g
  where g.entity_id = att.entity_id and g.provider_key = att.provider_key and g.provider_account_id = candidate_account_id;
  if target_connection is null then return 'NO_CONNECTION'; end if;

  select coalesce(array_agg(f order by f), '{}'::text[]) into clean_fields
  from (
    select distinct f from unnest(coalesce(candidate_fields, '{}'::text[])) as f
    where f ~ '^[a-z_]{1,32}$' limit 24
  ) s;

  insert into public.connection_discovery_results as r (
    connection_id, discovered_provider, status, checked_at, total_returned, match_count,
    external_type, external_name, external_id_shape, external_id_length, external_id_sha256,
    verified, revoked, friend_sync, visibility, returned_fields
  ) values (
    target_connection, 'riot', candidate_status, now(), candidate_total, candidate_match_count,
    case when found_entry then candidate_type end, case when found_entry then candidate_name end,
    case when found_entry then candidate_id_shape end, case when found_entry then candidate_id_length end,
    case when found_entry then candidate_id_sha256 end,
    case when found_entry then candidate_verified end, case when found_entry then candidate_revoked end,
    case when found_entry then candidate_friend_sync end, case when found_entry then candidate_visibility::smallint end,
    case when found_entry then clean_fields else '{}'::text[] end
  )
  on conflict (connection_id, discovered_provider) do update set
    status = excluded.status, checked_at = excluded.checked_at, total_returned = excluded.total_returned,
    match_count = excluded.match_count, external_type = excluded.external_type, external_name = excluded.external_name,
    external_id_shape = excluded.external_id_shape, external_id_length = excluded.external_id_length,
    external_id_sha256 = excluded.external_id_sha256, verified = excluded.verified, revoked = excluded.revoked,
    friend_sync = excluded.friend_sync, visibility = excluded.visibility, returned_fields = excluded.returned_fields;

  return 'RECORDED';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Owner-facing: read my own discovery results (never returns the id fingerprint)
-- ---------------------------------------------------------------------------------------------
create function private.get_my_connection_discovery_impl()
returns table (
  provider_key text,
  discovered_provider text,
  status text,
  checked_at timestamptz,
  total_returned integer,
  match_count integer,
  external_type text,
  external_name text,
  external_id_shape text,
  external_id_length integer,
  verified boolean,
  revoked boolean,
  friend_sync boolean,
  visibility smallint,
  returned_fields text[]
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
  select g.provider_key, d.discovered_provider, d.status, d.checked_at, d.total_returned, d.match_count,
    d.external_type, d.external_name, d.external_id_shape, d.external_id_length,
    d.verified, d.revoked, d.friend_sync, d.visibility, d.returned_fields
  from public.connection_discovery_results d
  join public.gaming_connections g on g.connection_id = d.connection_id
  where g.entity_id = owned_entity_id
  order by g.provider_key, d.discovered_provider;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Public wrappers (established security-invoker + private-impl pattern)
-- ---------------------------------------------------------------------------------------------
create function public.get_my_connection_discovery()
returns table (
  provider_key text,
  discovered_provider text,
  status text,
  checked_at timestamptz,
  total_returned integer,
  match_count integer,
  external_type text,
  external_name text,
  external_id_shape text,
  external_id_length integer,
  verified boolean,
  revoked boolean,
  friend_sync boolean,
  visibility smallint,
  returned_fields text[]
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_connection_discovery_impl(); $$;

create function public.record_connection_discovery(
  candidate_attempt_id uuid,
  candidate_account_id text,
  candidate_provider text,
  candidate_status text,
  candidate_total integer,
  candidate_match_count integer,
  candidate_type text,
  candidate_name text,
  candidate_id_shape text,
  candidate_id_length integer,
  candidate_id_sha256 text,
  candidate_verified boolean,
  candidate_revoked boolean,
  candidate_friend_sync boolean,
  candidate_visibility integer,
  candidate_fields text[]
)
returns text
language plpgsql volatile security invoker
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if;
  return private.record_connection_discovery_impl(
    candidate_attempt_id, candidate_account_id, candidate_provider, candidate_status, candidate_total, candidate_match_count,
    candidate_type, candidate_name, candidate_id_shape, candidate_id_length, candidate_id_sha256,
    candidate_verified, candidate_revoked, candidate_friend_sync, candidate_visibility, candidate_fields
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges: owner read -> authenticated only; recording -> service_role only
-- ---------------------------------------------------------------------------------------------
revoke all on function
  private.get_my_connection_discovery_impl(),
  private.record_connection_discovery_impl(uuid, text, text, text, integer, integer, text, text, text, integer, text, boolean, boolean, boolean, integer, text[]),
  public.get_my_connection_discovery(),
  public.record_connection_discovery(uuid, text, text, text, integer, integer, text, text, text, integer, text, boolean, boolean, boolean, integer, text[])
from public, anon, authenticated;

grant execute on function private.get_my_connection_discovery_impl(), public.get_my_connection_discovery() to authenticated;

grant execute on function
  private.record_connection_discovery_impl(uuid, text, text, text, integer, integer, text, text, text, integer, text, boolean, boolean, boolean, integer, text[]),
  public.record_connection_discovery(uuid, text, text, text, integer, integer, text, text, text, integer, text, boolean, boolean, boolean, integer, text[])
to service_role;
