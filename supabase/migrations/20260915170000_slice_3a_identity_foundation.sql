alter table public.profiles
  add column bio text not null default ''
  constraint profiles_bio_length check (char_length(bio) <= 160);

create function private.get_my_identity_profile_impl()
returns table (
  entity_id uuid,
  gamid_handle text,
  display_name text,
  avatar_media_reference text,
  visibility public.entity_visibility,
  profile_id uuid,
  profile_status public.profile_status,
  bio text
)
language sql stable security definer
set search_path = ''
as $$
  select e.entity_id, e.gamid_handle, e.display_name, e.avatar_media_reference,
    e.visibility, p.profile_id, p.status, p.bio
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id and e.entity_type = 'SOLO'
  join public.profiles p on p.entity_id = e.entity_id
  where m.user_id = (select auth.uid()) and m.role = 'OWNER'
  limit 1;
$$;

create function private.update_my_identity_profile_impl(
  candidate_display_name text,
  candidate_bio text,
  candidate_avatar_path text default null
)
returns table (
  entity_id uuid,
  gamid_handle text,
  display_name text,
  avatar_media_reference text,
  visibility public.entity_visibility,
  profile_id uuid,
  profile_status public.profile_status,
  bio text
)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if char_length(trim(candidate_display_name)) not between 1 and 60 then
    raise exception using errcode = '22023', message = 'INVALID_DISPLAY_NAME';
  end if;
  if candidate_bio is null or char_length(candidate_bio) > 160 then
    raise exception using errcode = '22023', message = 'BIO_TOO_LONG';
  end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then
    raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND';
  end if;

  if candidate_avatar_path is not null then
    if candidate_avatar_path !~ ('^' || caller::text || '/[a-zA-Z0-9._-]+$')
      or not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'avatars'
          and o.name = candidate_avatar_path
          and o.owner_id = caller::text
      ) then
      raise exception using errcode = '22023', message = 'INVALID_AVATAR_PATH';
    end if;
  end if;

  update public.entities e
  set display_name = trim(candidate_display_name),
      avatar_media_reference = coalesce(candidate_avatar_path, e.avatar_media_reference),
      updated_at = now()
  where e.entity_id = owned_entity_id;

  update public.profiles p
  set bio = candidate_bio, updated_at = now()
  where p.entity_id = owned_entity_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  return query
  select e.entity_id, e.gamid_handle, e.display_name, e.avatar_media_reference,
    e.visibility, p.profile_id, p.status, p.bio
  from public.entities e
  join public.profiles p on p.entity_id = e.entity_id
  where e.entity_id = owned_entity_id;
end;
$$;

create function public.get_my_identity_profile()
returns table (
  entity_id uuid,
  gamid_handle text,
  display_name text,
  avatar_media_reference text,
  visibility public.entity_visibility,
  profile_id uuid,
  profile_status public.profile_status,
  bio text
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_identity_profile_impl(); $$;

create function public.update_my_identity_profile(
  candidate_display_name text,
  candidate_bio text,
  candidate_avatar_path text default null
)
returns table (
  entity_id uuid,
  gamid_handle text,
  display_name text,
  avatar_media_reference text,
  visibility public.entity_visibility,
  profile_id uuid,
  profile_status public.profile_status,
  bio text
)
language sql volatile security invoker
set search_path = ''
as $$
  select * from private.update_my_identity_profile_impl(
    candidate_display_name,
    candidate_bio,
    candidate_avatar_path
  );
$$;

revoke all on function private.get_my_identity_profile_impl() from public, anon, authenticated;
revoke all on function private.update_my_identity_profile_impl(text,text,text) from public, anon, authenticated;
grant execute on function private.get_my_identity_profile_impl() to authenticated;
grant execute on function private.update_my_identity_profile_impl(text,text,text) to authenticated;

revoke all on function public.get_my_identity_profile() from public, anon;
grant execute on function public.get_my_identity_profile() to authenticated;
revoke all on function public.update_my_identity_profile(text,text,text) from public, anon;
grant execute on function public.update_my_identity_profile(text,text,text) to authenticated;

revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated;
