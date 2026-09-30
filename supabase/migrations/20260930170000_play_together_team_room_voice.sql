-- Play Together Slice 2A — Team Room + provider-neutral voice automation foundation (TESTING).
-- Private provider identifiers and lifecycle machinery stay outside the exposed public schema.

create table private.play_together_voice_sessions (
  voice_session_id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.play_together_sessions(session_id) on delete restrict,
  provider_key text not null check (provider_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  state text not null default 'PENDING' check (state in ('PENDING','PROVISIONING','READY','ACTIVE','ENDING','ENDED','FAILED')),
  provider_guild_id text check (provider_guild_id is null or provider_guild_id ~ '^[0-9]{5,25}$'),
  provider_channel_id text check (provider_channel_id is null or provider_channel_id ~ '^[0-9]{5,25}$'),
  channel_key text not null unique check (channel_key ~ '^team-[0-9a-f]{12}$'),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{1,64}$'),
  retry_after_at timestamptz,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  active_at timestamptz,
  ending_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);
create index play_together_voice_sessions_work_idx on private.play_together_voice_sessions(state,retry_after_at,lease_expires_at);

create table private.play_together_voice_participants (
  voice_session_id uuid not null references private.play_together_voice_sessions(voice_session_id) on delete cascade,
  member_id uuid not null references public.play_together_members(member_id) on delete restrict,
  entity_id uuid not null references public.entities(entity_id) on delete restrict,
  provider_account_id text check (provider_account_id is null or provider_account_id ~ '^[0-9]{5,25}$'),
  state text not null default 'NOT_LINKED' check (state in ('NOT_LINKED','CONSENT_REQUIRED','READY','CONNECTED','LEFT','FAILED')),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{1,64}$'),
  updated_at timestamptz not null default now(),
  primary key(voice_session_id,member_id),
  unique(voice_session_id,entity_id)
);
create index play_together_voice_participants_entity_idx on private.play_together_voice_participants(entity_id,voice_session_id);

create table private.play_together_voice_grants (
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  provider_key text not null,
  provider_account_id text not null check (provider_account_id ~ '^[0-9]{5,25}$'),
  provider_guild_id text not null check (provider_guild_id ~ '^[0-9]{5,25}$'),
  state text not null check (state in ('READY','REVOKED','FAILED')),
  granted_at timestamptz,
  checked_at timestamptz not null default now(),
  last_error_code text,
  primary key(entity_id,provider_key,provider_guild_id)
);

create table private.play_together_voice_oauth_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  session_id uuid not null references public.play_together_sessions(session_id) on delete cascade,
  provider_key text not null,
  expected_provider_account_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  outcome text,
  created_at timestamptz not null default now()
);

revoke all on table private.play_together_voice_sessions,private.play_together_voice_participants,private.play_together_voice_grants,private.play_together_voice_oauth_attempts from public,anon,authenticated;

create or replace function private.play_together_voice_member(candidate_session_id uuid,candidate_entity_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.play_together_members m where m.session_id=candidate_session_id and m.entity_id=candidate_entity_id and m.member_kind='GAMID' and m.membership_status='ACCEPTED')
$$;

