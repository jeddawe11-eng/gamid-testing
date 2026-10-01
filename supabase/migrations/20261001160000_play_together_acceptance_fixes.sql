-- Manual acceptance fixes for TESTING: symmetric recommendations, consentful host invitations,
-- bounded history, and matching-pool Realtime invalidation.

alter table public.play_together_join_requests
  add column request_origin text not null default 'APPLICANT_REQUEST'
  check (request_origin in ('APPLICANT_REQUEST','HOST_INVITE'));

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
   (180+case when mine.position_key is null or s.position_key is null or mine.position_key=s.position_key then 20 else 0 end+case when mine.mic_preference=s.mic_preference then 2 else 1 end)::integer
 from public.play_together_sessions s join public.entities e on e.entity_id=s.creator_entity_id
 where s.session_id<>mine.session_id and s.game_key=mine.game_key and s.queue_key=mine.queue_key and s.region_key=mine.region_key and s.status in ('MATCHING','REQUEST_PENDING')
 and s.session_kind=mine.session_kind and (s.session_kind='PLAY_NOW' or abs(extract(epoch from (s.scheduled_start_at-mine.scheduled_start_at)))<=900)
 and mine.language_keys && s.language_keys
 and ((mine.intent='FIND_SQUAD' and s.intent='NEED_PLAYERS' and mine.current_group_size<=s.seats_wanted-s.seats_filled)
   or (mine.intent='NEED_PLAYERS' and s.intent='FIND_SQUAD' and s.current_group_size<=mine.seats_wanted-mine.seats_filled)
   or (mine.intent='TEAM_VS_TEAM' and s.intent='TEAM_VS_TEAM' and mine.current_group_size=s.current_group_size))
 and not exists(select 1 from public.play_together_avoids a where (a.owner_entity_id=s.creator_entity_id and a.avoided_entity_id=mine.creator_entity_id or a.owner_entity_id=mine.creator_entity_id and a.avoided_entity_id=s.creator_entity_id) and a.game_key=s.game_key)
 and not exists(select 1 from public.play_together_join_requests j where j.request_status='PENDING' and j.applicant_session_id in (mine.session_id,s.session_id) and j.host_session_id in (mine.session_id,s.session_id))
 order by 10 desc,s.created_at limit 30;
end $$;

create or replace function private.invite_play_together_squad_impl(candidate_host_session_id uuid,candidate_applicant_session_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); created uuid;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('play-together-request:'||least(candidate_applicant_session_id::text,candidate_host_session_id::text)||':'||greatest(candidate_applicant_session_id::text,candidate_host_session_id::text),0));
 if not exists(select 1 from public.play_together_sessions h where h.session_id=candidate_host_session_id and h.creator_entity_id=me and h.intent='NEED_PLAYERS' and h.status='MATCHING') then raise exception using errcode='42501',message='NOT_HOST'; end if;
 if not exists(select 1 from private.get_play_together_matches_impl(candidate_host_session_id) m where m.session_id=candidate_applicant_session_id) then raise exception using errcode='22023',message='MATCH_NOT_ELIGIBLE'; end if;
 insert into public.play_together_join_requests(applicant_session_id,host_session_id,request_origin) values(candidate_applicant_session_id,candidate_host_session_id,'HOST_INVITE') returning request_id into created;
 insert into public.play_together_events(session_id,actor_entity_id,event_type,event_data) values(candidate_host_session_id,me,'REQUESTED',jsonb_build_object('request_id',created,'origin','HOST_INVITE'));
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
 if req.request_origin='HOST_INVITE' and applicant.creator_entity_id<>me then raise exception using errcode='42501',message='NOT_APPLICANT_OWNER'; end if;
 if req.request_origin='APPLICANT_REQUEST' and host.creator_entity_id<>me then raise exception using errcode='42501',message='NOT_HOST'; end if;
 if not candidate_approve then
   update public.play_together_join_requests set request_status='REJECTED',decided_at=now(),decision_version=decision_version+1 where request_id=candidate_request_id;
   if applicant.status='REQUEST_PENDING' then update public.play_together_sessions set status='MATCHING',lifecycle_version=lifecycle_version+1 where session_id=applicant.session_id; end if;
   insert into public.play_together_events(session_id,actor_entity_id,event_type,event_data) values(host.session_id,me,'REQUEST_REJECTED',jsonb_build_object('origin',req.request_origin)); return 'REJECTED';
 end if;
 if host.status<>'MATCHING' or applicant.status not in ('MATCHING','REQUEST_PENDING') then raise exception using errcode='40001',message='STALE_REQUEST'; end if;
 if host.intent='NEED_PLAYERS' and applicant.current_group_size>host.seats_wanted-host.seats_filled then raise exception using errcode='22023',message='NOT_ENOUGH_SEATS'; end if;
 insert into public.play_together_members(session_id,member_kind,entity_id,guest_name,represented_by_entity_id,side,membership_status,position_key,manual_game_data,responded_at)
 select host.session_id,m.member_kind,m.entity_id,m.guest_name,m.represented_by_entity_id,case when host.intent='TEAM_VS_TEAM' then 'OPPONENT' else 'HOST' end,'ACCEPTED',m.position_key,m.manual_game_data,now()
 from public.play_together_members m where m.session_id=applicant.session_id and m.membership_status='ACCEPTED';
 get diagnostics added=row_count;
 update private.play_together_active_entities set session_id=host.session_id,reservation_kind='ACCEPTED_MEMBER' where session_id=applicant.session_id;
 update public.play_together_join_requests set request_status='APPROVED',decided_at=now(),decision_version=decision_version+1 where request_id=candidate_request_id;
 update public.play_together_sessions set status='MATCHED',ended_at=now(),lifecycle_version=lifecycle_version+1 where session_id=applicant.session_id;
 update public.play_together_sessions set seats_filled=seats_filled+case when intent='NEED_PLAYERS' then added else 0 end,current_group_size=current_group_size+case when intent='NEED_PLAYERS' then added else 0 end,lifecycle_version=lifecycle_version+1 where session_id=host.session_id returning * into host;
 insert into public.play_together_events(session_id,actor_entity_id,event_type,event_data) values(host.session_id,me,'REQUEST_APPROVED',jsonb_build_object('origin',req.request_origin));
 if host.intent='TEAM_VS_TEAM' or host.seats_filled>=host.seats_wanted then perform private.open_play_together_ready_check(host.session_id); end if;
 return 'APPROVED';
