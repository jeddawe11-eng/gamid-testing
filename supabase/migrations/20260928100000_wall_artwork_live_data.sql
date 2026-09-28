-- Wall Round 3: the ARTWORK engine + LIVE GamID DATA elements - GamID TESTING only.
--
-- Mirrors dist/wall-kit/image.js and dist/wall-kit/gamid-data.js exactly (the shared corpus in tests/wall-w2-corpus.js + tests/integration/wall-w2-db.sql keep them
-- identical). Typed, allowlisted data only - never CSS, HTML, script or an address:
--   image (artwork) gains OPTIONAL keys - a Wall saved before this is unchanged and still valid:
--     backdrop  'none' | #rrggbb                                  INVALID_BACKDROP
--     crop      {x, y, w, h, preset}  fractions of the source      INVALID_CROP     (x,y 0..1; w,h 0.02..1; x+w, y+h <= 1; preset free|original|1:1|16:9|9:16)
--     mask      circle | rounded | hexagon | diamond               INVALID_MASK
--     effects   {shadow{color,blur,x,y}, glow{color,blur}, blur 0..40, brightness 0..2, contrast 0..2, saturation 0..3}   INVALID_EFFECTS (blur 0..100, x/y -100..100)
--     blend     normal | screen | multiply | overlay | soft-light  INVALID_BLEND
--     locked, clickThrough   booleans                              INVALID_LOCKED, INVALID_CLICK_THROUGH
--     slice     {set, dir, from, to}  one piece of a split artwork INVALID_SLICE    (set ^[A-Za-z0-9_-]{1,64}$, dir v|h, from/to 0..1, to - from >= 0.02)
--   gamidData (new element type): a BINDING to the owner's live GamID data - it stores which field (and, for one item, a reference), never the data itself.
--     field avatar|displayName|handle|bio|role|roles|game|games|connection|connections   INVALID_DATA_FIELD (nothing else is inspected)
--     keys allowed per field (anything else: INVALID_DATA_KEY); ref (role key or '@primary' / normalised game name / provider key): INVALID_DATA_REF;
--     text = a complete Text style without `text` (the Text validator): INVALID_DATA_TEXT; look = the artwork look + opacity: INVALID_DATA_LOOK;
--     withLabel boolean: INVALID_DATA_WITH_LABEL; collections: layout / showPlaytime / initial / style exactly as the GamID block.
-- Only functions change: new pure helpers, and private.wall_element_payload_errors is replaced (create or replace, same signature) with the image branch
-- extended and a gamidData branch added; every other branch is copied unchanged from 20260927120000_wall_gamid_block_style.sql. No table, grant, RLS or data change.

create or replace function private.wall_keys_within(v jsonb, allowed text[])
returns boolean language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(v) = 'object' then not exists (select 1 from jsonb_object_keys(v) k where k <> all (allowed)) else false end; $$;

