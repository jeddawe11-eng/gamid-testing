-- Connection discovery (Riot validation) — live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/connection-discovery-db.sql
-- (Requires migration 20260919170000 to be applied. To validate the migration BEFORE applying it, run this file's content
--  appended to the migration file's content as one script: everything rolls back either way.)
--
-- Creates disposable auth users / identities, impersonates anon / authenticated / service_role exactly as PostgREST does,
-- and ALWAYS raises an exception carrying the results, so the whole transaction rolls back and nothing (including @black)
-- is ever touched or persisted. Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array;
-- every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  ent_a uuid;
  ent_b uuid;
  st text;
  att uuid;
  att_b uuid;
  att_pending uuid;
  got text;
  cnt integer;
  n integer;
  keys text;
  rec record;
  conn_a uuid;

  acct_a constant text := '111111111111111111';
  acct_b constant text := '222222222222222222';
  fp constant text := repeat('ab', 32);
begin
  -- ------------------------------------------------------------------ setup (as postgres)
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'zdisc-a@example.invalid', now()), (ub, 'zdisc-b@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from public.create_solo_identity('zdisca', 'Disc A', date '1990-01-01', 'en');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from public.create_solo_identity('zdiscb', 'Disc B', date '1990-01-01', 'en');
  reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zdisca';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zdiscb';

  -- A links Discord (acct_a) via the real attempt lifecycle
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st from public.start_connection_attempt('discord') s;
  reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt(st) c;
  select public.complete_connection_attempt(att, acct_a, 'alice', 'Alice', null) into got;
  reset role;
  res := res || jsonb_build_object('step', 'setup: owner A linked Discord (CONNECTED)', 'pass', got = 'CONNECTED', 'got', got);
  select g.connection_id into conn_a from public.gaming_connections g where g.entity_id = ent_a;

  -- an attempt that is consumed but NOT completed (no link yet)
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st from public.start_connection_attempt('discord') s;
  reset role;
  set local role service_role;
  select c.attempt_id into att_pending from public.consume_connection_attempt(st) c;
  reset role;

  -- ------------------------------------------------------------------ 1. privilege boundary
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.record_connection_discovery(att, acct_a, 'riot', 'ABSENT', 0, 0, null, null, null, null, null, null, null, null, null, null); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user cannot call record_connection_discovery', 'pass', got like 'permission denied%' or got = 'BACKEND_ONLY', 'got', got);
  begin perform private.record_connection_discovery_impl(att, acct_a, 'riot', 'ABSENT', 0, 0, null, null, null, null, null, null, null, null, null, null); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user cannot call the private implementation directly', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from public.connection_discovery_results; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'authenticated user has no direct table access to discovery results', 'pass', got like 'permission denied%', 'got', got);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.get_my_connection_discovery(); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot call get_my_connection_discovery', 'pass', got like 'permission denied%', 'got', got);
  begin perform public.record_connection_discovery(att, acct_a, 'riot', 'ABSENT', 0, 0, null, null, null, null, null, null, null, null, null, null); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot call record_connection_discovery', 'pass', got like 'permission denied%' or got = 'BACKEND_ONLY', 'got', got);
  begin perform 1 from public.connection_discovery_results; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot read discovery results', 'pass', got like 'permission denied%', 'got', got);
  reset role;

  -- ------------------------------------------------------------------ 2. recording guards (service_role)
  set local role service_role;
  select public.record_connection_discovery(att_pending, acct_a, 'riot', 'ABSENT', 1, 0, null, null, null, null, null, null, null, null, null, null) into got;
  res := res || jsonb_build_object('step', 'an attempt that is not completed cannot record discovery (INVALID_ATTEMPT)', 'pass', got = 'INVALID_ATTEMPT', 'got', got);
  select public.record_connection_discovery(gen_random_uuid(), acct_a, 'riot', 'ABSENT', 1, 0, null, null, null, null, null, null, null, null, null, null) into got;
  res := res || jsonb_build_object('step', 'an unknown attempt cannot record discovery (INVALID_ATTEMPT)', 'pass', got = 'INVALID_ATTEMPT', 'got', got);
  select public.record_connection_discovery(att, acct_b, 'riot', 'ABSENT', 1, 0, null, null, null, null, null, null, null, null, null, null) into got;
  res := res || jsonb_build_object('step', 'discovery cannot be attached to an account other than the one linked by that attempt (NO_CONNECTION)', 'pass', got = 'NO_CONNECTION', 'got', got);
  select public.record_connection_discovery(att, acct_a, 'steam', 'ABSENT', 1, 0, null, null, null, null, null, null, null, null, null, null) into got;
  res := res || jsonb_build_object('step', 'only the riot discovery provider is accepted (INVALID_PROVIDER)', 'pass', got = 'INVALID_PROVIDER', 'got', got);
  select public.record_connection_discovery(att, acct_a, 'riot', 'MAYBE', 1, 0, null, null, null, null, null, null, null, null, null, null) into got;
  res := res || jsonb_build_object('step', 'an unknown status is rejected (INVALID_STATUS)', 'pass', got = 'INVALID_STATUS', 'got', got);
  begin perform public.record_connection_discovery(att, acct_a, 'riot', 'FOUND', 3, 1, null, 'Name#1', 'uuid', 36, fp, true, false, false, 1, array['id','name']); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'FOUND without an external type violates the table constraint', 'pass', got like '%connection_discovery_found_has_type%' or got like '%external_type%', 'got', got);
  begin perform public.record_connection_discovery(att, acct_a, 'riot', 'FOUND', 3, 1, 'riotgames', 'Name#1', 'uuid', 36, 'not-a-sha', true, false, false, 1, array['id']); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'a malformed fingerprint is rejected', 'pass', got like '%external_id_sha256%', 'got', got);
  reset role;
  select count(*) into cnt from public.connection_discovery_results;
  res := res || jsonb_build_object('step', 'none of the rejected calls wrote a row', 'pass', cnt = 0, 'count', cnt);

  -- ------------------------------------------------------------------ 3. record FOUND, then owner reads it
  set local role service_role;
  select public.record_connection_discovery(att, acct_a, 'riot', 'FOUND', 4, 1, 'riotgames', 'Gamer#NA1', 'uuid', 36, fp, true, false, false, 1,
    array['type','id','name','id','Bad Key!','UPPER','verified','visibility']) into got;
  reset role;
  res := res || jsonb_build_object('step', 'a FOUND result is recorded for the linked account (RECORDED)', 'pass', got = 'RECORDED', 'got', got);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select d.status, d.external_type, d.external_name, d.external_id_shape, d.external_id_length, d.total_returned, d.match_count,
         d.verified, d.revoked, d.friend_sync, d.visibility, d.returned_fields, d.provider_key, d.discovered_provider into rec
  from public.get_my_connection_discovery() d;
  select string_agg(k, ',' order by k) into keys from (select jsonb_object_keys(to_jsonb(p)) k from (select * from public.get_my_connection_discovery() limit 1) p) s;
  reset role;
  res := res || jsonb_build_object('step', 'owner reads their own FOUND result with the returned type, name, shape and flags',
    'pass', rec.status = 'FOUND' and rec.external_type = 'riotgames' and rec.external_name = 'Gamer#NA1' and rec.external_id_shape = 'uuid'
            and rec.external_id_length = 36 and rec.total_returned = 4 and rec.match_count = 1
            and rec.verified = true and rec.revoked = false and rec.friend_sync = false and rec.visibility = 1
            and rec.provider_key = 'discord' and rec.discovered_provider = 'riot');
  res := res || jsonb_build_object('step', 'returned field names are de-duplicated and restricted to lowercase snake_case', 'pass', rec.returned_fields = array['id','name','type','verified','visibility'], 'got', rec.returned_fields::text);
  res := res || jsonb_build_object('step', 'the owner RPC never returns the id fingerprint, a raw id, or any connection/entity id', 'pass', keys !~* 'sha256|fingerprint|connection_id|entity_id|provider_account|(^|,)external_id(,|$)', 'columns', keys);

  -- ------------------------------------------------------------------ 4. ownership isolation
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_my_connection_discovery();
  reset role;
  res := res || jsonb_build_object('step', 'another user (no connection) sees no discovery rows', 'pass', cnt = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.state into st from public.start_connection_attempt('discord') s;
  reset role;
  set local role service_role;
  select c.attempt_id into att_b from public.consume_connection_attempt(st) c;
  select public.complete_connection_attempt(att_b, acct_b, 'bob', 'Bob', null) into got;
  select public.record_connection_discovery(att_b, acct_b, 'riot', 'ABSENT', 2, 0, null, null, null, null, null, null, null, null, null, null) into got;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) as c, min(d.status) as s, min(coalesce(d.external_name, 'none')) as nm into rec from public.get_my_connection_discovery() d;
  reset role;
  res := res || jsonb_build_object('step', 'owner B sees only B''s own ABSENT result, never A''s Riot data', 'pass', rec.c = 1 and rec.s = 'ABSENT' and rec.nm = 'none');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) as c, min(d.status) as s into rec from public.get_my_connection_discovery() d;
  reset role;
  res := res || jsonb_build_object('step', 'owner A still sees only A''s FOUND result', 'pass', rec.c = 1 and rec.s = 'FOUND');

  -- ------------------------------------------------------------------ 5. re-run overwrites; ABSENT clears details
  set local role service_role;
  select public.record_connection_discovery(att, acct_a, 'riot', 'ABSENT', 2, 0, 'stale', 'Stale#1', 'uuid', 36, fp, true, true, true, 1, array['id']) into got;
  reset role;
  select d.status, d.external_type, d.external_name, d.external_id_sha256, d.verified, cardinality(d.returned_fields) as nfields, d.total_returned into rec
  from public.connection_discovery_results d where d.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'a later ABSENT result replaces FOUND and discards every Riot detail (even if the caller wrongly supplies some)',
    'pass', got = 'RECORDED' and rec.status = 'ABSENT' and rec.external_type is null and rec.external_name is null and rec.external_id_sha256 is null and rec.verified is null and rec.nfields = 0 and rec.total_returned = 2);
  select count(*) into cnt from public.connection_discovery_results d where d.connection_id = conn_a;
  res := res || jsonb_build_object('step', 're-running discovery keeps exactly one row per connection', 'pass', cnt = 1);

  set local role service_role;
  select public.record_connection_discovery(att, acct_a, 'riot', 'UNAVAILABLE', null, null, null, null, null, null, null, null, null, null, null, null) into got;
  reset role;
  select d.status, d.total_returned into rec from public.connection_discovery_results d where d.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'UNAVAILABLE (Discord call failed) is recorded without inventing data', 'pass', got = 'RECORDED' and rec.status = 'UNAVAILABLE' and rec.total_returned is null);

  set local role service_role;
  select public.record_connection_discovery(att, acct_a, 'riot', 'FOUND', 5, 2, 'riotgames', 'Again#EUW', 'digits', 12, fp, null, null, null, null, array['type']) into got;
  reset role;

  -- ------------------------------------------------------------------ 6. stored fingerprint is a hash, never the raw id
  select count(*) into cnt from public.connection_discovery_results d where d.external_id_sha256 = fp and d.external_id_sha256 ~ '^[0-9a-f]{64}$';
  res := res || jsonb_build_object('step', 'only a 64-hex SHA-256 fingerprint is stored for the external id', 'pass', cnt = 1);

  -- ------------------------------------------------------------------ 7. CONNECTED/discovery is not PUBLIC
  update public.entities set visibility = 'PUBLIC' where entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select string_agg(k, ',' order by k) into keys from (select jsonb_object_keys(to_jsonb(p)) k from (select * from public.get_public_identity('zdisca') limit 1) p) s;
  select count(*) into cnt from public.get_public_identity('zdisca') p where to_jsonb(p)::text ~* 'riot|discord|Again|EUW|discover|connection|provider|alice';
  reset role;
  res := res || jsonb_build_object('step', 'a published identity''s public response contains no Riot, Discord, discovery or connection data', 'pass', keys ~ 'gamid_handle' and keys !~* 'riot|discord|discover|connection|provider' and cnt = 0, 'columns', keys);
  update public.entities set visibility = 'PRIVATE' where entity_id = ent_a;

  -- ------------------------------------------------------------------ 8. disconnect removes discovery data
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.disconnect_my_connection('discord');
  select count(*) into cnt from public.get_my_connection_discovery();
  reset role;
  select count(*) into n from public.connection_discovery_results d where d.connection_id = conn_a;
  res := res || jsonb_build_object('step', 'disconnecting Discord deletes its discovery result (cascade) and the owner RPC returns nothing', 'pass', n = 0 and cnt = 0);
  select count(*) into cnt from public.entities e where e.gamid_handle = 'zdisca';
  res := res || jsonb_build_object('step', 'disconnect preserves the GamID identity', 'pass', cnt = 1);

  -- ------------------------------------------------------------------ 9. identity deletion cascades
  delete from public.entities e where e.entity_id = ent_b;
  select count(*) into cnt from public.connection_discovery_results;
  res := res || jsonb_build_object('step', 'deleting an identity removes its connections and discovery rows', 'pass', cnt = 0);

  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
