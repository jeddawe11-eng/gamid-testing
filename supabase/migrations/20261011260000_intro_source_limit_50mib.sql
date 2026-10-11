-- Intro source upload limit: 150 MiB -> 50 MiB (52,428,800 bytes). Mazen's product decision (2026-10-11, ISS-0012): the single Intro file limit now matches
-- the effective TESTING upload limit (Supabase's project-wide 50 MiB file size limit, which refused larger uploads at the start). TESTING only.
-- Changed: the intro-sources bucket limit, the table CHECK and the queue RPC bound - every server-side Intro enforcement point - together.
-- Unchanged: the 200 MB account quota, Wall / Avatar / Banner and every other limit, Intro duration (0.5-30 s, 31 s tolerance), formats, processing, deletion
-- and the reservation lifecycle. Every existing job's source is at most 52,428,800 bytes (largest on TESTING 50,550,323), so the stricter CHECK holds for all rows.

update storage.buckets set file_size_limit = 52428800 where id = 'intro-sources';

alter table public.intro_processing_jobs drop constraint intro_processing_jobs_source_size_bytes_check;
alter table public.intro_processing_jobs add constraint intro_processing_jobs_source_size_bytes_check check (source_size_bytes >= 1 and source_size_bytes <= 52428800);

-- queue_my_intro: the live definition, with only its size bound changed (157286400 -> 52428800)
create or replace function private.queue_my_intro_impl(candidate_job_id uuid, candidate_source_path text, candidate_transition text, candidate_source_mime text, candidate_source_size bigint, candidate_duration_ms integer)
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
  if candidate_source_size < 1 or candidate_source_size > 52428800 then raise exception using errcode='22023', message='INTRO_SOURCE_TOO_LARGE'; end if;
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
$function$;
