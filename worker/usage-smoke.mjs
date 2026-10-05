// Explicit disposable TESTING media only. Never claims an Intro/Wall processing job.
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {uploadGatewayFile,deleteGatewayObject} from './usage-upload.mjs';
export async function smokeUsageGateway(backend,fetchImpl=fetch,{requireEnforcement=false}={}) {
 if(backend.url!=='https://upvtrczefcvigxdyuylw.supabase.co')throw Error('TESTING_GATEWAY_ONLY');
 const owner=randomUUID(),path=`${owner}/${randomUUID()}.webm`,reservations=[];
 const rpc=async(name,body)=>{const r=await fetchImpl(`${backend.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{...backend.headers(null),'Content-Type':'application/json'},body:JSON.stringify(body)});const payload=await r.json();if(!r.ok)throw Error(payload.message||'SMOKE_RPC_FAILED');return payload;};
 const dir=await mkdtemp(join(tmpdir(),'gamid-usage-smoke-'));let stored=false;
 try {
  const candidates=Array.from({length:2},()=>({candidate_owner:owner,candidate_bucket:'wall-video-derived',candidate_path:`${owner}/${randomUUID()}.mp4`,candidate_bytes:100_000_000,candidate_mime:'video/mp4'}));
  // Separate HTTP requests exercise the real Postgres per-owner advisory lock.
  const concurrent=await Promise.allSettled(candidates.map(b=>rpc('reserve_usage_upload',b)));
  for(const result of concurrent)if(result.status==='fulfilled')reservations.push(result.value);
  const failed=concurrent.find(x=>x.status==='rejected');if(failed)throw failed.reason;
  if((await rpc('reserve_usage_upload',candidates[0])).upload_id!==reservations[0].upload_id)throw Error('SMOKE_RETRY_DOUBLE_RESERVATION');
  let blocked=false;try{await rpc('reserve_usage_upload',{candidate_owner:owner,candidate_bucket:'intro-media',candidate_path:path,candidate_bytes:1,candidate_mime:'video/webm'});}catch(e){if(e.message!=='ACCOUNT_STORAGE_QUOTA_EXCEEDED')throw e;blocked=true;}if(!blocked)throw Error('SMOKE_QUOTA_NOT_ENFORCED');
  for(const x of reservations)await rpc('usage_upload_action',{candidate_upload:x.upload_id,candidate_owner:owner,candidate_action:'cancel'});
  const filePath=join(dir,'fixture.webm');await writeFile(filePath,new Uint8Array([0x1a,0x45,0xdf,0xa3]));
  // Four disposable bytes test upload/accounting, not video encoding/registration.
  await uploadGatewayFile({backend,bucket:'intro-media',path,filePath,mime:'video/webm',fetchImpl});stored=true;
  const response=await fetchImpl(`${backend.url}/storage/v1/object/authenticated/intro-media/${path}`,{headers:backend.headers(null)});if(!response.ok||(await response.arrayBuffer()).byteLength!==4)throw Error('SMOKE_STORED_BYTES_MISMATCH');
  await deleteGatewayObject(backend,'intro-media',path,fetchImpl);stored=false;
  const gone=await fetchImpl(`${backend.url}/storage/v1/object/authenticated/intro-media/${path}`,{headers:backend.headers(null)});if(gone.ok)throw Error('SMOKE_DELETE_FAILED');
  const ownerChecks=await verifyOwnerGateway(backend,fetchImpl,requireEnforcement);
  return {testing:true,fixtureOwner:owner,quotaEnforced:true,concurrentReservations:true,retryIdempotence:true,derivativeUpload:true,retainedBytesVerified:true,cleanupVerified:true,...ownerChecks};
 }finally{
  if(stored)await deleteGatewayObject(backend,'intro-media',path,fetchImpl);
  for(const x of reservations)try{await rpc('usage_upload_action',{candidate_upload:x.upload_id,candidate_owner:owner,candidate_action:'cancel'});}catch{/* Preserve original failure. */}
  await rm(dir,{recursive:true,force:true});
 }
}

// Ephemeral Auth identities, never existing GamID users. Tokens stay in memory.
async function verifyOwnerGateway(backend,fetchImpl,requireEnforcement) {
 const users=[],stored=[];const service=backend.headers(null);const base=backend.url;
 // Public TESTING key, identical to the static client's key. Owner requests must
 // never carry the service API key or they would not exercise authenticated RLS.
 const publicKey='sb_publishable_ovl-uegBzJlWPJcTF_dviw_6uf1aVYg';
 const call=async(path,headers,body,method='POST')=>fetchImpl(base+path,{method,headers:{...headers,...(body instanceof Uint8Array?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});
 const check=(condition,code)=>{if(!condition)throw Error(code);};
 try {
  for(let i=0;i<2;i++){
   const email=`usage-fixture-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('hex');
   const created=await call('/auth/v1/admin/users',service,{email,password,email_confirm:true});check(created.ok,'SMOKE_FIXTURE_AUTH_CREATE');const u=await created.json();users.push({id:u.id});
   const signed=await call('/auth/v1/token?grant_type=password',{apikey:publicKey},{email,password});check(signed.ok,'SMOKE_FIXTURE_AUTH_SIGNIN');const session=await signed.json();users.at(-1).headers={apikey:publicKey,Authorization:`Bearer ${session.access_token}`};
  }
  const [a,b]=users;const usage=async()=>{const r=await call('/rest/v1/rpc/get_my_usage',a.headers,{});check(r.ok,'SMOKE_OWNER_USAGE_RPC');return r.json();};
  check((await usage()).storage.used_bytes===0,'SMOKE_FIXTURE_NOT_EMPTY');
  const path=`${a.id}/${randomUUID()}.webp`,route=`/functions/v1/usage-upload/object/avatars/${path}`;
  const forbidden=await call(route,{...b.headers,'Content-Type':'image/webp'},new Uint8Array(4));check(forbidden.status===403,'SMOKE_CROSS_OWNER_UPLOAD');
  const response=await call(route,{...a.headers,'Content-Type':'image/webp'},new Uint8Array(4));check(response.ok,'SMOKE_OWNER_UPLOAD');stored.push(['avatars',path]);
  check((await usage()).storage.used_bytes===4,'SMOKE_OWNER_ACCOUNTING');
  const retry=await call(route,{...a.headers,'Content-Type':'image/webp'},new Uint8Array(4));check(retry.ok&&(await usage()).storage.used_bytes===4,'SMOKE_OWNER_RETRY');
  const sourcePath=`${a.id}/${randomUUID()}.mp4`,dir=await mkdtemp(join(tmpdir(),'gamid-owner-smoke-'));
  try{const filePath=join(dir,'fixture.mp4');await writeFile(filePath,'data');await uploadGatewayFile({backend:{url:base,headers:()=>a.headers},bucket:'intro-sources',path:sourcePath,filePath,mime:'video/mp4',fetchImpl});stored.push(['intro-sources',sourcePath]);}finally{await rm(dir,{recursive:true,force:true});}
  check((await usage()).storage.used_bytes===8,'SMOKE_OWNER_TUS_ACCOUNTING');
  const privateRpc=await call('/rest/v1/rpc/reserve_usage_upload',a.headers,{candidate_owner:b.id,candidate_bucket:'avatars',candidate_path:`${b.id}/${randomUUID()}.webp`,candidate_bytes:1,candidate_mime:'image/webp'});check(!privateRpc.ok,'SMOKE_FORGED_RESERVATION');
  const enforced=(await usage()).storage.enforcement_active;check(!requireEnforcement||enforced,'SMOKE_ENFORCEMENT_OFF');
  if(enforced){
   const directPath=`${a.id}/${randomUUID()}.webp`;
   const direct=await call(`/storage/v1/object/avatars/${directPath}`,{...a.headers,'Content-Type':'image/webp'},new Uint8Array(4));if(direct.ok)stored.push(['avatars',directPath]);check(!direct.ok,'SMOKE_DIRECT_STORAGE_BYPASS');
   const md=[['bucketName','intro-sources'],['objectName',`${a.id}/${randomUUID()}.mp4`],['contentType','video/mp4']].map(([k,v])=>`${k} ${Buffer.from(v).toString('base64')}`).join(',');
   const tus=await fetchImpl(base.replace('.supabase.co','.storage.supabase.co')+'/storage/v1/upload/resumable',{method:'POST',headers:{...a.headers,'Tus-Resumable':'1.0.0','Upload-Length':'4','Upload-Metadata':md,'x-upsert':'false'}});check(!tus.ok,'SMOKE_DIRECT_TUS_BYPASS');
  }
  for(const [bucket,path] of stored)await deleteGatewayObject({url:base,headers:()=>a.headers},bucket,path,fetchImpl);stored.length=0;
  check((await usage()).storage.used_bytes===0,'SMOKE_OWNER_DELETE_RECLAIM');
  return {ownerUpload:true,ownerTus:true,crossOwnerBlocked:true,ownerRetry:true,ownerDeleteReclaims:true,directStorageBlocked:enforced,directTusBlocked:enforced};
 }finally{
  for(const [bucket,path] of stored)await deleteGatewayObject(backend,bucket,path,fetchImpl);
  for(const u of users){const r=await call(`/auth/v1/admin/users/${u.id}`,service,undefined,'DELETE');check(r.ok,'SMOKE_FIXTURE_AUTH_CLEANUP');}
 }
}
