-- Public My Games: a compact game library on the public GamID, a visitor search over THAT identity's own games, and two owner switches. TESTING only.
--
-- What is public here, and why it is safe:
--   * Nothing is public unless the GamID is published AND the owner switched "Show My Games on my GamID" ON (default OFF for every existing and future
--     identity - no backfill). When it is OFF the function returns nothing at all: no game, no count, no name. The gate is in the database, not in the page.
--   * The library is the identity's OWN games only: games a connected provider discovered (public.discovered_games) plus the platforms the owner declared
--     (public.entity_game_platforms), merged into ONE row per canonical game_key exactly like the private My Games library. The 27k-game catalog is never
--     listed or searched here: a search only ever narrows this identity's own rows (a name or alias of a game the identity has).
--   * Provenance is carried through untouched and never upgraded: a provider-discovered game says DISCOVERED_FROM_<PROVIDER>, a declaration says MANUAL.
--     Nothing in this file can produce VERIFIED, and Discord is not a game source (only public.discovered_games rows create games, and only Steam writes them).
--   * Platforms shown are THIS identity's platforms for the game (what a provider established + what the owner declared), never the catalog's release list.
--   * Playtime is included ONLY when private.public_game_playtime_allowed() says so (the accepted "Show playtime on my GamID" gate). It is never used to order,
--     filter or count, so a hidden playtime cannot leak through the order of the rows either.
--   * Ranks / stats are included ONLY when the new, independent "Show ranks & stats on my GamID" switch is ON, and only for data the owner already allowed
--     publicly (League: the existing League section switch; Game Profiles: is_public). League keeps its PROTOTYPE / UNVERIFIED truth.
--   * The response carries no connection id, provider account id (SteamID), Steam app id, icon reference, token, timestamp of discovery or internal id.
-- The existing accepted public boundary keeps its 14 columns; one more allowlisted section (my_games: at most the first 6 rows + the counts) is added inside
-- public_sections, so the profile needs no extra request. Nothing here touches, updates or deletes an existing row (connections, discovered games, manual
-- declarations, League, Game Profiles, visibility flags, @black).

-- ---------------------------------------------------------------------------------------------
-- 1. The two new owner-controlled switches (same shape as profiles.show_game_playtime: on the row they control, OFF for everyone, flipped only by the owner)
-- ---------------------------------------------------------------------------------------------
alter table public.profiles add column show_my_games boolean not null default false;
alter table public.profiles add column show_game_stats boolean not null default false;

create function private.get_my_public_games_settings_impl()
returns table (show_my_games boolean, show_game_stats boolean)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  return query select coalesce(p.show_my_games, false), coalesce(p.show_game_stats, false) from public.profiles p where p.entity_id = owned_entity_id;
end;
$$;

-- Flips ONE of the two switches for the caller's own identity. It never touches a game, a declaration, a connection, a section switch, the playtime switch or a timestamp.
create function private.set_my_public_games_setting_impl(candidate_setting text, candidate_visible boolean)
returns table (setting text, is_on boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  which text := lower(btrim(candidate_setting));
  owned_entity_id uuid;
  changed integer;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if candidate_visible is null then raise exception using errcode = '22023', message = 'INVALID_VISIBILITY'; end if;
  if which is null or which not in ('my_games', 'stats') then raise exception using errcode = '22023', message = 'INVALID_SETTING'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  if which = 'my_games' then
    update public.profiles p set show_my_games = candidate_visible where p.entity_id = owned_entity_id;
  else
    update public.profiles p set show_game_stats = candidate_visible where p.entity_id = owned_entity_id;
  end if;
  get diagnostics changed = row_count;
  if changed = 0 then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  return query select which, candidate_visible;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. The gates. Not granted to any client role (only other private functions call them).
--    Both need the GamID to be published; the playtime gate (private.public_game_playtime_allowed) is the accepted one and is reused as is.
-- ---------------------------------------------------------------------------------------------
create function private.public_my_games_allowed(candidate_entity_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select p.show_my_games and e.visibility = 'PUBLIC'
    from public.profiles p
    join public.entities e on e.entity_id = p.entity_id
    where p.entity_id = candidate_entity_id
  ), false);
