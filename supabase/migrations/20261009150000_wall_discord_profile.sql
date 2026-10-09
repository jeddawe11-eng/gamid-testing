-- Wall link engine: Discord personal profiles (post My Socials review) - GamID TESTING only.
--
-- A personal Discord profile address (https://discord.com/users/<numeric user id>) was recognised as Discord but refused. It becomes the Discord kind 'profile'
-- (no player: inline = false); its adapter offers it as a Link only. Server invites ('invite') are unchanged. The table stays identical to the JavaScript adapters
-- (dist/wall-kit/embed/providers/*.js - drift test in tests/wall-post-qa-media.test.js reads the LATEST definition of this function). Only the function body
-- changes (same signature, same privileges): every existing row is kept, so every saved Wall stays valid. No data is touched.
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
    ('kick', 'video', '^[A-Za-z0-9_-]{3,25}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false),
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
    ('discord', 'profile', '^[0-9]{17,20}$', false),
    ('steam', 'app', '^[0-9]{1,10}$', true),
    ('steam', 'profile', '^(7656119[0-9]{10}|[A-Za-z0-9_-]{2,32})$', false),
    ('steam', 'group', '^[A-Za-z0-9_-]{2,64}$', false)
  ) as specs (provider, kind, id_pattern, inline);
$$;

revoke all on function private.wall_embed_specs() from public, anon, authenticated;
