// Opt-in browser validation. ALL backend traffic is mocked; no real account,
// publication, upload, or stored media is modified. --live uses TESTING frontend.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createDocument } from '../dist/wall/schema.js';
import {reviewCrewUX} from './crew-ux-review.mjs';
import { reviewDesktopLayout, openEditor, assertPairedLayout } from './desktop-layout-review.mjs';
import { reviewMobileDeck, deckOpen, deckClose } from './mobile-deck-review.mjs';
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
const fixtureCrews = [{crew_id:crewId,crew_name:'Saved Crew',game_key:'league_of_legends',game_name:'League of Legends',role:'OWNER',member_count:2,members:[{handle:'fixture_friend',display_name:'Saved Friend'}]},{crew_id:'00000000-0000-4000-8000-000000000007',crew_name:'Marvel Crew',game_key:'marvel_rivals',game_name:'Marvel Rivals',role:'OWNER',member_count:2,members:[]}];
const browser = await chromium.launch({executablePath:process.env.GAMID_CHROME_PATH || undefined,headless:true});
const results=[];
const crewUX=process.argv.includes('--crew-ux');
const mobileDeck=process.argv.includes('--mobile-deck');   // Mobile V2 deck: 'populated' runs the full flow, other scenarios layout + every editor
const crewMemberCount=Number(process.env.GAMID_CREW_MEMBERS||2);
const adaptive=process.argv.includes('--adaptive-layout')||process.argv.includes('--final-layout'),mediaReview=process.argv.includes('--media-review')||adaptive||crewUX||mobileDeck,reproduce=process.argv.includes('--reproduce');
const widths=mobileDeck?(process.env.GAMID_DECK_WIDTHS||'360,375,390,430,600,768,820,1023').split(',').map(Number):crewUX?(process.env.GAMID_CREW_WIDTHS||'390,768,1024,1440,1920').split(',').map(Number):adaptive?(process.env.GAMID_ADAPTIVE_WIDTHS||'1024,1152,1280,1440,1920,2560').split(',').map(Number):mediaReview?[1024,1440,1920,390]:[1440,390];
const runs=widths.flatMap(width=>(mobileDeck?(process.env.GAMID_DECK_SCENARIOS||'populated,rich,empty,failed').split(','):crewUX?(process.env.GAMID_CREW_COUNTS||'0,1,2,3,5,9,10').split(','):adaptive?(process.env.GAMID_ADAPTIVE_SCENARIOS||'empty,populated,rich').split(','):['populated']).map(scenario=>({width,scenario})));
try {
  for (const {width,scenario} of runs) {
    const crews=crewUX?Array.from({length:Number(scenario)},(_,i)=>({...fixtureCrews[i%2],crew_id:'00000000-0000-4000-8000-'+String(100+i).padStart(12,'0'),crew_name:'Crew '+(i+1),game_key:i<2?fixtureCrews[i].game_key:'fixture_game_'+i,role:i>0&&i===Number(scenario)-1?'MEMBER':'OWNER'})):fixtureCrews;
    let crewWallModel={stage_count:1,stages_allowed:2,published:false,revision:1,cards:[]};
    const removedMembers=new Map();
    const context = await browser.newContext({viewport:{width,height:900},hasTouch:width===390});
    await context.routeWebSocket('**/*',ws=>ws.close());
    const page = await context.newPage(), errors=[], calls=[];
    await page.addInitScript(()=>{window.mediaPlayCalls=0;const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.mediaPlayCalls++;return play.call(this);};});
    page.on('pageerror',e=>errors.push(e.message));
    // The shared row's Education draft never matches its catalog (dirty on load at every width); the deck review needs a clean start.
    let rowOverrides=mobileDeck?{education_work_status:null,institution:null,field_of_study:null}:{};let publication='DRAFT', wallEnabled=mobileDeck, signedIn=true, withIntro=true, servedRoot=mobileDeck&&process.env.GAMID_DECK_ROOT||root,failedMedia=mobileDeck&&scenario==='failed',imageRequests=0;
    const wallDocument=createDocument();
    const row = () => ({entity_id:uid,gamid_handle:'fixture_owner',display_name:'Saved Gamer',bio:'Saved biography',visibility:publication,avatar_media_reference:adaptive&&scenario==='empty'?null:uid+'/saved.jpg',role_keys:['player'],primary_role_key:'player',role_catalog:roles,education_work_status:'student',institution:'Saved School',field_of_study:'Design',education_work_catalog:[{key:'student',label:'Student'}],account_email:'fixture@example.test',preferred_language:'en',...rowOverrides});
    const publicRow = () => ({...row(),intro_derivative_path:withIntro?uid+'/intro.webm':null,public_sections:{discord:{display_name:'Saved Discord',username:'saved_discord',trust_status:'CONNECTED'},steam:{persona_name:'Saved Steam',trust_status:'CONNECTED'},duo:{gamid_handle:'fixture_friend',display_name:'Saved Friend'},crews,my_games:library}});
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
    await context.addInitScript(({jwt}) => localStorage.setItem('gamid.testing.auth.session.v1',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600})),{jwt});
    await context.route('**/*',async route => {
      const request=route.request(),url=new URL(request.url()),action=url.pathname.split('/').pop();
      if (url.hostname===SUPA) {
        calls.push({path:url.pathname,method:request.method(),body:request.postData(),classicFrame:request.frame().url().includes('classic-preview=owner')});
        if(url.pathname.includes('/rpc/') && (!signedIn || !request.headers().authorization) && action.startsWith('get_my_')) return route.fulfill({status:401,contentType:'application/json',body:'{"message":"AUTH_REQUIRED"}'});
        if(url.pathname.startsWith('/storage/v1/object/authenticated/avatars/')) return route.fulfill({status:200,contentType:'image/jpeg',body:url.pathname.includes('/banner/')?banner:avatar});
        if(url.pathname.startsWith('/functions/v1/profile-banner/')) return route.fulfill({status:200,contentType:'image/jpeg',body:banner});
        if(mediaReview&&url.pathname.startsWith('/storage/v1/object/sign/intro-media/')){
          if(request.method()==='POST'){const token='header.'+Buffer.from(JSON.stringify({iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+120})).toString('base64url')+'.fixture';return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({signedURL:'/object/sign/intro-media/'+uid+'/intro.webm?token='+token})});}
          return route.fulfill({status:failedMedia?404:200,contentType:'video/mp4',body:failedMedia?Buffer.alloc(0):fs.readFileSync(path.join(root,'assets/gamid-intro.mp4')),headers:{'Access-Control-Allow-Origin':CF}});
        }
        if(mediaReview&&url.pathname.startsWith('/functions/v1/game-artwork/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true,artwork:{marvel_rivals:{hero:'https://cdn2.steamgriddb.com/hero/marvel.jpg',icon:'https://cdn2.steamgriddb.com/icon/marvel.png'},league_of_legends:{hero:'https://cdn2.steamgriddb.com/hero/league.jpg',icon:'https://cdn2.steamgriddb.com/icon/league.png',grid:'https://cdn2.steamgriddb.com/grid/league.jpg'},saved_game:{icon:'https://cdn2.steamgriddb.com/icon/saved.png',cover:'https://cdn2.steamgriddb.com/grid/saved.jpg'}},myGames:{'League of Legends|':'league_of_legends','Saved Game|':'saved_game'}})});
        const bodies={
          get_my_gamid:[row()],get_my_identity_profile:[row()],get_my_intro:[{transition_key:'fade',active_job_id:'intro-job',active_derivative_path:uid+'/intro.webm',active_state:'ready'}],
          get_my_section_visibility:[{section_key:'education_work',is_public:true}],get_my_about:[about],get_my_banner:[{banner_path:uid+'/banner/saved.jpg'}],
          get_my_social_links:socials,get_my_connections:[{label:'Discord',provider_key:'discord',connected:true,is_public:true,provider_username:'saved_discord',provider_display_name:'Saved Discord',trust_status:'CONNECTED',provider_avatar_url:mediaReview?'https://cdn.discordapp.com/avatars/1/avatar.png':null},{label:'Steam',provider_key:'steam',connected:true,is_public:true,provider_display_name:'Saved Steam',trust_status:'CONNECTED',provider_avatar_url:mediaReview?'https://avatars.fastly.steamstatic.com/'+'a'.repeat(40)+'_full.jpg':null}],
          get_my_public_games_settings:[{show_my_games:true,show_game_stats:false}],get_my_game_display_settings:[{show_game_playtime:false}],
          get_my_manual_games:library.games.map((g,i)=>({game_key:i?'saved_game':'league_of_legends',display_name:g.name,platforms:[{platform_key:'windows_pc',display_name:'PC'}]})),
          get_my_favorite_games:['saved_game'],get_my_game_profiles:[],get_my_discovered_games:[],get_my_league_profile:mediaReview?[{game_name:'Saved League',tag_line:'TEST',profile_icon_id:1666,platform_id:'ME1',solo_rank_state:'UNRANKED',is_public:false}]:[],get_my_discord_profile_card:[],
          get_my_duo:[{relation:'DUO',show_public:true,is_published:true,gamid_handle:'fixture_friend',display_name:'Saved Friend'}],
          get_my_crews:crews.map(c=>({...c,my_status:'ACTIVE',my_role:'OWNER'})),get_crew_members:[{status:'ACTIVE',is_published:true,gamid_handle:'fixture_friend',display_name:'Saved Friend',avatar_media_reference:uid+'/member.jpg'}],
          get_public_crew_wall:{crew_name:'Saved Crew',document:null},get_my_wall_visibility:[{published:wallEnabled,is_enabled:wallEnabled}],get_my_crew_wall:[],
          get_public_identity:publication==='PUBLIC'?[publicRow()]:[],get_public_profile_extras:publication==='PUBLIC'?[extras]:[],get_public_social_links:publication==='PUBLIC'?socials:[],
          get_public_my_games:publication==='PUBLIC'?[library]:[],get_public_favorite_games:publication==='PUBLIC'?[{game_key:'saved_game',name:'Saved Game'}]:[],get_public_crews:publication==='PUBLIC'?crews:[],
          get_public_wall:wallEnabled?[{document:wallDocument,assets:[]}]:[],
          get_my_admin_status:false,get_my_unread_notification_count:0,get_my_notifications:[],
          get_my_usage:{storage:{used_bytes:0,quota_bytes:200000000,available_bytes:200000000,enforcement_active:true},media:{},quotas:[]},
        };
        if(crewUX){
          bodies.get_my_crews=crews.map(c=>({...c,my_status:'ACTIVE',my_role:c.role}));bodies.get_my_crew_wall=crewWallModel;
          for(const c of bodies.get_my_crews)c.member_count=crewMemberCount-(removedMembers.get(c.crew_id)?.size||0);
          bodies.get_crew_members=Array.from({length:crewMemberCount},(_,i)=>({status:'ACTIVE',role:i?'MEMBER':'OWNER',is_published:i%2===0,gamid_handle:i===0?'fixture_owner':i===1?'fixture_friend':`fixture_player_${i}`,display_name:crewMemberCount===15?`Player ${i+1} With A Long Display Name`:(i?'Saved Friend':'Saved Gamer'),avatar_media_reference:uid+'/member.jpg'}));
          if(action==='get_crew_members')bodies.get_crew_members=bodies.get_crew_members.filter(p=>!removedMembers.get(request.postDataJSON().candidate_crew)?.has(p.gamid_handle));
          if(action==='remove_crew_member'){const data=request.postDataJSON();const removed=removedMembers.get(data.candidate_crew)||new Set();removed.add(data.candidate_handle);removedMembers.set(data.candidate_crew,removed);bodies.remove_crew_member=true;}
          bodies.search_duo_candidates=[{gamid_handle:'fresh_friend',display_name:'Fresh Friend',is_published:true}];
          if(action==='rename_crew'){const data=request.postDataJSON();crews.find(c=>c.crew_id===data.candidate_crew).crew_name=data.candidate_name;bodies.rename_crew=true;}
          if(action==='save_crew_wall'){const data=request.postDataJSON();crewWallModel={...crewWallModel,stage_count:data.candidate_stage_count,cards:data.candidate_cards,revision:crewWallModel.revision+1};bodies.save_crew_wall=crewWallModel.revision;}
          if(action==='set_crew_wall_published'){crewWallModel={...crewWallModel,published:request.postDataJSON().candidate_published};bodies.set_crew_wall_published=true;}
          bodies.invite_to_crew=true;
        }
        if(mobileDeck&&action==='update_my_identity_profile'){const d=request.postDataJSON();rowOverrides={...rowOverrides,display_name:d.candidate_display_name,bio:d.candidate_bio,role_keys:d.candidate_role_keys,primary_role_key:d.candidate_primary_role_key,education_work_status:d.candidate_education_work_status,institution:d.candidate_institution,field_of_study:d.candidate_field_of_study};bodies.update_my_identity_profile=[row()];}
        if(adaptive||mobileDeck){
          if(scenario==='empty'){for(const name of ['get_my_intro','get_my_banner','get_my_social_links','get_my_connections','get_my_manual_games','get_my_favorite_games','get_my_league_profile','get_my_duo','get_my_crews'])bodies[name]=[];bodies.get_my_about=[{...about,about_country_code:null,about_city_id:null,about_city_name:null,about_languages:[],about_genres:[]}];}
          if(scenario==='rich'){
            bodies.get_my_manual_games=Array.from({length:14},(_,i)=>({game_key:i===0?'league_of_legends':i===1?'saved_game':`fixture_game_${i}`,display_name:`Game ${i+1}: A Very Long Edition Name With Additional Expansions and Platforms`,platforms:[{platform_key:'windows_pc',display_name:'PC'},{platform_key:'playstation_5',display_name:'PlayStation 5'}]}));
            bodies.get_my_crews=Array.from({length:10},(_,i)=>({...crews[0],crew_id:`00000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`,crew_name:`Crew ${i+1}: Players Across the World With A Long Name`,game_key:`fixture_game_${i}`,game_name:`Game ${i+1}: Long Subtitle`,my_status:'ACTIVE',my_role:'OWNER',member_count:15}));
            bodies.get_crew_members=Array.from({length:15},(_,i)=>({status:'ACTIVE',is_published:true,gamid_handle:`fixture_player_${i}`,display_name:`Player ${i+1} With A Long Display Name`}));
            bodies.get_my_social_links=['instagram','youtube','tiktok','twitch','kick','x','snapchat','discord','facebook','spotify','soundcloud','vimeo'].map((platform_key,i)=>({platform_key,kind:'profile',account_id:platform_key==='discord'?'123456789012345678':'fixture.gamer',sort_order:i}));
            for(const c of bodies.get_my_connections){c.provider_display_name='A Long Provider Display Name With Extra Details';c.provider_username='long_provider_username_'.repeat(3);}
            bodies.get_my_duo=[{...bodies.get_my_duo[0],display_name:'A Long Duo Display Name With More Characters'}];
          }
        }
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(bodies[action]??[])});
      }
      if (url.origin===CF) {
        if(process.argv.includes('--live')) return route.continue();
        let file=path.resolve(servedRoot,'.'+decodeURIComponent(url.pathname));if(url.pathname.endsWith('/'))file=path.join(file,'index.html');
        if(!file.startsWith(path.resolve(servedRoot)+path.sep))throw Error('Unexpected fixture path');
        return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
      }
      if(mediaReview&&['cdn2.steamgriddb.com','avatars.fastly.steamstatic.com','cdn.discordapp.com','opgg-static.akamaized.net'].includes(url.hostname)){imageRequests++;return route.fulfill({status:failedMedia?404:200,contentType:'image/jpeg',body:failedMedia?Buffer.alloc(0):adaptive&&scenario==='rich'?jpg(url.pathname.includes('league')?40:320,url.pathname.includes('league')?240:60):avatar,headers:{'Cache-Control':'no-store'}});}
      return route.abort();
    });
    await page.goto(CF+'/account/');await page.locator('#identityView.is-active').waitFor();
    if(crewUX){results.push(await reviewCrewUX({page,width,count:Number(scenario),memberCount:crewMemberCount,out,calls,setPublic:()=>{publication='PUBLIC';withIntro=false;wallEnabled=false;}}));assert.deepEqual(errors,[]);await context.close();continue;}
    // From 1024px the deck is inactive: record the unchanged Desktop editor (compare with GAMID_DECK_ROOT = the starting dist).
    if(mobileDeck&&width>=1024){await page.waitForFunction(()=>{const p=document.querySelector('.desktop-intro-preview');return p&&!/Preparing thumbnail/.test(p.textContent)&&(!p.querySelector('img')||p.querySelector('img').naturalWidth>0);},null,{timeout:20000});await page.waitForTimeout(2500);assert.equal(await page.locator('#identityView.mobile-deck').count(),0);assert.equal(await page.locator('#identityView.desktop-editor').count(),1);await page.screenshot({path:path.join(out,`desktop-${process.env.GAMID_DECK_ROOT?'baseline':'current'}-${scenario}-${width}.png`),fullPage:true,animations:'disabled'});results.push({width,scenario,desktop:true,enabledSaves:await page.evaluate(()=>[...document.querySelectorAll('[data-profile-save]')].filter(b=>!b.disabled).map(b=>b.dataset.profileSave))});assert.deepEqual(errors,[]);await context.close();continue;}
    if(mobileDeck){results.push(await reviewMobileDeck({page,width,scenario,out,calls,full:scenario==='populated',imageRequests:()=>imageRequests}));assert.deepEqual(errors,[]);await context.close();continue;}
    if(adaptive){results.push(await reviewDesktopLayout({page,width,scenario,out,calls,reproduce}));assert.deepEqual(errors,[]);await context.close();continue;}
    if(mediaReview){
      await page.waitForFunction(()=>document.querySelector('#crewPanel')?.textContent.includes('Saved Crew'));await page.waitForTimeout(reproduce?300:1500);if(!reproduce&&width>=1024)await page.waitForFunction(()=>document.querySelector('.desktop-intro-preview img')?.naturalWidth>0);
      if(width>=1024){
        const socialsCard=page.locator('[data-editor-section=socials]'),connectionCard=page.locator('[data-editor-section=connections]');const before=(await socialsCard.locator(':scope > .desktop-summary').boundingBox()).height;
        await connectionCard.locator(':scope > .section-toggle').click();await page.locator('[data-editor-section=league] > .section-toggle').click();await page.waitForTimeout(300);
        const after=(await socialsCard.locator(':scope > .desktop-summary').boundingBox()).height;const stats={width,poster:await page.locator('.desktop-intro-preview img').count(),steam:await page.locator('.connection-card[data-provider=steam] .connection-avatar img').count(),league:await page.locator('.league-card .connection-avatar img').count(),covers:await page.locator('[data-editor-section=games] > .desktop-summary img.game-art').count(),socialsBefore:before,socialsAfter:after,plays:await page.evaluate(()=>window.mediaPlayCalls)};
        await page.screenshot({path:path.join(out,`editor-media-${reproduce?'before':'after'}-${width}.png`),fullPage:true});
        if(!reproduce){assert.equal(stats.poster,1);assert.equal(stats.steam,1);assert.equal(stats.league,1);assert.ok(stats.covers>=2);assert.equal(before,after);assert.equal(stats.plays,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.desktop-intro-preview img').evaluate(n=>n.naturalWidth>0),true);assert.match(await page.locator('.league-card').innerText(),/UNVERIFIED/);
          for(const key of ['avatar','intro','games','game-display','duo','crew']){await openEditor(page,key);await assertPairedLayout(page);}
          assert.equal(await page.locator('.desktop-intro-preview img').isVisible(),true);
          if(width===1440){const editorImages=await page.locator('[data-editor-section=games] > .desktop-summary img.game-art').evaluateAll(nodes=>nodes.map(n=>n.src).sort());await page.locator('#previewClassicButton').click();const frame=page.frameLocator('.classic-preview-dialog > iframe');await frame.locator('#desktopHero').waitFor();await frame.locator('#publicGames img.game-art').first().waitFor();const previewImages=await frame.locator('#publicGames img.game-art').evaluateAll(nodes=>nodes.map(n=>n.src).sort());assert.deepEqual(previewImages,editorImages,'Editor and saved private Classic My Games use identical artwork');await page.getByRole('button',{name:'Back to Edit',exact:true}).click();stats.previewArtworkMatches=true;}
          if(width===1024){await page.setViewportSize({width:390,height:900});await page.locator('#identityView.mobile-deck').waitFor();await page.waitForFunction(()=>document.querySelector('.connection-card[data-provider=steam] .connection-avatar img.deck-provider-photo'));await page.setViewportSize({width,height:900});await page.locator('#identityView.desktop-editor').waitFor();assert.equal(await page.locator('img.deck-provider-photo').count(),0,'the deck hands its photos back to Desktop');await page.waitForFunction(()=>document.querySelector('.desktop-intro-preview img')?.naturalWidth>0);failedMedia=true;imageRequests=0;await page.reload();await page.waitForFunction(()=>document.querySelector('.desktop-intro-preview')?.textContent.includes('Thumbnail unavailable'));await page.waitForTimeout(300);assert.equal(await page.locator('.desktop-intro-preview img').count(),0);assert.equal(await page.locator('.connection-card[data-provider=steam] .connection-avatar img').count(),0);assert.equal(await page.locator('.league-card .connection-avatar img').count(),0);assert.ok(imageRequests<30,'failed image URLs do not cause an infinite retry/render loop');stats.failuresHandled=true;}
          assert.equal(calls.some(c=>/\/rpc\/(?:set_|save_|update_|publish|queue_)/.test(c.path)),false,'thumbnail/artwork reads never save or publish');
        }
        results.push(stats);
      }else{// Mobile V2 (2026-10-17 audit): the same owner media as Desktop - paused Intro frame, provider photos, game artwork - with no playback or writes.
        await page.waitForFunction(()=>document.querySelector('[data-deck-card=intro] .deck-intro-tile img')?.naturalWidth>0,null,{timeout:20000});assert.equal(await page.locator('.connection-card[data-provider=steam] .connection-avatar img').count(),1);assert.ok(await page.locator('#myGamesSection .game-art').count()>=2);assert.equal(await page.evaluate(()=>window.mediaPlayCalls),0);assert.equal(calls.some(c=>/\/rpc\/(?:set_|save_|update_|publish|queue_)/.test(c.path)),false);results.push({width,mobileMedia:true});}
      assert.deepEqual(errors,[]);await context.close();continue;
    }
    if(width>=1024){await page.waitForFunction(()=>document.querySelector('[data-editor-section=crew] > .desktop-summary')?.textContent.includes('Saved Crew'));assert.match(await page.locator('[data-editor-section=games] > .desktop-summary').innerText(),/Saved Game/);assert.match(await page.locator('[data-editor-section=crew] > .desktop-summary').innerText(),/Saved Crew/);assert.match(await page.locator('[data-editor-section=socials] > .desktop-summary').innerText(),/Instagram\s+Added/);await page.screenshot({path:path.join(out,`editor-populated-${width}.png`),fullPage:true});}
    const openSection=async key=>{if(await page.locator('#identityView.mobile-deck').count()){await deckOpen(page,key);return;}const card=page.locator(`[data-editor-section="${key}"]`);for(const parent of await card.evaluate(e=>{const a=[];for(let p=e.parentElement;p;p=p.parentElement)if(p.dataset.editorSection)a.unshift(p.dataset.editorSection);return a;})){const t=page.locator(`[data-editor-section="${parent}"] > .section-toggle`);if(await t.getAttribute('aria-expanded')!=='true')await t.click();}const toggle=card.locator(':scope > .section-toggle');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();};
    const preview=async label=>{
      const before=calls.length;await deckClose(page);
      await page.locator('#previewClassicButton').click();await page.locator('.classic-preview-dialog[open]').waitFor();
      const outer=page.frameLocator('.classic-preview-dialog > iframe');
      if(width>=1280){await outer.locator('#desktopHero').waitFor();assert.match(await outer.locator('#desktopHero').innerText(),/Saved Gamer.*fixture_owner.*Player.*Saved biography/s);assert.match(await outer.locator('#desktopAbout').innerText(),/Jeddah.*Arabic.*RPG/s);assert.ok(await outer.locator('.public-crew-card').isVisible());}
      else {const mobile=outer.frameLocator('#experienceFrame');await mobile.locator('#previewName').filter({hasText:'Saved Gamer'}).waitFor();assert.equal(await mobile.locator('#previewBio').textContent(),'Saved biography');}
      assert.ok(await outer.getByRole('link',{name:/My Duo: Saved Friend/}).isVisible());assert.ok(await outer.locator('#publicGames').isVisible());assert.match(await outer.locator('#publicGames').innerText(),/Saved Game/);
      assert.ok(await outer.locator('.public-social[href="https://www.instagram.com/fixture.gamer/"]').isVisible());
      assert.equal(await outer.locator('#replayIntroButton').isVisible(),false);assert.equal(await outer.locator('#publicWall').count(),0);
      const mobile=outer.frameLocator('#experienceFrame');assert.equal(await mobile.locator('#introVideo').getAttribute('src'),null);
      const previewCalls=calls.slice(before);
      assert.equal(previewCalls.some(c=>/get_public_wall|save_|set_|publish|upload\/object/.test(c.path)||(c.classicFrame&&/sign.*intro|public-media.*intro/.test(c.path))),false,'Classic frame never requests Intro; Account may capture its independent paused thumbnail');
      await page.screenshot({path:path.join(out,`classic-preview-${width}-${label}.png`)});
      await page.getByRole('button',{name:'Back to Edit',exact:true}).click();await page.locator('.classic-preview-dialog iframe').waitFor({state:'detached'});assert.equal(new URL(page.url()).pathname,'/account/');
      return previewCalls.length;
    };
    await preview('private-no-edits');
    await openSection('name');await page.locator('#profileDisplayName').fill('UNSAVED NAME');await openSection('bio');await page.locator('#profileBio').fill('UNSAVED BIO');await openSection('intro');await page.locator('#introTransition').selectOption('split');await openSection('avatar');
    await page.locator('#profileAvatarInput').setInputFiles({name:'draft.jpg',mimeType:'image/jpeg',buffer:avatar});
    await page.locator('#avatarCropDialog[open]').waitFor();await page.locator('#applyAvatarCrop').click();await page.locator('#avatarCropDialog').waitFor({state:'hidden'});
    const avatarDraft=await page.locator('#profileAvatarThumbnail').evaluate(e=>e.style.backgroundImage);
    assert.match(avatarDraft,/blob:/);assert.equal(await page.locator('[data-profile-save=avatar]').isEnabled(),true);
    // A real local file exercises the existing Intro validation and local Blob draft.
    await openSection('intro');await page.locator('#introVideoInput').setInputFiles(path.join(root,'assets/gamid-intro.mp4'));
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
