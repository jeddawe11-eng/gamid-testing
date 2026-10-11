-- Classic Profile desktop consolidated update (Mazen 2026-10-11) - GamID TESTING only. Additive and reversible: no existing value is removed or rewritten.
--
-- 1. Location: a country / city catalog from GeoNames (cities with population >= 15,000 and the country list; CC BY 4.0 - attribution in docs, loaded by
--    scripts/location/geonames-import.mjs through private.import_location_batch, which only the database owner can run). The owner picks a country (stable ISO
--    3166-1 alpha-2 code) and then a city of THAT country (stable GeoNames id). The previous free-text Location (about_location) is kept untouched as the legacy
--    value: it stays shown until the owner replaces it, and get_my_about offers a suggestion only when the text matches exactly one country (and one city).
--    Nothing is converted automatically. One "Show on my GamID" switch still covers Location; no GPS / precise location is ever collected.
-- 2. Favorite Genres: no five-genre maximum any more - any number of active catalog genres (still no duplicates, still catalog-validated). The public desktop
--    profile draws at most five (client); every selected genre stays stored. Languages keep their maximum of five.
-- 3. Crews: at most 10 ACTIVE memberships (owned + joined) per GamID, checked on the server when creating a Crew and when accepting an invite. Pending invites
--    do not count; existing memberships are never touched (the largest today is 1).
-- 4. get_public_crews(handle): the consolidated My Crews view - the SAME Crews as the public 'crews' section (PUBLIC GamID, ACTIVE membership, Crew Wall
--    PUBLISHED, same order), each with its member count and at most 6 PUBLIC members (handle, display name, avatar reference - what their own public GamIDs
--    already expose).
-- 5. Game artwork (provisional, TESTING evaluation of SteamGridDB): a metadata-only cache (provider game id + image URLs on the provider CDN, never image bytes)
--    and a kill switch, read and written only by the game-artwork Edge Function (service role). Disabling it hides every cached result; deleting the cache
--    loses no user data.

-- ---------------------------------------------------------------------------------------------
-- 1. Location catalog + structured Location
-- ---------------------------------------------------------------------------------------------
create table public.location_countries (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  name text not null check (char_length(name) between 2 and 80),
  geoname_id bigint
);
create table public.location_cities (
  geoname_id bigint primary key,
  country_code text not null references public.location_countries(country_code) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  name_ar text check (name_ar is null or char_length(name_ar) between 1 and 120),
  search_key text not null check (char_length(search_key) between 1 and 1200),
  population integer not null default 0 check (population >= 0),
  unique (geoname_id, country_code)
);
create index location_cities_country_population_idx on public.location_cities (country_code, population desc);
alter table public.location_countries enable row level security;
alter table public.location_cities enable row level security;
revoke all on table public.location_countries, public.location_cities from public, anon, authenticated;

-- the loader: one batch {countries:[{code,name,geoname_id}], cities:[{id,country,name,name_ar,search,population}]}; idempotent (upsert)
create function private.import_location_batch(batch jsonb)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare n integer := 0;
begin
  insert into public.location_countries (country_code, name, geoname_id)
  select x ->> 'code', x ->> 'name', nullif(x ->> 'geoname_id', '')::bigint from jsonb_array_elements(coalesce(batch -> 'countries', '[]'::jsonb)) x
  on conflict (country_code) do update set name = excluded.name, geoname_id = excluded.geoname_id;
  insert into public.location_cities (geoname_id, country_code, name, name_ar, search_key, population)
  select (x ->> 'id')::bigint, x ->> 'country', x ->> 'name', nullif(x ->> 'name_ar', ''), x ->> 'search', coalesce((x ->> 'population')::integer, 0)
  from jsonb_array_elements(coalesce(batch -> 'cities', '[]'::jsonb)) x
  on conflict (geoname_id) do update set country_code = excluded.country_code, name = excluded.name, name_ar = excluded.name_ar, search_key = excluded.search_key, population = excluded.population;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.import_location_batch(jsonb) from public, anon, authenticated, service_role;