create or replace function private.wall_effects_ok(v jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  k text;
  x jsonb;
begin
  if v is null or jsonb_typeof(v) <> 'object' then return false; end if;
  for k, x in select e.key, e.value from jsonb_each(v) as e loop
    if k not in ('shadow', 'glow', 'blur', 'brightness', 'contrast', 'saturation') then return false; end if;
    if not private.wall_is_set(x) then continue; end if;
    if k = 'shadow' and not (private.wall_keys_within(x, array['color', 'blur', 'x', 'y']) and private.wall_is_hex(x -> 'color') and private.wall_in_range(x -> 'blur', 0, 100)
        and private.wall_in_range(x -> 'x', -100, 100) and private.wall_in_range(x -> 'y', -100, 100)) then return false; end if;
    if k = 'glow' and not (private.wall_keys_within(x, array['color', 'blur']) and private.wall_is_hex(x -> 'color') and private.wall_in_range(x -> 'blur', 0, 100)) then return false; end if;
    if k = 'blur' and not private.wall_in_range(x, 0, 40) then return false; end if;
    if k in ('brightness', 'contrast') and not private.wall_in_range(x, 0, 2) then return false; end if;
    if k = 'saturation' and not private.wall_in_range(x, 0, 3) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.wall_crop_ok(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  -- CASE keeps the numeric casts behind the type checks (SQL does not promise left-to-right AND evaluation)
  select case when private.wall_keys_within(v, array['x', 'y', 'w', 'h', 'preset'])
      and jsonb_typeof(v -> 'preset') = 'string' and (v ->> 'preset') in ('free', 'original', '1:1', '16:9', '9:16')
      and private.wall_in_range(v -> 'x', 0, 1) and private.wall_in_range(v -> 'y', 0, 1)
      and private.wall_in_range(v -> 'w', 0.02, 1) and private.wall_in_range(v -> 'h', 0.02, 1)
    then (v ->> 'x')::float8 + (v ->> 'w')::float8 <= 1 + 1e-9 and (v ->> 'y')::float8 + (v ->> 'h')::float8 <= 1 + 1e-9
    else false end;
$$;

create or replace function private.wall_slice_ok(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select case when private.wall_keys_within(v, array['set', 'dir', 'from', 'to'])
      and jsonb_typeof(v -> 'set') = 'string' and (v ->> 'set') ~ '^[A-Za-z0-9_-]{1,64}$'
      and jsonb_typeof(v -> 'dir') = 'string' and (v ->> 'dir') in ('v', 'h')
      and private.wall_in_range(v -> 'from', 0, 1) and private.wall_in_range(v -> 'to', 0, 1)
    then (v ->> 'to')::float8 - (v ->> 'from')::float8 >= 0.02 - 1e-9
    else false end;
$$;

-- the shared picture LOOK (artwork and the live profile picture): backdrop, mask, effects, blend, radius
create or replace function private.wall_artwork_look_errors(p jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
begin
  if private.wall_is_set(p -> 'backdrop') and not (jsonb_typeof(p -> 'backdrop') = 'string' and ((p ->> 'backdrop') = 'none' or private.wall_is_hex(p -> 'backdrop'))) then errs := array_append(errs, 'INVALID_BACKDROP'); end if;
  if private.wall_is_set(p -> 'mask') and not (jsonb_typeof(p -> 'mask') = 'string' and (p ->> 'mask') in ('circle', 'rounded', 'hexagon', 'diamond')) then errs := array_append(errs, 'INVALID_MASK'); end if;
  if private.wall_is_set(p -> 'effects') and not private.wall_effects_ok(p -> 'effects') then errs := array_append(errs, 'INVALID_EFFECTS'); end if;
  if private.wall_is_set(p -> 'blend') and not (jsonb_typeof(p -> 'blend') = 'string' and (p ->> 'blend') in ('normal', 'screen', 'multiply', 'overlay', 'soft-light')) then errs := array_append(errs, 'INVALID_BLEND'); end if;
  if private.wall_is_set(p -> 'radius') and not private.wall_in_range(p -> 'radius', 0, 1000) then errs := array_append(errs, 'INVALID_RADIUS'); end if;
  return errs;
end;
$$;

-- a live game reference is the game's name exactly as dist/wall-kit/gamid-data.js gameRef() normalises it (NFKC, lower case, single spaces, trimmed, <= 120)
create or replace function private.wall_game_ref_ok(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(v) = 'string' and char_length(v #>> '{}') between 1 and 120
    then normalize(v #>> '{}', NFKC) = (v #>> '{}') and lower(v #>> '{}') = (v #>> '{}')
      and (v #>> '{}') !~ '[\t\n\u000b\f\r   -     　﻿]'
      and (v #>> '{}') !~ '  ' and (v #>> '{}') !~ '^ ' and (v #>> '{}') !~ ' $'
    else false end;
$$;

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
  if 'text' = any (allowed) and private.wall_is_set(payload -> 'text') and not (jsonb_typeof(payload -> 'text') = 'object' and not (payload -> 'text') ? 'text'
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
    if private.wall_is_set(payload -> 'slice') and not private.wall_slice_ok(payload -> 'slice') then errs := array_append(errs, 'INVALID_SLICE'); end if;
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

revoke all on function
  private.wall_keys_within(jsonb, text[]), private.wall_effects_ok(jsonb), private.wall_crop_ok(jsonb), private.wall_slice_ok(jsonb),
  private.wall_artwork_look_errors(jsonb), private.wall_game_ref_ok(jsonb), private.wall_gamid_data_errors(jsonb), private.wall_element_payload_errors(text, jsonb)
from public, anon, authenticated;
