-- Canonical Game Catalog + manual game declarations (Add Game, catalog search, multi-platform selection). TESTING only.
--
-- ONE canonical catalog. A real-world game has exactly one canonical GamID game_key, however it entered GamID (discovered through a provider, or declared
-- by the user). The key is the same normalized key the recognition map and the Game Profile layer already use; nothing here creates a competing naming system.
--   * Provider identifiers (Steam App ID, IGDB slug, Wikidata QID, later an Xbox title, a PlayStation product, a Riot id ...) are ATTRIBUTES of a canonical
--     game (public.game_catalog_provider_ids), never its identity. A Steam App ID is not a GamID game id.
--   * Discovery provenance (public.discovered_games, unchanged) and the user's own platform declarations (public.entity_game_platforms) are separate
--     from canonical identity and from each other: declaring a game never creates, edits, upgrades or deletes a discovered game.
--   * A manual declaration is MANUAL / user-declared ONLY (a table CHECK). It is never VERIFIED, never CONNECTED and never "discovered via" anything.
--   * The catalog is READ-ONLY to every client role. Its content comes from an import (a documented, keyless source, see PROJECT_HANDOFF), never from a user.
--   * The browser never receives the catalog: it asks for at most 12 matching games, and only once at least 3 meaningful characters were typed.
-- Nothing here touches or rewrites an existing row (connections, discovered games, League, Game Profiles, visibility flags, @black).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- 1. Search normalization (immutable, shared by the import and by search so both sides always agree)
--    lower-case, apostrophes dropped ("Marvel's" -> "marvels"), every other run of non-alphanumerics -> one space
-- ---------------------------------------------------------------------------------------------
create function private.game_search_normalize(input text)
returns text
language sql immutable
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(lower(coalesce(input, '')), '[''’`´]', '', 'g'), '[^[:alnum:]]+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Platforms (normalized, provider-neutral reference data). "PC" and a storefront are different things: Steam / Epic are stores UNDER the PC context.
--    provider_key names the connection provider whose DISCOVERY can establish that platform (steam -> Steam). It is null for platforms no provider covers yet.
-- ---------------------------------------------------------------------------------------------
create table public.game_platforms (
  platform_key text primary key check (platform_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  family text not null check (family in ('PC', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'MOBILE')),
  parent_platform_key text references public.game_platforms (platform_key) check (parent_platform_key is distinct from platform_key),
  provider_key text check (provider_key is null or provider_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  sort_order smallint not null,
  is_active boolean not null default true
);

insert into public.game_platforms (platform_key, display_name, family, parent_platform_key, provider_key, sort_order) values
  ('pc', 'PC', 'PC', null, null, 10),
  ('steam', 'Steam', 'PC', 'pc', 'steam', 11),
  ('epic_games', 'Epic Games Store', 'PC', 'pc', null, 12),
  ('ps4', 'PlayStation 4', 'PLAYSTATION', null, null, 20),
  ('ps5', 'PlayStation 5', 'PLAYSTATION', null, null, 21),
  ('xbox_one', 'Xbox One', 'XBOX', null, null, 30),
  ('xbox_series', 'Xbox Series X|S', 'XBOX', null, null, 31),
  ('switch', 'Nintendo Switch', 'NINTENDO', null, null, 40),
  ('switch2', 'Nintendo Switch 2', 'NINTENDO', null, null, 41),
  ('ios', 'iOS', 'MOBILE', null, null, 50),
  ('android', 'Android', 'MOBILE', null, null, 51);

-- ---------------------------------------------------------------------------------------------
-- 3. The canonical catalog
-- ---------------------------------------------------------------------------------------------
create table public.game_catalog (
  game_key text primary key check (game_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  normalized_name text not null check (char_length(normalized_name) between 1 and 160),
  search_key text not null check (char_length(search_key) between 1 and 160 and search_key = replace(normalized_name, ' ', '')),
  popularity integer not null default 0 check (popularity >= 0),
  artwork_ref text check (artwork_ref is null or char_length(artwork_ref) <= 200),
  is_active boolean not null default true,
  catalog_source text not null check (catalog_source ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- LIKE '%q%' on the compact key is served by this index for any query of 3 or more characters (which is also the product minimum)
create index game_catalog_search_key_trgm on public.game_catalog using gin (search_key extensions.gin_trgm_ops);

create table public.game_catalog_aliases (
  game_key text not null references public.game_catalog (game_key) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 120),
  search_key text not null check (char_length(search_key) between 1 and 160),
  primary key (game_key, search_key)
);
create index game_catalog_aliases_search_key_trgm on public.game_catalog_aliases using gin (search_key extensions.gin_trgm_ops);

-- the platforms the catalog RELIABLY knows for a game. Missing data means "not offered", never "assumed".
create table public.game_catalog_platforms (
  game_key text not null references public.game_catalog (game_key) on delete cascade,
  platform_key text not null references public.game_platforms (platform_key),
  primary key (game_key, platform_key)
);

-- provider identifiers of a canonical game. Many providers can name the same game; one identifier names exactly one game.
create table public.game_catalog_provider_ids (
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  external_id text not null check (char_length(external_id) between 1 and 128),
  game_key text not null references public.game_catalog (game_key) on delete cascade,
  primary key (provider, external_id)
);
create index game_catalog_provider_ids_game_idx on public.game_catalog_provider_ids (game_key);

-- ---------------------------------------------------------------------------------------------
-- 4. The user's OWN platform declarations. One row per (identity, canonical game, platform). Trust is MANUAL by construction.
--    The composite foreign key means the database itself only accepts a platform the catalog lists for that game.
--    Provider discovery is NOT stored here: it stays in public.discovered_games, which no manual function can write.
-- ---------------------------------------------------------------------------------------------
create table public.entity_game_platforms (
  entity_id uuid not null references public.entities (entity_id) on delete cascade,
  game_key text not null,
  platform_key text not null,
  trust_status text not null default 'MANUAL' check (trust_status = 'MANUAL'),
  created_at timestamptz not null default now(),
  primary key (entity_id, game_key, platform_key),
  constraint entity_game_platforms_allowed_platform foreign key (game_key, platform_key) references public.game_catalog_platforms (game_key, platform_key)
);
create index entity_game_platforms_entity_idx on public.entity_game_platforms (entity_id, created_at desc);

alter table public.game_platforms enable row level security;
alter table public.game_catalog enable row level security;
alter table public.game_catalog_aliases enable row level security;
alter table public.game_catalog_platforms enable row level security;
alter table public.game_catalog_provider_ids enable row level security;
alter table public.entity_game_platforms enable row level security;

create policy "owners read their own manual game platforms"
on public.entity_game_platforms for select to authenticated
using (exists (
  select 1 from public.entity_memberships m
  where m.entity_id = entity_game_platforms.entity_id and m.user_id = (select auth.uid()) and m.role = 'OWNER'
));

-- No client role has ANY table privilege on anything here: the catalog is read only through the bounded functions below, and it is not writable by a client at all.
revoke all on table public.game_platforms, public.game_catalog, public.game_catalog_aliases, public.game_catalog_platforms, public.game_catalog_provider_ids, public.entity_game_platforms
from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. The recognition map is already part of the catalog: seed a canonical entry for every game the map names, and enrich it from its provider.
--    (No game is named here; everything comes from public.known_game_sources. Its platforms are only what its provider itself establishes: Steam -> Steam + PC.)
-- ---------------------------------------------------------------------------------------------
insert into public.game_catalog (game_key, display_name, normalized_name, search_key, popularity, catalog_source)
select distinct on (k.game_key) k.game_key, k.display_name, private.game_search_normalize(k.display_name),
  replace(private.game_search_normalize(k.display_name), ' ', ''), 0, 'GAMID_RECOGNITION'
from public.known_game_sources k
order by k.game_key, k.source_provider, k.external_game_id
on conflict (game_key) do nothing;

insert into public.game_catalog_provider_ids (provider, external_id, game_key)
select k.source_provider, k.external_game_id, k.game_key from public.known_game_sources k
on conflict (provider, external_id) do nothing;

insert into public.game_catalog_platforms (game_key, platform_key)
select k.game_key, p.platform_key from public.known_game_sources k join public.game_platforms p on p.provider_key = k.source_provider
union
select k.game_key, p.parent_platform_key from public.known_game_sources k join public.game_platforms p on p.provider_key = k.source_provider where p.parent_platform_key is not null
on conflict (game_key, platform_key) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 6. Recognition for discovered games now also uses the catalog's provider identifiers (fallback ONLY: the accepted recognition map still wins).
--    Same signature and result columns as before, so a discovered Steam game that the catalog knows resolves to its canonical key and a manual
--    declaration for that game merges into the SAME row instead of creating a second one. Nothing else about this function changes.
-- ---------------------------------------------------------------------------------------------
create or replace function private.get_my_discovered_games_impl(candidate_provider text, candidate_limit integer, candidate_offset integer)
returns table (
  external_game_id text,
  game_name text,
  icon_ref text,
  playtime_minutes integer,
  trust_status text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  recognized_game_key text,
  recognized_name text
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  wanted_provider text := lower(btrim(candidate_provider));
  owned_entity_id uuid;
  max_rows integer := least(greatest(coalesce(candidate_limit, 1000), 1), 1000);
  skip_rows integer := greatest(coalesce(candidate_offset, 0), 0);
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if wanted_provider is null or wanted_provider <> 'steam' then raise exception using errcode = '22023', message = 'INVALID_PROVIDER'; end if;

  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  return query
  select d.external_game_id, d.game_name, d.icon_ref, d.playtime_minutes, d.trust_status, d.first_seen_at, d.last_seen_at,
    coalesce(k.game_key, cp.game_key), coalesce(k.display_name, c.display_name)
  from public.discovered_games d
  join public.gaming_connections g on g.connection_id = d.connection_id and g.entity_id = owned_entity_id and g.provider_key = wanted_provider
  left join public.known_game_sources k on k.source_provider = d.source_provider and k.external_game_id = d.external_game_id
  left join public.game_catalog_provider_ids cp on cp.provider = d.source_provider and cp.external_id = d.external_game_id
  left join public.game_catalog c on c.game_key = cp.game_key and c.is_active
  where d.entity_id = owned_entity_id and d.source_provider = wanted_provider
  order by d.playtime_minutes desc nulls last, lower(coalesce(d.game_name, '')), d.external_game_id
  limit max_rows offset skip_rows;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Helper: the platforms a REAL PROVIDER has established for this identity and canonical game (never anything the user declared).
--    Not granted to any client role; only the owner-scoped functions below call it.
-- ---------------------------------------------------------------------------------------------
create function private.provider_established_platforms(candidate_entity_id uuid, candidate_game_key text)
returns setof text
language sql stable security definer
set search_path = ''
as $$
  select distinct p.platform_key
  from public.discovered_games d
  join public.game_platforms p on p.provider_key = d.source_provider and p.is_active
  where d.entity_id = candidate_entity_id
    and (
      exists (select 1 from public.known_game_sources k where k.source_provider = d.source_provider and k.external_game_id = d.external_game_id and k.game_key = candidate_game_key)
      or exists (select 1 from public.game_catalog_provider_ids cp where cp.provider = d.source_provider and cp.external_id = d.external_game_id and cp.game_key = candidate_game_key)
    );
$$;

-- ---------------------------------------------------------------------------------------------
-- 8. Search (authenticated). BOUNDED: at most 12 rows, never runs for fewer than 3 meaningful characters, indexed. Case-, punctuation- and
--    whitespace-insensitive ("spiderman" finds "Spider-Man"). Ranking: exact name, then name prefix / exact alias, then alias prefix / word start, then the
--    rest; ties by popularity. No typo tolerance (fuzzy matching was not added because it cannot be made precise enough not to suggest wrong games).
-- ---------------------------------------------------------------------------------------------
create function private.search_game_catalog_impl(candidate_query text, candidate_limit integer)
returns table (game_key text, display_name text, matched_alias text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  spaced text;
  compact text;
  max_rows integer := least(greatest(coalesce(candidate_limit, 10), 1), 12);
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if candidate_query is null or char_length(candidate_query) > 80 then return; end if;
  spaced := private.game_search_normalize(candidate_query);
  compact := replace(spaced, ' ', '');
  if char_length(compact) < 3 then return; end if;

  return query
  with hits as (
    select c.game_key as hit_key, c.display_name as hit_name, null::text as hit_alias,
      case when c.search_key = compact then 0
           when c.search_key like compact || '%' then 1
           when c.normalized_name like '% ' || spaced || '%' then 2
           else 3 end as tier,
      c.popularity as pop
    from public.game_catalog c
    where c.is_active and c.search_key like '%' || compact || '%'
    union all
    select c.game_key, c.display_name, a.alias,
      case when a.search_key = compact then 1
           when a.search_key like compact || '%' then 2
           else 4 end,
      c.popularity
    from public.game_catalog_aliases a
    join public.game_catalog c on c.game_key = a.game_key
    where c.is_active and a.search_key like '%' || compact || '%'
  ), best as (
    select distinct on (h.hit_key) h.hit_key, h.hit_name, h.hit_alias, h.tier, h.pop
    from hits h
    order by h.hit_key, h.tier, h.pop desc
  )
  select b.hit_key, b.hit_name, b.hit_alias
  from best b
  order by b.tier, b.pop desc, b.hit_name, b.hit_key
  limit max_rows;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 9. One game's platform picture for the CALLER: what the catalog supports, what a provider established (read-only for the user), what the user declared.
-- ---------------------------------------------------------------------------------------------
create function private.get_my_game_platform_state_impl(candidate_game_key text)
returns table (game_key text, display_name text, supported jsonb, established jsonb, manual jsonb)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
  game public.game_catalog%rowtype;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  select * into game from public.game_catalog c where c.game_key = candidate_game_key and c.is_active;
  if not found then raise exception using errcode = '22023', message = 'INVALID_GAME'; end if;

  return query
  select game.game_key, game.display_name,
    coalesce((select jsonb_agg(jsonb_build_object('platform_key', p.platform_key, 'display_name', p.display_name, 'family', p.family, 'parent_platform_key', p.parent_platform_key) order by p.sort_order)
      from public.game_catalog_platforms cp join public.game_platforms p on p.platform_key = cp.platform_key and p.is_active where cp.game_key = game.game_key), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('platform_key', p.platform_key, 'display_name', p.display_name) order by p.sort_order)
      from public.game_platforms p where p.platform_key in (select private.provider_established_platforms(owned_entity_id, game.game_key))), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('platform_key', p.platform_key, 'display_name', p.display_name) order by p.sort_order)
      from public.entity_game_platforms x join public.game_platforms p on p.platform_key = x.platform_key
      where x.entity_id = owned_entity_id and x.game_key = game.game_key), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 10. The caller's manual games (one row per canonical game with their declared platforms). Read only.
-- ---------------------------------------------------------------------------------------------
create function private.get_my_manual_games_impl()
returns table (game_key text, display_name text, trust_status text, added_at timestamptz, platforms jsonb)
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

  return query
  select c.game_key, c.display_name, 'MANUAL'::text, min(x.created_at),
    jsonb_agg(jsonb_build_object('platform_key', p.platform_key, 'display_name', p.display_name) order by p.sort_order)
  from public.entity_game_platforms x
  join public.game_catalog c on c.game_key = x.game_key
  join public.game_platforms p on p.platform_key = x.platform_key
  where x.entity_id = owned_entity_id
  group by c.game_key, c.display_name
  order by min(x.created_at) desc, c.display_name, c.game_key
  limit 300;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 11. Write: declare (or change) the platforms the caller plays a canonical game on. The backend validates the game and every platform itself and
--     never trusts a client-supplied name. It can only ever write MANUAL declarations, and a platform a provider already established is refused (not duplicated).
-- ---------------------------------------------------------------------------------------------
create function private.save_my_manual_game_impl(candidate_game_key text, candidate_platform_keys text[])
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
  requested text[];
  established text[];
  bad integer;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from auth.users u where u.id = caller and u.email_confirmed_at is not null) then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_VERIFIED';
  end if;
  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;

  if candidate_game_key is null or not exists (select 1 from public.game_catalog c where c.game_key = candidate_game_key and c.is_active) then
    raise exception using errcode = '22023', message = 'INVALID_GAME';
  end if;
  if candidate_platform_keys is null or coalesce(array_length(candidate_platform_keys, 1), 0) = 0 then
    raise exception using errcode = '22023', message = 'NO_PLATFORMS';
  end if;
  if array_length(candidate_platform_keys, 1) > 12 then raise exception using errcode = '22023', message = 'INVALID_PLATFORM'; end if;
  select array_agg(distinct x) into requested from unnest(candidate_platform_keys) as x;
  if requested is null or array_position(requested, null) is not null then raise exception using errcode = '22023', message = 'INVALID_PLATFORM'; end if;

  -- every platform must be one the catalog lists for THIS game (and active); anything else is refused, never guessed
  select count(*) into bad from unnest(requested) as r(platform_key)
  where not exists (
    select 1 from public.game_catalog_platforms cp join public.game_platforms p on p.platform_key = cp.platform_key and p.is_active
    where cp.game_key = candidate_game_key and cp.platform_key = r.platform_key
  );
  if bad > 0 then raise exception using errcode = '22023', message = 'INVALID_PLATFORM'; end if;

  perform pg_advisory_xact_lock(hashtextextended('manual-games:' || owned_entity_id::text, 0));

  select coalesce(array_agg(pe), '{}'::text[]) into established from private.provider_established_platforms(owned_entity_id, candidate_game_key) as pe;
  if requested && established then raise exception using errcode = '22023', message = 'PLATFORM_ALREADY_DISCOVERED'; end if;

  if not exists (select 1 from public.entity_game_platforms x where x.entity_id = owned_entity_id and x.game_key = candidate_game_key)
     and (select count(distinct x.game_key) from public.entity_game_platforms x where x.entity_id = owned_entity_id) >= 300 then
    raise exception using errcode = '22023', message = 'GAME_LIMIT_REACHED';
  end if;

  delete from public.entity_game_platforms x where x.entity_id = owned_entity_id and x.game_key = candidate_game_key and x.platform_key <> all (requested);
  insert into public.entity_game_platforms (entity_id, game_key, platform_key)
  select owned_entity_id, candidate_game_key, r from unnest(requested) as r
  on conflict (entity_id, game_key, platform_key) do nothing;
  return 'SAVED';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 12. Write: remove the caller's manual declarations for a game. It deletes ONLY entity_game_platforms rows; a game a provider discovered stays exactly as it was.
-- ---------------------------------------------------------------------------------------------
create function private.remove_my_manual_game_impl(candidate_game_key text)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_entity_id uuid;
  removed integer;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select e.entity_id into owned_entity_id
  from public.entity_memberships m
  join public.entities e on e.entity_id = m.entity_id
  where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO'
  limit 1;
  if owned_entity_id is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;
  if candidate_game_key is null or char_length(candidate_game_key) > 64 then raise exception using errcode = '22023', message = 'INVALID_GAME'; end if;

  perform pg_advisory_xact_lock(hashtextextended('manual-games:' || owned_entity_id::text, 0));
  delete from public.entity_game_platforms x where x.entity_id = owned_entity_id and x.game_key = candidate_game_key;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 13. Catalog import (NOT reachable from any client role, not even service_role: it is run by the project owner's database session only).
--     Idempotent and merge-first: an item is matched to an existing canonical game through ANY of its provider identifiers before a new key is minted,
--     so the same game arriving from two sources (or twice) enriches one canonical row and never duplicates it. It only adds: it never removes a platform,
--     an alias or an identifier, and it never renames or deactivates a game.
--     item: {"source":"WIKIDATA","ref":"Q1","name":"...","popularity":12,"platforms":["pc","ps5"],"aliases":["..."],"ids":[{"provider":"steam","id":"123"}]}
-- ---------------------------------------------------------------------------------------------
create function private.import_game_catalog_batch(candidate_items jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  it jsonb;
  src text;
  ref text;
  item_name text;
  norm text;
  pop integer;
  found_key text;
  new_key text;
  base_key text;
  ident jsonb;
  created integer := 0;
  merged integer := 0;
  skipped integer := 0;
begin
  if candidate_items is null or jsonb_typeof(candidate_items) <> 'array' then raise exception using errcode = '22023', message = 'INVALID_BATCH'; end if;
  for it in select value from jsonb_array_elements(candidate_items) loop
    src := upper(btrim(coalesce(it->>'source', '')));
    ref := btrim(coalesce(it->>'ref', ''));
    item_name := btrim(coalesce(it->>'name', ''));
    norm := private.game_search_normalize(item_name);
    pop := least(greatest(coalesce((it->>'popularity')::integer, 0), 0), 1000000);
    if src !~ '^[A-Z][A-Z0-9_]{1,31}$' or ref = '' or char_length(ref) > 128 or item_name = '' or char_length(item_name) > 120 or char_length(norm) < 2 or char_length(norm) > 160 then
      skipped := skipped + 1;
      continue;
    end if;

    -- resolve the canonical game through ANY identifier first (the source's own id, then every other provider id)
    select cp.game_key into found_key from public.game_catalog_provider_ids cp where cp.provider = lower(src) and cp.external_id = ref;
    if found_key is null and jsonb_typeof(it->'ids') = 'array' then
      for ident in select value from jsonb_array_elements(it->'ids') loop
        select cp.game_key into found_key from public.game_catalog_provider_ids cp
        where cp.provider = lower(btrim(coalesce(ident->>'provider', ''))) and cp.external_id = btrim(coalesce(ident->>'id', ''));
        exit when found_key is not null;
      end loop;
    end if;

    if found_key is null then
      base_key := regexp_replace(replace(norm, ' ', '_'), '[^a-z0-9_]', '', 'g');
      if base_key = '' then skipped := skipped + 1; continue; end if;
      if base_key !~ '^[a-z]' then base_key := 'g_' || base_key; end if;
      base_key := left(base_key, 44);
      new_key := base_key;
      if exists (select 1 from public.game_catalog c where c.game_key = new_key) then
        new_key := left(base_key, 44) || '_' || left(regexp_replace(lower(ref), '[^a-z0-9]', '', 'g'), 18);
      end if;
      if exists (select 1 from public.game_catalog c where c.game_key = new_key) then skipped := skipped + 1; continue; end if;
      insert into public.game_catalog (game_key, display_name, normalized_name, search_key, popularity, catalog_source)
      values (new_key, item_name, norm, replace(norm, ' ', ''), pop, src);
      found_key := new_key;
      created := created + 1;
    else
      update public.game_catalog c set popularity = greatest(c.popularity, pop), updated_at = now() where c.game_key = found_key and c.popularity < pop;
      merged := merged + 1;
    end if;

    insert into public.game_catalog_provider_ids (provider, external_id, game_key) values (lower(src), ref, found_key) on conflict (provider, external_id) do nothing;
    if jsonb_typeof(it->'ids') = 'array' then
      for ident in select value from jsonb_array_elements(it->'ids') loop
        if coalesce(ident->>'provider', '') ~ '^[a-z][a-z0-9_]{1,31}$' and char_length(coalesce(ident->>'id', '')) between 1 and 128 then
          insert into public.game_catalog_provider_ids (provider, external_id, game_key) values (ident->>'provider', ident->>'id', found_key) on conflict (provider, external_id) do nothing;
        end if;
      end loop;
    end if;
    if jsonb_typeof(it->'platforms') = 'array' then
      insert into public.game_catalog_platforms (game_key, platform_key)
      select distinct found_key, p.platform_key from jsonb_array_elements_text(it->'platforms') as x(pk)
      join public.game_platforms p on p.platform_key = x.pk and p.is_active
      on conflict (game_key, platform_key) do nothing;
    end if;
    if jsonb_typeof(it->'aliases') = 'array' then
      insert into public.game_catalog_aliases (game_key, alias, search_key)
      select found_key, min(btrim(a.alias)), replace(private.game_search_normalize(a.alias), ' ', '')
      from jsonb_array_elements_text(it->'aliases') as a(alias)
      where char_length(btrim(a.alias)) between 3 and 120 and char_length(replace(private.game_search_normalize(a.alias), ' ', '')) between 3 and 160
        and replace(private.game_search_normalize(a.alias), ' ', '') <> replace(norm, ' ', '')
      group by replace(private.game_search_normalize(a.alias), ' ', '')
      limit 12
      on conflict (game_key, search_key) do nothing;
    end if;
  end loop;
  return jsonb_build_object('created', created, 'merged', merged, 'skipped', skipped);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 14. Public wrappers (established security-invoker + private-impl pattern) and privileges
-- ---------------------------------------------------------------------------------------------
create function public.search_game_catalog(candidate_query text, candidate_limit integer default 10)
returns table (game_key text, display_name text, matched_alias text)
language sql stable security invoker
set search_path = ''
as $$ select * from private.search_game_catalog_impl(candidate_query, candidate_limit); $$;

create function public.get_my_game_platform_state(candidate_game_key text)
returns table (game_key text, display_name text, supported jsonb, established jsonb, manual jsonb)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_game_platform_state_impl(candidate_game_key); $$;

create function public.get_my_manual_games()
returns table (game_key text, display_name text, trust_status text, added_at timestamptz, platforms jsonb)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_manual_games_impl(); $$;

create function public.save_my_manual_game(candidate_game_key text, candidate_platform_keys text[])
returns text
language sql volatile security invoker
set search_path = ''
as $$ select private.save_my_manual_game_impl(candidate_game_key, candidate_platform_keys); $$;

create function public.remove_my_manual_game(candidate_game_key text)
returns integer
language sql volatile security invoker
set search_path = ''
as $$ select private.remove_my_manual_game_impl(candidate_game_key); $$;

revoke all on function
  private.game_search_normalize(text), private.provider_established_platforms(uuid, text), private.search_game_catalog_impl(text, integer),
  private.get_my_game_platform_state_impl(text), private.get_my_manual_games_impl(), private.save_my_manual_game_impl(text, text[]),
  private.remove_my_manual_game_impl(text), private.import_game_catalog_batch(jsonb),
  public.search_game_catalog(text, integer), public.get_my_game_platform_state(text), public.get_my_manual_games(),
  public.save_my_manual_game(text, text[]), public.remove_my_manual_game(text)
from public, anon, authenticated, service_role;

-- owner-facing (authenticated). private.game_search_normalize is called by search_game_catalog_impl, which is SECURITY DEFINER, so callers need no grant on it.
grant execute on function
  private.search_game_catalog_impl(text, integer), private.get_my_game_platform_state_impl(text), private.get_my_manual_games_impl(),
  private.save_my_manual_game_impl(text, text[]), private.remove_my_manual_game_impl(text),
  public.search_game_catalog(text, integer), public.get_my_game_platform_state(text), public.get_my_manual_games(),
  public.save_my_manual_game(text, text[]), public.remove_my_manual_game(text)
to authenticated;
