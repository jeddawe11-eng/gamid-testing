// Classic Profile Banner in the usage-upload gateway (Phase 1B): only a direct POST of a JPEG that the trusted decoder (jpeg-js, the same pinned version the
// Edge Function imports) fully decodes as exactly 1920x320 is accepted, and what is stored is the gateway's own re-encoded JPEG. Every refusal happens before
// any quota is reserved or anything is written. Avatar uploads are untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import {handleUsageUpload,processBanner,jpegFrameSize,isBannerPath,BANNER} from '../supabase/functions/_shared/usage-upload.js';

const BASE='https://upvtrczefcvigxdyuylw.supabase.co';
const OWNER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',FILE='44444444-4444-4444-8444-444444444444';
const env={supabaseUrl:BASE,serviceKey:'private-service-fixture',anonKey:'publishable-fixture'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const picture=(width=1920,height=320,quality=92)=>{const data=new Uint8Array(width*height*4);for(let i=0;i<data.length;i+=4){const p=i/4;data[i]=p%width%256;data[i+1]=Math.floor(p/width)%256;data[i+2]=(p*7)%256;data[i+3]=255;}return new Uint8Array(jpeg.encode({data,width,height},quality).data);};
const VALID=picture();
// a camera-style APP1 (Exif) segment with a GPS-looking string, inserted right after SOI
const withExif=b=>{const payload=new TextEncoder().encode('Exif\0\0GPS 24.7136N 46.6753E secret-camera-serial');const seg=new Uint8Array(4+payload.length);seg.set([0xff,0xe1,((payload.length+2)>>8)&255,(payload.length+2)&255]);seg.set(payload,4);const out=new Uint8Array(b.length+seg.length);out.set(b.subarray(0,2));out.set(seg,2);out.set(b.subarray(2),2+seg.length);return out;};
const contains=(hay,needle)=>{const n=new TextEncoder().encode(needle);outer:for(let i=0;i+n.length<=hay.length;i++){for(let j=0;j<n.length;j++)if(hay[i+j]!==n[j])continue outer;return true;}return false;};

function fixture({user=OWNER,inUse=false}={}) {
 const calls=[];let stored=null;const x={upload_id:FILE,owner_id:OWNER,bucket:'avatars',path:'',expected_bytes:0,state:'ACTIVE',created_at:new Date().toISOString(),upstream_url:null};
 const fetchImpl=async(url,options={})=>{
  calls.push({url,...options});
  if(url.endsWith('/auth/v1/user'))return user?json({id:user}):json({},401);
  if(url.includes('/rpc/')){
   const name=url.split('/').at(-1),b=JSON.parse(options.body||'{}');
   if(name==='usage_gateway_probe')return json({},403);
   if(name==='reserve_usage_upload'){Object.assign(x,{bucket:b.candidate_bucket,path:b.candidate_path,expected_bytes:b.candidate_bytes,content_type:b.candidate_mime});return json(x);}
   if(name==='usage_upload_action'){if(b.candidate_action==='complete'){if(stored?.length!==x.expected_bytes)return json({message:'UPLOAD_SIZE_MISMATCH'},400);x.state='COMPLETE';}return json(x);}
   if(name==='authorize_banner_delete')return inUse?json({message:'BANNER_IN_USE'},400):new Response(null,{status:204});
   if(name==='authorize_usage_delete'||name==='signal_usage_changed')return new Response(null,{status:204});
   return json(null);
  }
  if(url.includes('/storage/v1/object/')){if(options.method==='POST')stored=new Uint8Array(options.body);return json({});}
  throw Error(`Unexpected fake request ${url}`);
 };
 const run=(route,method='POST',headers={},body,decoder=jpeg)=>handleUsageUpload({request:new Request(`${BASE}/functions/v1/usage-upload/${route}`,{method,headers:{apikey:env.anonKey,Authorization:'Bearer owner-fixture',...headers},...(body===undefined?{}:{body})}),env,fetchImpl,jpeg:decoder});
 const touched=()=>calls.some(c=>c.url.endsWith('/reserve_usage_upload')||c.url.includes('/storage/'));
 return {run,calls,x,touched,stored:()=>stored};
}
const bannerRoute=(owner=OWNER,name=`${FILE}.jpg`)=>`object/avatars/${owner}/banner/${name}`;
const errorOf=async r=>(await r.json()).error;

test('a valid 1920x320 JPEG is fully decoded and stored as the gateway\'s own re-encoded JPEG; the reserved bytes are exactly the stored bytes', async () => {
 const f=fixture();const r=await f.run(bannerRoute(),'POST',{'Content-Type':'image/jpeg'},VALID);
 assert.equal(r.status,200);assert.equal(f.x.state,'COMPLETE');
 const stored=f.stored();assert.ok(stored&&stored.length>0);assert.notDeepEqual(stored,VALID,'re-encoded, not the uploaded bytes');
 assert.deepEqual([stored[0],stored[1],stored.at(-2),stored.at(-1)],[0xff,0xd8,0xff,0xd9]);
 assert.deepEqual(jpegFrameSize(stored),{width:1920,height:320});
 const reserve=JSON.parse(f.calls.find(c=>c.url.endsWith('/reserve_usage_upload')).body);
 assert.equal(reserve.candidate_bytes,stored.length);assert.equal(reserve.candidate_mime,'image/jpeg');assert.equal(reserve.candidate_bucket,'avatars');
 const put=f.calls.find(c=>c.url.includes('/storage/v1/object/')&&c.method==='POST');assert.equal(put.headers['Content-Type'],'image/jpeg');
 assert.deepEqual(processBanner(VALID,'image/jpeg',jpeg),processBanner(VALID,'image/jpeg',jpeg),'deterministic, so a retried upload reserves the same length');
});

test('metadata never survives: an EXIF / GPS segment in the upload is not in the stored file', async () => {
 const dirty=withExif(VALID);assert.ok(contains(dirty,'GPS 24.7136N'));
 const f=fixture();assert.equal((await f.run(bannerRoute(),'POST',{'Content-Type':'image/jpeg'},dirty)).status,200);
 assert.ok(!contains(f.stored(),'Exif')&&!contains(f.stored(),'GPS')&&!contains(f.stored(),'secret-camera-serial'));
});

test('declared type vs real content, exact size, truncation, corruption and the 5 MiB limit are all refused before any reservation or write', async () => {
 const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52,0,0,7,128,0,0,1,64,8,6,0,0,0]);
 const corrupt=VALID.slice();for(let i=Math.floor(corrupt.length/2);i<Math.floor(corrupt.length/2)+64;i+=2){corrupt[i]=0xff;corrupt[i+1]=0x01;}
 const cases=[
  ['JPEG declared as PNG','image/png',VALID,400,'INVALID_BANNER_TYPE'],
  ['JPEG declared as WebP','image/webp',VALID,400,'INVALID_BANNER_TYPE'],
  ['PNG bytes declared as JPEG','image/jpeg',png,400,'INVALID_BANNER_TYPE'],
  ['HTML declared as JPEG','image/jpeg',new TextEncoder().encode('<html><script>alert(1)</script></html>'),400,'INVALID_BANNER_TYPE'],
  ['1920x321','image/jpeg',picture(1920,321),400,'INVALID_BANNER_SIZE'],
  ['1919x320','image/jpeg',picture(1919,320),400,'INVALID_BANNER_SIZE'],
  ['3840x640','image/jpeg',picture(3840,640,50),400,'INVALID_BANNER_SIZE'],
  ['truncated in the scan','image/jpeg',VALID.slice(0,Math.floor(VALID.length/2)),400,'INVALID_BANNER'],
  ['header only','image/jpeg',VALID.slice(0,700),400,'INVALID_BANNER'],
  ['corrupted scan with a valid end marker','image/jpeg',corrupt,400,'INVALID_BANNER'],
  ['empty','image/jpeg',new Uint8Array(0),400,'INVALID_BANNER'],
  ['over 5 MiB','image/jpeg',new Uint8Array(BANNER.maxBytes+1),413,'CHUNK_TOO_LARGE'],
 ];
 for(const [label,mime,body,status,code] of cases){
  const f=fixture();const r=await f.run(bannerRoute(),'POST',{'Content-Type':mime},body);
  assert.equal(r.status,status,label);assert.equal(await errorOf(r),code,label);assert.equal(f.touched(),false,`${label}: nothing reserved or stored`);
 }
});

