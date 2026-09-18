create function private.get_public_identity_by_qr_impl(candidate_token text)
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
  education_work_catalog jsonb,
  intro_transition_key text,
  intro_derivative_path text
)
language sql stable security definer
set search_path = ''
as $$
  select * from private.get_public_identity_impl(
    (select e.gamid_handle
     from public.qr_references q
     join public.entities e on e.entity_id = q.entity_id
     where q.public_token = candidate_token
     limit 1)
  );
$$;

create function public.get_public_identity_by_qr(candidate_token text)
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
  education_work_catalog jsonb,
  intro_transition_key text,
  intro_derivative_path text
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_public_identity_by_qr_impl(candidate_token); $$;

revoke all on function private.get_public_identity_by_qr_impl(text) from public, anon, authenticated;
grant execute on function private.get_public_identity_by_qr_impl(text) to anon, authenticated;
revoke all on function public.get_public_identity_by_qr(text) from public;
grant execute on function public.get_public_identity_by_qr(text) to anon, authenticated;
