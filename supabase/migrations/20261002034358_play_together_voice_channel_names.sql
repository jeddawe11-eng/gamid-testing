-- Allocate display-only names server-side; existing ID associations and names stay intact.
create table private.play_together_voice_name_counters (
  prefix text primary key check (length(prefix) between 5 and 90),
  last_value integer not null check (last_value between 1 and 9999)
);
alter table private.play_together_voice_name_counters enable row level security;
revoke all on private.play_together_voice_name_counters from public,anon,authenticated,service_role;

create function private.next_play_together_voice_channel_name(candidate_game text,candidate_queue text,candidate_region text)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare game_part text; mode_part text; server_part text; name_prefix text; allocated integer;
begin
 game_part:=case candidate_game when 'league_of_legends' then 'lol' else candidate_game end;
 select official_name into mode_part from public.play_together_queues where queue_key=candidate_queue;
 mode_part:=coalesce(mode_part,candidate_queue);
 server_part:=case candidate_region when 'sg2' then 'sg' else candidate_region end;
 game_part:=trim(both '-' from left(regexp_replace(lower(coalesce(game_part,'')),'[^a-z0-9]+','-','g'),24));
 mode_part:=trim(both '-' from left(regexp_replace(lower(coalesce(mode_part,'')),'[^a-z0-9]+','-','g'),40));
 server_part:=trim(both '-' from left(regexp_replace(lower(coalesce(server_part,'')),'[^a-z0-9]+','-','g'),24));
 if game_part='' or mode_part='' or server_part='' then
  raise exception using errcode='22023',message='VOICE_CHANNEL_NAME_INVALID';
 end if;
 name_prefix:=game_part||'-'||mode_part||'-'||server_part;
 -- ON CONFLICT takes a row lock: concurrent sessions cannot allocate the same suffix.
 insert into private.play_together_voice_name_counters as counters(prefix,last_value)
 values(name_prefix,1) on conflict(prefix) do update set last_value=counters.last_value+1
 where counters.last_value<9999 returning last_value into allocated;
 if allocated is null then
  raise exception using errcode='22003',message='VOICE_CHANNEL_SEQUENCE_EXHAUSTED';
 end if;
 return name_prefix||'-'||lpad(allocated::text,4,'0');
end $$;
revoke all on function private.next_play_together_voice_channel_name(text,text,text) from public,anon,authenticated,service_role;

alter table private.play_together_voice_sessions drop constraint play_together_voice_sessions_channel_key_check;
alter table private.play_together_voice_sessions add constraint play_together_voice_sessions_channel_key_check
 check (length(channel_key)<=100 and (channel_key ~ '^team-[0-9a-f]{12}$' or channel_key ~ '^[a-z0-9]+(-[a-z0-9]+){2,}-[0-9]{4}$'));
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
   values(s.session_id,candidate_provider,private.next_play_together_voice_channel_name(s.game_key,s.queue_key,s.region_key)) returning voice_session_id into sid;
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
