-- My Crew V1 (Slice 1) - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/my-crew-db.sql
-- (Requires 20261003100000_my_crew; to validate it BEFORE applying, run it wrapped together with this file.)
-- Disposable users / identities only (17 GamIDs to exercise the 15-member limit); ALWAYS raises TEST_RESULTS so everything rolls back. Uses two real catalog games
-- (the first two active ones), only as foreign-key targets - no catalog row is written.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  users uuid[] := array[]::uuid[];
  ents uuid[] := array[]::uuid[];
  g1 text; g2 text;
  crew_a uuid; crew_b uuid; crew_c uuid; crew_v uuid;
  out text; cnt integer; flag boolean; i integer; u uuid;
begin
  execute $fn$
    create function pg_temp.cr_run(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
    declare o text;
    begin
      perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
      execute 'set local role ' || p_role;
      begin execute p_sql into o; exception when others then o := 'ERR:' || sqlstate || ':' || sqlerrm; end;
      reset role;
      return o;
    end $f$;
  $fn$;
  -- the caller's unread notifications as "type@crew_name" newest first
  execute $fn$
    create function pg_temp.cr_notes(p_uid uuid) returns text language sql as $f$
      select pg_temp.cr_run(p_uid, 'authenticated', 'select coalesce(string_agg(n.type_key || ''@'' || coalesce(n.context->>''crew_name'', ''-''), '','' order by n.notification_id desc), ''none'') from public.get_my_notifications(null, 50) n where n.read_at is null')
    $f$;
  $fn$;

  g1 :=(select game_key from public.game_catalog where is_active order by game_key limit 1);
  g2 := (select game_key from public.game_catalog where is_active order by game_key offset 1 limit 1);
  users := array[]::uuid[];
  for i in 1..17 loop
    u := gen_random_uuid();
    users := users || u;
    insert into auth.users (id, email, email_confirmed_at) values (u, format('zcr-%s@example.invalid', i), now());
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    set local role authenticated; perform 1 from public.create_solo_identity(format('zcr%s', i), format('Crew %s', i), date '1990-01-01', 'en'); reset role;
    ents := ents || (select e.entity_id from public.entities e where e.gamid_handle = format('zcr%s', i));
  end loop;
  -- users[1] = Owner A, users[2] = B, users[3] = C, users[4..17] = fillers

  -- ===== structure / privileges =====
  select bool_and(c.relrowsecurity) into flag from pg_class c where c.oid in ('public.crews'::regclass, 'public.crew_members'::regclass);
  res := res || jsonb_build_object('step', 'RLS is enabled on crews and crew_members', 'pass', coalesce(flag, false));
  res := res || jsonb_build_object('step', 'no client role has any privilege on the Crew tables (RPC-only)',
    'pass', not (has_table_privilege('authenticated', 'public.crews', 'select') or has_table_privilege('authenticated', 'public.crews', 'insert') or has_table_privilege('authenticated', 'public.crews', 'update')
      or has_table_privilege('authenticated', 'public.crew_members', 'select') or has_table_privilege('authenticated', 'public.crew_members', 'insert') or has_table_privilege('authenticated', 'public.crew_members', 'update')
      or has_table_privilege('anon', 'public.crews', 'select') or has_table_privilege('anon', 'public.crew_members', 'select')));
  res := res || jsonb_build_object('step', 'Crew RPCs are authenticated-only',
    'pass', not has_function_privilege('anon', 'public.create_crew(text, text)', 'execute') and not has_function_privilege('anon', 'public.get_crew_members(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.get_my_crews()', 'execute') and has_function_privilege('authenticated', 'public.invite_to_crew(uuid, text)', 'execute'));
  res := res || jsonb_build_object('step', 'the member limit is one central policy row (15)', 'pass', (select max_members from private.crew_policy) = 15);
  res := res || jsonb_build_object('step', 'two catalog games are available for the test', 'pass', g1 is not null and g2 is not null and g1 <> g2, 'got', jsonb_build_array(g1, g2));

  -- ===== create =====
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.create_crew(%L, %L)::text', g1, 'Night Raiders'));
  crew_a := case when out like 'ERR:%' then null else out::uuid end;
  res := res || jsonb_build_object('step', 'A creates "Night Raiders" for game 1 and is its OWNER', 'pass', crew_a is not null
    and pg_temp.cr_run(users[1], 'authenticated', 'select string_agg(c.crew_name || '':'' || c.my_role || '':'' || c.my_status || '':'' || c.member_count, '','') from public.get_my_crews() c') = 'Night Raiders:OWNER:ACTIVE:1', 'got', out);
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.create_crew(%L, %L)::text', g1, 'Second Crew'));
  res := res || jsonb_build_object('step', 'ONE CREW PER GAME: A cannot create a second Crew for the same game', 'pass', out like 'ERR:PT409:CREW_ALREADY_IN_GAME%', 'got', out);
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.create_crew(%L, %L)::text', g2, 'Zero'));
  crew_v := case when out like 'ERR:%' then null else out::uuid end;
  res := res || jsonb_build_object('step', 'A can have a Crew for a DIFFERENT game', 'pass', crew_v is not null, 'got', out);
  out := pg_temp.cr_run(users[2], 'authenticated', format('select public.create_crew(%L, %L)::text', 'no_such_game_zz', 'X Crew'));
  res := res || jsonb_build_object('step', 'only real catalog games', 'pass', out like 'ERR:22023:GAME_NOT_FOUND%', 'got', out);
  out := pg_temp.cr_run(users[2], 'authenticated', format('select public.create_crew(%L, %L)::text', g1, '<b>x</b>'));
  res := res || jsonb_build_object('step', 'invalid names are refused', 'pass', out like 'ERR:22023:INVALID_CREW_NAME%', 'got', out);
  out := pg_temp.cr_run(users[1], 'authenticated', format('update public.crews set name = %L where crew_id = %L returning ''x''', 'Renamed', crew_a));
  res := res || jsonb_build_object('step', 'a client cannot rename a Crew (no table privilege)', 'pass', out like 'ERR:42501:%', 'got', out);
  begin
    update public.crews set name = 'Renamed' where crew_id = crew_a;
    out := 'updated';
  exception when others then out := sqlerrm;
  end;
  res := res || jsonb_build_object('step', 'name is immutable even for a backend write', 'pass', out = 'CREW_IMMUTABLE', 'got', out);
  begin
    update public.crews set game_key = g2 where crew_id = crew_a;
    out := 'updated';
  exception when others then out := sqlerrm;
  end;
  res := res || jsonb_build_object('step', 'game is immutable', 'pass', out in ('CREW_IMMUTABLE') or out like '%violates%', 'got', out);

  -- ===== invitations: nobody is added without accepting =====
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.invite_to_crew(%L, ''zcr2'')', crew_a));
  res := res || jsonb_build_object('step', 'A invites B: B is INVITED, NOT a member yet', 'pass', out = 'INVITED'
    and pg_temp.cr_run(users[2], 'authenticated', 'select string_agg(c.crew_name || '':'' || c.my_status, '','') from public.get_my_crews() c') = 'Night Raiders:INVITED'
    and pg_temp.cr_run(users[1], 'authenticated', format('select string_agg(m.gamid_handle || '':'' || m.status, '','' order by m.gamid_handle) from public.get_crew_members(%L) m', crew_a)) = 'zcr1:ACTIVE,zcr2:INVITED', 'got', out);
  res := res || jsonb_build_object('step', 'B is notified (crew.invite_received with the Crew name); A is not', 'pass', pg_temp.cr_notes(users[2]) = 'crew.invite_received@Night Raiders' and pg_temp.cr_notes(users[1]) = 'none', 'got', pg_temp.cr_notes(users[2]));
  out := pg_temp.cr_run(users[2], 'authenticated', format('select count(*)::text from public.get_crew_members(%L)', crew_a));
  res := res || jsonb_build_object('step', 'an INVITED (not yet member) GamID cannot list the members', 'pass', out like 'ERR:42501:CREW_MEMBERS_ONLY%', 'got', out);
  out := pg_temp.cr_run(users[3], 'authenticated', format('select public.respond_to_crew_invite(%L, true)', crew_a));
  res := res || jsonb_build_object('step', 'C cannot accept B''s invitation', 'pass', out like 'ERR:P0002:CREW_INVITE_NOT_FOUND%', 'got', out);
  out := pg_temp.cr_run(users[2], 'authenticated', format('select public.invite_to_crew(%L, ''zcr3'')', crew_a));
  res := res || jsonb_build_object('step', 'a non-owner cannot invite', 'pass', out like 'ERR:42501:CREW_OWNER_ONLY%', 'got', out);
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.invite_to_crew(%L, ''zcr2'')', crew_a));
  res := res || jsonb_build_object('step', 'no duplicate invitation', 'pass', out like 'ERR:PT409:CREW_ALREADY_INVITED_OR_MEMBER%', 'got', out);
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.invite_to_crew(%L, ''zcr1'')', crew_a));
  res := res || jsonb_build_object('step', 'the owner cannot invite themselves', 'pass', out like 'ERR:22023:CREW_SELF%', 'got', out);
  out := pg_temp.cr_run(users[2], 'authenticated', format('select public.respond_to_crew_invite(%L, true)', crew_a));
  res := res || jsonb_build_object('step', 'B accepts: B is an ACTIVE MEMBER; A is notified (crew.invite_accepted)', 'pass', out = 'ACCEPTED'
    and pg_temp.cr_run(users[2], 'authenticated', 'select string_agg(c.crew_name || '':'' || c.my_role || '':'' || c.my_status || '':'' || c.owner_handle, '','') from public.get_my_crews() c') = 'Night Raiders:MEMBER:ACTIVE:zcr1'
    and pg_temp.cr_notes(users[1]) = 'crew.invite_accepted@Night Raiders', 'got', out);
  out := pg_temp.cr_run(users[2], 'authenticated', format('select string_agg(m.gamid_handle || '':'' || m.role, '','' order by m.role desc) from public.get_crew_members(%L) m', crew_a));
  res := res || jsonb_build_object('step', 'a member sees the owner and the members', 'pass', out = 'zcr1:OWNER,zcr2:MEMBER' or out = 'zcr2:MEMBER,zcr1:OWNER', 'got', out);

  -- ===== one Crew per game also binds members =====
  out := pg_temp.cr_run(users[3], 'authenticated', format('select public.create_crew(%L, %L)::text', g1, 'Other Crew'));
  crew_b := case when out like 'ERR:%' then null else out::uuid end;
  out := pg_temp.cr_run(users[3], 'authenticated', format('select public.invite_to_crew(%L, ''zcr2'')', crew_b));
  res := res || jsonb_build_object('step', 'C (another Crew, same game) can invite B - the invite reveals nothing about B''s Crews', 'pass', out = 'INVITED', 'got', out);
  out := pg_temp.cr_run(users[2], 'authenticated', format('select public.respond_to_crew_invite(%L, true)', crew_b));
  res := res || jsonb_build_object('step', 'ONE CREW PER GAME: B cannot accept a second Crew of the same game (must leave first)', 'pass', out like 'ERR:PT409:CREW_ALREADY_IN_GAME%', 'got', out);
  begin
    insert into public.crew_members (crew_id, game_key, entity_id, role, status, joined_at) values (crew_b, g1, ents[2], 'MEMBER', 'ACTIVE', now())
    on conflict (crew_id, entity_id) do update set status = 'ACTIVE', joined_at = now();
    out := 'inserted';
  exception when others then out := sqlstate;
  end;
  res := res || jsonb_build_object('step', 'ONE CREW PER GAME holds in the database itself (unique index)', 'pass', out = '23505', 'got', out);
  out := pg_temp.cr_run(users[2], 'authenticated', format('select public.respond_to_crew_invite(%L, false)', crew_b));
  res := res || jsonb_build_object('step', 'B declines C''s invitation; C is notified', 'pass', out = 'DECLINED' and pg_temp.cr_notes(users[3]) = 'crew.invite_declined@Other Crew', 'got', out);

  -- ===== remove / leave / cross-Crew protection =====
  out := pg_temp.cr_run(users[3], 'authenticated', format('select public.remove_crew_member(%L, ''zcr2'')', crew_a));
  res := res || jsonb_build_object('step', 'C cannot remove a member of A''s Crew', 'pass', out like 'ERR:42501:CREW_OWNER_ONLY%', 'got', out);
  out := pg_temp.cr_run(users[3], 'authenticated', format('select public.delete_crew(%L)', crew_a));
  res := res || jsonb_build_object('step', 'C cannot delete A''s Crew', 'pass', out like 'ERR:42501:CREW_OWNER_ONLY%', 'got', out);
  out := pg_temp.cr_run(users[2], 'authenticated', format('select public.delete_crew(%L)', crew_a));
  res := res || jsonb_build_object('step', 'a member cannot delete the Crew', 'pass', out like 'ERR:42501:CREW_OWNER_ONLY%', 'got', out);
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.leave_crew(%L)', crew_a));
  res := res || jsonb_build_object('step', 'the owner cannot leave (no orphaned Crew; V1 deletes instead)', 'pass', out like 'ERR:PT409:CREW_OWNER_CANNOT_LEAVE%', 'got', out);
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.remove_crew_member(%L, ''zcr1'')', crew_a));
  res := res || jsonb_build_object('step', 'the owner cannot remove themselves', 'pass', out like 'ERR:22023:CREW_OWNER_CANNOT_BE_REMOVED%', 'got', out);
  out := pg_temp.cr_run(users[2], 'authenticated', format('select public.leave_crew(%L)', crew_a));
  res := res || jsonb_build_object('step', 'B leaves; A is notified (crew.member_left)', 'pass', out = 'LEFT' and pg_temp.cr_notes(users[1]) like 'crew.member_left@Night Raiders,%', 'got', pg_temp.cr_notes(users[1]));
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.invite_to_crew(%L, ''zcr2'')', crew_a));
  out := pg_temp.cr_run(users[2], 'authenticated', format('select public.respond_to_crew_invite(%L, true)', crew_a));
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.remove_crew_member(%L, ''zcr2'')', crew_a));
  res := res || jsonb_build_object('step', 'A removes B; B is notified (crew.member_removed)', 'pass', out = 'REMOVED' and pg_temp.cr_notes(users[2]) like 'crew.member_removed@Night Raiders,%', 'got', pg_temp.cr_notes(users[2]));
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.invite_to_crew(%L, ''zcr2'')', crew_a));
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.cancel_crew_invite(%L, ''zcr2'')', crew_a));
  res := res || jsonb_build_object('step', 'A cancels an invitation; B is notified (crew.invite_cancelled)', 'pass', out = 'CANCELLED' and pg_temp.cr_notes(users[2]) like 'crew.invite_cancelled@Night Raiders,%', 'got', pg_temp.cr_notes(users[2]));

  -- ===== the 15-member limit =====
  -- 14 members join A's Crew: B and fillers 4..16 (C is skipped - C already owns another Crew of this game, so C correctly could not accept)
  foreach i in array array[2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] loop
    out := pg_temp.cr_run(users[1], 'authenticated', format('select public.invite_to_crew(%L, %L)', crew_a, format('zcr%s', i)));
    out := pg_temp.cr_run(users[i], 'authenticated', format('select public.respond_to_crew_invite(%L, true)', crew_a));
  end loop;
  select count(*) into cnt from public.crew_members m where m.crew_id = crew_a and m.status = 'ACTIVE';
  res := res || jsonb_build_object('step', '15 active members (owner + 14)', 'pass', cnt = 15, 'got', cnt);
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.invite_to_crew(%L, ''zcr17'')', crew_a));
  res := res || jsonb_build_object('step', 'a 16th cannot even be invited', 'pass', out like 'ERR:54000:CREW_FULL%', 'got', out);
  -- the limit also holds at acceptance: free a seat, invite, then the limit is lowered before the invitee accepts
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.remove_crew_member(%L, ''zcr16'')', crew_a));
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.invite_to_crew(%L, ''zcr17'')', crew_a));
  res := res || jsonb_build_object('step', 'with a seat free, the next invitation is allowed', 'pass', out = 'INVITED', 'got', out);
  update private.crew_policy set max_members = 14;   -- simulate a lower plan limit set after the invitation
  out := pg_temp.cr_run(users[17], 'authenticated', format('select public.respond_to_crew_invite(%L, true)', crew_a));
  res := res || jsonb_build_object('step', 'accepting re-checks the limit (no over-limit member)', 'pass', out like 'ERR:54000:CREW_FULL%', 'got', out);
  update private.crew_policy set max_members = 15;

  -- ===== privacy of notifications / forgery =====
  out := pg_temp.cr_run(users[3], 'authenticated', 'select count(*)::text from public.get_my_notifications(null, 50) n where n.type_key like ''crew.%'' and n.context->>''crew_name'' = ''Night Raiders''');
  res := res || jsonb_build_object('step', 'C (not involved in Night Raiders) has none of its notifications', 'pass', out = '0', 'got', out);
  out := pg_temp.cr_run(users[2], 'authenticated', 'select string_agg(n.notification_id::text, '','') from public.get_my_notifications(null, 50) n');
  out := pg_temp.cr_run(users[3], 'authenticated', format('select public.mark_my_notifications_read(array[%s]::bigint[])::text', out));
  res := res || jsonb_build_object('step', 'another user cannot mark B''s notifications read', 'pass', out = '0', 'got', out);
  out := pg_temp.cr_run(users[3], 'authenticated', format('select private.notify(%L, %L, ''crew.deleted'', null, ''{}''::jsonb)::text', ents[2], ents[3]));
  res := res || jsonb_build_object('step', 'a client cannot forge a Crew notification (the producer is server-only)', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.cr_run(users[3], 'authenticated', format('insert into public.notifications (recipient_entity_id, actor_entity_id, type_key) values (%L, %L, ''crew.deleted'') returning ''x''', ents[2], ents[3]));
  res := res || jsonb_build_object('step', 'a client cannot insert a notification', 'pass', out like 'ERR:42501:%', 'got', out);

  -- ===== realtime =====
  select count(*) into cnt from realtime.messages m where m.topic = 'identity:user:' || users[2] and m.event = 'crew_changed' and (m.payload - 'id') = '{"kind": "CREW"}'::jsonb and m.private;
  res := res || jsonb_build_object('step', 'membership changes wake the affected person''s page (private, data-free crew_changed)', 'pass', cnt > 0, 'got', cnt);

  -- ===== delete =====
  -- zcr17's invitation is still pending (accepting failed above)
  out := pg_temp.cr_run(users[1], 'authenticated', format('select public.delete_crew(%L)', crew_a));
  select count(*) into cnt from public.crew_members m where m.crew_id = crew_a;
  res := res || jsonb_build_object('step', 'deleting the Crew ends every membership and invitation', 'pass', out = 'DELETED' and cnt = 0 and not exists (select 1 from public.crews where crew_id = crew_a), 'got', cnt);
  res := res || jsonb_build_object('step', 'members get crew.deleted (with the name, after it is gone); the pending invitee gets crew.invite_cancelled; the owner nothing',
    'pass', pg_temp.cr_notes(users[5]) like 'crew.deleted@Night Raiders%' and pg_temp.cr_notes(users[17]) like 'crew.invite_cancelled@Night Raiders%' and pg_temp.cr_notes(users[1]) not like 'crew.deleted%',
    'got', pg_temp.cr_notes(users[5]) || ' / ' || pg_temp.cr_notes(users[17]));
  out := pg_temp.cr_run(users[5], 'authenticated', format('select public.create_crew(%L, %L)::text', g1, 'Fresh Start'));
  res := res || jsonb_build_object('step', 'after the delete, a former member is free to create / join a Crew for that game', 'pass', out not like 'ERR:%', 'got', out);
  out := pg_temp.cr_run(users[1], 'authenticated', 'select string_agg(c.crew_name, '','') from public.get_my_crews() c');
  res := res || jsonb_build_object('step', 'A''s other-game Crew (Zero) is untouched', 'pass', out = 'Zero', 'got', out);

  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
