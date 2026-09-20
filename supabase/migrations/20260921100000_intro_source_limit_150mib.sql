-- Intro source upload limit: 100 MiB -> 150 MiB (157,286,400 bytes). TESTING only.
--
-- ONE narrow change. Unit convention is unchanged: the limit is counted in 1024*1024-byte units (MiB) and shown to people as "MB", exactly like the
-- original 104,857,600-byte limit. Every server-side enforcement point that carried the old number is updated consistently:
--   1. storage bucket `intro-sources` file_size_limit           (Storage rejects a larger object before it is stored)
--   2. RPC private.queue_my_intro_impl                            (a job cannot be queued for a larger source)
--   3. table CHECK intro_processing_jobs_source_size_bytes_check  (a larger source cannot be recorded by any path)
-- The worker's own SOURCE_TOO_LARGE guard and the browser validation are updated in the same change (worker/intro-worker.mjs, dist/account).
--
-- NOT changed: the Intro duration limit (500..30000 ms), the allowed source types, the `intro-media` derivative bucket (15 MiB) and the
-- derivative size CHECK, D2/D3 policy, FFmpeg settings, and every existing row. Earlier migrations are left exactly as they were; the function
-- below is re-declared identically except for the size constant (grants, security definer and empty search_path are preserved by CREATE OR REPLACE).

update storage.buckets set file_size_limit = 157286400 where id = 'intro-sources';

alter table public.intro_processing_jobs drop constraint intro_processing_jobs_source_size_bytes_check;
alter table public.intro_processing_jobs add constraint intro_processing_jobs_source_size_bytes_check check (source_size_bytes >= 1 and source_size_bytes <= 157286400);

create or replace function private.queue_my_intro_impl(
  candidate_job_id uuid, candidate_source_path text, candidate_transition text,
  candidate_source_mime text, candidate_source_size bigint, candidate_duration_ms integer
) returns table (job_id uuid, state text)
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  owned_profile uuid := private.my_solo_profile_id();
  expected_prefix text;
begin
  if caller is null or owned_profile is null then raise exception using errcode='42501', message='NOT_AUTHORIZED'; end if;
  if candidate_transition not in ('fade','blur','shrink','slide','split') then raise exception using errcode='22023', message='INVALID_INTRO_TRANSITION'; end if;
  if candidate_source_mime not in ('video/mp4','video/quicktime','video/webm') then raise exception using errcode='22023', message='INVALID_INTRO_TYPE'; end if;
  if candidate_source_size < 1 or candidate_source_size > 157286400 then raise exception using errcode='22023', message='INTRO_SOURCE_TOO_LARGE'; end if;
  if candidate_duration_ms < 500 or candidate_duration_ms > 30000 then raise exception using errcode='22023', message='INTRO_DURATION_INVALID'; end if;
  expected_prefix := caller::text || '/' || candidate_job_id::text || '/source.';
  if candidate_source_path not like (expected_prefix || '%') or candidate_source_path ~ '[^a-zA-Z0-9_./-]' then
    raise exception using errcode='22023', message='INVALID_INTRO_SOURCE_PATH';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id='intro-sources' and o.name=candidate_source_path
      and o.owner_id=caller::text and coalesce((o.metadata->>'size')::bigint,0)=candidate_source_size
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
$$;
