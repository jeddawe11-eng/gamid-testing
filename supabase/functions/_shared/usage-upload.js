// TESTING-only supported Storage API broker. No signed URLs or credentials leave it.
export const USAGE_CHUNK_BYTES = 6 * 1024 * 1024;
const BASE = 'https://upvtrczefcvigxdyuylw.supabase.co';
const TUS = 'https://upvtrczefcvigxdyuylw.storage.supabase.co/storage/v1/upload/resumable';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINS = ['https://gamid-testing-static.gamid.workers.dev','https://jeddawe11-eng.github.io'];
const USER_BUCKETS = ['avatars','wall-media','wall-video','intro-sources'];
const OUTPUT_BUCKETS = ['intro-media','wall-video-derived'];
export function uploadMetadata(text) {
 const out = {};
 for(const part of (text||'').split(',')) {
  const match=/^([A-Za-z]+) ([A-Za-z0-9+/=]+)$/.exec(part.trim());
  if(!match || Object.hasOwn(out,match[1])) throw Error('INVALID_UPLOAD_METADATA');
  out[match[1]]=atob(match[2]);
 }
 return out;
}
// Classic Profile Banner (DEC-0005): avatars/<uid>/banner/<uuid>.jpg. Only a direct POST is accepted, of a JPEG that the injected trusted decoder (jpeg-js,
// supplied by the Edge Function) fully decodes as exactly 1920x320 within bounded memory; the gateway then stores its OWN re-encoded baseline JPEG, so no
// metadata, trailing data or other payload survives. Anything else is refused before any quota is reserved. Avatar paths never match and are unchanged.
export const BANNER = Object.freeze({width:1920,height:320,quality:85,maxBytes:5*1024*1024});
const BANNER_PATH=/^[0-9a-f-]{36}\/banner\/[0-9a-f-]{36}\.jpg$/;
export const isBannerPath=(bucket,path)=>bucket==='avatars' && String(path).split('/')[1]==='banner';
// The frame size of a baseline / progressive JPEG, read from its SOF segment (bounds-checked) before anything is decoded.
export function jpegFrameSize(b) {
 if(b.length<4 || b[0]!==0xff || b[1]!==0xd8 || b[2]!==0xff) return null;
 let i=2;
 while(i+4<=b.length) {
  if(b[i]!==0xff) return null;
  const marker=b[i+1]; if(marker===0xff){i++;continue;}
  if(marker===0xd9 || marker===0xda) return null;   // EOI / start of scan before any frame header
  const length=(b[i+2]<<8)|b[i+3]; if(length<2 || i+2+length>b.length) return null;
  if(marker>=0xc0 && marker<=0xcf && ![0xc4,0xc8,0xcc].includes(marker)) {
   if(length<8) return null;
   return {height:(b[i+5]<<8)|b[i+6], width:(b[i+7]<<8)|b[i+8]};
  }
  i+=2+length;
 }
 return null;
}
// -> the bytes to store. Throws INVALID_BANNER_TYPE / INVALID_BANNER_SIZE / INVALID_BANNER / BANNER_DECODER_UNAVAILABLE.
export function processBanner(bytes,mime,jpeg) {
 if(!jpeg || typeof jpeg.decode!=='function' || typeof jpeg.encode!=='function') throw Error('BANNER_DECODER_UNAVAILABLE');
 if(mime!=='image/jpeg') throw Error('INVALID_BANNER_TYPE');
 if(!(bytes instanceof Uint8Array) || bytes.length<4 || bytes.length>BANNER.maxBytes) throw Error('INVALID_BANNER');
 const frame=jpegFrameSize(bytes);
 if(!frame) throw Error('INVALID_BANNER_TYPE');
 if(frame.width!==BANNER.width || frame.height!==BANNER.height) throw Error('INVALID_BANNER_SIZE');
 if(bytes[bytes.length-2]!==0xff || bytes[bytes.length-1]!==0xd9) throw Error('INVALID_BANNER');   // truncated (no end-of-image marker)
 let image;
 try { image=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:1,maxMemoryUsageInMB:32}); }
 catch { throw Error('INVALID_BANNER'); }
 if(!image || image.width!==BANNER.width || image.height!==BANNER.height || image.data?.length!==BANNER.width*BANNER.height*4) throw Error('INVALID_BANNER');
 let out;
 try { out=jpeg.encode({data:image.data,width:image.width,height:image.height},BANNER.quality)?.data; }
 catch { throw Error('INVALID_BANNER'); }
 if(!out || out.length<4 || out[0]!==0xff || out[1]!==0xd8 || out.length>BANNER.maxBytes) throw Error('INVALID_BANNER');
 return new Uint8Array(out);
}
export async function boundedBody(request, max=USAGE_CHUNK_BYTES) {
 const reader=request.body?.getReader(); if(!reader) return new Uint8Array();
 const chunks=[]; let size=0;
 while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length;
  if(size>max) {await reader.cancel(); throw Error('CHUNK_TOO_LARGE');} chunks.push(value);
 }
 const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;} return bytes;
}
export function safeUpstream(value) {
 const url=new URL(value,TUS); const base=new URL(TUS);
 if(url.origin!==base.origin || !url.pathname.startsWith(base.pathname+'/') || url.username || url.password || url.search || url.hash) throw Error('INVALID_UPLOAD_LOCATION');
 return url.href;
}
export async function handleUsageUpload({request,env,fetchImpl=fetch,log=()=>{},jpeg=null}) {
 const rawFetch=fetchImpl;
 fetchImpl=(url,options={})=>rawFetch(url,{...options,signal:AbortSignal.timeout(90000)});
 const origin=request.headers.get('origin');
 const cors={'Access-Control-Allow-Origin':ORIGINS.includes(origin)?origin:ORIGINS[0],Vary:'Origin',
  'Access-Control-Allow-Methods':'POST,PATCH,HEAD,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,tus-resumable,upload-length,upload-metadata,upload-offset,x-upsert',
  'Access-Control-Expose-Headers':'Location,Upload-Offset,Upload-Length,Tus-Resumable'};
 const respond=(body,status=200,headers={})=>new Response(body==null?null:JSON.stringify(body),{status,headers:{...cors,...headers,...(body==null?{}:{'Content-Type':'application/json'})}});
 if(origin && !ORIGINS.includes(origin)) return respond({error:'ORIGIN_NOT_ALLOWED'},403);
 if(request.method==='OPTIONS') return respond(null,204);
 if(env?.supabaseUrl!==BASE || !env.serviceKey || !env.anonKey) return respond({error:'TESTING_GATEWAY_NOT_CONFIGURED'},503);
 const service={apikey:env.serviceKey,Authorization:`Bearer ${env.serviceKey}`};
 const rpc=async(name,body)=>{
  const r=await fetchImpl(`${BASE}/rest/v1/rpc/${name}`,{method:'POST',headers:{...service,'Content-Type':'application/json'},body:JSON.stringify(body)});
  // PostgREST returns 204 for void RPCs (for example signal_usage_changed).
  const data=r.status===204?null:await r.json(); if(!r.ok) throw Error(data?.message||'GATEWAY_DATABASE_ERROR'); return data;
 };
 const encodePath=p=>p.split('/').map(encodeURIComponent).join('/');
 const remove=async(b,p)=>{
  const r=await fetchImpl(`${BASE}/storage/v1/object/${b}/${encodePath(p)}`,{method:'DELETE',headers:service});
  if(!r.ok && r.status!==404) throw Error('STORAGE_DELETE_FAILED');
 };
 let uid=null,worker=false;
 try {
  // Backend workers may use either legacy service JWTs or sb_secret_ API keys.
  // Prove service privileges with a service-only RPC, never JWT payload decoding.
  const credential=request.headers.get('apikey');
  if(credential && credential!==env.anonKey) {
   const probe=await fetchImpl(`${BASE}/rest/v1/rpc/usage_gateway_probe`,{method:'POST',headers:{apikey:credential,...(request.headers.get('authorization')?{Authorization:request.headers.get('authorization')}:{}),'Content-Type':'application/json'},body:'{}'});
   worker=probe.ok && (await probe.json())===true;
  }
  if(!worker) {
   const auth=request.headers.get('authorization'); if(!/^Bearer [A-Za-z0-9._~+/=-]+$/.test(auth||'')) return respond({error:'AUTH_REQUIRED'},401);
   const user=await fetchImpl(`${BASE}/auth/v1/user`,{headers:{apikey:env.anonKey,Authorization:auth}});
   if(user.ok) uid=(await user.json())?.id;
   if(!UUID.test(uid||'')) return respond({error:'AUTH_REQUIRED'},401);
  }
  const url=new URL(request.url); const route=url.pathname.split('/usage-upload/')[1]||'';
  const objectRoute=/^object\/([a-z-]+)\/(.+)$/.exec(route);
  const id=/^tus\/([0-9a-f-]{36})$/.exec(route)?.[1];
  const action=(i,u,a,v=null)=>rpc('usage_upload_action',{candidate_upload:i,candidate_owner:u,candidate_action:a,candidate_value:v});
  const validate=(bucket,path)=>{
   const owner=path.split('/')[0]; if(!UUID.test(owner)||path.length>500||path.includes('..')||/[^a-zA-Z0-9_./-]/.test(path)) throw Error('INVALID_UPLOAD_PATH');
   if(!worker && owner!==uid) throw Error('UPLOAD_NOT_OWNED');
   if(!(request.method==='DELETE'?[...USER_BUCKETS,...OUTPUT_BUCKETS]:worker?OUTPUT_BUCKETS:USER_BUCKETS).includes(bucket)) throw Error('INVALID_UPLOAD_BUCKET');
   return owner;
  };
  const signal=u=>rpc('signal_usage_changed',{candidate_owner:u});
  if(route==='cleanup' && request.method==='POST') {
   if(worker) return respond({error:'OWNER_CLEANUP_ONLY'},400);
   const rows=await rpc('usage_cleanup_candidates',{candidate_owner:uid}); let cleaned=0;
   for(const x of rows) {
    if(x.upstream_url) {
     const remote=await fetchImpl(safeUpstream(x.upstream_url),{method:'HEAD',headers:{...service,'Tus-Resumable':'1.0.0'}});
     if(remote.status!==404 && remote.status!==410) continue;
    }
    try {await action(x.upload_id,uid,'complete');} catch(error) {
     if(error.message!=='UPLOAD_SIZE_MISMATCH') throw error;
     await action(x.upload_id,uid,'cancel');
    }
    cleaned++;
   }
   if(cleaned) await signal(uid); return respond({cleaned});
  }
  if(objectRoute) {
   const [,bucket,rawPath]=objectRoute; const path=decodeURIComponent(rawPath); const owner=validate(bucket,path);
   const banner=isBannerPath(bucket,path);
   if(banner && !BANNER_PATH.test(path)) throw Error('INVALID_UPLOAD_PATH');
   if(request.method==='DELETE') {await rpc('authorize_usage_delete',{candidate_owner:owner,candidate_bucket:bucket,candidate_path:path});if(banner)await rpc('authorize_banner_delete',{candidate_owner:owner,candidate_path:path});await remove(bucket,path);await signal(owner);return respond({deleted:true});}
   if(request.method!=='POST' || !['avatars','wall-media'].includes(bucket)) return respond({error:'USE_RESUMABLE_UPLOAD'},400);
   let bytes=await boundedBody(request,banner?BANNER.maxBytes:USAGE_CHUNK_BYTES); let mime=request.headers.get('content-type')?.split(';')[0];
   // the stored Banner is the gateway's own re-encoded JPEG; its length is what gets reserved and checked on completion
   if(banner) {bytes=processBanner(bytes,mime,jpeg);mime='image/jpeg';}
   const x=await rpc('reserve_usage_upload',{candidate_owner:owner,candidate_bucket:bucket,candidate_path:path,candidate_bytes:bytes.length,candidate_mime:mime});
   if(x.state==='COMPLETE') return respond({path});
   if(Date.now()-Date.parse(x.created_at)>24*60*60*1000)throw Error('UPLOAD_EXPIRED');
   // Recover a committed upload whose final response/receipt update was lost.
   try{await action(x.upload_id,owner,'complete');await signal(owner);return respond({path});}catch(error){if(error.message!=='UPLOAD_SIZE_MISMATCH')throw error;}
   const r=await fetchImpl(`${BASE}/storage/v1/object/${bucket}/${encodePath(path)}`,{method:'POST',headers:{...service,'Content-Type':mime,'x-upsert':'false'},body:bytes});
   if(!r.ok) return respond({error:'STORAGE_UPLOAD_FAILED'},502); // another same-path request may still be writing
   await action(x.upload_id,owner,'complete'); await signal(owner); return respond({path});
  }
  if(route==='tus' && request.method==='POST') {
   const md=uploadMetadata(request.headers.get('upload-metadata')); const owner=validate(md.bucketName,md.objectName||'');
   if(isBannerPath(md.bucketName,md.objectName||'')) throw Error('BANNER_REQUIRES_DIRECT_UPLOAD');
   const length=Number(request.headers.get('upload-length')); if(!Number.isSafeInteger(length)||length<1) throw Error('INVALID_UPLOAD_LENGTH');
   // Edge proxies may represent Content-Length: 0 as an empty body stream.
   // Reject actual inline data, not the presence of that stream.
   if(request.headers.has('upload-defer-length') || (await boundedBody(request,USAGE_CHUNK_BYTES)).length) throw Error('INVALID_UPLOAD_CREATION');
   const x=await rpc('reserve_usage_upload',{candidate_owner:owner,candidate_bucket:md.bucketName,candidate_path:md.objectName,candidate_bytes:length,candidate_mime:md.contentType});
   if(x.state!=='COMPLETE' && Date.now()-Date.parse(x.created_at)>24*60*60*1000)throw Error('UPLOAD_EXPIRED');
   let upstream=x.upstream_url;
   if(!upstream && x.state!=='COMPLETE') {
    const metadata=[['bucketName',md.bucketName],['objectName',md.objectName],['contentType',md.contentType],['cacheControl','3600']].map(([k,v])=>`${k} ${btoa(v)}`).join(',');
    const created=await fetchImpl(TUS,{method:'POST',headers:{...service,'Tus-Resumable':'1.0.0','Upload-Length':String(length),'Upload-Metadata':metadata,'x-upsert':'false'}});
    if(!created.ok) return respond({error:'RESUMABLE_CREATE_FAILED'},502);
    upstream=safeUpstream(created.headers.get('location')); await action(x.upload_id,owner,'bind',upstream);
   }
   // Edge's internal request URL can omit /functions/v1. Return the fixed
   // public TESTING route, never an internal or caller-controlled origin.
   const location=`${BASE}/functions/v1/usage-upload/tus/${x.upload_id}`;
   await signal(owner); return respond(null,201,{Location:location,'Tus-Resumable':'1.0.0','Upload-Offset':x.state==='COMPLETE'?String(length):'0','Upload-Length':String(length)});
  }
  if(id && ['HEAD','PATCH','DELETE'].includes(request.method)) {
   // Backend owner is recovered from the private receipt, never inferred from id.
   let owner=uid;
   if(worker) owner=await rpc('usage_upload_owner',{candidate_upload:id});
   const x=await action(id,owner,'get');
   if(x.state==='CANCELLED') return respond({error:'UPLOAD_CANCELLED'},410);
   if(x.state==='COMPLETE' && request.method==='HEAD') return respond(null,200,{'Upload-Offset':String(x.expected_bytes),'Upload-Length':String(x.expected_bytes),'Tus-Resumable':'1.0.0'});
   if(x.state==='COMPLETE') return respond({error:'UPLOAD_COMPLETE'},409);
   if(request.method==='PATCH' && Date.now()-Date.parse(x.created_at)>24*60*60*1000)throw Error('UPLOAD_EXPIRED');
   const remote=safeUpstream(x.upstream_url); const headers={...service,'Tus-Resumable':'1.0.0'}; let body;
   if(request.method==='PATCH') {
    const offset=Number(request.headers.get('upload-offset'));
    body=await boundedBody(request); if(!Number.isSafeInteger(offset)||offset<0||!body.length||offset+body.length>x.expected_bytes) throw Error('UPLOAD_LENGTH_EXCEEDED');
    Object.assign(headers,{'Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'});
   }
   const r=await fetchImpl(remote,{method:request.method,headers,body});
   if(request.method==='DELETE' && (r.ok || [404,410].includes(r.status))) {
    // Completed uploads cannot be terminated; never delete their retained object here.
    try {await action(id,owner,'cancel');} catch(error) {if(error.message==='UPLOAD_STILL_STORED') await action(id,owner,'complete');else throw error;}
    await signal(owner); return respond(null,204);
   }
   const offset=r.headers.get('upload-offset');
   if(r.ok && Number(offset)===x.expected_bytes) {await action(id,owner,'complete');await signal(owner);}
   return respond(null,r.status,{'Tus-Resumable':'1.0.0',...(offset==null?{}:{'Upload-Offset':offset}),'Upload-Length':String(x.expected_bytes)});
  }
  return respond({error:'NOT_FOUND'},404);
 } catch(error) {
  const code=String(error.message);
  // Diagnostic codes only: never URLs, private paths, credentials or bodies.
  log(['INVALID_UPLOAD_LOCATION','UPLOAD_SIZE_MISMATCH','UPLOAD_NOT_OWNED','UPLOAD_CONFLICT','INVALID_UPLOAD_CREATION','ACCOUNT_STORAGE_QUOTA_EXCEEDED'].includes(code)?code:'UPLOAD_GATEWAY_FAILED');
  const allowed=['INVALID_BANNER','INVALID_BANNER_TYPE','INVALID_BANNER_SIZE','BANNER_REQUIRES_DIRECT_UPLOAD','BANNER_IN_USE','BANNER_DECODER_UNAVAILABLE','ACCOUNT_STORAGE_QUOTA_EXCEEDED','INVALID_UPLOAD','INVALID_UPLOAD_PATH','INVALID_UPLOAD_BUCKET','INVALID_UPLOAD_LENGTH','INVALID_UPLOAD_METADATA','INVALID_UPLOAD_CREATION','UPLOAD_NOT_OWNED','UPLOAD_CONFLICT','UPLOAD_LENGTH_EXCEEDED','CHUNK_TOO_LARGE','OBJECT_ALREADY_EXISTS','UPLOAD_EXPIRED','INTRO_PROCESSING_IN_PROGRESS'];
  return respond({error:allowed.includes(code)?code:'UPLOAD_GATEWAY_FAILED'},code==='ACCOUNT_STORAGE_QUOTA_EXCEEDED'||code==='CHUNK_TOO_LARGE'?413:code==='UPLOAD_NOT_OWNED'?403:allowed.includes(code)?400:502);
 }
}
