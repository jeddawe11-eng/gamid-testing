// Browser UX coverage with the caller's fully intercepted backend only.
import assert from 'node:assert/strict';import path from 'node:path';
import {openEditor} from './desktop-layout-review.mjs';
export async function reviewCrewUX({page,width,count,out,calls,setPublic}){
 const owner=page.locator('#crewPanel'),management=owner.locator('.crew-card:not([hidden])');
 await page.waitForFunction(n=>document.querySelectorAll('#crewPanel .crew-list-open').length===n,count);
 assert.equal(await management.count(),0);assert.equal(await owner.locator('.crew-create input').count(),0);
 if(width>=1024){assert.equal(await page.locator('.desktop-crew-tile').count(),Math.min(2,count));
  const more=page.locator('.desktop-crew-more');assert.equal(await more.count(),count>2?1:0);
  if(count>2){assert.equal(await more.textContent(),`+${count-2} more crews`);await more.focus();await more.press('Enter');assert.ok(await owner.isVisible());}
 }
 await openEditor(page,'bio');await page.locator('#profileBio').fill('Crew UX unrelated draft');await openEditor(page,'crew');
 assert.equal(await owner.locator('.crew-list-open').count(),count);
 const before=calls.filter(c=>/\/rpc\/(?:rename_|create_|invite_|remove_|delete_|set_|save_)/.test(c.path)).length;
 if(count){
  await owner.locator('.crew-list-open').first().focus();await owner.locator('.crew-list-open').first().press('Enter');assert.equal(await management.count(),1);
  assert.ok(await management.locator('.crew-members').isVisible());assert.ok(await management.locator('a.crew-wall-open').isVisible());
  assert.ok(await management.getByRole('button',{name:'Delete Crew',exact:true}).isVisible());
  await management.getByRole('button',{name:'Back to Crews',exact:true}).click();assert.equal(await management.count(),0);
  assert.equal(await owner.locator('.crew-list-open').first().evaluate(n=>n===document.activeElement),true);
  if(count>1){await owner.locator('#crew-list-00000000-0000-4000-8000-'+String(100+count-1).padStart(12,'0')).click();assert.equal(await management.count(),1);assert.equal(await management.getByRole('button',{name:'Delete Crew',exact:true}).count(),0);assert.ok(await management.getByRole('button',{name:'Leave Crew',exact:true}).isVisible());await management.getByRole('button',{name:'Back to Crews',exact:true}).click();}
 }
 await owner.getByRole('button',{name:'+ Add Crew',exact:true}).click();assert.equal(await management.count(),0);assert.equal(await owner.locator('.crew-create').count(),1);
 await owner.locator('.crew-create input').fill('Draft game query');await owner.locator('.crew-create').getByRole('button',{name:'Back to Crews',exact:true}).click();
 await owner.getByRole('button',{name:'+ Add Crew',exact:true}).click();assert.equal(await owner.locator('.crew-create input').inputValue(),'Draft game query');await owner.locator('.crew-create').getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await page.locator('#profileBio').inputValue(),'Crew UX unrelated draft');
 assert.equal(calls.filter(c=>/\/rpc\/(?:rename_|create_|invite_|remove_|delete_|set_|save_)/.test(c.path)).length,before,'opening/closing never writes');
 const overflow=await owner.evaluate(n=>n.scrollWidth>n.clientWidth+2);assert.equal(overflow,false,'Crew editor has no horizontal overflow');
 if(width===1440&&count===5){
  await page.screenshot({path:path.join(out,'crew-owner-list.png'),fullPage:true});
  await owner.locator('.crew-list-open').first().click();await page.screenshot({path:path.join(out,'crew-owner-management.png'),fullPage:true});
  const current=owner.locator('.crew-card:not([hidden])');
  await current.getByRole('button',{name:/Edit the name of/}).click();await current.getByRole('textbox',{name:'Crew name',exact:true}).fill('Renamed Crew');
  await current.locator('.crew-rename').getByRole('button',{name:'Save',exact:true}).click();await current.locator('.crew-name').filter({hasText:'Renamed Crew'}).waitFor();
  await current.getByRole('button',{name:'Edit Crew Wall',exact:true}).click();await current.getByRole('button',{name:'Add Stage 2',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#crewPanel .crew-card:not([hidden])')?.textContent.includes('Stages 2 / 2'));
  await current.getByRole('button',{name:'Publish',exact:true}).click();await current.getByRole('button',{name:'Unpublish',exact:true}).waitFor();await current.getByRole('button',{name:'Unpublish',exact:true}).click();await current.getByRole('button',{name:'Publish',exact:true}).waitFor();
  await current.getByRole('button',{name:'Remove',exact:true}).click();assert.ok(await current.getByRole('alert').isVisible());await current.getByRole('button',{name:'Cancel',exact:true}).click();
  await current.getByRole('button',{name:'Delete Crew',exact:true}).click();assert.ok(await current.getByRole('alert').isVisible());await current.getByRole('button',{name:'Cancel',exact:true}).click();
  const invite=current.locator('.crew-invite');await invite.getByRole('searchbox').fill('friend');await invite.getByRole('button',{name:'Search',exact:true}).click();await current.getByRole('button',{name:'Invite',exact:true}).click();
  await current.getByRole('button',{name:'Back to Crews',exact:true}).click();assert.equal(await page.locator('#profileBio').inputValue(),'Crew UX unrelated draft');
 }
 if(width===1440&&count>2){await page.locator('[data-editor-section=crew] > .section-toggle').click();await page.screenshot({path:path.join(out,`crew-owner-collapsed-${count}.png`),fullPage:true});}
 // Public MY CREWS entry is Desktop-only; open it there, then exercise existing responsive dialog.
 setPublic();await page.setViewportSize({width:1440,height:900});await page.goto('https://gamid-testing-static.gamid.workers.dev/public/?handle=fixture_owner');
 if(!count){await page.locator('#desktopHero').waitFor();assert.equal(await page.getByRole('button',{name:/My Crews:/}).count(),0);return {width,count,owner:true,emptyPublic:true};}
 const open=page.getByRole('button',{name:/My Crews:/});await open.waitFor();await open.click();
 const panel=page.locator('.profile-panel:not([hidden])'),grid=panel.locator('.crew-grid');await grid.waitFor();
 await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
 assert.equal(await grid.locator(':scope > .crew-card').count(),Math.min(9,count));
 const boxes=await grid.locator(':scope > .crew-card').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width};}));
 const rows=Object.values(Object.groupBy(boxes,b=>Math.round(b.y))).map(r=>r.length);assert.ok(rows.every(n=>n<=(width>=960?3:width>=640?2:1)));
 if(width>=960&&count>=9)assert.deepEqual(rows,[3,3,3]);
 assert.equal(await panel.evaluate(n=>n.scrollWidth>n.clientWidth+2),false,'public dialog has no horizontal overflow');
 if(count===10){const more=panel.getByRole('button',{name:'View remaining Crew',exact:true});await more.focus();await more.press('Enter');assert.equal(await grid.locator(':scope > .crew-card').count(),10);assert.equal(await more.count(),0);const last=grid.locator(':scope > .crew-card').last();assert.equal(await last.evaluate(n=>n===document.activeElement),true);assert.match(await last.getAttribute('href'),/000000000109/);}
 if(width===1440&&count>=9)await page.screenshot({path:path.join(out,`crew-public-grid-${count}.png`),fullPage:true});
 if(width===1440&&count===10){await grid.locator(':scope > .crew-card').last().click();await page.waitForURL(/\/crew\/\?c=00000000-0000-4000-8000-000000000109/);return {width,count,ownerList:true,singleManagement:true,profileDraft:true,publicRows:rows,tenthAccessible:true,tenthNavigation:true,keyboard:true,noCrewOverflow:true};}
 await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
 return {width,count,ownerList:true,singleManagement:true,creationDraft:true,profileDraft:true,publicRows:rows,tenthAccessible:count===10,keyboard:true,noCrewOverflow:true};
}
