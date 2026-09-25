-- Wall persistence foundation (W2) - GamID TESTING only.
--
-- A private, owner-only, server-validated home for the accepted W1 Wall Document (dist/wall/*). It stores the W1 document EXACTLY as it is (no second format,
-- no ownership fields inside it) and keeps everything backend-specific (owner, revision, timestamps) beside it, in columns.
--
-- Product rules encoded here
--   * ONE Wall draft per GamID identity (a unique constraint, not client behavior). The table has its own surrogate key so relaxing that rule later is a
--     non-destructive constraint change, never a data migration. Multiple Walls are NOT implemented.
--   * The draft is OWNER-PRIVATE and independent of the identity's publish state: nothing here reads entities.visibility, and nothing here is readable by anon
--     or by another user. There is no public Wall function of any kind (publishing is a later phase).
--   * Optimistic concurrency: `revision` starts at 1 and advances on every successful save; a save must name the revision it edited, and a stale one is
--     rejected (WALL_REVISION_CONFLICT) instead of silently overwriting newer work. This is not history, not collaboration.
--
-- Server-side validation (the security boundary)
--   The W1 validator is browser JavaScript and Postgres cannot import it. private.wall_document_errors() is therefore a deliberate, narrow SQL port of
--   dist/wall/validate.js (same error codes, same order of checks, same JS-double arithmetic for canvas containment, the same unsafe-markup patterns), applied at
--   the persistence boundary AND as a table CHECK, so no path - not even a direct backend insert - can store an invalid or unsafe document. It stays synchronized
--   with W1 by the W2 contract tests (drift guards) + tests/integration/wall-w2-db.sql, which run one shared corpus of valid/invalid documents through BOTH validators and
--   require identical error sets. It rejects; it never sanitizes.
--   Element types the database can validate are the W1 built-ins (rect, embed). The database has NO embed providers registered - exactly like W1 - so an embed is
--   rejected (UNSUPPORTED_PROVIDER) here as it is in W1. Supporting a further element type or a real provider means a forward migration that teaches this
--   validator about it; nothing is silently accepted in the meantime.
--   Persistence-only limit (not part of W1): a stored document is at most 1 MiB of JSON text (WALL_DOCUMENT_TOO_LARGE).
--
-- Security shape (established GamID pattern): RLS on, no table privilege for any client role, security-invoker public wrappers over security-definer
-- private implementations with a fixed search_path, auth.uid() -> entity_memberships ownership resolved on the server, typed errors, additive only.
-- Only authenticated may execute the three owner RPCs. Applied migrations are never edited.

-- ---------------------------------------------------------------------------------------------
-- 1. The W1 validator, ported (pure functions: no table access)
-- ---------------------------------------------------------------------------------------------

-- Unsafe markup in ANY payload string: script/iframe tags, tag-shaped markup, javascript: URIs, inline event handlers (dist/wall/validate.js UNSAFE_PATTERNS).
-- The whitespace class is JavaScript's \s written out explicitly, so behavior does not depend on this database's locale.
create function private.wall_string_is_unsafe(candidate text)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  ws constant text := '[' || E'\t\n\x0b\x0c\r ' || U&'\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff' || ']*';
begin
  return candidate ~* ('<' || ws || 'script')
    or candidate ~* ('<' || ws || 'iframe')
    or candidate ~* ('<' || ws || '/?[a-z].*>')
    or candidate ~* 'javascript:'
    or candidate ~* ('(^|[^a-z0-9_])on[a-z]+' || ws || '=');
end;
$$;

-- Recursive scan of every string VALUE (keys are not scanned, as in W1). Path format mirrors W1: id.payload.key[0].
create function private.wall_scan_unsafe(candidate jsonb, path text)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  hits text[] := array[]::text[];
  child record;
begin
  case jsonb_typeof(candidate)
    when 'string' then
      if private.wall_string_is_unsafe(candidate #>> '{}') then hits := array['UNSAFE_PAYLOAD_CONTENT:' || path]; end if;
    when 'array' then
      for child in select a.value as item, a.ordinality - 1 as idx from jsonb_array_elements(candidate) with ordinality as a loop
        hits := hits || private.wall_scan_unsafe(child.item, path || '[' || child.idx || ']');
      end loop;
    when 'object' then
      for child in select o.key as name, o.value as item from jsonb_each(candidate) as o loop
        hits := hits || private.wall_scan_unsafe(child.item, path || '.' || child.name);
      end loop;
    else
      null;
  end case;
  return hits;
end;
$$;

-- Payload validation for the element types the database knows (the W1 built-ins). NULL means "unknown element type".
create function private.wall_element_payload_errors(element_type text, payload jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
begin
  if element_type = 'rect' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'fill') is distinct from 'string' or (payload ->> 'fill') !~ '^#[0-9a-fA-F]{6}$' then return array['INVALID_FILL']; end if;
    return array[]::text[];
  elsif element_type = 'embed' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'providerKey') is distinct from 'string' or (payload ->> 'providerKey') = '' then return array['INVALID_PROVIDER_KEY']; end if;
    return array['UNSUPPORTED_PROVIDER'];   -- no provider is registered in the database (same as W1 today)
  end if;
  return null;
end;
$$;

-- The document validator: returns the list of W1 error codes ('{}' = valid).
create function private.wall_document_errors(doc jsonb)
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

-- The document a brand-new Wall starts as: must equal dist/wall/schema.js createDocument() (asserted by tests).
create function private.wall_new_document()
returns jsonb
language sql immutable
set search_path = ''
as $$ select '{"schemaVersion":1,"canvas":{"width":1000,"height":1778},"stages":[{"id":"stage_1","elements":[]}]}'::jsonb; $$;

-- ---------------------------------------------------------------------------------------------
-- 2. The private draft table (RPC-only: no client role has any table privilege)
-- ---------------------------------------------------------------------------------------------
create table public.wall_drafts (
  wall_draft_id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  document jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- ONE Wall per GamID identity (current product rule). Dropping this one constraint is all a future multi-Wall decision would need; no data changes.
  constraint wall_drafts_one_per_identity unique (entity_id),
  constraint wall_drafts_revision_positive check (revision >= 1),
  constraint wall_drafts_document_size check (octet_length(document::text) <= 1048576),
  -- defense in depth: not even a direct backend write can store a document W1 would reject
  constraint wall_drafts_document_is_valid check (cardinality(private.wall_document_errors(document)) = 0)
);
comment on table public.wall_drafts is 'Owner-private Wall draft: the W1 Wall Document plus persistence metadata (revision, timestamps). One per identity. Never public.';

alter table public.wall_drafts enable row level security;
revoke all on table public.wall_drafts from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Owner resolution and the three owner RPCs
-- ---------------------------------------------------------------------------------------------
create function private.wall_owned_entity_id()
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;
  return owned_entity_id;
end;
$$;

-- Create the caller's draft if it does not exist, and return it. Idempotent and race-safe: the unique constraint decides, so two simultaneous first calls
-- can never produce two Walls, and both callers then read the same row. Works whether or not the identity is published.
create function private.ensure_my_wall_draft_impl()
returns table (document jsonb, revision bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
begin
  insert into public.wall_drafts (entity_id, document)
  values (owned_entity_id, private.wall_new_document())
  on conflict on constraint wall_drafts_one_per_identity do nothing;
  return query
  select d.document, d.revision, d.created_at, d.updated_at from public.wall_drafts d where d.entity_id = owned_entity_id;
end;
$$;

-- Read the caller's draft (no row when none exists yet). Only ever the caller's own.
create function private.get_my_wall_draft_impl()
returns table (document jsonb, revision bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
begin
  return query
  select d.document, d.revision, d.created_at, d.updated_at from public.wall_drafts d where d.entity_id = owned_entity_id;
end;
$$;

-- Save the caller's draft. The owner is resolved from auth.uid(), never from the request. The document is validated (never sanitized) before it is stored, and
-- the save must name the revision it edited.
create function private.save_my_wall_draft_impl(candidate_document jsonb, candidate_expected_revision bigint)
returns table (document jsonb, revision bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
  errs text[];
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

  select * into current_draft from public.wall_drafts d where d.entity_id = owned_entity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_DRAFT_NOT_FOUND'; end if;
  if current_draft.revision <> candidate_expected_revision then
    raise exception using errcode = '40001', message = 'WALL_REVISION_CONFLICT', detail = current_draft.revision::text;
  end if;

  update public.wall_drafts d
  set document = candidate_document, revision = d.revision + 1, updated_at = now()
  where d.wall_draft_id = current_draft.wall_draft_id;
  return query
  select d.document, d.revision, d.created_at, d.updated_at from public.wall_drafts d where d.wall_draft_id = current_draft.wall_draft_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Public wrappers (established security-invoker + private-impl pattern) and privileges
-- ---------------------------------------------------------------------------------------------
create function public.ensure_my_wall_draft()
returns table (document jsonb, revision bigint, created_at timestamptz, updated_at timestamptz)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.ensure_my_wall_draft_impl(); $$;

create function public.get_my_wall_draft()
returns table (document jsonb, revision bigint, created_at timestamptz, updated_at timestamptz)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_wall_draft_impl(); $$;

create function public.save_my_wall_draft(candidate_document jsonb, candidate_expected_revision bigint)
returns table (document jsonb, revision bigint, created_at timestamptz, updated_at timestamptz)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.save_my_wall_draft_impl(candidate_document, candidate_expected_revision); $$;

revoke all on function
  private.wall_string_is_unsafe(text), private.wall_scan_unsafe(jsonb, text), private.wall_element_payload_errors(text, jsonb),
  private.wall_document_errors(jsonb), private.wall_new_document(), private.wall_owned_entity_id(),
  private.ensure_my_wall_draft_impl(), private.get_my_wall_draft_impl(), private.save_my_wall_draft_impl(jsonb, bigint),
  public.ensure_my_wall_draft(), public.get_my_wall_draft(), public.save_my_wall_draft(jsonb, bigint)
from public, anon, authenticated;

-- Only the three owner RPCs (and their impls) are callable, and only by a signed-in user. The validators and helpers are not granted to any client role.
grant execute on function
  private.ensure_my_wall_draft_impl(), private.get_my_wall_draft_impl(), private.save_my_wall_draft_impl(jsonb, bigint),
  public.ensure_my_wall_draft(), public.get_my_wall_draft(), public.save_my_wall_draft(jsonb, bigint)
to authenticated;
