-- Universal deletion, safe orphan cleanup (Mazen's approval 2026-10-21) - GamID TESTING only.
--
-- A confirmed (or immediate) deletion removes the Wall asset ROW first (20261022100000_universal_delete_resolve.sql); the browser then deletes the FILE through the
-- usage gateway, retrying a few times. When every try fails, the file stays in the owner's folder and keeps counting toward the 200 MB. This finds such files from
-- authoritative server state and lets the owner's EXISTING gateway cleanup (POST /usage-upload/cleanup - run when Usage opens, on Intro actions and when the Wall
-- editor opens) delete them through the existing protected delete path. No new system: same route, same service-role RPC pattern as usage_font_orphans.
--
-- A Wall media object is an orphan only when ALL hold:
--   - it is in wall-media / wall-video / wall-video-derived, in the owner's own <uid>/ folder, and the owner owns it (object owner, completed receipt, or the
--     worker-written derived bucket - exactly authorize_usage_delete's ownership rule);
--   - it was created more than 1 hour ago (grace: an upload is always registered, or its conversion job created, right after it is stored);
--   - no Wall asset row names it (any owner);
--   - no upload receipt for it is ACTIVE or changed in the last hour;
--   - it is not a conversion source the conversion lifecycle still has to delete, nor an in-flight or failed conversion output (that lifecycle owns those);
--     a READY conversion's output IS a Wall asset, so it becomes an orphan only once that asset row is gone.
-- Internal renditions (wall-video-renditions) keep their own sweep and are never considered. Intro, Avatar, Banner and font files are never considered.
--
-- Bounded retries: each candidate handed to the gateway is recorded (private.usage_media_orphan_attempts); a file is tried at most 5 times, at least 15 minutes
-- apart, at most 10 per run, under the owner's usage lock (so two cleanups cannot take the same file). Right before deleting, the gateway re-checks the file
-- (authorize_wall_media_orphan_delete): the full ownership / protection check plus the orphan rule again. A record is forgotten once its file is gone.
--
-- Hardening of the existing delete check (patched in place and asserted, like the custom-fonts patch): authorize_usage_delete now refuses a file that is still a
-- registered Wall asset (WALL_ASSET_REGISTERED). Every existing caller deletes a Wall file only after its row is gone (or for a file never registered).
-- Additive otherwise. Rollback: drop the functions and the table below, and remove the WALL_ASSET_REGISTERED line from authorize_usage_delete.

-- 1. the try record (private, no client access) --------------------------------------------------------------------------------------------------------
create table private.usage_media_orphan_attempts (
  bucket text not null,
  path text not null,
  owner_id uuid not null,
  attempts integer not null default 1 check (attempts >= 1),
  last_attempt_at timestamptz not null default now(),
  primary key (bucket, path)
);
alter table private.usage_media_orphan_attempts enable row level security;
revoke all on table private.usage_media_orphan_attempts from public, anon, authenticated, service_role;

