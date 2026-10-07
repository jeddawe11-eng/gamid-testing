import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { accountSignInUrl, authenticatedReturnPath, TESTING_ORIGIN } from "../dist/account/testing-auth-handoff.js";
import { rememberReturnTo, takeReturnTo } from "../dist/account/post-auth-return.js";
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const account={origin:TESTING_ORIGIN,pathname:"/account/"};
const session={access_token:"fixture-token",expires_at:100};
test("sign-in stays on Cloudflare for both fixed destinations without token transfer",()=>{
 for(const pathname of ["/play-together/","/wall-editor/"]){
  const url=new URL(accountSignInUrl({origin:TESTING_ORIGIN,pathname}));
  assert.equal(url.href,`${TESTING_ORIGIN}/account/?auth=signin`);
  assert.equal(url.hash,"");
  const s=store(); assert.equal(rememberReturnTo(pathname,s,1000),true);
  assert.equal(authenticatedReturnPath(account,session,s,2000),pathname);
  assert.equal(takeReturnTo(s,2000),null);
 }
});
test("return note denies arbitrary destinations, expiry, future dates, recovery, unauthenticated and foreign controllers",()=>{
 for(const path of ["https://evil.test/","//evil.test/","/account/","/wall-editor/?next=evil"]){assert.equal(rememberReturnTo(path,store()),false);}
 for(const location of [{...account,origin:"https://evil.test"},{...account,pathname:"/play-together/"}]){
  const s=store();rememberReturnTo("/wall-editor/",s,1000);assert.equal(authenticatedReturnPath(location,session,s,2000),null);
 }
 for(const candidate of [null,{access_token:"a",expires_at:1},{...session,type:"recovery"}]){
  const s=store();rememberReturnTo("/wall-editor/",s,1000);assert.equal(authenticatedReturnPath(account,candidate,s,2000),null);
 }
 for(const now of [999,301001]){const s=store();rememberReturnTo("/wall-editor/",s,1000);assert.equal(takeReturnTo(s,now),null);}
 const s=store();s.setItem("gamid.testing.auth.return.v1",JSON.stringify({path:"https://evil.test",at:1000}));assert.equal(takeReturnTo(s,2000),null);
 assert.equal(accountSignInUrl({origin:"https://jeddawe11-eng.github.io",pathname:"/play-together/"}),null);
});
test("deployed controllers use fixed same-origin sign-in and leave recovery in Account",async()=>{
 const sources=await Promise.all(["account/account.js","play-together/play-together.js","wall-editor/editor.js","account/supabase-client.js"].map(p=>readFile(new URL(`../dist/${p}`,import.meta.url),"utf8")));
 const [accountCode,pt,wall,client]=sources;
 for(const code of sources)assert.doesNotMatch(code,/legacyAccountHandoffUrl|transferredSessionUrl|jeddawe11-eng\.github\.io|gamid_testing_handoff/);
 assert.match(accountCode,/authenticatedReturnPath\(location, api\.currentSession\(\)\)/);
 assert.match(accountCode,/if \(redirected\?\.type === "recovery"\) showView\("recovery"\)/);
 assert.match(pt,/rememberReturnTo\("\/play-together\/"\)/);
 assert.match(wall,/rememberReturnTo\("\/wall-editor\/"\)/);
 assert.doesNotMatch(client,/location\.replace/);
});
