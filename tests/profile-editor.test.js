import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionDraft,sectionChanged,createSectionSaveQueue,SECTION_FIELDS} from '../dist/account/profile-editor.js';
import {createTransientMessage} from '../dist/account/transient-message.js';
import {readFileSync} from 'node:fs';
const before={displayName:'Original',bio:'Saved bio',avatarPath:'a',roleKeys:['player'],primaryRoleKey:'player',educationWorkStatus:null,institution:'',fieldOfStudy:''};
const draft={displayName:'New',bio:'Unsaved bio',avatarPath:'b',roleKeys:['creator'],primaryRoleKey:'creator',educationWorkStatus:'student',institution:'School',fieldOfStudy:'Science'};
for(const section of Object.keys(SECTION_FIELDS))test(`${section} save includes only that section and preserves all other saved fields`,()=>{
 const merged=sectionDraft(before,draft,section);for(const key of Object.keys(before))assert.deepEqual(merged[key],SECTION_FIELDS[section].includes(key)?draft[key]:before[key]);assert.ok(sectionChanged(before,draft,section));assert.deepEqual(before.displayName,'Original');
});
test('concurrent different-section saves serialize and merge against the latest committed state',async()=>{
 const queue=createSectionSaveQueue();let saved={...before};const calls=[];
 await Promise.all([queue.run('name',async()=>{await new Promise(r=>setTimeout(r,5));saved=sectionDraft(saved,draft,'name');calls.push('name');}),queue.run('bio',async()=>{saved=sectionDraft(saved,draft,'bio');calls.push('bio');})]);assert.deepEqual(calls,['name','bio']);assert.equal(saved.displayName,'New');assert.equal(saved.bio,'Unsaved bio');assert.deepEqual(saved.roleKeys,['player']);
});
test('duplicate requests coalesce; failed saves do not block a different section or retry',async()=>{
 const queue=createSectionSaveQueue();let count=0;const a=queue.run('name',async()=>{count++;throw Error('retry');});const b=queue.run('name',()=>{count++;});assert.equal(a,b);await assert.rejects(a,/retry/);await queue.run('bio',()=>count++);await queue.run('name',()=>count++);assert.equal(count,3);
});
test('unknown section cannot mutate fields',()=>assert.throws(()=>sectionDraft(before,draft,'missing'),/UNKNOWN/));
test('five-second feedback resets on new messages; actionable errors persist',()=>{
 let current,delay,cleared=0;const el={hidden:true,classList:{toggle(){}},textContent:''};const timers={setTimeout(fn,ms){current=fn;delay=ms;return 1;},clearTimeout(){cleared++;}};const feedback=createTransientMessage(el,{timers,durationMs:5000});feedback.show('saved',{tone:'success'});assert.equal(delay,5000);feedback.show('new',{tone:'info'});assert.ok(cleared);assert.equal(el.textContent,'new');current();assert.equal(el.hidden,true);feedback.show('retry',{tone:'error'});assert.equal(feedback.pending,false);assert.equal(el.hidden,false);
});
test('all existing editor sections and independent panels are covered; no exclusive accordion',()=>{
 const view=readFileSync(new URL('../dist/account/profile-editor.js',import.meta.url),'utf8');for(const key of ['avatar','name','bio','intro','roles','education','connections','games','game-display','league','duo','crew','language','preview','share','play','wall'])assert.ok(view.includes(`'${key}'`),key);assert.ok(view.includes("panel.hidden=!open"));assert.doesNotMatch(view,/other === toggle/);
 const source=readFileSync(new URL('../dist/account/account.js',import.meta.url),'utf8');assert.ok(source.includes('sectionSaveQueue.run'));assert.ok(source.includes('sectionDraft(savedProfile,snapshot,key)'));assert.ok(source.includes('beforeunload'));assert.ok(source.includes('Leave this page'));assert.ok(source.includes("owner!==api.userIdFromToken()"));assert.doesNotMatch(source,/saveConfirmationTimer/);
});


test('visible feedback clock pauses on collapse, scroll and background tabs, and preserves remaining duration',()=>{
 const originals={IntersectionObserver:globalThis.IntersectionObserver,MutationObserver:globalThis.MutationObserver};let observe,mutation,visibilityChange,time=0,nextDelay,timeout;
 globalThis.IntersectionObserver=class{constructor(fn){observe=fn;}observe(){}};
 globalThis.MutationObserver=class{constructor(fn){mutation=fn;}observe(){}};
 const doc={visibilityState:'visible',getElementById:()=>({}),addEventListener(type,fn){visibilityChange=fn;}};
 let onscreen=true;const el={hidden:true,ownerDocument:doc,classList:{toggle(){}},getClientRects:()=>onscreen?[1]:[],getBoundingClientRect:()=>({top:1,bottom:20})};
 try{const feedback=createTransientMessage(el,{durationMs:5000,now:()=>time,timers:{setTimeout(fn,ms){timeout=fn;nextDelay=ms;return 1;},clearTimeout(){}}});
 feedback.show('Saved',{tone:'success'});assert.equal(nextDelay,5000);time=1000;onscreen=false;mutation();assert.equal(feedback.pending,false);time=9000;onscreen=true;observe();assert.equal(nextDelay,4000);
 time=10000;doc.visibilityState='hidden';visibilityChange();assert.equal(feedback.pending,false);time=20000;doc.visibilityState='visible';visibilityChange();assert.equal(nextDelay,3000);
 feedback.show('New',{tone:'success'});assert.equal(nextDelay,5000);timeout();assert.equal(el.hidden,true);
 }finally{Object.assign(globalThis,originals);}
});
test('Duo visibility has its own section save and verifies the relationship before applying a staged switch',()=>{
 const source=readFileSync(new URL('../dist/account/account.js',import.meta.url),'utf8');assert.ok(source.includes('section:"duo"'));assert.ok(source.includes('options.identityKey'));assert.ok(source.includes('await api.setMyDuoVisibility(value)'));
 const view=readFileSync(new URL('../dist/account/profile-editor.js',import.meta.url),'utf8');assert.ok(view.includes("'league','duo']"));
});
test('navigation protects workflow drafts and OAuth redirects; mobile cards cannot force grid overflow',()=>{
 const source=readFileSync(new URL('../dist/account/account.js',import.meta.url),'utf8');assert.ok(source.includes('actionDraftsDirty()'));assert.ok(source.includes('Connect this account and leave your unsaved changes?'));assert.ok(source.includes('languageSaving||!identity'));
 const css=readFileSync(new URL('../dist/account/account.css',import.meta.url),'utf8');assert.ok(css.includes('.account-shell:has([data-profile-editor]){grid-template-columns:minmax(0,1fr)}'));
});

test('notification/hash and OAuth return destinations reveal their collapsed sections without closing other drafts',()=>{
 const source=readFileSync(new URL('../dist/account/account.js',import.meta.url),'utf8');assert.ok(source.includes('revealEditorSection(section)'));assert.ok(source.includes('revealEditorSection(document.getElementById("connectionsSection"))'));assert.ok(source.includes("section.panel.hidden=false;section.toggle.setAttribute('aria-expanded','true')"));
});
