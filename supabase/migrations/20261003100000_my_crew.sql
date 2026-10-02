-- My Crew V1 - Slice 1: Crew identity + membership + notifications (GamID TESTING only).
--
-- My Crew = "the group of people I regularly like to play THIS game with". Not an esports team, not a Play Together session or lineup, not My Duo.
--
-- Why a Crew is NOT a row in public.entities: entities is the personal-GamID table (a unique @handle from the personal handle namespace, one SOLO per creator), and
-- many accepted functions resolve "my GamID" as "an entity this user OWNS" without filtering the entity type (some with LIMIT 1). A Crew entity owned by the same user
-- would make those ambiguous. So a Crew has its own tables, keyed by crew_id; Slice 2's Crew Mini Wall attaches to crew_id.
--
--   1. public.crews          id, game (FK to the existing public.game_catalog - no second catalog), name, owner GamID, created_at. Name, game and owner are
--                            IMMUTABLE (trigger), so changing either means deleting the Crew and creating another.
--   2. public.crew_members   one row per (crew, GamID): role OWNER | MEMBER, status INVITED | ACTIVE. The game is carried on the row (composite FK to the Crew, so it
--                            always equals the Crew's game) and:
--                              ONE CREW PER GAME   unique (entity_id, game_key) WHERE status = 'ACTIVE'   - a GamID is an active member of at most one Crew per game
--                              ONE OWNER           unique (crew_id) WHERE role = 'OWNER'
--   3. private.crew_policy   one row: max_members (15). Central so it can later become a plan limit. ACTIVE + pending invitations never exceed it.
--   4. Owner RPCs (signed-in; the caller is always auth.uid()'s own GamID; other GamIDs are named by @handle; a crew_id from the client is only ever a lookup key - every
--      action checks the caller's own role / invitation in that Crew):
--        create_crew(game_key, name)               the creator becomes the one OWNER (refused if they are already active in a Crew of that game)
--        invite_to_crew(crew_id, handle)           owner only; a real GamID, not yourself, not already invited / a member; within the member limit
--        cancel_crew_invite(crew_id, handle)       owner only
--        respond_to_crew_invite(crew_id, accept)   the invited GamID only; accepting re-checks one-Crew-per-game and the limit under a lock
--        remove_crew_member(crew_id, handle)       owner only, never the owner
--        leave_crew(crew_id)                       a MEMBER only; the owner cannot leave (V1: delete the Crew; no ownership transfer)
--        delete_crew(crew_id)                      owner only; ends every membership and invitation
--        get_my_crews()                            the caller's Crews and invitations
--        get_crew_members(crew_id)                 only for an ACTIVE member of that Crew (the owner also sees pending invitations)
--      Inviting someone who already has a Crew for that game is accepted and only refused when THEY accept - an invite never reveals someone's Crew membership.
--   5. Notifications - the accepted GamID system, not a second one: seven registered types (producer my_crew, destination account.my_crew), written by these RPCs
--      through private.notify, only to the people affected. public.notifications gains two OPTIONAL server-written columns that any producer may use: subject_id (the
--      object the notification is about, e.g. the Crew) and context (a small object of display facts captured at the event - here the Crew name and game - so
--      "X deleted Night Raiders" still reads correctly after the Crew is gone). get_my_notifications returns them.
--   6. Realtime - the existing private, data-free signal on identity:user:<auth uid> (policy identity_relationship_broadcasts) with a new event crew_changed, sent to
--      everyone a membership change concerns (the row's GamID, the Crew's owner and its active members). Delivery never rolls back the change.
-- Additive: new tables / functions / triggers, two nullable columns, nine notification types; get_my_notifications is recreated with two more output columns.
-- No My Duo object changes.

-- ---------------------------------------------------------------------------------------------
-- 1 + 2 + 3. Tables and policy
-- ---------------------------------------------------------------------------------------------
create table private.crew_policy (
  singleton boolean primary key default true check (singleton),
  max_members integer not null check (max_members between 2 and 500)
);
insert into private.crew_policy (max_members) values (15);
revoke all on table private.crew_policy from public, anon, authenticated;

create table public.crews (
  crew_id uuid primary key default gen_random_uuid(),
  game_key text not null references public.game_catalog(game_key) on delete restrict,
  name text not null check (char_length(name) between 2 and 40 and name = btrim(name) and name !~ '[[:cntrl:]<>]'),
  owner_entity_id uuid not null references public.entities(entity_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint crews_id_game_unique unique (crew_id, game_key)
);
comment on table public.crews is 'My Crew: a GamID''s group of regular players for ONE game. Name, game and owner are immutable. Owner RPCs only.';
create index crews_owner_idx on public.crews (owner_entity_id);
create index crews_game_idx on public.crews (game_key);

create table public.crew_members (
  crew_id uuid not null,
  game_key text not null,
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  role text not null check (role in ('OWNER', 'MEMBER')),
  status text not null check (status in ('INVITED', 'ACTIVE')),
  invited_by_entity_id uuid references public.entities(entity_id) on delete set null,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (crew_id, entity_id),
  constraint crew_members_crew_fk foreign key (crew_id, game_key) references public.crews (crew_id, game_key) on delete cascade,
  constraint crew_members_owner_active check (role <> 'OWNER' or status = 'ACTIVE'),
  constraint crew_members_joined check ((status = 'ACTIVE') = (joined_at is not null))
);
comment on table public.crew_members is 'My Crew membership and invitations. One ACTIVE Crew per GamID per game. Owner RPCs only.';
-- THE one-Crew-per-game rule, in the database itself
create unique index crew_members_one_active_crew_per_game on public.crew_members (entity_id, game_key) where status = 'ACTIVE';
create unique index crew_members_one_owner on public.crew_members (crew_id) where role = 'OWNER';
create index crew_members_entity_idx on public.crew_members (entity_id);

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
revoke all on table public.crews, public.crew_members from public, anon, authenticated;

-- name, game and owner never change (defense in depth: no client role can update these tables at all)
create function private.crews_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name or new.game_key is distinct from old.game_key or new.owner_entity_id is distinct from old.owner_entity_id or new.crew_id is distinct from old.crew_id then
    raise exception using errcode = '22023', message = 'CREW_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger crews_immutable before update on public.crews for each row execute function private.crews_immutable();

-- ---------------------------------------------------------------------------------------------
-- 5. Notifications: optional subject + context, the 5-argument producer, the Crew types
-- ---------------------------------------------------------------------------------------------
alter table public.notifications add column subject_id uuid;
alter table public.notifications add column context jsonb
  check (context is null or (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 600));
comment on column public.notifications.context is 'Small display facts captured by the producer at the event (e.g. a Crew name), written only by trusted server code.';

insert into public.notification_types (type_key, producer, destination) values
  ('crew.invite_received',  'my_crew', 'account.my_crew'),
  ('crew.invite_cancelled', 'my_crew', 'account.my_crew'),
  ('crew.invite_declined',  'my_crew', 'account.my_crew'),
  ('crew.invite_accepted',  'my_crew', 'account.my_crew'),
  ('crew.member_removed',   'my_crew', 'account.my_crew'),
  ('crew.member_left',      'my_crew', 'account.my_crew'),
  ('crew.deleted',          'my_crew', 'account.my_crew');

create function private.notify(candidate_recipient uuid, candidate_actor uuid, candidate_type text, candidate_subject uuid, candidate_context jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  created bigint;
begin
  if candidate_recipient is null or candidate_recipient is not distinct from candidate_actor then return null; end if;   -- nobody is notified of their own action
  if not exists (select 1 from public.notification_types t where t.type_key = candidate_type and t.active) then
    raise exception using errcode = '22023', message = 'UNKNOWN_NOTIFICATION_TYPE';
  end if;
  insert into public.notifications (recipient_entity_id, actor_entity_id, type_key, subject_id, context)
  values (candidate_recipient, candidate_actor, candidate_type, candidate_subject, candidate_context)
  returning notification_id into created;
  perform private.notification_cleanup(candidate_recipient);
  return created;
end;
$$;
-- the accepted 3-argument producer keeps its exact behaviour (no subject, no context)
create or replace function private.notify(candidate_recipient uuid, candidate_actor uuid, candidate_type text)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
begin
  return private.notify(candidate_recipient, candidate_actor, candidate_type, null, null);
end;
$$;

-- get_my_notifications: + subject_id, context (copied from 20261002210000_gamid_notifications.sql; only the two output columns are added)
drop function public.get_my_notifications(bigint, integer);
drop function private.get_my_notifications_impl(bigint, integer);
create function private.get_my_notifications_impl(candidate_before_id bigint, candidate_limit integer)
returns table (notification_id bigint, type_key text, producer text, destination text, actor_handle text, actor_display_name text, created_at timestamptz, read_at timestamptz, subject_id uuid, context jsonb)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := private.notifications_owner_entity();
  page integer := least(greatest(coalesce(candidate_limit, 30), 1), 50);
begin
  perform private.notification_cleanup(me);
  return query
  select n.notification_id, n.type_key, t.producer, t.destination, a.gamid_handle, a.display_name, n.created_at, n.read_at, n.subject_id, n.context
  from public.notifications n
  join public.notification_types t on t.type_key = n.type_key
  left join public.entities a on a.entity_id = n.actor_entity_id
  where n.recipient_entity_id = me and (candidate_before_id is null or n.notification_id < candidate_before_id)
  order by n.notification_id desc
  limit page;
end;
$$;
create function public.get_my_notifications(candidate_before_id bigint default null, candidate_limit integer default 30)
returns table (notification_id bigint, type_key text, producer text, destination text, actor_handle text, actor_display_name text, created_at timestamptz, read_at timestamptz, subject_id uuid, context jsonb)
language sql volatile security invoker set search_path = '' as $$ select * from private.get_my_notifications_impl(candidate_before_id, candidate_limit); $$;

-- ---------------------------------------------------------------------------------------------
-- 6. Realtime: crew_changed on the existing private identity topic
-- ---------------------------------------------------------------------------------------------
create function private.broadcast_crew_entity(candidate_entity_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  candidate_user_id uuid;
begin
  if candidate_entity_id is null then return; end if;
  for candidate_user_id in select m.user_id from public.entity_memberships m where m.entity_id = candidate_entity_id and m.role = 'OWNER'
  loop
    begin
      perform realtime.send(jsonb_build_object('kind', 'CREW'), 'crew_changed', 'identity:user:' || candidate_user_id::text, true);
    exception when others then
      null;   -- live delivery must never roll back the canonical Crew change
    end;
  end loop;
end;
$$;

create function private.crew_members_realtime_trigger()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  the_crew uuid := coalesce(new.crew_id, old.crew_id);
  touched uuid;
begin
  for touched in
    select distinct x from (
      select case when tg_op <> 'INSERT' then old.entity_id end as x
      union all select case when tg_op <> 'DELETE' then new.entity_id end
      union all select c.owner_entity_id from public.crews c where c.crew_id = the_crew
      union all select m.entity_id from public.crew_members m where m.crew_id = the_crew and m.status = 'ACTIVE'
    ) s where x is not null
  loop
    perform private.broadcast_crew_entity(touched);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger crew_members_realtime after insert or update or delete on public.crew_members
for each row execute function private.crew_members_realtime_trigger();

-- ---------------------------------------------------------------------------------------------
-- 4. Owner RPCs
-- ---------------------------------------------------------------------------------------------
create function private.crew_context(candidate_crew uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('crew_name', c.name, 'game_key', c.game_key, 'game_name', g.display_name)
  from public.crews c join public.game_catalog g on g.game_key = c.game_key where c.crew_id = candidate_crew;
$$;

create function private.crew_max_members()
returns integer language sql stable security definer set search_path = '' as $$ select p.max_members from private.crew_policy p where p.singleton; $$;

-- serialises every change to one Crew (row lock) and returns it; CREW_NOT_FOUND when it does not exist
create function private.crew_lock(candidate_crew uuid)
returns public.crews language plpgsql volatile security definer set search_path = '' as $$
declare
  found_crew public.crews%rowtype;
begin
  select * into found_crew from public.crews c where c.crew_id = candidate_crew for update;
  if not found then raise exception using errcode = 'P0002', message = 'CREW_NOT_FOUND'; end if;
  return found_crew;
end;
$$;

-- serialises one GamID's Crew membership changes for one game (create / accept)
create function private.crew_lock_game(candidate_entity uuid, candidate_game text)
returns void language plpgsql volatile set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('gamid.crew_game:' || candidate_entity::text || ':' || candidate_game, 0));
end;
$$;

create function private.create_crew_impl(candidate_game_key text, candidate_name text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := private.identity_my_entity();
  clean_name text := btrim(coalesce(candidate_name, ''));
  created uuid;
begin
  if not exists (select 1 from public.game_catalog g where g.game_key = candidate_game_key and g.is_active) then
    raise exception using errcode = '22023', message = 'GAME_NOT_FOUND';
  end if;
  if char_length(clean_name) not between 2 and 40 or clean_name ~ '[[:cntrl:]<>]' then raise exception using errcode = '22023', message = 'INVALID_CREW_NAME'; end if;
  perform private.crew_lock_game(me, candidate_game_key);
  if exists (select 1 from public.crew_members m where m.entity_id = me and m.game_key = candidate_game_key and m.status = 'ACTIVE') then
    raise exception using errcode = 'PT409', message = 'CREW_ALREADY_IN_GAME';
  end if;
  insert into public.crews (game_key, name, owner_entity_id) values (candidate_game_key, clean_name, me) returning crew_id into created;
  insert into public.crew_members (crew_id, game_key, entity_id, role, status, joined_at) values (created, candidate_game_key, me, 'OWNER', 'ACTIVE', now());
  return created;
end;
$$;

create function private.invite_to_crew_impl(candidate_crew uuid, candidate_handle text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := private.identity_my_entity();
  crew public.crews%rowtype := private.crew_lock(candidate_crew);
  target uuid := private.identity_entity_by_handle(candidate_handle);
begin
  if crew.owner_entity_id <> me then raise exception using errcode = '42501', message = 'CREW_OWNER_ONLY'; end if;
  if target = me then raise exception using errcode = '22023', message = 'CREW_SELF'; end if;
  if exists (select 1 from public.crew_members m where m.crew_id = crew.crew_id and m.entity_id = target) then
    raise exception using errcode = 'PT409', message = 'CREW_ALREADY_INVITED_OR_MEMBER';
  end if;
  if (select count(*) from public.crew_members m where m.crew_id = crew.crew_id) >= private.crew_max_members() then
    raise exception using errcode = '54000', message = 'CREW_FULL';
  end if;
  insert into public.crew_members (crew_id, game_key, entity_id, role, status, invited_by_entity_id) values (crew.crew_id, crew.game_key, target, 'MEMBER', 'INVITED', me);
  perform private.notify(target, me, 'crew.invite_received', crew.crew_id, private.crew_context(crew.crew_id));
  return 'INVITED';
end;
$$;

create function private.cancel_crew_invite_impl(candidate_crew uuid, candidate_handle text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := private.identity_my_entity();
  crew public.crews%rowtype := private.crew_lock(candidate_crew);
  target uuid := private.identity_entity_by_handle(candidate_handle);
begin
  if crew.owner_entity_id <> me then raise exception using errcode = '42501', message = 'CREW_OWNER_ONLY'; end if;
  delete from public.crew_members m where m.crew_id = crew.crew_id and m.entity_id = target and m.status = 'INVITED';
  if not found then raise exception using errcode = 'P0002', message = 'CREW_INVITE_NOT_FOUND'; end if;
  perform private.notify(target, me, 'crew.invite_cancelled', crew.crew_id, private.crew_context(crew.crew_id));
  return 'CANCELLED';
end;
$$;

create function private.respond_to_crew_invite_impl(candidate_crew uuid, candidate_accept boolean)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := private.identity_my_entity();
  crew public.crews%rowtype;
begin
  if candidate_accept is null then raise exception using errcode = '22023', message = 'INVALID_RESPONSE'; end if;
  crew := private.crew_lock(candidate_crew);
  if not exists (select 1 from public.crew_members m where m.crew_id = crew.crew_id and m.entity_id = me and m.status = 'INVITED') then
    raise exception using errcode = 'P0002', message = 'CREW_INVITE_NOT_FOUND';
  end if;
  if not candidate_accept then
    delete from public.crew_members m where m.crew_id = crew.crew_id and m.entity_id = me and m.status = 'INVITED';
    perform private.notify(crew.owner_entity_id, me, 'crew.invite_declined', crew.crew_id, private.crew_context(crew.crew_id));
    return 'DECLINED';
  end if;
  perform private.crew_lock_game(me, crew.game_key);
  if exists (select 1 from public.crew_members m where m.entity_id = me and m.game_key = crew.game_key and m.status = 'ACTIVE') then
    raise exception using errcode = 'PT409', message = 'CREW_ALREADY_IN_GAME';
  end if;
  if (select count(*) from public.crew_members m where m.crew_id = crew.crew_id and m.status = 'ACTIVE') >= private.crew_max_members() then
    raise exception using errcode = '54000', message = 'CREW_FULL';
  end if;
  update public.crew_members m set status = 'ACTIVE', joined_at = now() where m.crew_id = crew.crew_id and m.entity_id = me;
  perform private.notify(crew.owner_entity_id, me, 'crew.invite_accepted', crew.crew_id, private.crew_context(crew.crew_id));
  return 'ACCEPTED';
end;
$$;

create function private.remove_crew_member_impl(candidate_crew uuid, candidate_handle text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := private.identity_my_entity();
  crew public.crews%rowtype := private.crew_lock(candidate_crew);
  target uuid := private.identity_entity_by_handle(candidate_handle);
begin
  if crew.owner_entity_id <> me then raise exception using errcode = '42501', message = 'CREW_OWNER_ONLY'; end if;
  if target = me then raise exception using errcode = '22023', message = 'CREW_OWNER_CANNOT_BE_REMOVED'; end if;
  delete from public.crew_members m where m.crew_id = crew.crew_id and m.entity_id = target and m.status = 'ACTIVE';
  if not found then raise exception using errcode = 'P0002', message = 'CREW_MEMBER_NOT_FOUND'; end if;
  perform private.notify(target, me, 'crew.member_removed', crew.crew_id, private.crew_context(crew.crew_id));
  return 'REMOVED';
end;
$$;

create function private.leave_crew_impl(candidate_crew uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := private.identity_my_entity();
  crew public.crews%rowtype := private.crew_lock(candidate_crew);
begin
  if crew.owner_entity_id = me then raise exception using errcode = 'PT409', message = 'CREW_OWNER_CANNOT_LEAVE'; end if;
  delete from public.crew_members m where m.crew_id = crew.crew_id and m.entity_id = me and m.status = 'ACTIVE';
  if not found then raise exception using errcode = 'P0002', message = 'CREW_MEMBER_NOT_FOUND'; end if;
  perform private.notify(crew.owner_entity_id, me, 'crew.member_left', crew.crew_id, private.crew_context(crew.crew_id));
  return 'LEFT';
end;
$$;

create function private.delete_crew_impl(candidate_crew uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := private.identity_my_entity();
  crew public.crews%rowtype := private.crew_lock(candidate_crew);
  ctx jsonb;
  affected record;
begin
  if crew.owner_entity_id <> me then raise exception using errcode = '42501', message = 'CREW_OWNER_ONLY'; end if;
  ctx := private.crew_context(crew.crew_id);
  -- the affected people: every active member (the Crew they belong to is gone) and every pending invitee (their invitation is void)
  for affected in select m.entity_id, m.status from public.crew_members m where m.crew_id = crew.crew_id and m.entity_id <> me loop
    perform private.notify(affected.entity_id, me, case when affected.status = 'ACTIVE' then 'crew.deleted' else 'crew.invite_cancelled' end, crew.crew_id, ctx);
  end loop;
  delete from public.crews c where c.crew_id = crew.crew_id;   -- memberships and invitations go with it (FK cascade)
  return 'DELETED';
end;
$$;

-- the caller's Crews (ACTIVE) and invitations (INVITED), one row each
create function private.get_my_crews_impl()
returns table (crew_id uuid, game_key text, game_name text, crew_name text, my_role text, my_status text, owner_handle text, owner_display_name text, member_count integer, pending_count integer, max_members integer, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := private.identity_my_entity();
begin
  return query
  select c.crew_id, c.game_key, g.display_name, c.name, mine.role, mine.status, o.gamid_handle, o.display_name,
    (select count(*)::integer from public.crew_members a where a.crew_id = c.crew_id and a.status = 'ACTIVE'),
    case when c.owner_entity_id = me then (select count(*)::integer from public.crew_members p where p.crew_id = c.crew_id and p.status = 'INVITED') end,
    private.crew_max_members(), c.created_at
  from public.crew_members mine
  join public.crews c on c.crew_id = mine.crew_id
  join public.game_catalog g on g.game_key = c.game_key
  join public.entities o on o.entity_id = c.owner_entity_id
  where mine.entity_id = me
  order by mine.status, g.display_name, c.created_at;
end;
$$;

-- the members of a Crew the caller is an ACTIVE member of. Only what the GamID itself shows elsewhere to a signed-in user (handle, display name), and the avatar path
-- only while that GamID is published (the avatar is only readable then). The owner also sees pending invitations.
create function private.get_crew_members_impl(candidate_crew uuid)
returns table (gamid_handle text, display_name text, avatar_media_reference text, is_published boolean, role text, status text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := private.identity_my_entity();
  is_owner boolean;
begin
  if not exists (select 1 from public.crew_members m where m.crew_id = candidate_crew and m.entity_id = me and m.status = 'ACTIVE') then
    raise exception using errcode = '42501', message = 'CREW_MEMBERS_ONLY';
  end if;
  select c.owner_entity_id = me into is_owner from public.crews c where c.crew_id = candidate_crew;
  return query
  select e.gamid_handle, e.display_name, case when e.visibility = 'PUBLIC' then e.avatar_media_reference end, e.visibility = 'PUBLIC', m.role, m.status, m.joined_at
  from public.crew_members m join public.entities e on e.entity_id = m.entity_id
  where m.crew_id = candidate_crew and (m.status = 'ACTIVE' or is_owner)
  order by case when m.role = 'OWNER' then 0 when m.status = 'ACTIVE' then 1 else 2 end, coalesce(m.joined_at, m.created_at), e.gamid_handle;
end;
$$;

create function public.create_crew(candidate_game_key text, candidate_name text) returns uuid language sql volatile security invoker set search_path = '' as $$ select private.create_crew_impl(candidate_game_key, candidate_name); $$;
create function public.invite_to_crew(candidate_crew uuid, candidate_handle text) returns text language sql volatile security invoker set search_path = '' as $$ select private.invite_to_crew_impl(candidate_crew, candidate_handle); $$;
create function public.cancel_crew_invite(candidate_crew uuid, candidate_handle text) returns text language sql volatile security invoker set search_path = '' as $$ select private.cancel_crew_invite_impl(candidate_crew, candidate_handle); $$;
create function public.respond_to_crew_invite(candidate_crew uuid, candidate_accept boolean) returns text language sql volatile security invoker set search_path = '' as $$ select private.respond_to_crew_invite_impl(candidate_crew, candidate_accept); $$;
create function public.remove_crew_member(candidate_crew uuid, candidate_handle text) returns text language sql volatile security invoker set search_path = '' as $$ select private.remove_crew_member_impl(candidate_crew, candidate_handle); $$;
create function public.leave_crew(candidate_crew uuid) returns text language sql volatile security invoker set search_path = '' as $$ select private.leave_crew_impl(candidate_crew); $$;
create function public.delete_crew(candidate_crew uuid) returns text language sql volatile security invoker set search_path = '' as $$ select private.delete_crew_impl(candidate_crew); $$;
create function public.get_my_crews()
returns table (crew_id uuid, game_key text, game_name text, crew_name text, my_role text, my_status text, owner_handle text, owner_display_name text, member_count integer, pending_count integer, max_members integer, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.get_my_crews_impl(); $$;
create function public.get_crew_members(candidate_crew uuid)
returns table (gamid_handle text, display_name text, avatar_media_reference text, is_published boolean, role text, status text, joined_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.get_crew_members_impl(candidate_crew); $$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------
revoke all on function
  private.crews_immutable(), private.broadcast_crew_entity(uuid), private.crew_members_realtime_trigger(), private.crew_context(uuid), private.crew_max_members(),
  private.crew_lock(uuid), private.crew_lock_game(uuid, text), private.notify(uuid, uuid, text, uuid, jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.notify(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function
  private.create_crew_impl(text, text), private.invite_to_crew_impl(uuid, text), private.cancel_crew_invite_impl(uuid, text), private.respond_to_crew_invite_impl(uuid, boolean),
  private.remove_crew_member_impl(uuid, text), private.leave_crew_impl(uuid), private.delete_crew_impl(uuid), private.get_my_crews_impl(), private.get_crew_members_impl(uuid),
  public.create_crew(text, text), public.invite_to_crew(uuid, text), public.cancel_crew_invite(uuid, text), public.respond_to_crew_invite(uuid, boolean),
  public.remove_crew_member(uuid, text), public.leave_crew(uuid), public.delete_crew(uuid), public.get_my_crews(), public.get_crew_members(uuid),
  private.get_my_notifications_impl(bigint, integer), public.get_my_notifications(bigint, integer)
from public, anon, authenticated;
grant execute on function
  private.create_crew_impl(text, text), private.invite_to_crew_impl(uuid, text), private.cancel_crew_invite_impl(uuid, text), private.respond_to_crew_invite_impl(uuid, boolean),
  private.remove_crew_member_impl(uuid, text), private.leave_crew_impl(uuid), private.delete_crew_impl(uuid), private.get_my_crews_impl(), private.get_crew_members_impl(uuid),
  public.create_crew(text, text), public.invite_to_crew(uuid, text), public.cancel_crew_invite(uuid, text), public.respond_to_crew_invite(uuid, boolean),
  public.remove_crew_member(uuid, text), public.leave_crew(uuid), public.delete_crew(uuid), public.get_my_crews(), public.get_crew_members(uuid),
  private.get_my_notifications_impl(bigint, integer), public.get_my_notifications(bigint, integer)
to authenticated;
