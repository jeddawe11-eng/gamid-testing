-- Public My Games - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/public-my-games-db.sql
-- (Requires migration 20260922100000 to be applied. To validate the migration BEFORE applying it, run the migration's content and this file's
--  content wrapped together in one always-failing statement: everything rolls back either way.)
--
-- Uses ONLY disposable auth users / identities and invented catalog games ("Qzp..." names) created inside the transaction, impersonates anon / authenticated /
-- service_role exactly as PostgREST does, and ALWAYS raises an exception carrying the results, so the whole transaction rolls back and nothing (including @black,
-- the real Steam/Discord connections, discovered games, the League profile, manual declarations and every visibility flag) is touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();   -- rich owner: Steam + discovered games + manual games + League + a Game Profile
  ub uuid := gen_random_uuid();   -- Discord-only owner (no games at all)
  uc uuid := gen_random_uuid();   -- scale owner: 1,300 games
  ent_a uuid; ent_b uuid; ent_c uuid; conn_a uuid; conn_c uuid; qr_a text;
  flag boolean; flag2 boolean;
  att uuid; st text;
  got text; got2 text; got3 text; got4 text; keys text;
  n integer; cnt integer; i integer; off integer; seen integer; dup integer; page_n integer;
  js jsonb; jq jsonb; jr jsonb;
  t0 timestamptz; ms numeric;
  base_disc integer; base_man integer; base_conn integer; base_league integer; base_gp integer;
