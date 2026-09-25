-- GamID Play Together — complete TESTING milestone.
-- Extends the accepted multi-game Slice 1 without coupling sessions to external commerce or Discord.

alter table public.play_together_sessions drop constraint play_together_sessions_intent_check;
alter table public.play_together_sessions add constraint play_together_sessions_intent_check
  check (intent in ('NEED_PLAYERS','FIND_SQUAD','TEAM_VS_TEAM','JUST_FOR_FUN','PLAY_WITH'));
alter table public.play_together_sessions drop constraint play_together_sessions_status_check;
alter table public.play_together_sessions add constraint play_together_sessions_status_check
  check (status in ('GROUP_FORMING','MATCHING','REQUEST_PENDING','MATCHED','AWAITING_START','READY_CHECK','ROOM_OPEN','IN_PLAY','COMPLETED','CANCELLED','EXPIRED'));
alter table public.play_together_sessions drop constraint play_together_sessions_seats_wanted_check;
alter table public.play_together_sessions add constraint play_together_sessions_seats_wanted_check check (seats_wanted between 0 and 100);
alter table public.play_together_sessions
  add column position_key text,
  add column seats_filled integer not null default 0 check (seats_filled between 0 and 100),
  add column planned_group_size integer not null default 1 check (planned_group_size between 1 and 100),
  add column formed_at timestamptz,
  add column ended_at timestamptz,
  add column lifecycle_version bigint not null default 1,
  add constraint play_together_flow_seats_shape check (
    (intent='NEED_PLAYERS' and seats_wanted >= 1) or
    (intent in ('FIND_SQUAD','TEAM_VS_TEAM') and seats_wanted = 0) or
    intent in ('JUST_FOR_FUN','PLAY_WITH')
  );

drop index public.play_together_one_active_host_idx;
create unique index play_together_one_active_owner_idx on public.play_together_sessions (creator_entity_id)
  where status in ('GROUP_FORMING','MATCHING','REQUEST_PENDING','AWAITING_START','READY_CHECK','ROOM_OPEN','IN_PLAY');

create table public.play_together_positions (
  position_key text primary key check (position_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  game_key text not null references public.game_catalog(game_key),
  experience_key text references public.play_together_experiences(experience_key),
  official_name text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  source_url text not null,
  verified_on date not null
);
alter table public.play_together_sessions add constraint play_together_sessions_position_fk foreign key(position_key) references public.play_together_positions(position_key);

insert into public.play_together_positions values
 ('lol_top','league_of_legends','summoners_rift','Top',10,true,'https://support-leagueoflegends.riotgames.com/hc/en-us/articles/201752864-Map-and-Modes',current_date),
 ('lol_jungle','league_of_legends','summoners_rift','Jungle',20,true,'https://support-leagueoflegends.riotgames.com/hc/en-us/articles/201752864-Map-and-Modes',current_date),
 ('lol_mid','league_of_legends','summoners_rift','Mid',30,true,'https://support-leagueoflegends.riotgames.com/hc/en-us/articles/201752864-Map-and-Modes',current_date),
 ('lol_bottom','league_of_legends','summoners_rift','Bottom',40,true,'https://support-leagueoflegends.riotgames.com/hc/en-us/articles/201752864-Map-and-Modes',current_date),
 ('lol_support','league_of_legends','summoners_rift','Support',50,true,'https://support-leagueoflegends.riotgames.com/hc/en-us/articles/201752864-Map-and-Modes',current_date),
 ('lol_fill','league_of_legends','summoners_rift','Fill',60,true,'https://support-leagueoflegends.riotgames.com/hc/en-us/articles/201752864-Map-and-Modes',current_date);

create table public.play_together_members (
  member_id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.play_together_sessions(session_id) on delete cascade,
  member_kind text not null check (member_kind in ('GAMID','GUEST')),
  entity_id uuid references public.entities(entity_id) on delete restrict,
  guest_name text,
  represented_by_entity_id uuid references public.entities(entity_id) on delete restrict,
  side text not null default 'HOST' check (side in ('HOST','OPPONENT')),
  membership_status text not null check (membership_status in ('INVITED','ACCEPTED','DECLINED','REMOVED')),
  position_key text references public.play_together_positions(position_key),
  manual_game_data jsonb not null default '{}'::jsonb check (jsonb_typeof(manual_game_data)='object'),
  invited_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint play_together_member_identity_shape check (
    (member_kind='GAMID' and entity_id is not null and guest_name is null and manual_game_data='{}'::jsonb) or
    (member_kind='GUEST' and entity_id is null and represented_by_entity_id is not null and char_length(trim(guest_name)) between 1 and 40)
  )
);
create unique index play_together_member_entity_session_idx on public.play_together_members(session_id,entity_id) where entity_id is not null and membership_status<>'REMOVED';
create index play_together_members_session_idx on public.play_together_members(session_id,membership_status);
create index play_together_members_entity_idx on public.play_together_members(entity_id) where entity_id is not null;

create table private.play_together_active_entities (
  entity_id uuid primary key references public.entities(entity_id) on delete cascade,
  session_id uuid not null references public.play_together_sessions(session_id) on delete cascade,
  reservation_kind text not null check (reservation_kind in ('OWNER','ACCEPTED_MEMBER')),
  reserved_at timestamptz not null default now()
);
create index play_together_active_entities_session_idx on private.play_together_active_entities(session_id);

create table public.play_together_join_requests (
  request_id uuid primary key default gen_random_uuid(),
  applicant_session_id uuid not null references public.play_together_sessions(session_id) on delete cascade,
  host_session_id uuid not null references public.play_together_sessions(session_id) on delete cascade,
  request_status text not null default 'PENDING' check (request_status in ('PENDING','APPROVED','REJECTED','WITHDRAWN','EXPIRED')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_version bigint not null default 1,
  constraint play_together_request_distinct_sessions check (applicant_session_id<>host_session_id)
);
create unique index play_together_one_pending_request_idx on public.play_together_join_requests(applicant_session_id,host_session_id) where request_status='PENDING';
create index play_together_join_requests_host_idx on public.play_together_join_requests(host_session_id,request_status,requested_at);

create table public.play_together_ready_checks (
  ready_check_id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.play_together_sessions(session_id) on delete cascade,
  status text not null check (status in ('OPEN','PASSED','DECLINED','TIMED_OUT','CANCELLED')),
  opened_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  closed_at timestamptz,
  version bigint not null default 1
);

create table public.play_together_ready_responses (
  ready_check_id uuid not null references public.play_together_ready_checks(ready_check_id) on delete cascade,
  member_id uuid not null references public.play_together_members(member_id) on delete cascade,
  response text not null default 'PENDING' check (response in ('PENDING','READY','DECLINED')),
  responded_by_entity_id uuid references public.entities(entity_id) on delete restrict,
  responded_at timestamptz,
  primary key(ready_check_id,member_id)
);

create table public.play_together_rooms (
  room_id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.play_together_sessions(session_id) on delete restrict,
  room_status text not null default 'OPEN' check (room_status in ('OPEN','IN_PLAY','COMPLETED','CANCELLED')),
  opened_at timestamptz not null default now(),
  play_started_at timestamptz,
  closed_at timestamptz,
  external_communication jsonb not null default '{}'::jsonb check (jsonb_typeof(external_communication)='object')
);

create table public.play_together_avoids (
  owner_entity_id uuid not null references public.entities(entity_id) on delete cascade,
  avoided_entity_id uuid not null references public.entities(entity_id) on delete cascade,
  game_key text not null references public.game_catalog(game_key),
  created_at timestamptz not null default now(),
  primary key(owner_entity_id,avoided_entity_id,game_key),
  constraint play_together_avoid_not_self check(owner_entity_id<>avoided_entity_id)
);
create index play_together_avoids_target_idx on public.play_together_avoids(avoided_entity_id,game_key);

create table public.play_together_events (
  event_id bigint generated always as identity primary key,
  session_id uuid not null references public.play_together_sessions(session_id) on delete restrict,
  actor_entity_id uuid references public.entities(entity_id) on delete restrict,
  member_id uuid references public.play_together_members(member_id) on delete restrict,
  event_type text not null check (event_type in ('CREATED','INVITED','INVITATION_ACCEPTED','INVITATION_DECLINED','REQUESTED','REQUEST_APPROVED','REQUEST_REJECTED','READY_OPENED','READY','READY_DECLINED','READY_TIMED_OUT','ROOM_OPENED','PLAY_STARTED','COMPLETED','CANCELLED','EXPIRED','NO_SHOW_RECORDED')),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data)='object'),
  occurred_at timestamptz not null default now()
);
create index play_together_events_session_idx on public.play_together_events(session_id,occurred_at);
create index play_together_events_actor_idx on public.play_together_events(actor_entity_id,occurred_at) where actor_entity_id is not null;

