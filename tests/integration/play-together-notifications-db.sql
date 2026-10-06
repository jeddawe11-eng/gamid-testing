-- TESTING only: disposable fixtures, always rolled back. Play Together -> GamID Notifications (20261006090000_play_together_notifications):
-- pt.join-request-notifies-host, pt.approve-notifies-requester, pt.reject-notifies-requester through the owner RPCs the bell and log read
-- (get_my_unread_notification_count, get_my_notifications), plus: the actor is never notified, uncontracted events do not notify, a refused
-- duplicate decision does not notify, and read state follows the owner RPCs.
begin;
do $test$
declare
 ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid(); uc uuid:=gen_random_uuid();
 ea uuid; eb uuid; ec uuid; host_id uuid; find_b uuid; find_c uuid; req_b uuid; req_c uuid; n integer; row_ record; ids bigint[];
begin
 insert into auth.users(id,email,email_confirmed_at) values (ua,'pt-notify-a@example.invalid',now()),(ub,'pt-notify-b@example.invalid',now()),(uc,'pt-notify-c@example.invalid',now());
 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated; perform 1 from public.create_solo_identity('ptnotifya','PT Notify A',date '1990-01-01','en'); reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ub,'role','authenticated')::text,true); set local role authenticated; perform 1 from public.create_solo_identity('ptnotifyb','PT Notify B',date '1990-01-01','en'); reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',uc,'role','authenticated')::text,true); set local role authenticated; perform 1 from public.create_solo_identity('ptnotifyc','PT Notify C',date '1990-01-01','en'); reset role;
 select entity_id into ea from public.entities where gamid_handle='ptnotifya'; select entity_id into eb from public.entities where gamid_handle='ptnotifyb'; select entity_id into ec from public.entities where gamid_handle='ptnotifyc';

 if (select count(*) from public.notification_types where producer='play_together' and active)<>3 then raise exception 'exactly three Play Together types expected'; end if;

 -- CREATE has no notification contract
 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated;
 select session_id into host_id from public.create_play_together_attempt('NEED_PLAYERS','ME','mr_quick_match','mr_singapore',2,array['en'],'PREFERRED','PLAY_NOW',null,null,'{}','[]'); reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ub,'role','authenticated')::text,true); set local role authenticated;
 select session_id into find_b from public.create_play_together_attempt('FIND_SQUAD','ME','mr_quick_match','mr_singapore',0,array['en'],'PREFERRED','PLAY_NOW',null,null,'{}','[]'); reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',uc,'role','authenticated')::text,true); set local role authenticated;
 select session_id into find_c from public.create_play_together_attempt('FIND_SQUAD','ME','mr_quick_match','mr_singapore',0,array['en'],'PREFERRED','PLAY_NOW',null,null,'{}','[]'); reset role;
 if exists(select 1 from public.notifications where recipient_entity_id in (ea,eb,ec)) then raise exception 'creating an attempt notified someone'; end if;

 -- pt.join-request-notifies-host: B and C request A's session
 perform set_config('request.jwt.claims',json_build_object('sub',ub,'role','authenticated')::text,true); set local role authenticated;
 select public.request_play_together_host(find_b,host_id) into req_b;
 if public.get_my_unread_notification_count()<>0 then raise exception 'the requester was notified of their own request'; end if; reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',uc,'role','authenticated')::text,true); set local role authenticated;
 select public.request_play_together_host(find_c,host_id) into req_c; reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated;
 if public.get_my_unread_notification_count()<>2 then raise exception 'host unread count did not rise by one per join request'; end if;
 select count(*) into n from public.get_my_notifications(null,30) g where g.type_key='play_together.request_received' and g.producer='play_together' and g.destination='play_together.requests' and g.actor_handle in ('ptnotifyb','ptnotifyc') and g.read_at is null and g.subject_id=host_id and g.context->>'queue_name' is not null;
 if n<>2 then raise exception 'host log lacks the two join requests (got %)', n; end if;

 -- pt.reject-notifies-requester: A rejects C
 perform public.respond_play_together_request(req_c,false);
 -- pt.approve-notifies-requester: A approves B
 perform public.respond_play_together_request(req_b,true);
 if public.get_my_unread_notification_count()<>2 then raise exception 'the deciding host was notified of their own decision'; end if;
 -- a refused duplicate decision changes nothing and notifies nobody
 begin perform public.respond_play_together_request(req_b,true); raise exception 'duplicate approve accepted';
 exception when sqlstate 'P0002' then if sqlerrm<>'PENDING_REQUEST_NOT_FOUND' then raise; end if; end;
 reset role;

 perform set_config('request.jwt.claims',json_build_object('sub',ub,'role','authenticated')::text,true); set local role authenticated;
 if public.get_my_unread_notification_count()<>1 then raise exception 'approved requester unread count is not 1'; end if;
 select * into row_ from public.get_my_notifications(null,30) limit 1;
 if row_.type_key<>'play_together.request_approved' or row_.actor_handle<>'ptnotifya' or row_.destination<>'play_together.session' or row_.subject_id<>host_id then raise exception 'approved requester log row wrong: %', row_; end if;
 reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',uc,'role','authenticated')::text,true); set local role authenticated;
 if public.get_my_unread_notification_count()<>1 then raise exception 'rejected requester unread count is not 1'; end if;
 select * into row_ from public.get_my_notifications(null,30) limit 1;
 if row_.type_key<>'play_together.request_rejected' or row_.actor_handle<>'ptnotifya' or row_.destination<>'play_together.session' then raise exception 'rejected requester log row wrong: %', row_; end if;
 -- read state is the owner's: marking read lowers only this owner's count
 select array_agg(g.notification_id) into ids from public.get_my_notifications(null,30) g;
 if public.mark_my_notifications_read(ids)<>1 then raise exception 'mark read changed the wrong number of rows'; end if;
 if public.get_my_unread_notification_count()<>0 then raise exception 'mark read did not clear the requester count'; end if;   -- a separate statement: a STABLE read sees the update
 reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated;
 if public.get_my_unread_notification_count()<>2 then raise exception 'another owner''s read changed the host count'; end if;
 reset role;

 -- the Play Together lifecycle itself is unchanged
 if (select request_status from public.play_together_join_requests where request_id=req_b)<>'APPROVED' or (select request_status from public.play_together_join_requests where request_id=req_c)<>'REJECTED' then raise exception 'request states changed'; end if;
 if (select status from public.play_together_sessions where session_id=find_b)<>'MATCHED' or (select status from public.play_together_sessions where session_id=find_c)<>'MATCHING' then raise exception 'applicant session states changed'; end if;
 if (select seats_filled from public.play_together_sessions where session_id=host_id)<>1 then raise exception 'host seats changed'; end if;
 if (select count(*) from public.notifications where type_key like 'play_together.%')<>4 then raise exception 'unexpected Play Together notification count'; end if;
 if not exists(select 1 from pg_trigger where tgname='notifications_realtime' and tgrelid='public.notifications'::regclass) then raise exception 'realtime wake-up trigger missing'; end if;
end $test$;
select 'PASS: join request -> host, approve / reject -> requester, unread counts + log rows + destinations, no self / uncontracted / duplicate notification, owner read state, lifecycle unchanged' as result;
rollback;
