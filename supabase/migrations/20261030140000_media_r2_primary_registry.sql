-- R2 Primary for video - phase 2 step 1: the R2 object registry (DEC-0014; docs/R2-PRIMARY-MIGRATION.md sections 3-5 and 8; Mazen's task
-- "GamID R2 Primary / Phase 2 - Step 1", 2026-10-30). Database only. INERT: R2 Primary is OFF and the allow-list is empty, so no row can be registered and
-- every quota / Usage answer is exactly today's. Architecture F (media_r2_settings / media_r2_replicas / the delivery decision) is not touched.
--
--   1. private.media_r2_primary_settings (enabled = false) and private.media_r2_primary_owners (empty): R2 Primary is active only for an allow-listed owner.
--   2. private.media_objects: one row per R2 video object - owner, logical bucket/path (the path the product already uses), source (promoted from a Supabase
--      landing object, or derived by the worker), R2 key, expected and verified bytes, SHA-256, counted flag, category and state. Writable only through the
--      security-definer functions below; a trigger enforces the state machine and the immutable fields.
--        pending  -> stored | failed           (the worker's verified PUT, or a failed / mismatched / abandoned one)
--        stored   -> deleting | missing        (a user delete or replace; or the file found gone outside GamID)
--        missing  -> deleting                  (a user delete of a lost file - the physical delete is idempotent)
--        failed   -> deleted, deleting -> deleted   (the physical R2 delete, confirmed)
--      'deleted' is terminal. Nothing ever moves a row back to 'stored', and no function re-creates a missing or deleted file (no automatic restore).
--   3. Quota (the existing 200,000,000-byte policy, reused - no parallel system):
--        - a derived COUNTED object (intro-media, wall-video-derived) is reserved through the existing private.reserve_usage_upload - the same per-owner
--          advisory lock, the same stored + reserved + n <= quota check, the same per-bucket caps / MIME from storage.buckets - and its receipt is bound to
--          the R2 key, so no gateway action can bind, complete, cancel or release it;
--        - a promoted object is already counted as its Supabase landing object; promotion adds nothing;
--        - private.usage_stored_bytes = storage.objects (minus the landing objects of rows that reached 'stored' at least once) + verified bytes of
--          COUNTED rows in 'stored'. Each logical file is counted exactly once at every moment of its move; a deleted or replaced file stops counting
--          at the commit of the delete (the same moment it stops being served);
--        - uncounted internal copies (wall-video-renditions, intro-share-copies) follow DEC-0007 / DEC-0013 and never count.
--   4. Delivery: private.media_r2_servable_key(bucket, path) answers a key only for a 'stored' row. Not yet wired into public-media or the Worker.
--   5. Physical deletion: failed / deleting rows are claimed with an attempt counter and a retry interval; a failed delete records its error and is retried;
--      after max attempts the row stays (never served, never dropped) and is listed by private.media_r2_delete_stuck_impl for the operator.
--      Not yet dispatched automatically (the dispatcher and pg_cron safety net come with the Job step).
-- Rollback: nothing to roll back while it is OFF. Full removal: drop the functions and tables below and restore the four usage functions from their previous
-- definitions, snapshotted verbatim from TESTING in tests/fixtures/usage-functions-before-r2-primary.sql (PROJECT_HANDOFF.md §151).

-- ---------------------------------------------------------------------------------------------
-- 1. Switch and allow-list (OFF, empty)
-- ---------------------------------------------------------------------------------------------
create table private.media_r2_primary_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  delete_max_attempts integer not null default 5 check (delete_max_attempts between 1 and 20),
  delete_retry_seconds integer not null default 600 check (delete_retry_seconds between 60 and 86400),
  pending_expiry_seconds integer not null default 1800 check (pending_expiry_seconds between 300 and 86400),
  reason text not null,
  updated_at timestamptz not null default now()
);
alter table private.media_r2_primary_settings enable row level security;
revoke all on table private.media_r2_primary_settings from public, anon, authenticated;
insert into private.media_r2_primary_settings (enabled, reason) values (false, 'R2 Primary registry prepared 2026-10-30 (phase 2 step 1); inert until Mazen enables it');

create table private.media_r2_primary_owners (
  owner_id uuid primary key,
  note text not null,
  added_at timestamptz not null default now()
);
alter table private.media_r2_primary_owners enable row level security;
revoke all on table private.media_r2_primary_owners from public, anon, authenticated;

