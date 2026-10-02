-- Public Wall publishing - GamID TESTING only.
--
-- The Wall draft stays OWNER-PRIVATE exactly as before (public.wall_drafts, no client table privilege, owner RPCs only). Publishing COPIES the owner's saved draft
-- into a separate snapshot; visitors only ever read that snapshot, so the owner keeps editing (and saving) the draft without anything changing for visitors until
-- they publish again. Unpublish removes the snapshot, and the visitor page falls back to the existing Public Profile.
--
--   1. public.wall_publications   one published snapshot per identity (entity), never readable by a client role directly
--   2. owner RPCs                 publish_my_wall(expected revision) / unpublish_my_wall() / get_my_wall_publication()   (signed-in owner only; owner from auth.uid())
--   3. visitor RPC                get_public_wall(handle)   (anon + authenticated): the snapshot - and ONLY the assets it references - for a PUBLIC identity, with
--                                 exactly the gate the public profile uses (entity_type SOLO, visibility PUBLIC, normalized handle). Anything else: no row.
--   4. storage                    ONE additional read policy on wall-media / wall-video / wall-video-derived: an object is readable by anyone only while it is an
--                                 asset referenced by the published snapshot of a PUBLIC identity. The owner-only policies are unchanged; drafts, unpublished and
--                                 unreferenced media stay private.
--   5. asset deletion             an asset the PUBLISHED Wall uses can no longer be deleted (it would break the visitor page) - WALL_ASSET_IN_USE, as for the draft.
--
-- Additive: one new table, new functions, one new storage policy; delete_my_wall_asset_impl is replaced (same signature, one extra check). No existing row changes.
-- Rollback: drop policy "published wall media is readable" on storage.objects; drop the new functions; drop table public.wall_publications; restore
-- delete_my_wall_asset_impl from 20260926110000_wall_assets.sql.

-- ---------------------------------------------------------------------------------------------
-- 1. The published snapshot
-- ---------------------------------------------------------------------------------------------
create table public.wall_publications (
  entity_id uuid primary key references public.entities(entity_id) on delete cascade,
  document jsonb not null,
  draft_revision bigint not null,
  published_at timestamptz not null default now(),
  constraint wall_publications_revision_positive check (draft_revision >= 1),
  constraint wall_publications_document_size check (octet_length(document::text) <= 1048576),
  -- defense in depth, as for drafts: not even a direct backend write can publish a document W1 would reject
  constraint wall_publications_document_is_valid check (cardinality(private.wall_document_errors(document)) = 0)
);
comment on table public.wall_publications is 'The published snapshot of an identity''s Wall (a copy of a saved draft). Readable only through get_public_wall for a PUBLIC identity.';

alter table public.wall_publications enable row level security;
revoke all on table public.wall_publications from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Owner RPCs
-- ---------------------------------------------------------------------------------------------
-- Publishes the caller's SAVED draft. `candidate_expected_revision` is the draft revision the owner is looking at: if the saved draft has moved on (saved from
-- another tab), nothing is published (WALL_REVISION_CONFLICT) - the owner never publishes a version they have not seen.
create function private.publish_my_wall_impl(candidate_expected_revision bigint)
returns table (draft_revision bigint, published_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
  draft public.wall_drafts%rowtype;
  missing text[];
begin
  if candidate_expected_revision is null or candidate_expected_revision < 1 then raise exception using errcode = '22023', message = 'INVALID_WALL_REVISION'; end if;
  select * into draft from public.wall_drafts d where d.entity_id = owned_entity_id;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_DRAFT_NOT_FOUND'; end if;
  if draft.revision <> candidate_expected_revision then
    raise exception using errcode = 'PT409', message = 'WALL_REVISION_CONFLICT', detail = draft.revision::text;
  end if;
  -- every asset the snapshot names must still be the owner's (the draft rules guarantee it; checked again because publishing makes them public)
  select coalesce(array_agg(u), array[]::text[]) into missing
  from unnest(private.wall_document_asset_ids(draft.document)) as u
  where not exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u);
  if cardinality(missing) > 0 then raise exception using errcode = '22023', message = 'WALL_ASSET_NOT_FOUND', detail = to_jsonb(missing)::text; end if;
  return query
  insert into public.wall_publications as w (entity_id, document, draft_revision, published_at)
  values (owned_entity_id, draft.document, draft.revision, now())
  on conflict (entity_id) do update set document = excluded.document, draft_revision = excluded.draft_revision, published_at = excluded.published_at
  returning w.draft_revision, w.published_at;
end;
$$;

-- Removes the caller's published snapshot (visitors see the Public Profile again). Returns whether there was one.
create function private.unpublish_my_wall_impl()
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
begin
  delete from public.wall_publications w where w.entity_id = owned_entity_id;
  return found;
