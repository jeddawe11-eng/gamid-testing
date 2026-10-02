-- My Duo V1 - a mutual GamID-to-GamID identity relationship - GamID TESTING only.
--
-- My Duo is NOT an Official Team and NOT a Play Together Squad: it is one GamID naming another real GamID as its regular gaming partner, and it exists only after
-- BOTH agreed (A requests, B accepts). It is kept apart from Play Together's "Avoid playing with", which stays a matchmaking preference, not a block system.
--
--   1. public.identity_relationships   provider-neutral GamID-to-GamID relationships. The only kind today is 'DUO' (Official Team / Organization are future kinds,
--                                      deliberately not built). One row per pair and kind: PENDING (a request) or ACCEPTED (the relationship). Ending, declining or
--                                      cancelling deletes the row (V1 keeps no history). No client role has any table privilege: owner RPCs only.
--   2. Rules, enforced on the server:
--        - a Duo is another real GamID (a SOLO entity); never yourself                                    DUO_SELF / GAMID_NOT_FOUND
--        - at most ONE accepted Duo per GamID (two partial unique indexes + a cross-column trigger)
--        - at most one outgoing request at a time; at most 25 incoming requests waiting per GamID         DUO_REQUEST_PENDING / DUO_REQUESTS_FULL
--        - a pending request never touches the current Duo
--        - accepting makes the new Duo and, in the SAME transaction, ends the previous accepted Duo of BOTH participants. Both GamIDs are locked first (transaction
--          advisory locks in a fixed order), so concurrent accepts / requests involving either GamID are serialized and the invariant cannot race.
--        - sending a request or accepting one while you already have a Duo requires an explicit confirmation (the UI's warning)   DUO_REPLACE_CONFIRMATION_REQUIRED
--        - every action names the OTHER GamID by its @handle and acts only on rows the caller is part of; no relationship id is ever accepted from a client
--   3. Public display: each participant has their own switch (on the relationship row, OFF by default, so a new Duo never inherits an old "ON"). The public GamID
--      (get_public_identity / get_public_identity_by_qr, one implementation) gains a 'duo' section ONLY while: the Duo is accepted, the owner's switch is ON, and the
--      Duo's own GamID is published. Unpublishing the Duo's GamID hides it at once without deleting the relationship. Only handle, display name and avatar path.
--   4. Wall: the 'gamid' element accepts block 'duo' (mirrors dist/wall-kit/gamid.js; the shared corpus keeps the JS and database validators identical).
--
-- Additive: one new table, new functions, one trigger; get_public_identity_impl and wall_element_payload_errors are replaced with the same signatures (copied from
-- their latest definitions, changed only as noted). No existing row is written.
-- Rollback: drop the new public/private functions; drop table public.identity_relationships; restore get_public_identity_impl from
-- 20260927130000_steam_public_persona.sql and wall_element_payload_errors from 20260930160000_wall_video_layers_other_link.sql.

-- ---------------------------------------------------------------------------------------------
-- 1. Relationships
-- ---------------------------------------------------------------------------------------------
create table public.identity_relationships (
  relationship_id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('DUO')),
  requester_entity_id uuid not null references public.entities(entity_id) on delete cascade,
  addressee_entity_id uuid not null references public.entities(entity_id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED')),
  requester_shows_public boolean not null default false,
  addressee_shows_public boolean not null default false,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint identity_relationships_not_self check (requester_entity_id <> addressee_entity_id),
  constraint identity_relationships_accepted_at check ((status = 'ACCEPTED') = (accepted_at is not null)),
  -- a public switch only exists on an accepted relationship
  constraint identity_relationships_public_only_accepted check (status = 'ACCEPTED' or not (requester_shows_public or addressee_shows_public))
);
comment on table public.identity_relationships is 'Mutual GamID-to-GamID relationships (kind DUO). Readable and writable only through the owner RPCs and the public identity boundary.';

-- one row per pair and kind, whichever side asked
create unique index identity_relationships_one_per_pair
  on public.identity_relationships (kind, least(requester_entity_id, addressee_entity_id), greatest(requester_entity_id, addressee_entity_id));
-- one outgoing request at a time
create unique index identity_relationships_one_outgoing_request on public.identity_relationships (kind, requester_entity_id) where status = 'PENDING';
-- one accepted relationship per GamID on each side (the trigger below covers a GamID appearing on both sides)
create unique index identity_relationships_one_accepted_requester on public.identity_relationships (kind, requester_entity_id) where status = 'ACCEPTED';
create unique index identity_relationships_one_accepted_addressee on public.identity_relationships (kind, addressee_entity_id) where status = 'ACCEPTED';
create index identity_relationships_addressee_idx on public.identity_relationships (addressee_entity_id);

alter table public.identity_relationships enable row level security;
revoke all on table public.identity_relationships from public, anon, authenticated;

-- Defense in depth: a GamID is never in two accepted relationships of one kind, whichever side it is on.
create function private.identity_relationships_one_accepted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'ACCEPTED' and exists (
    select 1 from public.identity_relationships r
    where r.kind = new.kind and r.status = 'ACCEPTED' and r.relationship_id <> new.relationship_id
      and (r.requester_entity_id in (new.requester_entity_id, new.addressee_entity_id) or r.addressee_entity_id in (new.requester_entity_id, new.addressee_entity_id))
  ) then
    raise exception using errcode = '23505', message = 'DUO_ALREADY_ACCEPTED';
  end if;
  return new;
end;
$$;
create trigger identity_relationships_one_accepted
after insert or update of status, requester_entity_id, addressee_entity_id on public.identity_relationships
for each row execute function private.identity_relationships_one_accepted();

-- ---------------------------------------------------------------------------------------------
-- 2. Helpers (callable only by the SECURITY DEFINER implementations below)
-- ---------------------------------------------------------------------------------------------
-- The caller's own GamID (owner from auth.uid()).
create function private.identity_my_entity()
returns uuid
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
  return owned_entity_id;
end;
$$;

-- Another real GamID by its @handle (published or not), or raises GAMID_NOT_FOUND.
create function private.identity_entity_by_handle(candidate_handle text)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  found_id uuid;
begin
  select e.entity_id into found_id
  from public.entities e
  where e.gamid_handle = private.normalize_handle(ltrim(btrim(coalesce(candidate_handle, '')), '@'))
    and e.entity_type = 'SOLO'
  limit 1;
  if found_id is null then raise exception using errcode = 'P0002', message = 'GAMID_NOT_FOUND'; end if;
  return found_id;
end;
$$;

-- Serializes every relationship change involving either GamID (transaction-scoped; fixed order, so two GamIDs never deadlock).
create function private.identity_lock_pair(first_entity uuid, second_entity uuid)
returns void
language plpgsql volatile
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('gamid.identity_relationship:' || least(first_entity, second_entity)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('gamid.identity_relationship:' || greatest(first_entity, second_entity)::text, 0));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Owner RPCs (signed-in owner only; the owner is always auth.uid()'s own GamID)
-- ---------------------------------------------------------------------------------------------
-- The caller's Duo state: their accepted Duo (relation DUO), their outgoing request (SENT) and the requests waiting for them (RECEIVED). The other GamID's avatar
-- path is returned only while that GamID is published (it is only readable then anyway).
create function private.get_my_duo_impl()
returns table (relation text, gamid_handle text, display_name text, avatar_media_reference text, is_published boolean, show_public boolean, created_at timestamptz, accepted_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := private.identity_my_entity();
begin
  return query
  select case when r.status = 'ACCEPTED' then 'DUO' when r.requester_entity_id = me then 'SENT' else 'RECEIVED' end,
    o.gamid_handle, o.display_name,
    case when o.visibility = 'PUBLIC' then o.avatar_media_reference end,
    o.visibility = 'PUBLIC',
    case when r.status <> 'ACCEPTED' then false when r.requester_entity_id = me then r.requester_shows_public else r.addressee_shows_public end,
    r.created_at, r.accepted_at
  from public.identity_relationships r
  join public.entities o on o.entity_id = case when r.requester_entity_id = me then r.addressee_entity_id else r.requester_entity_id end
  where r.kind = 'DUO' and me in (r.requester_entity_id, r.addressee_entity_id)
  order by case when r.status = 'ACCEPTED' then 0 when r.requester_entity_id = me then 1 else 2 end, r.created_at desc;
end;
$$;

-- Finds GamIDs to send a Duo request to (published or not), by @handle or display name; never the caller. At most 12.
create function private.search_duo_candidates_impl(candidate_query text)
returns table (gamid_handle text, display_name text, avatar_media_reference text, is_published boolean)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := private.identity_my_entity();
  q text := lower(ltrim(btrim(coalesce(candidate_query, '')), '@'));
begin
  if char_length(regexp_replace(q, '[^a-z0-9]', '', 'g')) < 3 then raise exception using errcode = '22023', message = 'SEARCH_TOO_SHORT'; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
  select e.gamid_handle, e.display_name, case when e.visibility = 'PUBLIC' then e.avatar_media_reference end, e.visibility = 'PUBLIC'
  from public.entities e
  where e.entity_type = 'SOLO' and e.entity_id <> me
    and (e.gamid_handle like '%' || q || '%' or lower(e.display_name) like '%' || q || '%')
  order by case when e.gamid_handle = replace(q, '\_', '_') then 0 when e.gamid_handle like q || '%' then 1 else 2 end, e.gamid_handle
  limit 12;
end;
$$;

-- A asks B. The current Duo (if any) stays until B accepts; asking while you have a Duo needs candidate_replace_confirmed.
create function private.send_duo_request_impl(candidate_handle text, candidate_replace_confirmed boolean)
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
  return 'SENT';
end;
$$;

-- B answers A's request. Accepting makes A and B each other's Duo and ends the previous accepted Duo of BOTH, atomically (both GamIDs locked first). Accepting while
-- B already has a Duo needs candidate_replace_confirmed. Declining just removes the request.
create function private.respond_to_duo_request_impl(candidate_handle text, candidate_accept boolean, candidate_replace_confirmed boolean)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := private.identity_my_entity();
  requester uuid := private.identity_entity_by_handle(candidate_handle);
  request_id uuid;
begin
  if candidate_accept is null then raise exception using errcode = '22023', message = 'INVALID_RESPONSE'; end if;
  perform private.identity_lock_pair(me, requester);
  select r.relationship_id into request_id from public.identity_relationships r
  where r.kind = 'DUO' and r.status = 'PENDING' and r.requester_entity_id = requester and r.addressee_entity_id = me;
  if request_id is null then raise exception using errcode = 'P0002', message = 'DUO_REQUEST_NOT_FOUND'; end if;
  if not candidate_accept then
    delete from public.identity_relationships r where r.relationship_id = request_id;
    return 'DECLINED';
  end if;
  if exists (select 1 from public.identity_relationships r where r.kind = 'DUO' and r.status = 'ACCEPTED' and me in (r.requester_entity_id, r.addressee_entity_id))
     and candidate_replace_confirmed is not true then
    raise exception using errcode = 'PT409', message = 'DUO_REPLACE_CONFIRMATION_REQUIRED';
  end if;
  delete from public.identity_relationships r
  where r.kind = 'DUO' and r.status = 'ACCEPTED'
    and (r.requester_entity_id in (me, requester) or r.addressee_entity_id in (me, requester));
  update public.identity_relationships r
  set status = 'ACCEPTED', accepted_at = now(), requester_shows_public = false, addressee_shows_public = false
  where r.relationship_id = request_id;
  return 'ACCEPTED';
end;
$$;

-- A withdraws their own pending request to B.
create function private.cancel_duo_request_impl(candidate_handle text)
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
  return 'CANCELLED';
end;
$$;

-- Either participant ends the Duo (for both). Returns whether there was one.
create function private.remove_my_duo_impl()
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
  return found;
end;
$$;

-- The caller's OWN "Show My Duo on my GamID" switch (it never changes the other participant's switch).
create function private.set_my_duo_visibility_impl(candidate_visible boolean)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := private.identity_my_entity();
begin
  if candidate_visible is null then raise exception using errcode = '22023', message = 'INVALID_VISIBILITY'; end if;
  update public.identity_relationships r
  set requester_shows_public = case when r.requester_entity_id = me then candidate_visible else r.requester_shows_public end,
      addressee_shows_public = case when r.addressee_entity_id = me then candidate_visible else r.addressee_shows_public end
  where r.kind = 'DUO' and r.status = 'ACCEPTED' and me in (r.requester_entity_id, r.addressee_entity_id);
  if not found then raise exception using errcode = 'P0002', message = 'DUO_NOT_SET'; end if;
  return candidate_visible;
end;
$$;

create function public.get_my_duo()
returns table (relation text, gamid_handle text, display_name text, avatar_media_reference text, is_published boolean, show_public boolean, created_at timestamptz, accepted_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_duo_impl(); $$;

create function public.search_duo_candidates(candidate_query text)
returns table (gamid_handle text, display_name text, avatar_media_reference text, is_published boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.search_duo_candidates_impl(candidate_query); $$;

create function public.send_duo_request(candidate_handle text, candidate_replace_confirmed boolean default false)
returns text
language sql volatile security invoker set search_path = ''
as $$ select private.send_duo_request_impl(candidate_handle, candidate_replace_confirmed); $$;

create function public.respond_to_duo_request(candidate_handle text, candidate_accept boolean, candidate_replace_confirmed boolean default false)
returns text
language sql volatile security invoker set search_path = ''
as $$ select private.respond_to_duo_request_impl(candidate_handle, candidate_accept, candidate_replace_confirmed); $$;

create function public.cancel_duo_request(candidate_handle text)
returns text
language sql volatile security invoker set search_path = ''
as $$ select private.cancel_duo_request_impl(candidate_handle); $$;

create function public.remove_my_duo()
returns boolean
language sql volatile security invoker set search_path = ''
as $$ select private.remove_my_duo_impl(); $$;

create function public.set_my_duo_visibility(candidate_visible boolean)
returns boolean
language sql volatile security invoker set search_path = ''
as $$ select private.set_my_duo_visibility_impl(candidate_visible); $$;

revoke all on function
  private.identity_relationships_one_accepted(), private.identity_my_entity(), private.identity_entity_by_handle(text), private.identity_lock_pair(uuid, uuid)
from public, anon, authenticated;
revoke all on function
  private.get_my_duo_impl(), private.search_duo_candidates_impl(text), private.send_duo_request_impl(text, boolean), private.respond_to_duo_request_impl(text, boolean, boolean),
  private.cancel_duo_request_impl(text), private.remove_my_duo_impl(), private.set_my_duo_visibility_impl(boolean),
  public.get_my_duo(), public.search_duo_candidates(text), public.send_duo_request(text, boolean), public.respond_to_duo_request(text, boolean, boolean),
  public.cancel_duo_request(text), public.remove_my_duo(), public.set_my_duo_visibility(boolean)
from public, anon, authenticated;
grant execute on function
  private.get_my_duo_impl(), private.search_duo_candidates_impl(text), private.send_duo_request_impl(text, boolean), private.respond_to_duo_request_impl(text, boolean, boolean),
  private.cancel_duo_request_impl(text), private.remove_my_duo_impl(), private.set_my_duo_visibility_impl(boolean),
  public.get_my_duo(), public.search_duo_candidates(text), public.send_duo_request(text, boolean), public.respond_to_duo_request(text, boolean, boolean),
  public.cancel_duo_request(text), public.remove_my_duo(), public.set_my_duo_visibility(boolean)
to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. The public identity boundary: + the 'duo' section
-- ---------------------------------------------------------------------------------------------
-- copied from 20260927130000_steam_public_persona.sql; changed: + the My Duo branch (the last one). Grants are unchanged (create or replace keeps them).
create or replace function private.get_public_identity_impl(candidate_handle text)
returns table (
  gamid_handle text,
  display_name text,
  avatar_media_reference text,
  bio text,
  role_keys text[],
  primary_role_key text,
  role_catalog jsonb,
  education_work_status text,
  institution text,
  field_of_study text,
  education_work_catalog jsonb,
  intro_transition_key text,
  intro_derivative_path text,
  public_sections jsonb
)
language sql stable security definer
set search_path = ''
as $$
  select e.gamid_handle, e.display_name, e.avatar_media_reference, p.bio,
    coalesce((select array_agg(r.role_key order by r.sort_order) from public.profile_gaming_roles r where r.profile_id = p.profile_id), array[]::text[]),
    (select r.role_key from public.profile_gaming_roles r where r.profile_id = p.profile_id and r.is_primary),
    (select jsonb_agg(jsonb_build_object('key', c.role_key, 'label', c.label) order by c.sort_order) from public.gaming_role_catalog c where c.active),
    -- Education & Work: returned only while its switch is ON, otherwise NULL (the values never leave the database)
    case when p.show_education_work then p.education_work_status end,
    case when p.show_education_work then p.institution end,
    case when p.show_education_work then p.field_of_study end,
    case when p.show_education_work then (select jsonb_agg(jsonb_build_object('key', c.status_key, 'label', c.label) order by c.sort_order) from public.education_work_status_catalog c where c.active) end,
    coalesce(s.transition_key, 'fade'),
    active.derivative_path,
    -- Optional sections: ONLY those whose switch is ON appear, and only the approved presentation fields.
    (
      select coalesce(jsonb_object_agg(x.section_key, x.payload), '{}'::jsonb)
      from (
        -- Discord: display name, username, trust label. NOT exposed: the Discord account id (and the avatar URL, which embeds it),
        -- tokens, timestamps, connection ids, diagnostics/discovery.
        select 'discord'::text as section_key,
          jsonb_strip_nulls(jsonb_build_object(
            'display_name', g.provider_display_name, 'username', g.provider_username, 'trust_status', g.trust_status)) as payload
        from public.gaming_connections g
        where g.entity_id = e.entity_id and g.provider_key = 'discord' and g.is_public
        union all
        -- Steam: the trust label (CONNECTED - never VERIFIED, and no game claim of any kind), the SteamID64 Steam authenticated (kept for compatibility, not
        -- displayed to visitors), and - once stored from Steam's official GetPlayerSummaries - the persona name, avatar and Steam's own profile address.
        select 'steam'::text,
          jsonb_strip_nulls(jsonb_build_object(
            'steam_id', g.provider_account_id, 'trust_status', g.trust_status,
            'persona_name', g.provider_display_name, 'avatar_url', g.provider_avatar_url, 'profile_url', g.provider_profile_url))
        from public.gaming_connections g
        where g.entity_id = e.entity_id and g.provider_key = 'steam' and g.is_public
        union all
        -- League: the IDENTITY (Riot ID, region, icon id) and the truth about where it came from (manual / unverified source) with freshness are returned whenever the
        -- League section is public. The RANK / STAT fields are a separate, global privacy scope: they are added only while "Show ranks & stats on my GamID" is ON
        -- (private.public_game_stats_allowed) and are otherwise not in the response at all. NOT exposed: source URL, lookup state/errors, throttle ledger, reservations, internal ids.
        select 'league'::text,
          jsonb_strip_nulls(
            jsonb_build_object(
              'game_name', l.game_name, 'tag_line', l.tag_line, 'platform_id', l.platform_id, 'profile_icon_id', l.profile_icon_id,
              'trust_status', l.trust_status, 'identity_source', l.identity_source, 'data_source', l.data_source, 'updated_at', l.fetched_at)
            || case when private.public_game_stats_allowed(e.entity_id)
                 then jsonb_build_object(
                   'rank_state', l.solo_rank_state, 'tier', l.solo_tier, 'division', l.solo_division, 'lp', l.solo_lp,
                   'wins', l.solo_wins, 'losses', l.solo_losses)
                 else '{}'::jsonb end)
        from public.league_profiles l
        where l.entity_id = e.entity_id and l.is_public
        union all
        -- My Games: only when the owner switched it ON (private.public_my_games returns NULL otherwise) and there is at least one game. The first six rows in the
        -- library's own deterministic order + the counts; hidden playtime / stats are omitted by the same function, never filtered afterwards.
        select 'my_games'::text, m.payload
        from (select private.public_my_games(e.entity_id, null, 6, 0) as payload) m
        where m.payload is not null and (m.payload ->> 'library_count')::integer > 0
        union all
        -- My Duo: only an ACCEPTED Duo, only while THIS owner's own switch is ON, and only while the Duo's GamID is itself published (an unpublished Duo simply
        -- disappears; the relationship is kept). Only the Duo's @handle, display name and avatar path - the same fields the Duo's own public GamID shows.
        select 'duo'::text,
          jsonb_strip_nulls(jsonb_build_object('gamid_handle', d.gamid_handle, 'display_name', d.display_name, 'avatar_media_reference', d.avatar_media_reference))
        from public.identity_relationships ir
        join public.entities d on d.entity_id = case when ir.requester_entity_id = e.entity_id then ir.addressee_entity_id else ir.requester_entity_id end
        where ir.kind = 'DUO' and ir.status = 'ACCEPTED'
          and ((ir.requester_entity_id = e.entity_id and ir.requester_shows_public) or (ir.addressee_entity_id = e.entity_id and ir.addressee_shows_public))
          and d.entity_type = 'SOLO' and d.visibility = 'PUBLIC'
      ) x
    )
  from public.entities e
  join public.profiles p on p.entity_id = e.entity_id
  left join public.profile_intro_settings s on s.profile_id = p.profile_id
  left join public.intro_processing_jobs active on active.job_id = s.active_job_id and active.state = 'ready'
  where e.gamid_handle = private.normalize_handle(candidate_handle)
    and e.entity_type = 'SOLO'
    and e.visibility = 'PUBLIC'
  limit 1;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Wall: the GamID block 'duo'
-- ---------------------------------------------------------------------------------------------
-- copied from 20260930160000_wall_video_layers_other_link.sql; changed: the gamid block list gains 'duo'
create or replace function private.wall_element_payload_errors(element_type text, payload jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  provider_key text;
  code text;
begin
  if element_type = 'rect' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'fill') is distinct from 'string' or (payload ->> 'fill') !~ '^#[0-9a-fA-F]{6}$' then errs := array_append(errs, 'INVALID_FILL'); end if;
    if private.wall_is_set(payload -> 'opacity') and not private.wall_in_range(payload -> 'opacity', 0, 1) then errs := array_append(errs, 'INVALID_OPACITY'); end if;
    if private.wall_is_set(payload -> 'stroke') and not private.wall_is_hex(payload -> 'stroke') then errs := array_append(errs, 'INVALID_STROKE'); end if;
    if private.wall_is_set(payload -> 'strokeWidth') and not private.wall_in_range(payload -> 'strokeWidth', 0, 100) then errs := array_append(errs, 'INVALID_STROKE_WIDTH'); end if;
    if private.wall_is_set(payload -> 'radius') and not private.wall_in_range(payload -> 'radius', 0, 1000) then errs := array_append(errs, 'INVALID_RADIUS'); end if;
    if private.wall_is_set(payload -> 'gradient') and not private.wall_is_gradient(payload -> 'gradient') then errs := array_append(errs, 'INVALID_GRADIENT'); end if;
    return errs;
  elsif element_type = 'embed' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'providerKey') is distinct from 'string' or (payload ->> 'providerKey') = '' then return array['INVALID_PROVIDER_KEY']; end if;
    provider_key := payload ->> 'providerKey';
    if not exists (select 1 from private.wall_embed_specs() s where s.provider = provider_key) then return array['UNSUPPORTED_PROVIDER']; end if;
    if jsonb_typeof(payload -> 'data') is distinct from 'object' then return array['PROVIDER_DATA_NOT_OBJECT']; end if;
    foreach code in array private.wall_embed_data_errors(provider_key, payload -> 'data') loop errs := array_append(errs, 'PROVIDER:' || code); end loop;
    return errs;
  elsif element_type = 'text' then
    return private.wall_text_payload_errors(payload);
  elsif element_type = 'image' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'assetId') is distinct from 'string' or (payload ->> 'assetId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then errs := array_append(errs, 'INVALID_ASSET'); end if;
    if jsonb_typeof(payload -> 'fit') is distinct from 'string' or (payload ->> 'fit') not in ('cover', 'contain', 'fill') then errs := array_append(errs, 'INVALID_FIT'); end if;
    if not (private.wall_in_range(payload -> 'posX', 0, 100) and private.wall_in_range(payload -> 'posY', 0, 100)) then errs := array_append(errs, 'INVALID_POSITION'); end if;
    if not private.wall_in_range(payload -> 'opacity', 0, 1) then errs := array_append(errs, 'INVALID_OPACITY'); end if;
    if private.wall_is_set(payload -> 'alt') and (jsonb_typeof(payload -> 'alt') is distinct from 'string' or char_length(payload ->> 'alt') > 120) then errs := array_append(errs, 'INVALID_ALT'); end if;
    if (private.wall_is_set(payload -> 'aw') and not private.wall_is_pixels(payload -> 'aw')) or (private.wall_is_set(payload -> 'ah') and not private.wall_is_pixels(payload -> 'ah')) then
      errs := array_append(errs, 'INVALID_SOURCE_SIZE');
    end if;
    errs := errs || private.wall_artwork_look_errors(payload);   -- backdrop, mask, effects, blend, radius
    if private.wall_is_set(payload -> 'crop') and not private.wall_crop_ok(payload -> 'crop') then errs := array_append(errs, 'INVALID_CROP'); end if;
    if private.wall_is_set(payload -> 'locked') and jsonb_typeof(payload -> 'locked') <> 'boolean' then errs := array_append(errs, 'INVALID_LOCKED'); end if;
    if private.wall_is_set(payload -> 'clickThrough') and jsonb_typeof(payload -> 'clickThrough') <> 'boolean' then errs := array_append(errs, 'INVALID_CLICK_THROUGH'); end if;
    if private.wall_is_set(payload -> 'media') and (payload -> 'media') is distinct from '"video"'::jsonb then errs := array_append(errs, 'INVALID_MEDIA'); end if;
    if private.wall_is_set(payload -> 'slice') and (not private.wall_slice_ok(payload -> 'slice') or (payload -> 'media') = '"video"'::jsonb) then errs := array_append(errs, 'INVALID_SLICE'); end if;
    if (private.wall_is_set(payload -> 'flipX') and jsonb_typeof(payload -> 'flipX') <> 'boolean') or (private.wall_is_set(payload -> 'flipY') and jsonb_typeof(payload -> 'flipY') <> 'boolean') then
      errs := array_append(errs, 'INVALID_FLIP');
    end if;
    if private.wall_is_set(payload -> 'fade') and not private.wall_fade_ok(payload -> 'fade') then errs := array_append(errs, 'INVALID_FADE'); end if;
    return errs;
  elsif element_type = 'gamid' then
    if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
    if jsonb_typeof(payload -> 'block') is distinct from 'string' or (payload ->> 'block') not in ('profile', 'roles', 'games', 'connections', 'duo') then errs := array_append(errs, 'INVALID_BLOCK'); end if;
    if private.wall_is_set(payload -> 'layout') and (jsonb_typeof(payload -> 'layout') is distinct from 'string' or (payload ->> 'layout') not in ('card', 'compact')) then errs := array_append(errs, 'INVALID_LAYOUT'); end if;
    if private.wall_is_set(payload -> 'showPlaytime') and jsonb_typeof(payload -> 'showPlaytime') is distinct from 'boolean' then errs := array_append(errs, 'INVALID_SHOW_PLAYTIME'); end if;
    if private.wall_is_set(payload -> 'initial') and not (private.wall_is_pixels(payload -> 'initial') and (payload ->> 'initial')::float8 between 3 and 24) then errs := array_append(errs, 'INVALID_INITIAL'); end if;
    if private.wall_is_set(payload -> 'style') then errs := errs || private.wall_gamid_style_errors(payload -> 'style'); end if;
    return errs;
  elsif element_type = 'gamidData' then
    return private.wall_gamid_data_errors(payload);
  end if;
  return null;
end;
$$;
