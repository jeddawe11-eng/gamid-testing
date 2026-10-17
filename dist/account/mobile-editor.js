// Mobile V2 "Profile Deck": presentation only, below 1024px. Like desktop-editor.js it moves the live section cards (never
// recreating a draft, control or save path) and restores the exact original DOM when the width reaches 1024px.
// Deck = identity hero, section chips, six group cards with summaries; one editor at a time in a full-screen sheet.
import { SOCIAL_PLATFORMS, socialIcon } from './socials.js';

const paths={
 avatar:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 22v-3a7 7 0 0 1 14 0v3M21 3v4m-2-2h4',
 intro:'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M3 22v-3a7 7 0 0 1 10-6M19 13l5 4-5 4z',
 banner:'M3 4h18v16H3zM3 17l6-6 4 4 3-3 5 5M15 8h.01',
 about:'M12 23s8-8 8-14a8 8 0 1 0-16 0c0 6 8 14 8 14M12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
 roles:'M6 7h12l4 11-3 2-4-4H9l-4 4-3-2zM7 10v5m-2-2h4M16 11h.01M19 14h.01',
 education:'M1 8l11-6 11 6-11 6zM5 11v7l7 4 7-4v-7M23 8v10',
 bio:'M4 2h12l4 4v16H4zM8 8h6M8 12h8M8 16h5',
 name:'M2 4h20v16H2zM8 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4M5 17v-1a3 3 0 0 1 6 0v1M14 9h5M14 14h5',
 socials:'M6 12l12-7M6 12l12 7M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
 connections:'M9 15l6-6M8 12l-4 4a4 4 0 0 0 6 6l4-4M10 6l4-4a4 4 0 0 1 6 6l-4 4',
 games:'M6 7h12l4 11-3 2-4-4H9l-4 4-3-2zM7 10v5m-2-2h4M17 11h.01M19 14h.01',
 'game-display':'M4 22V12h4v10M11 22V7h4v15M18 22V2h4v20',
 duo:'M8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M18 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M1 22v-4a7 7 0 0 1 14 0v4M16 12a7 7 0 0 1 7 6v4',
 crew:'M12 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 11a3 3 0 1 0 0-6M19 11a3 3 0 1 0 0-6M5 22v-4a7 7 0 0 1 14 0v4M1 20v-4M23 20v-4',
 wall:'M2 3h20v18H2zM2 9h20M10 3v6M15 9v6M2 15h20M8 15v6',
 share:'M5 19L19 5M9 5h10v10',
 back:'M16 4l-8 9 8 9',
 next:'M10 4l8 9-8 9',
};
// Groups follow the accepted Desktop pairs; Play & Community keeps Play Together, My Duo and My Crew together.
export const DECK_GROUPS=Object.freeze([
 {id:'media',chip:'Media',title:'Profile media',cards:['avatar','intro','banner']},
 {id:'about',chip:'About',title:'About Me',cards:['about-group']},
 {id:'social',chip:'Social',title:'Socials & Connections',cards:['connections','socials']},
 {id:'games',chip:'Games',title:'Games',cards:['games','game-display']},
 {id:'play',chip:'Play',title:'Play & Community',cards:['play','duo','crew']},
 {id:'wall',chip:'Wall',title:'My Wall',cards:['wall']},
]);
export const DECK_NESTED=Object.freeze(['about','roles','education','bio','name']);
const NESTED_LABEL={about:'About Me',roles:'Gaming Roles',education:'Education & Work',bio:'Bio',name:'Identity'};
// Editors shown in the sheet: every Desktop editing section plus Share (opened from the hero).
const SHEET_KEYS=['avatar','intro','banner',...DECK_NESTED,'connections','socials','games','game-display','duo','crew','wall','share'];
// Unsaved sections are named in the Desktop order.
const DIRTY_ORDER=['avatar','intro','banner',...DECK_NESTED,'connections','socials','game-display','duo'];
// Which deck editor owns a key; League stays nested in Connections, the About Me parts in the About Me group.
export function deckOwner(key){return DECK_NESTED.includes(key)?'about-group':key==='league'?'connections':key;}

