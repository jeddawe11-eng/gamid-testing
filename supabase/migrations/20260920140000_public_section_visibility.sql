-- Public Profile Expansion — Phase 1: per-section public visibility ("Show on my GamID") + a public-safe data boundary.
--
-- Two independent levels of visibility:
--   A) WHOLE GAMID: the existing Publish / Unpublish (entities.visibility = 'PUBLIC') stays the top-level gate. Nothing below is
--      ever reachable unless the GamID is published.
--   B) SECTION: each optional section has its own switch, OFF by default:
--        discord         -> gaming_connections.is_public   (existing column, per connection row)
--        league          -> league_profiles.is_public      (existing column, per profile row)
--        education_work  -> profiles.show_education_work   (new column)
--
-- The switch lives on the ROW it controls, so removing/disconnecting a section deletes its switch with it: reconnecting or
-- re-adding can never inherit an old "ON". Flipping a switch changes only that one flag: it never disconnects, deletes,
-- refreshes, looks up, or touches any throttle/reservation state.
--
-- The anonymous boundary is extended, not duplicated: get_public_identity / get_public_identity_by_qr (which share one
-- implementation) gain one column, public_sections, containing ONLY the visible sections and ONLY their approved presentation
-- fields. Hidden sections are omitted entirely (no "visible=false" objects). The Education/Work columns already in the response
-- return NULL when that section is hidden.

