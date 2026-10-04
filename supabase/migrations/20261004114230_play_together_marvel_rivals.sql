-- Marvel Rivals Play Now (TESTING): reuse the existing catalog and session engine.
-- Competitive remains unavailable by product decision until rank/placement rules are supported.
-- No user/session/Wall data is changed.
alter table public.play_together_rule_sets drop constraint play_together_rule_sets_official_source_url_check;
alter table public.play_together_rule_sets add constraint play_together_rule_sets_official_source_url_check check
 (official_source_url ~ '^https://(www[.])?(leagueoflegends[.]com|teamfighttactics[.]leagueoflegends[.]com|developer[.]riotgames[.]com|static[.]developer[.]riotgames[.]com|support-leagueoflegends[.]riotgames[.]com|support-teamfighttactics[.]riotgames[.]com|marvelrivals[.]com)/');
-- Legacy Riot fields remain intact for League; other publishers must not invent Riot identities.
alter table public.play_together_regions alter column riot_platform_id drop not null;
alter table public.play_together_regions alter column riot_regional_route drop not null;
alter table public.play_together_regions add constraint play_together_regions_riot_identity check
 (game_key <> 'league_of_legends' or (riot_platform_id is not null and riot_regional_route is not null));

insert into public.play_together_rule_sets(game_key,version_key,availability,verified_on,official_source_url,source_note)
values('marvel_rivals','marvel-rivals-2026-10-04','ACTIVE','2026-10-04','https://www.marvelrivals.com/guide/server/',
 'Official server guide; Quick Match 6v6; current Season 10 notes reviewed. Competitive disabled pending rank/placement-aware rules.');
insert into public.play_together_experiences values
 ('mr_standard','marvel_rivals','Standard','MODE_FAMILY',100,true);
insert into public.play_together_queues
 (queue_key,experience_key,rule_set_id,official_name,availability,ranked,team_size,max_premade_party_size,roles_applicability,region_scope,enabled_for_creation,verification_note,sort_order)
select 'mr_quick_match','mr_standard',rule_set_id,'Quick Match','ACTIVE',false,6,6,'NOT_APPLICABLE','ALL_CATALOG_REGIONS',true,
 '6v6 Quick Match. Choose one shared server node; enable cross-play in Marvel Rivals when playing across platforms. Objective maps are selected by the game.',100
from public.play_together_rule_sets where game_key='marvel_rivals' and version_key='marvel-rivals-2026-10-04';
insert into public.play_together_queues
 (queue_key,experience_key,rule_set_id,official_name,availability,ranked,team_size,max_premade_party_size,roles_applicability,region_scope,enabled_for_creation,verification_note,sort_order)
select 'mr_competitive','mr_standard',rule_set_id,'Competitive','DISABLED',true,6,null,'NOT_APPLICABLE','ALL_CATALOG_REGIONS',false,
 'Not available in GamID yet: rank, placement and platform eligibility rules are not supported. Competitive remains playable in Marvel Rivals itself.',110
from public.play_together_rule_sets where game_key='marvel_rivals' and version_key='marvel-rivals-2026-10-04';
insert into public.play_together_regions(region_key,game_key,official_name,riot_platform_id,riot_regional_route,is_active,sort_order,source_url,verified_on) values
 ('mr_oregon','marvel_rivals','Oregon',null,null,true,200,'https://www.marvelrivals.com/guide/server/','2026-10-04'),
 ('mr_dallas','marvel_rivals','Dallas',null,null,true,201,'https://www.marvelrivals.com/guide/server/','2026-10-04'),
 ('mr_northern_virginia','marvel_rivals','Northern Virginia',null,null,true,202,'https://www.marvelrivals.com/guide/server/','2026-10-04'),
 ('mr_frankfurt','marvel_rivals','Frankfurt',null,null,true,203,'https://www.marvelrivals.com/guide/server/','2026-10-04'),
 ('mr_warsaw','marvel_rivals','Warsaw',null,null,true,204,'https://www.marvelrivals.com/guide/server/','2026-10-04'),
 ('mr_dammam','marvel_rivals','Dammam',null,null,true,205,'https://www.marvelrivals.com/guide/server/','2026-10-04'),
 ('mr_sao_paulo','marvel_rivals','São Paulo',null,null,true,206,'https://www.marvelrivals.com/guide/server/','2026-10-04'),
 ('mr_tokyo','marvel_rivals','Tokyo',null,null,true,207,'https://www.marvelrivals.com/guide/server/','2026-10-04'),
 ('mr_singapore','marvel_rivals','Singapore',null,null,true,208,'https://www.marvelrivals.com/guide/server/','2026-10-04'),
 ('mr_sydney','marvel_rivals','Sydney',null,null,true,209,'https://www.marvelrivals.com/guide/server/','2026-10-04');
create or replace function private.get_play_together_catalog_impl()
returns table(catalog jsonb) language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'games',coalesce((select jsonb_agg(jsonb_build_object('game_key',g.game_key,'name',g.display_name) order by g.display_name) from public.game_catalog g where exists(select 1 from public.play_together_experiences e where e.game_key=g.game_key and e.is_active)),'[]'::jsonb),
  'experiences',coalesce((select jsonb_agg(jsonb_build_object('key',e.experience_key,'game_key',e.game_key,'name',e.official_name,'kind',e.experience_kind) order by e.sort_order) from public.play_together_experiences e where e.is_active),'[]'::jsonb),
  'queues',coalesce((select jsonb_agg(jsonb_build_object('key',q.queue_key,'experience_key',q.experience_key,'name',q.official_name,'riot_queue_id',q.riot_queue_id,'availability',q.availability,'ranked',q.ranked,'team_size',q.team_size,'max_party_size',q.max_premade_party_size,'roles',q.roles_applicability,'enabled',q.enabled_for_creation,'note',q.verification_note,'rule_version',r.version_key) order by q.sort_order) from public.play_together_queues q join public.play_together_rule_sets r on r.rule_set_id=q.rule_set_id),'[]'::jsonb),
  'regions',coalesce((select jsonb_agg(jsonb_build_object('key',x.region_key,'game_key',x.game_key,'name',x.official_name,'platform_id',x.riot_platform_id) order by x.sort_order) from public.play_together_regions x where x.is_active),'[]'::jsonb),
  'languages',coalesce((select jsonb_agg(jsonb_build_object('key',l.language_key,'name',l.english_name,'native_name',l.native_name) order by l.sort_order) from public.play_together_languages l where l.is_active),'[]'::jsonb),
  'positions',coalesce((select jsonb_agg(jsonb_build_object('key',p.position_key,'game_key',p.game_key,'name',p.official_name,'experience_key',p.experience_key) order by p.sort_order) from public.play_together_positions p where p.is_active),'[]'::jsonb),
  'settings',(select jsonb_object_agg(setting_key,integer_value) from public.play_together_settings)
 );
$$;
