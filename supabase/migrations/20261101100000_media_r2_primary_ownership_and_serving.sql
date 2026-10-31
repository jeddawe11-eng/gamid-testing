-- R2 Primary - ownership proof for existing files + revocation check for the Worker (DEC-0014; handoff §152 finding and §153; Mazen's task "GamID R2 Primary /
-- Phase 2 - Ownership Fix & Wall Lease Security", 2026-11-01). Additive to 20261030140000_media_r2_primary_registry.sql (applied; not edited). Still INERT:
-- R2 Primary is OFF and the allow-list is empty, so nothing can be registered, and no lease for a 'primary/' key is issued by anyone yet.
--
--   A. private.media_r2_register_impl: a PROMOTED landing object's ownership is proven by EITHER
--        - its usage receipt: COMPLETE, the same owner and exactly the object's size (every gateway upload since 2026-10-04), OR
--        - storage.objects.owner_id = the owner (objects stored before the gateway, and fixtures: on TESTING most existing videos have no receipt, §152),
--      and NOTHING may contradict it: a receipt of another owner, a receipt that is not COMPLETE (an upload in progress or cancelled), a COMPLETE receipt of
--      another size, or an owner_id of another user is LANDING_OWNERSHIP_CONFLICT - whichever proof also exists. A counted object with neither proof is
--      LANDING_OBJECT_NOT_OWNED. The folder must be the owner's (unchanged). Counting is unchanged: the landing object was already counted, so a promotion
--      still adds nothing whichever proof it used. Everything else in the function is exactly as in 20261030140000.
--   B. public.media_r2_object_servable(r2_key): the Worker's per-request revocation check for an R2 Primary lease. True only while the key's registry row is
--      'stored' (not pending / failed / deleting / deleted / missing). Called anonymously, like get_public_media_delivery, but only AFTER the Worker verified
--      the lease's signature; it reveals nothing but that boolean for an exact, unguessable key (two UUIDs) the caller already holds in its signed URL.
-- Rollback: create or replace private.media_r2_register_impl from 20261030140000; drop function public.media_r2_object_servable(text).

-- ---------------------------------------------------------------------------------------------
-- A. Registration with the two ownership proofs
-- ---------------------------------------------------------------------------------------------
create or replace function private.media_r2_register_impl(candidate_kind text, candidate_owner uuid, candidate_bucket text, candidate_path text, candidate_bytes bigint,
                                                          candidate_sha256 text, candidate_mime text default null)
returns table (object_id uuid, r2_key text, claim_token uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  rule record;
  landing bigint;
  landing_owner text;
  landing_found boolean := false;
  existing_receipt private.usage_uploads%rowtype;
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
  select (case when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint end), o.owner_id
    into landing, landing_owner
    from storage.objects o where o.bucket_id = candidate_bucket and o.name = candidate_path;
  landing_found := found;
  key := 'primary/' || candidate_bucket || '/' || candidate_path || '/' || new_id::text;
  if candidate_kind = 'promoted' then
    -- the landing object must exist with exactly this size
    if landing is null or landing <> candidate_bytes then raise exception using errcode = '22023', message = 'LANDING_OBJECT_MISMATCH'; end if;
    select * into existing_receipt from private.usage_uploads u where u.bucket = candidate_bucket and u.path = candidate_path;   -- unique (bucket, path)
    -- no contradicting evidence, whichever proof exists: another owner, an upload not COMPLETE, another size
    if (existing_receipt.upload_id is not null and (existing_receipt.owner_id <> candidate_owner or existing_receipt.state <> 'COMPLETE' or existing_receipt.expected_bytes <> landing))
       or (landing_owner is not null and landing_owner <> candidate_owner::text) then
      raise exception using errcode = '42501', message = 'LANDING_OWNERSHIP_CONFLICT';
    end if;
    receipt_id := existing_receipt.upload_id;   -- a COMPLETE receipt of this owner and size, or null
    -- a counted object needs one proof: its receipt, or the storage owner recorded with the object
    if rule.counted and receipt_id is null and landing_owner is distinct from candidate_owner::text then
      raise exception using errcode = '42501', message = 'LANDING_OBJECT_NOT_OWNED';
    end if;
  else
    if landing_found then raise exception using errcode = '23505', message = 'MEDIA_OBJECT_EXISTS'; end if;
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

-- ---------------------------------------------------------------------------------------------
-- B. The Worker's revocation check (anonymous, after a verified signature): is this exact key still a stored object?
-- ---------------------------------------------------------------------------------------------
create function public.media_r2_object_servable(candidate_r2_key text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select candidate_r2_key is not null and char_length(candidate_r2_key) <= 600 and left(candidate_r2_key, 8) = 'primary/'
     and exists (select 1 from private.media_objects m where m.r2_key = candidate_r2_key and m.state = 'stored' and m.r2_deleted_at is null);
$$;
revoke all on function public.media_r2_object_servable(text) from public, anon, authenticated, service_role;
grant execute on function public.media_r2_object_servable(text) to anon, authenticated, service_role;
