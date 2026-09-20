-- Steam My Games — live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/steam-games-db.sql
-- (Requires migration 20260920230000 to be applied. To validate the migration BEFORE applying it, run the migration's content and
--  this file's content wrapped together in one always-failing statement: everything rolls back either way.)
--
-- Uses ONLY disposable auth users / identities / Steam connections created inside the transaction, impersonates anon / authenticated /
-- service_role exactly as PostgREST does, and ALWAYS raises an exception carrying the results, so the whole transaction rolls back and
-- nothing (including @black, the real Steam and Discord connections, the League profile, and any visibility flag) is touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();  -- Steam connected, the main actor
  ub uuid := gen_random_uuid();  -- Steam connected (a different account): cross-user isolation
  uc uuid := gen_random_uuid();  -- verified, NO Steam connection
  ud uuid := gen_random_uuid();  -- unverified email
  ue uuid := gen_random_uuid();  -- hourly cap
  uf uuid := gen_random_uuid();  -- daily cap
  ug uuid := gen_random_uuid();  -- connection-changed / reconnect
  ent_a uuid; ent_b uuid; ent_g uuid;
  conn_a uuid; conn_g uuid;
  qr_a text;
  st text; att uuid; rid uuid;
  got text; got2 text; keys text;
  n integer; cnt integer; i integer; flag boolean;
  rec record; r record;
  js jsonb; jq jsonb;
  seen_first timestamptz; seen_first_after timestamptz; success_before timestamptz; success_after timestamptz;
  steam_a constant text := '76561198000000011';
  steam_b constant text := '76561198000000012';
  steam_e constant text := '76561198000000015';
  steam_f constant text := '76561198000000016';
  steam_g constant text := '76561198000000017';
  steam_g2 constant text := '76561198000000018';
  icon_ok constant text := '0bbb630d63262dd66d2fdde8f1d8f8b6b0dc0fca';
  games1 constant jsonb := '[
    {"appid":"2767030","name":"Marvel Rivals","icon":null,"playtime":120},
    {"appid":"570","name":"Dota 2","icon":"0bbb630d63262dd66d2fdde8f1d8f8b6b0dc0fca","playtime":5000},
    {"appid":"570","name":"Dota 2","icon":"0bbb630d63262dd66d2fdde8f1d8f8b6b0dc0fca","playtime":100},
    {"appid":"730","name":null,"icon":null,"playtime":null}
  ]';
