-- The callback runs this security-definer function with an empty search_path.
-- pgcrypto is installed in extensions on Supabase, so qualify digest explicitly.

create or replace function private.consume_play_together_voice_oauth_impl(candidate_state text)
returns table(status text,attempt_id uuid,entity_id uuid,session_id uuid,expected_provider_account_id text) language plpgsql volatile security definer set search_path='' as $$
declare a private.play_together_voice_oauth_attempts%rowtype;
begin
 if candidate_state !~ '^[0-9a-f]{64}$' then status:='INVALID_STATE'; return next; return; end if;
 select * into a from private.play_together_voice_oauth_attempts where state_hash=encode(extensions.digest(candidate_state,'sha256'),'hex') for update;
 if not found then status:='INVALID_STATE'; return next; return; end if;
 if a.consumed_at is not null then status:='REPLAYED'; return next; return; end if;
 update private.play_together_voice_oauth_attempts set consumed_at=now() where private.play_together_voice_oauth_attempts.attempt_id=a.attempt_id;
 if a.expires_at<=now() then status:='EXPIRED'; return next; return; end if;
 status:='OK';attempt_id:=a.attempt_id;entity_id:=a.entity_id;session_id:=a.session_id;expected_provider_account_id:=a.expected_provider_account_id;return next;
end $$;
