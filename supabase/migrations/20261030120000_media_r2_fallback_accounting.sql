-- Architecture F pilot: fallback accounting + the Discord share copy's READY invariant (TESTING only; handoff §149). Budget limits are unchanged.
--   1. A fallback whose source object does not exist is 'none' (the same 404 as any non-public source) and is never counted.
--   2. A crawler request is counted by what it can actually transfer: the requested byte range of the real object, 0 for HEAD or an unsatisfiable range.
--      public-media's lease is still counted as the whole object (a lease can download all of it). The charge is serialized, so concurrent requests can't
--      overshoot the daily or monthly budget.
--   3. A READY share copy always has its object: the sweep supersedes a READY copy that is no longer current BEFORE listing its object for deletion
--      (it could otherwise become current again with no file), and existing READY copies with no object are repaired once.

-- ---------------------------------------------------------------------------------------------
-- 1. Bytes a request can transfer from an object of object_size bytes (HTTP single-range semantics, as Storage serves them)
-- ---------------------------------------------------------------------------------------------
-- null range = the whole object; a satisfiable range = its clamped length; an unsatisfiable range (start past the end, a zero suffix) = 0 (a 416);
-- anything else is ignored by the server (a 200 of the whole object), so it counts the whole object.
create function private.media_r2_range_bytes(object_size bigint, candidate_range text, candidate_head boolean)
returns bigint
language plpgsql immutable
set search_path = ''
as $$
declare
  parts text[];
  first_byte bigint;
  last_byte bigint;
begin
  if object_size is null or object_size < 1 then return 0; end if;
  if coalesce(candidate_head, false) then return 0; end if;
  if candidate_range is null then return object_size; end if;
  parts := regexp_match(candidate_range, '^\s*bytes=\s*(\d{1,18})\s*-\s*(\d{0,18})\s*$', 'i');
  if parts is not null then
    first_byte := parts[1]::bigint;
    last_byte := case when parts[2] = '' then object_size - 1 else least(parts[2]::bigint, object_size - 1) end;
    if parts[2] <> '' and parts[2]::bigint < first_byte then return object_size; end if;
    if first_byte >= object_size then return 0; end if;
    return last_byte - first_byte + 1;
  end if;
  parts := regexp_match(candidate_range, '^\s*bytes=\s*-\s*(\d{1,18})\s*$', 'i');
  if parts is not null then return least(parts[1]::bigint, object_size); end if;
  return object_size;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. The budget charge: the check and the insert under one transaction-scoped lock (the limits are the existing settings)
-- ---------------------------------------------------------------------------------------------
-- -> true when candidate_bytes fit the day and the month of candidate_day (and were recorded); false = the budget is exhausted (nothing recorded).
-- A zero-byte request records nothing and is refused only once the budget is already used up, so HEAD agrees with GET.
create function private.media_r2_fallback_charge(candidate_day date, candidate_bytes bigint)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  cfg private.media_r2_settings%rowtype;
  spent_day bigint;
  spent_month bigint;
  wanted bigint := greatest(coalesce(candidate_bytes, 0), 0);
begin
  select * into cfg from private.media_r2_settings where singleton;
  perform pg_advisory_xact_lock(hashtext('media_r2_fallback_budget'));
  select coalesce(sum(u.bytes) filter (where u.day = candidate_day), 0), coalesce(sum(u.bytes), 0)
    into spent_day, spent_month
  from private.media_r2_fallback_usage u
  where u.day >= date_trunc('month', candidate_day)::date and u.day < (date_trunc('month', candidate_day) + interval '1 month')::date;
  if spent_day + wanted > cfg.fallback_daily_bytes or spent_month + wanted > cfg.fallback_monthly_bytes
    or spent_day >= cfg.fallback_daily_bytes or spent_month >= cfg.fallback_monthly_bytes then
    return false;
  end if;
  if wanted > 0 then
    insert into private.media_r2_fallback_usage as u (day, bytes, leases) values (candidate_day, wanted, 1)
    on conflict (day) do update set bytes = u.bytes + excluded.bytes, leases = u.leases + 1;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. The delivery decision (unchanged except the fallback branch)
-- ---------------------------------------------------------------------------------------------
drop function public.get_public_media_delivery(text, text);
drop function public.public_media_delivery(text, text);
drop function private.media_r2_delivery_impl(text, text, boolean);

