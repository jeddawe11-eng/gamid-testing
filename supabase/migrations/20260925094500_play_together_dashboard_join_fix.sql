-- Correct the applied milestone dashboard query: sessions and queues both carry
-- rule_set_id, so a later USING(rule_set_id) is ambiguous in PostgreSQL.
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
  'history',coalesce((select jsonb_agg(jsonb_build_object('session_id',s.session_id,'intent',s.intent,'status',s.status,'queue_name',q.official_name,'region_name',r.official_name,'formed_at',s.formed_at,'ended_at',s.ended_at) order by coalesce(s.ended_at,s.created_at) desc) from public.play_together_members m join public.play_together_sessions s using(session_id) join public.play_together_queues q using(queue_key) join public.play_together_regions r using(region_key) where m.entity_id=me and s.status in ('COMPLETED','CANCELLED','EXPIRED') limit 20),'[]'::jsonb),
  'played_with',coalesce((select jsonb_agg(jsonb_build_object('entity_id',z.entity_id,'handle',z.gamid_handle,'name',z.display_name,'last_played_at',z.last_played_at) order by z.last_played_at desc) from (select e3.entity_id,e3.gamid_handle,e3.display_name,max(s3.formed_at) last_played_at from public.play_together_members mine join public.play_together_sessions s3 using(session_id) join public.play_together_members other using(session_id) join public.entities e3 on e3.entity_id=other.entity_id where mine.entity_id=me and other.entity_id is not null and other.entity_id<>me and s3.formed_at is not null group by e3.entity_id,e3.gamid_handle,e3.display_name limit 20) z),'[]'::jsonb)
 ) into result from public.entities e where e.entity_id=me;
 return result;
end $$;

revoke all on function private.get_play_together_dashboard_impl() from public,anon,authenticated,service_role;
grant execute on function private.get_play_together_dashboard_impl() to authenticated;
