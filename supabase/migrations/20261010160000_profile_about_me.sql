-- Classic Profile redesign Phase 2 (DEC-0005): About Me + the public desktop profile extras - GamID TESTING only.
--
-- About Me (owner-entered, all optional, all PRIVATE by default):
--   Location         manual city / country text, 1-60 characters, no links / markup / line breaks; never geolocated
--   Languages        up to 5 spoken languages from public.spoken_language_catalog
--   Favorite Genres  up to 5 gaming genres from public.game_genre_catalog
-- Each has its own explicit "Show on my GamID" switch (OFF by default). A switch can be ON only while its value is set: clearing a value turns its switch OFF.
-- Member Since is never stored: it is the year of the GamID's own entities.created_at, shown on public profiles.
--
-- get_public_profile_extras(handle) is the anonymous reader for the desktop Classic Profile: for a PUBLISHED (PUBLIC) SOLO GamID only, it returns Member Since,
-- whether a Banner can be delivered (the Banner itself only ever comes from the profile-banner Edge Function - never a Storage path), and exactly the About Me
-- values whose switch is ON. get_public_identity is not changed.

create table public.spoken_language_catalog (
  language_code text primary key check (language_code ~ '^[a-z]{2}$'),
  label text not null unique check (char_length(label) between 1 and 40),
  sort_order smallint not null,
  active boolean not null default true
);
insert into public.spoken_language_catalog (language_code, label, sort_order) values
  ('ar', 'Arabic', 10), ('en', 'English', 20), ('fr', 'French', 30), ('es', 'Spanish', 40), ('de', 'German', 50), ('it', 'Italian', 60), ('pt', 'Portuguese', 70),
  ('ru', 'Russian', 80), ('tr', 'Turkish', 90), ('fa', 'Persian', 100), ('ur', 'Urdu', 110), ('hi', 'Hindi', 120), ('bn', 'Bengali', 130), ('id', 'Indonesian', 140),
  ('ms', 'Malay', 150), ('tl', 'Filipino', 160), ('th', 'Thai', 170), ('vi', 'Vietnamese', 180), ('zh', 'Chinese', 190), ('ja', 'Japanese', 200), ('ko', 'Korean', 210),
  ('nl', 'Dutch', 220), ('sv', 'Swedish', 230), ('no', 'Norwegian', 240), ('da', 'Danish', 250), ('fi', 'Finnish', 260), ('pl', 'Polish', 270), ('uk', 'Ukrainian', 280),
  ('el', 'Greek', 290), ('he', 'Hebrew', 300), ('ro', 'Romanian', 310), ('cs', 'Czech', 320), ('hu', 'Hungarian', 330), ('sw', 'Swahili', 340);

create table public.game_genre_catalog (
  genre_key text primary key check (genre_key ~ '^[a-z][a-z_]{1,23}$'),
  label text not null unique check (char_length(label) between 1 and 40),
  sort_order smallint not null,
  active boolean not null default true
);
insert into public.game_genre_catalog (genre_key, label, sort_order) values
  ('action', 'Action', 10), ('adventure', 'Adventure', 20), ('rpg', 'RPG', 30), ('fps', 'FPS', 40), ('moba', 'MOBA', 50), ('battle_royale', 'Battle Royale', 60),
  ('strategy', 'Strategy', 70), ('simulation', 'Simulation', 80), ('sports', 'Sports', 90), ('racing', 'Racing', 100), ('fighting', 'Fighting', 110),
  ('survival', 'Survival', 120), ('horror', 'Horror', 130), ('puzzle', 'Puzzle', 140), ('platformer', 'Platformer', 150), ('mmo', 'MMO', 160),
  ('sandbox', 'Sandbox', 170), ('open_world', 'Open World', 180), ('card', 'Card Games', 190), ('rhythm', 'Rhythm', 200);

alter table public.spoken_language_catalog enable row level security;
alter table public.game_genre_catalog enable row level security;
revoke all on table public.spoken_language_catalog, public.game_genre_catalog from public, anon, authenticated;

alter table public.profiles
  add column about_location text,
  add column about_languages text[] not null default array[]::text[],
  add column about_genres text[] not null default array[]::text[],
  add column show_about_location boolean not null default false,
  add column show_about_languages boolean not null default false,
  add column show_about_genres boolean not null default false,
  add constraint profiles_about_location_check check (about_location is null or char_length(about_location) between 1 and 60),
  add constraint profiles_about_languages_check check (cardinality(about_languages) <= 5),
  add constraint profiles_about_genres_check check (cardinality(about_genres) <= 5),
  add constraint profiles_about_switches_check check ((not show_about_location or about_location is not null) and (not show_about_languages or cardinality(about_languages) > 0) and (not show_about_genres or cardinality(about_genres) > 0));

create function private.about_catalogs()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'languages', coalesce((select jsonb_agg(jsonb_build_object('code', l.language_code, 'label', l.label) order by l.sort_order) from public.spoken_language_catalog l where l.active), '[]'::jsonb),
    'genres', coalesce((select jsonb_agg(jsonb_build_object('key', g.genre_key, 'label', g.label) order by g.sort_order) from public.game_genre_catalog g where g.active), '[]'::jsonb));
$$;

