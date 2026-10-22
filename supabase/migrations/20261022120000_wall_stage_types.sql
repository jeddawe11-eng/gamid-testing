-- Wall Stages V2: My Stage / Friends Stage and the stage allowance (DEC-0011; Mazen's task "GAMID - WALL STAGES V2", 2026-10-22). TESTING only.
--
--   1. private.wall_stage_type_errors(doc) - the SQL port of dist/wall/stage-types.js stageTypeErrors (same codes, same order): a stage's optional type is 'my' or
--      'friends' (no type = a My Stage); a Friends Stage has no elements and no background of its own; a Wall has at least one My Stage. Appended at the END of
--      private.wall_document_errors, so every draft follows it, through the save path and the table's CHECK constraint. Every stored stage has no type (audited
--      2026-10-22: 5 drafts and 2 snapshots on TESTING, none typed, none with more than 3 stages), so every stored Wall is a Wall of My Stages and stays valid.
--   2. private.wall_stage_allowance(entity) - THE place a Wall's stage allowance is decided. Today 3 for everyone; the approved direction is Free 3 / Pro 5, decided
--      here later (by the owner's plan) without changing anything else. No plan, entitlement, billing or subscription exists. It is deliberately NOT a document
--      rule (wall_document_errors also guards the stored rows through CHECK constraints: an allowance can change, a document's validity must not).
--   3. private.save_my_wall_draft_impl refuses a Wall with more stages than the allowance (WALL_STAGE_LIMIT, detail = the allowance) unless it has no more stages
--      than the stored draft already has. Every other line is the live TESTING definition, unchanged.
--   4. public.get_my_wall_stage_allowance() - the signed-in owner's allowance, for the editor (owner resolved on the server, no argument).
-- The same limit on the snapshot is 20261022120100_wall_public_publishing_stage_limit.sql. Additive: no table, row or stored document changes.

create function private.wall_stage_type_errors(doc jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  stage jsonb;
  stage_id text;
  mine integer := 0;
begin
  if jsonb_typeof(doc -> 'stages') is distinct from 'array' then return errs; end if;
  for stage in select s.value from jsonb_array_elements(doc -> 'stages') as s loop
    if jsonb_typeof(stage) is distinct from 'object' or jsonb_typeof(stage -> 'id') is distinct from 'string' or (stage ->> 'id') = '' then continue; end if;   -- INVALID_STAGE_ID already
    stage_id := stage ->> 'id';
    if private.wall_is_set(stage -> 'type') and (jsonb_typeof(stage -> 'type') is distinct from 'string' or (stage ->> 'type') not in ('my', 'friends')) then
      errs := array_append(errs, 'INVALID_STAGE_TYPE:' || stage_id);
      continue;
    end if;
    if jsonb_typeof(stage -> 'type') = 'string' and (stage ->> 'type') = 'friends' then
      if private.wall_is_set(stage -> 'background') then errs := array_append(errs, 'FRIENDS_STAGE_BACKGROUND:' || stage_id); end if;
      if jsonb_typeof(stage -> 'elements') = 'array' and jsonb_array_length(stage -> 'elements') > 0 then errs := array_append(errs, 'FRIENDS_STAGE_ELEMENTS:' || stage_id); end if;
    else
      mine := mine + 1;
    end if;
  end loop;
  if mine = 0 then errs := array_append(errs, 'NO_MY_STAGE'); end if;
  return errs;
end;
$$;

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
        margin := case when jsonb_typeof(elem -> 'keepInside') = 'boolean' and (elem -> 'keepInside') = 'false'::jsonb then 5000 else 0 end;
        if ex < -margin or ey < -margin or ex + ew > canvas_w + margin or ey + eh > canvas_h + margin then errs := array_append(errs, 'OUTSIDE_CANVAS:' || elem_id); end if;
      end if;
    end loop;
  end loop;
  -- Wall Stages V2 (DEC-0011): the My Stage / Friends Stage rules, after every stage was checked (dist/wall/validate.js appends them at the same point)
  errs := errs || private.wall_stage_type_errors(doc);
  return errs;
exception when numeric_value_out_of_range then
  return array['INVALID_NUMERIC_RANGE'];
end;
$$;

-- THE place a Wall's stage allowance is decided (today: 3 for everyone; later: by the owner's plan - DEC-0011 Free 3 / Pro 5). The owner is passed so a plan can
-- decide it later; nothing reads one today.
create function private.wall_stage_allowance(candidate_entity uuid)
returns integer
language sql stable
set search_path = ''
as $$ select 3 $$;

create or replace function private.save_my_wall_draft_impl(candidate_document jsonb, candidate_expected_revision bigint)
returns table (document jsonb, revision bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
  errs text[];
  missing text[];
  wrong_kind text[];
  current_draft public.wall_drafts%rowtype;
begin
  if candidate_expected_revision is null or candidate_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'INVALID_WALL_REVISION';
  end if;
  if candidate_document is null then
    raise exception using errcode = '22023', message = 'INVALID_WALL_DOCUMENT', detail = '["MALFORMED_DOCUMENT"]';
  end if;
  if octet_length(candidate_document::text) > 1048576 then
    raise exception using errcode = '22023', message = 'WALL_DOCUMENT_TOO_LARGE';
  end if;
  errs := private.wall_document_errors(candidate_document);
  if cardinality(errs) > 0 then
    raise exception using errcode = '22023', message = 'INVALID_WALL_DOCUMENT', detail = to_jsonb(errs)::text;
  end if;
  -- Wall Stages V2 (DEC-0011): never more stages than the owner's allowance. A Wall that already has more (an allowance lowered later) can still be saved while it
  -- does not grow: nothing is ever cut.
  if jsonb_array_length(candidate_document -> 'stages') > private.wall_stage_allowance(owned_entity_id)
     and jsonb_array_length(candidate_document -> 'stages') > coalesce((select jsonb_array_length(d.document -> 'stages') from public.wall_drafts d where d.entity_id = owned_entity_id), 0) then
    raise exception using errcode = '22023', message = 'WALL_STAGE_LIMIT', detail = private.wall_stage_allowance(owned_entity_id)::text;
  end if;
  select coalesce(array_agg(u), array[]::text[]) into missing
  from unnest(private.wall_document_asset_ids(candidate_document)) as u
  where not exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u);
  if cardinality(missing) > 0 then
    raise exception using errcode = '22023', message = 'WALL_ASSET_NOT_FOUND', detail = to_jsonb(missing)::text;
  end if;
  select coalesce(array_agg(distinct x.u), array[]::text[]) into wrong_kind from (
    select u from unnest(private.wall_document_video_asset_ids(candidate_document)) as u
    where not exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u and a.mime_type in ('video/mp4', 'video/webm'))
    union all
    select u from unnest(private.wall_document_picture_asset_ids(candidate_document)) as u
    where exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u and a.mime_type in ('video/mp4', 'video/webm'))
  ) x;
  if cardinality(wrong_kind) > 0 then
    raise exception using errcode = '22023', message = 'WALL_ASSET_KIND_MISMATCH', detail = to_jsonb(wrong_kind)::text;
  end if;

  select * into current_draft from public.wall_drafts d where d.entity_id = owned_entity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_DRAFT_NOT_FOUND'; end if;
  if current_draft.revision <> candidate_expected_revision then
    raise exception using errcode = 'PT409', message = 'WALL_REVISION_CONFLICT', detail = current_draft.revision::text;
  end if;

  update public.wall_drafts d
  set document = candidate_document, revision = d.revision + 1, updated_at = now()
  where d.wall_draft_id = current_draft.wall_draft_id;
  return query
  select d.document, d.revision, d.created_at, d.updated_at from public.wall_drafts d where d.wall_draft_id = current_draft.wall_draft_id;
end;
$$;

create function private.get_my_wall_stage_allowance_impl()
returns integer
language plpgsql stable security definer
set search_path = ''
as $$
begin
  return private.wall_stage_allowance(private.wall_owned_entity_id());
end;
$$;

create function public.get_my_wall_stage_allowance()
returns integer
language sql stable security invoker
set search_path = ''
as $$ select private.get_my_wall_stage_allowance_impl(); $$;

revoke all on function private.wall_stage_type_errors(jsonb), private.wall_stage_allowance(uuid), private.get_my_wall_stage_allowance_impl(), public.get_my_wall_stage_allowance()
  from public, anon, authenticated;
-- the owner's allowance is readable by the signed-in owner only (the rules and the allowance itself are not client-executable)
grant execute on function private.get_my_wall_stage_allowance_impl(), public.get_my_wall_stage_allowance() to authenticated;