alter table public.profiles
  add column about_country_code text references public.location_countries(country_code) on delete restrict,
  add column about_city_id bigint,
  add constraint profiles_about_city_fk foreign key (about_city_id, about_country_code) references public.location_cities (geoname_id, country_code) on delete restrict,
  add constraint profiles_about_city_needs_country check (about_city_id is null or about_country_code is not null);
alter table public.profiles drop constraint profiles_about_switches_check;
alter table public.profiles add constraint profiles_about_switches_check check (
  (not show_about_location or about_location is not null or about_country_code is not null)
  and (not show_about_languages or cardinality(about_languages) > 0) and (not show_about_genres or cardinality(about_genres) > 0));
-- 2. Favorite Genres: the catalog (20 today) is the only limit; 64 is a defensive ceiling, not a product limit
alter table public.profiles drop constraint profiles_about_genres_check;
alter table public.profiles add constraint profiles_about_genres_check check (cardinality(about_genres) <= 64);

-- the formatted public / owner text of a profile's Location: "City, Country", "Country", or the legacy free text
create function private.about_location_text(candidate_profile uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p.about_country_code is not null then coalesce(ci.name || ', ', '') || co.name
    else p.about_location end
  from public.profiles p
  left join public.location_countries co on co.country_code = p.about_country_code
  left join public.location_cities ci on ci.geoname_id = p.about_city_id
  where p.profile_id = candidate_profile;
$$;

-- the legacy text -> {country_code, country_name, city_id, city_name} only when it matches exactly ONE country (the longest country name that ends the text)
-- and, if anything is left, exactly ONE city of that country by its name; otherwise null. A suggestion only: nothing is written.
create function private.about_location_suggestion(candidate_text text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  txt text := lower(btrim(regexp_replace(coalesce(candidate_text, ''), '[\s,]+', ' ', 'g')));
  country record;
  rest text;
  city record;
  cities integer;
begin
  if txt = '' then return null; end if;
  select c.country_code, c.name, char_length(c.name) len into country
  from public.location_countries c
  where txt = lower(c.name) or txt like '% ' || lower(c.name)
  order by char_length(c.name) desc limit 1;
  if not found then return null; end if;
  if (select count(*) from public.location_countries c where char_length(c.name) = country.len and (txt = lower(c.name) or txt like '% ' || lower(c.name))) > 1 then return null; end if;
  rest := btrim(left(txt, char_length(txt) - country.len));
  if rest = '' then return jsonb_build_object('country_code', country.country_code, 'country_name', country.name); end if;
  select count(*) into cities from public.location_cities ci where ci.country_code = country.country_code and lower(ci.name) = rest;
  if cities <> 1 then return null; end if;
  select ci.geoname_id, ci.name into city from public.location_cities ci where ci.country_code = country.country_code and lower(ci.name) = rest;
  return jsonb_build_object('country_code', country.country_code, 'country_name', country.name, 'city_id', city.geoname_id, 'city_name', city.name);
end;
$$;

create or replace function private.about_catalogs()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'languages', coalesce((select jsonb_agg(jsonb_build_object('code', l.language_code, 'label', l.label) order by l.sort_order) from public.spoken_language_catalog l where l.active), '[]'::jsonb),
    'genres', coalesce((select jsonb_agg(jsonb_build_object('key', g.genre_key, 'label', g.label) order by g.sort_order) from public.game_genre_catalog g where g.active), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('code', c.country_code, 'name', c.name) order by c.name) from public.location_countries c), '[]'::jsonb));
$$;