create or replace function private.ensure_play_together_voice_session_impl(candidate_session_id uuid,candidate_provider text)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); sid uuid; s public.play_together_sessions%rowtype;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if candidate_provider<>'discord' then raise exception using errcode='22023',message='VOICE_PROVIDER_UNSUPPORTED'; end if;
 select * into s from public.play_together_sessions where session_id=candidate_session_id;
 if not found or s.status not in ('ROOM_OPEN','IN_PLAY') then raise exception using errcode='22023',message='TEAM_ROOM_NOT_OPEN'; end if;
 if not private.play_together_voice_member(s.session_id,me) then raise exception using errcode='42501',message='NOT_PARTICIPANT'; end if;
 perform pg_advisory_xact_lock(hashtextextended('play-together-voice:'||s.session_id::text,0));
 select voice_session_id into sid from private.play_together_voice_sessions where session_id=s.session_id;
 if sid is null then
   insert into private.play_together_voice_sessions(session_id,provider_key,channel_key)
   values(s.session_id,candidate_provider,'team-'||left(replace(s.session_id::text,'-',''),12)) returning voice_session_id into sid;
 end if;
 insert into private.play_together_voice_participants(voice_session_id,member_id,entity_id,provider_account_id,state)
 select sid,m.member_id,m.entity_id,g.provider_account_id,
   case when g.provider_account_id is null then 'NOT_LINKED'
        when vg.state='READY' then 'READY' else 'CONSENT_REQUIRED' end
 from public.play_together_members m
 left join public.gaming_connections g on g.entity_id=m.entity_id and g.provider_key=candidate_provider
 left join private.play_together_voice_grants vg on vg.entity_id=m.entity_id and vg.provider_key=candidate_provider and vg.provider_account_id=g.provider_account_id and vg.state='READY'
 where m.session_id=s.session_id and m.member_kind='GAMID' and m.membership_status='ACCEPTED'
 on conflict(voice_session_id,member_id) do update set provider_account_id=excluded.provider_account_id,state=case when private.play_together_voice_participants.state='CONNECTED' then 'CONNECTED' else excluded.state end,updated_at=now();
 update private.play_together_voice_participants vp set state='LEFT',updated_at=now()
 where vp.voice_session_id=sid and not exists(select 1 from public.play_together_members m where m.member_id=vp.member_id and m.session_id=s.session_id and m.member_kind='GAMID' and m.membership_status='ACCEPTED');
 return sid;
end $$;

create or replace function public.ensure_play_together_voice_session(candidate_session_id uuid,candidate_provider text default 'discord')
returns uuid language sql volatile security invoker set search_path='' as $$select private.ensure_play_together_voice_session_impl(candidate_session_id,candidate_provider)$$;

create or replace function private.get_play_together_team_room_impl(candidate_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); sid uuid:=candidate_session_id; vs private.play_together_voice_sessions%rowtype; result jsonb;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if sid is null then select a.session_id into sid from private.play_together_active_entities a where a.entity_id=me; end if;
 if sid is null or not private.play_together_voice_member(sid,me) then raise exception using errcode='42501',message='NOT_PARTICIPANT'; end if;
 select * into vs from private.play_together_voice_sessions where session_id=sid;
 select jsonb_build_object(
   'session',jsonb_build_object('session_id',s.session_id,'status',s.status,'game_key',s.game_key,'experience_name',x.official_name,'queue_name',q.official_name,'region_name',r.official_name,'required_player_count',s.current_group_size,'current_player_count',(select count(*) from public.play_together_members mm where mm.session_id=s.session_id and mm.membership_status='ACCEPTED')),
   'room',(select jsonb_build_object('room_id',room.room_id,'state',room.room_status,'opened_at',room.opened_at) from public.play_together_rooms room where room.session_id=s.session_id),
   'voice',case when vs.voice_session_id is null then jsonb_build_object('provider','discord','state','PENDING') else jsonb_build_object('voice_session_id',vs.voice_session_id,'provider',vs.provider_key,'state',vs.state,'error_code',vs.last_error_code,'can_join',vs.state in ('READY','ACTIVE')) end,
   'participants',coalesce((select jsonb_agg(jsonb_build_object('member_id',m.member_id,'handle',e.gamid_handle,'display_name',e.display_name,'member_kind',m.member_kind,'membership_status',m.membership_status,'voice_state',case when m.member_kind='GUEST' then 'NOT_AVAILABLE' else coalesce(vp.state,case when gc.provider_account_id is null then 'NOT_LINKED' else 'CONSENT_REQUIRED' end) end,'is_me',m.entity_id=me) order by m.created_at) from public.play_together_members m left join public.entities e on e.entity_id=m.entity_id left join public.gaming_connections gc on gc.entity_id=m.entity_id and gc.provider_key='discord' left join private.play_together_voice_participants vp on vp.voice_session_id=vs.voice_session_id and vp.member_id=m.member_id where m.session_id=s.session_id and m.membership_status='ACCEPTED'),'[]'::jsonb)
 ) into result from public.play_together_sessions s join public.play_together_experiences x using(experience_key) join public.play_together_queues q using(queue_key) join public.play_together_regions r using(region_key) where s.session_id=sid;
 return result;
end $$;

create or replace function public.get_play_together_team_room(candidate_session_id uuid default null)
returns jsonb language sql volatile security invoker set search_path='' as $$select private.get_play_together_team_room_impl(candidate_session_id)$$;