create function private.media_r2_primary_active(candidate_owner uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.enabled from private.media_r2_primary_settings s where s.singleton), false)
     and exists (select 1 from private.media_r2_primary_owners o where o.owner_id = candidate_owner);
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. The registry
-- ---------------------------------------------------------------------------------------------
create table private.media_objects (
  object_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,                       -- no foreign key on purpose: a removed account never cascades away the keys of files still in R2
  logical_bucket text not null check (logical_bucket in ('intro-media', 'intro-share-copies', 'wall-video', 'wall-video-derived', 'wall-video-renditions')),
  logical_path text not null check (char_length(logical_path) <= 400 and logical_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9._/-]*$'
                                    and logical_path !~ '(\.\.|//)' and split_part(logical_path, '/', 1) = owner_id::text),
  source_kind text not null check (source_kind in ('promoted', 'derived')),
  source_upload_id uuid,                        -- the usage receipt that holds a derived counted object's reservation, or a promoted object's upload
  r2_key text not null unique,
  expected_bytes bigint not null check (expected_bytes between 1 and 209715200),
  expected_sha256 text not null check (expected_sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint check (bytes is null or bytes = expected_bytes),
  counted boolean not null,
  category text not null check (category in ('intro', 'wall')),
  state text not null default 'pending' check (state in ('pending', 'stored', 'failed', 'deleting', 'deleted', 'missing')),
  claim_token uuid not null default gen_random_uuid(),
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z0-9_]{1,64}$'),
  delete_reason text check (delete_reason is null or delete_reason in ('USER_DELETE', 'REPLACED', 'SUPERSEDED', 'MISSING_CLEANUP')),
  delete_attempts integer not null default 0 check (delete_attempts >= 0),
  last_delete_attempt_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  stored_at timestamptz,
  failed_at timestamptz,
  delete_requested_at timestamptz,
  missing_at timestamptz,
  r2_deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  check (state <> 'stored' or (stored_at is not null and bytes is not null)),
  check (state <> 'deleted' or r2_deleted_at is not null)
);
-- one live object per logical file: a duplicate registration (or a re-registration of a lost file) is refused
create unique index media_objects_one_live on private.media_objects (logical_bucket, logical_path) where state in ('pending', 'stored', 'missing');
create index media_objects_owner_counted on private.media_objects (owner_id) where state = 'stored' and counted;
create index media_objects_landing on private.media_objects (logical_bucket, logical_path) where source_kind = 'promoted' and stored_at is not null;
create index media_objects_delete_queue on private.media_objects (last_delete_attempt_at nulls first) where state in ('failed', 'deleting');
alter table private.media_objects enable row level security;
revoke all on table private.media_objects from public, anon, authenticated, service_role;

create function private.media_objects_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.object_id is distinct from old.object_id or new.owner_id is distinct from old.owner_id or new.logical_bucket is distinct from old.logical_bucket
     or new.logical_path is distinct from old.logical_path or new.source_kind is distinct from old.source_kind or new.r2_key is distinct from old.r2_key
     or new.expected_bytes is distinct from old.expected_bytes or new.expected_sha256 is distinct from old.expected_sha256 or new.counted is distinct from old.counted
     or new.category is distinct from old.category or new.claim_token is distinct from old.claim_token or new.created_at is distinct from old.created_at
     or (old.stored_at is not null and new.stored_at is distinct from old.stored_at) then
    raise exception using errcode = '55000', message = 'MEDIA_OBJECT_IMMUTABLE';
  end if;
  if new.state <> old.state and not ((old.state, new.state) in (('pending', 'stored'), ('pending', 'failed'), ('stored', 'deleting'), ('stored', 'missing'),
                                                                 ('missing', 'deleting'), ('failed', 'deleted'), ('deleting', 'deleted'))) then
    raise exception using errcode = '55000', message = 'MEDIA_OBJECT_INVALID_TRANSITION';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger media_objects_guard before update on private.media_objects for each row execute function private.media_objects_guard();
create function private.media_objects_no_delete()
returns trigger language plpgsql set search_path = ''
as $$ begin raise exception using errcode = '55000', message = 'MEDIA_OBJECT_ROWS_ARE_KEPT'; end $$;
create trigger media_objects_no_delete before delete on private.media_objects for each row execute function private.media_objects_no_delete();

-- the per-bucket rules: counted or internal, Usage category, MIME of the stored object; the size cap stays storage.buckets.file_size_limit (the same config)
create function private.media_r2_bucket_rule(candidate_bucket text, out counted boolean, out category text, out mime text, out cap bigint)
language sql stable security definer set search_path = ''
as $$
  select r.counted, r.category, r.mime, b.file_size_limit
  from (values ('intro-media', true, 'intro', 'video/webm'), ('intro-share-copies', false, 'intro', 'video/webm'),
               ('wall-video', true, 'wall', null), ('wall-video-derived', true, 'wall', 'video/mp4'), ('wall-video-renditions', false, 'wall', 'video/mp4')) r(bucket, counted, category, mime)
  left join storage.buckets b on b.id = r.bucket
  where r.bucket = candidate_bucket;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Registration (the worker, before its signed PUT): returns the R2 key and the attempt's claim token