-- ---------------------------------------------------------------------------------------------
-- Section registry (small, extensible: a future game adds a row here + its own presenter below)
-- ---------------------------------------------------------------------------------------------
create table public.public_section_catalog (
  section_key text primary key check (section_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  label text not null unique check (char_length(label) between 1 and 60),
  section_kind text not null check (section_kind in ('CONNECTION', 'GAME', 'PROFILE')),
  sort_order smallint not null default 100,
  active boolean not null default true
);

insert into public.public_section_catalog (section_key, label, section_kind, sort_order) values
  ('discord', 'Discord', 'CONNECTION', 10),
  ('league', 'League of Legends', 'GAME', 20),
  ('education_work', 'Education & Work', 'PROFILE', 30);

alter table public.public_section_catalog enable row level security;
revoke all on table public.public_section_catalog from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Education & Work switch. Education/Work is ALREADY public today for every published GamID (there was no control), so profiles
-- that already hold Education/Work data keep exactly that behavior (grandfathered ON) until their owner turns it off; every
-- other profile, and every profile created from now on, starts OFF. No Education/Work data is changed.
-- ---------------------------------------------------------------------------------------------
alter table public.profiles add column show_education_work boolean not null default false;

update public.profiles p
set show_education_work = true
where p.education_work_status is not null
   or nullif(btrim(coalesce(p.institution, '')), '') is not null
   or nullif(btrim(coalesce(p.field_of_study, '')), '') is not null;

-- ---------------------------------------------------------------------------------------------
-- Owner-facing (authenticated) RPCs
-- ---------------------------------------------------------------------------------------------
create function private.get_my_section_visibility_impl()
returns table (section_key text, label text, is_set_up boolean, is_public boolean)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  return query
  select c.section_key, c.label,
    case c.section_key
      when 'discord' then exists (select 1 from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = 'discord')
      when 'league' then exists (select 1 from public.league_profiles l where l.entity_id = owned_entity_id)
      when 'education_work' then exists (
        select 1 from public.profiles p
        where p.entity_id = owned_entity_id
          and (p.education_work_status is not null or nullif(btrim(coalesce(p.institution, '')), '') is not null or nullif(btrim(coalesce(p.field_of_study, '')), '') is not null))
      else false
    end,
    case c.section_key
      when 'discord' then coalesce((select g.is_public from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = 'discord'), false)
      when 'league' then coalesce((select l.is_public from public.league_profiles l where l.entity_id = owned_entity_id), false)
      when 'education_work' then coalesce((select p.show_education_work from public.profiles p where p.entity_id = owned_entity_id), false)
      else false
    end
  from public.public_section_catalog c
  where c.active
  order by c.sort_order, c.section_key;
end;
$$;

-- Flips ONE section's public switch for the caller's own GamID. It only ever updates that flag: it does not disconnect, delete,
-- refresh, look anything up, or touch any timestamp, throttle ledger or reservation.
create function private.set_my_section_visibility_impl(candidate_section text, candidate_visible boolean)
returns table (section_key text, is_public boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  key text := lower(btrim(candidate_section));
  owned_entity_id uuid;
  changed integer;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if candidate_visible is null then raise exception using errcode = '22023', message = 'INVALID_VISIBILITY'; end if;
  if key is null or not exists (select 1 from public.public_section_catalog c where c.section_key = key and c.active) then
    raise exception using errcode = '22023', message = 'INVALID_SECTION';
  end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  if key = 'discord' then
    update public.gaming_connections g set is_public = candidate_visible where g.entity_id = owned_entity_id and g.provider_key = 'discord';
    get diagnostics changed = row_count;
    if changed = 0 then raise exception using errcode = 'P0002', message = 'SECTION_NOT_SET_UP'; end if;
  elsif key = 'league' then
    update public.league_profiles l set is_public = candidate_visible where l.entity_id = owned_entity_id;
    get diagnostics changed = row_count;
    if changed = 0 then raise exception using errcode = 'P0002', message = 'SECTION_NOT_SET_UP'; end if;
  elsif key = 'education_work' then
    update public.profiles p set show_education_work = candidate_visible where p.entity_id = owned_entity_id;
    get diagnostics changed = row_count;
    if changed = 0 then raise exception using errcode = 'P0002', message = 'SECTION_NOT_SET_UP'; end if;
  else
    raise exception using errcode = '22023', message = 'INVALID_SECTION';
  end if;

  return query select key, candidate_visible;
end;
$$;

create function public.get_my_section_visibility()
returns table (section_key text, label text, is_set_up boolean, is_public boolean)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_section_visibility_impl(); $$;

create function public.set_my_section_visibility(candidate_section text, candidate_visible boolean)
returns table (section_key text, is_public boolean)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.set_my_section_visibility_impl(candidate_section, candidate_visible); $$;

revoke all on function
  private.get_my_section_visibility_impl(), private.set_my_section_visibility_impl(text, boolean),
  public.get_my_section_visibility(), public.set_my_section_visibility(text, boolean)
from public, anon, authenticated;
grant execute on function
  private.get_my_section_visibility_impl(), private.set_my_section_visibility_impl(text, boolean),
  public.get_my_section_visibility(), public.set_my_section_visibility(text, boolean)
to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The anonymous public-safe boundary: same functions, one added column, sections gated by their switch.
-- ---------------------------------------------------------------------------------------------
drop function public.get_public_identity_by_qr(text);
drop function private.get_public_identity_by_qr_impl(text);
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
  education_work_catalog jsonb,
  intro_transition_key text,
  intro_derivative_path text,
  public_sections jsonb
)
language sql stable security definer
set search_path = ''
as $$
  select e.gamid_handle, e.display_name, e.avatar_media_reference, p.bio,
    coalesce((select array_agg(r.role_key order by r.sort_order) from public.profile_gaming_roles r where r.profile_id = p.profile_id), array[]::text[]),
    (select r.role_key from public.profile_gaming_roles r where r.profile_id = p.profile_id and r.is_primary),
    (select jsonb_agg(jsonb_build_object('key', c.role_key, 'label', c.label) order by c.sort_order) from public.gaming_role_catalog c where c.active),
    -- Education & Work: returned only while its switch is ON, otherwise NULL (the values never leave the database)
    case when p.show_education_work then p.education_work_status end,
    case when p.show_education_work then p.institution end,
    case when p.show_education_work then p.field_of_study end,
    case when p.show_education_work then (select jsonb_agg(jsonb_build_object('key', c.status_key, 'label', c.label) order by c.sort_order) from public.education_work_status_catalog c where c.active) end,
    coalesce(s.transition_key, 'fade'),
    active.derivative_path,
    -- Optional sections: ONLY those whose switch is ON appear, and only the approved presentation fields.
    (
      select coalesce(jsonb_object_agg(x.section_key, x.payload), '{}'::jsonb)
      from (
        -- Discord: display name, username, trust label. NOT exposed: the Discord account id (and the avatar URL, which embeds it),
        -- tokens, timestamps, connection ids, diagnostics/discovery.
        select 'discord'::text as section_key,
          jsonb_strip_nulls(jsonb_build_object(
            'display_name', g.provider_display_name, 'username', g.provider_username, 'trust_status', g.trust_status)) as payload
        from public.gaming_connections g
        where g.entity_id = e.entity_id and g.provider_key = 'discord' and g.is_public
        union all
        -- League: Riot ID, region, Solo/Duo rank, icon id, and the truth about where it came from (manual / unverified source)
        -- with freshness. NOT exposed: source URL, lookup state/errors, throttle ledger, reservations, internal ids.
        select 'league'::text,
          jsonb_strip_nulls(jsonb_build_object(
            'game_name', l.game_name, 'tag_line', l.tag_line, 'platform_id', l.platform_id,
            'rank_state', l.solo_rank_state, 'tier', l.solo_tier, 'division', l.solo_division, 'lp', l.solo_lp,
            'wins', l.solo_wins, 'losses', l.solo_losses, 'profile_icon_id', l.profile_icon_id,
            'trust_status', l.trust_status, 'identity_source', l.identity_source, 'data_source', l.data_source,
            'updated_at', l.fetched_at))
        from public.league_profiles l
        where l.entity_id = e.entity_id and l.is_public
      ) x
    )
  from public.entities e
  join public.profiles p on p.entity_id = e.entity_id
  left join public.profile_intro_settings s on s.profile_id = p.profile_id
  left join public.intro_processing_jobs active on active.job_id = s.active_job_id and active.state = 'ready'
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
  education_work_catalog jsonb,
  intro_transition_key text,
  intro_derivative_path text,
  public_sections jsonb
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_public_identity_impl(candidate_handle); $$;

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
  intro_derivative_path text,
  public_sections jsonb
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
  intro_derivative_path text,
  public_sections jsonb
)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_public_identity_by_qr_impl(candidate_token); $$;

-- grants identical to the previous definitions
revoke all on function private.get_public_identity_impl(text) from public, anon, authenticated;
grant execute on function private.get_public_identity_impl(text) to anon, authenticated;
revoke all on function public.get_public_identity(text) from public;
grant execute on function public.get_public_identity(text) to anon, authenticated;
revoke all on function private.get_public_identity_by_qr_impl(text) from public, anon, authenticated;
grant execute on function private.get_public_identity_by_qr_impl(text) to anon, authenticated;
revoke all on function public.get_public_identity_by_qr(text) from public;
grant execute on function public.get_public_identity_by_qr(text) to anon, authenticated;
