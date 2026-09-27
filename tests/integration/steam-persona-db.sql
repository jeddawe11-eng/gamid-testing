-- Steam public persona (Round 2) - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/steam-persona-db.sql
-- (Requires migration 20260927130000_steam_public_persona.sql. To validate it BEFORE applying, run the migration's content and this file wrapped together:
--  everything rolls back either way.)
--
-- Creates disposable auth users / identities inside the transaction, impersonates anon / authenticated / service_role exactly as PostgREST does, and ALWAYS raises
-- an exception carrying the results, so the whole transaction rolls back and nothing (no real identity such as @black, no real connection) is touched or persisted.
-- Expected: an error whose message starts with TEST_RESULTS: followed by a JSON array; every element must have "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  ent_a uuid; ent_b uuid;
  qr_a text;
  got text; js jsonb; jq jsonb; row_a record; before_a record; cnt integer;
  steam_a constant text := '76561198000000071';
  steam_b constant text := '76561198000000072';
  avatar constant text := 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
begin
  -- ------------------------------------------------------------------ setup (as postgres): two disposable identities, each with a Steam connection
  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zpersona-a@example.invalid', now()), (ub, 'zpersona-b@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zpersonaa', 'Zed Persona A', date '1990-01-01', 'en'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zpersonab', 'Zed Persona B', date '1990-01-01', 'en'); reset role;
  select e.entity_id into ent_a from public.entities e where e.gamid_handle = 'zpersonaa';
  select e.entity_id into ent_b from public.entities e where e.gamid_handle = 'zpersonab';
  update public.entities set visibility = 'PUBLIC' where entity_id in (ent_a, ent_b);
  select q.public_token into qr_a from public.qr_references q where q.entity_id = ent_a;
  insert into public.gaming_connections (entity_id, provider_key, provider_account_id, provider_username, trust_status, auth_method, is_public)
  values (ent_a, 'steam', steam_a, steam_a, 'CONNECTED', 'STEAM_OPENID_2_0', true), (ent_b, 'steam', steam_b, steam_b, 'CONNECTED', 'STEAM_OPENID_2_0', false);

  -- ------------------------------------------------------------------ 1. schema: two nullable columns, https-only profile address
  select count(*) into cnt from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'gaming_connections' and c.column_name in ('provider_profile_url', 'provider_profile_refreshed_at') and c.is_nullable = 'YES';
  res := res || jsonb_build_object('step', 'gaming_connections has the two new NULLABLE columns (compatible extension)', 'pass', cnt = 2);
  begin update public.gaming_connections set provider_profile_url = 'javascript:alert(1)' where entity_id = ent_a; got := 'NO_ERROR'; exception when check_violation then got := 'CHECK'; end;
  res := res || jsonb_build_object('step', 'a non-https profile address is refused by the column check', 'pass', got = 'CHECK', 'got', got);

  -- ------------------------------------------------------------------ 2. before any summary: the public Steam section is neutral (no persona is invented)
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select i.public_sections into js from public.get_public_identity('zpersonaa') i; reset role;
  res := res || jsonb_build_object('step', 'before any summary the public Steam section has no persona / avatar / profile fields (nothing invented)', 'pass',
    js -> 'steam' ->> 'trust_status' = 'CONNECTED' and not (js -> 'steam' ? 'persona_name') and not (js -> 'steam' ? 'avatar_url') and not (js -> 'steam' ? 'profile_url'), 'got', js -> 'steam');

  -- ------------------------------------------------------------------ 3. only the service role can store a summary
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin got := public.save_steam_profile(steam_a, 'Hacked', null, null); exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'an authenticated user (even the owner) cannot call save_steam_profile', 'pass', got like 'permission denied%', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin got := public.save_steam_profile(steam_a, 'Hacked', null, null); exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'anon cannot call save_steam_profile', 'pass', got like 'permission denied%', 'got', got);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin got := private.save_steam_profile_impl(steam_a, 'Hacked', null, null); exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'the private implementation is not reachable by clients either', 'pass', got like 'permission denied%', 'got', got);

  -- ------------------------------------------------------------------ 4. validation: invalid data writes nothing
  select * into before_a from public.gaming_connections where entity_id = ent_a;
  set local role service_role;
  res := res || jsonb_build_object('step', 'empty persona -> INVALID_DATA', 'pass', public.save_steam_profile(steam_a, '   ', null, null) = 'INVALID_DATA');
  res := res || jsonb_build_object('step', 'persona with a control character -> INVALID_DATA', 'pass', public.save_steam_profile(steam_a, 'bad' || chr(7) || 'name', null, null) = 'INVALID_DATA');
  res := res || jsonb_build_object('step', 'persona over 64 characters -> INVALID_DATA', 'pass', public.save_steam_profile(steam_a, repeat('x', 65), null, null) = 'INVALID_DATA');
  res := res || jsonb_build_object('step', 'an avatar that is not a steamstatic avatar address -> INVALID_DATA', 'pass', public.save_steam_profile(steam_a, 'Ok', 'https://evil.example/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg', null) = 'INVALID_DATA');
  res := res || jsonb_build_object('step', 'a profile address of ANOTHER SteamID -> INVALID_DATA', 'pass', public.save_steam_profile(steam_a, 'Ok', null, 'https://steamcommunity.com/profiles/' || steam_b || '/') = 'INVALID_DATA');
  res := res || jsonb_build_object('step', 'a profile address on another host / http -> INVALID_DATA', 'pass',
    public.save_steam_profile(steam_a, 'Ok', null, 'https://steamcommunity.com.evil.example/id/x/') = 'INVALID_DATA' and public.save_steam_profile(steam_a, 'Ok', null, 'http://steamcommunity.com/id/abc/') = 'INVALID_DATA');
  res := res || jsonb_build_object('step', 'a malformed SteamID -> INVALID_DATA', 'pass', public.save_steam_profile('123', 'Ok', null, null) = 'INVALID_DATA');
  res := res || jsonb_build_object('step', 'a SteamID with no connection -> NOT_CONNECTED', 'pass', public.save_steam_profile('76561198000000079', 'Ok', null, null) = 'NOT_CONNECTED');
  reset role;
  select * into row_a from public.gaming_connections where entity_id = ent_a;
  res := res || jsonb_build_object('step', 'none of the refused calls changed the row', 'pass',
    row_a.provider_display_name is not distinct from before_a.provider_display_name and row_a.provider_avatar_url is not distinct from before_a.provider_avatar_url
    and row_a.provider_profile_url is null and row_a.provider_profile_refreshed_at is null);

  -- ------------------------------------------------------------------ 5. a valid summary is stored on THAT connection only
  set local role service_role;
  got := public.save_steam_profile(steam_a, '  Espada <b>Steam</b>  ', avatar, 'https://steamcommunity.com/profiles/' || steam_a || '/');
  reset role;
  select * into row_a from public.gaming_connections where entity_id = ent_a;
  res := res || jsonb_build_object('step', 'a valid summary is SAVED: persona trimmed (markup kept as plain text), avatar and Steam''s own profile address stored, refresh time set', 'pass',
    got = 'SAVED' and row_a.provider_display_name = 'Espada <b>Steam</b>' and row_a.provider_avatar_url = avatar and row_a.provider_profile_url = 'https://steamcommunity.com/profiles/' || steam_a || '/'
    and row_a.provider_profile_refreshed_at is not null and row_a.provider_account_id = steam_a and row_a.provider_username = steam_a and row_a.is_public and row_a.trust_status = 'CONNECTED', 'got', got);
  select count(*) into cnt from public.gaming_connections g where g.entity_id = ent_b and g.provider_display_name is null and g.provider_profile_url is null;
  res := res || jsonb_build_object('step', 'the other account''s connection is untouched', 'pass', cnt = 1);

  -- ------------------------------------------------------------------ 6. the public boundary
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select i.public_sections into js from public.get_public_identity('zpersonaa') i;
  select i.public_sections into jq from public.get_public_identity_by_qr(qr_a) i;
  reset role;
  res := res || jsonb_build_object('step', 'a visitor gets persona_name, avatar_url and profile_url in the public Steam section (still CONNECTED, never VERIFIED)', 'pass',
    js -> 'steam' ->> 'persona_name' = 'Espada <b>Steam</b>' and js -> 'steam' ->> 'avatar_url' = avatar and js -> 'steam' ->> 'profile_url' = 'https://steamcommunity.com/profiles/' || steam_a || '/'
    and js -> 'steam' ->> 'trust_status' = 'CONNECTED', 'got', js -> 'steam');
  res := res || jsonb_build_object('step', 'the QR route returns the same Steam section', 'pass', jq -> 'steam' = js -> 'steam');
  res := res || jsonb_build_object('step', 'nothing internal leaks (no refresh time, connection/entity ids, auth method)', 'pass',
    not ((js -> 'steam')::text ~* 'refreshed|connection_id|entity_id|auth_method|STEAM_OPENID'));
  set local role service_role; got := public.save_steam_profile(steam_b, 'Private Persona', null, 'https://steamcommunity.com/id/zprivate/'); reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon; select i.public_sections into js from public.get_public_identity('zpersonab') i; reset role;
  res := res || jsonb_build_object('step', 'a Steam connection that is NOT public shows no Steam section at all, even with a stored persona', 'pass', got = 'SAVED' and not (coalesce(js, '{}'::jsonb) ? 'steam'), 'got', js);

  -- ------------------------------------------------------------------ 7. a later refresh replaces the summary (a removed avatar becomes null, not stale)
  set local role service_role; got := public.save_steam_profile(steam_a, 'Renamed', null, 'https://steamcommunity.com/id/zrenamed/'); reset role;
  select * into row_a from public.gaming_connections where entity_id = ent_a;
  res := res || jsonb_build_object('step', 'a refresh replaces persona / avatar / profile address', 'pass', got = 'SAVED' and row_a.provider_display_name = 'Renamed' and row_a.provider_avatar_url is null and row_a.provider_profile_url = 'https://steamcommunity.com/id/zrenamed/');

  raise exception 'TEST_RESULTS:%', res::text;
end;
$test$;
