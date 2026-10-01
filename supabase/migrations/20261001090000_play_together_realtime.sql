-- Play Together private Realtime invalidation for TESTING.
-- Payloads contain only a session identifier; clients re-read authorized state through existing RPCs.

create policy "play_together_participant_broadcasts"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'play-together:user:' || (select auth.uid())::text
);

create or replace function private.broadcast_play_together_user(candidate_user_id uuid, candidate_session_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if candidate_user_id is not null then
    perform realtime.send(
      jsonb_build_object('session_id',candidate_session_id),
      'state_changed',
      'play-together:user:'||candidate_user_id::text,
      true
    );
  end if;
exception when others then
  -- Live delivery must never roll back the canonical Play Together transaction.
  null;
end $$;

create or replace function private.broadcast_play_together_entity(candidate_entity_id uuid, candidate_session_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare candidate_user_id uuid;
begin
  for candidate_user_id in
    select m.user_id from public.entity_memberships m
    where m.entity_id=candidate_entity_id and m.role='OWNER'
  loop
    perform private.broadcast_play_together_user(candidate_user_id,candidate_session_id);
  end loop;
end $$;

create or replace function private.broadcast_play_together_session(candidate_session_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare candidate_user_id uuid;
begin
  for candidate_user_id in
    select distinct em.user_id
    from public.entity_memberships em
    where em.role='OWNER' and em.entity_id in (
      select s.creator_entity_id from public.play_together_sessions s where s.session_id=candidate_session_id
      union
      select m.entity_id from public.play_together_members m where m.session_id=candidate_session_id and m.entity_id is not null
      union
      select m.represented_by_entity_id from public.play_together_members m where m.session_id=candidate_session_id and m.represented_by_entity_id is not null
    )
  loop
    perform private.broadcast_play_together_user(candidate_user_id,candidate_session_id);
  end loop;
end $$;

create or replace function private.play_together_realtime_session_trigger()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  perform private.broadcast_play_together_session(coalesce(new.session_id,old.session_id));
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create or replace function private.play_together_realtime_request_trigger()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  perform private.broadcast_play_together_session(coalesce(new.applicant_session_id,old.applicant_session_id));
  perform private.broadcast_play_together_session(coalesce(new.host_session_id,old.host_session_id));
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create or replace function private.play_together_realtime_ready_response_trigger()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare sid uuid;
begin
  select rc.session_id into sid from public.play_together_ready_checks rc
  where rc.ready_check_id=coalesce(new.ready_check_id,old.ready_check_id);
  perform private.broadcast_play_together_session(sid);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create or replace function private.play_together_realtime_avoid_trigger()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  perform private.broadcast_play_together_entity(coalesce(new.owner_entity_id,old.owner_entity_id),null);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create or replace function private.play_together_realtime_voice_participant_trigger()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare sid uuid;
begin
  select vs.session_id into sid from private.play_together_voice_sessions vs
  where vs.voice_session_id=coalesce(new.voice_session_id,old.voice_session_id);
  perform private.broadcast_play_together_session(sid);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create trigger play_together_sessions_realtime after insert or update or delete on public.play_together_sessions for each row execute function private.play_together_realtime_session_trigger();
create trigger play_together_members_realtime after insert or update or delete on public.play_together_members for each row execute function private.play_together_realtime_session_trigger();
create trigger play_together_requests_realtime after insert or update or delete on public.play_together_join_requests for each row execute function private.play_together_realtime_request_trigger();
create trigger play_together_ready_checks_realtime after insert or update or delete on public.play_together_ready_checks for each row execute function private.play_together_realtime_session_trigger();
create trigger play_together_ready_responses_realtime after insert or update or delete on public.play_together_ready_responses for each row execute function private.play_together_realtime_ready_response_trigger();
create trigger play_together_rooms_realtime after insert or update or delete on public.play_together_rooms for each row execute function private.play_together_realtime_session_trigger();
create trigger play_together_events_realtime after insert or update or delete on public.play_together_events for each row execute function private.play_together_realtime_session_trigger();
create trigger play_together_avoids_realtime after insert or update or delete on public.play_together_avoids for each row execute function private.play_together_realtime_avoid_trigger();
create trigger play_together_voice_sessions_realtime after insert or update or delete on private.play_together_voice_sessions for each row execute function private.play_together_realtime_session_trigger();
create trigger play_together_voice_participants_realtime after insert or update or delete on private.play_together_voice_participants for each row execute function private.play_together_realtime_voice_participant_trigger();

revoke all on function private.broadcast_play_together_user(uuid,uuid),private.broadcast_play_together_entity(uuid,uuid),private.broadcast_play_together_session(uuid),private.play_together_realtime_session_trigger(),private.play_together_realtime_request_trigger(),private.play_together_realtime_ready_response_trigger(),private.play_together_realtime_avoid_trigger(),private.play_together_realtime_voice_participant_trigger() from public,anon,authenticated,service_role;