-- owner city search: cities of ONE country whose names (any script the catalog holds, accents folded by the caller) contain the query; most populous first
create function private.search_location_cities_impl(candidate_country text, candidate_query text)
returns table (city_id bigint, name text, name_ar text, population integer)
language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(btrim(left(coalesce(candidate_query, ''), 60)));
begin
  perform 1 from private.banner_owner();
  if candidate_country is null or candidate_country !~ '^[A-Z]{2}$' then return; end if;
  return query
  select ci.geoname_id, ci.name, ci.name_ar, ci.population from public.location_cities ci
  where ci.country_code = candidate_country and (q = '' or ci.search_key like '%' || q || '%')
  order by case when lower(ci.name) like q || '%' then 0 else 1 end, ci.population desc, ci.name
  limit 12;
end;
$$;
create function public.search_location_cities(candidate_country text, candidate_query text)
returns table (city_id bigint, name text, name_ar text, population integer)
language sql stable security invoker set search_path = '' as $$ select * from private.search_location_cities_impl(candidate_country, candidate_query); $$;

-- About Me readers / writer (new return shape and parameters; everything not named above is unchanged from 20261010180000)
drop function public.get_public_profile_extras(text);
drop function private.get_public_profile_extras_impl(text);
drop function public.set_my_about(text, text[], text[], boolean, boolean, boolean);
drop function private.set_my_about_impl(text, text[], text[], boolean, boolean, boolean);
drop function public.get_my_about();
drop function private.get_my_about_impl();

create function private.get_my_about_impl()
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb, member_since_date text,
  about_country_code text, about_city_id bigint, about_city_name text, legacy_location text, location_suggestion jsonb)
language sql stable security definer set search_path = '' as $$
  select private.about_location_text(p.profile_id), p.about_languages, p.about_genres, p.show_about_location, p.show_about_languages, p.show_about_genres,
    extract(year from e.created_at at time zone 'UTC')::integer, private.about_catalogs(), to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD'),
    p.about_country_code, p.about_city_id, ci.name,
    case when p.about_country_code is null then p.about_location end,
    case when p.about_country_code is null then private.about_location_suggestion(p.about_location) end
  from public.profiles p join public.entities e on e.entity_id = p.entity_id
  left join public.location_cities ci on ci.geoname_id = p.about_city_id
  where p.profile_id = (select owner_profile_id from private.banner_owner());
$$;

-- candidate_keep_legacy: with no country chosen, true keeps the existing legacy text as it is; a chosen country replaces it (the owner's own choice)
create function private.set_my_about_impl(candidate_country text, candidate_city bigint, candidate_keep_legacy boolean, candidate_languages text[], candidate_genres text[], candidate_show_location boolean, candidate_show_languages boolean, candidate_show_genres boolean)
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb, member_since_date text,
  about_country_code text, about_city_id bigint, about_city_name text, legacy_location text, location_suggestion jsonb)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me record;
  country text := nullif(btrim(coalesce(candidate_country, '')), '');
  langs text[] := coalesce(candidate_languages, array[]::text[]);
  genres text[] := coalesce(candidate_genres, array[]::text[]);
  legacy text;
begin
  select * into me from private.banner_owner();
  if country is not null and not exists (select 1 from public.location_countries c where c.country_code = country) then raise exception using errcode = '22023', message = 'INVALID_COUNTRY'; end if;
  if candidate_city is not null and (country is null or not exists (select 1 from public.location_cities ci where ci.geoname_id = candidate_city and ci.country_code = country)) then
    raise exception using errcode = '22023', message = 'INVALID_CITY';
  end if;
  if cardinality(langs) > 5 then raise exception using errcode = '22023', message = 'TOO_MANY_LANGUAGES'; end if;
  if cardinality(langs) <> (select count(distinct x) from unnest(langs) x) then raise exception using errcode = '22023', message = 'DUPLICATE_LANGUAGE'; end if;
  if cardinality(genres) <> (select count(distinct x) from unnest(genres) x) then raise exception using errcode = '22023', message = 'DUPLICATE_GENRE'; end if;
  if exists (select 1 from unnest(langs) x where not exists (select 1 from public.spoken_language_catalog l where l.language_code = x and l.active)) then raise exception using errcode = '22023', message = 'INVALID_LANGUAGE'; end if;
  if exists (select 1 from unnest(genres) x where not exists (select 1 from public.game_genre_catalog g where g.genre_key = x and g.active)) then raise exception using errcode = '22023', message = 'INVALID_GENRE'; end if;
  select p.about_location into legacy from public.profiles p where p.profile_id = me.owner_profile_id;
  if country is not null or not coalesce(candidate_keep_legacy, false) then legacy := null; end if;
  update public.profiles p set
    about_country_code = country, about_city_id = case when country is null then null else candidate_city end, about_location = legacy,
    about_languages = langs, about_genres = genres,
    show_about_location = coalesce(candidate_show_location, false) and (country is not null or legacy is not null),
    show_about_languages = coalesce(candidate_show_languages, false) and cardinality(langs) > 0,
    show_about_genres = coalesce(candidate_show_genres, false) and cardinality(genres) > 0,
    updated_at = now()
  where p.profile_id = me.owner_profile_id;
  return query select * from private.get_my_about_impl();