$$;

create function private.public_game_stats_allowed(candidate_entity_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select p.show_game_stats and p.show_my_games and e.visibility = 'PUBLIC'
    from public.profiles p
    join public.entities e on e.entity_id = p.entity_id
    where p.entity_id = candidate_entity_id
  ), false);
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. The public library of one identity. Returns NULL when the gate is closed. Otherwise:
--      { library_count, total_count, games: [ {name, year?, sources[], platforms[], playtime_minutes?, stats?} ] }
--    library_count = every game of the identity; total_count = the games matching the (optional) search; games = one bounded page (at most 50).
--    ORDER (deterministic, no private data): 1) search relevance (exact name, name prefix, word start, anything else) when a search is given,
--    2) games the owner declared by hand first (a deliberate, usually short list must not disappear behind a long provider library - the same rule as the
--    private My Games), 3) name A-Z (normalized), 4) canonical key. Playtime never takes part.
--    Merge: one row per canonical game_key. A discovered game the catalog cannot map yet stays its own row (never dropped, never merged by name).
-- ---------------------------------------------------------------------------------------------
create function private.public_my_games(candidate_entity_id uuid, candidate_query text, candidate_limit integer, candidate_offset integer)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  max_rows integer := least(greatest(coalesce(candidate_limit, 30), 0), 50);
  skip_rows integer := greatest(coalesce(candidate_offset, 0), 0);
  spaced text := private.game_search_normalize(left(candidate_query, 80));
  compact text;
  no_match boolean;
  with_playtime boolean;
  with_stats boolean;
  result jsonb;
