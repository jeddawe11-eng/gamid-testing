-- My Crew V1 - Slice 2: Crew Mini Wall (2-stage foundation) - GamID TESTING only.
--
-- A Crew Wall is a lightweight visual identity of ONE Crew (one game): its stages and which current members appear on them, in which order. It is NOT the owner's
-- personal Wall and it is NOT a free-form Wall document: no text blocks, links, embeds, uploads or HTML can be stored, only typed placements of real members.
-- The browser turns this model into an ordinary Wall document at render time and paints it with the accepted Wall engine (stages, scaling, backgrounds) - the personal
-- Wall's tables, validator and RPCs are not touched, and nothing here can write them.
--
--   1. public.crew_walls        one row per Crew: stage_count, published, revision. Created with the Crew's first edit; deleted with the Crew (FK cascade).
--   2. public.crew_wall_cards   one row per placed member: stage_no, position. FK (crew_id, entity_id) -> crew_members ON DELETE CASCADE, so a member who leaves, is
--                               removed, or whose Crew is deleted disappears from the Wall automatically - nothing to clean up by hand. A trigger refuses a card for
--                               anyone who is not an ACTIVE member of THAT Crew (an invitee, or a GamID of another Crew, can never be placed).
--   3. Stage allowance          private.crew_policy.wall_stage_allowance = 2 (the current Free baseline) read through ONE function,
--                               private.crew_wall_stage_allowance(crew_id) - the single place a future plan / Usage & Limits decides a Crew's allowance. The server
--                               refuses stage_count above it (CREW_WALL_STAGE_LIMIT). No billing, checkout or plans exist; this only records usage vs allowance.
--   4. Usage                    get_crew_wall_usage(crew_id) -> stages_used / stages_allowed (owner or active member) - what a future Usage & Limits screen reads.
--   5. Owner RPCs               get_my_crew_wall, save_crew_wall (whole layout, revision-checked), set_crew_wall_published - the current OWNER only.
--   6. Visitors                 get_public_crew_wall(crew_id) (anon): only a PUBLISHED Wall of an existing Crew; only cards of ACTIVE members whose own GamID is
--                               PUBLIC; only their @handle + placement. Every displayed profile field is then read through the accepted public identity function, so
--                               each member's own visibility switches apply and values are always current (no copied snapshots).
--                               get_crew_wall_preview(crew_id) (owner only): the same shape for an unpublished Wall, members who are not public flagged as hidden.
--   7. public.game_presentation empty registry for APPROVED game media (accent colour now; logo / background media paths later). No third-party media is stored.
--   8. Realtime                 Wall changes send the existing private, data-free crew_changed signal to the owner and active members.
-- Additive only.

-- ---------------------------------------------------------------------------------------------
-- 1 + 2 + 7. Tables
-- ---------------------------------------------------------------------------------------------
alter table private.crew_policy add column wall_stage_allowance integer not null default 2 check (wall_stage_allowance between 1 and 20);

create table public.game_presentation (
  game_key text primary key references public.game_catalog(game_key) on delete cascade,
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_path text check (logo_path is null or logo_path ~ '^[a-z0-9][a-z0-9/_.-]{0,199}$'),                 -- a path in GamID's own approved storage, never a URL
  background_media_path text check (background_media_path is null or background_media_path ~ '^[a-z0-9][a-z0-9/_.-]{0,199}$'),
  approved_at timestamptz not null default now()
);
comment on table public.game_presentation is 'Approved, legitimately sourced presentation for a game (Crew Walls). Empty until media is approved; never third-party URLs.';
alter table public.game_presentation enable row level security;
revoke all on table public.game_presentation from public, anon, authenticated;

create table public.crew_walls (
  crew_id uuid primary key references public.crews(crew_id) on delete cascade,
  stage_count smallint not null default 1 check (stage_count between 1 and 20),
  published boolean not null default false,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);
comment on table public.crew_walls is 'A Crew''s Mini Wall: stages + published flag. Owner RPCs only; visitors read the published Wall through get_public_crew_wall.';

create table public.crew_wall_cards (
  crew_id uuid not null references public.crew_walls(crew_id) on delete cascade,
  entity_id uuid not null,
  stage_no smallint not null check (stage_no between 1 and 20),
  position smallint not null check (position between 0 and 99),
  primary key (crew_id, entity_id),
  constraint crew_wall_cards_member_fk foreign key (crew_id, entity_id) references public.crew_members (crew_id, entity_id) on delete cascade,
  constraint crew_wall_cards_slot_unique unique (crew_id, stage_no, position)
);
comment on table public.crew_wall_cards is 'A current ACTIVE member placed on their Crew''s Wall. Removed automatically when the membership ends.';

