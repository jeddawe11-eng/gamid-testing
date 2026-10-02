-- GamID Notifications foundation - a general, durable, per-person notification log (GamID TESTING only). My Duo is its first producer.
--
-- Evolves 20261002190000_my_duo_notifications.sql (not accepted / not merged) into ONE general system - no second table is left behind:
--   1. public.identity_notifications is RENAMED to public.notifications (rows, ids and order are kept) and generalised:
--        type_key     (was kind) a registered notification type, FK to public.notification_types; existing My Duo kinds are mapped to their new keys
--        actor_entity_id is nullable (a future system-produced notification may have no acting GamID)
--        read_at      (was seen_at). "Seen" used to mean "a toast was displayed"; that is NOT "read" in the new model, so every migrated row starts UNREAD.
--   2. public.notification_types - the registry of what may exist: type_key, producer, and a TYPED INTERNAL destination (a key such as 'account.my_duo', never a
--      URL). Future producers (Play Together, Teams, Tournaments, Verification, Connections ...) add rows here; none are added now.
--   3. private.notify(recipient, actor, type_key) - the ONE server-side producer entry point. Not executable by anon / authenticated / service_role clients, and no
--      client role has any privilege on the tables, so a browser can never create (forge) a notification for anyone. Trusted product code (SECURITY DEFINER RPCs such
--      as the My Duo actions) calls it in the same transaction as the event.
--   4. Owner RPCs (signed-in, owner = auth.uid()'s GamID; everything else is invisible):
--        get_my_notifications(before_id, limit)   the caller's log, NEWEST first, keyset-paged (read and unread)
--        get_my_unread_notification_count()       the bell badge
--        mark_my_notifications_read(ids)          the caller's own unread ones among ids
--        mark_all_my_notifications_read(up_to_id) every unread one up to the newest id the caller has loaded (a notification that arrives a moment later stays unread)
--   5. Realtime: a private, data-free "notifications_changed" signal on notifications:user:<auth uid> whenever a notification is created or read (the bell updates in
--      every open tab; a new one can be shown as a live toast). Delivery never rolls back the event. The database stays the source of truth.
--   6. Retention, centralised in private.notification_policy (one row, changeable later): notifications are kept for 90 days whether read or not, and at most the
--      newest 500 per person (enforced when a new one is written). Reading never deletes. Deleting a GamID deletes its notifications (FK cascade).
--   7. The My Duo actions (copied from 20261002190000, unchanged except that they call private.notify with the new type keys).
-- Old objects removed: get_my_duo_notifications(), mark_my_duo_notifications_seen(bigint[]), private.identity_notify(...) and their *_impl functions.

-- ---------------------------------------------------------------------------------------------
-- 1 + 2. Registry and the generalised table
-- ---------------------------------------------------------------------------------------------
create table public.notification_types (
  type_key text primary key check (type_key ~ '^[a-z][a-z0-9_]{1,30}\.[a-z][a-z0-9_]{1,40}$'),
  producer text not null check (producer ~ '^[a-z][a-z0-9_]{1,30}$'),
  destination text check (destination is null or destination ~ '^[a-z][a-z0-9_]{1,30}\.[a-z][a-z0-9_]{1,40}$'),   -- typed internal destination key, never a URL
  active boolean not null default true
);
comment on table public.notification_types is 'Registered GamID notification types: producer and typed internal destination (never a URL). Server-managed.';
insert into public.notification_types (type_key, producer, destination) values
  ('duo.request_received',  'my_duo', 'account.my_duo'),
  ('duo.request_cancelled', 'my_duo', 'account.my_duo'),
  ('duo.request_declined',  'my_duo', 'account.my_duo'),
  ('duo.request_accepted',  'my_duo', 'account.my_duo'),
  ('duo.ended',             'my_duo', 'account.my_duo'),
  ('duo.replaced',          'my_duo', 'account.my_duo');
alter table public.notification_types enable row level security;
revoke all on table public.notification_types from public, anon, authenticated;

drop trigger if exists identity_notifications_realtime on public.identity_notifications;
alter table public.identity_notifications rename to notifications;
alter table public.notifications rename column kind to type_key;
alter table public.notifications rename column seen_at to read_at;
alter table public.notifications drop constraint identity_notifications_kind_check;
update public.notifications set type_key = case type_key
  when 'DUO_REQUEST_RECEIVED' then 'duo.request_received' when 'DUO_REQUEST_CANCELLED' then 'duo.request_cancelled'
  when 'DUO_REQUEST_DECLINED' then 'duo.request_declined' when 'DUO_REQUEST_ACCEPTED' then 'duo.request_accepted'
  when 'DUO_ENDED' then 'duo.ended' when 'DUO_REPLACED' then 'duo.replaced' else type_key end;
update public.notifications set read_at = null;   -- a displayed toast was never "read" (see 1.)
alter table public.notifications add constraint notifications_type_fk foreign key (type_key) references public.notification_types(type_key) on delete restrict;
alter table public.notifications alter column actor_entity_id drop not null;
alter table public.notifications rename constraint identity_notifications_not_self to notifications_not_self;
alter table public.notifications rename constraint identity_notifications_recipient_entity_id_fkey to notifications_recipient_entity_id_fkey;
alter table public.notifications rename constraint identity_notifications_actor_entity_id_fkey to notifications_actor_entity_id_fkey;
alter index public.identity_notifications_pkey rename to notifications_pkey;
drop index public.identity_notifications_unseen_idx;
drop index public.identity_notifications_recipient_idx;
alter index public.identity_notifications_actor_idx rename to notifications_actor_idx;
create index notifications_recipient_newest_idx on public.notifications (recipient_entity_id, notification_id desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_entity_id) where read_at is null;
create index notifications_type_idx on public.notifications (type_key);
alter sequence public.identity_notifications_notification_id_seq rename to notifications_notification_id_seq;
comment on table public.notifications is 'The GamID notification log: one row per recipient per event. Owner RPCs only; created only by trusted server code through private.notify.';
-- RLS stays enabled and every client privilege stays revoked (carried over by the rename); re-asserted:
alter table public.notifications enable row level security;
revoke all on table public.notifications from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Retention policy (one row, centralised)
-- ---------------------------------------------------------------------------------------------
create table private.notification_policy (
  singleton boolean primary key default true check (singleton),
  retention_days integer not null check (retention_days between 1 and 3650),
  max_per_recipient integer not null check (max_per_recipient between 10 and 100000)
);
insert into private.notification_policy (retention_days, max_per_recipient) values (90, 500);
revoke all on table private.notification_policy from public, anon, authenticated;

-- removes one person's notifications that are past the policy (age, then the oldest beyond the cap). Read status is irrelevant: reading never deletes.
create function private.notification_cleanup(candidate_recipient uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  policy private.notification_policy%rowtype;
begin
  select * into policy from private.notification_policy where singleton;
  delete from public.notifications n where n.recipient_entity_id = candidate_recipient and n.created_at < now() - make_interval(days => policy.retention_days);
  delete from public.notifications n
  where n.recipient_entity_id = candidate_recipient
    and n.notification_id < coalesce((select k.notification_id from public.notifications k where k.recipient_entity_id = candidate_recipient
                                      order by k.notification_id desc offset policy.max_per_recipient - 1 limit 1), 0);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. The one producer entry point (server-only)
-- ---------------------------------------------------------------------------------------------
create function private.notify(candidate_recipient uuid, candidate_actor uuid, candidate_type text)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  created bigint;
begin
  if candidate_recipient is null or candidate_recipient is not distinct from candidate_actor then return null; end if;   -- nobody is notified of their own action
  if not exists (select 1 from public.notification_types t where t.type_key = candidate_type and t.active) then
    raise exception using errcode = '22023', message = 'UNKNOWN_NOTIFICATION_TYPE';
  end if;
  insert into public.notifications (recipient_entity_id, actor_entity_id, type_key) values (candidate_recipient, candidate_actor, candidate_type)
  returning notification_id into created;
  perform private.notification_cleanup(candidate_recipient);
  return created;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Realtime wake-up (private, data-free)
-- ---------------------------------------------------------------------------------------------
create policy "gamid_notification_broadcasts"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'notifications:user:' || (select auth.uid())::text
);

create function private.notifications_realtime_trigger()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  candidate_user_id uuid;
begin
  for candidate_user_id in
    select m.user_id from public.entity_memberships m where m.entity_id = new.recipient_entity_id and m.role = 'OWNER'
  loop
    begin
      perform realtime.send(jsonb_build_object('kind', 'NOTIFICATIONS'), 'notifications_changed', 'notifications:user:' || candidate_user_id::text, true);
    exception when others then
      null;   -- live delivery must never roll back the event that produced the notification
    end;
  end loop;
  return new;
end;
$$;
create trigger notifications_realtime
after insert or update of read_at on public.notifications
for each row execute function private.notifications_realtime_trigger();

-- ---------------------------------------------------------------------------------------------
-- 4. Owner RPCs
-- ---------------------------------------------------------------------------------------------
create function private.notifications_owner_entity()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  owned uuid;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select e.entity_id into owned from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO' limit 1;
  if owned is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;
  return owned;
end;
$$;

-- the caller's log, newest first; candidate_before_id pages to older ones. The acting GamID's @handle / display name are resolved now (never stored).
create function private.get_my_notifications_impl(candidate_before_id bigint, candidate_limit integer)
returns table (notification_id bigint, type_key text, producer text, destination text, actor_handle text, actor_display_name text, created_at timestamptz, read_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := private.notifications_owner_entity();
  page integer := least(greatest(coalesce(candidate_limit, 30), 1), 50);
begin
  perform private.notification_cleanup(me);
  return query
  select n.notification_id, n.type_key, t.producer, t.destination, a.gamid_handle, a.display_name, n.created_at, n.read_at
  from public.notifications n
  join public.notification_types t on t.type_key = n.type_key
  left join public.entities a on a.entity_id = n.actor_entity_id
  where n.recipient_entity_id = me and (candidate_before_id is null or n.notification_id < candidate_before_id)
  order by n.notification_id desc
  limit page;
end;
$$;

create function private.get_my_unread_notification_count_impl()
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := private.notifications_owner_entity();
begin
  return (select count(*)::integer from public.notifications n where n.recipient_entity_id = me and n.read_at is null);
end;
$$;

create function private.mark_my_notifications_read_impl(candidate_ids bigint[])
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := private.notifications_owner_entity();
  changed integer;
begin
  if candidate_ids is null or cardinality(candidate_ids) = 0 then return 0; end if;
  if cardinality(candidate_ids) > 100 then raise exception using errcode = '22023', message = 'TOO_MANY_NOTIFICATIONS'; end if;
  update public.notifications n set read_at = now() where n.recipient_entity_id = me and n.read_at is null and n.notification_id = any (candidate_ids);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create function private.mark_all_my_notifications_read_impl(candidate_up_to_id bigint)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := private.notifications_owner_entity();
  changed integer;
begin
  if candidate_up_to_id is null then raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_ID'; end if;
  update public.notifications n set read_at = now() where n.recipient_entity_id = me and n.read_at is null and n.notification_id <= candidate_up_to_id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create function public.get_my_notifications(candidate_before_id bigint default null, candidate_limit integer default 30)
returns table (notification_id bigint, type_key text, producer text, destination text, actor_handle text, actor_display_name text, created_at timestamptz, read_at timestamptz)
language sql volatile security invoker set search_path = '' as $$ select * from private.get_my_notifications_impl(candidate_before_id, candidate_limit); $$;
create function public.get_my_unread_notification_count()
returns integer language sql stable security invoker set search_path = '' as $$ select private.get_my_unread_notification_count_impl(); $$;
create function public.mark_my_notifications_read(candidate_ids bigint[])
returns integer language sql volatile security invoker set search_path = '' as $$ select private.mark_my_notifications_read_impl(candidate_ids); $$;
create function public.mark_all_my_notifications_read(candidate_up_to_id bigint)
returns integer language sql volatile security invoker set search_path = '' as $$ select private.mark_all_my_notifications_read_impl(candidate_up_to_id); $$;

-- ---------------------------------------------------------------------------------------------
-- 7. My Duo, the first producer (copied from 20261002190000_my_duo_notifications.sql; only the notification call changes: private.notify + the new type keys)
-- ---------------------------------------------------------------------------------------------
create or replace function private.send_duo_request_impl(candidate_handle text, candidate_replace_confirmed boolean)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := private.identity_my_entity();
  target uuid := private.identity_entity_by_handle(candidate_handle);
  existing public.identity_relationships%rowtype;
begin
  if target = me then raise exception using errcode = '22023', message = 'DUO_SELF'; end if;
  perform private.identity_lock_pair(me, target);
  select * into existing from public.identity_relationships r
  where r.kind = 'DUO' and least(r.requester_entity_id, r.addressee_entity_id) = least(me, target) and greatest(r.requester_entity_id, r.addressee_entity_id) = greatest(me, target);
  if found then
    if existing.status = 'ACCEPTED' then raise exception using errcode = 'PT409', message = 'DUO_ALREADY_YOURS'; end if;
    if existing.requester_entity_id = me then raise exception using errcode = 'PT409', message = 'DUO_REQUEST_ALREADY_SENT'; end if;
    raise exception using errcode = 'PT409', message = 'DUO_REQUEST_FROM_THEM';
  end if;
  if exists (select 1 from public.identity_relationships r where r.kind = 'DUO' and r.status = 'PENDING' and r.requester_entity_id = me) then
    raise exception using errcode = 'PT409', message = 'DUO_REQUEST_PENDING';
  end if;
  if exists (select 1 from public.identity_relationships r where r.kind = 'DUO' and r.status = 'ACCEPTED' and me in (r.requester_entity_id, r.addressee_entity_id))
     and candidate_replace_confirmed is not true then
    raise exception using errcode = 'PT409', message = 'DUO_REPLACE_CONFIRMATION_REQUIRED';
  end if;
  if (select count(*) from public.identity_relationships r where r.kind = 'DUO' and r.status = 'PENDING' and r.addressee_entity_id = target) >= 25 then
    raise exception using errcode = '54000', message = 'DUO_REQUESTS_FULL';
  end if;
  insert into public.identity_relationships (kind, requester_entity_id, addressee_entity_id) values ('DUO', me, target);
  perform private.notify(target, me, 'duo.request_received');   -- notify
  return 'SENT';
end;
$$;

create or replace function private.respond_to_duo_request_impl(candidate_handle text, candidate_accept boolean, candidate_replace_confirmed boolean)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := private.identity_my_entity();
  requester uuid := private.identity_entity_by_handle(candidate_handle);
  request_id uuid;
  ended public.identity_relationships%rowtype;
begin
  if candidate_accept is null then raise exception using errcode = '22023', message = 'INVALID_RESPONSE'; end if;
  perform private.identity_lock_pair(me, requester);
  select r.relationship_id into request_id from public.identity_relationships r
  where r.kind = 'DUO' and r.status = 'PENDING' and r.requester_entity_id = requester and r.addressee_entity_id = me;
  if request_id is null then raise exception using errcode = 'P0002', message = 'DUO_REQUEST_NOT_FOUND'; end if;
  if not candidate_accept then
    delete from public.identity_relationships r where r.relationship_id = request_id;
    perform private.notify(requester, me, 'duo.request_declined');   -- notify
    return 'DECLINED';
  end if;
  if exists (select 1 from public.identity_relationships r where r.kind = 'DUO' and r.status = 'ACCEPTED' and me in (r.requester_entity_id, r.addressee_entity_id))
     and candidate_replace_confirmed is not true then
    raise exception using errcode = 'PT409', message = 'DUO_REPLACE_CONFIRMATION_REQUIRED';
  end if;
  -- notify: each previous Duo that this acceptance ends hears that their Duo (me or the requester) chose a new Duo
  for ended in
    select * from public.identity_relationships r
    where r.kind = 'DUO' and r.status = 'ACCEPTED'
      and (r.requester_entity_id in (me, requester) or r.addressee_entity_id in (me, requester))
  loop
    if me in (ended.requester_entity_id, ended.addressee_entity_id) then
      perform private.notify(case when ended.requester_entity_id = me then ended.addressee_entity_id else ended.requester_entity_id end, me, 'duo.replaced');
    end if;
    if requester in (ended.requester_entity_id, ended.addressee_entity_id) then
      perform private.notify(case when ended.requester_entity_id = requester then ended.addressee_entity_id else ended.requester_entity_id end, requester, 'duo.replaced');
    end if;
  end loop;
  delete from public.identity_relationships r
  where r.kind = 'DUO' and r.status = 'ACCEPTED'
    and (r.requester_entity_id in (me, requester) or r.addressee_entity_id in (me, requester));
  update public.identity_relationships r
  set status = 'ACCEPTED', accepted_at = now(), requester_shows_public = false, addressee_shows_public = false
  where r.relationship_id = request_id;
  perform private.notify(requester, me, 'duo.request_accepted');   -- notify
  return 'ACCEPTED';
end;
$$;

create or replace function private.cancel_duo_request_impl(candidate_handle text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := private.identity_my_entity();
  target uuid := private.identity_entity_by_handle(candidate_handle);
begin
  perform private.identity_lock_pair(me, target);
  delete from public.identity_relationships r where r.kind = 'DUO' and r.status = 'PENDING' and r.requester_entity_id = me and r.addressee_entity_id = target;
  if not found then raise exception using errcode = 'P0002', message = 'DUO_REQUEST_NOT_FOUND'; end if;
  perform private.notify(target, me, 'duo.request_cancelled');   -- notify
  return 'CANCELLED';
end;
$$;

create or replace function private.remove_my_duo_impl()
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := private.identity_my_entity();
  partner uuid;
begin
  select case when r.requester_entity_id = me then r.addressee_entity_id else r.requester_entity_id end into partner
  from public.identity_relationships r where r.kind = 'DUO' and r.status = 'ACCEPTED' and me in (r.requester_entity_id, r.addressee_entity_id);
  if partner is null then return false; end if;
  perform private.identity_lock_pair(me, partner);
  delete from public.identity_relationships r where r.kind = 'DUO' and r.status = 'ACCEPTED' and me in (r.requester_entity_id, r.addressee_entity_id);
  if found then perform private.notify(partner, me, 'duo.ended'); end if;   -- notify
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The superseded My-Duo-only objects
-- ---------------------------------------------------------------------------------------------
drop function public.get_my_duo_notifications();
drop function public.mark_my_duo_notifications_seen(bigint[]);
drop function private.get_my_duo_notifications_impl();
drop function private.mark_my_duo_notifications_seen_impl(bigint[]);
drop function private.identity_notify(uuid, uuid, text);
drop function if exists private.identity_notifications_realtime_trigger();

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------
revoke all on function
  private.notify(uuid, uuid, text), private.notification_cleanup(uuid), private.notifications_realtime_trigger(), private.notifications_owner_entity()
from public, anon, authenticated, service_role;
revoke all on function
  private.get_my_notifications_impl(bigint, integer), private.get_my_unread_notification_count_impl(), private.mark_my_notifications_read_impl(bigint[]), private.mark_all_my_notifications_read_impl(bigint),
  public.get_my_notifications(bigint, integer), public.get_my_unread_notification_count(), public.mark_my_notifications_read(bigint[]), public.mark_all_my_notifications_read(bigint)
from public, anon, authenticated;
grant execute on function
  private.get_my_notifications_impl(bigint, integer), private.get_my_unread_notification_count_impl(), private.mark_my_notifications_read_impl(bigint[]), private.mark_all_my_notifications_read_impl(bigint),
  public.get_my_notifications(bigint, integer), public.get_my_unread_notification_count(), public.mark_my_notifications_read(bigint[]), public.mark_all_my_notifications_read(bigint)
to authenticated;
