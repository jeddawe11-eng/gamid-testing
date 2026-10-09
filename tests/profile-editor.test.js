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
 const view=readFileSync(new URL('../dist/account/profile-editor.js',import.meta.url),'utf8');for(const key of ['avatar','name','bio','intro','roles','education','connections','games','game-display','league','duo','crew','socials','preview','share','play','wall'])assert.ok(view.includes(`'${key}'`),key);assert.doesNotMatch(view,/'Account Settings'/,'Account Settings is the ⋯ menu, not a section');assert.ok(view.includes("panel.hidden=!open"));assert.doesNotMatch(view,/other === toggle/);
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

test('a reused Profile status node has one timer owner after re-sign-in; an old observer cannot hide a new message',()=>{
 const originals={IntersectionObserver:globalThis.IntersectionObserver,MutationObserver:globalThis.MutationObserver};const observers=[];let serial=0;const timers=new Map();
 globalThis.IntersectionObserver=class{constructor(fn){observers.push(fn);}observe(){}};globalThis.MutationObserver=class{constructor(fn){observers.push(fn);}observe(){}};
 const el={hidden:true,ownerDocument:{visibilityState:'visible',getElementById:()=>({}),addEventListener(){}},classList:{toggle(){}},getClientRects:()=>[1],getBoundingClientRect:()=>({top:1,bottom:20})};
 const clock={setTimeout(fn){const id=++serial;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}};
 try{const old=createTransientMessage(el,{durationMs:5000,timers:clock});old.show('Old saved',{tone:'success'});const current=createTransientMessage(el,{durationMs:5000,timers:clock});current.show('New owner saved',{tone:'success'});for(const observe of observers)observe();assert.equal(timers.size,1);assert.equal(old.pending,false);assert.equal(el.textContent,'New owner saved');current.hide();for(const observe of observers)observe();assert.equal(timers.size,0);}finally{Object.assign(globalThis,originals);}
});


test('retired feedback releases observers and ignores stale timeout/show/hide callbacks',()=>{
 const originals={IntersectionObserver:globalThis.IntersectionObserver,MutationObserver:globalThis.MutationObserver};let released=0,removed=0,oldTimeout;
 globalThis.IntersectionObserver=globalThis.MutationObserver=class{observe(){}disconnect(){released++;}};
 const el={hidden:true,ownerDocument:{visibilityState:'visible',getElementById:()=>({}),addEventListener(){},removeEventListener(){removed++;}},classList:{toggle(){}},getClientRects:()=>[1],getBoundingClientRect:()=>({top:1,bottom:20})};
 try{const old=createTransientMessage(el,{durationMs:5000,timers:{setTimeout(fn){oldTimeout=fn;return 1;},clearTimeout(){}}});old.show('Old',{tone:'success'});const current=createTransientMessage(el,{durationMs:5000,timers:{setTimeout(){return 2;},clearTimeout(){}}});current.show('Current',{tone:'success'});oldTimeout();old.show('Old outcome',{tone:'error'});old.hide();assert.equal(el.textContent,'Current');assert.equal(el.hidden,false);assert.equal(released,2);assert.equal(removed,1);current.dispose();assert.equal(released,4);}finally{Object.assign(globalThis,originals);}
});
test('section and language save outcomes cannot report into a different authenticated owner',()=>{
 const source=readFileSync(new URL('../dist/account/account.js',import.meta.url),'utf8');assert.ok(source.includes("if(epoch===profileFeedbackEpoch&&owner===api.userIdFromToken()&&entity===identity?.entity_id){reportSection(key,'Saved"));assert.ok(source.includes("if(owner!==api.userIdFromToken()||entity!==identity?.entity_id)return false;"));assert.ok(source.includes('if(epoch===profileFeedbackEpoch&&owner===api.userIdFromToken())feedbackFor(languageFeedback)'));assert.ok(source.includes('for(const feedback of sectionFeedback.values())feedback.hide();'));
});

test('explicitly transient errors, warnings and information each receive five visible seconds',()=>{
 let delay;const el={hidden:true,classList:{toggle(){}}};const feedback=createTransientMessage(el,{durationMs:5000,timers:{setTimeout(fn,ms){delay=ms;return 1;},clearTimeout(){}}});for(const tone of ['success','warning','info','error']){feedback.show('Transient',{tone,persistent:false});assert.equal(delay,5000);assert.equal(feedback.pending,true);}feedback.show('Validation',{tone:'error',persistent:true});assert.equal(feedback.pending,false);assert.equal(el.hidden,false);
});