create or replace function private.start_play_together_voice_oauth_impl(candidate_session_id uuid)
returns table(state text,expires_at timestamptz) language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); raw text; account_id text;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if not private.play_together_voice_member(candidate_session_id,me) then raise exception using errcode='42501',message='NOT_PARTICIPANT'; end if;
 if not exists(select 1 from public.play_together_sessions where session_id=candidate_session_id and status in ('ROOM_OPEN','IN_PLAY')) then raise exception using errcode='22023',message='TEAM_ROOM_NOT_OPEN'; end if;
 select provider_account_id into account_id from public.gaming_connections where entity_id=me and provider_key='discord';
 if account_id is null then raise exception using errcode='22023',message='DISCORD_NOT_LINKED'; end if;
 raw:=encode(gen_random_bytes(32),'hex');
 insert into private.play_together_voice_oauth_attempts(state_hash,entity_id,session_id,provider_key,expected_provider_account_id,expires_at)
 values(encode(digest(raw,'sha256'),'hex'),me,candidate_session_id,'discord',account_id,now()+interval '10 minutes');
 state:=raw; expires_at:=now()+interval '10 minutes'; return next;
end $$;

create or replace function public.start_play_together_voice_oauth(candidate_session_id uuid)
returns table(state text,expires_at timestamptz) language sql volatile security invoker set search_path='' as $$select * from private.start_play_together_voice_oauth_impl(candidate_session_id)$$;

create or replace function private.consume_play_together_voice_oauth_impl(candidate_state text)
returns table(status text,attempt_id uuid,entity_id uuid,session_id uuid,expected_provider_account_id text) language plpgsql volatile security definer set search_path='' as $$
declare a private.play_together_voice_oauth_attempts%rowtype;
begin
 if candidate_state !~ '^[0-9a-f]{64}$' then status:='INVALID_STATE'; return next; return; end if;
 select * into a from private.play_together_voice_oauth_attempts where state_hash=encode(digest(candidate_state,'sha256'),'hex') for update;
 if not found then status:='INVALID_STATE'; return next; return; end if;
 if a.consumed_at is not null then status:='REPLAYED'; return next; return; end if;
 update private.play_together_voice_oauth_attempts set consumed_at=now() where private.play_together_voice_oauth_attempts.attempt_id=a.attempt_id;
 if a.expires_at<=now() then status:='EXPIRED'; return next; return; end if;
 status:='OK';attempt_id:=a.attempt_id;entity_id:=a.entity_id;session_id:=a.session_id;expected_provider_account_id:=a.expected_provider_account_id;return next;
end $$;

create or replace function public.consume_play_together_voice_oauth(candidate_state text)
returns table(status text,attempt_id uuid,entity_id uuid,session_id uuid,expected_provider_account_id text) language sql volatile security definer set search_path='' as $$select * from private.consume_play_together_voice_oauth_impl(candidate_state)$$;

