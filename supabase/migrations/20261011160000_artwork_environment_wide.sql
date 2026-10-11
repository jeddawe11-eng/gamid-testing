-- Game artwork for every TESTING account (Mazen 2026-10-11, product-owner decision) - GamID TESTING only.
--
-- Removes the per-account evaluation allowlist added by 20261011140000: artwork is now an environment-wide setting. The only gate is the TESTING-wide
-- switch private.game_artwork_settings.enabled (the kill switch); every account resolves artwork the same way. Matching, caching, rate limits, the
-- provider-CDN checks and the server-side key are unchanged. SteamGridDB's written permission for distribution / commercial use is still outstanding
-- (docs/GAME-ARTWORK-STEAMGRIDDB.md); this enables TESTING only.

-- (body identical to 20261011100000_classic_profile_consolidated.sql: 'enabled' is the environment-wide switch)
create or replace function public.game_artwork_targets(candidate_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with e as (select x.entity_id from public.entities x where x.gamid_handle = private.normalize_handle(candidate_handle) and x.entity_type = 'SOLO' and x.visibility = 'PUBLIC'),
  lib as (
    select distinct k.gkey from (
      select gp.game_key gkey from public.entity_game_platforms gp join e on gp.entity_id = e.entity_id
      union all
      select coalesce(kg.game_key, cp.game_key) from public.discovered_games d join e on d.entity_id = e.entity_id
        left join public.known_game_sources kg on kg.source_provider = d.source_provider and kg.external_game_id = d.external_game_id
        left join public.game_catalog_provider_ids cp on cp.provider = d.source_provider and cp.external_id = d.external_game_id) k
    where k.gkey is not null and exists (select 1 from e where private.public_my_games_allowed(e.entity_id))
  ),
  wanted as (
    select gkey, 'my_games' purpose from lib
    union all select 'league_of_legends', 'connected' from e where exists (select 1 from public.league_profiles l where l.entity_id = e.entity_id and l.is_public)
    union all select c.game_key, 'crews' from e join public.crew_members cm on cm.entity_id = e.entity_id and cm.status = 'ACTIVE'
      join public.crews c on c.crew_id = cm.crew_id join public.crew_walls w on w.crew_id = c.crew_id and w.published
  )
  select jsonb_build_object(
    'enabled', (select s.enabled from private.game_artwork_settings s where s.singleton),
    'games', coalesce((select jsonb_agg(jsonb_build_object('game_key', g.game_key, 'name', g.display_name, 'year', g.release_year, 'purposes', w.purposes,
        'steam_appid', (select min(p.external_id::bigint) from public.game_catalog_provider_ids p where p.game_key = g.game_key and p.provider = 'steam' and p.external_id ~ '^[0-9]{1,10}$')))
      from (select gkey, jsonb_agg(distinct purpose) purposes from wanted group by gkey) w join public.game_catalog g on g.game_key = w.gkey and g.is_active), '[]'::jsonb));
$$;
revoke all on function public.game_artwork_targets(text) from public, anon, authenticated;
grant execute on function public.game_artwork_targets(text) to service_role;

alter table private.game_artwork_settings drop column evaluation_handles;
