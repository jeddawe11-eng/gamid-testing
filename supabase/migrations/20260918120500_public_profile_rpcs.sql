create function private.set_my_identity_visibility_impl(candidate_public boolean)
returns table (entity_id uuid, visibility public.entity_visibility)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
  target_visibility public.entity_visibility := case when candidate_public then 'PUBLIC' else 'PRIVATE' end;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  update public.entities set visibility = target_visibility, updated_at = now()
  where entities.entity_id = owned_entity_id;

  return query select owned_entity_id, target_visibility;
end;
$$;

create function public.set_my_identity_visibility(candidate_public boolean)
returns table (entity_id uuid, visibility public.entity_visibility)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.set_my_identity_visibility_impl(candidate_public); $$;

create function private.get_public_identity_impl(candidate_handle text)
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
  field_of_study text
)
language sql stable security definer
set search_path = ''
as $$
  select e.gamid_handle, e.display_name, e.avatar_media_reference, p.bio,
    coalesce((select array_agg(r.role_key order by r.sort_order) from public.profile_gaming_roles r where r.profile_id = p.profile_id), array[]::text[]),
    (select r.role_key from public.profile_gaming_roles r where r.profile_id = p.profile_id and r.is_primary),
    (select jsonb_agg(jsonb_build_object('key', c.role_key, 'label', c.label) order by c.sort_order) from public.gaming_role_catalog c where c.active),
    p.education_work_status, p.institution, p.field_of_study
  from public.entities e
  join public.profiles p on p.entity_id = e.entity_id
  where e.gamid_handle = private.normalize_handle(candidate_handle)
    and e.entity_type = 'SOLO'
    and e.visibility = 'PUBLIC'
  limit 1;
$$;

create function public.get_public_identity(candidate_handle text)
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
  field_of_study text
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_public_identity_impl(candidate_handle); $$;

revoke all on function private.set_my_identity_visibility_impl(boolean) from public, anon, authenticated;
grant execute on function private.set_my_identity_visibility_impl(boolean) to authenticated;
revoke all on function public.set_my_identity_visibility(boolean) from public, anon;
grant execute on function public.set_my_identity_visibility(boolean) to authenticated;

revoke all on function private.get_public_identity_impl(text) from public, anon, authenticated;
grant execute on function private.get_public_identity_impl(text) to anon, authenticated;
revoke all on function public.get_public_identity(text) from public;
grant execute on function public.get_public_identity(text) to anon, authenticated;
