-- Discord Profile Card in My Socials (Classic Profile) - GamID TESTING only.
--
-- A visitor who clicks the Discord icon in My Socials may see a small card with the owner's Discord display name, @username and avatar, plus "Open on Discord".
-- It reuses the EXISTING Discord connection (20260919130000_gaming_connections_foundation.sql: id, username, display name, avatar URL read once at connect time
-- with the `identify` scope; no token is ever stored). Nothing here calls Discord, adds a scope or touches Team Voice.
--
-- Consent: a SEPARATE explicit opt-in, gaming_connections.show_profile_card, OFF by default for every row (existing connections included), next to the
-- existing "Show on my GamID" (is_public), which keeps its meaning. When it is switched on, profile_card_consented_at records when the owner directed GamID to
-- share these fields with visitors (Discord Developer Terms 5(b)(iii)); switching it off clears both. Both live ON the connection row, so Disconnect (which
-- deletes the row) removes the card at once, and a new connection always starts OFF. There is no public copy: the card is read live from the row.
--
-- The public card is returned only when ALL hold: the GamID is PUBLIC (SOLO); the Discord connection exists; is_public is on; show_profile_card is on; and the
-- owner's saved My Socials Discord link is a personal profile (kind 'profile') whose numeric id EQUALS the connected Discord account id - checked here, never
-- trusted from a browser, never inferred from a username. Otherwise no row (the visitor page keeps the ordinary link). Only the approved fields are returned:
-- the Discord id (already public in that very My Socials link), username, display name and a Discord-CDN avatar address that must match the account.
-- Owner writes go only through set_my_discord_profile_card (the caller's own SOLO GamID); the table stays closed to anon and authenticated.

alter table public.gaming_connections
  add column show_profile_card boolean not null default false,
  add column profile_card_consented_at timestamptz,
  add constraint gaming_connections_profile_card_discord_only check (not show_profile_card or provider_key = 'discord'),
  add constraint gaming_connections_profile_card_consent check ((show_profile_card and profile_card_consented_at is not null) or (not show_profile_card and profile_card_consented_at is null));

-- The owner's own state: is Discord connected, the saved choice and when it was given, and - so the editor can say what else the card still needs - the
-- existing "Show on my GamID" switch, whether My Socials holds this same Discord account, and whether the GamID is published.
create function private.get_my_discord_profile_card_impl()
returns table (connected boolean, show_profile_card boolean, consented_at timestamptz, show_on_gamid boolean, my_socials_matches boolean, gamid_public boolean)
language sql stable security definer
set search_path = ''
as $$
  select g.connection_id is not null,
    coalesce(g.show_profile_card, false),
    g.profile_card_consented_at,
    coalesce(g.is_public, false),
    coalesce(exists (
      select 1 from public.identity_social_links l
      where l.entity_id = e.entity_id and l.platform_key = 'discord' and l.kind = 'profile' and l.account_id = g.provider_account_id
    ), false),
    e.visibility = 'PUBLIC'
  from public.entities e
  left join public.gaming_connections g on g.entity_id = e.entity_id and g.provider_key = 'discord'
  where e.entity_id = private.my_socials_entity_id();
$$;

-- Owner opt-in / opt-out. Repeating the same choice changes nothing (a duplicate click keeps the first consent time). No connection -> DISCORD_NOT_CONNECTED.
create function private.set_my_discord_profile_card_impl(candidate_enabled boolean)
returns table (connected boolean, show_profile_card boolean, consented_at timestamptz, show_on_gamid boolean, my_socials_matches boolean, gamid_public boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  owned_entity_id uuid := private.my_socials_entity_id();
  changed integer;
begin
  if candidate_enabled is null then raise exception using errcode = '22023', message = 'INVALID_PROFILE_CARD_SETTING'; end if;
  update public.gaming_connections g
  set show_profile_card = candidate_enabled,
      profile_card_consented_at = case when not candidate_enabled then null when g.show_profile_card then g.profile_card_consented_at else now() end
  where g.entity_id = owned_entity_id and g.provider_key = 'discord';
  get diagnostics changed = row_count;
  if changed = 0 then raise exception using errcode = 'P0002', message = 'DISCORD_NOT_CONNECTED'; end if;
  return query select * from private.get_my_discord_profile_card_impl();
end;
$$;

-- Anonymous reader for the visitor page: one row only when every condition above holds, else none.
create function private.get_public_discord_card_impl(candidate_handle text)
returns table (discord_id text, username text, display_name text, avatar text)
language sql stable security definer
set search_path = ''
as $$
  select g.provider_account_id, g.provider_username, g.provider_display_name,
    case when g.provider_avatar_url ~ ('^https://cdn\.discordapp\.com/avatars/' || g.provider_account_id || '/(a_)?[0-9a-f]{32}\.png\?size=128$') then g.provider_avatar_url end
  from public.entities e
  join public.gaming_connections g on g.entity_id = e.entity_id and g.provider_key = 'discord'
  join public.identity_social_links l on l.entity_id = e.entity_id and l.platform_key = 'discord' and l.kind = 'profile' and l.account_id = g.provider_account_id
  join public.social_platform_catalog c on c.platform_key = l.platform_key and c.active
  where e.gamid_handle = private.normalize_handle(candidate_handle)
    and e.entity_type = 'SOLO'
    and e.visibility = 'PUBLIC'
    and g.is_public
    and g.show_profile_card
    and g.provider_account_id ~ '^[0-9]{17,20}$'
    and nullif(btrim(coalesce(g.provider_username, '')), '') is not null;
$$;

create function public.get_my_discord_profile_card()
returns table (connected boolean, show_profile_card boolean, consented_at timestamptz, show_on_gamid boolean, my_socials_matches boolean, gamid_public boolean)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_discord_profile_card_impl(); $$;

create function public.set_my_discord_profile_card(candidate_enabled boolean)
returns table (connected boolean, show_profile_card boolean, consented_at timestamptz, show_on_gamid boolean, my_socials_matches boolean, gamid_public boolean)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.set_my_discord_profile_card_impl(candidate_enabled); $$;

create function public.get_public_discord_card(candidate_handle text)
returns table (discord_id text, username text, display_name text, avatar text)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_public_discord_card_impl(candidate_handle); $$;

revoke all on function
  private.get_my_discord_profile_card_impl(), private.set_my_discord_profile_card_impl(boolean), private.get_public_discord_card_impl(text),
  public.get_my_discord_profile_card(), public.set_my_discord_profile_card(boolean), public.get_public_discord_card(text)
from public, anon, authenticated;
grant execute on function
  private.get_my_discord_profile_card_impl(), private.set_my_discord_profile_card_impl(boolean),
  public.get_my_discord_profile_card(), public.set_my_discord_profile_card(boolean)
to authenticated;
grant execute on function private.get_public_discord_card_impl(text), public.get_public_discord_card(text) to anon, authenticated;
