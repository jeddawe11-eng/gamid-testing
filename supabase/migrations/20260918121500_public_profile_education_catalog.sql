drop function public.get_public_identity(text);
drop function private.get_public_identity_impl(text);

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
  field_of_study text,
  education_work_catalog jsonb
)
language sql stable security definer
set search_path = ''
as $$
  select e.gamid_handle, e.display_name, e.avatar_media_reference, p.bio,
    coalesce((select array_agg(r.role_key order by r.sort_order) from public.profile_gaming_roles r where r.profile_id = p.profile_id), array[]::text[]),
    (select r.role_key from public.profile_gaming_roles r where r.profile_id = p.profile_id and r.is_primary),
    (select jsonb_agg(jsonb_build_object('key', c.role_key, 'label', c.label) order by c.sort_order) from public.gaming_role_catalog c where c.active),
    p.education_work_status, p.institution, p.field_of_study,
    (select jsonb_agg(jsonb_build_object('key', c.status_key, 'label', c.label) order by c.sort_order) from public.education_work_status_catalog c where c.active)
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
  field_of_study text,
  education_work_catalog jsonb
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_public_identity_impl(candidate_handle); $$;

revoke all on function private.get_public_identity_impl(text) from public, anon, authenticated;
grant execute on function private.get_public_identity_impl(text) to anon, authenticated;
revoke all on function public.get_public_identity(text) from public;
grant execute on function public.get_public_identity(text) to anon, authenticated;
