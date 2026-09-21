-- Game Catalog expansion (historical platforms, canonical + per-platform release years, enrichment-safe importer) - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/game-catalog-expansion-db.sql
-- (Requires migration 20260922000000 to be applied. To validate the migration BEFORE applying it, run the migration's content and this file's content wrapped
--  together in one always-failing statement: everything rolls back either way.)
--
-- Uses ONLY disposable auth users / identities and invented catalog games ("Qzy..." names) created inside the transaction, and ALWAYS raises an exception
-- carrying the results, so the whole transaction rolls back and nothing (the imported catalog, @black, real Steam/Discord connections, real manual games,
-- discovered games, Game Profiles) is touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  ent_a uuid; conn_a uuid; att uuid; st text;
  got text; got2 text; got3 text;
  n integer; cnt integer; r record; imp jsonb;
  links_before integer; games_before integer; ids_before integer; aliases_before integer; created_before timestamptz; created_after timestamptz;
  discovered_before integer; manual_before integer; profiles_before integer;
begin
  select count(*) into discovered_before from public.discovered_games;
  select count(*) into manual_before from public.entity_game_platforms;
  select count(*) into profiles_before from public.game_profiles;

  execute $fn$
    create function pg_temp.mx_as(p_user uuid, p_sql text) returns text language plpgsql as $f$
    declare out text;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
      set local role authenticated;
      begin execute p_sql into out; exception when others then out := 'ERR:' || sqlerrm; end;
      reset role;
      return out;
    end $f$;
  $fn$;
  execute $fn$
    create function pg_temp.mx_role(p_role text, p_sql text) returns text language plpgsql as $f$
    declare out text;
    begin
      perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
      execute 'set local role ' || p_role;
      begin execute p_sql into out; exception when others then out := 'ERR:' || sqlerrm; end;
      reset role;
      return out;
    end $f$;
  $fn$;

  -- ------------------------------------------------------------------ setup: disposable owners; A has a real accepted Steam connection
  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zexp-a@example.invalid', now()), (ub, 'zexp-b@example.invalid', now());
  for r in select * from (values (ua, 'zexpa'), (ub, 'zexpb')) as v(u, h) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
    set local role authenticated; perform 1 from public.create_solo_identity(r.h, 'Zed ' || r.h, date '1990-01-01', 'en'); reset role;
  end loop;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zexpa';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c;
  select public.complete_steam_connection_attempt(att, '76561198000000041') into got;
  reset role;
  select g.connection_id into conn_a from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam';
  res := res || jsonb_build_object('step', 'setup: disposable owners; A has an authenticated Steam connection', 'pass', conn_a is not null);

  -- ------------------------------------------------------------------ 1. platforms
  select count(*) into cnt from public.game_platforms;
  res := res || jsonb_build_object('step', 'the normalized platform set grew well beyond the original eleven', 'pass', cnt >= 70, 'got', cnt);
  select count(*) into cnt from public.game_platforms p where
    (p.platform_key, p.display_name, p.family, coalesce(p.parent_platform_key, '-'), coalesce(p.provider_key, '-')) in (
      ('pc', 'PC', 'PC', '-', '-'), ('steam', 'Steam', 'PC', 'pc', 'steam'), ('epic_games', 'Epic Games Store', 'PC', 'pc', '-'),
      ('ps4', 'PlayStation 4', 'PLAYSTATION', '-', '-'), ('ps5', 'PlayStation 5', 'PLAYSTATION', '-', '-'),
      ('xbox_one', 'Xbox One', 'XBOX', '-', '-'), ('xbox_series', 'Xbox Series X|S', 'XBOX', '-', '-'),
      ('switch', 'Nintendo Switch', 'NINTENDO', '-', '-'), ('switch2', 'Nintendo Switch 2', 'NINTENDO', '-', '-'),
      ('ios', 'iOS', 'MOBILE', '-', '-'), ('android', 'Android', 'MOBILE', '-', '-'));
  res := res || jsonb_build_object('step', 'the eleven accepted platforms kept their key, name, family, parent and provider (Steam and Epic are still stores under PC)', 'pass', cnt = 11, 'got', cnt);
  select count(*) into cnt from public.game_platforms p where p.platform_key in ('ps1', 'ps2', 'ps3', 'psp', 'ps_vita', 'xbox', 'xbox_360', 'nes', 'snes', 'n64', 'gamecube', 'wii', 'wii_u', 'game_boy', 'game_boy_color', 'game_boy_advance', 'nintendo_ds', 'nintendo_dsi', 'nintendo_3ds', 'master_system', 'genesis', 'sega_cd', 'sega_32x', 'saturn', 'dreamcast', 'game_gear', 'macos', 'linux');
  res := res || jsonb_build_object('step', 'every historical platform named in the brief exists (PlayStation family, Xbox family, Nintendo consoles and handhelds, Sega family, macOS, Linux)', 'pass', cnt = 28, 'got', cnt);
  select count(*) into cnt from public.game_platforms p where p.family in ('SEGA', 'ATARI', 'NEC', 'SNK', 'OTHER');
  res := res || jsonb_build_object('step', 'the added families (Sega, Atari, NEC, SNK, other) are populated from the source audit', 'pass', cnt >= 15, 'got', cnt);
  begin insert into public.game_platforms (platform_key, display_name, family, sort_order) values ('zz_bogus', 'Bogus', 'BOGUS', 9999); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; end;
  begin insert into public.game_platforms (platform_key, display_name, family, sort_order) values ('zz_ok', 'Ok', 'SEGA', 9999); got2 := 'OK'; exception when others then got2 := sqlerrm; end;
  res := res || jsonb_build_object('step', 'the family list is a fixed CHECK: an unknown family is refused, a listed one accepted', 'pass', got = 'CHECK' and got2 = 'OK', 'got', got || '/' || got2);
  select count(*) into cnt from (select sort_order from public.game_platforms group by sort_order having count(*) > 1) d;
  res := res || jsonb_build_object('step', 'platform sort order is unique (families are grouped, each in release order)', 'pass', cnt = 0);

  -- ------------------------------------------------------------------ 2. release columns
  select count(*) into cnt from information_schema.columns c
  where c.table_schema = 'public' and c.is_nullable = 'YES'
    and ((c.table_name = 'game_catalog' and c.column_name in ('release_year', 'release_date', 'release_date_precision'))
      or (c.table_name = 'game_catalog_platforms' and c.column_name in ('release_year', 'release_date', 'release_date_precision')));
  res := res || jsonb_build_object('step', 'release year / date / precision are NULLABLE on the canonical game and on the game <-> platform link', 'pass', cnt = 6, 'got', cnt);
  begin insert into public.game_catalog (game_key, display_name, normalized_name, search_key, catalog_source, release_year, release_date, release_date_precision) values ('qzy_bad1', 'Qzy Bad', 'qzy bad', 'qzybad', 'WIKIDATA', 1996, date '1997-01-01', 11); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; end;
  begin insert into public.game_catalog (game_key, display_name, normalized_name, search_key, catalog_source, release_year, release_date, release_date_precision) values ('qzy_bad2', 'Qzy Bad', 'qzy bad', 'qzybad', 'WIKIDATA', 1996, date '1996-01-01', 8); got2 := 'NO_ERROR'; exception when check_violation then got2 := 'CHECK'; end;
  begin insert into public.game_catalog (game_key, display_name, normalized_name, search_key, catalog_source, release_year, release_date, release_date_precision) values ('qzy_bad3', 'Qzy Bad', 'qzy bad', 'qzybad', 'WIKIDATA', 1949, date '1949-01-01', 9); got3 := 'NO_ERROR'; exception when check_violation then got3 := 'CHECK'; end;
  res := res || jsonb_build_object('step', 'the table refuses an inconsistent year/date, an unknown precision and an implausible year (a year alone or a date alone is refused too)', 'pass', got = 'CHECK' and got2 = 'CHECK' and got3 = 'CHECK', 'got', got || got2 || got3);
  begin insert into public.game_catalog (game_key, display_name, normalized_name, search_key, catalog_source, release_year) values ('qzy_bad4', 'Qzy Bad', 'qzy bad', 'qzybad', 'WIKIDATA', 1996); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; end;
  res := res || jsonb_build_object('step', 'a year without its date is refused', 'pass', got = 'CHECK');

  -- ------------------------------------------------------------------ 3. importer: old-format items still work (same behavior as before the expansion)
  select count(*) into games_before from public.game_catalog;
  imp := private.import_game_catalog_batch('[
    {"source":"WIKIDATA","ref":"QY1","name":"Qzyrion Legacy","popularity":30,"platforms":["pc","ps2"],"aliases":["Zyra Legacy Edition"],"ids":[{"provider":"steam","id":"910001"}]}
  ]'::jsonb);
  select count(*) into cnt from public.game_catalog c where c.game_key = 'qzyrion_legacy' and c.release_year is null and c.release_date is null;
  res := res || jsonb_build_object('step', 'an item WITHOUT release fields (the previous format) imports exactly as before and leaves the year NULL', 'pass', (imp->>'created')::int = 1 and cnt = 1, 'got', imp);

  -- ------------------------------------------------------------------ 4. importer: release years
  imp := private.import_game_catalog_batch('[
    {"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","popularity":50,"platforms":["ps1","pc","dreamcast","ps3"],
     "release_year":1996,"release_date":"1996-09-09","release_date_precision":11,
     "platform_releases":[{"platform":"ps1","year":1996,"date":"1996-09-09","precision":11},{"platform":"pc","year":1998,"date":"1998-03-01","precision":10},{"platform":"dreamcast","year":1999,"date":"1999-11-27","precision":11}],
     "aliases":["Zynova"],"ids":[{"provider":"steam","id":"910002"}]}
  ]'::jsonb);
  select release_year || '/' || release_date || '/' || release_date_precision into got from public.game_catalog c where c.game_key = 'qzynova_chronicles';
  res := res || jsonb_build_object('step', 'canonical release year/date/precision are stored from the source', 'pass', got = '1996/1996-09-09/11', 'got', got);
  select string_agg(l.platform_key || ':' || coalesce(l.release_year::text, '-'), ',' order by l.platform_key) into got from public.game_catalog_platforms l where l.game_key = 'qzynova_chronicles';
  res := res || jsonb_build_object('step', 'platform-specific years are stored where the source ties a date to that platform; a platform with no dated release has NO year (PS3 stays undated)', 'pass', got = 'dreamcast:1999,pc:1998,ps1:1996,ps3:-', 'got', got);
  select count(*) into cnt from public.game_catalog_platforms l join public.game_catalog c on c.game_key = l.game_key where l.game_key = 'qzynova_chronicles' and l.release_date is not null and l.release_date < c.release_date;
  res := res || jsonb_build_object('step', 'INVARIANT: no platform release is earlier than the game''s canonical first release', 'pass', cnt = 0);

  -- repeat-safe
  select count(*) into links_before from public.game_catalog_platforms where game_key = 'qzynova_chronicles';
  select count(*) into ids_before from public.game_catalog_provider_ids where game_key = 'qzynova_chronicles';
  select count(*) into aliases_before from public.game_catalog_aliases where game_key = 'qzynova_chronicles';
  select count(*) into games_before from public.game_catalog;
  imp := private.import_game_catalog_batch('[
    {"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","popularity":50,"platforms":["ps1","pc","dreamcast","ps3"],"release_year":1996,"release_date":"1996-09-09","release_date_precision":11,
     "platform_releases":[{"platform":"ps1","year":1996,"date":"1996-09-09","precision":11},{"platform":"pc","year":1998,"date":"1998-03-01","precision":10}],"aliases":["Zynova"],"ids":[{"provider":"steam","id":"910002"}]}
  ]'::jsonb);
  res := res || jsonb_build_object('step', 'IDEMPOTENT: importing the same game again duplicates no game, platform link, alias or provider id', 'pass',
    (imp->>'created')::int = 0 and (imp->>'merged')::int = 1 and (select count(*) from public.game_catalog) = games_before
    and (select count(*) from public.game_catalog_platforms where game_key = 'qzynova_chronicles') = links_before
    and (select count(*) from public.game_catalog_provider_ids where game_key = 'qzynova_chronicles') = ids_before
    and (select count(*) from public.game_catalog_aliases where game_key = 'qzynova_chronicles') = aliases_before, 'got', imp);
  select string_agg(l.platform_key || ':' || coalesce(l.release_year::text, '-'), ',' order by l.platform_key) into got from public.game_catalog_platforms l where l.game_key = 'qzynova_chronicles';
  res := res || jsonb_build_object('step', 'a re-import that carries fewer platform dates never removes a stored platform or its year (dreamcast:1999 survived)', 'pass', got = 'dreamcast:1999,pc:1998,ps1:1996,ps3:-', 'got', got);

  -- later port never replaces; NULL never erases; invalid dates are ignored
  perform private.import_game_catalog_batch('[{"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","platforms":["xbox_360"],"release_year":2005,"release_date":"2005-05-05","release_date_precision":11,"platform_releases":[{"platform":"xbox_360","year":2005,"date":"2005-05-05","precision":11}]}]'::jsonb);
  select release_year into n from public.game_catalog where game_key = 'qzynova_chronicles';
  res := res || jsonb_build_object('step', 'a LATER release (a port) never replaces the canonical year, but its platform link gets its own year', 'pass',
    n = 1996 and (select release_year from public.game_catalog_platforms where game_key = 'qzynova_chronicles' and platform_key = 'xbox_360') = 2005, 'got', n);
  perform private.import_game_catalog_batch('[{"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","platforms":["pc"]}]'::jsonb);
  select release_year into n from public.game_catalog where game_key = 'qzynova_chronicles';
  res := res || jsonb_build_object('step', 'an item with NO date never erases a known one', 'pass', n = 1996);
  perform private.import_game_catalog_batch('[{"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","release_year":2010,"release_date":"2010-01-01","release_date_precision":9}]'::jsonb);
  select release_year into n from public.game_catalog where game_key = 'qzynova_chronicles';
  res := res || jsonb_build_object('step', 'a later canonical date that names no platform (a re-release) does not replace the first release', 'pass', n = 1996, 'got', n);
  perform private.import_game_catalog_batch('[{"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","platform_releases":[{"platform":"pc","year":2010,"date":"2010-01-01","precision":9},{"platform":"ps1","year":2012,"date":"2012-01-01","precision":9}]}]'::jsonb);
  res := res || jsonb_build_object('step', 'a later date for a platform that already has one never replaces it (pc stays 1998, ps1 stays 1996)', 'pass',
    (select release_year from public.game_catalog_platforms where game_key = 'qzynova_chronicles' and platform_key = 'pc') = 1998
    and (select release_year from public.game_catalog_platforms where game_key = 'qzynova_chronicles' and platform_key = 'ps1') = 1996);
  perform private.import_game_catalog_batch('[
    {"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","release_year":1800,"release_date":"1800-01-01","release_date_precision":11},
    {"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","release_date":"1990-01-01","release_date_precision":8},
    {"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","release_date":"not a date","release_date_precision":11},
    {"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","release_date":"2200-01-01","release_date_precision":9},
    {"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","platform_releases":[{"platform":"pc","date":"1700-01-01","precision":11},{"platform":"pc","date":"1990-01-01","precision":3},{"platform":"nonexistent_platform","date":"1990-01-01","precision":11},{"platform":"pc","date":"garbage","precision":11}]}
  ]'::jsonb);
  select release_year into n from public.game_catalog where game_key = 'qzynova_chronicles';
  res := res || jsonb_build_object('step', 'invalid dates (implausible year, unknown precision, garbage, far future) and an unknown platform are ignored - nothing is invented', 'pass',
    n = 1996 and (select release_year from public.game_catalog_platforms where game_key = 'qzynova_chronicles' and platform_key = 'pc') = 1998
    and not exists (select 1 from public.game_catalog_platforms where game_key = 'qzynova_chronicles' and platform_key = 'nonexistent_platform'), 'got', n);

  -- an EARLIER date found later lowers the canonical year (through a different provider id of the same game)
  perform private.import_game_catalog_batch('[{"source":"WIKIDATA","ref":"QY2B","name":"Qzynova Chronicles","platforms":["pc"],"release_year":1995,"release_date":"1995-05-05","release_date_precision":11,"ids":[{"provider":"steam","id":"910002"}]}]'::jsonb);
  select release_year || '/' || release_date into got from public.game_catalog where game_key = 'qzynova_chronicles';
  res := res || jsonb_build_object('step', 'an EARLIER date replaces the canonical year (earliest wins), matched to the SAME game through its Steam id, with no duplicate game', 'pass',
    got = '1995/1995-05-05' and (select count(*) from public.game_catalog where display_name = 'Qzynova Chronicles') = 1, 'got', got);

  -- a platform date earlier than the canonical lowers the canonical (invariant)
  perform private.import_game_catalog_batch('[{"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","platform_releases":[{"platform":"ps1","date":"1994-12-03","precision":11}]}]'::jsonb);
  select release_year into n from public.game_catalog where game_key = 'qzynova_chronicles';
  select count(*) into cnt from public.game_catalog_platforms l join public.game_catalog c on c.game_key = l.game_key where l.game_key = 'qzynova_chronicles' and l.release_date < c.release_date;
  res := res || jsonb_build_object('step', 'a platform release earlier than the canonical date lowers the canonical year, so the invariant always holds', 'pass', n = 1994 and cnt = 0, 'got', n);

  -- ------------------------------------------------------------------ 5. enrichment of an EXISTING game (found through its identifier), user data survives
  select created_at into created_before from public.game_catalog c where c.game_key = 'qzyrion_legacy';
  select count(*) into games_before from public.game_catalog;
  insert into public.entity_game_platforms (entity_id, game_key, platform_key) values (ent_a, 'qzyrion_legacy', 'ps2');
  select x.created_at into created_before from public.entity_game_platforms x where x.entity_id = ent_a and x.game_key = 'qzyrion_legacy' and x.platform_key = 'ps2';
  select count(*) into links_before from public.game_catalog_platforms where game_key = 'qzyrion_legacy';
  imp := private.import_game_catalog_batch('[
    {"source":"WIKIDATA","ref":"QY1","name":"Qzyrion Legacy","popularity":31,"platforms":["pc","ps2","ps1","dreamcast","xbox","game_boy_advance"],"aliases":["Zyra Legacy Edition","Qzyrion Redux"],
     "release_year":2001,"release_date":"2001-02-02","release_date_precision":11,
     "platform_releases":[{"platform":"ps2","year":2001,"date":"2001-02-02","precision":11},{"platform":"xbox","year":2002,"date":"2002-04-04","precision":11}],
     "ids":[{"provider":"steam","id":"910001"},{"provider":"igdb","id":"qzyrion-legacy"}]}
  ]'::jsonb);
  select string_agg(l.platform_key, ',' order by l.platform_key) into got from public.game_catalog_platforms l where l.game_key = 'qzyrion_legacy';
  res := res || jsonb_build_object('step', 'ENRICHMENT: the same canonical game gains the extra platforms (ps1, dreamcast, xbox, gba) and keeps its old ones - no duplicate game, same game_key', 'pass',
    got = 'dreamcast,game_boy_advance,pc,ps1,ps2,xbox' and (select count(*) from public.game_catalog) = games_before and (imp->>'created')::int = 0 and (imp->>'merged')::int = 1, 'got', got);
  res := res || jsonb_build_object('step', 'ENRICHMENT: the year is added to the previously undated game, an existing alias is not duplicated and a new alias/provider id is added once', 'pass',
    (select release_year from public.game_catalog where game_key = 'qzyrion_legacy') = 2001
    and (select count(*) from public.game_catalog_aliases where game_key = 'qzyrion_legacy') = 2
    and (select count(*) from public.game_catalog_provider_ids where game_key = 'qzyrion_legacy') = 3);
  select x.created_at into created_after from public.entity_game_platforms x where x.entity_id = ent_a and x.game_key = 'qzyrion_legacy' and x.platform_key = 'ps2';
  res := res || jsonb_build_object('step', 'ENRICHMENT never touches user data: the owner''s manual declaration (created before the enrichment) is unchanged', 'pass', created_after = created_before and (select count(*) from public.entity_game_platforms) = manual_before + 1);
  select count(*) into cnt from public.game_catalog_platforms where game_key = 'qzyrion_legacy';
  res := res || jsonb_build_object('step', 'enrichment only ADDS platform links (the link count never decreases)', 'pass', cnt >= links_before);

  -- ------------------------------------------------------------------ 6. search shows the canonical year; every accepted search rule still holds
  got := pg_temp.mx_as(ua, $q$ select string_agg(game_key || ':' || coalesce(release_year::text, 'null'), ',' order by game_key) from public.search_game_catalog('qzynova') $q$);
  got2 := pg_temp.mx_as(ua, $q$ select string_agg(game_key || ':' || coalesce(release_year::text, 'null'), ',' order by game_key) from public.search_game_catalog('qzyrion') $q$);
  res := res || jsonb_build_object('step', 'search returns the canonical release year (and NULL, not 0, for a game without one)', 'pass', got = 'qzynova_chronicles:1994' and got2 = 'qzyrion_legacy:2001', 'got', got || ' | ' || got2);
  perform private.import_game_catalog_batch('[{"source":"WIKIDATA","ref":"QY3","name":"Qzyundated Game","platforms":["snes"]}]'::jsonb);
  got := pg_temp.mx_as(ua, $q$ select coalesce(release_year::text, 'NULL') from public.search_game_catalog('qzyundated') $q$);
  res := res || jsonb_build_object('step', 'a catalog game with no release year comes back with NULL', 'pass', got = 'NULL', 'got', got);
  got := pg_temp.mx_as(ua, $q$ select count(*)::text from public.search_game_catalog('qz') $q$);
  got2 := pg_temp.mx_as(ua, $q$ select count(*)::text from public.search_game_catalog('qzyrion%_') $q$);
  got3 := pg_temp.mx_as(ua, $q$ select count(*)::text from public.search_game_catalog('QZYRION') $q$);
  res := res || jsonb_build_object('step', 'search rules unchanged: no query below 3 characters, literal % and _ never act as wildcards, case ignored', 'pass', got = '0' and got2 = got3 and got3 <> '0', 'got', got || ',' || got2 || ',' || got3);
  got := pg_temp.mx_as(ua, $q$ select game_key || ':' || matched_alias || ':' || release_year::text from public.search_game_catalog('zynova') $q$);
  res := res || jsonb_build_object('step', 'alias search still works and carries the year', 'pass', got = 'qzynova_chronicles:Zynova:1994', 'got', got);
  perform private.import_game_catalog_batch((select jsonb_agg(jsonb_build_object('source', 'WIKIDATA', 'ref', 'QYB' || lpad(g::text, 4, '0'), 'name', 'Qzybulk Title ' || lpad(g::text, 4, '0'), 'popularity', g, 'platforms', jsonb_build_array('pc'), 'release_year', 1990 + g % 30, 'release_date', (1990 + g % 30)::text || '-01-01', 'release_date_precision', 9)) from generate_series(1, 60) g));
  got := pg_temp.mx_as(ua, $q$ select count(*)::text from public.search_game_catalog('qzybulk', 500) $q$);
  got2 := pg_temp.mx_as(ua, $q$ select game_key from public.search_game_catalog('qzybulk', 1) $q$);
  res := res || jsonb_build_object('step', 'results stay bounded (never more than 12) and ranking (popularity among equals) is unchanged', 'pass', got = '12' and got2 = 'qzybulk_title_0060', 'got', got || ',' || got2);
  got := pg_temp.mx_role('anon', $q$ select count(*)::text from public.search_game_catalog('qzynova') $q$);
  res := res || jsonb_build_object('step', 'anon still cannot search', 'pass', got like 'ERR:permission denied%', 'got', got);

  -- ------------------------------------------------------------------ 7. the platform picture carries per-platform years
  got := pg_temp.mx_as(ua, $q$ select string_agg((x->>'platform_key') || ':' || coalesce(x->>'release_year', 'null'), ',') from public.get_my_game_platform_state('qzynova_chronicles') s, jsonb_array_elements(s.supported) x $q$);
  res := res || jsonb_build_object('step', 'get_my_game_platform_state lists ONLY the platforms known for that game, in catalog order, each with its own year where known', 'pass', got = 'pc:1998,ps1:1994,ps3:null,xbox_360:2005,dreamcast:1999', 'got', got);
  got := pg_temp.mx_as(ua, $q$ select count(*)::text from public.get_my_game_platform_state('qzynova_chronicles') s, jsonb_array_elements(s.supported) x where x->>'platform_key' in ('nes', 'saturn', 'switch') $q$);
  res := res || jsonb_build_object('step', 'a platform the game does not have is not offered', 'pass', got = '0');

  -- ------------------------------------------------------------------ 8. manual add with historical platforms + Steam merge + removal
  got := pg_temp.mx_as(ua, $q$ select public.save_my_manual_game('qzynova_chronicles', array['ps1', 'dreamcast']) $q$);
  res := res || jsonb_build_object('step', 'manual add with historical platforms (PS1 + Dreamcast) saves as MANUAL', 'pass', got = 'SAVED' and (select count(*) from public.entity_game_platforms x where x.entity_id = ent_a and x.game_key = 'qzynova_chronicles' and x.trust_status = 'MANUAL') = 2, 'got', got);
  got := pg_temp.mx_as(ua, $q$ select public.save_my_manual_game('qzynova_chronicles', array['nes']) $q$);
  got2 := pg_temp.mx_as(ua, $q$ select public.save_my_manual_game('qzynova_chronicles', array['ps1', 'saturn']) $q$);
  res := res || jsonb_build_object('step', 'a platform the catalog does not list for THAT game is rejected even though GamID models it', 'pass', got = 'ERR:INVALID_PLATFORM' and got2 = 'ERR:INVALID_PLATFORM', 'got', got || ' / ' || got2);
  perform private.import_game_catalog_batch('[{"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","platforms":["steam"]}]'::jsonb);   -- the catalog now also lists the Steam store for it (as the real transform does for a Steam id)
  insert into public.discovered_games (connection_id, entity_id, source_provider, external_game_id, game_name, playtime_minutes, trust_status)
  values (conn_a, ent_a, 'steam', '910002', 'Qzynova Chronicles', 90, 'DISCOVERED_FROM_STEAM');
  got := pg_temp.mx_as(ua, $q$ select count(*)::text from public.get_my_discovered_games('steam') where recognized_game_key = 'qzynova_chronicles' $q$);
  got2 := pg_temp.mx_as(ua, $q$ select (select string_agg(x->>'platform_key', ',') from jsonb_array_elements(established) x) || '|' || (select string_agg(x->>'platform_key', ',' order by x->>'platform_key') from jsonb_array_elements(manual) x) from public.get_my_game_platform_state('qzynova_chronicles') $q$);
  res := res || jsonb_build_object('step', 'manual + Steam merge: ONE discovered row resolves to the canonical game; Steam is provider-established, PS1 + Dreamcast are manual', 'pass', got = '1' and got2 = 'steam|dreamcast,ps1', 'got', got || ' ' || got2);
  got := pg_temp.mx_as(ua, $q$ select public.save_my_manual_game('qzynova_chronicles', array['steam', 'ps1']) $q$);
  res := res || jsonb_build_object('step', 'the Steam platform cannot be re-declared by hand', 'pass', got = 'ERR:PLATFORM_ALREADY_DISCOVERED', 'got', got);
  got := pg_temp.mx_as(ua, $q$ select public.remove_my_manual_game('qzynova_chronicles')::text $q$);
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_a and d.external_game_id = '910002' and d.trust_status = 'DISCOVERED_FROM_STEAM' and d.playtime_minutes = 90;
  res := res || jsonb_build_object('step', 'removing the manual platforms leaves the Steam-discovered game intact', 'pass', got = '2' and cnt = 1, 'got', got);
  perform private.import_game_catalog_batch('[{"source":"WIKIDATA","ref":"QY2","name":"Qzynova Chronicles","platforms":["saturn","nes"],"release_year":1994,"release_date":"1994-12-03","release_date_precision":11}]'::jsonb);
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_a and d.external_game_id = '910002' and d.trust_status = 'DISCOVERED_FROM_STEAM';
  res := res || jsonb_build_object('step', 'a later catalog enrichment (more platforms) leaves discovery untouched and now offers the new platforms', 'pass', cnt = 1 and
    pg_temp.mx_as(ua, $q$ select count(*)::text from public.get_my_game_platform_state('qzynova_chronicles') s, jsonb_array_elements(s.supported) x where x->>'platform_key' in ('saturn', 'nes') $q$) = '2');

  -- ------------------------------------------------------------------ 8b. titles that are not plain Latin words still get a valid game_key (follow-up migration 20260922010000)
  imp := private.import_game_catalog_batch('[{"source":"WIKIDATA","ref":"QY4","name":"Él","platforms":["pc"]},{"source":"WIKIDATA","ref":"QY5","name":"ペルソナ","platforms":["ps2"]},{"source":"WIKIDATA","ref":"QY6","name":"N++","platforms":["pc"]}]'::jsonb);
  select cp.game_key into got from public.game_catalog_provider_ids cp where cp.provider = 'wikidata' and cp.external_id = 'QY4';
  select cp.game_key into got2 from public.game_catalog_provider_ids cp where cp.provider = 'wikidata' and cp.external_id = 'QY5';
  res := res || jsonb_build_object('step', 'a single-letter title and a non-Latin title are imported with a VALID game_key (a letter + 1-63 characters) instead of aborting the batch; a title with fewer than 2 normalized characters is skipped', 'pass',
    (imp->>'created')::int = 2 and (imp->>'skipped')::int = 1 and got ~ '^[a-z][a-z0-9_]{1,63}$' and got2 ~ '^g_qy5' and got2 ~ '^[a-z][a-z0-9_]{1,63}$'
    and (select display_name from public.game_catalog where game_key = got) = 'Él' and (select display_name from public.game_catalog where game_key = got2) = 'ペルソナ', 'got', got || ' ' || got2 || ' ' || imp::text);
  got3 := pg_temp.mx_as(ua, $q$ select game_key from public.search_game_catalog('ペルソナ') $q$);
  res := res || jsonb_build_object('step', 'the non-Latin title is searchable by its own characters', 'pass', got3 = got2, 'got', got3);
  -- ------------------------------------------------------------------ 9. security unchanged
  got := pg_temp.mx_as(ua, $q$ select private.import_game_catalog_batch('[]'::jsonb)::text $q$);
  got2 := pg_temp.mx_role('service_role', $q$ select private.import_game_catalog_batch('[]'::jsonb)::text $q$);
  got3 := pg_temp.mx_as(ua, $q$ update public.game_catalog set release_year = 1999, release_date = date '1999-01-01', release_date_precision = 9 $q$);
  res := res || jsonb_build_object('step', 'the importer is still granted to no role, and a normal client still cannot write the catalog or its new columns', 'pass',
    got like 'ERR:permission denied%' and got2 like 'ERR:permission denied%' and got3 like 'ERR:permission denied%', 'got', got || ' / ' || got2 || ' / ' || got3);
  got := pg_temp.mx_as(ub, $q$ select count(*)::text from public.get_my_manual_games() $q$);
  res := res || jsonb_build_object('step', 'another owner still sees none of A''s manual data', 'pass', got = '0');
  select count(*) into cnt from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace, unnest(p.proargmodes) as m where ns.nspname = 'public' and p.proname = 'get_public_identity' and m in ('t', 'o');
  res := res || jsonb_build_object('step', 'PUBLIC BOUNDARY: get_public_identity still returns exactly its 14 columns', 'pass', cnt = 14, 'got', cnt);
  res := res || jsonb_build_object('step', 'no Game Profile was created; real discovered games and real manual declarations are untouched by this whole run', 'pass',
    (select count(*) from public.game_profiles) = profiles_before and (select count(*) from public.discovered_games) = discovered_before + 1 and (select count(*) from public.entity_game_platforms) = manual_before + 1);
  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
