-- Gaming Roles in eight categories + Suggest a Role (admin review), four Favorite Games, Crew header game artwork (Mazen 2026-10-11) - GamID TESTING only.
-- Additive: every existing role key and stored selection is kept (the 12 original keys keep their identifiers; some get their approved full names).

-- ---------------------------------------------------------------------------------------------
-- 1. Categories and the one role catalog
-- ---------------------------------------------------------------------------------------------
create table public.gaming_role_categories (
  category_key text primary key check (category_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null unique check (char_length(label) between 2 and 60),
  description text check (description is null or char_length(description) <= 160),
  sort_order smallint not null unique check (sort_order > 0)
);
alter table public.gaming_role_categories enable row level security;
revoke all on table public.gaming_role_categories from public, anon, authenticated;
insert into public.gaming_role_categories (category_key, label, description, sort_order) values
  ('gaming_competitive', 'Gaming & Competitive', 'Players, competitors and coaches', 1),
  ('streaming_content', 'Streaming & Content Creation', 'Streamers, creators and gaming media', 2),
  ('game_development', 'Game Development', 'People who build games', 3),
  ('art_design_animation', 'Art, Design & Animation', 'Artists, designers and animators', 4),
  ('audio_video_production', 'Audio & Video Production', 'Editing, sound, music and broadcast', 5),
  ('esports_team_management', 'Esports & Team Management', 'Teams, tournaments and broadcasts', 6),
  ('community_marketing', 'Community & Marketing', 'Communities, social media and brands', 7),
  ('business_technology', 'Gaming Business & Technology', 'Studios, products, platforms and data', 8);

alter table public.gaming_role_catalog add column category_key text references public.gaming_role_categories(category_key) on delete restrict;
update public.gaming_role_catalog set sort_order = sort_order + 20000;   -- free the final sort positions (sort_order is unique)
insert into public.gaming_role_catalog (role_key, label, sort_order, category_key)
select v.role_key, v.label, v.sort_order, v.category_key from (values
  ('gamer', 'Gamer', 101, 'gaming_competitive'), ('casual_gamer', 'Casual Gamer', 102, 'gaming_competitive'), ('competitive_gamer', 'Competitive Gamer', 103, 'gaming_competitive'),
  ('esports_player', 'Esports Player', 104, 'gaming_competitive'), ('pro_player', 'Pro Player', 105, 'gaming_competitive'), ('team_captain', 'Team Captain', 106, 'gaming_competitive'),
  ('coach', 'Gaming Coach', 107, 'gaming_competitive'), ('esports_analyst', 'Esports Analyst', 108, 'gaming_competitive'),
  ('streamer', 'Streamer', 201, 'streaming_content'), ('vtuber', 'VTuber', 202, 'streaming_content'), ('content_creator', 'Gaming Content Creator', 203, 'streaming_content'),
  ('gaming_youtuber', 'Gaming YouTuber', 204, 'streaming_content'), ('gaming_tiktoker', 'Gaming TikToker', 205, 'streaming_content'), ('gaming_influencer', 'Gaming Influencer', 206, 'streaming_content'),
  ('gaming_podcaster', 'Gaming Podcaster', 207, 'streaming_content'), ('gaming_journalist', 'Gaming Journalist', 208, 'streaming_content'), ('game_reviewer', 'Game Reviewer', 209, 'streaming_content'),
  ('developer', 'Game Developer', 301, 'game_development'), ('game_programmer', 'Game Programmer', 302, 'game_development'), ('gameplay_programmer', 'Gameplay Programmer', 303, 'game_development'),
  ('designer', 'Game Designer', 304, 'game_development'), ('level_designer', 'Level Designer', 305, 'game_development'), ('narrative_designer', 'Narrative Designer', 306, 'game_development'),
  ('technical_artist', 'Technical Artist', 307, 'game_development'), ('game_producer', 'Game Producer', 308, 'game_development'), ('qa_game_tester', 'QA Game Tester', 309, 'game_development'),
  ('game_artist', 'Game Artist', 401, 'art_design_animation'), ('concept_artist', 'Concept Artist', 402, 'art_design_animation'), ('character_designer', 'Character Designer', 403, 'art_design_animation'),
  ('environment_artist', 'Environment Artist', 404, 'art_design_animation'), ('artist_3d', '3D Artist', 405, 'art_design_animation'), ('artist_2d', '2D Artist', 406, 'art_design_animation'),
  ('animator', 'Animator', 407, 'art_design_animation'), ('ui_ux_game_designer', 'UI/UX Game Designer', 408, 'art_design_animation'), ('vfx_artist', 'VFX Artist', 409, 'art_design_animation'),
  ('video_editor', 'Gaming Video Editor', 501, 'audio_video_production'), ('photographer', 'Gaming Photographer', 502, 'audio_video_production'), ('gaming_videographer', 'Gaming Videographer', 503, 'audio_video_production'),
  ('motion_designer', 'Motion Designer', 504, 'audio_video_production'), ('sound_designer', 'Sound Designer', 505, 'audio_video_production'), ('game_music_composer', 'Game Music Composer', 506, 'audio_video_production'),
  ('voice_actor', 'Voice Actor', 507, 'audio_video_production'), ('broadcast_producer', 'Broadcast Producer', 508, 'audio_video_production'), ('stream_technician', 'Stream Technician', 509, 'audio_video_production'),
  ('team_manager', 'Esports Team Manager', 601, 'esports_team_management'), ('esports_coach', 'Esports Coach', 602, 'esports_team_management'), ('esports_scout', 'Esports Scout', 603, 'esports_team_management'),
  ('esports_org_owner', 'Esports Organization Owner', 604, 'esports_team_management'), ('tournament_organizer', 'Tournament Organizer', 605, 'esports_team_management'), ('tournament_admin', 'Tournament Admin', 606, 'esports_team_management'),
  ('esports_referee', 'Esports Referee', 607, 'esports_team_management'), ('esports_caster', 'Esports Caster', 608, 'esports_team_management'), ('esports_host', 'Esports Host', 609, 'esports_team_management'),
  ('esports_observer', 'Esports Observer', 610, 'esports_team_management'),
  ('community_manager', 'Gaming Community Manager', 701, 'community_marketing'), ('discord_community_manager', 'Discord Community Manager', 702, 'community_marketing'), ('gaming_moderator', 'Gaming Moderator', 703, 'community_marketing'),
  ('gaming_social_media_manager', 'Gaming Social Media Manager', 704, 'community_marketing'), ('gaming_marketing_specialist', 'Gaming Marketing Specialist', 705, 'community_marketing'), ('gaming_brand_manager', 'Gaming Brand Manager', 706, 'community_marketing'),
  ('esports_partnerships_manager', 'Esports Partnerships Manager', 707, 'community_marketing'), ('gaming_pr_specialist', 'Gaming PR Specialist', 708, 'community_marketing'),
  ('game_studio_founder', 'Game Studio Founder', 801, 'business_technology'), ('gaming_entrepreneur', 'Gaming Entrepreneur', 802, 'business_technology'), ('gaming_project_manager', 'Gaming Project Manager', 803, 'business_technology'),
  ('gaming_product_manager', 'Gaming Product Manager', 804, 'business_technology'), ('gaming_platform_developer', 'Gaming Platform Developer', 805, 'business_technology'), ('game_server_admin', 'Game Server Administrator', 806, 'business_technology'),
  ('gaming_data_analyst', 'Gaming Data Analyst', 807, 'business_technology'), ('anti_cheat_developer', 'Anti-Cheat Developer', 808, 'business_technology'), ('gaming_hardware_reviewer', 'Gaming Hardware Reviewer', 809, 'business_technology')
) v(role_key, label, sort_order, category_key)
on conflict (role_key) do update set label = excluded.label, sort_order = excluded.sort_order, category_key = excluded.category_key, active = true;

-- the categorized catalog for the editor (anyone may read the catalog; it holds no user data)
create function public.get_gaming_role_categories()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', c.category_key, 'label', c.label, 'description', c.description,
      'roles', coalesce((select jsonb_agg(jsonb_build_object('key', r.role_key, 'label', r.label) order by r.sort_order) from public.gaming_role_catalog r where r.category_key = c.category_key and r.active), '[]'::jsonb))
    order by c.sort_order), '[]'::jsonb)
  from public.gaming_role_categories c;
