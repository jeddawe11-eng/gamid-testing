-- TESTING only: disposable fixtures, no Discord calls, always rolled back.
begin;
do $test$
declare
 ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid(); uc uuid:=gen_random_uuid(); ud uuid:=gen_random_uuid();
 ea uuid; eb uuid; ec uuid; ed uuid; host_id uuid; find_id uuid; group_id uuid; req_id uuid; member_a uuid; member_b uuid;
 got text; cnt integer; js jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at) values
  (ua,'pt-complete-a@example.invalid',now()),(ub,'pt-complete-b@example.invalid',now()),
  (uc,'pt-complete-c@example.invalid',now()),(ud,'pt-complete-d@example.invalid',now());
 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated; perform 1 from public.create_solo_identity('ptcompletea','PT Complete A',date '1990-01-01','en'); reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ub,'role','authenticated')::text,true); set local role authenticated; perform 1 from public.create_solo_identity('ptcompleteb','PT Complete B',date '1990-01-01','en'); reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',uc,'role','authenticated')::text,true); set local role authenticated; perform 1 from public.create_solo_identity('ptcompletec','PT Complete C',date '1990-01-01','en'); reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ud,'role','authenticated')::text,true); set local role authenticated; perform 1 from public.create_solo_identity('ptcompleted','PT Complete D',date '1990-01-01','en'); reset role;
 select entity_id into ea from public.entities where gamid_handle='ptcompletea'; select entity_id into eb from public.entities where gamid_handle='ptcompleteb'; select entity_id into ec from public.entities where gamid_handle='ptcompletec'; select entity_id into ed from public.entities where gamid_handle='ptcompleted';

 if has_table_privilege('authenticated','public.play_together_members','INSERT') or has_table_privilege('authenticated','public.play_together_join_requests','UPDATE') or has_table_privilege('anon','public.play_together_rooms','SELECT') then raise exception 'direct table privilege leak'; end if;
 if has_function_privilege('anon','public.create_play_together_attempt(text,text,text,text,integer,text[],text,text,timestamptz,text,uuid[],jsonb)','EXECUTE') then raise exception 'anonymous create privilege leak'; end if;

 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated;
 select session_id into host_id from public.create_play_together_attempt('NEED_PLAYERS','ME','mr_quick_match','mr_singapore',1,array['en'],'PREFERRED','PLAY_NOW',null,null,'{}','[]'); reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ub,'role','authenticated')::text,true); set local role authenticated;
 select session_id into find_id from public.create_play_together_attempt('FIND_SQUAD','ME','mr_quick_match','mr_singapore',0,array['en','ar'],'REQUIRED','PLAY_NOW',null,null,'{}','[]');
 if not exists(select 1 from public.get_play_together_matches(find_id) where session_id=host_id) then raise exception 'eligible host not surfaced'; end if;
 select public.request_play_together_host(find_id,host_id) into req_id; reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated;
 perform public.respond_play_together_request(req_id,true); reset role;
 if (select status from public.play_together_sessions where session_id=host_id)<>'READY_CHECK' then raise exception 'approval did not open Ready Check'; end if;
 if (select status from public.play_together_sessions where session_id=find_id)<>'MATCHED' then raise exception 'search record was falsely completed'; end if;
 select member_id into member_a from public.play_together_members where session_id=host_id and entity_id=ea; select member_id into member_b from public.play_together_members where session_id=host_id and entity_id=eb;
 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated; perform public.respond_play_together_ready(member_a,true); reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ub,'role','authenticated')::text,true); set local role authenticated; perform public.respond_play_together_ready(member_b,true); reset role;
 if not exists(select 1 from public.play_together_rooms where session_id=host_id and room_status='OPEN') then raise exception 'canonical room did not open'; end if;
 if (select status from public.play_together_sessions where session_id=host_id)<>'ROOM_OPEN' then raise exception 'session did not enter ROOM_OPEN'; end if;
 if (select count(*) from private.play_together_last_setup where entity_id in(ea,eb))<>2 then raise exception 'Last Setup not stored for both registered participants'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',ub,'role','authenticated')::text,true); set local role authenticated;
 begin perform public.advance_play_together_room(host_id,'COMPLETE'); raise exception 'non-host completion accepted';
 exception when sqlstate '42501' then if sqlerrm<>'NOT_HOST' then raise; end if; end;
 reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated; perform public.advance_play_together_room(host_id,'START'); perform public.advance_play_together_room(host_id,'COMPLETE'); reset role;
 if (select status from public.play_together_sessions where session_id=host_id)<>'COMPLETED' then raise exception 'room completion missing'; end if;

 if (select creator_entity_id from public.play_together_sessions where session_id=host_id)<>ea then raise exception 'completion changed host'; end if;
 if exists(select 1 from private.play_together_active_entities where session_id=host_id) then raise exception 'completion did not release participants'; end if;
 if (select room_status from public.play_together_rooms where session_id=host_id)<>'COMPLETED' then raise exception 'room not completed'; end if;
 if (select count(*) from public.play_together_events where session_id=host_id and event_type='COMPLETED')<>1 then raise exception 'completion event not singular'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated;
 select public.get_play_together_dashboard() into js; reset role;
 if js->'active_session'<>'null'::jsonb or not js->'history' @> jsonb_build_array(jsonb_build_object('session_id',host_id,'status','COMPLETED')) then raise exception 'terminal dashboard incorrect'; end if;
end $test$;
select 'PASS: Marvel Quick Match completion, host authority unchanged, participant NOT_HOST is genuine, released active state and singular history event' as result;
rollback;
