-- My Duo live state (private Realtime invalidation) - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/my-duo-realtime-db.sql
-- (Requires 20261002150000_my_duo and 20261002170000_my_duo_realtime; to validate a migration BEFORE applying it, run it wrapped together with this file.)
-- Disposable users / identities only, created inside the transaction; ALWAYS raises TEST_RESULTS so everything (relationships, realtime messages) rolls back.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  out text; cnt integer; flag boolean;
begin
  execute $fn$
    create function pg_temp.rt_run(p_uid uuid, p_role text, p_sql text, p_topic text default null) returns text language plpgsql as $f$
    declare o text;
    begin
      perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
      perform set_config('realtime.topic', coalesce(p_topic, ''), true);
      execute 'set local role ' || p_role;
      begin execute p_sql into o; exception when others then o := 'ERR:' || sqlstate || ':' || sqlerrm; end;
      reset role;
      return o;
    end $f$;
  $fn$;
  -- duo_changed signals on a user's topic so far (read as the database owner)
  execute $fn$
    create function pg_temp.rt_count(p_uid uuid) returns integer language sql as $f$
      select count(*)::integer from realtime.messages m where m.topic = 'identity:user:' || p_uid::text and m.event = 'duo_changed'
    $f$;
  $fn$;

  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zrt-a@example.invalid', now()), (ub, 'zrt-b@example.invalid', now()), (uc, 'zrt-c@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zrta', 'Live A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zrtb', 'Live B', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zrtc', 'Live C', date '1990-01-01', 'en'); reset role;

  -- ===== structure =====
  select exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'identity_relationship_broadcasts' and roles = '{authenticated}' and cmd = 'SELECT') into flag;
  res := res || jsonb_build_object('step', 'a SELECT policy on realtime.messages for authenticated users only', 'pass', coalesce(flag, false));
  select count(*) into cnt from pg_trigger where tgname in ('identity_relationships_realtime', 'entities_identity_realtime') and not tgisinternal;
  res := res || jsonb_build_object('step', 'both triggers exist', 'pass', cnt = 2);
  res := res || jsonb_build_object('step', 'no client role can call the broadcast functions',
    'pass', not has_function_privilege('authenticated', 'private.broadcast_identity_entity(uuid)', 'execute') and not has_function_privilege('anon', 'private.broadcast_identity_entity(uuid)', 'execute'));
  res := res || jsonb_build_object('step', 'no signal before any Duo action', 'pass', pg_temp.rt_count(ua) = 0 and pg_temp.rt_count(ub) = 0 and pg_temp.rt_count(uc) = 0);

  -- ===== B's open page hears A's request; an uninvolved user hears nothing =====
  out := pg_temp.rt_run(ua, 'authenticated', 'select public.send_duo_request(''zrtb'')');
  res := res || jsonb_build_object('step', 'A sends a request: A and B are signalled, C is not', 'pass', out = 'SENT' and pg_temp.rt_count(ua) = 1 and pg_temp.rt_count(ub) = 1 and pg_temp.rt_count(uc) = 0,
    'got', jsonb_build_array(out, pg_temp.rt_count(ua), pg_temp.rt_count(ub), pg_temp.rt_count(uc)));
  select bool_and(m.payload = '{"kind": "DUO"}'::jsonb and m.private and m.extension = 'broadcast') into flag from realtime.messages m where m.topic in ('identity:user:' || ua, 'identity:user:' || ub);
  res := res || jsonb_build_object('step', 'the signal is private and carries no data but {"kind":"DUO"} (no ids, handles or state)', 'pass', coalesce(flag, false));

  -- ===== Realtime authorization: each user receives only their own topic =====
  out := pg_temp.rt_run(ub, 'authenticated', format('select count(*)::text from realtime.messages where topic = %L', 'identity:user:' || ub), 'identity:user:' || ub);
  res := res || jsonb_build_object('step', 'B may receive B''s own topic', 'pass', out = '1', 'got', out);
  out := pg_temp.rt_run(uc, 'authenticated', format('select count(*)::text from realtime.messages where topic = %L', 'identity:user:' || ub), 'identity:user:' || ub);
  res := res || jsonb_build_object('step', 'C cannot receive B''s topic', 'pass', out = '0' or out like 'ERR:42501%', 'got', out);
  out := pg_temp.rt_run(null, 'anon', format('select count(*)::text from realtime.messages where topic = %L', 'identity:user:' || ub), 'identity:user:' || ub);
  res := res || jsonb_build_object('step', 'anon cannot receive it', 'pass', out = '0' or out like 'ERR:42501%', 'got', out);

  -- ===== accept, public switch, publication, decline, cancel, replacement, end =====
  out := pg_temp.rt_run(ub, 'authenticated', 'select public.respond_to_duo_request(''zrta'', true)');
  res := res || jsonb_build_object('step', 'B accepts: A''s open page is signalled', 'pass', out = 'ACCEPTED' and pg_temp.rt_count(ua) = 2 and pg_temp.rt_count(ub) = 2, 'got', jsonb_build_array(out, pg_temp.rt_count(ua)));
  out := pg_temp.rt_run(ua, 'authenticated', 'select public.set_my_duo_visibility(true)::text');
  res := res || jsonb_build_object('step', 'A changes Show My Duo: B (and A''s other open tabs) are signalled', 'pass', out = 'true' and pg_temp.rt_count(ub) = 3 and pg_temp.rt_count(ua) = 3, 'got', jsonb_build_array(pg_temp.rt_count(ua), pg_temp.rt_count(ub)));
  out := pg_temp.rt_run(ub, 'authenticated', 'select (to_jsonb(v)->>''visibility'') from public.set_my_identity_visibility(true) v');
  res := res || jsonb_build_object('step', 'B publishes their GamID: A (whose panel shows B''s publication) is signalled, B is not', 'pass', pg_temp.rt_count(ua) = 4 and pg_temp.rt_count(ub) = 3, 'got', jsonb_build_array(out, pg_temp.rt_count(ua), pg_temp.rt_count(ub)));
  out := pg_temp.rt_run(uc, 'authenticated', 'select public.send_duo_request(''zrta'')');
  out := pg_temp.rt_run(ua, 'authenticated', 'select public.respond_to_duo_request(''zrtc'', true, true)');
  res := res || jsonb_build_object('step', 'A accepts C (replacement): B - whose Duo just ended - is signalled, and C too',
    'pass', out = 'ACCEPTED' and pg_temp.rt_count(ub) = 4 and pg_temp.rt_count(uc) >= 2, 'got', jsonb_build_array(out, pg_temp.rt_count(ub), pg_temp.rt_count(uc)));
  out := pg_temp.rt_run(ub, 'authenticated', 'select public.send_duo_request(''zrtc'', false)');
  cnt := pg_temp.rt_count(uc);
  out := pg_temp.rt_run(uc, 'authenticated', 'select public.respond_to_duo_request(''zrtb'', false, false)');
  res := res || jsonb_build_object('step', 'C declines B: B is signalled', 'pass', out = 'DECLINED' and pg_temp.rt_count(ub) = 6 and pg_temp.rt_count(uc) = cnt + 1, 'got', jsonb_build_array(out, pg_temp.rt_count(ub)));
  out := pg_temp.rt_run(ub, 'authenticated', 'select public.send_duo_request(''zrtc'', false)');
  cnt := pg_temp.rt_count(uc);
  out := pg_temp.rt_run(ub, 'authenticated', 'select public.cancel_duo_request(''zrtc'')');
  res := res || jsonb_build_object('step', 'B cancels: C''s open page is signalled', 'pass', out = 'CANCELLED' and pg_temp.rt_count(uc) = cnt + 1, 'got', jsonb_build_array(out, pg_temp.rt_count(uc), cnt));
  cnt := pg_temp.rt_count(ua);
  out := pg_temp.rt_run(uc, 'authenticated', 'select public.remove_my_duo()::text');
  res := res || jsonb_build_object('step', 'C ends the Duo: A is signalled', 'pass', out = 'true' and pg_temp.rt_count(ua) = cnt + 1, 'got', jsonb_build_array(out, pg_temp.rt_count(ua), cnt));
  cnt := pg_temp.rt_count(ua);
  out := pg_temp.rt_run(ub, 'authenticated', 'select (to_jsonb(v)->>''visibility'') from public.set_my_identity_visibility(false) v');
  res := res || jsonb_build_object('step', 'a GamID change with no remaining relationship signals nobody', 'pass', pg_temp.rt_count(ua) = cnt, 'got', jsonb_build_array(pg_temp.rt_count(ua), cnt));

  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
