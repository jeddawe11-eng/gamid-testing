-- Public section visibility ("Show on my GamID") — live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/public-section-visibility-db.sql
-- (Requires migration 20260920140000 to be applied. To validate the migration BEFORE applying it, run the migration's content
--  and this file's content wrapped together in one always-failing statement: everything rolls back either way.)
--
-- Creates disposable auth users / identities, impersonates anon / authenticated / service_role exactly as PostgREST does, and
-- ALWAYS raises an exception carrying the results, so the whole transaction rolls back and nothing (including @black, the
-- Discord connection, the League profile and the visibility flags of any real identity) is ever touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  ent_a uuid; ent_b uuid; ent_c uuid;
  qr_a text; qr_b text;
  st text; att uuid; res_id uuid;
  got text; cnt integer; n integer; n2 integer; keys text;
  js jsonb; jq jsonb; js2 jsonb; discord_payload jsonb; league_payload jsonb;
  league_before jsonb; league_after jsonb;
  attempts_before integer; attempts_after integer; conn_attempts_before integer; conn_attempts_after integer; discovery_before integer;
  fetched_before timestamptz; last_before timestamptz;
  edu_key text;
  r record; rec record;
  acct_a constant text := '555555555555555555';
  acct_b constant text := '666666666666666666';
  leak_pattern constant text := '555555555555555555|666666666666666666|cdn\.discordapp|avatars/|source_url|op\.gg|last_result|last_attempt|attempt|reservation|token|entity_id|connection_id|league_profile_id|provider_account|discovery|ABSENT|FOUND|puuid|is_public|fetched_at|show_education';
begin
  -- ------------------------------------------------------------------ setup (as postgres)
  select c.status_key into edu_key from public.education_work_status_catalog c where c.status_key = 'university_student' and c.active;
  if edu_key is null then select c.status_key into edu_key from public.education_work_status_catalog c where c.active order by c.sort_order limit 1; end if;

  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'zsect-a@example.invalid', now()), (ub, 'zsect-b@example.invalid', now()), (uc, 'zsect-c@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zsecta', 'Zed Sec A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zsectb', 'Zed Sec B', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zsectc', 'Zed Sec C', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zsecta';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zsectb';
  select e.entity_id into ent_c from public.entities e where e.gamid_handle = 'zsectc';
  select q.public_token into qr_a from public.qr_references q where q.entity_id = ent_a;
  select q.public_token into qr_b from public.qr_references q where q.entity_id = ent_b;

  update public.profiles set bio = 'Bio for A', education_work_status = edu_key, institution = 'Test University', field_of_study = 'Testing' where entity_id = ent_a;
  update public.profiles set bio = 'Bio for B', education_work_status = edu_key, institution = 'Test University B', field_of_study = 'Testing B' where entity_id = ent_b;

  -- A and B each get a Discord connection (with a private discovery diagnostic) and a saved League profile
  for r in select * from (values (ua, 'a', acct_a), (ub, 'b', acct_b)) as v(u, tag, acct) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
    set local role authenticated; select s.state into st from public.start_connection_attempt('discord') s; reset role;
    set local role service_role;
    select c.attempt_id into att from public.consume_connection_attempt(st) c;
    select public.complete_connection_attempt(att, r.acct, 'alice_' || r.tag, 'Alice ' || upper(r.tag), 'https://cdn.discordapp.com/avatars/' || r.acct || '/abcdef.png?size=128') into got;
    perform public.record_connection_discovery(att, r.acct, 'riot', 'ABSENT', 3, 0, null, null, null, null, null, null, null, null, null, null);
    reset role;

    set local role authenticated; select s.reservation_id into res_id from public.reserve_league_lookup('add', 'KR', 'Hide on bush', 'KR1' || r.tag) s; reset role;
    set local role service_role;
    select public.save_league_lookup(res_id, 'OPGG_TEMPORARY', 'Hide on bush', 'KR1' || r.tag, 'KR', 'RANKED', 'PLATINUM', 'II', 64, 20, 18, 6,
      'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1' || r.tag, '2026-09-19T15:19:21Z') into got;
    reset role;
  end loop;
  select count(*) into cnt from public.gaming_connections g where g.entity_id in (ent_a, ent_b);
  select count(*) into n from public.league_profiles l where l.entity_id in (ent_a, ent_b);
  res := res || jsonb_build_object('step', 'setup: A and B each have a Discord connection, a saved League profile and Education/Work data', 'pass', cnt = 2 and n = 2);

  -- ------------------------------------------------------------------ 1. defaults: nothing optional is public, nothing is switched on automatically
  select count(*) into cnt from public.gaming_connections g where g.entity_id in (ent_a, ent_b) and g.is_public;
  select count(*) into n from public.league_profiles l where l.entity_id in (ent_a, ent_b) and l.is_public;
  select count(*) into n2 from public.profiles p where p.entity_id in (ent_a, ent_b) and p.show_education_work;
  res := res || jsonb_build_object('step', 'a new connection, a new League profile and new Education/Work data all default to OFF (private)', 'pass', cnt = 0 and n = 0 and n2 = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) as total, count(*) filter (where v.is_public) as on_count, count(*) filter (where v.is_set_up) as set_up, string_agg(v.section_key, ',' order by v.section_key) as keys into rec from public.get_my_section_visibility() v;
  reset role;
  -- (The registry grew from three to four sections with the Steam Connection Foundation; Steam is listed but NOT set up here.)
  res := res || jsonb_build_object('step', 'the owner sees every registered section (Discord, Education/Work, League set up; Steam listed but not set up), all OFF', 'pass', rec.total = 4 and rec.on_count = 0 and rec.set_up = 3 and rec.keys = 'discord,education_work,league,steam', 'got', rec.keys);

  -- ------------------------------------------------------------------ 2. PUBLISHED with every section OFF: only the core identity is public
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select to_jsonb(p) into js from public.get_public_identity('zsectb') p;
  select to_jsonb(p) into jq from public.get_public_identity_by_qr(qr_b) p;
  reset role;
  res := res || jsonb_build_object('step', 'published + every section OFF: the core identity is public as before (name, bio)', 'pass', js->>'display_name' = 'Zed Sec B' and js->>'bio' = 'Bio for B' and js->>'gamid_handle' = 'zsectb');
  res := res || jsonb_build_object('step', 'published + every section OFF: no optional section is present at all (public_sections is empty)', 'pass', js->'public_sections' = '{}'::jsonb and jq->'public_sections' = '{}'::jsonb);
  res := res || jsonb_build_object('step', 'published + Education/Work OFF: its values are NULL in the anonymous response (stored data is not returned)', 'pass',
    js->'education_work_status' = 'null'::jsonb and js->'institution' = 'null'::jsonb and js->'field_of_study' = 'null'::jsonb and js->'education_work_catalog' = 'null'::jsonb);
  res := res || jsonb_build_object('step', 'published + every section OFF: nothing of Discord, League or Education appears anywhere in the response text (handle and QR)', 'pass',
    js::text !~ (acct_b || '|Test University|[Aa]lice|KR1b|PLATINUM|Hide on bush') and jq::text !~ (acct_b || '|Test University|[Aa]lice|KR1b|PLATINUM|Hide on bush'));

  -- ------------------------------------------------------------------ 3. UNPUBLISHED + every section ON: nothing optional is reachable
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.set_my_section_visibility('discord', true) x where x.is_public;
  select count(*) into n from public.set_my_section_visibility('league', true) x where x.is_public;
  select count(*) into n2 from public.set_my_section_visibility('education_work', true) x where x.is_public;
  reset role;
  select e.visibility::text into got from public.entities e where e.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'an owner can switch every section ON while the GamID is still unpublished', 'pass', cnt = 1 and n = 1 and n2 = 1 and got <> 'PUBLIC', 'visibility', got);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into cnt from public.get_public_identity('zsecta');
  select count(*) into n from public.get_public_identity_by_qr(qr_a);
  reset role;
  res := res || jsonb_build_object('step', 'UNPUBLISHED + every section ON: nothing is publicly accessible (handle route and QR route both return no row)', 'pass', cnt = 0 and n = 0);

  -- ------------------------------------------------------------------ 4. PUBLISHED + every section ON: only the approved fields appear
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select to_jsonb(p) into js from public.get_public_identity('zsecta') p;
  select to_jsonb(p) into jq from public.get_public_identity_by_qr(qr_a) p;
  reset role;
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js->'public_sections') k;
  res := res || jsonb_build_object('step', 'published + Discord and League ON: exactly those two sections are present', 'pass', keys = 'discord,league', 'got', keys);
  discord_payload := js->'public_sections'->'discord';
  league_payload := js->'public_sections'->'league';
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(discord_payload) k;
  res := res || jsonb_build_object('step', 'Discord public fields are exactly display_name, username, trust_status (CONNECTED)', 'pass',
    keys = 'display_name,trust_status,username' and discord_payload->>'display_name' = 'Alice A' and discord_payload->>'username' = 'alice_a' and discord_payload->>'trust_status' = 'CONNECTED', 'got', keys);
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(league_payload) k;
  res := res || jsonb_build_object('step', 'League public fields are exactly the approved presentation fields', 'pass',
    keys = 'data_source,division,game_name,identity_source,losses,lp,platform_id,profile_icon_id,rank_state,tag_line,tier,trust_status,updated_at,wins', 'got', keys);
  res := res || jsonb_build_object('step', 'League stays MANUAL / manual-Riot-ID / temporary source and is never presented as verified', 'pass',
    league_payload->>'trust_status' = 'MANUAL' and league_payload->>'identity_source' = 'MANUAL_RIOT_ID' and league_payload->>'data_source' = 'OPGG_TEMPORARY' and league_payload::text !~* 'verified'
    and league_payload->>'game_name' = 'Hide on bush' and league_payload->>'tag_line' = 'KR1a' and league_payload->>'platform_id' = 'KR' and league_payload->>'tier' = 'PLATINUM'
    and league_payload->>'division' = 'II' and (league_payload->>'lp')::int = 64 and (league_payload->>'wins')::int = 20 and (league_payload->>'losses')::int = 18);
  res := res || jsonb_build_object('step', 'published + Education/Work ON: the stored values are returned', 'pass', js->>'education_work_status' = edu_key and js->>'institution' = 'Test University' and js->>'field_of_study' = 'Testing' and js->'education_work_catalog' <> 'null'::jsonb);
  res := res || jsonb_build_object('step', 'no private/internal field leaks: no Discord id, avatar URL, token, diagnostic, source URL, lookup state, ledger, reservation, id, or flag name', 'pass', js::text !~* leak_pattern, 'text_sample', left(js::text, 0));
  res := res || jsonb_build_object('step', 'the QR route returns exactly the same public response as the handle route', 'pass', jq = js);

  -- ------------------------------------------------------------------ 5. DISCORD: OFF / ON without disconnecting or reconnecting
  select count(*) into conn_attempts_before from private.connection_oauth_attempts a where a.user_id = ua;
  select count(*) into discovery_before from public.connection_discovery_results;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select count(*) into cnt from public.set_my_section_visibility('discord', false) x where not x.is_public; reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; select count(*) into n from public.get_public_identity_by_qr(qr_a) p where not (p.public_sections ? 'discord'); reset role;
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js2->'public_sections') k;
  res := res || jsonb_build_object('step', 'Discord ON -> OFF: it disappears from the public response immediately (handle and QR); League stays', 'pass', cnt = 1 and keys = 'league' and n = 1 and js2::text !~ ('alice|Alice|' || acct_a), 'got', keys);
  select count(*) into cnt from public.gaming_connections g where g.entity_id = ent_a and g.provider_account_id = acct_a and not g.is_public;
  select count(*) into n from public.connection_discovery_results;
  res := res || jsonb_build_object('step', 'turning Discord OFF does not disconnect it: the private connection, account and discovery data are untouched', 'pass', cnt = 1 and n = discovery_before);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select count(*) into cnt from public.set_my_section_visibility('discord', true) x where x.is_public; reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; reset role;
  select count(*) into conn_attempts_after from private.connection_oauth_attempts a where a.user_id = ua;
  res := res || jsonb_build_object('step', 'Discord OFF -> ON: it reappears with the same approved fields, with no reconnect and no new OAuth attempt', 'pass',
    cnt = 1 and js2->'public_sections'->'discord' = discord_payload and conn_attempts_after = conn_attempts_before);

  -- ------------------------------------------------------------------ 6. LEAGUE: OFF / ON without deleting, refreshing, looking up, or consuming the throttle
  select to_jsonb(l) - 'is_public' into league_before from public.league_profiles l where l.entity_id = ent_a;
  select count(*) into attempts_before from private.league_lookup_attempts a where a.entity_id = ent_a;
  select l.fetched_at, l.last_attempt_at into fetched_before, last_before from public.league_profiles l where l.entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select count(*) into cnt from public.set_my_section_visibility('league', false) x where not x.is_public; reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; reset role;
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js2->'public_sections') k;
  res := res || jsonb_build_object('step', 'League ON -> OFF: it disappears from the public response immediately; Discord stays', 'pass', cnt = 1 and keys = 'discord' and js2::text !~* 'Hide on bush|PLATINUM|KR1a', 'got', keys);
  select to_jsonb(l) - 'is_public' into league_after from public.league_profiles l where l.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'turning League OFF does not delete or change the saved profile (every column except the switch is identical)', 'pass', league_after is not null and league_after = league_before);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select count(*) into cnt from public.set_my_section_visibility('league', true) x where x.is_public; reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; reset role;
  select count(*) into attempts_after from private.league_lookup_attempts a where a.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'League OFF -> ON: it returns with the same approved fields', 'pass', cnt = 1 and js2->'public_sections'->'league' = league_payload);
  select to_jsonb(l) - 'is_public' into league_after from public.league_profiles l where l.entity_id = ent_a;
  res := res || jsonb_build_object('step', 'toggling League visibility does NOT consume the throttle (ledger unchanged), does NOT refresh data (fetched_at / last_attempt_at unchanged) and triggers no lookup', 'pass',
    attempts_after = attempts_before and league_after = league_before
    and (select l.fetched_at from public.league_profiles l where l.entity_id = ent_a) = fetched_before and (select l.last_attempt_at from public.league_profiles l where l.entity_id = ent_a) = last_before);

  -- ------------------------------------------------------------------ 7. EDUCATION / WORK: OFF / ON while the stored data is preserved
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select count(*) into cnt from public.set_my_section_visibility('education_work', false) x where not x.is_public; reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; reset role;
  res := res || jsonb_build_object('step', 'Education/Work ON -> OFF: its values are NULL in the public response immediately', 'pass',
    cnt = 1 and js2->'education_work_status' = 'null'::jsonb and js2->'institution' = 'null'::jsonb and js2->'field_of_study' = 'null'::jsonb and js2->'education_work_catalog' = 'null'::jsonb and js2::text !~ 'Test University');
  select count(*) into cnt from public.profiles p where p.entity_id = ent_a and p.education_work_status = edu_key and p.institution = 'Test University' and p.field_of_study = 'Testing' and not p.show_education_work;
  res := res || jsonb_build_object('step', 'turning Education/Work OFF preserves the stored data', 'pass', cnt = 1);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select count(*) into cnt from public.set_my_section_visibility('education_work', true) x where x.is_public; reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; reset role;
  res := res || jsonb_build_object('step', 'Education/Work OFF -> ON: the same values are public again', 'pass', cnt = 1 and js2->>'education_work_status' = edu_key and js2->>'institution' = 'Test University');

  -- ------------------------------------------------------------------ 8. WHOLE-GAMID gate: unpublish hides everything, publish restores it
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(false); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select count(*) into cnt from public.get_public_identity('zsecta'); select count(*) into n from public.get_public_identity_by_qr(qr_a); reset role;
  res := res || jsonb_build_object('step', 'Unpublish with every section still ON: nothing is public (handle and QR)', 'pass', cnt = 0 and n = 0);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.set_my_identity_visibility(true); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; reset role;
  res := res || jsonb_build_object('step', 'Re-publish: the sections that were ON come back without any re-setup', 'pass', js2->'public_sections'->'discord' = discord_payload and js2->'public_sections'->'league' = league_payload);

  -- ------------------------------------------------------------------ 9. SECURITY: hidden data is not reachable through any anonymous interface
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.get_my_section_visibility(); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot call get_my_section_visibility', 'pass', got like 'permission denied%', 'got', got);
  begin perform 1 from public.set_my_section_visibility('discord', true); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'anon cannot call set_my_section_visibility', 'pass', got like 'permission denied%', 'got', got);
  n := 0;
  for r in select * from (values ('public.gaming_connections'), ('public.league_profiles'), ('public.connection_discovery_results'), ('public.public_section_catalog'), ('public.profiles'), ('private.league_lookup_attempts'), ('private.connection_oauth_attempts')) as v(t) loop
    begin execute 'select 1 from ' || r.t || ' limit 1'; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
    if got like 'permission denied%' then n := n + 1; end if;
  end loop;
  res := res || jsonb_build_object('step', 'anon has no direct read access to any table that holds a hidden section (connections, League, discovery, catalog, profiles, ledgers)', 'pass', n = 7, 'denied', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.gaming_connections set is_public = true; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'an authenticated user cannot flip a Discord switch by writing the table directly', 'pass', got like 'permission denied%', 'got', got);
  begin update public.league_profiles set is_public = true; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'an authenticated user cannot flip a League switch by writing the table directly', 'pass', got like 'permission denied%', 'got', got);
  begin update public.profiles set show_education_work = true; got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'an authenticated user cannot flip the Education/Work switch by writing the table directly', 'pass', got like 'permission denied%', 'got', got);
  reset role;

  -- ownership isolation: B's toggles never touch A, and a section that is not set up cannot be switched
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.set_my_section_visibility('discord', true) x where x.is_public;
  reset role;
  select count(*) into n from public.gaming_connections g where g.entity_id = ent_b and g.is_public;
  select count(*) into n2 from public.gaming_connections g where g.entity_id = ent_a and g.is_public;
  res := res || jsonb_build_object('step', 'owner B switching THEIR Discord ON changes only B (A keeps its own setting)', 'pass', cnt = 1 and n = 1 and n2 = 1);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.set_my_section_visibility('discord', true); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'a user with no Discord connection cannot switch Discord ON (SECTION_NOT_SET_UP)', 'pass', got = 'SECTION_NOT_SET_UP', 'got', got);
  begin perform 1 from public.set_my_section_visibility('league', true); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'a user with no League profile cannot switch League ON (SECTION_NOT_SET_UP)', 'pass', got = 'SECTION_NOT_SET_UP', 'got', got);
  begin perform 1 from public.set_my_section_visibility('battlenet', true); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'an unknown section is rejected (INVALID_SECTION)', 'pass', got = 'INVALID_SECTION', 'got', got);
  begin perform 1 from public.set_my_section_visibility('discord', null); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'a missing on/off value is rejected (INVALID_VISIBILITY)', 'pass', got = 'INVALID_VISIBILITY', 'got', got);
  select x.section_key into got from public.set_my_section_visibility('  Education_Work ', false) x;
  res := res || jsonb_build_object('step', 'section names are normalized (case / spaces)', 'pass', got = 'education_work', 'got', got);
  reset role;

  -- ------------------------------------------------------------------ 10. a connection / saved profile never becomes public on its own: (re)linking and re-adding start OFF
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select public.disconnect_my_connection('discord') into got; reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; reset role;
  select string_agg(k, ',' order by k) into keys from jsonb_object_keys(js2->'public_sections') k;
  res := res || jsonb_build_object('step', 'disconnecting Discord removes it from the public response (and its switch with it)', 'pass', keys = 'league' and js2::text !~ 'alice|Alice', 'got', keys);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.state into st from public.start_connection_attempt('discord') s; reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt(st) c;
  select public.complete_connection_attempt(att, acct_a, 'alice_a2', 'Alice A2', null) into got;
  reset role;
  select count(*) into cnt from public.gaming_connections g where g.entity_id = ent_a and not g.is_public;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; reset role;
  res := res || jsonb_build_object('step', 'RE-connecting the same Discord account starts OFF: it does NOT inherit the previous ON and stays absent publicly', 'pass', got = 'CONNECTED' and cnt = 1 and not (js2->'public_sections' ? 'discord'));

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select public.remove_my_league_profile() into got; reset role;
  update private.league_lookup_attempts set created_at = created_at - interval '3 hours' where entity_id = ent_a;
  set local role authenticated;
  select s.reservation_id into res_id from public.reserve_league_lookup('add', 'KR', 'Hide on bush', 'KR1a') s;
  reset role;
  set local role service_role;
  select public.save_league_lookup(res_id, 'OPGG_TEMPORARY', 'Hide on bush', 'KR1a', 'KR', 'RANKED', 'GOLD', 'I', 10, 1, 1, 6, 'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1a', null) into got;
  reset role;
  select count(*) into cnt from public.league_profiles l where l.entity_id = ent_a and not l.is_public;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; reset role;
  res := res || jsonb_build_object('step', 'removing and RE-adding the League profile starts OFF: it does NOT inherit the previous ON and stays absent publicly', 'pass', got = 'SAVED' and cnt = 1 and js2->'public_sections' = '{}'::jsonb);

  -- ------------------------------------------------------------------ 11. an explicit ON survives the normal refreshes (they never touch the switch)
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from public.set_my_section_visibility('discord', true);
  perform 1 from public.set_my_section_visibility('league', true);
  select s.state into st from public.start_connection_attempt('discord') s;
  reset role;
  set local role service_role;
  select c.attempt_id into att from public.consume_connection_attempt(st) c;
  select public.complete_connection_attempt(att, acct_a, 'alice_renamed', 'Alice Renamed', null) into got;
  reset role;
  update public.league_profiles set last_attempt_at = now() - interval '11 minutes' where entity_id = ent_a;
  update private.league_lookup_attempts set created_at = created_at - interval '3 hours' where entity_id = ent_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; select s.reservation_id into res_id from public.reserve_league_lookup('refresh', null, null, null) s; reset role;
  set local role service_role;
  select public.save_league_lookup(res_id, 'OPGG_TEMPORARY', 'Hide on bush', 'KR1a', 'KR', 'RANKED', 'GOLD', 'I', 99, 2, 2, 6, 'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1a', null) into got;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; reset role;
  res := res || jsonb_build_object('step', 'a Discord reconnect (RECONNECTED) and a League refresh keep an explicit ON and publish the refreshed values', 'pass',
    js2->'public_sections'->'discord'->>'display_name' = 'Alice Renamed' and (js2->'public_sections'->'league'->>'lp')::int = 99 and js2->'public_sections'->'league'->>'tier' = 'GOLD');

  -- ------------------------------------------------------------------ 12. core public identity unchanged, hidden data never in the response
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from public.set_my_section_visibility('discord', false);
  perform 1 from public.set_my_section_visibility('league', false);
  perform 1 from public.set_my_section_visibility('education_work', false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select to_jsonb(p) into js2 from public.get_public_identity('zsecta') p; select to_jsonb(p) into jq from public.get_public_identity_by_qr(qr_a) p; reset role;
  res := res || jsonb_build_object('step', 'with every section OFF the published core identity is unchanged and no hidden value appears anywhere (handle and QR)', 'pass',
    js2->>'display_name' = 'Zed Sec A' and js2->>'bio' = 'Bio for A' and js2->'public_sections' = '{}'::jsonb and jq = js2
    and js2::text !~ ('Test University|[Aa]lice|Hide on bush|GOLD|PLATINUM|KR1a|' || acct_a));

  -- ------------------------------------------------------------------ 13. registry
  select count(*), string_agg(c.section_key, ',' order by c.sort_order) into rec from public.public_section_catalog c where c.active;
  res := res || jsonb_build_object('step', 'the section registry lists exactly discord, steam, league, education_work', 'pass', rec.count = 4 and rec.string_agg = 'discord,steam,league,education_work');

  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
