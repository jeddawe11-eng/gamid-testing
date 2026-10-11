-- Favorite Games (Mazen 2026-10-11) - GamID TESTING only. Additive.
--
-- A GamID owner marks at most 3 games of their OWN My Games library (catalog game keys: games they added and games a connected account discovered) as
-- favorites, in their order. Stored on the existing profile row (no new table, no duplicate game record). The server enforces the limit and the library
-- membership; a game that leaves My Games leaves the favorites. Visitors read them only while My Games is public, through get_public_favorite_games.
-- The artwork cache gains a portrait cover (SteamGridDB grid 600x900 family) used only for favorites; matching, cache, rate limits and the kill switch are
-- unchanged.

alter table public.profiles add column favorite_games text[] not null default '{}'
  check (cardinality(favorite_games) <= 3 and array_position(favorite_games, null) is null);

-- the catalog game keys of one GamID's My Games library (manual declarations + discovered games the catalog recognizes) - the same set My Games shows
create function private.library_game_keys(candidate_entity uuid)
returns setof text language sql stable security definer set search_path = '' as $$
  select gp.game_key from public.entity_game_platforms gp where gp.entity_id = candidate_entity
  union
  select coalesce(kg.game_key, cp.game_key) from public.discovered_games d
    left join public.known_game_sources kg on kg.source_provider = d.source_provider and kg.external_game_id = d.external_game_id
    left join public.game_catalog_provider_ids cp on cp.provider = d.source_provider and cp.external_id = d.external_game_id
  where d.entity_id = candidate_entity and coalesce(kg.game_key, cp.game_key) is not null;
$$;

create function private.favorite_games_in_library(candidate_entity uuid, candidate_keys text[])
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(k order by i), '{}') from unnest(coalesce(candidate_keys, '{}')) with ordinality u(k, i)
  where k in (select private.library_game_keys(candidate_entity));
$$;

create function private.get_my_favorite_games_impl()
returns text[] language sql stable security definer set search_path = '' as $$
  select private.favorite_games_in_library(p.entity_id, p.favorite_games) from public.profiles p where p.profile_id = (select owner_profile_id from private.banner_owner());
$$;

create function private.set_my_favorite_games_impl(candidate_keys text[])
returns text[] language plpgsql volatile security definer set search_path = '' as $$
declare
  me record;
  keys text[] := coalesce(candidate_keys, '{}');
begin
  select * into me from private.banner_owner();
  if cardinality(keys) > 3 then raise exception using errcode = '22023', message = 'FAVORITE_GAMES_LIMIT'; end if;
  if cardinality(keys) <> (select count(distinct k) from unnest(keys) k) then raise exception using errcode = '22023', message = 'DUPLICATE_FAVORITE_GAME'; end if;
  if exists (select 1 from unnest(keys) k where k is null or k not in (select private.library_game_keys(me.owner_entity_id))) then
    raise exception using errcode = '22023', message = 'FAVORITE_NOT_IN_LIBRARY';
  end if;
  update public.profiles p set favorite_games = keys, updated_at = now() where p.profile_id = me.owner_profile_id;
  return keys;
end;
$$;

create function public.get_my_favorite_games() returns text[] language sql stable security invoker set search_path = '' as $$ select private.get_my_favorite_games_impl(); $$;
create function public.set_my_favorite_games(candidate_keys text[]) returns text[] language sql volatile security invoker set search_path = '' as $$ select private.set_my_favorite_games_impl(candidate_keys); $$;

-- a game that leaves My Games (a manual declaration removed, or a discovered game gone after a disconnect / refresh) leaves the favorites too
create function private.prune_favorite_games()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p set favorite_games = private.favorite_games_in_library(p.entity_id, p.favorite_games)
  where p.entity_id = old.entity_id and cardinality(p.favorite_games) > 0
    and p.favorite_games is distinct from private.favorite_games_in_library(p.entity_id, p.favorite_games);
  return null;
end;
$$;
create trigger entity_game_platforms_prune_favorites after delete on public.entity_game_platforms for each row execute function private.prune_favorite_games();
create trigger discovered_games_prune_favorites after delete on public.discovered_games for each row execute function private.prune_favorite_games();

-- visitors: the favorites of a PUBLIC GamID while its My Games is public, in the owner's order, with the catalog name and year
create function private.get_public_favorite_games_impl(candidate_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_agg(jsonb_build_object('game_key', g.game_key, 'name', g.display_name, 'year', g.release_year) order by u.i)
    from unnest(private.favorite_games_in_library(e.entity_id, p.favorite_games)) with ordinality u(k, i)
    join public.game_catalog g on g.game_key = u.k and g.is_active), '[]'::jsonb)
  from public.entities e join public.profiles p on p.entity_id = e.entity_id
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC' and private.public_my_games_allowed(e.entity_id);
$$;
create function public.get_public_favorite_games(candidate_handle text) returns jsonb language sql stable security invoker set search_path = '' as $$ select coalesce(private.get_public_favorite_games_impl(candidate_handle), '[]'::jsonb); $$;

