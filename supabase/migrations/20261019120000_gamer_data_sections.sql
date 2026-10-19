-- My Gamer Data, Phase 2 (Mazen's task 2026-10-19) - GamID TESTING only. PROPOSED: not applied until Mazen approves it. Additive.
--
-- One Classic -> Wall import contract on the EXISTING section registry (public.public_section_catalog), instead of a new registry:
--   1. Catalog: a row may be offered to the Wall (wall_importable) with generic metadata - presentation (text | facts | chips | cards | stat), icon key, single / all
--      import modes and the name of one item. `visibility_switch` keeps the owner's "Show on my GamID" switch list exactly as it is (only the four switch rows).
--   2. Projection: private.gamer_data_items() is the ONE place a section's items are produced, and only from the reads Classic already uses:
--        visitors  get_public_profile_extras_impl / get_public_favorite_games_impl (PUBLIC SOLO GamID, About Me switches, My Games gate) - nothing else is read;
--        owner     get_my_about_impl / get_my_favorite_games_impl (the caller's own GamID), every item marked `private` when visitors would not see it.
--      A catalog row without a branch here exposes nothing (its section is omitted). get_public_gamer_data (anon) / get_my_gamer_data (owner) return the
--      importable sections in catalog order: [{ key, label, icon, presentation, single, all, order, item_label, items: [{ id, kind, label, value | values | title, sub }] }].
--   3. The Wall binding that draws these sections (gamidData field "section") is the separate migration 20261019120100_wall_gamer_data_binding.sql.
-- Initial sections: about_me (facts: Location, Member Since, Languages, Favorite Genres - each with its own switch) and favorite_games (cards, catalog game keys,
-- the owner's order, the My Games gate). Every existing payload stays valid; no table data changes.

-- ---------------------------------------------------------------------------------------------
-- 1. The section catalog, extended
-- ---------------------------------------------------------------------------------------------
alter table public.public_section_catalog
  add column visibility_switch boolean not null default true,
  add column wall_importable boolean not null default false,
  add column wall_presentation text check (wall_presentation in ('text', 'facts', 'chips', 'cards', 'stat')),
  add column wall_icon text check (wall_icon ~ '^[a-z][a-z0-9-]{0,31}$'),
  add column wall_single boolean not null default false,
  add column wall_all boolean not null default false,
  add column wall_item_label text check (char_length(wall_item_label) between 1 and 60),
  add constraint public_section_catalog_wall_check check (not wall_importable or (wall_presentation is not null and wall_icon is not null and (wall_single or wall_all)));

insert into public.public_section_catalog (section_key, label, section_kind, sort_order, visibility_switch, wall_importable, wall_presentation, wall_icon, wall_single, wall_all, wall_item_label) values
  ('about_me', 'About Me', 'PROFILE', 30, false, true, 'facts', 'about', true, true, 'Fact'),
  ('favorite_games', 'Favorite Games', 'GAME', 40, false, true, 'cards', 'favorite', true, true, 'Favorite Game');

-- The owner's "Show on my GamID" switches: the same rows as before (copied from 20260920190000_steam_connection_foundation.sql; changed: `and c.visibility_switch`).
create or replace function private.get_my_section_visibility_impl()
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
      when 'steam' then exists (select 1 from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = 'steam')
      when 'league' then exists (select 1 from public.league_profiles l where l.entity_id = owned_entity_id)
      when 'education_work' then exists (
        select 1 from public.profiles p
        where p.entity_id = owned_entity_id
          and (p.education_work_status is not null or nullif(btrim(coalesce(p.institution, '')), '') is not null or nullif(btrim(coalesce(p.field_of_study, '')), '') is not null))
      else false
    end,
    case c.section_key
      when 'discord' then coalesce((select g.is_public from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = 'discord'), false)
      when 'steam' then coalesce((select g.is_public from public.gaming_connections g where g.entity_id = owned_entity_id and g.provider_key = 'steam'), false)
      when 'league' then coalesce((select l.is_public from public.league_profiles l where l.entity_id = owned_entity_id), false)
      when 'education_work' then coalesce((select p.show_education_work from public.profiles p where p.entity_id = owned_entity_id), false)
      else false
    end
  from public.public_section_catalog c
  where c.active and c.visibility_switch
  order by c.sort_order, c.section_key;
end;
$$;

-- copied from 20260920190000_steam_connection_foundation.sql; changed: a section without a switch is INVALID_SECTION before anything else, as an unknown one is
create or replace function private.set_my_section_visibility_impl(candidate_section text, candidate_visible boolean)
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
  if key is null or not exists (select 1 from public.public_section_catalog c where c.section_key = key and c.active and c.visibility_switch) then
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
  elsif key = 'steam' then
    update public.gaming_connections g set is_public = candidate_visible where g.entity_id = owned_entity_id and g.provider_key = 'steam';
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

-- ---------------------------------------------------------------------------------------------
-- 2. The projection: one branch per importable section, built ONLY from the existing gated reads
-- ---------------------------------------------------------------------------------------------
-- -> the section's items (a jsonb array, possibly empty) or null when this section has no branch / nothing to show here. Owner mode reads the CALLER's own GamID
-- (candidate_handle is ignored) and raises AUTH_REQUIRED / IDENTITY_NOT_FOUND like every owner read.
create function private.gamer_data_items(candidate_section text, candidate_handle text, candidate_owner boolean)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me record;
  ab record;
  ex record;
  shown boolean := false;
begin
  if candidate_owner then
    select * into me from private.banner_owner();
    select e.visibility = 'PUBLIC' into shown from public.entities e where e.entity_id = me.owner_entity_id;
    shown := coalesce(shown, false);
  end if;
  case candidate_section
  when 'about_me' then
    if candidate_owner then
      select * into ab from private.get_my_about_impl();
      if not found then return '[]'::jsonb; end if;
      return coalesce((select jsonb_agg(x.item order by x.n) from (values
        (1, case when nullif(btrim(coalesce(ab.about_location, '')), '') is not null then
          jsonb_build_object('id', 'location', 'kind', 'text', 'label', 'Location', 'value', btrim(ab.about_location), 'private', not (shown and ab.show_location)) end),
        (2, case when ab.member_since_date is not null then
          jsonb_build_object('id', 'member_since', 'kind', 'text', 'label', 'Member Since', 'value', to_char(ab.member_since_date::date, 'FMDD FMMonth YYYY'), 'private', not shown) end),
        (3, case when cardinality(ab.about_languages) > 0 then
          jsonb_build_object('id', 'languages', 'kind', 'chips', 'label', 'Languages', 'private', not (shown and ab.show_languages), 'values',
            (select coalesce(jsonb_agg(l ->> 'label' order by array_position(ab.about_languages, l ->> 'code')), '[]'::jsonb)
             from jsonb_array_elements(ab.catalogs -> 'languages') l where (l ->> 'code') = any (ab.about_languages))) end),
        (4, case when cardinality(ab.about_genres) > 0 then
          jsonb_build_object('id', 'genres', 'kind', 'chips', 'label', 'Favorite Genres', 'private', not (shown and ab.show_genres), 'values',
            (select coalesce(jsonb_agg(g ->> 'label' order by array_position(ab.about_genres, g ->> 'key')), '[]'::jsonb)
             from jsonb_array_elements(ab.catalogs -> 'genres') g where (g ->> 'key') = any (ab.about_genres))) end)
      ) x(n, item) where x.item is not null), '[]'::jsonb);
    end if;
    -- visitors: exactly the About Me Classic shows (a PUBLIC SOLO GamID; Location / Languages / Genres only while their switch is on)
    select * into ex from private.get_public_profile_extras_impl(candidate_handle);
    if not found then return null; end if;
    return coalesce((select jsonb_agg(x.item order by x.n) from (values
      (1, case when nullif(btrim(coalesce(ex.about_location, '')), '') is not null then
        jsonb_build_object('id', 'location', 'kind', 'text', 'label', 'Location', 'value', btrim(ex.about_location)) end),
      (2, case when ex.member_since_date is not null then
        jsonb_build_object('id', 'member_since', 'kind', 'text', 'label', 'Member Since', 'value', to_char(ex.member_since_date::date, 'FMDD FMMonth YYYY')) end),
      (3, case when jsonb_array_length(coalesce(ex.about_languages, '[]'::jsonb)) > 0 then
        jsonb_build_object('id', 'languages', 'kind', 'chips', 'label', 'Languages', 'values',
          (select jsonb_agg(l ->> 'label' order by o) from jsonb_array_elements(ex.about_languages) with ordinality a(l, o))) end),
      (4, case when jsonb_array_length(coalesce(ex.about_genres, '[]'::jsonb)) > 0 then
        jsonb_build_object('id', 'genres', 'kind', 'chips', 'label', 'Favorite Genres', 'values',
          (select jsonb_agg(g ->> 'label' order by o) from jsonb_array_elements(ex.about_genres) with ordinality a(g, o))) end)
    ) x(n, item) where x.item is not null), '[]'::jsonb);
  when 'favorite_games' then
    if candidate_owner then
      -- the owner's favorites in their order (catalog game keys still in My Games), private while visitors would not see My Games
      return coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', g.game_key, 'kind', 'card', 'label', g.display_name, 'title', g.display_name, 'sub', g.release_year::text,
          'private', not (shown and private.public_my_games_allowed(me.owner_entity_id)))) order by u.i)
        from unnest(private.get_my_favorite_games_impl()) with ordinality u(k, i)
        join public.game_catalog g on g.game_key = u.k and g.is_active), '[]'::jsonb);
    end if;
    -- visitors: exactly the Favorite Games Classic shows (a PUBLIC SOLO GamID while its My Games is public), in the owner's order
    return coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', f ->> 'game_key', 'kind', 'card', 'label', f ->> 'name', 'title', f ->> 'name', 'sub', f ->> 'year')) order by o)
      from jsonb_array_elements(coalesce(private.get_public_favorite_games_impl(candidate_handle), '[]'::jsonb)) with ordinality a(f, o)), '[]'::jsonb);
  else
    return null;   -- a catalog row with no branch here exposes nothing
  end case;
