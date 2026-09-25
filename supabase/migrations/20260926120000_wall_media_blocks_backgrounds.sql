-- Wall media, GamID blocks and backgrounds (GamID TESTING only).
--
-- The editor's next capability set is again a COMPATIBLE extension of the Wall Document (schemaVersion is unchanged; earlier documents stay valid and mean the same):
--   - `image` element   { assetId (uuid), fit, posX, posY, opacity, radius?, alt?, aw?, ah? }   - the picture is an opaque reference to the owner's own uploaded asset
--   - `gamid` element   { block: profile|roles|games|connections, layout?, showPlaytime?, initial? }   - stores NO data, only which real GamID block to show
--   - `embed` element   { providerKey, data: { kind, id, presentation, aspect?, caption? } }   - provider adapters for YouTube, Spotify, Twitch, TikTok, Instagram, X, Discord, Steam
--   - `background`      optional on the document and on each stage: { kind: color | gradient | image, ... }
-- The database validator (a deliberate, narrow port of the JavaScript validator - see the W2 migration) is taught exactly these additions and stays synchronized with it through
-- the shared corpus / drift-guard tests and the generated transactional tests/integration/wall-w2-db.sql. Only functions are created or replaced; nothing is dropped and no
-- data is touched. Embeds store only a provider key, a content kind and a strictly patterned id (never a URL or markup): every address is rebuilt by the JavaScript adapter.

-- ---------------------------------------------------------------------------------------------
-- 1. Embed provider table (kept identical to the JavaScript adapters by a drift test)
-- ---------------------------------------------------------------------------------------------
create function private.wall_embed_specs()
returns table (provider text, kind text, id_pattern text, inline boolean)
language sql immutable set search_path = ''
as $$
  select * from (values
    ('youtube', 'video', '^[A-Za-z0-9_-]{11}$', true),
    ('youtube', 'playlist', '^[A-Za-z0-9_-]{13,64}$', true),
    ('youtube', 'channel', '^(@[A-Za-z0-9._-]{3,30}|UC[A-Za-z0-9_-]{22})$', false),
    ('spotify', 'track', '^[A-Za-z0-9]{22}$', true),
    ('spotify', 'episode', '^[A-Za-z0-9]{22}$', true),
    ('spotify', 'album', '^[A-Za-z0-9]{22}$', true),
    ('spotify', 'playlist', '^[A-Za-z0-9]{22}$', true),
    ('spotify', 'show', '^[A-Za-z0-9]{22}$', true),
    ('spotify', 'artist', '^[A-Za-z0-9]{22}$', true),
    ('twitch', 'channel', '^[A-Za-z0-9_]{3,25}$', true),
    ('twitch', 'video', '^[0-9]{5,15}$', true),
    ('twitch', 'clip', '^[A-Za-z0-9_-]{5,100}$', true),
    ('tiktok', 'video', '^[0-9]{8,25}$', true),
    ('tiktok', 'profile', '^@[A-Za-z0-9._]{2,24}$', false),
    ('instagram', 'post', '^[A-Za-z0-9_-]{5,30}$', true),
    ('instagram', 'reel', '^[A-Za-z0-9_-]{5,30}$', true),
    ('instagram', 'profile', '^[A-Za-z0-9._]{1,30}$', false),
    ('x', 'post', '^[0-9]{1,25}$', true),
    ('x', 'profile', '^[A-Za-z0-9_]{1,15}$', false),
    ('discord', 'invite', '^[A-Za-z0-9-]{2,32}$', false),
    ('steam', 'app', '^[0-9]{1,10}$', true),
    ('steam', 'profile', '^(7656119[0-9]{10}|[A-Za-z0-9_-]{2,32})$', false),
    ('steam', 'group', '^[A-Za-z0-9_-]{2,64}$', false)
  ) as specs (provider, kind, id_pattern, inline);
$$;

