-- League profile prototype — live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/league-profile-db.sql
-- (Requires migration 20260920100000 to be applied. To validate the migration BEFORE applying it, run the migration's content
--  and this file's content wrapped together in one always-failing statement: everything rolls back either way.)
--
-- Creates disposable auth users / identities, impersonates anon / authenticated / service_role exactly as PostgREST does, and
-- ALWAYS raises an exception carrying the results, so the whole transaction rolls back and nothing (including @black, the
-- Discord connection, and the Discord discovery result) is ever touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  ud uuid := gen_random_uuid();
  ent_a uuid;
  ent_b uuid;
  r record;
  got text;
  cnt integer;
  n integer;
  keys text;
  conn_before integer;
  disc_before integer;
  res_id uuid;
begin
  select count(*) into conn_before from public.gaming_connections;
  select count(*) into disc_before from public.connection_discovery_results;

  -- ------------------------------------------------------------------ setup (as postgres)
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'zproto-a@example.invalid', now()), (ub, 'zproto-b@example.invalid', now()),
    (uc, 'zproto-c@example.invalid', null), (ud, 'zproto-d@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from public.create_solo_identity('zprotoa', 'Zed Alpha', date '1990-01-01', 'en');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from public.create_solo_identity('zprotob', 'Zed Beta', date '1990-01-01', 'en');
  reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zprotoa';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zprotob';

  -- ------------------------------------------------------------------ 1. privilege boundary
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.save_league_lookup(gen_random_uuid(), 'OPGG_TEMPORARY', 'A', 'B', 'KR', 'NOT_REPORTED', null, null, null, null, null, null, 'https://x.test/p', null); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user cannot call save_league_lookup', 'pass', got like 'permission denied%' or got = 'BACKEND_ONLY', 'got', got);
  begin perform public.finish_league_lookup(gen_random_uuid(), 'NOT_FOUND'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user cannot call finish_league_lookup', 'pass', got like 'permission denied%' or got = 'BACKEND_ONLY', 'got', got);
  begin perform private.save_league_lookup_impl(gen_random_uuid(), 'OPGG_TEMPORARY', 'A', 'B', 'KR', 'NOT_REPORTED', null, null, null, null, null, null, 'https://x.test/p', null); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user cannot call the private save implementation directly', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from public.league_profiles; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user has no direct table access to league_profiles', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from private.league_lookup_attempts; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user cannot read the private throttle ledger', 'pass', got like 'permission denied%', 'got', got);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.get_my_league_profile(); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot read a league profile', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from public.reserve_league_lookup('add', 'KR', 'A', 'B'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot reserve a lookup', 'pass', got like 'permission denied%', 'got', got);
  begin perform public.remove_my_league_profile(); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot remove a league profile', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from public.league_profiles; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon has no table access to league_profiles', 'pass', got like 'permission denied%', 'got', got);
  reset role;

  set local role service_role;
  begin perform public.reserve_league_lookup('add', 'KR', 'A', 'B'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'service_role cannot reserve on someone''s behalf (reservation requires an authenticated owner)', 'pass', got like 'permission denied%', 'got', got);

  -- ------------------------------------------------------------------ 2. reservation guards
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.reserve_league_lookup('add', 'KR', 'Name', 'TAG'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'unverified email cannot reserve (EMAIL_NOT_VERIFIED)', 'pass', got = 'EMAIL_NOT_VERIFIED', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.reserve_league_lookup('add', 'KR', 'Name', 'TAG'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'a user without a GamID identity cannot reserve (IDENTITY_NOT_FOUND)', 'pass', got = 'IDENTITY_NOT_FOUND', 'got', got);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.reserve_league_lookup('delete', 'KR', 'Name', 'TAG'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'an unknown action is rejected (INVALID_ACTION)', 'pass', got = 'INVALID_ACTION', 'got', got);
  n := 0;
  for r in select * from (values ('MARS', 'Name', 'TAG'), ('KR', 'Na#me', 'TAG'), ('KR', 'Na/me', 'TAG'), ('KR', repeat('x', 33), 'TAG'), ('KR', '', 'TAG'),
                                  ('KR', 'Name', 'T AG'), ('KR', 'Name', 'T-AG'), ('KR', 'Name', ''), ('KR', 'Name', repeat('t', 17)), ('KR', 'Name', 'T#G')) as v(p, g, t) loop
    select s.status into got from public.reserve_league_lookup('add', r.p, r.g, r.t) s;
    if got = 'INVALID_INPUT' then n := n + 1; end if;
  end loop;
  reset role;
  res := res || jsonb_build_object('step', 'malformed input (region, characters, lengths) is rejected again by the database (INVALID_INPUT)', 'pass', n = 10, 'rejected', n);
  select count(*) into cnt from private.league_lookup_attempts a where a.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'rejected input never consumes a throttle slot', 'pass', cnt = 0);

  -- ------------------------------------------------------------------ 3. add: reserve, spacing throttle
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.reservation_id, s.status, s.game_name, s.tag_line, s.platform_id into r from public.reserve_league_lookup('add', ' kr ', '  Hide on bush ', ' KR1 ') s;
  reset role;
  res_id := r.reservation_id;
  res := res || jsonb_build_object('step', 'a valid add reserves a one-time slot with the normalized identity', 'pass', r.status = 'OK' and res_id is not null and r.game_name = 'Hide on bush' and r.tag_line = 'KR1' and r.platform_id = 'KR');
  select count(*) into cnt from private.league_lookup_attempts a where a.entity_id = ent_a and a.action = 'add';
  res := res || jsonb_build_object('step', 'the reservation is recorded in the throttle ledger for the caller''s identity only', 'pass', cnt = 1);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.status, s.retry_after_seconds into r from public.reserve_league_lookup('add', 'KR', 'Hide on bush', 'KR1') s;
  reset role;
  res := res || jsonb_build_object('step', 'a second lookup within 60 s is refused (COOLDOWN) with a retry hint', 'pass', r.status = 'COOLDOWN' and r.retry_after_seconds between 1 and 60, 'got', r.status || ':' || coalesce(r.retry_after_seconds::text, 'null'));

  -- ------------------------------------------------------------------ 4. save guards (service_role)
  set local role service_role;
  select public.save_league_lookup(gen_random_uuid(), 'OPGG_TEMPORARY', 'Hide on bush', 'KR1', 'KR', 'NOT_REPORTED', null, null, null, null, null, null, 'https://op.gg/p', null) into got;
  res := res || jsonb_build_object('step', 'an unknown reservation cannot save (INVALID_RESERVATION)', 'pass', got = 'INVALID_RESERVATION', 'got', got);
  select public.save_league_lookup(res_id, 'OPGG_TEMPORARY', 'Somebody Else', 'KR1', 'KR', 'NOT_REPORTED', null, null, null, null, null, null, 'https://op.gg/p', null) into got;
  reset role;
  select count(*) into cnt from public.league_profiles p where p.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'a result for a different player than the one reserved is refused and nothing is saved (IDENTITY_MISMATCH)', 'pass', got = 'IDENTITY_MISMATCH' and cnt = 0, 'got', got);
  set local role service_role;
  select public.save_league_lookup(res_id, 'OPGG_TEMPORARY', 'Hide on bush', 'KR1', 'KR', 'NOT_REPORTED', null, null, null, null, null, null, 'https://op.gg/p', null) into got;
  reset role;
  res := res || jsonb_build_object('step', 'a used reservation can never be reused, even with correct data (INVALID_RESERVATION)', 'pass', got = 'INVALID_RESERVATION', 'got', got);

  -- an expired reservation (older than 3 minutes)
  update private.league_lookup_attempts set created_at = created_at - interval '3 hours' where entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.reservation_id into res_id from public.reserve_league_lookup('add', 'KR', 'Hide on bush', 'KR1') s;
  reset role;
  update private.league_lookup_attempts set created_at = now() - interval '4 minutes' where attempt_id = res_id;
  set local role service_role;
  select public.save_league_lookup(res_id, 'OPGG_TEMPORARY', 'Hide on bush', 'KR1', 'KR', 'NOT_REPORTED', null, null, null, null, null, null, 'https://op.gg/p', null) into got;
  reset role;
  res := res || jsonb_build_object('step', 'an expired reservation cannot save (EXPIRED)', 'pass', got = 'EXPIRED', 'got', got);

  -- invalid data is rejected by the table constraints, not stored
  update private.league_lookup_attempts set created_at = created_at - interval '3 hours' where entity_id = ent_a;
  for r in select * from (values
      ('bad tier',            'OPGG_TEMPORARY', 'RANKED', 'WOOD', 'I', 10),
      ('ranked without tier', 'OPGG_TEMPORARY', 'RANKED', null, null, null),
      ('unranked with tier',  'OPGG_TEMPORARY', 'NOT_REPORTED', 'GOLD', 'I', 5),
      ('unknown source',      'SOME_OTHER_SITE', 'NOT_REPORTED', null, null, null),
      ('bad division',        'OPGG_TEMPORARY', 'RANKED', 'GOLD', 'V', 5),
      ('negative lp',         'OPGG_TEMPORARY', 'RANKED', 'GOLD', 'I', -1)) as v(label, src, st, tier, div, lp) loop
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select s.reservation_id into res_id from public.reserve_league_lookup('add', 'KR', 'Hide on bush', 'KR1') s;
    reset role;
    update private.league_lookup_attempts set created_at = now() - interval '2 minutes' where attempt_id = res_id;
    set local role service_role;
    select public.save_league_lookup(res_id, r.src, 'Hide on bush', 'KR1', 'KR', r.st, r.tier, r.div, r.lp, null, null, null, 'https://op.gg/p', null) into got;
    reset role;
    res := res || jsonb_build_object('step', 'invalid data is refused and not stored: ' || r.label, 'pass', got = 'INVALID_DATA', 'got', got);
    update private.league_lookup_attempts set created_at = created_at - interval '3 hours' where entity_id = ent_a;
  end loop;
  select count(*) into cnt from public.league_profiles p where p.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'none of the refused saves created a profile', 'pass', cnt = 0);

  -- ------------------------------------------------------------------ 5. successful add + owner read
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.reservation_id into res_id from public.reserve_league_lookup('add', 'KR', 'Hide on bush', 'KR1') s;
  reset role;
  set local role service_role;
  select public.save_league_lookup(res_id, 'OPGG_TEMPORARY', 'Hide on bush', 'KR1', 'KR', 'RANKED', 'PLATINUM', 'II', 64, 20, 18, 6, 'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1', '2026-09-19T15:19:21Z') into got;
  reset role;
  res := res || jsonb_build_object('step', 'a valid snapshot for the reserved player is saved (SAVED)', 'pass', got = 'SAVED', 'got', got);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.get_my_league_profile();
  select string_agg(k, ',' order by k) into keys from (select jsonb_object_keys(to_jsonb(p)) k from (select * from public.get_my_league_profile() limit 1) p) s;
  reset role;
  res := res || jsonb_build_object('step', 'the owner reads their profile: Riot ID, platform, rank, provenance, private, manual (never verified)',
    'pass', r.game_name = 'Hide on bush' and r.tag_line = 'KR1' and r.platform_id = 'KR' and r.solo_tier = 'PLATINUM' and r.solo_division = 'II' and r.solo_lp = 64
            and r.solo_wins = 20 and r.solo_losses = 18 and r.profile_icon_id = 6 and r.data_source = 'OPGG_TEMPORARY' and r.identity_source = 'MANUAL_RIOT_ID'
            and r.trust_status = 'MANUAL' and r.is_public = false and r.last_result = 'OK' and r.fetched_at is not null and r.source_updated_at is not null
            and r.refresh_available_at > now() + interval '9 minutes');
  res := res || jsonb_build_object('step', 'the owner RPC exposes no internal ids', 'pass', keys !~* 'entity_id|league_profile_id|user_id|reservation|attempt_id', 'columns', keys);

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_my_league_profile();
  reset role;
  res := res || jsonb_build_object('step', 'another owner sees no League profile (ownership isolation)', 'pass', cnt = 0);

  -- ------------------------------------------------------------------ 6. add/refresh state guards
  update private.league_lookup_attempts set created_at = created_at - interval '3 hours' where entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.status into got from public.reserve_league_lookup('add', 'NA1', 'Other', 'X') s;
  reset role;
  res := res || jsonb_build_object('step', 'adding a second League identity is refused (ALREADY_EXISTS)', 'pass', got = 'ALREADY_EXISTS', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.status into got from public.reserve_league_lookup('refresh', null, null, null) s;
  reset role;
  res := res || jsonb_build_object('step', 'refresh without a profile is refused (NO_PROFILE) — B cannot refresh A''s profile', 'pass', got = 'NO_PROFILE', 'got', got);

  -- ------------------------------------------------------------------ 7. refresh cooldown + stored identity
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.status, s.retry_after_seconds into r from public.reserve_league_lookup('refresh', null, null, null) s;
  reset role;
  res := res || jsonb_build_object('step', 'an early Refresh is refused (10 minute COOLDOWN) before any outbound request could happen', 'pass', r.status = 'COOLDOWN' and r.retry_after_seconds between 300 and 600, 'got', r.status || ':' || coalesce(r.retry_after_seconds::text, 'null'));

  update public.league_profiles set last_attempt_at = now() - interval '11 minutes' where entity_id = ent_a;
  update private.league_lookup_attempts set created_at = created_at - interval '3 hours' where entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.reservation_id, s.status, s.game_name, s.tag_line, s.platform_id into r from public.reserve_league_lookup('refresh', 'NA1', 'Attacker', 'HAX') s;
  reset role;
  res_id := r.reservation_id;
  res := res || jsonb_build_object('step', 'a refresh reserves the STORED identity and ignores any identity supplied by the caller', 'pass', r.status = 'OK' and r.game_name = 'Hide on bush' and r.tag_line = 'KR1' and r.platform_id = 'KR');

  -- a refresh that finds the player gone keeps the last good data
  set local role service_role;
  perform public.finish_league_lookup(res_id, 'NOT_FOUND');
  begin perform public.finish_league_lookup(res_id, 'BOGUS'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  perform public.finish_league_lookup(res_id, 'UNAVAILABLE');
  reset role;
  select p.solo_tier, p.solo_lp, p.last_result into r from public.league_profiles p where p.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'a failed refresh keeps the last good data and only records the failure (a second finish is a no-op)', 'pass', r.solo_tier = 'PLATINUM' and r.solo_lp = 64 and r.last_result = 'NOT_FOUND', 'got', r.last_result);
  res := res || jsonb_build_object('step', 'an invalid finish outcome is rejected (INVALID_OUTCOME)', 'pass', got = 'INVALID_OUTCOME', 'got', got);

  -- a refresh that returns a different player never overwrites the owner's identity
  update public.league_profiles set last_attempt_at = now() - interval '11 minutes' where entity_id = ent_a;
  update private.league_lookup_attempts set created_at = created_at - interval '3 hours' where entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.reservation_id into res_id from public.reserve_league_lookup('refresh', null, null, null) s;
  reset role;
  set local role service_role;
  select public.save_league_lookup(res_id, 'OPGG_TEMPORARY', 'Different Player', 'KR1', 'KR', 'RANKED', 'CHALLENGER', 'I', 999, 1, 1, 1, 'https://op.gg/p', null) into got;
  reset role;
  select p.game_name, p.solo_tier, p.last_result into r from public.league_profiles p where p.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'a refresh answering with a different player is refused and the owner''s data is untouched', 'pass', got = 'IDENTITY_MISMATCH' and r.game_name = 'Hide on bush' and r.solo_tier = 'PLATINUM' and r.last_result = 'IDENTITY_MISMATCH', 'got', got);

  -- a successful refresh replaces the data and accepts canonical capitalization
  update public.league_profiles set last_attempt_at = now() - interval '11 minutes' where entity_id = ent_a;
  update private.league_lookup_attempts set created_at = created_at - interval '3 hours' where entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.reservation_id into res_id from public.reserve_league_lookup('refresh', null, null, null) s;
  reset role;
  set local role service_role;
  select public.save_league_lookup(res_id, 'OPGG_TEMPORARY', 'HIDE ON BUSH', 'kr1', 'KR', 'RANKED', 'DIAMOND', 'IV', 5, 30, 25, 6, 'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1', null) into got;
  reset role;
  select p.game_name, p.solo_tier, p.solo_division, p.solo_lp, p.last_result into r from public.league_profiles p where p.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'a successful refresh replaces the stored values', 'pass', got = 'SAVED' and r.solo_tier = 'DIAMOND' and r.solo_division = 'IV' and r.solo_lp = 5 and r.last_result = 'OK' and r.game_name = 'HIDE ON BUSH');

  -- ------------------------------------------------------------------ 8. hourly cap
  insert into private.league_lookup_attempts (entity_id, action, requested_game_name, requested_tag_line, requested_platform_id, created_at, completed_at, outcome)
  select ent_b, 'add', 'x', 'y', 'KR', now() - (i * interval '5 minutes'), now(), 'NOT_FOUND' from generate_series(1, 6) i;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.status, s.retry_after_seconds into r from public.reserve_league_lookup('add', 'KR', 'Name', 'TAG') s;
  reset role;
  res := res || jsonb_build_object('step', 'six lookups in an hour hit the hourly cap (RATE_LIMITED) with a retry hint', 'pass', r.status = 'RATE_LIMITED' and r.retry_after_seconds > 0, 'got', r.status || ':' || coalesce(r.retry_after_seconds::text, 'null'));
  delete from private.league_lookup_attempts where entity_id = ent_b;

  -- ------------------------------------------------------------------ 9. trust model constraints
  begin update public.league_profiles set trust_status = 'VERIFIED' where entity_id = ent_a; got := 'NO_ERROR'; exception when check_violation then got := 'CHECK_VIOLATION'; end;
  res := res || jsonb_build_object('step', 'a temporary-source profile can never be marked VERIFIED at the database level', 'pass', got = 'CHECK_VIOLATION', 'got', got);
  begin update public.league_profiles set solo_rank_state = 'NOT_REPORTED' where entity_id = ent_a; got := 'NO_ERROR'; exception when check_violation then got := 'CHECK_VIOLATION'; end;
  res := res || jsonb_build_object('step', 'rank values cannot exist without a RANKED state', 'pass', got = 'CHECK_VIOLATION', 'got', got);
  begin update public.league_profiles set source_url = 'http://insecure.test/x' where entity_id = ent_a; got := 'NO_ERROR'; exception when check_violation then got := 'CHECK_VIOLATION'; end;
  res := res || jsonb_build_object('step', 'the source URL must be https', 'pass', got = 'CHECK_VIOLATION', 'got', got);

  -- ------------------------------------------------------------------ 10. private by default; not part of the public profile
  select p.is_public into got from public.league_profiles p where p.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'League data is private by default', 'pass', got = 'false', 'got', got);
  update public.entities set visibility = 'PUBLIC' where entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select string_agg(k, ',' order by k) into keys from (select jsonb_object_keys(to_jsonb(p)) k from (select * from public.get_public_identity('zprotoa') limit 1) p) s;
  select count(*) into cnt from public.get_public_identity('zprotoa') p where to_jsonb(p)::text ~* 'league|diamond|platinum|hide on bush|op\.gg|riot';
  select count(*) into n from public.get_public_identity('zprotoa');
  reset role;
  res := res || jsonb_build_object('step', 'a published GamID''s public response contains no League/rank/source data', 'pass', n = 1 and keys ~ 'gamid_handle' and keys !~* 'league|riot' and cnt = 0, 'columns', keys);
  update public.entities set visibility = 'PRIVATE' where entity_id = ent_a;

  -- ------------------------------------------------------------------ 11. remove
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  got := (select public.remove_my_league_profile())::text;
  reset role;
  res := res || jsonb_build_object('step', 'removing when nothing exists is a safe no-op (false)', 'pass', got = 'false', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  got := (select public.remove_my_league_profile())::text;
  select count(*) into cnt from public.get_my_league_profile();
  reset role;
  res := res || jsonb_build_object('step', 'the owner removes their League profile (true) and it is gone', 'pass', got = 'true' and cnt = 0, 'got', got);
  set local role authenticated;
  got := (select public.remove_my_league_profile())::text;
  reset role;
  res := res || jsonb_build_object('step', 'a repeated remove is idempotent (false)', 'pass', got = 'false', 'got', got);
  select count(*) into cnt from private.league_lookup_attempts a where a.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'the throttle ledger survives removal, so remove + add cannot sidestep the rate limit', 'pass', cnt > 0);
  select count(*) into cnt from public.entities e where e.gamid_handle = 'zprotoa';
  res := res || jsonb_build_object('step', 'removing League data preserves the GamID identity', 'pass', cnt = 1);

  -- ------------------------------------------------------------------ 12. existing Discord data is untouched
  select count(*) into cnt from public.gaming_connections;
  select count(*) into n from public.connection_discovery_results;
  res := res || jsonb_build_object('step', 'existing Discord connections and the Discord discovery result are unchanged', 'pass', cnt = conn_before and n = disc_before, 'connections', cnt, 'discovery', n);

  -- ------------------------------------------------------------------ 13. cascade
  insert into public.league_profiles (entity_id, game_name, tag_line, platform_id, data_source, solo_rank_state, source_url, fetched_at, last_attempt_at, last_result)
  values (ent_b, 'CascadeName', 'C1', 'SG2', 'OPGG_TEMPORARY', 'NOT_REPORTED', 'https://op.gg/p', now(), now(), 'OK');
  delete from public.entities e where e.entity_id in (ent_a, ent_b);
  select count(*) into cnt from public.league_profiles p where p.entity_id in (ent_a, ent_b);
  select count(*) into n from private.league_lookup_attempts a where a.entity_id in (ent_a, ent_b);
  res := res || jsonb_build_object('step', 'deleting an identity removes its League profile and throttle ledger', 'pass', cnt = 0 and n = 0);

  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
