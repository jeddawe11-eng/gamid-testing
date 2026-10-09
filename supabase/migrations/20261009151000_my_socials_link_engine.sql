-- My Socials on the Wall's link engine (one engine for the Wall and the Classic Profile) - GamID TESTING only.
--
-- My Socials no longer keeps its own URL patterns. A saved link is what a Wall link is: a provider key, a content KIND and a strictly validated ID, checked here
-- against private.wall_embed_specs() - the Wall's own server rules (20261009150000_wall_discord_profile.sql adds Discord personal profiles there). My Socials only
-- narrows WHICH kinds count as the owner's own account (a profile, channel, page or server invite - never a post or a video), listed per platform in
-- social_platform_catalog.account_kinds. Every address a visitor follows is rebuilt by the shared adapters from those parts (dist/account/socials.js), never stored
-- from user input. Platforms the Wall does not support (Threads, Reddit, LinkedIn) leave My Socials. Saved links are converted losslessly to the same account (on
-- TESTING: one saved Discord personal profile); a saved link the Wall engine cannot express stops the migration. RLS, ownership and the PUBLIC gate are unchanged.

-- Saved links are CONVERTED losslessly, never dropped: each saved address becomes the same account as Wall-engine parts (kind + id). An address the Wall
-- engine cannot express (e.g. a removed platform) stops the migration, so nothing is ever lost or silently changed.

drop function public.get_public_social_links(text);
drop function private.get_public_social_links_impl(text);
drop function public.set_my_social_links(jsonb);
drop function private.set_my_social_links_impl(jsonb);
drop function public.get_my_social_links();
drop function private.get_my_social_links_impl();

alter table public.identity_social_links add column kind text, add column account_id text;
update public.identity_social_links l set kind = c.kind, account_id = c.id from (
  select x.entity_id, x.platform_key, m.kind, m.id from public.identity_social_links x
  cross join lateral (
    select 'profile' kind, (regexp_match(x.url, '^https://(www\.)?discord\.com/users/([0-9]{17,20})/?$'))[2] id where x.platform_key = 'discord'
    union all select 'invite', coalesce((regexp_match(x.url, '^https://(www\.)?discord\.gg/([A-Za-z0-9-]{2,32})/?$'))[2], (regexp_match(x.url, '^https://(www\.)?discord\.com/invite/([A-Za-z0-9-]{2,32})/?$'))[2]) where x.platform_key = 'discord'
    union all select 'profile', (regexp_match(x.url, '^https://(www\.)?instagram\.com/([A-Za-z0-9._]{1,30})/?$'))[2] where x.platform_key = 'instagram'
    union all select 'profile', (regexp_match(x.url, '^https://(www\.)?tiktok\.com/(@[A-Za-z0-9._]{2,24})/?$'))[2] where x.platform_key = 'tiktok'
    union all select 'channel', coalesce((regexp_match(x.url, '^https://(www\.|m\.)?youtube\.com/(@[A-Za-z0-9._-]{3,30})/?$'))[2], (regexp_match(x.url, '^https://(www\.|m\.)?youtube\.com/channel/(UC[A-Za-z0-9_-]{22})/?$'))[2]) where x.platform_key = 'youtube'
    union all select 'channel', (regexp_match(x.url, '^https://(www\.)?twitch\.tv/([A-Za-z0-9_]{3,25})/?$'))[2] where x.platform_key = 'twitch'
    union all select 'channel', (regexp_match(x.url, '^https://(www\.)?kick\.com/([A-Za-z0-9_-]{3,25})/?$'))[2] where x.platform_key = 'kick'
    union all select 'profile', (regexp_match(x.url, '^https://(www\.)?(x|twitter)\.com/([A-Za-z0-9_]{1,15})/?$'))[3] where x.platform_key = 'x'
    union all select 'profile', coalesce((regexp_match(x.url, '^https://(www\.)?snapchat\.com/add/([A-Za-z0-9._-]{3,15})/?$'))[2], (regexp_match(x.url, '^https://(www\.)?snapchat\.com/@([A-Za-z0-9._-]{3,15})/?$'))[2]) where x.platform_key = 'snapchat'
    union all select 'page', (regexp_match(x.url, '^https://(www\.|m\.)?facebook\.com/([A-Za-z0-9.]{3,50})/?$'))[2] where x.platform_key = 'facebook'
  ) m where m.id is not null
) c where c.entity_id = l.entity_id and c.platform_key = l.platform_key;
do $$ begin
  if exists (select 1 from public.identity_social_links l where l.kind is null or l.account_id is null
             or not exists (select 1 from private.wall_embed_specs() s where s.provider = l.platform_key and s.kind = l.kind and l.account_id ~ s.id_pattern)) then
    raise exception 'MY_SOCIALS_LINK_NOT_EXPRESSIBLE: a saved link cannot be expressed by the Wall link engine - convert it explicitly first';
  end if;