alter table public.crew_walls enable row level security;
alter table public.crew_wall_cards enable row level security;
revoke all on table public.crew_walls, public.crew_wall_cards from public, anon, authenticated;

-- only an ACTIVE member of THIS Crew can be placed (the FK already guarantees it is a row of this Crew)
create function private.crew_wall_cards_active_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.crew_members m where m.crew_id = new.crew_id and m.entity_id = new.entity_id and m.status = 'ACTIVE') then
    raise exception using errcode = '22023', message = 'CREW_WALL_NOT_A_MEMBER';
  end if;
  return new;
end;
$$;
create trigger crew_wall_cards_active_member before insert or update on public.crew_wall_cards
for each row execute function private.crew_wall_cards_active_member();

-- ---------------------------------------------------------------------------------------------
-- 3 + 4. Allowance and usage
-- ---------------------------------------------------------------------------------------------
-- THE place a Crew's stage allowance is decided (today: the central Free baseline; later: the Crew owner's plan)
create function private.crew_wall_stage_allowance(candidate_crew uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select p.wall_stage_allowance from private.crew_policy p where p.singleton;
$$;

create function private.crew_role_of_me(candidate_crew uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := private.identity_my_entity();
  r text;
begin
  select m.role into r from public.crew_members m where m.crew_id = candidate_crew and m.entity_id = me and m.status = 'ACTIVE';
  return r;   -- OWNER | MEMBER | null (not an active member)
end;
$$;

create function private.get_crew_wall_usage_impl(candidate_crew uuid)
returns table (stages_used integer, stages_allowed integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if private.crew_role_of_me(candidate_crew) is null then raise exception using errcode = '42501', message = 'CREW_MEMBERS_ONLY'; end if;
  return query select coalesce((select w.stage_count::integer from public.crew_walls w where w.crew_id = candidate_crew), 1), private.crew_wall_stage_allowance(candidate_crew);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Owner RPCs
-- ---------------------------------------------------------------------------------------------
create function private.crew_wall_owner_check(candidate_crew uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.crews c where c.crew_id = candidate_crew) then raise exception using errcode = 'P0002', message = 'CREW_NOT_FOUND'; end if;
  if private.crew_role_of_me(candidate_crew) is distinct from 'OWNER' then raise exception using errcode = '42501', message = 'CREW_OWNER_ONLY'; end if;
end;
$$;

-- the owner's editing view: stages, allowance, published, revision, and the placements (by @handle)
create function private.get_my_crew_wall_impl(candidate_crew uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  wall public.crew_walls%rowtype;
begin
  perform private.crew_wall_owner_check(candidate_crew);
  insert into public.crew_walls (crew_id) values (candidate_crew) on conflict (crew_id) do nothing;
  select * into wall from public.crew_walls w where w.crew_id = candidate_crew;
  return jsonb_build_object(
    'stage_count', wall.stage_count, 'stages_used', wall.stage_count, 'stages_allowed', private.crew_wall_stage_allowance(candidate_crew),
    'published', wall.published, 'revision', wall.revision,
    'cards', coalesce((select jsonb_agg(jsonb_build_object('handle', e.gamid_handle, 'stage', k.stage_no, 'position', k.position) order by k.stage_no, k.position)
                       from public.crew_wall_cards k join public.entities e on e.entity_id = k.entity_id where k.crew_id = candidate_crew), '[]'::jsonb));
end;
$$;

-- saves the WHOLE layout: candidate_cards = [{handle, stage, position}], only current ACTIVE members of this Crew, each once, stage within stage_count; stage_count
-- within the allowance; refused if the Wall changed since candidate_expected_revision (another tab). Returns the new revision.
create function private.save_crew_wall_impl(candidate_crew uuid, candidate_stage_count integer, candidate_cards jsonb, candidate_expected_revision bigint)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  wall public.crew_walls%rowtype;
  card jsonb;
  member uuid;
  seen uuid[] := array[]::uuid[];
  saved bigint;
begin
  perform private.crew_wall_owner_check(candidate_crew);
  perform 1 from public.crews c where c.crew_id = candidate_crew for update;   -- serialise with membership changes of this Crew
  insert into public.crew_walls (crew_id) values (candidate_crew) on conflict (crew_id) do nothing;
  select * into wall from public.crew_walls w where w.crew_id = candidate_crew for update;
  if candidate_expected_revision is null or wall.revision <> candidate_expected_revision then
    raise exception using errcode = 'PT409', message = 'CREW_WALL_REVISION_CONFLICT', detail = wall.revision::text;
  end if;
  if candidate_stage_count is null or candidate_stage_count < 1 then raise exception using errcode = '22023', message = 'INVALID_STAGE_COUNT'; end if;
  if candidate_stage_count > private.crew_wall_stage_allowance(candidate_crew) then raise exception using errcode = '54000', message = 'CREW_WALL_STAGE_LIMIT'; end if;
  if candidate_cards is null or jsonb_typeof(candidate_cards) <> 'array' or jsonb_array_length(candidate_cards) > 100 then raise exception using errcode = '22023', message = 'INVALID_CREW_WALL_CARDS'; end if;
  delete from public.crew_wall_cards k where k.crew_id = candidate_crew;
  for card in select * from jsonb_array_elements(candidate_cards) loop
    if jsonb_typeof(card) <> 'object' or jsonb_typeof(card -> 'handle') <> 'string' or jsonb_typeof(card -> 'stage') <> 'number' or jsonb_typeof(card -> 'position') <> 'number'
       or (select count(*) from jsonb_object_keys(card)) <> 3 then
      raise exception using errcode = '22023', message = 'INVALID_CREW_WALL_CARDS';
    end if;
    if (card ->> 'stage')::numeric <> trunc((card ->> 'stage')::numeric) or (card ->> 'position')::numeric <> trunc((card ->> 'position')::numeric)
       or (card ->> 'stage')::integer not between 1 and candidate_stage_count or (card ->> 'position')::integer not between 0 and 99 then
      raise exception using errcode = '22023', message = 'INVALID_CREW_WALL_CARDS';
    end if;
    -- the handle must be a current ACTIVE member of THIS Crew (never a GamID from elsewhere)
    select m.entity_id into member from public.crew_members m join public.entities e on e.entity_id = m.entity_id
    where m.crew_id = candidate_crew and m.status = 'ACTIVE' and e.gamid_handle = private.normalize_handle(ltrim(card ->> 'handle', '@'));
    if member is null then raise exception using errcode = '22023', message = 'CREW_WALL_NOT_A_MEMBER', detail = card ->> 'handle'; end if;
    if member = any (seen) then raise exception using errcode = '22023', message = 'INVALID_CREW_WALL_CARDS'; end if;
    seen := seen || member;
    insert into public.crew_wall_cards (crew_id, entity_id, stage_no, position) values (candidate_crew, member, (card ->> 'stage')::smallint, (card ->> 'position')::smallint);
  end loop;
  update public.crew_walls w set stage_count = candidate_stage_count, revision = w.revision + 1, updated_at = now() where w.crew_id = candidate_crew returning w.revision into saved;
  return saved;
end;
$$;

create function private.set_crew_wall_published_impl(candidate_crew uuid, candidate_published boolean)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.crew_wall_owner_check(candidate_crew);
  if candidate_published is null then raise exception using errcode = '22023', message = 'INVALID_PUBLISHED'; end if;
  insert into public.crew_walls (crew_id) values (candidate_crew) on conflict (crew_id) do nothing;
  update public.crew_walls w set published = candidate_published, revision = w.revision + 1, updated_at = now() where w.crew_id = candidate_crew;
  return candidate_published;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Visitors and the owner's preview
-- ---------------------------------------------------------------------------------------------
create function private.crew_wall_view(candidate_crew uuid, candidate_preview boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'crew_id', c.crew_id, 'crew_name', c.name, 'game_key', c.game_key, 'game_name', g.display_name,
    'accent_color', gp.accent_color, 'stage_count', w.stage_count, 'published', w.published,
    'member_count', (select count(*) from public.crew_members a where a.crew_id = c.crew_id and a.status = 'ACTIVE'),
    'owner_handle', case when o.visibility = 'PUBLIC' then o.gamid_handle end,
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object('handle', e.gamid_handle, 'stage', k.stage_no, 'position', k.position, 'role', m.role)
               || case when candidate_preview then jsonb_build_object('public', e.visibility = 'PUBLIC') else '{}'::jsonb end
             order by k.stage_no, k.position)
      from public.crew_wall_cards k
      join public.crew_members m on m.crew_id = k.crew_id and m.entity_id = k.entity_id and m.status = 'ACTIVE'
      join public.entities e on e.entity_id = k.entity_id and e.entity_type = 'SOLO'
      where k.crew_id = c.crew_id and (candidate_preview or e.visibility = 'PUBLIC')), '[]'::jsonb))
  from public.crews c
  join public.crew_walls w on w.crew_id = c.crew_id
  join public.game_catalog g on g.game_key = c.game_key
  join public.entities o on o.entity_id = c.owner_entity_id
  left join public.game_presentation gp on gp.game_key = c.game_key
  where c.crew_id = candidate_crew;
$$;

create function private.get_public_crew_wall_impl(candidate_crew uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.crew_wall_view(w.crew_id, false) from public.crew_walls w where w.crew_id = candidate_crew and w.published;
$$;

create function private.get_crew_wall_preview_impl(candidate_crew uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.crew_wall_owner_check(candidate_crew);
  insert into public.crew_walls (crew_id) values (candidate_crew) on conflict (crew_id) do nothing;
  return private.crew_wall_view(candidate_crew, true);
end;
$$;

create function public.get_my_crew_wall(candidate_crew uuid) returns jsonb language sql volatile security invoker set search_path = '' as $$ select private.get_my_crew_wall_impl(candidate_crew); $$;
create function public.save_crew_wall(candidate_crew uuid, candidate_stage_count integer, candidate_cards jsonb, candidate_expected_revision bigint) returns bigint
  language sql volatile security invoker set search_path = '' as $$ select private.save_crew_wall_impl(candidate_crew, candidate_stage_count, candidate_cards, candidate_expected_revision); $$;
create function public.set_crew_wall_published(candidate_crew uuid, candidate_published boolean) returns boolean language sql volatile security invoker set search_path = '' as $$ select private.set_crew_wall_published_impl(candidate_crew, candidate_published); $$;
create function public.get_crew_wall_usage(candidate_crew uuid) returns table (stages_used integer, stages_allowed integer) language sql stable security invoker set search_path = '' as $$ select * from private.get_crew_wall_usage_impl(candidate_crew); $$;
create function public.get_crew_wall_preview(candidate_crew uuid) returns jsonb language sql volatile security invoker set search_path = '' as $$ select private.get_crew_wall_preview_impl(candidate_crew); $$;
create function public.get_public_crew_wall(candidate_crew uuid) returns jsonb language sql stable security invoker set search_path = '' as $$ select private.get_public_crew_wall_impl(candidate_crew); $$;

-- ---------------------------------------------------------------------------------------------
-- 8. Realtime
-- ---------------------------------------------------------------------------------------------
create function private.crew_wall_realtime_trigger()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  the_crew uuid := coalesce(new.crew_id, old.crew_id);
  touched uuid;
begin
  for touched in select m.entity_id from public.crew_members m where m.crew_id = the_crew and m.status = 'ACTIVE' loop
    perform private.broadcast_crew_entity(touched);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
-- every layout save and publish change updates the crew_walls row (revision), so ONE signal per change reaches every member; a card that disappears because a
-- membership ended is signalled by the membership change itself (crew_members_realtime, Slice 1)
create trigger crew_walls_realtime after insert or update on public.crew_walls for each row execute function private.crew_wall_realtime_trigger();

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------
revoke all on function
  private.crew_wall_cards_active_member(), private.crew_wall_stage_allowance(uuid), private.crew_role_of_me(uuid), private.crew_wall_owner_check(uuid),
  private.crew_wall_view(uuid, boolean), private.crew_wall_realtime_trigger()
from public, anon, authenticated, service_role;
revoke all on function
  private.get_my_crew_wall_impl(uuid), private.save_crew_wall_impl(uuid, integer, jsonb, bigint), private.set_crew_wall_published_impl(uuid, boolean),
  private.get_crew_wall_usage_impl(uuid), private.get_crew_wall_preview_impl(uuid), private.get_public_crew_wall_impl(uuid),
  public.get_my_crew_wall(uuid), public.save_crew_wall(uuid, integer, jsonb, bigint), public.set_crew_wall_published(uuid, boolean),
  public.get_crew_wall_usage(uuid), public.get_crew_wall_preview(uuid), public.get_public_crew_wall(uuid)
from public, anon, authenticated;
grant execute on function
  private.get_my_crew_wall_impl(uuid), private.save_crew_wall_impl(uuid, integer, jsonb, bigint), private.set_crew_wall_published_impl(uuid, boolean),
  private.get_crew_wall_usage_impl(uuid), private.get_crew_wall_preview_impl(uuid),
  public.get_my_crew_wall(uuid), public.save_crew_wall(uuid, integer, jsonb, bigint), public.set_crew_wall_published(uuid, boolean),
  public.get_crew_wall_usage(uuid), public.get_crew_wall_preview(uuid)
to authenticated;
grant execute on function private.get_public_crew_wall_impl(uuid), public.get_public_crew_wall(uuid) to anon, authenticated;
