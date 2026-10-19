-- My Gamer Data Phase 2 - live database behavior test (GamID TESTING only).
--
-- Run BEFORE the migration is applied (rehearsal): the migration's content followed by this file's content, in ONE run, e.g.
--   (cat supabase/migrations/20261019120000_gamer_data_sections.sql supabase/migrations/20261019120100_wall_gamer_data_binding.sql tests/integration/wall-gamer-data-db.sql)
--   | supabase db query --linked -f -
-- After it is applied: this file alone. Either way everything rolls back: the block below ALWAYS raises an exception carrying the results.
--
-- Uses ONLY disposable auth users / identities created inside the transaction (handles zgd...), impersonates anon / authenticated exactly as PostgREST does, and
-- touches no real identity (@black, @zshot), profile, Wall or setting. The REAL About Me / Favorite Games / visibility / Wall validator functions are exercised.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.
do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  ent_a uuid; ent_b uuid;
  out text; j jsonb; mine jsonb; theirs jsonb; extras record;
  country text; lang1 text; lang2 text; genre1 text; g1 text; g2 text; p1 text; p2 text;
  bad integer;
begin
  execute $fn$
    create function pg_temp.gd_run(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
    declare o text;
    begin
      perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
      execute 'set local role ' || p_role;
      begin
        execute p_sql into o;
      exception when others then
        o := 'ERR:' || sqlstate || ':' || sqlerrm;
      end;
      reset role;
      return o;
    end $f$;
  $fn$;

  -- legacy compatibility on the REAL saved Walls: every stored draft and publication is still valid under the new validator (a count only, no content read out)
  select count(*) into bad from public.wall_drafts d where cardinality(private.wall_document_errors(d.document)) > 0;
  res := res || jsonb_build_object('step', 'every existing Wall draft is still valid', 'pass', bad = 0, 'got', bad);
  select count(*) into bad from public.wall_publications w where cardinality(private.wall_document_errors(w.document)) > 0;
  res := res || jsonb_build_object('step', 'every existing Wall publication is still valid', 'pass', bad = 0, 'got', bad);

  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zgd-a@example.invalid', now()), (ub, 'zgd-b@example.invalid', now()), (uc, 'zgd-c@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zgda', 'Zed GD A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zgdb', 'Zed GD B', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zgda';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zgdb';
  -- A: a PUBLIC GamID with My Games public; B: not published
  update public.entities set visibility = 'PUBLIC' where entity_id = ent_a;
  update public.profiles set show_my_games = true where entity_id = ent_a;
  res := res || jsonb_build_object('step', 'B is not public', 'pass', (select visibility from public.entities where entity_id = ent_b) <> 'PUBLIC');

  select c.country_code into country from public.location_countries c order by c.country_code limit 1;
  select l.language_code into lang1 from public.spoken_language_catalog l where l.active order by l.sort_order limit 1;
  select l.language_code into lang2 from public.spoken_language_catalog l where l.active order by l.sort_order offset 1 limit 1;
  select g.genre_key into genre1 from public.game_genre_catalog g where g.active order by g.sort_order limit 1;
  out := pg_temp.gd_run(ua, 'authenticated', format('select count(*)::text from public.set_my_about(%L, null, false, array[%L, %L], array[%L], true, false, true)', country, lang1, lang2, genre1));
  res := res || jsonb_build_object('step', 'owner A sets About Me (Location + Genres public, Languages private)', 'pass', out = '1', 'got', out);

  select x.game_key, x.platform_key into g1, p1 from (select distinct on (gp.game_key) gp.game_key, gp.platform_key from public.game_catalog_platforms gp join public.game_catalog g on g.game_key = gp.game_key and g.is_active order by gp.game_key, gp.platform_key) x order by x.game_key limit 1;
  select x.game_key, x.platform_key into g2, p2 from (select distinct on (gp.game_key) gp.game_key, gp.platform_key from public.game_catalog_platforms gp join public.game_catalog g on g.game_key = gp.game_key and g.is_active order by gp.game_key, gp.platform_key) x order by x.game_key offset 1 limit 1;
  insert into public.entity_game_platforms (entity_id, game_key, platform_key) values (ent_a, g1, p1), (ent_a, g2, p2);
  out := pg_temp.gd_run(ua, 'authenticated', format('select array_to_string(public.set_my_favorite_games(array[%L, %L]), '','')', g2, g1));
  res := res || jsonb_build_object('step', 'owner A sets Favorite Games (second game first)', 'pass', out = g2 || ',' || g1, 'got', out);

  -- the owner's switch list is exactly the four switch rows
  out := pg_temp.gd_run(ua, 'authenticated', 'select string_agg(section_key, '','' order by section_key) from public.get_my_section_visibility()');
  res := res || jsonb_build_object('step', 'Show on my GamID switches unchanged', 'pass', out = 'discord,education_work,league,steam', 'got', out);
  out := pg_temp.gd_run(ua, 'authenticated', 'select (public.set_my_section_visibility(''about_me'', true)).section_key');
  res := res || jsonb_build_object('step', 'about_me is not a switch', 'pass', out like 'ERR:22023:INVALID_SECTION%', 'got', out);

  -- owner projection
  mine := pg_temp.gd_run(ua, 'authenticated', 'select public.get_my_gamer_data()::text')::jsonb;
  res := res || jsonb_build_object('step', 'owner: About Me then Favorite Games, catalog metadata', 'pass',
    (select jsonb_agg(s ->> 'key') from jsonb_array_elements(mine) s) = '["about_me", "favorite_games"]'::jsonb
    and mine -> 0 ->> 'presentation' = 'facts' and mine -> 1 ->> 'presentation' = 'cards' and (mine -> 1 ->> 'single')::boolean and (mine -> 1 ->> 'all')::boolean, 'got', mine);
  res := res || jsonb_build_object('step', 'owner About Me: four facts, only Languages private', 'pass',
    (select jsonb_agg(i ->> 'id' order by o) from jsonb_array_elements(mine -> 0 -> 'items') with ordinality a(i, o)) = '["location", "member_since", "languages", "genres"]'::jsonb
    and (select jsonb_agg((i ->> 'private')::boolean order by o) from jsonb_array_elements(mine -> 0 -> 'items') with ordinality a(i, o)) = '[false, false, true, false]'::jsonb);
  res := res || jsonb_build_object('step', 'owner Favorite Games: catalog keys in the owner''s order', 'pass',
    (select jsonb_agg(i ->> 'id' order by o) from jsonb_array_elements(mine -> 1 -> 'items') with ordinality a(i, o)) = jsonb_build_array(g2, g1));

  -- visitor projection: exactly what Classic shows
  theirs := pg_temp.gd_run(null, 'anon', 'select public.get_public_gamer_data(''zgda'')::text')::jsonb;
  select * into extras from public.get_public_profile_extras('zgda');
  res := res || jsonb_build_object('step', 'visitor About Me: Location, Member Since, Genres (Languages private: absent)', 'pass',
    (select jsonb_agg(i ->> 'id' order by o) from jsonb_array_elements(theirs -> 0 -> 'items') with ordinality a(i, o)) = '["location", "member_since", "genres"]'::jsonb, 'got', theirs);
  res := res || jsonb_build_object('step', 'visitor About Me values = Classic''s public extras', 'pass',
    theirs -> 0 -> 'items' -> 0 ->> 'value' = extras.about_location
    and theirs -> 0 -> 'items' -> 2 -> 'values' = (select jsonb_agg(g ->> 'label' order by o) from jsonb_array_elements(extras.about_genres) with ordinality a(g, o))
    and theirs -> 0 -> 'items' -> 1 ->> 'value' = to_char(extras.member_since_date::date, 'FMDD FMMonth YYYY'));
  res := res || jsonb_build_object('step', 'visitor Favorite Games = Classic''s public favorites, same order', 'pass',
    (select jsonb_agg(i ->> 'id' order by o) from jsonb_array_elements(theirs -> 1 -> 'items') with ordinality a(i, o)) = (select jsonb_agg(f ->> 'game_key' order by o) from jsonb_array_elements(public.get_public_favorite_games('zgda')) with ordinality a(f, o)));
  res := res || jsonb_build_object('step', 'no private flag ever reaches a visitor', 'pass', position('"private"' in theirs::text) = 0);

  -- privacy gates apply on the next read
  update public.profiles set show_my_games = false where entity_id = ent_a;
  theirs := pg_temp.gd_run(null, 'anon', 'select public.get_public_gamer_data(''zgda'')::text')::jsonb;
  res := res || jsonb_build_object('step', 'My Games off: visitors get no Favorite Games section', 'pass', not exists (select 1 from jsonb_array_elements(theirs) s where s ->> 'key' = 'favorite_games'), 'got', theirs);
  mine := pg_temp.gd_run(ua, 'authenticated', 'select public.get_my_gamer_data()::text')::jsonb;
  res := res || jsonb_build_object('step', 'My Games off: the owner keeps it, every favorite private', 'pass',
    (select bool_and((i ->> 'private')::boolean) from jsonb_array_elements(mine -> 1 -> 'items') i));
  out := pg_temp.gd_run(null, 'anon', 'select public.get_public_gamer_data(''zgdb'')::text');
  res := res || jsonb_build_object('step', 'a GamID that is not public: nothing', 'pass', out = '[]', 'got', out);
  out := pg_temp.gd_run(null, 'anon', 'select public.get_public_gamer_data(''zgd-no-such-handle'')::text');
  res := res || jsonb_build_object('step', 'an unknown handle: nothing', 'pass', out = '[]', 'got', out);

  -- grants
  out := pg_temp.gd_run(null, 'anon', 'select public.get_my_gamer_data()::text');
  res := res || jsonb_build_object('step', 'anon cannot call the owner projection', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.gd_run(ua, 'authenticated', 'select private.gamer_data_items(''about_me'', ''zgdb'', false)::text');
  res := res || jsonb_build_object('step', 'the per-section function is not callable directly', 'pass', out like 'ERR:42501:%', 'got', out);
  out := pg_temp.gd_run(uc, 'authenticated', 'select public.get_my_gamer_data()::text');
  res := res || jsonb_build_object('step', 'a signed-in user without a GamID: IDENTITY_NOT_FOUND', 'pass', out like 'ERR:P0002:IDENTITY_NOT_FOUND%', 'got', out);

  -- the Wall validator
  j := to_jsonb(private.wall_document_errors('{"schemaVersion":1,"canvas":{"width":1000,"height":1778},"stages":[{"id":"stage_1","elements":[
    {"id":"d1","type":"gamidData","x":10,"y":10,"width":600,"height":200,"z":0,"payload":{"field":"section","section":"about_me"}},
    {"id":"d2","type":"gamidData","x":10,"y":10,"width":600,"height":200,"z":1,"payload":{"field":"section","section":"favorite_games","item":"elden_ring"}}]}]}'::jsonb));
  res := res || jsonb_build_object('step', 'validator: a whole section and one item are valid', 'pass', j = '[]'::jsonb, 'got', j);
  j := to_jsonb(private.wall_document_errors('{"schemaVersion":1,"canvas":{"width":1000,"height":1778},"stages":[{"id":"stage_1","elements":[
    {"id":"d1","type":"gamidData","x":10,"y":10,"width":600,"height":200,"z":0,"payload":{"field":"section","section":"About Me","item":"../x"}}]}]}'::jsonb));
  res := res || jsonb_build_object('step', 'validator: bad section / item formats are refused', 'pass', j ? 'INVALID_DATA_SECTION:d1' and j ? 'INVALID_DATA_ITEM:d1', 'got', j);

  -- Favorite Games Display Style (20261019140000 / 20261019140100)
  res := res || jsonb_build_object('step', 'Display Style: Favorite Games carries the game-artwork capability in both projections, About Me none', 'pass',
    (select s ->> 'artwork' from jsonb_array_elements(pg_temp.gd_run(ua, 'authenticated', 'select public.get_my_gamer_data()::text')::jsonb) s where s ->> 'key' = 'favorite_games') = 'game'
    and (select s -> 'artwork' from jsonb_array_elements(pg_temp.gd_run(ua, 'authenticated', 'select public.get_my_gamer_data()::text')::jsonb) s where s ->> 'key' = 'about_me') = 'null'::jsonb);
  j := to_jsonb(private.wall_document_errors('{"schemaVersion":1,"canvas":{"width":1000,"height":1778},"stages":[{"id":"stage_1","elements":[
    {"id":"d1","type":"gamidData","x":10,"y":10,"width":600,"height":200,"z":0,"payload":{"field":"section","section":"favorite_games","display":"covers"}},
    {"id":"d2","type":"gamidData","x":10,"y":10,"width":600,"height":200,"z":1,"payload":{"field":"section","section":"favorite_games","item":"elden_ring","display":"names"}},
    {"id":"d3","type":"gamidData","x":10,"y":10,"width":600,"height":200,"z":2,"payload":{"field":"section","section":"favorite_games","display":"posters"}}]}]}'::jsonb));
  res := res || jsonb_build_object('step', 'Display Style: names / covers valid on both forms, anything else refused', 'pass', j = '["INVALID_DATA_DISPLAY:d3"]'::jsonb, 'got', j);

  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
