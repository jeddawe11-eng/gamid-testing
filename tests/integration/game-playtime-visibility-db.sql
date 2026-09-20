-- Game playtime visibility - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/game-playtime-visibility-db.sql
-- (Requires migration 20260921000000 to be applied. To validate the migration BEFORE applying it, run the migration's content and this file's
--  content wrapped together in one always-failing statement: everything rolls back either way.)
--
-- Uses ONLY disposable auth users / identities created inside the transaction, impersonates anon / authenticated exactly as PostgREST does,
-- and ALWAYS raises an exception carrying the results, so the whole transaction rolls back and nothing (including @black, the real Steam and
-- Discord connections, the League profile, and any visibility flag) is touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  ent_a uuid; ent_b uuid;
  got text; got2 text; keys text;
  flag boolean; flag2 boolean;
  n integer; cnt integer;
  js jsonb; jq jsonb; before_a jsonb; after_a jsonb; qr_a text;
  real_on integer;
begin
  -- real identities: nothing may be ON just because this migration exists
  select count(*) into real_on from public.profiles p where p.show_game_playtime;
  res := res || jsonb_build_object('step', 'no EXISTING identity has playtime display ON (the switch defaults to OFF everywhere; nothing was backfilled)', 'pass', real_on = 0, 'on', real_on);
  select count(*) into cnt from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = 'show_game_playtime' and c.column_default = 'false' and c.is_nullable = 'NO';
  res := res || jsonb_build_object('step', 'the column is NOT NULL DEFAULT false (a future identity starts OFF too)', 'pass', cnt = 1);

  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zplay-a@example.invalid', now()), (ub, 'zplay-b@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zplaya', 'Zed A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zplayb', 'Zed B', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zplaya';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zplayb';
  select q.public_token into qr_a from public.qr_references q where q.entity_id = ent_a;

  -- default OFF for a brand-new identity, seen through the owner RPC
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.show_game_playtime into flag from public.get_my_game_display_settings() s; reset role;
  select p.show_game_playtime into flag2 from public.profiles p where p.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'a new identity starts with playtime display OFF', 'pass', flag = false and flag2 = false);

  -- privileges
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.get_my_game_display_settings(); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  begin perform 1 from public.set_my_game_playtime_visibility(true); got2 := 'NO_ERROR'; exception when others then got2 := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'anon can call neither the read nor the write function', 'pass', got like 'permission denied%' and got2 like 'permission denied%', 'got', got || ' / ' || got2);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform private.public_game_playtime_allowed(ent_a); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  begin update public.profiles set show_game_playtime = true where entity_id = ent_a; got2 := 'NO_ERROR'; exception when others then got2 := sqlerrm; end;
  reset role;
  select p.show_game_playtime into flag from public.profiles p where p.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'an authenticated owner cannot call the public gate directly nor write the column directly (only the RPC can flip it)', 'pass', got like 'permission denied%' and got2 like 'permission denied%' and flag = false, 'got', got || ' / ' || got2);

  -- the owner flips ONLY their own flag; nothing else in their profile changes
  select to_jsonb(p) - 'show_game_playtime' - 'updated_at' into before_a from public.profiles p where p.entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.show_game_playtime into flag from public.set_my_game_playtime_visibility(true) s; reset role;
  select to_jsonb(p) - 'show_game_playtime' - 'updated_at' into after_a from public.profiles p where p.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'the owner can turn playtime display ON; the RPC changes that single flag and no other profile column', 'pass', flag = true and before_a = after_a);

  select p.show_game_playtime into flag from public.profiles p where p.entity_id = ent_b;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.show_game_playtime into flag2 from public.get_my_game_display_settings() s; reset role;
  res := res || jsonb_build_object('step', 'another owner is unaffected: still OFF, and cannot influence A (the identity is resolved from auth.uid())', 'pass', flag = false and flag2 = false);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.set_my_game_playtime_visibility(null); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'a null value is refused', 'pass', got = 'INVALID_VISIBILITY', 'got', got);

  -- the gate: ON alone is not enough - the GamID must also be published
  select private.public_game_playtime_allowed(ent_a) into flag;
  res := res || jsonb_build_object('step', 'GATE: playtime ON but the GamID is not published -> not allowed', 'pass', flag = false);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  select private.public_game_playtime_allowed(ent_a) into flag;
  select private.public_game_playtime_allowed(ent_b) into flag2;
  res := res || jsonb_build_object('step', 'GATE: published + playtime ON -> allowed; another identity (OFF) -> not allowed', 'pass', flag = true and flag2 = false);

  -- the public boundary is untouched: even with playtime ON and published, the anonymous response carries no playtime and no game data
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select to_jsonb(p) into js from public.get_public_identity('zplaya') p;
  select to_jsonb(p) into jq from public.get_public_identity_by_qr(qr_a) p;
  reset role;
  select string_agg(k, ',' order by k collate "C") into keys from jsonb_object_keys(js) k;
  res := res || jsonb_build_object('step', 'PUBLIC BOUNDARY: published + playtime ON: the anonymous response keeps exactly its 14 columns', 'pass',
    keys = 'avatar_media_reference,bio,display_name,education_work_catalog,education_work_status,field_of_study,gamid_handle,institution,intro_derivative_path,intro_transition_key,primary_role_key,public_sections,role_catalog,role_keys', 'got', keys);
  res := res || jsonb_build_object('step', 'PUBLIC BOUNDARY: no playtime / hours / game word anywhere in the anonymous response (handle and QR agree)', 'pass',
    js::text !~* 'playtime|hours|minutes_played|discovered|game_name|icon_ref|show_game' and jq = js);

  -- turning it OFF again: gate closes even though the GamID stays published
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.show_game_playtime into flag from public.set_my_game_playtime_visibility(false) s; reset role;
  select private.public_game_playtime_allowed(ent_a) into flag2;
  res := res || jsonb_build_object('step', 'turning playtime OFF closes the gate immediately while the GamID stays published', 'pass', flag = false and flag2 = false);

  -- unpublish while ON: the gate closes as well
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_game_playtime_visibility(true); perform 1 from public.set_my_identity_visibility(false); reset role;
  select private.public_game_playtime_allowed(ent_a) into flag;
  res := res || jsonb_build_object('step', 'unpublishing closes the gate even with playtime ON', 'pass', flag = false);

  -- unknown identity
  select private.public_game_playtime_allowed(gen_random_uuid()) into flag;
  res := res || jsonb_build_object('step', 'GATE: an unknown identity is not allowed', 'pass', flag = false);

  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
