// Mobile Intro landscape hint - isolated Chrome review of the real Intro player (dist/account/intro-preview.html) inside a host iframe with the
// production allow list. Videos are generated in the browser (canvas recording); no account, network media or backend is used.
// Set GAMID_BROWSER_MODULE (Playwright) and optionally GAMID_CHROME_PATH / GAMID_BROWSER_OUTPUT / GAMID_HINT_WIDTHS. --live serves the TESTING frontend files.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.GAMID_BROWSER_MODULE||'playwright');
const CF='https://gamid-testing-static.gamid.workers.dev',root=fileURLToPath(new URL('../dist/',import.meta.url)),out=process.env.GAMID_BROWSER_OUTPUT||process.cwd();
const HOST=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#05050a}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe id="frame" src="/account/intro-preview.html?v=test" allow="autoplay; fullscreen"></iframe><script>
const frame=document.getElementById('frame');window.ready=new Promise(r=>addEventListener('message',e=>{if(e.data?.type==='gamid-intro-preview-ready')r();}));window.states=[];addEventListener('message',e=>{if(e.data?.type==='gamid-intro-preview-state')states.push(e.data.state);});
// a short clip WITH an audio track (as real Intros have, so the user-gesture autoplay policy applies) of the requested shape, recorded from a canvas (WebM)
window.makeVideo=async(w,h,seconds=4)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');const stream=c.captureStream(30);const ac=new AudioContext(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();gain.gain.value=.02;osc.connect(gain).connect(dest);osc.start();stream.addTrack(dest.stream.getAudioTracks()[0]);const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus'});const parts=[];rec.ondataavailable=e=>parts.push(e.data);let t=0;const timer=setInterval(()=>{t++;x.fillStyle='hsl('+(t*7%360)+',70%,45%)';x.fillRect(0,0,w,h);x.fillStyle='#fff';x.font=(h/6|0)+'px sans-serif';x.fillText(String(t),w/3,h/2);},33);rec.start();await new Promise(r=>setTimeout(r,seconds*1000));rec.stop();clearInterval(timer);await new Promise(r=>rec.onstop=r);return URL.createObjectURL(new Blob(parts,{type:'video/webm'}));};
window.send=(videoUrl,extra={})=>frame.contentWindow.postMessage({type:'gamid-intro-preview',config:{videoUrl,transitionKey:'fade',publicMode:true,displayName:'Fixture',handle:'@fixture',...extra}},location.origin);
</script></body></html>`;
const widths=(process.env.GAMID_HINT_WIDTHS||'320,360,390,430,768').split(',').map(Number);
const browser=await chromium.launch({executablePath:process.env.GAMID_CHROME_PATH||undefined,headless:true,args:['--autoplay-policy=user-gesture-required']});
const results=[];
async function open(viewport,{mobile=true,reducedMotion='no-preference'}={}){
 const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==CF)return route.abort();if(url.pathname==='/__test/host.html')return route.fulfill({status:200,contentType:'text/html',body:HOST});if(process.argv.includes('--live'))return route.continue();let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(url.pathname.endsWith('/'))file=path.join(file,'index.html');if(!file.startsWith(path.resolve(root)+path.sep))return route.abort();try{return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}catch{return route.fulfill({status:404,body:''});}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__plays=0;const p=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__plays++;return p.call(this);};});
 await page.goto(CF+'/__test/host.html');await page.evaluate(()=>window.ready);
 const frame=page.frames().find(f=>f.url().includes('/account/intro-preview'));   // TESTING serves it without .html
 return {context,page,frame,errors};
}
const rect=(frame,sel)=>frame.locator(sel).evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};});
const overlaps=(a,b)=>a.x<b.right&&b.x<a.right&&a.y<b.bottom&&b.y<a.bottom;
const video=frame=>frame.evaluate(()=>{const v=document.getElementById('introVideo');return {paused:v.paused,t:v.currentTime,volume:v.volume,muted:v.muted,src:v.currentSrc,w:v.videoWidth,h:v.videoHeight};});
async function present(page,frame,shape){const url=await page.evaluate(([w,h])=>window.makeVideo(w,h),shape);await page.evaluate(u=>window.send(u),url);await frame.locator('#introVideo').evaluate(v=>v.readyState>=1||new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true})));return url;}
try{
 for(const width of widths){
  const height=width>=768?1024:Math.round(width*2.16);
  const {context,page,frame,errors}=await open({width,height});
  const row={width};
  // 1. Landscape clip: the hint appears, rotates portrait -> landscape, stays clear of every control and is gone after ~6 s (fade from 5.5 s). Play stays manual.
  await present(page,frame,[640,360]);
  const hint=frame.locator('#landscapeHint');await hint.waitFor({state:'visible',timeout:3000});const shownAt=Date.now();
  // The generated clip lasts 4 s and the Intro's end correctly removes the hint; pausing keeps the presentation open for the 6 s window (real Intros run up to 30 s).
  await frame.evaluate(()=>document.getElementById('introVideo').pause());
  const h=await rect(frame,'#landscapeHint');assert.ok(h.w>=48&&h.h>=48,'touch target');
  // Tap to play is only shown when the browser refuses the start (phones); show it briefly to check the geometry against it too.
  await frame.evaluate(()=>{document.getElementById('previewStart').hidden=false;});
  for(const sel of ['#previewStart','#skipButton','.intro-progress'])assert.equal(overlaps(h,await rect(frame,sel)),false,'hint clear of '+sel);
  await frame.evaluate(()=>{document.getElementById('previewStart').hidden=true;});
  assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
  await page.waitForTimeout(1500);const angle=await frame.locator('#landscapeHint .landscape-phone').evaluate(n=>{const m=new DOMMatrix(getComputedStyle(n).transform);return Math.round(Math.atan2(m.b,m.a)*180/Math.PI);});assert.equal(angle,90,'the phone has turned to landscape');
  await page.screenshot({path:path.join(out,`intro-hint-${width}.png`)});
  const fadeAt=await frame.waitForFunction(()=>document.getElementById('landscapeHint').classList.contains('is-leaving'),null,{timeout:7000,polling:50}).then(()=>Date.now()-shownAt);assert.ok(fadeAt>=5200&&fadeAt<=6200,'fully visible until ~5.5 s: '+fadeAt);row.fadeAtMs=fadeAt;
  await hint.waitFor({state:'hidden',timeout:3000});row.visibleMs=Date.now()-shownAt;assert.ok(row.visibleMs>=5700&&row.visibleMs<=6900,'about 6 seconds: '+row.visibleMs);
  // Still tappable while fading: a tap in the last half second enters fullscreen.
  await present(page,frame,[640,360]);await hint.waitFor({state:'visible'});await frame.evaluate(()=>document.getElementById('introVideo').pause());await frame.waitForFunction(()=>document.getElementById('landscapeHint').classList.contains('is-leaving'),null,{timeout:7000,polling:50});await hint.tap();await frame.waitForFunction(()=>document.fullscreenElement?.id==='introLayer');await frame.locator('#landscapeExit').tap();await frame.waitForFunction(()=>!document.fullscreenElement);row.tappableWhileFading=true;
  // 2. Paused: a new presentation shows the hint again; tapping it enters fullscreen without starting playback; Exit returns to the portrait Intro.
  // (Playwright's evaluate counts as a user gesture, so this harness cannot reproduce a phone's refused start: the paused state is set explicitly.)
  await present(page,frame,[640,360]);await hint.waitFor({state:'visible'});await frame.evaluate(()=>document.getElementById('introVideo').pause());const plays=await page.evaluate(()=>window.__plays);const before=await video(frame);
  await hint.tap();await frame.waitForFunction(()=>document.fullscreenElement?.id==='introLayer');
  const exitBtn=frame.locator('#landscapeExit');await exitBtn.waitFor({state:'visible'});
  let during=await video(frame);assert.equal(during.paused,true,'tapping the hint never starts playback');assert.equal(during.src,before.src,'same source');assert.equal(during.t,before.t,'same position');
  assert.equal(await hint.isVisible(),false);assert.ok(await frame.locator('#previewStart').isVisible(),'Tap to play still available in fullscreen');assert.ok(await frame.locator('#skipButton').isVisible());
  row.orientationLock=await frame.evaluate(()=>screen.orientation?.type||'n/a');
  await page.screenshot({path:path.join(out,`intro-fullscreen-${width}.png`)});
  await exitBtn.tap();await frame.waitForFunction(()=>!document.fullscreenElement);assert.equal(await exitBtn.isVisible(),false);assert.equal((await video(frame)).paused,true);
  assert.equal(await page.evaluate(()=>window.__plays),plays,'the hint and fullscreen never call play()');
  // 3. Playing: Play first, then the hint - playing state, position, volume and mute survive entering and leaving fullscreen.
  await present(page,frame,[640,360]);await hint.waitFor({state:'visible'});await frame.waitForFunction(()=>!document.getElementById('introVideo').paused);
  await page.waitForTimeout(400);const playing=await video(frame);
  await hint.tap();await frame.waitForFunction(()=>document.fullscreenElement?.id==='introLayer');await page.waitForTimeout(500);
  during=await video(frame);assert.equal(during.paused,false,'still playing');assert.ok(during.t>playing.t,'position continued, not restarted');assert.equal(during.src,playing.src);assert.equal(during.volume,playing.volume);assert.equal(during.muted,playing.muted);
  await frame.locator('#landscapeExit').tap();await frame.waitForFunction(()=>!document.fullscreenElement);const after=await video(frame);assert.equal(after.paused,false);assert.ok(after.t>=during.t);
  // 4. Skip Intro from fullscreen leaves fullscreen and shows the profile, as before.
  await present(page,frame,[640,360]);await hint.waitFor({state:'visible'});await hint.tap();await frame.waitForFunction(()=>document.fullscreenElement?.id==='introLayer');
  await frame.locator('#skipButton').tap();await frame.waitForFunction(()=>!document.fullscreenElement);await page.waitForFunction(()=>window.states.at(-1)==='profile',null,{timeout:5000});   // the state message is asynchronous
  // 5. The Intro ending in fullscreen leaves fullscreen first, then runs its normal transition to the profile.
  await page.evaluate(()=>{window.states.length=0;});const shortClip=await page.evaluate(()=>window.makeVideo(640,360,2));await page.evaluate(u=>window.send(u),shortClip);
  await hint.waitFor({state:'visible'});await frame.waitForFunction(()=>!document.getElementById('introVideo').paused);await hint.tap();await frame.waitForFunction(()=>document.fullscreenElement?.id==='introLayer');
  await frame.waitForFunction(()=>!document.fullscreenElement,null,{timeout:8000});await page.waitForFunction(()=>window.states.includes('transitioning')&&window.states.at(-1)==='profile',null,{timeout:8000});
  // 6. Portrait and square clips never get the hint.
  for(const shape of [[360,640],[480,480]]){await present(page,frame,shape);await page.waitForTimeout(1200);assert.equal(await hint.isVisible(),false,'no hint for '+shape.join('x'));}
  // 7. Rapid replays never stack hints or timers.
  for(let i=0;i<3;i++){await present(page,frame,[640,360]);}await hint.waitFor({state:'visible'});await frame.evaluate(()=>document.getElementById('introVideo').pause());await page.waitForTimeout(6300);assert.equal(await hint.isVisible(),false,'one hint, gone after its 6 seconds');
  assert.deepEqual(errors,[]);results.push({...row,landscape:true,pausedFullscreen:true,playingFullscreen:true,skip:true,endInFullscreen:true,portraitSquareNoHint:true,noTimerLeak:true});await context.close();
 }
 // Reduced motion: a static landscape phone, still gone after ~6 s.
 {const {context,page,frame,errors}=await open({width:390,height:844},{reducedMotion:'reduce'});await present(page,frame,[640,360]);const hint=frame.locator('#landscapeHint');await hint.waitFor({state:'visible'});await frame.evaluate(()=>document.getElementById('introVideo').pause());
  const style=await frame.locator('#landscapeHint .landscape-phone').evaluate(n=>({animation:getComputedStyle(n).animationName,angle:(m=>Math.round(Math.atan2(m.b,m.a)*180/Math.PI))(new DOMMatrix(getComputedStyle(n).transform))}));assert.equal(style.animation,'none');assert.equal(style.angle,90,JSON.stringify(await frame.locator('#landscapeHint .landscape-phone').evaluate(n=>{const c=getComputedStyle(n);return {t:c.transform,tr:c.transition,anim:c.animation};})));
  await page.waitForTimeout(4500);assert.ok(await hint.isVisible(),'still shown at 4.5 s');await hint.waitFor({state:'hidden',timeout:3500});assert.deepEqual(errors,[]);results.push({reducedMotion:true,...style});await context.close();}
 // Phone already in landscape, and desktop: no hint; the player is otherwise unchanged.
 for(const [viewport,mobile,label] of [[{width:844,height:390},true,'mobile-landscape'],[{width:1440,height:900},false,'desktop']]){const {context,page,frame,errors}=await open(viewport,{mobile});await present(page,frame,[640,360]);await page.waitForTimeout(1500);assert.equal(await frame.locator('#landscapeHint').isVisible(),false,label);assert.equal(await frame.locator('#landscapeExit').isVisible(),false);assert.deepEqual(errors,[]);results.push({[label]:'no hint'});await context.close();}
}finally{await browser.close();}
fs.writeFileSync(path.join(out,'intro-landscape-browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