test('fails closed without the trusted decoder; banner paths are strict; TUS and other owners are refused', async () => {
 let f=fixture();let r=await f.run(bannerRoute(),'POST',{'Content-Type':'image/jpeg'},VALID,null);
 assert.equal(await errorOf(r),'BANNER_DECODER_UNAVAILABLE');assert.equal(f.touched(),false,'no decoder: never stored unchecked');
 for(const name of [`${FILE}.webp`,`${FILE}.JPG`,`sub/${FILE}.jpg`,'banner.jpg',`${FILE}.jpg.html`]){
  f=fixture();r=await f.run(bannerRoute(OWNER,name),'POST',{'Content-Type':'image/jpeg'},VALID);
  assert.equal(r.status,400,name);assert.equal(await errorOf(r),'INVALID_UPLOAD_PATH',name);assert.equal(f.touched(),false);
 }
 f=fixture();r=await f.run(bannerRoute(OTHER),'POST',{'Content-Type':'image/jpeg'},VALID);assert.equal(r.status,403);assert.equal(f.touched(),false);
 const meta=[['bucketName','avatars'],['objectName',`${OWNER}/banner/${FILE}.jpg`],['contentType','image/jpeg']].map(([k,v])=>`${k} ${btoa(v)}`).join(',');
 f=fixture();r=await f.run('tus','POST',{'Upload-Length':String(VALID.length),'Upload-Metadata':meta});
 assert.equal(r.status,400);assert.equal(await errorOf(r),'BANNER_REQUIRES_DIRECT_UPLOAD');assert.equal(f.touched(),false);
 assert.equal(isBannerPath('avatars',`${OWNER}/avatar-${FILE}.webp`),false);assert.equal(isBannerPath('wall-media',`${OWNER}/banner/${FILE}.jpg`),false);
});

