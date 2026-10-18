-- Custom Wall fonts (GamID TESTING only). Mazen's task "GAMID — Custom Font Upload Implementation" (2026-10-18), on the architecture documented in
-- docs/WALL-EDITOR-TEXT-FONTS.md, plus his product rule: at most 3 active custom fonts per account.
--
-- The accepted Wall-image pattern, applied to fonts:
--   - bucket `wall-fonts`: PRIVATE, 2 MiB, font/woff2 only. Only the usage-upload gateway writes it (it validates the WOFF2 structure and the SHA-256 that names the
--     file); there is no client insert / update policy, and the account-wide gateway policy already refuses direct writes.
--   - path <owner uid>/fonts/<sha256 of the bytes>.woff2: the same font is one object per account (deduplication), and the bytes count toward the existing 200 MB
--     account quota through the existing reservation / completion receipts (private.usage_stored_bytes sums the owner's folder in every bucket).
--   - table wall_fonts: owner-only through RPCs (RLS on, no client grant). Registered only by the gateway (service role) after the object is stored and completed.
--   - limit: 3 fonts per account, server-side and transactional: checked when quota is reserved and again at registration, both under the same per-account advisory
--     lock as every reservation, counting registered fonts plus fonts reserved or stored but not yet registered. An identical font never takes another slot.
--   - a text element names a font with payload.fontRef = 'font:<font_id>' (an opaque field the document already reserves) and keeps its catalog fontFamily as the
--     fallback. Saving a draft that names a font its owner does not have is refused (WALL_FONT_NOT_FOUND).
--   - visitors: a font object is readable anonymously ONLY while the published, enabled snapshot of a PUBLIC GamID references it (same predicate as Wall media);
--     owners read their own fonts through the existing receipt policy; nobody can sign them except the owner (existing restrictive signing policy).
--   - deletion: refused while the saved draft or ANY published snapshot references the font; a registered font object cannot be deleted at all (gateway and a
--     restrictive storage policy) - the row goes first, through the owner RPC.
-- Additive only. Existing buckets, policies, quotas and functions keep their behavior; three functions are patched in place below and each patch is asserted.

-- 1. bucket ---------------------------------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall-fonts', 'wall-fonts', false, 2097152, array['font/woff2'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into private.usage_media_categories (bucket, category) values ('wall-fonts', 'font') on conflict (bucket) do update set category = excluded.category;

create function private.wall_font_limit() returns integer language sql immutable set search_path = '' as $$ select 3 $$;

-- 2. registry -------------------------------------------------------------------------------------------------------------------------------------
create table public.wall_fonts (
  font_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  entity_id uuid not null references public.entities(entity_id) on delete cascade,
  storage_path text not null,
  sha256 text not null,
  byte_size integer not null,
  display_name text not null,
  license_acknowledged_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint wall_fonts_path_unique unique (storage_path),
  constraint wall_fonts_owner_sha_unique unique (owner_id, sha256),
  constraint wall_fonts_sha check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint wall_fonts_path check (storage_path = owner_id::text || '/fonts/' || sha256 || '.woff2'),
  constraint wall_fonts_size check (byte_size between 48 and 2097152),
  constraint wall_fonts_name check (char_length(display_name) between 1 and 60)
);
create index wall_fonts_owner_idx on public.wall_fonts (owner_id, created_at);
create index wall_fonts_entity_idx on public.wall_fonts (entity_id);
alter table public.wall_fonts enable row level security;
revoke all on table public.wall_fonts from public, anon, authenticated;

-- every fontRef string a document uses, anywhere in it
create function private.wall_document_font_refs(doc jsonb) returns text[]
language sql immutable set search_path = ''
as $$ select coalesce(array_agg(distinct v #>> '{}'), array[]::text[]) from jsonb_path_query(doc, '$.**.fontRef') as v where jsonb_typeof(v) = 'string'; $$;

create function private.wall_font_registered(candidate_path text) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.wall_fonts f where f.storage_path = candidate_path); $$;

-- the account's SOLO identity (the gateway acts with the owner's id, without auth.uid())
create function private.wall_font_owner_entity(u uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select e.entity_id from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id
      where m.user_id = u and m.role = 'OWNER' and e.entity_type = 'SOLO' limit 1; $$;

-- Slots in use: registered fonts + fonts reserved or stored but not yet registered, other than the path being reserved. Called under the account lock.
create function private.wall_font_slots_used(u uuid, candidate_path text) returns integer
language sql stable security definer set search_path = ''
as $$
  select (select count(*) from public.wall_fonts f where f.owner_id = u and f.storage_path <> coalesce(candidate_path, ''))::integer
       + (select count(*) from private.usage_uploads x
          where x.owner_id = u and x.bucket = 'wall-fonts' and x.path <> coalesce(candidate_path, '')
            and not exists (select 1 from public.wall_fonts f where f.storage_path = x.path)
            and (x.state = 'ACTIVE' or (x.state = 'COMPLETE' and exists (select 1 from storage.objects o where o.bucket_id = 'wall-fonts' and o.name = x.path))))::integer;
$$;

-- 3. quota reservation: wall-fonts is a gateway bucket, and a new distinct font needs a free slot (patched in place; the rest of the function is unchanged)
do $$
declare original text; revised text;
begin
  original := pg_get_functiondef('private.reserve_usage_upload(uuid,text,text,bigint,text)'::regprocedure);
  revised := replace(original, $o$ if b not in ($o$, $n$ if b<>'wall-fonts' and b not in ($n$);
  revised := replace(revised, $o$ if exists(select 1 from storage.objects where bucket_id=b and name=p) then raise exception 'OBJECT_ALREADY_EXISTS'; end if;$o$,
                              $n$ if b='wall-fonts' and private.wall_font_slots_used(u,p)>=private.wall_font_limit() then raise exception using errcode='54000',message='WALL_FONT_LIMIT'; end if;
 if exists(select 1 from storage.objects where bucket_id=b and name=p) then raise exception 'OBJECT_ALREADY_EXISTS'; end if;$n$);
  if revised = original or (length(revised) - length(original)) < 140 then raise exception 'WALL_FONTS_RESERVE_PATCH_FAILED'; end if;
  execute revised;
end $$;

-- 4. gateway deletes: a registered font object is never deleted (the owner RPC removes the row first, and only when no Wall uses it)
do $$
declare original text; revised text;
begin
  original := pg_get_functiondef('private.authorize_usage_delete(uuid,text,text)'::regprocedure);
  revised := replace(original, $o$ if u is null or split_part(p,'/',1)<>u::text then raise exception 'UPLOAD_NOT_OWNED';end if;$o$,
                               $n$ if u is null or split_part(p,'/',1)<>u::text then raise exception 'UPLOAD_NOT_OWNED';end if;
 if b='wall-fonts' and private.wall_font_registered(p) then raise exception 'WALL_FONT_REGISTERED';end if;$n$);
  if revised = original then raise exception 'WALL_FONTS_DELETE_PATCH_FAILED'; end if;
  execute revised;
end $$;

create policy "registered wall fonts cannot be deleted"
on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'wall-fonts' or not private.wall_font_registered(name));

-- 5. registration (service role only: the gateway, after it validated, stored and completed the object) ---------------------------------------------
create function private.register_wall_font(u uuid, candidate_path text, candidate_sha256 text, candidate_name text, candidate_license boolean)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare existing public.wall_fonts%rowtype; stored bigint; entity uuid; clean text;
begin
  if u is null or candidate_sha256 is null or candidate_sha256 !~ '^[0-9a-f]{64}$' or candidate_path is distinct from u::text || '/fonts/' || candidate_sha256 || '.woff2' then
    raise exception using errcode = '22023', message = 'INVALID_UPLOAD_PATH';
  end if;
  if candidate_license is not true then raise exception using errcode = '22023', message = 'WALL_FONT_LICENSE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('usage:' || u::text, 0));
  select * into existing from public.wall_fonts f where f.owner_id = u and f.sha256 = candidate_sha256;
  if found then return to_jsonb(existing) || jsonb_build_object('duplicate', true); end if;
  if not private.usage_object_owned('wall-fonts', candidate_path, u) then raise exception using errcode = 'P0002', message = 'WALL_FONT_UPLOAD_NOT_FOUND'; end if;
  select (o.metadata ->> 'size')::bigint into stored from storage.objects o where o.bucket_id = 'wall-fonts' and o.name = candidate_path;
  if stored is null or stored < 48 or stored > 2097152 then raise exception using errcode = '22023', message = 'INVALID_FONT'; end if;
  if (select count(*) from public.wall_fonts f where f.owner_id = u) >= private.wall_font_limit() then raise exception using errcode = '54000', message = 'WALL_FONT_LIMIT'; end if;
  entity := private.wall_font_owner_entity(u);
  if entity is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;
  clean := left(btrim(regexp_replace(coalesce(candidate_name, ''), '[[:cntrl:]]', '', 'g')), 60);
  if clean = '' then clean := 'My font'; end if;
  insert into public.wall_fonts (owner_id, entity_id, storage_path, sha256, byte_size, display_name, license_acknowledged_at)
  values (u, entity, candidate_path, candidate_sha256, stored::integer, clean, now()) returning * into existing;
  return to_jsonb(existing) || jsonb_build_object('duplicate', false);
end $$;
create function public.register_wall_font(candidate_owner uuid, candidate_path text, candidate_sha256 text, candidate_name text, candidate_license boolean)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.register_wall_font(candidate_owner, candidate_path, candidate_sha256, candidate_name, candidate_license) $$;

-- unregistered font objects older than an hour (a gateway that stopped between storing and registering): the owner's cleanup deletes them
create function private.usage_font_orphans(u uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.path order by x.path), '[]') from private.usage_uploads x
  where x.owner_id = u and x.bucket = 'wall-fonts' and x.state = 'COMPLETE' and x.updated_at < now() - interval '1 hour'
    and exists (select 1 from storage.objects o where o.bucket_id = 'wall-fonts' and o.name = x.path)
    and not exists (select 1 from public.wall_fonts f where f.storage_path = x.path);
$$;
create function public.usage_font_orphans(candidate_owner uuid) returns jsonb language sql stable security invoker set search_path = '' as $$ select private.usage_font_orphans(candidate_owner) $$;

-- 6. owner RPCs -----------------------------------------------------------------------------------------------------------------------------------
create function private.list_my_wall_fonts_impl() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid()); entity uuid; draft jsonb;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  entity := private.wall_font_owner_entity(caller);
  select d.document into draft from public.wall_drafts d where d.entity_id = entity;
  return jsonb_build_object('limit', private.wall_font_limit(), 'fonts', coalesce((
    select jsonb_agg(jsonb_build_object('font_id', f.font_id, 'display_name', f.display_name, 'storage_path', f.storage_path, 'byte_size', f.byte_size, 'created_at', f.created_at,
      'in_draft', ('font:' || f.font_id) = any (private.wall_document_font_refs(draft)),
      'in_published', exists (select 1 from public.wall_publications w where w.entity_id = f.entity_id and ('font:' || f.font_id) = any (private.wall_document_font_refs(w.document))))
      order by f.created_at, f.font_id)
    from public.wall_fonts f where f.owner_id = caller), '[]'::jsonb));
end $$;
create function public.list_my_wall_fonts() returns jsonb language sql stable security invoker set search_path = '' as $$ select private.list_my_wall_fonts_impl() $$;

-- Removes the registry row and returns the storage path; the browser then deletes the object through the gateway. Refused while a Wall uses the font.
create function private.delete_my_wall_font_impl(candidate_font_id uuid) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid()); font public.wall_fonts%rowtype; ref text;
begin
  if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('usage:' || caller::text, 0));
  select * into font from public.wall_fonts f where f.font_id = candidate_font_id and f.owner_id = caller for update;
  if not found then raise exception using errcode = 'P0002', message = 'WALL_FONT_NOT_FOUND'; end if;
  ref := 'font:' || font.font_id;
  if exists (select 1 from public.wall_publications w where w.entity_id = font.entity_id and ref = any (private.wall_document_font_refs(w.document))) then
    raise exception using errcode = 'PT409', message = 'WALL_FONT_PUBLISHED';
  end if;
  if exists (select 1 from public.wall_drafts d where d.entity_id = font.entity_id and ref = any (private.wall_document_font_refs(d.document))) then
    raise exception using errcode = 'PT409', message = 'WALL_FONT_IN_USE';
  end if;
  delete from public.wall_fonts f where f.font_id = font.font_id;
  return font.storage_path;