create table private.play_together_last_setup (
  entity_id uuid primary key references public.entities(entity_id) on delete cascade,
  game_key text not null references public.game_catalog(game_key),
  experience_key text not null references public.play_together_experiences(experience_key),
  queue_key text not null references public.play_together_queues(queue_key),
  region_key text not null references public.play_together_regions(region_key),
  position_key text references public.play_together_positions(position_key),
  language_keys text[] not null check(cardinality(language_keys) between 1 and 2),
  mic_preference text not null check(mic_preference in ('REQUIRED','PREFERRED','NO_PREFERENCE')),
  source_session_id uuid not null references public.play_together_sessions(session_id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table public.play_together_settings drop constraint play_together_settings_setting_key_check;
alter table public.play_together_settings add constraint play_together_settings_setting_key_check check(setting_key in ('scheduled_horizon_minutes','play_now_matching_ttl_minutes','ready_check_timeout_minutes','member_invitation_ttl_minutes'));
insert into public.play_together_settings values
 ('ready_check_timeout_minutes',5,now()),
 ('member_invitation_ttl_minutes',30,now())
on conflict(setting_key) do update set integer_value=excluded.integer_value,updated_at=now();

alter table public.play_together_positions enable row level security;
alter table public.play_together_members enable row level security;
alter table private.play_together_active_entities enable row level security;
alter table public.play_together_join_requests enable row level security;
alter table public.play_together_ready_checks enable row level security;
alter table public.play_together_ready_responses enable row level security;
alter table public.play_together_rooms enable row level security;
alter table public.play_together_avoids enable row level security;
alter table public.play_together_events enable row level security;
alter table private.play_together_last_setup enable row level security;

revoke all on table public.play_together_positions,public.play_together_members,private.play_together_active_entities,
 public.play_together_join_requests,public.play_together_ready_checks,public.play_together_ready_responses,
 public.play_together_rooms,public.play_together_avoids,public.play_together_events,private.play_together_last_setup
 from public,anon,authenticated;
revoke all on sequence public.play_together_events_event_id_seq from public,anon,authenticated;

create or replace function private.play_together_my_entity()
returns uuid language sql stable security definer set search_path='' as $$
 select e.entity_id from public.entity_memberships m join public.entities e on e.entity_id=m.entity_id
 where m.user_id=(select auth.uid()) and m.role='OWNER' and e.entity_type='SOLO' limit 1
$$;

create or replace function private.play_together_release_session(candidate_session_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 delete from private.play_together_active_entities a where a.session_id=candidate_session_id;
end $$;

create or replace function private.play_together_expire_due()
returns void language plpgsql volatile security definer set search_path='' as $$
declare expired_id uuid;
begin
 for expired_id in
   update public.play_together_sessions s set status='EXPIRED',ended_at=now(),lifecycle_version=lifecycle_version+1
   where ((s.status in ('GROUP_FORMING','MATCHING','REQUEST_PENDING') and s.matching_expires_at<=now())
      or (s.status='AWAITING_START' and s.scheduled_start_at+interval '15 minutes'<=now()))
   returning s.session_id
 loop
   perform private.play_together_release_session(expired_id);
   insert into public.play_together_events(session_id,event_type) values(expired_id,'EXPIRED');
 end loop;
 update public.play_together_ready_checks r set status='TIMED_OUT',closed_at=now(),version=version+1
 where r.status='OPEN' and r.deadline_at<=now();
 for expired_id in
   update public.play_together_sessions s set status='EXPIRED',ended_at=now(),lifecycle_version=lifecycle_version+1
   from public.play_together_ready_checks r where r.session_id=s.session_id and r.status='TIMED_OUT' and s.status='READY_CHECK'
   returning s.session_id
 loop
   perform private.play_together_release_session(expired_id);
   insert into public.play_together_events(session_id,event_type) values(expired_id,'READY_TIMED_OUT');
 end loop;
end $$;

create or replace function private.search_play_together_members_impl(candidate_query text)
returns table(entity_id uuid,gamid_handle text,display_name text,avatar_media_reference text)
language plpgsql stable security definer set search_path='' as $$
declare caller_entity uuid:=private.play_together_my_entity(); q text:=lower(trim(both '@' from trim(candidate_query)));
begin
 if (select auth.uid()) is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if caller_entity is null then raise exception using errcode='P0002',message='IDENTITY_NOT_FOUND'; end if;
 if char_length(regexp_replace(q,'[^a-z0-9]','','g'))<3 then raise exception using errcode='22023',message='SEARCH_TOO_SHORT'; end if;
 return query select e.entity_id,e.gamid_handle,e.display_name,e.avatar_media_reference from public.entities e
 where e.entity_type='SOLO' and e.entity_id<>caller_entity and (lower(e.gamid_handle) like '%'||q||'%' or lower(e.display_name) like '%'||q||'%')
 order by case when e.gamid_handle=q then 0 when e.gamid_handle like q||'%' then 1 else 2 end,e.gamid_handle limit 12;
end $$;

create or replace function private.create_play_together_attempt_impl(
 candidate_intent text,candidate_group_kind text,candidate_queue_key text,candidate_region_key text,
 candidate_seats_wanted integer,candidate_language_keys text[],candidate_mic_preference text,
 candidate_session_kind text,candidate_scheduled_start_at timestamptz,candidate_position_key text,
 candidate_invited_entity_ids uuid[] default '{}'::uuid[],candidate_guests jsonb default '[]'::jsonb)
returns table(session_id uuid,status text)
language plpgsql volatile security definer set search_path='' as $$
declare owner_id uuid:=private.play_together_my_entity(); q public.play_together_queues%rowtype; selected_game_key text; created_id uuid;
 normalized_languages text[]; ttl integer; invite_ttl integer; horizon integer; invite_id uuid; guest jsonb; planned integer; initial_status text;
begin
 if (select auth.uid()) is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if owner_id is null then raise exception using errcode='P0002',message='IDENTITY_NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtextextended('play-together:'||owner_id::text,0));
 perform private.play_together_expire_due();
 if exists(select 1 from private.play_together_active_entities a where a.entity_id=owner_id) then raise exception using errcode='23505',message='ACTIVE_INTENT_EXISTS'; end if;
 if candidate_intent not in ('NEED_PLAYERS','FIND_SQUAD','TEAM_VS_TEAM') then raise exception using errcode='22023',message='INVALID_INTENT'; end if;
 if candidate_group_kind not in ('ME','US') then raise exception using errcode='22023',message='INVALID_GROUP_KIND'; end if;
 select * into q from public.play_together_queues x where x.queue_key=candidate_queue_key and x.enabled_for_creation;
 if not found then raise exception using errcode='22023',message='QUEUE_NOT_AVAILABLE'; end if;
 select e.game_key into selected_game_key from public.play_together_experiences e where e.experience_key=q.experience_key;
 if not exists(select 1 from public.play_together_regions r where r.region_key=candidate_region_key and r.game_key=selected_game_key and r.is_active) then raise exception using errcode='22023',message='INVALID_REGION'; end if;
 if exists(select 1 from public.play_together_queue_regions qr where qr.queue_key=q.queue_key and qr.region_key=candidate_region_key and qr.availability not in ('ACTIVE','ROTATING')) then raise exception using errcode='22023',message='QUEUE_NOT_AVAILABLE_IN_REGION'; end if;
 select array_agg(distinct lower(x) order by lower(x)) into normalized_languages from unnest(candidate_language_keys) x;
 if cardinality(normalized_languages) not between 1 and 2 or exists(select 1 from unnest(normalized_languages) x where not exists(select 1 from public.play_together_languages l where l.language_key=x and l.is_active)) then raise exception using errcode='22023',message='INVALID_LANGUAGES'; end if;
 if candidate_mic_preference not in ('REQUIRED','PREFERRED','NO_PREFERENCE') then raise exception using errcode='22023',message='INVALID_MIC_PREFERENCE'; end if;
 if candidate_position_key is not null and not exists(select 1 from public.play_together_positions p where p.position_key=candidate_position_key and p.game_key=selected_game_key and p.is_active) then raise exception using errcode='22023',message='INVALID_POSITION'; end if;
 if jsonb_typeof(candidate_guests)<>'array' or jsonb_array_length(candidate_guests)>19 then raise exception using errcode='22023',message='INVALID_GUESTS'; end if;
 planned:=1+coalesce(cardinality(candidate_invited_entity_ids),0)+jsonb_array_length(candidate_guests);
 if candidate_group_kind='ME' and planned<>1 then raise exception using errcode='22023',message='ME_GROUP_MUST_BE_SOLO'; end if;
 if planned>q.max_premade_party_size then raise exception using errcode='22023',message='GROUP_EXCEEDS_QUEUE_LIMIT'; end if;
 if candidate_intent='NEED_PLAYERS' and (candidate_seats_wanted is null or candidate_seats_wanted<1 or planned+candidate_seats_wanted>q.max_premade_party_size) then raise exception using errcode='22023',message='INVALID_SEATS_WANTED'; end if;
 if candidate_intent in ('FIND_SQUAD','TEAM_VS_TEAM') and coalesce(candidate_seats_wanted,0)<>0 then raise exception using errcode='22023',message='SEATS_NOT_APPLICABLE'; end if;
 if candidate_intent='TEAM_VS_TEAM' and (q.team_size is null or planned<>q.team_size) then raise exception using errcode='22023',message='COMPLETE_TEAM_REQUIRED'; end if;
 select integer_value into ttl from public.play_together_settings where setting_key='play_now_matching_ttl_minutes';
 select integer_value into invite_ttl from public.play_together_settings where setting_key='member_invitation_ttl_minutes';
 select integer_value into horizon from public.play_together_settings where setting_key='scheduled_horizon_minutes';
 if candidate_session_kind='PLAY_NOW' and candidate_scheduled_start_at is not null then raise exception using errcode='22023',message='INVALID_TIMING'; end if;
 if candidate_session_kind='SCHEDULED' and (candidate_scheduled_start_at<=now() or candidate_scheduled_start_at>now()+make_interval(mins=>horizon)) then raise exception using errcode='22023',message='INVALID_SCHEDULE'; end if;
 if candidate_session_kind not in ('PLAY_NOW','SCHEDULED') then raise exception using errcode='22023',message='INVALID_TIMING'; end if;
 initial_status:=case when planned>1 and coalesce(cardinality(candidate_invited_entity_ids),0)>0 then 'GROUP_FORMING' else 'MATCHING' end;
 insert into public.play_together_sessions(creator_entity_id,game_key,experience_key,queue_key,rule_set_id,region_key,intent,group_kind,session_kind,status,current_group_size,planned_group_size,seats_wanted,language_keys,mic_preference,position_key,scheduled_start_at,matching_expires_at)
 values(owner_id,selected_game_key,q.experience_key,q.queue_key,q.rule_set_id,candidate_region_key,candidate_intent,candidate_group_kind,candidate_session_kind,initial_status,1+jsonb_array_length(candidate_guests),planned,coalesce(candidate_seats_wanted,0),normalized_languages,candidate_mic_preference,candidate_position_key,candidate_scheduled_start_at,now()+make_interval(mins=>case when initial_status='GROUP_FORMING' then invite_ttl else ttl end)) returning play_together_sessions.session_id into created_id;
 insert into private.play_together_active_entities values(owner_id,created_id,'OWNER',now());
 insert into public.play_together_members(session_id,member_kind,entity_id,side,membership_status,position_key,responded_at) values(created_id,'GAMID',owner_id,'HOST','ACCEPTED',candidate_position_key,now());
 foreach invite_id in array coalesce(candidate_invited_entity_ids,'{}'::uuid[]) loop
   if invite_id=owner_id or not exists(select 1 from public.entities e where e.entity_id=invite_id and e.entity_type='SOLO') then raise exception using errcode='22023',message='INVALID_INVITEE'; end if;
   insert into public.play_together_members(session_id,member_kind,entity_id,side,membership_status,invited_at) values(created_id,'GAMID',invite_id,'HOST','INVITED',now());
 end loop;
 for guest in select value from jsonb_array_elements(candidate_guests) loop
   if char_length(trim(guest->>'name')) not between 1 and 40 then raise exception using errcode='22023',message='INVALID_GUEST'; end if;
   insert into public.play_together_members(session_id,member_kind,guest_name,represented_by_entity_id,side,membership_status,position_key,manual_game_data,responded_at)
   values(created_id,'GUEST',trim(guest->>'name'),owner_id,'HOST','ACCEPTED',nullif(guest->>'position_key',''),coalesce(guest->'game_data','{}'::jsonb),now());
 end loop;
 insert into public.play_together_events(session_id,actor_entity_id,event_type,event_data) values(created_id,owner_id,'CREATED',jsonb_build_object('intent',candidate_intent));
 return query select created_id,initial_status;
end $$;

create or replace function private.respond_play_together_invitation_impl(candidate_session_id uuid,candidate_accept boolean)
returns text language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); changed integer; new_status text; ttl integer;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('play-together:'||me::text,0));
 if candidate_accept and exists(select 1 from private.play_together_active_entities where entity_id=me) then raise exception using errcode='23505',message='ACTIVE_INTENT_EXISTS'; end if;
 update public.play_together_members set membership_status=case when candidate_accept then 'ACCEPTED' else 'DECLINED' end,responded_at=now()
 where session_id=candidate_session_id and entity_id=me and membership_status='INVITED'; get diagnostics changed=row_count;
 if changed=0 then raise exception using errcode='P0002',message='INVITATION_NOT_FOUND'; end if;
 if candidate_accept then
   insert into private.play_together_active_entities values(me,candidate_session_id,'ACCEPTED_MEMBER',now());
   update public.play_together_sessions set current_group_size=current_group_size+1,lifecycle_version=lifecycle_version+1 where session_id=candidate_session_id;
 end if;
 if not exists(select 1 from public.play_together_members where session_id=candidate_session_id and membership_status='INVITED') then
   if exists(select 1 from public.play_together_members where session_id=candidate_session_id and membership_status='DECLINED') then
     update public.play_together_sessions set status='CANCELLED',cancelled_at=now(),ended_at=now(),lifecycle_version=lifecycle_version+1 where session_id=candidate_session_id returning status into new_status;
     perform private.play_together_release_session(candidate_session_id);
   else select integer_value into ttl from public.play_together_settings where setting_key='play_now_matching_ttl_minutes'; update public.play_together_sessions set status='MATCHING',matching_expires_at=now()+make_interval(mins=>ttl),lifecycle_version=lifecycle_version+1 where session_id=candidate_session_id returning status into new_status; end if;
 end if;
 insert into public.play_together_events(session_id,actor_entity_id,event_type) values(candidate_session_id,me,case when candidate_accept then 'INVITATION_ACCEPTED' else 'INVITATION_DECLINED' end);
 return case when candidate_accept then 'ACCEPTED' else 'DECLINED' end;
end $$;

create or replace function private.get_play_together_matches_impl(candidate_session_id uuid)
returns table(session_id uuid,owner_handle text,owner_name text,intent text,group_size integer,seats_remaining integer,languages text[],mic_preference text,position_key text,compatibility_score integer)
language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); mine public.play_together_sessions%rowtype;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 perform private.play_together_expire_due();
 select * into mine from public.play_together_sessions s where s.session_id=candidate_session_id and exists(select 1 from private.play_together_active_entities a where a.session_id=s.session_id and a.entity_id=me);
 if not found or mine.status not in ('MATCHING','REQUEST_PENDING') then raise exception using errcode='P0002',message='ACTIVE_INTENT_NOT_FOUND'; end if;
 return query select s.session_id,e.gamid_handle,e.display_name,s.intent,s.current_group_size,greatest(s.seats_wanted-s.seats_filled,0),s.language_keys,s.mic_preference,s.position_key,
   (100+80+case when mine.position_key is null or s.position_key is null or mine.position_key=s.position_key then 20 else 0 end+10+case when mine.mic_preference=s.mic_preference then 2 else 1 end)::integer
 from public.play_together_sessions s join public.entities e on e.entity_id=s.creator_entity_id
 where s.session_id<>mine.session_id and s.game_key=mine.game_key and s.queue_key=mine.queue_key and s.region_key=mine.region_key and s.status='MATCHING'
 and s.session_kind=mine.session_kind and (s.session_kind='PLAY_NOW' or abs(extract(epoch from (s.scheduled_start_at-mine.scheduled_start_at)))<=900)
 and mine.language_keys && s.language_keys
 and ((mine.intent='FIND_SQUAD' and s.intent='NEED_PLAYERS' and mine.current_group_size<=s.seats_wanted-s.seats_filled)
   or (mine.intent='TEAM_VS_TEAM' and s.intent='TEAM_VS_TEAM' and mine.current_group_size=s.current_group_size))
 and not exists(select 1 from public.play_together_avoids a where a.owner_entity_id=s.creator_entity_id and a.avoided_entity_id=mine.creator_entity_id and a.game_key=s.game_key)
 order by 10 desc,s.created_at limit 30;
