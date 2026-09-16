create table public.gaming_role_catalog (
  role_key text primary key check (role_key ~ '^[a-z][a-z0-9_]*$'),
  label text not null unique check (char_length(label) between 1 and 40),
  sort_order smallint not null unique check (sort_order > 0),
  active boolean not null default true
);

insert into public.gaming_role_catalog (role_key, label, sort_order) values
  ('gamer', 'Gamer', 10), ('streamer', 'Streamer', 20),
  ('content_creator', 'Content Creator', 30), ('esports_player', 'Esports Player', 40),
  ('coach', 'Coach', 50), ('designer', 'Designer', 60),
  ('developer', 'Developer', 70), ('tournament_organizer', 'Tournament Organizer', 80),
  ('team_manager', 'Team Manager', 90), ('community_manager', 'Community Manager', 100),
  ('video_editor', 'Video Editor', 110), ('photographer', 'Photographer', 120);

create table public.education_work_status_catalog (
  status_key text primary key check (status_key ~ '^[a-z][a-z0-9_]*$'),
  label text not null unique check (char_length(label) between 1 and 40),
  sort_order smallint not null unique check (sort_order > 0),
  active boolean not null default true
);

insert into public.education_work_status_catalog (status_key, label, sort_order) values
  ('student', 'Student', 10), ('university_student', 'University Student', 20),
  ('freelancer', 'Freelancer', 30), ('professional', 'Professional', 40),
  ('self_employed', 'Self-employed', 50);

alter table public.profiles
  add column education_work_status text references public.education_work_status_catalog(status_key),
  add column institution text constraint profiles_institution_length check (char_length(institution) <= 120),
  add column field_of_study text constraint profiles_field_of_study_length check (char_length(field_of_study) <= 120);

create table public.profile_gaming_roles (
  profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  role_key text not null references public.gaming_role_catalog(role_key) on delete restrict,
  is_primary boolean not null default false,
  sort_order smallint not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  primary key (profile_id, role_key), unique (profile_id, sort_order)
);
create unique index profile_gaming_roles_one_primary on public.profile_gaming_roles(profile_id) where is_primary;

alter table public.gaming_role_catalog enable row level security;
alter table public.education_work_status_catalog enable row level security;
alter table public.profile_gaming_roles enable row level security;
create policy "owners read their profile gaming roles" on public.profile_gaming_roles for select to authenticated
using (exists (
  select 1 from public.profiles p join public.entity_memberships m on m.entity_id = p.entity_id
  where p.profile_id = profile_gaming_roles.profile_id and m.user_id = (select auth.uid()) and m.role = 'OWNER'
));

drop function public.update_my_identity_profile(text,text,text);
drop function public.get_my_identity_profile();
drop function private.update_my_identity_profile_impl(text,text,text);
drop function private.get_my_identity_profile_impl();

create function private.get_my_identity_profile_impl()
returns table (
  entity_id uuid, gamid_handle text, display_name text, avatar_media_reference text,
  visibility public.entity_visibility, profile_id uuid, profile_status public.profile_status,
  bio text, role_keys text[], primary_role_key text, education_work_status text,
  institution text, field_of_study text, role_catalog jsonb, education_work_catalog jsonb
)
language sql stable security definer set search_path = '' as $$
  select e.entity_id, e.gamid_handle, e.display_name, e.avatar_media_reference, e.visibility,
    p.profile_id, p.status, p.bio,
    coalesce((select array_agg(r.role_key order by r.sort_order) from public.profile_gaming_roles r where r.profile_id = p.profile_id), array[]::text[]),
    (select r.role_key from public.profile_gaming_roles r where r.profile_id = p.profile_id and r.is_primary),
    p.education_work_status, p.institution, p.field_of_study,
    (select jsonb_agg(jsonb_build_object('key', c.role_key, 'label', c.label) order by c.sort_order) from public.gaming_role_catalog c where c.active),
    (select jsonb_agg(jsonb_build_object('key', c.status_key, 'label', c.label) order by c.sort_order) from public.education_work_status_catalog c where c.active)
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id and e.entity_type = 'SOLO'
  join public.profiles p on p.entity_id = e.entity_id
  where m.user_id = (select auth.uid()) and m.role = 'OWNER' limit 1;
