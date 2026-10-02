-- My Crew V1 - Slice 2: Crew Mini Wall - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/crew-wall-db.sql
-- (Requires 20261003100000_my_crew and 20261003120000_crew_wall; to validate the migration BEFORE applying it, run it wrapped together with this file.)
-- Disposable users / identities only; ALWAYS raises TEST_RESULTS so everything rolls back. Real catalog games are used only as foreign-key targets.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ud uuid := gen_random_uuid(); ue uuid := gen_random_uuid();
  ent_b uuid; ent_c uuid; ent_e uuid;
  g1 text; crew_x uuid; crew_y uuid;
  out text; j jsonb; cnt integer; flag boolean; rev bigint; drafts_before integer; pubs_before integer; signals integer;
begin
  execute $fn$
    create function pg_temp.cw_run(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
    declare o text;
    begin
      perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
      execute 'set local role ' || p_role;
      begin execute p_sql into o; exception when others then o := 'ERR:' || sqlstate || ':' || sqlerrm; end;
      reset role;
      return o;
    end $f$;
  $fn$;
  execute $fn$
    create function pg_temp.cw_publish_gamid(p_uid uuid) returns void language plpgsql as $f$
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      set local role authenticated; perform public.set_my_identity_visibility(true); reset role;
    end $f$;
  $fn$;

  g1 := (select game_key from public.game_catalog where is_active order by game_key limit 1);
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'zcw-a@example.invalid', now()), (ub, 'zcw-b@example.invalid', now()), (uc, 'zcw-c@example.invalid', now()), (ud, 'zcw-d@example.invalid', now()), (ue, 'zcw-e@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zcwa', 'Wall A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zcwb', 'Wall B', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zcwc', 'Wall C', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zcwd', 'Wall D', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ue, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zcwe', 'Wall E', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zcwb';
  select e.entity_id into ent_c from public.entities e where e.gamid_handle = 'zcwc';
  select e.entity_id into ent_e from public.entities e where e.gamid_handle = 'zcwe';

  -- Crew X (owner A, member B, invitee C) and Crew Y (owner D, member E), same game
  crew_x := pg_temp.cw_run(ua, 'authenticated', format('select public.create_crew(%L, ''Espada'')::text', g1))::uuid;
  out := pg_temp.cw_run(ua, 'authenticated', format('select public.invite_to_crew(%L, ''zcwb'')', crew_x));
  out := pg_temp.cw_run(ub, 'authenticated', format('select public.respond_to_crew_invite(%L, true)', crew_x));
  out := pg_temp.cw_run(ua, 'authenticated', format('select public.invite_to_crew(%L, ''zcwc'')', crew_x));
  crew_y := pg_temp.cw_run(ud, 'authenticated', format('select public.create_crew(%L, ''Zero'')::text', g1))::uuid;
  out := pg_temp.cw_run(ud, 'authenticated', format('select public.invite_to_crew(%L, ''zcwe'')', crew_y));
  out := pg_temp.cw_run(ue, 'authenticated', format('select public.respond_to_crew_invite(%L, true)', crew_y));
  select count(*) into drafts_before from public.wall_drafts;
  select count(*) into pubs_before from public.wall_publications;

  -- ===== structure / privileges =====
  select bool_and(c.relrowsecurity) into flag from pg_class c where c.oid in ('public.crew_walls'::regclass, 'public.crew_wall_cards'::regclass, 'public.game_presentation'::regclass);
  res := res || jsonb_build_object('step', 'RLS on crew_walls, crew_wall_cards, game_presentation', 'pass', coalesce(flag, false));
  res := res || jsonb_build_object('step', 'no client role has any privilege on the Crew Wall tables',
    'pass', not (has_table_privilege('authenticated', 'public.crew_walls', 'select') or has_table_privilege('authenticated', 'public.crew_walls', 'update')
      or has_table_privilege('authenticated', 'public.crew_wall_cards', 'insert') or has_table_privilege('authenticated', 'public.crew_wall_cards', 'delete')
      or has_table_privilege('anon', 'public.crew_walls', 'select') or has_table_privilege('anon', 'public.crew_wall_cards', 'select')));
  res := res || jsonb_build_object('step', 'visitors (anon) can call ONLY get_public_crew_wall',
    'pass', has_function_privilege('anon', 'public.get_public_crew_wall(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.save_crew_wall(uuid, integer, jsonb, bigint)', 'execute') and not has_function_privilege('anon', 'public.get_my_crew_wall(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.set_crew_wall_published(uuid, boolean)', 'execute') and not has_function_privilege('anon', 'public.get_crew_wall_preview(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.get_crew_wall_usage(uuid)', 'execute'));

  -- ===== owner-only editing =====
  out := pg_temp.cw_run(ua, 'authenticated', format('select public.get_my_crew_wall(%L)::text', crew_x));
  j := out::jsonb;
  rev := (j ->> 'revision')::bigint;
  res := res || jsonb_build_object('step', 'the owner opens the Crew Wall: 1 stage of 2 allowed, unpublished, no cards', 'pass', (j ->> 'stage_count') = '1' and (j ->> 'stages_allowed') = '2' and (j ->> 'published') = 'false' and j -> 'cards' = '[]'::jsonb, 'got', j);
  out := pg_temp.cw_run(ub, 'authenticated', format('select public.get_my_crew_wall(%L)::text', crew_x));
  res := res || jsonb_build_object('step', 'a member cannot open the editor', 'pass', out like 'ERR:42501:CREW_OWNER_ONLY%', 'got', out);
  out := pg_temp.cw_run(ub, 'authenticated', format('select public.save_crew_wall(%L, 1, ''[]''::jsonb, %s)::text', crew_x, rev));
  res := res || jsonb_build_object('step', 'a member cannot save the Wall', 'pass', out like 'ERR:42501:CREW_OWNER_ONLY%', 'got', out);
  out := pg_temp.cw_run(ud, 'authenticated', format('select public.save_crew_wall(%L, 1, ''[]''::jsonb, %s)::text', crew_x, rev));
  res := res || jsonb_build_object('step', 'another Crew''s owner cannot save this Wall', 'pass', out like 'ERR:42501:CREW_OWNER_ONLY%', 'got', out);
  out := pg_temp.cw_run(null, 'anon', format('select public.save_crew_wall(%L, 1, ''[]''::jsonb, %s)::text', crew_x, rev));
  res := res || jsonb_build_object('step', 'a visitor cannot save the Wall', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.cw_run(ub, 'authenticated', format('select public.set_crew_wall_published(%L, true)::text', crew_x));
  res := res || jsonb_build_object('step', 'a member cannot publish', 'pass', out like 'ERR:42501:CREW_OWNER_ONLY%', 'got', out);
  out := pg_temp.cw_run(ua, 'authenticated', format('insert into public.crew_wall_cards (crew_id, entity_id, stage_no, position) values (%L, %L, 1, 0) returning ''x''', crew_x, ent_b));
  res := res || jsonb_build_object('step', 'not even the owner can write the tables directly', 'pass', out like 'ERR:42501:%', 'got', out);

  -- ===== the 2-stage allowance =====
  out := pg_temp.cw_run(ua, 'authenticated', format('select public.save_crew_wall(%L, 3, ''[]''::jsonb, %s)::text', crew_x, rev));
  res := res || jsonb_build_object('step', 'the stage allowance is server-authoritative: 3 stages are refused', 'pass', out like 'ERR:54000:CREW_WALL_STAGE_LIMIT%', 'got', out);
  out := pg_temp.cw_run(ua, 'authenticated', format('select public.save_crew_wall(%L, 2, %L::jsonb, %s)::text', crew_x,
    '[{"handle":"zcwa","stage":1,"position":0},{"handle":"zcwb","stage":2,"position":0}]', rev));
  res := res || jsonb_build_object('step', 'two stages with the owner on Stage 1 and B on Stage 2', 'pass', out not like 'ERR:%', 'got', out);
  rev := out::bigint;
  out := pg_temp.cw_run(ub, 'authenticated', format('select to_jsonb(u)::text from public.get_crew_wall_usage(%L) u', crew_x));
  res := res || jsonb_build_object('step', 'usage for Usage & Limits: 2 / 2 stages (a member can read it)', 'pass', out::jsonb = '{"stages_used": 2, "stages_allowed": 2}'::jsonb, 'got', out);
  out := pg_temp.cw_run(uc, 'authenticated', format('select to_jsonb(u)::text from public.get_crew_wall_usage(%L) u', crew_x));
  res := res || jsonb_build_object('step', 'an invitee cannot read the usage', 'pass', out like 'ERR:42501:CREW_MEMBERS_ONLY%', 'got', out);
  update private.crew_policy set wall_stage_allowance = 3;
  out := pg_temp.cw_run(ua, 'authenticated', format('select to_jsonb(u)::text from public.get_crew_wall_usage(%L) u', crew_x));
  res := res || jsonb_build_object('step', 'the allowance is read from ONE central place (raising it changes what the server allows)', 'pass', out::jsonb ->> 'stages_allowed' = '3', 'got', out);
  update private.crew_policy set wall_stage_allowance = 2;

  -- ===== only ACTIVE members of THIS Crew; no arbitrary data =====
  for out in select unnest(array[
      format('[{"handle":"zcwc","stage":1,"position":0}]'),                                    -- an invitee
      format('[{"handle":"zcwe","stage":1,"position":0}]'),                                    -- a member of ANOTHER Crew
      format('[{"handle":"nobody_zz","stage":1,"position":0}]')]) loop                         -- not a GamID
    res := res || jsonb_build_object('step', 'only an ACTIVE member of this Crew can be placed: ' || out,
      'pass', pg_temp.cw_run(ua, 'authenticated', format('select public.save_crew_wall(%L, 2, %L::jsonb, %s)::text', crew_x, out, rev)) like 'ERR:22023:CREW_WALL_NOT_A_MEMBER%');
  end loop;
  for out in select unnest(array[
      '[{"handle":"zcwb","stage":1,"position":0},{"handle":"zcwb","stage":2,"position":1}]',  -- the same member twice
      '[{"handle":"zcwb","stage":3,"position":0}]',                                          -- beyond the stage count
      '[{"handle":"zcwb","stage":1,"position":0,"url":"https://evil.example"}]',              -- any extra data (a link)
      '[{"handle":"zcwb","stage":1.5,"position":0}]',
      '{"handle":"zcwb"}']) loop
    res := res || jsonb_build_object('step', 'malformed / extra data is refused: ' || out,
      'pass', pg_temp.cw_run(ua, 'authenticated', format('select public.save_crew_wall(%L, 2, %L::jsonb, %s)::text', crew_x, out, rev)) like 'ERR:22023:INVALID_CREW_WALL_CARDS%');
  end loop;
  out := pg_temp.cw_run(ua, 'authenticated', format('select public.save_crew_wall(%L, 2, ''[]''::jsonb, %s)::text', crew_x, rev - 1));
  res := res || jsonb_build_object('step', 'a stale revision (another tab) is refused', 'pass', out like 'ERR:PT409:CREW_WALL_REVISION_CONFLICT%', 'got', out);
  begin
    insert into public.crew_wall_cards (crew_id, entity_id, stage_no, position) values (crew_x, ent_c, 1, 5);
    out := 'inserted';
  exception when others then out := sqlerrm;
  end;
  res := res || jsonb_build_object('step', 'the database itself refuses a card for an invitee', 'pass', out = 'CREW_WALL_NOT_A_MEMBER', 'got', out);
  begin
    insert into public.crew_wall_cards (crew_id, entity_id, stage_no, position) values (crew_x, ent_e, 1, 6);
    out := 'inserted';
  exception when others then out := sqlstate;
  end;
  res := res || jsonb_build_object('step', 'the database itself refuses a card for a GamID of another Crew', 'pass', out in ('23503', 'CREW_WALL_NOT_A_MEMBER') or out like '2%', 'got', out);

  -- ===== visitors =====
  out := pg_temp.cw_run(null, 'anon', format('select coalesce(public.get_public_crew_wall(%L)::text, ''none'')', crew_x));
  res := res || jsonb_build_object('step', 'an unpublished Crew Wall is not publicly readable', 'pass', out = 'none', 'got', out);
  out := pg_temp.cw_run(ua, 'authenticated', format('select public.set_crew_wall_published(%L, true)::text', crew_x));
  out := pg_temp.cw_run(null, 'anon', format('select public.get_public_crew_wall(%L)::text', crew_x));
  j := out::jsonb;
  res := res || jsonb_build_object('step', 'published: visitors get the Crew, game and stages - but no card of a member whose own GamID is not public',
    'pass', j ->> 'crew_name' = 'Espada' and (j ->> 'stage_count') = '2' and j -> 'cards' = '[]'::jsonb and j ->> 'owner_handle' is null, 'got', j);
  perform pg_temp.cw_publish_gamid(ua);
  perform pg_temp.cw_publish_gamid(ub);
  j := pg_temp.cw_run(null, 'anon', format('select public.get_public_crew_wall(%L)::text', crew_x))::jsonb;
  res := res || jsonb_build_object('step', 'members who published their GamID appear, in stage / position order', 'pass',
    (select string_agg((x ->> 'handle') || '@' || (x ->> 'stage'), ',') from jsonb_array_elements(j -> 'cards') x) = 'zcwa@1,zcwb@2' and j ->> 'owner_handle' = 'zcwa', 'got', j -> 'cards');
  select array_agg(distinct k order by k)::text into out from jsonb_array_elements(j -> 'cards') x, jsonb_object_keys(x) k;
  res := res || jsonb_build_object('step', 'a public card carries only handle, stage, position, role (no ids, email, private fields)', 'pass', out = '{handle,position,role,stage}', 'got', out);
  select array_agg(k order by k)::text into out from jsonb_object_keys(j) k;
  res := res || jsonb_build_object('step', 'the public Wall carries no private data', 'pass', out = '{accent_color,cards,crew_id,crew_name,game_key,game_name,member_count,owner_handle,published,stage_count}', 'got', out);
  out := pg_temp.cw_run(ub, 'authenticated', format('select public.get_crew_wall_preview(%L)::text', crew_x));
  res := res || jsonb_build_object('step', 'only the owner gets the (unpublished-capable) preview', 'pass', out like 'ERR:42501:CREW_OWNER_ONLY%', 'got', out);
  out := pg_temp.cw_run(null, 'anon', format('select coalesce(public.get_public_crew_wall(%L)::text, ''none'')', crew_y));
  res := res || jsonb_build_object('step', 'Crew Y (never published) stays private; Crews never mix', 'pass', out = 'none', 'got', out);

  -- ===== realtime =====
  select count(*) into signals from realtime.messages m where m.topic = 'identity:user:' || ub and m.event = 'crew_changed';
  out := pg_temp.cw_run(ua, 'authenticated', format('select public.set_crew_wall_published(%L, true)::text', crew_x));
  select count(*) into cnt from realtime.messages m where m.topic = 'identity:user:' || ub and m.event = 'crew_changed';
  res := res || jsonb_build_object('step', 'a Crew Wall change wakes the members'' open pages (private, data-free crew_changed)', 'pass', cnt > signals, 'got', jsonb_build_array(signals, cnt));

  -- ===== membership changes clean the Wall automatically =====
  out := pg_temp.cw_run(ub, 'authenticated', format('select public.leave_crew(%L)', crew_x));
  select count(*) into cnt from public.crew_wall_cards k where k.crew_id = crew_x and k.entity_id = ent_b;
  j := pg_temp.cw_run(null, 'anon', format('select public.get_public_crew_wall(%L)::text', crew_x))::jsonb;
  res := res || jsonb_build_object('step', 'B leaves: B''s placement is gone and the public Wall stops showing B immediately', 'pass', out = 'LEFT' and cnt = 0 and jsonb_array_length(j -> 'cards') = 1, 'got', j -> 'cards');

  -- ===== personal Wall isolation =====
  res := res || jsonb_build_object('step', 'no Crew Wall operation touched any personal Wall draft or publication',
    'pass', (select count(*) from public.wall_drafts) = drafts_before and (select count(*) from public.wall_publications) = pubs_before);
  out := pg_temp.cw_run(ua, 'authenticated', 'select (to_jsonb(d)->>''revision'') from public.ensure_my_wall_draft() d');
  out := pg_temp.cw_run(ua, 'authenticated', format('select public.save_my_wall_draft(''{"schemaVersion":1,"canvas":{"width":1000,"height":1778},"stages":[{"id":"s1","elements":[]}]}''::jsonb, %s)::text', out));
  j := pg_temp.cw_run(ua, 'authenticated', format('select public.get_my_crew_wall(%L)::text', crew_x))::jsonb;
  res := res || jsonb_build_object('step', 'saving the owner''s PERSONAL Wall does not change the Crew Wall', 'pass', (j ->> 'stage_count') = '2' and jsonb_array_length(j -> 'cards') = 1, 'got', j);

  -- ===== deletion =====
  out := pg_temp.cw_run(ua, 'authenticated', format('select public.delete_crew(%L)', crew_x));
  res := res || jsonb_build_object('step', 'deleting the Crew deletes its Wall and cards; the public route stops resolving',
    'pass', out = 'DELETED' and not exists (select 1 from public.crew_walls where crew_id = crew_x) and not exists (select 1 from public.crew_wall_cards where crew_id = crew_x)
      and pg_temp.cw_run(null, 'anon', format('select coalesce(public.get_public_crew_wall(%L)::text, ''none'')', crew_x)) = 'none');
  out := pg_temp.cw_run(null, 'anon', 'select coalesce(public.get_public_crew_wall(''00000000-0000-0000-0000-000000000000'')::text, ''none'')');
  res := res || jsonb_build_object('step', 'an unknown Crew id resolves to nothing', 'pass', out = 'none', 'got', out);

  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