create function private.wall_is_pixels(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::float8 between 1 and 20000 and (v #>> '{}')::float8 = round((v #>> '{}')::float8) else false end; $$;

create function private.wall_embed_data_errors(provider_key text, data jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  spec record;
  errs text[] := array[]::text[];
begin
  select s.* into spec from private.wall_embed_specs() s
   where s.provider = provider_key and jsonb_typeof(data -> 'kind') = 'string' and s.kind = (data ->> 'kind');
  if not found then return array['INVALID_KIND']; end if;
  if jsonb_typeof(data -> 'id') is distinct from 'string' or (data ->> 'id') !~ spec.id_pattern then errs := array_append(errs, 'INVALID_ID'); end if;
  if jsonb_typeof(data -> 'presentation') is distinct from 'string' or (data ->> 'presentation') not in ('link', 'card', 'embed') or ((data ->> 'presentation') = 'embed' and not spec.inline) then
    errs := array_append(errs, 'INVALID_PRESENTATION');
  end if;
  if private.wall_is_set(data -> 'aspect') and (jsonb_typeof(data -> 'aspect') is distinct from 'string' or (data ->> 'aspect') not in ('16:9', '9:16', '1:1', '4:3', 'auto')) then
    errs := array_append(errs, 'INVALID_ASPECT');
  end if;
  if private.wall_is_set(data -> 'caption') and (jsonb_typeof(data -> 'caption') is distinct from 'string' or char_length(data ->> 'caption') > 80) then
    errs := array_append(errs, 'INVALID_CAPTION');
  end if;
  return errs;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Backgrounds
-- ---------------------------------------------------------------------------------------------
create function private.wall_background_errors(bg jsonb, scope text)
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
  elsif kind = 'image' then
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
-- 3. Element payloads: rect, embed (providers), text, image, gamid. NULL = unknown element type.
-- ---------------------------------------------------------------------------------------------
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
    if private.wall_is_set(payload -> 'radius') and not private.wall_in_range(payload -> 'radius', 0, 1000) then errs := array_append(errs, 'INVALID_RADIUS'); end if;
    if private.wall_is_set(payload -> 'alt') and (jsonb_typeof(payload -> 'alt') is distinct from 'string' or char_length(payload ->> 'alt') > 120) then errs := array_append(errs, 'INVALID_ALT'); end if;
    if (private.wall_is_set(payload -> 'aw') and not private.wall_is_pixels(payload -> 'aw')) or (private.wall_is_set(payload -> 'ah') and not private.wall_is_pixels(payload -> 'ah')) then
      errs := array_append(errs, 'INVALID_SOURCE_SIZE');
    end if;
    return errs;
  elsif element_type = 'gamid' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'block') is distinct from 'string' or (payload ->> 'block') not in ('profile', 'roles', 'games', 'connections') then errs := array_append(errs, 'INVALID_BLOCK'); end if;
    if private.wall_is_set(payload -> 'layout') and (jsonb_typeof(payload -> 'layout') is distinct from 'string' or (payload ->> 'layout') not in ('card', 'compact')) then errs := array_append(errs, 'INVALID_LAYOUT'); end if;
    if private.wall_is_set(payload -> 'showPlaytime') and jsonb_typeof(payload -> 'showPlaytime') is distinct from 'boolean' then errs := array_append(errs, 'INVALID_SHOW_PLAYTIME'); end if;
    if private.wall_is_set(payload -> 'initial') and not (private.wall_is_pixels(payload -> 'initial') and (payload ->> 'initial')::float8 between 3 and 24) then errs := array_append(errs, 'INVALID_INITIAL'); end if;
    return errs;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. The document validator, extended with the Wall-wide and per-stage background
-- ---------------------------------------------------------------------------------------------
create or replace function private.wall_document_errors(doc jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  canvas jsonb;
  canvas_w float8;
  canvas_h float8;
  stage jsonb;
  stage_id text;
  stage_ids text[] := array[]::text[];
  elem jsonb;
  elem_id text;
  elem_ids text[] := array[]::text[];
  elem_type text;
  payload_errs text[];
  code text;
  ex float8; ey float8; ew float8; eh float8;
  group_ids text[] := array[]::text[];
  group_stage_ids text[] := array[]::text[];
  group_at integer;
  gid text;
begin
  if doc is null or jsonb_typeof(doc) not in ('object', 'array') then return array['MALFORMED_DOCUMENT']; end if;
  if not (case when jsonb_typeof(doc -> 'schemaVersion') = 'number' then (doc ->> 'schemaVersion')::numeric = 1 else false end) then
    return array['UNSUPPORTED_SCHEMA_VERSION'];
  end if;

  canvas := doc -> 'canvas';
  if jsonb_typeof(canvas) is distinct from 'object' or jsonb_typeof(canvas -> 'width') is distinct from 'number' or jsonb_typeof(canvas -> 'height') is distinct from 'number' then
    errs := array_append(errs, 'INVALID_CANVAS');
  else
    canvas_w := (canvas ->> 'width')::float8;
    canvas_h := (canvas ->> 'height')::float8;
    if canvas_w <= 0 or canvas_h <= 0 then errs := array_append(errs, 'INVALID_CANVAS'); end if;
  end if;
  if jsonb_typeof(doc -> 'stages') is distinct from 'array' then
    errs := array_append(errs, 'INVALID_STAGE_COUNT');
  elsif jsonb_array_length(doc -> 'stages') < 1 then
    errs := array_append(errs, 'INVALID_STAGE_COUNT');
  end if;
  if cardinality(errs) > 0 then return errs; end if;

  if private.wall_is_set(doc -> 'background') then errs := errs || private.wall_background_errors(doc -> 'background', 'wall'); end if;

  for stage in select s.value from jsonb_array_elements(doc -> 'stages') as s loop
    if jsonb_typeof(stage) is distinct from 'object' or jsonb_typeof(stage -> 'id') is distinct from 'string' or (stage ->> 'id') = '' then
      errs := array_append(errs, 'INVALID_STAGE_ID');
      continue;
    end if;
    stage_id := stage ->> 'id';
    if stage_id = any (stage_ids) then errs := array_append(errs, 'DUPLICATE_STAGE_ID:' || stage_id); end if;
    stage_ids := array_append(stage_ids, stage_id);
    if private.wall_is_set(stage -> 'background') then errs := errs || private.wall_background_errors(stage -> 'background', stage_id); end if;
    if jsonb_typeof(stage -> 'elements') is distinct from 'array' then
      errs := array_append(errs, 'INVALID_STAGE_ELEMENTS:' || stage_id);
      continue;
    end if;

    for elem in select e.value from jsonb_array_elements(stage -> 'elements') as e loop
      case jsonb_typeof(elem)
        when 'object' then null;
        when 'array' then errs := array_append(errs, 'INVALID_ELEMENT_ID'); continue;
        else errs := array_append(errs, 'MALFORMED_ELEMENT'); continue;
      end case;
      if jsonb_typeof(elem -> 'id') is distinct from 'string' or (elem ->> 'id') = '' then
        errs := array_append(errs, 'INVALID_ELEMENT_ID');
        continue;
      end if;
      elem_id := elem ->> 'id';

      if jsonb_typeof(elem -> 'x') is distinct from 'number' or jsonb_typeof(elem -> 'y') is distinct from 'number' then
        errs := array_append(errs, 'INVALID_POSITION:' || elem_id);
      end if;
      if jsonb_typeof(elem -> 'width') is distinct from 'number' or jsonb_typeof(elem -> 'height') is distinct from 'number' then
        errs := array_append(errs, 'INVALID_DIMENSIONS:' || elem_id);
      elsif (elem ->> 'width')::float8 <= 0 or (elem ->> 'height')::float8 <= 0 then
        errs := array_append(errs, 'INVALID_DIMENSIONS:' || elem_id);
      end if;
      if jsonb_typeof(elem -> 'z') is distinct from 'number' then errs := array_append(errs, 'INVALID_Z_ORDER:' || elem_id); end if;
      if private.wall_is_set(elem -> 'rotation') and jsonb_typeof(elem -> 'rotation') is distinct from 'number' then errs := array_append(errs, 'INVALID_ROTATION:' || elem_id); end if;
      if private.wall_is_set(elem -> 'groupId') and (jsonb_typeof(elem -> 'groupId') is distinct from 'string' or (elem ->> 'groupId') !~ '^[A-Za-z0-9_-]{1,64}$') then
        errs := array_append(errs, 'INVALID_GROUP_ID:' || elem_id);
      end if;

      elem_type := case when jsonb_typeof(elem -> 'type') = 'string' then elem ->> 'type' end;
      payload_errs := case when elem_type is null then null else private.wall_element_payload_errors(elem_type, elem -> 'payload') end;
      if payload_errs is null then
        errs := array_append(errs, 'UNKNOWN_ELEMENT_TYPE:' || elem_id);
      else
        foreach code in array payload_errs loop errs := array_append(errs, code || ':' || elem_id); end loop;
        errs := errs || private.wall_scan_unsafe(elem -> 'payload', elem_id || '.payload');
      end if;

      if elem_id = any (elem_ids) then errs := array_append(errs, 'DUPLICATE_ELEMENT_ID:' || elem_id); end if;
      elem_ids := array_append(elem_ids, elem_id);
      if private.wall_is_set(elem -> 'groupId') and jsonb_typeof(elem -> 'groupId') = 'string' and (elem ->> 'groupId') ~ '^[A-Za-z0-9_-]{1,64}$' then
        gid := elem ->> 'groupId';
        group_at := array_position(group_ids, gid);
        if group_at is null then
          group_ids := array_append(group_ids, gid);
          group_stage_ids := array_append(group_stage_ids, stage_id);
        elsif group_stage_ids[group_at] <> stage_id then
          errs := array_append(errs, 'GROUP_SPANS_STAGES:' || gid);
        end if;
      end if;
      if jsonb_typeof(elem -> 'x') = 'number' and jsonb_typeof(elem -> 'y') = 'number' and jsonb_typeof(elem -> 'width') = 'number' and jsonb_typeof(elem -> 'height') = 'number' then
        ex := (elem ->> 'x')::float8; ey := (elem ->> 'y')::float8; ew := (elem ->> 'width')::float8; eh := (elem ->> 'height')::float8;
        if ex < 0 or ey < 0 or ex + ew > canvas_w or ey + eh > canvas_h then errs := array_append(errs, 'OUTSIDE_CANVAS:' || elem_id); end if;
      end if;
    end loop;
  end loop;
  return errs;
exception when numeric_value_out_of_range then
  return array['INVALID_NUMERIC_RANGE'];
end;
$$;

revoke all on function
  private.wall_embed_specs(), private.wall_is_pixels(jsonb), private.wall_embed_data_errors(text, jsonb), private.wall_background_errors(jsonb, text),
  private.wall_element_payload_errors(text, jsonb), private.wall_document_errors(jsonb)
from public, anon, authenticated;