create or replace function public.complete_play_together_voice_oauth(candidate_attempt_id uuid,candidate_provider_account_id text,candidate_guild_id text,candidate_outcome text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare a private.play_together_voice_oauth_attempts%rowtype; vsid uuid;
begin
 select * into a from private.play_together_voice_oauth_attempts where attempt_id=candidate_attempt_id for update;
 if not found or a.outcome is not null then return 'REPLAYED'; end if;
 if a.expected_provider_account_id<>candidate_provider_account_id then update private.play_together_voice_oauth_attempts set outcome='ACCOUNT_MISMATCH' where attempt_id=a.attempt_id; return 'ACCOUNT_MISMATCH'; end if;
 update private.play_together_voice_oauth_attempts set outcome=candidate_outcome where attempt_id=a.attempt_id;
 if candidate_outcome<>'READY' then return candidate_outcome; end if;
 insert into private.play_together_voice_grants(entity_id,provider_key,provider_account_id,provider_guild_id,state,granted_at)
 values(a.entity_id,'discord',candidate_provider_account_id,candidate_guild_id,'READY',now()) on conflict(entity_id,provider_key,provider_guild_id) do update set provider_account_id=excluded.provider_account_id,state='READY',granted_at=now(),checked_at=now(),last_error_code=null;
 select voice_session_id into vsid from private.play_together_voice_sessions where session_id=a.session_id;
 if vsid is null then raise exception using errcode='22023',message='VOICE_SESSION_NOT_FOUND'; end if;
 update private.play_together_voice_participants set state='READY',last_error_code=null,updated_at=now() where voice_session_id=vsid and entity_id=a.entity_id;
 return 'READY';
end $$;

create or replace function public.claim_play_together_voice_provision(candidate_voice_session_id uuid,candidate_guild_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v private.play_together_voice_sessions%rowtype; blockers integer; members jsonb;
begin
 select * into v from private.play_together_voice_sessions where voice_session_id=candidate_voice_session_id for update;
 if not found then raise exception using errcode='22023',message='VOICE_SESSION_NOT_FOUND'; end if;
 if v.state in ('READY','ACTIVE') then return jsonb_build_object('status','READY','voice_session_id',v.voice_session_id,'channel_id',v.provider_channel_id,'channel_key',v.channel_key); end if;
 if v.state='PROVISIONING' and v.lease_expires_at>now() then return jsonb_build_object('status','IN_PROGRESS'); end if;
 if v.state='FAILED' and v.retry_after_at>now() then return jsonb_build_object('status','RETRY_LATER'); end if;
 select count(*) into blockers from private.play_together_voice_participants where voice_session_id=v.voice_session_id and state not in ('READY','CONNECTED');
 if blockers>0 then return jsonb_build_object('status','PARTICIPANTS_NOT_READY','count',blockers); end if;
 update private.play_together_voice_sessions set state='PROVISIONING',provider_guild_id=candidate_guild_id,attempt_count=attempt_count+1,lease_expires_at=now()+interval '2 minutes',last_error_code=null,updated_at=now() where voice_session_id=v.voice_session_id;
 select jsonb_agg(jsonb_build_object('entity_id',entity_id,'provider_account_id',provider_account_id)) into members from private.play_together_voice_participants where voice_session_id=v.voice_session_id order by entity_id;
 return jsonb_build_object('status','CLAIMED','voice_session_id',v.voice_session_id,'session_id',v.session_id,'channel_key',v.channel_key,'members',members);
end $$;

create or replace function public.finish_play_together_voice_provision(candidate_voice_session_id uuid,candidate_channel_id text,candidate_error_code text default null)
returns text language plpgsql volatile security definer set search_path='' as $$
begin
 if candidate_error_code is null then update private.play_together_voice_sessions set state='READY',provider_channel_id=candidate_channel_id,ready_at=coalesce(ready_at,now()),lease_expires_at=null,last_error_code=null,updated_at=now() where voice_session_id=candidate_voice_session_id and state='PROVISIONING'; return 'READY'; end if;
 update private.play_together_voice_sessions set state='FAILED',lease_expires_at=null,last_error_code=candidate_error_code,retry_after_at=now()+interval '1 minute',updated_at=now() where voice_session_id=candidate_voice_session_id; return 'FAILED';
end $$;

create or replace function public.get_play_together_voice_join(candidate_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); v private.play_together_voice_sessions%rowtype;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if not private.play_together_voice_member(candidate_session_id,me) then raise exception using errcode='42501',message='NOT_PARTICIPANT'; end if;
 select * into v from private.play_together_voice_sessions where session_id=candidate_session_id;
 if not found or v.state not in ('READY','ACTIVE') then raise exception using errcode='22023',message='VOICE_NOT_READY'; end if;
 if not exists(select 1 from private.play_together_voice_participants where voice_session_id=v.voice_session_id and entity_id=me and state in ('READY','CONNECTED')) then raise exception using errcode='42501',message='VOICE_MEMBERSHIP_REQUIRED'; end if;
 return jsonb_build_object('provider',v.provider_key,'guild_id',v.provider_guild_id,'channel_id',v.provider_channel_id);
end $$;

create or replace function public.set_play_together_voice_presence(candidate_voice_session_id uuid,candidate_provider_account_id text,candidate_connected boolean)
returns text language plpgsql volatile security definer set search_path='' as $$
declare changed integer;
begin
 update private.play_together_voice_participants set state=case when candidate_connected then 'CONNECTED' else 'READY' end,updated_at=now()
 where voice_session_id=candidate_voice_session_id and provider_account_id=candidate_provider_account_id and state in ('READY','CONNECTED');
 get diagnostics changed=row_count;
 if changed<>1 then raise exception using errcode='22023',message='VOICE_PARTICIPANT_NOT_FOUND'; end if;
 update private.play_together_voice_sessions set state=case when candidate_connected then 'ACTIVE' when not exists(select 1 from private.play_together_voice_participants where voice_session_id=candidate_voice_session_id and state='CONNECTED') then 'READY' else state end,active_at=case when candidate_connected then coalesce(active_at,now()) else active_at end,updated_at=now() where voice_session_id=candidate_voice_session_id and state in ('READY','ACTIVE');
 return case when candidate_connected then 'CONNECTED' else 'READY' end;
end $$;

create or replace function public.claim_play_together_voice_cleanup(candidate_limit integer default 20)
returns table(voice_session_id uuid,provider_key text,provider_guild_id text,provider_channel_id text) language plpgsql volatile security definer set search_path='' as $$
begin
 return query with claimed as (
   select v.voice_session_id from private.play_together_voice_sessions v join public.play_together_sessions s using(session_id)
   where v.state in ('READY','ACTIVE','FAILED') and v.provider_channel_id is not null and s.status in ('COMPLETED','CANCELLED','EXPIRED') order by s.ended_at nulls last limit greatest(1,least(candidate_limit,100)) for update of v skip locked
 ) update private.play_together_voice_sessions v set state='ENDING',ending_at=coalesce(ending_at,now()),lease_expires_at=now()+interval '2 minutes',updated_at=now() from claimed c where v.voice_session_id=c.voice_session_id returning v.voice_session_id,v.provider_key,v.provider_guild_id,v.provider_channel_id;
end $$;

create or replace function public.finish_play_together_voice_cleanup(candidate_voice_session_id uuid,candidate_deleted boolean,candidate_error_code text default null)
returns text language plpgsql volatile security definer set search_path='' as $$
begin
 if candidate_deleted then update private.play_together_voice_sessions set state='ENDED',provider_channel_id=null,ended_at=now(),lease_expires_at=null,last_error_code=null,updated_at=now() where voice_session_id=candidate_voice_session_id; return 'ENDED'; end if;
 update private.play_together_voice_sessions set state='FAILED',lease_expires_at=null,last_error_code=coalesce(candidate_error_code,'DISCORD_DELETE_FAILED'),retry_after_at=now()+interval '5 minutes',updated_at=now() where voice_session_id=candidate_voice_session_id; return 'FAILED';
end $$;

revoke all on function private.play_together_voice_member(uuid,uuid),private.ensure_play_together_voice_session_impl(uuid,text),private.get_play_together_team_room_impl(uuid),private.start_play_together_voice_oauth_impl(uuid),private.consume_play_together_voice_oauth_impl(text) from public,anon,authenticated,service_role;
grant execute on function private.play_together_voice_member(uuid,uuid),private.ensure_play_together_voice_session_impl(uuid,text),private.get_play_together_team_room_impl(uuid),private.start_play_together_voice_oauth_impl(uuid) to authenticated;
grant execute on function private.consume_play_together_voice_oauth_impl(text) to service_role;
revoke all on function public.ensure_play_together_voice_session(uuid,text),public.get_play_together_team_room(uuid),public.start_play_together_voice_oauth(uuid),public.consume_play_together_voice_oauth(text),public.complete_play_together_voice_oauth(uuid,text,text,text),public.claim_play_together_voice_provision(uuid,text),public.finish_play_together_voice_provision(uuid,text,text),public.get_play_together_voice_join(uuid),public.set_play_together_voice_presence(uuid,text,boolean),public.claim_play_together_voice_cleanup(integer),public.finish_play_together_voice_cleanup(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.ensure_play_together_voice_session(uuid,text),public.get_play_together_team_room(uuid),public.start_play_together_voice_oauth(uuid),public.get_play_together_voice_join(uuid) to authenticated;
grant execute on function public.consume_play_together_voice_oauth(text),public.complete_play_together_voice_oauth(uuid,text,text,text),public.claim_play_together_voice_provision(uuid,text),public.finish_play_together_voice_provision(uuid,text,text),public.set_play_together_voice_presence(uuid,text,boolean),public.claim_play_together_voice_cleanup(integer),public.finish_play_together_voice_cleanup(uuid,boolean,text) to service_role;