end $$;

create or replace function private.request_play_together_host_impl(candidate_applicant_session_id uuid,candidate_host_session_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); created uuid;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('play-together-request:'||least(candidate_applicant_session_id::text,candidate_host_session_id::text)||':'||greatest(candidate_applicant_session_id::text,candidate_host_session_id::text),0));
 if not exists(select 1 from public.play_together_sessions a where a.session_id=candidate_applicant_session_id and a.creator_entity_id=me and a.status in ('MATCHING','REQUEST_PENDING') and a.intent in ('FIND_SQUAD','TEAM_VS_TEAM')) then raise exception using errcode='42501',message='NOT_APPLICANT_OWNER'; end if;
 if not exists(select 1 from private.get_play_together_matches_impl(candidate_applicant_session_id) m where m.session_id=candidate_host_session_id) then raise exception using errcode='22023',message='MATCH_NOT_ELIGIBLE'; end if;
 insert into public.play_together_join_requests(applicant_session_id,host_session_id) values(candidate_applicant_session_id,candidate_host_session_id) returning request_id into created;
 update public.play_together_sessions set status='REQUEST_PENDING',lifecycle_version=lifecycle_version+1 where session_id=candidate_applicant_session_id;
 insert into public.play_together_events(session_id,actor_entity_id,event_type,event_data) values(candidate_host_session_id,me,'REQUESTED',jsonb_build_object('request_id',created));
 return created;
