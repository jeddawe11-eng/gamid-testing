-- My Socials (Profile Editor): the owner's OWN named-platform social accounts, shown as clickable icons on the public GamID.
--
-- Distinct from Wall links (free-form content that may point anywhere, including other people's pages, with "Other"): My Socials has a fixed platform list and
-- NO "Other". One link per platform per GamID.
--
-- Safety:
--   - Every URL is validated HERE against its platform's allowlist pattern (https only, the platform's own host, an account path). Anything else - other schemes
--     (javascript:, data:, http:), other hosts, credentials, spaces, quotes, markup - cannot match and is refused. The browser's checks are only early feedback.
--   - Both tables have RLS on and no table privileges for anon / authenticated: they are reachable ONLY through the functions below.
--   - The owner functions act on the caller's own SOLO GamID (auth.uid() -> OWNER membership); there is no parameter naming another GamID, so nobody can read or
--     change someone else's links.
--   - The anonymous reader returns links only for a PUBLISHED (visibility = 'PUBLIC') SOLO GamID - the same top-level gate as get_public_identity - and only the
--     saved rows (nothing unsaved exists server-side).

create table public.social_platform_catalog (
  platform_key text primary key check (platform_key ~ '^[a-z][a-z0-9_]{0,23}$'),
  label text not null unique check (char_length(label) between 1 and 40),
  url_pattern text not null,
  sort_order smallint not null,
  active boolean not null default true
);

-- Patterns are matched case-insensitively (~*), anchored, and must stay identical to dist/account/socials.js (tests/my-socials.test.js checks both).
insert into public.social_platform_catalog (platform_key, label, url_pattern, sort_order) values
  ('instagram', 'Instagram', '^https://(www\.)?instagram\.com/[a-z0-9._]{1,30}/?$', 10),
  ('tiktok', 'TikTok', '^https://(www\.)?tiktok\.com/@[a-z0-9._]{2,24}/?$', 20),
  ('youtube', 'YouTube', '^https://(www\.|m\.)?youtube\.com/(@[a-z0-9._-]{3,30}|channel/uc[a-z0-9_-]{22}|c/[a-z0-9._-]{1,100}|user/[a-z0-9._-]{1,100})/?$', 30),
  ('twitch', 'Twitch', '^https://(www\.)?twitch\.tv/[a-z0-9_]{3,25}/?$', 40),
  ('kick', 'Kick', '^https://(www\.)?kick\.com/[a-z0-9_-]{3,25}/?$', 50),
  ('x', 'X', '^https://(www\.)?(x|twitter)\.com/[a-z0-9_]{1,15}/?$', 60),
  ('threads', 'Threads', '^https://(www\.)?threads\.(net|com)/@[a-z0-9._]{1,30}/?$', 70),
  ('snapchat', 'Snapchat', '^https://(www\.)?snapchat\.com/(add/|@)[a-z0-9._-]{3,15}/?$', 80),
  ('discord', 'Discord', '^https://(www\.)?(discord\.gg/[a-z0-9-]{2,32}|discord\.com/(invite/[a-z0-9-]{2,32}|users/[0-9]{17,20}))/?$', 90),
  ('facebook', 'Facebook', '^https://(www\.|m\.)?facebook\.com/([a-z0-9.]{5,50}|profile\.php\?id=[0-9]{5,20})/?$', 100),
  ('reddit', 'Reddit', '^https://(www\.)?reddit\.com/(u|user)/[a-z0-9_-]{3,20}/?$', 110),
  ('linkedin', 'LinkedIn', '^https://(www\.)?linkedin\.com/in/[a-z0-9-]{3,100}/?$', 120);

alter table public.social_platform_catalog enable row level security;
revoke all on table public.social_platform_catalog from public, anon, authenticated;

create table public.identity_social_links (
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  platform_key text not null references public.social_platform_catalog(platform_key),
  url text not null check (char_length(url) between 10 and 200 and url ~ '^https://[^[:space:]<>"'']+$'),
  sort_order smallint not null check (sort_order between 0 and 99),
  updated_at timestamptz not null default now(),
  primary key (entity_id, platform_key)
);

alter table public.identity_social_links enable row level security;
revoke all on table public.identity_social_links from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Owner (authenticated) functions
-- ---------------------------------------------------------------------------------------------
create function private.my_socials_entity_id()
returns uuid
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
  return owned_entity_id;
end;
$$;

create function private.get_my_social_links_impl()
returns table (platform_key text, url text, sort_order smallint)
language sql stable security definer
set search_path = ''
as $$
  select l.platform_key, l.url, l.sort_order
  from public.identity_social_links l
  where l.entity_id = private.my_socials_entity_id()
  order by l.sort_order, l.platform_key;