begin
  if not private.public_my_games_allowed(candidate_entity_id) then return null; end if;
  compact := replace(spaced, ' ', '');
  -- something was typed, but nothing searchable is left after normalizing (only punctuation / wildcards): that matches nothing, it is not "show everything"
  no_match := btrim(coalesce(candidate_query, '')) <> '' and compact = '';
  with_playtime := private.public_game_playtime_allowed(candidate_entity_id);
  with_stats := private.public_game_stats_allowed(candidate_entity_id);

  with disc as (
    -- what connected providers discovered, resolved to a canonical key exactly like the owner's private list (recognition map first, then the catalog's provider ids)
    select d.source_provider, d.external_game_id, nullif(btrim(coalesce(d.game_name, '')), '') as game_name, d.playtime_minutes,
      coalesce(k.game_key, case when c.game_key is not null then cp.game_key end) as gkey
    from public.discovered_games d
    join public.gaming_connections g on g.connection_id = d.connection_id and g.entity_id = candidate_entity_id
    left join public.known_game_sources k on k.source_provider = d.source_provider and k.external_game_id = d.external_game_id
    left join public.game_catalog_provider_ids cp on cp.provider = d.source_provider and cp.external_id = d.external_game_id
    left join public.game_catalog c on c.game_key = cp.game_key and c.is_active
    where d.entity_id = candidate_entity_id
  ), disc_g as (
    select coalesce(x.gkey, 'x:' || x.source_provider || ':' || x.external_game_id) as gid, x.gkey,
      min(x.game_name) as steam_name,
      sum(x.playtime_minutes) as minutes,
      array_agg(distinct 'DISCOVERED_FROM_' || upper(x.source_provider)) as disc_sources,
      (select jsonb_agg(jsonb_build_object('key', p.platform_key, 'label', p.display_name, 'source', 'DISCOVERED_FROM_' || upper(p.provider_key)) order by p.sort_order, p.platform_key)
       from public.game_platforms p where p.provider_key = any (array_agg(distinct x.source_provider)) and p.is_active) as platforms
    from disc x
    group by 1, 2
  ), man as (
    -- the owner's own declarations: MANUAL by construction
    select x.game_key as gkey,
      jsonb_agg(jsonb_build_object('key', p.platform_key, 'label', p.display_name, 'source', 'MANUAL') order by p.sort_order, p.platform_key) as platforms
    from public.entity_game_platforms x
    join public.game_platforms p on p.platform_key = x.platform_key
    where x.entity_id = candidate_entity_id
    group by x.game_key
  ), gp as (
    -- Game Profiles: ONLY through the accepted public gate (public rows of a published identity; never the identity reference or the verification details)
    select x as prof, x ->> 'game_key' as gkey
    from jsonb_array_elements(case when with_stats then private.public_game_profiles(candidate_entity_id) else '[]'::jsonb end) x
  ), lib as (
    select coalesce(dg.gid, 'k:' || m.gkey) as gid, coalesce(dg.gkey, m.gkey) as gkey,
      coalesce(c.display_name, dg.steam_name) as name, c.release_year as year,
      dg.minutes, dg.steam_name,
      (coalesce(dg.disc_sources, array[]::text[]) || case when m.gkey is not null then array['MANUAL'] else array[]::text[] end) as sources,
      (coalesce(dg.platforms, '[]'::jsonb) || coalesce(m.platforms, '[]'::jsonb)) as platforms,
      (m.gkey is not null) as has_manual
    from disc_g dg
    full outer join man m on dg.gkey = m.gkey
    left join public.game_catalog c on c.game_key = coalesce(dg.gkey, m.gkey)
  ), named as (
    select l.*, private.game_search_normalize(l.name) as sort_name from lib l where l.name is not null
  ), scored as (
    select n.*, replace(n.sort_name, ' ', '') as name_compact,
      (not no_match and (compact = ''
        or replace(n.sort_name, ' ', '') like '%' || compact || '%'
        or replace(private.game_search_normalize(n.steam_name), ' ', '') like '%' || compact || '%'
        or (n.gkey is not null and exists (select 1 from public.game_catalog_aliases a where a.game_key = n.gkey and a.search_key like '%' || compact || '%')))) as hit
    from named n
  ), ranked as (
    select s.*,
      case when compact = '' then 0
           when s.name_compact = compact then 0
           when s.name_compact like compact || '%' then 1
           when s.sort_name like '% ' || spaced || '%' then 2
           else 3 end as tier,
      count(*) over () as library_count,
      count(*) filter (where s.hit) over () as hit_count
    from scored s
  ), paged as (
    select r.*,
      case when r.hit then row_number() over (partition by r.hit order by
        r.tier, case when r.has_manual then 0 else 1 end, r.sort_name collate "C", coalesce(r.gkey, r.gid) collate "C") end as rn
    from ranked r
  )
  select jsonb_build_object(
      'library_count', coalesce(max(p.library_count), 0),
      'total_count', coalesce(max(p.hit_count), 0),
      'games', coalesce(jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'name', p.name,
          'year', p.year,
          'sources', to_jsonb(p.sources),
          'platforms', p.platforms,
          'playtime_minutes', case when with_playtime and p.minutes > 0 then p.minutes end,
          'stats', case when with_stats then (
            select nullif(jsonb_strip_nulls(jsonb_build_object(
              'league', (select jsonb_build_object(
                  'solo_rank_state', l.solo_rank_state, 'solo_tier', l.solo_tier, 'solo_division', l.solo_division, 'solo_lp', l.solo_lp,
                  'solo_wins', l.solo_wins, 'solo_losses', l.solo_losses, 'data_source', l.data_source,
                  'trust_status', l.trust_status, 'fetched_at', l.fetched_at, 'is_public', true)
                from public.league_profiles l where p.gkey = 'league_of_legends' and l.entity_id = candidate_entity_id and l.is_public),
              'profile', (select g.prof from gp g where p.gkey is not null and p.gkey <> 'league_of_legends' and g.gkey = p.gkey limit 1))),
              '{}'::jsonb)
          ) end
        )) order by p.rn) filter (where p.rn > skip_rows and p.rn <= skip_rows + max_rows), '[]'::jsonb))
  into result
  from paged p;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. The anonymous public function (established security-invoker wrapper + private-impl pattern). Returns NO ROW for an unknown / unpublished GamID and