end $$;

create or replace function private.open_play_together_ready_check(candidate_session_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare timeout_minutes integer; created uuid; start_at timestamptz;
begin
 select integer_value into timeout_minutes from public.play_together_settings where setting_key='ready_check_timeout_minutes';
 select scheduled_start_at into start_at from public.play_together_sessions where session_id=candidate_session_id for update;
 if start_at is not null and start_at>now() then
   update public.play_together_sessions set status='AWAITING_START',lifecycle_version=lifecycle_version+1 where session_id=candidate_session_id;
   return null;
 end if;
 insert into public.play_together_ready_checks(session_id,status,deadline_at) values(candidate_session_id,'OPEN',now()+make_interval(mins=>timeout_minutes)) returning ready_check_id into created;
 insert into public.play_together_ready_responses(ready_check_id,member_id)
 select created,m.member_id from public.play_together_members m where m.session_id=candidate_session_id and m.membership_status='ACCEPTED';
 update public.play_together_sessions set status='READY_CHECK',ready_check_deadline_at=now()+make_interval(mins=>timeout_minutes),lifecycle_version=lifecycle_version+1 where session_id=candidate_session_id;
 insert into public.play_together_events(session_id,event_type) values(candidate_session_id,'READY_OPENED');
 return created;
end $$;

create or replace function private.respond_play_together_request_impl(candidate_request_id uuid,candidate_approve boolean)
returns text language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); req public.play_together_join_requests%rowtype; host public.play_together_sessions%rowtype; applicant public.play_together_sessions%rowtype; added integer;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into req from public.play_together_join_requests where request_id=candidate_request_id for update;
 if not found or req.request_status<>'PENDING' then raise exception using errcode='P0002',message='PENDING_REQUEST_NOT_FOUND'; end if;
 select * into host from public.play_together_sessions where session_id=req.host_session_id for update;
 select * into applicant from public.play_together_sessions where session_id=req.applicant_session_id for update;
 if host.creator_entity_id<>me then raise exception using errcode='42501',message='NOT_HOST'; end if;
 if not candidate_approve then
   update public.play_together_join_requests set request_status='REJECTED',decided_at=now(),decision_version=decision_version+1 where request_id=candidate_request_id;
   update public.play_together_sessions set status='MATCHING',lifecycle_version=lifecycle_version+1 where session_id=applicant.session_id;
   insert into public.play_together_events(session_id,actor_entity_id,event_type) values(host.session_id,me,'REQUEST_REJECTED'); return 'REJECTED';
 end if;
 if host.status<>'MATCHING' or applicant.status<>'REQUEST_PENDING' then raise exception using errcode='40001',message='STALE_REQUEST'; end if;
 if host.intent='NEED_PLAYERS' and applicant.current_group_size>host.seats_wanted-host.seats_filled then raise exception using errcode='22023',message='NOT_ENOUGH_SEATS'; end if;
 insert into public.play_together_members(session_id,member_kind,entity_id,guest_name,represented_by_entity_id,side,membership_status,position_key,manual_game_data,responded_at)
 select host.session_id,m.member_kind,m.entity_id,m.guest_name,m.represented_by_entity_id,case when host.intent='TEAM_VS_TEAM' then 'OPPONENT' else 'HOST' end,'ACCEPTED',m.position_key,m.manual_game_data,now()
 from public.play_together_members m where m.session_id=applicant.session_id and m.membership_status='ACCEPTED';
 get diagnostics added=row_count;
 update private.play_together_active_entities set session_id=host.session_id,reservation_kind='ACCEPTED_MEMBER' where session_id=applicant.session_id;
 update public.play_together_join_requests set request_status='APPROVED',decided_at=now(),decision_version=decision_version+1 where request_id=candidate_request_id;
 update public.play_together_sessions set status='MATCHED',ended_at=now(),lifecycle_version=lifecycle_version+1 where session_id=applicant.session_id;
 update public.play_together_sessions set seats_filled=seats_filled+case when intent='NEED_PLAYERS' then added else 0 end,current_group_size=current_group_size+case when intent='NEED_PLAYERS' then added else 0 end,lifecycle_version=lifecycle_version+1 where session_id=host.session_id returning * into host;
 insert into public.play_together_events(session_id,actor_entity_id,event_type) values(host.session_id,me,'REQUEST_APPROVED');
 if host.intent='TEAM_VS_TEAM' or host.seats_filled>=host.seats_wanted then perform private.open_play_together_ready_check(host.session_id); end if;
 return 'APPROVED';