end;
$$;

create function private.get_public_profile_extras_impl(candidate_handle text)
returns table (member_since_year integer, has_banner boolean, about_location text, about_languages jsonb, about_genres jsonb, member_since_date text)
language sql stable security definer set search_path = '' as $$
  select extract(year from e.created_at at time zone 'UTC')::integer,
    private.public_banner_object(e.gamid_handle) is not null,
    case when p.show_about_location then private.about_location_text(p.profile_id) end,
    case when p.show_about_languages then coalesce((select jsonb_agg(jsonb_build_object('code', l.language_code, 'label', l.label) order by array_position(p.about_languages, l.language_code))
      from public.spoken_language_catalog l where l.language_code = any (p.about_languages) and l.active), '[]'::jsonb) else '[]'::jsonb end,
    case when p.show_about_genres then coalesce((select jsonb_agg(jsonb_build_object('key', g.genre_key, 'label', g.label) order by array_position(p.about_genres, g.genre_key))
      from public.game_genre_catalog g where g.genre_key = any (p.about_genres) and g.active), '[]'::jsonb) else '[]'::jsonb end,
    to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD')
  from public.entities e join public.profiles p on p.entity_id = e.entity_id
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC';
$$;

create function public.get_my_about()
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb, member_since_date text,
  about_country_code text, about_city_id bigint, about_city_name text, legacy_location text, location_suggestion jsonb)
language sql stable security invoker set search_path = '' as $$ select * from private.get_my_about_impl(); $$;
create function public.set_my_about(candidate_country text, candidate_city bigint, candidate_keep_legacy boolean, candidate_languages text[], candidate_genres text[], candidate_show_location boolean, candidate_show_languages boolean, candidate_show_genres boolean)
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb, member_since_date text,
  about_country_code text, about_city_id bigint, about_city_name text, legacy_location text, location_suggestion jsonb)
language sql volatile security invoker set search_path = '' as $$ select * from private.set_my_about_impl(candidate_country, candidate_city, candidate_keep_legacy, candidate_languages, candidate_genres, candidate_show_location, candidate_show_languages, candidate_show_genres); $$;
create function public.get_public_profile_extras(candidate_handle text)
returns table (member_since_year integer, has_banner boolean, about_location text, about_languages jsonb, about_genres jsonb, member_since_date text)
language sql stable security invoker set search_path = '' as $$ select * from private.get_public_profile_extras_impl(candidate_handle); $$;

revoke all on function
  private.get_my_about_impl(), private.set_my_about_impl(text, bigint, boolean, text[], text[], boolean, boolean, boolean), private.get_public_profile_extras_impl(text),
  public.get_my_about(), public.set_my_about(text, bigint, boolean, text[], text[], boolean, boolean, boolean), public.get_public_profile_extras(text),
  private.about_location_text(uuid), private.about_location_suggestion(text), private.search_location_cities_impl(text, text), public.search_location_cities(text, text)
