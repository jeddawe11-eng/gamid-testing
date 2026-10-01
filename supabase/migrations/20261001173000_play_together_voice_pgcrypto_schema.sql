-- Keep the Play Together voice OAuth state generator compatible with the
-- hardened empty search_path used by the security-definer implementation.

create or replace function private.start_play_together_voice_oauth_impl(candidate_session_id uuid)
returns table(state text,expires_at timestamptz) language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=private.play_together_my_entity(); raw text; account_id text;
begin
 if me is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if not private.play_together_voice_member(candidate_session_id,me) then raise exception using errcode='42501',message='NOT_PARTICIPANT'; end if;
 if not exists(select 1 from public.play_together_sessions where session_id=candidate_session_id and status in ('ROOM_OPEN','IN_PLAY')) then raise exception using errcode='22023',message='TEAM_ROOM_NOT_OPEN'; end if;
 select provider_account_id into account_id from public.gaming_connections where entity_id=me and provider_key='discord';
 if account_id is null then raise exception using errcode='22023',message='DISCORD_NOT_LINKED'; end if;
 raw:=encode(extensions.gen_random_bytes(32),'hex');
 insert into private.play_together_voice_oauth_attempts(state_hash,entity_id,session_id,provider_key,expected_provider_account_id,expires_at)
 values(encode(extensions.digest(raw,'sha256'),'hex'),me,candidate_session_id,'discord',account_id,now()+interval '10 minutes');
 state:=raw; expires_at:=now()+interval '10 minutes'; return next;
end $$;