test('an attached Banner cannot be deleted through the gateway; a detached one can; Avatar deletes never ask', async () => {
 let f=fixture({inUse:true});let r=await f.run(bannerRoute(),'DELETE');
 assert.equal(r.status,400);assert.equal(await errorOf(r),'BANNER_IN_USE');assert.ok(!f.calls.some(c=>c.url.includes('/storage/v1/object/')&&c.method==='DELETE'),'nothing deleted');
 f=fixture();r=await f.run(bannerRoute(),'DELETE');assert.equal(r.status,200);assert.ok(f.calls.some(c=>c.url.includes('/storage/v1/object/avatars/')&&c.method==='DELETE'));
 f=fixture({inUse:true});r=await f.run(`object/avatars/${OWNER}/avatar-${FILE}.webp`,'DELETE');assert.equal(r.status,200);
 assert.ok(!f.calls.some(c=>c.url.endsWith('/authorize_banner_delete')),'the Avatar delete path is unchanged');
});

test('Avatar uploads are unchanged: same bytes stored, same reservation, the decoder is never consulted', async () => {
 let consulted=false;const spy={decode:()=>{consulted=true;throw Error('no');},encode:()=>{consulted=true;throw Error('no');}};
 const f=fixture();const bytes=new Uint8Array([1,2,3,4]);
 const r=await f.run(`object/avatars/${OWNER}/avatar-${FILE}.webp`,'POST',{'Content-Type':'image/webp'},bytes,spy);
 assert.equal(r.status,200);assert.deepEqual(f.stored(),bytes);assert.equal(JSON.parse(f.calls.find(c=>c.url.endsWith('/reserve_usage_upload')).body).candidate_bytes,4);assert.equal(consulted,false);
});

test('the Edge Function imports the pinned decoder and passes it to the gateway', async () => {
 const {readFileSync}=await import('node:fs');
 const entry=readFileSync(new URL('../supabase/functions/usage-upload/index.ts',import.meta.url),'utf8'),pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.match(entry,/import jpeg from 'npm:jpeg-js@0\.4\.4';/);assert.match(entry,/handleUsageUpload\(\{request,jpeg,/);
 assert.equal(pkg.devDependencies['jpeg-js'],'0.4.4','tests use the same version');
});
