// Account-level private owner capability. Counts/limits come only from the RPC.
export const mb = bytes => `${(Number(bytes)/1_000_000).toFixed(1).replace(/\.0$/,'')} MB`;
export function wallCapacity(quotas) {
 const find=key=>quotas.find(q=>q.key===key);
 const assets=find('wall.assets'),videos=find('wall.videos'),images=find('wall.images');
 const valid=q=>q&&Number.isInteger(q.used)&&q.used>=0&&Number.isInteger(q.limit)&&q.limit>=0;
 if(!valid(assets)||!valid(videos)||!images||!Number.isInteger(images.used)||images.used<0|| (images.limit!=null&&!valid(images)))return null;
 const slots=Math.max(0,assets.limit-assets.used),videoRemaining=Math.min(slots,Math.max(0,videos.limit-videos.used));
 const imageRemaining=images.limit==null?slots:Math.min(slots,Math.max(0,images.limit-images.used));
 const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
 let explanation;
 if(!slots)explanation='Wall Asset LIMIT REACHED — no more images or videos.';
 else if(!videoRemaining&&imageRemaining===slots)explanation=`${plural(slots,'asset slot')} remaining — images only.`;
 else if(videoRemaining&&imageRemaining)explanation=`You can add ${plural(videoRemaining,'more video')} or up to ${plural(imageRemaining,'more image')}.`;
 else if(videoRemaining)explanation=`You can add ${plural(videoRemaining,'more video')} — image LIMIT REACHED.`;
 else if(imageRemaining)explanation=`You can add up to ${plural(imageRemaining,'more image')} — video LIMIT REACHED.`;
 else explanation='Image and video LIMIT REACHED.';
 return {videoRemaining,explanation};
}
export function createUsageCenter({api,doc=globalThis.document,onOpen=()=>{}}) {
 const make=(tag,cls,text)=>{const el=doc.createElement(tag);el.className=cls||'';if(text!==undefined)el.textContent=text;return el;};
 const root=make('div','usage-center'),button=make('button','usage-button','USAGE'),panel=make('section','usage-panel'),content=make('div','usage-content');
 button.type='button';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','gamid-usage-panel');
 panel.id='gamid-usage-panel';panel.setAttribute('aria-label','Your GamID Usage');panel.hidden=true;
 const title=make('strong','','USAGE'),refreshButton=make('button','usage-refresh','Refresh');refreshButton.type='button';
 panel.append(title,refreshButton,content);root.append(button,panel);
 let stopped=false,chain=Promise.resolve(),state=null;
 function render(data) {
  const s=data.storage; const nodes=[make('h3','','STORAGE'),make('p','usage-total',`${mb(s.used_bytes)} / ${mb(s.quota_bytes)} used`),make('p','',`${mb(s.remaining_bytes)} remaining · ${s.percentage}%`),make('p','usage-state',s.state.replaceAll('_',' '))];
  const meter=make('progress');meter.max=s.quota_bytes;meter.value=s.used_bytes;meter.setAttribute('aria-label','Storage used');nodes.push(meter);
  if(s.reserved_bytes)nodes.push(make('p','usage-note',`${mb(s.reserved_bytes)} reserved for uploads · ${mb(s.available_bytes)} available to upload`));
  if(!s.enforcement_active)nodes.push(make('p','usage-note','Upload gateway activation pending.'));
  nodes.push(make('h3','','MEDIA BREAKDOWN'));
  for(const [key,label] of [['intro','Intro'],['wall','Wall Media'],['avatar','Avatar'],['other','Other']])nodes.push(make('p','usage-row',`${label} · ${mb(data.media[key]||0)}`));
  nodes.push(make('h3','','FEATURE USAGE'),make('p','usage-note','Wall counts reflect the saved composition and registered assets.'));
  const capacity=wallCapacity(data.quotas);
  for(const q of data.quotas) {
   const suffix=q.key==='wall.videos'&&capacity?(capacity.videoRemaining?` · ${capacity.videoRemaining} remaining`:' — LIMIT REACHED'):'';
   nodes.push(make('p','usage-row',`${q.name} · ${q.used}${q.limit==null?'':` / ${q.limit}`}${suffix}`));
   if(q.key==='wall.images'&&capacity)nodes.push(make('p','usage-note',capacity.explanation));
   if(q.note)nodes.push(make('p','usage-note',q.note));
  }
  content.replaceChildren(...nodes);
 }
 function refresh() {
  const next=chain.then(async()=>{
   if(stopped)return;
   refreshButton.disabled=true;
   try {const data=await api.getMyUsage();if(stopped)return;state=data;render(data);}
   catch {if(!stopped){if(state)render(state);else content.replaceChildren();content.append(make('p','usage-note','Usage could not be refreshed. Try Refresh.'));}}
   finally {if(!stopped)refreshButton.disabled=false;}
  });chain=next.catch(()=>{});return next;
 }
 const setOpen=open=>{if(stopped)return;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){onOpen();Promise.resolve(api.reconcileUsageUploads?.()).catch(()=>{}).finally(()=>refresh());}};
 button.addEventListener('click',()=>setOpen(panel.hidden));refreshButton.addEventListener('click',()=>refresh());
 const key=e=>{if(e.key==='Escape'&&!panel.hidden){setOpen(false);button.focus?.();}};
 const outside=e=>{if(!panel.hidden&&!root.contains(e.target))setOpen(false);};
 doc.addEventListener?.('keydown',key);doc.addEventListener?.('click',outside,true);
 return {root,button,panel,refresh,setOpen,get state(){return state;},mount(host){host.append(root);return refresh();},destroy(){stopped=true;state=null;doc.removeEventListener?.('keydown',key);doc.removeEventListener?.('click',outside,true);root.remove?.();}};
}
