-- My Duo durable notifications - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/my-duo-notifications-db.sql
-- (Requires 20261002150000_my_duo, 20261002170000_my_duo_realtime and 20261002190000_my_duo_notifications; to validate a migration BEFORE applying it, run it wrapped
--  together with this file.) Disposable users / identities only; ALWAYS raises TEST_RESULTS so everything rolls back.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ud uuid := gen_random_uuid();
  ent_b uuid; ent_a uuid;
  out text; j jsonb; cnt integer; flag boolean; first_id bigint; old_id bigint;
begin
  execute $fn$
    create function pg_temp.nt_run(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
    declare o text;
    begin
      perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
      execute 'set local role ' || p_role;
      begin execute p_sql into o; exception when others then o := 'ERR:' || sqlstate || ':' || sqlerrm; end;
      reset role;
      return o;
    end $f$;
  $fn$;
  -- the caller's pending notifications as "KIND:actor,..." in delivery order ('none' when empty)
  execute $fn$
    create function pg_temp.nt_pending(p_uid uuid) returns text language sql as $f$
      select pg_temp.nt_run(p_uid, 'authenticated', 'select coalesce(string_agg(n.kind || '':'' || n.actor_handle, '','' order by n.notification_id), ''none'') from public.get_my_duo_notifications() n')
    $f$;
  $fn$;

  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'znt-a@example.invalid', now()), (ub, 'znt-b@example.invalid', now()), (uc, 'znt-c@example.invalid', now()), (ud, 'znt-d@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('znta', 'Note A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zntb', 'Note B', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zntc', 'Note C', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zntd', 'Note D', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'znta';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zntb';

  -- ===== structure and privileges =====
  select relrowsecurity into flag from pg_class where oid = 'public.identity_notifications'::regclass;
  res := res || jsonb_build_object('step', 'RLS is enabled on identity_notifications', 'pass', coalesce(flag, false));
  res := res || jsonb_build_object('step', 'no client role has any table privilege (RPC-only)',
    'pass', not (has_table_privilege('anon', 'public.identity_notifications', 'select') or has_table_privilege('authenticated', 'public.identity_notifications', 'select')
      or has_table_privilege('authenticated', 'public.identity_notifications', 'insert') or has_table_privilege('authenticated', 'public.identity_notifications', 'update')
      or has_table_privilege('authenticated', 'public.identity_notifications', 'delete')));
  res := res || jsonb_build_object('step', 'the owner RPCs are authenticated-only; the writer is not callable by any client',
    'pass', has_function_privilege('authenticated', 'public.get_my_duo_notifications()', 'execute') and has_function_privilege('authenticated', 'public.mark_my_duo_notifications_seen(bigint[])', 'execute')
      and not has_function_privilege('anon', 'public.get_my_duo_notifications()', 'execute') and not has_function_privilege('anon', 'public.mark_my_duo_notifications_seen(bigint[])', 'execute')
      and not has_function_privilege('authenticated', 'private.identity_notify(uuid, uuid, text)', 'execute'));
  out := pg_temp.nt_run(ub, 'authenticated', 'select count(*)::text from public.identity_notifications');
  res := res || jsonb_build_object('step', 'a signed-in user cannot read the table directly', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.nt_run(null, 'anon', 'select count(*)::text from public.get_my_duo_notifications()');
  res := res || jsonb_build_object('step', 'anon cannot fetch notifications', 'pass', out like 'ERR:42501:%', 'got', out);

  -- ===== request received; the actor is never notified of their own action =====
  out := pg_temp.nt_run(ua, 'authenticated', 'select public.send_duo_request(''zntb'')');
  res := res || jsonb_build_object('step', 'A requests B: B has DUO_REQUEST_RECEIVED from @znta; A has nothing', 'pass', out = 'SENT' and pg_temp.nt_pending(ub) = 'DUO_REQUEST_RECEIVED:znta' and pg_temp.nt_pending(ua) = 'none',
    'got', pg_temp.nt_pending(ub) || ' / ' || pg_temp.nt_pending(ua));
  select count(*) into cnt from realtime.messages m where m.topic = 'identity:user:' || ub and m.event = 'duo_changed';
  res := res || jsonb_build_object('step', 'an online B is signalled (data-free) at once', 'pass', cnt >= 1, 'got', cnt);
  select bool_and((m.payload - 'id') = '{"kind": "DUO"}'::jsonb   /* 'id' = Realtime's own random message id */) into flag from realtime.messages m where m.topic = 'identity:user:' || ub;
  res := res || jsonb_build_object('step', 'the signal still carries no notification data', 'pass', coalesce(flag, false));

  -- ===== privacy: nobody else can read or mark B's notification =====
  out := pg_temp.nt_pending(uc);
  res := res || jsonb_build_object('step', 'C sees none of B''s notifications', 'pass', out = 'none', 'got', out);
  select n.notification_id into first_id from public.identity_notifications n where n.recipient_entity_id = ent_b order by n.notification_id limit 1;
  out := pg_temp.nt_run(uc, 'authenticated', format('select public.mark_my_duo_notifications_seen(array[%s]::bigint[])::text', first_id));
  res := res || jsonb_build_object('step', 'C cannot mark B''s notification seen (0 rows, still pending for B)', 'pass', out = '0' and pg_temp.nt_pending(ub) = 'DUO_REQUEST_RECEIVED:znta', 'got', out);

  -- ===== offline: events accumulate in order until B fetches and displays them =====
  out := pg_temp.nt_run(ua, 'authenticated', 'select public.cancel_duo_request(''zntb'')');
  out := pg_temp.nt_run(ua, 'authenticated', 'select public.send_duo_request(''zntb'')');
  res := res || jsonb_build_object('step', 'B was offline: received, cancelled, received - all pending, oldest first',
    'pass', pg_temp.nt_pending(ub) = 'DUO_REQUEST_RECEIVED:znta,DUO_REQUEST_CANCELLED:znta,DUO_REQUEST_RECEIVED:znta', 'got', pg_temp.nt_pending(ub));
  out := pg_temp.nt_pending(ub);
  res := res || jsonb_build_object('step', 'fetching does NOT mark anything seen', 'pass', pg_temp.nt_pending(ub) = out, 'got', pg_temp.nt_pending(ub));
  out := pg_temp.nt_run(ub, 'authenticated', format('select public.mark_my_duo_notifications_seen(array[%s]::bigint[])::text', first_id));
  res := res || jsonb_build_object('step', 'B marks the first one seen after displaying it; only the rest stay pending', 'pass', out = '1' and pg_temp.nt_pending(ub) = 'DUO_REQUEST_CANCELLED:znta,DUO_REQUEST_RECEIVED:znta', 'got', out || ' ' || pg_temp.nt_pending(ub));
  out := pg_temp.nt_run(ub, 'authenticated', format('select public.mark_my_duo_notifications_seen(array[%s]::bigint[])::text', first_id));
  res := res || jsonb_build_object('step', 'marking it again is a harmless no-op (a realtime / page-load race cannot double-mark)', 'pass', out = '0', 'got', out);
  out := pg_temp.nt_run(ub, 'authenticated', 'select public.mark_my_duo_notifications_seen((select array_agg(n.notification_id) from public.get_my_duo_notifications() n))::text');
  res := res || jsonb_build_object('step', 'after all are displayed and marked, a later visit shows none again', 'pass', out = '2' and pg_temp.nt_pending(ub) = 'none', 'got', out || ' ' || pg_temp.nt_pending(ub));

  -- ===== decline, accept, end =====
  out := pg_temp.nt_run(ub, 'authenticated', 'select public.respond_to_duo_request(''znta'', false)');
  res := res || jsonb_build_object('step', 'B declines: A gets DUO_REQUEST_DECLINED from @zntb; B gets nothing', 'pass', out = 'DECLINED' and pg_temp.nt_pending(ua) = 'DUO_REQUEST_DECLINED:zntb' and pg_temp.nt_pending(ub) = 'none',
    'got', pg_temp.nt_pending(ua));
  out := pg_temp.nt_run(ua, 'authenticated', 'select public.send_duo_request(''zntb'')');
  out := pg_temp.nt_run(ub, 'authenticated', 'select public.respond_to_duo_request(''znta'', true)');
  res := res || jsonb_build_object('step', 'B accepts: A gets DUO_REQUEST_ACCEPTED (after the earlier DECLINED)', 'pass', out = 'ACCEPTED' and pg_temp.nt_pending(ua) = 'DUO_REQUEST_DECLINED:zntb,DUO_REQUEST_ACCEPTED:zntb',
    'got', pg_temp.nt_pending(ua));
  out := pg_temp.nt_run(ua, 'authenticated', 'select public.mark_my_duo_notifications_seen((select array_agg(n.notification_id) from public.get_my_duo_notifications() n))::text');
  out := pg_temp.nt_run(ub, 'authenticated', 'select public.mark_my_duo_notifications_seen((select array_agg(n.notification_id) from public.get_my_duo_notifications() n))::text');

  -- ===== replacement, on the accepting side and on the requesting side =====
  out := pg_temp.nt_run(uc, 'authenticated', 'select public.send_duo_request(''zntb'')');
  out := pg_temp.nt_run(ub, 'authenticated', 'select public.respond_to_duo_request(''zntc'', true, true)');
  res := res || jsonb_build_object('step', 'B (Duo A) accepts C: A gets DUO_REPLACED from @zntb, C gets ACCEPTED',
    'pass', out = 'ACCEPTED' and pg_temp.nt_pending(ua) = 'DUO_REPLACED:zntb' and pg_temp.nt_pending(uc) = 'DUO_REQUEST_ACCEPTED:zntb', 'got', pg_temp.nt_pending(ua) || ' / ' || pg_temp.nt_pending(uc));
  out := pg_temp.nt_run(uc, 'authenticated', 'select public.mark_my_duo_notifications_seen((select array_agg(n.notification_id) from public.get_my_duo_notifications() n))::text');
  out := pg_temp.nt_run(uc, 'authenticated', 'select public.send_duo_request(''zntd'', true)');
  out := pg_temp.nt_run(ud, 'authenticated', 'select public.respond_to_duo_request(''zntc'', true)');
  res := res || jsonb_build_object('step', 'C (Duo B) has their request accepted by D: B gets DUO_REPLACED from @zntc (the one who chose a new Duo), C gets ACCEPTED from @zntd',
    'pass', out = 'ACCEPTED' and pg_temp.nt_pending(ub) like '%DUO_REPLACED:zntc' and pg_temp.nt_pending(uc) = 'DUO_REQUEST_ACCEPTED:zntd', 'got', pg_temp.nt_pending(ub) || ' / ' || pg_temp.nt_pending(uc));
  out := pg_temp.nt_run(ud, 'authenticated', 'select public.remove_my_duo()::text');
  res := res || jsonb_build_object('step', 'D ends the Duo: C gets DUO_ENDED from @zntd', 'pass', out = 'true' and pg_temp.nt_pending(uc) = 'DUO_REQUEST_ACCEPTED:zntd,DUO_ENDED:zntd', 'got', pg_temp.nt_pending(uc));

  -- ===== retention (per person, on read) =====
  insert into public.identity_notifications (recipient_entity_id, actor_entity_id, kind, created_at, seen_at) values (ent_b, ent_a, 'DUO_ENDED', now() - interval '40 days', now() - interval '31 days') returning notification_id into old_id;
  insert into public.identity_notifications (recipient_entity_id, actor_entity_id, kind, created_at) values (ent_b, ent_a, 'DUO_ENDED', now() - interval '91 days');
  out := pg_temp.nt_pending(ub);
  select count(*) into cnt from public.identity_notifications n where n.recipient_entity_id = ent_b and (n.notification_id = old_id or n.created_at < now() - interval '90 days');
  res := res || jsonb_build_object('step', 'reading prunes the person''s own seen-30-days / older-than-90-days rows', 'pass', cnt = 0, 'got', cnt);

  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
