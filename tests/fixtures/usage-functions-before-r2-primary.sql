-- Snapshot (read-only, 2026-10-30) of the four TESTING definitions that 20261030140000_media_r2_primary_registry.sql redefines - the baseline its tests compare against.

CREATE OR REPLACE FUNCTION private.get_my_usage_impl()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); used bigint; reserved bigint; p private.usage_policy%rowtype; entity uuid; doc jsonb; assets integer; videos integer; layers integer; media jsonb; crew_quotas jsonb;
begin
 if u is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into p from private.usage_policy where singleton;
 used:=private.usage_stored_bytes(u); reserved:=private.usage_reserved_bytes(u);
 select m.entity_id into entity from public.entity_memberships m join public.entities e on e.entity_id=m.entity_id where m.user_id=u and m.role='OWNER' and e.entity_type='SOLO' limit 1;
 select document into doc from public.wall_drafts where entity_id=entity;
 select count(*) into layers from jsonb_array_elements(coalesce(doc->'stages','[]')) s cross join lateral jsonb_array_elements(s->'elements');
 select count(*),count(*) filter(where mime_type like 'video/%') into assets,videos from public.wall_assets where entity_id=entity;
 select coalesce(jsonb_object_agg(category,bytes),'{}') into media from (
  select coalesce(c.category,'other') category,
   sum((o.metadata->>'size')::bigint) bytes from storage.objects o left join private.usage_media_categories c on c.bucket=o.bucket_id where split_part(o.name,'/',1)=u::text and o.bucket_id not in ('wall-video-renditions','intro-share-copies','intro-posters') and coalesce(o.metadata->>'size','') ~ '^[0-9]+$' group by 1
 ) m;
 select coalesce(jsonb_agg(q),'[]') into crew_quotas from (
  select jsonb_build_object('key','crew.members.'||c.crew_id,'name',c.name||' · Crew members','used',(select count(*) from public.crew_members a where a.crew_id=c.crew_id and a.status='ACTIVE'),'limit',cp.max_members) q
  from public.crews c cross join private.crew_policy cp where c.owner_entity_id=entity and cp.singleton
  union all
  select jsonb_build_object('key','crew.stages.'||c.crew_id,'name',c.name||' · Crew Wall stages','used',coalesce(w.stage_count,1),'limit',private.crew_wall_stage_allowance(c.crew_id))
  from public.crews c left join public.crew_walls w on w.crew_id=c.crew_id where c.owner_entity_id=entity
 ) cq;
 return jsonb_build_object('version',1,'storage',jsonb_build_object('quota_bytes',p.quota_bytes,'used_bytes',used,'remaining_bytes',greatest(0,p.quota_bytes-used),'reserved_bytes',reserved,'available_bytes',greatest(0,p.quota_bytes-used-reserved),'percentage',round(100.0*used/p.quota_bytes,2),'state',case when used>=p.quota_bytes then 'FULL' when used>=p.quota_bytes*p.near_limit then 'NEAR_LIMIT' when used>=p.quota_bytes*p.approaching then 'APPROACHING_LIMIT' else 'NORMAL' end,'enforcement_active',p.gateway_required),'media',media,'quotas',jsonb_build_array(
  jsonb_build_object('key','wall.layers','name','Wall Layers','used',layers,'limit',null),
  jsonb_build_object('key','wall.assets','name','Wall Assets (images + videos)','used',assets,'limit',private.wall_asset_limit()),
  jsonb_build_object('key','wall.videos','name','Wall Videos','used',videos,'limit',private.wall_video_limit()),
  jsonb_build_object('key','wall.images','name','Wall Images','used',assets-videos,'limit',null,'note','Shares the Wall Assets allowance'),
  jsonb_build_object('key','wall.fonts','name','Custom Fonts','used',(select count(*) from public.wall_fonts f where f.owner_id=u),'limit',private.wall_font_limit()))||crew_quotas);
end $function$
;

