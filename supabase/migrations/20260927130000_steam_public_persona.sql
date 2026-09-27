-- Steam public identity: persona name, avatar and the real profile address instead of a raw SteamID64 (Round 2) - GamID TESTING only.
--
-- Until now a public Steam connection could only show the SteamID64 (no Steam Web API was called for a name). Visitors should see who the account IS, not an
-- internal number, and nothing may be invented. So:
--   1. gaming_connections gains two NULLABLE columns (a minimal, compatible provider-metadata extension; no existing row or column changes):
--        provider_profile_url            the profile address exactly as Steam's official GetPlayerSummaries returned it (never built by GamID)
--        provider_profile_refreshed_at   when that summary was last stored
--      The existing provider_display_name / provider_avatar_url columns hold the persona name and avatar.
--   2. public.save_steam_profile(steam_id, persona, avatar_url, profile_url) - SERVICE ROLE ONLY. The Edge Functions call it after they obtained the SteamID64 from an
--      authenticated source (the verified OpenID callback, or the owner's own reserved refresh) and fetched the summary with the server-side key. Every value is
--      re-checked here: persona 1..64 characters without control characters; avatar only https://avatars[.akamai|.cloudflare|.fastly].steamstatic.com/<40 hex>[_full|
--      _medium].jpg; profile only https://steamcommunity.com/id/<vanity>/ or https://steamcommunity.com/profiles/<THIS SteamID64>/. Anything else -> INVALID_DATA and
--      nothing is written. It updates only the connection whose provider_account_id is that SteamID64.
--   3. The public Steam section (get_public_identity / get_public_identity_by_qr, which delegates to the same impl) adds persona_name, avatar_url and profile_url when
--      stored. steam_id stays in the response for compatibility (it is the public identifier of a Steam profile); GamID pages no longer DISPLAY it to visitors.
-- RLS, grants and every other section are unchanged.

alter table public.gaming_connections
  add column if not exists provider_profile_url text
    check (provider_profile_url is null or (char_length(provider_profile_url) <= 200 and provider_profile_url ~ '^https://')),
  add column if not exists provider_profile_refreshed_at timestamptz;

