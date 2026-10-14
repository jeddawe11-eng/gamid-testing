// Owner-only Desktop presentation. No uploads, playback, persistent cache or provider refresh.
export {leagueIcon} from './game-profile-league-compat.js';
export function providerAvatar(provider,url){
 if(typeof url!=='string')return null;
 if(provider==='steam')return /^https:\/\/avatars\.(?:(?:akamai|cloudflare|fastly)\.)?steamstatic\.com\/[0-9a-f]{40}(?:_full|_medium)?\.jpg$/.test(url)?url:null;
 if(provider==='discord')return /^https:\/\/cdn\.discordapp\.com\//.test(url)?url:null;
 return null;
}

// Seek a paused, detached video to a real frame. Never play the Intro or start its transition.
export function captureVideoPoster(url,{doc=globalThis.document,signal,timeoutMs=15000}={}){
 return new Promise((resolve,reject)=>{
  const video=doc.createElement('video');video.muted=true;video.preload='auto';video.crossOrigin='anonymous';
  let done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);video.onloadedmetadata=video.onloadeddata=video.onseeked=video.onerror=null;video.removeAttribute('src');video.load();error?reject(error):resolve(value);};
  const abort=()=>finish(new Error('THUMBNAIL_CANCELLED'));const timer=setTimeout(()=>finish(new Error('THUMBNAIL_TIMEOUT')),timeoutMs);
  const draw=()=>{try{if(!video.videoWidth||!video.videoHeight)return;const canvas=doc.createElement('canvas');const scale=Math.min(1,640/video.videoWidth,360/video.videoHeight);canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const duration=video.duration;canvas.toBlob(blob=>blob?finish(null,{blob,duration}):finish(new Error('THUMBNAIL_UNAVAILABLE')),'image/jpeg',.85);}catch{finish(new Error('THUMBNAIL_UNAVAILABLE'));}};
  video.onloadedmetadata=()=>{if(!Number.isFinite(video.duration)||video.duration<=0)return finish(new Error('THUMBNAIL_UNAVAILABLE'));video.currentTime=Math.min(1,video.duration/2);};video.onseeked=draw;video.onloadeddata=()=>{if(video.currentTime===0&&video.duration<.02)draw();};video.onerror=()=>finish(new Error('THUMBNAIL_UNAVAILABLE'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();video.src=url;video.load();
 });
}

export function createIntroPoster({resolveSaved,principal,onChange=()=>{},capture=captureVideoPoster,createURL=blob=>URL.createObjectURL(blob),revokeURL=url=>URL.revokeObjectURL(url)}){
 let key=null,generation=0,aborter=null,state={url:null,status:'empty',duration:null};
 function clear(){generation++;aborter?.abort();aborter=null;if(state.url)revokeURL(state.url);key=null;state={url:null,status:'empty',duration:null};}
 function update({enabled,savedKey,localURL}){
  const actor=principal();const next=enabled&&actor?(localURL?`${actor}|local|${localURL}`:savedKey?`${actor}|saved|${savedKey}`:null):null;
  if(next===key)return;if(!next){clear();onChange();return;}clear();key=next;state.status='loading';onChange();const version=generation;aborter=new AbortController();
  (async()=>{try{const source=localURL?{url:localURL}:await resolveSaved();if(version!==generation||actor!==principal())return;if(!source?.url)throw Error('THUMBNAIL_UNAVAILABLE');const result=await capture(source.url,{signal:aborter.signal});if(version!==generation||actor!==principal())return;state={url:createURL(result.blob),duration:result.duration,status:'ready'};}catch{if(version!==generation||actor!==principal())return;state={url:null,duration:null,status:'unavailable'};}finally{if(version===generation&&actor===principal())onChange();}})();
 }
 return {update,clear,get state(){return {...state};}};
}
