// Desktop presentation only. Move the live controls, never recreate their drafts or save paths.
// Slots restore the exact original mobile DOM when crossing the 1024px boundary.
import { SOCIAL_PLATFORMS, socialIcon, socialBrandMark, renderPublicSocials } from './socials.js';
import { createIntroPoster,providerAvatar,leagueIcon } from './editor-media.js';
import { applyGameArtwork } from '../public/game-artwork.js';

const paths={
 avatar:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 22v-3a7 7 0 0 1 14 0v3M21 3v4m-2-2h4',
 intro:'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M3 22v-3a7 7 0 0 1 10-6M19 13l5 4-5 4z',
 banner:'M3 4h18v16H3zM3 17l6-6 4 4 3-3 5 5M15 8h.01',
 'about-group':'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M3 22v-3a7 7 0 0 1 10-6M15 21l2-5 5-5 3 3-5 5z',
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
};
function icon(doc,key){
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 26 26');svg.setAttribute('aria-hidden','true');
 const p=doc.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[key]||paths.games);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.7');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.append(p);return svg;
}
export function mountDesktopEditor(doc,sections){
 const root=doc.getElementById('identityView'),win=doc.defaultView,mq=win.matchMedia('(min-width: 1024px)');
 const h=(tag,cls,text)=>{const n=doc.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const shell=h('div','desktop-editor-layout'),side=h('aside','desktop-editor-side'),main=h('div','desktop-editor-main'),grid=h('div','desktop-editor-grid');
 const sideIdentity=h('div','desktop-editor-identity');
 const columns=h('div','desktop-editor-columns'),leftColumn=h('div','desktop-editor-stack'),rightColumn=h('div','desktop-editor-stack');columns.append(leftColumn,rightColumn);
 const columnPlan=[[leftColumn,['avatar','banner','about-group','games','game-display','play']],[rightColumn,['intro','connections','socials','duo','crew']]];
 const head=h('div','desktop-editor-heading'),copy=h('div','');copy.append(h('h3','','Edit Profile Information'),h('p','','Customize your GamID. Changes are saved only when you choose Save.'));head.append(copy);main.append(head,grid);shell.append(side,main);
 const group=h('section','editor-section desktop-about-group');group.dataset.editorSection='about-group';
 const toggle=h('button','section-toggle');toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','desktop-about-panel');
 const glyph=h('span','section-icon'),title=h('span','');glyph.append(icon(doc,'about-group'));title.append(h('strong','','About Me'),h('small','','Manage your profile information · 5 sections'));toggle.append(glyph,title,h('span','section-chevron','›'));
 const panel=h('div','section-panel');panel.id='desktop-about-panel';panel.hidden=true;const groupSummary=h('div','desktop-summary desktop-about-summary');group.append(toggle,groupSummary,panel);
 toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));});
 const nested=['about','roles','education','bio','name'];
 const savedCard=h('section','desktop-saved-card');savedCard.setAttribute('aria-label','Saved profile summary');const savedAvatar=h('div','desktop-saved-avatar'),savedName=h('strong',''),savedHandle=h('span',''),savedLocation=h('span','desktop-saved-location'),savedBio=h('p',''),savedSocials=h('div','desktop-saved-socials');savedCard.append(h('span','desktop-classic-label','CLASSIC'),savedAvatar,savedName,savedHandle,savedLocation,savedBio,savedSocials,h('small','','Your saved profile'));
 const summaries=new Map();
 for(const key of ['avatar','intro','banner','connections','socials','games','game-display','duo','crew']){const summary=h('div','desktop-summary');summaries.set(key,summary);}
 let active=false,slots=[],model={},media=null,poster=null,artwork=null,artKey=null,artGeneration=0;const added=[],oldIcons=new Map(),formAttrs=new Map(),photos=new Map(),failedPhotos=new Set(),failedArt=new Set();
 function decoratePhoto(node,url){if(!node||!url||failedPhotos.has(url))return;if(!photos.has(node))photos.set(node,[...node.childNodes]);let img=node.querySelector('img');const fail=()=>{if(!active)return;failedPhotos.add(url);node.textContent=(node.closest('.connection-head')?.querySelector('strong')?.textContent||'?').slice(0,1);};if(img?.getAttribute('src')===url){if(!img.dataset.desktopGuard){img.dataset.desktopGuard='true';img.addEventListener('error',fail,{once:true});}if(img.complete&&!img.naturalWidth)fail();return;}img=h('img','desktop-provider-photo');img.dataset.desktopGuard='true';img.alt='';img.referrerPolicy='no-referrer';img.addEventListener('error',fail,{once:true});img.src=url;node.replaceChildren(img);}
 function decorateMedia(){
  if(!media)return;poster.update({enabled:active,savedKey:model.introSavedKey,localURL:model.introURL});
  for(const row of sections.get('connections').panel.querySelectorAll('.connection-card[data-provider]')){const provider=row.dataset.provider;const data=model.connections?.find(r=>r.provider_key===provider&&r.connected);decoratePhoto(row.querySelector('.connection-avatar'),providerAvatar(provider,data?.provider_avatar_url));}
  decoratePhoto(sections.get('league').panel.querySelector('.connection-avatar'),leagueIcon(model.leagueIcon));
  for(const node of photos.keys())if(!node.isConnected)photos.delete(node);
  const owner=media.principal(),signature=owner+'|'+(model.gameKeys||[]).join(',');if(owner&&model.gameCount>0&&artKey!==signature){artKey=signature;const version=++artGeneration;media.artwork().then(data=>{if(active&&version===artGeneration&&owner===media.principal()){artwork=data;queue();}},()=>{});}
  if(artwork){const games=sections.get('games').panel;for(const img of games.querySelectorAll('.game-art'))if(failedArt.has(img.src))img.remove();const safe={...artwork,artwork:Object.fromEntries(Object.entries(artwork.artwork||{}).map(([key,images])=>[key,Object.fromEntries(Object.entries(images).filter(([,url])=>!failedArt.has(url)))]))};applyGameArtwork(games,safe);}
 }
 function move(node,target){if(!node)return;for(const control of node.querySelectorAll('input,select,textarea,button')){if(control.form?.id==='profileForm'&&!formAttrs.has(control)){formAttrs.set(control,control.getAttribute('form'));control.setAttribute('form','profileForm');}}const slot=doc.createComment('desktop editor original position');node.before(slot);slots.push([node,slot]);target.append(node);}
 function associate(){if(!active)return;for(const key of ['avatar','intro','name','bio','roles','education'])for(const control of sections.get(key).panel.querySelectorAll('input,select,textarea,button')){if(!control.form&&!control.closest('form')&&!formAttrs.has(control)){formAttrs.set(control,control.getAttribute('form'));control.setAttribute('form','profileForm');}}}
 function thumbnail(node){const n=h('div','desktop-mini-image');if(node){n.style.backgroundImage=node.style.backgroundImage;const initial=()=>(node.textContent.trim()||node.closest('.game-item')?.querySelector('.game-name')?.textContent||'?').slice(0,2);const img=node.querySelector('.game-art')||node.querySelector('img');if(img&&!failedArt.has(img.src)){const c=img.cloneNode();c.removeAttribute('id');c.alt='';c.addEventListener('error',()=>{c.remove();n.textContent=initial();},{once:true});n.append(c);}else n.textContent=node.style.backgroundImage?'':initial();}return n;}
 function item(label,detail,visual){const n=h('div','desktop-summary-item');if(visual)n.append(visual);const name=h('strong','',label),description=h('small','',detail??'Not added');name.title=label;description.title=detail??'Not added';n.append(name,description);return n;}
 function render(){
  if(!active)return;
  decorateMedia();
  savedName.textContent=model.name||'Your GamID';savedHandle.textContent=model.handle?`@${model.handle}`:'';savedBio.textContent=model.bio||'';savedAvatar.style.backgroundImage=model.avatar?`url("${model.avatar}")`:'';savedAvatar.textContent=model.avatar?'':(model.name||'G').slice(0,1);
  renderPublicSocials(savedSocials,model.savedSocials||[],doc);
  savedLocation.textContent=model.location||'';savedLocation.hidden=!model.location;
  for(const [key,box] of summaries){
   const source=sections.get(key).panel;const children=[];
   if(key==='avatar'){
    children.push(thumbnail(doc.getElementById('profileAvatarThumbnail')));
    const change=h('button','secondary desktop-change','Change Avatar');change.type='button';change.addEventListener('click',()=>{const s=sections.get('avatar');if(s.panel.hidden)s.toggle.click();doc.getElementById('profileAvatarInput').click();});children.push(change);
   }else if(key==='banner'){
    const frame=source.querySelector('.banner-frame');const preview=h('div','desktop-banner-preview');preview.style.backgroundImage=frame?.style.backgroundImage||'';
    const img=frame?.querySelector('.banner-saved'),canvas=frame?.querySelector('canvas');if(img&&!img.hidden){preview.append(img.cloneNode());}else if(canvas){const c=doc.createElement('canvas');c.width=1920;c.height=320;c.getContext('2d').drawImage(canvas,0,0);preview.append(c);}children.push(preview);
    const actions=h('div','desktop-summary-actions');for(const [label,id] of [['Change Banner','bannerInput'],['Remove','bannerRemove']]){const original=doc.getElementById(id);if(!original||(label==='Remove'&&original.hidden))continue;const b=h('button',label==='Remove'?'secondary danger':'secondary',label);b.type='button';b.disabled=original.disabled;b.addEventListener('click',()=>{const s=sections.get('banner');if(s.panel.hidden)s.toggle.click();original.click();});actions.append(b);}children.push(actions);
   }else if(key==='intro'){
    const state=doc.getElementById('introSectionSummary').textContent;const preview=h('button','desktop-intro-preview');preview.type='button';preview.disabled=doc.getElementById('previewIntroButton').disabled;const thumb=poster?.state;if(thumb?.url){const img=h('img','');img.src=thumb.url;img.alt='Your Intro video thumbnail';preview.append(img);}else{preview.append(icon(doc,'intro'));if(thumb?.status==='loading')preview.append(h('small','','Preparing thumbnail…'));if(thumb?.status==='unavailable')preview.append(h('small','','Thumbnail unavailable. Preview Intro is still available.'));}preview.append(h('span','',state),h('small','','Preview Intro'));preview.addEventListener('click',()=>doc.getElementById('previewIntroButton').click());children.push(preview);
   }else if(key==='socials'){
    for(const platform of SOCIAL_PLATFORMS){const draft=model.socials||[];children.push(item(platform.label,draft.some(r=>r.platform===platform.key)?'Added':'Not added',socialIcon(doc,platform.key)));}
   }else if(key==='connections'){
    for(const row of source.querySelectorAll('.connection-head')){const provider=row.closest('.connection-card')?.dataset.provider;const label=row.querySelector('strong')?.textContent||({discord:'Discord',steam:'Steam'}[provider])||'Account';const photo=row.querySelector('.connection-avatar');children.push(item(label,[row.querySelector('.connection-name')?.textContent,row.querySelector('.connection-chip')?.textContent].filter(Boolean).join(' · '),provider==='discord'&&!photo?.querySelector('img')?socialIcon(doc,'discord'):thumbnail(photo)));}
   }else if(key==='games'){
    const rows=[...source.querySelectorAll('.game-library > .game-item,.game-library .game-item')];for(const row of rows.slice(0,5))children.push(item(row.querySelector('.game-name')?.textContent||'Game','',thumbnail(row.querySelector('.game-icon'))));
    children.push(h('p','desktop-summary-note',`${model.gameCount??rows.length} games · ${model.favoriteCount??source.querySelectorAll('.favorite-toggle.is-on').length}/4 favorites`));
   }else if(key==='game-display'){
    for(const s of source.querySelectorAll('[role="switch"]'))children.push(item(s.getAttribute('aria-label')?.replace(/ on my GamID/i,'')||'Visibility',s.getAttribute('aria-checked')==='true'?'ON':'OFF'));
   }else if(key==='duo'){
    const person=source.querySelector('.is-duo .duo-person');if(person){const summary=item(person.querySelector('strong')?.textContent||'My Duo',person.querySelector('.duo-handle')?.textContent,thumbnail(person.querySelector('.duo-avatar')));summary.classList.add('desktop-duo-summary');children.push(summary);const badge=source.querySelector('.is-duo .identity-rel-badge-text');if(badge)children.push(h('small','desktop-summary-note',badge.textContent.trim()));}
   }else if(key==='crew'){
    const crews=[...source.querySelectorAll('.crew-card')];for(const card of crews.slice(0,3))children.push(item(card.querySelector('.crew-name')?.textContent||'Crew',[card.querySelector('.crew-game')?.textContent,card.querySelector('.crew-count')?.textContent].filter(Boolean).join(' · ')));if(crews.length>3)children.push(h('p','desktop-summary-note',`${crews.length} crews · Open to see all`));
   }
   if(!children.length)children.push(h('p','desktop-summary-note',sections.get(key).status.textContent));box.replaceChildren(...children);
  }
  const about=sections.get('about').panel;
  const values=[...about.querySelectorAll('.about-location input')].map(i=>i.value).filter(Boolean).join(', ');
  const checked=label=>[...about.querySelectorAll(`[data-about-group="${label}"] input:checked`)].map(i=>i.closest('label')?.textContent.trim()).join(', ');
  groupSummary.replaceChildren(item('Location',values||'Not added',icon(doc,'about')),item('Languages',checked('Languages')||'Not added',icon(doc,'socials')),item('Game Genres',checked('Favorite Genres')||'Not added',icon(doc,'games')),item('Education & Work',sections.get('education').status.textContent,icon(doc,'education')),item('Bio & Identity',model.name||'Not added',icon(doc,'bio')));
 }
 function enable(){
  if(active)return;active=true;root.classList.add('desktop-editor');root.append(shell);
  for(const platform of SOCIAL_PLATFORMS){const mark=socialBrandMark(platform.key);if(mark)root.style.setProperty(`--desktop-${platform.key}-mark`,mark);}
  side.prepend(sideIdentity);for(const node of [root.querySelector(':scope > .eyebrow'),root.querySelector(':scope > h2'),root.querySelector(':scope > .lede')])move(node,sideIdentity);
  for(const node of [root.querySelector('.classic-preview-entry'),root.querySelector('.gamid-publication'),sections.get('share').card,sections.get('wall').card])move(node,side);side.append(savedCard);
  move(doc.getElementById('saveAllBar'),head);
  grid.append(columns);
  sections.set('about-group',{card:group,panel,toggle,status:title.querySelector('small')});
  for(const key of nested)move(sections.get(key).card,panel);
  // One stable column flow for every card, not a mixture of shared rows and stacks.
  // Original nodes keep their slots; restoring mobile never depends on this Desktop order.
  for(const [column,keys] of columnPlan)for(const key of keys){if(key==='about-group')column.append(group);else move(sections.get(key).card,column);}
  sections.get('play').card.classList.add('desktop-play-static');
  const playGlyph=h('span','section-icon desktop-play-glyph');playGlyph.append(icon(doc,'games'));sections.get('play').panel.querySelector('.play-together-entry').prepend(playGlyph);added.push(playGlyph);
  for(const [key,s] of sections){if(key==='about-group')continue;const old=s.toggle.querySelector('.section-icon');if(old){oldIcons.set(old,[...old.childNodes]);old.replaceChildren(icon(doc,key));}}
  for(const [key,summary] of summaries){const s=sections.get(key);s.toggle.after(summary);added.push(summary);}
  associate();render();
 }
 function disable(){
  poster?.clear();artGeneration++;artKey=null;artwork=null;for(const [node,children] of photos)if(node.isConnected)node.replaceChildren(...children);photos.clear();for(const image of sections.get('games').panel.querySelectorAll('.game-art'))image.remove();
  if(!active)return;active=false;for(const [node,slot] of slots.reverse()){slot.replaceWith(node);}slots=[];shell.remove();group.remove();savedCard.remove();added.splice(0).forEach(n=>n.remove());for(const [node,children] of oldIcons)node.replaceChildren(...children);oldIcons.clear();for(const [control,value] of formAttrs){if(value===null)control.removeAttribute('form');else control.setAttribute('form',value);}formAttrs.clear();sections.delete('about-group');root.classList.remove('desktop-editor');sections.get('play').card.classList.remove('desktop-play-static');
 }
 const sync=()=>mq.matches?enable():disable();mq.addEventListener('change',sync);sync();
 // Only original panels are observed; summary rendering cannot trigger its own observer.
 let queued=false;const queue=()=>{if(!active)return;associate();if(queued)return;queued=true;win.requestAnimationFrame(()=>{queued=false;render();});};
 for(const [key,s] of sections){if(key!=='about-group')new win.MutationObserver(queue).observe(s.panel,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','aria-checked','disabled']});}
 root.addEventListener('input',queue);root.addEventListener('change',queue);
 root.addEventListener('error',event=>{if(event.target.matches?.('img.game-art')){failedArt.add(event.target.src);queue();}},true);
 return {configureMedia(config){media=config;poster=createIntroPoster({resolveSaved:config.savedIntro,principal:config.principal,onChange:()=>queue()});queue();},clearMedia(){poster?.clear();artGeneration++;artKey=null;artwork=null;failedPhotos.clear();failedArt.clear();for(const [node,children] of photos)if(node.isConnected)node.replaceChildren(...children);photos.clear();if(!media?.principal()){model.introSavedKey=null;model.introURL=null;model.connections=null;model.leagueIcon=null;}queue();},update(next){model={...model,...next};queue();},setAbout(row){const country=row?.catalogs?.countries?.find(c=>(c.country_code||c.code)===row.about_country_code);model.location=row?.show_location?[row.about_city_name,country?.name||country?.label||row.about_country_code||row.legacy_location].filter(Boolean).join(', '):'';queue();}};
}
