// Mobile Public Visitor V2 - isolated Chrome review of /public/ (the /@handle page) with fully mocked anonymous reads and synthetic data only.
// Env: GAMID_BROWSER_MODULE (Playwright), GAMID_CHROME_PATH, GAMID_BROWSER_OUTPUT, GAMID_PUBLIC_WIDTHS, GAMID_PUBLIC_BASELINE (a starting dist/ for the desktop
// byte-compare). --live serves the TESTING frontend files (backend still mocked). No real account, upload or publication is touched.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.GAMID_BROWSER_MODULE||'playwright');const jpeg=require('jpeg-js');
const CF='https://gamid-testing-static.gamid.workers.dev',SUPA='upvtrczefcvigxdyuylw.supabase.co',root=fileURLToPath(new URL('../dist/',import.meta.url)),out=process.env.GAMID_BROWSER_OUTPUT||process.cwd();
const jpg=(w,h,shade=150)=>{const d=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){const x=i%w,y=(i/w)|0;d[i*4]=(x*255/w)|0;d[i*4+1]=shade;d[i*4+2]=(y*255/h)|0;d[i*4+3]=255;}return Buffer.from(jpeg.encode({width:w,height:h,data:d},80).data);};
const AVATAR=jpg(256,256,90),BANNER=jpg(1920,320,60),COVER=jpg(300,450,120),ICON=jpg(128,128,200);
const UID='00000000-0000-4000-8000-0000000000a1';
const ALL_SOCIALS=['discord','instagram','tiktok','youtube','twitch','kick','x','snapchat','facebook','spotify','soundcloud','vimeo'];
// one valid account per platform, in the forms the shared link engine accepts (socials.js socialUrl)
const SOCIAL_IDS={instagram:['profile','fixturegamer'],tiktok:['profile','@fixturegamer'],youtube:['channel','@fixturegamer'],twitch:['channel','fixturegamer'],kick:['channel','fixturegamer'],x:['profile','fixturegamer'],snapchat:['profile','fixturegamer'],discord:['profile','123456789012345678'],facebook:['page','fixturegamer'],spotify:['artist','0QHgYbb3zkQ4UWOs7Dwyy2'],soundcloud:['profile','fixturegamer'],vimeo:['profile','fixturegamer']};
const socialRow=(platform_key,i)=>({platform_key,kind:SOCIAL_IDS[platform_key][0],account_id:SOCIAL_IDS[platform_key][1],sort_order:i});
const crewRow=(i,game_key,game_name)=>({crew_id:`00000000-0000-4000-8000-${String(200+i).padStart(12,'0')}`,crew_name:`Night Owls ${i+1}`,game_key,game_name,role:i?'MEMBER':'OWNER',member_count:4+i});
const GAMES=['League of Legends','Marvel Rivals','Valorant','Mass Effect','Call of Duty 4: Modern Warfare','Ninja Gaiden','Crash Bandicoot','Dark and Darker','Grand Theft Auto: San Andreas','Gundam 0079: The War for Earth','Hades','Elden Ring',"Baldur's Gate 3",'Minecraft'];
function fixture(scenario){
  const rich=scenario==='rich',empty=scenario==='empty',socialN=/^social-(\d+)$/.exec(scenario)?.[1];
  const socials=empty?[]:(socialN?ALL_SOCIALS.slice(0,Number(socialN)):rich?ALL_SOCIALS:['discord','instagram','twitch']).map(socialRow);
  const library={library_count:empty?0:14,total_count:empty?0:14,games:GAMES.slice(0,6).map((name,i)=>({name,year:2000+i,sources:['MANUAL'],platforms:[{key:'windows_pc',label:'PC',source:'MANUAL'}]}))};
  const crews=empty?[]:[crewRow(0,'league_of_legends','League of Legends'),crewRow(1,'marvel_rivals','Marvel Rivals'),crewRow(2,'valorant','Valorant')];
  const identity={entity_id:UID,gamid_handle:'fixture_visitor',display_name:rich?'Espada The Extraordinarily Long Display Name Of A Gamer':'Espada',bio:empty?'':'Gamer who loves competitive games, discovering new worlds, meeting new players, improving every day, collecting achievements, and building an identity!!!',visibility:'PUBLIC',
    avatar_media_reference:empty?null:`${UID}/avatar.jpg`,intro_derivative_path:scenario==='intro'?`${UID}/intro.webm`:null,intro_transition_key:'fade',
    role_catalog:[...Array(15)].map((_,i)=>({key:`role_${i}`,label:['Gaming Content Creator','Casual Gamer','Game Developer','Game Designer','QA Game Tester','Concept Artist','Voice Actor','Broadcast Producer','Tournament Organizer','Esports Partnerships Manager','Gaming Product Manager','Streamer','Coach','Analyst','Caster'][i]})),
    primary_role_key:empty?null:'role_0',role_keys:empty?[]:[...Array(rich?11:4)].map((_,i)=>`role_${i}`),education_work_catalog:[{key:'student',label:'Student'}],education_work_status:empty?null:'student',institution:empty?null:'Saved University',field_of_study:null,
    public_sections:empty?{}:{discord:{display_name:'Espada DC',username:'espada_dc',trust_status:'CONNECTED'},steam:{persona_name:'jeddawe_ekaa',trust_status:'CONNECTED'},duo:{gamid_handle:'fixture_duo',display_name:'Zshot Fixture'},crews,my_games:library,
      league:{game_name:'Espada black',tag_line:'esp',platform_id:'ME1',rank_state:'RANKED',tier:'BRONZE',division:'IV',lp:67,wins:5,losses:4,data_source:'OPGG_TEMPORARY',updated_at:'2026-10-16T00:00:00Z'}}};
  const extras={has_banner:!empty,member_since_year:2026,member_since_date:'2026-09-13',about_location:empty?null:'Jeddah, Saudi Arabia',about_languages:empty?[]:[{label:'English'},{label:'Arabic'}],about_genres:empty?[]:['Action','Adventure','RPG','FPS','Horror','Survival','Platformer','Strategy','Sports'].map(label=>({label}))};
  const favorites=empty?[]:[['mass_effect','Mass Effect'],['marvel_rivals','Marvel Rivals'],['cod4','Call of Duty 4: Modern Warfare'],['ninja_gaiden','Ninja Gaiden']].map(([game_key,name])=>({game_key,name}));
  const artwork={enabled:true,artwork:{league_of_legends:{icon:'https://cdn2.steamgriddb.com/icon/league.png',hero:'https://cdn2.steamgriddb.com/hero/league.jpg'},marvel_rivals:{icon:'https://cdn2.steamgriddb.com/icon/marvel.png',cover:'https://cdn2.steamgriddb.com/grid/marvel.jpg',hero:'https://cdn2.steamgriddb.com/hero/marvel.jpg'},mass_effect:{cover:'https://cdn2.steamgriddb.com/grid/me.jpg'},cod4:{cover:'https://cdn2.steamgriddb.com/grid/cod4.jpg'},ninja_gaiden:{cover:'https://cdn2.steamgriddb.com/grid/ng.jpg'}},myGames:{'League of Legends|2000':'league_of_legends','Marvel Rivals|2001':'marvel_rivals'}};
  return {identity,extras,socials,favorites,crews,library,artwork,wall:scenario==='wall'};
}
const browser=await chromium.launch({executablePath:process.env.GAMID_CHROME_PATH||undefined,headless:true});
async function open(width,scenario,{height,rootDir=root,reducedMotion='no-preference'}={}){
  const f=fixture(scenario);const mobile=width<1024;
  const context=await browser.newContext({viewport:{width,height:height||(width<600?Math.round(width*2.1):1000)},isMobile:mobile,hasTouch:mobile,reducedMotion});
  await context.routeWebSocket('**/*',ws=>ws.close());
  const calls=[],errors=[];
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),action=url.pathname.split('/').pop();
    if(url.hostname===SUPA){calls.push(url.pathname+' '+req.method());
      if(url.pathname.startsWith('/storage/v1/object/authenticated/avatars/'))return route.fulfill({status:200,contentType:'image/jpeg',body:AVATAR});
      if(url.pathname.startsWith('/functions/v1/profile-banner/'))return route.fulfill({status:200,contentType:'image/jpeg',body:BANNER});
      if(url.pathname.startsWith('/functions/v1/game-artwork/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(f.artwork)});
      if(url.pathname==='/functions/v1/public-media'){const token='header.'+Buffer.from(JSON.stringify({iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+120})).toString('base64url')+'.fixture';return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({signedURL:`/object/sign/intro-media/${UID}/intro.webm?token=${token}`})});}
      if(url.pathname.startsWith('/storage/v1/object/sign/intro-media/'))return route.fulfill({status:200,contentType:'video/mp4',body:fs.readFileSync(path.join(root,'assets/gamid-intro.mp4')),headers:{'Access-Control-Allow-Origin':CF}});
      const bodies={get_public_identity:[f.identity],get_public_profile_extras:[f.extras],get_public_social_links:f.socials,get_public_discord_card:[],get_public_favorite_games:f.favorites,get_public_crews:f.crews,get_crew_members:[],
        get_public_my_games:f.library.library_count?[f.library]:[],get_public_wall:f.wall?[{document:{version:1,stages:[{id:'s1',elements:[]}]},assets:[]}]:[]};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(bodies[action]??[])});}
    if(url.hostname==='cdn2.steamgriddb.com')return route.fulfill({status:200,contentType:'image/jpeg',body:url.pathname.includes('/grid/')?COVER:ICON});
    if(url.origin===CF){if(process.argv.includes('--live'))return route.continue();let file=path.resolve(rootDir,'.'+decodeURIComponent(url.pathname));if(url.pathname.endsWith('/'))file=path.join(file,'index.html');if(!file.startsWith(path.resolve(rootDir)+path.sep))return route.abort();
      try{return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.mp4':'video/mp4'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}catch{return route.fulfill({status:404,body:''});}}
    return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__plays=0;const p=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__plays++;return p.call(this);};});
  await page.goto(CF+'/public/?handle=fixture_visitor');
  return {context,page,calls,errors,f};
}
const settle=async page=>{await page.waitForFunction(()=>document.documentElement.classList.contains('is-public-mobile')||document.documentElement.classList.contains('is-public-desktop')||document.documentElement.classList.contains('is-public-wall'),null,{timeout:20000});await page.waitForTimeout(900);};
const overflow=page=>page.evaluate(()=>{const scrollable=el=>{for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(['auto','scroll','hidden'].includes(s.overflowX)&&p!==document.documentElement&&p!==document.body)return true;}return false;};
  return {doc:document.documentElement.scrollWidth>innerWidth,offenders:[...document.querySelectorAll('.mob-col *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.right>innerWidth+1||r.left<-1)&&!scrollable(e);}).slice(0,6).map(e=>`${e.tagName}.${String(e.className).slice(0,40)} ${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}`)};});
const visible=(page,sel)=>page.locator(sel).first().isVisible();
const results=[];
try{
  const onlyDesktop=process.env.GAMID_PUBLIC_ONLY==='desktop';   // re-run just the desktop byte-compare
  const widths=onlyDesktop?[]:(process.env.GAMID_PUBLIC_WIDTHS||'320,360,375,390,430,600,768,1023,1024,1152').split(',').map(Number);
  // 1. Rich profile at every Mobile V2 width: all Desktop sections present, no overflow, touch targets, screenshots
  for(const width of widths){
    const {context,page,errors}=await open(width,'rich');await settle(page);
    assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('is-public-mobile')&&!document.documentElement.classList.contains('is-public-desktop')),'Mobile V2 below 80rem');
    assert.equal(await visible(page,'#experienceWrap'),false,'the Intro frame is not shown once the profile shows');
    for(const [sel,label] of [['#desktopHero','hero'],['.mob-stats','stats'],['.public-socials-block','socials'],['.public-duo:not(.public-crew)','duo'],['.public-crew','crews'],['#desktopAbout','about'],['#desktopFavorites','favorites'],['#desktopConnected','connected games'],['#publicGames','my games']])assert.ok(await visible(page,sel),label+' visible at '+width);
    assert.equal(await visible(page,'.public-section-discord'),false,'Discord lives in My Socials, as on the desktop');assert.equal(await visible(page,'.public-section-league'),false,'League lives in Connected Games');
    assert.match(await page.locator('#desktopHero').innerText(),/Espada The Extraordinarily Long Display Name[\s\S]*@fixture_visitor[\s\S]*Gaming Content Creator[\s\S]*Student/);
    assert.match(await page.locator('#desktopAbout').innerText(),/Jeddah, Saudi Arabia[\s\S]*13 September 2026[\s\S]*Arabic[\s\S]*Sports/);
    assert.deepEqual(await page.locator('.mob-stat').allInnerTexts().then(t=>t.map(x=>x.replace(/\s+/g,' ').trim())),['14 GAMES','3 CREWS','1 DUO']);
    const o=await overflow(page);assert.equal(o.doc,false,'no horizontal page scroll at '+width);assert.deepEqual(o.offenders,[],'content inside the viewport at '+width);
    const small=await page.evaluate(()=>[...document.querySelectorAll('.mob-col :is(a,button)')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('.desk-favorites-list')&&(r.height<44||r.width<44)&&!e.closest('.public-duo-card,.desk-connected-card,.pg-row,.public-crew-card');}).map(e=>`${e.className} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
    assert.deepEqual(small,[],'touch targets at '+width);
    // brand marks, not letters: every marked platform hides its letter fallback under the mark (font-size 0)
    const letters=await page.locator('.public-socials .social-icon').evaluateAll(n=>n.filter(e=>['discord','instagram','tiktok','twitch','kick','snapchat','spotify','soundcloud','vimeo'].includes(e.dataset.platform)&&getComputedStyle(e).fontSize!=='0px').map(e=>e.dataset.platform));
    assert.deepEqual(letters,[],'brand marks show without their letters at '+width);
    const sizes=await page.locator('.public-socials .public-social').evaluateAll(n=>n.map(e=>Math.round(e.getBoundingClientRect().width)));assert.ok(sizes.length===12&&Math.min(...sizes)>=44,'12 socials, >= 44px: '+sizes);
    await page.waitForFunction(()=>document.querySelectorAll('#publicGames .game-art').length>=1);
    if([320,390,430,768].includes(width)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`mobile-visitor-rich-${width}.png`),fullPage:true});}
    if([390,430].includes(width)){for(const [sel,name] of [['#desktopHero','hero'],['.public-sections','socials-duo-crews'],['#desktopAbout','about'],['#desktopFavorites','favorites'],['#desktopConnected','connected'],['#publicGames','games']]){await page.locator(sel).scrollIntoViewIfNeeded();await page.locator(sel).screenshot({path:path.join(out,`mobile-visitor-${name}-${width}.png`)});}}
    assert.deepEqual(errors,[]);results.push({width,scenario:'rich',sections:9,socialSizes:[Math.min(...sizes),Math.max(...sizes)]});await context.close();
  }
  // 2. Adaptive My Socials: 1, 2, 3, 5, 8, 12 accounts
  const socialTable={};
  for(const width of onlyDesktop?[]:[320,390,768]){
    let previous=Infinity;
    for(const n of [1,2,3,5,8,12]){
      const {context,page,errors}=await open(width,`social-${n}`);await settle(page);
      const icons=await page.locator('.public-socials .public-social').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {w:Math.round(r.width),top:Math.round(r.top)};}));
      const size=Math.max(...icons.map(i=>i.w)),rows=new Set(icons.map(i=>i.top)).size;
      assert.equal(icons.length,n);assert.ok(Math.min(...icons.map(i=>i.w))>=44,`>= 44px (${width}, ${n})`);assert.ok(size<=previous+1,`never larger with more accounts (${width}, ${n}: ${size} after ${previous})`);previous=size;
      const o=await overflow(page);assert.equal(o.doc,false);assert.deepEqual(o.offenders,[]);
      const box=await page.locator('.public-socials-block').boundingBox();const iconsBox=await page.locator('.public-socials').boundingBox();
      (socialTable[width]||={})[n]={size,rows,fill:Math.round(100*(icons.filter(i=>i.top===icons[0].top).length*size)/iconsBox.width)};
      if(width===390)await page.locator('.public-socials-block').screenshot({path:path.join(out,`socials-${n}-${width}.png`)});
      assert.deepEqual(errors,[]);await context.close();
    }
  }
  results.push({socials:socialTable});
  // 3. Interactions at 390: stats, My Crews, Favorite / Connected / My Games details, socials links, crossing the breakpoint without a replay
  if(!onlyDesktop){const {context,page,errors}=await open(390,'rich');await settle(page);
    await page.locator('.mob-stat',{hasText:'Games'}).tap();await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>document.activeElement?.id),'publicGames');
    await page.locator('.mob-stat',{hasText:'Crews'}).tap();await page.locator('.profile-panel-body, .pg-modal:not([hidden])').first().waitFor();assert.ok(await page.getByText('Night Owls 2').first().isVisible());await page.keyboard.press('Escape');await page.waitForTimeout(300);
    await page.locator('.mob-stat',{hasText:'Duo'}).tap();await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('public-duo')),true);
    await page.locator('.public-crew-card').tap();await page.getByText('Night Owls 3').first().waitFor();await page.keyboard.press('Escape');await page.waitForTimeout(300);
    await page.locator('.desk-favorite-card').nth(1).scrollIntoViewIfNeeded();await page.locator('.desk-favorite-card').nth(1).tap();await page.locator('.pg-modal:not([hidden]) .pg-detail-title').waitFor();assert.match(await page.locator('.pg-detail-title').innerText(),/Marvel Rivals/);await page.keyboard.press('Escape');await page.waitForTimeout(300);
    await page.locator('#desktopConnected .desk-connected-card').tap();await page.locator('.pg-modal:not([hidden]) .pg-detail-title').waitFor();assert.match(await page.locator('.pg-detail-title').innerText(),/League of Legends/);await page.keyboard.press('Escape');await page.waitForTimeout(300);
    await page.locator('#publicGames .pg-viewall').tap();await page.locator('.pg-modal:not([hidden]) .pg-search-input').waitFor();await page.keyboard.press('Escape');await page.waitForTimeout(300);
    const link=page.locator('.public-socials a.public-social').first();assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);assert.match(await link.getAttribute('rel'),/noreferrer/);
    const statesBefore=await page.evaluate(()=>window.__plays);
    await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>document.documentElement.classList.contains('is-public-desktop'));assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('is-public-mobile')),false);assert.ok(await visible(page,'.desk-col-left #desktopHero'));
    await page.setViewportSize({width:390,height:820});await page.waitForFunction(()=>document.documentElement.classList.contains('is-public-mobile'));assert.ok(await visible(page,'.mob-col #desktopHero'));assert.equal(await page.evaluate(()=>window.__plays),statesBefore,'crossing never replays the Intro');
    assert.deepEqual(errors,[]);results.push({interactions:true,crossing:true});await context.close();}
  // 4. Empty / minimal profile: missing Avatar and Banner, no socials, games, Crews, Duo or About values - only what exists shows, nothing breaks
  if(!onlyDesktop){const {context,page,errors}=await open(360,'empty');await settle(page);
    assert.ok(await visible(page,'#desktopHero'));assert.match(await page.locator('.desk-avatar').innerText(),/^E$/);
    for(const sel of ['.mob-stats','.public-socials-block','.public-duo','.public-crew','#desktopFavorites','#desktopConnected','#publicGames'])assert.equal(await visible(page,sel),false,sel+' absent when empty');
    assert.match(await page.locator('#desktopAbout').innerText(),/Member Since[\s\S]*13 September 2026/);
    const o=await overflow(page);assert.equal(o.doc,false);await page.screenshot({path:path.join(out,'mobile-visitor-empty-360.png'),fullPage:true});
    assert.deepEqual(errors,[]);results.push({empty:true});await context.close();}
  // 5. Intro: plays first, Skip reveals the page's Mobile V2 profile (no frame profile), Replay Intro plays again and returns
  if(!onlyDesktop){const {context,page,errors}=await open(390,'intro');
    const frame=()=>page.frames().find(fr=>fr.url().includes('/account/intro-preview'));
    await page.waitForFunction(()=>!document.getElementById('experienceWrap').hidden);await page.waitForTimeout(800);
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('is-public-mobile')),false,'the Intro plays first');
    await frame().locator('#skipButton').click();await page.waitForFunction(()=>document.documentElement.classList.contains('is-public-mobile'));await page.waitForTimeout(600);
    assert.equal(await visible(page,'#experienceWrap'),false);assert.equal(await frame().evaluate(()=>document.documentElement.classList.contains('host-reveal')),true,'the frame only plays the Intro');
    await page.locator('#replayIntroButton').scrollIntoViewIfNeeded();await page.locator('#replayIntroButton').tap();await page.waitForFunction(()=>!document.documentElement.classList.contains('is-public-mobile'));
    await frame().locator('#skipButton').click();await page.waitForFunction(()=>document.documentElement.classList.contains('is-public-mobile'));
    assert.deepEqual(errors,[]);results.push({intro:true});await context.close();}
  // 6. A published Wall still replaces the profile body at mobile widths (no Mobile V2)
  if(!onlyDesktop){const {context,page,errors}=await open(390,'wall');await settle(page);
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('is-public-mobile')),false);assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('is-public-wall')));
    assert.deepEqual(errors,[]);results.push({wall:true});await context.close();}
  // 7. Reduced motion: the stats still jump (instantly) and focus the section
  if(!onlyDesktop){const {context,page,errors}=await open(390,'rich',{reducedMotion:'reduce'});await settle(page);await page.locator('.mob-stat',{hasText:'Games'}).tap();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.activeElement?.id),'publicGames');assert.deepEqual(errors,[]);results.push({reducedMotion:true});await context.close();}
  // 8. Desktop regression: 1280 / 1440 / 1920 byte-identical to the starting dist
  if(process.env.GAMID_PUBLIC_BASELINE&&!process.argv.includes('--live')){
    const same=[];
    for(const width of [1280,1440,1920]){const shots=[];for(const dir of [root,process.env.GAMID_PUBLIC_BASELINE]){const {context,page,errors}=await open(width,'rich',{rootDir:dir});await settle(page);
        // every (lazy) image loaded and decoded first, so the compare measures layout, not image-decode timing
        await page.evaluate(async()=>{scrollTo(0,document.documentElement.scrollHeight);await new Promise(r=>setTimeout(r,400));scrollTo(0,0);await Promise.all([...document.images].map(img=>img.complete?img.decode().catch(()=>{}):new Promise(r=>{img.addEventListener('load',r,{once:true});img.addEventListener('error',r,{once:true});setTimeout(r,4000);})));});
        await page.waitForTimeout(1200);
        // raster images are masked (same box, same position, solid colour): Chrome's image rasterisation can vary by one colour unit between runs, which is not layout.
        // Everything else - layout, text, borders, gradients, marks - must be byte-identical.
        shots.push(await page.screenshot({fullPage:true,mask:[page.locator('img'),page.locator('.game-art-bg')],maskColor:'#ff00ff'}));assert.deepEqual(errors,[]);await context.close();}
      fs.writeFileSync(path.join(out,`desktop-current-${width}.png`),shots[0]);fs.writeFileSync(path.join(out,`desktop-baseline-${width}.png`),shots[1]);same.push([width,Buffer.compare(shots[0],shots[1])===0]);}
    results.push({desktopIdentical:same});assert.ok(same.every(([,ok])=>ok),'desktop byte-identical: '+JSON.stringify(same));
  }
}finally{await browser.close();}
fs.writeFileSync(path.join(out,'public-mobile-browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
