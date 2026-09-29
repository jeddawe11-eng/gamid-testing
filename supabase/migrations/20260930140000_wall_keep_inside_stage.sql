-- Wall: "Keep inside stage" - GamID TESTING only.
--
-- An element may carry one more OPTIONAL top-level key, mirroring dist/wall/validate.js exactly (the shared corpus keeps them identical):
--   keepInside   true / false (a JSON null = not set). Anything else: INVALID_KEEP_INSIDE:<element id>.
-- Absent or true = the element's box must lie inside the canvas, exactly as before (OUTSIDE_CANVAS). false = free positioning: the element may sit partly or
-- wholly outside the stage, anywhere within 20000 units around it (a sanity bound only); the stage clips it when the Wall is painted.
-- Only private.wall_document_errors is replaced (create or replace, same signature, grants kept); everything else in it is copied unchanged from
-- 20260926120000_wall_media_blocks_backgrounds.sql. Every existing draft stays valid. No table, bucket, grant, RLS or data change.
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
  margin float8;
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
      if private.wall_is_set(elem -> 'keepInside') and jsonb_typeof(elem -> 'keepInside') is distinct from 'boolean' then errs := array_append(errs, 'INVALID_KEEP_INSIDE:' || elem_id); end if;

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
        margin := case when jsonb_typeof(elem -> 'keepInside') = 'boolean' and (elem -> 'keepInside') = 'false'::jsonb then 20000 else 0 end;
        if ex < -margin or ey < -margin or ex + ew > canvas_w + margin or ey + eh > canvas_h + margin then errs := array_append(errs, 'OUTSIDE_CANVAS:' || elem_id); end if;
      end if;
    end loop;
  end loop;
  return errs;
exception when numeric_value_out_of_range then
  return array['INVALID_NUMERIC_RANGE'];
end;
$$;
