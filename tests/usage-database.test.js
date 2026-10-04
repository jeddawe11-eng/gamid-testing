import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Isolated Postgres fixture only. These are local tables, not Supabase Storage.
const OWNER='11111111-1111-4111-8111-111111111111', OTHER='22222222-2222-4222-8222-222222222222';
const migration=readFileSync(new URL('../supabase/migrations/20261004170252_global_usage_gateway.sql',import.meta.url),'utf8');
async function fixture() {
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema private;create schema storage;create schema auth;create schema realtime;
 grant usage on schema public,private,storage,auth to authenticated,service_role,anon;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;
 create table storage.objects(bucket_id text,name text,owner_id text,metadata jsonb,primary key(bucket_id,name));
 create table storage.buckets(id text primary key,file_size_limit bigint,allowed_mime_types text[]);
 insert into storage.buckets values ('avatars',5242880,array['image/webp']),('wall-media',5242880,array['image/png']),('wall-video',52428800,array['video/mp4','video/webm']),('intro-sources',157286400,array['video/mp4']),('intro-media',15728640,array['video/webm']),('wall-video-derived',209715200,array['video/mp4']);
 alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;
 create policy legacy_read on storage.objects for select to authenticated using(owner_id=auth.uid()::text);
 create policy legacy_write on storage.objects for insert to authenticated with check(owner_id=auth.uid()::text);
 create policy legacy_update on storage.objects for update to authenticated using(owner_id=auth.uid()::text) with check(owner_id=auth.uid()::text);
 create policy legacy_delete on storage.objects for delete to authenticated using(owner_id=auth.uid()::text);
 create table public.intro_processing_jobs(source_path text,state text);
 grant select on public.intro_processing_jobs to authenticated;
 create table public.entity_memberships(entity_id uuid,user_id uuid,role text);
 create table public.entities(entity_id uuid,entity_type text);
 create table public.wall_drafts(entity_id uuid,document jsonb);
 create table public.wall_assets(entity_id uuid,mime_type text);
 create table public.crews(crew_id uuid,name text,owner_entity_id uuid);
 create table public.crew_members(crew_id uuid,entity_id uuid,status text);
 create table public.crew_walls(crew_id uuid,stage_count integer);
 create table private.crew_policy(singleton boolean,max_members integer,wall_stage_allowance integer);
 insert into private.crew_policy values(true,15,2);
 create function private.crew_wall_stage_allowance(uuid) returns integer language sql as $$ select wall_stage_allowance from private.crew_policy $$;
 `);
 // Only pre-existing dependencies are fixtures. Execute the actual migration unchanged.
 for(const name of ['register_verified_wall_asset_impl','create_wall_video_job_impl','worker_complete_wall_video_job_impl','update_my_identity_profile_impl','queue_my_intro_impl'])await db.exec(`create function private.${name}() returns void language plpgsql as $$declare candidate_owner uuid;caller uuid;begin perform 1 from storage.objects o where o.owner_id = caller::text; if (select 0) >= 60 then raise exception 'WALL_ASSET_LIMIT';end if;if (select 0) >= 10 then raise exception 'WALL_VIDEO_LIMIT';end if;end$$;`);
 await db.exec(migration);
 const reserve=async(bucket,path,n,mime)=> (await db.query('select public.reserve_usage_upload($1,$2,$3,$4,$5) x',[OWNER,bucket,`${OWNER}/${path}`,n,mime])).rows[0].x;
 const object=async(bucket,path,n,owner=OWNER)=>db.query('insert into storage.objects values($1,$2,$3,$4)',[bucket,`${owner}/${path}`,owner,{size:n}]);
 const own=async(uid=OWNER)=>db.exec(`set role authenticated;set request.jwt.claim.sub='${uid}';`);
 const admin=()=>db.exec('reset role;');
 const usage=async()=> (await db.query('select public.get_my_usage() x')).rows[0].x;
 return {db,reserve,object,own,admin,usage};
}

test('actual migration: aggregate retained objects, categories, shared limits and source/derivative lifecycle',async()=>{
 const f=await fixture();try{
 await f.object('avatars','old.webp',2_000_000);await f.object('avatars','new.webp',3_000_000);
 await f.object('intro-sources','source.mp4',30_000_000);await f.object('intro-media','intro.webm',10_000_000);
 await f.object('wall-media','image.png',4_000_000);await f.object('wall-video','video.mp4',35_000_000);
 await f.object('future-owner-media','future.bin',1_000_000);await f.object('avatars','other.webp',5_000_000,OTHER);
 await f.db.exec(`insert into public.entities values('${OWNER}','SOLO');insert into public.entity_memberships values('${OWNER}','${OWNER}','OWNER');insert into public.wall_drafts values('${OWNER}','{"stages":[{"elements":[{},{}]},{"elements":[{}]}]}');insert into public.wall_assets values('${OWNER}','image/png'),('${OWNER}','image/png'),('${OWNER}','video/mp4');insert into public.crews values('${OWNER}','Crew fixture','${OWNER}');insert into public.crew_members values('${OWNER}','${OWNER}','ACTIVE');`);
 await f.own();let u=await f.usage();assert.equal(u.storage.quota_bytes,200_000_000);assert.equal(u.storage.used_bytes,85_000_000);assert.equal(u.storage.remaining_bytes,115_000_000);assert.equal(u.storage.percentage,42.5);
 assert.deepEqual(u.media,{avatar:5_000_000,intro:40_000_000,wall:39_000_000,other:1_000_000});
 assert.deepEqual(u.quotas.slice(0,4).map(x=>[x.used,x.limit]),[[3,null],[3,60],[1,10],[2,null]]);assert.deepEqual(u.quotas.slice(4).map(x=>[x.used,x.limit]),[[1,15],[1,2]]);
 await f.admin();await f.db.query('delete from storage.objects where name=$1',[`${OWNER}/source.mp4`]);await f.db.query('delete from storage.objects where name=$1',[`${OWNER}/old.webp`]);
 await f.own();u=await f.usage();assert.equal(u.storage.used_bytes,53_000_000);assert.equal(u.media.intro,10_000_000);assert.equal(u.media.avatar,3_000_000);
 }finally{await f.db.close();}
});

test('actual migration: reservations enforce aggregate, retry idempotence, committed bytes are never double counted, confirmed cancellation frees capacity',async()=>{
 const f=await fixture();try{
 await f.object('wall-video-derived','stored.mp4',180_000_000);
 const x=await f.reserve('intro-media','pending.webm',15_000_000,'video/webm');assert.equal((await f.reserve('intro-media','pending.webm',15_000_000,'video/webm')).upload_id,x.upload_id);
 await assert.rejects(f.reserve('wall-video','extra.mp4',6_000_000,'video/mp4'),/ACCOUNT_STORAGE_QUOTA_EXCEEDED/);
 await assert.rejects(f.reserve('avatars','too-large.webp',5_242_881,'image/webp'),/INVALID_UPLOAD/);
 await assert.rejects(f.reserve('avatars','type.webp',1,'video/mp4'),/INVALID_UPLOAD/);
 await f.own();assert.equal((await f.usage()).storage.reserved_bytes,15_000_000);await f.admin();
 await f.object('intro-media','pending.webm',15_000_000);
 await f.db.query("select public.usage_upload_action($1,$2,'complete')",[x.upload_id,OWNER]);
 await assert.rejects(f.db.query("select public.usage_upload_action($1,$2,'cancel')",[x.upload_id,OWNER]),/UPLOAD_STILL_STORED/);
 await f.own();let u=await f.usage();assert.equal(u.storage.used_bytes,195_000_000);assert.equal(u.storage.reserved_bytes,0);assert.equal(u.storage.state,'NEAR_LIMIT');await f.admin();
 const pending=await f.reserve('avatars','pending.webp',5_000_000,'image/webp');await assert.rejects(f.reserve('avatars','one-more.webp',1,'image/webp'),/ACCOUNT_STORAGE_QUOTA_EXCEEDED/);
 await f.db.query("select public.usage_upload_action($1,$2,'cancel')",[pending.upload_id,OWNER]);await f.reserve('avatars','one-more.webp',1,'image/webp');
 await f.db.query('delete from storage.objects where name=$1',[`${OWNER}/pending.webm`]);await f.own();u=await f.usage();assert.equal(u.storage.used_bytes,180_000_000);assert.equal(u.storage.state,'NEAR_LIMIT');
 }finally{await f.db.close();}
});

test('actual migration: owner-only RPC, no forged owner arguments, private receipts, restrictive writes and cross-owner RLS',async()=>{
 const f=await fixture();try{
 await f.object('avatars','mine.webp',1);await f.object('avatars','theirs.webp',2,OTHER);await f.own();assert.equal((await f.usage()).storage.used_bytes,1);
 await assert.rejects(f.db.query('select public.get_my_usage($1)',[OTHER]),/does not exist/);
 await assert.rejects(f.db.query('select * from private.usage_uploads'),/permission denied/);
 await assert.rejects(f.db.query('select public.usage_gateway_probe()'),/permission denied/);
 await assert.rejects(f.reserve('avatars','forged.webp',1,'image/webp'),/permission denied/);
 assert.equal((await f.db.query('select * from storage.objects where owner_id=$1',[OTHER])).rows.length,0);
 await f.admin();await f.db.exec('update private.usage_policy set gateway_required=true');await f.own();
 await assert.rejects(f.object('avatars','direct.webp',1),/row-level security/);
 await f.own(OTHER);assert.equal((await f.usage()).storage.used_bytes,2);
 await f.admin();await f.db.exec('set role anon');await assert.rejects(f.usage(),/permission denied/);
 }finally{await f.db.close();}
});

test('actual migration: completed receipt restores service-object owner access; unknown size fails closed; cleanup does not authorize null-owner objects',async()=>{
 const f=await fixture();try{
 const x=await f.reserve('avatars','gateway.webp',3,'image/webp');await f.db.query('insert into storage.objects values($1,$2,null,$3)',['avatars',`${OWNER}/gateway.webp`,{size:3}]);
 await f.own();assert.equal((await f.db.query('select * from storage.objects')).rows.length,0);await f.admin();
 await f.db.query("select public.usage_upload_action($1,$2,'complete')",[x.upload_id,OWNER]);await f.own();assert.equal((await f.db.query('select * from storage.objects')).rows.length,1);await f.own(OTHER);assert.equal((await f.db.query('select * from storage.objects')).rows.length,0);await f.admin();
 await f.db.query('insert into storage.objects values($1,$2,null,$3)',['avatars',`${OWNER}/no-receipt.webp`,{size:1}]);
 await assert.rejects(f.db.query('select public.authorize_usage_delete($1,$2,$3)',[OWNER,'avatars',`${OWNER}/no-receipt.webp`]),/UPLOAD_NOT_OWNED/);
 await f.db.query('update storage.objects set metadata=$1 where name=$2',[{},`${OWNER}/gateway.webp`]);await f.own();await assert.rejects(f.usage(),/UNVERIFIED_STORAGE_SIZE/);
 }finally{await f.db.close();}
});
