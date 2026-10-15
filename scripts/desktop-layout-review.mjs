import assert from 'node:assert/strict';
import path from 'node:path';
export const innerAbout=['about','roles','education','bio','name'];
export async function openEditor(page,key){
 for(const owner of innerAbout.includes(key)?['about-group']:key==='league'?['connections']:[]){
  const t=page.locator(`[data-editor-section=${owner}] > .section-toggle`);
  if(!await t.count())continue;
  if(await t.getAttribute('aria-expanded')!=='true')await t.click();
 }
 const t=page.locator(`[data-editor-section=${key}] > .section-toggle`);
 if(await t.getAttribute('aria-expanded')!=='true')await t.click();
}
export async function assertPairedLayout(page){
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal page overflow');
 const layout=await page.locator('.desktop-editor-row').evaluateAll(rows=>rows.map(row=>{
  const r=row.getBoundingClientRect();
  return {x:r.x,w:r.width,tiles:[...row.children].map(card=>{
   const h=card.querySelector(':scope > .section-toggle').getBoundingClientRect();
   const s=(card.querySelector(':scope > .desktop-summary')||card.querySelector(':scope > .section-panel')).getBoundingClientRect();
   return {key:card.dataset.editorSection,x:s.x,w:s.width,top:h.height?h.top:s.top,bottom:s.bottom};
  }),panels:[...row.querySelectorAll(':scope > .editor-section:not(.desktop-play-static) > .section-panel:not([hidden])')].map(p=>{
   const b=p.getBoundingClientRect();return {x:b.x,w:b.width,top:b.top,scroll:p.scrollWidth,client:p.clientWidth};
  })};
 }));
 assert.deepEqual(layout.map(r=>r.tiles.map(t=>t.key)),[['avatar','intro'],['banner','about-group'],['connections','socials'],['games','game-display'],['play','duo'],['wall','crew']]);
 assert.ok(layout.reduce((n,r)=>n+r.panels.length,0)<=1,'one open editor');
 for(const r of layout){const[a,b]=r.tiles;
  assert.ok(Math.abs(a.w-b.w)<1,`${a.key}: equal column widths`);
  assert.ok(Math.abs(a.top-b.top)<1&&Math.abs(a.bottom-b.bottom)<1,`${a.key}: aligned summary boundaries`);
  assert.ok(a.w>300,`${a.key}: comfortable summary width`);
  for(const p of r.panels){assert.ok(Math.abs(p.x-r.x)<1&&Math.abs(p.w-r.w)<1,`${a.key}: full workspace panel`);assert.ok(p.top>=a.bottom+12,'panel below summaries');assert.ok(p.scroll<=p.client+2,`${a.key}: no panel overflow`);}
 }
 const escaped=await page.locator('.desktop-editor .section-panel :is(input,select,textarea,button)').evaluateAll(nodes=>nodes.filter(n=>{
  const r=n.getBoundingClientRect(),p=n.closest('.section-panel').getBoundingClientRect();
  return r.width>0&&r.height>0&&(r.left<p.left-2||r.right>p.right+2);
 }).map(n=>n.id||n.className));
 assert.deepEqual(escaped,[],'controls fit their actual panel');return layout;
}
export async function reviewDesktopLayout({page,width,scenario,out,calls}){
 const keys=['avatar','intro','banner','about-group','connections','socials','games','game-display','duo','wall','crew'];
 await page.waitForTimeout(600);if(scenario!=='empty')await page.waitForFunction(()=>document.querySelector('.desktop-intro-preview img')?.naturalWidth>0);await assertPairedLayout(page);
 await page.screenshot({path:path.join(out,`paired-collapsed-${width}-${scenario}.png`),fullPage:true,animations:'disabled'});
 await page.evaluate(()=>window.pairedDraftNode=document.querySelector('#profileBio'));
 for(const key of keys){
  await openEditor(page,key);await assertPairedLayout(page);
  const panel=page.locator(`[data-editor-section=${key}] > .section-panel`);
  const dimensions=()=>page.locator('.desktop-editor-row > .editor-section > .desktop-summary').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [r.width,r.height];}));
  const before=await dimensions();
  await panel.evaluate(n=>{const p=document.createElement('div');p.dataset.layoutProbe='true';p.style.cssText='overflow-wrap:anywhere;min-width:0';p.textContent=('Additional icons and future content '+ 'long-token-'.repeat(12)+' ').repeat(8);n.append(p);});
  await assertPairedLayout(page);assert.deepEqual(await dimensions(),before,`${key}: growing detail does not stretch summaries`);
  await panel.locator('[data-layout-probe]').evaluate(n=>n.remove());
 }
 await openEditor(page,'name');await page.locator('#profileDisplayName').fill('Layout draft');
 await openEditor(page,'bio');await page.locator('#profileBio').fill('Layout review unsaved draft');
 assert.equal(await page.locator('[data-editor-section=name] > .section-panel').isVisible(),false);
 await openEditor(page,'intro');await openEditor(page,'name');assert.equal(await page.locator('#profileDisplayName').inputValue(),'Layout draft');
 await openEditor(page,'bio');assert.equal(await page.locator('#profileBio').inputValue(),'Layout review unsaved draft');
 await openEditor(page,'connections');await assertPairedLayout(page);
 await page.screenshot({path:path.join(out,`paired-expanded-${width}-${scenario}.png`),fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:900});await page.waitForFunction(()=>!document.querySelector('.desktop-editor-layout'));
 await openEditor(page,'name');await openEditor(page,'bio');assert.ok(await page.locator('#profileDisplayName').isVisible());assert.ok(await page.locator('#profileBio').isVisible(),'mobile keeps independent sections');
 await page.setViewportSize({width,height:900});await page.waitForFunction(()=>document.querySelectorAll('.desktop-editor-row').length===6);
 await openEditor(page,'bio');await assertPairedLayout(page);assert.equal(await page.locator('#profileBio').inputValue(),'Layout review unsaved draft');assert.equal(await page.locator('#profileBio').evaluate(n=>n===window.pairedDraftNode),true);
 assert.equal(calls.some(c=>/\/rpc\/(?:set_|save_|update_|publish|attach_|remove_|queue_)/.test(c.path)),false,'layout changes never mutate saved data');
 assert.equal(await page.evaluate(()=>window.mediaPlayCalls||0),0);
 return {width,scenario,pairedRows:true,fullWidthPanels:11,independentGrowth:true,singleEditor:true,responsiveDrafts:true,noWrites:true,noPlayback:true};
}
