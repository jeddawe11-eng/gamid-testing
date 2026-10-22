-- Wall Stages V2 (DEC-0011; Mazen's task 2026-10-22), the published snapshot: private.publish_my_wall_impl refuses to publish a Wall with more stages than the
-- owner's allowance (private.wall_stage_allowance, 20261022120000_wall_stage_types.sql) - WALL_STAGE_LIMIT, detail = the allowance - unless it has no more stages
-- than the snapshot visitors already see. The stage-type rules reach the snapshot through private.wall_document_errors (its CHECK constraint). Every other line
-- is the live TESTING definition, unchanged. Additive: no table, row or stored document changes.

create or replace function private.publish_my_wall_impl(candidate_expected_revision bigint)
returns table (draft_revision bigint, published_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
  draft public.wall_drafts%rowtype;
  missing text[];
begin
  if candidate_expected_revision is null or candidate_expected_revision < 1 then raise exception using errcode = '22023', message = 'INVALID_WALL_REVISION'; end if;
  select * into draft from public.wall_drafts d where d.entity_id = owned_entity_id;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_DRAFT_NOT_FOUND'; end if;
  if draft.revision <> candidate_expected_revision then
    raise exception using errcode = 'PT409', message = 'WALL_REVISION_CONFLICT', detail = draft.revision::text;
  end if;
  -- Wall Stages V2 (DEC-0011): the snapshot never has more stages than the owner's allowance, unless it does not grow beyond the snapshot visitors already see
  if jsonb_array_length(draft.document -> 'stages') > private.wall_stage_allowance(owned_entity_id)
     and jsonb_array_length(draft.document -> 'stages') > coalesce((select jsonb_array_length(p.document -> 'stages') from public.wall_publications p where p.entity_id = owned_entity_id), 0) then
    raise exception using errcode = '22023', message = 'WALL_STAGE_LIMIT', detail = private.wall_stage_allowance(owned_entity_id)::text;
  end if;
  -- every asset the snapshot names must still be the owner's (the draft rules guarantee it; checked again because publishing makes them public)
  select coalesce(array_agg(u), array[]::text[]) into missing
  from unnest(private.wall_document_asset_ids(draft.document)) as u
  where not exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u);
  if cardinality(missing) > 0 then raise exception using errcode = '22023', message = 'WALL_ASSET_NOT_FOUND', detail = to_jsonb(missing)::text; end if;
  return query
  insert into public.wall_publications as w (entity_id, document, draft_revision, published_at)
  values (owned_entity_id, draft.document, draft.revision, now())
  on conflict (entity_id) do update set document = excluded.document, draft_revision = excluded.draft_revision, published_at = excluded.published_at
  returning w.draft_revision, w.published_at;
end;
$$;
