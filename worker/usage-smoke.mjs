// Explicit disposable TESTING media only. Never claims an Intro/Wall processing job.
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {uploadGatewayFile,deleteGatewayObject} from './usage-upload.mjs';
export async function smokeUsageGateway(backend,fetchImpl=fetch) {
 if(backend.url!=='https://upvtrczefcvigxdyuylw.supabase.co')throw Error('TESTING_GATEWAY_ONLY');
 const owner=randomUUID(),path=`${owner}/${randomUUID()}.webm`,reservations=[];
 const rpc=async(name,body)=>{const r=await fetchImpl(`${backend.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{...backend.headers(null),'Content-Type':'application/json'},body:JSON.stringify(body)});const payload=await r.json();if(!r.ok)throw Error(payload.message||'SMOKE_RPC_FAILED');return payload;};
 const dir=await mkdtemp(join(tmpdir(),'gamid-usage-smoke-'));let stored=false;
 try {
  for(let i=0;i<2;i++)reservations.push(await rpc('reserve_usage_upload',{candidate_owner:owner,candidate_bucket:'wall-video-derived',candidate_path:`${owner}/${randomUUID()}.mp4`,candidate_bytes:100_000_000,candidate_mime:'video/mp4'}));
  let blocked=false;try{await rpc('reserve_usage_upload',{candidate_owner:owner,candidate_bucket:'intro-media',candidate_path:path,candidate_bytes:1,candidate_mime:'video/webm'});}catch(e){if(e.message!=='ACCOUNT_STORAGE_QUOTA_EXCEEDED')throw e;blocked=true;}if(!blocked)throw Error('SMOKE_QUOTA_NOT_ENFORCED');
  for(const x of reservations)await rpc('usage_upload_action',{candidate_upload:x.upload_id,candidate_owner:owner,candidate_action:'cancel'});
  const filePath=join(dir,'fixture.webm');await writeFile(filePath,new Uint8Array([0x1a,0x45,0xdf,0xa3]));
  // Four disposable bytes test upload/accounting, not video encoding/registration.
  await uploadGatewayFile({backend,bucket:'intro-media',path,filePath,mime:'video/webm',fetchImpl});stored=true;
  const response=await fetchImpl(`${backend.url}/storage/v1/object/authenticated/intro-media/${path}`,{headers:backend.headers(null)});if(!response.ok||(await response.arrayBuffer()).byteLength!==4)throw Error('SMOKE_STORED_BYTES_MISMATCH');
  await deleteGatewayObject(backend,'intro-media',path,fetchImpl);stored=false;
  const gone=await fetchImpl(`${backend.url}/storage/v1/object/authenticated/intro-media/${path}`,{headers:backend.headers(null)});if(gone.ok)throw Error('SMOKE_DELETE_FAILED');
  return {testing:true,fixtureOwner:owner,quotaEnforced:true,derivativeUpload:true,retainedBytesVerified:true,cleanupVerified:true};
 }finally{
  if(stored)await deleteGatewayObject(backend,'intro-media',path,fetchImpl);
  for(const x of reservations)try{await rpc('usage_upload_action',{candidate_upload:x.upload_id,candidate_owner:owner,candidate_action:'cancel'});}catch{/* Preserve original failure. */}
  await rm(dir,{recursive:true,force:true});
 }
}