end $$;

create or replace function private.begin_scheduled_ready_check_impl(candidate_session_id uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); s public.play_together_sessions%rowtype;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into s from public.play_together_sessions where session_id=candidate_session_id for update;
 if not exists(select 1 from private.play_together_active_entities a where a.session_id=s.session_id and a.entity_id=me) then raise exception using errcode='42501',message='NOT_PARTICIPANT'; end if;
 if s.status<>'AWAITING_START' or s.scheduled_start_at>now() then raise exception using errcode='22023',message='NOT_READY_TO_START'; end if;
 perform private.open_play_together_ready_check(s.session_id); return 'READY_CHECK';
end $$;

create or replace function private.respond_play_together_ready_impl(candidate_member_id uuid,candidate_ready boolean)
returns text language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); rc public.play_together_ready_checks%rowtype; target public.play_together_members%rowtype; remaining integer; room_id uuid; sid uuid;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select m.* into target from public.play_together_members m where m.member_id=candidate_member_id;
 if not found or not (target.entity_id=me or (target.member_kind='GUEST' and target.represented_by_entity_id=me)) then raise exception using errcode='42501',message='NOT_READY_ACTOR'; end if;
 select r.* into rc from public.play_together_ready_checks r where r.session_id=target.session_id for update;
 if not found or rc.status<>'OPEN' or rc.deadline_at<=now() then perform private.play_together_expire_due(); raise exception using errcode='40001',message='READY_CHECK_CLOSED'; end if;
 update public.play_together_ready_responses set response=case when candidate_ready then 'READY' else 'DECLINED' end,responded_by_entity_id=me,responded_at=now()
 where ready_check_id=rc.ready_check_id and member_id=target.member_id and response='PENDING';
 if not found then raise exception using errcode='40001',message='READY_ALREADY_ANSWERED'; end if;
 insert into public.play_together_events(session_id,actor_entity_id,member_id,event_type) values(target.session_id,me,target.member_id,case when candidate_ready then 'READY' else 'READY_DECLINED' end);
 if not candidate_ready then
   update public.play_together_ready_checks set status='DECLINED',closed_at=now(),version=version+1 where ready_check_id=rc.ready_check_id;
   update public.play_together_sessions set status='CANCELLED',cancelled_at=now(),ended_at=now(),lifecycle_version=lifecycle_version+1 where session_id=target.session_id;
   perform private.play_together_release_session(target.session_id); return 'DECLINED';
 end if;
 select count(*) into remaining from public.play_together_ready_responses where ready_check_id=rc.ready_check_id and response<>'READY';
 if remaining=0 then
   update public.play_together_ready_checks set status='PASSED',closed_at=now(),version=version+1 where ready_check_id=rc.ready_check_id;
   insert into public.play_together_rooms(session_id) values(target.session_id) returning public.play_together_rooms.room_id into room_id;
   update public.play_together_sessions set status='ROOM_OPEN',formed_at=now(),lifecycle_version=lifecycle_version+1 where session_id=target.session_id;
   insert into private.play_together_last_setup(entity_id,game_key,experience_key,queue_key,region_key,position_key,language_keys,mic_preference,source_session_id)
   select m.entity_id,s.game_key,s.experience_key,s.queue_key,s.region_key,m.position_key,s.language_keys,s.mic_preference,s.session_id
   from public.play_together_members m join public.play_together_sessions s on s.session_id=m.session_id where m.session_id=target.session_id and m.entity_id is not null and m.membership_status='ACCEPTED'
   on conflict(entity_id) do update set game_key=excluded.game_key,experience_key=excluded.experience_key,queue_key=excluded.queue_key,region_key=excluded.region_key,position_key=excluded.position_key,language_keys=excluded.language_keys,mic_preference=excluded.mic_preference,source_session_id=excluded.source_session_id,updated_at=now();
   insert into public.play_together_events(session_id,event_type,event_data) values(target.session_id,'ROOM_OPENED',jsonb_build_object('room_id',room_id)); return 'ROOM_OPEN';
 end if;
 return 'READY';
