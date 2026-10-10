// Shared Profile Editor layout and section save contract. No new backend or storage.
export const SECTION_FIELDS = Object.freeze({name:['displayName'],bio:['bio'],avatar:['avatarPath'],roles:['roleKeys','primaryRoleKey'],education:['educationWorkStatus','institution','fieldOfStudy']});
export function sectionDraft(saved,draft,section) {
 if(!SECTION_FIELDS[section]) throw Error('UNKNOWN_PROFILE_SECTION');
 const next={...saved}; for(const field of SECTION_FIELDS[section]) next[field]=draft[field]; return next;
}
export function sectionChanged(saved,draft,section) {
 return SECTION_FIELDS[section]?.some(field=>JSON.stringify(saved?.[field])!==JSON.stringify(draft?.[field])) || false;
}
// Whole-profile RPCs must be serialized and merge against the most recent saved state.
export function createSectionSaveQueue() {
 let tail=Promise.resolve(); const pending=new Map();
 return {run(key,work){if(pending.has(key))return pending.get(key);const job=tail.then(work);pending.set(key,job);tail=job.catch(()=>{});job.finally(()=>{if(pending.get(key)===job)pending.delete(key);}).catch(()=>{});return job;},has:key=>pending.has(key),get busy(){return pending.size>0;}};
}
export function mountProfileEditor(doc) {
 const root=doc.getElementById('identityView'); root.dataset.profileEditor='';
 const sections=new Map();
 function wrap(node,key,title,icon,summary='') {
  if(!node)return null;
  const card=doc.createElement('section');card.className='editor-section';card.dataset.editorSection=key;
  const toggle=doc.createElement('button');toggle.type='button';toggle.className='section-toggle';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','editor-'+key);
  const glyph=doc.createElement('span');glyph.className='section-icon';glyph.textContent=icon;glyph.setAttribute('aria-hidden','true');
  const copy=doc.createElement('span'),heading=doc.createElement('strong'),status=doc.createElement('small');heading.textContent=title;status.textContent=summary;status.dataset.editorSummary=key;copy.append(heading,status);
  const arrow=doc.createElement('span');arrow.className='section-chevron';arrow.textContent='›';arrow.setAttribute('aria-hidden','true');toggle.append(glyph,copy,arrow);
  const panel=doc.createElement('div');panel.className='section-panel';panel.id='editor-'+key;panel.hidden=true;
  node.before(card);panel.append(node);card.append(toggle,panel);sections.set(key,{card,panel,toggle,status});return panel;
 }
 for(const [key,id,title,icon,summary] of [['avatar','profileAvatarInput','Avatar','◉','Your profile image'],['name','profileDisplayName','Identity','◇','Display name and permanent handle'],['bio','profileBio','Bio','✎','Tell players about yourself']]){
  const label=doc.getElementById(id).closest('label');const panel=wrap(label,key,title,icon,summary);
  if(key==='name')panel.append(doc.querySelector('.readonly-handle'));
 }
 for(const [key,id] of [['intro','introSectionToggle'],['roles','rolesSectionToggle'],['education','educationSectionToggle']]) {
  const toggle=doc.getElementById(id),panel=doc.getElementById(toggle.getAttribute('aria-controls')),card=toggle.parentElement;card.classList.add('editor-section');card.dataset.editorSection=key;sections.set(key,{card,panel,toggle,status:toggle.querySelector('small')});
 }
 for(const [selector,key,title,icon,summary] of [
  ['.identity-preview','preview','Live Preview','◈','Your current draft'],['.share-section','share','Share your GamID','↗','Link and QR code'],['.play-together-entry:not(.wall-entry)','play','Play Together','🎮','Find your next squad'],['.wall-entry','wall','My Wall','▦','Edit your Wall'],['#duoSection','duo','My Duo','♧','Your Duo and requests'],['#crewSection','crew','My Crew','♧','Your Crews and invitations'],['#myGamesSection','games','My Games','🎮','Games and platforms'],['#gameDisplaySection','game-display','Game Display','◉','Public games, playtime and stats'],['#leagueSection','league','League of Legends','🎮','Your connected League profile'],['#connectionsSection','connections','Connections','⌁','Gaming accounts'],['#bannerSection','banner','Banner','▭','Wide picture for large screens'],['#aboutSection','about','About Me','ⓘ','Location, languages, genres'],['#socialsSection','socials','My Socials','🔗','Your social accounts']]) {
  const node=doc.querySelector(selector);const panel=wrap(node,key,title,icon,summary);
  if(node&&['games','game-display'].includes(key)){
   const card=sections.get(key).card;const sync=()=>{card.hidden=node.hidden;};new MutationObserver(sync).observe(node,{attributes:true,attributeFilter:['hidden']});sync();
  }
  if(node&&['duo','crew','games','league'].includes(key)){
   const status=sections.get(key).status;const summarize=()=>{const empty=node.querySelector('.connections-empty');const text=(empty?.textContent||node.querySelector('h3,h4,strong')?.textContent||summary).trim().slice(0,90);if(status.textContent!==text)status.textContent=text;};new MutationObserver(summarize).observe(node,{childList:true,subtree:true,characterData:true});summarize();
  }
 }
 const saves=new Map();
 for(const key of ['avatar','name','bio','intro','roles','education','banner','about','socials','connections','game-display','league','duo']) {
  const {panel}=sections.get(key);const footer=doc.createElement('div');footer.className='section-save';const button=doc.createElement('button');button.type='button';button.className='primary';button.textContent='Save Changes';button.dataset.profileSave=key;button.disabled=true;
  const feedback=doc.createElement('p');feedback.id='editor-feedback-'+key;feedback.className='connections-message';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.hidden=true;
  footer.append(button,feedback);panel.append(footer);saves.set(key,{button,feedback});
 }
 // Account Settings live only in the ⋯ menu (no standalone 'language' section): who is signed in, Language (applied as soon as it is chosen, so the menu holds
 // no save button) and Sign Out. Section Save Changes and Save All Changes stay in the editor.
 const menu=doc.getElementById('accountMenuActions'),languageForm=doc.getElementById('languageForm'),signOut=doc.getElementById('signOutButton');
 const email=doc.getElementById('accountEmail')?.closest('p');if(email)menu.append(email);
 languageForm.classList.add('menu-language');const languageButton=languageForm.querySelector('button');languageButton.type='submit';languageButton.hidden=true;menu.append(languageForm);
 signOut.textContent='Sign Out';menu.append(signOut);
 const old=doc.getElementById('saveProfileButton');old?.remove();doc.getElementById('saveConfirmation')?.remove();
 for(const {toggle,panel} of sections.values())toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));panel.hidden=!open;});
 return {sections,saves};
}