-- 2. the orphan rule ---------------------------------------------------------------------------------------------------------------------------------------
create function private.wall_media_orphan(u uuid, b text, p text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select u is not null and b in ('wall-media', 'wall-video', 'wall-video-derived') and split_part(p, '/', 1) = u::text
    and exists (select 1 from storage.objects o where o.bucket_id = b and o.name = p and o.created_at < now() - interval '1 hour'
                and (o.owner_id = u::text or private.usage_object_owned(b, p, u) or b = 'wall-video-derived'))
    and not exists (select 1 from public.wall_assets a where a.storage_path = p)
    and not exists (select 1 from private.usage_uploads x where x.bucket = b and x.path = p and (x.state = 'ACTIVE' or x.updated_at > now() - interval '1 hour'))
    and not exists (select 1 from public.wall_video_jobs j
                    where (j.source_path = p and not j.source_deleted)
                       or (j.derivative_path = p and (j.state in ('pending', 'processing') or (j.state = 'failed' and not j.derivative_deleted))));
$$;

-- 3. the gateway's two calls (service role only) ------------------------------------------------------------------------------------------------------------
-- Takes up to 10 of the owner's orphans for this cleanup run and records the try. -> [{bucket, path}]
create function private.claim_wall_media_orphans(u uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare picked jsonb;
begin
  if u is null then raise exception using errcode = '22023', message = 'OWNER_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('usage:' || u::text, 0));
  delete from private.usage_media_orphan_attempts a
  where a.owner_id = u and not exists (select 1 from storage.objects o where o.bucket_id = a.bucket and o.name = a.path);
  with candidates as (
    select o.bucket_id as bucket, o.name as path, o.created_at
    from storage.objects o
    where o.bucket_id in ('wall-media', 'wall-video', 'wall-video-derived') and split_part(o.name, '/', 1) = u::text
      and private.wall_media_orphan(u, o.bucket_id, o.name)
      and not exists (select 1 from private.usage_media_orphan_attempts a
                      where a.bucket = o.bucket_id and a.path = o.name and (a.attempts >= 5 or a.last_attempt_at > now() - interval '15 minutes'))
    order by o.created_at, o.name
    limit 10
  ), recorded as (
    insert into private.usage_media_orphan_attempts as a (bucket, path, owner_id, attempts, last_attempt_at)
    select c.bucket, c.path, u, 1, now() from candidates c
    on conflict (bucket, path) do update set attempts = a.attempts + 1, last_attempt_at = now()
    returning a.bucket, a.path
  )
  select coalesce(jsonb_agg(jsonb_build_object('bucket', r.bucket, 'path', r.path) order by r.bucket, r.path), '[]'::jsonb) into picked from recorded r;
  return picked;
end $$;

-- Right before the gateway deletes an orphan: the full existing delete check, then the orphan rule again (a file registered or reused since the claim is kept).
create function private.authorize_wall_media_orphan_delete(u uuid, b text, p text) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_usage_delete(u, b, p);
  if not private.wall_media_orphan(u, b, p) then raise exception using errcode = '55000', message = 'NOT_AN_ORPHAN'; end if;
end $$;

create function public.claim_wall_media_orphans(candidate_owner uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select private.claim_wall_media_orphans(candidate_owner) $$;
create function public.authorize_wall_media_orphan_delete(candidate_owner uuid, candidate_bucket text, candidate_path text) returns void
language sql stable security invoker set search_path = '' as $$ select private.authorize_wall_media_orphan_delete(candidate_owner, candidate_bucket, candidate_path) $$;

-- 4. the existing delete check: a registered Wall asset's file is never deleted (patched in place; the rest of the function is unchanged) -------------------------
do $$
declare original text; revised text;
begin
  original := pg_get_functiondef('private.authorize_usage_delete(uuid,text,text)'::regprocedure);
  revised := replace(original, $o$ if u is null or split_part(p,'/',1)<>u::text then raise exception 'UPLOAD_NOT_OWNED';end if;$o$,
                               $n$ if u is null or split_part(p,'/',1)<>u::text then raise exception 'UPLOAD_NOT_OWNED';end if;
 if b in ('wall-media','wall-video','wall-video-derived') and exists(select 1 from public.wall_assets a where a.storage_path=p) then raise exception 'WALL_ASSET_REGISTERED';end if;$n$);
  if revised = original or (length(revised) - length(original)) < 120 then raise exception 'USAGE_MEDIA_ORPHANS_DELETE_PATCH_FAILED'; end if;
  execute revised;
end $$;

-- 5. grants ------------------------------------------------------------------------------------------------------------------------------------------------
revoke all on function
  private.wall_media_orphan(uuid, text, text), private.claim_wall_media_orphans(uuid), private.authorize_wall_media_orphan_delete(uuid, text, text),
  public.claim_wall_media_orphans(uuid), public.authorize_wall_media_orphan_delete(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function
  private.wall_media_orphan(uuid, text, text), private.claim_wall_media_orphans(uuid), private.authorize_wall_media_orphan_delete(uuid, text, text),
  public.claim_wall_media_orphans(uuid), public.authorize_wall_media_orphan_delete(uuid, text, text)
to service_role;
