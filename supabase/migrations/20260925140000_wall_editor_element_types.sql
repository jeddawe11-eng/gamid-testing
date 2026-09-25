-- Wall editor element types (W3) - GamID TESTING only.
--
-- The W3 editor edits the W1 Wall Document directly, and the W1 document gained COMPATIBLE optional properties (schemaVersion is unchanged: every document that
-- was valid before is still valid and means the same thing):
--   - a real `text` element type (type-owned payload: text, fontFamily key, fontSize, fontWeight, italic, underline, color, align, lineHeight, letterSpacing,
--     opacity, direction, wrap; optional fontRef / stroke / shadow / glow / gradient)
--   - richer `rect` payload (optional opacity, stroke, strokeWidth, radius, gradient)
--   - two optional, type-neutral element properties: `rotation` (finite degrees) and `groupId` (elements of one stage sharing it form a group; never spanning stages)
--
-- The database validator (a deliberate, narrow port of the JavaScript W1 validator - see the W2 migration) is taught exactly these additions, so a document the
-- editor produces is accepted here and anything else is still rejected. It stays synchronized with W1 through the shared corpus / drift-guard tests and the
-- transactional tests/integration/wall-w2-db.sql (re-generated from the corpus, which now includes text, richer shapes, rotation and groups).
-- The W2 migration is not edited; the two validator functions are replaced here (create or replace), which keeps the table CHECK pointing at them unchanged.
-- No table, grant or RLS change. Additive: only functions are created or replaced; nothing is dropped and no data is touched.

-- ---------------------------------------------------------------------------------------------
-- 1. Small pure field checks (mirroring dist/wall/fields.js). NULL / JSON null both mean "not set".
-- ---------------------------------------------------------------------------------------------
create function private.wall_is_set(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$ select v is not null and jsonb_typeof(v) <> 'null'; $$;

create function private.wall_is_hex(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(v) = 'string' then (v #>> '{}') ~ '^#[0-9a-fA-F]{6}$' else false end; $$;

-- a finite number inside [lo, hi]; compared as float8 so boundary values classify exactly like JavaScript doubles
create function private.wall_in_range(v jsonb, lo float8, hi float8)
returns boolean language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::float8 between lo and hi else false end; $$;

create function private.wall_is_gradient(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$ select jsonb_typeof(v) = 'object' and private.wall_is_hex(v -> 'from') and private.wall_is_hex(v -> 'to') and private.wall_in_range(v -> 'angle', 0, 360); $$;

create function private.wall_text_payload_errors(p jsonb)
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
  return errs;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Payload validation for every element type the database knows: rect (extended), embed, text. NULL = unknown element type.
-- ---------------------------------------------------------------------------------------------
create or replace function private.wall_element_payload_errors(element_type text, payload jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
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
    return array['UNSUPPORTED_PROVIDER'];   -- no provider is registered in the database (same as W1 today)
  elsif element_type = 'text' then
    return private.wall_text_payload_errors(payload);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. The document validator, extended with the optional rotation / groupId element properties
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
  -- no architectural maximum on stages: a non-empty collection is all W1 requires
  if jsonb_typeof(doc -> 'stages') is distinct from 'array' then
    errs := array_append(errs, 'INVALID_STAGE_COUNT');
  elsif jsonb_array_length(doc -> 'stages') < 1 then
    errs := array_append(errs, 'INVALID_STAGE_COUNT');
  end if;
  if cardinality(errs) > 0 then return errs; end if;

  for stage in select s.value from jsonb_array_elements(doc -> 'stages') as s loop
    if jsonb_typeof(stage) is distinct from 'object' or jsonb_typeof(stage -> 'id') is distinct from 'string' or (stage ->> 'id') = '' then
      errs := array_append(errs, 'INVALID_STAGE_ID');
      continue;
    end if;
    stage_id := stage ->> 'id';
    if stage_id = any (stage_ids) then errs := array_append(errs, 'DUPLICATE_STAGE_ID:' || stage_id); end if;
    stage_ids := array_append(stage_ids, stage_id);
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
      -- optional, type-neutral properties (W3)
      if private.wall_is_set(elem -> 'rotation') and jsonb_typeof(elem -> 'rotation') is distinct from 'number' then errs := array_append(errs, 'INVALID_ROTATION:' || elem_id); end if;
      if private.wall_is_set(elem -> 'groupId') and (jsonb_typeof(elem -> 'groupId') is distinct from 'string' or (elem ->> 'groupId') !~ '^[A-Za-z0-9_-]{1,64}$') then
        errs := array_append(errs, 'INVALID_GROUP_ID:' || elem_id);
      end if;

      elem_type := case when jsonb_typeof(elem -> 'type') = 'string' then elem ->> 'type' end;
      payload_errs := case when elem_type is null then null else private.wall_element_payload_errors(elem_type, elem -> 'payload') end;
      if payload_errs is null then
        errs := array_append(errs, 'UNKNOWN_ELEMENT_TYPE:' || elem_id);   -- nothing further about an unsupported type is trusted or inspected
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
        -- float8 on purpose: the same IEEE-double arithmetic as JavaScript, so edge cases (0.1 + 0.2) classify identically
        if ex < 0 or ey < 0 or ex + ew > canvas_w or ey + eh > canvas_h then errs := array_append(errs, 'OUTSIDE_CANVAS:' || elem_id); end if;
      end if;
    end loop;
  end loop;
  return errs;
exception when numeric_value_out_of_range then
  return array['INVALID_NUMERIC_RANGE'];   -- a number no JavaScript double can hold: rejected (W1 sees it as non-finite)
end;
$$;

-- new helpers are internal: no client role may execute them (the owner RPCs from the W2 migration remain the only entry points)
revoke all on function
  private.wall_is_set(jsonb), private.wall_is_hex(jsonb), private.wall_in_range(jsonb, float8, float8), private.wall_is_gradient(jsonb), private.wall_text_payload_errors(jsonb),
  private.wall_element_payload_errors(text, jsonb), private.wall_document_errors(jsonb)
from public, anon, authenticated;
