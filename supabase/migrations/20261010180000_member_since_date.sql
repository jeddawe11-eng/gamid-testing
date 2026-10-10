-- Classic Profile visual review (DEC-0005): Member Since shows the full registration date (day, month, year) instead of the year only - GamID TESTING only.
--
-- The date is the GamID's own entities.created_at, read in UTC and returned as a plain calendar date 'YYYY-MM-DD' (no time, no time zone), so it is the same for
-- every visitor wherever they are; the page formats it ("10 October 2026") without any time-zone conversion. It is read-only (no write path exists). The year
-- column stays for compatibility. Only the return shape of these three functions changes (a new trailing column); their rules, grants and privacy do not.

drop function public.get_public_profile_extras(text);
drop function private.get_public_profile_extras_impl(text);
drop function public.set_my_about(text, text[], text[], boolean, boolean, boolean);
drop function private.set_my_about_impl(text, text[], text[], boolean, boolean, boolean);
drop function public.get_my_about();
drop function private.get_my_about_impl();

create function private.get_my_about_impl()
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb, member_since_date text)
language sql stable security definer
set search_path = ''
as $$
  select p.about_location, p.about_languages, p.about_genres, p.show_about_location, p.show_about_languages, p.show_about_genres,
    extract(year from e.created_at at time zone 'UTC')::integer, private.about_catalogs(),
    to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD')
  from public.profiles p join public.entities e on e.entity_id = p.entity_id
  where p.profile_id = (select owner_profile_id from private.banner_owner());
$$;

-- (body identical to 20261010160000_profile_about_me.sql; only the returned row gains member_since_date)
create function private.set_my_about_impl(candidate_location text, candidate_languages text[], candidate_genres text[], candidate_show_location boolean, candidate_show_languages boolean, candidate_show_genres boolean)
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb, member_since_date text)
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

create function private.get_public_profile_extras_impl(candidate_handle text)
returns table (member_since_year integer, has_banner boolean, about_location text, about_languages jsonb, about_genres jsonb, member_since_date text)
language sql stable security definer
set search_path = ''
as $$
  select extract(year from e.created_at at time zone 'UTC')::integer,
    private.public_banner_object(e.gamid_handle) is not null,
    case when p.show_about_location then p.about_location end,
    case when p.show_about_languages then coalesce((select jsonb_agg(jsonb_build_object('code', l.language_code, 'label', l.label) order by array_position(p.about_languages, l.language_code))
      from public.spoken_language_catalog l where l.language_code = any (p.about_languages) and l.active), '[]'::jsonb) else '[]'::jsonb end,
    case when p.show_about_genres then coalesce((select jsonb_agg(jsonb_build_object('key', g.genre_key, 'label', g.label) order by array_position(p.about_genres, g.genre_key))
      from public.game_genre_catalog g where g.genre_key = any (p.about_genres) and g.active), '[]'::jsonb) else '[]'::jsonb end,
    to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD')
  from public.entities e join public.profiles p on p.entity_id = e.entity_id
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC';
$$;

create function public.get_my_about()
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb, member_since_date text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_about_impl(); $$;

create function public.set_my_about(candidate_location text, candidate_languages text[], candidate_genres text[], candidate_show_location boolean, candidate_show_languages boolean, candidate_show_genres boolean)
returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean, member_since_year integer, catalogs jsonb, member_since_date text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_my_about_impl(candidate_location, candidate_languages, candidate_genres, candidate_show_location, candidate_show_languages, candidate_show_genres); $$;

create function public.get_public_profile_extras(candidate_handle text)
returns table (member_since_year integer, has_banner boolean, about_location text, about_languages jsonb, about_genres jsonb, member_since_date text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_public_profile_extras_impl(candidate_handle); $$;

revoke all on function
  private.get_my_about_impl(), private.set_my_about_impl(text, text[], text[], boolean, boolean, boolean), private.get_public_profile_extras_impl(text),
  public.get_my_about(), public.set_my_about(text, text[], text[], boolean, boolean, boolean), public.get_public_profile_extras(text)
from public, anon, authenticated, service_role;
grant execute on function
  private.get_my_about_impl(), private.set_my_about_impl(text, text[], text[], boolean, boolean, boolean),
  public.get_my_about(), public.set_my_about(text, text[], text[], boolean, boolean, boolean)
to authenticated;
grant execute on function private.get_public_profile_extras_impl(text), public.get_public_profile_extras(text) to anon, authenticated;
