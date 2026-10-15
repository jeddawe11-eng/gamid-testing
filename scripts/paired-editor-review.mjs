// Real UI interactions; backend writes remain confined to the caller's fixture.
import assert from 'node:assert/strict';
import {openEditor,assertPairedLayout} from './desktop-layout-review.mjs';
export async function reviewPairedEditor({page,width,calls,rpcCalls,saved,setFailure,setVisibilityFailure,avatarBytes,introBytes,bannerBytes}){
 const open=key=>openEditor(page,key),save=async key=>{await open(key);await page.locator(`[data-profile-save="${key}"]`).click();await page.locator(`#editor-feedback-${key}`).filter({hasText:'Saved'}).waitFor();};
 await page.waitForFunction(()=>document.querySelector('#profileDisplayName').value==='Fixture');
 await assertPairedLayout(page);const before=calls.length;
 await open('name');await page.locator('#profileDisplayName').fill('Paired name');
 await open('bio');await page.locator('#profileBio').fill('Paired bio');
 await open('roles');for(const t of await page.locator('.role-category-toggle[aria-expanded=false]').all())await t.click();
 await page.locator('#gamingRoleChoices label').filter({hasText:'Creator'}).click();
 await open('intro');await page.locator('#introTransition').selectOption('split');
 await open('name');assert.equal(await page.locator('#profileDisplayName').inputValue(),'Paired name');assert.equal(calls.length,before,'opening never saves');
 await save('name');assert.equal(saved().display_name,'Paired name');assert.equal(saved().bio,'Saved bio');assert.deepEqual(saved().role_keys,['player']);
 await open('bio');assert.equal(await page.locator('#profileBio').inputValue(),'Paired bio');
 await page.locator('#saveAllButton').click();await page.locator('#saveAllFeedback').filter({hasText:'All changes saved'}).waitFor();
 assert.equal(saved().bio,'Paired bio');assert.deepEqual(saved().role_keys,['player','creator']);
 assert.ok(rpcCalls.some(c=>c.action==='set_my_intro_transition'&&c.data.candidate_transition==='split'));
 assert.equal(rpcCalls.some(c=>/invite|publish|disconnect|connect_/.test(c.action)),false,'Save All does not perform immediate actions');
 await open('bio');await page.locator('#profileBio').fill('Retry bio');
 await open('game-display');await page.locator('#gameDisplaySlot [role=switch]').first().click();setVisibilityFailure(true);
 await page.locator('#saveAllButton').click();await page.locator('#saveAllFeedback').filter({hasText:'Not saved:'}).waitFor();
 assert.equal(saved().bio,'Retry bio');assert.ok(await page.locator('[data-editor-section=game-display] > .section-panel').isVisible(),'failed section revealed');
 await assertPairedLayout(page);setVisibilityFailure(false);await page.locator('#saveAllButton').click();await page.locator('#saveAllFeedback').filter({hasText:'All changes saved'}).waitFor();
 await open('name');await page.locator('#profileDisplayName').fill('Retry name');setFailure(true);
 await page.locator('[data-profile-save=name]').click();await page.waitForFunction(()=>!document.querySelector('[data-editor-section=name]').hasAttribute('aria-busy'));
 await open('connections');await open('name');assert.equal(await page.locator('#profileDisplayName').inputValue(),'Retry name');setFailure(false);await save('name');
 for(const [destination,key] of [['account.my_duo','duo'],['account.my_crew','crew']]){await page.evaluate(destination=>window.dispatchEvent(new CustomEvent('gamid:notification-navigate',{detail:{destination},cancelable:true})),destination);assert.ok(await page.locator(`[data-editor-section=${key}] > .section-panel`).isVisible());await assertPairedLayout(page);}
 await open('banner');await page.locator('#bannerInput').setInputFiles({name:'wide.jpg',mimeType:'image/jpeg',buffer:bannerBytes});await page.locator('.banner-frame.is-editing').waitFor();await page.locator('#bannerZoom').fill('1.5');
 await open('socials');await open('banner');assert.equal(await page.locator('#bannerZoom').inputValue(),'1.5');assert.ok(await page.locator('.banner-frame.is-editing').isVisible());await save('banner');assert.ok(rpcCalls.some(c=>c.action==='attach_my_banner'));
 await open('avatar');await page.locator('#profileAvatarInput').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:avatarBytes});await page.locator('#avatarCropDialog[open]').waitFor();await page.locator('#applyAvatarCrop').click();await page.waitForFunction(()=>!document.querySelector('[data-profile-save=avatar]').disabled);
 await page.evaluate(()=>window.pairedAvatarNode=document.querySelector('#profileAvatarInput'));
 await open('intro');const input=page.locator('input[type=file][accept*="video"]');await input.setInputFiles({name:'fixture.mp4',mimeType:'video/mp4',buffer:introBytes});
 await page.locator('#introFileStatus').filter({hasText:'ready to upload'}).waitFor();
 const uploadCount=rpcCalls.filter(c=>/queue_|attach_|update_my_identity/.test(c.action)).length;
 await open('connections');await open('avatar');assert.equal(await page.locator('[data-profile-save=avatar]').isEnabled(),true);
 await open('intro');assert.match(await page.locator('#introFileStatus').textContent(),/fixture.mp4.*ready to upload/);
 await page.locator('#previewClassicButton').click();await page.getByRole('button',{name:'Back to Edit',exact:true}).click();
 assert.match(await page.locator('#introFileStatus').textContent(),/fixture.mp4.*ready to upload/);await open('avatar');assert.equal(await page.locator('#profileAvatarInput').evaluate(n=>n===window.pairedAvatarNode),true);assert.equal(await page.locator('[data-profile-save=avatar]').isEnabled(),true);
 assert.equal(rpcCalls.filter(c=>/queue_|attach_|update_my_identity/.test(c.action)).length,uploadCount,'preview and switches never upload/save');
 await assertPairedLayout(page);
 return {width,pairedLayout:true,draftRestoration:true,independentSave:true,saveAll:true,partialFailureRetry:true,notifications:true,avatarAndIntroDrafts:true,classicBack:true};
}
