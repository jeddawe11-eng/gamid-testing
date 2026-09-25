-- GamID Play Together — add the official League Middle East shard to the managed region catalog.
-- Riot announced the Middle East server in Patch 14.11 and opened it on 2024-06-25.
-- ME1 is already the accepted canonical platform identity used by GamID's League profile contract.

insert into public.play_together_regions
  (region_key, game_key, official_name, riot_platform_id, riot_regional_route, is_active, sort_order, source_url, verified_on)
values
  ('me1', 'league_of_legends', 'Middle East', 'ME1', 'EUROPE', true, 75,
   'https://www.leagueoflegends.com/en-au/news/game-updates/patch-14-11-notes/', '2026-09-24');
