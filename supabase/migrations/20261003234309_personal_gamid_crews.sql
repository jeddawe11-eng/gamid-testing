-- My Crew on Personal GamID: extend the existing public identity boundary only.
-- Existing PUBLIC GamID gate, Duo rules, QR delegation, RPC grants and table RLS stay intact.
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
        union all
        -- My Duo: only an ACCEPTED Duo, only while THIS owner's own switch is ON, and only while the Duo's GamID is itself published (an unpublished Duo simply
        -- disappears; the relationship is kept). Only the Duo's @handle, display name and avatar path - the same fields the Duo's own public GamID shows.
        select 'duo'::text,
          jsonb_strip_nulls(jsonb_build_object('gamid_handle', d.gamid_handle, 'display_name', d.display_name, 'avatar_media_reference', d.avatar_media_reference))
        from public.identity_relationships ir
        join public.entities d on d.entity_id = case when ir.requester_entity_id = e.entity_id then ir.addressee_entity_id else ir.requester_entity_id end
        where ir.kind = 'DUO' and ir.status = 'ACCEPTED'
          and ((ir.requester_entity_id = e.entity_id and ir.requester_shows_public) or (ir.addressee_entity_id = e.entity_id and ir.addressee_shows_public))
          and d.entity_type = 'SOLO' and d.visibility = 'PUBLIC'
        union all
        -- Automatic My Crew V1: this PUBLIC GamID's ACTIVE memberships in existing,
        -- published Crew Walls. No owner-only filter and no new visibility toggle.
        select 'crews'::text, visible.payload
        from (
          select jsonb_agg(jsonb_build_object(
            'crew_id', c.crew_id, 'crew_name', c.name,
            'game_key', c.game_key, 'game_name', g.display_name, 'role', cm.role,
            'member_count', (select count(*) from public.crew_members members
                             where members.crew_id = c.crew_id and members.status = 'ACTIVE')
          ) order by g.display_name, c.game_key, c.crew_id) as payload
          from public.crew_members cm
          join public.crews c on c.crew_id = cm.crew_id and c.game_key = cm.game_key
          join public.crew_walls cw on cw.crew_id = c.crew_id and cw.published
          join public.game_catalog g on g.game_key = c.game_key
          where cm.entity_id = e.entity_id and cm.status = 'ACTIVE'
        ) visible
        where visible.payload is not null
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