export function mountMobileEditor(doc,sections,{onLeave=()=>{}}={}){
 const root=doc.getElementById('identityView'),win=doc.defaultView,mq=win.matchMedia('(min-width: 1024px)');
 const h=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const svg=key=>{const s=doc.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 26 26');s.setAttribute('aria-hidden','true');const p=doc.createElementNS(s.namespaceURI,'path');p.setAttribute('d',paths[key]||paths.games);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.7');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');s.append(p);return s;};
 // The Intro toggle's original heading is upper case ("YOUR INTRO"); the deck uses the Desktop wording.
 const title=key=>key==='about-group'?'About Me':DECK_NESTED.includes(key)?NESTED_LABEL[key]:key==='intro'?'Your Intro':sections.get(key)?.toggle.querySelector('strong')?.textContent.trim()||key;
 const statusText=key=>sections.get(key)?.status?.textContent.trim()||'';
 const isDirty=key=>key==='about-group'?DECK_NESTED.some(isDirty):sections.get(key)?.card.dataset.dirty==='true'||(key==='connections'&&isDirty('league'));

 // Deck structure (built once, attached only while active).
 const deck=h('div','deck-layout'),hero=h('section','deck-hero'),nav=h('nav','deck-nav'),groupsBox=h('div','deck-groups');
 nav.setAttribute('aria-label','YOUR GAMID sections');
 const heroBanner=h('div','deck-hero-banner'),heroBody=h('div','deck-hero-body'),heroTop=h('div','deck-hero-identity'),heroAvatar=h('span','deck-hero-avatar'),heroNames=h('div','deck-hero-names'),heroName=h('strong','deck-hero-name'),heroHandle=h('span','deck-hero-handle'),heroTitle=h('div','deck-hero-title'),heroStatus=h('div','deck-hero-status'),heroActions=h('div','deck-hero-actions');
 heroAvatar.setAttribute('aria-hidden','true');heroNames.append(heroName,heroHandle);heroTop.append(heroAvatar,heroNames);
 const shareButton=h('button','secondary deck-share-button');shareButton.type='button';shareButton.append(svg('share'),h('span','','Share'));shareButton.dataset.deckOpen='share';
 heroBody.append(heroTop,heroStatus,heroActions);hero.append(heroBanner,heroBody);hero.setAttribute('aria-label','Your GamID');
 const chips=new Map(),groupNodes=new Map(),cards=new Map(),aboutRows=new Map();
 for(const group of DECK_GROUPS){
  const chip=h('a','deck-chip',group.chip);chip.href='#deck-'+group.id;chip.dataset.deckGroup=group.id;chips.set(group.id,chip);nav.append(chip);
  const section=h('section','deck-group');section.id='deck-'+group.id;section.dataset.deckGroup=group.id;section.setAttribute('aria-labelledby','deck-title-'+group.id);
  const heading=h('h3','deck-group-title',group.title);heading.id='deck-title-'+group.id;const grid=h('div','deck-group-grid');section.append(heading,grid);groupNodes.set(group.id,{section,grid});groupsBox.append(section);
  for(const key of group.cards){
   if(key==='play'){const slot=h('div','deck-play-slot');cards.set(key,{node:slot});grid.append(slot);continue;}
   if(key==='about-group'){
    const box=h('div','deck-card deck-about-card');box.dataset.deckCard=key;
    for(const part of DECK_NESTED){const row=h('button','deck-about-row');row.type='button';row.dataset.deckOpen=part;const icon=h('span','deck-card-icon');icon.append(svg(part));const copy=h('span','deck-card-copy'),name=h('strong','',NESTED_LABEL[part]),detail=h('small','');copy.append(name,detail);const pill=h('span','deck-pill','UNSAVED');pill.hidden=true;const chevron=h('span','deck-chevron');chevron.append(svg('next'));row.append(icon,copy,pill,chevron);aboutRows.set(part,{row,detail,pill});box.append(row);}
    cards.set(key,{node:box});grid.append(box);continue;
   }
   const card=h('button','deck-card');card.type='button';card.dataset.deckOpen=key;card.dataset.deckCard=key;
   const head=h('span','deck-card-head'),icon=h('span','deck-card-icon');icon.append(svg(key));const copy=h('span','deck-card-copy'),name=h('strong','',title(key)),detail=h('small','');copy.append(name,detail);
   const pill=h('span','deck-pill','UNSAVED');pill.hidden=true;const chevron=h('span','deck-chevron');chevron.append(svg('next'));head.append(icon,copy,pill,chevron);
   const visual=h('span','deck-card-visual');card.append(head,visual);cards.set(key,{node:card,name,detail,pill,visual});grid.append(card);
  }
 }
 // Unsaved bar: visible only while a section has something to save, Save All runs or its result is still shown.
 const bar=h('div','deck-unsaved'),barCopy=h('button','deck-unsaved-copy'),barCount=h('strong',''),barList=h('small','');barCopy.type='button';barCopy.append(barCount,barList);bar.append(barCopy);bar.hidden=true;
 bar.setAttribute('role','region');bar.setAttribute('aria-label','Unsaved changes');
 // Editor sheet: one live section at a time. Back keeps every draft; only Save Changes or Save All save.
 const sheet=h('div','deck-sheet'),sheetPanel=h('div','deck-sheet-panel'),sheetHead=h('div','deck-sheet-head'),back=h('button','deck-back'),sheetCopy=h('div','deck-sheet-copy'),sheetTitle=h('h3','deck-sheet-title'),sheetSub=h('p','deck-sheet-sub'),sheetPill=h('span','deck-pill','UNSAVED'),tabs=h('div','deck-tabs'),sheetBody=h('div','deck-sheet-body');
 sheet.hidden=true;sheetPanel.setAttribute('role','dialog');sheetPanel.setAttribute('aria-modal','true');sheetPanel.setAttribute('aria-labelledby','deckSheetTitle');sheetTitle.id='deckSheetTitle';sheetTitle.tabIndex=-1;
 back.type='button';back.setAttribute('aria-label','Back to YOUR GAMID');back.append(svg('back'));sheetPill.hidden=true;sheetCopy.append(sheetTitle,sheetSub);sheetHead.append(back,sheetCopy,sheetPill);
 tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','About Me parts');tabs.hidden=true;const tabButtons=new Map();
 for(const part of DECK_NESTED){const tab=h('button','deck-tab',NESTED_LABEL[part]);tab.type='button';tab.setAttribute('role','tab');tab.id='deck-tab-'+part;tab.dataset.deckTab=part;tabButtons.set(part,tab);tabs.append(tab);}
 sheetHead.append(tabs);sheetPanel.append(sheetHead,sheetBody);sheet.append(sheetPanel);
 const store=h('div','deck-store');store.hidden=true;
 deck.append(heroTitle,hero,nav,groupsBox,bar,sheet,store);

 let active=false,slots=[],model={},openKey=null,openPart=null,trigger=null,pushed=false,pendingOpen=null;const formAttrs=new Map(),priorOpen=new Map(),inertNodes=[];
 const reduced=()=>win.matchMedia('(prefers-reduced-motion: reduce)').matches;
 function expanded(key,on){const s=sections.get(key);if(!s)return;s.panel.hidden=!on;s.toggle.setAttribute('aria-expanded',String(on));}
 function move(node,target){if(!node)return;for(const control of node.querySelectorAll('input,select,textarea,button')){if(control.form?.id==='profileForm'&&!formAttrs.has(control)){formAttrs.set(control,control.getAttribute('form'));control.setAttribute('form','profileForm');}}const slot=doc.createComment('mobile deck original position');node.before(slot);slots.push([node,slot]);target.append(node);}
 // Controls added later inside the profile form sections (role choices, Intro inputs) keep their form ownership too.
 function associate(){if(!active)return;for(const key of ['avatar','intro','name','bio','roles','education'])for(const control of sections.get(key)?.panel.querySelectorAll('input,select,textarea,button')||[]){if(!control.form&&!control.closest('form')&&!formAttrs.has(control)){formAttrs.set(control,control.getAttribute('form'));control.setAttribute('form','profileForm');}}}
 function thumb(node,cls='deck-thumb'){const n=h('span',cls);n.setAttribute('aria-hidden','true');if(!node){n.textContent='?';return n;}const img=node.querySelector('img');if(node.style.backgroundImage)n.style.backgroundImage=node.style.backgroundImage;else if(img?.src&&img.complete&&img.naturalWidth){const c=img.cloneNode();c.removeAttribute('id');c.alt='';n.append(c);}else n.textContent=(node.textContent.trim()||node.closest('.game-item')?.querySelector('.game-name')?.textContent||'?').slice(0,2);return n;}
 function bannerVisual(cls,{saved=false}={}){
  const frame=sections.get('banner')?.panel.querySelector('.banner-frame'),box=h('span',cls);box.setAttribute('aria-hidden','true');if(!frame)return box;
  const img=frame.querySelector('.banner-saved'),canvas=frame.querySelector('canvas');
  if(img&&!img.hidden&&img.getAttribute('src')){const c=img.cloneNode();c.alt='';box.append(c);}
  else if(!saved&&canvas&&!frame.classList.contains('is-empty')){const c=doc.createElement('canvas');c.width=canvas.width;c.height=canvas.height;try{c.getContext('2d')?.drawImage(canvas,0,0);}catch{}box.append(c);}
  else box.classList.add('is-empty');return box;
 }
 function chip(text,on){const n=h('span','deck-chip-state'+(on?' is-on':''),text);return n;}
 function renderCard(key){
  const card=cards.get(key);if(!card?.detail)return;const s=sections.get(key);if(!s)return;
  card.node.hidden=s.card.hidden;card.pill.hidden=!isDirty(key);card.detail.textContent=statusText(key);
  const v=[];
  if(key==='avatar')v.push(thumb(doc.getElementById('profileAvatarThumbnail'),'deck-avatar-thumb'));
  else if(key==='intro'){const tile=h('span','deck-intro-tile');tile.setAttribute('aria-hidden','true');tile.append(svg('intro'));v.push(tile);}
  else if(key==='banner')v.push(bannerVisual('deck-banner-thumb'));
  else if(key==='socials'){const draft=model.socials||[];const added=SOCIAL_PLATFORMS.filter(p=>draft.some(r=>r.platform===p.key));const marks=h('span','deck-marks');for(const p of added.slice(0,8)){const m=h('span','deck-mark');m.append(socialIcon(doc,p.key));m.title=p.label;marks.append(m);}if(added.length>8)marks.append(h('span','deck-mark deck-more','+'+(added.length-8)));v.push(marks,h('span','deck-note',`${added.length} of ${SOCIAL_PLATFORMS.length} platforms added`));}
  else if(key==='connections'){const list=h('span','deck-rows');for(const row of s.panel.querySelectorAll('.connection-card[data-provider] .connection-head')){const label=row.querySelector('strong')?.textContent.trim()||'Account';const state=[row.querySelector('.connection-name')?.textContent,row.querySelector('.connection-chip')?.textContent].filter(Boolean).map(t=>t.trim()).join(' · ');const line=h('span','deck-row');line.append(h('strong','',label),h('small','',state||'Not connected'));list.append(line);}const league=sections.get('league');if(league&&!league.card.hidden){const line=h('span','deck-row'),state=statusText('league');line.append(h('strong','',title('league')),h('small','',state&&state!==title('league')?state:'Prototype'));list.append(line);}v.push(list);}
  else if(key==='games'){const rows=[...s.panel.querySelectorAll('.game-library .game-item')];const strip=h('span','deck-covers');for(const row of rows.slice(0,4))strip.append(thumb(row.querySelector('.game-icon'),'deck-cover'));const total=model.gameCount??rows.length;if(total>4)strip.append(h('span','deck-cover deck-more','+'+(total-4)));if(rows.length)v.push(strip);v.push(h('span','deck-note',`${total} game${total===1?'':'s'} · ${model.favoriteCount??s.panel.querySelectorAll('.favorite-toggle.is-on').length}/4 favorites`));}
  else if(key==='game-display'){const list=h('span','deck-chips');for(const sw of s.panel.querySelectorAll('[role="switch"]'))list.append(chip(`${(sw.getAttribute('aria-label')||'Visibility').replace(/ on my GamID/i,'')} ${sw.getAttribute('aria-checked')==='true'?'ON':'OFF'}`,sw.getAttribute('aria-checked')==='true'));if(list.childElementCount)v.push(list);}
  else if(key==='duo'){const person=s.panel.querySelector('.is-duo .duo-person');if(person){const line=h('span','deck-person');line.append(thumb(person.querySelector('.duo-avatar'),'deck-person-avatar'),h('strong','',person.querySelector('strong')?.textContent.trim()||'My Duo'),h('small','',person.querySelector('.duo-handle')?.textContent.trim()||''));v.push(line);}}
  else if(key==='crew'){const crews=[...s.panel.querySelectorAll('.crew-card[data-crew]')];const list=h('span','deck-rows');for(const crew of crews.slice(0,2)){const line=h('span','deck-row');line.append(h('strong','',crew.querySelector('.crew-name')?.textContent.trim()||'Crew'),h('small','',[crew.querySelector('.crew-game')?.textContent,crew.querySelector('.crew-count')?.textContent].filter(Boolean).map(t=>t.trim()).join(' · ')));list.append(line);}if(crews.length)v.push(list);if(crews.length>2)v.push(h('span','deck-note',`+${crews.length-2} more Crew${crews.length-2===1?'':'s'}`));}
  else if(key==='wall'){const state=doc.getElementById('wallState')?.textContent.trim();if(state)card.detail.textContent=state;}
  card.visual.replaceChildren(...v);card.visual.hidden=!v.length;
 }
 function render(){
  if(!active)return;associate();
  heroName.textContent=model.name||'Your GamID';heroHandle.textContent=model.handle?'@'+model.handle:'';
  heroAvatar.style.backgroundImage=model.avatar?`url("${model.avatar}")`:'';heroAvatar.textContent=model.avatar?'':(model.name||model.handle||'G').slice(0,1).toUpperCase();
  heroBanner.replaceChildren(bannerVisual('deck-hero-banner-image',{saved:true}));
  heroStatus.dataset.action=(doc.getElementById('visibilityToggle')?.textContent||'').trim().toLowerCase();
  for(const key of cards.keys())renderCard(key);
  for(const [part,{detail,pill}] of aboutRows){detail.textContent=statusText(part);pill.hidden=!isDirty(part);}
  const named=DIRTY_ORDER.filter(isDirty).map(title);
  const saveAll=doc.getElementById('saveAllButton'),feedback=doc.getElementById('saveAllFeedback');
  const running=saveAll?.textContent.trim()==='Saving…',shown=feedback&&!feedback.hidden;
  barCount.textContent=named.length?`${named.length} section${named.length===1?'':'s'} unsaved`:running?'Saving…':'Save All';barList.textContent=named.length?named.join(' · '):'';barCopy.disabled=!named.length;
  bar.hidden=Boolean(openKey)||!(named.length||running||shown);deck.classList.toggle('has-unsaved',!bar.hidden);
  if(openKey){sheetPill.hidden=!isDirty(openKey==='about-group'?openPart:openKey);if(openKey==='about-group')for(const [part,tab] of tabButtons)tab.classList.toggle('is-dirty',isDirty(part));}
 }
 let queued=false;const queue=()=>{if(!active||queued)return;queued=true;win.requestAnimationFrame(()=>{queued=false;render();});};
 function heroAction(){const preview=root.querySelector('.classic-preview-entry'),publication=root.querySelector('.gamid-publication');return {preview,publication};}
 // Sheet lifecycle.
 function setInert(on){if(on){for(const node of [heroTitle,hero,nav,groupsBox,bar,doc.querySelector('.site-head')])if(node&&!node.inert){node.inert=true;inertNodes.push(node);}}else{inertNodes.splice(0).forEach(n=>{n.inert=false;});}}
 function selectPart(part){openPart=part;for(const key of DECK_NESTED){const on=key===part;sections.get(key)?.card.classList.toggle('deck-open',on);expanded(key,on);const tab=tabButtons.get(key);tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;}const s=sections.get(part);if(s){s.panel.setAttribute('role','tabpanel');s.panel.setAttribute('aria-labelledby','deck-tab-'+part);}sheetSub.textContent=`${NESTED_LABEL[part]} · each part saves on its own`;queue();}
 function open(key,{part=null,from=null,history:useHistory=true}={}){
  if(!active)return false;const owner=deckOwner(key);if(!SHEET_KEYS.includes(owner)&&owner!=='about-group')return false;
  if(openKey&&openKey!==owner)collapse();
  openKey=owner;trigger=from||trigger;
  for(const k of [...SHEET_KEYS,'about-group'])if(k!==owner&&!(owner==='about-group'&&DECK_NESTED.includes(k)))sections.get(k)?.card.classList.remove('deck-open');
  if(owner==='about-group'){tabs.hidden=false;sheetTitle.textContent='About Me';selectPart(DECK_NESTED.includes(key)?key:part||openPart||'about');}
  else{tabs.hidden=true;const s=sections.get(owner);s.card.classList.add('deck-open');expanded(owner,true);if(owner==='connections'&&sections.get('league'))expanded('league',true);sheetTitle.textContent=title(owner);sheetSub.textContent=({share:'Link and QR code',wall:'Design, publish and visibility',connections:'Gaming accounts'})[owner]||statusText(owner);}
  if(sheet.hidden){sheet.hidden=false;doc.documentElement.classList.add('deck-sheet-open');setInert(true);sheetBody.scrollTop=0;if(useHistory){try{win.history.pushState({...(win.history.state||{}),gamidDeckSheet:owner},'');pushed=true;}catch{pushed=false;}}}
  sheetTitle.focus({preventScroll:true});queue();return true;
 }
 function collapse(){if(!openKey)return;if(openKey==='about-group'){for(const key of DECK_NESTED){sections.get(key)?.card.classList.remove('deck-open');expanded(key,false);const s=sections.get(key);s?.panel.removeAttribute('role');s?.panel.removeAttribute('aria-labelledby');}}else{sections.get(openKey)?.card.classList.remove('deck-open');expanded(openKey,false);if(openKey==='connections')expanded('league',false);}}
 function close({fromHistory=false,restoreFocus=true}={}){
  if(!openKey)return;const key=openKey;collapse();openKey=null;sheet.hidden=true;tabs.hidden=true;doc.documentElement.classList.remove('deck-sheet-open');setInert(false);
  if(pushed&&!fromHistory&&win.history.state?.gamidDeckSheet){pushed=false;win.history.back();}pushed=false;
  if(restoreFocus){const target=(trigger?.isConnected&&trigger)||deck.querySelector(`[data-deck-open="${key}"]`);target?.focus?.({preventScroll:false});}trigger=null;queue();
 }
 back.addEventListener('click',()=>close());
 sheet.addEventListener('keydown',event=>{if(event.key==='Escape'&&!doc.querySelector('dialog[open]')){event.preventDefault();close();}});
 tabs.addEventListener('click',event=>{const tab=event.target.closest('[data-deck-tab]');if(tab){selectPart(tab.dataset.deckTab);sheetBody.scrollTop=0;}});
 tabs.addEventListener('keydown',event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const i=DECK_NESTED.indexOf(openPart),rtl=win.getComputedStyle(tabs).direction==='rtl';const step=(event.key==='ArrowRight')!==rtl?1:-1;const next=event.key==='Home'?0:event.key==='End'?DECK_NESTED.length-1:(i+step+DECK_NESTED.length)%DECK_NESTED.length;selectPart(DECK_NESTED[next]);tabButtons.get(DECK_NESTED[next]).focus();});
 win.addEventListener('popstate',()=>{if(openKey){pushed=false;close({fromHistory:true});}});
 deck.addEventListener('click',event=>{
  const opener=event.target.closest('[data-deck-open]');if(opener&&deck.contains(opener)&&!sheet.contains(opener)){event.preventDefault();open(opener.dataset.deckOpen,{from:opener});return;}
  const chipLink=event.target.closest('.deck-chip');if(chipLink){event.preventDefault();const g=groupNodes.get(chipLink.dataset.deckGroup);g?.section.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});chosenAt=Date.now();setChip(chipLink.dataset.deckGroup);}
 });
 barCopy.addEventListener('click',()=>{const first=DIRTY_ORDER.find(isDirty);if(first)open(first,{from:barCopy});});
 sheet.addEventListener('click',event=>{if(event.target===sheet)close();});
 // Original section disclosures open the sheet instead (programmatic toggle clicks included).
 root.addEventListener('click',event=>{
  if(!active)return;const button=event.target.closest('.section-toggle');if(!button)return;
  const entry=[...sections].find(([,s])=>s.toggle===button);if(!entry)return;const [key]=entry;if(key==='league'||key==='play'||key==='about-group')return;
  if(!SHEET_KEYS.includes(key))return;event.preventDefault();event.stopImmediatePropagation();
  if(openKey===deckOwner(key)&&(key!=='about-group'&&!DECK_NESTED.includes(key)||openPart===key))return;open(key,{from:button});
 },true);
 // Active chip follows the group in view.
 function setChip(id){for(const [g,c] of chips){const on=g===id;c.classList.toggle('is-active',on);if(on)c.setAttribute('aria-current','true');else c.removeAttribute('aria-current');}const c=chips.get(id);if(c&&nav.scrollWidth>nav.clientWidth){const left=c.offsetLeft-nav.clientWidth/2+c.offsetWidth/2;nav.scrollTo?.({left,behavior:reduced()?'auto':'smooth'});}}
 // A tapped chip stays selected while its smooth scroll settles (a short page may stop before that group reaches the top).
 let chosenAt=0;
 const spy=win.IntersectionObserver?new win.IntersectionObserver(entries=>{if(Date.now()-chosenAt<1200)return;const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(visible)setChip(visible.target.dataset.deckGroup);},{rootMargin:'-30% 0px -60% 0px'}):null;
 function enable(){
  if(active)return;if(root.classList.contains('desktop-editor')){win.setTimeout(sync,0);return;}
  active=true;root.classList.add('mobile-deck');root.prepend(deck);
  for(const [key,s] of sections)priorOpen.set(key,s.toggle.getAttribute('aria-expanded')==='true');
  for(const node of [root.querySelector(':scope > .eyebrow'),root.querySelector(':scope > h2')])move(node,heroTitle);
  move(root.querySelector(':scope > .lede'),store);
  const {preview,publication}=heroAction();move(publication,heroStatus);move(preview,heroActions);heroActions.append(shareButton);
  for(const key of SHEET_KEYS)move(sections.get(key)?.card,sheetBody);
  const play=sections.get('play');if(play){move(play.card,cards.get('play').node);play.card.classList.add('deck-play-static');expanded('play',true);}
  move(doc.getElementById('saveAllBar'),bar);
  for(const node of root.querySelectorAll(':scope > .editor-group-label'))move(node,store);
  for(const key of SHEET_KEYS)expanded(key,false);
  for(const group of groupNodes.values())spy?.observe(group.section);setChip('media');
  associate();render();
  if(pendingOpen){const key=pendingOpen;pendingOpen=null;open(key);}
 }
 function disable(){
  if(!active)return;const leaving=openKey==='about-group'?openPart:openKey;close({restoreFocus:false});spy?.disconnect();active=false;
  for(const [node,slot] of slots.reverse())slot.replaceWith(node);slots=[];shareButton.remove();deck.remove();root.classList.remove('mobile-deck');
  sections.get('play')?.card.classList.remove('deck-play-static');
  for(const [control,value] of formAttrs){if(value===null)control.removeAttribute('form');else control.setAttribute('form',value);}formAttrs.clear();
  for(const [key,on] of priorOpen)expanded(key,on);priorOpen.clear();
  if(leaving)onLeave(leaving);
 }
 // Before Desktop tears down (going below 1024px), remember its open editor so the same editor opens as a sheet.
 function desktopOpenKey(){if(!root.classList.contains('desktop-editor'))return null;const nested=DECK_NESTED.find(k=>sections.get(k)?.toggle.getAttribute('aria-expanded')==='true'&&sections.get('about-group')?.toggle.getAttribute('aria-expanded')==='true');if(nested)return nested;return ['avatar','intro','banner','connections','socials','games','game-display','duo','crew','wall'].find(k=>sections.get(k)?.toggle.getAttribute('aria-expanded')==='true')||null;}
 function sync(){if(mq.matches)disable();else enable();}
 mq.addEventListener('change',()=>{if(mq.matches){disable();return;}pendingOpen=desktopOpenKey();win.setTimeout(sync,0);});
 sync();
 for(const [,s] of sections)new win.MutationObserver(queue).observe(s.card,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-dirty','hidden','style','aria-checked','src','class']});
 const saveAllBar=doc.getElementById('saveAllBar');if(saveAllBar)new win.MutationObserver(queue).observe(saveAllBar,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','disabled']});
 const wallState=doc.getElementById('wallState');if(wallState)new win.MutationObserver(queue).observe(wallState,{childList:true,characterData:true,subtree:true});
 root.addEventListener('input',queue);root.addEventListener('change',queue);
 return {
  get active(){return active;},
  reveal(key){if(!active)return false;if(key==='play'){groupNodes.get('play')?.section.scrollIntoView({block:'start'});return true;}return open(key);},
  close:()=>close(),
  update(next){model={...model,...next};if(next&&!next.handle&&'handle' in next&&openKey)close({restoreFocus:false});queue();},
  setAbout(){queue();},
  clearMedia(){queue();},
 };
}
