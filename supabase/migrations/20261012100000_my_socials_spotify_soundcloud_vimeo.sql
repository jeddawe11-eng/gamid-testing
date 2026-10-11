-- My Socials: Spotify, SoundCloud and Vimeo (Mazen's approved change, 2026-10-12). TESTING only.
-- The shared link engine already knows them: the Wall's server rules (private.wall_embed_specs, 20261009150000_wall_discord_profile.sql) validate exactly these
-- account kinds - Spotify `artist`, SoundCloud `profile`, Vimeo `profile` - so My Socials only lists them. Tracks, playlists, albums, episodes, shows and videos stay
-- Wall content and are refused here by set_my_social_links (the kind must be one of the platform's account_kinds). Additive: existing platforms, their saved links,
-- the RPCs and every policy are unchanged; the per-account maximum follows the active catalog (set_my_social_links counts it).

insert into public.social_platform_catalog (platform_key, label, sort_order, active, account_kinds) values
  ('spotify', 'Spotify', 110, true, array['artist']),
  ('soundcloud', 'SoundCloud', 120, true, array['profile']),
  ('vimeo', 'Vimeo', 130, true, array['profile']);

-- every My Socials account kind must be a kind the Wall engine itself knows (the same guard as 20261009151000_my_socials_link_engine.sql)
do $$ begin
  if exists (select 1 from public.social_platform_catalog c cross join unnest(c.account_kinds) k
             where not exists (select 1 from private.wall_embed_specs() s where s.provider = c.platform_key and s.kind = k))
     or exists (select 1 from public.social_platform_catalog c where cardinality(c.account_kinds) = 0) then
    raise exception 'MY_SOCIALS_KIND_NOT_IN_WALL_ENGINE';
  end if;
end $$;