create or replace function private.save_steam_profile_impl(candidate_steam_id text, candidate_persona text, candidate_avatar_url text, candidate_profile_url text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  persona text := btrim(coalesce(candidate_persona, ''));
  changed integer;
begin
  if candidate_steam_id is null or candidate_steam_id !~ '^[0-9]{17}$' then return 'INVALID_DATA'; end if;
  if char_length(persona) < 1 or char_length(persona) > 64 or persona ~ '[[:cntrl:]]' then return 'INVALID_DATA'; end if;
  if candidate_avatar_url is not null
     and candidate_avatar_url !~ '^https://avatars\.(akamai\.|cloudflare\.|fastly\.)?steamstatic\.com/[0-9a-f]{40}(_full|_medium)?\.jpg$' then
    return 'INVALID_DATA';
  end if;
  if candidate_profile_url is not null
     and candidate_profile_url !~ '^https://steamcommunity\.com/id/[A-Za-z0-9_-]{2,32}/?$'
     and candidate_profile_url <> 'https://steamcommunity.com/profiles/' || candidate_steam_id || '/'
     and candidate_profile_url <> 'https://steamcommunity.com/profiles/' || candidate_steam_id then
    return 'INVALID_DATA';
  end if;
  update public.gaming_connections g
     set provider_display_name = persona,
         provider_avatar_url = candidate_avatar_url,
         provider_profile_url = candidate_profile_url,
         provider_profile_refreshed_at = now(),
         updated_at = now()
   where g.provider_key = 'steam' and g.provider_account_id = candidate_steam_id;
  get diagnostics changed = row_count;
  return case when changed > 0 then 'SAVED' else 'NOT_CONNECTED' end;
end;
$$;

create or replace function public.save_steam_profile(candidate_steam_id text, candidate_persona text, candidate_avatar_url text, candidate_profile_url text)
returns text
language plpgsql volatile security invoker
set search_path = ''
as $$ begin if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'; end if; return private.save_steam_profile_impl(candidate_steam_id, candidate_persona, candidate_avatar_url, candidate_profile_url); end; $$;

revoke all on function private.save_steam_profile_impl(text, text, text, text), public.save_steam_profile(text, text, text, text) from public, anon, authenticated;
grant execute on function private.save_steam_profile_impl(text, text, text, text), public.save_steam_profile(text, text, text, text) to service_role;

create or replace function private.get_public_identity_impl(candidate_handle text)
returns table (
  gamid_handle text,
  display_name text,
  avatar_media_reference text,
  bio text,
  role_keys text[],
  primary_role_key text,
  role_catalog jsonb,
  education_work_status text,
  institution text,
  field_of_study text,
  education_work_catalog jsonb,
  intro_transition_key text,
  intro_derivative_path text,
  public_sections jsonb
)
language sql stable security definer
set search_path = ''
as $$
  select e.gamid_handle, e.display_name, e.avatar_media_reference, p.bio,
    coalesce((select array_agg(r.role_key order by r.sort_order) from public.profile_gaming_roles r where r.profile_id = p.profile_id), array[]::text[]),
    (select r.role_key from public.profile_gaming_roles r where r.profile_id = p.profile_id and r.is_primary),
    (select jsonb_agg(jsonb_build_object('key', c.role_key, 'label', c.label) order by c.sort_order) from public.gaming_role_catalog c where c.active),
    -- Education & Work: returned only while its switch is ON, otherwise NULL (the values never leave the database)
    case when p.show_education_work then p.education_work_status end,
    case when p.show_education_work then p.institution end,
    case when p.show_education_work then p.field_of_study end,
    case when p.show_education_work then (select jsonb_agg(jsonb_build_object('key', c.status_key, 'label', c.label) order by c.sort_order) from public.education_work_status_catalog c where c.active) end,
    coalesce(s.transition_key, 'fade'),
    active.derivative_path,
    -- Optional sections: ONLY those whose switch is ON appear, and only the approved presentation fields.
    (
      select coalesce(jsonb_object_agg(x.section_key, x.payload), '{}'::jsonb)
      from (
        -- Discord: display name, username, trust label. NOT exposed: the Discord account id (and the avatar URL, which embeds it),
        -- tokens, timestamps, connection ids, diagnostics/discovery.
        select 'discord'::text as section_key,
          jsonb_strip_nulls(jsonb_build_object(
            'display_name', g.provider_display_name, 'username', g.provider_username, 'trust_status', g.trust_status)) as payload
        from public.gaming_connections g
        where g.entity_id = e.entity_id and g.provider_key = 'discord' and g.is_public
        union all
        -- Steam: the trust label (CONNECTED - never VERIFIED, and no game claim of any kind), the SteamID64 Steam authenticated (kept for compatibility, not
        -- displayed to visitors), and - once stored from Steam's official GetPlayerSummaries - the persona name, avatar and Steam's own profile address.
        select 'steam'::text,
          jsonb_strip_nulls(jsonb_build_object(
            'steam_id', g.provider_account_id, 'trust_status', g.trust_status,
            'persona_name', g.provider_display_name, 'avatar_url', g.provider_avatar_url, 'profile_url', g.provider_profile_url))
        from public.gaming_connections g
        where g.entity_id = e.entity_id and g.provider_key = 'steam' and g.is_public
        union all
        -- League: the IDENTITY (Riot ID, region, icon id) and the truth about where it came from (manual / unverified source) with freshness are returned whenever the
        -- League section is public. The RANK / STAT fields are a separate, global privacy scope: they are added only while "Show ranks & stats on my GamID" is ON
        -- (private.public_game_stats_allowed) and are otherwise not in the response at all. NOT exposed: source URL, lookup state/errors, throttle ledger, reservations, internal ids.
        select 'league'::text,
          jsonb_strip_nulls(
            jsonb_build_object(
              'game_name', l.game_name, 'tag_line', l.tag_line, 'platform_id', l.platform_id, 'profile_icon_id', l.profile_icon_id,
              'trust_status', l.trust_status, 'identity_source', l.identity_source, 'data_source', l.data_source, 'updated_at', l.fetched_at)
            || case when private.public_game_stats_allowed(e.entity_id)
                 then jsonb_build_object(
                   'rank_state', l.solo_rank_state, 'tier', l.solo_tier, 'division', l.solo_division, 'lp', l.solo_lp,
                   'wins', l.solo_wins, 'losses', l.solo_losses)
                 else '{}'::jsonb end)
        from public.league_profiles l
        where l.entity_id = e.entity_id and l.is_public
        union all
        -- My Games: only when the owner switched it ON (private.public_my_games returns NULL otherwise) and there is at least one game. The first six rows in the
        -- library's own deterministic order + the counts; hidden playtime / stats are omitted by the same function, never filtered afterwards.
        select 'my_games'::text, m.payload
        from (select private.public_my_games(e.entity_id, null, 6, 0) as payload) m
        where m.payload is not null and (m.payload ->> 'library_count')::integer > 0
      ) x
    )
  from public.entities e
  join public.profiles p on p.entity_id = e.entity_id
  left join public.profile_intro_settings s on s.profile_id = p.profile_id
  left join public.intro_processing_jobs active on active.job_id = s.active_job_id and active.state = 'ready'
  where e.gamid_handle = private.normalize_handle(candidate_handle)
    and e.entity_type = 'SOLO'
    and e.visibility = 'PUBLIC'
  limit 1;
$$;
