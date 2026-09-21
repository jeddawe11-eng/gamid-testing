-- Global rank / stats privacy scope - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/public-stats-global-db.sql
-- (Requires migration 20260922200000. To validate the migration BEFORE applying it, run the migration's content and this file's content wrapped together in one
--  always-failing statement: everything rolls back either way.)
--
-- Uses ONLY disposable auth users / identities created inside the transaction, impersonates anon / authenticated exactly as PostgREST does, and ALWAYS raises an
-- exception carrying the results, so the whole transaction rolls back and nothing (including @black, the real Steam / Discord connections, the League profile,
-- discovered games, manual declarations and every visibility flag) is touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();   -- League + Steam (discovered games) + Discord
  ub uuid := gen_random_uuid();   -- an unranked League account
  ent_a uuid; ent_b uuid; qr_a text; conn_a uuid; att uuid; st text;
  got text; got2 text; keys text; flag boolean; flag2 boolean;
  js jsonb; jq jsonb; lg jsonb; jl jsonb; before_league jsonb; after_league jsonb; before_profile jsonb; after_profile jsonb;
begin
  execute $fn$
    create function pg_temp.sg_as(p_user uuid, p_sql text) returns text language plpgsql as $f$
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
    create function pg_temp.sg_anon(p_sql text) returns text language plpgsql as $f$
    declare out text;
    begin
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      set local role anon;
      begin execute p_sql into out; exception when others then out := 'ERR:' || sqlerrm; end;
      reset role;
      return out;
    end $f$;
  $fn$;
  -- the anonymous public identity of a handle, as jsonb (null when there is no row)
  execute $fn$
    create function pg_temp.sg_identity(p_handle text) returns jsonb language plpgsql as $f$
    declare out text;
    begin
      out := pg_temp.sg_anon(format($q$ select to_jsonb(p)::text from public.get_public_identity(%L) p $q$, p_handle));
      return case when out is null then null else out::jsonb end;
    end $f$;
  $fn$;
  -- the anonymous My Games library of a handle, as jsonb (null when there is no row)
  execute $fn$
    create function pg_temp.sg_library(p_handle text) returns jsonb language plpgsql as $f$
    declare out text;
    begin
      out := pg_temp.sg_anon(format($q$ select to_jsonb(t)::text from public.get_public_my_games(%L, null, 30, 0) t $q$, p_handle));
      return case when out is null then null else out::jsonb end;
    end $f$;
  $fn$;
  execute $fn$
    create function pg_temp.sg_setting(p_user uuid, p_setting text, p_on boolean) returns text language plpgsql as $f$
    begin
      return pg_temp.sg_as(p_user, format($q$ select count(*)::text from public.set_my_public_games_setting(%L, %L) $q$, p_setting, p_on));
    end $f$;
  $fn$;

  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zsg-a@example.invalid', now()), (ub, 'zsg-b@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zsga', 'Zed A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zsgb', 'Zed B', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zsga';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zsgb';
  select q.public_token into qr_a from public.qr_references q where q.entity_id = ent_a;

  -- A: Discord (public), Steam (public) with two discovered games, one manual game on the League key, League (private for now)
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('discord') s; reset role;
  set local role service_role; select c.attempt_id into att from public.consume_connection_attempt(st) c;
  select public.complete_connection_attempt(att, '900000000000000088', 'zsg_a', 'Zed A Discord', null) into got;
  perform public.record_connection_discovery(att, '900000000000000088', 'riot', 'ABSENT', 3, 0, null, null, null, null, null, null, null, null, null, null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role; select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c; select public.complete_steam_connection_attempt(att, '76561198000000051') into got; reset role;
  select g.connection_id into conn_a from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam';
  insert into public.discovered_games (connection_id, entity_id, source_provider, external_game_id, game_name, playtime_minutes, trust_status)
  values (conn_a, ent_a, 'steam', '2767030', 'Marvel Rivals', 255, 'DISCOVERED_FROM_STEAM'), (conn_a, ent_a, 'steam', '900201', 'Zzz Steam Only', 1254, 'DISCOVERED_FROM_STEAM');
  got := pg_temp.sg_as(ua, $q$ select public.save_my_manual_game('league_of_legends', array['pc']) $q$);
  insert into public.league_profiles (entity_id, game_name, tag_line, platform_id, data_source, solo_rank_state, solo_tier, solo_division, solo_lp, solo_wins, solo_losses, source_url, fetched_at, last_attempt_at, last_result, is_public)
  values (ent_a, 'Espada black', 'esp', 'ME1', 'OPGG_TEMPORARY', 'RANKED', 'BRONZE', 'IV', 7, 2, 3, 'https://op.gg/private', now(), now(), 'OK', false),
         (ent_b, 'Unranked One', 'ur1', 'EUW1', 'OPGG_TEMPORARY', 'UNRANKED', null, null, null, null, null, 'https://op.gg/private2', now(), now(), 'OK', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from public.set_my_identity_visibility(true);
  perform 1 from public.set_my_section_visibility('discord', true);
  perform 1 from public.set_my_section_visibility('steam', true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  res := res || jsonb_build_object('step', 'setup: disposable identities, published (A: Discord + Steam public, League PRIVATE; B: a public unranked League)', 'pass', ent_a is not null and conn_a is not null and got = 'SAVED');

  select to_jsonb(l) - 'updated_at' - 'fetched_at' into before_league from public.league_profiles l where l.entity_id = ent_a;
  select to_jsonb(p) - 'updated_at' - 'show_game_stats' - 'show_my_games' - 'show_game_playtime' into before_profile from public.profiles p where p.entity_id = ent_a;

  -- ------------------------------------------------------------------ 1. the League section switch stays the FIRST gate
  js := pg_temp.sg_identity('zsga');
  res := res || jsonb_build_object('step', 'League Show on my GamID OFF: no League section at all (the stats switch is irrelevant) - existing behavior preserved', 'pass', not ((js -> 'public_sections') ? 'league'));
  got := pg_temp.sg_setting(ua, 'stats', true);
  js := pg_temp.sg_identity('zsga');
  res := res || jsonb_build_object('step', 'League OFF + global stats ON: STILL no League section (the League switch is not replaced or overridden)', 'pass', got = '1' and not ((js -> 'public_sections') ? 'league'));
  got := pg_temp.sg_setting(ua, 'stats', false);

  -- ------------------------------------------------------------------ 2. League ON + stats OFF: identity yes, rank / stats no (in the RESPONSE, not in the page)
  got := pg_temp.sg_as(ua, $q$ select count(*)::text from public.set_my_section_visibility('league', true) $q$);
  js := pg_temp.sg_identity('zsga');
  lg := js -> 'public_sections' -> 'league';
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(lg) k;
  res := res || jsonb_build_object('step', 'STATS OFF + League public ON: the League IDENTITY is returned (Riot ID, region, trust label, source, freshness) and exactly those fields', 'pass',
    got = '1' and keys = 'data_source,game_name,identity_source,platform_id,tag_line,trust_status,updated_at' and lg ->> 'game_name' = 'Espada black' and lg ->> 'tag_line' = 'esp' and lg ->> 'platform_id' = 'ME1', 'got', keys);
  res := res || jsonb_build_object('step', 'STATS OFF: tier is absent from the anonymous response', 'pass', not (lg ? 'tier') and js::text !~* 'BRONZE|"tier"');
  res := res || jsonb_build_object('step', 'STATS OFF: division is absent', 'pass', not (lg ? 'division') and js::text !~ '"division"');
  res := res || jsonb_build_object('step', 'STATS OFF: LP is absent', 'pass', not (lg ? 'lp') and js::text !~ '"lp"');
  res := res || jsonb_build_object('step', 'STATS OFF: wins are absent', 'pass', not (lg ? 'wins') and js::text !~ '"wins"');
  res := res || jsonb_build_object('step', 'STATS OFF: losses are absent', 'pass', not (lg ? 'losses') and js::text !~ '"losses"');
  res := res || jsonb_build_object('step', 'STATS OFF: rank_state (even "RANKED" / "UNRANKED") is absent - the response says nothing about the rank', 'pass', not (lg ? 'rank_state') and js::text !~* 'rank_state|RANKED');
  res := res || jsonb_build_object('step', 'STATS OFF: no protected rank / stat value appears ANYWHERE in the serialized anonymous response', 'pass', js::text !~* 'tier|division|"lp"|wins|losses|rank_state|BRONZE|solo_');
  res := res || jsonb_build_object('step', 'League stays MANUAL / temporary source, never verified (also with stats OFF)', 'pass', lg ->> 'trust_status' = 'MANUAL' and lg ->> 'data_source' = 'OPGG_TEMPORARY' and lg ->> 'identity_source' = 'MANUAL_RIOT_ID' and js::text !~* 'verified');

  -- the QR route is the same boundary
  set local role anon; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select to_jsonb(p) into jq from public.get_public_identity_by_qr(qr_a) p; reset role;
  res := res || jsonb_build_object('step', 'the QR route returns exactly the same response (stats OFF: no rank there either)', 'pass', jq = js and jq::text !~* 'tier|"lp"|wins|losses');

  -- ------------------------------------------------------------------ 3. League ON + stats ON: the existing rank / stats return
  got := pg_temp.sg_setting(ua, 'stats', true);
  js := pg_temp.sg_identity('zsga');
  lg := js -> 'public_sections' -> 'league';
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(lg) k;
  res := res || jsonb_build_object('step', 'STATS ON + League public ON: the existing rank / stats appear (the same League fields as before this fix), values exactly as stored', 'pass',
    got = '1' and keys = 'data_source,division,game_name,identity_source,losses,lp,platform_id,rank_state,tag_line,tier,trust_status,updated_at,wins'
    and lg ->> 'tier' = 'BRONZE' and lg ->> 'division' = 'IV' and (lg ->> 'lp')::int = 7 and (lg ->> 'wins')::int = 2 and (lg ->> 'losses')::int = 3 and lg ->> 'rank_state' = 'RANKED', 'got', keys);
  res := res || jsonb_build_object('step', 'STATS ON: League is still MANUAL / OPGG_TEMPORARY (PROTOTYPE / UNVERIFIED semantics unchanged)', 'pass', lg ->> 'trust_status' = 'MANUAL' and lg ->> 'data_source' = 'OPGG_TEMPORARY' and js::text !~* 'verified');
  set local role anon; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select to_jsonb(p) into jq from public.get_public_identity_by_qr(qr_a) p; reset role;
  res := res || jsonb_build_object('step', 'STATS ON: the QR route agrees with the handle route', 'pass', jq = js);

  -- an unranked account, stats OFF / ON
  js := pg_temp.sg_identity('zsgb');
  res := res || jsonb_build_object('step', 'an UNRANKED League account, stats OFF: identity only, no rank_state', 'pass', (js -> 'public_sections' -> 'league' ->> 'game_name') = 'Unranked One' and not ((js -> 'public_sections' -> 'league') ? 'rank_state'));
  got := pg_temp.sg_setting(ub, 'stats', true);
  js := pg_temp.sg_identity('zsgb');
  res := res || jsonb_build_object('step', 'an UNRANKED League account, stats ON: rank_state UNRANKED and no tier / lp', 'pass', (js -> 'public_sections' -> 'league' ->> 'rank_state') = 'UNRANKED' and not ((js -> 'public_sections' -> 'league') ? 'tier') and not ((js -> 'public_sections' -> 'league') ? 'lp'));
  got := pg_temp.sg_setting(ub, 'stats', false);

  -- ------------------------------------------------------------------ 4. the gate itself is global (independent of Show My Games), closed by default and when unpublished
  select private.public_game_stats_allowed(ent_a) into flag;
  select private.public_my_games_allowed(ent_a) into flag2;
  res := res || jsonb_build_object('step', 'the stats gate is GLOBAL: open with stats ON + published even though Show My Games is OFF (the My Games gate stays closed)', 'pass', flag = true and flag2 = false);
  got := pg_temp.sg_setting(ua, 'stats', false);
  select private.public_game_stats_allowed(ent_a) into flag;
  select private.public_game_stats_allowed(ent_b) into flag2;
  res := res || jsonb_build_object('step', 'the stats gate is closed with the switch OFF, and for an identity that never switched it on', 'pass', flag = false and flag2 = false);
  got := pg_temp.sg_setting(ua, 'stats', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(false); reset role;
  select private.public_game_stats_allowed(ent_a) into flag;
  res := res || jsonb_build_object('step', 'unpublished: the gate is closed and the anonymous identity route returns no row at all', 'pass', flag = false and pg_temp.sg_identity('zsga') is null);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  got := pg_temp.sg_anon($q$ select private.public_game_stats_allowed(gen_random_uuid())::text $q$);
  res := res || jsonb_build_object('step', 'the gate has no client grant (anon cannot call it)', 'pass', got like 'ERR:permission denied%', 'got', got);

  -- ------------------------------------------------------------------ 5. Public My Games follows the same switch (stats OFF / ON)
  got := pg_temp.sg_setting(ua, 'my_games', true);
  got := pg_temp.sg_setting(ua, 'stats', false);
  jl := pg_temp.sg_library('zsga');
  res := res || jsonb_build_object('step', 'My Games, stats OFF: no stats anywhere in the library (the League of Legends row has no rank)', 'pass', jl::text !~* '"stats"|solo_|tier' and jl::text ~ 'League of Legends');
  got := pg_temp.sg_setting(ua, 'stats', true);
  jl := pg_temp.sg_library('zsga');
  res := res || jsonb_build_object('step', 'My Games, stats ON + League public: the League game shows its existing stats, still MANUAL / OPGG_TEMPORARY', 'pass',
    jl::text ~ '"solo_tier": "BRONZE"' and jl::text ~ 'OPGG_TEMPORARY' and jl::text !~* 'verified');

  -- ------------------------------------------------------------------ 6. playtime: a global switch, unchanged behavior, independent of stats, present ONLY inside My Games
  got := pg_temp.sg_as(ua, $q$ select s.show_game_playtime::text from public.set_my_game_playtime_visibility(false) s $q$);
  got2 := pg_temp.sg_setting(ua, 'stats', true);
  js := pg_temp.sg_identity('zsga');
  jl := pg_temp.sg_library('zsga');
  res := res || jsonb_build_object('step', 'PLAYTIME OFF (stats ON): no playtime in the library, in the identity preview or anywhere else in the public identity', 'pass', jl::text !~* 'playtime|minutes' and js::text !~* 'playtime|minutes');
  got := pg_temp.sg_as(ua, $q$ select s.show_game_playtime::text from public.set_my_game_playtime_visibility(true) s $q$);
  got2 := pg_temp.sg_setting(ua, 'stats', false);
  js := pg_temp.sg_identity('zsga');
  jl := pg_temp.sg_library('zsga');
  res := res || jsonb_build_object('step', 'PLAYTIME ON (stats OFF): the allowed playtime appears (Marvel Rivals 255, Zzz Steam Only 1254) while the League card and library carry no rank', 'pass',
    jl::text ~ '"playtime_minutes": 255' and jl::text ~ '"playtime_minutes": 1254' and js::text ~ 'playtime_minutes' and jl::text !~* 'solo_|tier' and js::text !~* '"tier"|"lp"|wins|losses');
  res := res || jsonb_build_object('step', 'playtime appears ONLY inside My Games: the League, Discord and Steam sections of the identity never carry it', 'pass',
    (js -> 'public_sections' -> 'league')::text !~* 'playtime|minutes' and (js -> 'public_sections' -> 'discord')::text !~* 'playtime|minutes' and (js -> 'public_sections' -> 'steam')::text !~* 'playtime|minutes');
  got := pg_temp.sg_as(ua, $q$ select s.show_game_playtime::text from public.set_my_game_playtime_visibility(false) s $q$);

  -- ------------------------------------------------------------------ 7. Discord / Steam connection display is unaffected
  got := pg_temp.sg_setting(ua, 'stats', false);
  js := pg_temp.sg_identity('zsga');
  got2 := pg_temp.sg_setting(ua, 'stats', true);
  jq := pg_temp.sg_identity('zsga');
  res := res || jsonb_build_object('step', 'Discord and Steam public sections are identical with stats ON and OFF (same fields, CONNECTED, no game claim)', 'pass',
    (js -> 'public_sections' -> 'discord') = (jq -> 'public_sections' -> 'discord') and (js -> 'public_sections' -> 'steam') = (jq -> 'public_sections' -> 'steam')
    and (js -> 'public_sections' -> 'discord' ->> 'display_name') = 'Zed A Discord' and (js -> 'public_sections' -> 'steam' ->> 'trust_status') = 'CONNECTED' and (js -> 'public_sections' -> 'steam' ->> 'steam_id') = '76561198000000051');
  select string_agg(k, ',' order by k collate "C") into keys from jsonb_object_keys(js) k;
  res := res || jsonb_build_object('step', 'the public identity still has exactly its 14 columns', 'pass',
    keys = 'avatar_media_reference,bio,display_name,education_work_catalog,education_work_status,field_of_study,gamid_handle,institution,intro_derivative_path,intro_transition_key,primary_role_key,public_sections,role_catalog,role_keys', 'got', keys);

  -- ------------------------------------------------------------------ 8. nothing was written to the League row, the connections, the games or the profile by any of this
  select to_jsonb(l) - 'updated_at' - 'fetched_at' into after_league from public.league_profiles l where l.entity_id = ent_a;
  select to_jsonb(p) - 'updated_at' - 'show_game_stats' - 'show_my_games' - 'show_game_playtime' into after_profile from public.profiles p where p.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'the League row (apart from its own public switch, changed on purpose) and the rest of the profile are exactly as before: the stats switch only flips its own flag', 'pass',
    (before_league - 'is_public') = (after_league - 'is_public') and before_profile = after_profile);
  res := res || jsonb_build_object('step', 'connections and games untouched (Discord + Steam still connected, 2 discovered games, 1 manual platform)', 'pass',
    (select count(*) from public.gaming_connections g where g.entity_id = ent_a) = 2 and (select count(*) from public.discovered_games d where d.entity_id = ent_a) = 2
    and (select count(*) from public.entity_game_platforms x where x.entity_id = ent_a) = 1);

  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
