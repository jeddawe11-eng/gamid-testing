-- Wall assets: GIF support and SERVER-SIDE content validation (GamID TESTING only).
--
-- Until now an upload was registered by the browser (public.register_my_wall_asset) with a type and a pixel size the BROWSER claimed; storage itself only checks the
-- claimed Content-Type header. From this migration on, an asset is registered ONLY by the wall-asset-register Edge Function, which reads the stored bytes itself,
-- recognises the real format from its signature (JPEG, PNG, WebP, AVIF, GIF - never SVG or anything else), reads the real pixel size, counts a GIF's frames, enforces
-- the limits, deletes anything that fails, and then calls public.register_verified_wall_asset() as service_role. The database re-checks every value again here.
--   - bucket wall-media: image/gif added to the allowed types (5 MiB cap unchanged; still private; still owner-folder RLS)
--   - wall_assets: image/gif allowed; optional frame_count (GIF) with the decode-cost limits below; existing rows are unchanged and stay valid
--   - GIF limits (decode cost, not just file size): at most 500 frames and at most 50,000,000 frame-pixels (width x height x frames)
--   - public.register_verified_wall_asset(): service_role only. public.register_my_wall_asset(): no longer executable by clients (the function is kept, not dropped)
-- Nothing is dropped and no data is touched.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
where id = 'wall-media';

alter table public.wall_assets drop constraint wall_assets_mime;
alter table public.wall_assets add constraint wall_assets_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'));
alter table public.wall_assets add column frame_count integer;
alter table public.wall_assets add constraint wall_assets_frames check (
  frame_count is null
  or (mime_type = 'image/gif' and frame_count between 1 and 500 and width::bigint * height::bigint * frame_count::bigint <= 50000000)
);

-- the owner's SOLO identity for a GIVEN user (the Edge Function acts for the user its token proved; auth.uid() is not that user inside a service_role call)
create function private.wall_entity_for_user(candidate_user uuid)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  owned_entity_id uuid;
begin
  if candidate_user is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = candidate_user and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;
  return owned_entity_id;
end;
$$;

create function private.register_verified_wall_asset_impl(candidate_owner uuid, candidate_path text, candidate_mime text, candidate_bytes integer, candidate_width integer, candidate_height integer, candidate_frames integer)
returns table (asset_id uuid, storage_path text, mime_type text, byte_size integer, width integer, height integer, created_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_entity_for_user(candidate_owner);
  extension text;
  stored_size bigint;
begin
  if candidate_path is null or split_part(candidate_path, '/', 1) <> candidate_owner::text or candidate_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|avif|gif)$' then
    raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_PATH';
  end if;
  extension := substring(candidate_path from '\.([a-z]+)$');
  if candidate_mime is null or candidate_mime <> (case extension when 'jpg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' when 'avif' then 'image/avif' when 'gif' then 'image/gif' end) then
    raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_TYPE';
  end if;
  if candidate_bytes is null or candidate_bytes < 1 or candidate_bytes > 5242880 then raise exception using errcode = '22023', message = 'WALL_ASSET_TOO_LARGE'; end if;
  if candidate_width is null or candidate_height is null or candidate_width not between 1 and 8192 or candidate_height not between 1 and 8192 then raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_SIZE'; end if;
  if candidate_mime = 'image/gif' then
    if candidate_frames is null or candidate_frames not between 1 and 500 or candidate_width::bigint * candidate_height::bigint * candidate_frames::bigint > 50000000 then
      raise exception using errcode = '22023', message = 'GIF_TOO_COMPLEX';
    end if;
  elsif candidate_frames is not null then
    raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_TYPE';
  end if;
  select (o.metadata ->> 'size')::bigint into stored_size from storage.objects o where o.bucket_id = 'wall-media' and o.name = candidate_path and o.owner_id = candidate_owner::text;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_ASSET_UPLOAD_NOT_FOUND'; end if;
  if (select count(*) from public.wall_assets a where a.entity_id = owned_entity_id) >= 60 then raise exception using errcode = '54000', message = 'WALL_ASSET_LIMIT'; end if;
  return query
  insert into public.wall_assets (entity_id, storage_path, mime_type, byte_size, width, height, frame_count)
  values (owned_entity_id, candidate_path, candidate_mime, coalesce(stored_size, candidate_bytes)::integer, candidate_width, candidate_height, candidate_frames)
  on conflict on constraint wall_assets_path_unique do update set mime_type = excluded.mime_type
  returning wall_assets.asset_id, wall_assets.storage_path, wall_assets.mime_type, wall_assets.byte_size, wall_assets.width, wall_assets.height, wall_assets.created_at;
end;
$$;

create function public.register_verified_wall_asset(candidate_owner uuid, candidate_path text, candidate_mime text, candidate_bytes integer, candidate_width integer, candidate_height integer, candidate_frames integer)
returns table (asset_id uuid, storage_path text, mime_type text, byte_size integer, width integer, height integer, created_at timestamptz)
language sql volatile security invoker set search_path = ''
as $$ select * from private.register_verified_wall_asset_impl(candidate_owner, candidate_path, candidate_mime, candidate_bytes, candidate_width, candidate_height, candidate_frames); $$;

revoke all on function
  private.wall_entity_for_user(uuid),
  private.register_verified_wall_asset_impl(uuid, text, text, integer, integer, integer, integer),
  public.register_verified_wall_asset(uuid, text, text, integer, integer, integer, integer)
from public, anon, authenticated;
grant execute on function
  private.register_verified_wall_asset_impl(uuid, text, text, integer, integer, integer, integer),
  public.register_verified_wall_asset(uuid, text, text, integer, integer, integer, integer)
to service_role;

-- the browser can no longer register an upload with values it claims itself; only the verifying Edge Function can (the function stays for history, unreachable)
revoke execute on function public.register_my_wall_asset(text, text, integer, integer, integer), private.register_my_wall_asset_impl(text, text, integer, integer, integer) from authenticated;
