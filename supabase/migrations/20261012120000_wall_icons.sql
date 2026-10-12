-- Wall Icon display option and Icon Group (Product Memory DEC-0006; Mazen's explicit implementation authorization 2026-10-12) - GamID TESTING only.
--
-- A COMPATIBLE extension of the Wall Document (schemaVersion unchanged; every saved Wall stays valid and means the same):
--   - an `embed` may be shown as 'icon' (the platform's badge alone) - every kind of every provider, alongside its existing link / card / embed choices;
--   - a new `icons` element, an Icon Group: { items: 1..24 of { providerKey, kind, id } (checked against private.wall_embed_specs, exactly like an embed) or { url } (the
--     Other link rule, private.wall_link_ok), size? 40..400, gap? 0..200, align? left|center|right }. A platform icon stores no address (the adapter rebuilds it); an
--     Other icon stores only an address that passes the same rule as an Other text link.
-- Mirrors dist/wall-kit/embed/engine.js validateEmbedData and dist/wall-kit/icons.js validateIconsPayload; the shared corpus (tests/wall-w2-corpus.js) keeps the
-- JavaScript and database validators identical. Only functions are created or replaced (same signatures, grants kept); no table, row or other function changes.
-- Rollback: restore private.wall_embed_data_errors from 20260926120000_wall_media_blocks_backgrounds.sql and private.wall_element_payload_errors from
-- 20261004100000_wall_crews_block.sql (an `icons` element or an 'icon' embed then no longer validates, so remove them from saved Walls first).

-- copied from 20260926120000_wall_media_blocks_backgrounds.sql; changed ONLY: the presentation list gains 'icon'
create or replace function private.wall_embed_data_errors(provider_key text, data jsonb)
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
  if jsonb_typeof(data -> 'presentation') is distinct from 'string' or (data ->> 'presentation') not in ('link', 'card', 'embed', 'icon') or ((data ->> 'presentation') = 'embed' and not spec.inline) then
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

-- the Icon Group (dist/wall-kit/icons.js validateIconsPayload, code for code)
create or replace function private.wall_icons_payload_errors(p jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  item jsonb;
  ok boolean := true;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(case when jsonb_typeof(p -> 'items') = 'array' then p -> 'items' else '[]'::jsonb end) not between 1 and 24 then
    errs := array_append(errs, 'INVALID_ICON_ITEMS');
  else
    for item in select value from jsonb_array_elements(p -> 'items') loop
      if jsonb_typeof(item) = 'object' and (select count(*) from jsonb_object_keys(item)) = 1 and item ? 'url' then
        ok := ok and private.wall_link_ok(item);
      elsif private.wall_keys_within(item, array['providerKey', 'kind', 'id']) and jsonb_typeof(item -> 'providerKey') = 'string' and jsonb_typeof(item -> 'kind') = 'string' and jsonb_typeof(item -> 'id') = 'string' then
        ok := ok and exists (select 1 from private.wall_embed_specs() s where s.provider = (item ->> 'providerKey') and s.kind = (item ->> 'kind') and (item ->> 'id') ~ s.id_pattern);
      else
        ok := false;
      end if;
    end loop;
    if not ok then errs := array_append(errs, 'INVALID_ICON_ITEM'); end if;
  end if;
  if private.wall_is_set(p -> 'size') and not private.wall_in_range(p -> 'size', 40, 400) then errs := array_append(errs, 'INVALID_ICON_SIZE'); end if;
  if private.wall_is_set(p -> 'gap') and not private.wall_in_range(p -> 'gap', 0, 200) then errs := array_append(errs, 'INVALID_ICON_GAP'); end if;
  if private.wall_is_set(p -> 'align') and (jsonb_typeof(p -> 'align') is distinct from 'string' or (p ->> 'align') not in ('left', 'center', 'right')) then errs := array_append(errs, 'INVALID_ICON_ALIGN'); end if;
  return errs;
end;
$$;

-- copied from 20261004100000_wall_crews_block.sql (its latest definition); changed ONLY: the new `icons` element type
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
    if jsonb_typeof(payload -> 'block') is distinct from 'string' or (payload ->> 'block') not in ('profile', 'roles', 'games', 'connections', 'duo', 'crews') then errs := array_append(errs, 'INVALID_BLOCK'); end if;
    if private.wall_is_set(payload -> 'layout') and (jsonb_typeof(payload -> 'layout') is distinct from 'string' or (payload ->> 'layout') not in ('card', 'compact')) then errs := array_append(errs, 'INVALID_LAYOUT'); end if;
    if private.wall_is_set(payload -> 'showPlaytime') and jsonb_typeof(payload -> 'showPlaytime') is distinct from 'boolean' then errs := array_append(errs, 'INVALID_SHOW_PLAYTIME'); end if;
    if private.wall_is_set(payload -> 'initial') and not (private.wall_is_pixels(payload -> 'initial') and (payload ->> 'initial')::float8 between 3 and 24) then errs := array_append(errs, 'INVALID_INITIAL'); end if;
    if private.wall_is_set(payload -> 'style') then errs := errs || private.wall_gamid_style_errors(payload -> 'style'); end if;
    return errs;
  elsif element_type = 'gamidData' then
    return private.wall_gamid_data_errors(payload);
  elsif element_type = 'icons' then
    return private.wall_icons_payload_errors(payload);
  end if;
  return null;
end;
$$;

revoke all on function private.wall_icons_payload_errors(jsonb) from public, anon, authenticated;
