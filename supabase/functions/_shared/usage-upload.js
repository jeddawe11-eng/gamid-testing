// TESTING-only supported Storage API broker. No signed URLs or credentials leave it.
export const USAGE_CHUNK_BYTES = 6 * 1024 * 1024;
const BASE = 'https://upvtrczefcvigxdyuylw.supabase.co';
const TUS = 'https://upvtrczefcvigxdyuylw.storage.supabase.co/storage/v1/upload/resumable';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINS = ['https://gamid-testing-static.gamid.workers.dev','https://jeddawe11-eng.github.io'];
const USER_BUCKETS = ['avatars','wall-media','wall-video','intro-sources','wall-fonts'];
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
// metadata, trailing data or other payload survives. Anything else is refused before any quota is reserved.
export const BANNER = Object.freeze({width:1920,height:320,quality:85,maxBytes:5*1024*1024});
const BANNER_PATH=/^[0-9a-f-]{36}\/banner\/[0-9a-f-]{36}\.jpg$/;
export const isBannerPath=(bucket,path)=>bucket==='avatars' && String(path).split('/')[1]==='banner';
// Avatar (ISS-0007): avatars/<uid>/avatar-<uuid>.jpg, the square JPEG the Profile Editor's cropper exports. The same trusted path as the Banner: the declared
// type and the real content must both be JPEG, the frame is read and bounded before decoding, the whole image must decode strictly, and the gateway stores its
// OWN re-encoded baseline JPEG. Direct POST only (the resumable route refuses the avatars bucket). Existing Avatar objects are never touched.
export const AVATAR = Object.freeze({minSide:16,maxSide:1024,quality:90,maxBytes:5*1024*1024});
const AVATAR_PATH=/^[0-9a-f-]{36}\/avatar-[0-9a-f-]{36}\.jpg$/;
export const isAvatarPath=(bucket,path)=>bucket==='avatars' && !isBannerPath(bucket,path);
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
// The strict decode / re-encode both image kinds share: `fits` bounds the frame before anything is decoded; `kind` names the error codes (INVALID_<KIND>_TYPE,
// INVALID_<KIND>_SIZE, INVALID_<KIND>, <KIND>_DECODER_UNAVAILABLE). -> the gateway's own JPEG bytes.
function reencodeJpeg(bytes,mime,jpeg,{kind,maxBytes,quality,maxResolutionInMP,fits}) {
 if(!jpeg || typeof jpeg.decode!=='function' || typeof jpeg.encode!=='function') throw Error(`${kind}_DECODER_UNAVAILABLE`);
 if(mime!=='image/jpeg') throw Error(`INVALID_${kind}_TYPE`);
 if(!(bytes instanceof Uint8Array) || bytes.length<4 || bytes.length>maxBytes) throw Error(`INVALID_${kind}`);
 const frame=jpegFrameSize(bytes);
 if(!frame) throw Error(`INVALID_${kind}_TYPE`);
 if(!fits(frame)) throw Error(`INVALID_${kind}_SIZE`);
 if(bytes[bytes.length-2]!==0xff || bytes[bytes.length-1]!==0xd9) throw Error(`INVALID_${kind}`);   // truncated (no end-of-image marker)
 let image;
 try { image=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP,maxMemoryUsageInMB:32}); }
 catch { throw Error(`INVALID_${kind}`); }
 if(!image || image.width!==frame.width || image.height!==frame.height || image.data?.length!==frame.width*frame.height*4) throw Error(`INVALID_${kind}`);
 let out;
 try { out=jpeg.encode({data:image.data,width:image.width,height:image.height},quality)?.data; }
 catch { throw Error(`INVALID_${kind}`); }
 if(!out || out.length<4 || out[0]!==0xff || out[1]!==0xd8 || out.length>maxBytes) throw Error(`INVALID_${kind}`);
 return new Uint8Array(out);
}
// -> the bytes to store. Throws INVALID_BANNER_TYPE / INVALID_BANNER_SIZE / INVALID_BANNER / BANNER_DECODER_UNAVAILABLE.
export const processBanner=(bytes,mime,jpeg)=>reencodeJpeg(bytes,mime,jpeg,{kind:'BANNER',maxBytes:BANNER.maxBytes,quality:BANNER.quality,maxResolutionInMP:1,
 fits:f=>f.width===BANNER.width && f.height===BANNER.height});
