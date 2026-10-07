-- TESTING: 30-second displayed limit; inclusive 31-second metadata tolerance.
-- Only duration guards change. Authorization, ownership, grants and activation are preserved.
alter table public.intro_processing_jobs drop constraint intro_processing_jobs_source_duration_ms_check;
alter table public.intro_processing_jobs add constraint intro_processing_jobs_source_duration_ms_check check (source_duration_ms between 500 and 31000);

CREATE OR REPLACE FUNCTION private.worker_complete_intro_job_impl(candidate_job_id uuid, candidate_derivative_path text, candidate_size bigint, candidate_duration_ms integer, candidate_width integer, candidate_height integer, candidate_fps numeric, candidate_video_bitrate integer, candidate_audio_bitrate integer, candidate_total_bitrate integer, candidate_has_audio boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job public.intro_processing_jobs%rowtype; old_active uuid;
begin
  select * into job from public.intro_processing_jobs where job_id=candidate_job_id and state='processing' for update;
  if job.job_id is null then raise exception using errcode='22023',message='INTRO_JOB_NOT_PROCESSING'; end if;
  if candidate_derivative_path <> job.owner_user_id::text||'/'||job.job_id::text||'/intro-d3.webm' then raise exception using errcode='22023',message='INVALID_INTRO_DERIVATIVE_PATH'; end if;
  if candidate_size < 1 or candidate_size > 15728640 or candidate_duration_ms < 500 or candidate_duration_ms > 31000 then raise exception using errcode='22023',message='INVALID_INTRO_DERIVATIVE'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id='intro-media' and o.name=candidate_derivative_path) then raise exception using errcode='22023',message='INTRO_DERIVATIVE_NOT_FOUND'; end if;
  select active_job_id into old_active from public.profile_intro_settings where profile_id=job.profile_id for update;
  update public.intro_processing_jobs set state='ready',derivative_path=candidate_derivative_path,output_size_bytes=candidate_size,
    output_duration_ms=candidate_duration_ms,output_width=candidate_width,output_height=candidate_height,output_fps=candidate_fps,
    output_video_bitrate=candidate_video_bitrate,output_audio_bitrate=candidate_audio_bitrate,output_total_bitrate=candidate_total_bitrate,
    output_has_audio=candidate_has_audio,source_cleanup_eligible_at=now(),completed_at=now(),updated_at=now()
    where job_id=candidate_job_id;
  update public.profile_intro_settings set active_job_id=candidate_job_id,transition_key=job.requested_transition,updated_at=now() where profile_id=job.profile_id;
  update public.intro_processing_jobs set derivative_cleanup_eligible_at=now(),updated_at=now()
    where job_id=old_active and old_active is distinct from candidate_job_id and derivative_deleted_at is null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.queue_my_intro_impl(candidate_job_id uuid, candidate_source_path text, candidate_transition text, candidate_source_mime text, candidate_source_size bigint, candidate_duration_ms integer)
 RETURNS TABLE(job_id uuid, state text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := auth.uid();
  owned_profile uuid := private.my_solo_profile_id();
  expected_prefix text;
begin
  if caller is null or owned_profile is null then raise exception using errcode='42501', message='NOT_AUTHORIZED'; end if;
  if candidate_transition not in ('fade','blur','shrink','slide','split') then raise exception using errcode='22023', message='INVALID_INTRO_TRANSITION'; end if;
  if candidate_source_mime not in ('video/mp4','video/quicktime','video/webm') then raise exception using errcode='22023', message='INVALID_INTRO_TYPE'; end if;
  if candidate_source_size < 1 or candidate_source_size > 157286400 then raise exception using errcode='22023', message='INTRO_SOURCE_TOO_LARGE'; end if;
  if candidate_duration_ms < 500 or candidate_duration_ms > 31000 then raise exception using errcode='22023', message='INTRO_DURATION_INVALID'; end if;
  expected_prefix := caller::text || '/' || candidate_job_id::text || '/source.';
  if candidate_source_path not like (expected_prefix || '%') or candidate_source_path ~ '[^a-zA-Z0-9_./-]' then
    raise exception using errcode='22023', message='INVALID_INTRO_SOURCE_PATH';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id='intro-sources' and o.name=candidate_source_path
      and (o.owner_id=caller::text or private.usage_object_owned(o.bucket_id,o.name,caller)) and coalesce((o.metadata->>'size')::bigint,0)=candidate_source_size
  ) then raise exception using errcode='22023', message='INTRO_SOURCE_NOT_FOUND'; end if;
  if exists (select 1 from public.intro_processing_jobs j where j.profile_id=owned_profile and j.state in ('pending','processing')) then
    raise exception using errcode='23505', message='INTRO_PROCESSING_IN_PROGRESS';
  end if;
  insert into public.profile_intro_settings(profile_id, transition_key)
    values (owned_profile, candidate_transition)
    on conflict (profile_id) do update set transition_key=excluded.transition_key, updated_at=now();
  insert into public.intro_processing_jobs(job_id,profile_id,owner_user_id,requested_transition,source_path,source_mime,source_size_bytes,source_duration_ms)
    values (candidate_job_id,owned_profile,caller,candidate_transition,candidate_source_path,candidate_source_mime,candidate_source_size,candidate_duration_ms);
  return query select candidate_job_id, 'pending'::text;
end;
$function$
;