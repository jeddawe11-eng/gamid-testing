-- Steam Connection Foundation — live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/steam-connection-db.sql
-- (Requires migration 20260920190000 to be applied. To validate the migration BEFORE applying it, run the migration's content and
--  this file's content wrapped together in one always-failing statement: everything rolls back either way.)
--
-- Creates disposable auth users / identities, impersonates anon / authenticated / service_role exactly as PostgREST does, and
-- ALWAYS raises an exception carrying the results, so the whole transaction rolls back and nothing (including @black, the real
-- Discord connection, the League profile and any visibility flag of a real identity) is ever touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  ud uuid := gen_random_uuid();
  ent_a uuid; ent_b uuid; ent_d uuid;
  n2 integer;
  qr_a text;
  st text; st2 text; st3 text; dst text;
  att uuid; att2 uuid; att3 uuid; datt uuid;
  got text; got2 text; cnt integer; n integer; keys text;
  rec record; snap_before jsonb; snap_after jsonb;
  js jsonb; jq jsonb; js2 jsonb;
  ledger_before integer; ledger_after integer;
  conn_before timestamptz; upd_before timestamptz;
  steam_a constant text := '76561198000000001';
  steam_b constant text := '76561198000000002';
  steam_c constant text := '76561198000000003';
  discord_a constant text := '555555555555555551';
  leak_pattern constant text := 'attempt|state_hash|connection_id|entity_id|auth_method|STEAM_OPENID|is_public|provider_account|provider_username|discord|555555555555555551|openid|token|secret|library|owned|appid|playtime';
begin
  -- ------------------------------------------------------------------ setup (as postgres)
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'zsteam-a@example.invalid', now()), (ub, 'zsteam-b@example.invalid', now()), (uc, 'zsteam-c@example.invalid', null), (ud, 'zsteam-d@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zsteama', 'Zed Steam A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zsteamb', 'Zed Steam B', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zsteamd', 'Zed Steam D', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_d from public.entities e where e.gamid_handle = 'zsteamd';
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zsteama';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zsteamb';
  select q.public_token into qr_a from public.qr_references q where q.entity_id = ent_a;
  update public.profiles set bio = 'Bio for A' where entity_id = ent_a;

  -- ------------------------------------------------------------------ 1. registry
  select count(*) into cnt from public.connection_provider_catalog c where c.provider_key = 'steam' and c.label = 'Steam' and c.active;
  select count(*) into n from public.public_section_catalog c where c.section_key = 'steam' and c.section_kind = 'CONNECTION' and c.active;
  res := res || jsonb_build_object('step', 'Steam is registered as an active connection provider and an active CONNECTION section', 'pass', cnt = 1 and n = 1);

  -- ------------------------------------------------------------------ 2. start attempt (authenticated owner only)
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  res := res || jsonb_build_object('step', 'start returns a 64-hex-char state for provider steam', 'pass', st ~ '^[0-9a-f]{64}$');
  select count(*) into cnt from private.connection_oauth_attempts a
    where a.state_hash = sha256(convert_to(st, 'UTF8')) and a.user_id = ua and a.entity_id = ent_a and a.provider_key = 'steam'
      and a.expires_at > now() and a.expires_at <= now() + interval '10 minutes 5 seconds' and a.consumed_at is null;
  res := res || jsonb_build_object('step', 'the Steam state is stored hash-only, bound to the initiating user + identity + provider, 10-minute expiry, unconsumed', 'pass', cnt = 1);
  select count(*) into cnt from private.connection_oauth_attempts a where encode(a.state_hash, 'hex') = st;
  res := res || jsonb_build_object('step', 'the plaintext state is not what is stored', 'pass', cnt = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.start_connection_attempt('steam'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'a user with an unverified email cannot start a Steam connection', 'pass', got = 'EMAIL_NOT_VERIFIED', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.start_connection_attempt('steam'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'anon cannot start a Steam connection', 'pass', got like 'permission denied%', 'got', got);

  -- ------------------------------------------------------------------ 3. client roles cannot reach the backend-only surfaces
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.consume_connection_attempt_for(st, 'steam'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  begin perform 1 from public.complete_steam_connection_attempt(gen_random_uuid(), steam_a); got2 := 'NO_ERROR'; exception when others then got2 := sqlerrm; end;
  res := res || jsonb_build_object('step', 'an authenticated user cannot consume or complete a Steam attempt (no EXECUTE; in-function guard is defense in depth)',
    'pass', (got like 'permission denied%' or got = 'BACKEND_ONLY') and (got2 like 'permission denied%' or got2 = 'BACKEND_ONLY'), 'got', got || ' / ' || got2);
  begin perform 1 from private.connection_oauth_attempts; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  begin perform 1 from public.gaming_connections; got2 := 'NO_ERROR'; exception when others then got2 := sqlerrm; end;
  res := res || jsonb_build_object('step', 'an authenticated user has no direct access to the attempts ledger or the connections table', 'pass', got like 'permission denied%' and got2 like 'permission denied%');
  begin insert into public.gaming_connections (entity_id, provider_key, provider_account_id, trust_status, auth_method) values (ent_b, 'steam', steam_b, 'CONNECTED', 'STEAM_OPENID_2_0'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'an authenticated user cannot insert a Steam connection directly (the browser can never assert a SteamID)', 'pass', got like 'permission denied%', 'got', got);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.consume_connection_attempt_for(st, 'steam'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  begin perform 1 from public.complete_steam_connection_attempt(gen_random_uuid(), steam_a); got2 := 'NO_ERROR'; exception when others then got2 := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot consume or complete a Steam attempt', 'pass', got like 'permission denied%' and got2 like 'permission denied%', 'got', got || ' / ' || got2);
  reset role;

  -- ------------------------------------------------------------------ 4. provider isolation of the shared ledger
  set local role service_role;
  select c.status into got from public.consume_connection_attempt(st) c;                   -- Discord's consume, Steam's state
  reset role;
  select count(*) into cnt from private.connection_oauth_attempts a where a.state_hash = sha256(convert_to(st, 'UTF8')) and a.consumed_at is null;
  res := res || jsonb_build_object('step', 'a STEAM state presented to the Discord consume is INVALID_STATE and stays unconsumed', 'pass', got = 'INVALID_STATE' and cnt = 1, 'got', got);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into dst from public.start_connection_attempt('discord') s; reset role;
  set local role service_role;
  select c.status into got from public.consume_connection_attempt_for(dst, 'steam') c;     -- Steam's consume, Discord's state
  reset role;
  select count(*) into cnt from private.connection_oauth_attempts a where a.state_hash = sha256(convert_to(dst, 'UTF8')) and a.consumed_at is null;
  res := res || jsonb_build_object('step', 'a DISCORD state presented to the Steam consume is INVALID_STATE and stays unconsumed', 'pass', got = 'INVALID_STATE' and cnt = 1, 'got', got);
  set local role service_role;
  select c.attempt_id, c.status into datt, got from public.consume_connection_attempt(dst) c;
  reset role;
  res := res || jsonb_build_object('step', 'the Discord attempt is still consumable by Discord (existing Discord behavior unchanged)', 'pass', got = 'OK' and datt is not null, 'got', got);

  -- ------------------------------------------------------------------ 5. one-time consumption
  set local role service_role;
  select c.attempt_id, c.status into att, got from public.consume_connection_attempt_for(st, 'steam') c;
  reset role;
  select count(*) into cnt from private.connection_oauth_attempts a
    where a.attempt_id = att and a.user_id = ua and a.entity_id = ent_a and a.provider_key = 'steam' and a.consumed_at is not null;
  res := res || jsonb_build_object('step', 'the first Steam consume returns OK with the attempt id, bound to the owner that started it', 'pass', got = 'OK' and att is not null and cnt = 1, 'got', got);
  set local role service_role;
  select c.status into got from public.consume_connection_attempt_for(st, 'steam') c;
  reset role;
  res := res || jsonb_build_object('step', 'a replayed Steam state is REPLAYED', 'pass', got = 'REPLAYED', 'got', got);
  set local role service_role;
  select c.status into got from public.consume_connection_attempt_for(encode(extensions.gen_random_bytes(32), 'hex'), 'steam') c;
  select c.status into got2 from public.consume_connection_attempt_for('not-a-state', 'steam') c;
  select c.status into keys from public.consume_connection_attempt_for(null, 'steam') c;
  reset role;
  res := res || jsonb_build_object('step', 'unknown, malformed and NULL states are INVALID_STATE', 'pass', got = 'INVALID_STATE' and got2 = 'INVALID_STATE' and keys = 'INVALID_STATE');
  set local role service_role;
  select c.status into got from public.consume_connection_attempt_for(encode(extensions.gen_random_bytes(32), 'hex'), null) c;
  reset role;
  res := res || jsonb_build_object('step', 'a NULL expected provider matches nothing', 'pass', got = 'INVALID_STATE', 'got', got);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st2 from public.start_connection_attempt('steam') s; reset role;
  update private.connection_oauth_attempts a set expires_at = now() - interval '1 minute' where a.state_hash = sha256(convert_to(st2, 'UTF8'));
  set local role service_role; select c.status into got from public.consume_connection_attempt_for(st2, 'steam') c; reset role;
  select a.outcome into got2 from private.connection_oauth_attempts a where a.state_hash = sha256(convert_to(st2, 'UTF8'));
  res := res || jsonb_build_object('step', 'an expired Steam state is EXPIRED, consumed, and recorded as EXPIRED', 'pass', got = 'EXPIRED' and got2 = 'EXPIRED', 'got', got || '/' || coalesce(got2, 'null'));

  -- ------------------------------------------------------------------ 6. completion: invalid input and wrong provider link nothing
  set local role service_role;
  select public.complete_steam_connection_attempt(datt, steam_a) into got;                 -- a Discord attempt through the Steam completion
  reset role;
  res := res || jsonb_build_object('step', 'a Discord attempt cannot be completed through the Steam completion', 'pass', got = 'INVALID_STATE', 'got', got);
  -- ... and the reverse: a consumed STEAM attempt cannot be completed through Discord's completion (which would store a Discord id as Steam)
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st3 from public.start_connection_attempt('steam') s; reset role;
  set local role service_role;
  select c.attempt_id into att3 from public.consume_connection_attempt_for(st3, 'steam') c;
  select public.complete_connection_attempt(att3, discord_a, 'x', 'x', null) into got;
  reset role;
  res := res || jsonb_build_object('step', 'a Steam attempt cannot be completed through the Discord completion (INVALID_STATE) and stores nothing', 'pass',
    got = 'INVALID_STATE' and not exists (select 1 from public.gaming_connections g where g.entity_id = ent_d), 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st3 from public.start_connection_attempt('steam') s; reset role;
  select a.attempt_id into att3 from private.connection_oauth_attempts a where a.state_hash = sha256(convert_to(st3, 'UTF8'));
  set local role service_role; select public.complete_steam_connection_attempt(att3, steam_a) into got; reset role;
  res := res || jsonb_build_object('step', 'an attempt that was never consumed cannot be completed', 'pass', got = 'INVALID_STATE', 'got', got);
  set local role service_role;
  select c.attempt_id into att3 from public.consume_connection_attempt_for(st3, 'steam') c;
  select public.complete_steam_connection_attempt(att3, '7656119800000000') into got;      -- 16 digits
  reset role;
  res := res || jsonb_build_object('step', 'a SteamID64 with the wrong shape is refused (PROVIDER_ERROR) and links nothing', 'pass', got = 'PROVIDER_ERROR' and not exists (select 1 from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam'), 'got', got);
  for rec in select v.bad from (values ('12345678901234567'), ('76561202255233024'), ('7656119800000000a'), ('76561197960265728'), (''), ('76561198000000001 ')) as v(bad) loop
    -- (a separate verified user: the per-user attempt rate limit is shared by every provider)
    perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
    set local role authenticated; select s.state into st3 from public.start_connection_attempt('steam') s; reset role;
    set local role service_role;
    select c.attempt_id into att3 from public.consume_connection_attempt_for(st3, 'steam') c;
    select public.complete_steam_connection_attempt(att3, rec.bad) into got;
    reset role;
    res := res || jsonb_build_object('step', 'out-of-range / malformed SteamID64 "' || rec.bad || '" is refused', 'pass', got = 'PROVIDER_ERROR', 'got', got);
  end loop;
  select count(*) into cnt from public.gaming_connections g where g.entity_id in (ent_a, ent_d) and g.provider_key = 'steam';
  res := res || jsonb_build_object('step', 'none of the refused completions created a Steam connection', 'pass', cnt = 0);

  -- ------------------------------------------------------------------ 7. CONNECT (owner A) — private by default, minimum data, provenance
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c;
  select public.complete_steam_connection_attempt(att, steam_a) into got;
  reset role;
  res := res || jsonb_build_object('step', 'completing a consumed Steam attempt with the authenticated SteamID64 CONNECTS it', 'pass', got = 'CONNECTED', 'got', got);
  select * into rec from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam';
  res := res || jsonb_build_object('step', 'the stored row: owner entity, SteamID64, CONNECTED (never VERIFIED), Steam OpenID provenance, PRIVATE by default, no display name / avatar', 'pass',
    rec.provider_account_id = steam_a and rec.trust_status = 'CONNECTED' and rec.auth_method = 'STEAM_OPENID_2_0' and rec.is_public = false
    and rec.provider_display_name is null and rec.provider_avatar_url is null and rec.connected_at is not null);
  select a.outcome into got from private.connection_oauth_attempts a where a.attempt_id = att;
  res := res || jsonb_build_object('step', 'the attempt is recorded as CONNECTED', 'pass', got = 'CONNECTED');
  set local role service_role; select public.complete_steam_connection_attempt(att, steam_a) into got; reset role;
  res := res || jsonb_build_object('step', 'completing the same attempt twice is REPLAYED', 'pass', got = 'REPLAYED', 'got', got);

  -- ------------------------------------------------------------------ 8. table-level integrity (defense in depth beneath every code path)
  begin insert into public.gaming_connections (entity_id, provider_key, provider_account_id, trust_status, auth_method) values (ent_b, 'steam', discord_a, 'CONNECTED', 'STEAM_OPENID_2_0'); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'the table refuses a steam row whose account id is not a SteamID64 (e.g. a Discord id)', 'pass', got = 'CHECK', 'got', got);
  begin insert into public.gaming_connections (entity_id, provider_key, provider_account_id, trust_status, auth_method) values (ent_b, 'steam', steam_b, 'VERIFIED', 'STEAM_OPENID_2_0'); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'the table refuses a steam row marked VERIFIED (a Steam connection is never a verified game profile)', 'pass', got = 'CHECK', 'got', got);
  begin insert into public.gaming_connections (entity_id, provider_key, provider_account_id, trust_status) values (ent_b, 'steam', steam_b, 'CONNECTED'); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'the table refuses a steam row without Steam OpenID provenance', 'pass', got = 'CHECK', 'got', got);
  begin insert into public.gaming_connections (entity_id, provider_key, provider_account_id, trust_status, auth_method) values (ent_b, 'steam', steam_b, 'MANUAL', 'STEAM_OPENID_2_0'); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'the table refuses a MANUAL steam row', 'pass', got = 'CHECK', 'got', got);

  -- ------------------------------------------------------------------ 9. uniqueness: one SteamID64 -> one GamID; one GamID -> one Steam account
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c;
  select public.complete_steam_connection_attempt(att, steam_a) into got;
  reset role;
  select count(*) into cnt from public.gaming_connections g where g.provider_key = 'steam' and g.provider_account_id = steam_a and g.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'the same SteamID64 cannot be linked to a second GamID (ACCOUNT_ALREADY_LINKED) and the first owner is unchanged', 'pass',
    got = 'ACCOUNT_ALREADY_LINKED' and cnt = 1 and not exists (select 1 from public.gaming_connections g where g.entity_id = ent_b and g.provider_key = 'steam'), 'got', got);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c;
  select public.complete_steam_connection_attempt(att, steam_b) into got;
  reset role;
  select g.provider_account_id into got2 from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam';
  res := res || jsonb_build_object('step', 'a different SteamID64 never silently replaces an existing connection (OWNER_HAS_OTHER_ACCOUNT)', 'pass', got = 'OWNER_HAS_OTHER_ACCOUNT' and got2 = steam_a, 'got', got);

  -- ------------------------------------------------------------------ 10. owner-only read / manage
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.connected, c.provider_username, c.trust_status, c.is_public into rec from public.get_my_connections() c where c.provider_key = 'steam';
  select string_agg(k, ',' order by k) into keys from (select jsonb_object_keys(to_jsonb(c)) k from (select * from public.get_my_connections() limit 1) c) s;
  reset role;
  res := res || jsonb_build_object('step', 'the owner sees their Steam connection (CONNECTED, SteamID64, private)', 'pass', rec.connected and rec.provider_username = steam_a and rec.trust_status = 'CONNECTED' and rec.is_public = false);
  res := res || jsonb_build_object('step', 'get_my_connections keeps exactly its existing columns (no ledger/state/internal id)', 'pass', keys = 'connected,connected_at,is_public,label,provider_avatar_url,provider_display_name,provider_key,provider_username,trust_status', 'got', keys);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.connected, c.provider_username into rec from public.get_my_connections() c where c.provider_key = 'steam';
  reset role;
  res := res || jsonb_build_object('step', 'another authenticated user sees Steam as NOT connected (cannot inspect A''s connection)', 'pass', rec.connected = false and rec.provider_username is null);
  set local role authenticated; select public.disconnect_my_connection('steam') into got; reset role;
  select count(*) into cnt from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam';
  res := res || jsonb_build_object('step', 'another user disconnecting Steam affects only their own (nothing) - A stays connected', 'pass', got = 'false' and cnt = 1, 'got', got);

  -- ------------------------------------------------------------------ 11. visibility: OFF by default, gated by the section switch AND the whole-GamID publish
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select v.is_set_up, v.is_public into rec from public.get_my_section_visibility() v where v.section_key = 'steam';
  reset role;
  res := res || jsonb_build_object('step', 'Steam is set up for A and its "Show on my GamID" is OFF by default', 'pass', rec.is_set_up and rec.is_public = false);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.set_my_section_visibility('steam', true); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'a user without a Steam connection cannot switch Steam on (SECTION_NOT_SET_UP)', 'pass', got = 'SECTION_NOT_SET_UP', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.set_my_section_visibility('steam', true); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  begin perform 1 from public.get_my_section_visibility(); got2 := 'NO_ERROR'; exception when others then got2 := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'anon cannot read or change section visibility', 'pass', got like 'permission denied%' and got2 like 'permission denied%');

  -- published, Steam OFF: nothing of Steam anywhere
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select to_jsonb(p) into js from public.get_public_identity('zsteama') p;
  select to_jsonb(p) into jq from public.get_public_identity_by_qr(qr_a) p;
  reset role;
  res := res || jsonb_build_object('step', 'published + Steam OFF (a connected Steam never becomes public automatically): public_sections is empty and the SteamID64 appears nowhere (handle and QR)', 'pass',
    js->'public_sections' = '{}'::jsonb and jq = js and js::text !~ steam_a and js->>'display_name' = 'Zed Steam A');

  -- unpublished, Steam ON: still nothing
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(false); select count(*) into cnt from public.set_my_section_visibility('steam', true) x where x.is_public; reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from public.get_public_identity('zsteama');
  select count(*) into n2 from public.get_public_identity_by_qr(qr_a);
  reset role;
  res := res || jsonb_build_object('step', 'UNPUBLISHED + Steam ON: nothing is publicly accessible (handle and QR return no row) - the whole-GamID gate stays on top', 'pass', cnt = 1 and n = 0 and n2 = 0);

  -- published, Steam ON: exactly the allowlisted fields
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select to_jsonb(p) into js from public.get_public_identity('zsteama') p;
  select to_jsonb(p) into jq from public.get_public_identity_by_qr(qr_a) p;
  reset role;
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js->'public_sections') k;
  res := res || jsonb_build_object('step', 'published + Steam ON: exactly the steam section appears (and QR returns the same)', 'pass', keys = 'steam' and jq = js, 'got', keys);
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js->'public_sections'->'steam') k;
  res := res || jsonb_build_object('step', 'Steam public fields are exactly steam_id and trust_status (CONNECTED)', 'pass',
    keys = 'steam_id,trust_status' and js->'public_sections'->'steam'->>'steam_id' = steam_a and js->'public_sections'->'steam'->>'trust_status' = 'CONNECTED', 'got', keys);
  res := res || jsonb_build_object('step', 'nothing internal leaks through the public sections (ledger, state, ids, provenance, flag names, tokens, other providers, game/library terms)', 'pass',
    (js->'public_sections')::text !~* leak_pattern, 'got', (js->'public_sections')::text);
  select string_agg(k, ',' order by k collate "C") into keys from jsonb_object_keys(js) k;
  res := res || jsonb_build_object('step', 'the anonymous response still has exactly its 14 known columns (Steam adds nothing outside public_sections)', 'pass',
    keys = 'avatar_media_reference,bio,display_name,education_work_catalog,education_work_status,field_of_study,gamid_handle,institution,intro_derivative_path,intro_transition_key,primary_role_key,public_sections,role_catalog,role_keys', 'got', keys);

  -- toggling never disconnects / re-authenticates / writes the ledger or the row's identity columns
  select count(*) into ledger_before from private.connection_oauth_attempts a where a.user_id = ua;
  select g.connected_at, g.updated_at into conn_before, upd_before from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from public.set_my_section_visibility('steam', false);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  reset role; set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsteama') p; reset role;
  res := res || jsonb_build_object('step', 'Steam ON -> OFF hides it immediately from the anonymous response', 'pass', js2->'public_sections' = '{}'::jsonb and js2::text !~ steam_a);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_section_visibility('steam', true); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsteama') p; reset role;
  select count(*) into ledger_after from private.connection_oauth_attempts a where a.user_id = ua;
  select count(*) into cnt from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam' and g.connected_at = conn_before and g.updated_at = upd_before and g.provider_account_id = steam_a;
  res := res || jsonb_build_object('step', 'Steam OFF -> ON shows it again; toggling never disconnected, re-authenticated, touched timestamps, or wrote the attempt ledger', 'pass',
    js2->'public_sections'->'steam'->>'steam_id' = steam_a and cnt = 1 and ledger_before = ledger_after);

  -- independence from the other sections
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_section_visibility('steam', false); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into dst from public.start_connection_attempt('discord') s; reset role;
  set local role service_role;
  select c.attempt_id into datt from public.consume_connection_attempt(dst) c;
  select public.complete_connection_attempt(datt, discord_a, 'alice_steam', 'Alice Steam', 'https://cdn.discordapp.com/avatars/555555555555555551/abcdef.png?size=128') into got;
  reset role;
  res := res || jsonb_build_object('step', 'Discord still connects normally alongside Steam (CONNECTED), private by default', 'pass', got = 'CONNECTED' and exists (select 1 from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'discord' and not g.is_public));
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_section_visibility('discord', true); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsteama') p; reset role;
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js2->'public_sections') k;
  res := res || jsonb_build_object('step', 'Discord ON + Steam OFF: only Discord is public (Steam is independent of Discord)', 'pass', keys = 'discord' and js2::text !~ steam_a, 'got', keys);
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js2->'public_sections'->'discord') k;
  res := res || jsonb_build_object('step', 'Discord public fields are unchanged (display_name, trust_status, username)', 'pass', keys = 'display_name,trust_status,username', 'got', keys);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_section_visibility('steam', true); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsteama') p; reset role;
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js2->'public_sections') k;
  res := res || jsonb_build_object('step', 'Discord ON + Steam ON: both present, each with only its own allowlisted fields, and neither leaks the other''s id', 'pass',
    keys = 'discord,steam' and (js2->'public_sections'->'discord')::text !~ steam_a and (js2->'public_sections'->'steam')::text !~ (discord_a || '|alice'), 'got', keys);

  -- ------------------------------------------------------------------ 12. re-authentication of the same account preserves an explicit switch
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c;
  select public.complete_steam_connection_attempt(att, steam_a) into got;
  reset role;
  res := res || jsonb_build_object('step', 'signing in with the SAME Steam account again is RECONNECTED, still one row, and does not flip an explicit ON', 'pass',
    got = 'RECONNECTED' and (select count(*) from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam') = 1
    and (select g.is_public from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam'), 'got', got);

  -- ------------------------------------------------------------------ 13. DISCONNECT isolation
  select to_jsonb(g) - 'updated_at' into snap_before from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'discord';
  select to_jsonb(e) into js from public.entities e where e.entity_id = ent_a;
  select count(*) into cnt from public.profiles p where p.entity_id = ent_a and p.bio = 'Bio for A';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select public.disconnect_my_connection('steam') into got; reset role;
  select to_jsonb(g) - 'updated_at' into snap_after from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'discord';
  res := res || jsonb_build_object('step', 'disconnecting Steam removes only the Steam association', 'pass', got = 'true' and not exists (select 1 from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam'), 'got', got);
  res := res || jsonb_build_object('step', 'disconnecting Steam leaves Discord byte-identical, the GamID row, the profile and the publish state untouched', 'pass',
    snap_before = snap_after and (select to_jsonb(e) = js from public.entities e where e.entity_id = ent_a)
    and (select count(*) from public.profiles p where p.entity_id = ent_a and p.bio = 'Bio for A') = cnt and cnt = 1);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsteama') p; reset role;
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js2->'public_sections') k;
  res := res || jsonb_build_object('step', 'after disconnect Steam is gone from the public response at once (Discord unaffected)', 'pass', keys = 'discord' and js2::text !~ steam_a, 'got', keys);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select v.is_set_up, v.is_public into rec from public.get_my_section_visibility() v where v.section_key = 'steam';
  begin perform 1 from public.set_my_section_visibility('steam', true); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'after disconnect Steam is no longer set up, cannot be switched on, and reports OFF', 'pass', rec.is_set_up = false and rec.is_public = false and got = 'SECTION_NOT_SET_UP');

  -- ------------------------------------------------------------------ 14. RECONNECT goes through a NEW attempt and starts OFF again
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c;
  select public.complete_steam_connection_attempt(att, steam_a) into got;
  reset role;
  res := res || jsonb_build_object('step', 'a later Steam reconnect is a fresh CONNECTED through a NEW single-use attempt (the old ON was deleted with the row) and defaults back to OFF', 'pass',
    got = 'CONNECTED' and (select not g.is_public from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'steam'), 'got', got);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsteama') p; reset role;
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js2->'public_sections') k;
  res := res || jsonb_build_object('step', 'after reconnect Steam is not public until the owner switches it on again', 'pass', keys = 'discord' and js2::text !~ steam_a, 'got', keys);

  -- ------------------------------------------------------------------ 15. the Steam account can move to another GamID only via an explicit disconnect first
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform public.disconnect_my_connection('steam'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('steam') s; reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt_for(st, 'steam') c;
  select public.complete_steam_connection_attempt(att, steam_a) into got;
  reset role;
  res := res || jsonb_build_object('step', 'a SteamID64 freed by an explicit disconnect can then be connected by its next authenticated owner', 'pass', got = 'CONNECTED' and (select g.entity_id = ent_b and not g.is_public from public.gaming_connections g where g.provider_account_id = steam_a and g.provider_key = 'steam'), 'got', got);

  -- ------------------------------------------------------------------ 16. anonymous boundary
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  n := 0;
  for rec in select v.t from (values ('public.gaming_connections'), ('public.connection_provider_catalog'), ('public.public_section_catalog'), ('private.connection_oauth_attempts')) as v(t) loop
    begin execute 'select 1 from ' || rec.t || ' limit 1'; exception when insufficient_privilege then n := n + 1; end;
  end loop;
  reset role;
  res := res || jsonb_build_object('step', 'anon has no direct read access to connections, either catalog, or the attempts ledger', 'pass', n = 4, 'denied', n);

  -- ------------------------------------------------------------------ 17. the connect ledger never stores or returns a secret; Discord flow still complete
  select count(*) into cnt from private.connection_oauth_attempts a where a.user_id in (ua, ub) and a.provider_key = 'steam' and a.state_hash is not null;
  res := res || jsonb_build_object('step', 'every Steam attempt in the ledger is hash-only and provider-tagged', 'pass', cnt > 0 and not exists (select 1 from private.connection_oauth_attempts a where a.user_id in (ua, ub) and a.provider_key = 'steam' and (octet_length(a.state_hash) <> 32)));

  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
