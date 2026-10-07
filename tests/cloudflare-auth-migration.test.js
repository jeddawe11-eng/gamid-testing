import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleStart as discordStart, handleCallback as discordCallback, RETURN_URL as discordReturn } from '../supabase/functions/_shared/discord-oauth.js';
import { handleLeagueLookup } from '../supabase/functions/_shared/league/league-service.js';
import { returnRedirect as steamReturn } from '../supabase/functions/_shared/steam-openid.js';
const CF='https://gamid-testing-static.gamid.workers.dev';
const GH='https://jeddawe11-eng.github.io';
const endpoint='https://upvtrczefcvigxdyuylw.supabase.co/functions/v1/';
const env={supabaseUrl:'https://fixture.supabase.co',anonKey:'fixture',serviceKey:'fixture',clientId:'fixture',clientSecret:'fixture'};
test('Discord connection and League preflights allow exact Cloudflare origin and refuse unrelated origins',async()=>{
 for(const [handler,name] of [[discordStart,'discord-connect-start'],[handleLeagueLookup,'league-lookup']]){
  for(const origin of [CF,GH,'https://evil.test',CF+'.evil.test']){
   const response=await handler({request:new Request(endpoint+name,{method:'OPTIONS',headers:{origin}}),env,fetchImpl:()=>{throw new Error('preflight must not access data');}});
   assert.equal(response.headers.get('access-control-allow-origin'),origin===CF?CF:null);
  }
 }
});
test('Discord missing-state callback and every Steam return target go to Cloudflare, never input destinations',async()=>{
 assert.equal(discordReturn,CF+'/account/');
 const response=await discordCallback({request:new Request(endpoint+'discord-connect-callback'),env,fetchImpl:()=>{throw new Error('missing state must not consume an attempt');}});
 assert.equal(new URL(response.headers.get('location')).origin,CF);
 for(const site of ['cf','gh','https://evil.test']){
  const result=steamReturn('error','invalid_state',site);
  assert.equal(new URL(result.headers.get('location')).origin,CF);
 }
});
test('Team Voice stays on its accepted Cloudflare callback/return flow and secrets/JWT policies stay unchanged',()=>{
 const voice=readFileSync(new URL('../supabase/functions/_shared/play-together-voice.js',import.meta.url),'utf8');
 assert.match(voice,/https:\/\/gamid-testing-static\.gamid\.workers\.dev\/play-together\/\?voice=/);
 assert.match(voice,/functions\/v1\/play-together-voice-authorize-callback/);
 const config=readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');
 for(const name of ['discord-connect-start','steam-connect-start','league-lookup'])assert.ok(config.includes('[functions.'+name+']\nverify_jwt = true'));
 for(const name of ['discord-connect-callback','steam-connect-callback'])assert.ok(config.includes('[functions.'+name+']\nverify_jwt = false'));
});
