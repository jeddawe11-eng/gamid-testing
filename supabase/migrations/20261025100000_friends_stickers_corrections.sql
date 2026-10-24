-- Friends Stickers V1 - follow-up corrections (Mazen's task "GAMID - FRIENDS STICKERS V1 / Follow-up Corrections", 2026-10-24/25). TESTING only.
-- Mazen's decisions (2026-10-25): a private sender's approved sticker keeps showing their avatar and @username; a PRIVATE GamID's /@handle shows a private notice
-- (avatar, display name, @username, "This account is private.") - unknown / unpublished (DRAFT) handles keep the identical not-found answer.
--
--   1. Visitors: get_public_wall_stickers no longer drops a sticker whose sender's GamID is not public (same signature; the live definition otherwise).
--   2. Storage: "private identity avatars are readable" - the CURRENT avatar of a PRIVATE GamID is readable like a public one (a second, separate policy; the
--      accepted "public identity avatars are readable" policy and private.avatar_is_public are unchanged; DRAFT avatars stay owner-only).
--   3. get_private_identity_notice(handle): the PRIVATE GamID's handle, display name and avatar reference - nothing else (no bio, Wall, games, sections).
--   4. Quota (replaces V1's 5 waiting per Wall / 20 per hour): each player may have at most private.wall_sticker_quota_limit (5; Free - the one place a future
--      Pro limit would be decided) counted submissions in any rolling 24 hours, across all recipients. A ledger row is written with every send and kept even
--      when the sticker is removed or deleted (recipient deleted, stage gone ...); only an owner's REJECTION releases it. Checked and written under the sender's
--      lock, so concurrent sends cannot exceed it. get_my_sticker_quota() tells the sender what is left and when the next slot frees.
--   5. Clip links: Discord MESSAGE permalinks (https://discord.com/channels/<guild>/<channel>/<message>; also ptb. / canary. / discordapp.com hosts, rebuilt to
--      discord.com). Discord file links (cdn.discordapp.com, media.discordapp.net) are signed and expire: refused with their own code. The SQL port of
--      dist/wall-kit/embed/providers/clip-links.js.
-- Additive: no stored Wall changes; existing placements get their ledger rows.

-- 1. visitors: approved stickers stay with their sender, public or private -------------------------------------------------------------------------------
create or replace function private.get_public_wall_stickers_impl(candidate_handle text)
returns table (placement_id uuid, stage_id text, sticker_key text, pos_x integer, pos_y integer, size_percent integer, approval_seq bigint, clip_url text,
  clip_provider text, sender_handle text, sender_display_name text, sender_avatar_media_reference text)
language sql stable security definer
set search_path = ''
as $$
  select p.placement_id, p.stage_id, p.sticker_key, p.pos_x, p.pos_y, z.size_percent, p.approval_seq, p.clip_url, p.clip_provider,
    s.gamid_handle, s.display_name, s.avatar_media_reference
  from public.entities e
  join public.wall_publications w on w.entity_id = e.entity_id
  join public.wall_sticker_placements p on p.recipient_entity_id = e.entity_id and p.status = 'approved'
  join private.wall_sticker_sizes(e.entity_id) z on z.placement_id = p.placement_id
  join public.entities s on s.entity_id = p.sender_entity_id and s.entity_type = 'SOLO' and s.gamid_handle is not null
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC' and w.is_enabled
    and p.stage_id = any (private.wall_friends_stage_ids(w.document))
  order by p.approval_seq;
$$;

-- 2. a PRIVATE GamID's current avatar is readable (its sticker attribution and its private notice show it) ----------------------------------------------
create function private.avatar_is_private_identity(candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entities e
    where e.avatar_media_reference = candidate_path
      and e.entity_type = 'SOLO'
      and e.visibility = 'PRIVATE'
  );
$$;
create policy "private identity avatars are readable"
on storage.objects for select to anon, authenticated
using (bucket_id = 'avatars' and private.avatar_is_private_identity(name));

-- 3. the private notice: who it is, and that it is private - nothing else -----------------------------------------------------------------------------
create function private.get_private_identity_notice_impl(candidate_handle text)
returns table (gamid_handle text, display_name text, avatar_media_reference text)
language sql stable security definer
set search_path = ''
as $$
  select e.gamid_handle, e.display_name, e.avatar_media_reference
  from public.entities e
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PRIVATE'
  limit 1;
$$;
create function public.get_private_identity_notice(candidate_handle text)
returns table (gamid_handle text, display_name text, avatar_media_reference text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_private_identity_notice_impl(candidate_handle); $$;

-- 4. the sending quota -------------------------------------------------------------------------------------------------------------------------------------
-- THE place a sender's quota is decided (today 5 for everyone - Free; a future Pro limit, not approved, would be decided here)
create function private.wall_sticker_quota_limit(candidate_entity uuid)
returns integer
language sql stable
set search_path = ''
as $$ select 5 $$;

-- one row per successful send; never deleted with the sticker (no foreign key to the placement), released only by the owner's rejection
create table public.wall_sticker_quota (
  ledger_id bigserial primary key,
  sender_entity_id uuid not null references public.entities(entity_id) on delete cascade,
  placement_id uuid not null unique,
  created_at timestamptz not null,
  released_at timestamptz
);
create index wall_sticker_quota_sender_created on public.wall_sticker_quota (sender_entity_id, created_at);
alter table public.wall_sticker_quota enable row level security;
revoke all on table public.wall_sticker_quota from public, anon, authenticated;
revoke all on sequence public.wall_sticker_quota_ledger_id_seq from public, anon, authenticated;
comment on table public.wall_sticker_quota is 'Friends Stickers: each sticker submission counted toward its sender''s rolling 24-hour quota (released only by rejection).';
insert into public.wall_sticker_quota (sender_entity_id, placement_id, created_at, released_at)
select p.sender_entity_id, p.placement_id, p.created_at, case when p.status = 'rejected' then coalesce(p.decided_at, p.created_at) end
from public.wall_sticker_placements p;

-- counted submissions of one sender in the last 24 hours, and when the oldest of them leaves the window
create function private.wall_sticker_quota_state(candidate_sender uuid)
returns table (quota_limit integer, used integer, next_available_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select private.wall_sticker_quota_limit(candidate_sender),
    count(*)::integer,
    min(q.created_at) + interval '24 hours'
  from public.wall_sticker_quota q
  where q.sender_entity_id = candidate_sender and q.released_at is null and q.created_at > now() - interval '24 hours';
$$;

create function private.get_my_sticker_quota_impl()
returns table (quota_limit integer, used integer, next_available_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  return query select * from private.wall_sticker_quota_state(private.wall_owned_entity_id());
end;
$$;
create function public.get_my_sticker_quota()
returns table (quota_limit integer, used integer, next_available_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_sticker_quota_impl(); $$;

-- 5. clip links: + Discord message permalinks; Discord file links refused with their own code ---------------------------------------------------------
create or replace function private.wall_sticker_clip(candidate text)
returns table (ok boolean, code text, provider text, url text)
language plpgsql immutable
set search_path = ''
as $$
declare
  t text;
  parts text[];
  host text;
  path text;
  m text[];
begin
  if candidate is null then return query select true, null::text, null::text, null::text; return; end if;
  t := regexp_replace(candidate, '^[ \t\r\n\f\v]+|[ \t\r\n\f\v]+$', '', 'g');
  if t = '' then return query select true, null::text, null::text, null::text; return; end if;
  if char_length(t) > 300 or t ~ '[^\x21-\x7e]' or t ~ '[\\"''<>`]' then return query select false, 'STICKER_CLIP_INVALID', null::text, null::text; return; end if;
  parts := regexp_match(t, '^https://([A-Za-z0-9.-]+)(/[^#]*)?(?:#.*)?$');
  if parts is null then return query select false, 'STICKER_CLIP_INVALID', null::text, null::text; return; end if;
  host := lower(parts[1]);
  path := coalesce(parts[2], '/');
  if host ~ '^(?:cdn\.discordapp\.com|media\.discordapp\.net)$' then
    return query select false, 'STICKER_CLIP_DISCORD_FILE', null::text, null::text; return;
  end if;
  if host !~ '^(?:(?:www\.|m\.)?youtube\.com|youtu\.be|clips\.twitch\.tv|(?:www\.|m\.)?twitch\.tv|(?:www\.)?medal\.tv|(?:www\.|ptb\.|canary\.)?discord\.com|(?:www\.)?discordapp\.com)$' then
    return query select false, 'STICKER_CLIP_UNSUPPORTED', null::text, null::text; return;
  end if;
  if host ~ '^(?:www\.|m\.)?youtube\.com$' then
    if path ~ '^/watch\?[^#]*$' then
      m := regexp_match(path, '[?&]v=([A-Za-z0-9_-]{11})(?:&|$)');
      if m is not null then return query select true, null::text, 'youtube', 'https://www.youtube.com/watch?v=' || m[1]; return; end if;
    end if;
    m := regexp_match(path, '^/shorts/([A-Za-z0-9_-]{11})/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'youtube', 'https://www.youtube.com/shorts/' || m[1]; return; end if;
    m := regexp_match(path, '^/clip/([A-Za-z0-9_-]{20,40})/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'youtube', 'https://www.youtube.com/clip/' || m[1]; return; end if;
  elsif host = 'youtu.be' then
    m := regexp_match(path, '^/([A-Za-z0-9_-]{11})/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'youtube', 'https://www.youtube.com/watch?v=' || m[1]; return; end if;
  elsif host = 'clips.twitch.tv' then
    m := regexp_match(path, '^/([A-Za-z0-9_-]{3,100})/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'twitch', 'https://clips.twitch.tv/' || m[1]; return; end if;
  elsif host ~ '^(?:www\.|m\.)?twitch\.tv$' then
    m := regexp_match(path, '^/([A-Za-z0-9_]{2,25})/clip/([A-Za-z0-9_-]{3,100})/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'twitch', 'https://www.twitch.tv/' || lower(m[1]) || '/clip/' || m[2]; return; end if;
    m := regexp_match(path, '^/videos/([0-9]{1,15})/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'twitch', 'https://www.twitch.tv/videos/' || m[1]; return; end if;
  elsif host ~ '^(?:www\.)?medal\.tv$' then
    m := regexp_match(path, '^/games/([a-z0-9-]{1,60})/clips/([A-Za-z0-9_-]{4,40})(?:/([A-Za-z0-9_-]{1,100}))?/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'medal', 'https://medal.tv/games/' || m[1] || '/clips/' || m[2] || coalesce('/' || m[3], ''); return; end if;
    m := regexp_match(path, '^/clips/([A-Za-z0-9_-]{4,40})(?:/([A-Za-z0-9_-]{1,100}))?/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'medal', 'https://medal.tv/clips/' || m[1] || coalesce('/' || m[2], ''); return; end if;
  else   -- discord.com (www / ptb / canary) and the older discordapp.com: a server message permalink
    m := regexp_match(path, '^/channels/([0-9]{17,20})/([0-9]{17,20})/([0-9]{17,20})/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'discord', 'https://discord.com/channels/' || m[1] || '/' || m[2] || '/' || m[3]; return; end if;
  end if;
  return query select false, 'STICKER_CLIP_INVALID', null::text, null::text;
end;
$$;
alter table public.wall_sticker_placements drop constraint wall_sticker_placements_clip_provider_check;
alter table public.wall_sticker_placements add constraint wall_sticker_placements_clip_provider_check check (clip_provider is null or clip_provider in ('youtube', 'twitch', 'medal', 'discord'));

-- sending: the rolling 24-hour quota replaces the V1 limits (every other check as before) -----------------------------------------------------------------
create or replace function private.send_wall_sticker_impl(candidate_handle text, candidate_stage_id text, candidate_sticker_key text, candidate_x integer, candidate_y integer, candidate_clip_url text)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  sender uuid := private.wall_sticker_sender();
  recipient uuid;
  published jsonb;
  clip record;
  quota record;
  created uuid;
begin
  select e.entity_id, w.document into recipient, published
  from public.entities e join public.wall_publications w on w.entity_id = e.entity_id
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC' and w.is_enabled
  limit 1;
  if recipient is null then raise exception using errcode = 'P0002', message = 'STICKER_RECIPIENT_NOT_FOUND'; end if;
  if recipient = sender then raise exception using errcode = '22023', message = 'STICKER_SELF'; end if;
  if candidate_stage_id is null or not (candidate_stage_id = any (private.wall_friends_stage_ids(published))) then
    raise exception using errcode = '22023', message = 'STICKER_STAGE_NOT_FRIENDS';
  end if;
  if candidate_sticker_key is null or candidate_sticker_key not in ('carried-me', 'legend', 'clutch-king', 'my-duo-4ever', 'rage-buddy', 'mvp', 'gg-bro', 'space-crew',
      'save-me', 'headshot', 'diamond-squad', 'final-boss', 'chill-squad', 'ghost-mode') then
    raise exception using errcode = '22023', message = 'STICKER_UNKNOWN';
  end if;
  if candidate_x is null or candidate_y is null or candidate_x not between 150 and 850 or candidate_y not between 150 and 1580 then
    raise exception using errcode = '22023', message = 'STICKER_POSITION_INVALID';
  end if;
  select * into clip from private.wall_sticker_clip(candidate_clip_url);
  if not clip.ok then raise exception using errcode = '22023', message = clip.code; end if;
  -- one send at a time per sender: the quota is read and taken in the same locked step, so concurrent sends cannot exceed it
  perform pg_advisory_xact_lock(hashtextextended('wall-sticker-sender:' || sender::text, 0));
  select * into quota from private.wall_sticker_quota_state(sender);
  if quota.used >= quota.quota_limit then
    raise exception using errcode = '22023', message = 'STICKER_DAILY_LIMIT', detail = to_char(quota.next_available_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  insert into public.wall_sticker_placements (recipient_entity_id, sender_entity_id, stage_id, sticker_key, pos_x, pos_y, clip_url, clip_provider)
  values (recipient, sender, candidate_stage_id, candidate_sticker_key, candidate_x, candidate_y, clip.url, clip.provider)
  returning placement_id into created;
  insert into public.wall_sticker_quota (sender_entity_id, placement_id, created_at) values (sender, created, now());
  perform private.notify(recipient, sender, 'sticker.request_received', created, jsonb_build_object('sticker', candidate_sticker_key));
  return created;
end;
$$;

-- review: a rejection releases its quota slot at once (an approval never does - nor a later removal)
create or replace function private.review_wall_sticker_impl(candidate_placement_id uuid, candidate_approve boolean)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := private.wall_owned_entity_id();
  placement public.wall_sticker_placements%rowtype;
  next_seq bigint;
begin
  if candidate_approve is null then raise exception using errcode = '22023', message = 'STICKER_DECISION_REQUIRED'; end if;
  -- one decision at a time per Wall: approvals take the Wall's approval numbers in a stable order
  perform pg_advisory_xact_lock(hashtextextended('wall-sticker-wall:' || me::text, 0));
  select * into placement from public.wall_sticker_placements p where p.placement_id = candidate_placement_id and p.recipient_entity_id = me for update;
  if not found then raise exception using errcode = 'P0002', message = 'STICKER_NOT_FOUND'; end if;
  if placement.status <> 'pending' then raise exception using errcode = '22023', message = 'STICKER_NOT_PENDING'; end if;
  if candidate_approve then
    if not (placement.stage_id = any (coalesce((select private.wall_friends_stage_ids(d.document) from public.wall_drafts d where d.entity_id = me), array[]::text[]))) then
      raise exception using errcode = '22023', message = 'STICKER_STAGE_GONE';
    end if;
    select coalesce(max(p.approval_seq), 0) + 1 into next_seq from public.wall_sticker_placements p where p.recipient_entity_id = me;
    update public.wall_sticker_placements p set status = 'approved', approval_seq = next_seq, approved_at = now(), decided_at = now(), updated_at = now()
    where p.placement_id = placement.placement_id;
    perform private.notify(placement.sender_entity_id, me, 'sticker.approved', placement.placement_id, jsonb_build_object('sticker', placement.sticker_key));
    return 'approved';
  end if;
  update public.wall_sticker_placements p set status = 'rejected', decided_at = now(), updated_at = now() where p.placement_id = placement.placement_id;
  update public.wall_sticker_quota q set released_at = now() where q.placement_id = placement.placement_id and q.released_at is null;
  perform private.notify(placement.sender_entity_id, me, 'sticker.rejected', placement.placement_id, jsonb_build_object('sticker', placement.sticker_key));
  return 'rejected';
end;
$$;

-- grants -------------------------------------------------------------------------------------------------------------------------------------------------------
revoke all on function
  private.avatar_is_private_identity(text), private.get_private_identity_notice_impl(text), public.get_private_identity_notice(text),
  private.wall_sticker_quota_limit(uuid), private.wall_sticker_quota_state(uuid), private.get_my_sticker_quota_impl(), public.get_my_sticker_quota()
  from public, anon, authenticated;
grant execute on function private.avatar_is_private_identity(text) to anon, authenticated;   -- the storage policy runs as the reader (like avatar_is_public)
grant execute on function private.get_private_identity_notice_impl(text), public.get_private_identity_notice(text) to anon, authenticated;
grant execute on function private.get_my_sticker_quota_impl(), public.get_my_sticker_quota() to authenticated;
