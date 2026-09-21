-- Game Catalog expansion: historical + modern platforms, canonical release year, platform-specific release year. TESTING only.
--
-- A controlled ENRICHMENT of the accepted canonical Game Catalog (migration 20260921210000). Nothing is replaced and nothing is removed:
--   * more normalized platforms (historical consoles, handhelds, computers); every existing platform key, its meaning and its parent are unchanged
--   * a nullable canonical release year on the canonical game (the EARLIEST legitimate release known for that game; never part of game_key)
--   * a nullable release year on a game <-> platform link, only where the source ties a release date to that platform
--   * both carry the source's full date + precision so a more precise date can be shown later without another migration
-- No existing catalog row is deleted, no game_key changes, no entity_game_platforms row is touched (its composite foreign key keeps pointing at the same
-- game_catalog_platforms rows), no discovery data is touched and nothing here reads or writes user data.

-- ---------------------------------------------------------------------------------------------
-- 1. Platform families: the fixed set grows with the manufacturers actually present in the source data
-- ---------------------------------------------------------------------------------------------
alter table public.game_platforms drop constraint game_platforms_family_check;
alter table public.game_platforms add constraint game_platforms_family_check
  check (family in ('PC', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'SEGA', 'ATARI', 'NEC', 'SNK', 'MOBILE', 'OTHER'));