end $$;

alter function private.get_play_together_dashboard_impl() rename to get_play_together_dashboard_before_acceptance_fixes;
create function private.get_play_together_dashboard_impl()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); base jsonb; active_id uuid; history_rows jsonb; host_invites jsonb; incoming jsonb;
begin
 base:=private.get_play_together_dashboard_before_acceptance_fixes();
 select a.session_id into active_id from private.play_together_active_entities a where a.entity_id=me;
 select coalesce(jsonb_agg(x.item order by x.sort_at desc),'[]'::jsonb) into history_rows from (
   select jsonb_build_object('session_id',s.session_id,'intent',s.intent,'status',s.status,'queue_name',q.official_name,'region_name',r.official_name,'formed_at',s.formed_at,'ended_at',s.ended_at) item,coalesce(s.ended_at,s.created_at) sort_at
   from public.play_together_members m join public.play_together_sessions s using(session_id) join public.play_together_queues q using(queue_key) join public.play_together_regions r using(region_key)
   where m.entity_id=me and s.status in ('COMPLETED','CANCELLED','EXPIRED') order by coalesce(s.ended_at,s.created_at) desc limit 5
 ) x;
 select coalesce(jsonb_agg(jsonb_build_object('request_id',j.request_id,'session_id',h.session_id,'owner_handle',o.gamid_handle,'owner_name',o.display_name,'queue_name',q.official_name,'region_name',r.official_name) order by j.requested_at desc),'[]'::jsonb) into host_invites
 from public.play_together_join_requests j join public.play_together_sessions h on h.session_id=j.host_session_id join public.entities o on o.entity_id=h.creator_entity_id join public.play_together_queues q on q.queue_key=h.queue_key join public.play_together_regions r on r.region_key=h.region_key
 where j.applicant_session_id=active_id and j.request_status='PENDING' and j.request_origin='HOST_INVITE';
 select coalesce(jsonb_agg(jsonb_build_object('request_id',j.request_id,'applicant_session_id',a.session_id,'owner_handle',o.gamid_handle,'owner_name',o.display_name,'group_size',a.current_group_size,'requested_at',j.requested_at) order by j.requested_at),'[]'::jsonb) into incoming
 from public.play_together_join_requests j join public.play_together_sessions a on a.session_id=j.applicant_session_id join public.entities o on o.entity_id=a.creator_entity_id
 where j.host_session_id=active_id and j.request_status='PENDING' and j.request_origin='APPLICANT_REQUEST';
 return base||jsonb_build_object('history',history_rows,'host_invitations',host_invites,'incoming_requests',incoming);
end $$;

create or replace function private.play_together_realtime_session_trigger()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare changed public.play_together_sessions%rowtype; uid uuid; sid uuid;
begin
 sid:=coalesce(new.session_id,old.session_id);
 if tg_table_name='play_together_sessions' then changed:=case when tg_op='DELETE' then old else new end;
 else select * into changed from public.play_together_sessions where session_id=sid; end if;
 perform private.broadcast_play_together_session(sid);
 if changed.session_id is null then if tg_op='DELETE' then return old; else return new; end if; end if;
 for uid in select distinct em.user_id from public.play_together_sessions s join private.play_together_active_entities a on a.session_id=s.session_id join public.entity_memberships em on em.entity_id=a.entity_id and em.role='OWNER'
   where s.session_id<>changed.session_id and s.status in ('MATCHING','REQUEST_PENDING') and changed.status in ('MATCHING','REQUEST_PENDING') and s.game_key=changed.game_key and s.queue_key=changed.queue_key and s.region_key=changed.region_key
 loop perform private.broadcast_play_together_user(uid,changed.session_id); end loop;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

create function public.invite_play_together_squad(candidate_host_session_id uuid,candidate_applicant_session_id uuid)
returns uuid language sql volatile security invoker set search_path='' as $$select private.invite_play_together_squad_impl(candidate_host_session_id,candidate_applicant_session_id)$$;

revoke all on function private.get_play_together_dashboard_before_acceptance_fixes(),private.get_play_together_dashboard_impl(),private.invite_play_together_squad_impl(uuid,uuid),public.invite_play_together_squad(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.get_play_together_dashboard_before_acceptance_fixes(),private.get_play_together_dashboard_impl(),private.invite_play_together_squad_impl(uuid,uuid),public.invite_play_together_squad(uuid,uuid) to authenticated;
