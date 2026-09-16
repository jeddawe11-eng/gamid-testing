-- Slice 3C: private per-user Intro media, provider-neutral processing jobs,
-- and the narrow RPC boundary used by the browser and external FFmpeg worker.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('intro-sources', 'intro-sources', false, 104857600, array['video/mp4','video/quicktime','video/webm']),
  ('intro-media', 'intro-media', false, 15728640, array['video/webm'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.intro_processing_jobs (
  job_id uuid primary key,
  profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','processing','ready','failed','cancelled')),
  requested_transition text not null check (requested_transition in ('fade','blur','shrink','slide','split')),
  source_path text not null unique,
  source_mime text not null check (source_mime in ('video/mp4','video/quicktime','video/webm')),
  source_size_bytes bigint not null check (source_size_bytes between 1 and 104857600),
  source_duration_ms integer not null check (source_duration_ms between 500 and 30000),
  derivative_path text unique,
  output_size_bytes bigint check (output_size_bytes between 1 and 15728640),
  output_duration_ms integer,
  output_width integer,
  output_height integer,
  output_fps numeric(8,3),
  output_video_bitrate integer,
  output_audio_bitrate integer,
  output_total_bitrate integer,
  output_has_audio boolean,
  failure_code text,
  source_cleanup_eligible_at timestamptz,
  source_deleted_at timestamptz,
  derivative_cleanup_eligible_at timestamptz,
  derivative_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index intro_one_inflight_job_per_profile
  on public.intro_processing_jobs(profile_id)
  where state in ('pending','processing');
create index intro_jobs_owner_created_idx on public.intro_processing_jobs(owner_user_id, created_at desc);
create index intro_jobs_cleanup_idx on public.intro_processing_jobs(source_cleanup_eligible_at, derivative_cleanup_eligible_at);

create table public.profile_intro_settings (
  profile_id uuid primary key references public.profiles(profile_id) on delete cascade,
  active_job_id uuid references public.intro_processing_jobs(job_id) on delete set null,
  transition_key text not null default 'fade' check (transition_key in ('fade','blur','shrink','slide','split')),
  updated_at timestamptz not null default now()
);

alter table public.intro_processing_jobs enable row level security;
alter table public.profile_intro_settings enable row level security;

create policy "owners read their intro jobs"
on public.intro_processing_jobs for select to authenticated
using (owner_user_id = (select auth.uid()));

create policy "owners read their intro settings"
on public.profile_intro_settings for select to authenticated
using (exists (
  select 1 from public.profiles p
  join public.entity_memberships m on m.entity_id = p.entity_id
  where p.profile_id = profile_intro_settings.profile_id
    and m.user_id = (select auth.uid()) and m.role = 'OWNER'
));

create policy "users upload intro sources to their folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'intro-sources' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users read their intro sources"
on storage.objects for select to authenticated
using (bucket_id = 'intro-sources' and owner_id = (select auth.uid())::text);
create policy "users delete their uncommitted intro sources"
on storage.objects for delete to authenticated
using (bucket_id = 'intro-sources' and owner_id = (select auth.uid())::text and not exists (
  select 1 from public.intro_processing_jobs j
  where j.source_path = storage.objects.name and j.state in ('pending','processing')
));
create policy "users read their optimized intros"
on storage.objects for select to authenticated
using (bucket_id = 'intro-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create function private.my_solo_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.profile_id from public.profiles p
  join public.entities e on e.entity_id = p.entity_id
  join public.entity_memberships m on m.entity_id = e.entity_id
  where m.user_id = (select auth.uid()) and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
$$;

create function private.get_my_intro_impl()
returns table (
  profile_id uuid, transition_key text, active_job_id uuid, active_derivative_path text,
  active_duration_ms integer, active_state text, latest_job_id uuid, latest_job_state text,
  latest_failure_code text, latest_created_at timestamptz
) language sql stable security definer set search_path = '' as $$
  with owned as (select private.my_solo_profile_id() profile_id),
  latest as (
    select j.* from public.intro_processing_jobs j, owned o
    where j.profile_id = o.profile_id order by j.created_at desc limit 1
  )
  select o.profile_id, coalesce(s.transition_key, 'fade'), s.active_job_id,
    active.derivative_path, active.output_duration_ms, active.state,
    latest.job_id, latest.state, latest.failure_code, latest.created_at
  from owned o
  left join public.profile_intro_settings s on s.profile_id = o.profile_id
  left join public.intro_processing_jobs active on active.job_id = s.active_job_id
  left join latest on true;
$$;

create function private.queue_my_intro_impl(
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
  if candidate_source_size < 1 or candidate_source_size > 104857600 then raise exception using errcode='22023', message='INTRO_SOURCE_TOO_LARGE'; end if;
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

create function private.set_my_intro_transition_impl(candidate_transition text)
returns void language plpgsql security definer set search_path = '' as $$
declare owned_profile uuid := private.my_solo_profile_id();
begin
  if owned_profile is null then raise exception using errcode='42501', message='NOT_AUTHORIZED'; end if;
  if candidate_transition not in ('fade','blur','shrink','slide','split') then raise exception using errcode='22023', message='INVALID_INTRO_TRANSITION'; end if;
  insert into public.profile_intro_settings(profile_id,transition_key) values (owned_profile,candidate_transition)
    on conflict (profile_id) do update set transition_key=excluded.transition_key,updated_at=now();
end;
$$;

create function private.remove_my_intro_impl()
returns void language plpgsql security definer set search_path = '' as $$
declare owned_profile uuid := private.my_solo_profile_id(); old_active uuid;
begin
  if owned_profile is null then raise exception using errcode='42501', message='NOT_AUTHORIZED'; end if;
  select active_job_id into old_active from public.profile_intro_settings where profile_id=owned_profile for update;
  update public.profile_intro_settings set active_job_id=null,updated_at=now() where profile_id=owned_profile;
  update public.intro_processing_jobs set derivative_cleanup_eligible_at=now(),updated_at=now()
    where job_id=old_active and derivative_deleted_at is null;
  update public.intro_processing_jobs set state='cancelled',source_cleanup_eligible_at=now(),updated_at=now()
    where profile_id=owned_profile and state='pending';
end;
$$;

create function public.get_my_intro()
returns table (profile_id uuid,transition_key text,active_job_id uuid,active_derivative_path text,active_duration_ms integer,active_state text,latest_job_id uuid,latest_job_state text,latest_failure_code text,latest_created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.get_my_intro_impl(); $$;
create function public.queue_my_intro(candidate_job_id uuid,candidate_source_path text,candidate_transition text,candidate_source_mime text,candidate_source_size bigint,candidate_duration_ms integer)
returns table(job_id uuid,state text) language sql security invoker set search_path = '' as $$
  select * from private.queue_my_intro_impl(candidate_job_id,candidate_source_path,candidate_transition,candidate_source_mime,candidate_source_size,candidate_duration_ms);
$$;
create function public.set_my_intro_transition(candidate_transition text)
returns void language sql security invoker set search_path = '' as $$ select private.set_my_intro_transition_impl(candidate_transition); $$;
create function public.remove_my_intro()
returns void language sql security invoker set search_path = '' as $$ select private.remove_my_intro_impl(); $$;

-- Worker-only functions. The public invoker wrapper checks the database role
-- before entering the private SECURITY DEFINER implementation.
create function private.worker_claim_intro_job_impl()
returns table(job_id uuid,owner_user_id uuid,source_path text,derivative_path text,source_mime text,source_size_bytes bigint,source_duration_ms integer)
language plpgsql security definer set search_path = '' as $$
declare picked public.intro_processing_jobs%rowtype;
begin
  select * into picked from public.intro_processing_jobs where state='pending' order by created_at for update skip locked limit 1;
  if picked.job_id is null then return; end if;
  update public.intro_processing_jobs set state='processing',started_at=now(),updated_at=now() where intro_processing_jobs.job_id=picked.job_id;
  return query select picked.job_id,picked.owner_user_id,picked.source_path,
    picked.owner_user_id::text||'/'||picked.job_id::text||'/intro-d3.webm',picked.source_mime,picked.source_size_bytes,picked.source_duration_ms;
end;
$$;

create function private.worker_complete_intro_job_impl(
  candidate_job_id uuid,candidate_derivative_path text,candidate_size bigint,candidate_duration_ms integer,
  candidate_width integer,candidate_height integer,candidate_fps numeric,candidate_video_bitrate integer,
  candidate_audio_bitrate integer,candidate_total_bitrate integer,candidate_has_audio boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare job public.intro_processing_jobs%rowtype; old_active uuid;
begin
  select * into job from public.intro_processing_jobs where job_id=candidate_job_id and state='processing' for update;
  if job.job_id is null then raise exception using errcode='22023',message='INTRO_JOB_NOT_PROCESSING'; end if;
  if candidate_derivative_path <> job.owner_user_id::text||'/'||job.job_id::text||'/intro-d3.webm' then raise exception using errcode='22023',message='INVALID_INTRO_DERIVATIVE_PATH'; end if;
  if candidate_size < 1 or candidate_size > 15728640 or candidate_duration_ms < 500 or candidate_duration_ms > 30000 then raise exception using errcode='22023',message='INVALID_INTRO_DERIVATIVE'; end if;
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
$$;

create function private.worker_fail_intro_job_impl(candidate_job_id uuid,candidate_failure_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.intro_processing_jobs set state='failed',failure_code=left(regexp_replace(coalesce(candidate_failure_code,'PROCESSING_FAILED'),'[^A-Z0-9_]','','g'),64),completed_at=now(),updated_at=now()
  where job_id=candidate_job_id and state='processing';
end;
$$;

create function private.worker_intro_cleanup_candidates_impl(candidate_limit integer default 20)
returns table(job_id uuid,source_path text,derivative_path text)
language sql stable security definer set search_path = '' as $$
  select j.job_id,
    case when j.source_cleanup_eligible_at is not null and j.source_deleted_at is null then j.source_path end,
    case when j.derivative_cleanup_eligible_at is not null and j.derivative_deleted_at is null then j.derivative_path end
  from public.intro_processing_jobs j
  where (j.source_cleanup_eligible_at is not null and j.source_deleted_at is null)
     or (j.derivative_cleanup_eligible_at is not null and j.derivative_deleted_at is null)
  order by coalesce(j.source_cleanup_eligible_at,j.derivative_cleanup_eligible_at) limit greatest(1,least(candidate_limit,100));
$$;

create function private.worker_confirm_intro_cleanup_impl(candidate_job_id uuid,candidate_source_deleted boolean,candidate_derivative_deleted boolean)
returns void language sql security definer set search_path = '' as $$
  update public.intro_processing_jobs set
    source_deleted_at=case when candidate_source_deleted then now() else source_deleted_at end,
    derivative_deleted_at=case when candidate_derivative_deleted then now() else derivative_deleted_at end,
    updated_at=now()
  where job_id=candidate_job_id;
$$;

create function public.worker_claim_intro_job()
returns table(job_id uuid,owner_user_id uuid,source_path text,derivative_path text,source_mime text,source_size_bytes bigint,source_duration_ms integer)
language plpgsql security invoker set search_path = '' as $$ begin if current_user <> 'service_role' then raise exception using errcode='42501',message='WORKER_ONLY'; end if; return query select * from private.worker_claim_intro_job_impl(); end; $$;
create function public.worker_complete_intro_job(candidate_job_id uuid,candidate_derivative_path text,candidate_size bigint,candidate_duration_ms integer,candidate_width integer,candidate_height integer,candidate_fps numeric,candidate_video_bitrate integer,candidate_audio_bitrate integer,candidate_total_bitrate integer,candidate_has_audio boolean)
returns void language plpgsql security invoker set search_path = '' as $$ begin if current_user <> 'service_role' then raise exception using errcode='42501',message='WORKER_ONLY'; end if; perform private.worker_complete_intro_job_impl(candidate_job_id,candidate_derivative_path,candidate_size,candidate_duration_ms,candidate_width,candidate_height,candidate_fps,candidate_video_bitrate,candidate_audio_bitrate,candidate_total_bitrate,candidate_has_audio); end; $$;
create function public.worker_fail_intro_job(candidate_job_id uuid,candidate_failure_code text)
returns void language plpgsql security invoker set search_path = '' as $$ begin if current_user <> 'service_role' then raise exception using errcode='42501',message='WORKER_ONLY'; end if; perform private.worker_fail_intro_job_impl(candidate_job_id,candidate_failure_code); end; $$;
create function public.worker_intro_cleanup_candidates(candidate_limit integer default 20)
returns table(job_id uuid,source_path text,derivative_path text) language plpgsql security invoker set search_path = '' as $$ begin if current_user <> 'service_role' then raise exception using errcode='42501',message='WORKER_ONLY'; end if; return query select * from private.worker_intro_cleanup_candidates_impl(candidate_limit); end; $$;
create function public.worker_confirm_intro_cleanup(candidate_job_id uuid,candidate_source_deleted boolean,candidate_derivative_deleted boolean)
returns void language plpgsql security invoker set search_path = '' as $$ begin if current_user <> 'service_role' then raise exception using errcode='42501',message='WORKER_ONLY'; end if; perform private.worker_confirm_intro_cleanup_impl(candidate_job_id,candidate_source_deleted,candidate_derivative_deleted); end; $$;

revoke all on table public.intro_processing_jobs,public.profile_intro_settings from public,anon,authenticated;
grant select on table public.intro_processing_jobs,public.profile_intro_settings to authenticated;
revoke all on all functions in schema private from public,anon;
grant execute on function private.get_my_intro_impl(),private.queue_my_intro_impl(uuid,text,text,text,bigint,integer),private.set_my_intro_transition_impl(text),private.remove_my_intro_impl() to authenticated;
grant execute on function public.get_my_intro(),public.queue_my_intro(uuid,text,text,text,bigint,integer),public.set_my_intro_transition(text),public.remove_my_intro() to authenticated;
revoke all on function public.get_my_intro(),public.queue_my_intro(uuid,text,text,text,bigint,integer),public.set_my_intro_transition(text),public.remove_my_intro() from public,anon;
revoke all on function public.worker_claim_intro_job(),public.worker_complete_intro_job(uuid,text,bigint,integer,integer,integer,numeric,integer,integer,integer,boolean),public.worker_fail_intro_job(uuid,text),public.worker_intro_cleanup_candidates(integer),public.worker_confirm_intro_cleanup(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.worker_claim_intro_job(),public.worker_complete_intro_job(uuid,text,bigint,integer,integer,integer,numeric,integer,integer,integer,boolean),public.worker_fail_intro_job(uuid,text),public.worker_intro_cleanup_candidates(integer),public.worker_confirm_intro_cleanup(uuid,boolean,boolean) to service_role;
grant usage on schema private to service_role;
grant execute on function private.worker_claim_intro_job_impl(),private.worker_complete_intro_job_impl(uuid,text,bigint,integer,integer,integer,numeric,integer,integer,integer,boolean),private.worker_fail_intro_job_impl(uuid,text),private.worker_intro_cleanup_candidates_impl(integer),private.worker_confirm_intro_cleanup_impl(uuid,boolean,boolean) to service_role;
