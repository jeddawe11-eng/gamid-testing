-- F8-B1: conditional internal visitor renditions for NEW oversized / high-bitrate H.264 Wall MP4s - GamID TESTING only.
-- PREPARED FOR REVIEW. Apply only with Mazen's separate deployment authorization (with the worker image, dispatcher, Edge Functions and site - see
-- docs/WALL-VIDEO-RENDITIONS-F8B1.md). Additive: no existing row, object, asset, slot or accepted contract changes.
--
--   1. bucket wall-video-renditions: private, at most 37.5 MiB (a rendition is accepted only when at least 25% smaller than its <= 50 MiB original), MP4 only,
--      and NO storage policy of any kind: owners and visitors can neither list, read, write nor delete it. Only the worker (service role) writes and deletes;
--      visitors stream a READY rendition only through public-media's server-side lease.
--   2. quota: the owner's ORIGINAL keeps counting toward the unchanged 200 MB; the internal rendition does not (usage_stored_bytes and the Usage page media
--      summary skip this one bucket). The rendition is tracked here instead: at most one live rendition per asset (and so per Wall video slot), each <= 37.5 MiB,
--      with a storage-driven orphan sweep. The 200 MB quota, 60 Wall assets and 15 Wall videos are untouched; renditions are not wall_assets rows.
--   3. public.wall_video_renditions: the rendition registry AND its job queue (pending -> processing -> ready | rejected | failed), claimed by the same worker
--      Job with SKIP LOCKED, per-attempt claim tokens (a late, superseded worker can never complete), a lost-worker reclaim after 20 minutes, at most 2 attempts.
--   4. completion re-checks in the database: the current claim token, the object exists where it must, H.264 box <= 1920x1080 (either orientation), VMAF mean
--      >= 95 and 5th-percentile >= 90, at least 25% smaller than the original, and the asset still exists with the same original. Otherwise nothing is READY.
--   5. visitors: get_public_wall lists `rendition_path` for an asset only while its rendition is READY; public_media_lease_allowed leases a rendition only while
--      its asset's ORIGINAL is leasable (the accepted published / enabled / PUBLIC predicate), so PRIVATE, Disable, Unpublish and Delete end new leases at once.
--   6. lifecycle: deleting the asset detaches its rendition (asset_id set null); the sweep deletes every rendition object that is not the current READY or
--      in-flight one, after a grace period.
-- Rollback: docs/WALL-VIDEO-RENDITIONS-F8B1.md section 8 (reverse the two in-place usage patches; restore get_public_wall_impl and
-- public_media_lease_allowed from 20261009170000 / 20261010140000; drop the trigger, functions and table; delete the bucket's objects, then the bucket).

-- ---------------------------------------------------------------------------------------------
-- 1. Storage (no policies: service role only)
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall-video-renditions', 'wall-video-renditions', false, 39321600, array['video/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------------------------
-- 2. Quota: the internal rendition never counts toward the owner's storage. Both functions are patched IN PLACE from their live definitions (the custom-fonts
--    migration's pattern), so every other part of them - including the later Custom Fonts quota line - is kept exactly; a missing target aborts the migration.
-- ---------------------------------------------------------------------------------------------
do $$
declare original text; revised text;
begin
  original := pg_get_functiondef('private.usage_stored_bytes(uuid)'::regprocedure);
  revised := replace(original, $o$split_part(o.name,'/',1)=u::text$o$, $n$split_part(o.name,'/',1)=u::text and o.bucket_id<>'wall-video-renditions'$n$);
  if revised = original or (length(revised) - length(original)) <> 2 * length($n$ and o.bucket_id<>'wall-video-renditions'$n$) then raise exception 'RENDITION_USAGE_PATCH_FAILED'; end if;
  execute revised;
  original := pg_get_functiondef('private.get_my_usage_impl()'::regprocedure);
  revised := replace(original, $o$where split_part(o.name,'/',1)=u::text and coalesce(o.metadata->>'size','') ~ '^[0-9]+$' group by 1$o$,
                               $n$where split_part(o.name,'/',1)=u::text and o.bucket_id<>'wall-video-renditions' and coalesce(o.metadata->>'size','') ~ '^[0-9]+$' group by 1$n$);
  if revised = original then raise exception 'RENDITION_USAGE_SUMMARY_PATCH_FAILED'; end if;
  execute revised;
end $$;
-- ---------------------------------------------------------------------------------------------
-- 3. The registry + queue
-- ---------------------------------------------------------------------------------------------
create table public.wall_video_renditions (
  rendition_id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.wall_assets(asset_id) on delete set null,   -- detached (null) when the asset is deleted; the sweep then removes the object
  owner_user_id uuid not null,
  source_path text not null,
  source_bytes bigint not null,
  source_width integer not null,
  source_height integer not null,
  source_duration_ms integer not null,
  source_frames integer not null,
  state text not null default 'pending',
  attempts integer not null default 0,
  claim_token uuid,
  rendition_path text,
  rendition_bytes bigint,
  rendition_width integer,
  rendition_height integer,
  vmaf_mean numeric(6, 3),
  vmaf_p5 numeric(6, 3),
  failure_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint wall_video_renditions_state check (state in ('pending', 'processing', 'ready', 'rejected', 'failed')),
  constraint wall_video_renditions_source_path check (source_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$' and split_part(source_path, '/', 1) = owner_user_id::text),
  constraint wall_video_renditions_source check (source_bytes between 1048576 and 50 * 1048576 and   -- the wall-video upload cap (50 MiB), unchanged
 source_width between 1 and 4096 and source_height between 1 and 4096 and source_duration_ms > 0 and source_frames > 0),
  constraint wall_video_renditions_path check (rendition_path is null or (rendition_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$' and split_part(rendition_path, '/', 1) = owner_user_id::text)),
  constraint wall_video_renditions_ready check (state <> 'ready' or (rendition_path is not null and rendition_bytes between 1 and 39321600 and rendition_bytes * 4 <= source_bytes * 3
    and greatest(rendition_width, rendition_height) <= 1920 and least(rendition_width, rendition_height) <= 1080 and vmaf_mean >= 95 and vmaf_p5 >= 90))
);
-- at most one live rendition per asset (a retry or a duplicate register call can never queue a second one)
create unique index wall_video_renditions_one_live on public.wall_video_renditions (asset_id) where state in ('pending', 'processing', 'ready');
create index wall_video_renditions_pending_idx on public.wall_video_renditions (created_at) where state = 'pending';
alter table public.wall_video_renditions enable row level security;
revoke all on table public.wall_video_renditions from public, anon, authenticated;

-- the rule the Edge Function applied, re-checked here (supabase/functions/_shared/wall-assets.js renditionEligibility)
create function private.wall_rendition_eligible(w integer, h integer, bytes bigint, duration_ms integer, frames integer)
returns boolean
language sql immutable
set search_path = ''
as $$
  select w > 0 and h > 0 and bytes >= 1048576 and duration_ms > 0 and frames > 0
    and w::bigint * h * frames <= 3840::bigint * 2160 * 30 * 60
    and (greatest(w, h) > 1920 or least(w, h) > 1080
      or bytes * 8.0 / (duration_ms / 1000.0) > 8000000.0 * (w::numeric * h) / (1920 * 1080) * ((frames / (duration_ms / 1000.0)) / 30.0));
$$;

-- the Edge Function (service role), after registering a direct H.264 MP4 of this owner: queue its rendition. Idempotent (one live rendition per asset).
create function private.create_wall_video_rendition_impl(candidate_owner uuid, candidate_asset_id uuid, candidate_bytes bigint, candidate_width integer, candidate_height integer, candidate_duration_ms integer, candidate_frames integer)
returns table (rendition_id uuid, state text)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  asset public.wall_assets%rowtype;
  stored_size bigint;
  created public.wall_video_renditions%rowtype;
begin
  select a.* into asset from public.wall_assets a where a.asset_id = candidate_asset_id and a.entity_id = private.wall_entity_for_user(candidate_owner);
  if asset.asset_id is null then raise exception using errcode = 'P0002', message = 'WALL_ASSET_NOT_FOUND'; end if;
  if asset.mime_type <> 'video/mp4' or asset.storage_path !~ ('^' || candidate_owner::text || '/[0-9a-f-]{36}\.mp4$') then
    raise exception using errcode = '22023', message = 'RENDITION_SOURCE_UNSUPPORTED';
  end if;
  select (o.metadata ->> 'size')::bigint into stored_size from storage.objects o where o.bucket_id = 'wall-video' and o.name = asset.storage_path;
  if stored_size is null then raise exception using errcode = 'P0002', message = 'WALL_ASSET_UPLOAD_NOT_FOUND'; end if;
  if candidate_width is distinct from asset.width or candidate_height is distinct from asset.height or candidate_bytes is distinct from stored_size then
    raise exception using errcode = '22023', message = 'RENDITION_SOURCE_MISMATCH';
  end if;
  if not private.wall_rendition_eligible(asset.width, asset.height, stored_size, candidate_duration_ms, candidate_frames) then
    raise exception using errcode = '22023', message = 'RENDITION_NOT_ELIGIBLE';
  end if;
  insert into public.wall_video_renditions (asset_id, owner_user_id, source_path, source_bytes, source_width, source_height, source_duration_ms, source_frames)
  values (asset.asset_id, candidate_owner, asset.storage_path, stored_size, asset.width, asset.height, candidate_duration_ms, candidate_frames)
  on conflict (asset_id) where state in ('pending', 'processing', 'ready') do nothing
  returning * into created;
  if created.rendition_id is null then
    return query select r.rendition_id, r.state from public.wall_video_renditions r where r.asset_id = asset.asset_id and r.state in ('pending', 'processing', 'ready');
    return;
  end if;
  return query select created.rendition_id, created.state;
end;
$$;

-- the worker: claim ONE rendition (SKIP LOCKED) whose asset still exists with the same original. A rendition stuck in `processing` for 20 minutes (a lost
-- worker) is claimed again with a NEW claim token and a new object path, at most 2 attempts in all; the superseded attempt can never complete.
create function private.worker_claim_wall_video_rendition_impl()
returns table (rendition_id uuid, claim_token uuid, owner_user_id uuid, source_path text, rendition_path text, source_bytes bigint, source_width integer, source_height integer)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  picked public.wall_video_renditions%rowtype;
  token uuid := gen_random_uuid();
begin
  update public.wall_video_renditions r set state = 'failed', failure_code = 'PROCESSING_TIMED_OUT', claim_token = null, completed_at = now(), updated_at = now()
  where r.state = 'processing' and r.started_at < now() - interval '20 minutes' and r.attempts >= 2;
  update public.wall_video_renditions r set state = 'failed', failure_code = 'SOURCE_GONE', claim_token = null, completed_at = now(), updated_at = now()
  where r.state in ('pending', 'processing') and (r.asset_id is null or not exists (select 1 from public.wall_assets a where a.asset_id = r.asset_id and a.storage_path = r.source_path));
  select * into picked from public.wall_video_renditions r
  where r.state = 'pending' or (r.state = 'processing' and r.started_at < now() - interval '20 minutes' and r.attempts < 2)
  order by r.created_at for update skip locked limit 1;
  if picked.rendition_id is null then return; end if;
  update public.wall_video_renditions r set state = 'processing', attempts = r.attempts + 1, claim_token = token, started_at = now(), updated_at = now(),
    rendition_path = picked.owner_user_id::text || '/' || picked.rendition_id::text || '/' || token::text || '.mp4'
  where r.rendition_id = picked.rendition_id;
  return query select picked.rendition_id, token, picked.owner_user_id, picked.source_path, picked.owner_user_id::text || '/' || picked.rendition_id::text || '/' || token::text || '.mp4',
    picked.source_bytes, picked.source_width, picked.source_height;
end;
$$;

-- the worker, after its own ffprobe + VMAF gate passed and the object was written: mark READY. Every gate value is checked again here (and by the table's
-- ready constraint); anything else -> an exception, nothing becomes READY, and the sweep removes the object.
create function private.worker_complete_wall_video_rendition_impl(candidate_rendition_id uuid, candidate_claim_token uuid, candidate_path text, candidate_bytes bigint, candidate_width integer, candidate_height integer, candidate_vmaf_mean numeric, candidate_vmaf_p5 numeric)
returns table (rendition_id uuid, state text)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  job public.wall_video_renditions%rowtype;
  stored_size bigint;
begin
  select * into job from public.wall_video_renditions r where r.rendition_id = candidate_rendition_id and r.state = 'processing' for update;
  if job.rendition_id is null or job.claim_token is distinct from candidate_claim_token then raise exception using errcode = '22023', message = 'RENDITION_NOT_CLAIMED'; end if;
  if candidate_path is distinct from job.rendition_path then raise exception using errcode = '22023', message = 'INVALID_RENDITION_PATH'; end if;
  if job.asset_id is null or not exists (select 1 from public.wall_assets a where a.asset_id = job.asset_id and a.storage_path = job.source_path) then
    raise exception using errcode = 'P0002', message = 'SOURCE_GONE';
  end if;
  select (o.metadata ->> 'size')::bigint into stored_size from storage.objects o where o.bucket_id = 'wall-video-renditions' and o.name = job.rendition_path;
  if stored_size is null then raise exception using errcode = 'P0002', message = 'RENDITION_NOT_FOUND'; end if;
  if stored_size is distinct from candidate_bytes then raise exception using errcode = '22023', message = 'RENDITION_SIZE_MISMATCH'; end if;
  if stored_size * 4 > job.source_bytes * 3 then raise exception using errcode = '22023', message = 'INSUFFICIENT_SAVINGS'; end if;
  if candidate_vmaf_mean is null or candidate_vmaf_p5 is null or candidate_vmaf_mean < 95 or candidate_vmaf_p5 < 90 then raise exception using errcode = '22023', message = 'QUALITY_GATE'; end if;
  if candidate_width is null or candidate_height is null or greatest(candidate_width, candidate_height) > 1920 or least(candidate_width, candidate_height) > 1080 then
    raise exception using errcode = '22023', message = 'RENDITION_TOO_LARGE';
  end if;
  update public.wall_video_renditions r set state = 'ready', claim_token = null, rendition_bytes = stored_size, rendition_width = candidate_width, rendition_height = candidate_height,
    vmaf_mean = candidate_vmaf_mean, vmaf_p5 = candidate_vmaf_p5, failure_code = null, completed_at = now(), updated_at = now()
  where r.rendition_id = job.rendition_id;
  return query select job.rendition_id, 'ready'::text;
end;
$$;

-- the worker: the gate refused (rejected: QUALITY_GATE, INSUFFICIENT_SAVINGS, SOURCE_* skips) or the attempt failed (failed). Only the current claim may finish
-- it; the measured values are kept for review. Nothing here ever makes a rendition visible.
create function private.worker_finish_wall_video_rendition_impl(candidate_rendition_id uuid, candidate_claim_token uuid, candidate_state text, candidate_code text, candidate_vmaf_mean numeric, candidate_vmaf_p5 numeric, candidate_bytes bigint)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if candidate_state not in ('rejected', 'failed') then raise exception using errcode = '22023', message = 'INVALID_RENDITION_STATE'; end if;
  update public.wall_video_renditions r set state = candidate_state, claim_token = null,
    failure_code = left(regexp_replace(upper(coalesce(candidate_code, 'RENDITION_FAILED')), '[^A-Z0-9_]', '_', 'g'), 64),
    vmaf_mean = candidate_vmaf_mean, vmaf_p5 = candidate_vmaf_p5, rendition_bytes = candidate_bytes, completed_at = now(), updated_at = now()
  where r.rendition_id = candidate_rendition_id and r.state = 'processing' and r.claim_token = candidate_claim_token;
end;
$$;

-- the sweep: every object in the renditions bucket that is not the READY rendition of a still-existing asset (with the same original), and not the current
-- in-flight attempt, once it is older than the grace period (an upload is never deleted right before its completion). Driven by storage itself, so an
-- object written by a crashed or superseded attempt is found even though no row names it.
create function private.worker_wall_video_rendition_sweep_impl(candidate_limit integer)
returns table (object_path text)
language sql stable security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'wall-video-renditions'
    and o.created_at < now() - interval '30 minutes'
    and not exists (
      select 1 from public.wall_video_renditions r
      where r.rendition_path = o.name
        and ((r.state = 'ready' and exists (select 1 from public.wall_assets a where a.asset_id = r.asset_id and a.storage_path = r.source_path))
          or (r.state = 'processing' and r.claim_token is not null)))
  order by o.created_at
  limit least(greatest(coalesce(candidate_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Visitors: the manifest names a READY rendition; a lease follows the ORIGINAL's accepted published predicate
-- ---------------------------------------------------------------------------------------------
create or replace function private.get_public_wall_impl(candidate_handle text)
returns table (document jsonb, published_at timestamptz, assets jsonb)
language sql stable security definer
set search_path = ''
as $$
  select w.document, w.published_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('asset_id', a.asset_id, 'storage_path', a.storage_path, 'mime_type', a.mime_type, 'width', a.width, 'height', a.height)
        || case when r.rendition_path is not null then jsonb_build_object('rendition_path', r.rendition_path) else '{}'::jsonb end order by a.asset_id)
      from public.wall_assets a
      left join public.wall_video_renditions r on r.asset_id = a.asset_id and r.state = 'ready' and r.source_path = a.storage_path
      where a.entity_id = e.entity_id and a.asset_id::text = any (private.wall_document_asset_ids(w.document))
    ), '[]'::jsonb)
  from public.entities e
  join public.wall_publications w on w.entity_id = e.entity_id
  where e.gamid_handle = private.normalize_handle(candidate_handle)
    and e.entity_type = 'SOLO'
    and e.visibility = 'PUBLIC'
    and w.is_enabled
  limit 1;
$$;

create function private.wall_rendition_is_published(candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wall_video_renditions r join public.wall_assets a on a.asset_id = r.asset_id and a.storage_path = r.source_path
    where r.rendition_path = candidate_path and r.state = 'ready' and private.wall_object_is_published('wall-video', a.storage_path)
  );
$$;

create or replace function private.public_media_lease_allowed(candidate_bucket text, candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when candidate_path is null or candidate_path ~ '\.\.' then false
    when candidate_bucket = 'intro-media' then private.intro_media_is_public(candidate_path)
    when candidate_bucket in ('wall-video', 'wall-video-derived') then private.wall_object_is_published(candidate_bucket, candidate_path)
    when candidate_bucket = 'wall-video-renditions' then private.wall_rendition_is_published(candidate_path)
    else false
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Wrappers and privileges: queue + worker RPCs for service_role only; nothing for clients
-- ---------------------------------------------------------------------------------------------
create function public.create_wall_video_rendition(candidate_owner uuid, candidate_asset_id uuid, candidate_bytes bigint, candidate_width integer, candidate_height integer, candidate_duration_ms integer, candidate_frames integer)
returns table (rendition_id uuid, state text) language sql volatile security invoker set search_path = ''
as $$ select * from private.create_wall_video_rendition_impl(candidate_owner, candidate_asset_id, candidate_bytes, candidate_width, candidate_height, candidate_duration_ms, candidate_frames); $$;
create function public.worker_claim_wall_video_rendition()
returns table (rendition_id uuid, claim_token uuid, owner_user_id uuid, source_path text, rendition_path text, source_bytes bigint, source_width integer, source_height integer)
language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_claim_wall_video_rendition_impl(); $$;
create function public.worker_complete_wall_video_rendition(candidate_rendition_id uuid, candidate_claim_token uuid, candidate_path text, candidate_bytes bigint, candidate_width integer, candidate_height integer, candidate_vmaf_mean numeric, candidate_vmaf_p5 numeric)
returns table (rendition_id uuid, state text) language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_complete_wall_video_rendition_impl(candidate_rendition_id, candidate_claim_token, candidate_path, candidate_bytes, candidate_width, candidate_height, candidate_vmaf_mean, candidate_vmaf_p5); $$;
create function public.worker_finish_wall_video_rendition(candidate_rendition_id uuid, candidate_claim_token uuid, candidate_state text, candidate_code text, candidate_vmaf_mean numeric, candidate_vmaf_p5 numeric, candidate_bytes bigint)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.worker_finish_wall_video_rendition_impl(candidate_rendition_id, candidate_claim_token, candidate_state, candidate_code, candidate_vmaf_mean, candidate_vmaf_p5, candidate_bytes); $$;
create function public.worker_wall_video_rendition_sweep(candidate_limit integer default 20)
returns table (object_path text) language sql stable security invoker set search_path = ''
as $$ select * from private.worker_wall_video_rendition_sweep_impl(candidate_limit); $$;

revoke all on function
  private.wall_rendition_eligible(integer, integer, bigint, integer, integer), private.wall_rendition_is_published(text),
  private.create_wall_video_rendition_impl(uuid, uuid, bigint, integer, integer, integer, integer), private.worker_claim_wall_video_rendition_impl(),
  private.worker_complete_wall_video_rendition_impl(uuid, uuid, text, bigint, integer, integer, numeric, numeric),
  private.worker_finish_wall_video_rendition_impl(uuid, uuid, text, text, numeric, numeric, bigint), private.worker_wall_video_rendition_sweep_impl(integer),
  public.create_wall_video_rendition(uuid, uuid, bigint, integer, integer, integer, integer), public.worker_claim_wall_video_rendition(),
  public.worker_complete_wall_video_rendition(uuid, uuid, text, bigint, integer, integer, numeric, numeric),
  public.worker_finish_wall_video_rendition(uuid, uuid, text, text, numeric, numeric, bigint), public.worker_wall_video_rendition_sweep(integer)
from public, anon, authenticated;
grant execute on function
  private.wall_rendition_eligible(integer, integer, bigint, integer, integer), private.wall_rendition_is_published(text),
  private.create_wall_video_rendition_impl(uuid, uuid, bigint, integer, integer, integer, integer), private.worker_claim_wall_video_rendition_impl(),
  private.worker_complete_wall_video_rendition_impl(uuid, uuid, text, bigint, integer, integer, numeric, numeric),
  private.worker_finish_wall_video_rendition_impl(uuid, uuid, text, text, numeric, numeric, bigint), private.worker_wall_video_rendition_sweep_impl(integer),
  public.create_wall_video_rendition(uuid, uuid, bigint, integer, integer, integer, integer), public.worker_claim_wall_video_rendition(),
  public.worker_complete_wall_video_rendition(uuid, uuid, text, bigint, integer, integer, numeric, numeric),
  public.worker_finish_wall_video_rendition(uuid, uuid, text, text, numeric, numeric, bigint), public.worker_wall_video_rendition_sweep(integer)
to service_role;
-- the visitor manifest's rendition join and the lease predicate run inside the existing definer functions (already granted to anon / authenticated / service_role)

-- ---------------------------------------------------------------------------------------------
-- 6. Dispatch: the same Vault-held dispatcher as the Intro / Wall video pipeline. The dispatcher accepts this table only once its updated build is deployed;
--    until then (or without configuration) a rendition simply waits for the next worker run - visitors keep the original meanwhile.
-- ---------------------------------------------------------------------------------------------
create or replace function private.dispatch_wall_video_rendition()
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
    body := jsonb_build_object('type', 'INSERT', 'schema', 'public', 'table', 'wall_video_renditions', 'record', jsonb_build_object('job_id', new.rendition_id, 'state', new.state)),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
revoke all on function private.dispatch_wall_video_rendition() from public, anon, authenticated;

create trigger dispatch_wall_video_rendition
after insert on public.wall_video_renditions
for each row
when (new.state = 'pending')
execute function private.dispatch_wall_video_rendition();