$$;
revoke all on function public.get_gaming_role_categories() from public, anon, authenticated, service_role;
grant execute on function public.get_gaming_role_categories() to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Suggest a Role + administrator review
-- ---------------------------------------------------------------------------------------------
create table private.gamid_admins (user_id uuid primary key, added_at timestamptz not null default now());
revoke all on table private.gamid_admins from public, anon, authenticated, service_role;
-- the GamID owner's account (@black) is the TESTING administrator
insert into private.gamid_admins (user_id)
select m.user_id from public.entities e join public.entity_memberships m on m.entity_id = e.entity_id and m.role = 'OWNER' where e.gamid_handle = 'black' and e.entity_type = 'SOLO'
on conflict do nothing;

create function private.is_gamid_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.gamid_admins a where a.user_id = (select auth.uid()));
$$;

create table public.gaming_role_suggestions (
  suggestion_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  proposed_name text not null check (char_length(proposed_name) between 3 and 40),
  normalized_name text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz, reviewed_by uuid,
  category_key text references public.gaming_role_categories(category_key),
  approved_role_key text references public.gaming_role_catalog(role_key)
);
create index gaming_role_suggestions_status_idx on public.gaming_role_suggestions (status, created_at);
create index gaming_role_suggestions_user_idx on public.gaming_role_suggestions (user_id, created_at);
alter table public.gaming_role_suggestions enable row level security;
revoke all on table public.gaming_role_suggestions from public, anon, authenticated;   -- only through the functions below

