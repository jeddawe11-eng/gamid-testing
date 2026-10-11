-- ISS-0007 (Avatar upload validation), GamID TESTING only. The usage-upload gateway now accepts an Avatar only as a direct POST of a square JPEG that the
-- trusted decoder fully decodes, and stores its OWN re-encoded JPEG at <uid>/avatar-<uuid>.jpg (supabase/functions/_shared/usage-upload.js processAvatar); the
-- resumable route refuses the avatars bucket. This migration makes the Avatar REFERENCE follow the same rule, so an object stored before that gateway went live
-- (kept byte-for-byte, never validated) can no longer become anyone's Avatar:
--   a NEW Avatar must be <caller>/avatar-<uuid>.jpg, an image/jpeg object in avatars owned by the caller, stored at or after validated_since (set when this
--   migration is applied, which is AFTER the validating gateway is deployed; direct Storage writes stay blocked by the usage gateway policies).
-- The Avatar a GamID already shows is kept as it is. No Storage object is read, modified, re-encoded or deleted; no policy, quota or ownership rule changes.

create table private.avatar_validation (
  singleton boolean primary key default true check (singleton),
  validated_since timestamptz not null
);
comment on table private.avatar_validation is 'ISS-0007: the moment the validating Avatar gateway went live; only Avatar objects stored since then can be attached.';
insert into private.avatar_validation (validated_since) values (now());
alter table private.avatar_validation enable row level security;
revoke all on table private.avatar_validation from public, anon, authenticated, service_role;

create function private.avatar_attachable(candidate_owner uuid, candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(candidate_path ~ ('^' || candidate_owner::text || '/avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
    and exists (
      select 1 from storage.objects o cross join private.avatar_validation v
      where v.singleton and o.bucket_id = 'avatars' and o.name = candidate_path
        and o.created_at >= v.validated_since
        and o.metadata->>'mimetype' = 'image/jpeg'
        and (o.owner_id = candidate_owner::text or private.usage_object_owned(o.bucket_id, o.name, candidate_owner))
    ), false);
$$;
revoke all on function private.avatar_attachable(uuid, text) from public, anon, authenticated;

-- attach_avatar: unchanged except that a new path must be attachable (it previously did not check that the object existed at all)
create or replace function private.attach_avatar_impl(candidate_path text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if candidate_path !~ ('^' || caller::text || '/[a-zA-Z0-9._-]+$') then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_PATH';
  end if;
  if not private.avatar_attachable(caller, candidate_path) and not exists (
    select 1 from public.entities e where e.created_by_user_id = caller and e.entity_type = 'SOLO' and e.avatar_media_reference = candidate_path
  ) then raise exception using errcode = '22023', message = 'INVALID_AVATAR_PATH'; end if;
  update public.entities set avatar_media_reference = candidate_path, updated_at = now()
    where created_by_user_id = caller and entity_type = 'SOLO';
  if not found then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;
  return candidate_path;
end;
$function$;

-- update_my_identity_profile: the live definition, with only its Avatar check replaced
create or replace function private.update_my_identity_profile_impl(candidate_display_name text, candidate_bio text, candidate_avatar_path text DEFAULT NULL::text, candidate_role_keys text[] DEFAULT ARRAY[]::text[], candidate_primary_role_key text DEFAULT NULL::text, candidate_education_work_status text DEFAULT NULL::text, candidate_institution text DEFAULT NULL::text, candidate_field_of_study text DEFAULT NULL::text)
 RETURNS TABLE(entity_id uuid, gamid_handle text, display_name text, avatar_media_reference text, visibility entity_visibility, profile_id uuid, profile_status profile_status, bio text, role_keys text[], primary_role_key text, education_work_status text, institution text, field_of_study text, role_catalog jsonb, education_work_catalog jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid()); owned_entity_id uuid; owned_profile_id uuid;
  normalized_roles text[] := coalesce(candidate_role_keys, array[]::text[]);
  normalized_education text := nullif(trim(candidate_education_work_status), '');
  normalized_institution text := nullif(trim(candidate_institution), '');
  normalized_field text := nullif(trim(candidate_field_of_study), '');
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if char_length(trim(candidate_display_name)) not between 1 and 60 then raise exception using errcode = '22023', message = 'INVALID_DISPLAY_NAME'; end if;
  if candidate_bio is null or char_length(candidate_bio) > 160 then raise exception using errcode = '22023', message = 'BIO_TOO_LONG'; end if;
  if cardinality(normalized_roles) <> (select count(distinct role_key) from unnest(normalized_roles) role_key) then raise exception using errcode = '22023', message = 'DUPLICATE_GAMING_ROLE'; end if;
  if cardinality(normalized_roles) = 0 and candidate_primary_role_key is not null then raise exception using errcode = '22023', message = 'PRIMARY_ROLE_WITHOUT_ROLES'; end if;
  if cardinality(normalized_roles) > 0 and (candidate_primary_role_key is null or not (candidate_primary_role_key = any(normalized_roles))) then raise exception using errcode = '22023', message = 'INVALID_PRIMARY_ROLE'; end if;
  if exists (select 1 from unnest(normalized_roles) selected(role_key) left join public.gaming_role_catalog c on c.role_key = selected.role_key and c.active where c.role_key is null) then raise exception using errcode = '22023', message = 'INVALID_GAMING_ROLE'; end if;
  if normalized_education is not null and not exists (select 1 from public.education_work_status_catalog c where c.status_key = normalized_education and c.active) then raise exception using errcode = '22023', message = 'INVALID_EDUCATION_WORK_STATUS'; end if;
  if char_length(coalesce(normalized_institution, '')) > 120 then raise exception using errcode = '22023', message = 'INSTITUTION_TOO_LONG'; end if;
  if char_length(coalesce(normalized_field, '')) > 120 then raise exception using errcode = '22023', message = 'FIELD_OF_STUDY_TOO_LONG'; end if;

  select e.entity_id, p.profile_id into owned_entity_id, owned_profile_id
  from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id
  join public.profiles p on p.entity_id = e.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO' limit 1;
  if owned_profile_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;
  -- ISS-0007: a NEW Avatar must be a gateway-validated JPEG (private.avatar_attachable); the Avatar the GamID already shows may be kept as it is
  if candidate_avatar_path is not null and candidate_avatar_path is distinct from (select e.avatar_media_reference from public.entities e where e.entity_id = owned_entity_id)
    and not private.avatar_attachable(caller, candidate_avatar_path) then raise exception using errcode = '22023', message = 'INVALID_AVATAR_PATH'; end if;

  update public.entities e set display_name = trim(candidate_display_name), avatar_media_reference = coalesce(candidate_avatar_path, e.avatar_media_reference), updated_at = now() where e.entity_id = owned_entity_id;
  update public.profiles p set bio = candidate_bio, education_work_status = normalized_education, institution = normalized_institution, field_of_study = normalized_field, updated_at = now() where p.profile_id = owned_profile_id;
  delete from public.profile_gaming_roles r where r.profile_id = owned_profile_id;
  insert into public.profile_gaming_roles (profile_id, role_key, is_primary, sort_order)
  select owned_profile_id, selected.role_key, selected.role_key = candidate_primary_role_key, selected.ordinality::smallint
  from unnest(normalized_roles) with ordinality selected(role_key, ordinality);
  return query select * from private.get_my_identity_profile_impl();
end;
$function$;