create function private.get_my_about_impl()
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb)
language sql stable security definer
set search_path = ''
as $$
  select p.about_location, p.about_languages, p.about_genres, p.show_about_location, p.show_about_languages, p.show_about_genres,
    extract(year from e.created_at at time zone 'UTC')::integer, private.about_catalogs()
  from public.profiles p join public.entities e on e.entity_id = p.entity_id
  where p.profile_id = (select owner_profile_id from private.banner_owner());
$$;

-- Replaces the caller's About Me in one statement. Every value is validated here (the browser's checks are only early feedback); a refused request changes nothing.
create function private.set_my_about_impl(candidate_location text, candidate_languages text[], candidate_genres text[], candidate_show_location boolean, candidate_show_languages boolean, candidate_show_genres boolean)
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me record;
  place text := nullif(regexp_replace(btrim(coalesce(candidate_location, '')), '\s+', ' ', 'g'), '');
  langs text[] := coalesce(candidate_languages, array[]::text[]);
  genres text[] := coalesce(candidate_genres, array[]::text[]);
begin
  select * into me from private.banner_owner();
  if place is not null and (char_length(place) > 60 or candidate_location ~ '[[:cntrl:]]' or place ~* '(://|www\.|[<>{}\[\]\\`])') then
    raise exception using errcode = '22023', message = 'INVALID_ABOUT_LOCATION';
  end if;
  if cardinality(langs) > 5 then raise exception using errcode = '22023', message = 'TOO_MANY_LANGUAGES'; end if;
  if cardinality(genres) > 5 then raise exception using errcode = '22023', message = 'TOO_MANY_GENRES'; end if;
  if cardinality(langs) <> (select count(distinct x) from unnest(langs) x) then raise exception using errcode = '22023', message = 'DUPLICATE_LANGUAGE'; end if;
  if cardinality(genres) <> (select count(distinct x) from unnest(genres) x) then raise exception using errcode = '22023', message = 'DUPLICATE_GENRE'; end if;
  if exists (select 1 from unnest(langs) x where not exists (select 1 from public.spoken_language_catalog l where l.language_code = x and l.active)) then raise exception using errcode = '22023', message = 'INVALID_LANGUAGE'; end if;
  if exists (select 1 from unnest(genres) x where not exists (select 1 from public.game_genre_catalog g where g.genre_key = x and g.active)) then raise exception using errcode = '22023', message = 'INVALID_GENRE'; end if;
  update public.profiles p set
    about_location = place, about_languages = langs, about_genres = genres,
    show_about_location = coalesce(candidate_show_location, false) and place is not null,
    show_about_languages = coalesce(candidate_show_languages, false) and cardinality(langs) > 0,
    show_about_genres = coalesce(candidate_show_genres, false) and cardinality(genres) > 0,
    updated_at = now()
  where p.profile_id = me.owner_profile_id;
  return query select * from private.get_my_about_impl();
end;
$$;

-- Anonymous reader for the desktop Classic Profile (PUBLIC SOLO GamIDs only; nothing for any other)
create function private.get_public_profile_extras_impl(candidate_handle text)
returns table (member_since_year integer, has_banner boolean, about_location text, about_languages jsonb, about_genres jsonb)
language sql stable security definer
set search_path = ''
as $$
  select extract(year from e.created_at at time zone 'UTC')::integer,
    private.public_banner_object(e.gamid_handle) is not null,
    case when p.show_about_location then p.about_location end,
    case when p.show_about_languages then coalesce((select jsonb_agg(jsonb_build_object('code', l.language_code, 'label', l.label) order by array_position(p.about_languages, l.language_code))
      from public.spoken_language_catalog l where l.language_code = any (p.about_languages) and l.active), '[]'::jsonb) else '[]'::jsonb end,
    case when p.show_about_genres then coalesce((select jsonb_agg(jsonb_build_object('key', g.genre_key, 'label', g.label) order by array_position(p.about_genres, g.genre_key))
      from public.game_genre_catalog g where g.genre_key = any (p.about_genres) and g.active), '[]'::jsonb) else '[]'::jsonb end
  from public.entities e join public.profiles p on p.entity_id = e.entity_id
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC';
$$;

create function public.get_my_about()
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_about_impl(); $$;

create function public.set_my_about(candidate_location text, candidate_languages text[], candidate_genres text[], candidate_show_location boolean, candidate_show_languages boolean, candidate_show_genres boolean)
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb)
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_my_about_impl(candidate_location, candidate_languages, candidate_genres, candidate_show_location, candidate_show_languages, candidate_show_genres); $$;

create function public.get_public_profile_extras(candidate_handle text)
returns table (member_since_year integer, has_banner boolean, about_location text, about_languages jsonb, about_genres jsonb)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_public_profile_extras_impl(candidate_handle); $$;

revoke all on function
  private.about_catalogs(), private.get_my_about_impl(), private.set_my_about_impl(text, text[], text[], boolean, boolean, boolean), private.get_public_profile_extras_impl(text),
  public.get_my_about(), public.set_my_about(text, text[], text[], boolean, boolean, boolean), public.get_public_profile_extras(text)
from public, anon, authenticated, service_role;
grant execute on function
  private.about_catalogs(), private.get_my_about_impl(), private.set_my_about_impl(text, text[], text[], boolean, boolean, boolean),
  public.get_my_about(), public.set_my_about(text, text[], text[], boolean, boolean, boolean)
to authenticated;
grant execute on function private.get_public_profile_extras_impl(text), public.get_public_profile_extras(text) to anon, authenticated;