-- ---------------------------------------------------------------------------------------------
-- 1b. The normalized platforms (generated from scripts/catalog/platform-map.mjs by scripts/catalog/print-platform-seed.mjs; that file maps every Wikidata
--     platform item to exactly one of these keys). It only ADDS platforms: an existing platform keeps its key, name, family, parent and provider and changes
--     only its position in the list, so families are grouped and each family is in release order.
-- ---------------------------------------------------------------------------------------------
insert into public.game_platforms (platform_key, display_name, family, parent_platform_key, provider_key, sort_order) values
  ('pc', 'PC', 'PC', null, null, 110),
  ('steam', 'Steam', 'PC', 'pc', 'steam', 111),
  ('epic_games', 'Epic Games Store', 'PC', 'pc', null, 112),
  ('macos', 'macOS', 'PC', null, null, 120),
  ('classic_mac_os', 'Classic Mac OS', 'PC', null, null, 121),
  ('linux', 'Linux', 'PC', null, null, 130),
  ('dos', 'DOS', 'PC', null, null, 140),
  ('commodore_64', 'Commodore 64', 'PC', null, null, 150),
  ('vic_20', 'Commodore VIC-20', 'PC', null, null, 151),
  ('amiga', 'Amiga', 'PC', null, null, 152),
  ('atari_st', 'Atari ST', 'PC', null, null, 153),
  ('atari_8bit', 'Atari 8-bit', 'PC', null, null, 154),
  ('zx_spectrum', 'ZX Spectrum', 'PC', null, null, 155),
  ('amstrad_cpc', 'Amstrad CPC', 'PC', null, null, 156),
  ('msx', 'MSX', 'PC', null, null, 157),
  ('apple_ii', 'Apple II', 'PC', null, null, 158),
  ('bbc_micro', 'BBC Micro', 'PC', null, null, 159),
  ('acorn_archimedes', 'Acorn Archimedes', 'PC', null, null, 160),
  ('pc_9800', 'NEC PC-9800', 'PC', null, null, 161),
  ('pc_8800', 'NEC PC-8800', 'PC', null, null, 162),
  ('x68000', 'Sharp X68000', 'PC', null, null, 163),
  ('fm_towns', 'FM Towns', 'PC', null, null, 164),
  ('fm_7', 'Fujitsu FM-7', 'PC', null, null, 165),
  ('sharp_x1', 'Sharp X1', 'PC', null, null, 166),
  ('ti_99_4a', 'TI-99/4A', 'PC', null, null, 167),
  ('trs_80', 'TRS-80', 'PC', null, null, 168),
  ('trs_80_coco', 'TRS-80 Color Computer', 'PC', null, null, 169),
  ('amstrad_pcw', 'Amstrad PCW', 'PC', null, null, 170),
  ('acorn_electron', 'Acorn Electron', 'PC', null, null, 171),
  ('dragon_32', 'Dragon 32/64', 'PC', null, null, 172),
  ('commodore_128', 'Commodore 128', 'PC', null, null, 173),
  ('commodore_plus4', 'Commodore Plus/4', 'PC', null, null, 174),
  ('commodore_pet', 'Commodore PET', 'PC', null, null, 175),
  ('commodore_16', 'Commodore 16', 'PC', null, null, 176),
  ('thomson_mo5', 'Thomson MO5', 'PC', null, null, 177),
  ('ps1', 'PlayStation (PS1)', 'PLAYSTATION', null, null, 210),
  ('ps2', 'PlayStation 2', 'PLAYSTATION', null, null, 220),
  ('ps3', 'PlayStation 3', 'PLAYSTATION', null, null, 230),
  ('ps4', 'PlayStation 4', 'PLAYSTATION', null, null, 240),
  ('ps5', 'PlayStation 5', 'PLAYSTATION', null, null, 250),
  ('psp', 'PlayStation Portable (PSP)', 'PLAYSTATION', null, null, 260),
  ('ps_vita', 'PlayStation Vita', 'PLAYSTATION', null, null, 270),
  ('xbox', 'Xbox (original)', 'XBOX', null, null, 310),
  ('xbox_360', 'Xbox 360', 'XBOX', null, null, 320),
  ('xbox_one', 'Xbox One', 'XBOX', null, null, 330),
  ('xbox_series', 'Xbox Series X|S', 'XBOX', null, null, 340),
  ('nes', 'Nintendo Entertainment System (NES)', 'NINTENDO', null, null, 410),
  ('snes', 'Super Nintendo (SNES)', 'NINTENDO', null, null, 420),
  ('n64', 'Nintendo 64', 'NINTENDO', null, null, 430),
  ('gamecube', 'Nintendo GameCube', 'NINTENDO', null, null, 440),
  ('wii', 'Wii', 'NINTENDO', null, null, 450),
  ('wii_u', 'Wii U', 'NINTENDO', null, null, 460),
  ('switch', 'Nintendo Switch', 'NINTENDO', null, null, 470),
  ('switch2', 'Nintendo Switch 2', 'NINTENDO', null, null, 480),
  ('game_boy', 'Game Boy', 'NINTENDO', null, null, 510),
  ('game_boy_color', 'Game Boy Color', 'NINTENDO', null, null, 520),
  ('game_boy_advance', 'Game Boy Advance', 'NINTENDO', null, null, 530),
  ('game_and_watch', 'Game & Watch', 'NINTENDO', null, null, 505),
  ('virtual_boy', 'Virtual Boy', 'NINTENDO', null, null, 540),
  ('nintendo_ds', 'Nintendo DS', 'NINTENDO', null, null, 550),
  ('nintendo_dsi', 'Nintendo DSi', 'NINTENDO', null, null, 560),
  ('nintendo_3ds', 'Nintendo 3DS', 'NINTENDO', null, null, 570),
  ('sg_1000', 'Sega SG-1000', 'SEGA', null, null, 610),
  ('master_system', 'Sega Master System', 'SEGA', null, null, 620),
  ('genesis', 'Sega Genesis / Mega Drive', 'SEGA', null, null, 630),
  ('sega_cd', 'Sega CD / Mega-CD', 'SEGA', null, null, 640),
  ('sega_32x', 'Sega 32X', 'SEGA', null, null, 650),
  ('saturn', 'Sega Saturn', 'SEGA', null, null, 660),
  ('dreamcast', 'Sega Dreamcast', 'SEGA', null, null, 670),
  ('game_gear', 'Sega Game Gear', 'SEGA', null, null, 680),
  ('atari_2600', 'Atari 2600', 'ATARI', null, null, 710),
  ('atari_5200', 'Atari 5200', 'ATARI', null, null, 720),
  ('atari_7800', 'Atari 7800', 'ATARI', null, null, 730),
  ('atari_lynx', 'Atari Lynx', 'ATARI', null, null, 740),
  ('atari_jaguar', 'Atari Jaguar', 'ATARI', null, null, 750),
  ('turbografx_16', 'TurboGrafx-16 / PC Engine', 'NEC', null, null, 810),
  ('neo_geo', 'Neo Geo', 'SNK', null, null, 910),
  ('neo_geo_cd', 'Neo Geo CD', 'SNK', null, null, 920),
  ('neo_geo_pocket_color', 'Neo Geo Pocket Color', 'SNK', null, null, 930),
  ('ios', 'iOS', 'MOBILE', null, null, 1010),
  ('android', 'Android', 'MOBILE', null, null, 1020),
  ('windows_phone', 'Windows Phone', 'MOBILE', null, null, 1030),
  ('windows_mobile', 'Windows Mobile', 'MOBILE', null, null, 1035),
  ('blackberry', 'BlackBerry', 'MOBILE', null, null, 1040),
  ('symbian', 'Symbian', 'MOBILE', null, null, 1050),
  ('java_me', 'Java ME (feature phones)', 'MOBILE', null, null, 1060),
  ('n_gage', 'Nokia N-Gage', 'MOBILE', null, null, 1070),
  ('arcade', 'Arcade', 'OTHER', null, null, 1110),
  ('web_browser', 'Web browser', 'OTHER', null, null, 1120),
  ('colecovision', 'ColecoVision', 'OTHER', null, null, 1130),
  ('intellivision', 'Intellivision', 'OTHER', null, null, 1140),
  ('three_do', '3DO', 'OTHER', null, null, 1150),
  ('philips_cd_i', 'Philips CD-i', 'OTHER', null, null, 1160),
  ('ouya', 'Ouya', 'OTHER', null, null, 1170),
  ('amiga_cd32', 'Amiga CD32', 'OTHER', null, null, 1180),
  ('amiga_cdtv', 'Commodore CDTV', 'OTHER', null, null, 1181),
  ('apple_tv', 'Apple TV (tvOS)', 'OTHER', null, null, 1182),
  ('wonderswan', 'WonderSwan', 'OTHER', null, null, 1183),
  ('wonderswan_color', 'WonderSwan Color', 'OTHER', null, null, 1184),
  ('zeebo', 'Zeebo', 'OTHER', null, null, 1185),
  ('odyssey_2', 'Magnavox Odyssey 2', 'OTHER', null, null, 1186),
  ('vectrex', 'Vectrex', 'OTHER', null, null, 1187)
