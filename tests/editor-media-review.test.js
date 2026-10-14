import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntroPoster,providerAvatar,leagueIcon} from '../dist/account/editor-media.js';
import {handleGameArtwork} from '../supabase/functions/_shared/game-artwork.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('provider images accept stored Steam/Discord sources, reject lookalikes and never invent League IDs',()=>{
 const url='https://avatars.fastly.steamstatic.com/'+'a'.repeat(40)+'_full.jpg';assert.equal(providerAvatar('steam',url),url);
 for(const bad of [url.replace('steamstatic.com','steamstatic.com.evil.test'),url+'?token=secret','http://avatars.steamstatic.com/a.jpg','javascript:alert(1)'])assert.equal(providerAvatar('steam',bad),null);
 assert.equal(providerAvatar('discord','https://cdn.discordapp.com/avatars/1/a.png'),'https://cdn.discordapp.com/avatars/1/a.png');assert.equal(providerAvatar('steam',null),null);
 assert.equal(leagueIcon(1666),'https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon1666.jpg');for(const invalid of [null,'1666',-1,100001,NaN])assert.equal(leagueIcon(invalid),null);
});

test('existing saved Intro is captured once; a local selection replaces it and removal releases its image',async()=>{
 let actor='owner',savedReads=0;const captured=[],revoked=[];
 const poster=createIntroPoster({principal:()=>actor,resolveSaved:async()=>{savedReads++;return {url:'signed-owner-video'};},capture:async url=>{captured.push(url);return {blob:new Blob(['real-frame']),duration:8};},createURL:()=>`blob:poster-${captured.length}`,revokeURL:url=>revoked.push(url)});
 poster.update({enabled:true,savedKey:'existing-job'});await tick();assert.equal(poster.state.status,'ready');assert.equal(poster.state.duration,8);assert.deepEqual(captured,['signed-owner-video']);
 poster.update({enabled:true,savedKey:'existing-job'});await tick();assert.equal(savedReads,1);
 poster.update({enabled:true,savedKey:'existing-job',localURL:'blob:local-video'});await tick();assert.deepEqual(captured,['signed-owner-video','blob:local-video']);assert.deepEqual(revoked,['blob:poster-1']);
 poster.update({enabled:false});assert.equal(poster.state.url,null);assert.deepEqual(revoked,['blob:poster-1','blob:poster-2']);
});

test('account switches and cancelled captures cannot install the previous owner image',async()=>{
 let actor='first',finish,created=0;const poster=createIntroPoster({principal:()=>actor,resolveSaved:async()=>({url:'first-private-video'}),capture:()=>new Promise(resolve=>finish=resolve),createURL:()=>{created++;return 'blob:must-not-appear';},revokeURL:()=>{}});
 poster.update({enabled:true,savedKey:'job'});await tick();actor='second';poster.clear();finish({blob:new Blob(['frame']),duration:4});await tick();assert.equal(created,0);assert.equal(poster.state.url,null);
});

test('failed or missing owner video is an explicit unavailable state and never retried on each render',async()=>{
 let reads=0;const poster=createIntroPoster({principal:()=> 'owner',resolveSaved:async()=>{reads++;return null;},capture:()=>{throw Error('unexpected capture');}});
 poster.update({enabled:true,savedKey:'job'});await tick();assert.equal(poster.state.status,'unavailable');poster.update({enabled:true,savedKey:'job'});await tick();assert.equal(reads,1);
});