$$;

-- Replaces the caller's whole list in one transaction (the section's Save Changes): every entry is validated before anything is written, so a refused list
-- changes nothing. An empty array removes every link.
create function private.set_my_social_links_impl(candidate_links jsonb)
returns table (platform_key text, url text, sort_order smallint)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  owned_entity_id uuid := private.my_socials_entity_id();
  item jsonb;
  idx integer := 0;
  key text;
  link text;
  pattern text;
  seen text[] := array[]::text[];
  keys text[] := array[]::text[];
  links text[] := array[]::text[];
begin
  if candidate_links is null or jsonb_typeof(candidate_links) <> 'array' then raise exception using errcode = '22023', message = 'INVALID_SOCIAL_LINKS'; end if;
  if jsonb_array_length(candidate_links) > (select count(*) from public.social_platform_catalog c where c.active) then
    raise exception using errcode = '22023', message = 'TOO_MANY_SOCIAL_LINKS';
  end if;
  for item in select value from jsonb_array_elements(candidate_links) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item -> 'platform') <> 'string' or jsonb_typeof(item -> 'url') <> 'string' then
      raise exception using errcode = '22023', message = 'INVALID_SOCIAL_LINKS';
    end if;
    key := lower(btrim(item ->> 'platform'));
    link := btrim(item ->> 'url');
    select c.url_pattern into pattern from public.social_platform_catalog c where c.platform_key = key and c.active;
    if pattern is null then raise exception using errcode = '22023', message = 'INVALID_SOCIAL_PLATFORM'; end if;
    if key = any(seen) then raise exception using errcode = '22023', message = 'DUPLICATE_SOCIAL_PLATFORM'; end if;
    if char_length(link) > 200 or link !~* pattern then raise exception using errcode = '22023', message = 'INVALID_SOCIAL_URL', detail = key; end if;
    seen := seen || key;
    keys := keys || key;
    links := links || link;
  end loop;

  delete from public.identity_social_links l where l.entity_id = owned_entity_id;
  for idx in 1 .. coalesce(array_length(keys, 1), 0) loop
    insert into public.identity_social_links (entity_id, platform_key, url, sort_order) values (owned_entity_id, keys[idx], links[idx], idx - 1);
  end loop;

  return query
  select l.platform_key, l.url, l.sort_order from public.identity_social_links l
  where l.entity_id = owned_entity_id order by l.sort_order, l.platform_key;
end;
$$;

create function public.get_my_social_links()
returns table (platform_key text, url text, sort_order smallint)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_my_social_links_impl(); $$;

create function public.set_my_social_links(candidate_links jsonb)
returns table (platform_key text, url text, sort_order smallint)
language sql volatile security invoker
set search_path = ''
as $$ select * from private.set_my_social_links_impl(candidate_links); $$;

-- ---------------------------------------------------------------------------------------------
-- Anonymous public reader: a PUBLISHED SOLO GamID's saved links, in the owner's order, with the platform label.
-- ---------------------------------------------------------------------------------------------
create function private.get_public_social_links_impl(candidate_handle text)
returns table (platform_key text, label text, url text)
language sql stable security definer
set search_path = ''
as $$
  select l.platform_key, c.label, l.url
  from public.entities e
  join public.identity_social_links l on l.entity_id = e.entity_id
  join public.social_platform_catalog c on c.platform_key = l.platform_key and c.active
  where e.gamid_handle = private.normalize_handle(candidate_handle)
    and e.entity_type = 'SOLO'
    and e.visibility = 'PUBLIC'
  order by l.sort_order, l.platform_key;
$$;

create function public.get_public_social_links(candidate_handle text)
returns table (platform_key text, label text, url text)
language sql stable security invoker
set search_path = ''
as $$ select * from private.get_public_social_links_impl(candidate_handle); $$;

revoke all on function
  private.my_socials_entity_id(), private.get_my_social_links_impl(), private.set_my_social_links_impl(jsonb), private.get_public_social_links_impl(text),
  public.get_my_social_links(), public.set_my_social_links(jsonb), public.get_public_social_links(text)
from public, anon, authenticated;
grant execute on function
  private.my_socials_entity_id(), private.get_my_social_links_impl(), private.set_my_social_links_impl(jsonb),
  public.get_my_social_links(), public.set_my_social_links(jsonb)
to authenticated;
grant execute on function private.get_public_social_links_impl(text), public.get_public_social_links(text) to anon, authenticated;
