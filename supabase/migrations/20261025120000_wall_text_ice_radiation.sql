-- Pro Effects: Living Ice V5 and Living Radiation V1 on Wall text (Mazen's task "GamID Pro Effects Integration", 2026-10-25) - GamID TESTING only.
--
-- A COMPATIBLE, ADDITIVE extension of the Wall Document (schemaVersion unchanged; every saved and published Wall stays valid and means exactly the same), in the same
-- shape as Living Fire's (20261019100000): a text element may carry an optional
--   ice       { preset: glacier|arctic|deep, base, frostColor, shadow, highlight: #rrggbb, depth 0.3..2.2, transparency 0..1, frost 0..1, density 0..1,
--               size 0.55..1.2, scattering 0..2, roughness 0..1 }                                                  (the Living Ice V5 material profile)
--   radiation { style: reactor|meltdown|phantom, color: green|yellow|orange|red|magenta|purple|blue|cyan|lime|white|custom, customColor: #rrggbb,
--               waveform: geiger|fracture|spectral, speed 0.25..2, intensity 0.2..1.4, width 0.08..0.5, interval 1..12, distortion 0..1, ripple 0..1,
--               fragmentation 0..0.65, recovery 0.4..2, glow 0..1.5, cracks 0..1.5, afterglow 0.2..3, particles / mist / scanLines / flicker: boolean }
-- with every key required and no other key allowed. Mirrors dist/wall-kit/living-ice.js validateIce and living-radiation.js validateRadiation; the shared corpus
-- (tests/wall-w2-corpus.js) keeps the JavaScript and database validators identical. A text without them is validated exactly as before.
-- Only functions change: two new helpers (revoked from every API role) and private.wall_text_payload_errors replaced with the same signature (grants kept).
-- No table, row, policy or other function is touched, so no stored Wall is rewritten. Every Pro Effect is free: nothing here reads a plan or an entitlement.
-- Rollback: restore private.wall_text_payload_errors from 20261019100000_wall_text_living_fire.sql (remove `ice` / `radiation` from saved Walls first, or those
-- texts stop validating on their next save), then drop functions private.wall_ice_ok(jsonb) and private.wall_radiation_ok(jsonb).

create or replace function private.wall_ice_ok(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_typeof(v) = 'object'
    and (select count(*) from jsonb_object_keys(v)) = 12
    and private.wall_keys_within(v, array['preset', 'base', 'frostColor', 'shadow', 'highlight', 'depth', 'transparency', 'frost', 'density', 'size', 'scattering', 'roughness'])
    and jsonb_typeof(v -> 'preset') = 'string' and (v ->> 'preset') in ('glacier', 'arctic', 'deep')
    and private.wall_is_hex(v -> 'base') and private.wall_is_hex(v -> 'frostColor') and private.wall_is_hex(v -> 'shadow') and private.wall_is_hex(v -> 'highlight')
    and private.wall_in_range(v -> 'depth', 0.3, 2.2)
    and private.wall_in_range(v -> 'transparency', 0, 1)
    and private.wall_in_range(v -> 'frost', 0, 1)
    and private.wall_in_range(v -> 'density', 0, 1)
    and private.wall_in_range(v -> 'size', 0.55, 1.2)
    and private.wall_in_range(v -> 'scattering', 0, 2)
    and private.wall_in_range(v -> 'roughness', 0, 1), false);
$$;
revoke all on function private.wall_ice_ok(jsonb) from public, anon, authenticated;

create or replace function private.wall_radiation_ok(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_typeof(v) = 'object'
    and (select count(*) from jsonb_object_keys(v)) = 19
    and private.wall_keys_within(v, array['style', 'color', 'customColor', 'waveform', 'speed', 'intensity', 'width', 'interval', 'distortion', 'ripple', 'fragmentation',
      'recovery', 'glow', 'cracks', 'afterglow', 'particles', 'mist', 'scanLines', 'flicker'])
    and jsonb_typeof(v -> 'style') = 'string' and (v ->> 'style') in ('reactor', 'meltdown', 'phantom')
    and jsonb_typeof(v -> 'color') = 'string' and (v ->> 'color') in ('green', 'yellow', 'orange', 'red', 'magenta', 'purple', 'blue', 'cyan', 'lime', 'white', 'custom')
    and private.wall_is_hex(v -> 'customColor')
    and jsonb_typeof(v -> 'waveform') = 'string' and (v ->> 'waveform') in ('geiger', 'fracture', 'spectral')
    and private.wall_in_range(v -> 'speed', 0.25, 2)
    and private.wall_in_range(v -> 'intensity', 0.2, 1.4)
    and private.wall_in_range(v -> 'width', 0.08, 0.5)
    and private.wall_in_range(v -> 'interval', 1, 12)
    and private.wall_in_range(v -> 'distortion', 0, 1)
    and private.wall_in_range(v -> 'ripple', 0, 1)
    and private.wall_in_range(v -> 'fragmentation', 0, 0.65)
    and private.wall_in_range(v -> 'recovery', 0.4, 2)
    and private.wall_in_range(v -> 'glow', 0, 1.5)
    and private.wall_in_range(v -> 'cracks', 0, 1.5)
    and private.wall_in_range(v -> 'afterglow', 0.2, 3)
    and jsonb_typeof(v -> 'particles') = 'boolean' and jsonb_typeof(v -> 'mist') = 'boolean' and jsonb_typeof(v -> 'scanLines') = 'boolean' and jsonb_typeof(v -> 'flicker') = 'boolean', false);
$$;
revoke all on function private.wall_radiation_ok(jsonb) from public, anon, authenticated;

-- copied from 20261019100000_wall_text_living_fire.sql; changed ONLY: + INVALID_ICE and + INVALID_RADIATION (the two optional effects)
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
  if private.wall_is_set(p -> 'fire') and not private.wall_fire_ok(p -> 'fire') then errs := array_append(errs, 'INVALID_FIRE'); end if;
  if private.wall_is_set(p -> 'ice') and not private.wall_ice_ok(p -> 'ice') then errs := array_append(errs, 'INVALID_ICE'); end if;
  if private.wall_is_set(p -> 'radiation') and not private.wall_radiation_ok(p -> 'radiation') then errs := array_append(errs, 'INVALID_RADIATION'); end if;
  return errs;
end;
$$;
