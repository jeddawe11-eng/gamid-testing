// Browser-only layout stress review. All data and additions are isolated fixtures.
import assert from 'node:assert/strict';
import path from 'node:path';
export async function reviewDesktopLayout({page,width,scenario,out,calls,reproduce=false}){
 const card=key=>page.locator(`[data-editor-section="${key}"]`);
 const open=async key=>{const toggle=card(key).locator(':scope > .section-toggle');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();};
 const rect=async key=>card(key).evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y+scrollY,w:r.width,h:r.height};});
 const mainCards='.desktop-editor-stack > .editor-section';
 async function geometry(){return page.locator(mainCards).evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return {key:n.dataset.editorSection,x:r.x,y:r.y+scrollY,w:r.width,h:r.height,parentWidth:p.width,scroll:n.scrollWidth,client:n.clientWidth};}));}
 async function check(){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no page overflow');
  const cards=await geometry();assert.equal(cards.length,11);
  for(const c of cards){assert.ok(c.w>=330&&Math.abs(c.w-c.parentWidth)<2,`${c.key}: uses full column width, ${c.w}/${c.parentWidth}`);assert.ok(c.scroll<=c.client+2,`${c.key}: content fits without clipping or overflow`);}
  for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){const a=cards[i],b=cards[j];assert.equal(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1,false,`no overlap ${a.key}/${b.key}`);}
  const gaps=await page.locator('.desktop-editor-stack').evaluateAll(stacks=>stacks.flatMap(stack=>[...stack.children].slice(1).map((n,i)=>{const a=stack.children[i].getBoundingClientRect(),b=n.getBoundingClientRect();return b.top-a.bottom;})));
  assert.ok(gaps.every(g=>g>=11&&g<=17),'one consistent responsive stack gap');assert.ok(Math.max(...gaps)-Math.min(...gaps)<1,'all stack gaps share the same spacing token');
  const escaped=await page.locator('.desktop-editor .section-panel :is(input,select,textarea,button)').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect(),p=n.closest('.editor-section').getBoundingClientRect();return r.width>0&&r.height>0&&(r.left<p.left-2||r.right>p.right+2);}).map(n=>n.id||n.className));assert.deepEqual(escaped,[],'visible controls remain inside their card, including sidebar actions');
 }
 await page.waitForFunction(()=>document.querySelector('[data-editor-section=crew] > .desktop-summary')?.textContent.trim().length>0);
 if(scenario!=='empty')await page.waitForFunction(()=>document.querySelector('.desktop-intro-preview img')?.naturalWidth>0);
 await page.waitForFunction(()=>[...document.querySelectorAll('.desktop-editor-main .desktop-summary img')].every(n=>n.complete&&n.naturalWidth>0));
 await page.waitForTimeout(150);
 if(reproduce){await page.screenshot({path:path.join(out,`adaptive-before-${width}-${scenario}.png`),fullPage:true});return {width,scenario,reproduced:true,avatar:await rect('avatar'),intro:await rect('intro')};}
 await check();
 const placement=await page.locator('.desktop-editor-stack').evaluateAll(nodes=>nodes.map(n=>[...n.children].map(c=>c.dataset.editorSection)));
 assert.deepEqual(placement,[['avatar','banner','about-group','games','game-display','play'],['intro','connections','socials','duo','crew']]);
 const avatar=await rect('avatar'),intro=await rect('intro');assert.equal(avatar.y,intro.y);assert.ok(Math.abs(avatar.h-intro.h)<=45,'compact balanced Avatar / Intro');
 const image=page.locator('.desktop-intro-preview img');if(await image.count()){const r=await image.boundingBox();assert.ok(r.height<=112&&r.width<=222,'bounded real thumbnail regardless of source dimensions');}
 assert.equal(await card('crew').locator('> .desktop-summary > .desktop-summary-item').count(),scenario==='rich'?3:scenario==='empty'?0:1);
 await page.screenshot({path:path.join(out,`adaptive-collapsed-${width}-${scenario}.png`),fullPage:true,animations:'disabled'});
 // Every top-level accordion may grow: neither opposite-column heights nor positions change.
 for(const key of ['avatar','banner','about-group','socials','games','intro','connections','game-display','duo','crew']){
  const own=await card(key).evaluate(n=>n.parentElement===document.querySelector('.desktop-editor-stack'));
  const opposite=own?placement[1]:placement[0];const before=await Promise.all(opposite.map(rect));await open(key);
  const panel=card(key).locator(':scope > .section-panel');await panel.evaluate(n=>{const probe=document.createElement('div');probe.dataset.layoutProbe='true';probe.style.cssText='display:grid;gap:8px;min-width:0;overflow-wrap:anywhere';const text=document.createElement('p');text.textContent=('Future field or status with long content / '+ 'unbroken-token-'.repeat(8)+' ').repeat(3);const icons=document.createElement('div');icons.style.cssText='display:flex;flex-wrap:wrap;gap:8px';for(let i=0;i<15;i++){const icon=document.createElement('span');icon.textContent='●';icon.style.cssText='width:32px;height:32px;display:grid;place-items:center;border:1px solid #463267';icons.append(icon);}probe.append(text,icons);n.append(probe);});
  await check();assert.deepEqual(await Promise.all(opposite.map(rect)),before,`${key}: growth cannot move/stretch the opposite column`);
  await panel.locator('[data-layout-probe]').evaluate(n=>n.remove());await card(key).locator(':scope > .section-toggle').click();
 }
 // Multiple expanded sections, all nested editors and original controls remain accessible.
 for(const key of ['avatar','banner','about-group','socials','games','intro','connections','game-display','duo','crew','about','roles','education','bio','name','league'])await open(key);
 for(const toggle of await page.locator('.role-category-toggle[aria-expanded=false]').all())await toggle.click();
 const beforeSidebar=await geometry();for(const key of ['share','wall'])await open(key);await check();assert.deepEqual(await geometry(),beforeSidebar,'expanding sidebar controls cannot shift main cards');
 await check();
 await page.locator('#profileBio').fill('Layout review unsaved draft');await page.evaluate(()=>window.layoutDraftNode=document.querySelector('#profileBio'));
 await page.screenshot({path:path.join(out,`adaptive-expanded-${width}-${scenario}.png`),fullPage:true,animations:'disabled'});
 if(scenario==='rich'&&[1024,1440].includes(width)){await card('connections').screenshot({path:path.join(out,`adaptive-connections-${width}.png`)});await card('crew').locator('.crew-card').first().screenshot({path:path.join(out,`adaptive-crew-${width}.png`)});}
 await page.setViewportSize({width:width===1024?1440:1024,height:900});await page.waitForFunction(()=>document.querySelectorAll('.desktop-editor-stack > .editor-section').length===11);await check();
 assert.equal(await page.locator('#profileBio').evaluate(n=>n===window.layoutDraftNode),true);assert.equal(await page.locator('#profileBio').inputValue(),'Layout review unsaved draft');
 await page.setViewportSize({width:390,height:900});await page.waitForFunction(()=>!document.querySelector('.desktop-editor-layout'));assert.equal(await page.locator('#profileBio').inputValue(),'Layout review unsaved draft');
 await page.setViewportSize({width,height:900});await page.waitForFunction(()=>document.querySelectorAll('.desktop-editor-stack > .editor-section').length===11);await check();assert.equal(await page.locator('#profileBio').evaluate(n=>n===window.layoutDraftNode),true);
 assert.equal(calls.some(c=>/\/rpc\/(?:set_|save_|update_|publish|attach_|remove_|queue_)/.test(c.path)),false,'layout review never mutates saved data');
 assert.equal(await page.evaluate(()=>window.mediaPlayCalls),0);
 return {width,scenario,geometry:true,independentGrowth:10,multipleExpanded:true,responsiveDrafts:true,noWrites:true,noPlayback:true,avatarHeight:avatar.h,introHeight:intro.h};
}
