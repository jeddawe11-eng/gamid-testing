-- Wall: MP4 + WebM media layers (Assets), Flip / edge Fade for media layers, and the "Other" text link (Media & Links) - GamID TESTING only.
--
-- Mirrors dist/wall-kit/image.js, dist/wall-kit/text.js and dist/wall-kit/gamid-data.js exactly (the shared corpus in tests/wall-w2-corpus.js +
-- tests/integration/wall-w2-db.sql keep the JS and database validators identical). Everything is ADDITIVE: every existing Wall, asset and row stays valid.
--
--   1. Storage: the private wall-video bucket also accepts video/webm (same 50 MiB limit, same owner-folder RLS).
--   2. The asset registry accepts video/webm (<= 50 MiB, <= 4096 px a side, no frame count) - the constraints are replaced, every existing row satisfies them.
--      register_verified_wall_asset (service role only, called by wall-asset-register after it has inspected the stored file) accepts <user>/<uuid>.webm in
--      wall-video; the 10-video limit counts MP4 and WebM together.
--   3. image (artwork) payload gains OPTIONAL keys:
--        media   'video' = the asset is one of the owner's videos (MP4 / WebM), shown as a muted looping video layer   INVALID_MEDIA
--                (a video is never split: media 'video' with a slice = INVALID_SLICE)
--        flipX, flipY   booleans                                                                                            INVALID_FLIP
--        fade    {left, right} each 0..50 (per cent of the width)                                                          INVALID_FADE
--   4. text payload gains OPTIONAL link {url}: an http(s) address matching the one rule in text.js LINK_URL (no user / password, no spaces, quotes or angle
--      brackets), <= 2000 characters                                                                                       INVALID_LINK
--      A live GamID Data text STYLE never carries link (INVALID_DATA_TEXT).
--   5. Saving: a VIDEO reference is a video background (kind 'video') OR a media layer (media 'video'); it must name one of the owner's video assets (MP4 or
--      WebM), and every other reference one of the owner's pictures (WALL_ASSET_KIND_MISMATCH otherwise).
-- Functions are replaced with the same signatures (grants kept); each is copied from its latest definition and changed only where the numbered notes say.
-- No table is created or dropped, no column changes, no row is written.

-- ---------------------------------------------------------------------------------------------
-- 1. Storage
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall-video', 'wall-video', false, 52428800, array['video/mp4', 'video/webm'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------------------------
-- 2. The asset registry (constraints from 20260929100000 / 20260930100000, plus video/webm)
-- ---------------------------------------------------------------------------------------------
alter table public.wall_assets drop constraint wall_assets_mime;
alter table public.wall_assets add constraint wall_assets_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/webm'));
alter table public.wall_assets drop constraint wall_assets_size;
alter table public.wall_assets add constraint wall_assets_size check (
  (mime_type not in ('video/mp4', 'video/webm') and byte_size between 1 and 5242880)
  or (mime_type = 'video/mp4' and storage_path !~ '\.h264\.mp4$' and byte_size between 1 and 52428800)
  or (mime_type = 'video/mp4' and storage_path ~ '\.h264\.mp4$' and byte_size between 1 and 209715200)
  or (mime_type = 'video/webm' and byte_size between 1 and 52428800)
);
alter table public.wall_assets drop constraint wall_assets_video_pixels;
alter table public.wall_assets add constraint wall_assets_video_pixels check (mime_type not in ('video/mp4', 'video/webm') or (width between 1 and 4096 and height between 1 and 4096 and frame_count is null));

-- copied from 20260929100000_wall_split_video_background.sql; changed: the path / type / bucket accept webm, a video is mp4 OR webm, the video limit counts both
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
  is_video boolean;
