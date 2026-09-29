-- Wall background video: automatic server-side HEVC/H.265 -> H.264 transcoding - GamID TESTING only.
--
-- Reuses the accepted Intro processing architecture (Slice 3C): a job row -> pg_net dispatch -> the fixed Cloud Run Job runs the same worker image, which claims ONE
-- job with SKIP LOCKED through service-role-only RPCs, reads the private source, encodes with FFmpeg, validates with ffprobe, writes a private derivative and
-- completes the job atomically. Nothing here changes the H.264 fast path (register_verified_wall_asset) or any existing row.
--   - public.wall_video_jobs: one row per accepted HEVC upload (owner, source path in wall-video, the SOURCE width / height the derivative must keep exactly)
--     pending -> processing -> ready (asset registered) | failed (typed failure code). RLS on, no client table grant.
--   - bucket wall-video-derived: private, 200 MiB (the H.264 derivative of a <= 50 MiB HEVC source is usually larger), video/mp4 only; NO client insert
--     policy (only the worker writes it); the owner reads / deletes objects in their own folder. The user's SOURCE upload limit stays 50 MiB (wall-video).
--   - create_wall_video_job (service role: the wall-asset-register Edge Function, after it inspected the stored HEVC MP4)
--   - worker_claim_wall_video_job / worker_complete_wall_video_job / worker_fail_wall_video_job / worker_wall_video_cleanup_candidates /
--     worker_confirm_wall_video_cleanup (service role: the worker only)
--   - get_my_wall_video_jobs (the owner's own recent jobs - state and failure code only, never paths)
--   - completion re-checks in the database that the derivative's width and height EQUAL the source's (resolution is never changed), and only then registers the
--     durable asset; the HEVC source becomes a cleanup candidate (deleted by the worker) - one durable copy per video.
--   - the derived bucket's owner read / delete policies go by the owner's folder: the worker (service role) writes the object, so it has no storage owner.

-- ---------------------------------------------------------------------------------------------
-- 1. Storage
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall-video-derived', 'wall-video-derived', false, 209715200, array['video/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "users read their derived wall video"
on storage.objects for select to authenticated
using (bucket_id = 'wall-video-derived' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users delete their derived wall video"
on storage.objects for delete to authenticated
using (bucket_id = 'wall-video-derived' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------------------
-- 2. The registry: derivatives live at <user>/<job>.h264.mp4 in wall-video-derived and may be up to 200 MiB
-- ---------------------------------------------------------------------------------------------
alter table public.wall_assets drop constraint wall_assets_size;
alter table public.wall_assets add constraint wall_assets_size check (
  (mime_type <> 'video/mp4' and byte_size between 1 and 5242880)
  or (mime_type = 'video/mp4' and storage_path !~ '\.h264\.mp4$' and byte_size between 1 and 52428800)
  or (mime_type = 'video/mp4' and storage_path ~ '\.h264\.mp4$' and byte_size between 1 and 209715200)
);

-- ---------------------------------------------------------------------------------------------
-- 3. Jobs
-- ---------------------------------------------------------------------------------------------
create table public.wall_video_jobs (
  job_id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  owner_user_id uuid not null,
  source_path text not null,
  source_bytes bigint not null,
  source_codec text not null,
  source_width integer not null,
  source_height integer not null,
  source_frames integer,
  state text not null default 'pending',
  attempts integer not null default 0,
  failure_code text,
  derivative_path text,
  derivative_bytes bigint,
  asset_id uuid,
  source_deleted boolean not null default false,
  derivative_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint wall_video_jobs_state check (state in ('pending', 'processing', 'ready', 'failed')),
  constraint wall_video_jobs_source_path check (source_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$' and split_part(source_path, '/', 1) = owner_user_id::text),
  constraint wall_video_jobs_source check (source_bytes between 1 and 52428800 and source_codec in ('hvc1', 'hev1') and source_width between 1 and 4096 and source_height between 1 and 4096),
  constraint wall_video_jobs_source_unique unique (source_path)
);
create index wall_video_jobs_pending_idx on public.wall_video_jobs (created_at) where state = 'pending';
create index wall_video_jobs_entity_idx on public.wall_video_jobs (entity_id, created_at desc);
alter table public.wall_video_jobs enable row level security;
revoke all on table public.wall_video_jobs from public, anon, authenticated;

-- the Edge Function (service role), after inspecting the stored HEVC MP4: queue it. The same limits as a direct video (<= 10 videos, <= 60 assets) are checked
-- here so a job is never started for an upload that could not be registered.
create function private.create_wall_video_job_impl(candidate_owner uuid, candidate_path text, candidate_bytes bigint, candidate_codec text, candidate_width integer, candidate_height integer, candidate_frames integer)
returns table (job_id uuid, state text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  owned_entity_id uuid := private.wall_entity_for_user(candidate_owner);
  stored_size bigint;
  created public.wall_video_jobs%rowtype;
begin
  if candidate_path is null or split_part(candidate_path, '/', 1) <> candidate_owner::text or candidate_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$' then
    raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_PATH';
  end if;
  if candidate_codec is null or candidate_codec not in ('hvc1', 'hev1') then raise exception using errcode = '22023', message = 'VIDEO_CODEC_UNSUPPORTED'; end if;
  if candidate_width is null or candidate_height is null or candidate_width not between 1 and 4096 or candidate_height not between 1 and 4096 then raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_SIZE'; end if;
  select (o.metadata ->> 'size')::bigint into stored_size from storage.objects o where o.bucket_id = 'wall-video' and o.name = candidate_path and o.owner_id = candidate_owner::text;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_ASSET_UPLOAD_NOT_FOUND'; end if;
  if coalesce(stored_size, candidate_bytes) > 52428800 or coalesce(stored_size, candidate_bytes) < 1 then raise exception using errcode = '22023', message = 'VIDEO_TOO_LARGE'; end if;
  if (select count(*) from public.wall_assets a where a.entity_id = owned_entity_id) >= 60 then raise exception using errcode = '54000', message = 'WALL_ASSET_LIMIT'; end if;
  if (select count(*) from public.wall_assets a where a.entity_id = owned_entity_id and a.mime_type = 'video/mp4')
     + (select count(*) from public.wall_video_jobs j where j.entity_id = owned_entity_id and j.state in ('pending', 'processing')) >= 10 then
    raise exception using errcode = '54000', message = 'WALL_VIDEO_LIMIT';
  end if;
  insert into public.wall_video_jobs (entity_id, owner_user_id, source_path, source_bytes, source_codec, source_width, source_height, source_frames)
  values (owned_entity_id, candidate_owner, candidate_path, coalesce(stored_size, candidate_bytes), candidate_codec, candidate_width, candidate_height, candidate_frames)
  returning * into created;
  return query select created.job_id, created.state;
end;
$$;

-- the worker: claim ONE job (SKIP LOCKED). A job stuck in `processing` for 20 minutes (a lost worker) is claimed again, at most 2 attempts in all.
create function private.worker_claim_wall_video_job_impl()
returns table (job_id uuid, owner_user_id uuid, source_path text, derivative_path text, source_width integer, source_height integer, source_bytes bigint)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  picked public.wall_video_jobs%rowtype;
begin
  update public.wall_video_jobs j set state = 'failed', failure_code = 'PROCESSING_TIMED_OUT', updated_at = now()
  where j.state = 'processing' and j.started_at < now() - interval '20 minutes' and j.attempts >= 2;
  select * into picked from public.wall_video_jobs j
  where j.state = 'pending' or (j.state = 'processing' and j.started_at < now() - interval '20 minutes' and j.attempts < 2)
  order by j.created_at for update skip locked limit 1;
  if picked.job_id is null then return; end if;
  update public.wall_video_jobs j set state = 'processing', attempts = j.attempts + 1, started_at = now(), updated_at = now(),
    derivative_path = picked.owner_user_id::text || '/' || picked.job_id::text || '.h264.mp4'
  where j.job_id = picked.job_id;
  return query select picked.job_id, picked.owner_user_id, picked.source_path, picked.owner_user_id::text || '/' || picked.job_id::text || '.h264.mp4',
    picked.source_width, picked.source_height, picked.source_bytes;
end;
$$;

-- the worker, after ffprobe validated the derivative: register the durable asset. The database checks again that the derivative exists where it must, is
-- H.264-sized within 200 MiB, and has EXACTLY the source's width and height.
create function private.worker_complete_wall_video_job_impl(candidate_job_id uuid, candidate_derivative_path text, candidate_bytes bigint, candidate_width integer, candidate_height integer)
returns table (asset_id uuid)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  job public.wall_video_jobs%rowtype;
  stored_size bigint;
  registered uuid;
begin
  select * into job from public.wall_video_jobs j where j.job_id = candidate_job_id and j.state = 'processing' for update;
  if job.job_id is null then raise exception using errcode = '22023', message = 'WALL_VIDEO_JOB_NOT_PROCESSING'; end if;
  if candidate_derivative_path is distinct from job.derivative_path then raise exception using errcode = '22023', message = 'INVALID_WALL_VIDEO_DERIVATIVE_PATH'; end if;
  if candidate_width is distinct from job.source_width or candidate_height is distinct from job.source_height then
    raise exception using errcode = '22023', message = 'WALL_VIDEO_RESOLUTION_CHANGED';
  end if;
  select (o.metadata ->> 'size')::bigint into stored_size from storage.objects o where o.bucket_id = 'wall-video-derived' and o.name = job.derivative_path;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_VIDEO_DERIVATIVE_NOT_FOUND'; end if;
  if coalesce(stored_size, candidate_bytes) not between 1 and 209715200 then raise exception using errcode = '22023', message = 'WALL_VIDEO_DERIVATIVE_TOO_LARGE'; end if;
  if (select count(*) from public.wall_assets a where a.entity_id = job.entity_id) >= 60 then raise exception using errcode = '54000', message = 'WALL_ASSET_LIMIT'; end if;
  insert into public.wall_assets (entity_id, storage_path, mime_type, byte_size, width, height)
  values (job.entity_id, job.derivative_path, 'video/mp4', coalesce(stored_size, candidate_bytes)::integer, job.source_width, job.source_height)
  returning wall_assets.asset_id into registered;
  update public.wall_video_jobs j set state = 'ready', asset_id = registered, derivative_bytes = coalesce(stored_size, candidate_bytes), completed_at = now(), updated_at = now()
  where j.job_id = job.job_id;
  return query select registered;
end;
$$;

create function private.worker_fail_wall_video_job_impl(candidate_job_id uuid, candidate_failure_code text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.wall_video_jobs j set state = 'failed', failure_code = left(regexp_replace(upper(coalesce(candidate_failure_code, 'TRANSCODE_FAILED')), '[^A-Z0-9_]', '_', 'g'), 64),
    completed_at = now(), updated_at = now()
  where j.job_id = candidate_job_id and j.state in ('pending', 'processing');
end;
$$;

-- what the worker must delete: the HEVC source of every finished job (ready: the derivative is the durable copy; failed: nothing is kept), and the partial
-- derivative of a failed job. Never the derivative of a ready job (that is the asset).
create function private.worker_wall_video_cleanup_candidates_impl(candidate_limit integer)
returns table (job_id uuid, source_path text, derivative_path text)
language sql stable security definer
set search_path = ''
as $$
  select j.job_id,
    case when not j.source_deleted then j.source_path end,
    case when j.state = 'failed' and not j.derivative_deleted then j.derivative_path end
  from public.wall_video_jobs j
  where j.state in ('ready', 'failed') and (not j.source_deleted or (j.state = 'failed' and not j.derivative_deleted and j.derivative_path is not null))
  order by j.updated_at
  limit least(greatest(coalesce(candidate_limit, 20), 1), 50);
$$;

create function private.worker_confirm_wall_video_cleanup_impl(candidate_job_id uuid, candidate_source_deleted boolean, candidate_derivative_deleted boolean)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.wall_video_jobs j set
    source_deleted = j.source_deleted or coalesce(candidate_source_deleted, false),
    derivative_deleted = j.derivative_deleted or (j.state = 'failed' and coalesce(candidate_derivative_deleted, false)),
    updated_at = now()
  where j.job_id = candidate_job_id and j.state in ('ready', 'failed');
end;
$$;

-- the owner's own recent jobs: state and failure code only (never a storage path)
create function private.get_my_wall_video_jobs_impl()
returns table (job_id uuid, state text, failure_code text, asset_id uuid, source_width integer, source_height integer, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
begin
  return query
  select j.job_id, j.state, j.failure_code, j.asset_id, j.source_width, j.source_height, j.created_at, j.updated_at
  from public.wall_video_jobs j where j.entity_id = owned_entity_id and j.created_at > now() - interval '7 days'
  order by j.created_at desc limit 20;
end;
$$;

-- wrappers (the established security-invoker pattern)
create function public.create_wall_video_job(candidate_owner uuid, candidate_path text, candidate_bytes bigint, candidate_codec text, candidate_width integer, candidate_height integer, candidate_frames integer)
returns table (job_id uuid, state text) language sql volatile security invoker set search_path = ''
as $$ select * from private.create_wall_video_job_impl(candidate_owner, candidate_path, candidate_bytes, candidate_codec, candidate_width, candidate_height, candidate_frames); $$;
create function public.worker_claim_wall_video_job()
returns table (job_id uuid, owner_user_id uuid, source_path text, derivative_path text, source_width integer, source_height integer, source_bytes bigint) language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_claim_wall_video_job_impl(); $$;
create function public.worker_complete_wall_video_job(candidate_job_id uuid, candidate_derivative_path text, candidate_bytes bigint, candidate_width integer, candidate_height integer)
returns table (asset_id uuid) language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_complete_wall_video_job_impl(candidate_job_id, candidate_derivative_path, candidate_bytes, candidate_width, candidate_height); $$;
create function public.worker_fail_wall_video_job(candidate_job_id uuid, candidate_failure_code text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.worker_fail_wall_video_job_impl(candidate_job_id, candidate_failure_code); $$;
create function public.worker_wall_video_cleanup_candidates(candidate_limit integer default 20)
returns table (job_id uuid, source_path text, derivative_path text) language sql stable security invoker set search_path = ''
as $$ select * from private.worker_wall_video_cleanup_candidates_impl(candidate_limit); $$;
create function public.worker_confirm_wall_video_cleanup(candidate_job_id uuid, candidate_source_deleted boolean, candidate_derivative_deleted boolean)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.worker_confirm_wall_video_cleanup_impl(candidate_job_id, candidate_source_deleted, candidate_derivative_deleted); $$;
create function public.get_my_wall_video_jobs()
returns table (job_id uuid, state text, failure_code text, asset_id uuid, source_width integer, source_height integer, created_at timestamptz, updated_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_wall_video_jobs_impl(); $$;

revoke all on function
  private.create_wall_video_job_impl(uuid, text, bigint, text, integer, integer, integer), private.worker_claim_wall_video_job_impl(),
  private.worker_complete_wall_video_job_impl(uuid, text, bigint, integer, integer), private.worker_fail_wall_video_job_impl(uuid, text),
  private.worker_wall_video_cleanup_candidates_impl(integer), private.worker_confirm_wall_video_cleanup_impl(uuid, boolean, boolean), private.get_my_wall_video_jobs_impl(),
  public.create_wall_video_job(uuid, text, bigint, text, integer, integer, integer), public.worker_claim_wall_video_job(),
  public.worker_complete_wall_video_job(uuid, text, bigint, integer, integer), public.worker_fail_wall_video_job(uuid, text),
  public.worker_wall_video_cleanup_candidates(integer), public.worker_confirm_wall_video_cleanup(uuid, boolean, boolean), public.get_my_wall_video_jobs()
from public, anon, authenticated;
grant execute on function
  private.create_wall_video_job_impl(uuid, text, bigint, text, integer, integer, integer), private.worker_claim_wall_video_job_impl(),
  private.worker_complete_wall_video_job_impl(uuid, text, bigint, integer, integer), private.worker_fail_wall_video_job_impl(uuid, text),
  private.worker_wall_video_cleanup_candidates_impl(integer), private.worker_confirm_wall_video_cleanup_impl(uuid, boolean, boolean),
  public.create_wall_video_job(uuid, text, bigint, text, integer, integer, integer), public.worker_claim_wall_video_job(),
  public.worker_complete_wall_video_job(uuid, text, bigint, integer, integer), public.worker_fail_wall_video_job(uuid, text),
  public.worker_wall_video_cleanup_candidates(integer), public.worker_confirm_wall_video_cleanup(uuid, boolean, boolean)
to service_role;
grant execute on function private.get_my_wall_video_jobs_impl(), public.get_my_wall_video_jobs() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Dispatch: the same Vault-held dispatcher address + shared secret as the Intro pipeline; the dispatcher starts the same fixed worker Job. When the
--    dispatcher is not configured the job simply stays pending (a later worker run drains it) - saving the upload never fails because of dispatch.
-- ---------------------------------------------------------------------------------------------
create or replace function private.dispatch_wall_video_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatcher_url text;
  dispatcher_secret text;
begin
  select decrypted_secret into dispatcher_url from vault.decrypted_secrets where name = 'gamid_intro_dispatch_url_testing';
  select decrypted_secret into dispatcher_secret from vault.decrypted_secrets where name = 'gamid_intro_dispatch_secret_testing';
  if dispatcher_url is null or dispatcher_secret is null then return new; end if;
  perform net.http_post(
    url := dispatcher_url || '/dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-gamid-dispatch-secret', dispatcher_secret),
    body := jsonb_build_object('type', 'INSERT', 'schema', 'public', 'table', 'wall_video_jobs', 'record', jsonb_build_object('job_id', new.job_id, 'state', new.state)),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
revoke all on function private.dispatch_wall_video_job() from public, anon, authenticated;

create trigger dispatch_wall_video_job
after insert on public.wall_video_jobs
for each row
when (new.state = 'pending')
execute function private.dispatch_wall_video_job();