end $$;
create function public.delete_my_wall_font(candidate_font_id uuid) returns text language sql volatile security invoker set search_path = '' as $$ select private.delete_my_wall_font_impl(candidate_font_id) $$;

-- 7. saving: every fontRef a draft names must be one of its owner's fonts ------------------------------------------------------------------------------
create function private.wall_drafts_font_refs_check() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare missing text[];
begin
  select coalesce(array_agg(r), array[]::text[]) into missing
  from unnest(private.wall_document_font_refs(new.document)) as r
  where r !~ '^font:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not exists (select 1 from public.wall_fonts f where f.entity_id = new.entity_id and 'font:' || f.font_id = r);
  if cardinality(missing) > 0 then raise exception using errcode = '22023', message = 'WALL_FONT_NOT_FOUND', detail = to_jsonb(missing)::text; end if;
  return new;
end $$;
create trigger wall_drafts_font_refs_check before insert or update of document on public.wall_drafts for each row execute function private.wall_drafts_font_refs_check();

-- 8. visitors: only fonts the published, enabled snapshot of a PUBLIC GamID references ---------------------------------------------------------------
create function private.wall_font_is_published(candidate_path text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.wall_fonts f
    join public.wall_publications w on w.entity_id = f.entity_id
    join public.entities e on e.entity_id = f.entity_id
    where f.storage_path = candidate_path and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC' and w.is_enabled
      and ('font:' || f.font_id) = any (private.wall_document_font_refs(w.document)));
