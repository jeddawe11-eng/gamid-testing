-- Wall assets (GamID TESTING only): the owner's own uploaded pictures for the Wall (image elements and image backgrounds).
--
-- Reuses the established GamID storage pattern (see the avatars bucket): a PRIVATE bucket, objects under the owner's own user-id folder, RLS so only the owner can write
-- or read them, an allowlist of image types and a size cap enforced by storage itself. A small owner-only registry table records each accepted upload (type, size, pixel
-- size) so the editor can list them and the database can verify a Wall only names assets its owner really has.
--   - bucket `wall-media`: private, 5 MiB, jpeg / png / webp / avif only (no SVG: it can carry script)
--   - table wall_assets: RLS on, no client table grant; created only through register_my_wall_asset() after the object exists in the caller's folder
--   - one owner-only set of RPCs (SECURITY INVOKER wrappers over private SECURITY DEFINER implementations, authenticated only): register / list / delete
--   - saving a Wall now also requires every assetId it uses (image elements, backgrounds) to be one of the owner's assets (WALL_ASSET_NOT_FOUND); deleting an asset the saved
--     draft still uses is refused (WALL_ASSET_IN_USE) - nothing is ever deleted from under a Wall
-- Nothing here is readable by anyone else: there is no public read of wall-media (public publishing is a separate, later decision). Additive only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall-media', 'wall-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload wall media to their folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'wall-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users read their wall media"
on storage.objects for select to authenticated
using (bucket_id = 'wall-media' and owner_id = (select auth.uid()::text));

create policy "users delete their wall media"
on storage.objects for delete to authenticated
using (bucket_id = 'wall-media' and owner_id = (select auth.uid()::text));

create table public.wall_assets (
  asset_id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null,
  width integer not null,
  height integer not null,
  created_at timestamptz not null default now(),
  constraint wall_assets_path_unique unique (storage_path),
  constraint wall_assets_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  constraint wall_assets_size check (byte_size between 1 and 5242880),
  constraint wall_assets_pixels check (width between 1 and 8192 and height between 1 and 8192)
);
create index wall_assets_entity_idx on public.wall_assets (entity_id, created_at desc);
alter table public.wall_assets enable row level security;
revoke all on table public.wall_assets from public, anon, authenticated;

