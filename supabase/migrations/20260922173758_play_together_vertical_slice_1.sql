-- GamID Play Together — Revised Vertical Slice 1 (TESTING only).
-- Multi-game core with League of Legends as the first catalog. This migration intentionally contains no
-- participants, matching, join requests, ready check, room, Discord, history, penalties, or payments.

create table public.play_together_rule_sets (
  rule_set_id uuid primary key default gen_random_uuid(),
  game_key text not null references public.game_catalog (game_key),
  version_key text not null,
  availability text not null check (availability in ('ACTIVE','ROTATING','DISABLED','REGION_DEPENDENT','UNVERIFIED')),
  valid_from date,
  valid_to date,
  verified_on date not null,
  official_source_url text not null check (official_source_url ~ '^https://(www\.)?(leagueoflegends\.com|teamfighttactics\.leagueoflegends\.com|developer\.riotgames\.com|static\.developer\.riotgames\.com|support-leagueoflegends\.riotgames\.com|support-teamfighttactics\.riotgames\.com)/'),
  source_note text not null,
  created_at timestamptz not null default now(),
  unique (game_key, version_key)
);

create table public.play_together_experiences (
  experience_key text primary key check (experience_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  game_key text not null references public.game_catalog (game_key),
  official_name text not null check (char_length(official_name) between 2 and 80),
  experience_kind text not null check (experience_kind in ('MAP','MODE_FAMILY','GAME_EXPERIENCE')),
  sort_order integer not null check (sort_order between 0 and 10000),
  is_active boolean not null default true
);

create table public.play_together_queues (
  queue_key text primary key check (queue_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  experience_key text not null references public.play_together_experiences (experience_key),
  rule_set_id uuid not null references public.play_together_rule_sets (rule_set_id),
  official_name text not null check (char_length(official_name) between 2 and 100),
  riot_queue_id integer,
  riot_mode_id text,
  availability text not null check (availability in ('ACTIVE','ROTATING','DISABLED','REGION_DEPENDENT','UNVERIFIED')),
  ranked boolean not null,
  team_size integer check (team_size between 1 and 100),
  max_premade_party_size integer check (max_premade_party_size between 1 and 100),
  roles_applicability text not null check (roles_applicability in ('REQUIRED','OPTIONAL','NOT_APPLICABLE','UNVERIFIED')),
  region_scope text not null check (region_scope in ('ALL_CATALOG_REGIONS','REGION_DEPENDENT','UNVERIFIED')),
  enabled_for_creation boolean not null default false,
  verification_note text not null,
  sort_order integer not null check (sort_order between 0 and 10000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  constraint playable_queue_has_verified_capacity check (
    not enabled_for_creation or (availability in ('ACTIVE','ROTATING') and max_premade_party_size is not null)
  )
);
create unique index play_together_queues_riot_id_idx on public.play_together_queues (riot_queue_id) where riot_queue_id is not null;
create index play_together_queues_experience_idx on public.play_together_queues (experience_key, sort_order);

create table public.play_together_regions (
  region_key text primary key check (region_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  game_key text not null references public.game_catalog (game_key),
  official_name text not null,
  riot_platform_id text not null,
  riot_regional_route text not null check (riot_regional_route in ('AMERICAS','ASIA','EUROPE','SEA')),
  is_active boolean not null default true,
  sort_order integer not null,
  source_url text not null,
  verified_on date not null,
  unique (game_key, riot_platform_id)
);

create table public.play_together_queue_regions (
  queue_key text not null references public.play_together_queues (queue_key) on delete cascade,
  region_key text not null references public.play_together_regions (region_key) on delete cascade,
  availability text not null check (availability in ('ACTIVE','ROTATING','DISABLED','UNVERIFIED')),
  primary key (queue_key, region_key)
);

create table public.play_together_languages (
  language_key text primary key check (language_key ~ '^[a-z][a-z0-9_-]{1,15}$'),
  english_name text not null,
  native_name text not null,
  sort_order integer not null unique,
  is_active boolean not null default true,
  evidence_note text not null,
  verified_on date not null
);

create table public.play_together_settings (
  setting_key text primary key,
  integer_value integer not null,
  updated_at timestamptz not null default now(),
  check (setting_key in ('scheduled_horizon_minutes','play_now_matching_ttl_minutes'))
);

create table public.play_together_sessions (
  session_id uuid primary key default gen_random_uuid(),
  creator_entity_id uuid not null references public.entities (entity_id) on delete cascade,
  game_key text not null references public.game_catalog (game_key),
  experience_key text not null references public.play_together_experiences (experience_key),
  queue_key text not null references public.play_together_queues (queue_key),
  rule_set_id uuid not null references public.play_together_rule_sets (rule_set_id),
  region_key text not null references public.play_together_regions (region_key),
  intent text not null check (intent in ('NEED_PLAYERS','JUST_FOR_FUN','PLAY_WITH')),
  group_kind text not null check (group_kind in ('ME','US')),
  session_kind text not null check (session_kind in ('PLAY_NOW','SCHEDULED')),
  admission_policy text not null default 'HOST_APPROVAL' check (admission_policy = 'HOST_APPROVAL'),
  status text not null check (status in ('MATCHING','READY_CHECK','ROOM_OPEN','IN_PLAY','COMPLETED','CANCELLED','EXPIRED')),
  current_group_size integer not null check (current_group_size between 1 and 100),
  seats_wanted integer not null check (seats_wanted between 1 and 100),
  language_keys text[] not null,
  mic_preference text not null check (mic_preference in ('REQUIRED','PREFERRED','NO_PREFERENCE')),
  scheduled_start_at timestamptz,
  matching_expires_at timestamptz not null,
  ready_check_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint session_timing_shape check (
    (session_kind = 'PLAY_NOW' and scheduled_start_at is null)
    or (session_kind = 'SCHEDULED' and scheduled_start_at is not null)
  ),
  constraint session_languages_count check (cardinality(language_keys) between 1 and 2),
  constraint session_cancel_shape check ((status = 'CANCELLED') = (cancelled_at is not null))
);
create unique index play_together_one_active_host_idx on public.play_together_sessions (creator_entity_id)
  where status in ('MATCHING','READY_CHECK','ROOM_OPEN','IN_PLAY');
create index play_together_sessions_owner_recent_idx on public.play_together_sessions (creator_entity_id, created_at desc);
create index play_together_sessions_expiry_idx on public.play_together_sessions (matching_expires_at)
  where status = 'MATCHING';

alter table public.play_together_rule_sets enable row level security;
alter table public.play_together_experiences enable row level security;
alter table public.play_together_queues enable row level security;
alter table public.play_together_regions enable row level security;
alter table public.play_together_queue_regions enable row level security;
alter table public.play_together_languages enable row level security;
alter table public.play_together_settings enable row level security;
alter table public.play_together_sessions enable row level security;

create policy "owners read their own play together sessions" on public.play_together_sessions
for select to authenticated using (exists (
  select 1 from public.entity_memberships m
  where m.entity_id = play_together_sessions.creator_entity_id and m.user_id = (select auth.uid()) and m.role = 'OWNER'
));

revoke all on table public.play_together_rule_sets, public.play_together_experiences, public.play_together_queues,
  public.play_together_regions, public.play_together_queue_regions, public.play_together_languages,
  public.play_together_settings, public.play_together_sessions from public, anon, authenticated;

-- Riot-backed catalog, verified 2026-09-22. A queue can be present without being creatable; unknown party limits are never invented.
insert into public.play_together_rule_sets
  (game_key, version_key, availability, valid_from, verified_on, official_source_url, source_note)
values
  ('league_of_legends','riot-26.18-2026-09-22','ACTIVE','2026-09-10','2026-09-22',
   'https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-18-notes/',
   'Current live patch evidence; queue identifiers cross-checked against Riot Developer Portal queues.json.'),
  ('league_of_legends','riot-tft-18.2-2026-09-22','ACTIVE','2026-09-10','2026-09-22',
   'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-2/',
   'Current TFT patch evidence; TFT remains an independent experience under League of Legends in GamID taxonomy.');

insert into public.play_together_experiences values
  ('summoners_rift','league_of_legends','Summoner''s Rift','MAP',10,true),
  ('aram','league_of_legends','ARAM','MODE_FAMILY',20,true),
  ('arena','league_of_legends','Arena','GAME_EXPERIENCE',30,true),
  ('league_classic','league_of_legends','League Classic','GAME_EXPERIENCE',40,true),
  ('ranked_fives','league_of_legends','Ranked 5s','GAME_EXPERIENCE',50,true),
  ('teamfight_tactics','league_of_legends','Teamfight Tactics','GAME_EXPERIENCE',60,true);

with rules as (select rule_set_id, version_key from public.play_together_rule_sets)
insert into public.play_together_queues
  (queue_key,experience_key,rule_set_id,official_name,riot_queue_id,riot_mode_id,availability,ranked,team_size,max_premade_party_size,roles_applicability,region_scope,enabled_for_creation,verification_note,sort_order,metadata)
values
  ('sr_draft','summoners_rift',(select rule_set_id from rules where version_key like 'riot-26.18%'),'Normal Draft Pick',400,'CLASSIC','ACTIVE',false,5,5,'REQUIRED','ALL_CATALOG_REGIONS',true,'Riot queues.json identifies 5v5 Draft Pick.',10,'{}'),
  ('sr_ranked_solo_duo','summoners_rift',(select rule_set_id from rules where version_key like 'riot-26.18%'),'Ranked Solo/Duo',420,'CLASSIC','ACTIVE',true,5,2,'REQUIRED','ALL_CATALOG_REGIONS',true,'Queue identity is official; this slice enforces party capacity but defers rank eligibility.',20,'{"rank_eligibility":"UNVERIFIED_NOT_ENFORCED"}'),
  ('sr_ranked_flex','summoners_rift',(select rule_set_id from rules where version_key like 'riot-26.18%'),'Ranked Flex',440,'CLASSIC','ACTIVE',true,5,5,'REQUIRED','ALL_CATALOG_REGIONS',true,'Queue identity and 5v5 format are official; rank eligibility is not enforced in this slice.',30,'{"rank_eligibility":"UNVERIFIED_NOT_ENFORCED"}'),
  ('sr_swiftplay','summoners_rift',(select rule_set_id from rules where version_key like 'riot-26.18%'),'Swiftplay',480,'CLASSIC','ACTIVE',false,5,5,'REQUIRED','ALL_CATALOG_REGIONS',true,'Riot queues.json identifies Swiftplay on Summoner''s Rift; 5v5 game structure is official.',40,'{}'),
  ('sr_quickplay','summoners_rift',(select rule_set_id from rules where version_key like 'riot-26.18%'),'Normal (Quickplay)',490,'CLASSIC','ACTIVE',false,5,5,'REQUIRED','ALL_CATALOG_REGIONS',true,'Riot queues.json identifies Normal (Quickplay); 5v5 game structure is official.',50,'{}'),
  ('sr_coop_intro','summoners_rift',(select rule_set_id from rules where version_key like 'riot-26.18%'),'Co-op vs. AI — Intro',870,'CLASSIC','ACTIVE',false,5,5,'OPTIONAL','ALL_CATALOG_REGIONS',true,'Current replacement queue in Riot queues.json.',60,'{}'),
  ('sr_coop_beginner','summoners_rift',(select rule_set_id from rules where version_key like 'riot-26.18%'),'Co-op vs. AI — Beginner',880,'CLASSIC','ACTIVE',false,5,5,'OPTIONAL','ALL_CATALOG_REGIONS',true,'Current replacement queue in Riot queues.json.',70,'{}'),
  ('sr_coop_intermediate','summoners_rift',(select rule_set_id from rules where version_key like 'riot-26.18%'),'Co-op vs. AI — Intermediate',890,'CLASSIC','ACTIVE',false,5,5,'OPTIONAL','ALL_CATALOG_REGIONS',true,'Current replacement queue in Riot queues.json.',80,'{}'),
  ('aram_standard','aram',(select rule_set_id from rules where version_key like 'riot-26.18%'),'ARAM',450,'ARAM','ACTIVE',false,5,5,'NOT_APPLICABLE','ALL_CATALOG_REGIONS',true,'Riot queues.json identifies current 5v5 ARAM.',10,'{}'),
  ('aram_mayhem','aram',(select rule_set_id from rules where version_key like 'riot-26.18%'),'ARAM: Mayhem',2400,'ARAM','ROTATING',false,5,5,'NOT_APPLICABLE','ALL_CATALOG_REGIONS',true,'Queue 2400 plus active balancing in Patch 26.18.',20,'{}'),
  ('arena_current','arena',(select rule_set_id from rules where version_key like 'riot-26.18%'),'Arena',1710,'CHERRY','ROTATING',false,16,3,'NOT_APPLICABLE','ALL_CATALOG_REGIONS',true,'Riot queues.json records a 16-player lobby; Riot Patch 26.11 documents current three-person Arena.',10,'{"format":"teams_of_3"}'),
  ('classic_current','league_classic',(select rule_set_id from rules where version_key like 'riot-26.18%'),'League Classic',null,'classic','ACTIVE',false,5,null,'REQUIRED','REGION_DEPENDENT',false,'Current official mode is verified, but a stable queue ID and party limit are not officially established.',10,'{}'),
  ('ranked_fives_current','ranked_fives',(select rule_set_id from rules where version_key like 'riot-26.18%'),'Ranked 5s',null,null,'REGION_DEPENDENT',true,5,null,'REQUIRED','REGION_DEPENDENT',false,'Riot confirms a September–December run and weekend queue windows; stable queue ID and detailed eligibility remain unverified.',10,'{}'),
  ('tft_normal','teamfight_tactics',(select rule_set_id from rules where version_key like 'riot-tft%'),'Normal',1090,'TFT','ACTIVE',false,8,null,'NOT_APPLICABLE','ALL_CATALOG_REGIONS',false,'Official queue identity is verified; premade party capacity is not sufficiently documented for server enforcement.',10,'{}'),
  ('tft_ranked','teamfight_tactics',(select rule_set_id from rules where version_key like 'riot-tft%'),'Ranked',1100,'TFT','ACTIVE',true,8,null,'NOT_APPLICABLE','ALL_CATALOG_REGIONS',false,'Official queue identity is verified; rank-dependent party eligibility is not verified for enforcement.',20,'{}'),
  ('tft_double_up','teamfight_tactics',(select rule_set_id from rules where version_key like 'riot-tft%'),'Double Up',null,'TFT','ACTIVE',true,2,2,'NOT_APPLICABLE','ALL_CATALOG_REGIONS',true,'Riot Support documents entering Double Up with one partner.',30,'{"riot_queue_id_status":"UNVERIFIED"}'),
  ('tft_hyper_roll','teamfight_tactics',(select rule_set_id from rules where version_key like 'riot-tft%'),'Hyper Roll',null,'TFT','DISABLED',false,8,null,'NOT_APPLICABLE','ALL_CATALOG_REGIONS',false,'Riot announced Hyper Roll was spun down; retained as disabled catalog history.',40,'{}'),
  ('tft_choncc','teamfight_tactics',(select rule_set_id from rules where version_key like 'riot-tft%'),'Choncc''s Treasure',1210,'TFT','ROTATING',false,8,null,'NOT_APPLICABLE','REGION_DEPENDENT',false,'Official queue ID exists, but current Patch 18.2 availability and party limit are not established.',50,'{}');

insert into public.play_together_regions
  (region_key,game_key,official_name,riot_platform_id,riot_regional_route,is_active,sort_order,source_url,verified_on)
values
 ('br1','league_of_legends','Brazil','BR1','AMERICAS',true,10,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('eun1','league_of_legends','Europe Nordic & East','EUN1','EUROPE',true,20,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('euw1','league_of_legends','Europe West','EUW1','EUROPE',true,30,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('jp1','league_of_legends','Japan','JP1','ASIA',true,40,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('kr','league_of_legends','Korea','KR','ASIA',true,50,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('la1','league_of_legends','Latin America North','LA1','AMERICAS',true,60,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('la2','league_of_legends','Latin America South','LA2','AMERICAS',true,70,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('na1','league_of_legends','North America','NA1','AMERICAS',true,80,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('oc1','league_of_legends','Oceania','OC1','SEA',true,90,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('tr1','league_of_legends','Türkiye','TR1','EUROPE',true,100,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('ru','league_of_legends','Russia','RU','EUROPE',true,110,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('ph2','league_of_legends','Philippines','PH2','SEA',true,120,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('sg2','league_of_legends','Singapore, Malaysia & Indonesia','SG2','SEA',true,130,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('th2','league_of_legends','Thailand','TH2','SEA',true,140,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('tw2','league_of_legends','Taiwan, Hong Kong & Macao','TW2','SEA',true,150,'https://developer.riotgames.com/docs/lol','2026-09-22'),
 ('vn2','league_of_legends','Vietnam','VN2','SEA',true,160,'https://developer.riotgames.com/docs/lol','2026-09-22');

insert into public.play_together_languages values
 ('en','English','English',10,true,'Global gaming bridge language and Riot-supported locale.','2026-09-22'),
 ('zh','Chinese','中文',20,true,'Large PC/mobile gaming market; Riot supports Simplified and Traditional Chinese locales.','2026-09-22'),
 ('es','Spanish','Español',30,true,'Riot supports Spain, Mexico, and Argentina Spanish locales.','2026-09-22'),
 ('pt-br','Portuguese (Brazil)','Português (Brasil)',40,true,'Brazil is a dedicated Riot platform and locale.','2026-09-22'),
 ('ru','Russian','Русский',50,true,'Riot-supported locale and platform.','2026-09-22'),
 ('ar','Arabic','العربية',60,true,'Large MENA gaming audience; included as a GamID launch-community language.','2026-09-22'),
 ('ko','Korean','한국어',70,true,'Major esports/gaming market and dedicated Riot platform/locale.','2026-09-22'),
 ('ja','Japanese','日本語',80,true,'Major gaming market and dedicated Riot platform/locale.','2026-09-22'),
 ('tr','Turkish','Türkçe',90,true,'Dedicated Riot platform and locale.','2026-09-22'),
 ('vi','Vietnamese','Tiếng Việt',100,true,'Dedicated Riot platform and locale.','2026-09-22');

insert into public.play_together_settings values
 ('scheduled_horizon_minutes',180,now()),
 ('play_now_matching_ttl_minutes',120,now());

create function private.get_play_together_catalog_impl()
returns table (catalog jsonb)
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'games', jsonb_build_array(jsonb_build_object('game_key','league_of_legends','name','League of Legends')),
    'experiences', coalesce((select jsonb_agg(jsonb_build_object('key',e.experience_key,'name',e.official_name,'kind',e.experience_kind) order by e.sort_order) from public.play_together_experiences e where e.is_active),'[]'::jsonb),
    'queues', coalesce((select jsonb_agg(jsonb_build_object('key',q.queue_key,'experience_key',q.experience_key,'name',q.official_name,'riot_queue_id',q.riot_queue_id,'availability',q.availability,'ranked',q.ranked,'team_size',q.team_size,'max_party_size',q.max_premade_party_size,'roles',q.roles_applicability,'enabled',q.enabled_for_creation,'note',q.verification_note,'rule_version',r.version_key) order by q.sort_order) from public.play_together_queues q join public.play_together_rule_sets r on r.rule_set_id=q.rule_set_id),'[]'::jsonb),
    'regions', coalesce((select jsonb_agg(jsonb_build_object('key',x.region_key,'name',x.official_name,'platform_id',x.riot_platform_id) order by x.sort_order) from public.play_together_regions x where x.is_active),'[]'::jsonb),
    'languages', coalesce((select jsonb_agg(jsonb_build_object('key',l.language_key,'name',l.english_name,'native_name',l.native_name) order by l.sort_order) from public.play_together_languages l where l.is_active),'[]'::jsonb)
  );
$$;

create function private.get_my_active_play_together_session_impl()
returns table (session_id uuid,status text,game_key text,experience_key text,experience_name text,queue_key text,queue_name text,rule_version text,region_key text,region_name text,seats_wanted integer,language_keys text[],mic_preference text,matching_expires_at timestamptz,created_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare caller uuid := (select auth.uid()); owned_entity_id uuid;
begin
  if caller is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select e.entity_id into owned_entity_id from public.entity_memberships m join public.entities e on e.entity_id=m.entity_id
   where m.user_id=caller and m.role='OWNER' and e.entity_type='SOLO' limit 1;
  if owned_entity_id is null then raise exception using errcode='P0002',message='IDENTITY_NOT_FOUND'; end if;
  update public.play_together_sessions s set status='EXPIRED'
   where s.creator_entity_id=owned_entity_id and s.status='MATCHING' and s.matching_expires_at<=now();
  return query select s.session_id,s.status,s.game_key,s.experience_key,e.official_name,s.queue_key,q.official_name,r.version_key,s.region_key,g.official_name,s.seats_wanted,s.language_keys,s.mic_preference,s.matching_expires_at,s.created_at
   from public.play_together_sessions s join public.play_together_experiences e on e.experience_key=s.experience_key
   join public.play_together_queues q on q.queue_key=s.queue_key join public.play_together_rule_sets r on r.rule_set_id=s.rule_set_id
   join public.play_together_regions g on g.region_key=s.region_key
   where s.creator_entity_id=owned_entity_id and s.status in ('MATCHING','READY_CHECK','ROOM_OPEN','IN_PLAY') order by s.created_at desc limit 1;
end; $$;

create function private.create_play_together_session_impl(candidate_queue_key text,candidate_region_key text,candidate_seats_wanted integer,candidate_language_keys text[],candidate_mic_preference text)
returns table (session_id uuid,status text)
language plpgsql volatile security definer set search_path = '' as $$
declare caller uuid := (select auth.uid()); owned_entity_id uuid; q public.play_together_queues%rowtype; ttl integer; created_id uuid; normalized_languages text[];
begin
  if caller is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select e.entity_id into owned_entity_id from public.entity_memberships m join public.entities e on e.entity_id=m.entity_id
   where m.user_id=caller and m.role='OWNER' and e.entity_type='SOLO' limit 1;
  if owned_entity_id is null then raise exception using errcode='P0002',message='IDENTITY_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('play-together:'||owned_entity_id::text,0));
  update public.play_together_sessions s set status='EXPIRED' where s.creator_entity_id=owned_entity_id and s.status='MATCHING' and s.matching_expires_at<=now();
  if exists(select 1 from public.play_together_sessions s where s.creator_entity_id=owned_entity_id and s.status in ('MATCHING','READY_CHECK','ROOM_OPEN','IN_PLAY')) then
    raise exception using errcode='23505',message='ACTIVE_SESSION_EXISTS';
  end if;
  select * into q from public.play_together_queues x where x.queue_key=candidate_queue_key;
  if not found or not q.enabled_for_creation then raise exception using errcode='22023',message='QUEUE_NOT_AVAILABLE'; end if;
  if not exists(select 1 from public.play_together_regions g where g.region_key=candidate_region_key and g.game_key='league_of_legends' and g.is_active) then raise exception using errcode='22023',message='INVALID_REGION'; end if;
  if exists(select 1 from public.play_together_queue_regions qr where qr.queue_key=q.queue_key and qr.region_key=candidate_region_key and qr.availability not in ('ACTIVE','ROTATING')) then raise exception using errcode='22023',message='QUEUE_NOT_AVAILABLE_IN_REGION'; end if;
  if candidate_seats_wanted is null or candidate_seats_wanted<1 or 1+candidate_seats_wanted>q.max_premade_party_size then raise exception using errcode='22023',message='INVALID_SEATS_WANTED'; end if;
  select array_agg(distinct lower(x) order by lower(x)) into normalized_languages from unnest(candidate_language_keys) x;
  if cardinality(normalized_languages) not between 1 and 2 or exists(select 1 from unnest(normalized_languages) x where not exists(select 1 from public.play_together_languages l where l.language_key=x and l.is_active)) then raise exception using errcode='22023',message='INVALID_LANGUAGES'; end if;
  if candidate_mic_preference not in ('REQUIRED','PREFERRED','NO_PREFERENCE') then raise exception using errcode='22023',message='INVALID_MIC_PREFERENCE'; end if;
  select integer_value into ttl from public.play_together_settings where setting_key='play_now_matching_ttl_minutes';
  insert into public.play_together_sessions(creator_entity_id,game_key,experience_key,queue_key,rule_set_id,region_key,intent,group_kind,session_kind,status,current_group_size,seats_wanted,language_keys,mic_preference,matching_expires_at)
  values(owned_entity_id,'league_of_legends',q.experience_key,q.queue_key,q.rule_set_id,candidate_region_key,'NEED_PLAYERS','ME','PLAY_NOW','MATCHING',1,candidate_seats_wanted,normalized_languages,candidate_mic_preference,now()+make_interval(mins=>ttl)) returning play_together_sessions.session_id into created_id;
  return query select created_id,'MATCHING'::text;
end; $$;

create function private.cancel_my_play_together_session_impl(candidate_session_id uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare caller uuid := (select auth.uid()); owned_entity_id uuid; changed integer;
begin
 if caller is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select e.entity_id into owned_entity_id from public.entity_memberships m join public.entities e on e.entity_id=m.entity_id where m.user_id=caller and m.role='OWNER' and e.entity_type='SOLO' limit 1;
 if owned_entity_id is null then raise exception using errcode='P0002',message='IDENTITY_NOT_FOUND'; end if;
 update public.play_together_sessions s set status='CANCELLED',cancelled_at=now() where s.session_id=candidate_session_id and s.creator_entity_id=owned_entity_id and s.status='MATCHING';
 get diagnostics changed=row_count;
 if changed=0 then raise exception using errcode='P0002',message='ACTIVE_SESSION_NOT_FOUND'; end if;
 return 'CANCELLED';
end; $$;

create function public.get_play_together_catalog() returns table(catalog jsonb) language sql stable security invoker set search_path='' as $$select * from private.get_play_together_catalog_impl();$$;
create function public.get_my_active_play_together_session() returns table(session_id uuid,status text,game_key text,experience_key text,experience_name text,queue_key text,queue_name text,rule_version text,region_key text,region_name text,seats_wanted integer,language_keys text[],mic_preference text,matching_expires_at timestamptz,created_at timestamptz) language sql volatile security invoker set search_path='' as $$select * from private.get_my_active_play_together_session_impl();$$;
create function public.create_play_together_session(candidate_queue_key text,candidate_region_key text,candidate_seats_wanted integer,candidate_language_keys text[],candidate_mic_preference text) returns table(session_id uuid,status text) language sql volatile security invoker set search_path='' as $$select * from private.create_play_together_session_impl(candidate_queue_key,candidate_region_key,candidate_seats_wanted,candidate_language_keys,candidate_mic_preference);$$;
create function public.cancel_my_play_together_session(candidate_session_id uuid) returns text language sql volatile security invoker set search_path='' as $$select private.cancel_my_play_together_session_impl(candidate_session_id);$$;

revoke all on function private.get_play_together_catalog_impl(),private.get_my_active_play_together_session_impl(),private.create_play_together_session_impl(text,text,integer,text[],text),private.cancel_my_play_together_session_impl(uuid),public.get_play_together_catalog(),public.get_my_active_play_together_session(),public.create_play_together_session(text,text,integer,text[],text),public.cancel_my_play_together_session(uuid) from public,anon,authenticated,service_role;
grant execute on function private.get_play_together_catalog_impl(),private.get_my_active_play_together_session_impl(),private.create_play_together_session_impl(text,text,integer,text[],text),private.cancel_my_play_together_session_impl(uuid),public.get_play_together_catalog(),public.get_my_active_play_together_session(),public.create_play_together_session(text,text,integer,text[],text),public.cancel_my_play_together_session(uuid) to authenticated;
