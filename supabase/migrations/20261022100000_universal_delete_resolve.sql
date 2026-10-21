-- Universal deletion (Mazen's approved contract 2026-10-21) - GamID TESTING only. PREPARED FOR REVIEW; apply only with Mazen's deployment authorization.
--
-- The rule for the owner's Wall resources (uploaded images / GIFs / videos, and custom fonts):
--   NOT IN USE -> delete at once;  IN USE -> one confirmation;  CONFIRM -> delete AND resolve every reference;  CANCEL -> nothing changes.
-- "In use" is decided here, from the authoritative persisted state: the SAVED draft and the PUBLISHED snapshot (the editor adds its own unsaved document).
--
--   1. private.wall_document_strip_asset(doc, asset)   removes every placement of one asset: the Whole Wall background, any stage background and every element
--                                                      whose payload names it. A pure removal - nothing else changes (mirrored by wall-kit/ops.js removeAssetReferences).
--   2. private.wall_jsonb_strip_font_ref(doc, ref)     removes the fontRef key wherever it names that font; the text keeps its content, position, other styling and
--                                                      its own catalog fontFamily, which is the supported fallback (mirrored by ops.js removeFontReferences).
--   3. delete_my_wall_asset_resolving / delete_my_wall_font_resolving (owner RPCs, auth.uid()):
--        resolve = false: an unused resource is deleted; a used one is NOT, and the answer says where it is used (in_draft / in_published) - no error.
--        resolve = true : in ONE transaction the saved draft (only at the revision the editor holds, else WALL_REVISION_CONFLICT and nothing changes) and the
--                         published snapshot are stripped and validated, then the resource row is deleted. A publication that was up to date stays up to date.
--        Both return the storage path (the browser deletes the file through the usage gateway, as before) and the saved draft's revision.
--        A strip that would leave any reference behind (a place the transforms do not know) aborts the whole deletion: WALL_REFERENCE_UNRESOLVED.
-- The existing delete_my_wall_asset / delete_my_wall_font (refuse while in use) are unchanged, for any client that still calls them. Renditions of a deleted
-- video detach (asset_id set null) and leave through their existing sweep. Rollback: drop the functions below.

-- ---------------------------------------------------------------------------------------------
-- 1-2. The two transforms (immutable, no privileges needed beyond the definer functions that call them)
-- ---------------------------------------------------------------------------------------------
create function private.wall_document_strip_asset(doc jsonb, asset text)
returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
  vars jsonb := jsonb_build_object('a', asset);
  stages jsonb := '[]'::jsonb;
  st jsonb;
  out jsonb := doc;
begin
  if out ? 'background' and jsonb_path_exists(out -> 'background', '$.**.assetId ? (@ == $a)', vars) then out := out - 'background'; end if;
  for st in select s.value from jsonb_array_elements(coalesce(doc -> 'stages', '[]'::jsonb)) with ordinality as s(value, n) order by s.n loop
    if st ? 'background' and jsonb_path_exists(st -> 'background', '$.**.assetId ? (@ == $a)', vars) then st := st - 'background'; end if;
    st := jsonb_set(st, '{elements}', coalesce((
      select jsonb_agg(e.value order by e.n) from jsonb_array_elements(coalesce(st -> 'elements', '[]'::jsonb)) with ordinality as e(value, n)
      where not jsonb_path_exists(coalesce(e.value -> 'payload', '{}'::jsonb), '$.**.assetId ? (@ == $a)', vars)), '[]'::jsonb));
    stages := stages || jsonb_build_array(st);
  end loop;
  return jsonb_set(out, '{stages}', stages);
end;
$$;

create function private.wall_jsonb_strip_font_ref(j jsonb, ref text)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select case jsonb_typeof(j)
    when 'object' then coalesce((select jsonb_object_agg(o.key, private.wall_jsonb_strip_font_ref(o.value, ref)) from jsonb_each(j) as o where not (o.key = 'fontRef' and o.value = to_jsonb(ref))), '{}'::jsonb)
    when 'array' then coalesce((select jsonb_agg(private.wall_jsonb_strip_font_ref(a.value, ref) order by a.n) from jsonb_array_elements(j) with ordinality as a(value, n)), '[]'::jsonb)
    else j end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Owner RPCs
-- ---------------------------------------------------------------------------------------------
create function private.delete_my_wall_asset_resolving_impl(candidate_asset_id uuid, candidate_resolve boolean, candidate_expected_revision bigint)
returns table (deleted boolean, in_draft boolean, in_published boolean, storage_path text, draft_revision bigint, published_changed boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
  asset public.wall_assets%rowtype;
  draft public.wall_drafts%rowtype;
  pub public.wall_publications%rowtype;
  ref text := candidate_asset_id::text;
  used_draft boolean := false;
  used_published boolean := false;
  next_doc jsonb;
  errs text[];
begin
  select a.* into asset from public.wall_assets a where a.asset_id = candidate_asset_id and a.entity_id = owned_entity_id for update;
  if asset.asset_id is null then raise exception using errcode = 'P0002', message = 'WALL_ASSET_NOT_FOUND'; end if;
  select d.* into draft from public.wall_drafts d where d.entity_id = owned_entity_id for update;
  select w.* into pub from public.wall_publications w where w.entity_id = owned_entity_id for update;
  used_draft := draft.wall_draft_id is not null and ref = any (private.wall_document_asset_ids(draft.document));
  used_published := pub.entity_id is not null and ref = any (private.wall_document_asset_ids(pub.document));
  if (used_draft or used_published) and not coalesce(candidate_resolve, false) then
    return query select false, used_draft, used_published, null::text, draft.revision, false;
    return;
  end if;
  if used_draft then
    if candidate_expected_revision is null or draft.revision <> candidate_expected_revision then
      raise exception using errcode = 'PT409', message = 'WALL_REVISION_CONFLICT', detail = draft.revision::text;
    end if;
    next_doc := private.wall_document_strip_asset(draft.document, ref);
    if ref = any (private.wall_document_asset_ids(next_doc)) then raise exception using errcode = 'XX000', message = 'WALL_REFERENCE_UNRESOLVED'; end if;
    errs := private.wall_document_errors(next_doc);
    if cardinality(errs) > 0 then raise exception using errcode = '22023', message = 'INVALID_WALL_DOCUMENT', detail = to_jsonb(errs)::text; end if;
    update public.wall_drafts d set document = next_doc, revision = d.revision + 1, updated_at = now() where d.wall_draft_id = draft.wall_draft_id returning d.* into draft;
  end if;
  if used_published then
    next_doc := private.wall_document_strip_asset(pub.document, ref);
    if ref = any (private.wall_document_asset_ids(next_doc)) then raise exception using errcode = 'XX000', message = 'WALL_REFERENCE_UNRESOLVED'; end if;
    errs := private.wall_document_errors(next_doc);
    if cardinality(errs) > 0 then raise exception using errcode = '22023', message = 'INVALID_WALL_DOCUMENT', detail = to_jsonb(errs)::text; end if;
    update public.wall_publications w set document = next_doc,
      draft_revision = case when used_draft and w.draft_revision = draft.revision - 1 then draft.revision else w.draft_revision end
    where w.entity_id = owned_entity_id;
  end if;
  delete from public.wall_assets a where a.asset_id = asset.asset_id;
  return query select true, used_draft, used_published, asset.storage_path, draft.revision, used_published;
end;
$$;

create function private.delete_my_wall_font_resolving_impl(candidate_font_id uuid, candidate_resolve boolean, candidate_expected_revision bigint)
returns table (deleted boolean, in_draft boolean, in_published boolean, storage_path text, draft_revision bigint, published_changed boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  font public.wall_fonts%rowtype;
  draft public.wall_drafts%rowtype;
  pub public.wall_publications%rowtype;
  ref text;
  used_draft boolean := false;
  used_published boolean := false;
  next_doc jsonb;
  errs text[];
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('usage:' || caller::text, 0));
  select f.* into font from public.wall_fonts f where f.font_id = candidate_font_id and f.owner_id = caller for update;
  if font.font_id is null then raise exception using errcode = 'P0002', message = 'WALL_FONT_NOT_FOUND'; end if;
  ref := 'font:' || font.font_id;
  select d.* into draft from public.wall_drafts d where d.entity_id = font.entity_id for update;
  select w.* into pub from public.wall_publications w where w.entity_id = font.entity_id for update;
  used_draft := draft.wall_draft_id is not null and ref = any (private.wall_document_font_refs(draft.document));
  used_published := pub.entity_id is not null and ref = any (private.wall_document_font_refs(pub.document));
  if (used_draft or used_published) and not coalesce(candidate_resolve, false) then
    return query select false, used_draft, used_published, null::text, draft.revision, false;
    return;
  end if;
  if used_draft then
    if candidate_expected_revision is null or draft.revision <> candidate_expected_revision then
      raise exception using errcode = 'PT409', message = 'WALL_REVISION_CONFLICT', detail = draft.revision::text;
    end if;
    next_doc := private.wall_jsonb_strip_font_ref(draft.document, ref);
    if ref = any (private.wall_document_font_refs(next_doc)) then raise exception using errcode = 'XX000', message = 'WALL_REFERENCE_UNRESOLVED'; end if;
    errs := private.wall_document_errors(next_doc);
    if cardinality(errs) > 0 then raise exception using errcode = '22023', message = 'INVALID_WALL_DOCUMENT', detail = to_jsonb(errs)::text; end if;
    update public.wall_drafts d set document = next_doc, revision = d.revision + 1, updated_at = now() where d.wall_draft_id = draft.wall_draft_id returning d.* into draft;
  end if;
  if used_published then
    next_doc := private.wall_jsonb_strip_font_ref(pub.document, ref);
    if ref = any (private.wall_document_font_refs(next_doc)) then raise exception using errcode = 'XX000', message = 'WALL_REFERENCE_UNRESOLVED'; end if;
    errs := private.wall_document_errors(next_doc);
    if cardinality(errs) > 0 then raise exception using errcode = '22023', message = 'INVALID_WALL_DOCUMENT', detail = to_jsonb(errs)::text; end if;
    update public.wall_publications w set document = next_doc,
      draft_revision = case when used_draft and w.draft_revision = draft.revision - 1 then draft.revision else w.draft_revision end
    where w.entity_id = font.entity_id;
  end if;
  delete from public.wall_fonts f where f.font_id = font.font_id;
  return query select true, used_draft, used_published, font.storage_path, draft.revision, used_published;
end;
$$;

create function public.delete_my_wall_asset_resolving(candidate_asset_id uuid, candidate_resolve boolean, candidate_expected_revision bigint default null)
returns table (deleted boolean, in_draft boolean, in_published boolean, storage_path text, draft_revision bigint, published_changed boolean)
language sql volatile security invoker set search_path = ''
as $$ select * from private.delete_my_wall_asset_resolving_impl(candidate_asset_id, candidate_resolve, candidate_expected_revision); $$;

create function public.delete_my_wall_font_resolving(candidate_font_id uuid, candidate_resolve boolean, candidate_expected_revision bigint default null)
returns table (deleted boolean, in_draft boolean, in_published boolean, storage_path text, draft_revision bigint, published_changed boolean)
language sql volatile security invoker set search_path = ''
as $$ select * from private.delete_my_wall_font_resolving_impl(candidate_font_id, candidate_resolve, candidate_expected_revision); $$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: the two delete RPCs for signed-in owners; the transforms for no client
-- ---------------------------------------------------------------------------------------------
revoke all on function
  private.wall_document_strip_asset(jsonb, text), private.wall_jsonb_strip_font_ref(jsonb, text),
  private.delete_my_wall_asset_resolving_impl(uuid, boolean, bigint), private.delete_my_wall_font_resolving_impl(uuid, boolean, bigint),
  public.delete_my_wall_asset_resolving(uuid, boolean, bigint), public.delete_my_wall_font_resolving(uuid, boolean, bigint)
from public, anon, authenticated, service_role;
grant execute on function
  private.delete_my_wall_asset_resolving_impl(uuid, boolean, bigint), private.delete_my_wall_font_resolving_impl(uuid, boolean, bigint),
  public.delete_my_wall_asset_resolving(uuid, boolean, bigint), public.delete_my_wall_font_resolving(uuid, boolean, bigint)
to authenticated;