end;
$$;

create function private.gamer_data_projection(candidate_handle text, candidate_owner boolean)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', c.section_key, 'label', c.label, 'icon', c.wall_icon, 'presentation', c.wall_presentation, 'single', c.wall_single,
      'all', c.wall_all, 'order', c.sort_order, 'item_label', c.wall_item_label, 'items', x.items) order by c.sort_order, c.section_key), '[]'::jsonb)
  from public.public_section_catalog c
  cross join lateral (select private.gamer_data_items(c.section_key, candidate_handle, candidate_owner) as items) x
  where c.active and c.wall_importable and x.items is not null and (candidate_owner or jsonb_array_length(x.items) > 0);
$$;

-- visitors: only a PUBLIC SOLO GamID has any section; only sections with something visible are listed
create function private.get_public_gamer_data_impl(candidate_handle text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when exists (select 1 from public.entities e where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC')
    then private.gamer_data_projection(candidate_handle, false) else '[]'::jsonb end;
$$;
create function private.get_my_gamer_data_impl()
returns jsonb
language sql stable security definer
set search_path = ''
as $$ select private.gamer_data_projection(null, true); $$;

create function public.get_public_gamer_data(candidate_handle text) returns jsonb language sql stable security invoker set search_path = '' as $$ select private.get_public_gamer_data_impl(candidate_handle); $$;
create function public.get_my_gamer_data() returns jsonb language sql stable security invoker set search_path = '' as $$ select private.get_my_gamer_data_impl(); $$;

revoke all on function private.gamer_data_items(text, text, boolean), private.gamer_data_projection(text, boolean), private.get_public_gamer_data_impl(text), private.get_my_gamer_data_impl(),
  public.get_public_gamer_data(text), public.get_my_gamer_data()
from public, anon, authenticated, service_role;
grant execute on function private.get_public_gamer_data_impl(text), public.get_public_gamer_data(text) to anon, authenticated;
grant execute on function private.get_my_gamer_data_impl(), public.get_my_gamer_data() to authenticated;