-- every assetId a document uses (image payloads and backgrounds), anywhere in it
create function private.wall_document_asset_ids(doc jsonb)
returns text[]
language sql immutable set search_path = ''
as $$ select coalesce(array_agg(distinct v #>> '{}'), array[]::text[]) from jsonb_path_query(doc, '$.**.assetId') as v where jsonb_typeof(v) = 'string'; $$;

create function private.register_my_wall_asset_impl(candidate_path text, candidate_mime text, candidate_bytes integer, candidate_width integer, candidate_height integer)
returns table (asset_id uuid, storage_path text, mime_type text, byte_size integer, width integer, height integer, created_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid := private.wall_owned_entity_id();
  stored_size bigint;
begin
  if candidate_path is null or split_part(candidate_path, '/', 1) <> caller::text or candidate_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|avif)$' then
    raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_PATH';
  end if;
  if candidate_mime is null or candidate_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/avif') then raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_TYPE'; end if;
  if candidate_bytes is null or candidate_bytes < 1 or candidate_bytes > 5242880 then raise exception using errcode = '22023', message = 'WALL_ASSET_TOO_LARGE'; end if;
  if candidate_width is null or candidate_height is null or candidate_width not between 1 and 8192 or candidate_height not between 1 and 8192 then raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_SIZE'; end if;
  select (o.metadata ->> 'size')::bigint into stored_size from storage.objects o where o.bucket_id = 'wall-media' and o.name = candidate_path and o.owner_id = caller::text;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_ASSET_UPLOAD_NOT_FOUND'; end if;
  if (select count(*) from public.wall_assets a where a.entity_id = owned_entity_id) >= 60 then raise exception using errcode = '54000', message = 'WALL_ASSET_LIMIT'; end if;
  return query
  insert into public.wall_assets (entity_id, storage_path, mime_type, byte_size, width, height)
  values (owned_entity_id, candidate_path, candidate_mime, coalesce(stored_size, candidate_bytes)::integer, candidate_width, candidate_height)
  on conflict on constraint wall_assets_path_unique do update set mime_type = excluded.mime_type
  returning wall_assets.asset_id, wall_assets.storage_path, wall_assets.mime_type, wall_assets.byte_size, wall_assets.width, wall_assets.height, wall_assets.created_at;
end;
$$;

create function private.list_my_wall_assets_impl()
returns table (asset_id uuid, storage_path text, mime_type text, byte_size integer, width integer, height integer, created_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
begin
  return query
  select a.asset_id, a.storage_path, a.mime_type, a.byte_size, a.width, a.height, a.created_at
  from public.wall_assets a where a.entity_id = owned_entity_id order by a.created_at desc, a.asset_id;
end;
$$;

-- Removes the registry row and returns the storage path so the browser can delete the object with the owner's own token. Refused while the saved draft still uses it.
create function private.delete_my_wall_asset_impl(candidate_asset_id uuid)
returns table (storage_path text)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
  asset public.wall_assets%rowtype;
  in_use boolean;
begin
  select * into asset from public.wall_assets a where a.asset_id = candidate_asset_id and a.entity_id = owned_entity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_ASSET_NOT_FOUND'; end if;
  select coalesce(asset.asset_id::text = any (private.wall_document_asset_ids(d.document)), false) into in_use from public.wall_drafts d where d.entity_id = owned_entity_id;
  if coalesce(in_use, false) then raise exception using errcode = 'PT409', message = 'WALL_ASSET_IN_USE'; end if;
  delete from public.wall_assets a where a.asset_id = asset.asset_id;
  return query select asset.storage_path;
end;
$$;

create function public.register_my_wall_asset(candidate_path text, candidate_mime text, candidate_bytes integer, candidate_width integer, candidate_height integer)
returns table (asset_id uuid, storage_path text, mime_type text, byte_size integer, width integer, height integer, created_at timestamptz)
language sql volatile security invoker set search_path = ''
as $$ select * from private.register_my_wall_asset_impl(candidate_path, candidate_mime, candidate_bytes, candidate_width, candidate_height); $$;

create function public.list_my_wall_assets()
returns table (asset_id uuid, storage_path text, mime_type text, byte_size integer, width integer, height integer, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.list_my_wall_assets_impl(); $$;

create function public.delete_my_wall_asset(candidate_asset_id uuid)
returns table (storage_path text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.delete_my_wall_asset_impl(candidate_asset_id); $$;

-- Saving: unchanged rules (typed errors, W1 validation, revision check answering PT409) plus - every asset the document uses must be the owner's.
create or replace function private.save_my_wall_draft_impl(candidate_document jsonb, candidate_expected_revision bigint)
returns table (document jsonb, revision bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
  errs text[];
  missing text[];
  current_draft public.wall_drafts%rowtype;
begin
  if candidate_expected_revision is null or candidate_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'INVALID_WALL_REVISION';
  end if;
  if candidate_document is null then
    raise exception using errcode = '22023', message = 'INVALID_WALL_DOCUMENT', detail = '["MALFORMED_DOCUMENT"]';
  end if;
  if octet_length(candidate_document::text) > 1048576 then
    raise exception using errcode = '22023', message = 'WALL_DOCUMENT_TOO_LARGE';
  end if;
  errs := private.wall_document_errors(candidate_document);
  if cardinality(errs) > 0 then
    raise exception using errcode = '22023', message = 'INVALID_WALL_DOCUMENT', detail = to_jsonb(errs)::text;
  end if;
  select coalesce(array_agg(u), array[]::text[]) into missing
  from unnest(private.wall_document_asset_ids(candidate_document)) as u
  where not exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u);
  if cardinality(missing) > 0 then
    raise exception using errcode = '22023', message = 'WALL_ASSET_NOT_FOUND', detail = to_jsonb(missing)::text;
  end if;

  select * into current_draft from public.wall_drafts d where d.entity_id = owned_entity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_DRAFT_NOT_FOUND'; end if;
  if current_draft.revision <> candidate_expected_revision then
    raise exception using errcode = 'PT409', message = 'WALL_REVISION_CONFLICT', detail = current_draft.revision::text;
  end if;

  update public.wall_drafts d
  set document = candidate_document, revision = d.revision + 1, updated_at = now()
  where d.wall_draft_id = current_draft.wall_draft_id;
  return query
  select d.document, d.revision, d.created_at, d.updated_at from public.wall_drafts d where d.wall_draft_id = current_draft.wall_draft_id;
end;
$$;

revoke all on function
  private.wall_document_asset_ids(jsonb), private.register_my_wall_asset_impl(text, text, integer, integer, integer), private.list_my_wall_assets_impl(), private.delete_my_wall_asset_impl(uuid),
  public.register_my_wall_asset(text, text, integer, integer, integer), public.list_my_wall_assets(), public.delete_my_wall_asset(uuid)
from public, anon, authenticated;

grant execute on function
  private.register_my_wall_asset_impl(text, text, integer, integer, integer), private.list_my_wall_assets_impl(), private.delete_my_wall_asset_impl(uuid),
  public.register_my_wall_asset(text, text, integer, integer, integer), public.list_my_wall_assets(), public.delete_my_wall_asset(uuid)
to authenticated;
