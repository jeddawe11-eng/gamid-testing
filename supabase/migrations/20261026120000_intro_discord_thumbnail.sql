-- Intro Thumbnail for Discord (Mazen's task 2026-10-26, "Implement Intro Thumbnail Selection for Discord") - GamID TESTING only. Additive: no existing row,
-- object, Intro, derivative or accepted contract changes, and the accepted Intro / D3 pipeline is untouched.
--
--   1. profile_intro_settings gains the owner's chosen frame: thumbnail_job_id + thumbnail_ms. A selection belongs to ONE Intro (its job): once that Intro is
--      replaced or removed the selection no longer matches the active Intro, so nothing stale can ever be shown and the new Intro starts at its default.
--   2. bucket intro-share-copies: private, WebM only, at most 15 MiB (the D3 cap). Its only read path is the storage policy below, for the CURRENT ready copy
--      of a PUBLIC GamID (the same shape as "public identity intro media are readable"). Only the worker (service role) writes and deletes.
--   3. public.intro_share_copies: the Discord share-copy registry AND its job queue (pending -> processing -> ready | failed | superseded), claimed by the same
--      worker Job with SKIP LOCKED and per-attempt claim tokens (a late, superseded worker can never complete), a lost-worker reclaim after 20 minutes,
--      at most 2 attempts. A share copy = 1 frame of the chosen frame + the whole Intro from 0:00, audio delayed by exactly that frame (worker/intro-share.mjs).
--   4. quota: like F8-B1's renditions, this internal copy does not count toward the owner's unchanged 200 MB (the Intro derivative still does).
--   5. lifecycle: a storage-driven sweep deletes every share-copy object that is not the current ready copy or an in-flight attempt, after a grace period.
--   6. abuse bound: at most 20 share copies may be queued per profile per hour (each one starts a worker execution).
-- Rollback: drop the trigger, the policy, the functions and the table; reverse the two in-place usage patches; delete the bucket's objects, then the bucket;
-- drop the two profile_intro_settings columns.

-- ---------------------------------------------------------------------------------------------
-- 1. The owner's selection (one Intro's frame, in milliseconds of that Intro's D3 derivative)
-- ---------------------------------------------------------------------------------------------
alter table public.profile_intro_settings
  add column thumbnail_job_id uuid references public.intro_processing_jobs(job_id) on delete set null,
  add column thumbnail_ms integer check (thumbnail_ms between 1 and 31000),
  add constraint profile_intro_settings_thumbnail_pair check ((thumbnail_job_id is null) = (thumbnail_ms is null));

-- ---------------------------------------------------------------------------------------------
-- 2. Storage
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('intro-share-copies', 'intro-share-copies', false, 15728640, array['video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------------------------
-- 3. The registry + queue
-- ---------------------------------------------------------------------------------------------
create table public.intro_share_copies (
  share_id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  owner_user_id uuid not null,
  job_id uuid not null references public.intro_processing_jobs(job_id) on delete cascade,
  thumbnail_ms integer not null check (thumbnail_ms between 1 and 31000),
  state text not null default 'pending',
  attempts integer not null default 0,
  claim_token uuid,
  share_path text,
  share_bytes bigint,
  share_width integer,
  share_height integer,
  share_duration_ms integer,
  failure_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint intro_share_copies_state check (state in ('pending', 'processing', 'ready', 'failed', 'superseded')),
  constraint intro_share_copies_path check (share_path is null or (share_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webm$' and split_part(share_path, '/', 1) = owner_user_id::text)),
  constraint intro_share_copies_ready check (state <> 'ready' or (share_path is not null and share_bytes between 1 and 15728640 and share_width > 0 and share_height > 0
    and share_duration_ms between 500 and 32000))
);
-- at most one live copy per profile: a new selection supersedes the previous one first
create unique index intro_share_copies_one_live on public.intro_share_copies (profile_id) where state in ('pending', 'processing', 'ready');
create index intro_share_copies_pending_idx on public.intro_share_copies (created_at) where state = 'pending';
create index intro_share_copies_profile_created_idx on public.intro_share_copies (profile_id, created_at desc);
alter table public.intro_share_copies enable row level security;
revoke all on table public.intro_share_copies from public, anon, authenticated;

-- a copy is current while it matches the profile's selection for its ACTIVE, ready Intro
create function private.intro_share_is_current(candidate_share_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.intro_share_copies r
    join public.profile_intro_settings s on s.profile_id = r.profile_id
    join public.intro_processing_jobs j on j.job_id = s.active_job_id
    where r.share_id = candidate_share_id
      and s.active_job_id = r.job_id and s.thumbnail_job_id = r.job_id and s.thumbnail_ms = r.thumbnail_ms
      and j.state = 'ready' and j.derivative_path is not null and j.derivative_deleted_at is null
  );
$$;

-- the public read path: the current ready copy of a PUBLIC GamID (mirrors private.intro_media_is_public)
create function private.intro_share_is_public(candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.intro_share_copies r
    join public.profiles p on p.profile_id = r.profile_id
    join public.entities e on e.entity_id = p.entity_id
    where r.share_path = candidate_path and r.state = 'ready'
      and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC'
      and private.intro_share_is_current(r.share_id)
  );
$$;

create policy "public identity intro share copies are readable"
on storage.objects for select to anon, authenticated
using (bucket_id = 'intro-share-copies' and private.intro_share_is_public(name));

-- ---------------------------------------------------------------------------------------------
-- 4. Owner RPCs
-- ---------------------------------------------------------------------------------------------
-- the caller's selection for their ACTIVE Intro and the state of its share copy; all null when there is none (default: the Intro's own first frame)
create function private.get_my_intro_thumbnail_impl()
returns table (job_id uuid, thumbnail_ms integer, share_state text, share_failure_code text, intro_duration_ms integer, intro_fps numeric)
language sql stable security definer
set search_path = ''
as $$
  with owned as (select private.my_solo_profile_id() profile_id)
  select s.active_job_id,
    case when s.thumbnail_job_id = s.active_job_id then s.thumbnail_ms end,
    case when s.thumbnail_job_id = s.active_job_id then r.state end,
    case when s.thumbnail_job_id = s.active_job_id then r.failure_code end,
    j.output_duration_ms, j.output_fps
  from owned o
  join public.profile_intro_settings s on s.profile_id = o.profile_id
  join public.intro_processing_jobs j on j.job_id = s.active_job_id and j.state = 'ready'
  left join lateral (
    select c.state, c.failure_code from public.intro_share_copies c
    where c.profile_id = s.profile_id and c.job_id = s.active_job_id and c.thumbnail_ms = s.thumbnail_ms and c.state <> 'superseded'
    order by c.created_at desc limit 1
  ) r on true;
$$;

-- Save the chosen frame of the caller's ACTIVE Intro (candidate_job_id must still be it: a replaced Intro never receives a frame chosen for the old one).
-- null or 0 = the default (the Intro's own first frame): no share copy is needed and Discord gets the unchanged Intro. Idempotent for an unchanged frame.
create function private.set_my_intro_thumbnail_impl(candidate_job_id uuid, candidate_thumbnail_ms integer)
returns table (thumbnail_ms integer, share_state text)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  owned_profile uuid := private.my_solo_profile_id();
  settings public.profile_intro_settings%rowtype;
  intro public.intro_processing_jobs%rowtype;
  wanted integer := nullif(candidate_thumbnail_ms, 0);
  live public.intro_share_copies%rowtype;
begin
  if auth.uid() is null or owned_profile is null then raise exception using errcode = '42501', message = 'NOT_AUTHORIZED'; end if;
  select * into settings from public.profile_intro_settings s where s.profile_id = owned_profile for update;
  select * into intro from public.intro_processing_jobs j where j.job_id = settings.active_job_id and j.state = 'ready';
  if intro.job_id is null or candidate_job_id is distinct from intro.job_id then raise exception using errcode = '22023', message = 'INTRO_THUMBNAIL_INTRO_CHANGED'; end if;
  if wanted is not null and (wanted < 0 or wanted >= coalesce(intro.output_duration_ms, 0)) then raise exception using errcode = '22023', message = 'INVALID_INTRO_THUMBNAIL'; end if;

  if wanted is null then
    update public.profile_intro_settings s set thumbnail_job_id = null, thumbnail_ms = null, updated_at = now() where s.profile_id = owned_profile;
    update public.intro_share_copies c set state = 'superseded', claim_token = null, completed_at = coalesce(c.completed_at, now()), updated_at = now()
      where c.profile_id = owned_profile and c.state in ('pending', 'processing', 'ready');
    return query select null::integer, null::text;
    return;
  end if;

  update public.profile_intro_settings s set thumbnail_job_id = intro.job_id, thumbnail_ms = wanted, updated_at = now() where s.profile_id = owned_profile;
  select * into live from public.intro_share_copies c where c.profile_id = owned_profile and c.state in ('pending', 'processing', 'ready');
  if live.share_id is not null and live.job_id = intro.job_id and live.thumbnail_ms = wanted then
    return query select wanted, live.state;
    return;
  end if;
  if (select count(*) from public.intro_share_copies c where c.profile_id = owned_profile and c.created_at > now() - interval '1 hour') >= 20 then
    raise exception using errcode = '54000', message = 'INTRO_THUMBNAIL_RATE_LIMITED';
  end if;
  update public.intro_share_copies c set state = 'superseded', claim_token = null, completed_at = coalesce(c.completed_at, now()), updated_at = now()
    where c.profile_id = owned_profile and c.state in ('pending', 'processing', 'ready');
  insert into public.intro_share_copies (profile_id, owner_user_id, job_id, thumbnail_ms) values (owned_profile, intro.owner_user_id, intro.job_id, wanted);
  return query select wanted, 'pending'::text;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Visitors (the Cloudflare Worker's anonymous lookup): the current ready copy of a PUBLIC GamID, else nothing
-- ---------------------------------------------------------------------------------------------
create function private.get_public_intro_share_impl(candidate_handle text)
returns table (share_path text, thumbnail_ms integer)
language sql stable security definer
set search_path = ''
as $$
  select r.share_path, r.thumbnail_ms
  from public.entities e
  join public.profiles p on p.entity_id = e.entity_id
  join public.intro_share_copies r on r.profile_id = p.profile_id and r.state = 'ready'
  where e.gamid_handle = private.normalize_handle(candidate_handle)
    and e.entity_type = 'SOLO'
    and e.visibility = 'PUBLIC'
    and private.intro_share_is_current(r.share_id)
  limit 1;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. The worker (service role only)
-- ---------------------------------------------------------------------------------------------
-- claim ONE copy (SKIP LOCKED) that is still the current selection; a copy whose selection changed is superseded first. A copy stuck in `processing` for
-- 20 minutes (a lost worker) is claimed again with a NEW claim token and object path, at most 2 attempts in all.
create function private.worker_claim_intro_share_impl()
returns table (share_id uuid, claim_token uuid, owner_user_id uuid, job_id uuid, derivative_path text, derivative_bytes bigint, intro_duration_ms integer,
  intro_width integer, intro_height integer, intro_has_audio boolean, thumbnail_ms integer, share_path text)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  picked public.intro_share_copies%rowtype;
  intro public.intro_processing_jobs%rowtype;
  token uuid := gen_random_uuid();
  path text;
begin
  update public.intro_share_copies r set state = 'failed', failure_code = 'PROCESSING_TIMED_OUT', claim_token = null, completed_at = now(), updated_at = now()
  where r.state = 'processing' and r.started_at < now() - interval '20 minutes' and r.attempts >= 2;
  update public.intro_share_copies r set state = 'superseded', claim_token = null, completed_at = now(), updated_at = now()
  where r.state in ('pending', 'processing') and not private.intro_share_is_current(r.share_id);
  select * into picked from public.intro_share_copies r
  where r.state = 'pending' or (r.state = 'processing' and r.started_at < now() - interval '20 minutes' and r.attempts < 2)
  order by r.created_at for update skip locked limit 1;
  if picked.share_id is null then return; end if;
  select * into intro from public.intro_processing_jobs j where j.job_id = picked.job_id;
  path := picked.owner_user_id::text || '/' || picked.job_id::text || '/' || picked.share_id::text || '/' || token::text || '.webm';
  update public.intro_share_copies r set state = 'processing', attempts = r.attempts + 1, claim_token = token, share_path = path, started_at = now(), updated_at = now()
  where r.share_id = picked.share_id;
  return query select picked.share_id, token, picked.owner_user_id, picked.job_id, intro.derivative_path, intro.output_size_bytes, intro.output_duration_ms,
    intro.output_width, intro.output_height, intro.output_has_audio, picked.thumbnail_ms, path;
end;
$$;

-- after the worker's own validation passed and the object was written: mark READY, only while it is still the current selection
create function private.worker_complete_intro_share_impl(candidate_share_id uuid, candidate_claim_token uuid, candidate_path text, candidate_bytes bigint,
  candidate_width integer, candidate_height integer, candidate_duration_ms integer)
returns table (share_id uuid, state text)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  job public.intro_share_copies%rowtype;
  intro public.intro_processing_jobs%rowtype;
  stored_size bigint;
begin
  select * into job from public.intro_share_copies r where r.share_id = candidate_share_id and r.state = 'processing' for update;
  if job.share_id is null or job.claim_token is distinct from candidate_claim_token then raise exception using errcode = '22023', message = 'INTRO_SHARE_NOT_CLAIMED'; end if;
  if candidate_path is distinct from job.share_path then raise exception using errcode = '22023', message = 'INVALID_INTRO_SHARE_PATH'; end if;
  if not private.intro_share_is_current(job.share_id) then raise exception using errcode = '22023', message = 'INTRO_SHARE_SUPERSEDED'; end if;
  select * into intro from public.intro_processing_jobs j where j.job_id = job.job_id;
  select (o.metadata ->> 'size')::bigint into stored_size from storage.objects o where o.bucket_id = 'intro-share-copies' and o.name = job.share_path;
  if stored_size is null then raise exception using errcode = 'P0002', message = 'INTRO_SHARE_NOT_FOUND'; end if;
  if stored_size is distinct from candidate_bytes or stored_size > 15728640 then raise exception using errcode = '22023', message = 'INTRO_SHARE_SIZE_MISMATCH'; end if;
  if candidate_width is distinct from intro.output_width or candidate_height is distinct from intro.output_height then raise exception using errcode = '22023', message = 'INTRO_SHARE_GEOMETRY_CHANGED'; end if;
  if candidate_duration_ms is null or abs(candidate_duration_ms - intro.output_duration_ms) > 300 then raise exception using errcode = '22023', message = 'INTRO_SHARE_DURATION_CHANGED'; end if;
  update public.intro_share_copies r set state = 'ready', claim_token = null, share_bytes = stored_size, share_width = candidate_width, share_height = candidate_height,
    share_duration_ms = candidate_duration_ms, failure_code = null, completed_at = now(), updated_at = now()
  where r.share_id = job.share_id;
  return query select job.share_id, 'ready'::text;
end;
$$;

-- the attempt failed: only the current claim may finish it. Nothing here makes a copy visible; Discord keeps the unchanged Intro.
create function private.worker_fail_intro_share_impl(candidate_share_id uuid, candidate_claim_token uuid, candidate_code text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.intro_share_copies r set state = 'failed', claim_token = null,
    failure_code = left(regexp_replace(upper(coalesce(candidate_code, 'INTRO_SHARE_FAILED')), '[^A-Z0-9_]', '_', 'g'), 64), completed_at = now(), updated_at = now()
  where r.share_id = candidate_share_id and r.state = 'processing' and r.claim_token = candidate_claim_token;
end;
$$;

-- the sweep: every object in the share bucket that is not a current READY copy and not the current in-flight attempt, once older than the grace period.
-- Driven by storage itself, so an object written by a crashed or superseded attempt is found even though no row names it.
create function private.worker_intro_share_sweep_impl(candidate_limit integer)
returns table (object_path text)
language sql stable security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'intro-share-copies'
    and o.created_at < now() - interval '10 minutes'
    and not exists (
      select 1 from public.intro_share_copies r
      where r.share_path = o.name
        and ((r.state = 'ready' and private.intro_share_is_current(r.share_id)) or (r.state = 'processing' and r.claim_token is not null)))
  order by o.created_at
  limit least(greatest(coalesce(candidate_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Quota: the internal share copy never counts toward the owner's storage. Patched IN PLACE from the live definitions (after F8-B1's patch), so every
--    other part of them is kept exactly; a missing target aborts the migration.
-- ---------------------------------------------------------------------------------------------
do $$
declare original text; revised text;
begin
  foreach original in array array[pg_get_functiondef('private.usage_stored_bytes(uuid)'::regprocedure), pg_get_functiondef('private.get_my_usage_impl()'::regprocedure)] loop
    revised := replace(original, $o$o.bucket_id<>'wall-video-renditions'$o$, $n$o.bucket_id not in ('wall-video-renditions','intro-share-copies')$n$);
    if revised = original then raise exception 'INTRO_SHARE_USAGE_PATCH_FAILED'; end if;
    execute revised;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 8. Wrappers and privileges
-- ---------------------------------------------------------------------------------------------
create function public.get_my_intro_thumbnail()
returns table (job_id uuid, thumbnail_ms integer, share_state text, share_failure_code text, intro_duration_ms integer, intro_fps numeric)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_intro_thumbnail_impl(); $$;
create function public.set_my_intro_thumbnail(candidate_job_id uuid, candidate_thumbnail_ms integer)
returns table (thumbnail_ms integer, share_state text) language sql volatile security invoker set search_path = ''
as $$ select * from private.set_my_intro_thumbnail_impl(candidate_job_id, candidate_thumbnail_ms); $$;
create function public.get_public_intro_share(candidate_handle text)
returns table (share_path text, thumbnail_ms integer) language sql stable security invoker set search_path = ''
as $$ select * from private.get_public_intro_share_impl(candidate_handle); $$;
create function public.worker_claim_intro_share()
returns table (share_id uuid, claim_token uuid, owner_user_id uuid, job_id uuid, derivative_path text, derivative_bytes bigint, intro_duration_ms integer,
  intro_width integer, intro_height integer, intro_has_audio boolean, thumbnail_ms integer, share_path text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_claim_intro_share_impl(); $$;
create function public.worker_complete_intro_share(candidate_share_id uuid, candidate_claim_token uuid, candidate_path text, candidate_bytes bigint, candidate_width integer, candidate_height integer, candidate_duration_ms integer)
returns table (share_id uuid, state text) language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_complete_intro_share_impl(candidate_share_id, candidate_claim_token, candidate_path, candidate_bytes, candidate_width, candidate_height, candidate_duration_ms); $$;
create function public.worker_fail_intro_share(candidate_share_id uuid, candidate_claim_token uuid, candidate_code text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.worker_fail_intro_share_impl(candidate_share_id, candidate_claim_token, candidate_code); $$;
create function public.worker_intro_share_sweep(candidate_limit integer default 20)
returns table (object_path text) language sql stable security invoker set search_path = ''
as $$ select * from private.worker_intro_share_sweep_impl(candidate_limit); $$;

revoke all on function
  private.intro_share_is_current(uuid), private.intro_share_is_public(text), private.get_my_intro_thumbnail_impl(), private.set_my_intro_thumbnail_impl(uuid, integer),
  private.get_public_intro_share_impl(text), private.worker_claim_intro_share_impl(), private.worker_complete_intro_share_impl(uuid, uuid, text, bigint, integer, integer, integer),
  private.worker_fail_intro_share_impl(uuid, uuid, text), private.worker_intro_share_sweep_impl(integer),
  public.get_my_intro_thumbnail(), public.set_my_intro_thumbnail(uuid, integer), public.get_public_intro_share(text), public.worker_claim_intro_share(),
  public.worker_complete_intro_share(uuid, uuid, text, bigint, integer, integer, integer), public.worker_fail_intro_share(uuid, uuid, text), public.worker_intro_share_sweep(integer)
from public, anon, authenticated;
-- owners
grant execute on function private.get_my_intro_thumbnail_impl(), private.set_my_intro_thumbnail_impl(uuid, integer), public.get_my_intro_thumbnail(), public.set_my_intro_thumbnail(uuid, integer) to authenticated;
-- visitors: the lookup and the storage read policy's predicate
grant execute on function private.intro_share_is_current(uuid), private.intro_share_is_public(text), private.get_public_intro_share_impl(text), public.get_public_intro_share(text) to anon, authenticated;
-- the worker
grant execute on function
  private.intro_share_is_current(uuid), private.worker_claim_intro_share_impl(), private.worker_complete_intro_share_impl(uuid, uuid, text, bigint, integer, integer, integer),
  private.worker_fail_intro_share_impl(uuid, uuid, text), private.worker_intro_share_sweep_impl(integer),
  public.worker_claim_intro_share(), public.worker_complete_intro_share(uuid, uuid, text, bigint, integer, integer, integer), public.worker_fail_intro_share(uuid, uuid, text),
  public.worker_intro_share_sweep(integer)
to service_role;

-- ---------------------------------------------------------------------------------------------
-- 9. Dispatch: the same Vault-held dispatcher as the Intro / Wall video pipeline. The dispatcher accepts this table only once its updated build is deployed;
--    until then (or without configuration) a copy simply waits for the next worker run - Discord keeps the unchanged Intro meanwhile.
-- ---------------------------------------------------------------------------------------------
create or replace function private.dispatch_intro_share_copy()
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
    body := jsonb_build_object('type', 'INSERT', 'schema', 'public', 'table', 'intro_share_copies', 'record', jsonb_build_object('job_id', new.share_id, 'state', new.state)),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
revoke all on function private.dispatch_intro_share_copy() from public, anon, authenticated;

create trigger dispatch_intro_share_copy
after insert on public.intro_share_copies
for each row
when (new.state = 'pending')
execute function private.dispatch_intro_share_copy();
