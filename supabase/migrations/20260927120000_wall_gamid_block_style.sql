-- Wall GamID block styling (Round 2) - GamID TESTING only.
--
-- A GamID block element's payload gains ONE compatible optional property, `style`: typed presentation data only (never CSS, HTML or a URL), mirroring
-- dist/wall-kit/gamid.js validateGamidStyle exactly (the shared corpus in tests/wall-w2-corpus.js + tests/integration/wall-w2-db.sql keep the two identical):
--   enums    bgMode solid|gradient|none, chipStyle outline|filled|plain, rowStyle card|plain|divided, avatarShape circle|rounded|square, nameSize s|m|l
--   colours  bgColor, bgColor2, borderColor, headingColor, primaryColor, secondaryColor, accentColor   (#rrggbb)
--   ranges   bgAngle 0..360, bgOpacity 0..1, borderOpacity 0..1, borderWidth 0..8, radius 0..60, padding 0..60, gap 0..40   (finite numbers)
--   flags    border, showHandle   (booleans)
-- Any other key is refused (INVALID_STYLE_KEY); a JSON null value means "not set" (the default). A block without `style` - every Wall saved before this - is
-- unchanged and still valid, and keeps the accepted look.
-- Only functions change: a new pure helper, and private.wall_element_payload_errors is replaced (create or replace, same signature) with the gamid branch extended;
-- every other branch is copied unchanged from 20260926120000_wall_media_blocks_backgrounds.sql. No table, grant, RLS or data change.

create or replace function private.wall_gamid_style_errors(style jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  k text;
  v jsonb;
  ok boolean;
begin
  if style is null or jsonb_typeof(style) <> 'object' then return array['INVALID_STYLE']; end if;
  for k, v in select e.key, e.value from jsonb_each(style) as e loop
    if k not in ('bgMode', 'chipStyle', 'rowStyle', 'avatarShape', 'nameSize',
                 'bgColor', 'bgColor2', 'borderColor', 'headingColor', 'primaryColor', 'secondaryColor', 'accentColor',
                 'bgAngle', 'bgOpacity', 'borderOpacity', 'borderWidth', 'radius', 'padding', 'gap',
                 'border', 'showHandle') then
      errs := array_append(errs, 'INVALID_STYLE_KEY');
      continue;
    end if;
    if not private.wall_is_set(v) then continue; end if;
    ok := case
      when k = 'bgMode' then jsonb_typeof(v) = 'string' and (v #>> '{}') in ('solid', 'gradient', 'none')
      when k = 'chipStyle' then jsonb_typeof(v) = 'string' and (v #>> '{}') in ('outline', 'filled', 'plain')
      when k = 'rowStyle' then jsonb_typeof(v) = 'string' and (v #>> '{}') in ('card', 'plain', 'divided')
      when k = 'avatarShape' then jsonb_typeof(v) = 'string' and (v #>> '{}') in ('circle', 'rounded', 'square')
      when k = 'nameSize' then jsonb_typeof(v) = 'string' and (v #>> '{}') in ('s', 'm', 'l')
      when k in ('bgColor', 'bgColor2', 'borderColor', 'headingColor', 'primaryColor', 'secondaryColor', 'accentColor') then private.wall_is_hex(v)
      when k = 'bgAngle' then private.wall_in_range(v, 0, 360)
      when k in ('bgOpacity', 'borderOpacity') then private.wall_in_range(v, 0, 1)
      when k = 'borderWidth' then private.wall_in_range(v, 0, 8)
      when k in ('radius', 'padding') then private.wall_in_range(v, 0, 60)
      when k = 'gap' then private.wall_in_range(v, 0, 40)
      else jsonb_typeof(v) = 'boolean'
    end;
    if not coalesce(ok, false) then errs := array_append(errs, 'INVALID_STYLE_' || upper(regexp_replace(k, '([A-Z])', '_\1', 'g'))); end if;
  end loop;
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
    if private.wall_is_set(payload -> 'style') then errs := errs || private.wall_gamid_style_errors(payload -> 'style'); end if;
    return errs;
  end if;
  return null;
end;
$$;

revoke all on function private.wall_gamid_style_errors(jsonb), private.wall_element_payload_errors(text, jsonb) from public, anon, authenticated;
