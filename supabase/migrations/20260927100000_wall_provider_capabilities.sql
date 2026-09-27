-- Wall Media & Links provider set (GamID TESTING only).
--
-- The database validator's provider table (private.wall_embed_specs) is replaced by the post-manual-QA provider set, kept identical to the JavaScript adapters
-- (dist/wall-kit/embed/providers/*.js) by the drift test in tests/wall-w4-embeds.test.js, which reads the LATEST definition of this function:
--   added    SoundCloud (track, playlist, profile - all players), Vimeo (video player; profile card/link), Kick (channel player),
--            Facebook (video, reel, page - card/link only: its official player needs the Facebook JS SDK), Snapchat (Spotlight player; profile card/link)
--   kept     YouTube, TikTok, Twitch, Spotify, X, Instagram, Discord, Steam - every existing row is unchanged, so every saved Wall stays valid.
-- Only the function body changes (same signature, same privileges); nothing is dropped and no data is touched. The other validator functions are unchanged: an
-- embed still stores only a provider key, a content kind and a strictly patterned id (never a URL or markup), and every address is rebuilt by the adapter.
create or replace function private.wall_embed_specs()
returns table (provider text, kind text, id_pattern text, inline boolean)
language sql immutable set search_path = ''
as $$
  select * from (values
    ('youtube', 'video', '^[A-Za-z0-9_-]{11}$', true),
    ('youtube', 'playlist', '^[A-Za-z0-9_-]{13,64}$', true),
    ('youtube', 'channel', '^(@[A-Za-z0-9._-]{3,30}|UC[A-Za-z0-9_-]{22})$', false),
    ('tiktok', 'video', '^[0-9]{8,25}$', true),
    ('tiktok', 'profile', '^@[A-Za-z0-9._]{2,24}$', false),
    ('twitch', 'channel', '^[A-Za-z0-9_]{3,25}$', true),
    ('twitch', 'video', '^[0-9]{5,15}$', true),
    ('twitch', 'clip', '^[A-Za-z0-9_-]{5,100}$', true),
    ('spotify', 'track', '^[A-Za-z0-9]{22}$', true),
    ('spotify', 'episode', '^[A-Za-z0-9]{22}$', true),
    ('spotify', 'album', '^[A-Za-z0-9]{22}$', true),
    ('spotify', 'playlist', '^[A-Za-z0-9]{22}$', true),
    ('spotify', 'show', '^[A-Za-z0-9]{22}$', true),
    ('spotify', 'artist', '^[A-Za-z0-9]{22}$', true),
    ('soundcloud', 'track', '^[a-z0-9_-]{2,64}/[a-z0-9_-]{1,120}$', true),
    ('soundcloud', 'playlist', '^[a-z0-9_-]{2,64}/sets/[a-z0-9_-]{1,120}$', true),
    ('soundcloud', 'profile', '^[a-z0-9_-]{2,64}$', true),
    ('vimeo', 'video', '^[0-9]{6,12}(:[0-9a-f]{6,20})?$', true),
    ('vimeo', 'profile', '^[A-Za-z0-9_-]{2,64}$', false),
    ('kick', 'channel', '^[A-Za-z0-9_-]{3,25}$', true),
    ('facebook', 'video', '^[0-9]{5,25}$', false),
    ('facebook', 'reel', '^[0-9]{5,25}$', false),
    ('facebook', 'page', '^[A-Za-z0-9.]{3,50}$', false),
    ('snapchat', 'spotlight', '^[A-Za-z0-9_-]{20,160}$', true),
    ('snapchat', 'profile', '^[A-Za-z0-9._-]{3,15}$', false),
    ('x', 'post', '^[0-9]{1,25}$', true),
    ('x', 'profile', '^[A-Za-z0-9_]{1,15}$', false),
    ('instagram', 'post', '^[A-Za-z0-9_-]{5,30}$', true),
    ('instagram', 'reel', '^[A-Za-z0-9_-]{5,30}$', true),
    ('instagram', 'profile', '^[A-Za-z0-9._]{1,30}$', false),
    ('discord', 'invite', '^[A-Za-z0-9-]{2,32}$', false),
    ('steam', 'app', '^[0-9]{1,10}$', true),
    ('steam', 'profile', '^(7656119[0-9]{10}|[A-Za-z0-9_-]{2,32})$', false),
    ('steam', 'group', '^[A-Za-z0-9_-]{2,64}$', false)
  ) as specs (provider, kind, id_pattern, inline);
$$;

revoke all on function private.wall_embed_specs() from public, anon, authenticated;
