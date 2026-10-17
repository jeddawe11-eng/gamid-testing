// Mobile V2 "Profile Deck" browser review (below 1024px), driven by classic-preview-browser.mjs --mobile-deck.
// The backend is the caller's fully mocked fixture; no real account, upload or publication is touched.
import assert from 'node:assert/strict';
import path from 'node:path';

const MAIN=['avatar','intro','banner','connections','socials','games','game-display','duo','crew','wall'];
const NESTED=['about','roles','education','bio','name'];

export async function deckClose(page){
 if(await page.locator('.deck-sheet').isVisible()){await page.locator('.deck-back').click();await page.locator('.deck-sheet').waitFor({state:'hidden'});}
}
// Opens one editor through the deck UI, as a person would: close the current sheet, tap the card (or About Me row / tab).
export async function deckOpen(page,key){
 if(key==='league')key='connections';
 const sheet=page.locator('.deck-sheet');
 if(NESTED.includes(key)&&await sheet.isVisible()&&await page.locator('.deck-tabs').isVisible()){await page.locator(`[data-deck-tab="${key}"]`).click();}
 else{await deckClose(page);const opener=key==='share'?page.locator('.deck-share-button'):page.locator(`.deck-groups [data-deck-open="${key}"]`);await opener.scrollIntoViewIfNeeded();await opener.click();}
 await sheet.waitFor();await page.locator(`.deck-sheet-body [data-editor-section="${key}"] > .section-panel`).waitFor();
}
async function overflow(page){
 return page.evaluate(()=>{
  const docOverflow=document.documentElement.scrollWidth>innerWidth;
  const scrollers=el=>{for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(['auto','scroll'].includes(s.overflowX)&&p.scrollWidth>p.clientWidth&&!p.classList.contains('deck-sheet-body'))return true;}return false;};
  const box=document.querySelector('.deck-sheet:not([hidden]) .deck-sheet-body')?.getBoundingClientRect();
  const offenders=box?[...document.querySelectorAll('.deck-sheet-body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&getComputedStyle(e).visibility!=='hidden'&&(r.right>box.right+1||r.left<box.left-1)&&!scrollers(e);}).slice(0,8).map(e=>({tag:e.tagName,cls:String(e.className).slice(0,60),right:Math.round(e.getBoundingClientRect().right),max:Math.round(box.right)})):[];
  const page=[...document.querySelectorAll('.deck-layout *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!scrollers(e)&&!e.closest('.deck-sheet');}).slice(0,8).map(e=>({tag:e.tagName,cls:String(e.className).slice(0,60),right:Math.round(e.getBoundingClientRect().right)}));
  return {docOverflow,sheet:offenders,page};
 });
}
async function smallTargets(page){
 return page.evaluate(()=>[...document.querySelectorAll('.deck-layout :is(button,a,select,input[type=checkbox])')].filter(e=>{const r=e.getBoundingClientRect();if(!r.width||e.closest('[hidden]')||getComputedStyle(e).visibility==='hidden')return false;if(e.closest('.deck-sheet-body'))return false;return r.height<40||r.width<40;}).map(e=>({tag:e.tagName,cls:String(e.className).slice(0,50),text:e.textContent.trim().slice(0,30),w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)})));
}

// Same media as the Desktop summaries: Intro paused frame, provider photos, game and Crew artwork; fallbacks when the images fail.
async function reviewMedia(page,{scenario,imageRequests,out,width}){
 const count=selector=>page.locator(selector).count();
 if(scenario==='populated'||scenario==='rich'){
  await page.waitForFunction(()=>document.querySelector('[data-deck-card=intro] .deck-intro-tile img')?.naturalWidth>0,null,{timeout:20000});
  // The rich fixture's Crews use games without artwork: their tiles keep the gradient and initials (no source image to show).
  if(scenario==='populated')await page.waitForFunction(()=>document.querySelectorAll('[data-deck-card=crew] .deck-crew-tile .game-art-bg').length>0,null,{timeout:10000}).catch(async error=>{throw Error('Crew tile artwork missing: '+await page.evaluate(()=>document.querySelector('[data-deck-card=crew]')?.outerHTML.slice(0,1500)+' || list: '+document.querySelector('#crewPanel')?.outerHTML.slice(0,800)));});
  if(scenario==='populated'){await page.locator('[data-deck-card=crew]').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('[data-deck-card=crew] .crew-card-icon .game-art').length===2,null,{timeout:10000}).catch(async()=>{throw Error('Crew tile icons: '+await page.evaluate(()=>[...document.querySelectorAll('[data-deck-card=crew] .crew-card-icon')].map(n=>n.outerHTML).join(' | ')));});}
  assert.ok(await count('[data-deck-card=connections] .deck-row-photo img')>=3,'Discord, Steam and League photos in the Connections summary');
  if(scenario==='populated'){assert.ok(await count('[data-deck-card=games] .deck-cover img')>=2,'game artwork in the My Games summary');assert.ok(await count('#myGamesSection .game-icon .game-art')>=2,'game artwork in the live My Games editor');}
  else assert.ok(await count('[data-deck-card=games] .deck-cover img')>=1,'artwork where the server matched it; initials elsewhere');
  if(scenario==='populated')assert.ok(await count('#crewPanel .crew-list-icon .game-art')>=1,'Crew game artwork in the live My Crew editor');
  if(scenario==='populated'){await deckOpen(page,'crew');await page.locator('#crewPanel .crew-list-open').first().click();await page.locator('#crewPanel .crew-management-columns').first().waitFor();await page.waitForFunction(()=>document.querySelector('#crewPanel .crew-management-columns .game-art-bg, #crewPanel .crew-management-columns .game-art'));await page.screenshot({path:path.join(out,'deck-sheet-crew-manage-'+width+'.png'),animations:'disabled'});await deckClose(page);}
  else assert.ok(await count('[data-deck-card=crew] .deck-crew-tile')>=1);
  const art=await page.locator('#myGamesSection .game-icon .game-art').first().evaluate(n=>{const s=getComputedStyle(n);return {position:s.position,fit:s.objectFit};}).catch(()=>null);
  if(art)assert.deepEqual(art,{position:'absolute',fit:'cover'},'artwork covers its initials');
 }
 if(scenario==='failed'){
  await page.waitForFunction(()=>/Thumbnail unavailable/.test(document.querySelector('[data-deck-card=intro]')?.textContent),null,{timeout:20000});await page.waitForTimeout(1500);
  assert.equal(await count('[data-deck-card=intro] .deck-intro-tile img'),0);await deckOpen(page,'games');await page.waitForTimeout(1500);assert.equal(await count('#myGamesSection .game-art'),0,'failed artwork leaves initials (lazy images fail once opened)');await deckClose(page);
  await page.locator('[data-deck-card=games]').scrollIntoViewIfNeeded();await page.locator('[data-deck-card=crew]').scrollIntoViewIfNeeded();await page.waitForTimeout(1500);
  assert.equal(await count('[data-deck-card=games] .deck-cover img'),0,'summary copies of failed artwork fall back to initials once loaded');await deckOpen(page,'crew');await page.waitForTimeout(1500);assert.equal(await count('#crewPanel .crew-list-icon .game-art'),0);await deckClose(page);
  assert.match(await page.locator('[data-deck-card=games] .deck-cover').first().innerText(),/\S/,'initials remain');
  // No retry loop: once the page is idle, failed images are not requested again (each request is uncached in this fixture).
  const idle=imageRequests();await page.waitForTimeout(3000);assert.equal(imageRequests()-idle,0,'failed images are not retried while idle');
 }
 if(scenario==='empty')assert.equal(await count('[data-deck-card=intro] .deck-intro-tile img'),0);
 assert.equal(await page.evaluate(()=>window.mediaPlayCalls),0,'thumbnails never play the Intro');
}

export async function reviewMobileDeck({page,width,scenario,out,calls,full=true,imageRequests=()=>0}){
 const result={width,scenario};
 await page.locator('#identityView.mobile-deck').waitFor();
 // GAMID_DECK_CAPTURE=<label>: evidence screenshots only (e.g. before/after with GAMID_DECK_ROOT), no assertions.
 if(process.env.GAMID_DECK_CAPTURE){const label=process.env.GAMID_DECK_CAPTURE;await page.waitForTimeout(8000);await page.screenshot({path:path.join(out,`${label}-deck-${scenario}-${width}.png`),fullPage:true,animations:'disabled'});for(const key of ['games','crew','connections']){await deckOpen(page,key);await page.waitForTimeout(1500);await page.screenshot({path:path.join(out,`${label}-sheet-${key}-${width}.png`),animations:'disabled'});}await deckClose(page);return {...result,captured:label};}
 assert.equal(await page.locator('#identityView.desktop-editor').count(),0,'Desktop editor inactive below 1024px');
 await page.waitForFunction(()=>document.querySelector('.deck-hero-name')?.textContent==='Saved Gamer');await page.waitForTimeout(700);
 // Hero: identity, status, Preview / Share / Publish.
 assert.equal(await page.locator('.deck-hero-handle').textContent(),'@fixture_owner');
 for(const sel of ['#previewClassicButton','.deck-share-button','#visibilityToggle','#visibilityChip'])assert.ok(await page.locator(sel).isVisible(),sel+' visible in the hero');
 assert.equal(await page.locator('.deck-hero #visibilityToggle').count(),1);
 assert.equal(await page.evaluate(()=>document.querySelector('.deck-hero-name').getBoundingClientRect().top<document.querySelector('.deck-hero-banner').getBoundingClientRect().bottom-1),false,'hero text never sits on the Banner image');
 await reviewMedia(page,{scenario,imageRequests,out,width});result.media=true;
 // Six groups, chips, every card; the unsaved bar is hidden with nothing to save.
 assert.equal(await page.locator('.deck-group').count(),6);assert.equal(await page.locator('.deck-chip').count(),6);
 for(const key of MAIN){if(scenario==='empty'&&['games','game-display'].includes(key)&&!(await page.locator(`[data-deck-card="${key}"]`).isVisible()))continue;assert.ok(await page.locator(`[data-deck-card="${key}"]`).isVisible(),key+' card visible');}
 for(const key of NESTED)assert.ok(await page.locator(`.deck-about-row[data-deck-open="${key}"]`).isVisible());
 assert.ok(await page.getByRole('link',{name:'OPEN PLAY TOGETHER'}).isVisible());
 assert.equal(await page.locator('.deck-unsaved').isVisible(),false,'no unsaved bar without drafts: '+await page.evaluate(()=>document.querySelector('.deck-unsaved').outerHTML.slice(0,600)+' | '+[...document.querySelectorAll('[data-dirty]')].map(n=>n.dataset.editorSection+'='+n.dataset.dirty).join(',')+' | '+[...document.querySelectorAll('[data-profile-save]')].filter(b=>!b.disabled).map(b=>b.dataset.profileSave).join(',')));
 if(scenario!=='empty'){
  assert.match(await page.locator('[data-deck-card=crew]').innerText(),/Crew/);assert.match(await page.locator('[data-deck-card=duo]').innerText(),/Saved Friend|Duo/);assert.match(await page.locator('[data-deck-card=games]').innerText(),/\d+ games? · \d\/4 favorites/);
  assert.match(await page.locator('[data-deck-card=socials]').innerText(),/of 12 platforms added/);assert.match(await page.locator('[data-deck-card=connections]').innerText(),/Discord/);
 }
 let o=await overflow(page);assert.equal(o.docOverflow,false,'no horizontal page scroll');assert.deepEqual(o.page,[],'deck content inside the viewport');
 const targets=await smallTargets(page);assert.deepEqual(targets,[],'deck controls are at least 40px');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`deck-${scenario}-${width}.png`),fullPage:true,animations:'disabled'});
 // Section chips scroll to their group.
 await page.locator('.deck-chip[data-deck-group=games]').click();await page.waitForTimeout(900);
 const {gamesTop,atEnd}=await page.locator('#deck-games').evaluate(e=>({gamesTop:e.getBoundingClientRect().top,atEnd:scrollY>=document.documentElement.scrollHeight-innerHeight-2}));assert.ok(gamesTop>=0&&(gamesTop<140||atEnd),'Games group scrolled under the chips (or the page end): '+gamesTop);
 assert.equal(await page.locator('.deck-chip[data-deck-group=games]').getAttribute('aria-current'),'true');
 // Each editor opens alone in the sheet with its original live panel and its own Save Changes.
 const writes=()=>calls.filter(c=>/\/rpc\/(update_|set_|save_|attach_|remove_|publish|queue_|rename_|delete_)/.test(c.path)).length;const before=writes();
 for(const key of [...MAIN.filter(k=>scenario!=='empty'||!['games','game-display'].includes(k)),...NESTED,'share']){
  await deckOpen(page,key);
  assert.equal(await page.locator('.deck-sheet-body > .editor-section.deck-open').count(),1,key+': one editor open');
  assert.ok(await page.locator(`[data-editor-section="${key}"] > .section-panel`).isVisible());
  if(['avatar','intro','banner','socials','connections','game-display','duo',...NESTED].includes(key))assert.ok(await page.locator(`.deck-sheet-body [data-profile-save="${key}"]`).isVisible(),key+' Save Changes visible');
  assert.equal(await page.locator('.deck-unsaved').isVisible(),false);
  o=await overflow(page);assert.equal(o.docOverflow,false);assert.deepEqual(o.sheet,[],key+' sheet content inside the sheet');
  if(full&&['socials','roles','intro','crew','wall','games','connections','about'].includes(key))await page.screenshot({path:path.join(out,`deck-sheet-${key}-${width}.png`),animations:'disabled'});
 }
 await deckClose(page);assert.equal(writes(),before,'opening and closing editors never saves');
 result.editorsOpened=MAIN.length+NESTED.length+1;
 if(!full)return result;
 // Drafts survive Back, other editors and the 1024px boundary; the bar names them and Save All saves them.
 await deckOpen(page,'bio');await page.locator('#profileBio').fill('Deck draft bio');await deckOpen(page,'name');await page.locator('#profileDisplayName').fill('Deck Draft Name');
 assert.ok(await page.locator('.deck-tab[data-deck-tab=bio]').evaluate(e=>e.classList.contains('is-dirty')));assert.ok(await page.locator('.deck-sheet-head .deck-pill').isVisible());
 await deckClose(page);await page.locator('.deck-unsaved').waitFor();assert.match(await page.locator('.deck-unsaved').innerText(),/2 sections unsaved[\s\S]*Bio · Identity/);
 assert.equal(await page.locator('.deck-about-row[data-deck-open=bio] .deck-pill').isVisible(),true);
 await deckOpen(page,'socials');await deckClose(page);await deckOpen(page,'bio');assert.equal(await page.locator('#profileBio').inputValue(),'Deck draft bio');
 // Android / browser Back closes the sheet, never the page.
 await page.goBack();await page.locator('.deck-sheet').waitFor({state:'hidden'});assert.equal(new URL(page.url()).pathname,'/account/');assert.equal(await page.locator('#profileBio').inputValue(),'Deck draft bio');
 await deckOpen(page,'socials');await page.keyboard.press('Escape');await page.locator('.deck-sheet').waitFor({state:'hidden'});
 // Focus returns to the card that opened the editor.
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset.deckOpen),'socials');
 // Crossing 1024px both ways keeps every draft and the open editor.
 await deckOpen(page,'bio');await page.setViewportSize({width:1280,height:900});await page.locator('#identityView.desktop-editor').waitFor();await page.waitForTimeout(300);
 assert.equal(await page.locator('#identityView.mobile-deck').count(),0);assert.equal(await page.locator('#profileBio').inputValue(),'Deck draft bio');assert.equal(await page.locator('#profileDisplayName').inputValue(),'Deck Draft Name');
 assert.equal(await page.locator('[data-editor-section=bio] > .section-toggle').getAttribute('aria-expanded'),'true','the same editor stays open on Desktop');
 assert.equal(await page.locator('.desktop-editor-heading #saveAllButton').count(),1,'Save All back in the Desktop heading');
 await page.setViewportSize({width,height:900});await page.locator('#identityView.mobile-deck').waitFor();await page.locator('.deck-sheet').waitFor();
 assert.ok(await page.locator('.deck-sheet-body [data-editor-section=bio].deck-open').isVisible(),'the same editor reopens as a sheet');assert.equal(await page.locator('#profileBio').inputValue(),'Deck draft bio');
 result.boundaryDrafts=true;
 // Section Save Changes saves only its section.
 const saves=()=>calls.filter(c=>c.path.endsWith('/rpc/update_my_identity_profile'));const n=saves().length;
 await page.locator('[data-profile-save=bio]').click();await page.locator('#editor-feedback-bio').filter({hasText:'Saved'}).waitFor();
 assert.equal(saves().length,n+1);const sent=JSON.parse(saves().at(-1).body);assert.equal(sent.candidate_bio,'Deck draft bio');assert.notEqual(sent.candidate_display_name,'Deck Draft Name','saving Bio leaves the Identity draft unsaved');
 await deckClose(page);await page.locator('.deck-unsaved').waitFor();assert.match(await page.locator('.deck-unsaved').innerText(),/1 section unsaved[\s\S]*Identity/);
 // Save All from the sticky bar; the bar stays while its result shows, then goes.
 await page.locator('.deck-unsaved #saveAllButton').click();await page.locator('#saveAllFeedback').filter({hasText:'All changes saved'}).waitFor();
 assert.equal(JSON.parse(saves().at(-1).body).candidate_display_name,'Deck Draft Name');assert.ok(await page.locator('.deck-unsaved').isVisible());
 await page.locator('.deck-unsaved').waitFor({state:'hidden',timeout:9000});assert.equal(await page.locator('.deck-hero-name').textContent(),'Deck Draft Name');
 result.saves=true;
 // Notification destinations open their editor in the sheet.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('gamid:notification-navigate',{detail:{destination:'account.my_crew'},cancelable:true})));await page.locator('.deck-sheet-body [data-editor-section=crew].deck-open').waitFor();await deckClose(page);
 // Confirmation dialog: Wall visibility uses the existing dialog, as a bottom sheet on phones.
 await deckOpen(page,'wall');const toggle=page.locator('#wallToggleButton');
 assert.ok(await toggle.isVisible(),'Disable My Wall available for a published Wall');
 {await toggle.click();const dialog=page.locator('#wallToggleDialog[open]');await dialog.waitFor();await page.waitForTimeout(400);const box=await dialog.boundingBox();if(width<600)assert.ok(Math.abs(box.y+box.height-900)<=2&&box.width>=width-2,'bottom sheet on phones: '+JSON.stringify(box)+' '+await dialog.evaluate(d=>{const s=getComputedStyle(d);return [s.margin,s.width,s.maxWidth,s.inset,s.borderRadius,d.className].join(' / ');}));await page.locator('#wallToggleCancel').click();await dialog.waitFor({state:'hidden'});result.dialog=true;}
 await deckClose(page);
 // Classic Preview opens above the deck and Back to Edit keeps a draft.
 await deckOpen(page,'bio');await page.locator('#profileBio').fill('Kept through Classic Preview');await deckClose(page);
 await page.locator('#previewClassicButton').click();await page.locator('.classic-preview-dialog[open]').waitFor();await page.getByRole('button',{name:'Back to Edit',exact:true}).click();await page.locator('.classic-preview-dialog iframe').waitFor({state:'detached'});
 await deckOpen(page,'bio');assert.equal(await page.locator('#profileBio').inputValue(),'Kept through Classic Preview');await deckClose(page);
 result.drafts=true;
 return result;
}
