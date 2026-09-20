-- Game playtime visibility (owner-controlled, provider-neutral, OFF by default). TESTING only.
--
-- Playtime / hours played is sensitive. Whatever a provider (Steam today; PlayStation, Xbox or others later) supplies, it must never reach the
-- public profile / Wall unless the OWNER explicitly turned playtime display ON. This migration adds that one owner-only switch and the single
-- server-side gate every future public game presenter must use. It deliberately does NOT add any public game display:
--   * discovered games stay PRIVATE (no table grant, no public function) exactly as before;
--   * get_public_identity / get_public_identity_by_qr are NOT touched (still no game data and no playtime of any kind);
--   * nothing here reads, changes, refreshes or discloses any game, connection, League row, Discord row or visibility flag.
--
-- Shape (same precedent as profiles.show_education_work): the switch lives on the row it controls (the owner's profile), defaults to false for
-- EVERY existing and future identity (no data-dependent backfill, so no provider or connection can switch it on by itself), and is flipped only by
-- the owner through an RPC that changes that single flag. It is independent of whether any game itself is shown.

alter table public.profiles add column show_game_playtime boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- Owner-facing (authenticated) implementations
-- ---------------------------------------------------------------------------------------------
create function private.get_my_game_display_settings_impl()
returns table (show_game_playtime boolean)
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

  return query select coalesce((select p.show_game_playtime from public.profiles p where p.entity_id = owned_entity_id), false);
end;
$$;

-- Flips ONE flag for the caller's own identity. It never touches a game, a connection, a section switch, a throttle or any timestamp.
create function private.set_my_game_playtime_visibility_impl(candidate_visible boolean)
returns table (show_game_playtime boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
  changed integer;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if candidate_visible is null then raise exception using errcode = '22023', message = 'INVALID_VISIBILITY'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  update public.profiles p set show_game_playtime = candidate_visible where p.entity_id = owned_entity_id;
  get diagnostics changed = row_count;
  if changed = 0 then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  return query select candidate_visible;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The gate for any FUTURE public game presenter. No client role can call it (called only from other private functions). Playtime may be shown
-- publicly only when the identity is published AND its owner switched playtime display ON; otherwise it must be omitted entirely.
-- ---------------------------------------------------------------------------------------------
create function private.public_game_playtime_allowed(candidate_entity_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select p.show_game_playtime and e.visibility = 'PUBLIC'
    from public.profiles p
    join public.entities e on e.entity_id = p.entity_id
    where p.entity_id = candidate_entity_id
  ), false);
$$;

-- ---------------------------------------------------------------------------------------------
-- Public wrappers (established security-invoker + private-impl pattern) and privileges
-- ---------------------------------------------------------------------------------------------
create function public.get_my_game_display_settings()
returns table (show_game_playtime boolean)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_game_display_settings_impl(); $$;

create function public.set_my_game_playtime_visibility(candidate_visible boolean)
returns table (show_game_playtime boolean)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.set_my_game_playtime_visibility_impl(candidate_visible); $$;

revoke all on function
  private.get_my_game_display_settings_impl(), private.set_my_game_playtime_visibility_impl(boolean), private.public_game_playtime_allowed(uuid),
  public.get_my_game_display_settings(), public.set_my_game_playtime_visibility(boolean)
from public, anon, authenticated;

grant execute on function
  private.get_my_game_display_settings_impl(), private.set_my_game_playtime_visibility_impl(boolean),
  public.get_my_game_display_settings(), public.set_my_game_playtime_visibility(boolean)
to authenticated;