-- a role name -> its comparable core ("gaming"/"game"/"esports" prefixes and a plural s removed, letters and digits only): "Gaming Coaches" ~ "Coach"
create function private.role_name_core(candidate text) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(regexp_replace(lower(coalesce(candidate, '')), '[^[:alnum:]]+', '', 'g'), '^(gaming|game|esports|esport)', ''), '(es|s)$', '');
$$;
create function private.role_name_taken(candidate text) returns text language sql stable security definer set search_path = '' as $$
  select r.label from public.gaming_role_catalog r
  where regexp_replace(lower(r.label), '[^[:alnum:]]+', '', 'g') = regexp_replace(lower(candidate), '[^[:alnum:]]+', '', 'g')
     or (char_length(private.role_name_core(candidate)) >= 3 and private.role_name_core(r.label) = private.role_name_core(candidate))
  order by r.sort_order limit 1;
$$;
create function private.clean_role_name(candidate text) returns text language plpgsql immutable set search_path = '' as $$
declare v text := btrim(regexp_replace(coalesce(candidate, ''), '\s+', ' ', 'g'));
begin
  if char_length(v) not between 3 and 40 or v ~ '[[:cntrl:]<>{}\[\]\\`@#$%^*=|~]' or v ~* '(://|www\.)' or v !~ '[[:alpha:]]' then
    raise exception using errcode = '22023', message = 'INVALID_ROLE_NAME';
  end if;
  return v;
end;
$$;

insert into public.notification_types (type_key, producer, destination) values
  ('role.suggestion_submitted', 'gaming_roles', 'account.role_suggestions'),
  ('role.suggestion_approved', 'gaming_roles', 'account.gaming_roles'),
  ('role.suggestion_rejected', 'gaming_roles', 'account.gaming_roles')
on conflict (type_key) do nothing;

-- -> { status, suggestion_id } ; refuses a name the catalog already has (exact or near), the same user's repeat, and more than 5 suggestions a day
create function private.suggest_gaming_role_impl(candidate_name text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me record;
  name text := private.clean_role_name(candidate_name);
  core text := private.role_name_core(name);
  taken text := private.role_name_taken(name);
  created uuid;
  admin record;
begin
  select * into me from private.banner_owner();
  if taken is not null then raise exception using errcode = 'PT409', message = 'ROLE_ALREADY_EXISTS', detail = taken; end if;
  if exists (select 1 from public.gaming_role_suggestions s where s.user_id = me.owner_uid and s.normalized_name = core and s.status = 'PENDING') then
    raise exception using errcode = 'PT409', message = 'ROLE_SUGGESTION_DUPLICATE';
  end if;
  if (select count(*) from public.gaming_role_suggestions s where s.user_id = me.owner_uid and s.created_at > now() - interval '24 hours') >= 5 then
    raise exception using errcode = '54000', message = 'ROLE_SUGGESTION_RATE_LIMIT';
  end if;
  insert into public.gaming_role_suggestions (user_id, entity_id, proposed_name, normalized_name) values (me.owner_uid, me.owner_entity_id, name, core) returning suggestion_id into created;
  for admin in select e.entity_id from private.gamid_admins a join public.entity_memberships m on m.user_id = a.user_id and m.role = 'OWNER' join public.entities e on e.entity_id = m.entity_id and e.entity_type = 'SOLO' loop
    perform private.notify(admin.entity_id, me.owner_entity_id, 'role.suggestion_submitted', created, jsonb_build_object('role_name', name));
  end loop;
  return jsonb_build_object('status', 'PENDING', 'suggestion_id', created);
end;
$$;
create function public.suggest_gaming_role(candidate_name text) returns jsonb language sql volatile security invoker set search_path = '' as $$ select private.suggest_gaming_role_impl(candidate_name); $$;

create function private.get_my_role_suggestions_impl() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('suggestion_id', s.suggestion_id, 'proposed_name', s.proposed_name, 'status', s.status, 'created_at', s.created_at,
      'approved_label', (select r.label from public.gaming_role_catalog r where r.role_key = s.approved_role_key)) order by s.created_at desc), '[]'::jsonb)
  from public.gaming_role_suggestions s where s.user_id = (select owner_uid from private.banner_owner()) and s.created_at > now() - interval '90 days';
