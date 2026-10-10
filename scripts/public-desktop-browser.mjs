// Isolated Chrome fixture for the desktop Classic Profile (DEC-0005) and the unchanged mobile / tablet layout. All Supabase traffic is intercepted; no real
// account or data is touched. Set GAMID_BROWSER_MODULE (Playwright) and optionally GAMID_BROWSER_OUTPUT; --live serves the deployed TESTING frontend files.
// GAMID_BASELINE_ROOT (a dist/ directory of the previous frontend) enables the mobile comparison: the same profile, rendered by the old and by the new
// frontend at 390 / 768 / 1279 px, must produce identical screenshots.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {createDocument} from '../dist/wall/schema.js';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.GAMID_BROWSER_MODULE||'playwright');const jpeg=require('jpeg-js');
const CF='https://gamid-testing-static.gamid.workers.dev',SUPA='upvtrczefcvigxdyuylw.supabase.co',root=fileURLToPath(new URL('../dist/',import.meta.url)),out=process.env.GAMID_BROWSER_OUTPUT||process.cwd(),live=process.argv.includes('--live');
const baseline=process.env.GAMID_BASELINE_ROOT||null;
const mk=(w,h,f)=>{const d=new Uint8Array(w*h*4);for(let i=0;i<d.length;i+=4){const p=i/4,x=p%w,y=Math.floor(p/w);const [r,g,b]=f(x,y);d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=255;}return Buffer.from(jpeg.encode({data:d,width:w,height:h},88).data);};
const BANNER=mk(1920,320,(x,y)=>[40+x%200,30+y%120,120+(x>>3)%120]);const AVATAR=mk(256,256,(x,y)=>[220-(x>>1),120+(y>>2),200]);
const steam={key:'steam',label:'Steam',source:'DISCOVERED_FROM_STEAM'},manual=(key,label)=>({key,label,source:'MANUAL'});
const games=[{name:'Call of Duty 4: Modern Warfare',year:2007,sources:['MANUAL'],platforms:[manual('pc','PC'),manual('ps3','PlayStation 3')]},{name:'Crash Bandicoot',year:1996,sources:['MANUAL'],platforms:[manual('ps1','PlayStation (PS1)')]},{name:'Dark and Darker',year:2023,sources:['MANUAL'],platforms:[steam]},{name:'Grand Theft Auto: San Andreas',year:2004,sources:['MANUAL'],platforms:[manual('ps2','PlayStation 2')]},{name:'Gundam 0079',year:1996,sources:['MANUAL'],platforms:[manual('ps1','PlayStation (PS1)')]},{name:'League of Legends',year:2009,sources:['MANUAL'],platforms:[manual('pc','PC')]}];
const identity=extra=>({gamid_handle:'fixture_desk',display_name:'Espada Fixture',avatar_media_reference:'00000000-0000-4000-8000-000000000001/avatar-x.webp',bio:'Gamer who loves competitive games, discovering new worlds and building an identity.',role_keys:['gamer','creator','esports'],primary_role_key:'gamer',role_catalog:[{key:'gamer',label:'Gamer'},{key:'creator',label:'Content Creator'},{key:'esports',label:'Esports Player'}],education_work_status:'freelancer',institution:null,field_of_study:null,education_work_catalog:[{key:'freelancer',label:'Freelancer'}],intro_transition_key:'fade',intro_derivative_path:null,public_sections:{discord:{display_name:'mazen~',username:'mazen9492',trust_status:'CONNECTED'},league:{game_name:'Espada black',tag_line:'esp',platform_id:'ME1',rank_state:'RANKED',tier:'BRONZE',division:'IV',lp:7,wins:2,losses:3,data_source:'OPGG_TEMPORARY',updated_at:'2026-10-07T10:00:00Z'},my_games:{library_count:12,total_count:12,games}},...extra});
// My Duo + two Crews (server order) - the desktop sidebar's MY CREW cards; LONG = maximum content (a 60-character Location, 5 + 5 long labels, a 60-character
// Duo name with a 24-character handle, a 40-character Crew name)
const CREW_A='11111111-2222-4333-8444-555555555555',CREW_B='99999999-2222-4333-8444-555555555555';
const relations={duo:{gamid_handle:'fixture_duo',display_name:'Duo Partner',avatar_media_reference:null},crews:[{crew_id:CREW_A,crew_name:'Night Owls',game_key:'league-of-legends',game_name:'League of Legends',role:'OWNER',member_count:4},{crew_id:CREW_B,crew_name:'Spike Rushers',game_key:'valorant',game_name:'VALORANT',role:'MEMBER',member_count:1}]};
const baseSections=identity({}).public_sections;
const LONG_LOCATION='Taumatawhakatangihangakoauauotamateaturipukakapikimaungahoronukupokaiwhenuakitanatahu'.slice(0,56)+', NZ';   // one unbreakable word + a country: 60 characters
const LONG={duo:{gamid_handle:'fixture_duo_long_handle1',display_name:'TheExtremelyLongDisplayNameOfMyDuoPartnerThatKeepsGoingOnAn',avatar_media_reference:null},crews:[{crew_id:CREW_A,crew_name:'The Unbelievably Long Crew Name Of Night',game_key:'league-of-legends',game_name:'League of Legends',role:'OWNER',member_count:15}]};
const longExtras={member_since_year:2024,member_since_date:'2024-03-05',has_banner:true,about_location:LONG_LOCATION,about_languages:['Portuguese (Brazil)','Chinese (Simplified)','Indonesian','Vietnamese','Ukrainian'].map((label,i)=>({code:`l${i}`,label})),about_genres:['Massively Multiplayer Online Role-Playing Game','Real-Time Strategy','Battle Royale','Survival Horror','Fighting'].map((label,i)=>({key:`g${i}`,label}))};
const SCENARIOS={
 full:{identity:identity({public_sections:{...baseSections,...relations}}),links:[{platform_key:'instagram',label:'Instagram',kind:'profile',account_id:'fixture'},{platform_key:'youtube',label:'YouTube',kind:'channel',account_id:'@fixture'}],extras:{member_since_year:2024,member_since_date:'2024-03-05',has_banner:true,about_location:'Riyadh, Saudi Arabia',about_languages:[{code:'ar',label:'Arabic'},{code:'en',label:'English'}],about_genres:[{key:'action',label:'Action'},{key:'rpg',label:'RPG'},{key:'fps',label:'FPS'}]},banner:true},
 long:{identity:identity({public_sections:{...baseSections,...LONG}}),links:[{platform_key:'instagram',label:'Instagram',kind:'profile',account_id:'fixture'},{platform_key:'discord',label:'Discord',kind:'profile',account_id:'123456789012345678'}],extras:longExtras,banner:true},
 aboutSome:{identity:identity({}),links:[],extras:{...longExtras,about_location:null,about_languages:[]},banner:true},
 crewOnly:{identity:identity({public_sections:{crews:relations.crews}}),links:[],extras:{member_since_year:2024,member_since_date:'2024-03-05',has_banner:false,about_location:null,about_languages:[],about_genres:[]},banner:false},
 plain:{identity:identity({public_sections:{},avatar_media_reference:null,bio:'',role_keys:[],primary_role_key:null,education_work_status:null}),links:[],extras:{member_since_year:2026,has_banner:false,about_location:null,about_languages:[],about_genres:[]},banner:false},
 bannerRefused:{identity:identity({}),links:[],extras:{member_since_year:2024,has_banner:true,about_location:null,about_languages:[],about_genres:[]},banner:false},
 wall:{identity:identity({}),links:[],extras:{member_since_year:2024,has_banner:true,about_location:null,about_languages:[],about_genres:[]},banner:true,wall:true},
};
async function open(browser,{width,height=900},scenario,fixtureRoot=root){
 const s=SCENARIOS[scenario];const context=await browser.newContext({viewport:{width,height}});const page=await context.newPage();await context.routeWebSocket('**/*',ws=>ws.close());
 const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const url=new URL(route.request().url());
  if(url.hostname===SUPA){
   if(url.pathname.startsWith('/functions/v1/profile-banner/')){calls.push('profile-banner');return s.banner?route.fulfill({status:200,contentType:'image/jpeg',headers:{'cache-control':'no-store'},body:BANNER}):route.fulfill({status:404,body:''});}
   if(url.pathname.startsWith('/storage/v1/object/authenticated/avatars/'))return route.fulfill({status:200,contentType:'image/jpeg',body:AVATAR});
   const action=url.pathname.split('/').pop();calls.push(action);let body=[];
   if(action==='get_public_identity')body=[s.identity];
   if(action==='get_public_social_links')body=s.links;
   if(action==='get_public_profile_extras')body=[s.extras];
   if(action==='get_public_wall')body=s.wall?[{document:createDocument(),published_at:'2026-10-09T00:00:00Z',assets:[]}]:[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});}
  if(url.origin===CF){if(live&&fixtureRoot===root)return route.continue();let file=path.resolve(fixtureRoot,'.'+decodeURIComponent(url.pathname));if(url.pathname.endsWith('/'))file=path.join(file,'index.html');if(!file.startsWith(path.resolve(fixtureRoot)+path.sep))throw Error('out of fixture');try{return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file).toString().replace(/__ASSET_VERSION__/g,'fixture')});}catch{return route.fulfill({status:404,body:'missing fixture asset'});}}
  return route.abort();});
 await page.goto(CF+'/public/index.html?handle=fixture_desk');
 await page.waitForFunction(()=>document.documentElement.classList.contains('is-public-live'),null,{timeout:20000});await page.waitForTimeout(1800);
 return {context,page,errors,calls};
}
const visible=(page,sel)=>page.locator(sel).first().isVisible().catch(()=>false);
const results=[];const browser=await chromium.launch({executablePath:process.env.GAMID_CHROME_PATH||undefined,headless:true});
try{
 // ---- desktop: 1280 / 1440 / 1920
 for(const width of [1280,1440,1920]){
  const {context,page,errors,calls}=await open(browser,{width},'full');
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('is-public-desktop')),true,`${width}: desktop profile`);
  assert.equal(await visible(page,'#desktopHero'),true);assert.equal(await page.locator('#experienceWrap').isVisible(),false,'the Intro frame is not shown once the profile shows');
  assert.equal(await page.locator('.desk-name').textContent(),'Espada Fixture');assert.equal(await page.locator('.desk-handle').textContent(),'@fixture_desk');
  assert.deepEqual(await page.locator('.desk-role').allTextContents(),['Gamer','Content Creator','Esports Player']);
  assert.equal(await page.locator('.desk-education').textContent(),'Freelancer');
  assert.deepEqual(await page.locator('.desk-stat').allTextContents(),['12Games'],'the real game count (My Games public)');
  assert.equal(await page.locator('.desk-banner-img').evaluate(i=>i.complete&&i.naturalWidth),1920,'the Banner from profile-banner');
  assert.ok(calls.includes('profile-banner')&&calls.includes('get_public_profile_extras'));
  const facts=await page.locator('.desk-fact').allTextContents();
  assert.deepEqual(facts,['LocationRiyadh, Saudi Arabia','Member Since5 March 2024','LanguagesArabicEnglish','Favorite GenresActionRPGFPS']);
  // My Duo, then MY CREW beneath it (both Crews, server order), each a link to its destination
  assert.match(await page.locator('.public-duo-card:not(.public-crew-card)').getAttribute('href'),/^\/public\/(index\.html)?\?handle=fixture_duo&from=fixture_desk$/);
  assert.deepEqual(await page.locator('.public-crew-card').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),[`/crew/?c=${CREW_A}&from=fixture_desk`,`/crew/?c=${CREW_B}&from=fixture_desk`]);
  const duoBox=await page.locator('.public-duo-card:not(.public-crew-card)').boundingBox(),crewBox=await page.locator('.public-crew-card').first().boundingBox();
  assert.ok(crewBox.y>duoBox.y+duoBox.height-1&&Math.abs(crewBox.x-duoBox.x)<1&&Math.abs(crewBox.width-duoBox.width)<1,'MY CREW right beneath My Duo, the same width');
  assert.deepEqual(await page.locator('.public-crew-card').first().evaluate(a=>{const d=document.querySelector('.public-duo-card:not(.public-crew-card)'),s=getComputedStyle(a),t=getComputedStyle(d);return ['borderRadius','borderTopWidth','paddingLeft','display','gap'].map(k=>s[k]===t[k]);}),[true,true,true,true,true],'the My Duo card look');
  // the games counter: a link to My Games (keyboard: Tab + Enter), visible focus, the section receives focus
  const stat=page.locator('a.desk-stat');assert.equal(await stat.getAttribute('href'),'#publicGames');assert.equal(await stat.getAttribute('aria-label'),'12 games - go to My Games');
  await stat.focus();await page.keyboard.press('Enter');await page.waitForTimeout(900);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'publicGames','focus moved to My Games');
  assert.ok(Math.abs(await page.locator('#publicGames').evaluate(e=>e.getBoundingClientRect().top))<4||await page.evaluate(()=>scrollY+innerHeight>=document.documentElement.scrollHeight-2),'My Games scrolled into view');
  await page.evaluate(()=>scrollTo(0,0));await page.keyboard.press('Shift+Tab');
  // My Games: a 56 px artwork tile per row (initials fallback), six rows, View all, every row still opens Game Details
  assert.deepEqual(await page.locator('.public-games .game-thumb').evaluateAll(t=>t.map(x=>{const r=x.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})),Array(6).fill([56,56]));
  assert.equal(await page.locator('.public-games .pg-viewall').textContent(),'View all 12 games');
  assert.deepEqual(await page.locator('.public-games .game-thumb').evaluateAll(t=>t.map(x=>getComputedStyle(x,'::before').content)).then(v=>v.slice(0,2)),['"CD"','"CB"']);
  // League: a 50 px game tile beside the card's text
  const tile=await page.locator('.public-section-league .public-game-tile').boundingBox(),leagueLabel=await page.locator('.public-section-league .public-section-label').boundingBox();
  assert.ok(Math.round(tile.width)===50&&Math.round(tile.height)===50&&tile.x+tile.width<=leagueLabel.x&&Math.abs(tile.y-leagueLabel.y)<6,`the League tile sits beside the game ${JSON.stringify([tile,leagueLabel])}`);
  // My Socials: Instagram and Discord show their marks (static masks; the mobile badges keep their text)
  for(const sel of ['.public-social .social-icon[data-platform=instagram]','.public-social-account .social-icon[data-platform=discord]']){const st=await page.locator(sel).evaluate(e=>{const b=getComputedStyle(e,'::before');return {mask:(b.maskImage||b.webkitMaskImage||'').slice(0,30),font:getComputedStyle(e).fontSize,anim:b.animationName};});assert.ok(st.mask.includes('data:image/svg+xml')&&st.font==='0px'&&st.anim==='none',sel);}
  assert.match(await page.locator('.public-social').first().getAttribute('aria-label'),/Instagram \(opens in a new tab\)/);
  assert.equal(await page.locator('.public-section-discord').isVisible(),false,'no separate Discord section on desktop');
  assert.match(await page.locator('.public-social-account').textContent(),/mazen~\s*CONNECTED/,'Discord inside My Socials');
  assert.equal(await visible(page,'.public-section-label:text("LEAGUE OF LEGENDS")'),true);assert.equal(await visible(page,'.public-games'),true);
  const hero=await page.locator('#desktopHero').boundingBox(),side=await page.locator('#publicSections').boundingBox(),about=await page.locator('#desktopAbout').boundingBox(),gamesBox=await page.locator('#publicGames').boundingBox();
  assert.ok(side.x>hero.x+hero.width-1&&Math.abs(side.y-hero.y)<2,'the panel sits to the right of the hero, top-aligned');
  assert.ok(about.y>hero.y+hero.height-1&&gamesBox.x>about.x+about.width-1,'About Me and My Games below, side by side');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal scroll');
  assert.equal(await page.locator('#desktopHero h1').count(),1,'one page heading');assert.equal(await page.locator('.desk-banner-img').getAttribute('alt'),'','decorative Banner');
  assert.match(await page.locator('.desk-avatar img').getAttribute('alt'),/Espada Fixture avatar/);
  assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/public-desktop-${live?'live':'local'}-${width}.png`,fullPage:true});
  results.push({width,scenario:'full',ok:true});
  if(width===1440){
   // crossing the breakpoint: below it the accepted frame profile returns (no Intro replay); back above it the desktop profile returns
   await page.setViewportSize({width:1000,height:900});await page.waitForTimeout(900);
   assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('is-public-desktop')),false);
   assert.equal(await page.locator('#experienceWrap').isVisible(),true);assert.equal(await page.locator('#desktopHero').isVisible(),false);
   const frame=page.frameLocator('#experienceFrame');await frame.locator('#previewName').filter({hasText:'Espada Fixture'}).waitFor({timeout:5000});
   assert.equal(await page.frame({url:/intro-preview/})?.evaluate(()=>document.documentElement.classList.contains('host-reveal')),false,'the frame shows its profile card again');
   assert.equal(await page.locator('.public-section-discord').isVisible(),true,'the separate Discord section is back');
   await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(600);
   assert.equal(await page.locator('#desktopHero').isVisible(),true);assert.equal(await page.locator('#experienceWrap').isVisible(),false);
   assert.deepEqual(errors,[]);results.push({width,scenario:'resize-cross',ok:true});
  }
  await context.close();
 }
 // ---- desktop edge cases
 {const {context,page,errors}=await open(browser,{width:1440},'plain');
  assert.equal(await page.locator('.desk-banner-img').count(),0,'no Banner: the gradient');assert.equal(await page.locator('.desk-stat').count(),0,'no My Games: no count');
  assert.deepEqual(await page.locator('.desk-fact').allTextContents(),['Member Since2026'],'only Member Since when nothing else is public');
  assert.equal(await page.locator('.desk-avatar-initial').textContent(),'E');assert.equal(await page.locator('.public-social-account').count(),0);
  assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/public-desktop-plain-${live?'live':'local'}-1440.png`,fullPage:true});results.push({width:1440,scenario:'plain',ok:true});await context.close();}
 {const {context,page,errors}=await open(browser,{width:1440},'bannerRefused');
  await page.waitForTimeout(500);assert.equal(await page.locator('.desk-banner-img').count(),0,'a refused Banner falls back to the gradient');assert.deepEqual(errors,[]);results.push({width:1440,scenario:'banner-refused',ok:true});await context.close();}
 // maximum content: nothing clips, overflows or collides (About Me vs My Games, the sidebar cards), at the narrowest and a wide desktop width
 for(const width of [1280,1920]){const {context,page,errors}=await open(browser,{width},'long');
  assert.deepEqual(await page.locator('.desk-fact dt').allTextContents(),['Location','Member Since','Languages','Favorite Genres']);
  assert.equal(await page.locator('.desk-fact dd').first().textContent(),LONG_LOCATION);assert.equal(LONG_LOCATION.length,60);
  assert.equal(await page.locator('.desk-chip').count(),10);
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('.desk-about,.desk-about *,.public-sections,.public-sections *,.public-games,.public-games .pg-row')].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflow!=='visible'||(()=>{const r=e.getBoundingClientRect(),p=e.closest('.desk-about,.public-sections,.public-games')?.getBoundingClientRect();return p&&e.getClientRects().length&&(r.right>p.right+1||r.left<p.left-1);})()).map(e=>e.className||e.tagName));
  assert.deepEqual(overflow,[],`${width}: nothing sticks out of About Me, the sidebar or My Games`);
  const about=await page.locator('#desktopAbout').boundingBox(),gamesBox=await page.locator('#publicGames').boundingBox(),side=await page.locator('#publicSections').boundingBox(),hero=await page.locator('#desktopHero').boundingBox();
  assert.ok(about.x+about.width<=gamesBox.x+1,'About Me and My Games never overlap');assert.ok(side.x>=hero.x+hero.width-1,'the sidebar stays beside the hero');
  const chip=await page.locator('.desk-chip',{hasText:'Massively'}).boundingBox();assert.ok(chip.x+chip.width<=about.x+about.width,'the longest genre stays inside About Me');
  const duoName=await page.locator('.public-duo-card:not(.public-crew-card) .public-duo-names strong').boundingBox(),duoCard=await page.locator('.public-duo-card:not(.public-crew-card)').boundingBox();assert.ok(duoName.x+duoName.width<=duoCard.x+duoCard.width,'the long Duo name wraps inside its card');
  assert.match(await page.locator('.public-duo-card:not(.public-crew-card)').getAttribute('href'),/^\/public\/(index\.html)?\?handle=fixture_duo_long_handle1&from=fixture_desk$/);
  assert.equal(await page.locator('.public-crew-card strong').textContent(),'The Unbelievably Long Crew Name Of Night');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal scroll');
  assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/public-desktop-long-${live?'live':'local'}-${width}.png`,fullPage:true});results.push({width,scenario:'long',ok:true});await context.close();}
 // privacy: only what the server sends is drawn (here: Favorite Genres public, Location / Languages private) - the client never fills a gap
 {const {context,page,errors}=await open(browser,{width:1440},'aboutSome');
  assert.deepEqual(await page.locator('.desk-fact dt').allTextContents(),['Member Since','Favorite Genres']);assert.deepEqual(errors,[]);results.push({width:1440,scenario:'about-some-private',ok:true});await context.close();}
 // a panel whose only content is MY CREW: shown on the desktop profile, hidden below the breakpoint (no empty mobile panel)
 {const {context,page,errors}=await open(browser,{width:1440},'crewOnly');
  assert.equal(await page.locator('#publicSections').isVisible(),true);assert.equal(await page.locator('.public-crew-card').count(),2);
  await page.setViewportSize({width:1000,height:900});await page.waitForTimeout(800);assert.equal(await page.locator('#publicSections').isVisible(),false,'no empty panel on mobile / tablet');
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(600);assert.equal(await page.locator('#publicSections').isVisible(),true);
  await Promise.all([page.waitForURL(/\/crew\/\?c=/),page.locator('.public-crew-card').first().click()]);assert.match(page.url(),new RegExp(`/crew/\\?c=${CREW_A}&from=fixture_desk$`),'the card opens that Crew Wall');
  assert.deepEqual(errors,[]);results.push({width:1440,scenario:'crew-only',ok:true});await context.close();}
 {const {context,page,errors}=await open(browser,{width:1440},'wall');
  await page.locator('#publicWall').waitFor({state:'visible',timeout:15000});assert.equal(await page.locator('#desktopHero').count(),0,'a published, enabled Wall replaces the Classic Profile - no desktop profile');
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('is-public-desktop')),false);assert.deepEqual(errors,[]);results.push({width:1440,scenario:'wall',ok:true});await context.close();}
 // ---- mobile / tablet: the desktop profile never shows; with a baseline, pixel-identical to the previous frontend
 for(const width of [390,768,1279]){
  const run=await open(browser,{width,height:900},'full');
  assert.equal(await run.page.evaluate(()=>document.documentElement.classList.contains('is-public-desktop')),false,`${width}: never the desktop profile`);
  assert.equal(await run.page.locator('#desktopHero').isVisible(),false);assert.equal(await run.page.locator('.public-section-discord').isVisible(),true,'the separate Discord section stays');
  assert.equal(await run.page.locator('.public-social-account').isVisible(),false);assert.deepEqual(run.errors,[]);
  const shot=await run.page.screenshot({fullPage:true});fs.writeFileSync(`${out}/public-mobile-${live?'live':'local'}-${width}.png`,shot);await run.context.close();
  let identical=null;
  if(baseline){const old=await open(browser,{width,height:900},'full',baseline);const oldShot=await old.page.screenshot({fullPage:true});fs.writeFileSync(`${out}/public-mobile-baseline-${width}.png`,oldShot);await old.context.close();identical=Buffer.compare(shot,oldShot)===0;assert.equal(identical,true,`${width}: identical to the previous frontend`);}
  results.push({width,scenario:'mobile',identicalToBaseline:identical,ok:true});
 }
}finally{await browser.close();}
fs.writeFileSync(path.join(out,'public-desktop-browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