on conflict (platform_key) do update set sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------------------------
-- 2. Release year / date: canonical (the game's first known release) and per platform link
--    release_year is derived from release_date (a table CHECK keeps them consistent); precision follows Wikidata: 9 = year, 10 = month, 11 = day.
-- ---------------------------------------------------------------------------------------------
alter table public.game_catalog
  add column release_year smallint check (release_year between 1950 and 2100),
  add column release_date date,
  add column release_date_precision smallint check (release_date_precision in (9, 10, 11)),
  add constraint game_catalog_release_consistent check (
    (release_date is null and release_year is null and release_date_precision is null)
    or (release_date is not null and release_year is not null and release_date_precision is not null and release_year = extract(year from release_date))
  );

alter table public.game_catalog_platforms
  add column release_year smallint check (release_year between 1950 and 2100),
  add column release_date date,
  add column release_date_precision smallint check (release_date_precision in (9, 10, 11)),
  add constraint game_catalog_platforms_release_consistent check (
    (release_date is null and release_year is null and release_date_precision is null)
    or (release_date is not null and release_year is not null and release_date_precision is not null and release_year = extract(year from release_date))
  );

-- ---------------------------------------------------------------------------------------------
-- 3. Search now also returns the canonical release year (secondary information shown next to the title).
--    Same semantics as before: 3-character floor, at most 12 rows, same ranking, same normalization. The result type gains one column, so the two
--    search functions are recreated (nothing else calls them).
-- ---------------------------------------------------------------------------------------------
drop function public.search_game_catalog(text, integer);
drop function private.search_game_catalog_impl(text, integer);

create function private.search_game_catalog_impl(candidate_query text, candidate_limit integer)
returns table (game_key text, display_name text, matched_alias text, release_year integer)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  spaced text;
  compact text;
  max_rows integer := least(greatest(coalesce(candidate_limit, 10), 1), 12);
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if candidate_query is null or char_length(candidate_query) > 80 then return; end if;
  spaced := private.game_search_normalize(candidate_query);
  compact := replace(spaced, ' ', '');
  if char_length(compact) < 3 then return; end if;

  return query
  with hits as (
    select c.game_key as hit_key, c.display_name as hit_name, null::text as hit_alias, c.release_year as hit_year,
      case when c.search_key = compact then 0
           when c.search_key like compact || '%' then 1
           when c.normalized_name like '% ' || spaced || '%' then 2
           else 3 end as tier,
      c.popularity as pop
    from public.game_catalog c
    where c.is_active and c.search_key like '%' || compact || '%'
    union all
    select c.game_key, c.display_name, a.alias, c.release_year,
      case when a.search_key = compact then 1
           when a.search_key like compact || '%' then 2
           else 4 end,
      c.popularity
    from public.game_catalog_aliases a
    join public.game_catalog c on c.game_key = a.game_key
    where c.is_active and a.search_key like '%' || compact || '%'
  ), best as (
    select distinct on (h.hit_key) h.hit_key, h.hit_name, h.hit_alias, h.hit_year, h.tier, h.pop
    from hits h
    order by h.hit_key, h.tier, h.pop desc
  )
  select b.hit_key, b.hit_name, b.hit_alias, b.hit_year::integer
  from best b
  order by b.tier, b.pop desc, b.hit_name, b.hit_key
  limit max_rows;
end;
$$;

create function public.search_game_catalog(candidate_query text, candidate_limit integer default 10)
returns table (game_key text, display_name text, matched_alias text, release_year integer)
language sql stable security invoker
set search_path = ''
as $$ select * from private.search_game_catalog_impl(candidate_query, candidate_limit); $$;

revoke all on function private.search_game_catalog_impl(text, integer), public.search_game_catalog(text, integer) from public, anon, authenticated, service_role;
grant execute on function private.search_game_catalog_impl(text, integer), public.search_game_catalog(text, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. The platform picture of one game also carries each supported platform's own release year (when the source ties one to it).
--    Same signature and columns as before; only the JSON of "supported" gains a key.
-- ---------------------------------------------------------------------------------------------
create or replace function private.get_my_game_platform_state_impl(candidate_game_key text)
returns table (game_key text, display_name text, supported jsonb, established jsonb, manual jsonb)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
  game public.game_catalog%rowtype;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  select * into game from public.game_catalog c where c.game_key = candidate_game_key and c.is_active;
  if not found then raise exception using errcode = '22023', message = 'INVALID_GAME'; end if;

  return query
  select game.game_key, game.display_name,
    coalesce((select jsonb_agg(jsonb_build_object('platform_key', p.platform_key, 'display_name', p.display_name, 'family', p.family, 'parent_platform_key', p.parent_platform_key, 'release_year', cp.release_year) order by p.sort_order)
      from public.game_catalog_platforms cp join public.game_platforms p on p.platform_key = cp.platform_key and p.is_active where cp.game_key = game.game_key), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('platform_key', p.platform_key, 'display_name', p.display_name) order by p.sort_order)
      from public.game_platforms p where p.platform_key in (select private.provider_established_platforms(owned_entity_id, game.game_key))), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('platform_key', p.platform_key, 'display_name', p.display_name) order by p.sort_order)
      from public.entity_game_platforms x join public.game_platforms p on p.platform_key = x.platform_key
      where x.entity_id = owned_entity_id and x.game_key = game.game_key), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. The importer learns release dates. Same signature, same merge-first behavior, still granted to no role, still only adds:
