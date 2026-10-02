import test from "node:test";
import assert from "node:assert/strict";
import { createDiscordVoiceProvider } from "../supabase/functions/_shared/discord-voice-provider.js";
import { handleVoiceReconcile } from "../supabase/functions/_shared/play-together-voice.js";
const env = {discordBotToken:"TEST",discordBotUserId:"100000000000000001",discordGuildId:"100000000000000002",discordCategoryId:"100000000000000003",supabaseUrl:"https://testing.example",serviceKey:"SERVICE",reconcileSecret:"RECONCILE"};
const actualBot="100000000000000004", channelId="100000000000000005";
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});

test("wrong configured bot ID cannot lock the authenticated bot out of a readable channel",async()=>{
 let overwrites;
 const provider=createDiscordVoiceProvider({env,fetchImpl:async(url,init={})=>{
  if(url.endsWith('/users/@me')) return reply({id:actualBot,bot:true});
  if(init.method==='POST') {
   const body=JSON.parse(init.body);assert.equal(body.name,'lol-aram-sg-0001');overwrites=body.permission_overwrites;return reply({id:channelId},201);
  }
  if(init.method==='DELETE') {
   assert.equal(url,`https://discord.com/api/v10/channels/${channelId}`);
   assert.equal(init.body,undefined);assert.ok(init.headers['X-Audit-Log-Reason']);
   const access=overwrites.find(o=>o.id===actualBot);
   return access && (BigInt(access.allow)&1040n)===1040n ? reply({id:channelId}) : reply({code:50001},403);
  }
  return reply([]);
 }});
 assert.equal((await provider.ensureSession({channelKey:'lol-aram-sg-0001',members:[{provider_account_id:'100000000000000010'}]})).ok,true);
 assert.equal(overwrites.some(o=>o.id===env.discordBotUserId),false);
 assert.equal((await provider.endSession({channelId})).ok,true);
});

test("bot identity lookup fails closed before channel creation",async()=>{
 let created=false;
 const provider=createDiscordVoiceProvider({env,fetchImpl:async(url,init={})=>{
  if(init.method==='POST')created=true;
  return url.endsWith('/users/@me')?reply({message:'Unauthorized'},401):reply([]);
 }});
 assert.equal((await provider.ensureSession({channelKey:'lol-aram-me1-0002',members:[{provider_account_id:'100000000000000010'}]})).code,'DISCORD_BOT_IDENTITY_FAILED');
 assert.equal(created,false);
});

test("readable-name retries recover the same category channel without creating another",async()=>{
 let calls=0;
 const provider=createDiscordVoiceProvider({env,fetchImpl:async()=>{calls++;return reply([{id:channelId,name:'lol-aram-sg-0002',type:2,parent_id:env.discordCategoryId}]);}});
 assert.equal((await provider.ensureSession({channelKey:'lol-aram-sg-0002',members:[{provider_account_id:'100000000000000010'}]})).recovered,true);
 assert.equal(calls,1);
});

for(const failure of [false,true])test(`reconciliation deletes only the claimed completed session channel; failure=${failure}`,async()=>{
 const logs=[],deleted=[];let finished;
 const request=new Request('https://testing.example/reconcile',{method:'POST',headers:{'x-gamid-reconcile-secret':env.reconcileSecret}});
 const response=await handleVoiceReconcile({request,env,log:(...args)=>logs.push(args.join(':')),fetchImpl:async(url,init={})=>{
  if(url.endsWith('/claim_play_together_voice_cleanup'))return reply([{voice_session_id:'completed-id',provider_key:'discord',provider_channel_id:channelId}]);
  if(init.method==='DELETE'){deleted.push(url);return failure?reply({code:50001,message:'Missing Access'},403):reply({id:channelId});}
  if(url.endsWith('/finish_play_together_voice_cleanup')){finished=JSON.parse(init.body);return reply(failure?'FAILED':'ENDED');}
  throw new Error('unexpected request');
 }});
 assert.deepEqual(deleted,[`https://discord.com/api/v10/channels/${channelId}`]);
 assert.equal(finished.candidate_voice_session_id,'completed-id');assert.equal(finished.candidate_deleted,!failure);
 assert.deepEqual(await response.json(),{claimed:1,ended:failure?0:1,failed:failure?1:0});
 if(failure)assert.ok(logs.includes('voice-cleanup-failed:DISCORD_CHANNEL_DELETE_FAILED_http_403_discord_50001'));
});
