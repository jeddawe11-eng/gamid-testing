import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createIntroSourceResolver, INTRO_LEASE_SECONDS } from "../dist/account/intro-source.js";
import { releaseIntroConsumers } from "../dist/account/intro-release.js";
const base="https://upvtrczefcvigxdyuylw.supabase.co";
const token=(path,at,seconds=120)=>base+"/storage/v1/object/sign/intro-media/"+path+"?token=x."+Buffer.from(JSON.stringify({iat:Math.floor(at/1000),exp:Math.floor(at/1000)+seconds})).toString("base64url")+".x";
function setup() {
 let at=1000000, actor="owner-a", state={key:"a|job",path:"a/job/intro-d3.webm"}, signs=0, reads=0, signer=null;
 const resolver=createIntroSourceResolver({baseUrl:base,now:()=>at,principal:()=>actor,current:async()=>{reads++;return state;},sign:async(p,s)=>{signs++;assert.equal(s,120);return signer?signer(p,s):token(p,at,s);}});
 return {resolver, get signs(){return signs;}, get reads(){return reads;}, time:v=>at=v, actor:v=>actor=v, state:v=>state=v, signer:v=>signer=v};
}
test("F5 revalidates before reuse; source stays memory-only and max lease is 120s",async()=>{
 const x=setup();const a=await x.resolver.resolve();const b=await x.resolver.resolve();
 assert.equal(a.url,b.url);assert.equal(x.signs,1);assert.equal(x.reads,3);assert.equal(a.expiresAt,1120000);assert.equal(INTRO_LEASE_SECONDS,120);
});
test("near expiry renews before the existing 30s Intro plus transition can exceed the lease",async()=>{
 const x=setup();const a=await x.resolver.resolve();x.time(1086000);const b=await x.resolver.resolve();assert.notEqual(a.url,b.url);assert.equal(x.signs,2);
 x.time(1250000);assert.equal(await x.resolver.isCurrent(),false);
});
test("replacement uses the current path; unpublishing does not reuse a prior capability",async()=>{
 const x=setup();const a=await x.resolver.resolve();x.state({key:"a|new",path:"a/new/intro-d3.webm"});assert.equal(await x.resolver.isCurrent(),false);const b=await x.resolver.resolve();assert.notEqual(a.url,b.url);x.state(null);assert.equal(await x.resolver.resolve(),null);
});
test("logout and account switch cannot return another user's cached Intro",async()=>{
 const x=setup();const a=await x.resolver.resolve();x.actor(null);assert.equal(await x.resolver.resolve(),null);
 x.actor("owner-b");x.state({key:"b|job",path:"b/job/intro-d3.webm"});const b=await x.resolver.resolve();assert.notEqual(a.url,b.url);
});
test("release invalidates an in-flight sign and cannot resurrect a closed Preview",async()=>{
 const x=setup();let finish;x.signer(p=>new Promise(r=>finish=()=>r(token(p,1000000))));
 const pending=x.resolver.resolve();await new Promise(r=>setImmediate(r));x.resolver.invalidate();finish();assert.equal(await pending,null);
});
test("replacement/unpublish during signing cannot install the former Intro",async()=>{
 for(const state of [null,{key:"new",path:"a/new/intro-d3.webm"}]){const x=setup();x.signer(p=>{x.state(state);return token(p,1000000);});assert.equal(await x.resolver.resolve(),null);}
});
test("account switch during signing cannot install the former user's capability",async()=>{
 const x=setup();x.signer(p=>{x.actor("owner-b");return token(p,1000000);});assert.equal(await x.resolver.resolve(),null);
});
test("failed signing has no stale fallback and can be retried",async()=>{
 const x=setup();x.signer(()=>{throw Error("403");});await assert.rejects(x.resolver.resolve(),/403/);x.signer(null);assert.ok(await x.resolver.resolve());
});
test("overlong, malformed, expired, wrong origin and wrong object URLs fail closed",async()=>{
 for(const fn of [p=>token(p,1000000,121),p=>token(p,800000,120),()=>base+"/wrong",p=>token(p,1000000).replace(base,"https://example.com"),()=>token("other/object.webm",1000000)]){
  const x=setup();x.signer(fn);assert.equal(await x.resolver.resolve(),null);
 }
});
test("native release clears main and every Split consumer, including handlers, and aborts loading",()=>{
 const calls=[];const v=id=>({onended:()=>{},onerror:()=>{},pause:()=>calls.push(id+":pause"),removeAttribute:k=>calls.push(id+":"+k),load:()=>calls.push(id+":load"),remove:()=>calls.push(id+":remove")});
 const main=v("main"),a=v("a"),b=v("b");releaseIntroConsumers(main,[a,b]);assert.equal(main.onended,null);assert.equal(b.onerror,null);
 assert.deepEqual(calls,["main:pause","main:src","main:load","a:pause","a:src","a:load","b:pause","b:src","b:load","a:remove","b:remove"]);
});
test("owner Account has no mandatory Intro download; local uploads and lifecycle stops remain",async()=>{
 const s=await readFile(new URL("../dist/account/account.js",import.meta.url),"utf8");
 assert.doesNotMatch(s,/api\.loadIntroMedia\(/);assert.match(s,/source = local \? null : await introSource.resolve/);
 for(const item of ["introPreviewDialog","close","pagehide","storage","AUTH_SESSION_EVENT","stopIntroPreview","introOwner"])assert.ok(s.includes(item));
});
test("public streaming freshly reads PUBLIC identity and does not use owner signing or persistent media storage",async()=>{
 const s=await readFile(new URL("../dist/public/public.js",import.meta.url),"utf8");
 assert.doesNotMatch(s,/loadPublicIntroMedia|getMyIntro|signIntroMedia|localStorage|sessionStorage/);
 assert.match(s,/latestIntroIdentity = await getPublicIdentity/);assert.match(s,/sign: signPublicIntroMedia/);
 const lease=await readFile(new URL("../dist/account/intro-source.js",import.meta.url),"utf8");assert.doesNotMatch(lease,/localStorage|sessionStorage|indexedDB/);
});

test("public and owner signers preserve authorization and request at most 120s",async()=>{
 const oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage,oldLocation=globalThis.location;
 const jwt="x."+Buffer.from(JSON.stringify({sub:"owner-a"})).toString("base64url")+".x";
 let stored=JSON.stringify({access_token:jwt,expires_at:Math.floor(Date.now()/1000)+3600}),calls=[];
 globalThis.location={hash:"",pathname:"/account/",search:""};
 globalThis.localStorage={getItem:()=>stored,setItem:(_k,v)=>{stored=v;},removeItem:()=>{stored=null;}};
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({signedURL:"/object/sign/intro-media/owner-a/job/intro-d3.webm?token=synthetic"}),{headers:{"content-type":"application/json"}});};
 try{
  const api=await import("../dist/account/supabase-client.js?f5-signer-regression");
  await api.signPublicIntroMedia("owner-a/job/intro-d3.webm",999);
  assert.equal(calls[0].options.headers.Authorization,undefined);
  assert.equal(JSON.parse(calls[0].options.body).expiresIn,120);
  assert.ok(await api.signIntroMedia("owner-a/job/intro-d3.webm"));
  assert.equal(calls[1].options.headers.Authorization,"Bearer "+jwt);
  assert.equal(await api.signIntroMedia("owner-b/job/intro-d3.webm"),null);
  await api.signOut();assert.equal(await api.signIntroMedia("owner-a/job/intro-d3.webm"),null);
  assert.equal(calls.length,3,"only the two signs and the explicit logout request are sent");
 }finally{globalThis.fetch=oldFetch;globalThis.localStorage=oldStorage;globalThis.location=oldLocation;}
});
test("owner source requires fresh READY state; public lookup fails closed and stale play promises are guarded",async()=>{
 const owner=await readFile(new URL("../dist/account/account.js",import.meta.url),"utf8");
 assert.match(owner,/intro\?\.active_state === "ready"/);
 const publicPage=await readFile(new URL("../dist/public/public.js",import.meta.url),"utf8");
 assert.match(publicPage,/latestIntroIdentity = null;\s*latestIntroIdentity = await getPublicIdentity/);
 const player=await readFile(new URL("../dist/account/intro-preview.js",import.meta.url),"utf8");
 assert.match(player,/if\(configReceived\)terminatePlayback\(\);else/);
 assert.match(player,/if\(current===token\)els.previewStart.hidden=false/);
});