end $$;
alter table public.identity_social_links alter column kind set not null, alter column account_id set not null, add constraint identity_social_links_account_id_check check (char_length(account_id) between 1 and 160);
alter table public.identity_social_links drop column url;

delete from public.social_platform_catalog where platform_key in ('threads', 'reddit', 'linkedin');
alter table public.social_platform_catalog drop column url_pattern;
alter table public.social_platform_catalog add column account_kinds text[] not null default array[]::text[];
update public.social_platform_catalog c set account_kinds = v.kinds from (values
  ('instagram', array['profile']), ('tiktok', array['profile']), ('youtube', array['channel']), ('twitch', array['channel']), ('kick', array['channel']),
  ('x', array['profile']), ('snapchat', array['profile']), ('discord', array['invite', 'profile']), ('facebook', array['page'])
) as v(key, kinds) where c.platform_key = v.key;
-- every My Socials account kind must be a kind the Wall engine itself knows
do $$ begin
  if exists (select 1 from public.social_platform_catalog c cross join unnest(c.account_kinds) k
             where not exists (select 1 from private.wall_embed_specs() s where s.provider = c.platform_key and s.kind = k))
     or exists (select 1 from public.social_platform_catalog c where cardinality(c.account_kinds) = 0) then
    raise exception 'MY_SOCIALS_KIND_NOT_IN_WALL_ENGINE';
  end if;
end $$;

create function private.get_my_social_links_impl()
returns table (platform_key text, kind text, account_id text, sort_order smallint)
language sql stable security definer
set search_path = ''
as $$
  select l.platform_key, l.kind, l.account_id, l.sort_order
  from public.identity_social_links l
  where l.entity_id = private.my_socials_entity_id()
  order by l.sort_order, l.platform_key;
$$;

-- Replaces the caller's whole list in one transaction: every entry ({ platform, kind, id }) is validated before anything is written - the platform must be listed,
-- the kind must be one of its account kinds, and the id must match the WALL engine's own rule for that provider + kind. A refused list changes nothing.
create function private.set_my_social_links_impl(candidate_links jsonb)
returns table (platform_key text, kind text, account_id text, sort_order smallint)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  owned_entity_id uuid := private.my_socials_entity_id();
  item jsonb;
  idx integer;
  key text;
  content_kind text;
  account text;
  pattern text;
  keys text[] := array[]::text[];
  kinds text[] := array[]::text[];
  accounts text[] := array[]::text[];