CREATE OR REPLACE FUNCTION private.reserve_usage_upload(u uuid, b text, p text, n bigint, m text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare existing private.usage_uploads%rowtype; cap bigint; types text[]; q bigint;
begin
 if u is null or p is null or split_part(p,'/',1)<>u::text or p ~ '(\.\.|[\\])' then raise exception 'INVALID_UPLOAD_PATH'; end if;
 select file_size_limit,allowed_mime_types into cap,types from storage.buckets where id=b;
 if b<>'wall-fonts' and b not in ('avatars','intro-sources','intro-media','wall-media','wall-video','wall-video-derived') or cap is null or n is null or m is null or n<1 or n>cap or not(m=any(types)) then raise exception 'INVALID_UPLOAD'; end if;
 perform pg_advisory_xact_lock(hashtextextended('usage:'||u::text,0));
 select * into existing from private.usage_uploads where bucket=b and path=p;
 if found then
  if existing.owner_id<>u then raise exception 'UPLOAD_CONFLICT'; end if;
  if existing.state='CANCELLED' or (existing.state='COMPLETE' and not exists(select 1 from storage.objects where bucket_id=b and name=p)) then delete from private.usage_uploads where upload_id=existing.upload_id;
  else
   if existing.expected_bytes<>n or existing.content_type<>m then raise exception 'UPLOAD_CONFLICT'; end if;
   return to_jsonb(existing);
  end if;
 end if;
 if b='wall-fonts' and private.wall_font_slots_used(u,p)>=private.wall_font_limit() then raise exception using errcode='54000',message='WALL_FONT_LIMIT'; end if;
 if exists(select 1 from storage.objects where bucket_id=b and name=p) then raise exception 'OBJECT_ALREADY_EXISTS'; end if;
 select quota_bytes into q from private.usage_policy where singleton;
 if private.usage_stored_bytes(u)+private.usage_reserved_bytes(u)+n>q then raise exception using errcode='54000',message='ACCOUNT_STORAGE_QUOTA_EXCEEDED'; end if;
 insert into private.usage_uploads(owner_id,bucket,path,expected_bytes,content_type) values(u,b,p,n,m) returning * into existing;
 return to_jsonb(existing);
end $function$
;

CREATE OR REPLACE FUNCTION private.usage_stored_bytes(u uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if exists(select 1 from storage.objects o where split_part(o.name,'/',1)=u::text and o.bucket_id not in ('wall-video-renditions','intro-share-copies','intro-posters') and coalesce(o.metadata->>'size','') !~ '^[0-9]+$') then raise exception 'UNVERIFIED_STORAGE_SIZE';end if;
 return (select coalesce(sum((o.metadata->>'size')::bigint),0)::bigint from storage.objects o where split_part(o.name,'/',1)=u::text and o.bucket_id not in ('wall-video-renditions','intro-share-copies','intro-posters'));
end
$function$
;

CREATE OR REPLACE FUNCTION private.usage_upload_action(i uuid, u uuid, a text, v text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare x private.usage_uploads%rowtype; bytes bigint;
begin
 select * into x from private.usage_uploads where upload_id=i and owner_id=u for update;
 if not found then raise exception using errcode='42501',message='UPLOAD_NOT_OWNED'; end if;
 if a='bind' then
  if x.state<>'ACTIVE' then raise exception 'UPLOAD_CANCELLED';end if;
  if x.upstream_url is not null and x.upstream_url<>v then raise exception 'UPLOAD_ALREADY_BOUND'; end if;
  update private.usage_uploads set upstream_url=v,updated_at=now() where upload_id=i;
 elsif a='complete' then
  if x.state='CANCELLED' then raise exception 'UPLOAD_CANCELLED';end if;
  select (metadata->>'size')::bigint into bytes from storage.objects where bucket_id=x.bucket and name=x.path;
  if bytes is distinct from x.expected_bytes then raise exception 'UPLOAD_SIZE_MISMATCH'; end if;
  update private.usage_uploads set state='COMPLETE',updated_at=now() where upload_id=i;
 elsif a='cancel' then
  -- Gateway proves remote termination/absence before invoking this service-only action.
  if exists(select 1 from storage.objects where bucket_id=x.bucket and name=x.path) then raise exception 'UPLOAD_STILL_STORED'; end if;
  update private.usage_uploads set state='CANCELLED',updated_at=now() where upload_id=i;
 elsif a='release_unbound' then
  -- ISS-0011: only a receipt whose resumable upload never started (never bound, so nothing can continue it) and whose object does not exist
  if x.state<>'ACTIVE' or x.upstream_url is not null then raise exception 'UPLOAD_IN_PROGRESS'; end if;
  if exists(select 1 from storage.objects where bucket_id=x.bucket and name=x.path) then raise exception 'UPLOAD_STILL_STORED'; end if;
  update private.usage_uploads set state='CANCELLED',updated_at=now() where upload_id=i;
 elsif a<>'get' then raise exception 'INVALID_UPLOAD_ACTION'; end if;
 select * into x from private.usage_uploads where upload_id=i;
 return to_jsonb(x);
end $function$
;
