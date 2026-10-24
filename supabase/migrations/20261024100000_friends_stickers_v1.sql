-- Friends Stickers V1 (DEC-0011; Mazen's task "GAMID - FRIENDS STICKERS V1" + its addendum, 2026-10-24). TESTING only.
--
-- A signed-in player with a PUBLIC GamID sends one of the 14 free animated stickers to a Friends Stage of another player's published Wall, at a position on that
-- stage, optionally with one link to a gaming clip (YouTube, Twitch, Medal.tv). The Wall's owner approves or rejects each request; only approved stickers are
-- ever visible to visitors, always with the sender's CURRENT GamID avatar and username. The owner can remove an approved sticker or move it on its Friends Stage.
--
--   1. public.wall_sticker_placements - one row per sent sticker. No client reads or writes it: every access is one of the functions below (RLS on, no policy).
--      The sender is the authenticated account's own GamID (never a value the client sends); no avatar or name is copied - they are read at display time.
--   2. private.wall_sticker_clip(text) - the clip-link rule, the SQL port of dist/wall/stickers.js parseStickerClip (same codes, same rebuilt link).
--   3. Sender: get_my_sticker_sender, search_sticker_recipients, send_wall_sticker, get_my_sent_stickers.
--   4. Owner: get_my_wall_stickers, review_wall_sticker (approve / reject), remove_wall_sticker, move_wall_sticker.
--   5. Visitors: get_public_wall_stickers(handle) - approved stickers on the PUBLISHED Friends Stages of a public, enabled Wall, from senders whose GamID is
--      public. Pending, rejected and removed requests (and their links) are never returned.
--   6. Size: each approval takes the Wall's next approval number; a sticker's size is 100% minus 5 points per NEWER active approved sticker on the same Wall, at
--      least 50% (dist/wall/stickers.js stickerSizePercent). Approvals on one Wall are serialized, so the order is stable under concurrent approvals.
--   7. private.save_my_wall_draft_impl: a Friends Stage that holds active (approved) stickers can be neither deleted nor turned into a My Stage
--      (STAGE_HAS_STICKERS, DEC-0011 E). Every other line is the live TESTING definition (verified identical to 20261022120000 before this migration).
--   8. Notifications through the existing private.notify: a new request (owner), approved / rejected / moved (sender).
-- Anti-spam (technical limits, not product limits): at most 5 waiting requests from one sender to one Wall, at most 20 sends per sender per hour.
-- Additive: no existing row or stored document changes.

-- 1. placements ------------------------------------------------------------------------------------------------------------------------------------------
create table public.wall_sticker_placements (
  placement_id uuid primary key default gen_random_uuid(),
  recipient_entity_id uuid not null references public.entities(entity_id) on delete cascade,
  sender_entity_id uuid not null references public.entities(entity_id) on delete cascade,
  stage_id text not null check (char_length(stage_id) between 1 and 200),
  sticker_key text not null check (sticker_key in ('carried-me', 'legend', 'clutch-king', 'my-duo-4ever', 'rage-buddy', 'mvp', 'gg-bro', 'space-crew', 'save-me',
    'headshot', 'diamond-squad', 'final-boss', 'chill-squad', 'ghost-mode')),
  pos_x integer not null check (pos_x between 150 and 850),
  pos_y integer not null check (pos_y between 150 and 1580),
  clip_url text check (clip_url is null or char_length(clip_url) <= 300),
  clip_provider text check (clip_provider is null or clip_provider in ('youtube', 'twitch', 'medal')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  approval_seq bigint,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  approved_at timestamptz,
  removed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint wall_sticker_not_self check (recipient_entity_id <> sender_entity_id),
  constraint wall_sticker_clip_pair check ((clip_url is null) = (clip_provider is null)),
  constraint wall_sticker_approval check ((status in ('approved', 'removed')) = (approval_seq is not null and approved_at is not null))
);
create unique index wall_sticker_approval_order on public.wall_sticker_placements (recipient_entity_id, approval_seq) where approval_seq is not null;
create index wall_sticker_recipient_status on public.wall_sticker_placements (recipient_entity_id, status);
create index wall_sticker_sender_created on public.wall_sticker_placements (sender_entity_id, created_at);
alter table public.wall_sticker_placements enable row level security;
revoke all on table public.wall_sticker_placements from public, anon, authenticated;
comment on table public.wall_sticker_placements is 'Friends Stickers V1: stickers sent to a Friends Stage of a Wall. Read and written only through the sticker functions.';

-- 2. rules -------------------------------------------------------------------------------------------------------------------------------------------------
-- the stage ids of a Wall document's Friends Stages
create function private.wall_friends_stage_ids(doc jsonb)
returns text[]
language sql immutable
set search_path = ''
as $$
  select coalesce(array_agg(s.value ->> 'id'), array[]::text[])
  from jsonb_array_elements(case when jsonb_typeof(doc -> 'stages') = 'array' then doc -> 'stages' else '[]'::jsonb end) as s
  where jsonb_typeof(s.value) = 'object' and s.value ->> 'type' = 'friends' and jsonb_typeof(s.value -> 'id') = 'string';
$$;

-- the optional clip link (dist/wall/stickers.js parseStickerClip): ok + the provider and the link rebuilt from its accepted parts, or ok = false with the code
create function private.wall_sticker_clip(candidate text)
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
  if host !~ '^(?:(?:www\.|m\.)?youtube\.com|youtu\.be|clips\.twitch\.tv|(?:www\.|m\.)?twitch\.tv|(?:www\.)?medal\.tv)$' then
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
  else   -- medal.tv
    m := regexp_match(path, '^/games/([a-z0-9-]{1,60})/clips/([A-Za-z0-9_-]{4,40})(?:/([A-Za-z0-9_-]{1,100}))?/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'medal', 'https://medal.tv/games/' || m[1] || '/clips/' || m[2] || coalesce('/' || m[3], ''); return; end if;
    m := regexp_match(path, '^/clips/([A-Za-z0-9_-]{4,40})(?:/([A-Za-z0-9_-]{1,100}))?/?(?:\?[^#]*)?$');
    if m is not null then return query select true, null::text, 'medal', 'https://medal.tv/clips/' || m[1] || coalesce('/' || m[2], ''); return; end if;
  end if;
  return query select false, 'STICKER_CLIP_INVALID', null::text, null::text;
end;
$$;

-- the caller's own GamID as a sticker SENDER: it must be public (visitors will see its avatar and username beside the sticker)
create function private.wall_sticker_sender()
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me uuid := private.wall_owned_entity_id();
begin
  if not exists (select 1 from public.entities e where e.entity_id = me and e.visibility = 'PUBLIC' and e.gamid_handle is not null) then
    raise exception using errcode = '42501', message = 'STICKER_SENDER_NOT_PUBLIC';
  end if;
  return me;
end;
$$;

-- size of every ACTIVE approved sticker of one Wall: 100 - 5 per newer one, at least 50
create function private.wall_sticker_sizes(candidate_recipient uuid)
returns table (placement_id uuid, size_percent integer)
language sql stable security definer
set search_path = ''
as $$
  select p.placement_id, greatest(50, 100 - 5 * (row_number() over (order by p.approval_seq desc) - 1))::integer
  from public.wall_sticker_placements p
  where p.recipient_entity_id = candidate_recipient and p.status = 'approved';
$$;

-- 3. sender ------------------------------------------------------------------------------------------------------------------------------------------------
-- who am I as a sender (the send flow and the visitor page's Add sticker): my handle and whether I may send at all
create function private.get_my_sticker_sender_impl()
returns table (gamid_handle text, display_name text, avatar_media_reference text, can_send boolean)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me uuid := private.wall_owned_entity_id();
begin
  return query select e.gamid_handle, e.display_name, e.avatar_media_reference, (e.visibility = 'PUBLIC' and e.gamid_handle is not null)
    from public.entities e where e.entity_id = me;
end;
$$;
create function public.get_my_sticker_sender()
returns table (gamid_handle text, display_name text, avatar_media_reference text, can_send boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_sticker_sender_impl(); $$;

-- players who can receive a sticker: a public GamID with an enabled published Wall that has at least one Friends Stage (never the caller)
create function private.search_sticker_recipients_impl(candidate_query text)
returns table (gamid_handle text, display_name text, avatar_media_reference text, friends_stages integer)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me uuid := private.wall_owned_entity_id();
  q text := lower(btrim(coalesce(candidate_query, '')));
  pattern text;
begin
  q := ltrim(q, '@');
  if char_length(q) < 2 or char_length(q) > 30 then return; end if;
  pattern := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
  select e.gamid_handle, e.display_name, e.avatar_media_reference, cardinality(private.wall_friends_stage_ids(w.document))
  from public.entities e
  join public.wall_publications w on w.entity_id = e.entity_id
  where e.entity_type = 'SOLO' and e.visibility = 'PUBLIC' and e.gamid_handle is not null and w.is_enabled and e.entity_id <> me
    and cardinality(private.wall_friends_stage_ids(w.document)) > 0
    and (e.gamid_handle like pattern || '%' or lower(coalesce(e.display_name, '')) like '%' || pattern || '%')
  order by (e.gamid_handle = q) desc, (e.gamid_handle like pattern || '%') desc, e.gamid_handle
  limit 10;
end;
$$;
create function public.search_sticker_recipients(candidate_query text)
returns table (gamid_handle text, display_name text, avatar_media_reference text, friends_stages integer)
language sql stable security invoker set search_path = ''
as $$ select * from private.search_sticker_recipients_impl(candidate_query); $$;

create function private.send_wall_sticker_impl(candidate_handle text, candidate_stage_id text, candidate_sticker_key text, candidate_x integer, candidate_y integer, candidate_clip_url text)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  sender uuid := private.wall_sticker_sender();
  recipient uuid;
  published jsonb;
  clip record;
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
  -- one send at a time per sender, so the limits below hold under concurrent sends
  perform pg_advisory_xact_lock(hashtextextended('wall-sticker-sender:' || sender::text, 0));
  if (select count(*) from public.wall_sticker_placements p where p.sender_entity_id = sender and p.recipient_entity_id = recipient and p.status = 'pending') >= 5 then
    raise exception using errcode = '22023', message = 'STICKER_PENDING_LIMIT', detail = '5';
  end if;
  if (select count(*) from public.wall_sticker_placements p where p.sender_entity_id = sender and p.created_at > now() - interval '1 hour') >= 20 then
    raise exception using errcode = '22023', message = 'STICKER_RATE_LIMIT', detail = '20';
  end if;
  insert into public.wall_sticker_placements (recipient_entity_id, sender_entity_id, stage_id, sticker_key, pos_x, pos_y, clip_url, clip_provider)
  values (recipient, sender, candidate_stage_id, candidate_sticker_key, candidate_x, candidate_y, clip.url, clip.provider)
  returning placement_id into created;
  perform private.notify(recipient, sender, 'sticker.request_received', created, jsonb_build_object('sticker', candidate_sticker_key));
  return created;
end;
$$;
create function public.send_wall_sticker(candidate_handle text, candidate_stage_id text, candidate_sticker_key text, candidate_x integer, candidate_y integer, candidate_clip_url text default null)
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.send_wall_sticker_impl(candidate_handle, candidate_stage_id, candidate_sticker_key, candidate_x, candidate_y, candidate_clip_url); $$;

-- my last 30 sent stickers and what happened to them (the recipient's handle only while their GamID is public)
create function private.get_my_sent_stickers_impl()
returns table (placement_id uuid, recipient_handle text, recipient_display_name text, sticker_key text, status text, has_clip boolean, created_at timestamptz, decided_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me uuid := private.wall_owned_entity_id();
begin
  return query
  select p.placement_id, case when r.visibility = 'PUBLIC' then r.gamid_handle end, case when r.visibility = 'PUBLIC' then r.display_name end,
    p.sticker_key, p.status, p.clip_url is not null, p.created_at, p.decided_at
  from public.wall_sticker_placements p join public.entities r on r.entity_id = p.recipient_entity_id
  where p.sender_entity_id = me
  order by p.created_at desc, p.placement_id
  limit 30;
end;
$$;
create function public.get_my_sent_stickers()
returns table (placement_id uuid, recipient_handle text, recipient_display_name text, sticker_key text, status text, has_clip boolean, created_at timestamptz, decided_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_sent_stickers_impl(); $$;

-- 4. owner -------------------------------------------------------------------------------------------------------------------------------------------------
-- the requests waiting for me and the stickers on my Wall, with each sender's current identity (the owner reviews who sent it and the link before approving)
create function private.get_my_wall_stickers_impl()
returns table (placement_id uuid, stage_id text, sticker_key text, pos_x integer, pos_y integer, status text, approval_seq bigint, size_percent integer,
  clip_url text, clip_provider text, created_at timestamptz, approved_at timestamptz, sender_handle text, sender_display_name text,
  sender_avatar_media_reference text, sender_is_public boolean, stage_in_draft boolean)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me uuid := private.wall_owned_entity_id();
  friends text[] := coalesce((select private.wall_friends_stage_ids(d.document) from public.wall_drafts d where d.entity_id = me), array[]::text[]);
begin
  return query
  select p.placement_id, p.stage_id, p.sticker_key, p.pos_x, p.pos_y, p.status, p.approval_seq, z.size_percent, p.clip_url, p.clip_provider, p.created_at, p.approved_at,
    s.gamid_handle, s.display_name, s.avatar_media_reference, (s.visibility = 'PUBLIC'), p.stage_id = any (friends)
  from public.wall_sticker_placements p
  join public.entities s on s.entity_id = p.sender_entity_id
  left join private.wall_sticker_sizes(me) z on z.placement_id = p.placement_id
  where p.recipient_entity_id = me and p.status in ('pending', 'approved')
  order by p.status desc, p.approval_seq nulls last, p.created_at, p.placement_id;
end;
$$;
create function public.get_my_wall_stickers()
returns table (placement_id uuid, stage_id text, sticker_key text, pos_x integer, pos_y integer, status text, approval_seq bigint, size_percent integer,
  clip_url text, clip_provider text, created_at timestamptz, approved_at timestamptz, sender_handle text, sender_display_name text,
  sender_avatar_media_reference text, sender_is_public boolean, stage_in_draft boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_wall_stickers_impl(); $$;

-- approve or reject a waiting request, as a whole (the sticker, its sender and its link). Approving needs the Friends Stage to still exist on my Wall.
create function private.review_wall_sticker_impl(candidate_placement_id uuid, candidate_approve boolean)
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
  perform private.notify(placement.sender_entity_id, me, 'sticker.rejected', placement.placement_id, jsonb_build_object('sticker', placement.sticker_key));
  return 'rejected';
end;
$$;
create function public.review_wall_sticker(candidate_placement_id uuid, candidate_approve boolean)
returns text
language sql volatile security invoker set search_path = ''
as $$ select private.review_wall_sticker_impl(candidate_placement_id, candidate_approve); $$;

-- take an approved sticker off my Wall (permanent; the remaining stickers' sizes follow at once)
create function private.remove_wall_sticker_impl(candidate_placement_id uuid)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := private.wall_owned_entity_id();
begin
  perform pg_advisory_xact_lock(hashtextextended('wall-sticker-wall:' || me::text, 0));
  update public.wall_sticker_placements p set status = 'removed', removed_at = now(), updated_at = now()
  where p.placement_id = candidate_placement_id and p.recipient_entity_id = me and p.status = 'approved';
  if not found then raise exception using errcode = 'P0002', message = 'STICKER_NOT_FOUND'; end if;
  return true;
end;
$$;
create function public.remove_wall_sticker(candidate_placement_id uuid)
returns boolean
language sql volatile security invoker set search_path = ''
as $$ select private.remove_wall_sticker_impl(candidate_placement_id); $$;

-- move an approved sticker on its Friends Stage (its avatar and name move with it). One saved move notifies the sender once; a move to the same place is nothing.
create function private.move_wall_sticker_impl(candidate_placement_id uuid, candidate_x integer, candidate_y integer)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := private.wall_owned_entity_id();
  placement public.wall_sticker_placements%rowtype;
begin
  if candidate_x is null or candidate_y is null or candidate_x not between 150 and 850 or candidate_y not between 150 and 1580 then
    raise exception using errcode = '22023', message = 'STICKER_POSITION_INVALID';
  end if;
  select * into placement from public.wall_sticker_placements p
  where p.placement_id = candidate_placement_id and p.recipient_entity_id = me and p.status = 'approved' for update;
  if not found then raise exception using errcode = 'P0002', message = 'STICKER_NOT_FOUND'; end if;
  if placement.pos_x = candidate_x and placement.pos_y = candidate_y then return false; end if;
  update public.wall_sticker_placements p set pos_x = candidate_x, pos_y = candidate_y, updated_at = now() where p.placement_id = placement.placement_id;
  perform private.notify(placement.sender_entity_id, me, 'sticker.moved', placement.placement_id, jsonb_build_object('sticker', placement.sticker_key));
  return true;
end;
$$;
create function public.move_wall_sticker(candidate_placement_id uuid, candidate_x integer, candidate_y integer)
returns boolean
language sql volatile security invoker set search_path = ''
as $$ select private.move_wall_sticker_impl(candidate_placement_id, candidate_x, candidate_y); $$;

-- 5. visitors ------------------------------------------------------------------------------------------------------------------------------------------------
-- approved stickers on the PUBLISHED Friends Stages of a public, enabled Wall, each with its sender's current public identity. A sender whose GamID is not
-- public (any more) is never named: their sticker is not returned. Sizes count every active approved sticker of the Wall.
create function private.get_public_wall_stickers_impl(candidate_handle text)
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
  join public.entities s on s.entity_id = p.sender_entity_id and s.entity_type = 'SOLO' and s.visibility = 'PUBLIC' and s.gamid_handle is not null
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC' and w.is_enabled
    and p.stage_id = any (private.wall_friends_stage_ids(w.document))
  order by p.approval_seq;
$$;
create function public.get_public_wall_stickers(candidate_handle text)
returns table (placement_id uuid, stage_id text, sticker_key text, pos_x integer, pos_y integer, size_percent integer, approval_seq bigint, clip_url text,
  clip_provider text, sender_handle text, sender_display_name text, sender_avatar_media_reference text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_public_wall_stickers_impl(candidate_handle); $$;

-- 7. a Friends Stage with active stickers stays (the live definition, plus the STAGE_HAS_STICKERS check) -------------------------------------------------
create or replace function private.save_my_wall_draft_impl(candidate_document jsonb, candidate_expected_revision bigint)
returns table (document jsonb, revision bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  owned_entity_id uuid := private.wall_owned_entity_id();
  errs text[];
  missing text[];
  wrong_kind text[];
  kept text[];
  current_draft public.wall_drafts%rowtype;
begin
  if candidate_expected_revision is null or candidate_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'INVALID_WALL_REVISION';
  end if;
  if candidate_document is null then
    raise exception using errcode = '22023', message = 'INVALID_WALL_DOCUMENT', detail = '["MALFORMED_DOCUMENT"]';
  end if;
  if octet_length(candidate_document::text) > 1048576 then
    raise exception using errcode = '22023', message = 'WALL_DOCUMENT_TOO_LARGE';
  end if;
  errs := private.wall_document_errors(candidate_document);
  if cardinality(errs) > 0 then
    raise exception using errcode = '22023', message = 'INVALID_WALL_DOCUMENT', detail = to_jsonb(errs)::text;
  end if;
  -- Wall Stages V2 (DEC-0011): never more stages than the owner's allowance. A Wall that already has more (an allowance lowered later) can still be saved while it
  -- does not grow: nothing is ever cut.
  if jsonb_array_length(candidate_document -> 'stages') > private.wall_stage_allowance(owned_entity_id)
     and jsonb_array_length(candidate_document -> 'stages') > coalesce((select jsonb_array_length(d.document -> 'stages') from public.wall_drafts d where d.entity_id = owned_entity_id), 0) then
    raise exception using errcode = '22023', message = 'WALL_STAGE_LIMIT', detail = private.wall_stage_allowance(owned_entity_id)::text;
  end if;
  -- Friends Stickers V1 (DEC-0011 E): a Friends Stage that holds active stickers can be neither deleted nor turned into a My Stage
  select coalesce(array_agg(distinct p.stage_id order by p.stage_id), array[]::text[]) into kept
  from public.wall_sticker_placements p
  where p.recipient_entity_id = owned_entity_id and p.status = 'approved'
    and not (p.stage_id = any (private.wall_friends_stage_ids(candidate_document)));
  if cardinality(kept) > 0 then
    raise exception using errcode = '22023', message = 'STAGE_HAS_STICKERS', detail = to_jsonb(kept)::text;
  end if;
  select coalesce(array_agg(u), array[]::text[]) into missing
  from unnest(private.wall_document_asset_ids(candidate_document)) as u
  where not exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u);
  if cardinality(missing) > 0 then
    raise exception using errcode = '22023', message = 'WALL_ASSET_NOT_FOUND', detail = to_jsonb(missing)::text;
  end if;
  select coalesce(array_agg(distinct x.u), array[]::text[]) into wrong_kind from (
    select u from unnest(private.wall_document_video_asset_ids(candidate_document)) as u
    where not exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u and a.mime_type in ('video/mp4', 'video/webm'))
    union all
    select u from unnest(private.wall_document_picture_asset_ids(candidate_document)) as u
    where exists (select 1 from public.wall_assets a where a.entity_id = owned_entity_id and a.asset_id::text = u and a.mime_type in ('video/mp4', 'video/webm'))
  ) x;
  if cardinality(wrong_kind) > 0 then
    raise exception using errcode = '22023', message = 'WALL_ASSET_KIND_MISMATCH', detail = to_jsonb(wrong_kind)::text;
  end if;

  select * into current_draft from public.wall_drafts d where d.entity_id = owned_entity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_DRAFT_NOT_FOUND'; end if;
  if current_draft.revision <> candidate_expected_revision then
    raise exception using errcode = 'PT409', message = 'WALL_REVISION_CONFLICT', detail = current_draft.revision::text;
  end if;

  update public.wall_drafts d
  set document = candidate_document, revision = d.revision + 1, updated_at = now()
  where d.wall_draft_id = current_draft.wall_draft_id;
  return query
  select d.document, d.revision, d.created_at, d.updated_at from public.wall_drafts d where d.wall_draft_id = current_draft.wall_draft_id;
end;
$$;

-- 8. notifications -------------------------------------------------------------------------------------------------------------------------------------------
insert into public.notification_types (type_key, producer, destination) values
  ('sticker.request_received', 'friends_stickers', 'wall.sticker_requests'),
  ('sticker.approved',         'friends_stickers', 'wall.stickers_sent'),
  ('sticker.rejected',         'friends_stickers', 'wall.stickers_sent'),
  ('sticker.moved',            'friends_stickers', 'wall.stickers_sent');

-- grants -------------------------------------------------------------------------------------------------------------------------------------------------------
revoke all on function
  private.wall_friends_stage_ids(jsonb), private.wall_sticker_clip(text), private.wall_sticker_sender(), private.wall_sticker_sizes(uuid),
  private.get_my_sticker_sender_impl(), public.get_my_sticker_sender(),
  private.search_sticker_recipients_impl(text), public.search_sticker_recipients(text),
  private.send_wall_sticker_impl(text, text, text, integer, integer, text), public.send_wall_sticker(text, text, text, integer, integer, text),
  private.get_my_sent_stickers_impl(), public.get_my_sent_stickers(),
  private.get_my_wall_stickers_impl(), public.get_my_wall_stickers(),
  private.review_wall_sticker_impl(uuid, boolean), public.review_wall_sticker(uuid, boolean),
  private.remove_wall_sticker_impl(uuid), public.remove_wall_sticker(uuid),
  private.move_wall_sticker_impl(uuid, integer, integer), public.move_wall_sticker(uuid, integer, integer),
  private.get_public_wall_stickers_impl(text), public.get_public_wall_stickers(text)
  from public, anon, authenticated;
-- signed-in players: their own sender / owner functions (each resolves the caller's GamID on the server)
grant execute on function
  private.get_my_sticker_sender_impl(), public.get_my_sticker_sender(),
  private.search_sticker_recipients_impl(text), public.search_sticker_recipients(text),
  private.send_wall_sticker_impl(text, text, text, integer, integer, text), public.send_wall_sticker(text, text, text, integer, integer, text),
  private.get_my_sent_stickers_impl(), public.get_my_sent_stickers(),
  private.get_my_wall_stickers_impl(), public.get_my_wall_stickers(),
  private.review_wall_sticker_impl(uuid, boolean), public.review_wall_sticker(uuid, boolean),
  private.remove_wall_sticker_impl(uuid), public.remove_wall_sticker(uuid),
  private.move_wall_sticker_impl(uuid, integer, integer), public.move_wall_sticker(uuid, integer, integer)
  to authenticated;
-- everyone: the approved stickers of a public Wall
grant execute on function private.get_public_wall_stickers_impl(text), public.get_public_wall_stickers(text) to anon, authenticated;