// -> the bytes to store: a square 16-1024 px JPEG. Throws INVALID_AVATAR_TYPE / INVALID_AVATAR_SIZE / INVALID_AVATAR / AVATAR_DECODER_UNAVAILABLE.
export const processAvatar=(bytes,mime,jpeg)=>reencodeJpeg(bytes,mime,jpeg,{kind:'AVATAR',maxBytes:AVATAR.maxBytes,quality:AVATAR.quality,maxResolutionInMP:1.1,
 fits:f=>f.width===f.height && f.width>=AVATAR.minSide && f.width<=AVATAR.maxSide});
// Custom Wall fonts (2026-10-18): wall-fonts/<uid>/fonts/<sha256>.woff2. Direct POST only, at most 2 MiB, never trusted by name or declared type: the body must be
// a structurally valid WOFF2 (validateWoff2) and its SHA-256, computed here, must be the file name (so one font is one object per account). The gateway then
// reserves quota (the database also enforces the 3-font limit there), stores, completes and registers it (register_wall_font); if registration is refused, the
// object it just stored is removed again. Browsers additionally sanitize every web font (OTS) before using it.
export const FONT = Object.freeze({maxBytes:2*1024*1024,maxSfntBytes:16*1024*1024,maxTables:64,mime:'font/woff2'});
const FONT_PATH=/^[0-9a-f-]{36}\/fonts\/[0-9a-f]{64}\.woff2$/;
export const isFontPath=(bucket,path)=>bucket==='wall-fonts' && FONT_PATH.test(String(path));
// The 63 known table tags of the WOFF2 table directory (W3C WOFF2 5.1, Table 1), by index.
const WOFF2_TAGS=['cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX',
 'vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL','SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx',
 'fvar','gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill'];
