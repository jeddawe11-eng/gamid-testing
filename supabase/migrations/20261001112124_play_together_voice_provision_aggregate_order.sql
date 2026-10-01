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
 select jsonb_agg(jsonb_build_object('entity_id',entity_id,'provider_account_id',provider_account_id) order by entity_id) into members from private.play_together_voice_participants where voice_session_id=v.voice_session_id;
 return jsonb_build_object('status','CLAIMED','voice_session_id',v.voice_session_id,'session_id',v.session_id,'channel_key',v.channel_key,'members',members);
end $$;
