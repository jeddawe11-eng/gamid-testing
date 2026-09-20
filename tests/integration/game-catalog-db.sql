-- Canonical Game Catalog + manual game declarations - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/game-catalog-db.sql
-- (Requires migration 20260921210000 to be applied. To validate the migration BEFORE applying it, run the migration's content and this file's
--  content wrapped together in one always-failing statement: everything rolls back either way.)
--
-- Uses ONLY disposable auth users / identities and invented catalog games ("Qzx..." names) created inside the transaction, impersonates anon / authenticated /
-- service_role exactly as PostgREST does, and ALWAYS raises an exception carrying the results, so the whole transaction rolls back and nothing (including @black,
-- the real Steam/Discord connections, the League profile, discovered games, the imported catalog and every visibility flag) is touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();   -- owner with a Steam connection and discovered games
  ub uuid := gen_random_uuid();   -- another owner (no Steam)
  uc uuid := gen_random_uuid();   -- unverified email
  ent_a uuid; ent_b uuid; conn_a uuid;
  att uuid; st text;
  got text; got2 text; got3 text;
  n integer; cnt integer; i integer; flag boolean; r record;
  js jsonb; jq jsonb; imp jsonb;
  discovered_before integer; catalog_before integer; profiles_before integer; first_seen_before timestamptz;