--    * canonical release: the EARLIEST date seen for the game (a later port never replaces it; a NULL never overwrites a date)
--    * a platform release is stored only when the item carries one for that platform, and only the earliest per (game, platform) is kept
--    * the canonical date can never be later than a platform's date: it is lowered to the earliest platform date when needed
--    item additions: "release_date": "1996-09-09", "release_date_precision": 11,
--                    "platform_releases": [{"platform":"ps1","date":"1996-09-09","precision":11}]
-- ---------------------------------------------------------------------------------------------
create or replace function private.import_game_catalog_batch(candidate_items jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  it jsonb;
  pr jsonb;
  src text;
  ref text;
  item_name text;
  norm text;
  pop integer;
  found_key text;
  new_key text;
  base_key text;
  ident jsonb;
  rel_date date;
  rel_prec smallint;
  created integer := 0;
  merged integer := 0;
  skipped integer := 0;
begin
  if candidate_items is null or jsonb_typeof(candidate_items) <> 'array' then raise exception using errcode = '22023', message = 'INVALID_BATCH'; end if;
  for it in select value from jsonb_array_elements(candidate_items) loop
    src := upper(btrim(coalesce(it->>'source', '')));
    ref := btrim(coalesce(it->>'ref', ''));
    item_name := btrim(coalesce(it->>'name', ''));
    norm := private.game_search_normalize(item_name);
    pop := least(greatest(coalesce((it->>'popularity')::integer, 0), 0), 1000000);
    if src !~ '^[A-Z][A-Z0-9_]{1,31}$' or ref = '' or char_length(ref) > 128 or item_name = '' or char_length(item_name) > 120 or char_length(norm) < 2 or char_length(norm) > 160 then
      skipped := skipped + 1;
      continue;
    end if;

    -- resolve the canonical game through ANY identifier first (the source's own id, then every other provider id)
    select cp.game_key into found_key from public.game_catalog_provider_ids cp where cp.provider = lower(src) and cp.external_id = ref;
    if found_key is null and jsonb_typeof(it->'ids') = 'array' then
      for ident in select value from jsonb_array_elements(it->'ids') loop
        select cp.game_key into found_key from public.game_catalog_provider_ids cp
        where cp.provider = lower(btrim(coalesce(ident->>'provider', ''))) and cp.external_id = btrim(coalesce(ident->>'id', ''));
        exit when found_key is not null;
      end loop;
    end if;

    if found_key is null then
      base_key := regexp_replace(replace(norm, ' ', '_'), '[^a-z0-9_]', '', 'g');
      if base_key = '' then skipped := skipped + 1; continue; end if;
      if base_key !~ '^[a-z]' then base_key := 'g_' || base_key; end if;
      base_key := left(base_key, 44);
      new_key := base_key;
      if exists (select 1 from public.game_catalog c where c.game_key = new_key) then
        new_key := left(base_key, 44) || '_' || left(regexp_replace(lower(ref), '[^a-z0-9]', '', 'g'), 18);
      end if;
      if exists (select 1 from public.game_catalog c where c.game_key = new_key) then skipped := skipped + 1; continue; end if;
      insert into public.game_catalog (game_key, display_name, normalized_name, search_key, popularity, catalog_source)
      values (new_key, item_name, norm, replace(norm, ' ', ''), pop, src);
      found_key := new_key;
      created := created + 1;
    else
      update public.game_catalog c set popularity = greatest(c.popularity, pop), updated_at = now() where c.game_key = found_key and c.popularity < pop;
      merged := merged + 1;
    end if;

    insert into public.game_catalog_provider_ids (provider, external_id, game_key) values (lower(src), ref, found_key) on conflict (provider, external_id) do nothing;
    if jsonb_typeof(it->'ids') = 'array' then
      for ident in select value from jsonb_array_elements(it->'ids') loop
        if coalesce(ident->>'provider', '') ~ '^[a-z][a-z0-9_]{1,31}$' and char_length(coalesce(ident->>'id', '')) between 1 and 128 then
          insert into public.game_catalog_provider_ids (provider, external_id, game_key) values (ident->>'provider', ident->>'id', found_key) on conflict (provider, external_id) do nothing;
        end if;
      end loop;
    end if;
    if jsonb_typeof(it->'platforms') = 'array' then
      insert into public.game_catalog_platforms (game_key, platform_key)
      select distinct found_key, p.platform_key from jsonb_array_elements_text(it->'platforms') as x(pk)
      join public.game_platforms p on p.platform_key = x.pk and p.is_active
      on conflict (game_key, platform_key) do nothing;
    end if;
    if jsonb_typeof(it->'aliases') = 'array' then
      insert into public.game_catalog_aliases (game_key, alias, search_key)
      select found_key, min(btrim(a.alias)), replace(private.game_search_normalize(a.alias), ' ', '')
      from jsonb_array_elements_text(it->'aliases') as a(alias)
      where char_length(btrim(a.alias)) between 3 and 120 and char_length(replace(private.game_search_normalize(a.alias), ' ', '')) between 3 and 160
        and replace(private.game_search_normalize(a.alias), ' ', '') <> replace(norm, ' ', '')
      group by replace(private.game_search_normalize(a.alias), ' ', '')
      limit 12
      on conflict (game_key, search_key) do nothing;
    end if;

    -- canonical release: the earliest valid date wins; an invalid or missing date is ignored (never invented)
    begin
      rel_date := nullif(it->>'release_date', '')::date;
      rel_prec := nullif(it->>'release_date_precision', '')::smallint;
    exception when others then rel_date := null; rel_prec := null;
    end;
    if rel_date is not null and (rel_prec is null or rel_prec not in (9, 10, 11) or extract(year from rel_date) not between 1950 and 2100) then rel_date := null; end if;
    if rel_date is not null then
      update public.game_catalog c
      set release_date = rel_date, release_year = extract(year from rel_date)::smallint, release_date_precision = rel_prec, updated_at = now()
      where c.game_key = found_key and (c.release_date is null or rel_date < c.release_date);
    end if;

    -- platform-specific release: only where the item ties a date to that platform; the earliest per (game, platform) is kept
    if jsonb_typeof(it->'platform_releases') = 'array' then
      for pr in select value from jsonb_array_elements(it->'platform_releases') loop
        begin
          rel_date := nullif(pr->>'date', '')::date;
          rel_prec := nullif(pr->>'precision', '')::smallint;
        exception when others then rel_date := null; rel_prec := null;
        end;
        if rel_date is null or rel_prec is null or rel_prec not in (9, 10, 11) or extract(year from rel_date) not between 1950 and 2100 then continue; end if;
        insert into public.game_catalog_platforms as l (game_key, platform_key, release_year, release_date, release_date_precision)
        select found_key, p.platform_key, extract(year from rel_date)::smallint, rel_date, rel_prec
        from public.game_platforms p where p.platform_key = pr->>'platform' and p.is_active
        on conflict (game_key, platform_key) do update
        set release_year = excluded.release_year, release_date = excluded.release_date, release_date_precision = excluded.release_date_precision
        where l.release_date is null or excluded.release_date < l.release_date;
      end loop;
      -- the game's first release can never be later than the release on one of its platforms
      update public.game_catalog c
      set release_date = m.d, release_year = extract(year from m.d)::smallint, release_date_precision = m.prec, updated_at = now()
      from (select l.release_date as d, l.release_date_precision as prec from public.game_catalog_platforms l
            where l.game_key = found_key and l.release_date is not null order by l.release_date, l.release_date_precision desc limit 1) m
      where c.game_key = found_key and (c.release_date is null or m.d < c.release_date);
    end if;
  end loop;
  return jsonb_build_object('created', created, 'merged', merged, 'skipped', skipped);
end;
$$;
