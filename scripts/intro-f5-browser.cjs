
const http=require("http"),fs=require("fs"),path=require("path"),assert=require("assert");
const {chromium}=require(process.env.F5_PLAYWRIGHT_MODULE || "playwright");
const root=path.resolve(__dirname,"../dist"),media=fs.readFileSync(root+"/prototypes/intro-derivative-f2/landscape.webm");let log=[];
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,"http://localhost");
 if(u.pathname==="/"){res.setHeader("Content-Type","text/html");res.end('<iframe id="frame" style="width:900px;height:700px" src="/account/intro-preview.html"></iframe>');return;}
 if(u.pathname==="/video.webm"){
 const record={range:req.headers.range||"",bytes:0,status:200,closedEarly:false};log.push(record);
 res.setHeader("Content-Type","video/webm");res.setHeader("Cache-Control","no-cache");res.setHeader("ETag",'"f5-fixture"');res.setHeader("Accept-Ranges","bytes");
 if(req.headers["if-none-match"]==='"f5-fixture"'){record.status=304;res.writeHead(304);res.end();return;}
 let start=0,end=media.length-1;const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range||"");
 if(match){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));record.status=206;res.statusCode=206;res.setHeader("Content-Range","bytes "+start+"-"+end+"/"+media.length);}
 res.setHeader("Content-Length",end-start+1);let offset=start;
 const timer=setInterval(()=>{const part=media.subarray(offset,Math.min(offset+8192,end+1));offset+=part.length;record.bytes+=part.length;res.write(part);if(offset>end){clearInterval(timer);res.end();}},100);
 res.on("close",()=>{clearInterval(timer);record.closedEarly=offset<=end;});return;
 }
 const file=path.join(root,u.pathname);if(!file.startsWith(path.resolve(root))||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader("Content-Type",file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html");res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,"127.0.0.1",r));const origin="http://127.0.0.1:"+server.address().port;
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--autoplay-policy=no-user-gesture-required"]});const context=await browser.newContext();const page=await context.newPage();
 await page.goto(origin);const frame=page.frames().find(f=>f.url().includes("intro-preview"));
 const config=async(preset="fade",expiry=Date.now()+120000)=>page.evaluate(({origin,preset,expiry})=>document.querySelector("iframe").contentWindow.postMessage({type:"gamid-intro-preview",config:{videoUrl:origin+"/video.webm",sourceExpiresAt:expiry,transitionKey:preset,displayName:"F5",handle:"@fixture"}},origin),{origin,preset,expiry});
 const stop=()=>page.evaluate(()=>document.querySelector("iframe").contentWindow.postMessage({type:"gamid-intro-preview-stop"},location.origin));
 const released=()=>frame.evaluate(()=>[...document.querySelectorAll("video")].every(v=>!v.getAttribute("src")&&v.paused));
 await stop();assert.equal(await frame.locator("#experience").getAttribute("data-state"),null,"pre-config stop must not reveal placeholder");
 const t=Date.now();await config();await frame.waitForFunction(()=>document.querySelector("#introVideo").currentTime>0.1);const startup=Date.now()-t;
 const initialBytes=log.reduce((n,x)=>n+x.bytes,0);
 await frame.locator("#skipButton").click();await page.waitForTimeout(150);assert(await released());const abortedBytes=log.reduce((n,x)=>n+x.bytes,0);
 await page.waitForTimeout(1100);assert.equal(log.reduce((n,x)=>n+x.bytes,0),abortedBytes,"release must abort further buffering");
 const cold={startupMs:startup,atEarlyPlaybackBodyBytes:initialBytes,afterReleaseBodyBytes:abortedBytes,stopped:true,requests:JSON.parse(JSON.stringify(log))};
 for(const preset of ["fade","blur","shrink","slide","split"]){
 await config(preset);if(preset==="split"){await frame.waitForFunction(()=>document.querySelectorAll(".split-live-video").length===2);assert(await frame.evaluate(()=>[...document.querySelectorAll(".split-live-video")].every(v=>v.muted))); }
 await frame.waitForFunction(()=>document.querySelector("#experience").dataset.state==="profile",{},{timeout:14000});assert(await released(),preset+" ends released");
 }
 const beforeReplay=log.reduce((n,x)=>n+x.bytes,0);await config();await frame.waitForFunction(()=>document.querySelector("#experience").dataset.state==="profile",{},{timeout:14000});
 const replay=log.reduce((n,x)=>n+x.bytes,0)-beforeReplay;
 await config("split");await frame.waitForFunction(()=>document.querySelectorAll(".split-live-video").length===2);await stop();await page.waitForTimeout(100);assert(await released());assert.equal(await frame.locator(".split-live-video").count(),0);
 await config("fade",Date.now()+200);await page.waitForTimeout(350);assert(await released(),"expired lease releases");
 // Local Blob previews still play, without lease.
 await page.evaluate(async({origin})=>{const blob=await (await fetch(origin+"/prototypes/intro-derivative-f2/landscape.webm")).blob();window.localUrl=URL.createObjectURL(blob);document.querySelector("iframe").contentWindow.postMessage({type:"gamid-intro-preview",config:{videoUrl:window.localUrl,transitionKey:"fade"}},origin);},{origin});
 await frame.waitForFunction(()=>document.querySelector("#introVideo").currentTime>0.1);await stop();await page.waitForTimeout(100);assert(await released());
 await page.reload();const newframe=page.frames().find(f=>f.url().includes("intro-preview"));const beforeRevisit=log.reduce((n,x)=>n+x.bytes,0);await config();await newframe.waitForFunction(()=>document.querySelector("#experience").dataset.state==="profile",{},{timeout:14000});const revisit=log.reduce((n,x)=>n+x.bytes,0)-beforeRevisit;

 // Force one autoplay rejection through the real fallback branch, then retry by tapping.
 await newframe.evaluate(()=>{const v=document.querySelector("#introVideo"),play=v.play.bind(v);v.play=()=>{v.play=play;return Promise.reject(new DOMException("Blocked","NotAllowedError"));};});
 await config();await newframe.locator("#previewStart").waitFor({state:"visible"});await newframe.locator("#previewStart").click();await newframe.waitForFunction(()=>document.querySelector("#introVideo").currentTime>0.1);
 await newframe.evaluate(()=>document.querySelector("#introVideo").currentTime=1);await stop();await page.waitForTimeout(100);assert(await newframe.evaluate(()=>!document.querySelector("#introVideo").getAttribute("src")));
 // Independent cold contexts distinguish whole-Blob and native startup/body costs.
 const phases={};
 for(const mode of ["blob","native"]){
  const c=await browser.newContext();const p=await c.newPage();await p.goto(origin);const before=log.reduce((n,x)=>n+x.bytes,0);const started=Date.now();
  await p.evaluate(async({origin,mode})=>{const video=document.createElement("video");video.id="comparison";video.playsInline=true;document.body.append(video);video.src=mode==="blob"?URL.createObjectURL(await(await fetch(origin+"/video.webm")).blob()):origin+"/video.webm";await video.play();},{origin,mode});
  const bodyAtStart=log.reduce((n,x)=>n+x.bytes,0)-before,startupMs=Date.now()-started;
  await p.waitForFunction(()=>document.querySelector("#comparison").ended,{},{timeout:14000});
  phases[mode]={startupMs,bodyAtStart,totalBodyBytes:log.reduce((n,x)=>n+x.bytes,0)-before};await c.close();
 }
 console.log(JSON.stringify({autoplayFallback:"PASS",seeking:"PASS",phases,browser:await browser.version(),logicalBytes:media.length,cold,allFiveTransitions:"PASS",splitClose:"PASS",expiry:"PASS",localBlob:"PASS",replayBodyBytes:replay,revisitBodyBytes:revisit,requests:log},null,2));
 await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1);});