begin
  if candidate_links is null or jsonb_typeof(candidate_links) <> 'array' then raise exception using errcode = '22023', message = 'INVALID_SOCIAL_LINKS'; end if;
  if jsonb_array_length(candidate_links) > (select count(*) from public.social_platform_catalog c where c.active) then
    raise exception using errcode = '22023', message = 'TOO_MANY_SOCIAL_LINKS';
  end if;
  for item in select value from jsonb_array_elements(candidate_links) loop
    -- NULL-safe: a missing member must fail the shape check itself (jsonb_typeof(missing) is NULL, and NULL <> 'string' would not be true)
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item -> 'platform') is distinct from 'string' or jsonb_typeof(item -> 'kind') is distinct from 'string' or jsonb_typeof(item -> 'id') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'INVALID_SOCIAL_LINKS';
    end if;
    key := lower(btrim(item ->> 'platform'));
    content_kind := item ->> 'kind';
    account := item ->> 'id';
    if not exists (select 1 from public.social_platform_catalog c where c.platform_key = key and c.active) then raise exception using errcode = '22023', message = 'INVALID_SOCIAL_PLATFORM'; end if;
    if key = any(keys) then raise exception using errcode = '22023', message = 'DUPLICATE_SOCIAL_PLATFORM'; end if;
    if not exists (select 1 from public.social_platform_catalog c where c.platform_key = key and content_kind = any(c.account_kinds)) then
      raise exception using errcode = '22023', message = 'NOT_A_SOCIAL_ACCOUNT', detail = key;
    end if;
    select s.id_pattern into pattern from private.wall_embed_specs() s where s.provider = key and s.kind = content_kind;
    if pattern is null or char_length(account) > 160 or account !~ pattern then raise exception using errcode = '22023', message = 'INVALID_SOCIAL_URL', detail = key; end if;
    keys := keys || key;
    kinds := kinds || content_kind;
    accounts := accounts || account;
  end loop;

  delete from public.identity_social_links l where l.entity_id = owned_entity_id;
  for idx in 1 .. coalesce(array_length(keys, 1), 0) loop
    insert into public.identity_social_links (entity_id, platform_key, kind, account_id, sort_order) values (owned_entity_id, keys[idx], kinds[idx], accounts[idx], idx - 1);
  end loop;

  return query
  select l.platform_key, l.kind, l.account_id, l.sort_order from public.identity_social_links l
  where l.entity_id = owned_entity_id order by l.sort_order, l.platform_key;
end;
$$;

create function public.get_my_social_links()
returns table (platform_key text, kind text, account_id text, sort_order smallint)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_social_links_impl(); $$;

create function public.set_my_social_links(candidate_links jsonb)
returns table (platform_key text, kind text, account_id text, sort_order smallint)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.set_my_social_links_impl(candidate_links); $$;

create function private.get_public_social_links_impl(candidate_handle text)
returns table (platform_key text, label text, kind text, account_id text)
language sql stable security definer
set search_path = ''
as $$
  select l.platform_key, c.label, l.kind, l.account_id
  from public.entities e
  join public.identity_social_links l on l.entity_id = e.entity_id
  join public.social_platform_catalog c on c.platform_key = l.platform_key and c.active
  where e.gamid_handle = private.normalize_handle(candidate_handle)
    and e.entity_type = 'SOLO'
    and e.visibility = 'PUBLIC'
  order by l.sort_order, l.platform_key;
$$;

create function public.get_public_social_links(candidate_handle text)
returns table (platform_key text, label text, kind text, account_id text)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_public_social_links_impl(candidate_handle); $$;

revoke all on function
  private.get_my_social_links_impl(), private.set_my_social_links_impl(jsonb), private.get_public_social_links_impl(text),
  public.get_my_social_links(), public.set_my_social_links(jsonb), public.get_public_social_links(text)
from public, anon, authenticated;
grant execute on function private.get_my_social_links_impl(), private.set_my_social_links_impl(jsonb), public.get_my_social_links(), public.set_my_social_links(jsonb) to authenticated;
grant execute on function private.get_public_social_links_impl(text), public.get_public_social_links(text) to anon, authenticated;
-- the Wall's server rules are now also read by set_my_social_links_impl (security definer, owner context): no new grant on wall_embed_specs is needed or given