test('same-account re-sign-in invalidates save feedback from the previous editor lifecycle',()=>{
 const source=readFileSync(new URL('../dist/account/account.js',import.meta.url),'utf8');assert.match(source,/async function showIdentity\(data\) \{\s*profileFeedbackEpoch\+\+/);assert.ok(source.includes('if(epoch!==profileFeedbackEpoch)return false;'));assert.ok(source.includes('epoch=profileFeedbackEpoch'));assert.ok(source.includes('if(epoch===profileFeedbackEpoch&&owner===api.userIdFromToken()&&entity===identity?.entity_id){reportSection'));
});


test('owner preview has one accordion heading and no overlapping internal label',()=>{
 const html=readFileSync(new URL('../dist/account/index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/class="preview-state"/);const source=readFileSync(new URL('../dist/account/profile-editor.js',import.meta.url),'utf8');assert.ok(source.includes("'Live Preview'"));
});
test('resolved field validation clears its associated feedback without hiding unrelated errors',()=>{
 const source=readFileSync(new URL('../dist/account/account.js',import.meta.url),'utf8');assert.ok(source.includes('panel.dataset.invalidDraft&&'));assert.ok(source.includes('panel.dataset.validationMessage===feedback.textContent'));assert.ok(source.includes('section.panel.dataset.validationMessage=text'));assert.ok(source.includes('delete panel.dataset.validationMessage;const el='));
});
test('a field-validation save error expires after five seconds below Save Changes while the inline field error persists; other errors and success are unchanged',()=>{
 // the helper: a non-persistent error gets the five-second clock; a persistent one (actionable failures) never does
 let fire,delay;const el={hidden:true,classList:{toggle(){}},textContent:''};const feedback=createTransientMessage(el,{durationMs:5000,timers:{setTimeout(fn,ms){fire=fn;delay=ms;return 1;},clearTimeout(){}}});
 feedback.show('Display name is required.',{tone:'error',persistent:false});assert.equal(delay,5000);assert.equal(el.hidden,false);fire();assert.equal(el.hidden,true,'expired after five seconds');
 delay=undefined;feedback.show('Could not reach GamID. Try again.',{tone:'error'});assert.equal(delay,undefined);assert.equal(feedback.pending,false);assert.equal(el.hidden,false,'actionable errors still persist');
 delay=undefined;feedback.show('Saved successfully',{tone:'success'});assert.equal(delay,5000,'success unchanged');
 // the wiring: only a recognised field-validation failure (the case that also writes the inline .field-error) is reported non-persistent
 const source=readFileSync(new URL('../dist/account/account.js',import.meta.url),'utf8');
 assert.ok(source.includes('function reportSection(key,text,success=false,progress=false,persistent=!success&&!progress)'));
 assert.ok(source.includes("reportSection(key,text,false,false,!fieldValidation);\n if(['avatar','intro'].includes(key))showUploadError(key,uploadErrorFrom(error,text));\n if(socialCode&&!error?.socialValidation)socialsEditor.showError(-1,socialCode);\n if(fieldValidation){section.panel.dataset.validationMessage=text;"),'the same condition drives the transient notice and the inline error');
 assert.ok(source.includes("const fieldValidation=Boolean(field&&['name','bio','roles','education'].includes(key)&&['INVALID_DISPLAY_NAME'"));
 assert.doesNotMatch(source,/const text=errorMessage\(reasonFrom\(error\)\|\|error\.message\);reportSection\(key,text\);/,'no unconditional persistent error report remains');
 assert.ok(source.includes("hint.className='field-error'"),'the inline field error is still created and only removed once the field is valid');
});
test('saved message has one CSS success icon and no duplicate textual checkmark',()=>{
 const source=readFileSync(new URL('../dist/account/account.js',import.meta.url),'utf8');assert.ok(source.includes("reportSection(key,'Saved successfully',true)"));assert.doesNotMatch(source,/reportSection\(key,'Saved ✓'/);const css=readFileSync(new URL('../dist/account/account.css',import.meta.url),'utf8');assert.ok(css.includes(".connections-message.success:before{content:'✓ ';}"));
});
test('Account menu moves the existing sign-out button and keeps one secure handler',()=>{
 const html=readFileSync(new URL('../dist/account/index.html',import.meta.url),'utf8');assert.match(html,/id="accountMenu"[^>]*hidden/);assert.ok(html.includes('aria-label="Account menu"'));assert.equal((html.match(/id="signOutButton"/g)||[]).length,1);
 const layout=readFileSync(new URL('../dist/account/profile-editor.js',import.meta.url),'utf8');assert.ok(layout.includes("menu=doc.getElementById('accountMenuActions')")&&layout.includes("menu.append(signOut)"));const source=readFileSync(new URL('../dist/account/account.js',import.meta.url),'utf8');assert.equal((source.match(/await api.signOut\(\)/g)||[]).length,1);assert.ok(source.includes('event.key==="Escape"'));assert.ok(source.includes('window.addEventListener(api.AUTH_SESSION_EVENT,syncAccountMenu)'));assert.ok(source.includes('accountMenu.hidden=!api.userIdFromToken()'));
});
