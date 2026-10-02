-- My Duo durable user-to-user notifications - GamID TESTING only.
--
-- Realtime (20261002170000_my_duo_realtime.sql) only reaches a page that is open at that moment; a person who is offline would come back to a Duo that silently
-- changed. So an action performed by ANOTHER person that affects you is now also stored, durably, as a notification that belongs to you alone, and stays pending
-- until it has actually been displayed to you:
--
--   1. public.identity_notifications   one row per affected person per event. Minimal and privacy-safe: who it is for, which GamID acted, the authoritative event
--                                      kind, when it happened, and when it was seen. No message text, handles or relationship ids are stored (the visible handle /
--                                      display name is resolved at read time, through the owner RPC). RLS on, NO client table privilege: owner RPCs only.
--        kinds  DUO_REQUEST_RECEIVED   someone sent you a Duo request                                   (written by send_duo_request)
--               DUO_REQUEST_CANCELLED  the sender withdrew the request they had sent you               (cancel_duo_request)
--               DUO_REQUEST_DECLINED   the person you asked declined                                    (respond_to_duo_request, decline)
--               DUO_REQUEST_ACCEPTED   the person you asked accepted - you are now Duo                  (respond_to_duo_request, accept)
--               DUO_ENDED              your Duo ended it                                                 (remove_my_duo)
--               DUO_REPLACED           your Duo ended because your Duo chose a new Duo                   (respond_to_duo_request, accept - each ended previous Duo)
--      The event kind comes from the action that happened (the RPC that performed it), never from comparing states. The person who acted gets no notification
--      (their own page already confirms their own action).
--   2. owner RPCs   get_my_duo_notifications()                    the caller's UNSEEN notifications, oldest first (notification_id is a monotonic identity), at most 50
--                   mark_my_duo_notifications_seen(ids bigint[])  marks only the caller's own unseen ones; called by the page only after it displayed them
--   3. delivery     every notification is written together with a relationship change that involves its recipient, and that change already sends the private,
--                   data-free duo_changed Realtime signal (20261002170000) - so an open page fetches it at once; an offline person fetches it on their next visit. Duplicates between the two paths are impossible to SHOW twice: the page shows each id once and
--                   only unseen rows are ever returned.
--   4. retention    opportunistic, per person, on every read: seen notifications are deleted 30 days after they were seen; any notification older than 90 days is
--                   deleted; at most 200 are kept per person (oldest beyond that are deleted). Deleting a GamID deletes its notifications (FK cascade).
--
-- The four action implementations are copied from 20261002150000_my_duo.sql and changed ONLY by adding the notification writes (same signatures, grants kept):
-- every rule, lock, error and result is unchanged.
-- Rollback: drop the new functions; drop table public.identity_notifications; restore the four *_impl functions from 20261002150000_my_duo.sql.

-- ---------------------------------------------------------------------------------------------
-- 1. The notifications
-- ---------------------------------------------------------------------------------------------
create table public.identity_notifications (
  notification_id bigint generated always as identity primary key,
  recipient_entity_id uuid not null references public.entities(entity_id) on delete cascade,
  actor_entity_id uuid not null references public.entities(entity_id) on delete cascade,
  kind text not null check (kind in ('DUO_REQUEST_RECEIVED', 'DUO_REQUEST_CANCELLED', 'DUO_REQUEST_DECLINED', 'DUO_REQUEST_ACCEPTED', 'DUO_ENDED', 'DUO_REPLACED')),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  constraint identity_notifications_not_self check (recipient_entity_id <> actor_entity_id)
);
comment on table public.identity_notifications is 'Durable user-to-user notifications (My Duo V1). Each row belongs to its recipient only; readable / markable only through the owner RPCs.';

create index identity_notifications_unseen_idx on public.identity_notifications (recipient_entity_id, notification_id) where seen_at is null;
create index identity_notifications_recipient_idx on public.identity_notifications (recipient_entity_id, created_at);
create index identity_notifications_actor_idx on public.identity_notifications (actor_entity_id);

alter table public.identity_notifications enable row level security;
revoke all on table public.identity_notifications from public, anon, authenticated;