end $$;

create or replace function private.set_play_together_avoid_impl(candidate_avoided_entity_id uuid,candidate_game_key text,candidate_active boolean)
returns text language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); current_count integer;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if candidate_avoided_entity_id=me or not exists(select 1 from public.entities where entity_id=candidate_avoided_entity_id) then raise exception using errcode='22023',message='INVALID_AVOID_TARGET'; end if;
 perform pg_advisory_xact_lock(hashtextextended('play-together-avoid:'||me::text||':'||candidate_game_key,0));
 if candidate_active then
   select count(*) into current_count from public.play_together_avoids where owner_entity_id=me and game_key=candidate_game_key;
   if current_count>=2 and not exists(select 1 from public.play_together_avoids where owner_entity_id=me and avoided_entity_id=candidate_avoided_entity_id and game_key=candidate_game_key) then raise exception using errcode='22023',message='AVOID_LIMIT_REACHED'; end if;
   insert into public.play_together_avoids values(me,candidate_avoided_entity_id,candidate_game_key,now()) on conflict do nothing; return 'AVOIDED';
 else delete from public.play_together_avoids where owner_entity_id=me and avoided_entity_id=candidate_avoided_entity_id and game_key=candidate_game_key; return 'REMOVED'; end if;
end $$;

create or replace function private.advance_play_together_room_impl(candidate_session_id uuid,candidate_action text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); room public.play_together_rooms%rowtype;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.play_together_sessions s where s.session_id=candidate_session_id and s.creator_entity_id=me) then raise exception using errcode='42501',message='NOT_HOST'; end if;
 select * into room from public.play_together_rooms where session_id=candidate_session_id for update;
 if not found then raise exception using errcode='P0002',message='ROOM_NOT_FOUND'; end if;
 if candidate_action='START' then
   if room.room_status<>'OPEN' then raise exception using errcode='40001',message='ROOM_STATE_CONFLICT'; end if;
   update public.play_together_rooms set room_status='IN_PLAY',play_started_at=now() where room_id=room.room_id;
   update public.play_together_sessions set status='IN_PLAY',lifecycle_version=lifecycle_version+1 where session_id=candidate_session_id;
   insert into public.play_together_events(session_id,actor_entity_id,event_type) values(candidate_session_id,me,'PLAY_STARTED'); return 'IN_PLAY';
 elsif candidate_action='COMPLETE' then
   if room.room_status not in ('OPEN','IN_PLAY') then raise exception using errcode='40001',message='ROOM_STATE_CONFLICT'; end if;
   update public.play_together_rooms set room_status='COMPLETED',closed_at=now() where room_id=room.room_id;
   update public.play_together_sessions set status='COMPLETED',ended_at=now(),lifecycle_version=lifecycle_version+1 where session_id=candidate_session_id;
   perform private.play_together_release_session(candidate_session_id);
   insert into public.play_together_events(session_id,actor_entity_id,event_type) values(candidate_session_id,me,'COMPLETED'); return 'COMPLETED';
 end if;
 raise exception using errcode='22023',message='INVALID_ROOM_ACTION';
end $$;

create or replace function private.leave_play_together_impl(candidate_session_id uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); removed integer; s public.play_together_sessions%rowtype;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into s from public.play_together_sessions where session_id=candidate_session_id for update;
 if not found or s.creator_entity_id=me or s.status not in ('MATCHING','REQUEST_PENDING','AWAITING_START') then raise exception using errcode='42501',message='CANNOT_LEAVE'; end if;
 select count(*) into removed from public.play_together_members m where m.session_id=s.session_id and m.membership_status='ACCEPTED' and (m.entity_id=me or m.represented_by_entity_id=me);
 if removed=0 then raise exception using errcode='P0002',message='MEMBERSHIP_NOT_FOUND'; end if;
 update public.play_together_members set membership_status='REMOVED',responded_at=now() where session_id=s.session_id and membership_status='ACCEPTED' and (entity_id=me or represented_by_entity_id=me);
 delete from private.play_together_active_entities where entity_id=me and session_id=s.session_id;
 update public.play_together_sessions set current_group_size=greatest(1,current_group_size-removed),seats_filled=greatest(0,seats_filled-removed),status='MATCHING',lifecycle_version=lifecycle_version+1 where session_id=s.session_id;
 return 'LEFT';
end $$;

create or replace function private.cancel_my_play_together_session_impl(candidate_session_id uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); changed integer;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 update public.play_together_sessions set status='CANCELLED',cancelled_at=now(),ended_at=now(),lifecycle_version=lifecycle_version+1
 where session_id=candidate_session_id and creator_entity_id=me and status in ('GROUP_FORMING','MATCHING','REQUEST_PENDING','AWAITING_START','READY_CHECK'); get diagnostics changed=row_count;
 if changed=0 then raise exception using errcode='P0002',message='ACTIVE_SESSION_NOT_FOUND'; end if;
 update public.play_together_ready_checks set status='CANCELLED',closed_at=now(),version=version+1 where session_id=candidate_session_id and status='OPEN';
 update public.play_together_join_requests set request_status='WITHDRAWN',decided_at=now(),decision_version=decision_version+1 where applicant_session_id=candidate_session_id and request_status='PENDING';
 perform private.play_together_release_session(candidate_session_id);
 insert into public.play_together_events(session_id,actor_entity_id,event_type) values(candidate_session_id,me,'CANCELLED'); return 'CANCELLED';
end $$;

