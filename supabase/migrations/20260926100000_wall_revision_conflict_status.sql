-- Wall revision conflict: make the stale-save rejection reach the client (GamID TESTING only).
--
-- Root cause (proven live against the TESTING API with a disposable user): save_my_wall_draft raised WALL_REVISION_CONFLICT with SQLSTATE 40001
-- (serialization_failure). PostgREST treats 40001 as a retryable serialization failure and re-runs the whole request, so a stale save never answered: the request
-- retried until the gateway gave up with "504 upstream request timeout". The database protected the newer revision (nothing was overwritten), but the editor never
-- received a conflict - only a timeout - so the intended "Load latest / Keep mine" experience could not appear.
--
-- Fix: raise the conflict with the PostgREST custom-status SQLSTATE PT409 (HTTP 409 Conflict, body {"code":"PT409","message":"WALL_REVISION_CONFLICT",
-- "details":"<current revision>"}). Same message and detail as before, so every typed consumer is unchanged; optimistic concurrency is NOT loosened - a stale
-- save is still rejected, the newer revision is still untouched, and there is no automatic overwrite or merge.
-- Additive: create or replace of one function (the W2 migration is not edited). Grants are unchanged (create or replace keeps them).
create or replace function private.save_my_wall_draft_impl(candidate_document jsonb, candidate_expected_revision bigint)
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
    raise exception using errcode = 'PT409', message = 'WALL_REVISION_CONFLICT', detail = current_draft.revision::text;
  end if;

  update public.wall_drafts d
  set document = candidate_document, revision = d.revision + 1, updated_at = now()
  where d.wall_draft_id = current_draft.wall_draft_id;
  return query
  select d.document, d.revision, d.created_at, d.updated_at from public.wall_drafts d where d.wall_draft_id = current_draft.wall_draft_id;
end;
$$;