const env={supabaseUrl:'https://fixture.supabase.co',serviceKey:'service-fixture',anonKey:'anon-fixture',providerKey:''};
function fixture({auth=true,enabled=true,publicGame=false}={}){
 const calls=[];const fetchImpl=async(url,init)=>{const u=new URL(url),name=u.pathname.split('/').pop();const args=init?.body?JSON.parse(init.body):null;calls.push({url,name,args,auth:init?.headers?.Authorization});let body=[];
  if(name==='public_media_hit')body=true;
  if(name==='get_my_identity_profile') {assert.equal(init.headers.Authorization,'Bearer owner.jwt');if(!auth)return new Response('{}',{status:401});body=[{gamid_handle:'fixture_owner'}];}
  if(name==='game_artwork_targets'){assert.equal(args.candidate_handle,'fixture_owner');body={enabled,games:publicGame?[{game_key:'crew_game',purposes:['crews']}]:[]};}
  if(name==='get_my_manual_games'){assert.equal(init.headers.Authorization,'Bearer owner.jwt');body=[{game_key:'owned_game'}];}
  if(name==='get_my_discovered_games'){assert.equal(init.headers.Authorization,'Bearer owner.jwt');body=[];}
  if(name==='get_my_favorite_games'){assert.equal(init.headers.Authorization,'Bearer owner.jwt');body=['foreign_game'];}
  if(name==='game_catalog'){assert.equal(init.method||'GET','GET');assert.equal(init.headers.Authorization,'Bearer service-fixture');assert.equal(u.searchParams.get('game_key'),publicGame?'in.(owned_game,crew_game)':'in.(owned_game)');body=[{game_key:'owned_game',display_name:'Owned Game',release_year:2024,game_catalog_provider_ids:[]},{game_key:'foreign_game',display_name:'Foreign Game',release_year:2020},...(publicGame?[{game_key:'crew_game',display_name:'Crew Game',release_year:2023,game_catalog_provider_ids:[]}]:[])];}
  if(name==='game_artwork_cache_get'){assert.deepEqual(args.candidate_keys,publicGame?['owned_game','crew_game']:['owned_game']);body=['owned_game','foreign_game',...(publicGame?['crew_game']:[])].map(game_key=>({game_key,status:'MATCHED',icon_url:`https://cdn2.steamgriddb.com/icon/${game_key}.png`,hero_url:`https://cdn2.steamgriddb.com/hero/${game_key}.png`}));}
  return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
 };return {calls,fetchImpl};
}
const request=authorization=>new Request('https://fixture.supabase.co/functions/v1/game-artwork/owner/self?handle=foreign_owner',{headers:{Origin:'https://gamid-testing-static.gamid.workers.dev',...(authorization?{Authorization:authorization}:{})}});

test('private owner artwork reuses only caller-owned cached canonical games, never a URL handle or foreign row',async()=>{
 const f=fixture();const response=await handleGameArtwork({request:request('Bearer owner.jwt'),env,fetchImpl:f.fetchImpl});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.match(response.headers.get('Vary'),/Authorization/);
 const body=await response.json();assert.deepEqual(Object.keys(body.artwork),['owned_game']);assert.deepEqual(body.myGames,{'Owned Game|2024':'owned_game'});assert.equal(f.calls.some(c=>c.url.includes('steamgriddb.com')),false,'cached pictures do not trigger provider calls');assert.doesNotMatch(JSON.stringify(body),/owner.jwt|service-fixture|foreign_game/);
});

test('anonymous and expired owner requests cannot read private game artwork',async()=>{
 let f=fixture();let response=await handleGameArtwork({request:request(),env,fetchImpl:f.fetchImpl});assert.equal(response.status,401);assert.equal(f.calls.length,0);
 f=fixture({auth:false});response=await handleGameArtwork({request:request('Bearer owner.jwt'),env,fetchImpl:f.fetchImpl});assert.equal(response.status,401);assert.equal(f.calls.some(c=>c.name==='game_catalog'||c.name==='game_artwork_cache_get'),false);
});

test('owner artwork keeps existing public Classic Crew artwork without adding it to the private My Games list',async()=>{
 const f=fixture({publicGame:true});const response=await handleGameArtwork({request:request('Bearer owner.jwt'),env,fetchImpl:f.fetchImpl});const body=await response.json();assert.deepEqual(Object.keys(body.artwork),['owned_game','crew_game']);assert.ok(body.artwork.crew_game.hero);assert.deepEqual(body.myGames,{'Owned Game|2024':'owned_game'});
});

test('owner artwork respects the existing TESTING kill switch without reading library/cache or calling providers',async()=>{
 const f=fixture({enabled:false});const response=await handleGameArtwork({request:request('Bearer owner.jwt'),env,fetchImpl:f.fetchImpl});assert.equal((await response.json()).enabled,false);assert.equal(f.calls.some(c=>c.name==='get_my_manual_games'||c.name==='game_artwork_cache_get'),false);
});
