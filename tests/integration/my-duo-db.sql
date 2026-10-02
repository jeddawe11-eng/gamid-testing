-- My Duo V1 - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/my-duo-db.sql
-- (Requires migration 20261002150000_my_duo. To validate the migration BEFORE applying it, run the migration's content and this file's content wrapped together:
--  everything rolls back either way.)
--
-- Uses ONLY disposable auth users / identities created inside the transaction, impersonates anon / authenticated exactly as PostgREST does, and ALWAYS raises an
-- exception carrying the results, so the whole transaction rolls back and nothing (no real identity such as @black or @zshot, no relationship) is persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ud uuid := gen_random_uuid();
  ent_a uuid; ent_b uuid; ent_c uuid; ent_d uuid;
  out text; flag boolean; cnt integer;
begin
  execute $fn$
    create function pg_temp.dt_run(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
    declare o text; det text;
    begin
      perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
      execute 'set local role ' || p_role;
      begin
        execute p_sql into o;
      exception when others then
        get stacked diagnostics det = pg_exception_detail;
        o := 'ERR:' || sqlstate || ':' || sqlerrm || case when det is not null then ':' || det else '' end;
      end;
      reset role;
      return o;
    end $f$;
  $fn$;
  -- the caller's Duo state as compact text: relation:handle:published:show, ... in the function's own order
  execute $fn$
    create function pg_temp.dt_state(p_uid uuid) returns text language sql as $f$
      select pg_temp.dt_run(p_uid, 'authenticated', 'select coalesce(string_agg(d.relation || '':'' || d.gamid_handle || '':'' || d.is_published || '':'' || d.show_public, '','' order by d.relation), ''none'') from public.get_my_duo() d')
    $f$;
  $fn$;
  -- the public 'duo' section of a handle ('none' when absent)
  execute $fn$
    create function pg_temp.dt_public(p_handle text) returns text language sql as $f$
      select pg_temp.dt_run(null, 'anon', format('select coalesce((select (i.public_sections -> ''duo'' ->> ''gamid_handle'') from public.get_public_identity(%L) i), ''none'')', p_handle))
    $f$;
  $fn$;
  execute $fn$
    create function pg_temp.dt_publish(p_uid uuid, p_public boolean) returns void language plpgsql as $f$
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      set local role authenticated; perform public.set_my_identity_visibility(p_public); reset role;
    end $f$;
  $fn$;

  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'zdu-a@example.invalid', now()), (ub, 'zdu-b@example.invalid', now()), (uc, 'zdu-c@example.invalid', now()), (ud, 'zdu-d@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zdua', 'Duo A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zdub', 'Duo B', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zduc', 'Duo C', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zdud', 'Duo D', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zdua';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zdub';
  select e.entity_id into ent_c from public.entities e where e.gamid_handle = 'zduc';
  select e.entity_id into ent_d from public.entities e where e.gamid_handle = 'zdud';

  -- ===== structure and privileges =====
  select relrowsecurity into flag from pg_class where oid = 'public.identity_relationships'::regclass;
  res := res || jsonb_build_object('step', 'RLS is enabled on identity_relationships', 'pass', coalesce(flag, false));
  res := res || jsonb_build_object('step', 'no client role has any table privilege on identity_relationships (RPC-only)',
    'pass', not (has_table_privilege('anon', 'public.identity_relationships', 'select') or has_table_privilege('authenticated', 'public.identity_relationships', 'select')
      or has_table_privilege('authenticated', 'public.identity_relationships', 'insert') or has_table_privilege('authenticated', 'public.identity_relationships', 'update')
      or has_table_privilege('authenticated', 'public.identity_relationships', 'delete')));
  res := res || jsonb_build_object('step', 'owner RPCs are authenticated-only (anon cannot call any of them)',
    'pass', has_function_privilege('authenticated', 'public.get_my_duo()', 'execute') and has_function_privilege('authenticated', 'public.send_duo_request(text, boolean)', 'execute')
      and has_function_privilege('authenticated', 'public.respond_to_duo_request(text, boolean, boolean)', 'execute') and has_function_privilege('authenticated', 'public.set_my_duo_visibility(boolean)', 'execute')
      and not has_function_privilege('anon', 'public.get_my_duo()', 'execute') and not has_function_privilege('anon', 'public.search_duo_candidates(text)', 'execute')
      and not has_function_privilege('anon', 'public.send_duo_request(text, boolean)', 'execute') and not has_function_privilege('anon', 'public.respond_to_duo_request(text, boolean, boolean)', 'execute')
      and not has_function_privilege('anon', 'public.cancel_duo_request(text)', 'execute') and not has_function_privilege('anon', 'public.remove_my_duo()', 'execute')
      and not has_function_privilege('anon', 'public.set_my_duo_visibility(boolean)', 'execute'));
  res := res || jsonb_build_object('step', 'internal helpers are not callable by any client role',
    'pass', not has_function_privilege('authenticated', 'private.identity_entity_by_handle(text)', 'execute') and not has_function_privilege('authenticated', 'private.identity_lock_pair(uuid, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.identity_my_entity()', 'execute'));
  select count(*) into cnt from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('get_my_duo', 'search_duo_candidates', 'send_duo_request', 'respond_to_duo_request', 'cancel_duo_request', 'remove_my_duo', 'set_my_duo_visibility') and p.prosecdef;
  res := res || jsonb_build_object('step', 'public wrappers are SECURITY INVOKER', 'pass', cnt = 0);
  select count(*) into cnt from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'private' and p.proname in ('get_my_duo_impl', 'search_duo_candidates_impl', 'send_duo_request_impl', 'respond_to_duo_request_impl', 'cancel_duo_request_impl', 'remove_my_duo_impl', 'set_my_duo_visibility_impl')
     and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""');
  res := res || jsonb_build_object('step', 'private implementations are SECURITY DEFINER with a fixed empty search_path', 'pass', cnt = 7);
  out := pg_temp.dt_run(ua, 'authenticated', 'select count(*)::text from public.identity_relationships');
  res := res || jsonb_build_object('step', 'a signed-in user cannot read relationships directly', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', format('insert into public.identity_relationships (kind, requester_entity_id, addressee_entity_id, status, accepted_at) values (''DUO'', %L, %L, ''ACCEPTED'', now()) returning ''x''', ent_a, ent_b));
  res := res || jsonb_build_object('step', 'a signed-in user cannot write a relationship directly (no forged acceptance)', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.dt_run(null, 'anon', 'select public.send_duo_request(''zdub'')');
  res := res || jsonb_build_object('step', 'anon cannot send a request', 'pass', out like 'ERR:42501:%', 'got', out);

  -- ===== searching and requesting =====
  out := pg_temp.dt_run(ua, 'authenticated', 'select string_agg(c.gamid_handle || '':'' || c.is_published, '','' order by c.gamid_handle) from public.search_duo_candidates(''zdu'') c');
  res := res || jsonb_build_object('step', 'search finds other GamIDs, published or not, never the caller', 'pass', out = 'zdub:false,zduc:false,zdud:false', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', 'select count(*)::text from public.search_duo_candidates(''zd'')');
  res := res || jsonb_build_object('step', 'search needs 3 characters', 'pass', out like 'ERR:22023:SEARCH_TOO_SHORT%', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.send_duo_request(''zdua'')');
  res := res || jsonb_build_object('step', 'no self-Duo', 'pass', out like 'ERR:22023:DUO_SELF%', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.send_duo_request(''zdu-nobody'')');
  res := res || jsonb_build_object('step', 'a Duo must be a real GamID', 'pass', out like 'ERR:P0002:GAMID_NOT_FOUND%', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.send_duo_request(''@ZDUB'')');
  res := res || jsonb_build_object('step', 'A requests B (B is not published; @ and case are normalized)', 'pass', out = 'SENT', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.send_duo_request(''zdub'')');
  res := res || jsonb_build_object('step', 'the same request twice is refused', 'pass', out like 'ERR:PT409:DUO_REQUEST_ALREADY_SENT%', 'got', out);
  out := pg_temp.dt_run(ub, 'authenticated', 'select public.send_duo_request(''zdua'')');
  res := res || jsonb_build_object('step', 'B cannot cross-request A while A''s request waits (accept it instead)', 'pass', out like 'ERR:PT409:DUO_REQUEST_FROM_THEM%', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.send_duo_request(''zduc'')');
  res := res || jsonb_build_object('step', 'one outgoing request at a time', 'pass', out like 'ERR:PT409:DUO_REQUEST_PENDING%', 'got', out);
  res := res || jsonb_build_object('step', 'A sees SENT to B; B sees RECEIVED from A', 'pass', pg_temp.dt_state(ua) = 'SENT:zdub:false:false' and pg_temp.dt_state(ub) = 'RECEIVED:zdua:false:false',
    'got', pg_temp.dt_state(ua) || ' / ' || pg_temp.dt_state(ub));
  out := pg_temp.dt_run(uc, 'authenticated', 'select public.respond_to_duo_request(''zdua'', true)');
  res := res || jsonb_build_object('step', 'nobody else can accept a request addressed to B', 'pass', out like 'ERR:P0002:DUO_REQUEST_NOT_FOUND%', 'got', out);
  out := pg_temp.dt_run(uc, 'authenticated', 'select public.cancel_duo_request(''zdub'')');
  res := res || jsonb_build_object('step', 'nobody else can cancel A''s request', 'pass', out like 'ERR:P0002:DUO_REQUEST_NOT_FOUND%', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.respond_to_duo_request(''zdub'', true)');
  res := res || jsonb_build_object('step', 'the requester cannot accept their own request', 'pass', out like 'ERR:P0002:DUO_REQUEST_NOT_FOUND%', 'got', out);

  -- ===== acceptance =====
  out := pg_temp.dt_run(ub, 'authenticated', 'select public.respond_to_duo_request(''zdua'', true)');
  res := res || jsonb_build_object('step', 'B accepts: A and B are each other''s Duo', 'pass', out = 'ACCEPTED' and pg_temp.dt_state(ua) = 'DUO:zdub:false:false' and pg_temp.dt_state(ub) = 'DUO:zdua:false:false',
    'got', out || ' ' || pg_temp.dt_state(ua) || ' / ' || pg_temp.dt_state(ub));
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.send_duo_request(''zdub'')');
  res := res || jsonb_build_object('step', 'requesting your current Duo again is refused', 'pass', out like 'ERR:PT409:DUO_ALREADY_YOURS%', 'got', out);

  -- ===== public display =====
  perform pg_temp.dt_publish(ua, true);
  res := res || jsonb_build_object('step', 'public display is OFF by default for a new Duo', 'pass', pg_temp.dt_public('zdua') = 'none', 'got', pg_temp.dt_public('zdua'));
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.set_my_duo_visibility(true)::text');
  res := res || jsonb_build_object('step', 'A turns on Show My Duo', 'pass', out = 'true' and pg_temp.dt_state(ua) = 'DUO:zdub:false:true' and pg_temp.dt_state(ub) = 'DUO:zdua:true:false',
    'got', out || ' ' || pg_temp.dt_state(ua) || ' / ' || pg_temp.dt_state(ub));
  res := res || jsonb_build_object('step', 'while B''s GamID is not published, A''s public GamID shows no Duo', 'pass', pg_temp.dt_public('zdua') = 'none', 'got', pg_temp.dt_public('zdua'));
  perform pg_temp.dt_publish(ub, true);
  res := res || jsonb_build_object('step', 'once B publishes, A''s public GamID shows B as My Duo', 'pass', pg_temp.dt_public('zdua') = 'zdub', 'got', pg_temp.dt_public('zdua'));
  out := pg_temp.dt_run(null, 'anon', 'select (select string_agg(k, '','' order by k) from public.get_public_identity(''zdua'') i, jsonb_object_keys(i.public_sections -> ''duo'') k)');
  res := res || jsonb_build_object('step', 'the public Duo carries only @handle and display name (+ avatar path when there is one)', 'pass', out = 'display_name,gamid_handle', 'got', out);
  res := res || jsonb_build_object('step', 'B''s own switch is independent: B''s public GamID shows no Duo', 'pass', pg_temp.dt_public('zdub') = 'none', 'got', pg_temp.dt_public('zdub'));
  perform pg_temp.dt_publish(ub, false);
  res := res || jsonb_build_object('step', 'B unpublishes: A''s public Duo disappears, the relationship stays', 'pass', pg_temp.dt_public('zdua') = 'none' and pg_temp.dt_state(ua) = 'DUO:zdub:false:true',
    'got', pg_temp.dt_public('zdua') || ' ' || pg_temp.dt_state(ua));
  perform pg_temp.dt_publish(ub, true);
  res := res || jsonb_build_object('step', 'B publishes again: the Duo is back on A''s GamID', 'pass', pg_temp.dt_public('zdua') = 'zdub', 'got', pg_temp.dt_public('zdua'));

  -- ===== a pending request never removes the current Duo; accepting replaces it (with confirmation) =====
  out := pg_temp.dt_run(uc, 'authenticated', 'select public.send_duo_request(''zdua'')');
  res := res || jsonb_build_object('step', 'C (no Duo) requests A (who has B)', 'pass', out = 'SENT', 'got', out);
  res := res || jsonb_build_object('step', 'the pending request leaves A''s Duo B in place', 'pass', pg_temp.dt_state(ua) = 'DUO:zdub:true:true,RECEIVED:zduc:false:false' and pg_temp.dt_public('zdua') = 'zdub',
    'got', pg_temp.dt_state(ua));
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.respond_to_duo_request(''zduc'', true)');
  res := res || jsonb_build_object('step', 'A cannot accept without confirming the replacement', 'pass', out like 'ERR:PT409:DUO_REPLACE_CONFIRMATION_REQUIRED%' and pg_temp.dt_state(ua) like 'DUO:zdub%', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.respond_to_duo_request(''zduc'', true, true)');
  res := res || jsonb_build_object('step', 'A confirms: C is A''s Duo, B''s Duo with A ended automatically', 'pass', out = 'ACCEPTED' and pg_temp.dt_state(ua) = 'DUO:zduc:false:false' and pg_temp.dt_state(ub) = 'none' and pg_temp.dt_state(uc) = 'DUO:zdua:true:false',
    'got', out || ' ' || pg_temp.dt_state(ua) || ' / ' || pg_temp.dt_state(ub) || ' / ' || pg_temp.dt_state(uc));
  res := res || jsonb_build_object('step', 'the new Duo starts hidden (the old ON is not inherited)', 'pass', pg_temp.dt_public('zdua') = 'none', 'got', pg_temp.dt_public('zdua'));

  -- the REQUESTER's previous Duo ends too: B gets D as Duo; C (Duo A) requests B with confirmation; B (Duo D) accepts with confirmation
  out := pg_temp.dt_run(ub, 'authenticated', 'select public.send_duo_request(''zdud'')');
  out := pg_temp.dt_run(ud, 'authenticated', 'select public.respond_to_duo_request(''zdub'', true)');
  res := res || jsonb_build_object('step', 'B and D become Duo (D had none, no confirmation needed)', 'pass', out = 'ACCEPTED' and pg_temp.dt_state(ub) = 'DUO:zdud:false:false', 'got', out);
  out := pg_temp.dt_run(uc, 'authenticated', 'select public.send_duo_request(''zdub'')');
  res := res || jsonb_build_object('step', 'C, who has a Duo, must confirm before requesting', 'pass', out like 'ERR:PT409:DUO_REPLACE_CONFIRMATION_REQUIRED%', 'got', out);
  out := pg_temp.dt_run(uc, 'authenticated', 'select public.send_duo_request(''zdub'', true)');
  res := res || jsonb_build_object('step', 'C confirms and requests B; C''s Duo A stays while pending', 'pass', out = 'SENT' and pg_temp.dt_state(uc) = 'DUO:zdua:true:false,SENT:zdub:true:false', 'got', out || ' ' || pg_temp.dt_state(uc));
  out := pg_temp.dt_run(ub, 'authenticated', 'select public.respond_to_duo_request(''zduc'', true, true)');
  res := res || jsonb_build_object('step', 'B accepts C: B-C is the Duo; A-C and B-D both ended in the same step',
    'pass', out = 'ACCEPTED' and pg_temp.dt_state(ub) = 'DUO:zduc:false:false' and pg_temp.dt_state(uc) = 'DUO:zdub:true:false' and pg_temp.dt_state(ua) = 'none' and pg_temp.dt_state(ud) = 'none',
    'got', out || ' ' || pg_temp.dt_state(ua) || ' / ' || pg_temp.dt_state(ub) || ' / ' || pg_temp.dt_state(uc) || ' / ' || pg_temp.dt_state(ud));
  select count(*) into cnt from (
    select x.entity_id from public.identity_relationships r, lateral (values (r.requester_entity_id), (r.addressee_entity_id)) x(entity_id)
    where r.kind = 'DUO' and r.status = 'ACCEPTED' and x.entity_id in (ent_a, ent_b, ent_c, ent_d) group by x.entity_id having count(*) > 1) t;
  res := res || jsonb_build_object('step', 'no GamID is ever in two accepted Duos', 'pass', cnt = 0);

  -- defense in depth: even a backend write cannot create a second accepted Duo for B
  begin
    insert into public.identity_relationships (kind, requester_entity_id, addressee_entity_id, status, accepted_at) values ('DUO', ent_b, ent_d, 'ACCEPTED', now());   -- B is the addressee of B-C, the requester here: only the cross-column trigger can catch it
    out := 'inserted';
  exception when others then out := sqlstate || ':' || sqlerrm;
  end;
  res := res || jsonb_build_object('step', 'the database itself refuses a second accepted Duo (B on the other side)', 'pass', out = '23505:DUO_ALREADY_ACCEPTED', 'got', out);
  begin
    insert into public.identity_relationships (kind, requester_entity_id, addressee_entity_id) values ('DUO', ent_a, ent_a);
    out := 'inserted';
  exception when others then out := sqlstate;
  end;
  res := res || jsonb_build_object('step', 'the database itself refuses a self-relationship', 'pass', out = '23514', 'got', out);

  -- ===== decline, cancel, remove, switch without a Duo =====
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.set_my_duo_visibility(true)::text');
  res := res || jsonb_build_object('step', 'Show My Duo needs a Duo', 'pass', out like 'ERR:P0002:DUO_NOT_SET%', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.send_duo_request(''zdud'')');
  out := pg_temp.dt_run(ud, 'authenticated', 'select public.respond_to_duo_request(''zdua'', false)');
  res := res || jsonb_build_object('step', 'D declines A''s request: it is gone, nothing else changes', 'pass', out = 'DECLINED' and pg_temp.dt_state(ua) = 'none' and pg_temp.dt_state(ud) = 'none', 'got', out);
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.send_duo_request(''zdud'')');
  out := pg_temp.dt_run(ua, 'authenticated', 'select public.cancel_duo_request(''zdud'')');
  res := res || jsonb_build_object('step', 'A cancels their own request', 'pass', out = 'CANCELLED' and pg_temp.dt_state(ud) = 'none', 'got', out);
  out := pg_temp.dt_run(uc, 'authenticated', 'select public.remove_my_duo()::text');
  res := res || jsonb_build_object('step', 'either participant ends the Duo for both', 'pass', out = 'true' and pg_temp.dt_state(ub) = 'none' and pg_temp.dt_state(uc) = 'none', 'got', out);
  out := pg_temp.dt_run(uc, 'authenticated', 'select public.remove_my_duo()::text');
  res := res || jsonb_build_object('step', 'removing when there is no Duo is a harmless no-op', 'pass', out = 'false', 'got', out);

  -- ===== Wall: the duo block =====
  res := res || jsonb_build_object('step', 'a Wall gamid block "duo" is valid',
    'pass', cardinality(private.wall_element_payload_errors('gamid', '{"block": "duo", "layout": "card"}'::jsonb)) = 0);
  res := res || jsonb_build_object('step', 'unknown blocks are still refused',
    'pass', private.wall_element_payload_errors('gamid', '{"block": "team"}'::jsonb) = array['INVALID_BLOCK']);

  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