$$;

create function private.update_my_identity_profile_impl(
  candidate_display_name text, candidate_bio text, candidate_avatar_path text default null,
  candidate_role_keys text[] default array[]::text[], candidate_primary_role_key text default null,
  candidate_education_work_status text default null, candidate_institution text default null,
  candidate_field_of_study text default null
)
returns table (
  entity_id uuid, gamid_handle text, display_name text, avatar_media_reference text,
  visibility public.entity_visibility, profile_id uuid, profile_status public.profile_status,
  bio text, role_keys text[], primary_role_key text, education_work_status text,
  institution text, field_of_study text, role_catalog jsonb, education_work_catalog jsonb
)
language plpgsql volatile security definer set search_path = '' as $$
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
  if candidate_avatar_path is not null and (candidate_avatar_path !~ ('^' || caller::text || '/[a-zA-Z0-9._-]+$') or not exists (
    select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = candidate_avatar_path and o.owner_id = caller::text
  )) then raise exception using errcode = '22023', message = 'INVALID_AVATAR_PATH'; end if;

  update public.entities e set display_name = trim(candidate_display_name), avatar_media_reference = coalesce(candidate_avatar_path, e.avatar_media_reference), updated_at = now() where e.entity_id = owned_entity_id;
  update public.profiles p set bio = candidate_bio, education_work_status = normalized_education, institution = normalized_institution, field_of_study = normalized_field, updated_at = now() where p.profile_id = owned_profile_id;
  delete from public.profile_gaming_roles r where r.profile_id = owned_profile_id;
  insert into public.profile_gaming_roles (profile_id, role_key, is_primary, sort_order)
  select owned_profile_id, selected.role_key, selected.role_key = candidate_primary_role_key, selected.ordinality::smallint
  from unnest(normalized_roles) with ordinality selected(role_key, ordinality);
  return query select * from private.get_my_identity_profile_impl();
end;
$$;

create function public.get_my_identity_profile()
returns table (
  entity_id uuid, gamid_handle text, display_name text, avatar_media_reference text,
  visibility public.entity_visibility, profile_id uuid, profile_status public.profile_status,
  bio text, role_keys text[], primary_role_key text, education_work_status text,
  institution text, field_of_study text, role_catalog jsonb, education_work_catalog jsonb
)
language sql stable security invoker set search_path = '' as $$ select * from private.get_my_identity_profile_impl(); $$;

create function public.update_my_identity_profile(
  candidate_display_name text, candidate_bio text, candidate_avatar_path text default null,
  candidate_role_keys text[] default array[]::text[], candidate_primary_role_key text default null,
  candidate_education_work_status text default null, candidate_institution text default null,
  candidate_field_of_study text default null
)
returns table (
  entity_id uuid, gamid_handle text, display_name text, avatar_media_reference text,
  visibility public.entity_visibility, profile_id uuid, profile_status public.profile_status,
  bio text, role_keys text[], primary_role_key text, education_work_status text,
  institution text, field_of_study text, role_catalog jsonb, education_work_catalog jsonb
)
language sql volatile security invoker set search_path = '' as $$
  select * from private.update_my_identity_profile_impl(candidate_display_name, candidate_bio, candidate_avatar_path, candidate_role_keys, candidate_primary_role_key, candidate_education_work_status, candidate_institution, candidate_field_of_study);
$$;

revoke all on table public.gaming_role_catalog, public.education_work_status_catalog, public.profile_gaming_roles from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated;
revoke all on function private.get_my_identity_profile_impl() from public, anon, authenticated;
revoke all on function private.update_my_identity_profile_impl(text,text,text,text[],text,text,text,text) from public, anon, authenticated;
grant execute on function private.get_my_identity_profile_impl() to authenticated;
grant execute on function private.update_my_identity_profile_impl(text,text,text,text[],text,text,text,text) to authenticated;
revoke all on function public.get_my_identity_profile() from public, anon;
grant execute on function public.get_my_identity_profile() to authenticated;
revoke all on function public.update_my_identity_profile(text,text,text,text[],text,text,text,text) from public, anon;
grant execute on function public.update_my_identity_profile(text,text,text,text[],text,text,text,text) to authenticated;