const FONT_REQUIRED=['cmap','head','hhea','hmtx','maxp','name','OS/2','post'];
// -> {flavor, numTables, tags}. Throws INVALID_FONT_TYPE (not a WOFF2 at all, or a font collection) / FONT_TOO_LARGE / INVALID_FONT (any structural fault).
export function validateWoff2(bytes) {
 if(!(bytes instanceof Uint8Array)) throw Error('INVALID_FONT');
 if(bytes.length>FONT.maxBytes) throw Error('FONT_TOO_LARGE');
 if(bytes.length<48) throw Error('INVALID_FONT_TYPE');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const u32=o=>view.getUint32(o),u16=o=>view.getUint16(o);
 if(u32(0)!==0x774f4632) throw Error('INVALID_FONT_TYPE');                                   // 'wOF2'
 const flavor=u32(4);
 if(flavor===0x74746366) throw Error('INVALID_FONT_TYPE');                                   // 'ttcf': collections are not supported
 if(![0x00010000,0x4f54544f,0x74727565].includes(flavor)) throw Error('INVALID_FONT');      // TrueType, 'OTTO' (CFF), 'true'
 if(u32(8)!==bytes.length) throw Error('INVALID_FONT');                                      // declared length is the real length: nothing hidden after it
 const numTables=u16(12);
 if(numTables<1 || numTables>FONT.maxTables || u16(14)!==0) throw Error('INVALID_FONT');
 const totalSfntSize=u32(16), totalCompressedSize=u32(20);
 if(totalSfntSize<12+16*numTables || totalSfntSize>FONT.maxSfntBytes || totalCompressedSize<1) throw Error('INVALID_FONT');
 const [metaOffset,metaLength,metaOrigLength,privOffset,privLength]=[u32(28),u32(32),u32(36),u32(40),u32(44)];
 let at=48;
 const base128=()=>{                                                                         // UIntBase128: at most 5 bytes, no leading zeros, no overflow
  let value=0;
  for(let i=0;i<5;i++) {
   if(at>=bytes.length) throw Error('INVALID_FONT');
   const b=bytes[at++];
   if(i===0 && b===0x80) throw Error('INVALID_FONT');
   if(value & 0xfe000000) throw Error('INVALID_FONT');
   value=(value*128)+(b & 0x7f);
   if(!(b & 0x80)) return value;
  }
  throw Error('INVALID_FONT');
 };
 const tags=new Set(); let sfntTables=12+16*numTables;
 for(let t=0;t<numTables;t++) {
  if(at>=bytes.length) throw Error('INVALID_FONT');
  const flags=bytes[at++]; const index=flags & 0x3f, version=flags>>6;
  let tag;
  if(index===63) {
   if(at+4>bytes.length) throw Error('INVALID_FONT');
   const raw=bytes.subarray(at,at+4); at+=4;
   if(![...raw].every(c=>c>=0x20 && c<=0x7e)) throw Error('INVALID_FONT');
   tag=String.fromCharCode(...raw);
  } else tag=WOFF2_TAGS[index];
  if(tags.has(tag)) throw Error('INVALID_FONT');
  tags.add(tag);
  const origLength=base128();
  const transformed=(tag==='glyf'||tag==='loca')?version===0:version!==0;
  const transformLength=transformed?base128():origLength;
  if(tag==='loca' && transformed && transformLength!==0) throw Error('INVALID_FONT');      // a transformed loca has no stored data
  if(origLength>FONT.maxSfntBytes || transformLength>FONT.maxSfntBytes) throw Error('INVALID_FONT');
  sfntTables+=Math.ceil(origLength/4)*4;
 }
 if(sfntTables>totalSfntSize+4*numTables) throw Error('INVALID_FONT');                      // the tables cannot exceed the declared uncompressed font
 const dataEnd=at+totalCompressedSize;
 if(dataEnd>bytes.length) throw Error('INVALID_FONT');
 const block=(offset,length,orig)=>{
  if(!length && !offset && !orig) return;
  if(!length || offset<dataEnd || offset%4!==0 || offset+length>bytes.length || length>65536) throw Error('INVALID_FONT');
 };
 block(metaOffset,metaLength,metaOrigLength); block(privOffset,privLength,0);
 if(metaLength && privLength && privOffset<metaOffset+metaLength) throw Error('INVALID_FONT');
 for(const tag of FONT_REQUIRED) if(!tags.has(tag)) throw Error('INVALID_FONT');
 const truetype=tags.has('glyf')||tags.has('loca');
 if(truetype && !(tags.has('glyf') && tags.has('loca'))) throw Error('INVALID_FONT');
 if(!truetype && !tags.has('CFF ') && !tags.has('CFF2')) throw Error('INVALID_FONT');
 return {flavor,numTables,tags:[...tags]};
}
export async function sha256Hex(bytes) {
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 return [...digest].map(b=>b.toString(16).padStart(2,'0')).join('');
}
// the display name the owner gave (sent URI-encoded); the database strips control characters and keeps 60 characters
export function fontDisplayName(header) {
 if(typeof header!=='string' || !header || header.length>600) return '';
 try { return decodeURIComponent(header).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200); } catch { return ''; }   // no control characters (Postgres text cannot hold NUL)
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
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,tus-resumable,upload-length,upload-metadata,upload-offset,x-upsert,x-gamid-font-name,x-gamid-font-license',
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
  // Custom Wall font: validated and hashed BEFORE any quota is reserved; reserve (quota + the 3-font limit, transactional in the database) -> store -> complete ->
  // register. An identical font (same SHA-256 -> same path) is never stored twice and never takes another slot. A refused registration removes what was stored.
  const uploadFont=async(owner,path)=>{
   if(!isFontPath('wall-fonts',path)) throw Error('INVALID_UPLOAD_PATH');
   if(request.headers.get('content-type')?.split(';')[0]!==FONT.mime) throw Error('INVALID_FONT_TYPE');
   if(request.headers.get('x-gamid-font-license')!=='accepted') throw Error('WALL_FONT_LICENSE_REQUIRED');
   let bytes;
   try { bytes=await boundedBody(request,FONT.maxBytes); } catch(error) { throw Error(error.message==='CHUNK_TOO_LARGE'?'FONT_TOO_LARGE':error.message); }
   validateWoff2(bytes);
   const sha=await sha256Hex(bytes);
   if(path!==`${owner}/fonts/${sha}.woff2`) throw Error('FONT_HASH_MISMATCH');
   const x=await rpc('reserve_usage_upload',{candidate_owner:owner,candidate_bucket:'wall-fonts',candidate_path:path,candidate_bytes:bytes.length,candidate_mime:FONT.mime});
   let stored=false;
   if(x.state!=='COMPLETE') {
    if(Date.now()-Date.parse(x.created_at)>24*60*60*1000) throw Error('UPLOAD_EXPIRED');
    const commit=async()=>{ try { await action(x.upload_id,owner,'complete'); return true; } catch(error) { if(error.message!=='UPLOAD_SIZE_MISMATCH') throw error; return false; } };
    if(!(await commit())) {
     const r=await fetchImpl(`${BASE}/storage/v1/object/wall-fonts/${encodePath(path)}`,{method:'POST',headers:{...service,'Content-Type':FONT.mime,'x-upsert':'false'},body:bytes});
     if(r.ok) { stored=true; await action(x.upload_id,owner,'complete'); }
     else if(!(await commit())) {            // not stored by a concurrent identical request either: release this reservation
      try { await action(x.upload_id,owner,'cancel'); } catch { /* kept for the owner reconciliation */ }
      await signal(owner); throw Error('STORAGE_UPLOAD_FAILED');
     }
    }
   }
   let font;
   try {
    font=await rpc('register_wall_font',{candidate_owner:owner,candidate_path:path,candidate_sha256:sha,candidate_name:fontDisplayName(request.headers.get('x-gamid-font-name')),candidate_license:true});
   } catch(error) {
    if(stored) { try { await rpc('authorize_usage_delete',{candidate_owner:owner,candidate_bucket:'wall-fonts',candidate_path:path}); await remove('wall-fonts',path); } catch { /* removed by the owner's cleanup after an hour */ } }
    await signal(owner); throw error;
   }
   await signal(owner); return {font};
  };
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
   // ISS-0011: the owner's own Intro files that are due (a removed Intro's derivative, a failed source after its retention, a used source) are deleted here
   // too, so they no longer wait for the worker's next run, which only a new Intro starts. Same protections as every gateway delete.
   let intro=0;
   for(const j of (await rpc('usage_intro_cleanup_candidates',{candidate_owner:uid}))||[]) {
    let sourceDeleted=false,derivativeDeleted=false;
    for(const [bucket,path] of [['intro-sources',j.source_path],['intro-media',j.derivative_path]]) {
     if(!path) continue;
     if(typeof path!=='string'||path.split('/')[0]!==uid||path.includes('..')) throw Error('UPLOAD_NOT_OWNED');
     await rpc('authorize_usage_delete',{candidate_owner:uid,candidate_bucket:bucket,candidate_path:path}); await remove(bucket,path);
     if(bucket==='intro-sources') sourceDeleted=true; else derivativeDeleted=true;
    }
    await rpc('worker_confirm_intro_cleanup',{candidate_job_id:j.job_id,candidate_source_deleted:sourceDeleted,candidate_derivative_deleted:derivativeDeleted});
    intro++;
   }
   // unregistered font objects older than an hour (a gateway stopped between storing and registering): deleted like any unregistered font
   let fonts=0;
   for(const path of (await rpc('usage_font_orphans',{candidate_owner:uid}))||[]) {
    if(typeof path!=='string'||!isFontPath('wall-fonts',path)||path.split('/')[0]!==uid) throw Error('UPLOAD_NOT_OWNED');
    await rpc('authorize_usage_delete',{candidate_owner:uid,candidate_bucket:'wall-fonts',candidate_path:path}); await remove('wall-fonts',path); fonts++;
   }
   if(cleaned||intro||fonts) await signal(uid); return respond({cleaned,intro,fonts});
  }
  if(objectRoute) {
   const [,bucket,rawPath]=objectRoute; const path=decodeURIComponent(rawPath); const owner=validate(bucket,path);
   const banner=isBannerPath(bucket,path),avatar=isAvatarPath(bucket,path);
   if(banner && !BANNER_PATH.test(path)) throw Error('INVALID_UPLOAD_PATH');
   if(request.method==='DELETE') {await rpc('authorize_usage_delete',{candidate_owner:owner,candidate_bucket:bucket,candidate_path:path});if(banner)await rpc('authorize_banner_delete',{candidate_owner:owner,candidate_path:path});await remove(bucket,path);await signal(owner);return respond({deleted:true});}
   if(request.method!=='POST' || !['avatars','wall-media','wall-fonts'].includes(bucket)) return respond({error:'USE_RESUMABLE_UPLOAD'},400);
   if(bucket==='wall-fonts') return respond(await uploadFont(owner,path),201);
   if(avatar && !AVATAR_PATH.test(path)) throw Error('INVALID_UPLOAD_PATH');   // new Avatars only; deleting an older one (any name) is unchanged
   let bytes=await boundedBody(request,banner?BANNER.maxBytes:avatar?AVATAR.maxBytes:USAGE_CHUNK_BYTES); let mime=request.headers.get('content-type')?.split(';')[0];
   // the stored Banner / Avatar is the gateway's own re-encoded JPEG; its length is what gets reserved and checked on completion
   if(banner) {bytes=processBanner(bytes,mime,jpeg);mime='image/jpeg';}
   if(avatar) {bytes=processAvatar(bytes,mime,jpeg);mime='image/jpeg';}
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
   if(md.bucketName==='avatars') throw Error('AVATAR_REQUIRES_DIRECT_UPLOAD');   // only the direct route validates image content
   if(md.bucketName==='wall-fonts') throw Error('FONT_REQUIRES_DIRECT_UPLOAD');   // only the direct route validates a font
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
    if(!created.ok) {
     // ISS-0011: Storage refused to start this upload, so no byte was stored and nothing can continue it. Release this attempt's own reservation
     // (the database releases it only while it is still unbound and has no object; a bound or stored receipt is never touched here).
     try{await action(x.upload_id,owner,'release_unbound');await signal(owner);}catch{/* kept for the owner reconciliation */}
     // ISS-0012: 413 = larger than Storage's effective upload limit (the project-wide file size limit), which can be below the bucket limit
     return created.status===413?respond({error:'UPLOAD_TOO_LARGE'},413):respond({error:'RESUMABLE_CREATE_FAILED'},502);
    }
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
   if(request.method==='PATCH' && x.bucket==='avatars') throw Error('AVATAR_REQUIRES_DIRECT_UPLOAD');   // a resumable Avatar upload can never be continued
   if(request.method==='PATCH' && x.bucket==='wall-fonts') throw Error('FONT_REQUIRES_DIRECT_UPLOAD');
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
  const allowed=['UPLOAD_TOO_LARGE','INVALID_BANNER','INVALID_BANNER_TYPE','INVALID_BANNER_SIZE','BANNER_REQUIRES_DIRECT_UPLOAD','BANNER_IN_USE','BANNER_DECODER_UNAVAILABLE',
   'INVALID_AVATAR','INVALID_AVATAR_TYPE','INVALID_AVATAR_SIZE','AVATAR_REQUIRES_DIRECT_UPLOAD','AVATAR_DECODER_UNAVAILABLE','ACCOUNT_STORAGE_QUOTA_EXCEEDED','INVALID_UPLOAD','INVALID_UPLOAD_PATH','INVALID_UPLOAD_BUCKET','INVALID_UPLOAD_LENGTH','INVALID_UPLOAD_METADATA','INVALID_UPLOAD_CREATION','UPLOAD_NOT_OWNED','UPLOAD_CONFLICT','UPLOAD_LENGTH_EXCEEDED','CHUNK_TOO_LARGE','OBJECT_ALREADY_EXISTS','UPLOAD_EXPIRED','INTRO_PROCESSING_IN_PROGRESS',
   'INVALID_FONT','INVALID_FONT_TYPE','FONT_TOO_LARGE','FONT_HASH_MISMATCH','FONT_REQUIRES_DIRECT_UPLOAD','WALL_FONT_LIMIT','WALL_FONT_LICENSE_REQUIRED','WALL_FONT_REGISTERED','WALL_FONT_UPLOAD_NOT_FOUND','IDENTITY_NOT_FOUND'];
  return respond({error:allowed.includes(code)?code:'UPLOAD_GATEWAY_FAILED'},code==='ACCOUNT_STORAGE_QUOTA_EXCEEDED'||code==='CHUNK_TOO_LARGE'||code==='FONT_TOO_LARGE'?413:code==='UPLOAD_NOT_OWNED'?403:code==='WALL_FONT_LIMIT'||code==='WALL_FONT_REGISTERED'?409:allowed.includes(code)?400:502);
 }
}