$$;
create policy "published wall fonts are readable"
on storage.objects for select to anon, authenticated
using (bucket_id = 'wall-fonts' and private.wall_font_is_published(name));

create function private.get_public_wall_fonts_impl(candidate_handle text) returns table (font_id uuid, storage_path text)
language sql stable security definer set search_path = ''
as $$
  select f.font_id, f.storage_path
  from public.entities e
  join public.wall_publications w on w.entity_id = e.entity_id
  join public.wall_fonts f on f.entity_id = e.entity_id
  where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC' and w.is_enabled
    and ('font:' || f.font_id) = any (private.wall_document_font_refs(w.document))
  order by f.font_id;
$$;
create function public.get_public_wall_fonts(candidate_handle text) returns table (font_id uuid, storage_path text)
language sql stable security invoker set search_path = '' as $$ select * from private.get_public_wall_fonts_impl(candidate_handle) $$;

-- 9. Usage Center: the font count and its limit beside the other Wall allowances (patched in place) ----------------------------------------------------
do $$
declare original text; revised text;
begin
  original := pg_get_functiondef('private.get_my_usage_impl()'::regprocedure);
  revised := replace(original, $o$'Shares the Wall Assets allowance'))||crew_quotas$o$,
                               $n$'Shares the Wall Assets allowance'),
  jsonb_build_object('key','wall.fonts','name','Custom Fonts','used',(select count(*) from public.wall_fonts f where f.owner_id=u),'limit',private.wall_font_limit()))||crew_quotas$n$);
  if revised = original then raise exception 'WALL_FONTS_USAGE_PATCH_FAILED'; end if;
  execute revised;
