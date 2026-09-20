-- Gaming Connections — live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/gaming-connections-db.sql
--
-- It creates disposable auth users / identities, impersonates anon / authenticated / service_role exactly as PostgREST
-- does, exercises every OAuth-attempt scenario, and then ALWAYS raises an exception carrying the results, so the whole
-- transaction rolls back and no data (including @black) is ever touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  ud uuid := gen_random_uuid();
  ent_a uuid;
  st text;
  st_b text;
  st_unknown text := encode(extensions.gen_random_bytes(32), 'hex');
  att uuid;
  attb uuid;
  got text;
  n integer;
  cnt integer;
  keys text;
  rec record;
  ok boolean;

  acct_a constant text := '111111111111111111';
  acct_b constant text := '222222222222222222';
  acct_x constant text := '333333333333333333';
  avatar constant text := 'https://cdn.discordapp.com/avatars/111111111111111111/abcdef.png?size=128';
begin
  -- ------------------------------------------------------------------ setup (as postgres)
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'zconn-a@example.invalid', now()), (ub, 'zconn-b@example.invalid', now()),
    (uc, 'zconn-c@example.invalid', null), (ud, 'zconn-d@example.invalid', now());

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from public.create_solo_identity('zconna', 'Conn A', date '1990-01-01', 'en');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from public.create_solo_identity('zconnb', 'Conn B', date '1990-01-01', 'en');
  reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zconna';

  -- ------------------------------------------------------------------ 1. start attempt (authenticated owner)
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st from public.start_connection_attempt('discord') s;
  reset role;
  res := res || jsonb_build_object('step', 'start returns a 64-hex-char state', 'pass', st ~ '^[0-9a-f]{64}$');
  select count(*) into cnt from private.connection_oauth_attempts a where a.state_hash = sha256(convert_to(st, 'UTF8')) and a.user_id = ua and a.entity_id = ent_a and a.expires_at > now() and a.expires_at <= now() + interval '10 minutes 5 seconds';
  res := res || jsonb_build_object('step', 'state is stored only as a hash, bound to the initiating user+identity, 10-minute expiry', 'pass', cnt = 1);
  select count(*) into cnt from private.connection_oauth_attempts a where encode(a.state_hash, 'hex') = st;
  res := res || jsonb_build_object('step', 'plaintext state is not what is stored', 'pass', cnt = 0);

  -- ------------------------------------------------------------------ 2. client roles cannot reach backend-only surfaces
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.consume_connection_attempt(st); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user cannot call consume (no EXECUTE grant; in-function guard is defense in depth)', 'pass', got like 'permission denied%' or got = 'BACKEND_ONLY', 'got', got);
  begin perform 1 from private.connection_oauth_attempts; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user cannot read the private attempts table', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from public.gaming_connections; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user has no direct table access to gaming_connections', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from public.complete_connection_attempt(gen_random_uuid(), '1', 'x', 'x', null); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user cannot call complete', 'pass', got like 'permission denied%' or got = 'BACKEND_ONLY', 'got', got);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.get_my_connections(); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot call get_my_connections', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from public.start_connection_attempt('discord'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot start a connection attempt', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from public.gaming_connections; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot read connection records', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from public.consume_connection_attempt(st); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot call consume', 'pass', got like 'permission denied%', 'got', got);
  reset role;

  -- ------------------------------------------------------------------ 3. callback state validation (service_role)
  set local role service_role;
  select c.status, c.attempt_id into rec from public.consume_connection_attempt(st) c;
  att := rec.attempt_id;
  res := res || jsonb_build_object('step', 'valid state is accepted exactly once (OK)', 'pass', rec.status = 'OK');
  select c.status into got from public.consume_connection_attempt(st) c;
  res := res || jsonb_build_object('step', 'replayed state is rejected (REPLAYED)', 'pass', got = 'REPLAYED', 'got', got);
  select c.status into got from public.consume_connection_attempt('not-a-real-state') c;
  res := res || jsonb_build_object('step', 'malformed state is rejected (INVALID_STATE)', 'pass', got = 'INVALID_STATE', 'got', got);
  select c.status into got from public.consume_connection_attempt(st_unknown) c;
  res := res || jsonb_build_object('step', 'well-formed but unknown state is rejected (INVALID_STATE)', 'pass', got = 'INVALID_STATE', 'got', got);
  select c.status into got from public.consume_connection_attempt(null) c;
  res := res || jsonb_build_object('step', 'null state is rejected (INVALID_STATE)', 'pass', got = 'INVALID_STATE', 'got', got);

  -- ------------------------------------------------------------------ 4. successful connection
  select public.complete_connection_attempt(att, acct_a, 'alice', 'Alice', avatar) into got;
  res := res || jsonb_build_object('step', 'first link succeeds (CONNECTED)', 'pass', got = 'CONNECTED', 'got', got);
  select public.complete_connection_attempt(att, acct_a, 'alice', 'Alice', avatar) into got;
  res := res || jsonb_build_object('step', 'completing the same attempt twice is rejected (REPLAYED)', 'pass', got = 'REPLAYED', 'got', got);
  reset role;

  select g.trust_status, g.is_public into rec from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'discord';
  res := res || jsonb_build_object('step', 'new connection is CONNECTED and private by default', 'pass', rec.trust_status = 'CONNECTED' and rec.is_public = false);

  -- ------------------------------------------------------------------ 5. ownership isolation
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.connected, c.provider_username into rec from public.get_my_connections() c where c.provider_key = 'discord';
  res := res || jsonb_build_object('step', 'owner sees their own connection', 'pass', rec.connected and rec.provider_username = 'alice');
  select string_agg(k, ',' order by k) into keys from (select jsonb_object_keys(to_jsonb(c)) k from (select * from public.get_my_connections() limit 1) c) s;
  res := res || jsonb_build_object('step', 'owner RPC never returns the provider account id or any token', 'pass', keys ~ 'provider_username' and keys !~ 'account_id|token|secret|refresh', 'columns', keys);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.connected into ok from public.get_my_connections() c where c.provider_key = 'discord';
  res := res || jsonb_build_object('step', 'another user does not see the first user''s connection', 'pass', ok = false);
  reset role;

  -- ------------------------------------------------------------------ 6. duplicate provider account protection
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st_b from public.start_connection_attempt('discord') s;
  reset role;
  set local role service_role;
  select c.attempt_id into attb from public.consume_connection_attempt(st_b) c;
  select public.complete_connection_attempt(attb, acct_a, 'mallory', 'Mallory', null) into got;
  res := res || jsonb_build_object('step', 'a Discord account already linked to another GamID fails safely (ACCOUNT_ALREADY_LINKED)', 'pass', got = 'ACCOUNT_ALREADY_LINKED', 'got', got);
  reset role;
  select count(*) into cnt from public.gaming_connections g where g.provider_account_id = acct_a;
  res := res || jsonb_build_object('step', 'that Discord account is still linked to exactly one GamID', 'pass', cnt = 1);

  -- ------------------------------------------------------------------ 7. second user links a different account
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st_b from public.start_connection_attempt('discord') s;
  reset role;
  set local role service_role;
  select c.attempt_id into attb from public.consume_connection_attempt(st_b) c;
  select public.complete_connection_attempt(attb, acct_b, 'bob', 'Bob', null) into got;
  reset role;
  res := res || jsonb_build_object('step', 'second GamID links its own different Discord account (CONNECTED)', 'pass', got = 'CONNECTED', 'got', got);

  -- ------------------------------------------------------------------ 8. reconnect / different-account behavior for the first user
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st from public.start_connection_attempt('discord') s;
  reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt(st) c;
  select public.complete_connection_attempt(att, acct_x, 'someone_else', null, null) into got;
  reset role;
  res := res || jsonb_build_object('step', 'same GamID trying a different Discord account is not silently overwritten (OWNER_HAS_OTHER_ACCOUNT)', 'pass', got = 'OWNER_HAS_OTHER_ACCOUNT', 'got', got);
  select g.provider_account_id, g.provider_username into rec from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'discord';
  res := res || jsonb_build_object('step', 'original connection is unchanged after the rejected attempt', 'pass', rec.provider_account_id = acct_a and rec.provider_username = 'alice');

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st from public.start_connection_attempt('discord') s;
  reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt(st) c;
  select public.complete_connection_attempt(att, acct_a, 'alice_renamed', 'Alice R', avatar) into got;
  reset role;
  select g.provider_username into got from public.gaming_connections g where g.entity_id = ent_a and g.provider_key = 'discord';
  res := res || jsonb_build_object('step', 'same GamID reconnecting the same Discord account refreshes its display fields (RECONNECTED)', 'pass', got = 'alice_renamed', 'got', got);
  select count(*) into cnt from public.gaming_connections g where g.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'reconnecting does not create a duplicate row', 'pass', cnt = 1);

  -- ------------------------------------------------------------------ 9. authorization cancelled
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st from public.start_connection_attempt('discord') s;
  reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt(st) c;
  perform public.finish_connection_attempt(att, 'DENIED');
  select public.complete_connection_attempt(att, acct_a, 'alice', null, null) into got;
  begin perform public.finish_connection_attempt(att, 'CONNECTED'); got := got || '|NO_ERROR'; exception when others then got := got || '|' || sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'a cancelled attempt cannot be completed afterward, and finish rejects a non-terminal outcome', 'pass', got = 'REPLAYED|INVALID_OUTCOME', 'got', got);
  select a.outcome into got from private.connection_oauth_attempts a where a.attempt_id = att;
  res := res || jsonb_build_object('step', 'cancellation outcome is recorded', 'pass', got = 'DENIED', 'got', got);

  -- ------------------------------------------------------------------ 10. expiry
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st from public.start_connection_attempt('discord') s;
  reset role;
  update private.connection_oauth_attempts a set expires_at = now() - interval '1 minute' where a.state_hash = sha256(convert_to(st, 'UTF8'));
  set local role service_role;
  select c.status into got from public.consume_connection_attempt(st) c;
  res := res || jsonb_build_object('step', 'expired state is rejected (EXPIRED)', 'pass', got = 'EXPIRED', 'got', got);
  select c.status into got from public.consume_connection_attempt(st) c;
  reset role;
  res := res || jsonb_build_object('step', 'expired state stays unusable afterward (REPLAYED)', 'pass', got = 'REPLAYED', 'got', got);

  -- ------------------------------------------------------------------ 11. start-attempt guards
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.start_connection_attempt('discord'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'unverified email cannot start (EMAIL_NOT_VERIFIED)', 'pass', got = 'EMAIL_NOT_VERIFIED', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.start_connection_attempt('discord'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'user without a GamID identity cannot start (IDENTITY_NOT_FOUND)', 'pass', got = 'IDENTITY_NOT_FOUND', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.start_connection_attempt('battlenet'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'a provider that is not in the catalog is rejected (INVALID_PROVIDER)', 'pass', got = 'INVALID_PROVIDER', 'got', got);

  n := 0;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1..15 loop
    begin perform 1 from public.start_connection_attempt('discord'); n := n + 1; exception when others then got := sqlerrm; exit; end;
  end loop;
  reset role;
  res := res || jsonb_build_object('step', 'attempt creation is throttled (TOO_MANY_ATTEMPTS)', 'pass', got = 'TOO_MANY_ATTEMPTS', 'got', got, 'extra_attempts_allowed', n);

  -- ------------------------------------------------------------------ 12. disconnect
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select public.disconnect_my_connection('discord') into ok;
  res := res || jsonb_build_object('step', 'disconnect removes the connection (true)', 'pass', ok = true);
  select public.disconnect_my_connection('discord') into ok;
  res := res || jsonb_build_object('step', 'repeated disconnect is safe and idempotent (false)', 'pass', ok = false);
  begin perform public.disconnect_my_connection('battlenet'); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'disconnecting an unknown provider is rejected', 'pass', got = 'INVALID_PROVIDER', 'got', got);
  select c.connected into ok from public.get_my_connections() c where c.provider_key = 'discord';
  reset role;
  res := res || jsonb_build_object('step', 'disconnected user now shows NOT connected', 'pass', ok = false);
  select count(*) into cnt from public.gaming_connections g where g.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'the other user''s connection is untouched by that disconnect', 'pass', cnt = 1);
  select count(*) into cnt from public.entities e where e.gamid_handle = 'zconnb';
  res := res || jsonb_build_object('step', 'disconnect preserves the GamID identity itself', 'pass', cnt = 1);

  -- the freed Discord account can now be linked elsewhere (explicit, not silent)
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st_b from public.start_connection_attempt('discord') s;
  reset role;
  set local role service_role;
  select c.attempt_id into attb from public.consume_connection_attempt(st_b) c;
  select public.complete_connection_attempt(attb, acct_b, 'bob', 'Bob', null) into got;
  reset role;
  res := res || jsonb_build_object('step', 'a disconnected Discord account is free to be linked again', 'pass', got = 'CONNECTED', 'got', got);

  -- ------------------------------------------------------------------ 13. CONNECTED is not PUBLIC
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into cnt from public.get_public_identity('zconna');
  reset role;
  res := res || jsonb_build_object('step', 'unpublished identity is not reachable anonymously despite a connection', 'pass', cnt = 0);
  update public.entities set visibility = 'PUBLIC' where entity_id = ent_a;
  set local role anon;
  select string_agg(k, ',' order by k) into keys from (select jsonb_object_keys(to_jsonb(p)) k from (select * from public.get_public_identity('zconna') limit 1) p) s;
  select count(*) into cnt from public.get_public_identity('zconna');
  select (select count(*) from public.get_public_identity('zconna') p where to_jsonb(p)::text ~* 'discord|alice|provider|connection') into n;
  reset role;
  res := res || jsonb_build_object('step', 'published identity is reachable, and its public response contains no connection/Discord data', 'pass', cnt = 1 and keys ~ 'gamid_handle' and keys !~* 'discord|connection|provider' and n = 0, 'columns', keys);

  -- ------------------------------------------------------------------ 14. cascade
  delete from public.entities e where e.entity_id = ent_a;
  select count(*) into cnt from public.gaming_connections g where g.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'deleting an identity removes its connections', 'pass', cnt = 0);

  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
