-- PROPOSED, NOT APPLIED (needs Mazen's separate authorisation): Shapes V2 database parity - GamID TESTING only.
-- To apply: copy to supabase/migrations/<timestamp>_wall_shapes_v2.sql, rehearse in a rolled-back transaction with tests/integration/wall-w2-db.sql (and the
-- invalid Shapes V2 cases added to tests/wall-w2-corpus.js at that point), apply, then record it (migration repair).
--
-- Mirrors dist/wall/shapes.js shapeFieldErrors for the optional rect fields shape / params / path / lockAspect (same error codes). Without it the database
-- already ACCEPTS and stores these fields unchanged (a rect payload has no key list), but does not check them; the painter only ever uses validated numbers.
-- Only functions change: one new helper (revoked from every API role) and private.wall_element_payload_errors with one added line. No table or row changes.
-- Rollback: restore private.wall_element_payload_errors from 20261012120000_wall_icons.sql, then drop function private.wall_shape_errors(jsonb).

create or replace function private.wall_shape_errors(p jsonb)
returns text[] language plpgsql immutable set search_path = ''
as $f$
declare
  errs text[] := array[]::text[];
  shape text := case when jsonb_typeof(p -> 'shape') = 'string' then p ->> 'shape' end;
  allowed text[];
  k text; v jsonb; pt jsonb; n int;
  ok boolean;
begin
  if private.wall_is_set(p -> 'shape') and (shape is null or shape not in ('ellipse', 'triangle', 'right-triangle', 'diamond', 'parallelogram', 'trapezoid', 'polygon', 'star', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'arrow-double', 'chevron-right', 'chevron-left', 'bubble', 'bubble-round', 'callout', 'shield', 'ribbon', 'pennant', 'tag', 'plaque', 'bolt', 'heart', 'crown', 'gem', 'plus', 'ring', 'custom')) then
    errs := array_append(errs, 'INVALID_SHAPE');
  end if;
  allowed := case shape
    when 'parallelogram' then array['cut'] when 'trapezoid' then array['cut'] when 'polygon' then array['sides'] when 'star' then array['points', 'inner']
    when 'arrow-right' then array['shaft', 'head'] when 'arrow-left' then array['shaft', 'head'] when 'arrow-up' then array['shaft', 'head'] when 'arrow-down' then array['shaft', 'head']
    when 'arrow-double' then array['shaft', 'head'] when 'chevron-right' then array['thickness'] when 'chevron-left' then array['thickness']
    when 'bubble' then array['tail'] when 'bubble-round' then array['tail'] when 'callout' then array['tail']
    when 'ribbon' then array['cut'] when 'pennant' then array['cut'] when 'tag' then array['cut'] when 'plaque' then array['cut']
    when 'plus' then array['thickness'] when 'ring' then array['thickness'] else array[]::text[] end;
  if private.wall_is_set(p -> 'params') then
    ok := jsonb_typeof(p -> 'params') = 'object';
    if ok then
      for k, v in select key, value from jsonb_each(p -> 'params') loop
        ok := ok and k = any (allowed) and case k
          when 'sides' then private.wall_in_range(v, 3, 12) and (v #>> '{}')::numeric % 1 = 0
          when 'points' then private.wall_in_range(v, 3, 16) and (v #>> '{}')::numeric % 1 = 0
          when 'inner' then private.wall_in_range(v, 0.2, 0.9) when 'shaft' then private.wall_in_range(v, 0.1, 0.9) when 'head' then private.wall_in_range(v, 0.1, 0.9)
          when 'tail' then private.wall_in_range(v, 0.05, 0.95) when 'cut' then private.wall_in_range(v, 0, 0.45) when 'thickness' then private.wall_in_range(v, 0.1, 0.9)
          else false end;
      end loop;
    end if;
    if not ok then errs := array_append(errs, 'INVALID_SHAPE_PARAMS'); end if;
  end if;
  if shape = 'custom' or private.wall_is_set(p -> 'path') then
    ok := shape = 'custom' and jsonb_typeof(p -> 'path') = 'object' and private.wall_keys_within(p -> 'path', array['closed', 'points'])
      and jsonb_typeof(p -> 'path' -> 'closed') = 'boolean' and jsonb_typeof(p -> 'path' -> 'points') = 'array';
    if ok then
      n := jsonb_array_length(p -> 'path' -> 'points');
      ok := n between (case when (p -> 'path' ->> 'closed')::boolean then 3 else 2 end) and 100;
    end if;
    if ok then
      for pt in select value from jsonb_array_elements(p -> 'path' -> 'points') loop
        ok := ok and jsonb_typeof(pt) = 'object' and private.wall_keys_within(pt, array['x', 'y', 'ix', 'iy', 'ox', 'oy'])
          and private.wall_in_range(pt -> 'x', 0, 1) and private.wall_in_range(pt -> 'y', 0, 1)
          and (pt ? 'ix') = (pt ? 'iy') and (pt ? 'ox') = (pt ? 'oy')
          and (not (pt ? 'ix') or (private.wall_in_range(pt -> 'ix', -1, 2) and private.wall_in_range(pt -> 'iy', -1, 2)))
          and (not (pt ? 'ox') or (private.wall_in_range(pt -> 'ox', -1, 2) and private.wall_in_range(pt -> 'oy', -1, 2)));
      end loop;
    end if;
    if not coalesce(ok, false) then errs := array_append(errs, 'INVALID_SHAPE_PATH'); end if;
  end if;
  if private.wall_is_set(p -> 'lockAspect') and not private.wall_in_range(p -> 'lockAspect', 0.05, 20) then errs := array_append(errs, 'INVALID_LOCK_ASPECT'); end if;
  return errs;
end;
$f$;
revoke all on function private.wall_shape_errors(jsonb) from public, anon, authenticated;

-- copied from 20261012120000_wall_icons.sql; changed ONLY: the rect branch adds private.wall_shape_errors
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
    errs := errs || private.wall_shape_errors(payload);
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