end $$;
create trigger usage_fonts_changed after insert or update or delete on public.wall_fonts for each row execute function private.usage_wall_changed();

-- 10. grants -----------------------------------------------------------------------------------------------------------------------------------------
revoke all on function
  private.wall_font_limit(), private.wall_document_font_refs(jsonb), private.wall_font_registered(text), private.wall_font_owner_entity(uuid), private.wall_font_slots_used(uuid, text),
  private.register_wall_font(uuid, text, text, text, boolean), public.register_wall_font(uuid, text, text, text, boolean), private.usage_font_orphans(uuid), public.usage_font_orphans(uuid),
  private.list_my_wall_fonts_impl(), public.list_my_wall_fonts(), private.delete_my_wall_font_impl(uuid), public.delete_my_wall_font(uuid),
  private.wall_drafts_font_refs_check(), private.wall_font_is_published(text), private.get_public_wall_fonts_impl(text), public.get_public_wall_fonts(text)
from public, anon, authenticated, service_role;
-- the storage policies evaluate these as the requesting role
grant execute on function private.wall_font_registered(text), private.wall_font_is_published(text), private.wall_document_font_refs(jsonb) to anon, authenticated;
grant execute on function private.list_my_wall_fonts_impl(), public.list_my_wall_fonts(), private.delete_my_wall_font_impl(uuid), public.delete_my_wall_font(uuid), private.wall_font_limit() to authenticated;
grant execute on function private.get_public_wall_fonts_impl(text), public.get_public_wall_fonts(text) to anon, authenticated;
grant execute on function private.register_wall_font(uuid, text, text, text, boolean), public.register_wall_font(uuid, text, text, text, boolean),
  private.usage_font_orphans(uuid), public.usage_font_orphans(uuid), private.wall_font_limit(), private.wall_font_slots_used(uuid, text), private.wall_font_owner_entity(uuid) to service_role;
