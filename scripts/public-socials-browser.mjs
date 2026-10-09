// Isolated Chrome fixture for My Socials on the public GamID (no Wall). All Supabase traffic is intercepted; no real account or data is touched.
// Set GAMID_BROWSER_MODULE to an installed Playwright module and optionally GAMID_CHROME_PATH / GAMID_BROWSER_OUTPUT. --live serves the deployed TESTING frontend files.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {createDocument} from '../dist/wall/schema.js';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.GAMID_BROWSER_MODULE||'playwright');
const CF='https://gamid-testing-static.gamid.workers.dev',root=fileURLToPath(new URL('../dist/',import.meta.url)),out=process.env.GAMID_BROWSER_OUTPUT||process.cwd();
const identity={gamid_handle:'fixture_socials',display_name:'Fixture Socials',avatar_media_reference:null,bio:'Public profile without a Wall.',role_keys:['player'],primary_role_key:'player',role_catalog:[{key:'player',label:'Player'}],education_work_status:null,institution:null,field_of_study:null,education_work_catalog:null,intro_transition_key:'fade',intro_derivative_path:null,public_sections:{}};
const links=[{platform_key:'instagram',label:'Instagram',kind:'profile',account_id:'fixture'},{platform_key:'youtube',label:'YouTube',kind:'channel',account_id:'@fixture'},{platform_key:'twitch',label:'Twitch',kind:'channel',account_id:'javascript:alert(1)'},{platform_key:'discord',label:'Discord',kind:'profile',account_id:'374102653111762948'}];
const dcCard={discord_id:'374102653111762948',username:'fixture_dc',display_name:'Fixture DC',avatar:null};
// The Discord icon opens the card on click only (a modal dialog: focus inside, Esc / Close / a click outside dismiss it, focus returns); a card of another
// account never attaches, and the icon stays the ordinary link.
async function discordCardChecks(page,scenario,width,errors){
 const dc=page.locator('#publicSections .public-socials a.public-social[href="https://discord.com/users/374102653111762948"]'),dialog=page.locator('#discordCardDialog');
 if(scenario==='discord-card-mismatch'){await page.waitForTimeout(1500);assert.equal(await dc.getAttribute('aria-haspopup'),null,'a card of another account is never attached');assert.equal(await dialog.count(),0);assert.equal(await dc.getAttribute('target'),'_blank','the ordinary link stays');assert.deepEqual(errors,[]);return;}
 await page.waitForFunction(()=>document.querySelector('.public-socials a[aria-haspopup=dialog]'),null,{timeout:20000});
 assert.equal(await dialog.evaluate(d=>d.open),false,'never opens by itself');
 assert.equal(await dc.getAttribute('href'),'https://discord.com/users/374102653111762948','the ordinary link stays underneath');
 await dc.click();await dialog.waitFor({state:'visible'});
 assert.equal(await page.locator('#discordCardName').textContent(),'Fixture DC');assert.equal(await page.locator('#discordCardHandle').textContent(),'@fixture_dc');
 assert.equal(await page.locator('.discord-card-badge').textContent(),'Connected account');assert.equal(await page.locator('.discord-card-avatar').textContent(),'F','no avatar: the initial');
 const open=page.locator('.discord-card-open');assert.deepEqual(await open.evaluate(a=>[a.getAttribute('href'),a.target,a.rel,a.textContent]),['https://discord.com/users/374102653111762948','_blank','noopener noreferrer nofollow','Open on Discord']);
 assert.equal(await open.evaluate(a=>document.activeElement===a),true,'focus moves into the card');
 const box=await page.locator('.discord-card').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,'fits the screen');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const b of await page.locator('.discord-card-close, .discord-card-open').all()){const r=await b.boundingBox();assert.ok(r.height>=44&&r.width>=44,'44px targets');}
 await page.screenshot({path:`${out}/public-discord-card-${process.argv.includes('--live')?'live':'local'}-${width}.png`});
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await dc.evaluate(a=>document.activeElement===a),true,'focus returns to the icon');
 await page.keyboard.press('Enter');await dialog.waitFor({state:'visible'});await page.locator('.discord-card-close').click();await dialog.waitFor({state:'hidden'});
 await dc.click();await dialog.waitFor({state:'visible'});await page.mouse.click(4,4);await dialog.waitFor({state:'hidden'});
 assert.equal(await dialog.count(),1,'one card');assert.deepEqual(errors,[]);
}
const browser=await chromium.launch({executablePath:process.env.GAMID_CHROME_PATH||undefined,headless:true});const results=[];
try{for(const [width,height] of [[1280,850],[390,844]]){
 for(const scenario of ['with-socials','none','wall-enabled','wall-disabled','discord-card','discord-card-mismatch']){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width===390}),page=await context.newPage();await context.routeWebSocket('**/*',ws=>ws.close());const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const url=new URL(route.request().url());
   if(url.hostname==='upvtrczefcvigxdyuylw.supabase.co'){const action=url.pathname.split('/').pop();let body=[];
    if(action==='get_public_identity')body=[identity];
    if(action==='get_public_social_links')body=scenario==='none'?[]:links;
    // the server decides: a published + ENABLED Wall is returned; a disabled one is not (get_public_wall returns no row)
    // Discord Profile Card: the server returns it only when every condition holds; a card of another account must never attach to this link
    if(action==='get_public_discord_card')body=scenario==='discord-card'?[dcCard]:scenario==='discord-card-mismatch'?[{...dcCard,discord_id:'374102653111762949'}]:[];
    if(action==='get_public_wall')body=scenario==='wall-enabled'?[{document:createDocument(),published_at:'2026-10-09T00:00:00Z',assets:[]}]:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});}
   if(url.origin===CF){if(process.argv.includes('--live'))return route.continue();let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(url.pathname.endsWith('/'))file=path.join(file,'index.html');if(!file.startsWith(path.resolve(root)+path.sep))throw Error('out of fixture');try{return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}catch{return route.fulfill({status:404,body:'missing fixture asset'});}}
   return route.abort();});
  await page.goto(CF+'/public/index.html?handle=fixture_socials');
  if(scenario==='none'){await page.waitForFunction(()=>document.documentElement.classList.contains('is-public-live'),null,{timeout:20000});await page.waitForTimeout(1500);assert.equal(await page.locator('.public-socials-block').count(),0,'no saved links: no Socials block');assert.ok(await page.locator('#publicSections').isHidden());results.push({width,scenario,ok:true,errors});await context.close();continue;}
  if(scenario==='wall-enabled'){await page.locator('#publicWall').waitFor({state:'visible',timeout:20000});assert.ok(await page.locator('#publicSections').isHidden(),'the published, enabled Wall replaces the Classic Profile');assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/public-wall-enabled-${width}.png`});results.push({width,scenario,ok:true,errors});await context.close();continue;}
  const icons=page.locator('#publicSections .public-socials a.public-social');await icons.first().waitFor({timeout:20000});
  if(scenario.startsWith('discord-card')){await discordCardChecks(page,scenario,width,errors);results.push({width,scenario,ok:true,errors});await context.close();continue;}
  assert.equal(await page.locator('#publicWall').count(),0,scenario==='wall-disabled'?'a disabled Wall is not sent: the Classic Profile shows':'there is no Wall');
  assert.deepEqual(await icons.evaluateAll(as=>as.map(a=>[a.getAttribute('href'),a.target,a.rel,a.getAttribute('aria-label')])),[['https://www.instagram.com/fixture/','_blank','noopener noreferrer nofollow','Instagram (opens in a new tab)'],['https://www.youtube.com/@fixture','_blank','noopener noreferrer nofollow','YouTube (opens in a new tab)'],['https://discord.com/users/374102653111762948','_blank','noopener noreferrer nofollow','Discord (opens in a new tab)']],'addresses rebuilt by the Wall adapters; the invalid id is never drawn');
  assert.equal(await icons.nth(2).locator('.social-icon').getAttribute('data-platform'),'discord','the Discord icon');
  assert.equal(await page.locator('#publicSections').evaluate(e=>e.firstElementChild?.classList.contains('public-socials-block')),true,'Socials lead the panel below the owner');
  const frame=await page.locator('#experienceWrap').boundingBox(),block=await page.locator('.public-socials-block').boundingBox(),icon=await icons.first().boundingBox();
  if(width<1280)assert.ok(block.y>=frame.y+frame.height-1,'on a phone the icons sit below the owner information');
  assert.ok(icon.width>=44&&icon.height>=44,'44px tap targets');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await page.locator('.public-socials-block').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/public-socials-${process.argv.includes('--live')?'live':'local'}-${width}.png`,fullPage:true});
  results.push({width,scenario,icons:await icons.count(),ok:true,errors});await context.close();
 }
}}finally{await browser.close();}fs.writeFileSync(path.join(out,'public-socials-browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
