revoke all on function public.check_handle_availability(text) from anon, authenticated;
revoke all on function public.create_solo_identity(text,text,date,text) from authenticated;
revoke all on function public.get_my_gamid() from authenticated;
revoke all on function public.update_preferred_language(text) from authenticated;
revoke all on function public.attach_avatar(text) from authenticated;

alter function public.check_handle_availability(text) set schema private;
alter function private.check_handle_availability(text) rename to check_handle_availability_impl;
alter function public.create_solo_identity(text,text,date,text) set schema private;
alter function private.create_solo_identity(text,text,date,text) rename to create_solo_identity_impl;
alter function public.get_my_gamid() set schema private;
alter function private.get_my_gamid() rename to get_my_gamid_impl;
alter function public.update_preferred_language(text) set schema private;
alter function private.update_preferred_language(text) rename to update_preferred_language_impl;
alter function public.attach_avatar(text) set schema private;
alter function private.attach_avatar(text) rename to attach_avatar_impl;

create function public.check_handle_availability(candidate text)
returns table (normalized_handle text, available boolean, reason text)
language sql stable security invoker
set search_path = ''
as $$ select * from private.check_handle_availability_impl(candidate); $$;

create function public.create_solo_identity(
  candidate_handle text,
  candidate_display_name text,
  candidate_date_of_birth date,
  candidate_language text default 'en'
)
returns table (entity_id uuid, gamid_handle text, profile_id uuid, qr_public_token text)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.create_solo_identity_impl(candidate_handle, candidate_display_name, candidate_date_of_birth, candidate_language); $$;

create function public.get_my_gamid()
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
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_gamid_impl(); $$;

create function public.update_preferred_language(candidate_language text)
returns text language sql volatile security invoker
set search_path = ''
as $$ select private.update_preferred_language_impl(candidate_language); $$;

create function public.attach_avatar(candidate_path text)
returns text language sql volatile security invoker
set search_path = ''
as $$ select private.attach_avatar_impl(candidate_path); $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.check_handle_availability_impl(text) to anon, authenticated;
grant execute on function private.create_solo_identity_impl(text,text,date,text) to authenticated;
grant execute on function private.get_my_gamid_impl() to authenticated;
grant execute on function private.update_preferred_language_impl(text) to authenticated;
grant execute on function private.attach_avatar_impl(text) to authenticated;

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