begin
  -- ------------------------------------------------------------------ helper: one full reserve -> begin -> save cycle (as the real backend does)
  execute $fn$
    create function pg_temp.gd_cycle(p_user uuid, p_outcome text, p_games jsonb, p_bypass boolean) returns text language plpgsql as $f$
    declare rid uuid; sid text; st text; b text; sv text;
    begin
      if p_bypass then update private.game_discovery_attempts set created_at = created_at - interval '3 hours' where user_id = p_user; end if;
      perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select q.reservation_id, q.status into rid, st from public.reserve_steam_games_refresh() q;
      reset role;
      if st <> 'OK' then return st; end if;
      set local role service_role;
      select x.status, x.steam_id into b, sid from public.begin_steam_games_fetch(rid) x;
      select public.save_steam_games_result(rid, p_outcome, p_games) into sv;
      reset role;
      return st || ':' || b || ':' || sv;
    end $f$;
  $fn$;

  -- ------------------------------------------------------------------ setup (as postgres)
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'zgame-a@example.invalid', now()), (ub, 'zgame-b@example.invalid', now()), (uc, 'zgame-c@example.invalid', now()),
    (ud, 'zgame-d@example.invalid', null), (ue, 'zgame-e@example.invalid', now()), (uf, 'zgame-f@example.invalid', now()), (ug, 'zgame-g@example.invalid', now());
  for r in select * from (values (ua, 'zgamea'), (ub, 'zgameb'), (uc, 'zgamec'), (ue, 'zgamee'), (uf, 'zgamef'), (ug, 'zgameg')) as v(u, h) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
    set local role authenticated; perform 1 from public.create_solo_identity(r.h, 'Zed ' || r.h, date '1990-01-01', 'en'); reset role;
  end loop;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zgamea';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zgameb';
  select e.entity_id into ent_g from public.entities e where e.gamid_handle = 'zgameg';
  select q.public_token into qr_a from public.qr_references q where q.entity_id = ent_a;

  -- Steam connections through the accepted flow (A, B, E, F, G; C has none)
  for r in select * from (values (ua, steam_a), (ub, steam_b), (ue, steam_e), (uf, steam_f), (ug, steam_g)) as v(u, sid) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
    set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
    set local role service_role;
    select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c;
    select public.complete_steam_connection_attempt(att, r.sid) into got;
    reset role;
  end loop;
  select g.connection_id into conn_a from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam';
  select g.connection_id into conn_g from public.gaming_connections g where g.entity_id = ent_g and g.provider_key = 'steam';
  select count(*) into cnt from public.gaming_connections g where g.provider_key = 'steam' and g.entity_id in (ent_a, ent_b, ent_g);
  res := res || jsonb_build_object('step', 'setup: disposable owners with their own authenticated Steam connections (and one without)', 'pass', cnt = 3 and conn_a is not null);

  -- ------------------------------------------------------------------ 1. schema: what exists, what is recognized
  select count(*) into cnt from public.known_game_sources k where k.source_provider = 'steam' and k.external_game_id = '2767030' and k.game_key = 'marvel_rivals' and k.display_name = 'Marvel Rivals';
  select count(*) into n from public.known_game_sources;
  res := res || jsonb_build_object('step', 'the recognition map names exactly Marvel Rivals = Steam App ID 2767030 (recognition only)', 'pass', cnt = 1 and n = 1);

  -- ------------------------------------------------------------------ 2. privileges: no client role reaches the tables or the backend-only functions
  n := 0;
  for r in select * from (values ('public.discovered_games'), ('public.game_discovery_state'), ('public.known_game_sources'), ('private.game_discovery_attempts')) as v(t) loop
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin execute 'select 1 from ' || r.t || ' limit 1'; exception when insufficient_privilege then n := n + 1; end;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    begin execute 'select 1 from ' || r.t || ' limit 1'; exception when insufficient_privilege then n := n + 1; end;
    reset role;
  end loop;
  res := res || jsonb_build_object('step', 'authenticated AND anon have no direct read access to discovered games, discovery state, the recognition map, or the attempt ledger', 'pass', n = 8, 'denied', n);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.discovered_games (connection_id, entity_id, source_provider, external_game_id, trust_status) values (conn_a, ent_a, 'steam', '570', 'DISCOVERED_FROM_STEAM'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  begin perform 1 from public.begin_steam_games_fetch(gen_random_uuid()); got2 := 'NO_ERROR'; exception when others then got2 := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'an authenticated owner cannot write discovered games directly (the browser can never assert a game list)', 'pass', got like 'permission denied%', 'got', got);
  res := res || jsonb_build_object('step', 'an authenticated owner cannot call the backend-only begin function', 'pass', got2 like 'permission denied%' or got2 = 'BACKEND_ONLY', 'got', got2);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.save_steam_games_result(gen_random_uuid(), 'AVAILABLE', '[]'::jsonb); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.reserve_steam_games_refresh(); got2 := 'NO_ERROR'; exception when others then got2 := sqlerrm; end;
  begin perform 1 from public.get_my_discovered_games('steam'); keys := 'NO_ERROR'; exception when others then keys := sqlerrm; end;
  begin perform 1 from public.get_my_game_discovery_state('steam'); st := 'NO_ERROR'; exception when others then st := sqlerrm; end;
  begin perform public.save_steam_games_result(gen_random_uuid(), 'AVAILABLE', '[]'::jsonb); got := got || ' / NO_ERROR'; exception when others then got := got || ' / ' || sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'an authenticated owner cannot call the backend-only save function; anon cannot call any of the five functions', 'pass',
    got like 'permission denied% / permission denied%' and got2 like 'permission denied%' and keys like 'permission denied%' and st like 'permission denied%', 'got', got);

  -- ------------------------------------------------------------------ 3. reserve: who may ask, and for what
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.reserve_steam_games_refresh(); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'a user with an unverified email cannot reserve a refresh', 'pass', got = 'EMAIL_NOT_VERIFIED', 'got', got);

  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.status, q.reservation_id is null into got, flag from public.reserve_steam_games_refresh() q; reset role;
  select count(*) into n from private.game_discovery_attempts a where a.user_id = uc;
  res := res || jsonb_build_object('step', 'an owner without a Steam connection gets NOT_CONNECTED, no reservation, and consumes no throttle', 'pass', got = 'NOT_CONNECTED' and flag and n = 0, 'got', got);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.reservation_id, q.status into rid, got from public.reserve_steam_games_refresh() q; reset role;
  select count(*) into cnt from private.game_discovery_attempts a
    where a.attempt_id = rid and a.user_id = ua and a.entity_id = ent_a and a.connection_id = conn_a and a.source_provider = 'steam' and a.started_at is null and a.provider_account_id is null;
  res := res || jsonb_build_object('step', 'an owner with a Steam connection reserves a refresh bound to THEIR user, identity and connection (no SteamID copied yet)', 'pass', got = 'OK' and cnt = 1, 'got', got);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.status, q.retry_after_seconds into got, n from public.reserve_steam_games_refresh() q; reset role;
  res := res || jsonb_build_object('step', 'a second reserve straight away is COOLDOWN with a positive wait of at most 120 seconds (throttled before any Steam request)', 'pass', got = 'COOLDOWN' and n between 1 and 120, 'got', got || ':' || n);

  -- ------------------------------------------------------------------ 4. begin: the SteamID comes from the reserving owner's stored connection
  set local role service_role; select x.status, x.steam_id into got, got2 from public.begin_steam_games_fetch(rid) x; reset role;
  res := res || jsonb_build_object('step', 'begin returns the SteamID64 of the reserving owner''s own stored connection (never another account''s)', 'pass', got = 'OK' and got2 = steam_a and got2 <> steam_b, 'got', got);
  select count(*) into cnt from private.game_discovery_attempts a where a.attempt_id = rid and a.started_at is not null and a.provider_account_id = steam_a;
  res := res || jsonb_build_object('step', 'the fetched account is snapshotted on the reservation', 'pass', cnt = 1);
  set local role service_role; select x.status, x.steam_id into got, got2 from public.begin_steam_games_fetch(rid) x; reset role;
  res := res || jsonb_build_object('step', 'a reservation can start its fetch only once (ALREADY_STARTED, no SteamID returned)', 'pass', got = 'ALREADY_STARTED' and got2 is null, 'got', got);
  set local role service_role; select x.status, x.steam_id into got, got2 from public.begin_steam_games_fetch(gen_random_uuid()) x; reset role;
  res := res || jsonb_build_object('step', 'an unknown reservation gets INVALID_RESERVATION and no SteamID', 'pass', got = 'INVALID_RESERVATION' and got2 is null, 'got', got);

  -- an expired reservation
  update private.game_discovery_attempts set created_at = created_at - interval '3 hours' where user_id = ua;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.reservation_id into att from public.reserve_steam_games_refresh() q; reset role;
  update private.game_discovery_attempts set created_at = now() - interval '5 minutes' where attempt_id = att;
  set local role service_role; select x.status, x.steam_id into got, got2 from public.begin_steam_games_fetch(att) x; reset role;
  res := res || jsonb_build_object('step', 'an expired reservation (older than 3 minutes) is EXPIRED and yields no SteamID', 'pass', got = 'EXPIRED' and got2 is null, 'got', got);

  -- save before begin
  update private.game_discovery_attempts set created_at = created_at - interval '3 hours' where user_id = ua;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.reservation_id into att from public.reserve_steam_games_refresh() q; reset role;
  set local role service_role; select public.save_steam_games_result(att, 'AVAILABLE', games1) into got; reset role;
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'a result cannot be saved for a reservation that never started its fetch', 'pass', got = 'INVALID_RESERVATION' and cnt = 0, 'got', got);
  set local role service_role;
  begin select public.save_steam_games_result(att, 'NOT_AN_OUTCOME', null) into got; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'an unknown outcome word is refused (INVALID_OUTCOME)', 'pass', got = 'INVALID_OUTCOME', 'got', coalesce(got, 'null'));
  update private.game_discovery_attempts set completed_at = now(), outcome = 'EXPIRED' where attempt_id = att;

  -- ------------------------------------------------------------------ 5. AVAILABLE: stored once per app id, provider-neutral, DISCOVERED (never VERIFIED)
  got := pg_temp.gd_cycle(ua, 'AVAILABLE', games1, true);
  res := res || jsonb_build_object('step', 'a full reserve -> begin -> save cycle with AVAILABLE is SAVED', 'pass', got = 'OK:OK:SAVED', 'got', got);
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_a and d.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'duplicate app ids collapse to one row each (4 entries incl. a repeat -> 3 games)', 'pass', cnt = 3, 'got', cnt::text);
  select d.playtime_minutes into n from public.discovered_games d where d.connection_id = conn_a and d.external_game_id = '570';
  res := res || jsonb_build_object('step', 'for a repeated app id the entry with the most playtime wins', 'pass', n = 5000, 'got', n::text);
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_a and d.source_provider = 'steam' and d.trust_status = 'DISCOVERED_FROM_STEAM';
  select count(*) into n from public.discovered_games d where d.entity_id = ent_a and d.trust_status ilike '%VERIF%';
  res := res || jsonb_build_object('step', 'every discovered game is labelled DISCOVERED_FROM_STEAM; none is verified (Marvel Rivals included)', 'pass', cnt = 3 and n = 0);
  select d.game_name, d.icon_ref, d.playtime_minutes into rec from public.discovered_games d where d.connection_id = conn_a and d.external_game_id = '730';
  res := res || jsonb_build_object('step', 'a game Steam returned without a name/icon/playtime is stored with NULLs (not invented values)', 'pass', rec.game_name is null and rec.icon_ref is null and rec.playtime_minutes is null);
  select s.last_result, s.game_count, s.last_success_at into rec from public.game_discovery_state s where s.connection_id = conn_a;
  success_before := rec.last_success_at;
  res := res || jsonb_build_object('step', 'the discovery state records AVAILABLE, the game count and the success time', 'pass', rec.last_result = 'AVAILABLE' and rec.game_count = 3 and rec.last_success_at is not null);
  select min(d.first_seen_at) into seen_first from public.discovered_games d where d.connection_id = conn_a and d.external_game_id = '570';

  -- ------------------------------------------------------------------ 6. owner reads + Marvel Rivals recognition
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*), string_agg(g.external_game_id, ',' order by g.playtime_minutes desc nulls last, g.external_game_id) into cnt, keys from public.get_my_discovered_games('steam') g;
  select g.recognized_game_key, g.recognized_name, g.trust_status into rec from public.get_my_discovered_games('steam') g where g.external_game_id = '2767030';
  select string_agg(k, ',' order by k) into got from (select jsonb_object_keys(to_jsonb(g)) k from (select * from public.get_my_discovered_games('steam') limit 1) g) s;
  reset role;
  res := res || jsonb_build_object('step', 'the owner reads their list, most-played first (570, Marvel Rivals, then the unplayed/unknown one)', 'pass', cnt = 3 and keys = '570,2767030,730', 'got', keys);
  res := res || jsonb_build_object('step', 'Marvel Rivals (2767030) is RECOGNIZED by name but stays DISCOVERED_FROM_STEAM - recognition is not verification', 'pass',
    rec.recognized_game_key = 'marvel_rivals' and rec.recognized_name = 'Marvel Rivals' and rec.trust_status = 'DISCOVERED_FROM_STEAM');
  res := res || jsonb_build_object('step', 'the list exposes only game facts (no connection id, entity id, SteamID64, or ledger data)', 'pass',
    got = 'external_game_id,first_seen_at,game_name,icon_ref,last_seen_at,playtime_minutes,recognized_game_key,recognized_name,trust_status', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select * into rec from public.get_my_game_discovery_state('steam'); reset role;
  res := res || jsonb_build_object('step', 'the state RPC reports connected, AVAILABLE, 3 games, a cooldown time, and Marvel Rivals in recognized_games', 'pass',
    rec.is_connected and rec.last_result = 'AVAILABLE' and rec.game_count = 3 and rec.refresh_available_at > now()
    and jsonb_array_length(rec.recognized_games) = 1 and rec.recognized_games->0->>'game_key' = 'marvel_rivals' and rec.recognized_games->0->>'display_name' = 'Marvel Rivals');
  res := res || jsonb_build_object('step', 'the state RPC exposes no SteamID64 or internal id', 'pass', (to_jsonb(rec))::text !~ (steam_a || '|connection_id|entity_id|attempt_id|provider_account'));

  -- ------------------------------------------------------------------ 7. cross-user isolation
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_my_discovered_games('steam');
  select * into rec from public.get_my_game_discovery_state('steam');
  reset role;
  res := res || jsonb_build_object('step', 'another owner (their own Steam connected) sees none of A''s games and no recognition', 'pass', cnt = 0 and rec.is_connected and rec.last_result is null and jsonb_array_length(rec.recognized_games) = 0);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_my_discovered_games('steam');
  select * into rec from public.get_my_game_discovery_state('steam');
  reset role;
  res := res || jsonb_build_object('step', 'an owner without Steam sees an empty list and is_connected = false', 'pass', cnt = 0 and rec.is_connected = false);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.get_my_discovered_games('discord'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  begin perform 1 from public.get_my_game_discovery_state('nope'); got2 := 'NO_ERROR'; exception when others then got2 := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'only the steam provider is accepted by the owner reads (INVALID_PROVIDER)', 'pass', got = 'INVALID_PROVIDER' and got2 = 'INVALID_PROVIDER');
  -- B's own cycle only ever touches B's account
  got := pg_temp.gd_cycle(ub, 'AVAILABLE', '[{"appid":"440","name":"Team Fortress 2","icon":null,"playtime":10}]'::jsonb, false);
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_b;
  select count(*) into n from public.discovered_games d where d.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'B''s refresh stores B''s games under B''s connection only; A''s list is untouched', 'pass', got = 'OK:OK:SAVED' and cnt = 1 and n = 3, 'got', got);

  -- ------------------------------------------------------------------ 8. failed / private / malformed attempts keep the last good list
  for r in select * from (values ('UNAVAILABLE'), ('TEMPORARY_ERROR'), ('SERVICE_ERROR'), ('MALFORMED')) as v(o) loop
    got := pg_temp.gd_cycle(ua, r.o, null, true);
    select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
    select s.last_result, s.game_count, s.last_success_at into rec from public.game_discovery_state s where s.connection_id = conn_a;
    res := res || jsonb_build_object('step', r.o || ' records the failure but preserves the last good list, count and success time', 'pass',
      got = 'OK:OK:SAVED' and cnt = 3 and rec.last_result = r.o and rec.game_count = 3 and rec.last_success_at = success_before, 'got', got);
  end loop;
  got := pg_temp.gd_cycle(ua, 'AVAILABLE', null, true);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
  select s.last_result into got2 from public.game_discovery_state s where s.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'an AVAILABLE claim with no games is downgraded to MALFORMED and changes nothing', 'pass', cnt = 3 and got2 = 'MALFORMED', 'got', got2);
  got := pg_temp.gd_cycle(ua, 'AVAILABLE', '[{"appid":"not-a-number","name":"Broken","icon":null,"playtime":1}]'::jsonb, true);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
  select s.last_result, s.game_count into rec from public.game_discovery_state s where s.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'rows the database rejects (bad app id) roll back the whole update: INVALID_DATA, list preserved, state MALFORMED', 'pass', got = 'OK:OK:INVALID_DATA' and cnt = 3 and rec.last_result = 'MALFORMED' and rec.game_count = 3, 'got', got);
  got := pg_temp.gd_cycle(ua, 'AVAILABLE', jsonb_build_array(jsonb_build_object('appid', '999', 'name', 'Half', 'icon', 'ZZZ', 'playtime', 1)), true);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'a bad icon hash is also rejected atomically (list preserved)', 'pass', got = 'OK:OK:INVALID_DATA' and cnt = 3, 'got', got);
  got := pg_temp.gd_cycle(ua, 'AVAILABLE', jsonb_build_array(jsonb_build_object('appid', '999', 'name', 'Neg', 'icon', null, 'playtime', -5)), true);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'negative playtime is rejected atomically (list preserved)', 'pass', got = 'OK:OK:INVALID_DATA' and cnt = 3, 'got', got);

  got := pg_temp.gd_cycle(ua, 'AVAILABLE', '[]'::jsonb, true);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
  select s.last_result into got2 from public.game_discovery_state s where s.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'an AVAILABLE claim with an EMPTY list is downgraded to MALFORMED and changes nothing', 'pass', cnt = 3 and got2 = 'MALFORMED', 'got', got2);
  got := pg_temp.gd_cycle(ua, 'AVAILABLE', (select jsonb_agg(jsonb_build_object('appid', g::text, 'name', 'x', 'icon', null, 'playtime', 1)) from generate_series(1, 10001) g), true);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
  select s.last_result into got2 from public.game_discovery_state s where s.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'more than 10,000 games in one result is refused as MALFORMED and changes nothing', 'pass', cnt = 3 and got2 = 'MALFORMED', 'got', got2);

  -- a result that arrives after its reservation expired
  update private.game_discovery_attempts set created_at = created_at - interval '3 hours' where user_id = ua;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.reservation_id into att from public.reserve_steam_games_refresh() q; reset role;
  set local role service_role; select x.status into got from public.begin_steam_games_fetch(att) x; reset role;
  update private.game_discovery_attempts set created_at = now() - interval '5 minutes' where attempt_id = att;
  set local role service_role; select public.save_steam_games_result(att, 'AVAILABLE', '[{"appid":"1","name":"Late","icon":null,"playtime":1}]'::jsonb) into got2; reset role;
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'a result arriving after its reservation expired is EXPIRED and changes nothing', 'pass', got = 'OK' and got2 = 'EXPIRED' and cnt = 3, 'got', got2);

  -- the fetched Steam account is swapped underneath the reservation (defense in depth: same connection row, different account)
  update private.game_discovery_attempts set created_at = created_at - interval '3 hours' where user_id = ub;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.reservation_id into att from public.reserve_steam_games_refresh() q; reset role;
  set local role service_role; select x.status into got from public.begin_steam_games_fetch(att) x; reset role;
  update public.gaming_connections set provider_account_id = steam_g2 where entity_id = ent_b and provider_key = 'steam';
  set local role service_role; select public.save_steam_games_result(att, 'AVAILABLE', '[{"appid":"1","name":"Swapped","icon":null,"playtime":1}]'::jsonb) into got2; reset role;
  update public.gaming_connections set provider_account_id = steam_b where entity_id = ent_b and provider_key = 'steam';
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_b and d.external_game_id = '1';
  res := res || jsonb_build_object('step', 'a result is refused (CONNECTION_CHANGED) if the fetched Steam account is no longer the connection''s account', 'pass', got = 'OK' and got2 = 'CONNECTION_CHANGED' and cnt = 0, 'got', got2);
  -- ------------------------------------------------------------------ 9. a successful refresh replaces the list; first_seen survives; an accessible empty library is EMPTY
  got := pg_temp.gd_cycle(ua, 'AVAILABLE', '[{"appid":"570","name":"Dota 2","icon":"0bbb630d63262dd66d2fdde8f1d8f8b6b0dc0fca","playtime":5100}]'::jsonb, true);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
  select d.first_seen_at, d.playtime_minutes into seen_first_after, n from public.discovered_games d where d.connection_id = conn_a and d.external_game_id = '570';
  select s.game_count, s.last_success_at into rec from public.game_discovery_state s where s.connection_id = conn_a;
  -- (>= : this whole matrix is ONE transaction, so now() is frozen; in production every RPC is its own transaction and the time advances)
  res := res || jsonb_build_object('step', 'a successful refresh drops games Steam no longer returns, updates the rest, and keeps first_seen_at', 'pass',
    got = 'OK:OK:SAVED' and cnt = 1 and n = 5100 and seen_first_after = seen_first and rec.game_count = 1 and rec.last_success_at >= success_before, 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select * into rec from public.get_my_game_discovery_state('steam'); reset role;
  res := res || jsonb_build_object('step', 'once Marvel Rivals is no longer returned it is no longer recognized', 'pass', jsonb_array_length(rec.recognized_games) = 0);
  got := pg_temp.gd_cycle(ua, 'EMPTY', null, true);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
  select s.last_result, s.game_count into rec from public.game_discovery_state s where s.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'a genuinely accessible EMPTY library clears the list and is recorded as EMPTY with count 0', 'pass', got = 'OK:OK:SAVED' and cnt = 0 and rec.last_result = 'EMPTY' and rec.game_count = 0, 'got', got);
  got := pg_temp.gd_cycle(ua, 'AVAILABLE', games1, true);
  got := pg_temp.gd_cycle(ua, 'UNAVAILABLE', null, true);
  select count(*) into cnt from public.discovered_games d where d.connection_id = conn_a;
  select s.last_result, s.game_count into rec from public.game_discovery_state s where s.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'a private/unavailable library is NOT treated as zero games (the 3 stored games survive)', 'pass', cnt = 3 and rec.last_result = 'UNAVAILABLE' and rec.game_count = 3);

  -- ------------------------------------------------------------------ 10. table-level integrity (defense in depth beneath every code path)
  begin insert into public.discovered_games (connection_id, entity_id, source_provider, external_game_id, trust_status) values (conn_a, ent_a, 'steam', '1', 'VERIFIED'); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'the table refuses any trust label other than DISCOVERED_FROM_<PROVIDER> (a discovered game can never be VERIFIED)', 'pass', got = 'CHECK', 'got', got);
  begin insert into public.discovered_games (connection_id, entity_id, source_provider, external_game_id, trust_status) values (conn_a, ent_a, 'steam', 'abc', 'DISCOVERED_FROM_STEAM'); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; when others then got := sqlerrm; end;
  begin insert into public.discovered_games (connection_id, entity_id, source_provider, external_game_id, icon_ref, trust_status) values (conn_a, ent_a, 'steam', '2', 'not-a-hash', 'DISCOVERED_FROM_STEAM'); got2 := 'NO_ERROR'; exception when check_violation then got2 := 'CHECK'; when others then got2 := sqlerrm; end;
  res := res || jsonb_build_object('step', 'the table refuses a non-numeric Steam app id and a malformed icon hash', 'pass', got = 'CHECK' and got2 = 'CHECK', 'got', got || '/' || got2);
  begin insert into public.game_discovery_state (connection_id, entity_id, source_provider, last_result) values (conn_g, ent_g, 'steam', 'VERIFIED'); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'the state table refuses any result word outside the six discovery outcomes', 'pass', got = 'CHECK', 'got', got);

  -- ------------------------------------------------------------------ 11. throttle caps (per identity, failures count, all before any Steam request)
  n := 0;
  for i in 1..6 loop
    update private.game_discovery_attempts set created_at = created_at - interval '3 minutes' where user_id = ue;
    got := pg_temp.gd_cycle(ue, 'TEMPORARY_ERROR', null, false);
    if got = 'OK:OK:SAVED' then n := n + 1; end if;
  end loop;
  update private.game_discovery_attempts set created_at = created_at - interval '3 minutes' where user_id = ue;
  perform set_config('request.jwt.claims', json_build_object('sub', ue, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.status, q.retry_after_seconds, q.reservation_id is null into got, cnt, flag from public.reserve_steam_games_refresh() q; reset role;
  res := res || jsonb_build_object('step', 'six attempts within an hour are allowed (failures count), the seventh is RATE_LIMITED with a positive wait and no reservation', 'pass', n = 6 and got = 'RATE_LIMITED' and cnt > 0 and flag, 'got', got || ':' || n);

  n := 0;
  for i in 1..20 loop
    update private.game_discovery_attempts set created_at = created_at - interval '65 minutes' where user_id = uf;
    got := pg_temp.gd_cycle(uf, 'UNAVAILABLE', null, false);
    if got = 'OK:OK:SAVED' then n := n + 1; end if;
  end loop;
  update private.game_discovery_attempts set created_at = created_at - interval '65 minutes' where user_id = uf;
  got := pg_temp.gd_cycle(uf, 'UNAVAILABLE', null, false);
  res := res || jsonb_build_object('step', 'twenty attempts in a day are allowed, the twenty-first is RATE_LIMITED', 'pass', n = 20 and got = 'RATE_LIMITED', 'got', got || ':' || n);

  -- ------------------------------------------------------------------ 12. connection changes: no stale results, no inheritance, no throttle reset
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.reservation_id into rid from public.reserve_steam_games_refresh() q; reset role;
  set local role service_role; select x.status into got from public.begin_steam_games_fetch(rid) x; reset role;
  -- the owner disconnects Steam and reconnects the SAME account while the fetch is in flight
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated; perform public.disconnect_my_connection('steam'); select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c;
  select public.complete_steam_connection_attempt(att, steam_g) into got2;
  select public.save_steam_games_result(rid, 'AVAILABLE', games1) into keys;
  reset role;
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_g;
  res := res || jsonb_build_object('step', 'a result fetched for a connection that was since disconnected/replaced is CONNECTION_CHANGED and is not saved', 'pass', got = 'OK' and got2 = 'CONNECTED' and keys = 'CONNECTION_CHANGED' and cnt = 0, 'got', keys);
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.status into got from public.reserve_steam_games_refresh() q; reset role;
  res := res || jsonb_build_object('step', 'disconnect + reconnect does not reset the throttle (the recent attempt still applies)', 'pass', got = 'COOLDOWN', 'got', got);

  -- A: store games, publish + Steam ON, then check disconnect isolation and the public boundary
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); perform 1 from public.set_my_section_visibility('steam', true); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select to_jsonb(p) into js from public.get_public_identity('zgamea') p;
  select to_jsonb(p) into jq from public.get_public_identity_by_qr(qr_a) p;
  reset role;
  select string_agg(k, ',' order by k collate "C") into keys from jsonb_object_keys(js) k;
  res := res || jsonb_build_object('step', 'PUBLIC BOUNDARY: published + Steam ON + games stored: the response keeps exactly its 14 columns', 'pass',
    keys = 'avatar_media_reference,bio,display_name,education_work_catalog,education_work_status,field_of_study,gamid_handle,institution,intro_derivative_path,intro_transition_key,primary_role_key,public_sections,role_catalog,role_keys', 'got', keys);
  select string_agg(k, ',' order by k) into got from jsonb_object_keys(js->'public_sections'->'steam') k;
  res := res || jsonb_build_object('step', 'PUBLIC BOUNDARY: the Steam section is unchanged (steam_id + trust_status only) - no game data', 'pass', got = 'steam_id,trust_status' and (js->'public_sections')::text !~* 'game|2767030|570|dota|marvel|discovered|playtime|icon', 'got', got);
  res := res || jsonb_build_object('step', 'PUBLIC BOUNDARY: no game name, app id, or discovery word appears anywhere in the anonymous response (handle and QR agree)', 'pass',
    js::text !~* 'marvel|rivals|2767030|dota|discovered|playtime|playtime_minutes|icon_ref' and jq = js);

  -- disconnect isolation
  select count(*) into cnt from public.discovered_games d where d.entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select public.disconnect_my_connection('steam') into got; reset role;
  select count(*) into n from public.discovered_games d where d.entity_id = ent_a;
  select count(*) into i from public.game_discovery_state s where s.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'disconnecting Steam removes that connection''s discovered games and state (private data of the removed link), and nothing else', 'pass', cnt = 3 and got = 'true' and n = 0 and i = 0, 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select * into rec from public.get_my_game_discovery_state('steam'); reset role;
  res := res || jsonb_build_object('step', 'after a disconnect the state RPC reports not connected with an empty recognition list', 'pass', rec.is_connected = false and jsonb_array_length(rec.recognized_games) = 0);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select q.status into got from public.reserve_steam_games_refresh() q; reset role;
  res := res || jsonb_build_object('step', 'after a disconnect a refresh reservation is NOT_CONNECTED (nothing can be looked up without a connection)', 'pass', got = 'NOT_CONNECTED', 'got', got);

  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
