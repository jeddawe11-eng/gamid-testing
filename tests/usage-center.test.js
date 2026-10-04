import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createUsageCenter,mb} from '../dist/usage/usage-center.js';
import {notificationSubscriber} from '../dist/notifications/notification-realtime.js';
import {createAuthenticatedShell} from '../dist/app/authenticated-shell.js';
class El {
 constructor(){this.children=[];this.attrs={};this.listeners={};this.text='';}
 set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
 append(...els){for(const el of els){el.parent=this;this.children.push(el);}}replaceChildren(...els){this.children=[];this.text='';this.append(...els);}
 setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,v){this.listeners[k]=v;}remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}contains(n){return n===this||this.children.some(c=>c.contains(n));}
}
const doc=()=>({createElement:()=>new El(),addEventListener(){},removeEventListener(){}});
const snapshot=()=>({storage:{used_bytes:84_000_000,quota_bytes:200_000_000,remaining_bytes:116_000_000,percentage:42,state:'NORMAL',reserved_bytes:0,enforcement_active:true},media:{intro:32_000_000,wall:50_000_000,avatar:2_000_000},quotas:[{name:'Wall Layers',used:7,limit:null},{name:'Wall Videos',used:4,limit:10}]});
test('Usage renders only authoritative values, decimal MB and existing limits; failure leaves visibly stale data and teardown discards owner state',async()=>{
 const d=doc(),host=new El();let fail=false;const center=createUsageCenter({doc:d,api:{getMyUsage:async()=>{if(fail)throw Error();return snapshot();}}});await center.mount(host);
 assert.match(center.root.textContent,/84 MB \/ 200 MB/);assert.match(center.root.textContent,/116 MB remaining · 42%/);assert.match(center.root.textContent,/Wall Layers · 7Wall Videos · 4 \/ 10/);assert.equal(mb(1_500_000),'1.5 MB');assert.equal(center.panel.hidden,true);
 center.setOpen(true);assert.equal(center.panel.hidden,false);assert.equal(center.button.attrs['aria-expanded'],'true');await center.refresh();fail=true;await center.refresh();assert.match(center.root.textContent,/could not be refreshed/);
 center.destroy();assert.equal(center.state,null);assert.equal(host.children.length,0);
});
test('destroying Usage during owner read cannot render private data afterward',async()=>{
 let release;const pending=new Promise(r=>release=r),center=createUsageCenter({doc:doc(),api:{getMyUsage:()=>pending}});const mounted=center.mount(new El());await Promise.resolve();center.destroy();release(snapshot());await mounted;assert.equal(center.state,null);assert.doesNotMatch(center.root.textContent,/84 MB/);
});
test('one existing private notification subscription routes Usage without altering unread/log events',()=>{
 let options,run;let notifications=0,usage=0,stops=0;
 const subscribe=notificationSubscriber({getUserId:()=> 'fixture-owner',subscribe:o=>{options=o;return()=>stops++;},onUsageChange:()=>usage++,timers:{setTimeout:f=>{run=f;return 1;},clearTimeout(){}},win:null,doc:null});
 const stop=subscribe(()=>notifications++);assert.equal(options.topic,'notifications:user:fixture-owner');assert.deepEqual(options.event,['notifications_changed','usage_changed']);
 options.onMessage({},'usage_changed');run();assert.equal(usage,1);assert.equal(notifications,0);
 options.onMessage({},'notifications_changed');run();assert.equal(notifications,1);assert.equal(usage,1);stop();assert.equal(stops,1);
});
test('Usage request cannot delay the accepted notification bell; both share one owner teardown',async()=>{
 const d=doc();d.documentElement={dataset:{}};d.body=new El();const header=new El();header.querySelector=()=>null;d.querySelector=()=>header;
 const win={parent:null,addEventListener(){},removeEventListener(){}};win.parent=win;
 let release,mounted=false,usageDestroyed=false,notificationDestroyed=false;
 const gate=new Promise(r=>release=r),shell=createAuthenticatedShell({doc:d,win,client:{restoreSession:async()=>({access_token:'fixture'}),userIdFromToken:()=> 'fixture-owner'},subscribe:()=>{},createUsage:()=>({mount:()=>gate,destroy:()=>usageDestroyed=true}),createCenter:()=>({mount:async()=>{mounted=true;},destroy:()=>notificationDestroyed=true})});
 const pending=shell.sync();for(let i=0;i<5;i++)await Promise.resolve();assert.equal(mounted,true);shell.destroy();release();await pending;assert.equal(usageDestroyed,true);assert.equal(notificationDestroyed,true);
});
test('shared shell owns both controls and one topic; responsive panel stays compact; frontend contains no backend credential',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const shell=read('dist/app/authenticated-shell.js');assert.match(shell,/createUsageCenter/);assert.match(shell,/onUsageChange/);assert.match(shell,/usage\.mount\(host\), mounted\.mount\(host/);
 const css=read('dist/usage/usage.css');assert.match(css,/calc\(100vw - 32px\)/);assert.match(css,/@media\(max-width:599px\)/);assert.match(css,/\[hidden\]/);
 assert.doesNotMatch(read('dist/usage/usage-center.js'),/WebSocket|setInterval|candidate_owner|serviceKey/);
 assert.doesNotMatch(read('dist/account/supabase-client.js'),/serviceKey|sb_secret_/);
});
