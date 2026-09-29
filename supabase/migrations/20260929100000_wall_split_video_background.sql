-- Wall: split hardening + MP4 VIDEO BACKGROUNDS - GamID TESTING only.
--
-- 1. Split pieces (image payload `slice`) may carry three more OPTIONAL typed keys, mirroring dist/wall-kit/image.js validateSlice exactly (shared corpus):
--      src   { x, y (-20000..20000), w, h (1..20000) }  the artwork's pre-split geometry, so Remove Split restores it exactly
--      scale { w, h (1..20000) }                        "Preserve source scale": the whole artwork's size every piece is a window onto
--      cross -1..1                                      the window's offset across the cut direction
--    Pieces saved before this have none of them and stay valid.
-- 2. Background videos: a new background kind `video` with the image background's fields; the file is an MP4 in a NEW private bucket `wall-video`
--      - bucket wall-video: private, 50 MiB, video/mp4 only; owner-folder insert, owner-only read / delete (the same RLS pattern as wall-media)
--      - wall_assets: video/mp4 allowed (at most 50 MiB, at most 4096 px a side, no frame count); at most 10 videos per owner (WALL_VIDEO_LIMIT), 60 assets in all
--      - register_verified_wall_asset (service role only, called by the wall-asset-register Edge Function after it has inspected the stored MP4) accepts
--        <user>/<uuid>.mp4 in wall-video
--      - saving a Wall: a video background must name one of the owner's VIDEO assets and every other asset reference one of the owner's IMAGE assets
--        (WALL_ASSET_KIND_MISMATCH) - so a video can never be drawn as a picture or the other way round
-- Existing rows, drafts, assets and grants are unchanged; no data is touched. Functions are replaced with the same signatures (grants are kept).

