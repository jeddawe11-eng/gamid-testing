-- Phase 1D security remediation (ISS-0009, DEC-0005) - GamID TESTING only.
--
-- Proven live (Phase 1B / 1D, GM-TEST fixtures): any visitor who can SELECT a Storage object under RLS can also mint a signed URL for it, with ANY lifetime
-- (one year was accepted). A signed URL is checked only by its signature and expiry, so it kept serving the Avatar after PRIVATE and after replacement, the
-- Wall video after Disable and after Unpublish, and the Intro after PRIVATE.
--
-- Fix, server-enforced:
--   1. Only the folder owner (<uid>/...) may sign. A RESTRICTIVE policy narrows every SELECT policy while Storage performs a signing operation
--      (storage.operation(): storage.object.sign / storage.object.sign_many, observed live). Direct reads are unchanged: every one re-checks RLS, so access
--      ends the moment a GamID goes PRIVATE, an Avatar is replaced, or a Wall is disabled / unpublished.
--   2. Visitors get streaming leases for Intro and published Wall video only from the public-media Edge Function: it asks
--      public_media_lease_allowed (the SAME predicates as the accepted read policies), then signs with server credentials and a server-chosen lifetime
--      (Intro 120 s - the accepted F5 lease; Wall video 6 h - the accepted F4 lifetime). Visitors never choose a lifetime.
--   3. The Classic Profile Banner is delivered only by the profile-banner Edge Function (no Storage URL at all): public_banner_object(handle).
--   4. A small fixed-window rate counter for both functions (hashed client key only, never an IP).
--   5. The Banner compare-and-set conflict now returns HTTP 409 (SQLSTATE PT409) instead of 40001 (which PostgREST answered with 504).
-- Accepted Avatar / Intro / Wall read policies, owner reads and owner signing, the upload gateway and all quotas are unchanged.

-- 1. (the signing ban itself is 20261010141000_visitor_storage_signing_ban.sql, applied after public-media and the page are live)


-- 2. server-side lease decision (service role only)
create function private.public_media_lease_allowed(candidate_bucket text, candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when candidate_path is null or candidate_path ~ '\.\.' then false
    when candidate_bucket = 'intro-media' then private.intro_media_is_public(candidate_path)
    when candidate_bucket in ('wall-video', 'wall-video-derived') then private.wall_object_is_published(candidate_bucket, candidate_path)
    else false
  end;
$$;

-- 3. the attached Banner of a PUBLIC GamID, if its stored object exists (service role only)
create function private.public_banner_object(candidate_handle text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select p.banner_media_reference
  from public.entities e
  join public.profiles p on p.entity_id = e.entity_id
  join storage.objects o on o.bucket_id = 'avatars' and o.name = p.banner_media_reference
  where e.gamid_handle = private.normalize_handle(candidate_handle)
    and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC'
    and p.banner_media_reference is not null
    and o.metadata ->> 'mimetype' = 'image/jpeg'
    and coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$' and (o.metadata ->> 'size')::bigint between 1 and 5242880
  limit 1;
$$;

-- 4. fixed-window rate counter: true while the key is within its allowance for the current minute
create table private.public_media_rate (
  rate_key text not null check (rate_key ~ '^[a-z]{1,16}:[0-9a-f]{32}$'),
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (rate_key, window_start)
);
alter table private.public_media_rate enable row level security;
revoke all on table private.public_media_rate from public, anon, authenticated, service_role;

create function private.public_media_hit(candidate_key text, candidate_limit integer)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  current_window timestamptz := date_trunc('minute', now());
  count_now integer;
begin
  if candidate_limit is null or candidate_limit < 1 then raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT'; end if;
  insert into private.public_media_rate as r (rate_key, window_start) values (candidate_key, current_window)
  on conflict (rate_key, window_start) do update set hits = r.hits + 1
  returning hits into count_now;
  if random() < 0.02 then delete from private.public_media_rate where window_start < now() - interval '10 minutes'; end if;
  return count_now <= candidate_limit;
end;
$$;

-- 5. Banner compare-and-set conflicts -> HTTP 409 (bodies otherwise identical to 20261010120000_profile_banner.sql)
create or replace function private.attach_my_banner_impl(candidate_path text, candidate_expected text)
returns table (banner_path text, banner_updated_at timestamptz, previous_path text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me record;
  current_path text;
begin
  select * into me from private.banner_owner();
  if candidate_path is null or candidate_path !~ ('^' || me.owner_uid::text || '/banner/[0-9a-f-]{36}\.jpg$') then
    raise exception using errcode = '22023', message = 'INVALID_BANNER_PATH';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'avatars' and o.name = candidate_path
      and o.metadata ->> 'mimetype' = 'image/jpeg'
      and coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$' and (o.metadata ->> 'size')::bigint between 1 and 5242880
      and private.usage_object_owned('avatars', o.name, me.owner_uid)
  ) then
    raise exception using errcode = '22023', message = 'BANNER_NOT_UPLOADED';
  end if;
  select p.banner_media_reference into current_path from public.profiles p where p.profile_id = me.owner_profile_id for update;
  if current_path is distinct from candidate_expected then raise exception using errcode = 'PT409', message = 'BANNER_CHANGED'; end if;
  if current_path is not distinct from candidate_path then
    return query select p.banner_media_reference, p.banner_updated_at, null::text from public.profiles p where p.profile_id = me.owner_profile_id;
    return;
  end if;
  update public.profiles p set banner_media_reference = candidate_path, banner_updated_at = now(), updated_at = now() where p.profile_id = me.owner_profile_id;
  return query select p.banner_media_reference, p.banner_updated_at, current_path from public.profiles p where p.profile_id = me.owner_profile_id;
end;
$$;

create or replace function private.remove_my_banner_impl(candidate_expected text)
returns table (banner_path text, banner_updated_at timestamptz, previous_path text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me record;
  current_path text;
begin
  select * into me from private.banner_owner();
  select p.banner_media_reference into current_path from public.profiles p where p.profile_id = me.owner_profile_id for update;
  if current_path is distinct from candidate_expected then raise exception using errcode = 'PT409', message = 'BANNER_CHANGED'; end if;
  if current_path is not null then
    update public.profiles p set banner_media_reference = null, banner_updated_at = null, updated_at = now() where p.profile_id = me.owner_profile_id;
  end if;
  return query select null::text, null::timestamptz, current_path;
end;
$$;

-- service-role wrappers
create function public.public_media_lease_allowed(candidate_bucket text, candidate_path text)
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.public_media_lease_allowed(candidate_bucket, candidate_path); $$;

create function public.public_banner_object(candidate_handle text)
returns text language sql stable security invoker set search_path = ''
as $$ select private.public_banner_object(candidate_handle); $$;

create function public.public_media_hit(candidate_key text, candidate_limit integer)
returns boolean language sql volatile security invoker set search_path = ''
as $$ select private.public_media_hit(candidate_key, candidate_limit); $$;

revoke all on function
  private.public_media_lease_allowed(text, text), private.public_banner_object(text), private.public_media_hit(text, integer),
  public.public_media_lease_allowed(text, text), public.public_banner_object(text), public.public_media_hit(text, integer)
from public, anon, authenticated, service_role;
grant execute on function
  private.public_media_lease_allowed(text, text), private.public_banner_object(text), private.public_media_hit(text, integer),
  public.public_media_lease_allowed(text, text), public.public_banner_object(text), public.public_media_hit(text, integer)
to service_role;
