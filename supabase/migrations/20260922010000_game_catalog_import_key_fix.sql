-- Game Catalog import: key generation for titles that are not plain Latin words. TESTING only.
--
-- The catalog importer (20260922000000) built a game_key from the ASCII letters and digits of the title. A title such as "Él" leaves ONE such character and a title
-- written in another script leaves none, which violates the accepted game_key shape (a letter followed by 1-63 more characters) and aborted the whole batch. This
-- redefines only that one branch (same signature, same result, same merge-first / only-adds / earliest-date behavior; no table, row or grant changes): such a game gets
-- a deterministic key derived from its source id ("g_<id>") or a "g_" prefix instead of being skipped. Existing game keys are never changed.
create or replace function private.import_game_catalog_batch(candidate_items jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  it jsonb;
  pr jsonb;
  src text;
  ref text;
  item_name text;
  norm text;
  pop integer;
  found_key text;
  new_key text;
  base_key text;
  ident jsonb;
  rel_date date;
  rel_prec smallint;
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
      -- a key needs 2+ characters starting with a letter. A title with no Latin letters or digits (or a single one, e.g. "Él") still deserves its game: it gets a
      -- deterministic key from the source id instead of being skipped (the title itself is kept exactly as written and stays fully searchable).
      base_key := regexp_replace(replace(norm, ' ', '_'), '[^a-z0-9_]', '', 'g');
      if base_key = '' then base_key := 'g_' || left(regexp_replace(lower(ref), '[^a-z0-9]', '', 'g'), 40); end if;
      if base_key !~ '^[a-z]' then base_key := 'g_' || base_key; end if;
      if char_length(base_key) < 3 then base_key := 'g_' || base_key; end if;
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

    -- canonical release: the earliest valid date wins; an invalid or missing date is ignored (never invented)
    begin
      rel_date := nullif(it->>'release_date', '')::date;
      rel_prec := nullif(it->>'release_date_precision', '')::smallint;
    exception when others then rel_date := null; rel_prec := null;
    end;
    if rel_date is not null and (rel_prec is null or rel_prec not in (9, 10, 11) or extract(year from rel_date) not between 1950 and 2100) then rel_date := null; end if;
    if rel_date is not null then
      update public.game_catalog c
      set release_date = rel_date, release_year = extract(year from rel_date)::smallint, release_date_precision = rel_prec, updated_at = now()
      where c.game_key = found_key and (c.release_date is null or rel_date < c.release_date);
    end if;

    -- platform-specific release: only where the item ties a date to that platform; the earliest per (game, platform) is kept
    if jsonb_typeof(it->'platform_releases') = 'array' then
      for pr in select value from jsonb_array_elements(it->'platform_releases') loop
        begin
          rel_date := nullif(pr->>'date', '')::date;
          rel_prec := nullif(pr->>'precision', '')::smallint;
        exception when others then rel_date := null; rel_prec := null;
        end;
        if rel_date is null or rel_prec is null or rel_prec not in (9, 10, 11) or extract(year from rel_date) not between 1950 and 2100 then continue; end if;
        insert into public.game_catalog_platforms as l (game_key, platform_key, release_year, release_date, release_date_precision)
        select found_key, p.platform_key, extract(year from rel_date)::smallint, rel_date, rel_prec
        from public.game_platforms p where p.platform_key = pr->>'platform' and p.is_active
        on conflict (game_key, platform_key) do update
        set release_year = excluded.release_year, release_date = excluded.release_date, release_date_precision = excluded.release_date_precision
        where l.release_date is null or excluded.release_date < l.release_date;
      end loop;
      -- the game's first release can never be later than the release on one of its platforms
      update public.game_catalog c
      set release_date = m.d, release_year = extract(year from m.d)::smallint, release_date_precision = m.prec, updated_at = now()
      from (select l.release_date as d, l.release_date_precision as prec from public.game_catalog_platforms l
            where l.game_key = found_key and l.release_date is not null order by l.release_date, l.release_date_precision desc limit 1) m
      where c.game_key = found_key and (c.release_date is null or m.d < c.release_date);
    end if;
  end loop;
  return jsonb_build_object('created', created, 'merged', merged, 'skipped', skipped);
end;
$$;