$$;
create function public.get_my_role_suggestions() returns jsonb language sql stable security invoker set search_path = '' as $$ select private.get_my_role_suggestions_impl(); $$;

create function public.get_my_admin_status() returns boolean language sql stable security invoker set search_path = '' as $$ select private.is_gamid_admin(); $$;

create function private.list_role_suggestions_impl(candidate_status text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_gamid_admin() then raise exception using errcode = '42501', message = 'ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('suggestion_id', s.suggestion_id, 'proposed_name', s.proposed_name, 'status', s.status, 'created_at', s.created_at,
      'submitter_handle', e.gamid_handle, 'category_key', s.category_key, 'approved_role_key', s.approved_role_key,
      'same_name_pending', (select count(*) from public.gaming_role_suggestions o where o.normalized_name = s.normalized_name and o.status = 'PENDING')) order by s.created_at)
    from public.gaming_role_suggestions s join public.entities e on e.entity_id = s.entity_id
    where s.status = coalesce(nullif(candidate_status, ''), 'PENDING')), '[]'::jsonb);
end;
$$;
create function public.list_role_suggestions(candidate_status text) returns jsonb language sql stable security invoker set search_path = '' as $$ select private.list_role_suggestions_impl(candidate_status); $$;

-- APPROVE adds the role to the official catalog in the chosen category (a stable key from its name; never a duplicate) and resolves every pending suggestion
-- of the same name; REJECT closes it. Each submitter is told through GamID Notifications.
create function private.review_role_suggestion_impl(candidate_suggestion uuid, candidate_decision text, candidate_category text, candidate_label text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.gaming_role_suggestions%rowtype;
  admin_entity uuid;
  label text;
  base_key text;
  new_key text;
  n integer := 1;
  decided text := upper(coalesce(candidate_decision, ''));
  r record;
begin
  if not private.is_gamid_admin() then raise exception using errcode = '42501', message = 'ADMIN_ONLY'; end if;
  select * into s from public.gaming_role_suggestions where suggestion_id = candidate_suggestion for update;
  if not found then raise exception using errcode = 'P0002', message = 'ROLE_SUGGESTION_NOT_FOUND'; end if;
  if s.status <> 'PENDING' then raise exception using errcode = 'PT409', message = 'ROLE_SUGGESTION_ALREADY_REVIEWED'; end if;
  select e.entity_id into admin_entity from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id and e.entity_type = 'SOLO' where m.user_id = (select auth.uid()) and m.role = 'OWNER' limit 1;
  if decided = 'REJECT' then
    update public.gaming_role_suggestions set status = 'REJECTED', reviewed_at = now(), reviewed_by = (select auth.uid()) where suggestion_id = s.suggestion_id;
    perform private.notify(s.entity_id, admin_entity, 'role.suggestion_rejected', s.suggestion_id, jsonb_build_object('role_name', s.proposed_name));
    return jsonb_build_object('status', 'REJECTED');
  end if;
  if decided <> 'APPROVE' then raise exception using errcode = '22023', message = 'INVALID_DECISION'; end if;
  if not exists (select 1 from public.gaming_role_categories c where c.category_key = candidate_category) then raise exception using errcode = '22023', message = 'INVALID_ROLE_CATEGORY'; end if;
  label := private.clean_role_name(coalesce(nullif(btrim(candidate_label), ''), s.proposed_name));
  if private.role_name_taken(label) is not null then raise exception using errcode = 'PT409', message = 'ROLE_ALREADY_EXISTS', detail = private.role_name_taken(label); end if;
  base_key := left(trim(both '_' from regexp_replace(lower(label), '[^a-z0-9]+', '_', 'g')), 40);
  if base_key !~ '^[a-z]' then base_key := 'role_' || base_key; end if;
  new_key := base_key;
  while exists (select 1 from public.gaming_role_catalog c where c.role_key = new_key) loop n := n + 1; new_key := base_key || '_' || n; end loop;
  insert into public.gaming_role_catalog (role_key, label, sort_order, category_key)
  values (new_key, label, (select coalesce(max(sort_order), 0) + 1 from public.gaming_role_catalog where sort_order < 20000), candidate_category);
  for r in update public.gaming_role_suggestions set status = 'APPROVED', reviewed_at = now(), reviewed_by = (select auth.uid()), category_key = candidate_category, approved_role_key = new_key
           where status = 'PENDING' and (suggestion_id = s.suggestion_id or normalized_name = s.normalized_name) returning entity_id, suggestion_id, proposed_name loop
    perform private.notify(r.entity_id, admin_entity, 'role.suggestion_approved', r.suggestion_id, jsonb_build_object('role_name', label));
  end loop;
  return jsonb_build_object('status', 'APPROVED', 'role_key', new_key, 'label', label);
end;
$$;
create function public.review_role_suggestion(candidate_suggestion uuid, candidate_decision text, candidate_category text, candidate_label text) returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.review_role_suggestion_impl(candidate_suggestion, candidate_decision, candidate_category, candidate_label); $$;

revoke all on function private.is_gamid_admin(), private.role_name_core(text), private.role_name_taken(text), private.clean_role_name(text),
  private.suggest_gaming_role_impl(text), public.suggest_gaming_role(text), private.get_my_role_suggestions_impl(), public.get_my_role_suggestions(), public.get_my_admin_status(),
  private.list_role_suggestions_impl(text), public.list_role_suggestions(text), private.review_role_suggestion_impl(uuid, text, text, text), public.review_role_suggestion(uuid, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function private.is_gamid_admin(), private.suggest_gaming_role_impl(text), public.suggest_gaming_role(text), private.get_my_role_suggestions_impl(), public.get_my_role_suggestions(),
  public.get_my_admin_status(), private.list_role_suggestions_impl(text), public.list_role_suggestions(text), private.review_role_suggestion_impl(uuid, text, text, text), public.review_role_suggestion(uuid, text, text, text)
to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Favorite Games: four
-- ---------------------------------------------------------------------------------------------
alter table public.profiles drop constraint profiles_favorite_games_check;
alter table public.profiles add constraint profiles_favorite_games_check check (cardinality(favorite_games) <= 4 and array_position(favorite_games, null) is null);
-- (body identical to 20261011180000_favorite_games.sql; the limit is 4)
create or replace function private.set_my_favorite_games_impl(candidate_keys text[])
returns text[] language plpgsql volatile security definer set search_path = '' as $$
declare
  me record;
  keys text[] := coalesce(candidate_keys, '{}');
begin
  select * into me from private.banner_owner();
  if cardinality(keys) > 4 then raise exception using errcode = '22023', message = 'FAVORITE_GAMES_LIMIT'; end if;
  if cardinality(keys) <> (select count(distinct k) from unnest(keys) k) then raise exception using errcode = '22023', message = 'DUPLICATE_FAVORITE_GAME'; end if;
  if exists (select 1 from unnest(keys) k where k is null or k not in (select private.library_game_keys(me.owner_entity_id))) then
    raise exception using errcode = '22023', message = 'FAVORITE_NOT_IN_LIBRARY';
  end if;
  update public.profiles p set favorite_games = keys, updated_at = now() where p.profile_id = me.owner_profile_id;
  return keys;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Crew header game artwork: the game of one Crew whose Crew Wall is PUBLISHED (what its public page already shows)
-- ---------------------------------------------------------------------------------------------
create function public.game_artwork_crew_targets(candidate_crew uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'enabled', (select s.enabled from private.game_artwork_settings s where s.singleton),
    'games', coalesce((select jsonb_agg(jsonb_build_object('game_key', g.game_key, 'name', g.display_name, 'year', g.release_year, 'purposes', jsonb_build_array('crews'),
        'steam_appid', (select min(p.external_id::bigint) from public.game_catalog_provider_ids p where p.game_key = g.game_key and p.provider = 'steam' and p.external_id ~ '^[0-9]{1,10}$')))
      from public.crews c join public.crew_walls w on w.crew_id = c.crew_id and w.published join public.game_catalog g on g.game_key = c.game_key and g.is_active
      where c.crew_id = candidate_crew), '[]'::jsonb));
$$;
revoke all on function public.game_artwork_crew_targets(uuid) from public, anon, authenticated;
grant execute on function public.game_artwork_crew_targets(uuid) to service_role;
