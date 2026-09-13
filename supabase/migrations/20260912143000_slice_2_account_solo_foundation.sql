create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.entity_type as enum ('SOLO');
create type public.entity_visibility as enum ('DRAFT', 'PRIVATE');
create type public.verification_status as enum ('UNVERIFIED');
create type public.profile_status as enum ('DRAFT');
create type public.entity_role as enum ('OWNER');

create table private.account_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  date_of_birth date not null,
  preferred_language text not null default 'en' check (preferred_language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.age_policies (
  policy_key text primary key,
  minimum_age smallint not null check (minimum_age between 0 and 120),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.age_policies (policy_key, minimum_age, active)
values ('default_public_identity', 13, true);

create table private.reserved_handles (
  handle text primary key check (handle = lower(handle)),
  category text not null,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into private.reserved_handles (handle, category, reason) values
  ('admin', 'SYSTEM', 'Administrative namespace'),
  ('support', 'SYSTEM', 'Customer support namespace'),
  ('gamid', 'SYSTEM', 'GamID brand namespace'),
  ('root', 'SYSTEM', 'System namespace'),
  ('system', 'SYSTEM', 'System namespace'),
  ('api', 'SYSTEM', 'API namespace'),
  ('help', 'SYSTEM', 'Help namespace'),
  ('security', 'SYSTEM', 'Security namespace'),
  ('moderator', 'SYSTEM', 'Moderation namespace'),
  ('official', 'PROTECTED', 'Protected designation'),
  ('fuck', 'ABUSIVE', 'Unsafe handle'),
  ('shit', 'ABUSIVE', 'Unsafe handle'),
  ('bitch', 'ABUSIVE', 'Unsafe handle');

create table public.entities (
  entity_id uuid primary key default gen_random_uuid(),
  entity_type public.entity_type not null default 'SOLO',
  gamid_handle text not null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  avatar_media_reference text,
  visibility public.entity_visibility not null default 'DRAFT',
  verification_status public.verification_status not null default 'UNVERIFIED',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entities_handle_normalized check (gamid_handle = lower(gamid_handle)),
  constraint entities_handle_format check (
    gamid_handle ~ '^[a-z0-9][a-z0-9_]{1,22}[a-z0-9]$'
    and gamid_handle !~ '__'
  ),
  constraint entities_handle_unique unique (gamid_handle)
);

create unique index entities_one_solo_per_creator
  on public.entities (created_by_user_id)
  where entity_type = 'SOLO';

create table public.entity_memberships (
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.entity_role not null default 'OWNER',
  created_at timestamptz not null default now(),
  primary key (entity_id, user_id)
);
create index entity_memberships_user_id_idx on public.entity_memberships(user_id);

create table public.profiles (
  profile_id uuid primary key default gen_random_uuid(),
  entity_id uuid not null unique references public.entities(entity_id) on delete cascade,
  status public.profile_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qr_references (
  qr_reference_id uuid primary key default gen_random_uuid(),
  entity_id uuid not null unique references public.entities(entity_id) on delete cascade,
  public_token text not null unique default ('q_' || encode(gen_random_bytes(18), 'hex')),
  created_at timestamptz not null default now(),
  constraint qr_token_is_opaque check (public_token ~ '^q_[0-9a-f]{36}$')
);

alter table private.account_private enable row level security;
alter table private.age_policies enable row level security;
alter table private.reserved_handles enable row level security;
alter table public.entities enable row level security;
alter table public.entity_memberships enable row level security;
alter table public.profiles enable row level security;
alter table public.qr_references enable row level security;

create policy "owners can read their entities"
on public.entities for select to authenticated
using (exists (
  select 1 from public.entity_memberships m
  where m.entity_id = entities.entity_id and m.user_id = (select auth.uid())
));

create policy "members can read their membership"
on public.entity_memberships for select to authenticated
using (user_id = (select auth.uid()));

create policy "owners can read their draft profiles"
on public.profiles for select to authenticated
using (exists (
  select 1 from public.entity_memberships m
  where m.entity_id = profiles.entity_id and m.user_id = (select auth.uid())
));

create policy "owners can read their qr reference"
on public.qr_references for select to authenticated
using (exists (
  select 1 from public.entity_memberships m
  where m.entity_id = qr_references.entity_id and m.user_id = (select auth.uid())
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload avatars to their folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users read their avatars"
on storage.objects for select to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text));

create policy "users update their avatars"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text))
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users delete their avatars"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text));

create or replace function private.normalize_handle(candidate text)
returns text language sql immutable parallel safe
set search_path = ''
as $$ select lower(trim(both from candidate)); $$;

create or replace function private.handle_validation_error(candidate text)
returns text language plpgsql stable security definer
set search_path = ''
as $$
declare normalized text := private.normalize_handle(candidate);
begin
  if char_length(normalized) < 3 then return 'TOO_SHORT'; end if;
  if char_length(normalized) > 24 then return 'TOO_LONG'; end if;
  if normalized !~ '^[a-z0-9][a-z0-9_]*[a-z0-9]$' or normalized ~ '__' then return 'INVALID_FORMAT'; end if;
  if exists (select 1 from private.reserved_handles r where r.handle = normalized and r.active) then return 'RESERVED'; end if;
  return null;
end;
$$;

create or replace function public.check_handle_availability(candidate text)
returns table (normalized_handle text, available boolean, reason text)
language plpgsql stable security definer
set search_path = ''
as $$
declare normalized text := private.normalize_handle(candidate);
declare validation_error text;
begin
  validation_error := private.handle_validation_error(normalized);
  return query select normalized,
    validation_error is null and not exists (
      select 1 from public.entities e where e.gamid_handle = normalized
    ),
    coalesce(validation_error,
      case when exists (select 1 from public.entities e where e.gamid_handle = normalized) then 'TAKEN' end
    );
end;
$$;

create or replace function public.create_solo_identity(
  candidate_handle text,
  candidate_display_name text,
  candidate_date_of_birth date,
  candidate_language text default 'en'
)
returns table (entity_id uuid, gamid_handle text, profile_id uuid, qr_public_token text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  normalized text := private.normalize_handle(candidate_handle);
  validation_error text;
  minimum_age smallint;
  created_entity_id uuid;
  created_profile_id uuid;
  created_qr_token text;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from auth.users u where u.id = caller and u.email_confirmed_at is not null) then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_VERIFIED';
  end if;
  if exists (select 1 from public.entities e where e.created_by_user_id = caller and e.entity_type = 'SOLO') then
    raise exception using errcode = '23505', message = 'SOLO_IDENTITY_EXISTS';
  end if;
  if candidate_date_of_birth is null or candidate_date_of_birth > current_date then
    raise exception using errcode = '22023', message = 'INVALID_DATE_OF_BIRTH';
  end if;
  select p.minimum_age into minimum_age from private.age_policies p
    where p.active order by p.updated_at desc limit 1;
  if minimum_age is null then raise exception 'AGE_POLICY_UNAVAILABLE'; end if;
  if candidate_date_of_birth > (current_date - make_interval(years => minimum_age))::date then
    raise exception using errcode = '22023', message = 'AGE_NOT_ELIGIBLE';
  end if;
  if candidate_language !~ '^[a-z]{2}(-[A-Z]{2})?$' then
    raise exception using errcode = '22023', message = 'INVALID_LANGUAGE';
  end if;
  if char_length(trim(candidate_display_name)) not between 1 and 60 then
    raise exception using errcode = '22023', message = 'INVALID_DISPLAY_NAME';
  end if;
  validation_error := private.handle_validation_error(normalized);
  if validation_error is not null then
    raise exception using errcode = '22023', message = validation_error;
  end if;

  insert into private.account_private (user_id, date_of_birth, preferred_language)
  values (caller, candidate_date_of_birth, candidate_language)
  on conflict (user_id) do update set
    preferred_language = excluded.preferred_language,
    updated_at = now();

  insert into public.entities (gamid_handle, display_name, created_by_user_id)
  values (normalized, trim(candidate_display_name), caller)
  returning public.entities.entity_id into created_entity_id;

  insert into public.entity_memberships (entity_id, user_id, role)
  values (created_entity_id, caller, 'OWNER');

  insert into public.profiles (entity_id)
  values (created_entity_id)
  returning public.profiles.profile_id into created_profile_id;

  insert into public.qr_references (entity_id)
  values (created_entity_id)
  returning public.qr_references.public_token into created_qr_token;

  return query select created_entity_id, normalized, created_profile_id, created_qr_token;
exception
  when unique_violation then
    if exists (select 1 from public.entities e where e.gamid_handle = normalized) then
      raise exception using errcode = '23505', message = 'HANDLE_TAKEN';
    end if;
    raise;
end;
$$;

create or replace function public.get_my_gamid()
returns table (
  account_email text,
  preferred_language text,
  entity_id uuid,
  gamid_handle text,
  display_name text,
  avatar_media_reference text,
  visibility public.entity_visibility,
  profile_id uuid,
  profile_status public.profile_status,
  qr_public_token text
)
language sql stable security definer
set search_path = ''
as $$
  select u.email::text, a.preferred_language, e.entity_id, e.gamid_handle,
    e.display_name, e.avatar_media_reference, e.visibility,
    p.profile_id, p.status, q.public_token
  from auth.users u
  left join private.account_private a on a.user_id = u.id
  left join public.entity_memberships m on m.user_id = u.id and m.role = 'OWNER'
  left join public.entities e on e.entity_id = m.entity_id and e.entity_type = 'SOLO'
  left join public.profiles p on p.entity_id = e.entity_id
  left join public.qr_references q on q.entity_id = e.entity_id
  where u.id = (select auth.uid())
  limit 1;
$$;

create or replace function public.update_preferred_language(candidate_language text)
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if candidate_language !~ '^[a-z]{2}(-[A-Z]{2})?$' then
    raise exception using errcode = '22023', message = 'INVALID_LANGUAGE';
  end if;
  update private.account_private set preferred_language = candidate_language, updated_at = now()
    where user_id = caller;
  if not found then raise exception using errcode = 'P0002', message = 'ACCOUNT_NOT_READY'; end if;
  return candidate_language;
end;
$$;

create or replace function public.attach_avatar(candidate_path text)
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if candidate_path !~ ('^' || caller::text || '/[a-zA-Z0-9._-]+$') then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_PATH';
  end if;
  update public.entities set avatar_media_reference = candidate_path, updated_at = now()
    where created_by_user_id = caller and entity_type = 'SOLO';
  if not found then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;
  return candidate_path;
end;
$$;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on public.entities, public.entity_memberships, public.profiles, public.qr_references from anon;
grant select on public.entities, public.entity_memberships, public.profiles, public.qr_references to authenticated;

revoke all on function public.check_handle_availability(text) from public;
grant execute on function public.check_handle_availability(text) to anon, authenticated;
revoke all on function public.create_solo_identity(text,text,date,text) from public, anon;
grant execute on function public.create_solo_identity(text,text,date,text) to authenticated;
revoke all on function public.get_my_gamid() from public, anon;
grant execute on function public.get_my_gamid() to authenticated;
revoke all on function public.update_preferred_language(text) from public, anon;
grant execute on function public.update_preferred_language(text) to authenticated;
revoke all on function public.attach_avatar(text) from public, anon;
grant execute on function public.attach_avatar(text) to authenticated;
