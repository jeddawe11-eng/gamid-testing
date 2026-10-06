-- Play Together -> GamID Notifications: the producer for the three APPROVED Play Together notification contracts (gamid-truth.json, capability play-together):
--   pt.join-request-notifies-host   A JOIN REQUEST gives the host a GamID notification.
--   pt.approve-notifies-requester   An APPROVE gives the requester a GamID notification reflecting the decision.
--   pt.reject-notifies-requester    A REJECT gives the requester a GamID notification reflecting the decision.
-- The notification foundation (20261002210000) registered no Play Together type and no Play Together function ever called private.notify, so none of these
-- notifications could exist: the bell, unread count and log were correct - there was nothing to show. This migration adds exactly the three contracted
-- types and calls the existing producer from the two existing actions. No other Play Together event notifies (CREATE / READY / READY_CHECK_START / START /
-- COMPLETE explicitly have no notification contract; a host's squad INVITATION and its answer are not join requests and are unchanged).
--
-- A "join request" is an applicant-originated request (request_origin = 'APPLICANT_REQUEST'): its requester is the applicant session's creator and its host is
-- the host session's creator. Recipient, actor, subject (the host session) and a small display context (the queue name) are written by trusted server code
-- inside the same transaction as the action, so a failed action never notifies and a notified action always happened. private.notify never notifies the actor.
--
-- The two function bodies are copied unchanged from their latest definitions (request: 20260925090000_play_together_complete_milestone.sql; respond:
-- 20261001160000_play_together_acceptance_fixes.sql - both verified identical to TESTING); only the private.notify calls are added. Grants are unchanged
-- (create or replace keeps them).

insert into public.notification_types (type_key, producer, destination) values
  ('play_together.request_received', 'play_together', 'play_together.requests'),
  ('play_together.request_approved', 'play_together', 'play_together.session'),
  ('play_together.request_rejected', 'play_together', 'play_together.session');

create or replace function private.play_together_notification_context(candidate_session_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('queue_name', left(q.official_name, 120))
  from public.play_together_sessions s join public.play_together_queues q on q.queue_key = s.queue_key
  where s.session_id = candidate_session_id
$$;
revoke all on function private.play_together_notification_context(uuid) from public, anon, authenticated, service_role;

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
 -- pt.join-request-notifies-host
 perform private.notify((select h.creator_entity_id from public.play_together_sessions h where h.session_id=candidate_host_session_id), me, 'play_together.request_received', candidate_host_session_id, private.play_together_notification_context(candidate_host_session_id));
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
   insert into public.play_together_events(session_id,actor_entity_id,event_type,event_data) values(host.session_id,me,'REQUEST_REJECTED',jsonb_build_object('origin',req.request_origin));
   -- pt.reject-notifies-requester
   if req.request_origin='APPLICANT_REQUEST' then perform private.notify(applicant.creator_entity_id, me, 'play_together.request_rejected', host.session_id, private.play_together_notification_context(host.session_id)); end if;
   return 'REJECTED';
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
 -- pt.approve-notifies-requester
 if req.request_origin='APPLICANT_REQUEST' then perform private.notify(applicant.creator_entity_id, me, 'play_together.request_approved', host.session_id, private.play_together_notification_context(host.session_id)); end if;
 if host.intent='TEAM_VS_TEAM' or host.seats_filled>=host.seats_wanted then perform private.open_play_together_ready_check(host.session_id); end if;
 return 'APPROVED';
end $$;
