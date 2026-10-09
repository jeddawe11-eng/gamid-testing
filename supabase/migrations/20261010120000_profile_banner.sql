-- Classic Profile Banner - Phase 1B storage and backend foundation (DEC-0005) - GamID TESTING only.
--
-- A Banner is one picture per GamID, stored in the EXISTING private `avatars` bucket under its own sub-folder: avatars/<owner uid>/banner/<uuid>.jpg. Avatars
-- live at avatars/<uid>/<name> with no sub-folder (update_my_identity_profile_impl only accepts that shape), so a Banner can never become an Avatar and the
-- Avatar policies below this file are not touched.
--
-- Bytes reach the bucket only through the usage-upload gateway (usage_policy.gateway_required): for a banner path it accepts a direct POST only, of a JPEG
-- that its trusted decoder fully decodes as exactly 1920x320, and it stores its OWN re-encoded JPEG (no metadata, no trailing data). Storage still enforces the
-- bucket's 5 MiB limit and type list; the 200,000,000-byte quota and its accounting are unchanged (every object under <uid>/ counts, the Banner as "avatar").
--
-- Owner RPCs act on the caller's own SOLO GamID only and are compare-and-set: attach / remove name the Banner the caller believes is current, and a stale
-- belief raises BANNER_CHANGED instead of overwriting a concurrent change. A Banner that is attached cannot be deleted (gateway check + restrictive storage
-- policy); remove it first. Anonymous visitors can read exactly the attached Banner of a PUBLIC GamID - never a PRIVATE / DRAFT one, never an unattached object.

alter table public.profiles
  add column banner_media_reference text,
  add column banner_updated_at timestamptz,
  add constraint profiles_banner_path_check check (banner_media_reference is null or banner_media_reference ~ '^[0-9a-f-]{36}/banner/[0-9a-f-]{36}\.jpg$'),
  add constraint profiles_banner_updated_check check ((banner_media_reference is null) = (banner_updated_at is null));

-- the caller's own SOLO GamID and its profile row
create function private.banner_owner()
returns table (owner_uid uuid, owner_entity_id uuid, owner_profile_id uuid)
language plpgsql stable security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  return query
  select caller, e.entity_id, p.profile_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  join public.profiles p on p.entity_id = e.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if not found then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;
end;
$$;