from public, anon, authenticated, service_role;
grant execute on function
  private.get_my_about_impl(), private.set_my_about_impl(text, bigint, boolean, text[], text[], boolean, boolean, boolean),
  public.get_my_about(), public.set_my_about(text, bigint, boolean, text[], text[], boolean, boolean, boolean),
  private.about_location_suggestion(text), private.search_location_cities_impl(text, text), public.search_location_cities(text, text)
to authenticated;
grant execute on function private.get_public_profile_extras_impl(text), public.get_public_profile_extras(text), private.about_location_text(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Crews: at most 10 ACTIVE memberships (owned + joined) per GamID
-- ---------------------------------------------------------------------------------------------
alter table private.crew_policy add column max_memberships_per_identity integer not null default 10 check (max_memberships_per_identity between 1 and 100);
create function private.crew_max_memberships()
returns integer language sql stable security definer set search_path = '' as $$ select p.max_memberships_per_identity from private.crew_policy p where p.singleton; $$;
-- serialises every membership change of one GamID (across games), so two concurrent accepts cannot both pass the count
create function private.crew_lock_identity(candidate_entity uuid)
returns void language plpgsql volatile set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('gamid.crew_identity:' || candidate_entity::text, 0));
end;
$$;
create function private.crew_check_membership_room(candidate_entity uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.crew_lock_identity(candidate_entity);
  if (select count(*) from public.crew_members m where m.entity_id = candidate_entity and m.status = 'ACTIVE') >= private.crew_max_memberships() then
    raise exception using errcode = '54000', message = 'CREW_LIMIT_REACHED';
  end if;
end;
$$;
revoke all on function private.crew_max_memberships(), private.crew_lock_identity(uuid), private.crew_check_membership_room(uuid) from public, anon, authenticated, service_role;

-- (bodies identical to 20261003100000_my_crew.sql; each gains only the membership-room check before the new ACTIVE row)
create or replace function private.create_crew_impl(candidate_game_key text, candidate_name text)
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
  perform private.crew_check_membership_room(me);
  insert into public.crews (game_key, name, owner_entity_id) values (candidate_game_key, clean_name, me) returning crew_id into created;
  insert into public.crew_members (crew_id, game_key, entity_id, role, status, joined_at) values (created, candidate_game_key, me, 'OWNER', 'ACTIVE', now());
  return created;
end;
$$;

create or replace function private.respond_to_crew_invite_impl(candidate_crew uuid, candidate_accept boolean)
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
  perform private.crew_check_membership_room(me);
  update public.crew_members m set status = 'ACTIVE', joined_at = now() where m.crew_id = crew.crew_id and m.entity_id = me;
  perform private.notify(crew.owner_entity_id, me, 'crew.invite_accepted', crew.crew_id, private.crew_context(crew.crew_id));
  return 'ACCEPTED';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. The consolidated My Crews view (anonymous)
-- ---------------------------------------------------------------------------------------------
create function private.get_public_crews_impl(candidate_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'crew_id', c.crew_id, 'crew_name', c.name, 'game_key', c.game_key, 'game_name', g.display_name, 'role', cm.role,
      'member_count', (select count(*) from public.crew_members a where a.crew_id = c.crew_id and a.status = 'ACTIVE'),
      'members', coalesce((select jsonb_agg(jsonb_build_object('handle', x.gamid_handle, 'display_name', x.display_name, 'avatar_media_reference', x.avatar_media_reference) order by x.owner_first, x.joined_at, x.gamid_handle)
        from (select me.gamid_handle, nullif(btrim(coalesce(me.display_name, '')), '') display_name, me.avatar_media_reference, (mm.role <> 'OWNER') owner_first, mm.joined_at
              from public.crew_members mm
              join public.entities me on me.entity_id = mm.entity_id and me.entity_type = 'SOLO' and me.visibility = 'PUBLIC'
              where mm.crew_id = c.crew_id and mm.status = 'ACTIVE'
              order by (mm.role <> 'OWNER'), mm.joined_at, me.gamid_handle limit 6) x), '[]'::jsonb)
    ) order by g.display_name, c.game_key, c.crew_id), '[]'::jsonb)
  from public.entities e
  join public.crew_members cm on cm.entity_id = e.entity_id and cm.status = 'ACTIVE'
  join public.crews c on c.crew_id = cm.crew_id and c.game_key = cm.game_key
  join public.crew_walls cw on cw.crew_id = c.crew_id and cw.published
  join public.game_catalog g on g.game_key = c.game_key
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC';
$$;
create function public.get_public_crews(candidate_handle text)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.get_public_crews_impl(candidate_handle); $$;
revoke all on function private.get_public_crews_impl(text), public.get_public_crews(text) from public, anon, authenticated, service_role;
grant execute on function private.get_public_crews_impl(text), public.get_public_crews(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Game artwork: kill switch + metadata-only cache, service role only (the game-artwork Edge Function)
-- ---------------------------------------------------------------------------------------------
create table private.game_artwork_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  provider text not null default 'steamgriddb' check (provider in ('steamgriddb'))
);
insert into private.game_artwork_settings default values;
create table private.game_artwork_cache (
  game_key text not null references public.game_catalog(game_key) on delete cascade,
  provider text not null check (provider in ('steamgriddb')),
  status text not null check (status in ('MATCHED', 'NO_MATCH')),
  match_basis text check (match_basis in ('steam_appid', 'exact_name_year', 'exact_name')),
  provider_game_id bigint,
  icon_url text check (icon_url ~ '^https://cdn2\.steamgriddb\.com/[A-Za-z0-9/._-]{1,200}$'),
  grid_url text check (grid_url ~ '^https://cdn2\.steamgriddb\.com/[A-Za-z0-9/._-]{1,200}$'),
  hero_url text check (hero_url ~ '^https://cdn2\.steamgriddb\.com/[A-Za-z0-9/._-]{1,200}$'),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (game_key, provider),
  check (status = 'MATCHED' or (provider_game_id is null and icon_url is null and grid_url is null and hero_url is null))
);
revoke all on table private.game_artwork_settings, private.game_artwork_cache from public, anon, authenticated;