-- ---------------------------------------------------------------------------------------------
create function private.media_r2_register_impl(candidate_kind text, candidate_owner uuid, candidate_bucket text, candidate_path text, candidate_bytes bigint,
                                               candidate_sha256 text, candidate_mime text default null)
returns table (object_id uuid, r2_key text, claim_token uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  rule record;
  landing bigint;
  receipt jsonb;
  receipt_id uuid;
  new_id uuid := gen_random_uuid();
  key text;
begin
  if candidate_kind not in ('promoted', 'derived') or candidate_owner is null or candidate_bytes is null or candidate_sha256 is null
     or candidate_sha256 !~ '^[0-9a-f]{64}$' or candidate_path is null or split_part(candidate_path, '/', 1) <> candidate_owner::text or candidate_path ~ '(\.\.|//|[\\])' then
    raise exception using errcode = '22023', message = 'INVALID_MEDIA_OBJECT';
  end if;
  if not private.media_r2_primary_active(candidate_owner) then raise exception using errcode = '42501', message = 'R2_PRIMARY_DISABLED'; end if;
  select * into rule from private.media_r2_bucket_rule(candidate_bucket);
  if rule.category is null or rule.cap is null or candidate_bytes < 1 or candidate_bytes > rule.cap then
    raise exception using errcode = '22023', message = 'INVALID_MEDIA_OBJECT';
  end if;
  -- the same per-owner lock every reservation takes: registrations, reservations and quota checks of one owner are serialized
  perform pg_advisory_xact_lock(hashtextextended('usage:' || candidate_owner::text, 0));
  if exists (select 1 from private.media_objects m where m.logical_bucket = candidate_bucket and m.logical_path = candidate_path and m.state in ('pending', 'stored', 'missing')) then
    raise exception using errcode = '23505', message = 'MEDIA_OBJECT_EXISTS';
  end if;
  select (o.metadata ->> 'size')::bigint into landing from storage.objects o where o.bucket_id = candidate_bucket and o.name = candidate_path and coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$';
  key := 'primary/' || candidate_bucket || '/' || candidate_path || '/' || new_id::text;
  if candidate_kind = 'promoted' then
    -- the landing object must exist with exactly this size; a counted one must be the owner's completed upload (the receipt that already counted it)
    if landing is null or landing <> candidate_bytes then raise exception using errcode = '22023', message = 'LANDING_OBJECT_MISMATCH'; end if;
    if rule.counted then
      select u.upload_id into receipt_id from private.usage_uploads u where u.bucket = candidate_bucket and u.path = candidate_path and u.owner_id = candidate_owner and u.state = 'COMPLETE';
      if receipt_id is null then raise exception using errcode = '42501', message = 'LANDING_OBJECT_NOT_OWNED'; end if;
    end if;
  else
    if landing is not null then raise exception using errcode = '23505', message = 'MEDIA_OBJECT_EXISTS'; end if;
    if rule.counted then
      -- reuse the existing reservation: quota, caps and MIME exactly as an upload; the receipt is then bound to R2 so the gateway can never act on it
      receipt := private.reserve_usage_upload(candidate_owner, candidate_bucket, candidate_path, candidate_bytes, coalesce(candidate_mime, rule.mime));
      receipt_id := (receipt ->> 'upload_id')::uuid;
      update private.usage_uploads u set upstream_url = 'r2:' || key, updated_at = now() where u.upload_id = receipt_id and u.state = 'ACTIVE' and u.upstream_url is null;
      if not found then raise exception using errcode = '55000', message = 'UPLOAD_CONFLICT'; end if;
    end if;
  end if;
  insert into private.media_objects (object_id, owner_id, logical_bucket, logical_path, source_kind, source_upload_id, r2_key, expected_bytes, expected_sha256, counted, category)
  values (new_id, candidate_owner, candidate_bucket, candidate_path, candidate_kind, receipt_id, key, candidate_bytes, candidate_sha256, rule.counted, rule.category)
  returning media_objects.object_id, media_objects.r2_key, media_objects.claim_token into object_id, r2_key, claim_token;
  return next;
end $$;

-- the worker reports what R2 stored (the Worker's verified put result). A mismatch is recorded as a failure, never stored.
create function private.media_r2_complete_impl(candidate_object_id uuid, candidate_claim_token uuid, candidate_bytes bigint, candidate_sha256 text)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare m private.media_objects%rowtype; landing bigint;
begin
  select * into m from private.media_objects where object_id = candidate_object_id for update;
  if not found or m.claim_token <> candidate_claim_token or m.state <> 'pending' then raise exception using errcode = '55000', message = 'MEDIA_OBJECT_NOT_PENDING'; end if;
  if candidate_bytes is distinct from m.expected_bytes or candidate_sha256 is distinct from m.expected_sha256 then
    perform private.media_r2_fail_row(m, 'VERIFICATION_MISMATCH');
    return 'failed';
  end if;
  if m.source_kind = 'promoted' then
    select (o.metadata ->> 'size')::bigint into landing from storage.objects o where o.bucket_id = m.logical_bucket and o.name = m.logical_path;
    if landing is distinct from m.expected_bytes then perform private.media_r2_fail_row(m, 'SOURCE_CHANGED'); return 'failed'; end if;
  end if;
  update private.media_objects set state = 'stored', bytes = candidate_bytes, stored_at = now() where object_id = m.object_id;
  if m.source_kind = 'derived' and m.source_upload_id is not null then
    -- the reservation becomes the stored object: the receipt is COMPLETE (ownership proof, as for a Supabase upload) and stops reserving
    update private.usage_uploads set state = 'COMPLETE', updated_at = now() where upload_id = m.source_upload_id and state = 'ACTIVE';
  end if;
  return 'stored';
end $$;

-- pending -> failed; a derived reservation is released (its receipt CANCELLED). The R2 key is kept: a partial or late object is deleted by the delete queue.
create function private.media_r2_fail_row(m private.media_objects, candidate_code text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  update private.media_objects set state = 'failed', failed_at = now(), failure_code = left(coalesce(candidate_code, 'UNKNOWN'), 64) where object_id = m.object_id and state = 'pending';
  if m.source_kind = 'derived' and m.source_upload_id is not null then
    update private.usage_uploads set state = 'CANCELLED', updated_at = now() where upload_id = m.source_upload_id and state = 'ACTIVE';
  end if;
end $$;

create function private.media_r2_fail_impl(candidate_object_id uuid, candidate_claim_token uuid, candidate_code text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare m private.media_objects%rowtype;
begin
  if candidate_code is null or candidate_code !~ '^[A-Z0-9_]{1,64}$' then raise exception using errcode = '22023', message = 'INVALID_FAILURE_CODE'; end if;
  select * into m from private.media_objects where object_id = candidate_object_id for update;
  if not found or m.claim_token <> candidate_claim_token or m.state <> 'pending' then raise exception using errcode = '55000', message = 'MEDIA_OBJECT_NOT_PENDING'; end if;
  perform private.media_r2_fail_row(m, candidate_code);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4. Delete / replace (called by the product's existing delete and replace flows when they are wired): effective at commit
-- ---------------------------------------------------------------------------------------------
create function private.media_r2_request_delete_impl(candidate_bucket text, candidate_path text, candidate_reason text)
returns integer language plpgsql volatile security definer set search_path = ''
as $$
declare m private.media_objects%rowtype; n integer := 0;
begin
  if candidate_reason is null or candidate_reason not in ('USER_DELETE', 'REPLACED', 'SUPERSEDED') then raise exception using errcode = '22023', message = 'INVALID_DELETE_REASON'; end if;
  for m in select * from private.media_objects where logical_bucket = candidate_bucket and logical_path = candidate_path and state in ('pending', 'stored', 'missing') for update loop
    if m.state = 'pending' then
      perform private.media_r2_fail_row(m, 'DELETED_DURING_UPLOAD');   -- the in-flight PUT can no longer complete; its object is deleted by the queue
    else
      update private.media_objects set state = 'deleting', delete_reason = case when m.state = 'missing' then 'MISSING_CLEANUP' else candidate_reason end,
        delete_requested_at = now() where object_id = m.object_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- the file is found gone from R2 outside GamID: it stops being served and counted; nothing re-creates it (no automatic restore)
create function private.media_r2_mark_missing_impl(candidate_object_id uuid)
returns text language plpgsql volatile security definer set search_path = ''
as $$
begin
  update private.media_objects set state = 'missing', missing_at = now() where object_id = candidate_object_id and state = 'stored';
  return (select state from private.media_objects where object_id = candidate_object_id);
end $$;

-- the only delivery answer: a key for a verified, stored object; nothing for pending, failed, deleting, deleted or missing
create function private.media_r2_servable_key(candidate_bucket text, candidate_path text)
returns text language sql stable security definer set search_path = ''
as $$
  select m.r2_key from private.media_objects m where m.logical_bucket = candidate_bucket and m.logical_path = candidate_path and m.state = 'stored' and m.r2_deleted_at is null;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Physical deletion queue, with attempts and recorded errors (never dropped)
-- ---------------------------------------------------------------------------------------------
create function private.worker_media_r2_delete_claim_impl(candidate_limit integer default 20)
returns table (object_id uuid, r2_key text, delete_attempts integer)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare s private.media_r2_primary_settings%rowtype; m private.media_objects%rowtype;
begin
  select * into s from private.media_r2_primary_settings where singleton;
  -- an abandoned upload (the worker died before completing) fails after the expiry, releasing its reservation
  for m in select * from private.media_objects x where x.state = 'pending' and x.created_at < now() - make_interval(secs => s.pending_expiry_seconds) for update skip locked loop
    perform private.media_r2_fail_row(m, 'ABANDONED');
  end loop;
  return query
  with due as (
    select x.object_id from private.media_objects x
    where x.state in ('failed', 'deleting') and x.r2_deleted_at is null and x.delete_attempts < s.delete_max_attempts
      -- a failed attempt waits out the ingest signature window, so a late PUT of the same attempt cannot land after its delete
      and (x.state = 'deleting' or x.failed_at < now() - interval '10 minutes')
      and (x.last_delete_attempt_at is null or x.last_delete_attempt_at < now() - make_interval(secs => s.delete_retry_seconds))
    order by x.last_delete_attempt_at nulls first, x.created_at
    limit greatest(1, least(coalesce(candidate_limit, 20), 100))
    for update skip locked
  )
  update private.media_objects x set delete_attempts = x.delete_attempts + 1, last_delete_attempt_at = now()
  from due where x.object_id = due.object_id
  returning x.object_id, x.r2_key, x.delete_attempts;
end $$;

create function private.worker_media_r2_delete_confirm_impl(candidate_object_id uuid, candidate_r2_key text, candidate_ok boolean, candidate_error text default null)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare m private.media_objects%rowtype;
begin
  select * into m from private.media_objects where object_id = candidate_object_id and r2_key = candidate_r2_key for update;
  if not found or m.state not in ('failed', 'deleting') then raise exception using errcode = '55000', message = 'MEDIA_OBJECT_NOT_DELETABLE'; end if;
  if candidate_ok then
    update private.media_objects set state = 'deleted', r2_deleted_at = now(), last_error = null where object_id = m.object_id;
    return 'deleted';
  end if;
  update private.media_objects set last_error = left(coalesce(nullif(btrim(candidate_error), ''), 'UNKNOWN'), 500) where object_id = m.object_id;
  return m.state;
end $$;

-- the operator's list: deletions that used every attempt (still not served, still kept)
create function private.media_r2_delete_stuck_impl()
returns table (object_id uuid, owner_id uuid, r2_key text, state text, delete_attempts integer, last_error text, last_delete_attempt_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.object_id, m.owner_id, m.r2_key, m.state, m.delete_attempts, m.last_error, m.last_delete_attempt_at
  from private.media_objects m cross join private.media_r2_primary_settings s
  where s.singleton and m.state in ('failed', 'deleting') and m.r2_deleted_at is null and m.delete_attempts >= s.delete_max_attempts
  order by m.last_delete_attempt_at;
$$;

-- temporary landing objects whose file is now in R2 (they no longer count): the worker deletes them from Supabase Storage
create function private.worker_media_r2_landing_cleanup_impl(candidate_limit integer default 20)
returns table (bucket text, path text)
language sql stable security definer set search_path = ''
as $$
  select o.bucket_id, o.name from storage.objects o
  where exists (select 1 from private.media_objects m where m.source_kind = 'promoted' and m.stored_at is not null and m.logical_bucket = o.bucket_id and m.logical_path = o.name)
  order by o.name limit greatest(1, least(coalesce(candidate_limit, 20), 100));
$$;

-- a landing object that already moved to R2 (stored at least once): never counted again, whatever happens to its R2 row
create function private.media_r2_landing_moved(candidate_bucket text, candidate_path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.media_objects m where m.source_kind = 'promoted' and m.stored_at is not null and m.logical_bucket = candidate_bucket and m.logical_path = candidate_path);
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Quota and Usage (the live definitions, changed only where noted). With an empty registry every answer is exactly today's.
-- ---------------------------------------------------------------------------------------------
create or replace function private.usage_stored_bytes(u uuid)
returns bigint language plpgsql stable security definer set search_path = ''
as $function$
begin
 if exists(select 1 from storage.objects o where split_part(o.name,'/',1)=u::text and o.bucket_id not in ('wall-video-renditions','intro-share-copies','intro-posters') and coalesce(o.metadata->>'size','') !~ '^[0-9]+$') then raise exception 'UNVERIFIED_STORAGE_SIZE';end if;
 return (select coalesce(sum((o.metadata->>'size')::bigint),0)::bigint from storage.objects o where split_part(o.name,'/',1)=u::text and o.bucket_id not in ('wall-video-renditions','intro-share-copies','intro-posters')
          and not private.media_r2_landing_moved(o.bucket_id,o.name))                                                                   -- R2 Primary: a moved landing object
      + (select coalesce(sum(m.bytes),0)::bigint from private.media_objects m where m.owner_id=u and m.counted and m.state='stored');   -- R2 Primary: counted R2 objects
end
$function$;

create or replace function private.get_my_usage_impl()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare u uuid:=auth.uid(); used bigint; reserved bigint; p private.usage_policy%rowtype; entity uuid; doc jsonb; assets integer; videos integer; layers integer; media jsonb; crew_quotas jsonb;
begin
 if u is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into p from private.usage_policy where singleton;
 used:=private.usage_stored_bytes(u); reserved:=private.usage_reserved_bytes(u);
 select m.entity_id into entity from public.entity_memberships m join public.entities e on e.entity_id=m.entity_id where m.user_id=u and m.role='OWNER' and e.entity_type='SOLO' limit 1;
 select document into doc from public.wall_drafts where entity_id=entity;
 select count(*) into layers from jsonb_array_elements(coalesce(doc->'stages','[]')) s cross join lateral jsonb_array_elements(s->'elements');
 select count(*),count(*) filter(where mime_type like 'video/%') into assets,videos from public.wall_assets where entity_id=entity;
 select coalesce(jsonb_object_agg(category,bytes),'{}') into media from (
  select category, sum(bytes)::bigint bytes from (
   select coalesce(c.category,'other') category,
    (o.metadata->>'size')::bigint bytes from storage.objects o left join private.usage_media_categories c on c.bucket=o.bucket_id where split_part(o.name,'/',1)=u::text and o.bucket_id not in ('wall-video-renditions','intro-share-copies','intro-posters') and coalesce(o.metadata->>'size','') ~ '^[0-9]+$'
     and not private.media_r2_landing_moved(o.bucket_id,o.name)
   union all
   select r.category, r.bytes from private.media_objects r where r.owner_id=u and r.counted and r.state='stored'
  ) x group by 1
 ) m;
 select coalesce(jsonb_agg(q),'[]') into crew_quotas from (
  select jsonb_build_object('key','crew.members.'||c.crew_id,'name',c.name||' · Crew members','used',(select count(*) from public.crew_members a where a.crew_id=c.crew_id and a.status='ACTIVE'),'limit',cp.max_members) q
  from public.crews c cross join private.crew_policy cp where c.owner_entity_id=entity and cp.singleton
  union all
  select jsonb_build_object('key','crew.stages.'||c.crew_id,'name',c.name||' · Crew Wall stages','used',coalesce(w.stage_count,1),'limit',private.crew_wall_stage_allowance(c.crew_id))
  from public.crews c left join public.crew_walls w on w.crew_id=c.crew_id where c.owner_entity_id=entity
 ) cq;
 return jsonb_build_object('version',1,'storage',jsonb_build_object('quota_bytes',p.quota_bytes,'used_bytes',used,'remaining_bytes',greatest(0,p.quota_bytes-used),'reserved_bytes',reserved,'available_bytes',greatest(0,p.quota_bytes-used-reserved),'percentage',round(100.0*used/p.quota_bytes,2),'state',case when used>=p.quota_bytes then 'FULL' when used>=p.quota_bytes*p.near_limit then 'NEAR_LIMIT' when used>=p.quota_bytes*p.approaching then 'APPROACHING_LIMIT' else 'NORMAL' end,'enforcement_active',p.gateway_required),'media',media,'quotas',jsonb_build_array(
  jsonb_build_object('key','wall.layers','name','Wall Layers','used',layers,'limit',null),
  jsonb_build_object('key','wall.assets','name','Wall Assets (images + videos)','used',assets,'limit',private.wall_asset_limit()),
  jsonb_build_object('key','wall.videos','name','Wall Videos','used',videos,'limit',private.wall_video_limit()),
  jsonb_build_object('key','wall.images','name','Wall Images','used',assets-videos,'limit',null,'note','Shares the Wall Assets allowance'),
  jsonb_build_object('key','wall.fonts','name','Custom Fonts','used',(select count(*) from public.wall_fonts f where f.owner_id=u),'limit',private.wall_font_limit()))||crew_quotas);
end $function$;

-- reservations: a COMPLETE receipt whose file lives in R2 is not stale (it is not in storage.objects), and a path held by a live R2 object is taken
create or replace function private.reserve_usage_upload(u uuid, b text, p text, n bigint, m text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare existing private.usage_uploads%rowtype; cap bigint; types text[]; q bigint;
begin
 if u is null or p is null or split_part(p,'/',1)<>u::text or p ~ '(\.\.|[\\])' then raise exception 'INVALID_UPLOAD_PATH'; end if;
 select file_size_limit,allowed_mime_types into cap,types from storage.buckets where id=b;
 if b<>'wall-fonts' and b not in ('avatars','intro-sources','intro-media','wall-media','wall-video','wall-video-derived') or cap is null or n is null or m is null or n<1 or n>cap or not(m=any(types)) then raise exception 'INVALID_UPLOAD'; end if;
 perform pg_advisory_xact_lock(hashtextextended('usage:'||u::text,0));
 select * into existing from private.usage_uploads where bucket=b and path=p;
 if found then
  if existing.owner_id<>u then raise exception 'UPLOAD_CONFLICT'; end if;
  if existing.state='CANCELLED' or (existing.state='COMPLETE' and not exists(select 1 from storage.objects where bucket_id=b and name=p)
                                    and not exists(select 1 from private.media_objects r where r.logical_bucket=b and r.logical_path=p and r.state in ('pending','stored','missing','deleting'))) then delete from private.usage_uploads where upload_id=existing.upload_id;
  else
   if existing.expected_bytes<>n or existing.content_type<>m then raise exception 'UPLOAD_CONFLICT'; end if;
   return to_jsonb(existing);
  end if;
 end if;
 if b='wall-fonts' and private.wall_font_slots_used(u,p)>=private.wall_font_limit() then raise exception using errcode='54000',message='WALL_FONT_LIMIT'; end if;
 if exists(select 1 from storage.objects where bucket_id=b and name=p)
    or exists(select 1 from private.media_objects r where r.logical_bucket=b and r.logical_path=p and r.state in ('pending','stored','missing')) then raise exception 'OBJECT_ALREADY_EXISTS'; end if;
 select quota_bytes into q from private.usage_policy where singleton;
 if private.usage_stored_bytes(u)+private.usage_reserved_bytes(u)+n>q then raise exception using errcode='54000',message='ACCOUNT_STORAGE_QUOTA_EXCEEDED'; end if;
 insert into private.usage_uploads(owner_id,bucket,path,expected_bytes,content_type) values(u,b,p,n,m) returning * into existing;
 return to_jsonb(existing);
end $function$;

-- receipt actions: a receipt bound to R2 ('r2:<key>') is managed only by the registry - the gateway can't bind, complete, cancel or release it
create or replace function private.usage_upload_action(i uuid, u uuid, a text, v text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare x private.usage_uploads%rowtype; bytes bigint;
begin
 select * into x from private.usage_uploads where upload_id=i and owner_id=u for update;
 if not found then raise exception using errcode='42501',message='UPLOAD_NOT_OWNED'; end if;
 if a<>'get' and x.upstream_url like 'r2:%' then raise exception using errcode='55000',message='UPLOAD_R2_MANAGED'; end if;
 if a='bind' then
  if x.state<>'ACTIVE' then raise exception 'UPLOAD_CANCELLED';end if;
  if x.upstream_url is not null and x.upstream_url<>v then raise exception 'UPLOAD_ALREADY_BOUND'; end if;
  update private.usage_uploads set upstream_url=v,updated_at=now() where upload_id=i;
 elsif a='complete' then
  if x.state='CANCELLED' then raise exception 'UPLOAD_CANCELLED';end if;
  select (metadata->>'size')::bigint into bytes from storage.objects where bucket_id=x.bucket and name=x.path;
  if bytes is distinct from x.expected_bytes then raise exception 'UPLOAD_SIZE_MISMATCH'; end if;
  update private.usage_uploads set state='COMPLETE',updated_at=now() where upload_id=i;
 elsif a='cancel' then
  -- Gateway proves remote termination/absence before invoking this service-only action.
  if exists(select 1 from storage.objects where bucket_id=x.bucket and name=x.path) then raise exception 'UPLOAD_STILL_STORED'; end if;
  update private.usage_uploads set state='CANCELLED',updated_at=now() where upload_id=i;
 elsif a='release_unbound' then
  -- ISS-0011: only a receipt whose resumable upload never started (never bound, so nothing can continue it) and whose object does not exist
  if x.state<>'ACTIVE' or x.upstream_url is not null then raise exception 'UPLOAD_IN_PROGRESS'; end if;
  if exists(select 1 from storage.objects where bucket_id=x.bucket and name=x.path) then raise exception 'UPLOAD_STILL_STORED'; end if;
  update private.usage_uploads set state='CANCELLED',updated_at=now() where upload_id=i;
 elsif a<>'get' then raise exception 'INVALID_UPLOAD_ACTION'; end if;
 select * into x from private.usage_uploads where upload_id=i;
 return to_jsonb(x);
end $function$;

-- ---------------------------------------------------------------------------------------------
-- 7. The worker's entry points (service role only), in the pilot's wrapper style
-- ---------------------------------------------------------------------------------------------
create function public.worker_media_r2_register(candidate_kind text, candidate_owner uuid, candidate_bucket text, candidate_path text, candidate_bytes bigint, candidate_sha256 text, candidate_mime text default null)
returns table (object_id uuid, r2_key text, claim_token uuid) language sql volatile security invoker set search_path = ''
as $$ select * from private.media_r2_register_impl(candidate_kind, candidate_owner, candidate_bucket, candidate_path, candidate_bytes, candidate_sha256, candidate_mime); $$;
create function public.worker_media_r2_complete(candidate_object_id uuid, candidate_claim_token uuid, candidate_bytes bigint, candidate_sha256 text)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.media_r2_complete_impl(candidate_object_id, candidate_claim_token, candidate_bytes, candidate_sha256); $$;
create function public.worker_media_r2_fail(candidate_object_id uuid, candidate_claim_token uuid, candidate_code text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.media_r2_fail_impl(candidate_object_id, candidate_claim_token, candidate_code); $$;
create function public.worker_media_r2_mark_missing(candidate_object_id uuid)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.media_r2_mark_missing_impl(candidate_object_id); $$;
create function public.worker_media_r2_delete_claim(candidate_limit integer default 20)
returns table (object_id uuid, r2_key text, delete_attempts integer) language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_media_r2_delete_claim_impl(candidate_limit); $$;
create function public.worker_media_r2_delete_confirm(candidate_object_id uuid, candidate_r2_key text, candidate_ok boolean, candidate_error text default null)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.worker_media_r2_delete_confirm_impl(candidate_object_id, candidate_r2_key, candidate_ok, candidate_error); $$;
create function public.worker_media_r2_landing_cleanup(candidate_limit integer default 20)
returns table (bucket text, path text) language sql stable security invoker set search_path = ''
as $$ select * from private.worker_media_r2_landing_cleanup_impl(candidate_limit); $$;

revoke all on function
  private.media_r2_primary_active(uuid), private.media_objects_guard(), private.media_objects_no_delete(), private.media_r2_bucket_rule(text),
  private.media_r2_register_impl(text, uuid, text, text, bigint, text, text), private.media_r2_complete_impl(uuid, uuid, bigint, text),
  private.media_r2_fail_row(private.media_objects, text), private.media_r2_fail_impl(uuid, uuid, text), private.media_r2_request_delete_impl(text, text, text),
  private.media_r2_mark_missing_impl(uuid), private.media_r2_servable_key(text, text), private.worker_media_r2_delete_claim_impl(integer),
  private.worker_media_r2_delete_confirm_impl(uuid, text, boolean, text), private.media_r2_delete_stuck_impl(), private.worker_media_r2_landing_cleanup_impl(integer),
  private.media_r2_landing_moved(text, text),
  public.worker_media_r2_register(text, uuid, text, text, bigint, text, text), public.worker_media_r2_complete(uuid, uuid, bigint, text),
  public.worker_media_r2_fail(uuid, uuid, text), public.worker_media_r2_mark_missing(uuid), public.worker_media_r2_delete_claim(integer),
  public.worker_media_r2_delete_confirm(uuid, text, boolean, text), public.worker_media_r2_landing_cleanup(integer)
from public, anon, authenticated, service_role;
-- the worker (service role) reaches the registry only through these wrappers and their impls; the delete / servable / stuck helpers stay internal
-- (the product's delete flows and public-media will call them from their own security-definer functions when they are wired)
grant execute on function
  private.media_r2_register_impl(text, uuid, text, text, bigint, text, text), private.media_r2_complete_impl(uuid, uuid, bigint, text),
  private.media_r2_fail_impl(uuid, uuid, text), private.media_r2_mark_missing_impl(uuid), private.worker_media_r2_delete_claim_impl(integer),
  private.worker_media_r2_delete_confirm_impl(uuid, text, boolean, text), private.worker_media_r2_landing_cleanup_impl(integer),
  public.worker_media_r2_register(text, uuid, text, text, bigint, text, text), public.worker_media_r2_complete(uuid, uuid, bigint, text),
  public.worker_media_r2_fail(uuid, uuid, text), public.worker_media_r2_mark_missing(uuid), public.worker_media_r2_delete_claim(integer),
  public.worker_media_r2_delete_confirm(uuid, text, boolean, text), public.worker_media_r2_landing_cleanup(integer)
to service_role;
