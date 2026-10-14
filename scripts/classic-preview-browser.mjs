// Opt-in browser validation. ALL backend traffic is mocked; no real account,
// publication, upload, or stored media is modified. --live uses TESTING frontend.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createDocument } from '../dist/wall/schema.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.GAMID_BROWSER_MODULE || 'playwright');
const jpeg = require('jpeg-js');
const root = fileURLToPath(new URL('../dist/',import.meta.url));
const out = process.env.GAMID_BROWSER_OUTPUT || process.cwd();
const CF = 'https://gamid-testing-static.gamid.workers.dev';
const SUPA = 'upvtrczefcvigxdyuylw.supabase.co';
const uid = '00000000-0000-4000-8000-000000000005';
const crewId = '00000000-0000-4000-8000-000000000006';
const jpg = (w,h) => jpeg.encode({width:w,height:h,data:Buffer.alloc(w*h*4,180)},85).data;
const avatar = jpg(128,128), banner = jpg(1920,320);
const roles = [{key:'player',label:'Player'},{key:'creator',label:'Creator'}];
const library = {library_count:2,total_count:2,games:[{name:'League of Legends',sources:['MANUAL'],platforms:[{key:'windows_pc',label:'PC',source:'MANUAL'}]},{name:'Saved Game',sources:['MANUAL'],platforms:[{key:'windows_pc',label:'PC',source:'MANUAL'}]}]};
const about = {about_country_code:'SA',about_city_id:100,about_city_name:'Jeddah',about_location:'Jeddah, Saudi Arabia',about_languages:['ar'],about_genres:['rpg'],show_location:true,show_languages:true,show_genres:true,member_since_year:2024,member_since_date:'2024-03-05',catalogs:{languages:[{code:'ar',label:'Arabic'}],genres:[{key:'rpg',label:'RPG'}],countries:[{code:'SA',name:'Saudi Arabia'}]}};
const extras = {has_banner:true,member_since_year:2024,member_since_date:'2024-03-05',about_location:about.about_location,about_languages:about.catalogs.languages,about_genres:about.catalogs.genres};
const socials = [{platform_key:'instagram',kind:'profile',account_id:'fixture.gamer',sort_order:0}];
const crews = [{crew_id:crewId,crew_name:'Saved Crew',game_key:'league_of_legends',game_name:'League of Legends',role:'OWNER',member_count:2,members:[{handle:'fixture_friend',display_name:'Saved Friend'}]}];
const browser = await chromium.launch({executablePath:process.env.GAMID_CHROME_PATH || undefined,headless:true});
const results=[];
try {
  for (const width of [1440,390]) {
    const context = await browser.newContext({viewport:{width,height:900},hasTouch:width===390});
    await context.routeWebSocket('**/*',ws=>ws.close());
    const page = await context.newPage(), errors=[], calls=[];
    page.on('pageerror',e=>errors.push(e.message));
    let publication='DRAFT', wallEnabled=false, signedIn=true, withIntro=true, servedRoot=root;
    const wallDocument=createDocument();
    const row = () => ({entity_id:uid,gamid_handle:'fixture_owner',display_name:'Saved Gamer',bio:'Saved biography',visibility:publication,avatar_media_reference:uid+'/saved.jpg',role_keys:['player'],primary_role_key:'player',role_catalog:roles,education_work_status:'student',institution:'Saved School',field_of_study:'Design',education_work_catalog:[{key:'student',label:'Student'}],account_email:'fixture@example.test',preferred_language:'en'});
    const publicRow = () => ({...row(),intro_derivative_path:withIntro?uid+'/intro.webm':null,public_sections:{discord:{display_name:'Saved Discord',username:'saved_discord',trust_status:'CONNECTED'},steam:{persona_name:'Saved Steam',trust_status:'CONNECTED'},duo:{gamid_handle:'fixture_friend',display_name:'Saved Friend'},crews,my_games:library}});
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
    await context.addInitScript(({jwt}) => localStorage.setItem('gamid.testing.auth.session.v1',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600})),{jwt});
    await context.route('**/*',async route => {
      const request=route.request(),url=new URL(request.url()),action=url.pathname.split('/').pop();
      if (url.hostname===SUPA) {
        calls.push({path:url.pathname,method:request.method(),body:request.postData()});
        if(url.pathname.includes('/rpc/') && (!signedIn || !request.headers().authorization) && action.startsWith('get_my_')) return route.fulfill({status:401,contentType:'application/json',body:'{"message":"AUTH_REQUIRED"}'});
        if(url.pathname.startsWith('/storage/v1/object/authenticated/avatars/')) return route.fulfill({status:200,contentType:'image/jpeg',body:url.pathname.includes('/banner/')?banner:avatar});
        if(url.pathname.startsWith('/functions/v1/profile-banner/')) return route.fulfill({status:200,contentType:'image/jpeg',body:banner});
        const bodies={
          get_my_gamid:[row()],get_my_identity_profile:[row()],get_my_intro:[{transition_key:'fade',active_job_id:'intro-job',active_derivative_path:uid+'/intro.webm',active_state:'ready'}],
          get_my_section_visibility:[{section_key:'education_work',is_public:true}],get_my_about:[about],get_my_banner:[{banner_path:uid+'/banner/saved.jpg'}],
          get_my_social_links:socials,get_my_connections:[{provider_key:'discord',connected:true,is_public:true,provider_username:'saved_discord',provider_display_name:'Saved Discord',trust_status:'CONNECTED'},{provider_key:'steam',connected:true,is_public:true,provider_display_name:'Saved Steam',trust_status:'CONNECTED'}],
          get_my_public_games_settings:[{show_my_games:true,show_game_stats:false}],get_my_game_display_settings:[{show_game_playtime:false}],
          get_my_manual_games:library.games.map((g,i)=>({game_key:i?'saved_game':'league_of_legends',display_name:g.name,platforms:[{platform_key:'windows_pc',display_name:'PC'}]})),
          get_my_favorite_games:['saved_game'],get_my_game_profiles:[],get_my_discovered_games:[],get_my_league_profile:[],get_my_discord_profile_card:[],
          get_my_duo:[{relation:'DUO',show_public:true,is_published:true,gamid_handle:'fixture_friend',display_name:'Saved Friend'}],
          get_my_crews:[{...crews[0],my_status:'ACTIVE',my_role:'OWNER'}],get_crew_members:[{status:'ACTIVE',is_published:true,gamid_handle:'fixture_friend',display_name:'Saved Friend'}],
          get_public_crew_wall:{crew_name:'Saved Crew',document:null},get_my_wall_visibility:[{published:wallEnabled,is_enabled:wallEnabled}],get_my_crew_wall:[],
          get_public_identity:publication==='PUBLIC'?[publicRow()]:[],get_public_profile_extras:publication==='PUBLIC'?[extras]:[],get_public_social_links:publication==='PUBLIC'?socials:[],
          get_public_my_games:publication==='PUBLIC'?[library]:[],get_public_favorite_games:publication==='PUBLIC'?[{game_key:'saved_game',name:'Saved Game'}]:[],get_public_crews:publication==='PUBLIC'?crews:[],
          get_public_wall:wallEnabled?[{document:wallDocument,assets:[]}]:[],
          get_my_admin_status:false,get_my_unread_notification_count:0,get_my_notifications:[],
          get_my_usage:{storage:{used_bytes:0,quota_bytes:200000000,available_bytes:200000000,enforcement_active:true},media:{},quotas:[]},
        };
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(bodies[action]??[])});
      }
      if (url.origin===CF) {
        if(process.argv.includes('--live')) return route.continue();
        let file=path.resolve(servedRoot,'.'+decodeURIComponent(url.pathname));if(url.pathname.endsWith('/'))file=path.join(file,'index.html');
        if(!file.startsWith(path.resolve(servedRoot)+path.sep))throw Error('Unexpected fixture path');
        return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
      }
      return route.abort();
    });
    await page.goto(CF+'/account/');await page.locator('#identityView.is-active').waitFor();
    if(width>=1024){await page.waitForFunction(()=>document.querySelector('[data-editor-section=crew] > .desktop-summary')?.textContent.includes('Saved Crew'));assert.match(await page.locator('[data-editor-section=games] > .desktop-summary').innerText(),/Saved Game/);assert.match(await page.locator('[data-editor-section=crew] > .desktop-summary').innerText(),/Saved Crew/);assert.match(await page.locator('[data-editor-section=socials] > .desktop-summary').innerText(),/Instagram\s+Added/);await page.screenshot({path:path.join(out,`editor-populated-${width}.png`),fullPage:true});}
    const openSection=async key=>{const card=page.locator(`[data-editor-section="${key}"]`);for(const parent of await card.evaluate(e=>{const a=[];for(let p=e.parentElement;p;p=p.parentElement)if(p.dataset.editorSection)a.unshift(p.dataset.editorSection);return a;})){const t=page.locator(`[data-editor-section="${parent}"] > .section-toggle`);if(await t.getAttribute('aria-expanded')!=='true')await t.click();}const toggle=card.locator(':scope > .section-toggle');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();};
    const preview=async label=>{
      const before=calls.length;
      await page.locator('#previewClassicButton').click();await page.locator('.classic-preview-dialog[open]').waitFor();
      const outer=page.frameLocator('.classic-preview-dialog > iframe');
      if(width>=1280){await outer.locator('#desktopHero').waitFor();assert.match(await outer.locator('#desktopHero').innerText(),/Saved Gamer.*fixture_owner.*Player.*Saved biography/s);assert.match(await outer.locator('#desktopAbout').innerText(),/Jeddah.*Arabic.*RPG/s);assert.ok(await outer.locator('.public-crew-card').isVisible());}
      else {const mobile=outer.frameLocator('#experienceFrame');await mobile.locator('#previewName').filter({hasText:'Saved Gamer'}).waitFor();assert.equal(await mobile.locator('#previewBio').textContent(),'Saved biography');}
      assert.ok(await outer.getByRole('link',{name:/My Duo: Saved Friend/}).isVisible());assert.ok(await outer.locator('#publicGames').isVisible());assert.match(await outer.locator('#publicGames').innerText(),/Saved Game/);
      assert.ok(await outer.locator('.public-social[href="https://www.instagram.com/fixture.gamer/"]').isVisible());
      assert.equal(await outer.locator('#replayIntroButton').isVisible(),false);assert.equal(await outer.locator('#publicWall').count(),0);
      const mobile=outer.frameLocator('#experienceFrame');assert.equal(await mobile.locator('#introVideo').getAttribute('src'),null);
      const previewCalls=calls.slice(before);
      assert.equal(previewCalls.some(c=>/get_public_wall|sign.*intro|public-media.*intro|save_|set_|publish|upload\/object/.test(c.path)),false);
      await page.screenshot({path:path.join(out,`classic-preview-${width}-${label}.png`)});
      await page.getByRole('button',{name:'Back to Edit',exact:true}).click();await page.locator('.classic-preview-dialog iframe').waitFor({state:'detached'});assert.equal(new URL(page.url()).pathname,'/account/');
      return previewCalls.length;
    };
    await preview('private-no-edits');
    await openSection('name');await openSection('bio');await openSection('intro');await openSection('avatar');
    await page.locator('#profileDisplayName').fill('UNSAVED NAME');await page.locator('#profileBio').fill('UNSAVED BIO');await page.locator('#introTransition').selectOption('split');
    await page.locator('#profileAvatarInput').setInputFiles({name:'draft.jpg',mimeType:'image/jpeg',buffer:avatar});
    await page.locator('#avatarCropDialog[open]').waitFor();await page.locator('#applyAvatarCrop').click();await page.locator('#avatarCropDialog').waitFor({state:'hidden'});
    const avatarDraft=await page.locator('#profileAvatarThumbnail').evaluate(e=>e.style.backgroundImage);
    assert.match(avatarDraft,/blob:/);assert.equal(await page.locator('[data-profile-save=avatar]').isEnabled(),true);
    // A real local file exercises the existing Intro validation and local Blob draft.
    await page.locator('#introVideoInput').setInputFiles(path.join(root,'assets/gamid-intro.mp4'));
    await page.locator('#introFileStatus').filter({hasText:'ready to upload'}).waitFor();
    const introDraft=await page.locator('#introFileStatus').textContent();
    for(const state of [{label:'wall-unpublished',public:'DRAFT',wall:false},{label:'wall-disabled',public:'PUBLIC',wall:false},{label:'wall-enabled',public:'PUBLIC',wall:true}]) {
      publication=state.public;wallEnabled=state.wall;await preview(state.label);
      assert.equal(await page.locator('#profileDisplayName').inputValue(),'UNSAVED NAME');assert.equal(await page.locator('#profileBio').inputValue(),'UNSAVED BIO');
      assert.equal(await page.locator('#profileAvatarThumbnail').evaluate(e=>e.style.backgroundImage),avatarDraft);assert.equal(await page.locator('[data-profile-save=avatar]').isEnabled(),true);
      assert.equal(await page.locator('#introFileStatus').textContent(),introDraft);assert.equal(await page.locator('#introTransition').inputValue(),'split');assert.equal(await page.locator('#previewIntroButton').isEnabled(),true);
    }
    // Unauthorized URL parameters cannot select a different owner's private data.
    const visitor=await context.newPage();signedIn=false;await visitor.goto(CF+'/public/?classic-preview=owner&handle=someone-else');await visitor.locator('#notFoundState').waitFor();assert.equal(await visitor.locator('#desktopHero').count(),0);await visitor.close();
    assert.deepEqual(errors,[]);assert.equal(calls.some(c=>/\/rpc\/(update_|set_|save_|attach_|remove_|publish)/.test(c.path)),false);
    await page.screenshot({path:path.join(out,`classic-account-${width}.png`)});
    // Public Classic still renders exactly the previous commit's profile at both widths.
    signedIn=true;publication='PUBLIC';wallEnabled=false;withIntro=false;
    const publicShot=async () => {
      const visitor=await context.newPage();await visitor.goto(CF+'/public/?handle=fixture_owner');
      await visitor.locator('#publicGames').waitFor();await visitor.waitForTimeout(300);
      assert.equal(await visitor.locator('#previewClassicButton').count(),0);
      const shot=await visitor.screenshot({fullPage:true,animations:'disabled'});await visitor.close();return shot;
    };
    const currentShot=await publicShot();let publicMatchesBaseline=null;
    if(process.env.GAMID_BASELINE_ROOT && !process.argv.includes('--live')) {
      servedRoot=process.env.GAMID_BASELINE_ROOT;const baselineShot=await publicShot();servedRoot=root;
      publicMatchesBaseline=Buffer.compare(currentShot,baselineShot)===0;
      fs.writeFileSync(path.join(out,`classic-public-baseline-${width}.png`),baselineShot);
      assert.equal(publicMatchesBaseline,true,'Public Classic pixel-identical to the starting checkpoint');
    }
    fs.writeFileSync(path.join(out,`classic-public-current-${width}.png`),currentShot);
    // Visitor Wall selection remains active; only the owner's Classic Preview bypasses it.
    wallEnabled=true;const wallVisitor=await context.newPage();await wallVisitor.goto(CF+'/public/?handle=fixture_owner');await wallVisitor.locator('#publicWall').waitFor();assert.equal(await wallVisitor.locator('#publicGames').isVisible(),false);await wallVisitor.close();
    results.push({width,privateWithoutEdits:true,wallStates:3,savedClassicSections:true,avatarAndIntroDraftsKept:true,noWrites:true,noIntro:true,unauthorizedRefused:true,publicMatchesBaseline,visitorWallPreserved:true,errors});
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(out,'classic-preview-browser-results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
