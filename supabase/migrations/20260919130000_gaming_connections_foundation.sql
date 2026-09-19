-- Gaming Connections Engine — provider-neutral foundation (first provider: Discord).
-- A connection is an external account attached to the existing permanent GamID identity (public.entities).
-- No OAuth token is ever stored. Connection rows are private by default and are never part of any public RPC.

create table public.connection_provider_catalog (
  provider_key text primary key check (provider_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  label text not null unique check (char_length(label) between 1 and 40),
  sort_order smallint not null default 100,
  active boolean not null default true
);

insert into public.connection_provider_catalog (provider_key, label, sort_order) values ('discord', 'Discord', 10);

create table public.gaming_connections (
  connection_id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  provider_key text not null references public.connection_provider_catalog(provider_key) on delete restrict,
  provider_account_id text not null check (char_length(provider_account_id) between 1 and 64),
  provider_username text check (provider_username is null or char_length(provider_username) <= 64),
  provider_display_name text check (provider_display_name is null or char_length(provider_display_name) <= 64),
  provider_avatar_url text check (provider_avatar_url is null or (char_length(provider_avatar_url) <= 300 and provider_avatar_url ~ '^https://')),
  trust_status text not null default 'CONNECTED' check (trust_status in ('VERIFIED', 'CONNECTED', 'MANUAL')),
  is_public boolean not null default false,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gaming_connections_one_per_provider unique (entity_id, provider_key),
  constraint gaming_connections_external_account_unique unique (provider_key, provider_account_id)
);

create table private.connection_oauth_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  provider_key text not null references public.connection_provider_catalog(provider_key) on delete restrict,
  state_hash bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  completed_at timestamptz,
  outcome text check (outcome in ('CONNECTED', 'RECONNECTED', 'EXPIRED', 'DENIED', 'PROVIDER_ERROR', 'EXCHANGE_FAILED', 'OWNER_HAS_OTHER_ACCOUNT', 'ACCOUNT_ALREADY_LINKED', 'IDENTITY_NOT_FOUND'))
);

create index connection_oauth_attempts_user_created_idx on private.connection_oauth_attempts (user_id, created_at desc);
create index connection_oauth_attempts_entity_idx on private.connection_oauth_attempts (entity_id);
create index connection_oauth_attempts_expiry_idx on private.connection_oauth_attempts (expires_at);

alter table public.connection_provider_catalog enable row level security;
alter table public.gaming_connections enable row level security;
alter table private.connection_oauth_attempts enable row level security;

create policy "owners read their own connections"
on public.gaming_connections for select to authenticated
using (exists (
  select 1 from public.entity_memberships m
  where m.entity_id = gaming_connections.entity_id and m.user_id = (select auth.uid()) and m.role = 'OWNER'
));

revoke all on table public.connection_provider_catalog, public.gaming_connections, private.connection_oauth_attempts from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Owner-facing (authenticated) implementations
-- ---------------------------------------------------------------------------------------------

create function private.start_connection_attempt_impl(candidate_provider text)
returns table (state text, expires_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  normalized text := lower(btrim(candidate_provider));
  owned_entity_id uuid;
  new_state text;
  new_expiry timestamptz := now() + interval '10 minutes';
  recent_attempts integer;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from auth.users u where u.id = caller and u.email_confirmed_at is not null) then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_VERIFIED';
  end if;
  if normalized is null or not exists (select 1 from public.connection_provider_catalog c where c.provider_key = normalized and c.active) then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER';
  end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  delete from private.connection_oauth_attempts a where a.user_id = caller and a.expires_at < now() - interval '1 day';
  select count(*) into recent_attempts from private.connection_oauth_attempts a where a.user_id = caller and a.created_at > now() - interval '10 minutes';
  if recent_attempts >= 10 then raise exception using errcode = '54000', message = 'TOO_MANY_ATTEMPTS'; end if;

  new_state := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.connection_oauth_attempts (user_id, entity_id, provider_key, state_hash, expires_at)
  values (caller, owned_entity_id, normalized, sha256(convert_to(new_state, 'UTF8')), new_expiry);

  return query select new_state, new_expiry;
end;
$$;