--    for one whose owner has My Games switched OFF, so those cases cannot be told apart from each other by a visitor.
-- ---------------------------------------------------------------------------------------------
create function private.get_public_my_games_impl(candidate_handle text, candidate_query text, candidate_limit integer, candidate_offset integer)
returns table (library_count integer, total_count integer, games jsonb)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  found_entity uuid;
  page jsonb;
begin
  select e.entity_id into found_entity
  from public.entities e
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC'
  limit 1;
  if found_entity is null then return; end if;
  page := private.public_my_games(found_entity, candidate_query, candidate_limit, candidate_offset);
  if page is null then return; end if;
  return query select (page ->> 'library_count')::integer, (page ->> 'total_count')::integer, page -> 'games';
end;
$$;

create function public.get_public_my_games(candidate_handle text, candidate_query text default null, candidate_limit integer default 30, candidate_offset integer default 0)
returns table (library_count integer, total_count integer, games jsonb)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_public_my_games_impl(candidate_handle, candidate_query, candidate_limit, candidate_offset); $$;

-- ---------------------------------------------------------------------------------------------
-- 5. Owner wrappers
-- ---------------------------------------------------------------------------------------------
create function public.get_my_public_games_settings()
returns table (show_my_games boolean, show_game_stats boolean)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_public_games_settings_impl(); $$;

create function public.set_my_public_games_setting(candidate_setting text, candidate_visible boolean)
returns table (setting text, is_on boolean)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.set_my_public_games_setting_impl(candidate_setting, candidate_visible); $$;

-- ---------------------------------------------------------------------------------------------
-- 6. The public-safe identity boundary: same function, same 14 columns; ONE more allowlisted section ('my_games': the first six rows and the counts, only when the
--    gate is open and there is at least one game). Everything else is exactly what it was.
-- ---------------------------------------------------------------------------------------------
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
        -- League: Riot ID, region, Solo/Duo rank, icon id, and the truth about where it came from (manual / unverified source)
        -- with freshness. NOT exposed: source URL, lookup state/errors, throttle ledger, reservations, internal ids.
        select 'league'::text,
          jsonb_strip_nulls(jsonb_build_object(
            'game_name', l.game_name, 'tag_line', l.tag_line, 'platform_id', l.platform_id,
            'rank_state', l.solo_rank_state, 'tier', l.solo_tier, 'division', l.solo_division, 'lp', l.solo_lp,
            'wins', l.solo_wins, 'losses', l.solo_losses, 'profile_icon_id', l.profile_icon_id,
            'trust_status', l.trust_status, 'identity_source', l.identity_source, 'data_source', l.data_source,
            'updated_at', l.fetched_at))
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

-- ---------------------------------------------------------------------------------------------
-- 7. Privileges. The gates and the library builder are called only by other private functions (which run as their owner); clients get exactly:
--    anon + authenticated -> get_public_my_games (and the unchanged identity functions); authenticated only -> the two owner settings functions.
-- ---------------------------------------------------------------------------------------------
revoke all on function
  private.get_my_public_games_settings_impl(), private.set_my_public_games_setting_impl(text, boolean),
  private.public_my_games_allowed(uuid), private.public_game_stats_allowed(uuid), private.public_my_games(uuid, text, integer, integer),
  private.get_public_my_games_impl(text, text, integer, integer),
  public.get_public_my_games(text, text, integer, integer), public.get_my_public_games_settings(), public.set_my_public_games_setting(text, boolean)
from public, anon, authenticated;

grant execute on function
  private.get_my_public_games_settings_impl(), private.set_my_public_games_setting_impl(text, boolean),
  public.get_my_public_games_settings(), public.set_my_public_games_setting(text, boolean)
to authenticated;

grant execute on function private.get_public_my_games_impl(text, text, integer, integer), public.get_public_my_games(text, text, integer, integer) to anon, authenticated;
