-- My Crew as a Personal Wall GamID block - GamID TESTING only.
--
-- The 'gamid' Wall element accepts one more block, 'crews' (My Crew), exactly like the existing GamID blocks: the owner adds it to a stage in the Wall editor,
-- positions / resizes it with the normal Wall controls, and it is saved / published with the Wall. The block stores no data (only which block it is and display
-- choices); visitors see the server's public_sections.crews (20261003234309_personal_gamid_crews: PUBLIC GamID, ACTIVE membership, existing Crew, published Crew
-- Wall - no toggle). Mirrors dist/wall-kit/gamid.js GAMID_BLOCKS; the shared corpus keeps the JS and database validators identical.
--
-- Copied from 20261002150000_my_duo.sql (its latest definition); changed ONLY: the gamid block list gains 'crews'. Same signature, grants kept. No table, row or other
-- function changes.
-- Rollback: restore private.wall_element_payload_errors from 20261002150000_my_duo.sql.
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
  end if;
  return null;
end;
$$;
