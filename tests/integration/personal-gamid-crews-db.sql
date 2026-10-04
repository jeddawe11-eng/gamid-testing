-- My Crew on the Personal GamID (20261003234309_personal_gamid_crews) - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/personal-gamid-crews-db.sql
-- The public identity (get_public_identity / get_public_identity_by_qr) carries a 'crews' section ONLY for: a PUBLIC GamID, an ACTIVE membership, an existing Crew,
-- a PUBLISHED Crew Wall - automatically, no toggle. Disposable users / identities only; ALWAYS raises TEST_RESULTS so everything rolls back.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ud uuid := gen_random_uuid();
  g1 text; g2 text; crew_x uuid; crew_y uuid; crew_z uuid; rev bigint;
  out text; j jsonb; flag boolean;
begin
  execute $fn$
    create function pg_temp.pc_run(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
    declare o text;
    begin
      perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
      execute 'set local role ' || p_role;
      begin execute p_sql into o; exception when others then o := 'ERR:' || sqlstate || ':' || sqlerrm; end;
      reset role;
      return o;
    end $f$;
  $fn$;
  -- what an anonymous visitor gets as the 'crews' section of a handle ('none' when absent, 'no-gamid' when the GamID itself is not public)
  execute $fn$
    create function pg_temp.pc_crews(p_handle text) returns jsonb language sql as $f$
      select coalesce((select coalesce(i.public_sections -> 'crews', '"none"'::jsonb) from public.get_public_identity(p_handle) i), '"no-gamid"'::jsonb)
    $f$;
  $fn$;
  execute $fn$
    create function pg_temp.pc_publish_gamid(p_uid uuid, p_public boolean) returns void language plpgsql as $f$
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      set local role authenticated; perform public.set_my_identity_visibility(p_public); reset role;
    end $f$;
  $fn$;
  execute $fn$
    create function pg_temp.pc_wall(p_uid uuid, p_crew uuid, p_published boolean) returns text language sql as $f$
      select pg_temp.pc_run(p_uid, 'authenticated', format('select public.set_crew_wall_published(%L, %L::boolean)::text', p_crew, p_published::text))
    $f$;
  $fn$;

  g1 := (select game_key from public.game_catalog where is_active order by game_key limit 1);
  g2 := (select game_key from public.game_catalog where is_active order by game_key offset 1 limit 1);
  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zpc-a@example.invalid', now()), (ub, 'zpc-b@example.invalid', now()), (uc, 'zpc-c@example.invalid', now()), (ud, 'zpc-d@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zpca', 'Pc A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zpcb', 'Pc B', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zpcc', 'Pc C', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zpcd', 'Pc D', date '1990-01-01', 'en'); reset role;

  -- A owns X (game 1) with B active and C invited; B owns Y (game 2); D owns Z (game 1, never published)
  crew_x := pg_temp.pc_run(ua, 'authenticated', format('select public.create_crew(%L, ''Espada'')::text', g1))::uuid;
  out := pg_temp.pc_run(ua, 'authenticated', format('select public.invite_to_crew(%L, ''zpcb'')', crew_x));
  out := pg_temp.pc_run(ub, 'authenticated', format('select public.respond_to_crew_invite(%L, true)', crew_x));
  out := pg_temp.pc_run(ua, 'authenticated', format('select public.invite_to_crew(%L, ''zpcc'')', crew_x));
  crew_y := pg_temp.pc_run(ub, 'authenticated', format('select public.create_crew(%L, ''Zero'')::text', g2))::uuid;
  crew_z := pg_temp.pc_run(ud, 'authenticated', format('select public.create_crew(%L, ''Hidden'')::text', g1))::uuid;

  -- ===== the gates =====
  res := res || jsonb_build_object('step', 'a GamID that is not PUBLIC exposes nothing (the accepted outer gate)', 'pass', pg_temp.pc_crews('zpca') = '"no-gamid"'::jsonb, 'got', pg_temp.pc_crews('zpca'));
  perform pg_temp.pc_publish_gamid(ua, true); perform pg_temp.pc_publish_gamid(ub, true); perform pg_temp.pc_publish_gamid(uc, true); perform pg_temp.pc_publish_gamid(ud, true);
  res := res || jsonb_build_object('step', 'PUBLIC GamID + ACTIVE membership but the Crew Wall is not published: no crews section', 'pass', pg_temp.pc_crews('zpca') = '"none"'::jsonb, 'got', pg_temp.pc_crews('zpca'));
  out := pg_temp.pc_wall(ua, crew_x, true);
  j := pg_temp.pc_crews('zpca');
  res := res || jsonb_build_object('step', 'the Crew Wall is published: the owner''s GamID shows the Crew automatically (no toggle), role OWNER, 2 active members (the invitee is not counted)',
    'pass', jsonb_array_length(j) = 1 and j -> 0 ->> 'crew_name' = 'Espada' and j -> 0 ->> 'role' = 'OWNER' and (j -> 0 ->> 'member_count')::integer = 2 and j -> 0 ->> 'crew_id' = crew_x::text and j -> 0 ->> 'game_key' = g1, 'got', j);
  j := pg_temp.pc_crews('zpcb');
  res := res || jsonb_build_object('step', 'an ACTIVE member''s GamID shows it too, role MEMBER', 'pass', jsonb_array_length(j) = 1 and j -> 0 ->> 'role' = 'MEMBER' and j -> 0 ->> 'crew_name' = 'Espada', 'got', j);
  res := res || jsonb_build_object('step', 'an INVITED (not yet active) GamID shows nothing', 'pass', pg_temp.pc_crews('zpcc') = '"none"'::jsonb, 'got', pg_temp.pc_crews('zpcc'));
  res := res || jsonb_build_object('step', 'a never-published Crew stays off its owner''s GamID', 'pass', pg_temp.pc_crews('zpcd') = '"none"'::jsonb, 'got', pg_temp.pc_crews('zpcd'));

  -- ===== exact public fields =====
  j := pg_temp.pc_crews('zpca');
  select array_agg(k order by k)::text into out from jsonb_object_keys(j -> 0) k;
  res := res || jsonb_build_object('step', 'each entry carries ONLY crew_id, crew_name, game_key, game_name, role, member_count (no member list, invitations, owner or internal ids)',
    'pass', out = '{crew_id,crew_name,game_key,game_name,member_count,role}', 'got', out);
  res := res || jsonb_build_object('step', 'no other GamID''s handle and no invitation appear anywhere in the section', 'pass', position('zpcb' in j::text) = 0 and position('zpcc' in j::text) = 0 and position('INVITED' in j::text) = 0);

  -- ===== multiple Crews across games =====
  out := pg_temp.pc_wall(ub, crew_y, true);
  j := pg_temp.pc_crews('zpcb');
  res := res || jsonb_build_object('step', 'B is in two Crews of two games: both appear, each with its own role, ordered by game',
    'pass', jsonb_array_length(j) = 2 and (select bool_and(true) from jsonb_array_elements(j) x)
      and (select string_agg((x ->> 'crew_name') || ':' || (x ->> 'role'), ',' order by x ->> 'game_name') from jsonb_array_elements(j) x) in ('Espada:MEMBER,Zero:OWNER', 'Zero:OWNER,Espada:MEMBER')
      and (j -> 0 ->> 'game_name') <= (j -> 1 ->> 'game_name'), 'got', j);

  -- ===== QR route delegates =====
  select q.public_token into out from public.qr_references q join public.entities e on e.entity_id = q.entity_id where e.gamid_handle = 'zpca';
  out := pg_temp.pc_run(null, 'anon', format('select coalesce((i.public_sections -> ''crews'')::text, ''null'') from public.get_public_identity_by_qr(%L) i', out));
  res := res || jsonb_build_object('step', 'the QR route returns the same section (one implementation)', 'pass', out::jsonb = pg_temp.pc_crews('zpca'), 'got', out);

  -- ===== changes take effect immediately =====
  out := pg_temp.pc_wall(ua, crew_x, false);
  res := res || jsonb_build_object('step', 'unpublishing the Crew Wall removes it from every member''s GamID at once', 'pass', pg_temp.pc_crews('zpca') = '"none"'::jsonb and jsonb_array_length(pg_temp.pc_crews('zpcb')) = 1, 'got', pg_temp.pc_crews('zpcb'));
  out := pg_temp.pc_wall(ua, crew_x, true);
  out := pg_temp.pc_run(ub, 'authenticated', format('select public.leave_crew(%L)', crew_x));
  j := pg_temp.pc_crews('zpca');
  res := res || jsonb_build_object('step', 'B leaves: Espada disappears from B''s GamID and its member count drops on A''s', 'pass', (j -> 0 ->> 'member_count')::integer = 1
    and (select count(*) from jsonb_array_elements(pg_temp.pc_crews('zpcb')) x where x ->> 'crew_name' = 'Espada') = 0, 'got', jsonb_build_array(j, pg_temp.pc_crews('zpcb')));
  perform pg_temp.pc_publish_gamid(ua, false);
  res := res || jsonb_build_object('step', 'the owner unpublishes their GamID: nothing about them is public', 'pass', pg_temp.pc_crews('zpca') = '"no-gamid"'::jsonb);
  perform pg_temp.pc_publish_gamid(ua, true);
  out := pg_temp.pc_run(ua, 'authenticated', format('select public.delete_crew(%L)', crew_x));
  res := res || jsonb_build_object('step', 'a deleted Crew leaves no trace on the GamID', 'pass', pg_temp.pc_crews('zpca') = '"none"'::jsonb, 'got', pg_temp.pc_crews('zpca'));

  -- ===== the rest of the public boundary is unchanged =====
  select p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""') into flag from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'private' and p.proname = 'get_public_identity_impl';
  res := res || jsonb_build_object('step', 'the implementation is still SECURITY DEFINER with a fixed empty search_path', 'pass', coalesce(flag, false));
  res := res || jsonb_build_object('step', 'grants unchanged: anon may call the public identity functions, not the private Crew tables',
    'pass', has_function_privilege('anon', 'public.get_public_identity(text)', 'execute') and has_function_privilege('anon', 'public.get_public_identity_by_qr(text)', 'execute')
      and not has_table_privilege('anon', 'public.crew_members', 'select') and not has_table_privilege('anon', 'public.crews', 'select'));
  out := pg_temp.pc_run(null, 'anon', 'select (select string_agg(k, '','' order by k) from public.get_public_identity(''zpcb'') i, jsonb_object_keys(i.public_sections) k)');
  res := res || jsonb_build_object('step', 'a GamID with nothing else public has only its crews section (no empty Discord / Steam / League / My Games / Duo sections appear)', 'pass', out = 'crews', 'got', out);

  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
