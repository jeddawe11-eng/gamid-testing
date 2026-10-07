const frame=document.querySelector("#preview"),status=document.querySelector("#status");
document.title="GamID TESTING — F5 native Intro fixture";
document.querySelector("strong").textContent="TESTING ONLY — F5 native Intro acceptance · PENDING ACCEPTANCE";
document.querySelector("small").textContent="Synthetic F2 clips, native streaming through the unchanged Intro Engine. No account or saved media is used. This checks playback, not Supabase authorization. Use each shape and transition; replay, Skip and Release.";
let ready=false,pending=null,source=null;
const selector=document.createElement("select");
for(const key of ["fade","blur","shrink","slide","split"]){const option=document.createElement("option");option.value=key;option.textContent=key;selector.append(option);}
document.querySelector("header").append(selector);
function release(){pending=null;frame.contentWindow?.postMessage({type:"gamid-intro-preview-stop"},location.origin);}
function send(){if(ready&&pending)frame.contentWindow.postMessage({type:"gamid-intro-preview",config:pending},location.origin);}
function play(){release();if(!source)return;pending={videoUrl:new URL("./"+source+".webm",location.href).href,sourceExpiresAt:Date.now()+120000,transitionKey:selector.value,displayName:"Synthetic F5 fixture",handle:"@fixture",primaryRole:"TESTING",publicMode:false};send();status.textContent="Playing "+source+" / "+selector.value+". Natural ending must reveal Profile; Replay must preserve shape/audio. Split clones must stop on Skip/Release.";}
document.querySelectorAll("[data-source]").forEach(button=>button.addEventListener("click",()=>{source=button.dataset.source;play();}));
selector.addEventListener("change",play);
for(const [name,action] of [["Replay",play],["Skip / Release",()=>{release();status.textContent="All Intro consumers released. Replay to restart."}]]){const button=document.createElement("button");button.textContent=name;button.addEventListener("click",action);document.querySelector("header").append(button);}
addEventListener("message",event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow)return;if(event.data?.type==="gamid-intro-preview-ready"){ready=true;send();}if(event.data?.type==="gamid-intro-preview-error")status.textContent="Playback error — report browser, shape and transition.";});
addEventListener("pagehide",release);

