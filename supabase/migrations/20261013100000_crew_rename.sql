-- Edit Crew Name (Mazen's explicit task "GAMID — Implement Edit Crew Name", 2026-10-13) - GamID TESTING only.
--
-- Changes ONE rule of My Crew V1 (20261003100000_my_crew.sql), by Mazen's decision: a Crew's NAME is no longer immutable - its OWNER may rename it. Its game, owner and
-- id stay immutable (private.crews_immutable still refuses those, CREW_IMMUTABLE), so a rename never moves the Crew to another game or person.
--   rename_crew(crew_id, name)   owner only (CREW_OWNER_ONLY, checked on the server under the Crew's row lock); the name is trimmed and follows exactly the create_crew
--                                rule (2-40 characters, no control characters, no < or >; INVALID_CREW_NAME); returns the stored name. Crew names have no uniqueness rule
--                                (none existed), so none is added.
-- A rename updates ONLY public.crews.name: the Crew id, game, owner, members, invitations, membership status, Crew Wall (stages, cards, published state) and every URL
-- (they use the crew id) are untouched. Every display reads the name live (get_my_crews, get_crew_members' Crew, the Crew Wall views, the public Crews sections), so the
-- new name shows everywhere at once. The existing data-free crew_changed signal is sent to the Crew's members and invitees so their open pages re-read it.
-- Notification contexts keep the name captured at their event (history is not rewritten).
-- Additive: one trigger function replaced (same signature), two new functions. No table, row or other function changes.
-- Rollback: restore private.crews_immutable() from 20261003100000_my_crew.sql and drop public.rename_crew(uuid, text) and private.rename_crew_impl(uuid, text).

-- copied from 20261003100000_my_crew.sql; changed ONLY: the name may change (game, owner and id still may not)
create or replace function private.crews_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.game_key is distinct from old.game_key or new.owner_entity_id is distinct from old.owner_entity_id or new.crew_id is distinct from old.crew_id then
    raise exception using errcode = '22023', message = 'CREW_IMMUTABLE';
  end if;
  return new;
end;
$$;

create function private.rename_crew_impl(candidate_crew uuid, candidate_name text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := private.identity_my_entity();
  crew public.crews%rowtype := private.crew_lock(candidate_crew);
  clean_name text := btrim(coalesce(candidate_name, ''));
  touched uuid;
begin
  if crew.owner_entity_id <> me then raise exception using errcode = '42501', message = 'CREW_OWNER_ONLY'; end if;
  if char_length(clean_name) not between 2 and 40 or clean_name ~ '[[:cntrl:]<>]' then raise exception using errcode = '22023', message = 'INVALID_CREW_NAME'; end if;
  if clean_name = crew.name then return clean_name; end if;
  update public.crews c set name = clean_name where c.crew_id = crew.crew_id;
  for touched in select m.entity_id from public.crew_members m where m.crew_id = crew.crew_id loop
    perform private.broadcast_crew_entity(touched);
  end loop;
  return clean_name;
end;
$$;

create function public.rename_crew(candidate_crew uuid, candidate_name text) returns text language sql volatile security invoker set search_path = '' as $$ select private.rename_crew_impl(candidate_crew, candidate_name); $$;

comment on table public.crews is 'My Crew: a GamID''s group of regular players for ONE game. Game and owner are immutable; the owner may rename it (rename_crew). Owner RPCs only.';

revoke all on function private.rename_crew_impl(uuid, text), public.rename_crew(uuid, text) from public, anon, authenticated;
grant execute on function private.rename_crew_impl(uuid, text), public.rename_crew(uuid, text) to authenticated;