end;
$$;

-- The caller's publication status: which draft revision is published, and when (no row = not published).
create function private.get_my_wall_publication_impl()
returns table (draft_revision bigint, published_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
begin
  return query select w.draft_revision, w.published_at from public.wall_publications w where w.entity_id = owned_entity_id;
end;
$$;

create function public.publish_my_wall(candidate_expected_revision bigint)
returns table (draft_revision bigint, published_at timestamptz)
language sql volatile security invoker set search_path = ''
as $$ select * from private.publish_my_wall_impl(candidate_expected_revision); $$;

create function public.unpublish_my_wall()
returns boolean
language sql volatile security invoker set search_path = ''
as $$ select private.unpublish_my_wall_impl(); $$;

create function public.get_my_wall_publication()
returns table (draft_revision bigint, published_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_wall_publication_impl(); $$;

-- ---------------------------------------------------------------------------------------------
-- 3. The visitor RPC
-- ---------------------------------------------------------------------------------------------
-- The published snapshot of a PUBLIC identity (the public profile's own gate), with the storage location of ONLY the assets that snapshot references (so the
-- visitor page can load them through the read policy below). Unknown, private and unpublished handles all return no row - indistinguishable.
create function private.get_public_wall_impl(candidate_handle text)
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
  limit 1;
$$;

create function public.get_public_wall(candidate_handle text)
returns table (document jsonb, published_at timestamptz, assets jsonb)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_public_wall_impl(candidate_handle); $$;

-- ---------------------------------------------------------------------------------------------
-- 4. Storage: published Wall media only
-- ---------------------------------------------------------------------------------------------
-- True only for an object that IS an asset referenced by the published snapshot of a PUBLIC identity, in the bucket that asset lives in.
create function private.wall_object_is_published(candidate_bucket text, candidate_path text)
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
      and a.asset_id::text = any (private.wall_document_asset_ids(w.document))
      and candidate_bucket = case
        when a.mime_type = 'video/mp4' and a.storage_path ~ '\.h264\.mp4$' then 'wall-video-derived'
        when a.mime_type in ('video/mp4', 'video/webm') then 'wall-video'
        else 'wall-media' end
  );
$$;

create policy "published wall media is readable"
on storage.objects for select to anon, authenticated
using (bucket_id in ('wall-media', 'wall-video', 'wall-video-derived') and private.wall_object_is_published(bucket_id, name));

-- ---------------------------------------------------------------------------------------------
-- 5. Asset deletion: refused while the saved draft OR the published Wall uses it (copied from 20260926110000_wall_assets.sql, plus the published check)
-- ---------------------------------------------------------------------------------------------
create or replace function private.delete_my_wall_asset_impl(candidate_asset_id uuid)
returns table (storage_path text)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
  asset public.wall_assets%rowtype;
  in_use boolean;
  in_published boolean;
begin
  select * into asset from public.wall_assets a where a.asset_id = candidate_asset_id and a.entity_id = owned_entity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_ASSET_NOT_FOUND'; end if;
  select coalesce(asset.asset_id::text = any (private.wall_document_asset_ids(d.document)), false) into in_use from public.wall_drafts d where d.entity_id = owned_entity_id;
  select coalesce(asset.asset_id::text = any (private.wall_document_asset_ids(w.document)), false) into in_published from public.wall_publications w where w.entity_id = owned_entity_id;
  if coalesce(in_use, false) or coalesce(in_published, false) then raise exception using errcode = 'PT409', message = 'WALL_ASSET_IN_USE'; end if;
  delete from public.wall_assets a where a.asset_id = asset.asset_id;
  return query select asset.storage_path;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: owner RPCs for signed-in users; the visitor RPC and the storage check for anon + authenticated; nothing else.
-- ---------------------------------------------------------------------------------------------
revoke all on function
  private.publish_my_wall_impl(bigint), private.unpublish_my_wall_impl(), private.get_my_wall_publication_impl(),
  public.publish_my_wall(bigint), public.unpublish_my_wall(), public.get_my_wall_publication(),
  private.get_public_wall_impl(text), public.get_public_wall(text), private.wall_object_is_published(text, text)
from public, anon, authenticated;

grant execute on function
  private.publish_my_wall_impl(bigint), private.unpublish_my_wall_impl(), private.get_my_wall_publication_impl(),
  public.publish_my_wall(bigint), public.unpublish_my_wall(), public.get_my_wall_publication()
to authenticated;

grant execute on function private.get_public_wall_impl(text), public.get_public_wall(text), private.wall_object_is_published(text, text) to anon, authenticated;