begin
  if candidate_path is null or split_part(candidate_path, '/', 1) <> candidate_owner::text or candidate_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|avif|gif|mp4|webm)$' then
    raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_PATH';
  end if;
  extension := substring(candidate_path from '\.([a-z0-9]+)$');
  is_video := extension in ('mp4', 'webm');
  bucket := case when is_video then 'wall-video' else 'wall-media' end;
  if candidate_mime is null or candidate_mime <> (case extension when 'jpg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' when 'avif' then 'image/avif' when 'gif' then 'image/gif' when 'mp4' then 'video/mp4' when 'webm' then 'video/webm' end) then
    raise exception using errcode = '22023', message = 'INVALID_WALL_ASSET_TYPE';
  end if;
  if is_video then
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
  if is_video and coalesce(stored_size, candidate_bytes) > 52428800 then raise exception using errcode = '22023', message = 'VIDEO_TOO_LARGE'; end if;
  if (select count(*) from public.wall_assets a where a.entity_id = owned_entity_id) >= 60 then raise exception using errcode = '54000', message = 'WALL_ASSET_LIMIT'; end if;
  if is_video and (select count(*) from public.wall_assets a where a.entity_id = owned_entity_id and a.mime_type in ('video/mp4', 'video/webm')) >= 10 then
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
-- 3 + 4. Payload validation
-- ---------------------------------------------------------------------------------------------
-- the ONE link address rule (dist/wall-kit/text.js LINK_URL, character for character)
create or replace function private.wall_link_ok(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select case when private.wall_keys_within(v, array['url']) and jsonb_typeof(v -> 'url') = 'string'
    then char_length(v ->> 'url') <= 2000
      and (v ->> 'url') ~ '^https?://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][A-Za-z0-9._~:/?#@!$&''()*+,;=%-]*)?$'
    else false end;
$$;

-- the edge fade of a media layer: {left, right}, each 0..50 when set
create or replace function private.wall_fade_ok(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select private.wall_keys_within(v, array['left', 'right'])
    and (not private.wall_is_set(v -> 'left') or private.wall_in_range(v -> 'left', 0, 50))
    and (not private.wall_is_set(v -> 'right') or private.wall_in_range(v -> 'right', 0, 50));
$$;

-- copied from 20260925140000_wall_editor_element_types.sql; changed: + INVALID_LINK (the optional link)
create or replace function private.wall_text_payload_errors(p jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  weight float8;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
  if jsonb_typeof(p -> 'text') is distinct from 'string' or char_length(p ->> 'text') > 2000 then errs := array_append(errs, 'INVALID_TEXT'); end if;
  if jsonb_typeof(p -> 'fontFamily') is distinct from 'string' or (p ->> 'fontFamily') !~ '^[a-z0-9][a-z0-9-]{0,39}$' then errs := array_append(errs, 'INVALID_FONT_FAMILY'); end if;
  if not private.wall_in_range(p -> 'fontSize', 4, 600) then errs := array_append(errs, 'INVALID_FONT_SIZE'); end if;
  if jsonb_typeof(p -> 'fontWeight') = 'number' then
    weight := (p ->> 'fontWeight')::float8;
    if not (weight between 100 and 900 and weight = round(weight) and mod(weight::numeric, 100) = 0) then errs := array_append(errs, 'INVALID_FONT_WEIGHT'); end if;
  else
    errs := array_append(errs, 'INVALID_FONT_WEIGHT');
  end if;
  if jsonb_typeof(p -> 'italic') is distinct from 'boolean' then errs := array_append(errs, 'INVALID_ITALIC'); end if;
  if jsonb_typeof(p -> 'underline') is distinct from 'boolean' then errs := array_append(errs, 'INVALID_UNDERLINE'); end if;
  if not private.wall_is_hex(p -> 'color') then errs := array_append(errs, 'INVALID_COLOR'); end if;
  if jsonb_typeof(p -> 'align') is distinct from 'string' or (p ->> 'align') not in ('left', 'center', 'right') then errs := array_append(errs, 'INVALID_ALIGN'); end if;
  if not private.wall_in_range(p -> 'lineHeight', 0.5, 4) then errs := array_append(errs, 'INVALID_LINE_HEIGHT'); end if;
  if not private.wall_in_range(p -> 'letterSpacing', -20, 100) then errs := array_append(errs, 'INVALID_LETTER_SPACING'); end if;
  if not private.wall_in_range(p -> 'opacity', 0, 1) then errs := array_append(errs, 'INVALID_OPACITY'); end if;
  if jsonb_typeof(p -> 'direction') is distinct from 'string' or (p ->> 'direction') not in ('ltr', 'rtl', 'auto') then errs := array_append(errs, 'INVALID_DIRECTION'); end if;
  if jsonb_typeof(p -> 'wrap') is distinct from 'boolean' then errs := array_append(errs, 'INVALID_WRAP'); end if;
  if private.wall_is_set(p -> 'fontRef') and (jsonb_typeof(p -> 'fontRef') is distinct from 'string' or char_length(p ->> 'fontRef') not between 1 and 200) then
    errs := array_append(errs, 'INVALID_FONT_REF');
  end if;
  if private.wall_is_set(p -> 'stroke') and not (jsonb_typeof(p -> 'stroke') = 'object' and private.wall_is_hex(p -> 'stroke' -> 'color') and private.wall_in_range(p -> 'stroke' -> 'width', 0, 50)) then
    errs := array_append(errs, 'INVALID_STROKE');
  end if;
  if private.wall_is_set(p -> 'shadow') and not (jsonb_typeof(p -> 'shadow') = 'object' and private.wall_is_hex(p -> 'shadow' -> 'color') and private.wall_in_range(p -> 'shadow' -> 'blur', 0, 100)
      and private.wall_in_range(p -> 'shadow' -> 'x', -100, 100) and private.wall_in_range(p -> 'shadow' -> 'y', -100, 100)) then
    errs := array_append(errs, 'INVALID_SHADOW');
  end if;
  if private.wall_is_set(p -> 'glow') and not (jsonb_typeof(p -> 'glow') = 'object' and private.wall_is_hex(p -> 'glow' -> 'color') and private.wall_in_range(p -> 'glow' -> 'blur', 0, 100)) then
    errs := array_append(errs, 'INVALID_GLOW');
  end if;
  if private.wall_is_set(p -> 'gradient') and not private.wall_is_gradient(p -> 'gradient') then errs := array_append(errs, 'INVALID_GRADIENT'); end if;
  if private.wall_is_set(p -> 'link') and not private.wall_link_ok(p -> 'link') then errs := array_append(errs, 'INVALID_LINK'); end if;
  return errs;
end;
$$;

-- copied from 20260928100000_wall_artwork_live_data.sql; changed: a text style that carries `link` is INVALID_DATA_TEXT
create or replace function private.wall_gamid_data_errors(payload jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  f text;
  allowed text[];
  look jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
  if jsonb_typeof(payload -> 'field') is distinct from 'string'
     or (payload ->> 'field') not in ('avatar', 'displayName', 'handle', 'bio', 'role', 'roles', 'game', 'games', 'connection', 'connections') then
    return array['INVALID_DATA_FIELD'];
  end if;
  f := payload ->> 'field';
  allowed := case f
    when 'avatar' then array['look']
    when 'role' then array['ref', 'text'] when 'game' then array['ref', 'text'] when 'connection' then array['ref', 'text', 'withLabel']
    when 'roles' then array['style', 'layout'] when 'connections' then array['style', 'layout'] when 'games' then array['style', 'layout', 'initial', 'showPlaytime']
    else array['text'] end;
  if not private.wall_keys_within(payload, array['field'] || allowed) then errs := array_append(errs, 'INVALID_DATA_KEY'); end if;
  if f in ('role', 'game', 'connection') then
    if not coalesce(case f
        when 'role' then jsonb_typeof(payload -> 'ref') = 'string' and (payload ->> 'ref') ~ '^(@primary|[a-z0-9_]{1,40})$'
        when 'connection' then jsonb_typeof(payload -> 'ref') = 'string' and (payload ->> 'ref') ~ '^[a-z][a-z0-9_]{1,30}$'
        else private.wall_game_ref_ok(payload -> 'ref') end, false) then
      errs := array_append(errs, 'INVALID_DATA_REF');
    end if;
  end if;
  if 'text' = any (allowed) and private.wall_is_set(payload -> 'text') and not (jsonb_typeof(payload -> 'text') = 'object' and not (payload -> 'text') ? 'text' and not (payload -> 'text') ? 'link'
      and cardinality(private.wall_text_payload_errors((payload -> 'text') || '{"text": ""}'::jsonb)) = 0) then
    errs := array_append(errs, 'INVALID_DATA_TEXT');
  end if;
  if 'look' = any (allowed) and private.wall_is_set(payload -> 'look') then
    look := payload -> 'look';
    if not (private.wall_keys_within(look, array['backdrop', 'mask', 'effects', 'blend', 'radius', 'opacity'])
        and (not private.wall_is_set(look -> 'opacity') or private.wall_in_range(look -> 'opacity', 0, 1))
        and cardinality(private.wall_artwork_look_errors(look)) = 0) then
      errs := array_append(errs, 'INVALID_DATA_LOOK');
    end if;
  end if;
  if 'withLabel' = any (allowed) and private.wall_is_set(payload -> 'withLabel') and jsonb_typeof(payload -> 'withLabel') <> 'boolean' then errs := array_append(errs, 'INVALID_DATA_WITH_LABEL'); end if;
  if 'layout' = any (allowed) and private.wall_is_set(payload -> 'layout') and (jsonb_typeof(payload -> 'layout') is distinct from 'string' or (payload ->> 'layout') not in ('card', 'compact')) then errs := array_append(errs, 'INVALID_LAYOUT'); end if;
  if 'showPlaytime' = any (allowed) and private.wall_is_set(payload -> 'showPlaytime') and jsonb_typeof(payload -> 'showPlaytime') is distinct from 'boolean' then errs := array_append(errs, 'INVALID_SHOW_PLAYTIME'); end if;
  if 'initial' = any (allowed) and private.wall_is_set(payload -> 'initial') and not (private.wall_is_pixels(payload -> 'initial') and (payload ->> 'initial')::float8 between 3 and 24) then errs := array_append(errs, 'INVALID_INITIAL'); end if;
  if 'style' = any (allowed) and private.wall_is_set(payload -> 'style') then errs := errs || private.wall_gamid_style_errors(payload -> 'style'); end if;
  return errs;
end;
$$;

-- copied from 20260928100000_wall_artwork_live_data.sql; changed: the image branch gains media / flip / fade (and a video is never a slice)
create or replace function private.wall_element_payload_errors(element_type text, payload jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  provider_key text;
  code text;
begin
  if element_type = 'rect' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'fill') is distinct from 'string' or (payload ->> 'fill') !~ '^#[0-9a-fA-F]{6}$' then errs := array_append(errs, 'INVALID_FILL'); end if;
    if private.wall_is_set(payload -> 'opacity') and not private.wall_in_range(payload -> 'opacity', 0, 1) then errs := array_append(errs, 'INVALID_OPACITY'); end if;
    if private.wall_is_set(payload -> 'stroke') and not private.wall_is_hex(payload -> 'stroke') then errs := array_append(errs, 'INVALID_STROKE'); end if;
    if private.wall_is_set(payload -> 'strokeWidth') and not private.wall_in_range(payload -> 'strokeWidth', 0, 100) then errs := array_append(errs, 'INVALID_STROKE_WIDTH'); end if;
    if private.wall_is_set(payload -> 'radius') and not private.wall_in_range(payload -> 'radius', 0, 1000) then errs := array_append(errs, 'INVALID_RADIUS'); end if;
    if private.wall_is_set(payload -> 'gradient') and not private.wall_is_gradient(payload -> 'gradient') then errs := array_append(errs, 'INVALID_GRADIENT'); end if;
    return errs;
  elsif element_type = 'embed' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'providerKey') is distinct from 'string' or (payload ->> 'providerKey') = '' then return array['INVALID_PROVIDER_KEY']; end if;
    provider_key := payload ->> 'providerKey';
    if not exists (select 1 from private.wall_embed_specs() s where s.provider = provider_key) then return array['UNSUPPORTED_PROVIDER']; end if;
    if jsonb_typeof(payload -> 'data') is distinct from 'object' then return array['PROVIDER_DATA_NOT_OBJECT']; end if;
    foreach code in array private.wall_embed_data_errors(provider_key, payload -> 'data') loop errs := array_append(errs, 'PROVIDER:' || code); end loop;
    return errs;
  elsif element_type = 'text' then
    return private.wall_text_payload_errors(payload);
  elsif element_type = 'image' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'assetId') is distinct from 'string' or (payload ->> 'assetId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then errs := array_append(errs, 'INVALID_ASSET'); end if;
    if jsonb_typeof(payload -> 'fit') is distinct from 'string' or (payload ->> 'fit') not in ('cover', 'contain', 'fill') then errs := array_append(errs, 'INVALID_FIT'); end if;
    if not (private.wall_in_range(payload -> 'posX', 0, 100) and private.wall_in_range(payload -> 'posY', 0, 100)) then errs := array_append(errs, 'INVALID_POSITION'); end if;
    if not private.wall_in_range(payload -> 'opacity', 0, 1) then errs := array_append(errs, 'INVALID_OPACITY'); end if;
    if private.wall_is_set(payload -> 'alt') and (jsonb_typeof(payload -> 'alt') is distinct from 'string' or char_length(payload ->> 'alt') > 120) then errs := array_append(errs, 'INVALID_ALT'); end if;
    if (private.wall_is_set(payload -> 'aw') and not private.wall_is_pixels(payload -> 'aw')) or (private.wall_is_set(payload -> 'ah') and not private.wall_is_pixels(payload -> 'ah')) then
      errs := array_append(errs, 'INVALID_SOURCE_SIZE');
    end if;
    errs := errs || private.wall_artwork_look_errors(payload);   -- backdrop, mask, effects, blend, radius
    if private.wall_is_set(payload -> 'crop') and not private.wall_crop_ok(payload -> 'crop') then errs := array_append(errs, 'INVALID_CROP'); end if;
    if private.wall_is_set(payload -> 'locked') and jsonb_typeof(payload -> 'locked') <> 'boolean' then errs := array_append(errs, 'INVALID_LOCKED'); end if;
    if private.wall_is_set(payload -> 'clickThrough') and jsonb_typeof(payload -> 'clickThrough') <> 'boolean' then errs := array_append(errs, 'INVALID_CLICK_THROUGH'); end if;
    if private.wall_is_set(payload -> 'media') and (payload -> 'media') is distinct from '"video"'::jsonb then errs := array_append(errs, 'INVALID_MEDIA'); end if;
    if private.wall_is_set(payload -> 'slice') and (not private.wall_slice_ok(payload -> 'slice') or (payload -> 'media') = '"video"'::jsonb) then errs := array_append(errs, 'INVALID_SLICE'); end if;
    if (private.wall_is_set(payload -> 'flipX') and jsonb_typeof(payload -> 'flipX') <> 'boolean') or (private.wall_is_set(payload -> 'flipY') and jsonb_typeof(payload -> 'flipY') <> 'boolean') then
      errs := array_append(errs, 'INVALID_FLIP');
    end if;
    if private.wall_is_set(payload -> 'fade') and not private.wall_fade_ok(payload -> 'fade') then errs := array_append(errs, 'INVALID_FADE'); end if;
    return errs;
  elsif element_type = 'gamid' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'block') is distinct from 'string' or (payload ->> 'block') not in ('profile', 'roles', 'games', 'connections') then errs := array_append(errs, 'INVALID_BLOCK'); end if;
    if private.wall_is_set(payload -> 'layout') and (jsonb_typeof(payload -> 'layout') is distinct from 'string' or (payload ->> 'layout') not in ('card', 'compact')) then errs := array_append(errs, 'INVALID_LAYOUT'); end if;
    if private.wall_is_set(payload -> 'showPlaytime') and jsonb_typeof(payload -> 'showPlaytime') is distinct from 'boolean' then errs := array_append(errs, 'INVALID_SHOW_PLAYTIME'); end if;
    if private.wall_is_set(payload -> 'initial') and not (private.wall_is_pixels(payload -> 'initial') and (payload ->> 'initial')::float8 between 3 and 24) then errs := array_append(errs, 'INVALID_INITIAL'); end if;
    if private.wall_is_set(payload -> 'style') then errs := errs || private.wall_gamid_style_errors(payload -> 'style'); end if;
    return errs;
  elsif element_type = 'gamidData' then
    return private.wall_gamid_data_errors(payload);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Saving: which references are VIDEOS (copied from 20260929100000_wall_split_video_background.sql)
-- ---------------------------------------------------------------------------------------------
-- changed: a video reference is a video background (kind 'video') or a video media layer (media 'video')
create or replace function private.wall_document_video_asset_ids(doc jsonb)
returns text[]
language sql immutable set search_path = ''
as $$ select coalesce(array_agg(distinct v #>> '{}'), array[]::text[]) from jsonb_path_query(doc, '$.** ? (@.kind == "video" || @.media == "video").assetId') as v where jsonb_typeof(v) = 'string'; $$;

create or replace function private.wall_document_picture_asset_ids(doc jsonb)
returns text[]
language sql immutable set search_path = ''
as $$ select coalesce(array_agg(distinct v #>> '{}'), array[]::text[]) from jsonb_path_query(doc, '$.** ? (exists(@.assetId) && !exists(@.kind ? (@ == "video")) && !exists(@.media ? (@ == "video"))).assetId') as v where jsonb_typeof(v) = 'string'; $$;

-- changed: a video asset is MP4 or WebM (was: MP4)
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
    where not exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u and a.mime_type in ('video/mp4', 'video/webm'))
    union all
    select u from unnest(private.wall_document_picture_asset_ids(candidate_document)) as u
    where exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u and a.mime_type in ('video/mp4', 'video/webm'))
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

revoke all on function private.wall_link_ok(jsonb), private.wall_fade_ok(jsonb) from public, anon, authenticated;