create function private.get_my_connections_impl()
returns table (
  provider_key text,
  label text,
  connected boolean,
  provider_username text,
  provider_display_name text,
  provider_avatar_url text,
  trust_status text,
  is_public boolean,
  connected_at timestamptz
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
  select c.provider_key, c.label, (g.connection_id is not null),
    g.provider_username, g.provider_display_name, g.provider_avatar_url, g.trust_status, g.is_public, g.connected_at
  from public.connection_provider_catalog c
  left join public.gaming_connections g on g.provider_key = c.provider_key and g.entity_id = owned_entity_id
  where c.active
  order by c.sort_order, c.provider_key;
end;
$$;

create function private.disconnect_my_connection_impl(candidate_provider text)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  normalized text := lower(btrim(candidate_provider));
  owned_entity_id uuid;
  removed integer;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if normalized is null or not exists (select 1 from public.connection_provider_catalog c where c.provider_key = normalized) then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER';
  end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  delete from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = normalized;
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Backend-only (service_role) implementations used by the OAuth callback
-- ---------------------------------------------------------------------------------------------

-- Validates and one-time-consumes an OAuth attempt by its state value. The row is locked so concurrent or
-- replayed callbacks serialize; only the first caller ever receives 'OK'.
create function private.consume_connection_attempt_impl(candidate_state text)
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

-- Links the provider account to the identity that initiated the (already consumed) attempt.
-- Never silently overwrites a different account and never lets one external account belong to two identities.
create function private.complete_connection_attempt_impl(
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
  if not found or att.consumed_at is null then return 'INVALID_STATE'; end if;
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

-- Records a terminal non-link outcome (user cancelled, provider error, code exchange failed) for a consumed attempt.
create function private.finish_connection_attempt_impl(candidate_attempt_id uuid, candidate_outcome text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if candidate_outcome not in ('DENIED', 'PROVIDER_ERROR', 'EXCHANGE_FAILED') then
    raise exception using errcode = '22023', message = 'INVALID_OUTCOME';
  end if;
  update private.connection_oauth_attempts t
  set completed_at = now(), outcome = candidate_outcome
  where t.attempt_id = candidate_attempt_id and t.consumed_at is not null and t.completed_at is null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Public wrappers (established security-invoker + private-impl pattern)
-- ---------------------------------------------------------------------------------------------

create function public.start_connection_attempt(candidate_provider text)
returns table (state text, expires_at timestamptz)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.start_connection_attempt_impl(candidate_provider); $$;

create function public.get_my_connections()
returns table (
  provider_key text,
  label text,
  connected boolean,
  provider_username text,
  provider_display_name text,
  provider_avatar_url text,
  trust_status text,
  is_public boolean,
  connected_at timestamptz
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_connections_impl(); $$;

create function public.disconnect_my_connection(candidate_provider text)
returns boolean
language sql volatile security invoker
set search_path = ''
as $$ select private.disconnect_my_connection_impl(candidate_provider); $$;

create function public.consume_connection_attempt(candidate_state text)
returns table (attempt_id uuid, owner_user_id uuid, owner_entity_id uuid, provider text, status text)
language plpgsql volatile security invoker
set search_path = ''
as $$ begin if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if; return query select * from private.consume_connection_attempt_impl(candidate_state); end; $$;

create function public.complete_connection_attempt(
  candidate_attempt_id uuid,
  candidate_account_id text,
  candidate_username text,
  candidate_display_name text,
  candidate_avatar_url text
)
returns text
language plpgsql volatile security invoker
set search_path = ''
as $$ begin if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if; return private.complete_connection_attempt_impl(candidate_attempt_id, candidate_account_id, candidate_username, candidate_display_name, candidate_avatar_url); end; $$;

create function public.finish_connection_attempt(candidate_attempt_id uuid, candidate_outcome text)
returns void
language plpgsql volatile security invoker
set search_path = ''
as $$ begin if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if; perform private.finish_connection_attempt_impl(candidate_attempt_id, candidate_outcome); end; $$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges: owner-facing RPCs -> authenticated only; OAuth callback RPCs -> service_role only
-- ---------------------------------------------------------------------------------------------

revoke all on function
  private.start_connection_attempt_impl(text), private.get_my_connections_impl(), private.disconnect_my_connection_impl(text),
  private.consume_connection_attempt_impl(text), private.complete_connection_attempt_impl(uuid, text, text, text, text), private.finish_connection_attempt_impl(uuid, text),
  public.start_connection_attempt(text), public.get_my_connections(), public.disconnect_my_connection(text),
  public.consume_connection_attempt(text), public.complete_connection_attempt(uuid, text, text, text, text), public.finish_connection_attempt(uuid, text)
from public, anon, authenticated;

grant execute on function
  private.start_connection_attempt_impl(text), private.get_my_connections_impl(), private.disconnect_my_connection_impl(text),
  public.start_connection_attempt(text), public.get_my_connections(), public.disconnect_my_connection(text)
to authenticated;

grant execute on function
  private.consume_connection_attempt_impl(text), private.complete_connection_attempt_impl(uuid, text, text, text, text), private.finish_connection_attempt_impl(uuid, text),
  public.consume_connection_attempt(text), public.complete_connection_attempt(uuid, text, text, text, text), public.finish_connection_attempt(uuid, text)
to service_role;

grant usage on schema private to service_role;