create function private.identity_notify(candidate_recipient uuid, candidate_actor uuid, candidate_kind text)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.identity_notifications (recipient_entity_id, actor_entity_id, kind)
  select candidate_recipient, candidate_actor, candidate_kind
  where candidate_recipient is not null and candidate_actor is not null and candidate_recipient <> candidate_actor;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. The actions write the authoritative events (copied from 20261002150000_my_duo.sql; changed only where marked "notify")
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
  perform private.identity_notify(target, me, 'DUO_REQUEST_RECEIVED');   -- notify
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
    perform private.identity_notify(requester, me, 'DUO_REQUEST_DECLINED');   -- notify
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
      perform private.identity_notify(case when ended.requester_entity_id = me then ended.addressee_entity_id else ended.requester_entity_id end, me, 'DUO_REPLACED');
    end if;
    if requester in (ended.requester_entity_id, ended.addressee_entity_id) then
      perform private.identity_notify(case when ended.requester_entity_id = requester then ended.addressee_entity_id else ended.requester_entity_id end, requester, 'DUO_REPLACED');
    end if;
  end loop;
  delete from public.identity_relationships r
  where r.kind = 'DUO' and r.status = 'ACCEPTED'
    and (r.requester_entity_id in (me, requester) or r.addressee_entity_id in (me, requester));
  update public.identity_relationships r
  set status = 'ACCEPTED', accepted_at = now(), requester_shows_public = false, addressee_shows_public = false
  where r.relationship_id = request_id;
  perform private.identity_notify(requester, me, 'DUO_REQUEST_ACCEPTED');   -- notify
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
  perform private.identity_notify(target, me, 'DUO_REQUEST_CANCELLED');   -- notify
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
  if found then perform private.identity_notify(partner, me, 'DUO_ENDED'); end if;   -- notify
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Owner RPCs
-- ---------------------------------------------------------------------------------------------
-- The caller's UNSEEN notifications, oldest first. The acting GamID's @handle and display name are resolved now (never stored in the row). Retention runs here, on the
-- caller's own rows only.
create function private.get_my_duo_notifications_impl()
returns table (notification_id bigint, kind text, actor_handle text, actor_display_name text, created_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := private.identity_my_entity();
begin
  delete from public.identity_notifications n
  where n.recipient_entity_id = me
    and ((n.seen_at is not null and n.seen_at < now() - interval '30 days') or n.created_at < now() - interval '90 days');
  delete from public.identity_notifications n
  where n.recipient_entity_id = me
    and n.notification_id not in (select k.notification_id from public.identity_notifications k where k.recipient_entity_id = me order by k.notification_id desc limit 200);
  return query
  select n.notification_id, n.kind, a.gamid_handle, a.display_name, n.created_at
  from public.identity_notifications n
  join public.entities a on a.entity_id = n.actor_entity_id
  where n.recipient_entity_id = me and n.seen_at is null
  order by n.notification_id
  limit 50;
end;
$$;

-- Marks the given notifications seen - only the caller's own, only unseen ones (anything else is silently ignored). Returns how many were marked.
create function private.mark_my_duo_notifications_seen_impl(candidate_ids bigint[])
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := private.identity_my_entity();
  changed integer;
begin
  if candidate_ids is null or cardinality(candidate_ids) = 0 then return 0; end if;
  if cardinality(candidate_ids) > 100 then raise exception using errcode = '22023', message = 'TOO_MANY_NOTIFICATIONS'; end if;
  update public.identity_notifications n set seen_at = now()
  where n.recipient_entity_id = me and n.seen_at is null and n.notification_id = any (candidate_ids);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create function public.get_my_duo_notifications()
returns table (notification_id bigint, kind text, actor_handle text, actor_display_name text, created_at timestamptz)
language sql volatile security invoker set search_path = ''
as $$ select * from private.get_my_duo_notifications_impl(); $$;

create function public.mark_my_duo_notifications_seen(candidate_ids bigint[])
returns integer
language sql volatile security invoker set search_path = ''
as $$ select private.mark_my_duo_notifications_seen_impl(candidate_ids); $$;

revoke all on function private.identity_notify(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function
  private.get_my_duo_notifications_impl(), private.mark_my_duo_notifications_seen_impl(bigint[]),
  public.get_my_duo_notifications(), public.mark_my_duo_notifications_seen(bigint[])
from public, anon, authenticated;
grant execute on function
  private.get_my_duo_notifications_impl(), private.mark_my_duo_notifications_seen_impl(bigint[]),
  public.get_my_duo_notifications(), public.mark_my_duo_notifications_seen(bigint[])
to authenticated;
