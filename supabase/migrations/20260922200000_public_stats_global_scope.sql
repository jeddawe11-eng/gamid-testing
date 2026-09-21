-- "Show ranks & stats on my GamID" is a GLOBAL public-GamID privacy control, not a Public My Games control. TESTING only.
--
-- Bug found in manual acceptance: with the switch OFF, the existing public League card still showed "Bronze IV · 7 LP · 2W 3L", because the League section of
-- get_public_identity (older than the switch) always carried the rank fields, and the switch only gated the stats inside Public My Games.
--
-- Fix, in the database (nothing is hidden by CSS / JavaScript):
--   1. private.public_game_stats_allowed no longer needs Show My Games. It is now: the GamID is published AND the owner switched "Show ranks & stats" ON.
--      (Public My Games still needs its own Show My Games gate to return anything at all, so nothing new can appear there.)
--   2. The League section of get_public_identity / get_public_identity_by_qr carries the League IDENTITY always (when the League section switch is public):
--      Riot ID, region, icon id, trust label, source, freshness. The rank / stat fields (rank_state, tier, division, lp, wins, losses) are added ONLY while
--      the gate above is open; otherwise they are not in the response at all.
-- Precedence is unchanged: League "Show on my GamID" OFF -> no League section (as before); ON + stats OFF -> identity without rank / stats; ON + stats ON ->
-- the existing rank / stats, still MANUAL / PROTOTYPE / UNVERIFIED (data_source OPGG_TEMPORARY). Playtime is unchanged: it appears only inside Public My Games,
-- behind its accepted gate. No table, column, row, connection, League row or visibility flag is touched.

create or replace function private.public_game_stats_allowed(candidate_entity_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select p.show_game_stats and e.visibility = 'PUBLIC'
    from public.profiles p
    join public.entities e on e.entity_id = p.entity_id
    where p.entity_id = candidate_entity_id
  ), false);
$$;

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
        -- Steam: the SteamID64 Steam authenticated, and the trust label (CONNECTED - never VERIFIED, and no game claim of any kind).
        select 'steam'::text,
          jsonb_strip_nulls(jsonb_build_object(
            'steam_id', g.provider_account_id, 'trust_status', g.trust_status))
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
