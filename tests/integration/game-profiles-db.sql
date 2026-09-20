-- Game Profiles (provider-neutral optional attachment) - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/game-profiles-db.sql
-- (Requires migration 20260921200000 to be applied. To validate the migration BEFORE applying it, run the migration's content and this file's
--  content wrapped together in one always-failing statement: everything rolls back either way.)
--
-- Uses ONLY disposable auth users / identities created inside the transaction, impersonates anon / authenticated / service_role exactly as PostgREST does,
-- and ALWAYS raises an exception carrying the results, so the whole transaction rolls back and nothing (including @black, the real Steam/Discord
-- connections, the League profile, discovered games and every visibility flag) is touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  ent_a uuid; ent_b uuid;
  got text; got2 text; keys text;
  flag boolean;
  n integer; cnt integer;
  js jsonb; jq jsonb; proj jsonb; r record;
  rows_before integer; discovered_before integer; playtime_on integer;
  good jsonb := '[{"key":"rank","label":"Rank","value":"Gold II","kind":"rank"},{"key":"win_rate","label":"Win rate","value":"58.3%","kind":"percent"},{"key":"matches","label":"Matches","value":142,"kind":"number"},{"key":"main_hero","label":"Main hero","value":"Sample Hero"}]';
begin
  select count(*) into rows_before from public.game_profiles;
  select count(*) into discovered_before from public.discovered_games;
  res := res || jsonb_build_object('step', 'NO seeded data: the table starts empty (no stats were fabricated for any game, Marvel Rivals included)', 'pass', rows_before = 0);

  -- helper: one backend save as the service role, returning the result or the error text
  execute $fn$
    create function pg_temp.gp_save(p_entity uuid, p_game text, p_identity_source text, p_identity_ref text, p_data_source text, p_class text, p_trust text, p_basis text, p_fields jsonb) returns text language plpgsql as $f$
    declare out text;
    begin
      set local role service_role;
      begin select public.save_game_profile(p_entity, p_game, p_identity_source, p_identity_ref, p_data_source, p_class, p_trust, p_basis, p_fields, now()) into out; exception when others then out := sqlerrm; end;
      reset role;
      return out;
    end $f$;
  $fn$;

  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zgp-a@example.invalid', now()), (ub, 'zgp-b@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zgpa', 'Zed A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zgpb', 'Zed B', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zgpa';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zgpb';

  -- structure
  select relrowsecurity into flag from pg_class where oid = 'public.game_profiles'::regclass;
  res := res || jsonb_build_object('step', 'RLS is enabled on game_profiles', 'pass', flag);
  select count(*) into cnt from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'game_profiles' and c.column_name = 'is_public' and c.column_default = 'false' and c.is_nullable = 'NO';
  res := res || jsonb_build_object('step', 'is_public is NOT NULL DEFAULT false: a Game Profile is private by default', 'pass', cnt = 1);
  select count(*) into cnt from pg_constraint c where c.conrelid = 'public.game_profiles'::regclass and c.conname = 'game_profiles_one_per_game' and c.contype = 'u';
  res := res || jsonb_build_object('step', 'exactly one profile per (identity, game): the join key is the normalized game, not a discovery provider', 'pass', cnt = 1);

  -- privileges
  n := 0;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.game_profiles limit 1; exception when insufficient_privilege then n := n + 1; end;
  begin insert into public.game_profiles (entity_id, game_key, identity_source, data_source, data_source_class, fields) values (ent_a, 'x_game', 'MANUAL_UID', 'SOME_SOURCE', 'THIRD_PARTY', '[]'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.save_game_profile(ent_a, 'x_game', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, '[]', now()); exception when others then if sqlerrm like 'permission denied%' then n := n + 1; end if; end;
  begin perform private.public_game_profiles(ent_a); exception when insufficient_privilege then n := n + 1; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.game_profiles limit 1; exception when insufficient_privilege then n := n + 1; end;
  begin perform 1 from public.get_my_game_profiles(); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.save_game_profile(ent_a, 'x_game', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, '[]', now()); exception when others then if sqlerrm like 'permission denied%' then n := n + 1; end if; end;
  reset role;
  res := res || jsonb_build_object('step', 'PRIVILEGES: authenticated and anon cannot read or write the table, cannot call the backend writer, and cannot call the public gate; anon cannot read profiles', 'pass', n = 7, 'denied', n);

  -- backend save + owner read
  got := pg_temp.gp_save(ent_a, 'sample_game', 'MANUAL_UID', '1234567890', 'SAMPLE_PROVIDER', 'THIRD_PARTY', 'MANUAL', null, good);
  res := res || jsonb_build_object('step', 'the backend can attach a MANUAL profile with normalized fields to a game', 'pass', got = 'SAVED', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.get_my_game_profiles();
  select g.trust_status, g.is_public, jsonb_array_length(g.fields), g.data_source, g.identity_ref into r from public.get_my_game_profiles() g where g.game_key = 'sample_game';
  reset role;
  res := res || jsonb_build_object('step', 'the owner reads their own profile through the RPC: MANUAL, private, 4 fields, provider and identity kept separate', 'pass', n = 1 and r.trust_status = 'MANUAL' and r.is_public = false and r.jsonb_array_length = 4 and r.data_source = 'SAMPLE_PROVIDER' and r.identity_ref = '1234567890');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; select count(*) into n from public.get_my_game_profiles(); reset role;
  res := res || jsonb_build_object('step', 'ISOLATION: another owner sees none of it', 'pass', n = 0);

  -- attachment does not depend on discovery, and discovery is never created or altered by it
  select count(*) into cnt from public.discovered_games;
  res := res || jsonb_build_object('step', 'a profile attaches without any discovered game and creates/changes no discovery row (discovery alone never produces or upgrades a profile)', 'pass', cnt = discovered_before);

  -- trust rules
  res := res || jsonb_build_object('step', 'TRUST: MANUAL with a verification basis is refused', 'pass', pg_temp.gp_save(ent_a, 'g_one', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', 'PLATFORM_OAUTH', good) = 'INVALID_PROFILE');
  res := res || jsonb_build_object('step', 'TRUST: VERIFIED without a basis is refused', 'pass', pg_temp.gp_save(ent_a, 'g_one', 'MANUAL_UID', '1', 'SOME_SOURCE', 'OFFICIAL', 'VERIFIED', null, good) = 'INVALID_PROFILE');
  res := res || jsonb_build_object('step', 'TRUST: VERIFIED from a third-party or temporary source is refused', 'pass', pg_temp.gp_save(ent_a, 'g_one', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'VERIFIED', 'PLATFORM_OAUTH', good) = 'INVALID_PROFILE' and pg_temp.gp_save(ent_a, 'g_one', 'MANUAL_UID', '1', 'SOME_SOURCE', 'UNOFFICIAL_TEMPORARY', 'VERIFIED', 'PLATFORM_OAUTH', good) = 'INVALID_PROFILE');
  res := res || jsonb_build_object('step', 'TRUST: CONNECTED from a temporary unofficial source is refused (same rule as league_profiles)', 'pass', pg_temp.gp_save(ent_a, 'g_one', 'MANUAL_UID', '1', 'SOME_SOURCE', 'UNOFFICIAL_TEMPORARY', 'CONNECTED', 'PLATFORM_OAUTH', good) = 'INVALID_PROFILE');
  res := res || jsonb_build_object('step', 'TRUST: a genuinely official + verified basis is representable (VERIFIED needs both)', 'pass', pg_temp.gp_save(ent_a, 'official_game', 'PLATFORM_ACCOUNT', 'acct', 'OFFICIAL_API', 'OFFICIAL', 'VERIFIED', 'OFFICIAL_ACCOUNT_LINK', good) = 'SAVED');
  res := res || jsonb_build_object('step', 'TRUST: MANUAL / UNVERIFIED remains representable for an unofficial temporary source', 'pass', pg_temp.gp_save(ent_a, 'temp_game', 'MANUAL_RIOT_ID', 'x#1', 'OPGG_TEMPORARY', 'UNOFFICIAL_TEMPORARY', 'MANUAL', null, good) = 'SAVED');

  -- field payload rules
  res := res || jsonb_build_object('step', 'FIELDS: a playtime / hours field is refused (playtime keeps its own owner switch)', 'pass',
    pg_temp.gp_save(ent_a, 'g_two', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, '[{"key":"playtime","label":"Playtime","value":"10 h"}]') = 'INVALID_PROFILE'
    and pg_temp.gp_save(ent_a, 'g_two', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, '[{"key":"hours_played","label":"Hours","value":10}]') = 'INVALID_PROFILE');
  res := res || jsonb_build_object('step', 'FIELDS: more than 12, duplicate keys, bad keys, extra properties, nested/array values and over-long text are all refused', 'pass',
    pg_temp.gp_save(ent_a, 'g_two', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, (select jsonb_agg(jsonb_build_object('key', 'k' || i, 'label', 'L', 'value', 1)) from generate_series(1, 13) i)) = 'INVALID_PROFILE'
    and pg_temp.gp_save(ent_a, 'g_two', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, '[{"key":"a","label":"A","value":1},{"key":"a","label":"B","value":2}]') = 'INVALID_PROFILE'
    and pg_temp.gp_save(ent_a, 'g_two', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, '[{"key":"A B","label":"A","value":1}]') = 'INVALID_PROFILE'
    and pg_temp.gp_save(ent_a, 'g_two', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, '[{"key":"a","label":"A","value":1,"html":"<b>"}]') = 'INVALID_PROFILE'
    and pg_temp.gp_save(ent_a, 'g_two', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, '[{"key":"a","label":"A","value":{"x":1}}]') = 'INVALID_PROFILE'
    and pg_temp.gp_save(ent_a, 'g_two', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, jsonb_build_array(jsonb_build_object('key', 'a', 'label', 'A', 'value', repeat('x', 81)))) = 'INVALID_PROFILE'
    and pg_temp.gp_save(ent_a, 'g_two', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, '{"key":"a"}') = 'INVALID_PROFILE');
  res := res || jsonb_build_object('step', 'FIELDS: bad game keys / source tokens are refused', 'pass',
    pg_temp.gp_save(ent_a, 'Bad Game', 'MANUAL_UID', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, good) = 'INVALID_PROFILE'
    and pg_temp.gp_save(ent_a, 'g_three', 'manual uid', '1', 'SOME_SOURCE', 'THIRD_PARTY', 'MANUAL', null, good) = 'INVALID_PROFILE');
  got := pg_temp.gp_save(gen_random_uuid(), 'g_four', 'MANUAL_UID', '1', 'SAMPLE_PROVIDER', 'THIRD_PARTY', 'MANUAL', null, good);
  res := res || jsonb_build_object('step', 'an unknown identity is refused (IDENTITY_NOT_FOUND)', 'pass', got = 'IDENTITY_NOT_FOUND', 'got', got);
  select count(*) into n from public.game_profiles g where g.entity_id = ent_a and g.game_key in ('g_one', 'g_two', 'g_three', 'g_four');
  res := res || jsonb_build_object('step', 'refused saves left nothing behind', 'pass', n = 0);

  -- upsert: one profile per game even when saved again (e.g. discovered through a second provider), and is_public is never auto-changed
  update public.game_profiles set is_public = true where entity_id = ent_a and game_key = 'sample_game';
  got := pg_temp.gp_save(ent_a, 'sample_game', 'MANUAL_UID', '1234567890', 'SAMPLE_PROVIDER', 'THIRD_PARTY', 'MANUAL', null, '[{"key":"rank","label":"Rank","value":"Platinum I","kind":"rank"}]');
  select count(*), bool_and(g.is_public), max(jsonb_array_length(g.fields)) into cnt, flag, n from public.game_profiles g where g.entity_id = ent_a and g.game_key = 'sample_game';
  res := res || jsonb_build_object('step', 'UPSERT: saving the same game again updates the ONE profile (no duplicate) and keeps the owner-chosen is_public', 'pass', got = 'SAVED' and cnt = 1 and flag = true and n = 1);
  update public.game_profiles set is_public = false where entity_id = ent_a and game_key = 'sample_game';
  select count(*) into cnt from public.game_profiles g where g.entity_id = ent_a and g.is_public;
  res := res || jsonb_build_object('step', 'a NEW profile always starts private', 'pass', cnt = 0);

  -- the public projection gate (not wired into the public boundary today)
  proj := private.public_game_profiles(ent_a);
  res := res || jsonb_build_object('step', 'PUBLIC GATE: private profiles are never projected', 'pass', proj = '[]'::jsonb);
  update public.game_profiles set is_public = true where entity_id = ent_a and game_key = 'sample_game';
  proj := private.public_game_profiles(ent_a);
  res := res || jsonb_build_object('step', 'PUBLIC GATE: a public profile of an UNPUBLISHED identity is still not projected', 'pass', proj = '[]'::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  proj := private.public_game_profiles(ent_a);
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(proj -> 0) k;
  res := res || jsonb_build_object('step', 'PUBLIC GATE: published + public -> only the safe projection (no identity reference, no verification basis, no internal ids)', 'pass',
    jsonb_array_length(proj) = 1 and keys = 'data_source,data_source_class,fetched_at,fields,game_key,trust_status' and proj::text !~* 'identity_ref|1234567890|verification_basis|entity_id|game_profile_id', 'got', keys);
  res := res || jsonb_build_object('step', 'PUBLIC GATE: another identity has nothing projected', 'pass', private.public_game_profiles(ent_b) = '[]'::jsonb);

  -- the accepted public boundary and the playtime privacy are untouched
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select to_jsonb(p) into js from public.get_public_identity('zgpa') p;
  reset role;
  select string_agg(k, ',' order by k collate "C") into keys from jsonb_object_keys(js) k;
  res := res || jsonb_build_object('step', 'PUBLIC BOUNDARY: a published identity with a PUBLIC game profile still returns exactly its 14 columns and no game-profile data', 'pass',
    keys = 'avatar_media_reference,bio,display_name,education_work_catalog,education_work_status,field_of_study,gamid_handle,institution,intro_derivative_path,intro_transition_key,primary_role_key,public_sections,role_catalog,role_keys'
    and js::text !~* 'game_profile|sample_game|win_rate|main_hero|Platinum|1234567890|playtime', 'got', keys);
  select count(*) into playtime_on from public.profiles p where p.show_game_playtime;
  res := res || jsonb_build_object('step', 'PLAYTIME PRIVACY unchanged: no identity has it ON and the playtime gate stays closed', 'pass', playtime_on = 0 and private.public_game_playtime_allowed(ent_a) = false);

  -- last-line constraint even for the table owner
  begin insert into public.game_profiles (entity_id, game_key, identity_source, data_source, data_source_class, fields) values (ent_b, 'x_game', 'MANUAL_UID', 'SOME_SOURCE', 'THIRD_PARTY', '[{"key":"playtime","label":"P","value":1}]'); got := 'NO_ERROR'; exception when check_violation then got := 'CHECK_VIOLATION'; end;
  begin insert into public.game_profiles (entity_id, game_key, identity_source, data_source, data_source_class, trust_status, fields) values (ent_b, 'x_game2', 'MANUAL_UID', 'SOME_SOURCE', 'THIRD_PARTY', 'VERIFIED', '[]'); got2 := 'NO_ERROR'; exception when check_violation then got2 := 'CHECK_VIOLATION'; end;
  res := res || jsonb_build_object('step', 'TABLE CHECKS hold even for a direct owner-level insert (playtime key, VERIFIED without basis)', 'pass', got = 'CHECK_VIOLATION' and got2 = 'CHECK_VIOLATION', 'got', got || ' / ' || got2);

  res := res || jsonb_build_object('step', 'discovered games untouched by this whole run', 'pass', (select count(*) from public.discovered_games) = discovered_before);
  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
