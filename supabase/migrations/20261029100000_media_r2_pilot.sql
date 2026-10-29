-- Media delivery Architecture F - TESTING pilot (DEC-0013, REV-0032; Mazen's task "Implement Architecture F on TESTING Only", 2026-10-29). Additive: no
-- existing row, object, Intro, derivative, share copy or accepted contract changes. Everything below is INERT until Mazen enables it.
--
-- Supabase stays authoritative. A visitor-facing video of a PILOT profile (this pilot: GM-TEST-01's Intro playback derivative and its Discord share copy) is
-- copied, once it is READY, to the private Cloudflare R2 bucket gamid-media-testing by the existing worker Job, verified there by size and SHA-256 (R2 checks
-- the digest itself), and then delivered by the Cloudflare Worker from that verified replica.
--
--   1. private.media_r2_settings: the switches (both OFF) and the cost bounds. private.media_r2_pilot: the profiles in the pilot (GM-TEST-01 alone).
--   2. public.media_r2_replicas: registry + queue (pending -> processing -> ready | failed | superseded), SKIP LOCKED claims with per-attempt claim tokens and
--      per-attempt R2 keys, a lost-worker reclaim after 20 minutes, at most 2 attempts, at most media_r2_settings.replications_per_day new copies a day.
--   3. queueing is database-driven (an Intro becoming active, a share copy becoming ready); existing media is queued only by an explicit backfill step.
--   4. delivery decision, private.media_r2_delivery_impl(bucket, path): for a PUBLIC source only (the same predicates as the accepted read paths),
--        - 'supabase'    delivery is off, or the profile is not in the pilot: EXACTLY today's behavior;
--        - 'r2'          a current, verified replica exists: the Worker serves it;
--        - 'supabase'    pilot, no ready replica yet, within the fallback budget (the source's full size is counted, an upper bound);
--        - 'unavailable' pilot, no ready replica, the daily or monthly fallback budget is spent: the video is temporarily unavailable instead of
--                        generating uncontrolled Supabase egress (Mazen's pilot rule).
--   5. quota: replicas live in R2, not in storage.objects, so the owner's 200 MB (private.usage_stored_bytes / get_my_usage) never counts them (DEC-0013).
--   6. lifecycle: superseded / failed replicas, and replicas whose source is no longer current, are listed for deletion from R2 (deletes are free).
-- Rollback (immediate): update private.media_r2_settings set delivery_enabled = false, replication_enabled = false, updated_at = now();
-- Full removal: worker/cloud-run/media-r2-rollback.sql.

-- ---------------------------------------------------------------------------------------------
-- 1. Switches, bounds and the pilot list
-- ---------------------------------------------------------------------------------------------
create table private.media_r2_settings (
  singleton boolean primary key default true check (singleton),
  replication_enabled boolean not null default false,
  delivery_enabled boolean not null default false,
  fallback_daily_bytes bigint not null check (fallback_daily_bytes >= 0),
  fallback_monthly_bytes bigint not null check (fallback_monthly_bytes >= 0),
  replications_per_day integer not null check (replications_per_day between 0 and 1000),
  reason text not null,
  updated_at timestamptz not null default now()
);
alter table private.media_r2_settings enable row level security;
revoke all on table private.media_r2_settings from public, anon, authenticated;
-- fallback: 100 MiB a day, 1 GiB a month (20% of a Free plan's 5 GB egress); replication: 50 new copies a day. Both switches OFF.
insert into private.media_r2_settings (replication_enabled, delivery_enabled, fallback_daily_bytes, fallback_monthly_bytes, replications_per_day, reason)
values (false, false, 104857600, 1073741824, 50, 'Architecture F TESTING pilot prepared 2026-10-29; inert until Mazen enables it');

create table private.media_r2_pilot (
  profile_id uuid primary key references public.profiles(profile_id) on delete cascade,
  reason text not null,
  added_at timestamptz not null default now()
);
alter table private.media_r2_pilot enable row level security;
revoke all on table private.media_r2_pilot from public, anon, authenticated;
do $$
declare added integer;
begin
  insert into private.media_r2_pilot (profile_id, reason)
  select p.profile_id, 'GM-TEST-01 synthetic fixture: Architecture F TESTING pilot (Intro + Discord share copy)'
  from public.entities e join public.profiles p on p.entity_id = e.entity_id
  where e.gamid_handle = 'gm_test_01' and e.entity_type = 'SOLO';
  get diagnostics added = row_count;
  if added <> 1 then raise exception 'MEDIA_R2_PILOT_FIXTURE_NOT_FOUND'; end if;
end $$;

-- the fallback budget, counted per UTC day (the month is the sum of its days)
create table private.media_r2_fallback_usage (
  day date primary key,
  bytes bigint not null default 0,
  leases integer not null default 0
);
alter table private.media_r2_fallback_usage enable row level security;
revoke all on table private.media_r2_fallback_usage from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. The registry + queue
-- ---------------------------------------------------------------------------------------------
create table public.media_r2_replicas (
  replica_id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  source_bucket text not null,
  source_path text not null,
  source_bytes bigint not null,
  state text not null default 'pending',
  attempts integer not null default 0,
  claim_token uuid,
  r2_key text,
  replica_bytes bigint,
  replica_sha256 text,
  failure_code text,
  r2_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint media_r2_replicas_bucket check (source_bucket in ('intro-media', 'intro-share-copies')),
  constraint media_r2_replicas_source_bytes check (source_bytes between 1 and 15728640),
  constraint media_r2_replicas_state check (state in ('pending', 'processing', 'ready', 'failed', 'superseded')),
  constraint media_r2_replicas_key check (r2_key is null or (r2_key = source_bucket || '/' || source_path || '/' || split_part(r2_key, '/', -1)
    and split_part(r2_key, '/', -1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')),
  constraint media_r2_replicas_ready check (state <> 'ready' or (r2_key is not null and replica_bytes = source_bytes and replica_sha256 ~ '^[0-9a-f]{64}$'))
);
-- at most one live replica per source object
create unique index media_r2_replicas_one_live on public.media_r2_replicas (source_bucket, source_path) where state in ('pending', 'processing', 'ready');
create index media_r2_replicas_pending_idx on public.media_r2_replicas (created_at) where state = 'pending';
create index media_r2_replicas_cleanup_idx on public.media_r2_replicas (completed_at) where r2_key is not null and r2_deleted_at is null and state in ('failed', 'superseded');
alter table public.media_r2_replicas enable row level security;
revoke all on table public.media_r2_replicas from public, anon, authenticated;

-- the profile that owns a source object, while that object is CURRENT: the profile's active ready Intro derivative, or its current ready share copy
create function private.media_r2_source_profile(candidate_bucket text, candidate_path text)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select case
    when candidate_bucket = 'intro-media' then (
      select s.profile_id from public.profile_intro_settings s
      join public.intro_processing_jobs j on j.job_id = s.active_job_id
      where j.derivative_path = candidate_path and j.state = 'ready' and j.derivative_deleted_at is null
      limit 1)
    when candidate_bucket = 'intro-share-copies' then (
      select r.profile_id from public.intro_share_copies r
      where r.share_path = candidate_path and r.state = 'ready' and private.intro_share_is_current(r.share_id)
      limit 1)
  end;
$$;

create function private.media_r2_replica_is_current(candidate_replica_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_r2_replicas r
    where r.replica_id = candidate_replica_id
      and private.media_r2_source_profile(r.source_bucket, r.source_path) is not distinct from r.profile_id
      and exists (select 1 from private.media_r2_pilot pl where pl.profile_id = r.profile_id)
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Queueing (database-driven; nothing a client can request)
-- ---------------------------------------------------------------------------------------------
-- Supersedes this profile's replicas that are no longer current, then queues its missing current sources - only while replication is enabled and the profile
-- is in the pilot, and only within the daily bound (beyond it nothing is queued; delivery stays on Supabase within the fallback budget).
create function private.enqueue_media_r2_replicas(candidate_profile_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  cfg private.media_r2_settings%rowtype;
  source record;
  added integer;
  queued integer := 0;
begin
  update public.media_r2_replicas r set state = 'superseded', claim_token = null, completed_at = coalesce(r.completed_at, now()), updated_at = now()
  where r.profile_id = candidate_profile_id and r.state in ('pending', 'processing', 'ready') and not private.media_r2_replica_is_current(r.replica_id);
  select * into cfg from private.media_r2_settings where singleton;
  if not coalesce(cfg.replication_enabled, false) then return 0; end if;
  if not exists (select 1 from private.media_r2_pilot pl where pl.profile_id = candidate_profile_id) then return 0; end if;
  for source in
    select 'intro-media'::text bucket, j.derivative_path path
    from public.profile_intro_settings s join public.intro_processing_jobs j on j.job_id = s.active_job_id
    where s.profile_id = candidate_profile_id and j.state = 'ready' and j.derivative_path is not null and j.derivative_deleted_at is null
    union all
    select 'intro-share-copies', r.share_path from public.intro_share_copies r
    where r.profile_id = candidate_profile_id and r.state = 'ready' and private.intro_share_is_current(r.share_id)
  loop
    continue when exists (select 1 from public.media_r2_replicas r where r.source_bucket = source.bucket and r.source_path = source.path and r.state in ('pending', 'processing', 'ready'));
    exit when (select count(*) from public.media_r2_replicas r where r.created_at > now() - interval '1 day') >= cfg.replications_per_day;
    insert into public.media_r2_replicas (profile_id, source_bucket, source_path, source_bytes)
    select candidate_profile_id, source.bucket, source.path, (o.metadata ->> 'size')::bigint
    from storage.objects o
    where o.bucket_id = source.bucket and o.name = source.path and (o.metadata ->> 'size')::bigint between 1 and 15728640;
    get diagnostics added = row_count;
    queued := queued + added;
  end loop;
  return queued;
end;
$$;

create function private.queue_media_r2_on_intro_settings()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.enqueue_media_r2_replicas(new.profile_id);
  return new;
end;
$$;
create trigger queue_media_r2_replicas
after insert or update of active_job_id, thumbnail_job_id, thumbnail_ms on public.profile_intro_settings
for each row
execute function private.queue_media_r2_on_intro_settings();

create function private.queue_media_r2_on_share()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.enqueue_media_r2_replicas(new.profile_id);
  return new;
end;
$$;
create trigger queue_media_r2_replicas_share
after update of state on public.intro_share_copies
for each row
when (new.state is distinct from old.state and (new.state = 'ready' or old.state = 'ready'))
execute function private.queue_media_r2_on_share();

-- the explicit backfill of the pilot's existing media (run once after enabling replication; resumable and duplicate-free)
create function private.media_r2_backfill_pilot()
returns integer
language sql volatile security definer
set search_path = ''
as $$
  select coalesce(sum(private.enqueue_media_r2_replicas(pl.profile_id)), 0)::integer from private.media_r2_pilot pl;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. The delivery decision (public-media for visitors' leases; the Worker's crawler routes)
-- ---------------------------------------------------------------------------------------------
-- -> mode 'none' (not a public source: callers answer as they do today), 'supabase', 'r2' (with the replica's key and size) or 'unavailable'.
-- candidate_count: count this fallback against the budget (the caller is about to serve the source from Supabase).
create function private.media_r2_delivery_impl(candidate_bucket text, candidate_path text, candidate_count boolean)
returns table (mode text, r2_key text, bytes bigint)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  cfg private.media_r2_settings%rowtype;
  owner uuid;
  replica public.media_r2_replicas%rowtype;
  size bigint;
  today date := (now() at time zone 'utc')::date;
  spent_day bigint;
  spent_month bigint;
begin
  if candidate_bucket not in ('intro-media', 'intro-share-copies') or candidate_path is null or candidate_path ~ '\.\.' then
    return query select 'none'::text, null::text, null::bigint; return;
  end if;
  if not (case when candidate_bucket = 'intro-media' then private.intro_media_is_public(candidate_path) else private.intro_share_is_public(candidate_path) end) then
    return query select 'none'::text, null::text, null::bigint; return;
  end if;
  select * into cfg from private.media_r2_settings where singleton;
  owner := private.media_r2_source_profile(candidate_bucket, candidate_path);
  if not coalesce(cfg.delivery_enabled, false) or owner is null or not exists (select 1 from private.media_r2_pilot pl where pl.profile_id = owner) then
    return query select 'supabase'::text, null::text, null::bigint; return;
  end if;
  select * into replica from public.media_r2_replicas r
  where r.source_bucket = candidate_bucket and r.source_path = candidate_path and r.state = 'ready' and r.profile_id = owner
  limit 1;
  if replica.replica_id is not null then
    return query select 'r2'::text, replica.r2_key, replica.replica_bytes; return;
  end if;
  -- pilot without a ready replica: Supabase only within the fallback budget (the whole object is counted: an upper bound of what one lease can download)
  select (o.metadata ->> 'size')::bigint into size from storage.objects o where o.bucket_id = candidate_bucket and o.name = candidate_path;
  size := coalesce(size, 15728640);
  perform pg_advisory_xact_lock(hashtext('media_r2_fallback_budget'));
  select coalesce(sum(u.bytes) filter (where u.day = today), 0), coalesce(sum(u.bytes) filter (where u.day >= date_trunc('month', today)::date), 0)
    into spent_day, spent_month from private.media_r2_fallback_usage u where u.day >= date_trunc('month', today)::date;
  if spent_day + size > cfg.fallback_daily_bytes or spent_month + size > cfg.fallback_monthly_bytes then
    return query select 'unavailable'::text, null::text, null::bigint; return;
  end if;
  if candidate_count then
    insert into private.media_r2_fallback_usage as u (day, bytes, leases) values (today, size, 1)
    on conflict (day) do update set bytes = u.bytes + excluded.bytes, leases = u.leases + 1;
  end if;
  return query select 'supabase'::text, null::text, null::bigint;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. The worker (service role only)
-- ---------------------------------------------------------------------------------------------
create function private.worker_claim_media_r2_replica_impl()
returns table (replica_id uuid, claim_token uuid, source_bucket text, source_path text, source_bytes bigint, r2_key text)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  picked public.media_r2_replicas%rowtype;
  token uuid := gen_random_uuid();
  key text;
begin
  if not coalesce((select s.replication_enabled from private.media_r2_settings s where s.singleton), false) then return; end if;
  update public.media_r2_replicas r set state = 'failed', failure_code = 'PROCESSING_TIMED_OUT', claim_token = null, completed_at = now(), updated_at = now()
  where r.state = 'processing' and r.started_at < now() - interval '20 minutes' and r.attempts >= 2;
  update public.media_r2_replicas r set state = 'superseded', claim_token = null, completed_at = now(), updated_at = now()
  where r.state in ('pending', 'processing') and not private.media_r2_replica_is_current(r.replica_id);
  select * into picked from public.media_r2_replicas r
  where r.state = 'pending' or (r.state = 'processing' and r.started_at < now() - interval '20 minutes' and r.attempts < 2)
  order by r.created_at for update skip locked limit 1;
  if picked.replica_id is null then return; end if;
  key := picked.source_bucket || '/' || picked.source_path || '/' || token::text;
  -- an earlier attempt's object (a lost worker) is left for the sweep: its row keeps no key, so the new attempt's key is the only one that can become READY
  update public.media_r2_replicas r set state = 'processing', attempts = r.attempts + 1, claim_token = token, r2_key = key, started_at = now(), updated_at = now()
  where r.replica_id = picked.replica_id;
  return query select picked.replica_id, token, picked.source_bucket, picked.source_path, picked.source_bytes, key;
end;
$$;

-- after R2 accepted the object with the worker's SHA-256 (R2 verifies the digest) and its size: mark READY, only while the source is still current
create function private.worker_complete_media_r2_replica_impl(candidate_replica_id uuid, candidate_claim_token uuid, candidate_r2_key text, candidate_bytes bigint,
  candidate_sha256 text)
returns table (replica_id uuid, state text)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  job public.media_r2_replicas%rowtype;
  stored bigint;
begin
  select * into job from public.media_r2_replicas r where r.replica_id = candidate_replica_id and r.state = 'processing' for update;
  if job.replica_id is null or job.claim_token is distinct from candidate_claim_token then raise exception using errcode = '22023', message = 'MEDIA_R2_NOT_CLAIMED'; end if;
  if candidate_r2_key is distinct from job.r2_key then raise exception using errcode = '22023', message = 'INVALID_MEDIA_R2_KEY'; end if;
  if not private.media_r2_replica_is_current(job.replica_id) then raise exception using errcode = '22023', message = 'MEDIA_R2_SUPERSEDED'; end if;
  select (o.metadata ->> 'size')::bigint into stored from storage.objects o where o.bucket_id = job.source_bucket and o.name = job.source_path;
  if stored is distinct from job.source_bytes or candidate_bytes is distinct from job.source_bytes then raise exception using errcode = '22023', message = 'MEDIA_R2_SIZE_MISMATCH'; end if;
  if candidate_sha256 is null or candidate_sha256 !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'INVALID_MEDIA_R2_SHA256'; end if;
  update public.media_r2_replicas r set state = 'ready', claim_token = null, replica_bytes = candidate_bytes, replica_sha256 = candidate_sha256,
    failure_code = null, completed_at = now(), updated_at = now()
  where r.replica_id = job.replica_id;
  return query select job.replica_id, 'ready'::text;
end;
$$;

create function private.worker_fail_media_r2_replica_impl(candidate_replica_id uuid, candidate_claim_token uuid, candidate_code text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.media_r2_replicas r set state = 'failed', claim_token = null,
    failure_code = left(regexp_replace(upper(coalesce(candidate_code, 'MEDIA_R2_FAILED')), '[^A-Z0-9_]', '_', 'g'), 64), completed_at = now(), updated_at = now()
  where r.replica_id = candidate_replica_id and r.state = 'processing' and r.claim_token = candidate_claim_token;
end;
$$;

-- R2 objects to delete: replicas that failed or were superseded (a READY replica whose source is no longer current is superseded first), after a grace
-- period that outlasts every lease the Worker may still honour (Intro 120 s; crawler responses max-age 60 s)
create function private.worker_media_r2_sweep_impl(candidate_limit integer)
returns table (replica_id uuid, r2_key text)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column
begin
  update public.media_r2_replicas r set state = 'superseded', claim_token = null, completed_at = now(), updated_at = now()
  where r.state = 'ready' and not private.media_r2_replica_is_current(r.replica_id);
  return query
  select r.replica_id, r.r2_key from public.media_r2_replicas r
  where r.r2_key is not null and r.r2_deleted_at is null and r.state in ('failed', 'superseded') and r.completed_at < now() - interval '10 minutes'
  order by r.completed_at
  limit least(greatest(coalesce(candidate_limit, 20), 1), 50);
end;
$$;

create function private.worker_confirm_media_r2_deleted_impl(candidate_replica_id uuid, candidate_r2_key text)
returns void
language sql volatile security definer
set search_path = ''
as $$
  update public.media_r2_replicas r set r2_deleted_at = now(), updated_at = now()
  where r.replica_id = candidate_replica_id and r.r2_key = candidate_r2_key and r.state in ('failed', 'superseded') and r.r2_deleted_at is null;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Wrappers and privileges
-- ---------------------------------------------------------------------------------------------
-- the Worker's crawler routes (anonymous, like get_public_intro_share): the same decision, always counting a fallback (the Worker calls it only to serve)
create function public.get_public_media_delivery(candidate_bucket text, candidate_path text)
returns table (mode text, r2_key text, bytes bigint) language sql volatile security invoker set search_path = ''
as $$ select * from private.media_r2_delivery_impl(candidate_bucket, candidate_path, true); $$;
-- public-media (service role)
create function public.public_media_delivery(candidate_bucket text, candidate_path text)
returns table (mode text, r2_key text, bytes bigint) language sql volatile security invoker set search_path = ''
as $$ select * from private.media_r2_delivery_impl(candidate_bucket, candidate_path, true); $$;
create function public.worker_claim_media_r2_replica()
returns table (replica_id uuid, claim_token uuid, source_bucket text, source_path text, source_bytes bigint, r2_key text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_claim_media_r2_replica_impl(); $$;
create function public.worker_complete_media_r2_replica(candidate_replica_id uuid, candidate_claim_token uuid, candidate_r2_key text, candidate_bytes bigint, candidate_sha256 text)
returns table (replica_id uuid, state text) language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_complete_media_r2_replica_impl(candidate_replica_id, candidate_claim_token, candidate_r2_key, candidate_bytes, candidate_sha256); $$;
create function public.worker_fail_media_r2_replica(candidate_replica_id uuid, candidate_claim_token uuid, candidate_code text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.worker_fail_media_r2_replica_impl(candidate_replica_id, candidate_claim_token, candidate_code); $$;
create function public.worker_media_r2_sweep(candidate_limit integer default 20)
returns table (replica_id uuid, r2_key text) language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_media_r2_sweep_impl(candidate_limit); $$;
create function public.worker_confirm_media_r2_deleted(candidate_replica_id uuid, candidate_r2_key text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.worker_confirm_media_r2_deleted_impl(candidate_replica_id, candidate_r2_key); $$;

revoke all on function
  private.media_r2_source_profile(text, text), private.media_r2_replica_is_current(uuid), private.enqueue_media_r2_replicas(uuid),
  private.queue_media_r2_on_intro_settings(), private.queue_media_r2_on_share(), private.media_r2_backfill_pilot(),
  private.media_r2_delivery_impl(text, text, boolean), private.worker_claim_media_r2_replica_impl(),
  private.worker_complete_media_r2_replica_impl(uuid, uuid, text, bigint, text), private.worker_fail_media_r2_replica_impl(uuid, uuid, text),
  private.worker_media_r2_sweep_impl(integer), private.worker_confirm_media_r2_deleted_impl(uuid, text),
  public.get_public_media_delivery(text, text), public.public_media_delivery(text, text), public.worker_claim_media_r2_replica(),
  public.worker_complete_media_r2_replica(uuid, uuid, text, bigint, text), public.worker_fail_media_r2_replica(uuid, uuid, text),
  public.worker_media_r2_sweep(integer), public.worker_confirm_media_r2_deleted(uuid, text)
from public, anon, authenticated;
-- the Worker's anonymous crawler lookup
grant execute on function private.media_r2_delivery_impl(text, text, boolean), public.get_public_media_delivery(text, text) to anon, authenticated;
-- public-media and the worker
grant execute on function
  private.media_r2_delivery_impl(text, text, boolean), public.public_media_delivery(text, text),
  private.worker_claim_media_r2_replica_impl(), private.worker_complete_media_r2_replica_impl(uuid, uuid, text, bigint, text),
  private.worker_fail_media_r2_replica_impl(uuid, uuid, text), private.worker_media_r2_sweep_impl(integer), private.worker_confirm_media_r2_deleted_impl(uuid, text),
  public.worker_claim_media_r2_replica(), public.worker_complete_media_r2_replica(uuid, uuid, text, bigint, text), public.worker_fail_media_r2_replica(uuid, uuid, text),
  public.worker_media_r2_sweep(integer), public.worker_confirm_media_r2_deleted(uuid, text)
to service_role;

-- ---------------------------------------------------------------------------------------------
-- 7. Dispatch: the same Vault-held dispatcher as every Intro job. The dispatcher accepts this table only once its updated build is deployed; until then a
--    queued replica waits for the next worker run (delivery stays on Supabase within the fallback budget meanwhile).
-- ---------------------------------------------------------------------------------------------
create function private.dispatch_media_r2_replica()
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
    body := jsonb_build_object('type', 'INSERT', 'schema', 'public', 'table', 'media_r2_replicas', 'record', jsonb_build_object('job_id', new.replica_id, 'state', new.state)),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
revoke all on function private.dispatch_media_r2_replica() from public, anon, authenticated;
create trigger dispatch_media_r2_replica
after insert on public.media_r2_replicas
for each row
when (new.state = 'pending')
execute function private.dispatch_media_r2_replica();
