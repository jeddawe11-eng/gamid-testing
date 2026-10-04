-- TESTING: supported Storage APIs only. Never mutate Storage object metadata.
-- Activation is deliberately separate: deploy gateway + worker + browser first.
create table private.usage_policy (
 singleton boolean primary key default true check(singleton),
 quota_bytes bigint not null default 200000000 check(quota_bytes=200000000),
 approaching numeric not null default .75, near_limit numeric not null default .9,
 gateway_required boolean not null default false,
 check(approaching>0 and approaching<near_limit and near_limit<1)
);
insert into private.usage_policy default values;
-- Unknown/future buckets still count toward the total and fall back to Other.
create table private.usage_media_categories(bucket text primary key,category text not null);
insert into private.usage_media_categories values ('avatars','avatar'),('intro-sources','intro'),('intro-media','intro'),('wall-media','wall'),('wall-video','wall'),('wall-video-derived','wall');
alter table private.usage_media_categories enable row level security;
revoke all on private.usage_media_categories from public,anon,authenticated,service_role;
create table private.usage_uploads (
 upload_id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 bucket text not null, path text not null, expected_bytes bigint not null check(expected_bytes>0),
 content_type text not null, upstream_url text,
 state text not null default 'ACTIVE' check(state in ('ACTIVE','COMPLETE','CANCELLED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(bucket,path)
);
alter table private.usage_policy enable row level security;
alter table private.usage_uploads enable row level security;
revoke all on private.usage_policy,private.usage_uploads from public,anon,authenticated,service_role;
create index usage_uploads_owner on private.usage_uploads(owner_id,state);

create function private.usage_object_owned(b text,p text,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.usage_uploads x where x.bucket=b and x.path=p and x.owner_id=u and x.state='COMPLETE')
$$;
create function private.usage_stored_bytes(u uuid) returns bigint
language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from storage.objects o where split_part(o.name,'/',1)=u::text and coalesce(o.metadata->>'size','') !~ '^[0-9]+$') then raise exception 'UNVERIFIED_STORAGE_SIZE';end if;
 return (select coalesce(sum((o.metadata->>'size')::bigint),0)::bigint from storage.objects o where split_part(o.name,'/',1)=u::text);
end
$$;
create function private.usage_reserved_bytes(u uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce(sum(x.expected_bytes),0)::bigint from private.usage_uploads x
 where x.owner_id=u and x.state='ACTIVE' and not exists(
  select 1 from storage.objects o where o.bucket_id=x.bucket and o.name=x.path)
$$;
create function private.usage_direct_writes_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select not gateway_required from private.usage_policy where singleton
$$;
-- Restrictive policy ANDs with all accepted ownership/type policies. Existing
-- objects/read/delete policies stay intact. Service credentials remain backend-only.
create policy gamid_usage_gateway_insert on storage.objects as restrictive
 for insert to authenticated with check(private.usage_direct_writes_allowed());
create policy gamid_usage_gateway_update on storage.objects as restrictive
 for update to authenticated using(private.usage_direct_writes_allowed()) with check(private.usage_direct_writes_allowed());
-- Storage service-created objects have no owner_id. Only a private, backend-issued
-- receipt can establish ownership; a UUID-looking path alone never authorizes access.
create policy gamid_usage_gateway_read on storage.objects for select to authenticated
 using(private.usage_object_owned(bucket_id,name,(select auth.uid())));
create policy gamid_usage_gateway_delete on storage.objects for delete to authenticated
 using(private.usage_object_owned(bucket_id,name,(select auth.uid())) and not exists(
  select 1 from public.intro_processing_jobs j where bucket_id='intro-sources' and j.source_path=name and j.state in ('pending','processing')));

create function private.usage_gateway_probe() returns boolean language sql set search_path='' as $$ select true $$;
create function public.usage_gateway_probe() returns boolean language sql security invoker set search_path='' as $$ select private.usage_gateway_probe() $$;

create function private.reserve_usage_upload(u uuid,b text,p text,n bigint,m text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare existing private.usage_uploads%rowtype; cap bigint; types text[]; q bigint;
begin
 if u is null or p is null or split_part(p,'/',1)<>u::text or p ~ '(\.\.|[\\])' then raise exception 'INVALID_UPLOAD_PATH'; end if;
 select file_size_limit,allowed_mime_types into cap,types from storage.buckets where id=b;
 if b not in ('avatars','intro-sources','intro-media','wall-media','wall-video','wall-video-derived') or cap is null or n is null or m is null or n<1 or n>cap or not(m=any(types)) then raise exception 'INVALID_UPLOAD'; end if;
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
 if exists(select 1 from storage.objects where bucket_id=b and name=p) then raise exception 'OBJECT_ALREADY_EXISTS'; end if;
 select quota_bytes into q from private.usage_policy where singleton;
 if private.usage_stored_bytes(u)+private.usage_reserved_bytes(u)+n>q then raise exception using errcode='54000',message='ACCOUNT_STORAGE_QUOTA_EXCEEDED'; end if;
 insert into private.usage_uploads(owner_id,bucket,path,expected_bytes,content_type) values(u,b,p,n,m) returning * into existing;
 return to_jsonb(existing);
end $$;
create function public.reserve_usage_upload(candidate_owner uuid,candidate_bucket text,candidate_path text,candidate_bytes bigint,candidate_mime text)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select private.reserve_usage_upload(candidate_owner,candidate_bucket,candidate_path,candidate_bytes,candidate_mime)
$$;

create function private.usage_upload_action(i uuid,u uuid,a text,v text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
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
 elsif a<>'get' then raise exception 'INVALID_UPLOAD_ACTION'; end if;
 select * into x from private.usage_uploads where upload_id=i;
 return to_jsonb(x);
end $$;
create function public.usage_upload_action(candidate_upload uuid,candidate_owner uuid,candidate_action text,candidate_value text default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select private.usage_upload_action(candidate_upload,candidate_owner,candidate_action,candidate_value)
$$;

-- Centralize accepted asset limits without changing the values or any other code.
create function private.wall_asset_limit() returns integer language sql immutable set search_path='' as $$select 60$$;
create function private.wall_video_limit() returns integer language sql immutable set search_path='' as $$select 10$$;
do $$ declare r record; original text; revised text; changed integer:=0; begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('register_verified_wall_asset_impl','create_wall_video_job_impl','worker_complete_wall_video_job_impl','update_my_identity_profile_impl','queue_my_intro_impl') loop
  original:=pg_get_functiondef(r.oid); revised:=original;
  -- Exact known ownership expressions. Preserve legacy objects plus gateway receipts.
  revised:=replace(revised,'o.owner_id = candidate_owner::text','(o.owner_id = candidate_owner::text or private.usage_object_owned(o.bucket_id,o.name,candidate_owner))');
  revised:=replace(revised,'o.owner_id = caller::text','(o.owner_id = caller::text or private.usage_object_owned(o.bucket_id,o.name,caller))');
  revised:=replace(revised,'o.owner_id=caller::text','(o.owner_id=caller::text or private.usage_object_owned(o.bucket_id,o.name,caller))');
  revised:=replace(revised,') >= 60 then',') >= private.wall_asset_limit() then');
  revised:=replace(revised,') >= 10 then',') >= private.wall_video_limit() then');
  if revised=original then raise exception 'USAGE_INTEGRATION_FUNCTION_CHANGED: %',r.proname;end if;
  execute revised;changed:=changed+1;
 end loop;
 if changed<>5 then raise exception 'USAGE_INTEGRATION_FUNCTION_MISSING';end if;
end $$;

create function private.get_my_usage_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
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
   sum((o.metadata->>'size')::bigint) bytes from storage.objects o left join private.usage_media_categories c on c.bucket=o.bucket_id where split_part(o.name,'/',1)=u::text and coalesce(o.metadata->>'size','') ~ '^[0-9]+$' group by 1
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
  jsonb_build_object('key','wall.images','name','Wall Images','used',assets-videos,'limit',null,'note','Shares the Wall Assets allowance'))||crew_quotas);
end $$;
create function public.get_my_usage() returns jsonb language sql stable security invoker set search_path='' as $$select private.get_my_usage_impl()$$;

revoke all on function private.usage_object_owned(text,text,uuid),private.usage_stored_bytes(uuid),private.usage_reserved_bytes(uuid),private.usage_direct_writes_allowed(),private.usage_gateway_probe(),public.usage_gateway_probe(),private.reserve_usage_upload(uuid,text,text,bigint,text),public.reserve_usage_upload(uuid,text,text,bigint,text),private.usage_upload_action(uuid,uuid,text,text),public.usage_upload_action(uuid,uuid,text,text),private.wall_asset_limit(),private.wall_video_limit(),private.get_my_usage_impl(),public.get_my_usage() from public,anon,authenticated,service_role;
grant execute on function private.usage_object_owned(text,text,uuid),private.usage_direct_writes_allowed(),private.get_my_usage_impl(),public.get_my_usage() to authenticated;
grant execute on function private.usage_gateway_probe(),public.usage_gateway_probe(),private.reserve_usage_upload(uuid,text,text,bigint,text),public.reserve_usage_upload(uuid,text,text,bigint,text),private.usage_upload_action(uuid,uuid,text,text),public.usage_upload_action(uuid,uuid,text,text) to service_role;

create function private.signal_usage_changed(u uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 begin perform realtime.send(jsonb_build_object('kind','USAGE'),'usage_changed','notifications:user:'||u::text,true); exception when others then null; end;
end $$;
create function public.signal_usage_changed(candidate_owner uuid) returns void language sql volatile security invoker set search_path='' as $$select private.signal_usage_changed(candidate_owner)$$;
create function private.usage_upload_owner(i uuid) returns uuid language sql stable security definer set search_path='' as $$select owner_id from private.usage_uploads where upload_id=i$$;
create function public.usage_upload_owner(candidate_upload uuid) returns uuid language sql stable security invoker set search_path='' as $$select private.usage_upload_owner(candidate_upload)$$;
create function private.usage_cleanup_candidates(u uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x),'[]') from (select * from private.usage_uploads where owner_id=u and state='ACTIVE' and created_at<now()-interval '26 hours' order by created_at limit 20)x
$$;
create function public.usage_cleanup_candidates(candidate_owner uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.usage_cleanup_candidates(candidate_owner)$$;
create function private.usage_wall_changed() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare u uuid; e uuid;
begin
 if TG_OP='DELETE' then e:=old.entity_id;else e:=new.entity_id;end if;
 for u in select user_id from public.entity_memberships where entity_id=e and role='OWNER' loop perform private.signal_usage_changed(u);end loop;
 return null;
end $$;
create trigger usage_wall_changed after insert or update or delete on public.wall_drafts for each row execute function private.usage_wall_changed();
create trigger usage_assets_changed after insert or update or delete on public.wall_assets for each row execute function private.usage_wall_changed();
revoke all on function private.signal_usage_changed(uuid),public.signal_usage_changed(uuid),private.usage_upload_owner(uuid),public.usage_upload_owner(uuid),private.usage_cleanup_candidates(uuid),public.usage_cleanup_candidates(uuid),private.usage_wall_changed() from public,anon,authenticated,service_role;
grant execute on function private.signal_usage_changed(uuid),public.signal_usage_changed(uuid),private.usage_upload_owner(uuid),public.usage_upload_owner(uuid),private.usage_cleanup_candidates(uuid),public.usage_cleanup_candidates(uuid) to service_role;

create function private.authorize_usage_delete(u uuid,b text,p text) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if u is null or split_part(p,'/',1)<>u::text then raise exception 'UPLOAD_NOT_OWNED';end if;
 if b='intro-sources' and exists(select 1 from public.intro_processing_jobs where source_path=p and state in ('pending','processing')) then raise exception 'INTRO_PROCESSING_IN_PROGRESS';end if;
 if exists(select 1 from storage.objects o where o.bucket_id=b and o.name=p and not coalesce(o.owner_id=u::text or private.usage_object_owned(b,p,u) or b in ('intro-media','wall-video-derived'),false)) then raise exception 'UPLOAD_NOT_OWNED';end if;
end $$;
create function public.authorize_usage_delete(candidate_owner uuid,candidate_bucket text,candidate_path text) returns void language sql stable security invoker set search_path='' as $$select private.authorize_usage_delete(candidate_owner,candidate_bucket,candidate_path)$$;
revoke all on function private.authorize_usage_delete(uuid,text,text),public.authorize_usage_delete(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.authorize_usage_delete(uuid,text,text),public.authorize_usage_delete(uuid,text,text) to service_role;

create function private.usage_crew_changed() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare entity uuid;crew uuid;u uuid;
begin
 if TG_TABLE_NAME='crews' then
  if TG_OP='DELETE' then entity:=old.owner_entity_id;else entity:=new.owner_entity_id;end if;
 else
  if TG_OP='DELETE' then crew:=old.crew_id;else crew:=new.crew_id;end if;
  select owner_entity_id into entity from public.crews where crew_id=crew;
 end if;
 for u in select user_id from public.entity_memberships where entity_id=entity and role='OWNER' loop perform private.signal_usage_changed(u);end loop;
 return null;
end $$;
create trigger usage_crew_changed after insert or update or delete on public.crews for each row execute function private.usage_crew_changed();
create trigger usage_crew_members_changed after insert or update or delete on public.crew_members for each row execute function private.usage_crew_changed();
create trigger usage_crew_wall_changed after insert or update or delete on public.crew_walls for each row execute function private.usage_crew_changed();
revoke all on function private.usage_crew_changed() from public,anon,authenticated,service_role;