begin
  -- helpers ------------------------------------------------------------------------------------------------------------------------------------------
  execute $fn$
    create function pg_temp.pm_as(p_user uuid, p_sql text) returns text language plpgsql as $f$
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
    create function pg_temp.pm_anon(p_sql text) returns text language plpgsql as $f$
    declare out text;
    begin
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      set local role anon;
      begin execute p_sql into out; exception when others then out := 'ERR:' || sqlerrm; end;
      reset role;
      return out;
    end $f$;
  $fn$;
  -- the names of one page of a handle's public library, in the returned order ('-' when there is no row at all)
  execute $fn$
    create function pg_temp.pm_names(p_handle text, p_query text, p_limit integer, p_offset integer) returns text language plpgsql as $f$
    declare out text;
    begin
      out := pg_temp.pm_anon(format($q$ select coalesce((select string_agg(x.g ->> 'name', '|' order by x.ord) from public.get_public_my_games(%L, %L, %s, %s) t, jsonb_array_elements(t.games) with ordinality as x(g, ord)), '-') where exists (select 1 from public.get_public_my_games(%L, %L, %s, %s)) $q$, p_handle, p_query, p_limit, p_offset, p_handle, p_query, p_limit, p_offset));
      return coalesce(out, 'NOROW');
    end $f$;
  $fn$;
  -- the whole library object of a handle, as jsonb (null when the function returns no row)
  execute $fn$
    create function pg_temp.pm_lib(p_handle text, p_query text, p_limit integer, p_offset integer) returns jsonb language plpgsql as $f$
    declare out text;
    begin
      out := pg_temp.pm_anon(format($q$ select to_jsonb(t)::text from public.get_public_my_games(%L, %L, %s, %s) t $q$, p_handle, p_query, p_limit, p_offset));
      if out is null or out like 'ERR:%' then return case when out like 'ERR:%' then jsonb_build_object('error', out) else null end; end if;
      return out::jsonb;
    end $f$;
  $fn$;
  -- one game (by name) out of a handle's public library
  execute $fn$
    create function pg_temp.pm_game(p_handle text, p_name text) returns jsonb language plpgsql as $f$
    declare lib jsonb;
    begin
      lib := pg_temp.pm_lib(p_handle, null, 50, 0);
      return (select x from jsonb_array_elements(lib -> 'games') x where x ->> 'name' = p_name limit 1);
    end $f$;
  $fn$;

  select count(*) into base_disc from public.discovered_games;
  select count(*) into base_man from public.entity_game_platforms;
  select count(*) into base_conn from public.gaming_connections;
  select count(*) into base_league from public.league_profiles;
  select count(*) into base_gp from public.game_profiles;

  -- setup: disposable owners ---------------------------------------------------------------------------------------------------------------------------
  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zpmg-a@example.invalid', now()), (ub, 'zpmg-b@example.invalid', now()), (uc, 'zpmg-c@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zpmga', 'Zed A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zpmgb', 'Zed B', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zpmgc', 'Zed C', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zpmga';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zpmgb';
  select e.entity_id into ent_c from public.entities e where e.gamid_handle = 'zpmgc';
  select q.public_token into qr_a from public.qr_references q where q.entity_id = ent_a;

  -- A and C: real, accepted Steam connections (through the accepted flow)
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role; select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c; select public.complete_steam_connection_attempt(att, '76561198000000041') into got; reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role; select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c; select public.complete_steam_connection_attempt(att, '76561198000000042') into got; reset role;
  -- B: Discord only
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('discord') s; reset role;
  set local role service_role; select c.attempt_id into att from public.consume_connection_attempt(st) c;
  select public.complete_connection_attempt(att, '900000000000000077', 'zpmg_b', 'Zed B Discord', null) into got;
  perform public.record_connection_discovery(att, '900000000000000077', 'riot', 'ABSENT', 3, 0, null, null, null, null, null, null, null, null, null, null);
  reset role;
  select g.connection_id into conn_a from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam';
  select g.connection_id into conn_c from public.gaming_connections g where g.entity_id = ent_c and g.provider_key = 'steam';
  res := res || jsonb_build_object('step', 'setup: A and C have authenticated Steam connections, B has Discord only', 'pass', conn_a is not null and conn_c is not null and ent_b is not null);

  -- invented catalog games (plus the real recognition-map game Marvel Rivals and the real League of Legends key, which the accepted catalog already holds)
  insert into public.game_catalog (game_key, display_name, normalized_name, search_key, catalog_source, release_year, release_date, release_date_precision) values
    ('qzp_alpha_quest', 'Qzp Alpha Quest', 'qzp alpha quest', 'qzpalphaquest', 'TEST', 2020, date '2020-01-01', 9),
    ('qzp_solo_relic', 'Qzp Solo Relic', 'qzp solo relic', 'qzpsolorelic', 'TEST', 1997, date '1997-01-31', 11),
    ('qzp_no_year', 'Qzp No Year', 'qzp no year', 'qzpnoyear', 'TEST', null, null, null),
    ('qzp_not_owned', 'Qzp Not Owned', 'qzp not owned', 'qzpnotowned', 'TEST', 2001, date '2001-01-01', 9),
    ('qzp_long_title', 'Qzp Long Extraordinarily Extraordinarily Extraordinarily Extraordinarily Extraordinarily Long Title', 'qzp long extraordinarily extraordinarily extraordinarily extraordinarily extraordinarily long title', 'qzplongextraordinarilyextraordinarilyextraordinarilyextraordinarilyextraordinarilylongtitle', 'TEST', 2015, date '2015-01-01', 9);
  insert into public.game_catalog_platforms (game_key, platform_key) values
    ('qzp_alpha_quest', 'pc'), ('qzp_alpha_quest', 'steam'),
    ('qzp_solo_relic', 'pc'), ('qzp_solo_relic', 'ps4'), ('qzp_solo_relic', 'ps5'), ('qzp_solo_relic', 'xbox_one'), ('qzp_solo_relic', 'switch'),
    ('qzp_no_year', 'pc'), ('qzp_not_owned', 'pc'), ('qzp_long_title', 'pc'), ('qzp_long_title', 'switch'), ('qzp_long_title', 'ps5')
  on conflict do nothing;
  insert into public.game_catalog_platforms (game_key, platform_key) values ('marvel_rivals', 'ps5'), ('marvel_rivals', 'xbox_series'), ('league_of_legends', 'pc') on conflict do nothing;
  insert into public.game_catalog_provider_ids (provider, external_id, game_key) values ('steam', '900101', 'qzp_alpha_quest'), ('steam', '900105', 'qzp_alpha_quest');
  insert into public.game_catalog_aliases (game_key, alias, search_key) values ('marvel_rivals', 'MRtestalias', 'mrtestalias'), ('qzp_not_owned', 'Qzp Nope Alias', 'qzpnopealias');

  -- A's library: Steam discovered (Marvel Rivals via the recognition map, Qzp Alpha Quest via two Steam app ids that name the SAME canonical game, an unmapped app, a nameless app)
  insert into public.discovered_games (connection_id, entity_id, source_provider, external_game_id, game_name, playtime_minutes, trust_status, icon_ref) values
    (conn_a, ent_a, 'steam', '2767030', 'Marvel Rivals', 120, 'DISCOVERED_FROM_STEAM', '0123456789abcdef0123456789abcdef01234567'),
    (conn_a, ent_a, 'steam', '900101', 'Qzp Alpha Quest', 600, 'DISCOVERED_FROM_STEAM', null),
    (conn_a, ent_a, 'steam', '900105', 'Qzp Alpha Quest Demo', 30, 'DISCOVERED_FROM_STEAM', null),
    (conn_a, ent_a, 'steam', '900102', 'Zzz Unmapped Thing', 5000, 'DISCOVERED_FROM_STEAM', null),
    (conn_a, ent_a, 'steam', '900103', null, 77, 'DISCOVERED_FROM_STEAM', null);
  -- manual declarations (through the accepted owner function): Marvel Rivals on PS5 (merges into the discovered row), a game on PS4 only (the catalog knows five platforms), League, a game with no year, a long title on two platforms
  got := pg_temp.pm_as(ua, $q$ select public.save_my_manual_game('marvel_rivals', array['ps5']) $q$);
  got2 := pg_temp.pm_as(ua, $q$ select public.save_my_manual_game('qzp_solo_relic', array['ps4']) $q$);
  got3 := pg_temp.pm_as(ua, $q$ select public.save_my_manual_game('league_of_legends', array['pc']) $q$);
  got4 := pg_temp.pm_as(ua, $q$ select public.save_my_manual_game('qzp_no_year', array['pc']) $q$) || pg_temp.pm_as(ua, $q$ select public.save_my_manual_game('qzp_long_title', array['pc','switch']) $q$);
  res := res || jsonb_build_object('step', 'setup: manual declarations saved through the accepted owner function', 'pass', got = 'SAVED' and got2 = 'SAVED' and got3 = 'SAVED' and got4 = 'SAVEDSAVED', 'got', got || got2 || got3 || got4);

  -- League (private, not public yet) and a Game Profile (not public yet)
  insert into public.league_profiles (entity_id, game_name, tag_line, platform_id, data_source, solo_rank_state, solo_tier, solo_division, solo_lp, solo_wins, solo_losses, source_url, fetched_at, last_attempt_at, last_result, is_public)
  values (ent_a, 'ZedLeague', '0001', 'EUW1', 'OPGG_TEMPORARY', 'RANKED', 'GOLD', 'II', 43, 120, 110, 'https://op.gg/private', now(), now(), 'OK', false);
  insert into public.game_profiles (entity_id, game_key, identity_source, data_source, data_source_class, fields, is_public)
  values (ent_a, 'qzp_alpha_quest', 'MANUAL_UID', 'SOME_SOURCE', 'THIRD_PARTY', '[{"key":"rank","label":"Rank","value":"Gold","kind":"rank"},{"key":"win_rate","label":"Win rate","value":52,"kind":"percent"}]'::jsonb, false);

  -- ------------------------------------------------------------------ 1. structure, defaults, privileges
  select count(*) into cnt from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name in ('show_my_games', 'show_game_stats') and c.column_default = 'false' and c.is_nullable = 'NO';
  res := res || jsonb_build_object('step', 'both switches are NOT NULL DEFAULT false (every existing and future identity starts OFF)', 'pass', cnt = 2);

  got := pg_temp.pm_anon($q$ select 'x' from public.get_my_public_games_settings() $q$);
  got2 := pg_temp.pm_anon($q$ select 'x' from public.set_my_public_games_setting('my_games', true) $q$);
  got3 := pg_temp.pm_anon($q$ select private.public_my_games(gen_random_uuid(), null, 6, 0)::text $q$);
  got4 := pg_temp.pm_anon($q$ select private.public_my_games_allowed(gen_random_uuid())::text $q$) || pg_temp.pm_anon($q$ select private.public_game_stats_allowed(gen_random_uuid())::text $q$);
  res := res || jsonb_build_object('step', 'anon can neither read nor write the owner settings and cannot call the library builder or the gates directly', 'pass',
    got like 'ERR:permission denied%' and got2 like 'ERR:permission denied%' and got3 like 'ERR:permission denied%' and got4 like 'ERR:permission denied%ERR:permission denied%', 'got', got || ' / ' || got2 || ' / ' || got3);
  got := pg_temp.pm_as(ua, $q$ select private.public_my_games(gen_random_uuid(), null, 6, 0)::text $q$);
  got2 := pg_temp.pm_as(ua, $q$ update public.profiles set show_my_games = true $q$);
  got3 := pg_temp.pm_as(ua, $q$ update public.profiles set show_game_stats = true $q$);
  res := res || jsonb_build_object('step', 'an authenticated owner cannot call the library builder directly nor write either column directly (only the RPC can flip them)', 'pass',
    got like 'ERR:permission denied%' and got2 like 'ERR:permission denied%' and got3 like 'ERR:permission denied%', 'got', got || ' / ' || got2 || ' / ' || got3);

  -- ------------------------------------------------------------------ 2. default OFF: nothing is public, and the response is indistinguishable from "no such GamID"
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  got := pg_temp.pm_names('zpmga', null, 30, 0);
  got2 := pg_temp.pm_names('zpmgnobody', null, 30, 0);
  res := res || jsonb_build_object('step', 'PUBLIC GAMID with Show My Games OFF (default): the library function returns NO row - the same answer as for a GamID that does not exist', 'pass', got = 'NOROW' and got2 = 'NOROW' and got = got2, 'got', got || ' / ' || got2);
  set local role anon; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select to_jsonb(p) into js from public.get_public_identity('zpmga') p; reset role;
  res := res || jsonb_build_object('step', 'OFF: the public identity carries no my_games section, no game word and no game name at all', 'pass',
    not ((js -> 'public_sections') ? 'my_games') and js::text !~* 'marvel|qzp|zzz unmapped|library_count|playtime', 'sections', (js -> 'public_sections'));

  -- ------------------------------------------------------------------ 3. the owner switches
  got := pg_temp.pm_as(ua, $q$ select s.show_my_games::text || s.show_game_stats::text from public.get_my_public_games_settings() s $q$);
  res := res || jsonb_build_object('step', 'a new identity reads both switches as OFF through the owner RPC', 'pass', got = 'falsefalse', 'got', got);
  got := pg_temp.pm_as(ua, $q$ select count(*)::text from public.set_my_public_games_setting('nonsense', true) $q$);
  got2 := pg_temp.pm_as(ua, $q$ select count(*)::text from public.set_my_public_games_setting('my_games', null) $q$);
  got3 := pg_temp.pm_as(ub, $q$ select count(*)::text from public.set_my_public_games_setting('my_games', true) $q$);
  select count(*) into cnt from public.profiles p where p.show_my_games and p.entity_id in (ent_a, ent_b, ent_c);
  res := res || jsonb_build_object('step', 'an unknown setting and a null value are refused; another owner flipping THEIR switch changes only their own row', 'pass',
    got = 'ERR:INVALID_SETTING' and got2 = 'ERR:INVALID_VISIBILITY' and got3 = '1' and cnt = 1 and (select p.show_my_games from public.profiles p where p.entity_id = ent_b), 'got', got || ' / ' || got2);
  got := pg_temp.pm_as(ub, $q$ select count(*)::text from public.set_my_public_games_setting('my_games', false) $q$);

  -- unpublished + ON is still nothing
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(false); reset role;
  got := pg_temp.pm_as(ua, $q$ select count(*)::text from public.set_my_public_games_setting('my_games', true) $q$);
  got2 := pg_temp.pm_names('zpmga', null, 30, 0);
  res := res || jsonb_build_object('step', 'ON but the GamID is unpublished: nothing is returned (publishing stays the top-level gate)', 'pass', got = '1' and got2 = 'NOROW', 'got', got2);
  -- the gates themselves (defense in depth: they must not depend on their callers having checked publication)
  select private.public_my_games_allowed(ent_a) into flag;
  select private.public_game_stats_allowed(ent_a) into flag2;
  select private.public_my_games(ent_a, null, 6, 0)::text into got3;
  res := res || jsonb_build_object('step', 'GATES: My Games ON but unpublished -> the My Games gate is closed, the stats gate is closed and the library builder itself returns nothing', 'pass',
    flag = false and flag2 = false and got3 is null, 'flag', flag, 'flag2', flag2);
  select private.public_my_games_allowed(gen_random_uuid()) into flag;
  select private.public_game_stats_allowed(gen_random_uuid()) into flag2;
  res := res || jsonb_build_object('step', 'GATES: an unknown identity is not allowed', 'pass', flag = false and flag2 = false);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;

  -- ------------------------------------------------------------------ 4. the library (published + ON; playtime OFF, stats OFF)
  jr := pg_temp.pm_lib('zpmga', null, 30, 0);
  res := res || jsonb_build_object('step', 'ON + published: 7 distinct canonical games (the nameless unmapped app is not listed; two Steam app ids of one canonical game are ONE row)', 'pass',
    (jr ->> 'library_count') = '7' and (jr ->> 'total_count') = '7' and jsonb_array_length(jr -> 'games') = 7, 'library', jr ->> 'library_count');
  got := pg_temp.pm_names('zpmga', null, 30, 0);
  res := res || jsonb_build_object('step', 'ORDER: games the owner declared by hand first (A-Z), then provider-discovered games (A-Z) - deterministic and independent of playtime', 'pass',
    got = 'League of Legends|Marvel Rivals|Qzp Long Extraordinarily Extraordinarily Extraordinarily Extraordinarily Extraordinarily Long Title|Qzp No Year|Qzp Solo Relic|Qzp Alpha Quest|Zzz Unmapped Thing', 'got', got);
  got2 := pg_temp.pm_names('zpmga', null, 30, 0);
  res := res || jsonb_build_object('step', 'ORDER is stable between calls', 'pass', got = got2);

  -- provenance per row
  jr := pg_temp.pm_game('zpmga', 'Marvel Rivals');
  res := res || jsonb_build_object('step', 'MERGED (Steam discovery + manual PS5): ONE row, both provenance states, platforms = Steam + PlayStation 5 (no PC, no Xbox)', 'pass',
    (select count(*) from jsonb_array_elements(pg_temp.pm_lib('zpmga', null, 50, 0) -> 'games') x where x ->> 'name' = 'Marvel Rivals') = 1
    and (jr -> 'sources') = '["DISCOVERED_FROM_STEAM","MANUAL"]'::jsonb
    and (jr -> 'platforms') @> '[{"label":"Steam","source":"DISCOVERED_FROM_STEAM"},{"label":"PlayStation 5","source":"MANUAL"}]'::jsonb and jsonb_array_length(jr -> 'platforms') = 2, 'row', jr);
  jr := pg_temp.pm_game('zpmga', 'Qzp Alpha Quest');
  res := res || jsonb_build_object('step', 'STEAM ONLY: sources = [DISCOVERED_FROM_STEAM]; platform Steam; two Steam app ids of the same canonical game did not create a second row', 'pass',
    (jr -> 'sources') = '["DISCOVERED_FROM_STEAM"]'::jsonb and jsonb_array_length(jr -> 'platforms') = 1 and (jr -> 'platforms' -> 0 ->> 'label') = 'Steam' and (jr ->> 'year') = '2020', 'row', jr);
  jr := pg_temp.pm_game('zpmga', 'Qzp Solo Relic');
  res := res || jsonb_build_object('step', 'MANUAL ONLY: sources = [MANUAL]; ONLY the platform the user declared (PS4), never the five the catalog lists', 'pass',
    (jr -> 'sources') = '["MANUAL"]'::jsonb and jsonb_array_length(jr -> 'platforms') = 1 and (jr -> 'platforms' -> 0 ->> 'label') = 'PlayStation 4' and (jr ->> 'year') = '1997', 'row', jr);
  jr := pg_temp.pm_game('zpmga', 'Zzz Unmapped Thing');
  res := res || jsonb_build_object('step', 'a discovered game the catalog cannot map yet stays its own row (Steam provenance, no year, no invented identity)', 'pass',
    (jr -> 'sources') = '["DISCOVERED_FROM_STEAM"]'::jsonb and not (jr ? 'year') and (jr -> 'platforms' -> 0 ->> 'label') = 'Steam', 'row', jr);
  jr := pg_temp.pm_game('zpmga', 'Qzp No Year');
  res := res || jsonb_build_object('step', 'RELEASE YEAR: a NULL year is omitted entirely (no "unknown", no 0)', 'pass', not (jr ? 'year') and jr::text !~* 'unknown|n/a|null', 'row', jr);
  jr := pg_temp.pm_game('zpmga', 'Qzp Long Extraordinarily Extraordinarily Extraordinarily Extraordinarily Extraordinarily Long Title');
  res := res || jsonb_build_object('step', 'a long title and several user platforms come through whole (PC + Nintendo Switch, not PS5 which was never declared)', 'pass',
    jsonb_array_length(jr -> 'platforms') = 2 and (jr -> 'platforms') @> '[{"label":"PC"},{"label":"Nintendo Switch"}]'::jsonb and (jr ->> 'name') like 'Qzp Long%Long Title', 'row', jr);

  js := pg_temp.pm_lib('zpmga', null, 50, 0);
  res := res || jsonb_build_object('step', 'TRUST: nothing is ever VERIFIED - the only provenance words are DISCOVERED_FROM_STEAM and MANUAL', 'pass',
    js::text !~* 'verified|connected' and (select bool_and(s in ('DISCOVERED_FROM_STEAM', 'MANUAL')) from jsonb_array_elements(js -> 'games') g, jsonb_array_elements_text(g -> 'sources') s));
  res := res || jsonb_build_object('step', 'PRIVATE DATA: no SteamID, Steam app id, icon reference, connection / entity id, token or discovery timestamp anywhere in the library response', 'pass',
    js::text !~* '7656119|900101|900102|900105|2767030|icon|0123456789abcdef|steam_id|connection|entity|token|first_seen|last_seen|external|provider_account', 'text', left(js::text, 200));

  -- ------------------------------------------------------------------ 5. hidden playtime is absent, not merely hidden
  res := res || jsonb_build_object('step', 'PLAYTIME OFF (default): no playtime key and no minutes value anywhere in the library', 'pass', js::text !~* 'playtime|minutes|5000|630|"120"');
  set local role anon; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select to_jsonb(p) into jq from public.get_public_identity('zpmga') p; reset role;
  res := res || jsonb_build_object('step', 'PLAYTIME OFF: the identity preview (first six games) carries no playtime either', 'pass', (jq -> 'public_sections' -> 'my_games') is not null and jq::text !~ 'playtime');

  -- playtime ON: values appear only for games with a recorded, non-zero playtime; the order does NOT change
  got := pg_temp.pm_as(ua, $q$ select s.show_game_playtime::text from public.set_my_game_playtime_visibility(true) s $q$);
  got2 := pg_temp.pm_names('zpmga', null, 30, 0);
  js := pg_temp.pm_lib('zpmga', null, 50, 0);
  res := res || jsonb_build_object('step', 'PLAYTIME ON: shown per game (Steam sums the two app ids of one canonical game: 630); a manual-only game has none, so none is shown', 'pass',
    got = 'true' and (pg_temp.pm_game('zpmga', 'Qzp Alpha Quest') ->> 'playtime_minutes') = '630' and (pg_temp.pm_game('zpmga', 'Zzz Unmapped Thing') ->> 'playtime_minutes') = '5000'
    and (pg_temp.pm_game('zpmga', 'Marvel Rivals') ->> 'playtime_minutes') = '120' and not (pg_temp.pm_game('zpmga', 'Qzp Solo Relic') ? 'playtime_minutes'), 'got', got);
  res := res || jsonb_build_object('step', 'PLAYTIME never orders the library: turning it ON changes nothing about the order (Zzz has the most hours and is still last)', 'pass', got2 like '%Qzp Alpha Quest|Zzz Unmapped Thing', 'got', got2);
  update public.discovered_games set playtime_minutes = case external_game_id when '900102' then 1 when '900101' then 99999 else playtime_minutes end where entity_id = ent_a;
  got3 := pg_temp.pm_names('zpmga', null, 30, 0);
  res := res || jsonb_build_object('step', 'PLAYTIME never orders the library: reversing the hours does not reorder it', 'pass', got3 = got2, 'got', got3);
  update public.discovered_games set playtime_minutes = case external_game_id when '900102' then 5000 when '900101' then 600 else playtime_minutes end where entity_id = ent_a;
  set local role anon; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select to_jsonb(p) into jq from public.get_public_identity('zpmga') p; reset role;
  res := res || jsonb_build_object('step', 'PLAYTIME ON: the identity preview carries it too (same function)', 'pass', jq::text ~ 'playtime_minutes');
  got := pg_temp.pm_as(ua, $q$ select s.show_game_playtime::text from public.set_my_game_playtime_visibility(false) s $q$);
  js := pg_temp.pm_lib('zpmga', null, 50, 0);
  res := res || jsonb_build_object('step', 'turning PLAYTIME OFF again removes it immediately', 'pass', got = 'false' and js::text !~ 'playtime');

  -- ------------------------------------------------------------------ 6. ranks & stats: separate switch, League keeps its truth
  got := pg_temp.pm_as(ua, $q$ select count(*)::text from public.set_my_public_games_setting('stats', true) $q$);
  js := pg_temp.pm_lib('zpmga', null, 50, 0);
  res := res || jsonb_build_object('step', 'STATS ON while the League section AND the Game Profile are still private: no stats leave the database at all (each owner switch still governs its own data)', 'pass',
    got = '1' and js::text !~* 'solo_|gold|OPGG|"stats"', 'text', left(js::text, 120));
  update public.game_profiles set is_public = true where entity_id = ent_a;
  jr := pg_temp.pm_game('zpmga', 'Qzp Alpha Quest');
  res := res || jsonb_build_object('step', 'STATS ON: a PUBLIC Game Profile appears on its own game only (fields exactly as stored, source and trust class carried)', 'pass',
    (jr -> 'stats' -> 'profile' -> 'fields' -> 0 ->> 'value') = 'Gold' and (jr -> 'stats' -> 'profile' ->> 'trust_status') = 'MANUAL' and not (pg_temp.pm_game('zpmga', 'Marvel Rivals') ? 'stats'), 'row', jr);
  update public.league_profiles set is_public = true where entity_id = ent_a;
  jr := pg_temp.pm_game('zpmga', 'League of Legends');
  res := res || jsonb_build_object('step', 'STATS ON + League section public: the EXISTING League data appears on League of Legends only, still MANUAL / OPGG_TEMPORARY (PROTOTYPE / UNVERIFIED), no Riot ID, no source URL', 'pass',
    (jr -> 'stats' -> 'league' ->> 'solo_tier') = 'GOLD' and (jr -> 'stats' -> 'league' ->> 'solo_lp') = '43' and (jr -> 'stats' -> 'league' ->> 'trust_status') = 'MANUAL'
    and (jr -> 'stats' -> 'league' ->> 'data_source') = 'OPGG_TEMPORARY' and jr::text !~* 'ZedLeague|0001|op\.gg|source_url|riot|EUW', 'row', jr);
  res := res || jsonb_build_object('step', 'STATS ON: League data is on exactly ONE row (no duplicate League stats) and every other row has none except the public Game Profile', 'pass',
    (select count(*) from jsonb_array_elements(pg_temp.pm_lib('zpmga', null, 50, 0) -> 'games') g where g -> 'stats' ? 'league') = 1
    and (select count(*) from jsonb_array_elements(pg_temp.pm_lib('zpmga', null, 50, 0) -> 'games') g where g ? 'stats') = 2);
  update public.game_profiles set is_public = false where entity_id = ent_a;
  res := res || jsonb_build_object('step', 'a Game Profile the owner did NOT make public never appears, even with stats ON', 'pass', not (pg_temp.pm_game('zpmga', 'Qzp Alpha Quest') ? 'stats'));
  update public.game_profiles set is_public = true where entity_id = ent_a;

  -- independence of the two switches: 4 combinations, seen in BOTH the library function and the identity preview
  for i in 0..3 loop
    got := pg_temp.pm_as(ua, format($q$ select s.show_game_playtime::text from public.set_my_game_playtime_visibility(%L) s $q$, (i & 1) = 1));
    got2 := pg_temp.pm_as(ua, format($q$ select count(*)::text from public.set_my_public_games_setting('stats', %L) $q$, (i & 2) = 2));
    js := pg_temp.pm_lib('zpmga', null, 50, 0);
    set local role anon; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select to_jsonb(p) into jq from public.get_public_identity('zpmga') p; reset role;
    res := res || jsonb_build_object('step', format('INDEPENDENT switches: playtime %s / stats %s -> playtime %s, stats %s (library and identity preview agree; games always listed)',
        case when (i & 1) = 1 then 'ON' else 'OFF' end, case when (i & 2) = 2 then 'ON' else 'OFF' end, case when (i & 1) = 1 then 'shown' else 'absent' end, case when (i & 2) = 2 then 'shown' else 'absent' end),
      'pass', ((js::text ~ 'playtime_minutes') = ((i & 1) = 1)) and ((js::text ~ '"stats"') = ((i & 2) = 2))
        and ((jq::text ~ 'playtime_minutes') = ((i & 1) = 1)) and ((jq::text ~ '"stats"') = ((i & 2) = 2))
        and jsonb_array_length(js -> 'games') = 7 and (jq -> 'public_sections' -> 'my_games' ->> 'library_count') = '7');
  end loop;
  got := pg_temp.pm_as(ua, $q$ select s.show_game_playtime::text from public.set_my_game_playtime_visibility(false) s $q$);
  got2 := pg_temp.pm_as(ua, $q$ select count(*)::text from public.set_my_public_games_setting('stats', false) $q$);
  js := pg_temp.pm_lib('zpmga', null, 50, 0);
  res := res || jsonb_build_object('step', 'both OFF: the games, their platforms and provenance remain; no playtime, no stats', 'pass', js::text !~ 'playtime|stats|solo_' and jsonb_array_length(js -> 'games') = 7 and (js -> 'games' -> 0 -> 'sources') is not null);

  -- ------------------------------------------------------------------ 7. the compact preview inside the public identity
  set local role anon; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select to_jsonb(p) into jq from public.get_public_identity('zpmga') p;
  select to_jsonb(p) into jr from public.get_public_identity_by_qr(qr_a) p; reset role;
  select string_agg(k, ',' order by k collate "C") into keys from jsonb_object_keys(jq) k;
  res := res || jsonb_build_object('step', 'PUBLIC BOUNDARY: the identity keeps exactly its 14 columns; My Games is one more section inside public_sections', 'pass',
    keys = 'avatar_media_reference,bio,display_name,education_work_catalog,education_work_status,field_of_study,gamid_handle,institution,intro_derivative_path,intro_transition_key,primary_role_key,public_sections,role_catalog,role_keys', 'got', keys);
  res := res || jsonb_build_object('step', 'PREVIEW: at most SIX games and the true library count (7), in the library order; the QR route returns the same', 'pass',
    jsonb_array_length(jq -> 'public_sections' -> 'my_games' -> 'games') = 6 and (jq -> 'public_sections' -> 'my_games' ->> 'library_count') = '7' and jq = jr
    and (select string_agg(x ->> 'name', '|' order by o) from jsonb_array_elements(jq -> 'public_sections' -> 'my_games' -> 'games') with ordinality as t(x, o)) = (select string_agg(x ->> 'name', '|' order by o) from jsonb_array_elements(pg_temp.pm_lib('zpmga', null, 6, 0) -> 'games') with ordinality as t(x, o)));
  res := res || jsonb_build_object('step', 'the identity''s other sections (Discord / Steam / League switches) are unchanged by My Games: Steam and League were never switched on, so they are still absent', 'pass', not ((jq -> 'public_sections') ? 'steam') and not ((jq -> 'public_sections') ? 'discord'));

  -- ------------------------------------------------------------------ 8. paging
  res := res || jsonb_build_object('step', 'PAGING: limit 3 -> the first three; offset 3 limit 3 -> the next three; offset 6 limit 3 -> the last one; offset 7 -> nothing', 'pass',
    pg_temp.pm_names('zpmga', null, 3, 0) = 'League of Legends|Marvel Rivals|Qzp Long Extraordinarily Extraordinarily Extraordinarily Extraordinarily Extraordinarily Long Title'
    and pg_temp.pm_names('zpmga', null, 3, 3) like 'Qzp No Year|Qzp Solo Relic|Qzp Alpha Quest' and pg_temp.pm_names('zpmga', null, 3, 6) = 'Zzz Unmapped Thing' and pg_temp.pm_names('zpmga', null, 3, 7) = '-');
  res := res || jsonb_build_object('step', 'PAGING is bounded: a caller asking for 5000 rows gets at most 50; negative values are clamped', 'pass',
    (select jsonb_array_length(pg_temp.pm_lib('zpmga', null, 5000, 0) -> 'games')) = 7 and pg_temp.pm_names('zpmga', null, -5, -9) = '-' and (pg_temp.pm_lib('zpmga', null, -5, -9) ->> 'library_count') = '7');

  -- ------------------------------------------------------------------ 9. search: this identity's own games ONLY
  res := res || jsonb_build_object('step', 'SEARCH is case-insensitive, whitespace and punctuation tolerant', 'pass',
    pg_temp.pm_names('zpmga', 'marvel', 30, 0) = 'Marvel Rivals' and pg_temp.pm_names('zpmga', 'MARVEL', 30, 0) = 'Marvel Rivals' and pg_temp.pm_names('zpmga', '  Marvel   ', 30, 0) = 'Marvel Rivals'
    and pg_temp.pm_names('zpmga', 'marvel-rivals', 30, 0) = 'Marvel Rivals' and pg_temp.pm_names('zpmga', 'MARVEL RIVALS!!', 30, 0) = 'Marvel Rivals');
  res := res || jsonb_build_object('step', 'SEARCH reports the match total and keeps the library count: "qzp" -> 4 of 7', 'pass',
    (pg_temp.pm_lib('zpmga', 'qzp', 30, 0) ->> 'total_count') = '4' and (pg_temp.pm_lib('zpmga', 'qzp', 30, 0) ->> 'library_count') = '7');
  res := res || jsonb_build_object('step', 'SEARCH ranking: a name that starts with the query beats a name that only contains it', 'pass', pg_temp.pm_names('zpmga', 'qzp s', 30, 0) = 'Qzp Solo Relic' and (split_part(pg_temp.pm_names('zpmga', 'relic', 30, 0), '|', 1) = 'Qzp Solo Relic'));
  res := res || jsonb_build_object('step', 'SEARCH finds a discovered game by the name its provider gave it (even without a canonical key)', 'pass', pg_temp.pm_names('zpmga', 'unmapped', 30, 0) = 'Zzz Unmapped Thing');
  res := res || jsonb_build_object('step', 'SEARCH matches an ALIAS of an OWNED game', 'pass', pg_temp.pm_names('zpmga', 'mrtest', 30, 0) = 'Marvel Rivals');
  res := res || jsonb_build_object('step', 'SEARCH never returns a catalog game this identity does not have (by name or by alias)', 'pass',
    pg_temp.pm_names('zpmga', 'qzp not', 30, 0) = '-' and pg_temp.pm_names('zpmga', 'qzpnope', 30, 0) = '-' and pg_temp.pm_names('zpmga', 'crash bandicoot', 30, 0) = '-' and pg_temp.pm_names('zpmga', 'tetris', 30, 0) = '-');
  res := res || jsonb_build_object('step', 'SEARCH: no match -> an empty page (total 0), never an error and never catalog suggestions', 'pass',
    (pg_temp.pm_lib('zpmga', 'zzzzqqq', 30, 0) ->> 'total_count') = '0' and pg_temp.pm_names('zpmga', 'zzzzqqq', 30, 0) = '-');
  res := res || jsonb_build_object('step', 'SEARCH: LIKE wildcards and punctuation-only input are never interpreted (they match nothing)', 'pass',
    pg_temp.pm_names('zpmga', '%', 30, 0) = '-' and pg_temp.pm_names('zpmga', '%%%', 30, 0) = '-' and pg_temp.pm_names('zpmga', '_', 30, 0) = '-' and pg_temp.pm_names('zpmga', '!!', 30, 0) = '-' and pg_temp.pm_names('zpmga', 'qz%', 30, 0) = pg_temp.pm_names('zpmga', 'qz', 30, 0));
  res := res || jsonb_build_object('step', 'SEARCH: an oversized query is cut, never an error', 'pass', pg_temp.pm_names('zpmga', repeat('a', 500), 30, 0) = '-');

  -- ------------------------------------------------------------------ 10. Discord is not a game source; an empty library
  got := pg_temp.pm_as(ub, $q$ select count(*)::text from public.set_my_public_games_setting('my_games', true) $q$);
  jr := pg_temp.pm_lib('zpmgb', null, 30, 0);
  set local role anon; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select to_jsonb(p) into jq from public.get_public_identity('zpmgb') p; reset role;
  select count(*) into cnt from public.gaming_connections g where g.entity_id = ent_b and g.provider_key = 'discord';
  res := res || jsonb_build_object('step', 'DISCORD IS NOT A GAME SOURCE: an owner with a Discord connection and My Games ON has an empty library (0 games) and no My Games section on the profile', 'pass',
    cnt = 1 and (jr ->> 'library_count') = '0' and jsonb_array_length(jr -> 'games') = 0 and not ((jq -> 'public_sections') ? 'my_games'), 'lib', jr);

  -- ------------------------------------------------------------------ 11. scale: 1,300 games (1,000 manual + 300 discovered)
  insert into public.game_catalog (game_key, display_name, normalized_name, search_key, catalog_source, release_year, release_date, release_date_precision)
  select 'qzpbulk_' || lpad(g::text, 4, '0'), 'Qzp Bulk ' || g, 'qzp bulk ' || g, 'qzpbulk' || g, 'TEST', 1990 + (g % 30), make_date(1990 + (g % 30), 1, 1), 9 from generate_series(1, 1000) g;
  insert into public.game_catalog_platforms (game_key, platform_key) select 'qzpbulk_' || lpad(g::text, 4, '0'), 'pc' from generate_series(1, 1000) g;
  insert into public.entity_game_platforms (entity_id, game_key, platform_key) select ent_c, 'qzpbulk_' || lpad(g::text, 4, '0'), 'pc' from generate_series(1, 1000) g;
  insert into public.discovered_games (connection_id, entity_id, source_provider, external_game_id, game_name, playtime_minutes, trust_status)
  select conn_c, ent_c, 'steam', (700000 + g)::text, 'Qzp Steam Only ' || g, g, 'DISCOVERED_FROM_STEAM' from generate_series(1, 300) g;
  got := pg_temp.pm_as(uc, $q$ select count(*)::text from public.set_my_public_games_setting('my_games', true) $q$);
  res := res || jsonb_build_object('step', 'SEARCH of one identity never leaks another identity''s games (B and C are public and ON, and neither has Marvel Rivals)', 'pass',
    pg_temp.pm_names('zpmgb', 'marvel', 30, 0) = '-' and pg_temp.pm_names('zpmgc', 'marvel', 30, 0) = '-' and pg_temp.pm_names('zpmga', 'marvel', 30, 0) in ('Marvel Rivals', 'NOROW'));
  t0 := clock_timestamp();
  jr := pg_temp.pm_lib('zpmgc', null, 30, 0);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || jsonb_build_object('step', 'SCALE: 1,300 games -> the count is exact, one page is 30 rows, and the call is fast', 'pass',
    (jr ->> 'library_count') = '1300' and (jr ->> 'total_count') = '1300' and jsonb_array_length(jr -> 'games') = 30 and ms < 3000, 'ms', round(ms));
  jr := pg_temp.pm_lib('zpmgc', null, 5000, 0);
  res := res || jsonb_build_object('step', 'SCALE: a caller asking for 5,000 rows of a 1,300-game library gets exactly one page of 50 (the cap is enforced by the server, not the page)', 'pass',
    jsonb_array_length(jr -> 'games') = 50 and (jr ->> 'total_count') = '1300' and jsonb_array_length(pg_temp.pm_lib('zpmgc', null, 50, 1280) -> 'games') = 20);
  seen := 0; dup := 0; off := 0; page_n := 0;
  create temp table pm_seen (name text) on commit drop;
  loop
    jr := pg_temp.pm_lib('zpmgc', null, 50, off);
    exit when jr is null or jsonb_array_length(jr -> 'games') = 0;
    insert into pm_seen select x ->> 'name' from jsonb_array_elements(jr -> 'games') x;
    off := off + 50; page_n := page_n + 1;
    exit when page_n > 60;
  end loop;
  select count(*), count(*) - count(distinct name) into seen, dup from pm_seen;
  res := res || jsonb_build_object('step', 'SCALE: paging 50 at a time reaches all 1,300 games exactly once (no gaps, no duplicates)', 'pass', seen = 1300 and dup = 0 and page_n = 26, 'seen', seen, 'dup', dup, 'pages', page_n);
  t0 := clock_timestamp();
  got := pg_temp.pm_names('zpmgc', 'bulk 99', 50, 0);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || jsonb_build_object('step', 'SCALE: a search inside 1,300 games returns only its own matches (Bulk 99, 990-999) quickly', 'pass',
    got like 'Qzp Bulk 99|%' and (pg_temp.pm_lib('zpmgc', 'bulk 99', 50, 0) ->> 'total_count') = '11' and ms < 3000, 'ms', round(ms), 'got', left(got, 80));
  set local role anon; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  t0 := clock_timestamp(); select to_jsonb(p) into jq from public.get_public_identity('zpmgc') p; ms := extract(epoch from clock_timestamp() - t0) * 1000; reset role;
  res := res || jsonb_build_object('step', 'SCALE: the public identity preview stays six rows and small at 1,300 games', 'pass',
    jsonb_array_length(jq -> 'public_sections' -> 'my_games' -> 'games') = 6 and (jq -> 'public_sections' -> 'my_games' ->> 'library_count') = '1300' and length(jq::text) < 8000 and ms < 3000, 'ms', round(ms), 'bytes', length(jq::text));

  -- ------------------------------------------------------------------ 12. OFF closes everything again; nothing was written to any game, connection or League row
  got := pg_temp.pm_as(ua, $q$ select count(*)::text from public.set_my_public_games_setting('my_games', false) $q$);
  set local role anon; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select to_jsonb(p) into jq from public.get_public_identity('zpmga') p; reset role;
  res := res || jsonb_build_object('step', 'OFF again: the library function returns no row and the identity preview loses the section (stats ON would not matter: it needs My Games)', 'pass',
    pg_temp.pm_names('zpmga', null, 30, 0) = 'NOROW' and not ((jq -> 'public_sections') ? 'my_games'));
  got2 := pg_temp.pm_as(ua, $q$ select count(*)::text from public.set_my_public_games_setting('stats', true) $q$);
  res := res || jsonb_build_object('step', 'STATS ON while My Games is OFF: the library still returns nothing (it needs Show My Games); the stats gate itself is GLOBAL (published + its own switch), since 20260922200000 - it also governs the League card', 'pass',
    got2 = '1' and pg_temp.pm_names('zpmga', null, 30, 0) = 'NOROW' and private.public_game_stats_allowed(ent_a));
  got := pg_temp.pm_as(ua, $q$ select count(*)::text from public.set_my_public_games_setting('my_games', true) $q$);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(false); reset role;
  res := res || jsonb_build_object('step', 'unpublishing closes the library even with everything ON', 'pass', pg_temp.pm_names('zpmga', null, 30, 0) = 'NOROW');

  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_a;
  select count(*) into n from public.entity_game_platforms x where x.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'reading and switching never changed a game: A still has its 5 discovered rows and 6 manual platform rows', 'pass', cnt = 5 and n = 6, 'disc', cnt, 'man', n);
  res := res || jsonb_build_object('step', 'no real row was touched: real connections / League / Game Profiles / manual declarations / discovered games are unchanged apart from this test''s disposable rows', 'pass',
    (select count(*) from public.gaming_connections) = base_conn + 3 and (select count(*) from public.league_profiles) = base_league + 1 and (select count(*) from public.game_profiles) = base_gp + 1
    and (select count(*) from public.discovered_games) = base_disc + 5 + 300 and (select count(*) from public.entity_game_platforms) = base_man + 6 + 1000,
    'conn', (select count(*) from public.gaming_connections) - base_conn);

  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
