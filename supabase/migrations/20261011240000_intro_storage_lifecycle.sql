-- ISS-0011 (Intro storage lifecycle), GamID TESTING only.
-- Found on TESTING (2026-10-11, owner-authorized inspection):
--   (1) failed Intro jobs never made their source cleanup-eligible, so it stayed counted forever;
--   (2) a removed Intro's derivative is deleted only when the worker next runs, which only a new queued Intro starts;
--   (3) a resumable upload that Storage refused to start kept its reservation until the 26-hour owner reconciliation.
-- This migration adds the explicit lifecycle policy and the database half of the fix; the usage-upload gateway does the rest
-- (it releases a refused start's own reservation, and its owner cleanup route also deletes that owner's due Intro files).
--
-- Historical safety: everything automatic acts only on what becomes due AFTER this migration is applied (automatic_since).
-- An Intro file or receipt that was already eligible / abandoned before it keeps its previous treatment and is never
-- cleaned by these paths without a separate decision. No Storage object, receipt or job row is changed by applying it.

create table private.storage_lifecycle_policy (
  singleton boolean primary key default true check (singleton),
  automatic_since timestamptz not null default now(),
  failed_source_retention interval not null default interval '1 hour' check (failed_source_retention >= interval '0'),
  unbound_receipt_grace interval not null default interval '15 minutes' check (unbound_receipt_grace >= interval '5 minutes')
);
comment on table private.storage_lifecycle_policy is 'ISS-0011: automatic Intro / receipt cleanup applies only to what became due since automatic_since; failed Intro sources are kept for failed_source_retention; a never-started (unbound) reservation is released after unbound_receipt_grace.';
insert into private.storage_lifecycle_policy default values;
alter table private.storage_lifecycle_policy enable row level security;
revoke all on table private.storage_lifecycle_policy from public, anon, authenticated, service_role;

-- an Intro source is due for deletion: eligible (now or earlier, and since automatic_since), not yet deleted, its job not running
create function private.intro_source_cleanup_due(j public.intro_processing_jobs)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(j.source_path is not null and j.source_deleted_at is null and j.source_cleanup_eligible_at <= now()
    and j.source_cleanup_eligible_at >= p.automatic_since and j.state not in ('pending', 'processing'), false)
  from private.storage_lifecycle_policy p where p.singleton;
$$;
-- an Intro derivative is due: eligible (since automatic_since), not yet deleted, and not any profile's active Intro
create function private.intro_derivative_cleanup_due(j public.intro_processing_jobs)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(j.derivative_path is not null and j.derivative_deleted_at is null and j.derivative_cleanup_eligible_at <= now()
    and j.derivative_cleanup_eligible_at >= p.automatic_since
    and not exists (select 1 from public.profile_intro_settings s where s.active_job_id = j.job_id), false)
  from private.storage_lifecycle_policy p where p.singleton;
$$;
-- a reservation whose resumable upload never started (never bound, so nothing can continue it), past the grace period and created since automatic_since;
-- the owner reconciliation still completes it if its object exists and releases it only when it does not
create function private.usage_receipt_unbound_due(x private.usage_uploads)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(x.state = 'ACTIVE' and x.upstream_url is null and x.created_at < now() - p.unbound_receipt_grace and x.created_at >= p.automatic_since, false)
  from private.storage_lifecycle_policy p where p.singleton;
$$;
revoke all on function private.intro_source_cleanup_due(public.intro_processing_jobs), private.intro_derivative_cleanup_due(public.intro_processing_jobs),
  private.usage_receipt_unbound_due(private.usage_uploads) from public, anon, authenticated;

-- the owner's own Intro files due for deletion (the gateway's owner cleanup route; service only)
create function private.usage_intro_cleanup_candidates(u uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(c), '[]') from (
    select j.job_id,
      case when private.intro_source_cleanup_due(j) then j.source_path end source_path,
      case when private.intro_derivative_cleanup_due(j) then j.derivative_path end derivative_path
    from public.intro_processing_jobs j
    where j.owner_user_id = u and (private.intro_source_cleanup_due(j) or private.intro_derivative_cleanup_due(j))
    order by coalesce(j.source_cleanup_eligible_at, j.derivative_cleanup_eligible_at) limit 20
  ) c;
$$;
create function public.usage_intro_cleanup_candidates(candidate_owner uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.usage_intro_cleanup_candidates(candidate_owner) $$;
revoke all on function private.usage_intro_cleanup_candidates(uuid), public.usage_intro_cleanup_candidates(uuid) from public, anon, authenticated;
grant execute on function private.usage_intro_cleanup_candidates(uuid), public.usage_intro_cleanup_candidates(uuid) to service_role;

-- the live definitions below, changed only where marked (ISS-0011); their grants are unchanged
create or replace function private.worker_fail_intro_job_impl(candidate_job_id uuid, candidate_failure_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.intro_processing_jobs set state='failed',failure_code=left(regexp_replace(coalesce(candidate_failure_code,'PROCESSING_FAILED'),'[^A-Z0-9_]','','g'),64),completed_at=now(),updated_at=now(),
    -- ISS-0011: a failed source becomes cleanup-eligible after the explicit retention (it was never released before)
    source_cleanup_eligible_at=now()+(select p.failed_source_retention from private.storage_lifecycle_policy p where p.singleton)
  where job_id=candidate_job_id and state='processing';
end;
$function$;

create or replace function private.worker_intro_cleanup_candidates_impl(candidate_limit integer DEFAULT 20)
 RETURNS TABLE(job_id uuid, source_path text, derivative_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select j.job_id,
    case when private.intro_source_cleanup_due(j) then j.source_path end,
    case when private.intro_derivative_cleanup_due(j) then j.derivative_path end
  from public.intro_processing_jobs j
  where private.intro_source_cleanup_due(j) or private.intro_derivative_cleanup_due(j)
  order by coalesce(j.source_cleanup_eligible_at,j.derivative_cleanup_eligible_at) limit greatest(1,least(candidate_limit,100));
$function$;

create or replace function private.usage_cleanup_candidates(u uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(x),'[]') from (select * from private.usage_uploads where owner_id=u and state='ACTIVE' and (created_at<now()-interval '26 hours' or private.usage_receipt_unbound_due(usage_uploads)) order by created_at limit 20)x
$function$;

create or replace function private.usage_upload_action(i uuid, u uuid, a text, v text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare x private.usage_uploads%rowtype; bytes bigint;
begin
 select * into x from private.usage_uploads where upload_id=i and owner_id=u for update;
 if not found then raise exception using errcode='42501',message='UPLOAD_NOT_OWNED'; end if;
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
