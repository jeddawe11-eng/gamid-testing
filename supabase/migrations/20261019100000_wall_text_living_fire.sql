-- Living Fire V3 on Wall text (Mazen's task "Living Fire V3 Phase C", 2026-10-19) - GamID TESTING only.
--
-- A COMPATIBLE, ADDITIVE extension of the Wall Document (schemaVersion unchanged; every saved and published Wall stays valid and means exactly the same): a text
-- element may carry an optional `fire` object
--   { style: organic|cinematic|mythic, intensity 0.2..1.4, speed 0.15..2, turbulence 0.15..1.5, color: natural|crimson|blue, sparks: boolean, mode: full|letters }
-- with every key required and no other key allowed. Mirrors dist/wall-kit/living-fire.js validateFire; the shared corpus (tests/wall-w2-corpus.js) keeps the
-- JavaScript and database validators identical. A text without `fire` is validated exactly as before.
-- Only functions change: one new helper (revoked from every API role) and private.wall_text_payload_errors replaced with the same signature (grants kept).
-- No table, row, policy or other function is touched, so no stored Wall is rewritten.
-- Rollback: restore private.wall_text_payload_errors from 20260930160000_wall_video_layers_other_link.sql (remove `fire` from saved Walls first, or those
-- texts stop validating on their next save), then drop function private.wall_fire_ok(jsonb).

create or replace function private.wall_fire_ok(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_typeof(v) = 'object'
    and (select count(*) from jsonb_object_keys(v)) = 7
    and private.wall_keys_within(v, array['style', 'intensity', 'speed', 'turbulence', 'color', 'sparks', 'mode'])
    and jsonb_typeof(v -> 'style') = 'string' and (v ->> 'style') in ('organic', 'cinematic', 'mythic')
    and jsonb_typeof(v -> 'color') = 'string' and (v ->> 'color') in ('natural', 'crimson', 'blue')
    and jsonb_typeof(v -> 'mode') = 'string' and (v ->> 'mode') in ('full', 'letters')
    and jsonb_typeof(v -> 'sparks') = 'boolean'
    and private.wall_in_range(v -> 'intensity', 0.2, 1.4)
    and private.wall_in_range(v -> 'speed', 0.15, 2)
    and private.wall_in_range(v -> 'turbulence', 0.15, 1.5), false);
$$;
revoke all on function private.wall_fire_ok(jsonb) from public, anon, authenticated;

-- copied from 20260930160000_wall_video_layers_other_link.sql; changed ONLY: + INVALID_FIRE (the optional fire)
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
  return errs;
end;
$$;