-- ---------------------------------------------------------------------------------------------
-- 1. Split piece keys
-- ---------------------------------------------------------------------------------------------
create or replace function private.wall_slice_ok(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select case when private.wall_keys_within(v, array['set', 'dir', 'from', 'to', 'src', 'scale', 'cross'])
      and jsonb_typeof(v -> 'set') = 'string' and (v ->> 'set') ~ '^[A-Za-z0-9_-]{1,64}$'
      and jsonb_typeof(v -> 'dir') = 'string' and (v ->> 'dir') in ('v', 'h')
      and private.wall_in_range(v -> 'from', 0, 1) and private.wall_in_range(v -> 'to', 0, 1)
    then (v ->> 'to')::float8 - (v ->> 'from')::float8 >= 0.02 - 1e-9
      and (not private.wall_is_set(v -> 'src') or (private.wall_keys_within(v -> 'src', array['x', 'y', 'w', 'h'])
        and private.wall_in_range(v -> 'src' -> 'x', -20000, 20000) and private.wall_in_range(v -> 'src' -> 'y', -20000, 20000)
        and private.wall_in_range(v -> 'src' -> 'w', 1, 20000) and private.wall_in_range(v -> 'src' -> 'h', 1, 20000)))
      and (not private.wall_is_set(v -> 'scale') or (private.wall_keys_within(v -> 'scale', array['w', 'h'])
        and private.wall_in_range(v -> 'scale' -> 'w', 1, 20000) and private.wall_in_range(v -> 'scale' -> 'h', 1, 20000)))
      and (not private.wall_is_set(v -> 'cross') or private.wall_in_range(v -> 'cross', -1, 1))
    else false end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Background kind `video` (same fields as `image`); everything else copied unchanged from 20260926120000_wall_media_blocks_backgrounds.sql
-- ---------------------------------------------------------------------------------------------
create or replace function private.wall_background_errors(bg jsonb, scope text)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  kind text;
  code text;
  codes text[] := array[]::text[];
begin
  if bg is null or jsonb_typeof(bg) <> 'object' or jsonb_typeof(bg -> 'kind') is distinct from 'string' or (bg ->> 'kind') = '' then return array['INVALID_BACKGROUND:' || scope]; end if;
  kind := bg ->> 'kind';
  if kind = 'color' then
    if not private.wall_is_hex(bg -> 'color') then codes := array_append(codes, 'INVALID_COLOR'); end if;
  elsif kind = 'gradient' then
    if not private.wall_is_gradient(bg) then codes := array_append(codes, 'INVALID_GRADIENT'); end if;
  elsif kind in ('image', 'video') then
    if jsonb_typeof(bg -> 'assetId') is distinct from 'string' or (bg ->> 'assetId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then codes := array_append(codes, 'INVALID_ASSET'); end if;
    if jsonb_typeof(bg -> 'fit') is distinct from 'string' or (bg ->> 'fit') not in ('cover', 'contain') then codes := array_append(codes, 'INVALID_FIT'); end if;
    if not (private.wall_in_range(bg -> 'posX', 0, 100) and private.wall_in_range(bg -> 'posY', 0, 100)) then codes := array_append(codes, 'INVALID_POSITION'); end if;
    if not private.wall_in_range(bg -> 'opacity', 0, 1) then codes := array_append(codes, 'INVALID_OPACITY'); end if;
    if private.wall_is_set(bg -> 'overlay') and not (jsonb_typeof(bg -> 'overlay') = 'object' and private.wall_is_hex(bg -> 'overlay' -> 'color') and private.wall_in_range(bg -> 'overlay' -> 'opacity', 0, 1)) then
      codes := array_append(codes, 'INVALID_OVERLAY');
    end if;
  else
    return array['UNKNOWN_BACKGROUND_KIND:' || scope];
  end if;
  foreach code in array codes loop errs := array_append(errs, 'BACKGROUND:' || code || ':' || scope); end loop;
  return errs || private.wall_scan_unsafe(bg, scope || '.background');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Storage: the private wall-video bucket (owner folder, owner-only read / delete)
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall-video', 'wall-video', false, 52428800, array['video/mp4'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload wall video to their folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'wall-video' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users read their wall video"
on storage.objects for select to authenticated
using (bucket_id = 'wall-video' and owner_id = (select auth.uid()::text));

create policy "users delete their wall video"
on storage.objects for delete to authenticated
using (bucket_id = 'wall-video' and owner_id = (select auth.uid()::text));

-- ---------------------------------------------------------------------------------------------
-- 4. The asset registry accepts MP4 videos (every existing row satisfies the new constraints)
-- ---------------------------------------------------------------------------------------------
alter table public.wall_assets drop constraint wall_assets_mime;
alter table public.wall_assets add constraint wall_assets_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4'));
alter table public.wall_assets drop constraint wall_assets_size;
alter table public.wall_assets add constraint wall_assets_size check (
  (mime_type <> 'video/mp4' and byte_size between 1 and 5242880) or (mime_type = 'video/mp4' and byte_size between 1 and 52428800)
);
alter table public.wall_assets add constraint wall_assets_video_pixels check (mime_type <> 'video/mp4' or (width between 1 and 4096 and height between 1 and 4096 and frame_count is null));

create or replace function private.register_verified_wall_asset_impl(candidate_owner uuid, candidate_path text, candidate_mime text, candidate_bytes integer, candidate_width integer, candidate_height integer, candidate_frames integer)
returns table (asset_id uuid, storage_path text, mime_type text, byte_size integer, width integer, height integer, created_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_entity_for_user(candidate_owner);
  extension text;
  bucket text;
  stored_size bigint;
begin
  if candidate_path is null or split_part(candidate_path, '/', 1) <> candidate_owner::text or candidate_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|avif|gif|mp4)$' then
    raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_PATH';
  end if;
  extension := substring(candidate_path from '\.([a-z0-9]+)$');
  bucket := case when extension = 'mp4' then 'wall-video' else 'wall-media' end;
  if candidate_mime is null or candidate_mime <> (case extension when 'jpg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' when 'avif' then 'image/avif' when 'gif' then 'image/gif' when 'mp4' then 'video/mp4' end) then
    raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_TYPE';
  end if;
  if extension = 'mp4' then
    if candidate_bytes is null or candidate_bytes < 1 or candidate_bytes > 52428800 then raise exception using errcode = '22023', message = 'VIDEO_TOO_LARGE'; end if;
    if candidate_width is null or candidate_height is null or candidate_width not between 1 and 4096 or candidate_height not between 1 and 4096 then raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_SIZE'; end if;
    if candidate_frames is not null then raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_TYPE'; end if;
  else
    if candidate_bytes is null or candidate_bytes < 1 or candidate_bytes > 5242880 then raise exception using errcode = '22023', message = 'WALL_ASSET_TOO_LARGE'; end if;
    if candidate_width is null or candidate_height is null or candidate_width not between 1 and 8192 or candidate_height not between 1 and 8192 then raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_SIZE'; end if;
    if candidate_mime = 'image/gif' then
      if candidate_frames is null or candidate_frames not between 1 and 500 or candidate_width::bigint * candidate_height::bigint * candidate_frames::bigint > 50000000 then
        raise exception using errcode = '22023', message = 'GIF_TOO_COMPLEX';
      end if;
    elsif candidate_frames is not null then
      raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_TYPE';
    end if;
  end if;
  select (o.metadata ->> 'size')::bigint into stored_size from storage.objects o where o.bucket_id = bucket and o.name = candidate_path and o.owner_id = candidate_owner::text;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_ASSET_UPLOAD_NOT_FOUND'; end if;
  if extension = 'mp4' and coalesce(stored_size, candidate_bytes) > 52428800 then raise exception using errcode = '22023', message = 'VIDEO_TOO_LARGE'; end if;
  if (select count(*) from public.wall_assets a where a.entity_id = owned_entity_id) >= 60 then raise exception using errcode = '54000', message = 'WALL_ASSET_LIMIT'; end if;
  if extension = 'mp4' and (select count(*) from public.wall_assets a where a.entity_id = owned_entity_id and a.mime_type = 'video/mp4') >= 10 then
    raise exception using errcode = '54000', message = 'WALL_VIDEO_LIMIT';
  end if;
  return query
  insert into public.wall_assets (entity_id, storage_path, mime_type, byte_size, width, height, frame_count)
  values (owned_entity_id, candidate_path, candidate_mime, coalesce(stored_size, candidate_bytes)::integer, candidate_width, candidate_height, candidate_frames)
  on conflict on constraint wall_assets_path_unique do update set mime_type = excluded.mime_type
  returning wall_assets.asset_id, wall_assets.storage_path, wall_assets.mime_type, wall_assets.byte_size, wall_assets.width, wall_assets.height, wall_assets.created_at;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Saving: asset KIND per reference (copied from 20260926110000_wall_assets.sql, plus the kind check)
-- ---------------------------------------------------------------------------------------------
-- the assetIds used as a VIDEO background, and every other assetId in the document (image elements, image backgrounds)
create or replace function private.wall_document_video_asset_ids(doc jsonb)
returns text[]
language sql immutable set search_path = ''
as $$ select coalesce(array_agg(distinct v #>> '{}'), array[]::text[]) from jsonb_path_query(doc, '$.** ? (@.kind == "video").assetId') as v where jsonb_typeof(v) = 'string'; $$;

create or replace function private.wall_document_picture_asset_ids(doc jsonb)
returns text[]
language sql immutable set search_path = ''
as $$ select coalesce(array_agg(distinct v #>> '{}'), array[]::text[]) from jsonb_path_query(doc, '$.** ? (exists(@.assetId) && !exists(@.kind ? (@ == "video"))).assetId') as v where jsonb_typeof(v) = 'string'; $$;

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
  wrong_kind text[];
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
  select coalesce(array_agg(distinct x.u), array[]::text[]) into wrong_kind from (
    select u from unnest(private.wall_document_video_asset_ids(candidate_document)) as u
    where not exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u and a.mime_type = 'video/mp4')
    union all
    select u from unnest(private.wall_document_picture_asset_ids(candidate_document)) as u
    where exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u and a.mime_type = 'video/mp4')
  ) x;
  if cardinality(wrong_kind) > 0 then
    raise exception using errcode = '22023', message = 'WALL_ASSET_KIND_MISMATCH', detail = to_jsonb(wrong_kind)::text;
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

revoke all on function private.wall_document_video_asset_ids(jsonb), private.wall_document_picture_asset_ids(jsonb) from public, anon, authenticated;
