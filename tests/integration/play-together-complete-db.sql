-- Play Together complete milestone — TESTING-only transactional behavior test.
-- Caller MUST wrap this file in BEGIN/ROLLBACK. Uses disposable identities only.
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
 select session_id into host_id from public.create_play_together_attempt('NEED_PLAYERS','ME','sr_draft','me1',1,array['en'],'PREFERRED','PLAY_NOW',null,'lol_mid','{}','[]'); reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',ub,'role','authenticated')::text,true); set local role authenticated;
 select session_id into find_id from public.create_play_together_attempt('FIND_SQUAD','ME','sr_draft','me1',0,array['en','ar'],'REQUIRED','PLAY_NOW',null,'lol_support','{}','[]');
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
 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated; perform public.advance_play_together_room(host_id,'START'); perform public.advance_play_together_room(host_id,'COMPLETE'); reset role;
 if (select status from public.play_together_sessions where session_id=host_id)<>'COMPLETED' then raise exception 'room completion missing'; end if;

 perform set_config('request.jwt.claims',json_build_object('sub',uc,'role','authenticated')::text,true); set local role authenticated;
 select session_id into group_id from public.create_play_together_attempt('NEED_PLAYERS','US','sr_draft','me1',1,array['en'],'NO_PREFERENCE','PLAY_NOW',null,'lol_top',array[ed],jsonb_build_array(jsonb_build_object('name','Manual Guest','position_key','lol_jungle','game_data',jsonb_build_object('verification','MANUAL_UNVERIFIED')))); reset role;
 if (select status from public.play_together_sessions where session_id=group_id)<>'GROUP_FORMING' then raise exception 'US group did not wait for fresh acceptance'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',ud,'role','authenticated')::text,true); set local role authenticated; perform public.respond_play_together_invitation(group_id,true); reset role;
 if (select current_group_size from public.play_together_sessions where session_id=group_id)<>3 then raise exception 'confirmed group size was not derived'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',uc,'role','authenticated')::text,true); set local role authenticated; perform public.cancel_my_play_together_session(group_id); reset role;

 perform set_config('request.jwt.claims',json_build_object('sub',ua,'role','authenticated')::text,true); set local role authenticated;
 perform public.set_play_together_avoid(eb,'league_of_legends',true); perform public.set_play_together_avoid(ec,'league_of_legends',true);
 begin perform public.set_play_together_avoid(ed,'league_of_legends',true); raise exception 'avoid cap not enforced'; exception when sqlstate '22023' then if sqlerrm<>'AVOID_LIMIT_REACHED' then raise; end if; end;
 select public.get_play_together_dashboard() into js; reset role;
 if jsonb_array_length(js->'played_with')<>1 or js->'last_setup' is null then raise exception 'history/Played With/Last Setup dashboard missing'; end if;
end $test$;
