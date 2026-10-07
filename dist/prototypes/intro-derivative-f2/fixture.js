if(new URLSearchParams(location.search).get("delivery")==="f5"){
 await import("./f5-fixture.js");
}else{
const frame=document.querySelector("#preview"),status=document.querySelector("#status");
let ready=false,pending=null,url=null,request=0;
function send(){if(ready&&pending)frame.contentWindow.postMessage({type:"gamid-intro-preview",config:pending},location.origin);}
addEventListener("message",event=>{
 if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
 if(event.data?.type==="gamid-intro-preview-ready"){ready=true;send();}
 if(event.data?.type==="gamid-intro-preview-error")status.textContent="Playback error — report this for F2 acceptance.";
});
document.querySelectorAll("[data-source]").forEach(button=>button.addEventListener("click",async()=>{
 const current=++request;const source=button.dataset.source;
 status.textContent="Loading synthetic "+source+" fixture…";
 try{
  const response=await fetch("./"+source+".webm");if(!response.ok)throw new Error("FIXTURE_LOAD");
  const blob=await response.blob();if(current!==request)return;
  if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);
  pending={videoUrl:url,transitionKey:"fade",displayName:"Synthetic F2 fixture",handle:"@fixture",primaryRole:"TESTING",publicMode:false};
  send();status.textContent="Playing "+button.textContent+". Check quality, smoothness, shape and reveal; replay by tapping again.";
 }catch{status.textContent="Could not load fixture. Report this for F2 acceptance."}
}));
addEventListener("pagehide",()=>{if(url)URL.revokeObjectURL(url);});

}
