-- Public Intro still poster: TESTING acceptance gate (Mazen 2026-10-27, before the poster worker image is deployed). Posters are generated, served and
-- completed ONLY for the profiles listed in private.intro_poster_activation, seeded with the acceptance fixture GM-TEST-01 alone. Every other account,
-- real accounts included (@black, @zshot), keeps today's accepted behavior exactly: nothing is queued, so nothing is dispatched or generated, and its public
-- page keeps seeking the Intro video to the waiting frame (get_public_intro_poster returns the same poster_ms with a null poster_path).
--
-- Enforced at every step, so no single path can bypass it:
--   1. queueing      - private.enqueue_intro_posters queues nothing for a profile that is not activated (the trigger and the backfill both go through it);
--   2. claiming      - the worker never claims a poster of a profile that is not activated; any such pending / processing row is superseded instead;
--   3. completing    - worker_complete_intro_poster refuses a poster of a profile that is not activated (INTRO_POSTER_NOT_ACTIVATED);
--   4. serving       - neither the visitor lookup nor the storage read policy returns a poster of a profile that is not activated.
-- The existing table, bucket, worker RPC signatures and grants are unchanged; only the function bodies below gain the gate.
-- Lifting the gate (after Mazen's visual acceptance, with his separate approval) is a later migration that makes private.intro_poster_activated return true
-- for every profile; adding another profile meanwhile is one insert into private.intro_poster_activation, also only with his approval.
-- Rollback: restore the five function bodies from 20261027120000_intro_posters.sql, then drop private.intro_poster_activated and the table.

create table private.intro_poster_activation (
  profile_id uuid primary key references public.profiles(profile_id) on delete cascade,
  reason text not null,
  added_at timestamptz not null default now()
);
alter table private.intro_poster_activation enable row level security;
revoke all on table private.intro_poster_activation from public, anon, authenticated;

-- the acceptance fixture only; exactly one profile or the migration aborts
do $$
declare added integer;
begin
  insert into private.intro_poster_activation (profile_id, reason)
  select p.profile_id, 'GM-TEST-01 acceptance fixture (TESTING poster acceptance phase)'
  from public.entities e
  join public.profiles p on p.entity_id = e.entity_id
  where e.gamid_handle = 'gm_test_01' and e.entity_type = 'SOLO';
  get diagnostics added = row_count;
  if added <> 1 then raise exception 'INTRO_POSTER_GATE_FIXTURE_NOT_FOUND'; end if;
end $$;

create function private.intro_poster_activated(candidate_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from private.intro_poster_activation a where a.profile_id = candidate_profile_id); $$;
revoke all on function private.intro_poster_activated(uuid) from public, anon, authenticated;

-- 4. serving: the storage read policy's predicate
create or replace function private.intro_poster_is_public(candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.intro_posters r
    join public.profiles p on p.profile_id = r.profile_id
    join public.entities e on e.entity_id = p.entity_id
    where r.poster_path = candidate_path and r.state = 'ready'
      and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC'
      and private.intro_poster_activated(r.profile_id)
      and private.intro_poster_is_current(r.poster_id)
  );
$$;

-- 1. queueing
create or replace function private.enqueue_intro_posters(candidate_profile_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  settings public.profile_intro_settings%rowtype;
  intro public.intro_processing_jobs%rowtype;
  wanted integer;
  queued integer := 0;
begin
  update public.intro_posters r set state = 'superseded', claim_token = null, completed_at = coalesce(r.completed_at, now()), updated_at = now()
  where r.profile_id = candidate_profile_id and r.state in ('pending', 'processing', 'ready') and not private.intro_poster_is_current(r.poster_id);
  if not private.intro_poster_activated(candidate_profile_id) then return 0; end if;
  select * into settings from public.profile_intro_settings s where s.profile_id = candidate_profile_id;
  if settings.active_job_id is null then return 0; end if;
  select * into intro from public.intro_processing_jobs j
  where j.job_id = settings.active_job_id and j.state = 'ready' and j.derivative_path is not null and j.derivative_deleted_at is null;
  if intro.job_id is null then return 0; end if;
  foreach wanted in array array[0, case when settings.thumbnail_job_id = intro.job_id then settings.thumbnail_ms end] loop
    continue when wanted is null;
    continue when exists (select 1 from public.intro_posters r where r.job_id = intro.job_id and r.poster_ms = wanted and r.state in ('pending', 'processing', 'ready'));
    exit when (select count(*) from public.intro_posters r where r.profile_id = candidate_profile_id and r.created_at > now() - interval '1 hour') >= 20;
    insert into public.intro_posters (profile_id, owner_user_id, job_id, poster_ms) values (candidate_profile_id, intro.owner_user_id, intro.job_id, wanted);
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

-- 4. serving: the visitor lookup (poster_ms unchanged for everyone; a poster only for an activated profile)
create or replace function private.get_public_intro_poster_impl(candidate_handle text)
returns table (poster_ms integer, poster_path text, poster_width integer, poster_height integer)
language sql stable security definer
set search_path = ''
as $$
  with intro as (
    select p.profile_id, s.active_job_id job_id,
      (select c.thumbnail_ms from private.get_public_intro_share_impl(candidate_handle) c limit 1) chosen_ms
    from public.entities e
    join public.profiles p on p.entity_id = e.entity_id
    join public.profile_intro_settings s on s.profile_id = p.profile_id
    join public.intro_processing_jobs j on j.job_id = s.active_job_id and j.state = 'ready' and j.derivative_path is not null and j.derivative_deleted_at is null
    where e.gamid_handle = private.normalize_handle(candidate_handle)
      and e.entity_type = 'SOLO'
      and e.visibility = 'PUBLIC'
    limit 1
  )
  select i.chosen_ms, r.poster_path, r.poster_width, r.poster_height
  from intro i
  left join lateral (
    select x.poster_path, x.poster_width, x.poster_height from public.intro_posters x
    where x.job_id = i.job_id and x.poster_ms = coalesce(i.chosen_ms, 0) and x.state = 'ready' and private.intro_poster_activated(i.profile_id)
      and private.intro_poster_is_current(x.poster_id)
    limit 1
  ) r on true;
$$;

-- 2. claiming
create or replace function private.worker_claim_intro_poster_impl()
returns table (poster_id uuid, claim_token uuid, owner_user_id uuid, job_id uuid, derivative_path text, derivative_bytes bigint, intro_duration_ms integer,
  intro_width integer, intro_height integer, poster_ms integer, poster_path text)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  picked public.intro_posters%rowtype;
  intro public.intro_processing_jobs%rowtype;
  token uuid := gen_random_uuid();
  path text;
begin
  update public.intro_posters r set state = 'superseded', failure_code = 'INTRO_POSTER_NOT_ACTIVATED', claim_token = null, completed_at = now(), updated_at = now()
  where r.state in ('pending', 'processing') and not private.intro_poster_activated(r.profile_id);
  update public.intro_posters r set state = 'failed', failure_code = 'PROCESSING_TIMED_OUT', claim_token = null, completed_at = now(), updated_at = now()
  where r.state = 'processing' and r.started_at < now() - interval '20 minutes' and r.attempts >= 2;
  update public.intro_posters r set state = 'superseded', claim_token = null, completed_at = now(), updated_at = now()
  where r.state in ('pending', 'processing') and not private.intro_poster_is_current(r.poster_id);
  select * into picked from public.intro_posters r
  where (r.state = 'pending' or (r.state = 'processing' and r.started_at < now() - interval '20 minutes' and r.attempts < 2))
    and private.intro_poster_activated(r.profile_id)
  order by r.created_at for update skip locked limit 1;
  if picked.poster_id is null then return; end if;
  select * into intro from public.intro_processing_jobs j where j.job_id = picked.job_id;
  path := picked.owner_user_id::text || '/' || picked.job_id::text || '/' || picked.poster_id::text || '/' || token::text || '.webp';
  update public.intro_posters r set state = 'processing', attempts = r.attempts + 1, claim_token = token, poster_path = path, started_at = now(), updated_at = now()
  where r.poster_id = picked.poster_id;
  return query select picked.poster_id, token, picked.owner_user_id, picked.job_id, intro.derivative_path, intro.output_size_bytes, intro.output_duration_ms,
    intro.output_width, intro.output_height, picked.poster_ms, path;
end;
$$;

-- 3. completing
create or replace function private.worker_complete_intro_poster_impl(candidate_poster_id uuid, candidate_claim_token uuid, candidate_path text, candidate_bytes integer,
  candidate_width integer, candidate_height integer)
returns table (poster_id uuid, state text)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  job public.intro_posters%rowtype;
  intro public.intro_processing_jobs%rowtype;
  stored record;
begin
  select * into job from public.intro_posters r where r.poster_id = candidate_poster_id and r.state = 'processing' for update;
  if job.poster_id is null or job.claim_token is distinct from candidate_claim_token then raise exception using errcode = '22023', message = 'INTRO_POSTER_NOT_CLAIMED'; end if;
  if not private.intro_poster_activated(job.profile_id) then raise exception using errcode = '22023', message = 'INTRO_POSTER_NOT_ACTIVATED'; end if;
  if candidate_path is distinct from job.poster_path then raise exception using errcode = '22023', message = 'INVALID_INTRO_POSTER_PATH'; end if;
  if not private.intro_poster_is_current(job.poster_id) then raise exception using errcode = '22023', message = 'INTRO_POSTER_SUPERSEDED'; end if;
  select * into intro from public.intro_processing_jobs j where j.job_id = job.job_id;
  select (o.metadata ->> 'size')::bigint size, o.metadata ->> 'mimetype' mime into stored from storage.objects o where o.bucket_id = 'intro-posters' and o.name = job.poster_path;
  if stored.size is null then raise exception using errcode = 'P0002', message = 'INTRO_POSTER_NOT_FOUND'; end if;
  if stored.size is distinct from candidate_bytes::bigint or stored.size > 1048576 or stored.mime is distinct from 'image/webp' then raise exception using errcode = '22023', message = 'INTRO_POSTER_OBJECT_MISMATCH'; end if;
  if candidate_width is distinct from intro.output_width or candidate_height is distinct from intro.output_height then raise exception using errcode = '22023', message = 'INTRO_POSTER_GEOMETRY_CHANGED'; end if;
  update public.intro_posters r set state = 'ready', claim_token = null, poster_bytes = stored.size, poster_width = candidate_width, poster_height = candidate_height,
    failure_code = null, completed_at = now(), updated_at = now()
  where r.poster_id = job.poster_id;
  return query select job.poster_id, 'ready'::text;
end;
$$;
