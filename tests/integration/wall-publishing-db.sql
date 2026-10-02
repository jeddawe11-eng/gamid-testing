-- Public Wall publishing - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/wall-publishing-db.sql
-- (Requires migration 20261002120000_wall_public_publishing. To validate the migration BEFORE applying it, run the migration's content and this file's content
--  wrapped together: everything rolls back either way.)
--
-- Uses ONLY disposable auth users / identities / storage rows created inside the transaction, impersonates anon / authenticated exactly as PostgREST does, and
-- ALWAYS raises an exception carrying the results, so the whole transaction rolls back and nothing (no real identity such as @black or @zshot, no Wall, no
-- publication, no storage row) is touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  ent_a uuid; ent_b uuid;
  pic uuid := gen_random_uuid(); vid uuid := gen_random_uuid(); unused uuid := gen_random_uuid();
  pic_path text; vid_path text; unused_path text;
  out text; j jsonb; rev bigint; rev2 bigint; flag boolean; cnt integer;
  doc_one jsonb; doc_two jsonb;
begin
  execute $fn$
    create function pg_temp.wp_run(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
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

  select count(*) into cnt from public.wall_publications w join public.entities e on e.entity_id = w.entity_id where e.gamid_handle like 'zwp%';
  res := res || jsonb_build_object('step', 'no publication exists for the disposable identities before the test', 'pass', cnt = 0);

  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zwp-a@example.invalid', now()), (ub, 'zwp-b@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zwpa', 'Pub A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zwpb', 'Pub B', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zwpa';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zwpb';

  -- three of A's assets (a picture and a video the Wall uses, and a picture it does not), with their stored objects
  pic_path := ua::text || '/' || pic::text || '.png';
  vid_path := ua::text || '/' || vid::text || '.mp4';
  unused_path := ua::text || '/' || unused::text || '.png';
  insert into storage.objects (bucket_id, name, owner_id, metadata) values
    ('wall-media', pic_path, ua::text, '{"size": 1000}'), ('wall-video', vid_path, ua::text, '{"size": 4000000}'), ('wall-media', unused_path, ua::text, '{"size": 1000}');
  insert into public.wall_assets (asset_id, entity_id, storage_path, mime_type, byte_size, width, height) values
    (pic, ent_a, pic_path, 'image/png', 1000, 100, 100), (vid, ent_a, vid_path, 'video/mp4', 4000000, 1920, 1080), (unused, ent_a, unused_path, 'image/png', 1000, 100, 100);
  doc_one := jsonb_build_object('schemaVersion', 1, 'canvas', jsonb_build_object('width', 1000, 'height', 1778), 'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'elements', jsonb_build_array(
    jsonb_build_object('id', 'p', 'type', 'image', 'x', 0, 'y', 0, 'width', 400, 'height', 400, 'z', 0, 'payload', jsonb_build_object('assetId', pic::text, 'fit', 'cover', 'posX', 50, 'posY', 50, 'opacity', 1)),
    jsonb_build_object('id', 'v', 'type', 'image', 'x', 0, 'y', 500, 'width', 640, 'height', 360, 'z', 1, 'payload', jsonb_build_object('assetId', vid::text, 'fit', 'cover', 'posX', 50, 'posY', 50, 'opacity', 1, 'media', 'video')),
    jsonb_build_object('id', 't', 'type', 'text', 'x', 0, 'y', 1000, 'width', 800, 'height', 120, 'z', 2, 'payload', jsonb_build_object('text', 'Support Me', 'fontFamily', 'system-sans', 'fontSize', 64, 'fontWeight', 700, 'italic', false, 'underline', true, 'color', '#62e7ff', 'align', 'center', 'lineHeight', 1.2, 'letterSpacing', 0, 'opacity', 1, 'direction', 'auto', 'wrap', true, 'link', jsonb_build_object('url', 'https://paypal.me/example')))
  ))));
  -- the next draft: the video is removed, the unused picture is now used
  doc_two := jsonb_set(doc_one, '{stages,0,elements,1}', jsonb_build_object('id', 'u', 'type', 'image', 'x', 0, 'y', 500, 'width', 300, 'height', 300, 'z', 1, 'payload', jsonb_build_object('assetId', unused::text, 'fit', 'cover', 'posX', 50, 'posY', 50, 'opacity', 1)));

  -- ===== structure and privileges =====
  select relrowsecurity into flag from pg_class where oid = 'public.wall_publications'::regclass;
  res := res || jsonb_build_object('step', 'RLS is enabled on wall_publications', 'pass', coalesce(flag, false));
  res := res || jsonb_build_object('step', 'no client role has any table privilege on wall_publications (RPC-only)',
    'pass', not (has_table_privilege('anon', 'public.wall_publications', 'select') or has_table_privilege('authenticated', 'public.wall_publications', 'select')
      or has_table_privilege('authenticated', 'public.wall_publications', 'insert') or has_table_privilege('authenticated', 'public.wall_publications', 'update') or has_table_privilege('authenticated', 'public.wall_publications', 'delete')));
  res := res || jsonb_build_object('step', 'owner RPCs: authenticated only; the visitor RPC: anon and authenticated',
    'pass', has_function_privilege('authenticated', 'public.publish_my_wall(bigint)', 'execute') and has_function_privilege('authenticated', 'public.unpublish_my_wall()', 'execute') and has_function_privilege('authenticated', 'public.get_my_wall_publication()', 'execute')
      and not has_function_privilege('anon', 'public.publish_my_wall(bigint)', 'execute') and not has_function_privilege('anon', 'public.unpublish_my_wall()', 'execute') and not has_function_privilege('anon', 'public.get_my_wall_publication()', 'execute')
      and has_function_privilege('anon', 'public.get_public_wall(text)', 'execute') and has_function_privilege('authenticated', 'public.get_public_wall(text)', 'execute'));
  select count(*) into cnt from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('publish_my_wall', 'unpublish_my_wall', 'get_my_wall_publication', 'get_public_wall') and p.prosecdef;
  res := res || jsonb_build_object('step', 'public wrappers are SECURITY INVOKER', 'pass', cnt = 0);
  select count(*) into cnt from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'private' and p.proname in ('publish_my_wall_impl', 'unpublish_my_wall_impl', 'get_my_wall_publication_impl', 'get_public_wall_impl', 'wall_object_is_published') and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""');
  res := res || jsonb_build_object('step', 'private implementations are SECURITY DEFINER with a fixed empty search_path', 'pass', cnt = 5);
  out := pg_temp.wp_run(null, 'anon', 'select count(*)::text from public.wall_publications');
  res := res || jsonb_build_object('step', 'anon cannot read wall_publications directly', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.wp_run(ua, 'authenticated', 'select count(*)::text from public.wall_publications');
  res := res || jsonb_build_object('step', 'a signed-in user cannot read wall_publications directly', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.wp_run(null, 'anon', 'select to_jsonb(p)::text from public.publish_my_wall(1) p');
  res := res || jsonb_build_object('step', 'anon cannot publish', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.wp_run(null, 'anon', 'select public.unpublish_my_wall()::text');
  res := res || jsonb_build_object('step', 'anon cannot unpublish', 'pass', out like 'ERR:42501:%', 'got', out);

  -- ===== publish =====
  out := pg_temp.wp_run(ua, 'authenticated', 'select (to_jsonb(d)->>''revision'') from public.ensure_my_wall_draft() d');
  rev := out::bigint;
  out := pg_temp.wp_run(ua, 'authenticated', format('select (to_jsonb(d)->>''revision'') from public.save_my_wall_draft(%L::jsonb, %s) d', doc_one::text, rev));
  rev := out::bigint;
  out := pg_temp.wp_run(ua, 'authenticated', 'select coalesce((select to_jsonb(p)::text from public.get_my_wall_publication() p), ''none'')');
  res := res || jsonb_build_object('step', 'a Wall that was never published has no publication', 'pass', out = 'none', 'got', out);
  out := pg_temp.wp_run(ua, 'authenticated', format('select to_jsonb(p)::text from public.publish_my_wall(%s) p', rev - 1));
  res := res || jsonb_build_object('step', 'publishing a revision the owner has not seen is refused (WALL_REVISION_CONFLICT) and publishes nothing', 'pass', out like 'ERR:PT409:WALL_REVISION_CONFLICT%' and not exists (select 1 from public.wall_publications where entity_id = ent_a), 'got', out);
  out := pg_temp.wp_run(ua, 'authenticated', format('select to_jsonb(p)::text from public.publish_my_wall(%s) p', rev));
  res := res || jsonb_build_object('step', 'the owner publishes the saved draft', 'pass', out not like 'ERR:%' and (out::jsonb ->> 'draft_revision')::bigint = rev, 'got', out);
  select (w.document = doc_one) into flag from public.wall_publications w where w.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'the snapshot is exactly the saved draft', 'pass', coalesce(flag, false));

  -- ===== visitors: only for a PUBLIC identity =====
  out := pg_temp.wp_run(null, 'anon', 'select count(*)::text from public.get_public_wall(''zwpa'')');
  res := res || jsonb_build_object('step', 'while the GamID itself is not public, visitors get no Wall', 'pass', out = '0', 'got', out);
  out := pg_temp.wp_run(null, 'anon', format('select count(*)::text from storage.objects where bucket_id = ''wall-media'' and name = %L', pic_path));
  res := res || jsonb_build_object('step', '... and no media', 'pass', out = '0' or out like 'ERR:%', 'got', out);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform public.set_my_identity_visibility(true); reset role;
  out := pg_temp.wp_run(null, 'anon', 'select to_jsonb(w)::text from public.get_public_wall(''zwpa'') w');
  j := out::jsonb;
  res := res || jsonb_build_object('step', 'a visitor of a PUBLIC GamID gets the published Wall', 'pass', out not like 'ERR:%' and (j -> 'document') = doc_one, 'got', left(out, 160));
  res := res || jsonb_build_object('step', '... with exactly the assets it references (not the unused one)',
    'pass', (select array_agg(x ->> 'asset_id' order by x ->> 'asset_id') from jsonb_array_elements(j -> 'assets') x) = (select array_agg(v order by v) from unnest(array[pic::text, vid::text]) v), 'got', j -> 'assets');
  out := pg_temp.wp_run(null, 'anon', 'select count(*)::text from public.get_public_wall(''ZWPA'')');
  res := res || jsonb_build_object('step', 'the handle is normalized exactly like the public profile''s (case)', 'pass', out = '1' and out = pg_temp.wp_run(null, 'anon', 'select count(*)::text from public.get_public_identity(''ZWPA'')'), 'got', out);
  out := pg_temp.wp_run(null, 'anon', 'select count(*)::text from public.get_public_wall(''zwp-nobody'')');
  res := res || jsonb_build_object('step', 'an unknown handle gets nothing', 'pass', out = '0', 'got', out);

  -- ===== storage: only referenced media of a published, public Wall =====
  out := pg_temp.wp_run(null, 'anon', format('select count(*)::text from storage.objects where bucket_id = ''wall-media'' and name = %L', pic_path));
  res := res || jsonb_build_object('step', 'a visitor can read a picture the published Wall uses', 'pass', out = '1', 'got', out);
  out := pg_temp.wp_run(null, 'anon', format('select count(*)::text from storage.objects where bucket_id = ''wall-video'' and name = %L', vid_path));
  res := res || jsonb_build_object('step', 'a visitor can read a video the published Wall uses', 'pass', out = '1', 'got', out);
  out := pg_temp.wp_run(null, 'anon', format('select count(*)::text from storage.objects where bucket_id = ''wall-media'' and name = %L', unused_path));
  res := res || jsonb_build_object('step', 'an asset the published Wall does NOT use stays private', 'pass', out = '0', 'got', out);
  out := pg_temp.wp_run(null, 'anon', format('select count(*)::text from storage.objects where bucket_id = ''wall-video'' and name = %L', pic_path));
  res := res || jsonb_build_object('step', 'a published path is only readable in its own bucket', 'pass', out = '0', 'got', out);
  out := pg_temp.wp_run(ub, 'authenticated', format('select count(*)::text from storage.objects where bucket_id = ''wall-media'' and name = %L', unused_path));
  res := res || jsonb_build_object('step', 'another signed-in user still cannot read the owner''s unpublished media', 'pass', out = '0', 'got', out);
  out := pg_temp.wp_run(ua, 'authenticated', format('select count(*)::text from storage.objects where bucket_id = ''wall-media'' and name = %L', unused_path));
  res := res || jsonb_build_object('step', 'the owner still reads all their own media (owner policy unchanged)', 'pass', out = '1', 'got', out);

  -- ===== the draft keeps changing privately =====
  out := pg_temp.wp_run(ua, 'authenticated', format('select (to_jsonb(d)->>''revision'') from public.save_my_wall_draft(%L::jsonb, %s) d', doc_two::text, rev));
  rev2 := out::bigint;
  out := pg_temp.wp_run(null, 'anon', 'select to_jsonb(w)::text from public.get_public_wall(''zwpa'') w');
  res := res || jsonb_build_object('step', 'saving the draft again does NOT change what visitors see', 'pass', (out::jsonb -> 'document') = doc_one, 'got', left(out, 120));
  out := pg_temp.wp_run(null, 'anon', format('select count(*)::text from storage.objects where bucket_id = ''wall-media'' and name = %L', unused_path));
  res := res || jsonb_build_object('step', 'media only the DRAFT uses stays private until it is published', 'pass', out = '0', 'got', out);
  out := pg_temp.wp_run(ua, 'authenticated', 'select (to_jsonb(p)->>''draft_revision'') from public.get_my_wall_publication() p');
  res := res || jsonb_build_object('step', 'the owner sees the published revision is behind the draft (Unpublished changes)', 'pass', out::bigint = rev and rev2 > rev, 'got', out);
  out := pg_temp.wp_run(ua, 'authenticated', format('select to_jsonb(a)::text from public.delete_my_wall_asset(%L::uuid) a', vid));
  res := res || jsonb_build_object('step', 'an asset only the PUBLISHED Wall still uses cannot be deleted', 'pass', out like 'ERR:PT409:WALL_ASSET_IN_USE%', 'got', out);

  -- ===== other users =====
  out := pg_temp.wp_run(ub, 'authenticated', 'select (to_jsonb(d)->>''revision'') from public.ensure_my_wall_draft() d');
  out := pg_temp.wp_run(ub, 'authenticated', format('select to_jsonb(p)::text from public.publish_my_wall(%s) p', out));
  res := res || jsonb_build_object('step', 'another user publishes only their own Wall', 'pass', out not like 'ERR:%' and exists (select 1 from public.wall_publications where entity_id = ent_b) and (select document from public.wall_publications where entity_id = ent_a) = doc_one, 'got', out);
  out := pg_temp.wp_run(null, 'anon', 'select count(*)::text from public.get_public_wall(''zwpb'')');
  res := res || jsonb_build_object('step', 'a published Wall of a GamID that is NOT public is invisible', 'pass', out = '0', 'got', out);

  -- ===== republish, hide the GamID, unpublish =====
  out := pg_temp.wp_run(ua, 'authenticated', format('select to_jsonb(p)::text from public.publish_my_wall(%s) p', rev2));
  out := pg_temp.wp_run(null, 'anon', 'select to_jsonb(w)::text from public.get_public_wall(''zwpa'') w');
  res := res || jsonb_build_object('step', 'publishing again shows the new version', 'pass', (out::jsonb -> 'document') = doc_two, 'got', left(out, 120));
  out := pg_temp.wp_run(null, 'anon', format('select count(*)::text from storage.objects where bucket_id = ''wall-video'' and name = %L', vid_path));
  res := res || jsonb_build_object('step', 'media the new version no longer uses is private again', 'pass', out = '0', 'got', out);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform public.set_my_identity_visibility(false); reset role;
  out := pg_temp.wp_run(null, 'anon', 'select count(*)::text from public.get_public_wall(''zwpa'')');
  res := res || jsonb_build_object('step', 'making the GamID private hides the published Wall at once', 'pass', out = '0', 'got', out);
  out := pg_temp.wp_run(null, 'anon', format('select count(*)::text from storage.objects where bucket_id = ''wall-media'' and name = %L', unused_path));
  res := res || jsonb_build_object('step', '... and its media', 'pass', out = '0', 'got', out);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform public.set_my_identity_visibility(true); reset role;
  out := pg_temp.wp_run(ua, 'authenticated', 'select public.unpublish_my_wall()::text');
  res := res || jsonb_build_object('step', 'the owner unpublishes', 'pass', out = 'true', 'got', out);
  out := pg_temp.wp_run(null, 'anon', 'select count(*)::text from public.get_public_wall(''zwpa'')');
  res := res || jsonb_build_object('step', 'after Unpublish visitors get no Wall (the Public Profile shows)', 'pass', out = '0', 'got', out);
  out := pg_temp.wp_run(null, 'anon', format('select count(*)::text from storage.objects where bucket_id = ''wall-media'' and name = %L', unused_path));
  res := res || jsonb_build_object('step', '... and no media', 'pass', out = '0', 'got', out);
  select (d.document = doc_two) into flag from public.wall_drafts d where d.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'Unpublish leaves the private draft untouched', 'pass', coalesce(flag, false));
  out := pg_temp.wp_run(ua, 'authenticated', format('select to_jsonb(a)::text from public.delete_my_wall_asset(%L::uuid) a', vid));
  res := res || jsonb_build_object('step', 'once nothing uses it, the asset can be deleted again', 'pass', out not like 'ERR:%', 'got', out);
  out := pg_temp.wp_run(ua, 'authenticated', 'select public.unpublish_my_wall()::text');
  res := res || jsonb_build_object('step', 'unpublishing an unpublished Wall is a harmless no-op', 'pass', out = 'false', 'got', out);

  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