create or replace function private.get_play_together_dashboard_impl()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); result jsonb; active_id uuid;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 perform private.play_together_expire_due();
 select a.session_id into active_id from private.play_together_active_entities a where a.entity_id=me;
 select jsonb_build_object(
  'my_entity',jsonb_build_object('entity_id',e.entity_id,'handle',e.gamid_handle,'name',e.display_name),
  'active_session',(select to_jsonb(s)||jsonb_build_object('experience_name',x.official_name,'queue_name',q.official_name,'region_name',r.official_name,'rule_version',rs.version_key) from public.play_together_sessions s join public.play_together_experiences x on x.experience_key=s.experience_key join public.play_together_queues q on q.queue_key=s.queue_key join public.play_together_regions r on r.region_key=s.region_key join public.play_together_rule_sets rs on rs.rule_set_id=s.rule_set_id where s.session_id=active_id),
  'members',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('handle',x.gamid_handle,'display_name',x.display_name) order by m.created_at) from public.play_together_members m left join public.entities x on x.entity_id=m.entity_id where m.session_id=active_id),'[]'::jsonb),
  'invitations',coalesce((select jsonb_agg(jsonb_build_object('session_id',s.session_id,'owner_handle',o.gamid_handle,'owner_name',o.display_name,'queue_name',q.official_name,'region_name',r.official_name,'scheduled_start_at',s.scheduled_start_at) order by m.created_at desc) from public.play_together_members m join public.play_together_sessions s using(session_id) join public.entities o on o.entity_id=s.creator_entity_id join public.play_together_queues q using(queue_key) join public.play_together_regions r using(region_key) where m.entity_id=me and m.membership_status='INVITED'),'[]'::jsonb),
  'incoming_requests',coalesce((select jsonb_agg(jsonb_build_object('request_id',j.request_id,'applicant_session_id',a.session_id,'owner_handle',o.gamid_handle,'owner_name',o.display_name,'group_size',a.current_group_size,'requested_at',j.requested_at) order by j.requested_at) from public.play_together_join_requests j join public.play_together_sessions a on a.session_id=j.applicant_session_id join public.entities o on o.entity_id=a.creator_entity_id where j.host_session_id=active_id and j.request_status='PENDING'),'[]'::jsonb),
  'ready_check',(select to_jsonb(rc) from public.play_together_ready_checks rc where rc.session_id=active_id),
  'ready_responses',coalesce((select jsonb_agg(to_jsonb(rr)||jsonb_build_object('guest_name',m.guest_name,'entity_id',m.entity_id,'display_name',e2.display_name,'represented_by_entity_id',m.represented_by_entity_id) order by m.created_at) from public.play_together_ready_checks rc join public.play_together_ready_responses rr using(ready_check_id) join public.play_together_members m using(member_id) left join public.entities e2 on e2.entity_id=m.entity_id where rc.session_id=active_id),'[]'::jsonb),
  'room',(select to_jsonb(room) from public.play_together_rooms room where room.session_id=active_id),
  'avoids',coalesce((select jsonb_agg(jsonb_build_object('entity_id',a.avoided_entity_id,'handle',x.gamid_handle,'name',x.display_name,'game_key',a.game_key)) from public.play_together_avoids a join public.entities x on x.entity_id=a.avoided_entity_id where a.owner_entity_id=me),'[]'::jsonb),
  'last_setup',(select to_jsonb(l) from private.play_together_last_setup l where l.entity_id=me),
  'history',coalesce((select jsonb_agg(jsonb_build_object('session_id',s.session_id,'intent',s.intent,'status',s.status,'queue_name',q.official_name,'region_name',r.official_name,'formed_at',s.formed_at,'ended_at',s.ended_at) order by coalesce(s.ended_at,s.created_at) desc) from public.play_together_members m join public.play_together_sessions s using(session_id) join public.play_together_queues q using(queue_key) join public.play_together_regions r using(region_key) where m.entity_id=me and s.status in ('COMPLETED','CANCELLED','EXPIRED') limit 20),'[]'::jsonb)
  ,'played_with',coalesce((select jsonb_agg(jsonb_build_object('entity_id',z.entity_id,'handle',z.gamid_handle,'name',z.display_name,'last_played_at',z.last_played_at) order by z.last_played_at desc) from (select e3.entity_id,e3.gamid_handle,e3.display_name,max(s3.formed_at) last_played_at from public.play_together_members mine join public.play_together_sessions s3 using(session_id) join public.play_together_members other using(session_id) join public.entities e3 on e3.entity_id=other.entity_id where mine.entity_id=me and other.entity_id is not null and other.entity_id<>me and s3.formed_at is not null group by e3.entity_id,e3.gamid_handle,e3.display_name limit 20) z),'[]'::jsonb)
 ) into result from public.entities e where e.entity_id=me;
 return result;
end $$;

create or replace function private.get_play_together_catalog_impl()
returns table(catalog jsonb) language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'games',jsonb_build_array(jsonb_build_object('game_key','league_of_legends','name','League of Legends')),
  'experiences',coalesce((select jsonb_agg(jsonb_build_object('key',e.experience_key,'name',e.official_name,'kind',e.experience_kind) order by e.sort_order) from public.play_together_experiences e where e.is_active),'[]'::jsonb),
  'queues',coalesce((select jsonb_agg(jsonb_build_object('key',q.queue_key,'experience_key',q.experience_key,'name',q.official_name,'riot_queue_id',q.riot_queue_id,'availability',q.availability,'ranked',q.ranked,'team_size',q.team_size,'max_party_size',q.max_premade_party_size,'roles',q.roles_applicability,'enabled',q.enabled_for_creation,'note',q.verification_note,'rule_version',r.version_key) order by q.sort_order) from public.play_together_queues q join public.play_together_rule_sets r on r.rule_set_id=q.rule_set_id),'[]'::jsonb),
  'regions',coalesce((select jsonb_agg(jsonb_build_object('key',x.region_key,'name',x.official_name,'platform_id',x.riot_platform_id) order by x.sort_order) from public.play_together_regions x where x.is_active),'[]'::jsonb),
  'languages',coalesce((select jsonb_agg(jsonb_build_object('key',l.language_key,'name',l.english_name,'native_name',l.native_name) order by l.sort_order) from public.play_together_languages l where l.is_active),'[]'::jsonb),
  'positions',coalesce((select jsonb_agg(jsonb_build_object('key',p.position_key,'name',p.official_name,'experience_key',p.experience_key) order by p.sort_order) from public.play_together_positions p where p.is_active),'[]'::jsonb),
  'settings',(select jsonb_object_agg(setting_key,integer_value) from public.play_together_settings)
 );
$$;