-- the games one PUBLIC GamID's public profile shows that may get artwork, with what matching may use. My Games rows only while My Games is public
-- (public_my_games_allowed); League only for a public League profile of a PUBLIC GamID; Crews only as the public 'crews' section lists them.
create function public.game_artwork_targets(candidate_handle text)
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
create function public.game_artwork_cache_get(candidate_keys text[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(c) - 'provider'), '[]'::jsonb) from private.game_artwork_cache c
  where c.game_key = any (candidate_keys[1:64]) and c.provider = (select s.provider from private.game_artwork_settings s where s.singleton) and c.expires_at > now();
$$;
create function public.game_artwork_cache_put(candidate_rows jsonb)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  insert into private.game_artwork_cache (game_key, provider, status, match_basis, provider_game_id, icon_url, grid_url, hero_url, fetched_at, expires_at)
  select x ->> 'game_key', 'steamgriddb', x ->> 'status', x ->> 'match_basis', nullif(x ->> 'provider_game_id', '')::bigint, x ->> 'icon_url', x ->> 'grid_url', x ->> 'hero_url', now(),
    now() + make_interval(days => 7)
  from jsonb_array_elements(candidate_rows) with ordinality t(x, i) where t.i <= 32
  on conflict (game_key, provider) do update set status = excluded.status, match_basis = excluded.match_basis, provider_game_id = excluded.provider_game_id,
    icon_url = excluded.icon_url, grid_url = excluded.grid_url, hero_url = excluded.hero_url, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.game_artwork_targets(text), public.game_artwork_cache_get(text[]), public.game_artwork_cache_put(jsonb) from public, anon, authenticated;
grant execute on function public.game_artwork_targets(text), public.game_artwork_cache_get(text[]), public.game_artwork_cache_put(jsonb) to service_role;
