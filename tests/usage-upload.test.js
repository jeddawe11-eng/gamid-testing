import test from 'node:test';
import assert from 'node:assert/strict';
import {handleUsageUpload,safeUpstream,boundedBody,uploadMetadata} from '../supabase/functions/_shared/usage-upload.js';
import {uploadResumable} from '../dist/account/resumable-upload.js';
import {uploadGatewayFile} from '../worker/usage-upload.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const BASE='https://upvtrczefcvigxdyuylw.supabase.co',TUS='https://upvtrczefcvigxdyuylw.storage.supabase.co/storage/v1/upload/resumable';
const OWNER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',ID='33333333-3333-4333-8333-333333333333';
test('worker derivative gateway preserves legacy Bearer and secret-key authentication',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gamid-worker-auth-'));try{
 const filePath=join(dir,'fixture.webm');await writeFile(filePath,'data');
 for(const headers of [{apikey:'legacy-fixture',Authorization:'Bearer legacy-fixture'},{apikey:'sb_secret_fixture'}]){
  const fetchImpl=async(_url,o)=>{assert.equal(o.headers.authorization,headers.Authorization);assert.equal(o.headers.apikey,headers.apikey);return new Response(null,{status:o.method==='POST'?201:204,headers:o.method==='POST'?{Location:BASE+'/functions/v1/usage-upload/tus/'+ID}:{'Upload-Offset':'4'}});};
  await uploadGatewayFile({backend:{url:BASE,headers:()=>headers},bucket:'intro-media',path:OWNER+'/fixture.webm',filePath,mime:'video/webm',fetchImpl});
 }
 }finally{await rm(dir,{recursive:true,force:true});}
});
const env={supabaseUrl:BASE,serviceKey:'private-service-fixture',anonKey:'publishable-fixture'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const metadata=(bucket='wall-video',owner=OWNER,mime='video/mp4')=>[['bucketName',bucket],['objectName',`${owner}/file.mp4`],['contentType',mime]].map(([k,v])=>`${k} ${btoa(v)}`).join(',');
function fixture({quota=false,user=OWNER,worker=false,stored=null,remoteStatus=204,createStatus=201,uncertain=false}={}) {
 const calls=[];let offset=0;const x={upload_id:ID,owner_id:OWNER,bucket:'wall-video',path:`${OWNER}/file.mp4`,expected_bytes:4,state:'ACTIVE',created_at:new Date().toISOString(),upstream_url:null};
 const fetchImpl=async(url,options={})=>{
  calls.push({url,...options});
  if(url.endsWith('/auth/v1/user'))return user?json({id:user}):json({},401);
  if(url.includes('/rpc/')){
   const name=url.split('/').at(-1),b=JSON.parse(options.body||'{}');
   if(name==='usage_gateway_probe')return worker?json(true):json({},403);
   if(name==='reserve_usage_upload'){
    if(quota)return json({message:'ACCOUNT_STORAGE_QUOTA_EXCEEDED'},400);
    Object.assign(x,{bucket:b.candidate_bucket,path:b.candidate_path,expected_bytes:b.candidate_bytes});return json(x);
   }
   if(name==='usage_upload_owner')return json(x.owner_id);
   if(name==='usage_cleanup_candidates')return json([x]);
   if(name==='usage_upload_action'){
    if(b.candidate_owner!==x.owner_id)return json({message:'UPLOAD_NOT_OWNED'},403);
    if(b.candidate_action==='bind')x.upstream_url=b.candidate_value;
    if(b.candidate_action==='complete'){if(stored!==x.expected_bytes)return json({message:'UPLOAD_SIZE_MISMATCH'},400);x.state='COMPLETE';}
    if(b.candidate_action==='cancel'){if(stored!==null)return json({message:'UPLOAD_STILL_STORED'},400);x.state='CANCELLED';}
    return json(x);
   }
   return json(null);
  }
  if(url===TUS)return new Response(null,{status:createStatus,headers:{Location:`${TUS}/private-upstream-fixture`}});
  if(url.startsWith(TUS+'/')){
   if(options.method==='DELETE')return new Response(null,{status:remoteStatus});
   if(options.method==='HEAD')return new Response(null,{status:remoteStatus===404?404:200,headers:{'Upload-Offset':String(offset)}});
   if(options.method==='PATCH'){if(uncertain)throw Error('socket lost');offset+=options.body.byteLength;if(offset===x.expected_bytes)stored=offset;return new Response(null,{status:204,headers:{'Upload-Offset':String(offset)}});}
  }
  if(url.includes('/storage/v1/object/')){if(options.method==='POST'){if(uncertain)throw Error('socket lost');stored=options.body.byteLength;}return json({});}
  throw Error(`Unexpected fake request ${url}`);
 };
 const run=(route,method='POST',headers={},body)=>handleUsageUpload({request:new Request(`${BASE}/functions/v1/usage-upload/${route}`,{method,headers:{apikey:worker?'private-backend-fixture':env.anonKey,Authorization:'Bearer owner-fixture',...headers},...(body===undefined?{}:{body})}),env,fetchImpl});
 return {run,calls,x};
}

test('gateway measures ordinary upload bytes, keeps credentials private and recovers committed retries',async()=>{
 const f=fixture();const r=await f.run(`object/avatars/${OWNER}/avatar.webp`,'POST',{'Content-Type':'image/webp','Upload-Length':'1'},new Uint8Array(4));
 assert.equal(r.status,200);assert.equal(f.x.expected_bytes,4);assert.equal(f.x.state,'COMPLETE');
 const reserve=f.calls.find(c=>c.url.endsWith('/reserve_usage_upload'));assert.equal(JSON.parse(reserve.body).candidate_bytes,4);
 const payload=await r.text();assert.doesNotMatch(payload,/private-service|private-upstream/);
 const before=f.calls.filter(c=>c.url.includes('/storage/v1/object/')).length;assert.equal((await f.run(`object/avatars/${OWNER}/avatar.webp`,'POST',{'Content-Type':'image/webp'},new Uint8Array(4))).status,200);assert.equal(f.calls.filter(c=>c.url.includes('/storage/v1/object/')).length,before);
});

test('aggregate quota rejection happens before any ordinary or TUS Storage write',async()=>{
 for(const kind of ['image','video']){
 const f=fixture({quota:true});const r=kind==='image'?await f.run(`object/wall-media/${OWNER}/image.png`,'POST',{'Content-Type':'image/png'},new Uint8Array(4)):await f.run('tus','POST',{'Upload-Length':'4','Upload-Metadata':metadata()});
 assert.equal(r.status,413);assert.equal((await r.json()).error,'ACCOUNT_STORAGE_QUOTA_EXCEEDED');assert.ok(!f.calls.some(c=>c.url.includes('/storage/')||c.url.includes('.storage.')));
 }
});

test('owner authentication and binding defeat cross-owner paths/receipts, anonymous calls and browser derivative uploads',async()=>{
 const f=fixture();assert.equal((await f.run('tus','POST',{'Upload-Length':'4','Upload-Metadata':metadata('wall-video',OTHER)})).status,403);
 assert.equal((await f.run('tus','POST',{'Upload-Length':'4','Upload-Metadata':metadata('intro-media',OWNER,'video/webm')})).status,400);
 const other=fixture({user:OTHER});assert.equal((await other.run(`tus/${ID}`,'HEAD')).status,403);
 assert.equal((await fixture({user:null}).run('tus','POST',{'Upload-Length':'4','Upload-Metadata':metadata()})).status,401);
 assert.equal((await handleUsageUpload({request:new Request(`${BASE}/functions/v1/usage-upload/tus`,{method:'POST'}),env:{...env,supabaseUrl:'https://wrong-project.supabase.co'}})).status,503);
});

test('TUS length/path are server bound; proxy strips client metadata/authorization and verifies final actual bytes',async()=>{
 const f=fixture();const made=await f.run('tus','POST',{'Upload-Length':'4','Upload-Metadata':metadata()});assert.equal(made.status,201);assert.match(made.headers.get('Location'),new RegExp(`/usage-upload/tus/${ID}$`));assert.doesNotMatch(made.headers.get('Location'),/private-upstream/);
 assert.equal((await f.run(`tus/${ID}`,'PATCH',{'Upload-Offset':'3'},new Uint8Array(2))).status,400);
 const r=await f.run(`tus/${ID}`,'PATCH',{'Upload-Offset':'0','Upload-Length':'999999999','Upload-Metadata':metadata('wall-video',OTHER)},new Uint8Array(4));assert.equal(r.status,204);assert.equal(f.x.state,'COMPLETE');
 const patch=f.calls.find(c=>c.method==='PATCH');assert.equal(patch.headers.Authorization,`Bearer ${env.serviceKey}`);assert.equal(patch.headers['Upload-Length'],undefined);assert.equal(patch.headers['Upload-Metadata'],undefined);
 assert.equal((await f.run(`tus/${ID}`,'HEAD')).headers.get('Upload-Offset'),'4');assert.equal((await f.run(`tus/${ID}`,'DELETE')).status,409);
});

test('uncertain upload failure keeps capacity charged; confirmed remote termination permits release; late requests cannot use expired reservations',async()=>{
 const f=fixture({uncertain:true});await f.run('tus','POST',{'Upload-Length':'4','Upload-Metadata':metadata()});assert.equal((await f.run(`tus/${ID}`,'PATCH',{'Upload-Offset':'0'},new Uint8Array(4))).status,502);assert.equal(f.x.state,'ACTIVE');
 assert.equal((await f.run(`tus/${ID}`,'DELETE')).status,204);assert.equal(f.x.state,'CANCELLED');
 const old=fixture();await old.run('tus','POST',{'Upload-Length':'4','Upload-Metadata':metadata()});old.x.created_at=new Date(Date.now()-25*3600000).toISOString();assert.equal((await old.run(`tus/${ID}`,'PATCH',{'Upload-Offset':'0'},new Uint8Array(4))).status,400);
});

test('expiry cleanup does not release a live remote upload; backend credentials must prove service-only privilege',async()=>{
 const live=fixture();live.x.upstream_url=`${TUS}/private-upstream-fixture`;assert.deepEqual(await (await live.run('cleanup')).json(),{cleaned:0});assert.equal(live.x.state,'ACTIVE');
 const expired=fixture({remoteStatus:404});expired.x.upstream_url=`${TUS}/private-upstream-fixture`;assert.deepEqual(await (await expired.run('cleanup')).json(),{cleaned:1});assert.equal(expired.x.state,'CANCELLED');
 const worker=fixture({worker:true});assert.equal((await worker.run('tus','POST',{'Upload-Length':'4','Upload-Metadata':metadata('intro-media',OWNER,'video/webm')})).status,201);assert.ok(!worker.calls.some(c=>c.url.endsWith('/auth/v1/user')));
});

test('metadata/remote URL/chunk validation rejects forgery, SSRF and oversized bodies',async()=>{
 assert.throws(()=>uploadMetadata('bucketName YQ==,bucketName Yg=='),/INVALID/);
 for(const url of ['https://attacker.test/a',TUS+'/id?token=secret',TUS+'-other/id'])assert.throws(()=>safeUpstream(url),/INVALID/);
 await assert.rejects(boundedBody(new Request('https://fixture.test',{method:'POST',body:new Uint8Array(5)}),4),/CHUNK_TOO_LARGE/);
 const f=fixture();assert.equal((await f.run('tus','POST',{'Upload-Length':'4','Upload-Metadata':metadata()},new Uint8Array(1))).status,400);
});

test('resumable client terminates an exhausted gateway upload and preserves original actionable error',async()=>{
 const methods=[];const fetcher=async(_url,o)=>{methods.push(o.method);if(o.method==='POST')return new Response(null,{status:201,headers:{Location:'https://fixture.test/tus/id'}});if(o.method==='PATCH')return new Response(null,{status:403});return new Response(null,{status:204});};
 await assert.rejects(uploadResumable({endpoint:'https://fixture.test/tus',bucketName:'wall-video',objectName:`${OWNER}/v.mp4`,contentType:'video/mp4',file:new Blob(['data']),token:'fixture',apikey:'fixture',fetcher,retryDelays:[0],terminateOnFailure:true}),/403/);assert.deepEqual(methods,['POST','PATCH','DELETE']);
});
