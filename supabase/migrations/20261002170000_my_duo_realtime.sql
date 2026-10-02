-- My Duo live state - private Realtime invalidation (GamID TESTING only).
--
-- The same mechanism Play Together already uses (20261001090000_play_together_realtime.sql): when a Duo relationship changes, the database broadcasts a tiny
-- "duo_changed" signal on each affected owner's PRIVATE topic identity:user:<auth uid>; an open Account page that hears it re-reads its own state through the
-- existing owner RPC (get_my_duo). The signal carries NO data ({"kind":"DUO"} only - no ids, handles or states), so nothing leaks through Realtime; what the page
-- shows is still decided by get_my_duo's authorization.
--
--   1. realtime.messages read policy: a signed-in user receives broadcasts only on their own identity:user:<uid> topic.
--   2. identity_relationships trigger: any insert / update / delete (request, accept, decline, cancel, end, replacement - each ended Duo row too - and a public switch)
--      signals the owners of BOTH GamIDs of that row (old and new row).
--   3. entities trigger: when a GamID's publication, display name or avatar changes, the GamIDs it has a Duo relationship or request with are signalled (their panel
--      shows "GamID not published", the name and the avatar).
-- Delivery can never roll back or block the canonical write (errors are swallowed, as in Play Together). No business rule, table or RPC changes.
-- Rollback: drop the two triggers, the three functions and the policy.

create policy "identity_relationship_broadcasts"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'identity:user:' || (select auth.uid())::text
);

create function private.broadcast_identity_entity(candidate_entity_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  candidate_user_id uuid;
begin
  if candidate_entity_id is null then return; end if;
  for candidate_user_id in
    select m.user_id from public.entity_memberships m where m.entity_id = candidate_entity_id and m.role = 'OWNER'
  loop
    begin
      perform realtime.send(jsonb_build_object('kind', 'DUO'), 'duo_changed', 'identity:user:' || candidate_user_id::text, true);
    exception when others then
      -- live delivery must never roll back the canonical My Duo transaction
      null;
    end;
  end loop;
end;
$$;

create function private.identity_relationships_realtime_trigger()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  touched uuid;
begin
  for touched in
    select distinct x from unnest(array[
      case when tg_op <> 'INSERT' then old.requester_entity_id end, case when tg_op <> 'INSERT' then old.addressee_entity_id end,
      case when tg_op <> 'DELETE' then new.requester_entity_id end, case when tg_op <> 'DELETE' then new.addressee_entity_id end
    ]) as x where x is not null
  loop
    perform private.broadcast_identity_entity(touched);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create function private.identity_entity_realtime_trigger()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  partner uuid;
begin
  for partner in
    select distinct case when r.requester_entity_id = new.entity_id then r.addressee_entity_id else r.requester_entity_id end
    from public.identity_relationships r
    where new.entity_id in (r.requester_entity_id, r.addressee_entity_id)
  loop
    perform private.broadcast_identity_entity(partner);
  end loop;
  return new;
end;
$$;

create trigger identity_relationships_realtime
after insert or update or delete on public.identity_relationships
for each row execute function private.identity_relationships_realtime_trigger();

create trigger entities_identity_realtime
after update of visibility, display_name, avatar_media_reference on public.entities
for each row
when (old.visibility is distinct from new.visibility or old.display_name is distinct from new.display_name or old.avatar_media_reference is distinct from new.avatar_media_reference)
execute function private.identity_entity_realtime_trigger();

revoke all on function
  private.broadcast_identity_entity(uuid), private.identity_relationships_realtime_trigger(), private.identity_entity_realtime_trigger()
from public, anon, authenticated, service_role;