revoke all on function private.library_game_keys(uuid), private.favorite_games_in_library(uuid, text[]), private.get_my_favorite_games_impl(), private.set_my_favorite_games_impl(text[]),
  public.get_my_favorite_games(), public.set_my_favorite_games(text[]), private.prune_favorite_games(), private.get_public_favorite_games_impl(text), public.get_public_favorite_games(text)
from public, anon, authenticated, service_role;
grant execute on function private.get_my_favorite_games_impl(), private.set_my_favorite_games_impl(text[]), public.get_my_favorite_games(), public.set_my_favorite_games(text[]) to authenticated;
grant execute on function private.get_public_favorite_games_impl(text), public.get_public_favorite_games(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Artwork: portrait covers for favorites
-- ---------------------------------------------------------------------------------------------
alter table private.game_artwork_cache
  add column cover_url text check (cover_url ~ '^https://cdn2\.steamgriddb\.com/[A-Za-z0-9/._-]{1,200}$'),
  add column cover_checked boolean not null default false;
alter table private.game_artwork_cache drop constraint game_artwork_cache_check;
alter table private.game_artwork_cache add constraint game_artwork_cache_check
  check (status = 'MATCHED' or (provider_game_id is null and icon_url is null and grid_url is null and hero_url is null and cover_url is null));

create or replace function public.game_artwork_cache_put(candidate_rows jsonb)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  insert into private.game_artwork_cache (game_key, provider, status, match_basis, provider_game_id, icon_url, grid_url, hero_url, cover_url, cover_checked, fetched_at, expires_at)
  select x ->> 'game_key', 'steamgriddb', x ->> 'status', x ->> 'match_basis', nullif(x ->> 'provider_game_id', '')::bigint, x ->> 'icon_url', x ->> 'grid_url', x ->> 'hero_url',
    x ->> 'cover_url', coalesce((x ->> 'cover_checked')::boolean, false), now(), now() + make_interval(days => 7)
  from jsonb_array_elements(candidate_rows) with ordinality t(x, i) where t.i <= 32
  on conflict (game_key, provider) do update set status = excluded.status, match_basis = excluded.match_basis, provider_game_id = excluded.provider_game_id,
    icon_url = excluded.icon_url, grid_url = excluded.grid_url, hero_url = excluded.hero_url, cover_url = excluded.cover_url, cover_checked = excluded.cover_checked,
    fetched_at = excluded.fetched_at, expires_at = excluded.expires_at;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.game_artwork_cache_put(jsonb) from public, anon, authenticated;
grant execute on function public.game_artwork_cache_put(jsonb) to service_role;

-- (body identical to 20261011160000_artwork_environment_wide.sql; the favorites join the targets with the purpose 'favorites')
create or replace function public.game_artwork_targets(candidate_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with e as (select x.entity_id from public.entities x where x.gamid_handle = private.normalize_handle(candidate_handle) and x.entity_type = 'SOLO' and x.visibility = 'PUBLIC'),
  lib as (
    select distinct k.gkey from (
      select gp.game_key gkey from public.entity_game_platforms gp join e on gp.entity_id = e.entity_id
      union all
      select coalesce(kg.game_key, cp.game_key) from public.discovered_games d join e on d.entity_id = e.entity_id
        left join public.known_game_sources kg on kg.source_provider = d.source_provider and kg.external_game_id = d.external_game_id
        left join public.game_catalog_provider_ids cp on cp.provider = d.source_provider and cp.external_id = d.external_game_id) k
    where k.gkey is not null and exists (select 1 from e where private.public_my_games_allowed(e.entity_id))
  ),
  wanted as (
    select gkey, 'my_games' purpose from lib
    union all select f.k, 'favorites' from e join public.profiles p on p.entity_id = e.entity_id, unnest(private.favorite_games_in_library(e.entity_id, p.favorite_games)) f(k)
      where private.public_my_games_allowed(e.entity_id)
    union all select 'league_of_legends', 'connected' from e where exists (select 1 from public.league_profiles l where l.entity_id = e.entity_id and l.is_public)
    union all select c.game_key, 'crews' from e join public.crew_members cm on cm.entity_id = e.entity_id and cm.status = 'ACTIVE'
      join public.crews c on c.crew_id = cm.crew_id join public.crew_walls w on w.crew_id = c.crew_id and w.published
  )
  select jsonb_build_object(
    'enabled', (select s.enabled from private.game_artwork_settings s where s.singleton),
    'games', coalesce((select jsonb_agg(jsonb_build_object('game_key', g.game_key, 'name', g.display_name, 'year', g.release_year, 'purposes', w.purposes,
        'steam_appid', (select min(p.external_id::bigint) from public.game_catalog_provider_ids p where p.game_key = g.game_key and p.provider = 'steam' and p.external_id ~ '^[0-9]{1,10}$')))
      from (select gkey, jsonb_agg(distinct purpose) purposes from wanted group by gkey) w join public.game_catalog g on g.game_key = w.gkey and g.is_active), '[]'::jsonb));
$$;
revoke all on function public.game_artwork_targets(text) from public, anon, authenticated;
grant execute on function public.game_artwork_targets(text) to service_role;
