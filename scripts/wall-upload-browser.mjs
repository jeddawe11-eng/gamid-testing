// Isolated Chrome fixture for the Wall Editor upload errors (Product Memory ISS-0001..ISS-0003). All Supabase traffic is intercepted; no real account, storage or
// Wall is touched. Set GAMID_BROWSER_MODULE to an installed Playwright module and optionally GAMID_CHROME_PATH / GAMID_BROWSER_OUTPUT.
// --live serves the frontend files from the deployed Cloudflare TESTING site with the same fully mocked backend.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
import {createDocument} from '../dist/wall/schema.js';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.GAMID_BROWSER_MODULE||'playwright');
const CF='https://gamid-testing-static.gamid.workers.dev',root=fileURLToPath(new URL('../dist/',import.meta.url)),out=process.env.GAMID_BROWSER_OUTPUT||process.cwd();
const png=fs.readFileSync(fileURLToPath(new URL('../dist/prototypes/game-id-wall-w0/assets/frame.png',import.meta.url)));
const webm=fs.readFileSync(fileURLToPath(new URL('../tests/fixtures/webm/vp8.webm',import.meta.url)));
const owner='00000000-0000-4000-8000-000000000007';
const browser=await chromium.launch({executablePath:process.env.GAMID_CHROME_PATH||undefined,headless:true});const results=[];
try{for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:850},hasTouch:width===390}),page=await context.newPage();await context.routeWebSocket('**/*',ws=>ws.close());
 const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 await context.addInitScript(([key,value])=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},['gamid.testing.auth.session.v1',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600})]);
 const errors=[],posts=[],deletes=[];let mode='ok',delay=0,registerError=null,assets=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());
  if(url.hostname==='upvtrczefcvigxdyuylw.supabase.co'){
   const action=url.pathname.split('/').pop();let body=[],status=200;
   if(url.pathname==='/auth/v1/user')body={id:owner};
   if(url.pathname==='/auth/v1/token')body={access_token:jwt,refresh_token:'fixture-only',expires_in:3600};
   if(action==='get_my_gamid'||action==='get_my_identity_profile')body=[{entity_id:owner,gamid_handle:'fixture-wall',display_name:'Fixture',visibility:'DRAFT',role_keys:[]}];
   if(action==='get_my_wall_draft'||action==='ensure_my_wall_draft')body=[{document:createDocument(),revision:1,created_at:'2026-10-09T00:00:00Z',updated_at:'2026-10-09T00:00:00Z'}];
   if(action==='list_my_wall_assets')body=assets;
   if(action==='get_my_wall_video_jobs')body=[];
   if(action==='get_my_usage')body={storage:{used_bytes:199_900_000,quota_bytes:200_000_000,remaining_bytes:100_000,percentage:100,state:'NEAR_LIMIT',reserved_bytes:0,available_bytes:100_000,enforcement_active:true},media:{intro:150_000_000,wall:49_000_000,avatar:900_000,other:0},quotas:[]};
   if(action==='delete_my_wall_asset'){const id=request.postDataJSON().candidate_asset_id;const gone=assets.find(a=>a.asset_id===id);assets=assets.filter(a=>a.asset_id!==id);body=[{storage_path:gone?.storage_path}];}
   if(url.pathname.startsWith('/storage/v1/object/authenticated/wall-media/'))return route.fulfill({status:200,contentType:'image/png',body:png});
   if(url.pathname.startsWith('/functions/v1/usage-upload/')){
    if(request.method()==='DELETE'){deletes.push(url.pathname);return route.fulfill({status:200,contentType:'application/json',body:'{"deleted":true}'});}
    posts.push(url.pathname);if(delay)await new Promise(r=>setTimeout(r,delay));
    if(mode==='quota')return route.fulfill({status:413,contentType:'application/json',body:JSON.stringify({error:'ACCOUNT_STORAGE_QUOTA_EXCEEDED'})});
    if(mode==='offline')return route.abort();
    if(url.pathname.endsWith('/tus')&&request.method()==='POST')return route.fulfill({status:201,headers:{location:url.href+'/fixture-upload','upload-offset':'0','access-control-expose-headers':'location,upload-offset'},body:''});
    if(request.method()==='PATCH'){const offset=Number(request.headers()['upload-offset']||0)+(request.postDataBuffer()?.length||0);return route.fulfill({status:204,headers:{'upload-offset':String(offset),'access-control-expose-headers':'upload-offset'},body:''});}
    return route.fulfill({status:200,contentType:'application/json',body:'{}'});
   }
   if(url.pathname==='/functions/v1/wall-asset-register'){
    if(registerError)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:registerError})});
    const {path:storagePath}=request.postDataJSON();const asset={asset_id:crypto.randomUUID(),storage_path:storagePath,mime_type:'image/png',width:1,height:1,byte_size:png.length};assets=[asset,...assets];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({asset})});
   }
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  }
  if(url.origin===CF){if(process.argv.includes('--live'))return route.continue();let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(url.pathname.endsWith('/'))file=path.join(file,'index.html');if(!file.startsWith(path.resolve(root)+path.sep))throw Error('out of fixture');try{return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}catch{return route.fulfill({status:404,body:'missing fixture asset'});}}
  return route.abort();});
 const seen=[];page.on('request',r=>{if(r.url().includes('supabase.co'))seen.push(r.method()+' '+new URL(r.url()).pathname);});
 await page.goto(CF+'/wall-editor/');try{await page.locator('#workspace').waitFor({state:'visible',timeout:15000});}catch(error){console.error(JSON.stringify({gate:await page.locator('#gateTitle').textContent(),text:await page.locator('#gateText').textContent(),seen,errors}));throw error;}
 const tool=page.locator('button[data-tool="assets"]').first();await tool.click();await page.locator('#assetUpload').waitFor({state:'visible'});
 const box=page.locator('#assetUploadError'),upload=page.locator('#assetUpload'),pick=file=>page.locator('#assetFile').setInputFiles(file),image={name:'fixture.png',mimeType:'image/png',buffer:png};

 // ISS-0003: a storage-quota refusal is the quota (View Usage, no Retry), persistent, beside Upload; Dismiss restores the control.
 mode='quota';await pick(image);await box.waitFor();assert.equal(await box.getAttribute('role'),'alert');assert.match(await box.textContent(),/exceed your account storage/);assert.doesNotMatch(await box.textContent(),/Try again|\d+ ?MB/);assert.equal(await box.getByRole('button',{name:'Retry'}).count(),0);assert.equal(await upload.getAttribute('aria-describedby'),'assetUploadError');assert.equal(await upload.isEnabled(),true);
 await page.waitForTimeout(5300);assert.ok(await box.isVisible(),'persistent past the transient banner');
 await box.getByRole('button',{name:'View Usage'}).click();await page.locator('#gamid-usage-panel').waitFor();assert.ok(await page.locator('#gamid-usage-panel').isVisible());await page.keyboard.press('Escape');
 await box.getByRole('button',{name:'Dismiss this message'}).click();assert.equal(await box.count(),0);assert.equal(await upload.evaluate(e=>e===document.activeElement),true);assert.equal(await upload.getAttribute('aria-describedby'),null);
 // A dropped connection offers Retry, which re-sends the same file; success clears the box and adds the image.
 mode='offline';await pick(image);await box.filter({hasText:'could not reach GamID'}).waitFor();mode='ok';await box.getByRole('button',{name:'Retry'}).click();await page.locator('#assetMessage').filter({hasText:'Image added to your assets.'}).waitFor();assert.equal(await box.count(),0);assert.equal(assets.length,1);
 // One upload at a time: a second pick while one runs is refused and sends nothing.
 delay=700;const before=posts.length;await pick(image);await page.waitForFunction(()=>document.querySelector('#assetUpload').disabled===true);await pick(image);await page.locator('#assetMessage').filter({hasText:'already in progress'}).waitFor();await page.locator('#assetMessage').filter({hasText:'Image added'}).waitFor();assert.equal(posts.length-before,1,'only one upload was sent');assert.equal(await upload.isEnabled(),true);delay=0;
 // ISS-0002: the server's video limit is named without a stale figure, with View Usage and no Retry; deleting an asset resolves it.
 registerError='WALL_VIDEO_LIMIT';await pick({name:'fixture.webm',mimeType:'video/webm',buffer:webm});await box.waitFor();assert.match(await box.textContent(),/Wall video limit/);assert.doesNotMatch(await box.textContent(),/\d/);assert.equal(await box.getByRole('button',{name:'Retry'}).count(),0);assert.equal(await box.getByRole('button',{name:'View Usage'}).count(),1);assert.ok(deletes.length>=1,'the refused stored video is removed');registerError=null;
 await page.locator('#assetGrid .ed-danger').first().click();await page.locator('#assetMessage').filter({hasText:'deleted'}).waitFor();assert.equal(await box.count(),0,'a delete frees a slot: the limit error is resolved');
 // One link engine: a Discord personal profile (discord.com/users/<id>) is recognised in Media & Links and offered as a Link ONLY; a server invite keeps Card / Link.
 const DISCORD_USER='https://discord.com/users/374102653111762948';
 await page.locator('button[data-tool="media"]:visible').first().click();await page.locator('#mediaUrl').fill(DISCORD_USER);await page.locator('#mediaUrl').press('Enter');
 const card=page.locator('#mediaResult .ed-media-card');await card.waitFor();assert.equal((await card.locator('.tag').textContent()).trim(),'DISCORD');assert.equal((await card.locator('strong').textContent()).trim(),'Profile');
 assert.deepEqual(await card.locator('.ed-seg button').allTextContents(),['Link'],'Link only: no Player, no Card');
 await card.getByRole('button',{name:'Add to Wall'}).click();await page.locator('select').filter({has:page.locator('option[value=link]')}).first().waitFor();
 const showAs=page.locator('label.ed-field').filter({hasText:'Show as'}).locator('select');assert.deepEqual(await showAs.locator('option').allTextContents(),['Link']);
 assert.ok(await page.locator(`a[href="${DISCORD_USER}"]`).count()>=1,'it opens the official Discord profile address');
 await page.locator('button[data-tool="media"]:visible').first().click();await page.locator('#mediaUrl').fill('https://discord.gg/abc123');await page.locator('#mediaUrl').press('Enter');
 await card.waitFor();assert.equal((await card.locator('strong').textContent()).trim(),'Server invite');assert.deepEqual(await card.locator('.ed-seg button').allTextContents(),['Card','Link'],'invites unchanged');
 await page.locator('#mediaUrl').fill('javascript:alert(1)');await page.locator('#mediaUrl').press('Enter');await page.locator('#mediaResult .ed-media-msg').waitFor();assert.equal(await card.count(),0,'unsafe links are refused');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);assert.deepEqual(errors,[]);
 await page.screenshot({path:`${out}/wall-upload-${process.argv.includes('--live')?'live':'local'}-${width}.png`});
 results.push({width,uploadsSent:posts.length,storedCleanups:deletes.length,errors,overflow,ok:true});await context.close();
}}finally{await browser.close();}fs.writeFileSync(path.join(out,'wall-upload-browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