create function private.get_my_banner_impl()
returns table (banner_path text, banner_updated_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select p.banner_media_reference, p.banner_updated_at from public.profiles p where p.profile_id = (select owner_profile_id from private.banner_owner());
$$;

-- Attach an uploaded Banner. candidate_expected is the Banner the caller believes is attached now (null = none). Returns the new state and the Banner it
-- replaced (the caller deletes that object afterwards; an unattached Banner is never readable by anyone but its owner).
create function private.attach_my_banner_impl(candidate_path text, candidate_expected text)
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
  -- the object must exist, be the gateway's stored JPEG, within the bucket limit, and carry this owner's completed upload receipt
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
  if current_path is distinct from candidate_expected then raise exception using errcode = '40001', message = 'BANNER_CHANGED'; end if;
  if current_path is not distinct from candidate_path then
    return query select p.banner_media_reference, p.banner_updated_at, null::text from public.profiles p where p.profile_id = me.owner_profile_id;
    return;
  end if;
  update public.profiles p set banner_media_reference = candidate_path, banner_updated_at = now(), updated_at = now() where p.profile_id = me.owner_profile_id;
  return query select p.banner_media_reference, p.banner_updated_at, current_path from public.profiles p where p.profile_id = me.owner_profile_id;
end;
$$;

-- Remove the attached Banner (compare-and-set). Returns the detached path for the caller to delete; removing when there is none is a no-op.
create function private.remove_my_banner_impl(candidate_expected text)
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
  if current_path is distinct from candidate_expected then raise exception using errcode = '40001', message = 'BANNER_CHANGED'; end if;
  if current_path is not null then
    update public.profiles p set banner_media_reference = null, banner_updated_at = null, updated_at = now() where p.profile_id = me.owner_profile_id;
  end if;
  return query select null::text, null::timestamptz, current_path;
end;
$$;

-- The caller's own uploaded Banner objects that are NOT attached and are older than an hour (an in-flight attach is never offered), so the client can delete
-- them through the gateway and no orphan keeps counting against the quota.
create function private.list_my_unattached_banners_impl()
returns table (path text, bytes bigint)
language sql stable security definer
set search_path = ''
as $$
  with me as (select * from private.banner_owner())
  select o.name, (o.metadata ->> 'size')::bigint
  from storage.objects o, me
  where o.bucket_id = 'avatars'
    and o.name like me.owner_uid::text || '/banner/%'
    and o.created_at < now() - interval '1 hour'
    and o.name is distinct from (select p.banner_media_reference from public.profiles p where p.profile_id = me.owner_profile_id)
  order by o.created_at
  limit 20;
$$;

-- Service-only: the gateway asks before deleting a banner object; an attached Banner is refused (BANNER_IN_USE).
create function private.authorize_banner_delete(u uuid, p text)
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if u is null or split_part(p, '/', 1) <> u::text then raise exception 'UPLOAD_NOT_OWNED'; end if;
  if exists (select 1 from public.profiles x where x.banner_media_reference = p) then raise exception 'BANNER_IN_USE'; end if;
end;
$$;

-- Storage RLS helpers
create function private.banner_is_public(candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p join public.entities e on e.entity_id = p.entity_id
    where p.banner_media_reference = candidate_path and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC'
  );
$$;

create function private.banner_is_attached(candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.banner_media_reference = candidate_path); $$;

-- Anonymous / signed-in read of exactly the attached Banner of a PUBLIC GamID. The Avatar policies are unchanged.
create policy "public profile banners are readable"
on storage.objects for select to anon, authenticated
using (bucket_id = 'avatars' and private.banner_is_public(name));

-- An attached Banner cannot be deleted through the Storage API either (restrictive: it narrows every other delete policy, for banner paths only).
create policy "attached banners cannot be deleted"
on storage.objects as restrictive for delete to authenticated
using (not (bucket_id = 'avatars' and name like '%/banner/%' and private.banner_is_attached(name)));

-- public wrappers (security invoker over the private implementations)
create function public.get_my_banner()
returns table (banner_path text, banner_updated_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_banner_impl(); $$;

create function public.attach_my_banner(candidate_path text, candidate_expected text)
returns table (banner_path text, banner_updated_at timestamptz, previous_path text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.attach_my_banner_impl(candidate_path, candidate_expected); $$;

create function public.remove_my_banner(candidate_expected text)
returns table (banner_path text, banner_updated_at timestamptz, previous_path text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.remove_my_banner_impl(candidate_expected); $$;

create function public.list_my_unattached_banners()
returns table (path text, bytes bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.list_my_unattached_banners_impl(); $$;

create function public.authorize_banner_delete(candidate_owner uuid, candidate_path text)
returns void
language sql stable security invoker set search_path = ''
as $$ select private.authorize_banner_delete(candidate_owner, candidate_path); $$;

revoke all on function
  private.banner_owner(), private.get_my_banner_impl(), private.attach_my_banner_impl(text, text), private.remove_my_banner_impl(text),
  private.list_my_unattached_banners_impl(), private.authorize_banner_delete(uuid, text), private.banner_is_public(text), private.banner_is_attached(text),
  public.get_my_banner(), public.attach_my_banner(text, text), public.remove_my_banner(text), public.list_my_unattached_banners(), public.authorize_banner_delete(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function
  private.banner_owner(), private.get_my_banner_impl(), private.attach_my_banner_impl(text, text), private.remove_my_banner_impl(text), private.list_my_unattached_banners_impl(),
  public.get_my_banner(), public.attach_my_banner(text, text), public.remove_my_banner(text), public.list_my_unattached_banners()
to authenticated;
grant execute on function private.authorize_banner_delete(uuid, text), public.authorize_banner_delete(uuid, text) to service_role;
grant execute on function private.banner_is_public(text), private.banner_is_attached(text) to anon, authenticated;
