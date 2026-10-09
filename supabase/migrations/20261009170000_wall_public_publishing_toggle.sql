-- Enable / Disable My Wall (Profile Editor) - GamID TESTING only.
--
-- The owner can hide their PUBLISHED Wall so visitors see the Classic Profile instead, and show it again later exactly as it was. This is NOT unpublishing:
-- the published snapshot (document, revision, referenced assets) is kept untouched; only a visibility flag on it changes. The GamID's own Publish / Unpublish
-- (entities.visibility) is independent and unchanged.
--
--   1. wall_publications.is_enabled   new, NOT NULL DEFAULT true: every existing published Wall stays enabled (backward compatible, no data rewritten)
--   2. the visitor read path           the published snapshot is returned only while it is enabled (same PUBLIC / SOLO / handle gate as before); a disabled Wall
--                                      returns no row, so the visitor page shows the Classic Profile - the server decides, never the browser
--   3. published media                 the public read policy follows the same rule: a disabled Wall's media is not publicly readable
--   4. owner RPCs                      get_my_wall_visibility() / set_my_wall_enabled(boolean): the caller's OWN publication only (owner from auth.uid()); enabling
--                                      or disabling a Wall that was never published is refused (WALL_NOT_PUBLISHED) - nothing unpublished is ever exposed
-- Publishing again (the Wall editor's Publish) updates only the document / revision / time, so the owner's enabled or disabled choice is kept. Unpublishing still
-- removes the snapshot (and with it the choice). Rollback: alter table public.wall_publications drop column is_enabled; restore the two replaced functions from
-- 20261002120000_wall_public_publishing.sql; drop the two new owner RPC pairs.

alter table public.wall_publications add column is_enabled boolean not null default true;
comment on column public.wall_publications.is_enabled is 'Owner choice (Profile Editor: Enable / Disable My Wall). false = visitors see the Classic Profile; the snapshot is kept.';

-- 2. the visitor read path: unchanged except "and w.is_enabled"
create or replace function private.get_public_wall_impl(candidate_handle text)
returns table (document jsonb, published_at timestamptz, assets jsonb)
language sql stable security definer
set search_path = ''
as $$
  select w.document, w.published_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('asset_id', a.asset_id, 'storage_path', a.storage_path, 'mime_type', a.mime_type, 'width', a.width, 'height', a.height) order by a.asset_id)
      from public.wall_assets a
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

-- 3. published media: unchanged except "and w.is_enabled"
create or replace function private.wall_object_is_published(candidate_bucket text, candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wall_assets a
    join public.wall_publications w on w.entity_id = a.entity_id
    join public.entities e on e.entity_id = a.entity_id
    where a.storage_path = candidate_path
      and e.entity_type = 'SOLO'
      and e.visibility = 'PUBLIC'
      and w.is_enabled
      and a.asset_id::text = any (private.wall_document_asset_ids(w.document))
      and candidate_bucket = case
        when a.mime_type = 'video/mp4' and a.storage_path ~ '\.h264\.mp4$' then 'wall-video-derived'
        when a.mime_type in ('video/mp4', 'video/webm') then 'wall-video'
        else 'wall-media' end
  );
$$;

-- 4. owner RPCs
-- The caller's Wall visibility: always one row - whether a Wall is published, whether it is shown, and which revision / when.
create function private.get_my_wall_visibility_impl()
returns table (published boolean, is_enabled boolean, draft_revision bigint, published_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
begin
  return query
  select (w.entity_id is not null), coalesce(w.is_enabled, false), w.draft_revision, w.published_at
  from (select 1) one
  left join public.wall_publications w on w.entity_id = owned_entity_id;
end;
$$;

-- Shows or hides the caller's OWN published Wall. Only the flag changes; the snapshot is never touched. No published Wall -> WALL_NOT_PUBLISHED.
create function private.set_my_wall_enabled_impl(candidate_enabled boolean)
returns table (published boolean, is_enabled boolean, draft_revision bigint, published_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
begin
  if candidate_enabled is null then raise exception using errcode = '22023', message = 'INVALID_WALL_VISIBILITY'; end if;
  update public.wall_publications w set is_enabled = candidate_enabled where w.entity_id = owned_entity_id;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_NOT_PUBLISHED'; end if;
  return query select true, w.is_enabled, w.draft_revision, w.published_at from public.wall_publications w where w.entity_id = owned_entity_id;
end;
$$;

create function public.get_my_wall_visibility()
returns table (published boolean, is_enabled boolean, draft_revision bigint, published_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_wall_visibility_impl(); $$;

create function public.set_my_wall_enabled(candidate_enabled boolean)
returns table (published boolean, is_enabled boolean, draft_revision bigint, published_at timestamptz)
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_my_wall_enabled_impl(candidate_enabled); $$;

-- privileges: the two owner RPC pairs for signed-in users only; the replaced functions keep their existing grants (create or replace keeps them)
revoke all on function
  private.get_my_wall_visibility_impl(), private.set_my_wall_enabled_impl(boolean), public.get_my_wall_visibility(), public.set_my_wall_enabled(boolean)
from public, anon, authenticated;
grant execute on function
  private.get_my_wall_visibility_impl(), private.set_my_wall_enabled_impl(boolean), public.get_my_wall_visibility(), public.set_my_wall_enabled(boolean)
to authenticated;