begin
  select count(*) into discovered_before from public.discovered_games;
  select count(*) into catalog_before from public.game_catalog;
  select count(*) into profiles_before from public.game_profiles;

  -- helpers: run a statement as a signed-in user / anon and hand back its text result, or 'ERR:<message>'
  execute $fn$
    create function pg_temp.mg_as(p_user uuid, p_sql text) returns text language plpgsql as $f$
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
    create function pg_temp.mg_anon(p_sql text) returns text language plpgsql as $f$
    declare out text;
    begin
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      set local role anon;
      begin execute p_sql into out; exception when others then out := 'ERR:' || sqlerrm; end;
      reset role;
      return out;
    end $f$;
  $fn$;
  execute $fn$
    create function pg_temp.mg_service(p_sql text) returns text language plpgsql as $f$
    declare out text;
    begin
      perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
      set local role service_role;
      begin execute p_sql into out; exception when others then out := 'ERR:' || sqlerrm; end;
      reset role;
      return out;
    end $f$;
  $fn$;

  -- ------------------------------------------------------------------ setup: disposable owners, a real accepted Steam connection for A
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'zcat-a@example.invalid', now()), (ub, 'zcat-b@example.invalid', now()), (uc, 'zcat-c@example.invalid', null);
  for r in select * from (values (ua, 'zcata'), (ub, 'zcatb')) as v(u, h) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
    set local role authenticated; perform 1 from public.create_solo_identity(r.h, 'Zed ' || r.h, date '1990-01-01', 'en'); reset role;
  end loop;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zcata';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zcatb';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c;
  select public.complete_steam_connection_attempt(att, '76561198000000031') into got;
  reset role;
  select g.connection_id into conn_a from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam';
  res := res || jsonb_build_object('step', 'setup: disposable owners; A has an authenticated Steam connection', 'pass', conn_a is not null and ent_b is not null);

  -- ------------------------------------------------------------------ 1. structure / privileges
  select count(*) into cnt from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname in ('game_platforms', 'game_catalog', 'game_catalog_aliases', 'game_catalog_platforms', 'game_catalog_provider_ids', 'entity_game_platforms') and c.relrowsecurity;
  res := res || jsonb_build_object('step', 'RLS is enabled on all six new tables', 'pass', cnt = 6);

  n := 0;
  for r in select * from (values ('public.game_platforms'), ('public.game_catalog'), ('public.game_catalog_aliases'), ('public.game_catalog_platforms'), ('public.game_catalog_provider_ids'), ('public.entity_game_platforms')) as v(t) loop
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin execute 'select 1 from ' || r.t || ' limit 1'; exception when insufficient_privilege then n := n + 1; end;
    begin execute 'insert into ' || r.t || ' select * from ' || r.t; exception when insufficient_privilege then n := n + 1; end;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    begin execute 'select 1 from ' || r.t || ' limit 1'; exception when insufficient_privilege then n := n + 1; end;
    reset role;
  end loop;
  res := res || jsonb_build_object('step', 'authenticated AND anon have no table access to the catalog or the manual declarations (the catalog is not client-writable)', 'pass', n = 18, 'denied', n);

  got := pg_temp.mg_as(ua, $q$ update public.game_catalog set display_name = 'Hacked' $q$);
  got2 := pg_temp.mg_as(ua, $q$ delete from public.game_catalog_platforms $q$);
  res := res || jsonb_build_object('step', 'a normal client cannot update or delete catalog rows', 'pass', got like 'ERR:permission denied%' and got2 like 'ERR:permission denied%', 'got', got || ' / ' || got2);

  got := pg_temp.mg_as(ua, $q$ select private.import_game_catalog_batch('[]'::jsonb)::text $q$);
  got2 := pg_temp.mg_service($q$ select private.import_game_catalog_batch('[]'::jsonb)::text $q$);
  got3 := pg_temp.mg_anon($q$ select private.import_game_catalog_batch('[]'::jsonb)::text $q$);
  res := res || jsonb_build_object('step', 'the catalog import is reachable by NO client role (not authenticated, anon or even service_role)', 'pass',
    got like 'ERR:permission denied%' and got2 like 'ERR:permission denied%' and got3 like 'ERR:permission denied%', 'got', got || ' / ' || got2 || ' / ' || got3);

  n := 0;
  for r in select * from (values
    ($q$ select count(*)::text from public.search_game_catalog('marvel') $q$),
    ($q$ select count(*)::text from public.get_my_manual_games() $q$),
    ($q$ select count(*)::text from public.get_my_game_platform_state('marvel_rivals') $q$),
    ($q$ select public.save_my_manual_game('marvel_rivals', array['pc']) $q$),
    ($q$ select public.remove_my_manual_game('marvel_rivals')::text $q$)) as v(s) loop
    if pg_temp.mg_anon(r.s) like 'ERR:permission denied%' then n := n + 1; end if;
  end loop;
  res := res || jsonb_build_object('step', 'anon cannot call search, read, save or remove', 'pass', n = 5, 'denied', n);

  select count(*) into cnt from pg_indexes where schemaname = 'public' and indexdef ilike '%gin%gin_trgm_ops%' and tablename in ('game_catalog', 'game_catalog_aliases');
  res := res || jsonb_build_object('step', 'search is indexed (trigram GIN on the catalog and the aliases)', 'pass', cnt = 2);

  -- ------------------------------------------------------------------ 2. the seed: only what the recognition map already named
  select count(*) into cnt from public.game_catalog c where c.game_key = 'marvel_rivals' and c.catalog_source = 'GAMID_RECOGNITION' and c.display_name = 'Marvel Rivals';
  select count(*) into n from public.game_catalog_provider_ids p where p.provider = 'steam' and p.external_id = '2767030' and p.game_key = 'marvel_rivals';
  res := res || jsonb_build_object('step', 'Marvel Rivals is in the catalog ONLY because the accepted recognition map names it (Steam App ID 2767030 is an identifier of the canonical game)', 'pass', cnt = 1 and n = 1);
  select count(*) into cnt from public.game_catalog_platforms p where p.game_key = 'marvel_rivals' and p.platform_key in ('steam', 'pc');
  res := res || jsonb_build_object('step', 'the seed gives Marvel Rivals the platforms Steam itself establishes (Steam + its PC parent)', 'pass', cnt = 2);
  select count(*) into cnt from public.game_platforms p where p.platform_key in ('pc', 'steam', 'epic_games', 'ps4', 'ps5', 'xbox_one', 'xbox_series', 'switch', 'switch2', 'ios', 'android');
  select count(*) into n from public.game_platforms p where p.platform_key in ('steam', 'epic_games') and p.parent_platform_key = 'pc' and p.family = 'PC';
  res := res || jsonb_build_object('step', 'platform model: 11 normalized platforms; Steam and Epic are storefronts UNDER PC (PC is not Steam)', 'pass', cnt = 11 and n = 2);

  -- ------------------------------------------------------------------ 3. normalization
  res := res || jsonb_build_object('step', 'normalization: case, apostrophes, punctuation and symbols are folded', 'pass',
    private.game_search_normalize('  Marvel''s  Spider-Man™: MILES ') = 'marvels spider man miles' and private.game_search_normalize('') = '' and private.game_search_normalize(null) = '');

  -- ------------------------------------------------------------------ 4. import: merge-first, idempotent, only adds
  imp := private.import_game_catalog_batch('[
    {"source":"WIKIDATA","ref":"QT1","name":"Qzxplore Saga","popularity":40,"platforms":["pc","ps5","not_a_platform"],"aliases":["Zorkling Chronicles","Qzxplore Saga"],"ids":[{"provider":"steam","id":"900001"},{"provider":"igdb","id":"qzxplore-saga"}]},
    {"source":"WIKIDATA","ref":"QT2","name":"Qzxplore Saga: Reborn","popularity":10,"platforms":["pc","xbox_series","ps5"]},
    {"source":"WIKIDATA","ref":"QT3","name":"Xenoqzx Origins","popularity":99,"platforms":["switch"]},
    {"source":"WIKIDATA","ref":"QT4","name":"Qzxvel''s Spider-Man","popularity":5,"platforms":["ps5"]},
    {"source":"WIKIDATA","ref":"QT1","name":"Qzxplore Saga","popularity":45,"platforms":["xbox_one"]},
    {"source":"WIKIDATA","ref":"QT1B","name":"Qzxplore Saga (alt entry)","popularity":1,"platforms":[],"ids":[{"provider":"steam","id":"900001"}]},
    {"source":"WIKIDATA","ref":"QT9","name":"Qzxplore Saga","popularity":2,"platforms":["ios"]},
    {"source":"WIKIDATA","ref":"QMR","name":"Marvel Rivals","popularity":22,"platforms":["xbox_series","ps5"],"ids":[{"provider":"steam","id":"2767030"},{"provider":"igdb","id":"marvel-rivals"}]},
    {"source":"WIKIDATA","ref":"","name":"No Ref Game"},
    {"source":"WIKIDATA","ref":"QEMPTY","name":"   "}
  ]'::jsonb);
  res := res || jsonb_build_object('step', 'import result: new games created, repeated/identifier-matched items MERGED, invalid items skipped', 'pass',
    (imp->>'created')::int = 5 and (imp->>'merged')::int = 3 and (imp->>'skipped')::int = 2, 'got', imp);
  select count(*) into cnt from public.game_catalog c where c.game_key = 'qzxplore_saga' and c.display_name = 'Qzxplore Saga' and c.popularity = 45 and c.catalog_source = 'WIKIDATA';
  res := res || jsonb_build_object('step', 'a repeated import of the same source id does not duplicate the game (popularity only ever rises)', 'pass', cnt = 1);
  select count(*) into cnt from public.game_catalog_provider_ids p where p.game_key = 'qzxplore_saga' and ((p.provider = 'steam' and p.external_id = '900001') or (p.provider = 'wikidata' and p.external_id in ('QT1', 'QT1B')) or (p.provider = 'igdb' and p.external_id = 'qzxplore-saga'));
  res := res || jsonb_build_object('step', 'provider identifiers (Steam / IGDB / Wikidata) are attributes of the ONE canonical game; a second source entry with the same Steam id joined it', 'pass', cnt = 4);
  select count(*) into cnt from public.game_catalog c where c.display_name = 'Qzxplore Saga';
  res := res || jsonb_build_object('step', 'an unrelated game with an identical name gets a distinct canonical key instead of overwriting the first', 'pass', cnt = 2 and exists (select 1 from public.game_catalog c where c.game_key = 'qzxplore_saga_qt9'));
  select count(*) into cnt from public.game_catalog_platforms p where p.game_key = 'qzxplore_saga' and p.platform_key in ('pc', 'ps5', 'xbox_one');
  select count(*) into n from public.game_catalog_platforms p where p.game_key = 'qzxplore_saga';
  res := res || jsonb_build_object('step', 'platforms accumulate and an unknown platform key is ignored, never stored', 'pass', cnt = 3 and n = 3);
  select count(*) into cnt from public.game_catalog_aliases a where a.game_key = 'qzxplore_saga';
  res := res || jsonb_build_object('step', 'aliases: kept, and an alias equal to the name is not stored twice', 'pass', cnt = 1);
  select count(*) into cnt from public.game_catalog c where c.game_key = 'marvel_rivals';
  select count(*) into n from public.game_catalog_platforms p where p.game_key = 'marvel_rivals' and p.platform_key in ('steam', 'pc', 'xbox_series', 'ps5');
  res := res || jsonb_build_object('step', 'a source entry for Marvel Rivals MERGED into the existing canonical key (found through the Steam id) - no "marvel_rivals_q..." duplicate', 'pass',
    cnt = 1 and n = 4 and (select count(*) from public.game_catalog c where c.display_name = 'Marvel Rivals') = 1);

  -- ------------------------------------------------------------------ 5. search
  got := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('qz') $q$);
  got2 := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('  q z ') $q$);
  got3 := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('--''') $q$);
  res := res || jsonb_build_object('step', 'SEARCH: fewer than 3 meaningful characters returns nothing (enforced on the server, spaces and punctuation do not count)', 'pass', got = '0' and got2 = '0' and got3 = '0', 'got', got || got2 || got3);

  got := pg_temp.mg_as(ua, $q$ select string_agg(game_key, ',' order by ord) from (select game_key, row_number() over () as ord from public.search_game_catalog('qzx')) s $q$);
  res := res || jsonb_build_object('step', 'SEARCH at 3 characters returns matches, exact/prefix first then by popularity, substring matches last', 'pass',
    got = 'qzxplore_saga,qzxplore_saga_reborn,qzxvels_spider_man,qzxplore_saga_qt9,xenoqzx_origins', 'got', got);
  got := pg_temp.mg_as(ua, $q$ select string_agg(game_key, ',' order by ord) from (select game_key, row_number() over () as ord from public.search_game_catalog('qzxp')) s $q$);
  res := res || jsonb_build_object('step', 'SEARCH narrows as characters are added (qzxp is a strict subset of qzx)', 'pass', got = 'qzxplore_saga,qzxplore_saga_reborn,qzxplore_saga_qt9', 'got', got);
  got := pg_temp.mg_as(ua, $q$ select string_agg(game_key, ',' order by ord) from (select game_key, row_number() over () as ord from public.search_game_catalog('QZXPLORE SAGA')) s $q$);
  res := res || jsonb_build_object('step', 'SEARCH is case-insensitive and ranks the exact name first', 'pass', got like 'qzxplore_saga,%', 'got', got);
  got := pg_temp.mg_as(ua, $q$ select string_agg(game_key, ',' order by game_key) from public.search_game_catalog('qzxplore    saga') $q$);
  got2 := pg_temp.mg_as(ua, $q$ select string_agg(game_key, ',' order by game_key) from public.search_game_catalog('qzxploresaga') $q$);
  res := res || jsonb_build_object('step', 'SEARCH is whitespace tolerant (extra spaces / no spaces find the same games)', 'pass', got = got2 and got like '%qzxplore_saga%', 'got', got || ' | ' || got2);
  got := pg_temp.mg_as(ua, $q$ select game_key from public.search_game_catalog('qzxvels spider man') $q$);
  got2 := pg_temp.mg_as(ua, $q$ select game_key from public.search_game_catalog('qzxvels spiderman') $q$);
  res := res || jsonb_build_object('step', 'SEARCH is punctuation tolerant (apostrophe and hyphen are ignored)', 'pass', got = 'qzxvels_spider_man' and got2 = 'qzxvels_spider_man', 'got', got || ' | ' || got2);
  got := pg_temp.mg_as(ua, $q$ select game_key || ':' || matched_alias from public.search_game_catalog('zorkling') $q$);
  res := res || jsonb_build_object('step', 'SEARCH finds a game through its alias and says which alias matched', 'pass', got = 'qzxplore_saga:Zorkling Chronicles', 'got', got);
  got := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('qzxplore') where matched_alias is not null $q$);
  res := res || jsonb_build_object('step', 'SEARCH: a direct name match reports no alias', 'pass', got = '0');

  -- bounded
  perform private.import_game_catalog_batch((select jsonb_agg(jsonb_build_object('source', 'WIKIDATA', 'ref', 'QB' || lpad(g::text, 4, '0'), 'name', 'Qzxbulk Title ' || lpad(g::text, 4, '0'), 'popularity', g, 'platforms', jsonb_build_array('pc'))) from generate_series(1, 305) g));
  got := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('qzxbulk') $q$);
  got2 := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('qzxbulk', 500) $q$);
  got3 := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('qzxbulk', 3) $q$);
  res := res || jsonb_build_object('step', 'SEARCH is bounded: 305 matches -> 10 by default, never more than 12 whatever the caller asks, and a small limit is honored', 'pass', got = '10' and got2 = '12' and got3 = '3', 'got', got || ',' || got2 || ',' || got3);
  got := pg_temp.mg_as(ua, $q$ select game_key from public.search_game_catalog('qzxbulk', 1) $q$);
  res := res || jsonb_build_object('step', 'SEARCH: among equal matches the more popular game comes first', 'pass', got = 'qzxbulk_title_0305', 'got', got);
  got := pg_temp.mg_as(ua, format($q$ select count(*)::text from public.search_game_catalog(%L) $q$, repeat('a', 500)));
  res := res || jsonb_build_object('step', 'SEARCH: an oversized query is refused quietly (returns nothing)', 'pass', got = '0');
  got := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('%%%') $q$);
  got2 := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('qzx%_') $q$);
  got3 := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('qzx') $q$);
  res := res || jsonb_build_object('step', 'SEARCH: LIKE wildcards typed by a user are never interpreted (they are stripped: ''%%%'' finds nothing, ''qzx%_'' behaves exactly like ''qzx'')', 'pass', got = '0' and got2 = got3 and got3 <> '0', 'got', got || ',' || got2 || ',' || got3);
  -- a deactivated catalog game disappears everywhere (search, state, save) without deleting anything
  update public.game_catalog set is_active = false where game_key = 'xenoqzx_origins';
  got := pg_temp.mg_as(ua, $q$ select count(*)::text from public.search_game_catalog('xenoqzx') $q$);
  got2 := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('xenoqzx_origins', array['switch']) $q$);
  got3 := pg_temp.mg_as(ua, $q$ select 'x' from public.get_my_game_platform_state('xenoqzx_origins') $q$);
  update public.game_catalog set is_active = true where game_key = 'xenoqzx_origins';
  res := res || jsonb_build_object('step', 'an inactive catalog game is not searchable, not selectable and not saveable', 'pass', got = '0' and got2 = 'ERR:INVALID_GAME' and got3 = 'ERR:INVALID_GAME', 'got', got || ' / ' || got2 || ' / ' || got3);
  -- ------------------------------------------------------------------ 6. Steam discovery: unchanged rows, now also resolved to canonical keys
  insert into public.discovered_games (connection_id, entity_id, source_provider, external_game_id, game_name, playtime_minutes, trust_status)
  values (conn_a, ent_a, 'steam', '2767030', 'Marvel Rivals', 120, 'DISCOVERED_FROM_STEAM'),
         (conn_a, ent_a, 'steam', '900001', 'Qzxplore Saga', 60, 'DISCOVERED_FROM_STEAM'),
         (conn_a, ent_a, 'steam', '900002', 'Unmapped Steam Thing', 5, 'DISCOVERED_FROM_STEAM');
  select d.first_seen_at into first_seen_before from public.discovered_games d where d.connection_id = conn_a and d.external_game_id = '2767030';
  got := pg_temp.mg_as(ua, $q$ select string_agg(external_game_id || '=' || coalesce(recognized_game_key, '-') || '/' || coalesce(recognized_name, '-'), ',' order by external_game_id) from public.get_my_discovered_games('steam') $q$);
  res := res || jsonb_build_object('step', 'discovered Steam games keep their rows and resolve to canonical keys (recognition map first, then the catalog identifiers); an unknown app stays unrecognized', 'pass',
    got = '2767030=marvel_rivals/Marvel Rivals,900001=qzxplore_saga/Qzxplore Saga,900002=-/-', 'got', got);
  got := pg_temp.mg_as(ua, $q$ select count(*)::text from public.get_my_discovered_games('steam') $q$);
  res := res || jsonb_build_object('step', 'the discovered list still has exactly its own rows (the catalog adds none)', 'pass', got = '3');

  -- ------------------------------------------------------------------ 7. platform state
  got := pg_temp.mg_as(ua, $q$ select (select string_agg(x->>'platform_key', ',') from jsonb_array_elements(supported) x) || '|' || (select coalesce(string_agg(x->>'platform_key', ','), '') from jsonb_array_elements(established) x) || '|' || (select coalesce(string_agg(x->>'platform_key', ','), '') from jsonb_array_elements(manual) x) from public.get_my_game_platform_state('marvel_rivals') $q$);
  res := res || jsonb_build_object('step', 'STATE (discovered game): the catalog platforms in catalog order, Steam shown as PROVIDER-ESTABLISHED, nothing manual yet', 'pass', got like 'pc,steam,%ps5,xbox_series|steam|', 'got', got);   -- (a fully imported catalog also lists Epic between Steam and PS5)
  got := pg_temp.mg_as(ub, $q$ select (select coalesce(string_agg(x->>'platform_key', ','), '') from jsonb_array_elements(established) x) from public.get_my_game_platform_state('marvel_rivals') $q$);
  res := res || jsonb_build_object('step', 'STATE: another owner sees no provider provenance of A (no cross-identity leak)', 'pass', got = '', 'got', got);
  got := pg_temp.mg_as(ua, $q$ select 'x' from public.get_my_game_platform_state('no_such_game') $q$);
  res := res || jsonb_build_object('step', 'STATE: an unknown canonical id is rejected', 'pass', got = 'ERR:INVALID_GAME', 'got', got);

  -- ------------------------------------------------------------------ 8. manual add: one platform, then several
  got := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('qzxplore_saga_reborn', array['xbox_series']) $q$);
  res := res || jsonb_build_object('step', 'MANUAL ADD with ONE platform saves', 'pass', got = 'SAVED', 'got', got);
  got := pg_temp.mg_as(ua, $q$ select trust_status || ':' || (select string_agg(x->>'platform_key', ',') from jsonb_array_elements(platforms) x) from public.get_my_manual_games() where game_key = 'qzxplore_saga_reborn' $q$);
  res := res || jsonb_build_object('step', 'the manual game is MANUAL (never VERIFIED / CONNECTED / discovered-via) and lists its platform', 'pass', got = 'MANUAL:xbox_series', 'got', got);
  got := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('qzxplore_saga_reborn', array['xbox_series', 'pc', 'ps5', 'pc']) $q$);
  got2 := pg_temp.mg_as(ua, $q$ select string_agg(x->>'platform_key', ',') from public.get_my_manual_games() g, jsonb_array_elements(g.platforms) x where g.game_key = 'qzxplore_saga_reborn' $q$);
  res := res || jsonb_build_object('step', 'MANUAL ADD with MULTIPLE platforms (duplicates in the request collapse)', 'pass', got = 'SAVED' and got2 = 'pc,ps5,xbox_series', 'got', got2);
  select count(*) into cnt from public.entity_game_platforms x where x.entity_id = ent_a and x.trust_status = 'MANUAL';
  res := res || jsonb_build_object('step', 'every stored declaration carries trust MANUAL', 'pass', cnt = 3);
  got := pg_temp.mg_as(ua, $q$ select count(*)::text from public.get_my_manual_games() $q$);
  res := res || jsonb_build_object('step', 'a manual-only game is ONE entry however many platforms it has', 'pass', got = '1');

  -- edit
  got := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('qzxplore_saga_reborn', array['ps5']) $q$);
  got2 := pg_temp.mg_as(ua, $q$ select string_agg(x->>'platform_key', ',') from public.get_my_manual_games() g, jsonb_array_elements(g.platforms) x where g.game_key = 'qzxplore_saga_reborn' $q$);
  res := res || jsonb_build_object('step', 'EDIT: saving a smaller set removes the un-ticked manual platforms and keeps the rest', 'pass', got = 'SAVED' and got2 = 'ps5', 'got', got2);

  -- rejections
  got := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('no_such_game', array['pc']) $q$);
  got2 := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('Qzxplore Saga', array['pc']) $q$);
  got3 := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game(null, array['pc']) $q$);
  res := res || jsonb_build_object('step', 'an invalid canonical game id is rejected; a display name is NOT accepted as identity', 'pass',
    got = 'ERR:INVALID_GAME' and got2 = 'ERR:INVALID_GAME' and got3 = 'ERR:INVALID_GAME', 'got', got || ' / ' || got2 || ' / ' || got3);
  got := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('qzxplore_saga_reborn', array['switch']) $q$);
  got2 := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('qzxplore_saga_reborn', array['pc', 'atari_2600']) $q$);
  got3 := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('qzxplore_saga_reborn', array['pc', null]) $q$);
  res := res || jsonb_build_object('step', 'a platform the catalog does not list for THIS game (or one that does not exist, or null) is rejected, and nothing partial is saved', 'pass',
    got = 'ERR:INVALID_PLATFORM' and got2 = 'ERR:INVALID_PLATFORM' and got3 = 'ERR:INVALID_PLATFORM'
    and pg_temp.mg_as(ua, $q$ select string_agg(x->>'platform_key', ',') from public.get_my_manual_games() g, jsonb_array_elements(g.platforms) x where g.game_key = 'qzxplore_saga_reborn' $q$) = 'ps5', 'got', got || ' / ' || got2 || ' / ' || got3);
  got := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('qzxplore_saga_reborn', array[]::text[]) $q$);
  got2 := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('qzxplore_saga_reborn', null) $q$);
  res := res || jsonb_build_object('step', 'saving with no platform is rejected (removal is a separate explicit action)', 'pass', got = 'ERR:NO_PLATFORMS' and got2 = 'ERR:NO_PLATFORMS', 'got', got || ' / ' || got2);
  got := pg_temp.mg_as(uc, $q$ select public.save_my_manual_game('qzxplore_saga_reborn', array['pc']) $q$);
  res := res || jsonb_build_object('step', 'an unverified email cannot write', 'pass', got = 'ERR:EMAIL_NOT_VERIFIED', 'got', got);

  -- table-level guards (as the database owner: the constraints themselves hold)
  begin insert into public.entity_game_platforms (entity_id, game_key, platform_key, trust_status) values (ent_a, 'qzxplore_saga_reborn', 'pc', 'VERIFIED'); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; when others then got := sqlerrm; end;
  begin insert into public.entity_game_platforms (entity_id, game_key, platform_key) values (ent_a, 'qzxplore_saga_reborn', 'switch'); got2 := 'NO_ERROR'; exception when foreign_key_violation then got2 := 'FK'; when others then got2 := sqlerrm; end;
  res := res || jsonb_build_object('step', 'DATABASE CHECK: a declaration can never be anything but MANUAL, and can only name a platform the catalog lists for that game', 'pass', got = 'CHECK' and got2 = 'FK', 'got', got || ' / ' || got2);

  -- ------------------------------------------------------------------ 9. MERGE with a provider discovery (the Marvel Rivals scenario)
  got := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('marvel_rivals', array['ps5']) $q$);
  res := res || jsonb_build_object('step', 'MERGE: manually adding a platform to a game already discovered through Steam saves', 'pass', got = 'SAVED', 'got', got);
  got := pg_temp.mg_as(ua, $q$ select count(*)::text from public.get_my_discovered_games('steam') where recognized_game_key = 'marvel_rivals' $q$);
  got2 := pg_temp.mg_as(ua, $q$ select count(*)::text from public.get_my_discovered_games('steam') $q$);
  res := res || jsonb_build_object('step', 'MERGE: still exactly ONE Marvel Rivals row in the discovered list (no duplicate, no second library row)', 'pass', got = '1' and got2 = '3');
  got := pg_temp.mg_as(ua, $q$ select (select string_agg(x->>'platform_key', ',') from jsonb_array_elements(established) x) || '|' || (select string_agg(x->>'platform_key', ',') from jsonb_array_elements(manual) x) from public.get_my_game_platform_state('marvel_rivals') $q$);
  res := res || jsonb_build_object('step', 'MERGE: Steam stays provider-ESTABLISHED and PlayStation 5 is MANUAL - two separate provenances on the same canonical game', 'pass', got = 'steam|ps5', 'got', got);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a and d.trust_status = 'DISCOVERED_FROM_STEAM';
  res := res || jsonb_build_object('step', 'MERGE: the manual save changed no discovered game (still DISCOVERED_FROM_STEAM, nothing "discovered via PlayStation")', 'pass', cnt = 3);
  got := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('marvel_rivals', array['steam']) $q$);
  got2 := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('marvel_rivals', array['ps5', 'steam']) $q$);
  res := res || jsonb_build_object('step', 'MERGE: a platform a provider already established cannot be re-declared manually (provider provenance cannot be duplicated or overwritten)', 'pass',
    got = 'ERR:PLATFORM_ALREADY_DISCOVERED' and got2 = 'ERR:PLATFORM_ALREADY_DISCOVERED', 'got', got || ' / ' || got2);
  got := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('marvel_rivals', array['ps5', 'xbox_series']) $q$);
  got2 := pg_temp.mg_as(ua, $q$ select public.save_my_manual_game('marvel_rivals', array['xbox_series']) $q$);
  got3 := pg_temp.mg_as(ua, $q$ select string_agg(x->>'platform_key', ',') from public.get_my_manual_games() g, jsonb_array_elements(g.platforms) x where g.game_key = 'marvel_rivals' $q$);
  res := res || jsonb_build_object('step', 'EDIT a merged game: manual platforms can be added and removed; the Steam provenance is not part of that editor', 'pass', got = 'SAVED' and got2 = 'SAVED' and got3 = 'xbox_series', 'got', got3);
  got := pg_temp.mg_as(ua, $q$ select public.remove_my_manual_game('marvel_rivals')::text $q$);
  got2 := pg_temp.mg_as(ua, $q$ select count(*)::text from public.get_my_manual_games() where game_key = 'marvel_rivals' $q$);
  res := res || jsonb_build_object('step', 'REMOVE on a merged game deletes the manual declarations only', 'pass', got = '1' and got2 = '0', 'got', got);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a and d.external_game_id = '2767030' and d.trust_status = 'DISCOVERED_FROM_STEAM' and d.first_seen_at = first_seen_before and d.playtime_minutes = 120;
  got := pg_temp.mg_as(ua, $q$ select count(*)::text from public.get_my_discovered_games('steam') where recognized_game_key = 'marvel_rivals' $q$);
  res := res || jsonb_build_object('step', 'REMOVE: the Steam-discovered Marvel Rivals row survives untouched (same provenance, first-seen and playtime)', 'pass', cnt = 1 and got = '1');

  -- ------------------------------------------------------------------ 10. manual-only removal
  got := pg_temp.mg_as(ua, $q$ select public.remove_my_manual_game('qzxplore_saga_reborn')::text $q$);
  got2 := pg_temp.mg_as(ua, $q$ select public.remove_my_manual_game('qzxplore_saga_reborn')::text $q$);
  got3 := pg_temp.mg_as(ua, $q$ select count(*)::text from public.get_my_manual_games() $q$);
  res := res || jsonb_build_object('step', 'a manual-only game can be removed; removing it again is a harmless no-op', 'pass', got = '1' and got2 = '0' and got3 = '0', 'got', got || got2 || got3);
  got := pg_temp.mg_as(ua, $q$ select public.remove_my_manual_game('no_such_game')::text $q$);
  res := res || jsonb_build_object('step', 'removing an unknown id is a no-op that touches nothing', 'pass', got = '0');
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'discovered games are not reachable from the manual functions (still all 3)', 'pass', cnt = 3);

  -- ------------------------------------------------------------------ 11. isolation between owners
  got := pg_temp.mg_as(ub, $q$ select public.save_my_manual_game('qzxplore_saga', array['pc', 'ps5']) $q$);
  got2 := pg_temp.mg_as(ua, $q$ select public.remove_my_manual_game('qzxplore_saga')::text $q$);
  got3 := pg_temp.mg_as(ub, $q$ select count(*)::text from public.get_my_manual_games() $q$);
  res := res || jsonb_build_object('step', 'ISOLATION: A cannot remove or edit B''s declarations (A''s remove touches 0 rows, B still has hers)', 'pass', got = 'SAVED' and got2 = '0' and got3 = '1', 'got', got || got2 || got3);
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_a and d.trust_status = 'DISCOVERED_FROM_STEAM';
  res := res || jsonb_build_object('step', 'a provider-discovered game cannot be deleted through manual removal: A removing a game she only has through Steam discovery touches nothing (0 rows) and all 3 discovered rows remain', 'pass', got2 = '0' and cnt = 3);
  got := pg_temp.mg_as(ua, $q$ select count(*)::text from public.get_my_manual_games() $q$);
  res := res || jsonb_build_object('step', 'ISOLATION: A does not see B''s manual games', 'pass', got = '0');
  select count(*) into cnt from public.entity_game_platforms x where x.entity_id = ent_b and x.game_key = 'qzxplore_saga';
  res := res || jsonb_build_object('step', 'ISOLATION: B''s two declarations are intact', 'pass', cnt = 2);
  res := res || jsonb_build_object('step', 'a game with a catalog Steam id is NOT shown as Steam-established for an owner who has no such Steam discovery', 'pass',
    pg_temp.mg_as(ub, $q$ select coalesce(string_agg(x->>'platform_key', ','), '') from public.get_my_game_platform_state('qzxplore_saga') s, jsonb_array_elements(s.established) x $q$) = '');
  got := pg_temp.mg_as(ua, $q$ select coalesce(string_agg(x->>'platform_key', ','), '') from public.get_my_game_platform_state('qzxplore_saga') s, jsonb_array_elements(s.established) x $q$);
  res := res || jsonb_build_object('step', 'a Steam-discovered game resolved through a catalog identifier is Steam-established for its owner', 'pass', got = 'steam', 'got', got);

  -- ------------------------------------------------------------------ 12. per-identity limit
  n := 0;
  for i in 1..300 loop
    if pg_temp.mg_as(ub, format($q$ select public.save_my_manual_game('qzxbulk_title_%s', array['pc']) $q$, lpad(i::text, 4, '0'))) = 'SAVED' then n := n + 1; end if;
  end loop;
  got := pg_temp.mg_as(ub, $q$ select public.save_my_manual_game('qzxbulk_title_0301', array['pc']) $q$);
  got2 := pg_temp.mg_as(ub, $q$ select public.save_my_manual_game('qzxbulk_title_0001', array['pc']) $q$);
  res := res || jsonb_build_object('step', 'LIMIT: at most 300 manual games per identity; editing an existing one still works at the limit', 'pass', n >= 299 and got = 'ERR:GAME_LIMIT_REACHED' and got2 = 'SAVED', 'got', n::text || ' ' || got || ' ' || got2);
  got := pg_temp.mg_as(ub, $q$ select count(*)::text from public.get_my_manual_games() $q$);
  res := res || jsonb_build_object('step', 'the manual list is bounded', 'pass', got::int <= 300, 'got', got);

  -- ------------------------------------------------------------------ 13. nothing else was touched
  select count(*) into cnt from public.game_profiles;
  res := res || jsonb_build_object('step', 'Game Profiles untouched (no profile, stat, rank or verification was created)', 'pass', cnt = profiles_before);
  select count(*) into cnt from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace, unnest(p.proargmodes) as m
  where ns.nspname = 'public' and p.proname = 'get_public_identity' and m in ('t', 'o');
  res := res || jsonb_build_object('step', 'PUBLIC BOUNDARY: get_public_identity still returns exactly its 14 columns (no game, catalog or platform data)', 'pass', cnt = 14, 'got', cnt);
  res := res || jsonb_build_object('step', 'the seeded catalog and the real discovered games were only ever added to inside this rolled-back run', 'pass', (select count(*) from public.discovered_games) = discovered_before + 3 and (select count(*) from public.game_catalog) > catalog_before);
  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
