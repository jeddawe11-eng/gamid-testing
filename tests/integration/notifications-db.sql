-- GamID Notifications foundation (My Duo as the first producer) - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/notifications-db.sql
-- (Requires 20261002210000_gamid_notifications; to validate it BEFORE applying, run it wrapped together with this file.)
-- Disposable users / identities only; ALWAYS raises TEST_RESULTS so everything rolls back.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ud uuid := gen_random_uuid();
  ent_a uuid; ent_b uuid; ent_c uuid;
  out text; cnt integer; flag boolean; newest bigint; first_id bigint; i integer;
begin
  execute $fn$
    create function pg_temp.gn_run(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
    declare o text;
    begin
      perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
      execute 'set local role ' || p_role;
      begin execute p_sql into o; exception when others then o := 'ERR:' || sqlstate || ':' || sqlerrm; end;
      reset role;
      return o;
    end $f$;
  $fn$;
  -- the caller's log as "type:actor:r|u,..." NEWEST first
  execute $fn$
    create function pg_temp.gn_log(p_uid uuid) returns text language sql as $f$
      select pg_temp.gn_run(p_uid, 'authenticated', 'select coalesce(string_agg(n.type_key || '':'' || coalesce(n.actor_handle, ''-'') || '':'' || case when n.read_at is null then ''u'' else ''r'' end, '','' order by n.notification_id desc), ''none'') from public.get_my_notifications(null, 50) n')
    $f$;
  $fn$;
  execute $fn$
    create function pg_temp.gn_unread(p_uid uuid) returns text language sql as $f$
      select pg_temp.gn_run(p_uid, 'authenticated', 'select public.get_my_unread_notification_count()::text')
    $f$;
  $fn$;

  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'zgn-a@example.invalid', now()), (ub, 'zgn-b@example.invalid', now()), (uc, 'zgn-c@example.invalid', now()), (ud, 'zgn-d@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zgna', 'Gn A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zgnb', 'Gn B', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zgnc', 'Gn C', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zgnd', 'Gn D', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zgna';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zgnb';
  select e.entity_id into ent_c from public.entities e where e.gamid_handle = 'zgnc';

  -- ===== one system: the My-Duo-only objects are gone =====
  res := res || jsonb_build_object('step', 'one notification table: identity_notifications was evolved into notifications', 'pass', to_regclass('public.identity_notifications') is null and to_regclass('public.notifications') is not null);
  select count(*) into cnt from pg_proc p join pg_namespace s on s.oid = p.pronamespace where p.proname in ('get_my_duo_notifications', 'mark_my_duo_notifications_seen', 'identity_notify', 'get_my_duo_notifications_impl', 'mark_my_duo_notifications_seen_impl');
  res := res || jsonb_build_object('step', 'the superseded My-Duo-only functions are removed', 'pass', cnt = 0, 'got', cnt);
  select count(*) into cnt from public.notification_types t where t.producer = 'my_duo' and t.destination = 'account.my_duo';
  res := res || jsonb_build_object('step', 'My Duo is a registered producer with six types and a typed internal destination', 'pass', cnt = 6, 'got', cnt);

  -- ===== privileges / forgery =====
  select relrowsecurity into flag from pg_class where oid = 'public.notifications'::regclass;
  res := res || jsonb_build_object('step', 'RLS is enabled on notifications', 'pass', coalesce(flag, false));
  res := res || jsonb_build_object('step', 'no client role has any privilege on notifications or notification_types',
    'pass', not (has_table_privilege('anon', 'public.notifications', 'select') or has_table_privilege('authenticated', 'public.notifications', 'select')
      or has_table_privilege('authenticated', 'public.notifications', 'insert') or has_table_privilege('authenticated', 'public.notifications', 'update')
      or has_table_privilege('authenticated', 'public.notifications', 'delete') or has_table_privilege('authenticated', 'public.notification_types', 'insert')));
  out := pg_temp.gn_run(ua, 'authenticated', format('insert into public.notifications (recipient_entity_id, actor_entity_id, type_key) values (%L, %L, ''duo.ended'') returning ''x''', ent_b, ent_a));
  res := res || jsonb_build_object('step', 'forgery: a signed-in user cannot insert a notification for someone else', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.gn_run(ua, 'authenticated', format('select private.notify(%L, %L, ''duo.ended'')::text', ent_b, ent_a));
  res := res || jsonb_build_object('step', 'forgery: the server-only producer (private.notify) is not callable by a client', 'pass', out like 'ERR:42501:%', 'got', out);
  res := res || jsonb_build_object('step', 'no public function can create a notification (only read / mark-read / count are exposed)',
    'pass', not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like '%notif%' and p.proname not in ('get_my_notifications', 'get_my_unread_notification_count', 'mark_my_notifications_read', 'mark_all_my_notifications_read')));
  res := res || jsonb_build_object('step', 'the owner RPCs are authenticated-only',
    'pass', not has_function_privilege('anon', 'public.get_my_notifications(bigint, integer)', 'execute') and not has_function_privilege('anon', 'public.mark_all_my_notifications_read(bigint)', 'execute')
      and has_function_privilege('authenticated', 'public.get_my_notifications(bigint, integer)', 'execute') and has_function_privilege('authenticated', 'public.get_my_unread_notification_count()', 'execute'));
  begin
    perform private.notify(ent_b, ent_a, 'made.up_type');
    out := 'created';
  exception when others then out := sqlerrm;
  end;
  res := res || jsonb_build_object('step', 'only registered types can be produced', 'pass', out = 'UNKNOWN_NOTIFICATION_TYPE', 'got', out);

  -- ===== My Duo produces authoritative events; the actor is never notified =====
  out := pg_temp.gn_run(ua, 'authenticated', 'select public.send_duo_request(''zgnb'')');
  res := res || jsonb_build_object('step', 'A requests B: B has an UNREAD duo.request_received from @zgna; A has nothing', 'pass', out = 'SENT' and pg_temp.gn_log(ub) = 'duo.request_received:zgna:u' and pg_temp.gn_unread(ub) = '1' and pg_temp.gn_log(ua) = 'none',
    'got', pg_temp.gn_log(ub));
  select count(*) into cnt from realtime.messages m where m.topic = 'notifications:user:' || ub and m.event = 'notifications_changed' and (m.payload - 'id') = '{"kind": "NOTIFICATIONS"}'::jsonb and m.private;
  res := res || jsonb_build_object('step', 'B is woken by a private, data-free notifications_changed signal', 'pass', cnt = 1, 'got', cnt);
  out := pg_temp.gn_run(ub, 'authenticated', 'select n.destination from public.get_my_notifications(null, 1) n');
  res := res || jsonb_build_object('step', 'the row carries its typed internal destination (no URL)', 'pass', out = 'account.my_duo', 'got', out);

  -- ===== offline accumulation, newest first, read model =====
  out := pg_temp.gn_run(ua, 'authenticated', 'select public.cancel_duo_request(''zgnb'')');
  out := pg_temp.gn_run(ua, 'authenticated', 'select public.send_duo_request(''zgnb'')');
  res := res || jsonb_build_object('step', 'B was away: three events, all unread, listed NEWEST first',
    'pass', pg_temp.gn_log(ub) = 'duo.request_received:zgna:u,duo.request_cancelled:zgna:u,duo.request_received:zgna:u' and pg_temp.gn_unread(ub) = '3', 'got', pg_temp.gn_log(ub));
  out := pg_temp.gn_log(ub);
  res := res || jsonb_build_object('step', 'listing (opening the panel) does NOT mark anything read', 'pass', pg_temp.gn_unread(ub) = '3', 'got', pg_temp.gn_unread(ub));
  out := pg_temp.gn_run(ub, 'authenticated', 'select n.notification_id::text from public.get_my_notifications(null, 50) n order by n.notification_id limit 1');
  first_id := out::bigint;
  out := pg_temp.gn_run(ub, 'authenticated', format('select public.mark_my_notifications_read(array[%s]::bigint[])::text', first_id));
  res := res || jsonb_build_object('step', 'reading one decreases the unread count by exactly one; it stays in the log as read', 'pass', out = '1' and pg_temp.gn_unread(ub) = '2' and pg_temp.gn_log(ub) like '%duo.request_received:zgna:r',
    'got', pg_temp.gn_log(ub));
  out := pg_temp.gn_run(ub, 'authenticated', 'select n.notification_id::text from public.get_my_notifications(null, 2) n offset 1');
  res := res || jsonb_build_object('step', 'keyset paging: the second page starts below the given id', 'pass',
    pg_temp.gn_run(ub, 'authenticated', format('select count(*)::text from public.get_my_notifications(%s, 50) n', out::bigint)) = '1');

  -- ===== privacy =====
  res := res || jsonb_build_object('step', 'C sees none of B''s notifications and its count is 0', 'pass', pg_temp.gn_log(uc) = 'none' and pg_temp.gn_unread(uc) = '0');
  out := pg_temp.gn_run(ub, 'authenticated', 'select string_agg(n.notification_id::text, '','') from public.get_my_notifications(null, 50) n');
  out := pg_temp.gn_run(uc, 'authenticated', format('select public.mark_my_notifications_read(array[%s]::bigint[])::text', out));
  res := res || jsonb_build_object('step', 'C cannot mark B''s notifications read', 'pass', out = '0' and pg_temp.gn_unread(ub) = '2', 'got', out);
  out := pg_temp.gn_run(uc, 'authenticated', 'select public.mark_all_my_notifications_read(9223372036854775807)::text');
  res := res || jsonb_build_object('step', 'C''s "mark all" touches only C''s own', 'pass', out = '0' and pg_temp.gn_unread(ub) = '2', 'got', out);
  out := pg_temp.gn_run(null, 'anon', 'select count(*)::text from public.get_my_notifications(null, 50)');
  res := res || jsonb_build_object('step', 'anon cannot read any log', 'pass', out like 'ERR:42501:%', 'got', out);

  -- ===== mark all up to what was loaded; a newer one stays unread =====
  newest := pg_temp.gn_run(ub, 'authenticated', 'select max(n.notification_id)::text from public.get_my_notifications(null, 50) n')::bigint;
  out := pg_temp.gn_run(ub, 'authenticated', 'select public.respond_to_duo_request(''zgna'', false)');   -- B declines: A is notified (B is not)
  out := pg_temp.gn_run(ua, 'authenticated', 'select public.send_duo_request(''zgnb'')');               -- a NEW one for B after B loaded the panel
  out := pg_temp.gn_run(ub, 'authenticated', format('select public.mark_all_my_notifications_read(%s)::text', newest));
  res := res || jsonb_build_object('step', 'Mark all as read covers what B loaded; the newer one stays unread', 'pass', out = '2' and pg_temp.gn_unread(ub) = '1', 'got', out || ' ' || pg_temp.gn_unread(ub));
  res := res || jsonb_build_object('step', 'read notifications remain in the history', 'pass', pg_temp.gn_log(ub) = 'duo.request_received:zgna:u,duo.request_received:zgna:r,duo.request_cancelled:zgna:r,duo.request_received:zgna:r', 'got', pg_temp.gn_log(ub));
  res := res || jsonb_build_object('step', 'A received the decline', 'pass', pg_temp.gn_log(ua) = 'duo.request_declined:zgnb:u', 'got', pg_temp.gn_log(ua));

  -- ===== accept, replacement (authoritative reason), end =====
  out := pg_temp.gn_run(ub, 'authenticated', 'select public.respond_to_duo_request(''zgna'', true)');
  res := res || jsonb_build_object('step', 'B accepts: A gets duo.request_accepted', 'pass', out = 'ACCEPTED' and pg_temp.gn_log(ua) like 'duo.request_accepted:zgnb:u,%', 'got', pg_temp.gn_log(ua));
  out := pg_temp.gn_run(uc, 'authenticated', 'select public.send_duo_request(''zgnb'')');
  out := pg_temp.gn_run(ub, 'authenticated', 'select public.respond_to_duo_request(''zgnc'', true, true)');
  res := res || jsonb_build_object('step', 'B (Duo A) accepts C: A gets duo.replaced from @zgnb (B chose a new Duo)', 'pass', out = 'ACCEPTED' and pg_temp.gn_log(ua) like 'duo.replaced:zgnb:u,%', 'got', pg_temp.gn_log(ua));
  out := pg_temp.gn_run(ub, 'authenticated', 'select public.remove_my_duo()::text');
  res := res || jsonb_build_object('step', 'B ends the Duo: C gets duo.ended from @zgnb', 'pass', out = 'true' and pg_temp.gn_log(uc) like 'duo.ended:zgnb:u,%', 'got', pg_temp.gn_log(uc));

  -- ===== retention: never on read; by age (90 days) and per-person cap (500) =====
  insert into public.notifications (recipient_entity_id, actor_entity_id, type_key, created_at, read_at) values (ent_c, ent_a, 'duo.ended', now() - interval '91 days', null), (ent_c, ent_a, 'duo.ended', now() - interval '89 days', now());
  out := pg_temp.gn_log(uc);
  select count(*) into cnt from public.notifications n where n.recipient_entity_id = ent_c and n.created_at < now() - interval '90 days';
  res := res || jsonb_build_object('step', 'older than 90 days is removed (read or not)', 'pass', cnt = 0, 'got', cnt);
  select count(*) into cnt from public.notifications n where n.recipient_entity_id = ent_c and n.created_at < now() - interval '88 days';
  res := res || jsonb_build_object('step', 'a READ notification inside the window is kept (reading never deletes)', 'pass', cnt = 1, 'got', cnt);
  for i in 1..505 loop
    insert into public.notifications (recipient_entity_id, actor_entity_id, type_key) values (ent_a, ent_b, 'duo.ended');
  end loop;
  perform private.notify(ent_a, ent_b, 'duo.ended');
  select count(*) into cnt from public.notifications n where n.recipient_entity_id = ent_a;
  res := res || jsonb_build_object('step', 'at most 500 per person: the oldest beyond the cap are removed when a new one is written', 'pass', cnt = 500, 'got', cnt);
  select (select max(policy.retention_days) from private.notification_policy policy) = 90 and (select max(policy.max_per_recipient) from private.notification_policy policy) = 500 into flag;
  res := res || jsonb_build_object('step', 'the policy is one central row (90 days, 500 per person)', 'pass', coalesce(flag, false));

  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