-- -> mode 'none' (not a public source, or its object is missing: callers answer as they do today), 'supabase', 'r2' (the replica's key and size) or 'unavailable'.
-- candidate_count: count this fallback (the caller is about to serve the source from Supabase); candidate_range / candidate_head: what is requested (null /
-- false = the whole object, as public-media's lease).
create function private.media_r2_delivery_impl(candidate_bucket text, candidate_path text, candidate_count boolean, candidate_range text, candidate_head boolean)
returns table (mode text, r2_key text, bytes bigint)
language plpgsql volatile security definer
set search_path = ''
as $$#variable_conflict use_column

declare
  cfg private.media_r2_settings%rowtype;
  owner uuid;
  replica public.media_r2_replicas%rowtype;
  size bigint;
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
  -- pilot without a ready replica: Supabase only within the fallback budget, counted by what this request can transfer from the real object
  select (o.metadata ->> 'size')::bigint into size from storage.objects o where o.bucket_id = candidate_bucket and o.name = candidate_path;
  if size is null then
    return query select 'none'::text, null::text, null::bigint; return;
  end if;
  if not private.media_r2_fallback_charge((now() at time zone 'utc')::date,
      case when candidate_count then private.media_r2_range_bytes(size, candidate_range, candidate_head) else 0 end) then
    return query select 'unavailable'::text, null::text, null::bigint; return;
  end if;
  return query select 'supabase'::text, null::text, null::bigint;
end;
$$;

-- the Worker's crawler routes (anonymous): the requested range and method of the request about to be served
create function public.get_public_media_delivery(candidate_bucket text, candidate_path text, candidate_range text default null, candidate_head boolean default false)
returns table (mode text, r2_key text, bytes bigint) language sql volatile security invoker set search_path = ''
as $$ select * from private.media_r2_delivery_impl(candidate_bucket, candidate_path, true, candidate_range, candidate_head); $$;
-- public-media (service role): a lease, counted as the whole object
create function public.public_media_delivery(candidate_bucket text, candidate_path text)
returns table (mode text, r2_key text, bytes bigint) language sql volatile security invoker set search_path = ''
as $$ select * from private.media_r2_delivery_impl(candidate_bucket, candidate_path, true, null, false); $$;

-- ---------------------------------------------------------------------------------------------
-- 4. The share-copy sweep: a READY copy that is no longer current is superseded first, in the same call, so no READY row ever outlives its object
-- ---------------------------------------------------------------------------------------------
create or replace function private.worker_intro_share_sweep_impl(candidate_limit integer)
returns table (object_path text)
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.intro_share_copies r set state = 'superseded', claim_token = null, completed_at = coalesce(r.completed_at, now()), updated_at = now()
  where r.state = 'ready' and not private.intro_share_is_current(r.share_id);
  return query
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
end;
$$;
create or replace function public.worker_intro_share_sweep(candidate_limit integer default 20)
returns table (object_path text) language sql volatile security invoker set search_path = ''
as $$ select * from private.worker_intro_share_sweep_impl(candidate_limit); $$;

-- ---------------------------------------------------------------------------------------------
-- 5. One-time repair: a READY copy whose object is gone is superseded; when it was the owner's current choice, the same frame is queued again (the dispatch
--    trigger starts the worker), so the owner's selection is kept and Discord shows the unchanged Intro until the new copy is READY.
-- ---------------------------------------------------------------------------------------------
with broken as (
  update public.intro_share_copies r set state = 'superseded', claim_token = null, completed_at = coalesce(r.completed_at, now()), updated_at = now()
  where r.state = 'ready'
    and not exists (select 1 from storage.objects o where o.bucket_id = 'intro-share-copies' and o.name = r.share_path)
  returning r.share_id, r.profile_id, r.owner_user_id, r.job_id, r.thumbnail_ms
)
insert into public.intro_share_copies (profile_id, owner_user_id, job_id, thumbnail_ms)
select b.profile_id, b.owner_user_id, b.job_id, b.thumbnail_ms
from broken b
join public.profile_intro_settings s on s.profile_id = b.profile_id
join public.intro_processing_jobs j on j.job_id = s.active_job_id
where s.active_job_id = b.job_id and s.thumbnail_job_id = b.job_id and s.thumbnail_ms = b.thumbnail_ms
  and j.state = 'ready' and j.derivative_path is not null and j.derivative_deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- 6. Privileges (as before: the impl + the anonymous lookup for the Worker; the impl + the lease wrapper for public-media). The range and charge helpers are
--    reached only through the security-definer impl: no role may call them directly.
-- ---------------------------------------------------------------------------------------------
revoke all on function
  private.media_r2_range_bytes(bigint, text, boolean), private.media_r2_fallback_charge(date, bigint),
  private.media_r2_delivery_impl(text, text, boolean, text, boolean), public.get_public_media_delivery(text, text, text, boolean), public.public_media_delivery(text, text),
  private.worker_intro_share_sweep_impl(integer), public.worker_intro_share_sweep(integer)
from public, anon, authenticated;
grant execute on function private.media_r2_delivery_impl(text, text, boolean, text, boolean), public.get_public_media_delivery(text, text, text, boolean) to anon, authenticated;
grant execute on function
  private.media_r2_delivery_impl(text, text, boolean, text, boolean), public.public_media_delivery(text, text),
  private.worker_intro_share_sweep_impl(integer), public.worker_intro_share_sweep(integer)
to service_role;