create or replace function public.search_play_together_members(candidate_query text) returns table(entity_id uuid,gamid_handle text,display_name text,avatar_media_reference text) language sql stable security invoker set search_path='' as $$select * from private.search_play_together_members_impl(candidate_query)$$;
create or replace function public.create_play_together_attempt(candidate_intent text,candidate_group_kind text,candidate_queue_key text,candidate_region_key text,candidate_seats_wanted integer,candidate_language_keys text[],candidate_mic_preference text,candidate_session_kind text,candidate_scheduled_start_at timestamptz,candidate_position_key text,candidate_invited_entity_ids uuid[] default '{}'::uuid[],candidate_guests jsonb default '[]'::jsonb) returns table(session_id uuid,status text) language sql volatile security invoker set search_path='' as $$select * from private.create_play_together_attempt_impl(candidate_intent,candidate_group_kind,candidate_queue_key,candidate_region_key,candidate_seats_wanted,candidate_language_keys,candidate_mic_preference,candidate_session_kind,candidate_scheduled_start_at,candidate_position_key,candidate_invited_entity_ids,candidate_guests)$$;
create or replace function public.get_play_together_dashboard() returns jsonb language sql volatile security invoker set search_path='' as $$select private.get_play_together_dashboard_impl()$$;
create or replace function public.respond_play_together_invitation(candidate_session_id uuid,candidate_accept boolean) returns text language sql volatile security invoker set search_path='' as $$select private.respond_play_together_invitation_impl(candidate_session_id,candidate_accept)$$;
create or replace function public.get_play_together_matches(candidate_session_id uuid) returns table(session_id uuid,owner_handle text,owner_name text,intent text,group_size integer,seats_remaining integer,languages text[],mic_preference text,position_key text,compatibility_score integer) language sql volatile security invoker set search_path='' as $$select * from private.get_play_together_matches_impl(candidate_session_id)$$;
create or replace function public.request_play_together_host(candidate_applicant_session_id uuid,candidate_host_session_id uuid) returns uuid language sql volatile security invoker set search_path='' as $$select private.request_play_together_host_impl(candidate_applicant_session_id,candidate_host_session_id)$$;
create or replace function public.respond_play_together_request(candidate_request_id uuid,candidate_approve boolean) returns text language sql volatile security invoker set search_path='' as $$select private.respond_play_together_request_impl(candidate_request_id,candidate_approve)$$;
create or replace function public.respond_play_together_ready(candidate_member_id uuid,candidate_ready boolean) returns text language sql volatile security invoker set search_path='' as $$select private.respond_play_together_ready_impl(candidate_member_id,candidate_ready)$$;
create or replace function public.begin_scheduled_ready_check(candidate_session_id uuid) returns text language sql volatile security invoker set search_path='' as $$select private.begin_scheduled_ready_check_impl(candidate_session_id)$$;
create or replace function public.set_play_together_avoid(candidate_avoided_entity_id uuid,candidate_game_key text,candidate_active boolean) returns text language sql volatile security invoker set search_path='' as $$select private.set_play_together_avoid_impl(candidate_avoided_entity_id,candidate_game_key,candidate_active)$$;
create or replace function public.advance_play_together_room(candidate_session_id uuid,candidate_action text) returns text language sql volatile security invoker set search_path='' as $$select private.advance_play_together_room_impl(candidate_session_id,candidate_action)$$;
create or replace function public.leave_play_together(candidate_session_id uuid) returns text language sql volatile security invoker set search_path='' as $$select private.leave_play_together_impl(candidate_session_id)$$;

-- Preserve the accepted Slice 1 create signature as a compatibility wrapper.
create or replace function private.create_play_together_session_impl(candidate_queue_key text,candidate_region_key text,candidate_seats_wanted integer,candidate_language_keys text[],candidate_mic_preference text)
returns table(session_id uuid,status text) language sql volatile security definer set search_path='' as $$
 select * from private.create_play_together_attempt_impl('NEED_PLAYERS','ME',candidate_queue_key,candidate_region_key,candidate_seats_wanted,candidate_language_keys,candidate_mic_preference,'PLAY_NOW',null,null,'{}'::uuid[],'[]'::jsonb)
$$;

revoke all on function private.play_together_my_entity(),private.play_together_release_session(uuid),private.play_together_expire_due(),private.search_play_together_members_impl(text),private.create_play_together_attempt_impl(text,text,text,text,integer,text[],text,text,timestamptz,text,uuid[],jsonb),private.respond_play_together_invitation_impl(uuid,boolean),private.get_play_together_matches_impl(uuid),private.request_play_together_host_impl(uuid,uuid),private.open_play_together_ready_check(uuid),private.respond_play_together_request_impl(uuid,boolean),private.begin_scheduled_ready_check_impl(uuid),private.respond_play_together_ready_impl(uuid,boolean),private.set_play_together_avoid_impl(uuid,text,boolean),private.advance_play_together_room_impl(uuid,text),private.leave_play_together_impl(uuid),private.get_play_together_dashboard_impl() from public,anon,authenticated,service_role;
revoke all on function public.search_play_together_members(text),public.create_play_together_attempt(text,text,text,text,integer,text[],text,text,timestamptz,text,uuid[],jsonb),public.get_play_together_dashboard(),public.respond_play_together_invitation(uuid,boolean),public.get_play_together_matches(uuid),public.request_play_together_host(uuid,uuid),public.respond_play_together_request(uuid,boolean),public.respond_play_together_ready(uuid,boolean),public.begin_scheduled_ready_check(uuid),public.set_play_together_avoid(uuid,text,boolean),public.advance_play_together_room(uuid,text),public.leave_play_together(uuid) from public,anon,authenticated,service_role;
grant execute on function private.play_together_my_entity(),private.play_together_release_session(uuid),private.play_together_expire_due(),private.search_play_together_members_impl(text),private.create_play_together_attempt_impl(text,text,text,text,integer,text[],text,text,timestamptz,text,uuid[],jsonb),private.respond_play_together_invitation_impl(uuid,boolean),private.get_play_together_matches_impl(uuid),private.request_play_together_host_impl(uuid,uuid),private.open_play_together_ready_check(uuid),private.respond_play_together_request_impl(uuid,boolean),private.begin_scheduled_ready_check_impl(uuid),private.respond_play_together_ready_impl(uuid,boolean),private.set_play_together_avoid_impl(uuid,text,boolean),private.advance_play_together_room_impl(uuid,text),private.leave_play_together_impl(uuid),private.get_play_together_dashboard_impl() to authenticated;
grant execute on function public.search_play_together_members(text),public.create_play_together_attempt(text,text,text,text,integer,text[],text,text,timestamptz,text,uuid[],jsonb),public.get_play_together_dashboard(),public.respond_play_together_invitation(uuid,boolean),public.get_play_together_matches(uuid),public.request_play_together_host(uuid,uuid),public.respond_play_together_request(uuid,boolean),public.respond_play_together_ready(uuid,boolean),public.begin_scheduled_ready_check(uuid),public.set_play_together_avoid(uuid,text,boolean),public.advance_play_together_room(uuid,text),public.leave_play_together(uuid) to authenticated;
