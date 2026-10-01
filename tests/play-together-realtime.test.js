import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRealtimeRefreshScheduler, subscribePlayTogetherRealtime } from "../dist/play-together/realtime.js";
import { subscribePrivateBroadcast } from "../dist/account/realtime-client.js";

const migration = readFileSync(new URL("../supabase/migrations/20261001090000_play_together_realtime.sql", import.meta.url), "utf8");
const ui = readFileSync(new URL("../dist/play-together/play-together.js", import.meta.url), "utf8");

test("Realtime authorization is private and scoped to the signed-in user's topic", () => {
  assert.match(migration, /on realtime\.messages for select to authenticated/);
  assert.match(migration, /extension = 'broadcast'/);
  assert.match(migration, /realtime\.topic\(\) = 'play-together:user:' \|\| \(select auth\.uid\(\)\)::text/);
  assert.doesNotMatch(migration, /alter publication|grant select on (public|private)\.play_together/i);
});

test("all participant-visible Play Together state families emit invalidations", () => {
  for (const table of ["play_together_sessions","play_together_members","play_together_join_requests","play_together_ready_checks","play_together_ready_responses","play_together_rooms","play_together_events","play_together_avoids","play_together_voice_sessions","play_together_voice_participants"])
    assert.match(migration, new RegExp(`on (?:public|private)\\.${table}`));
  assert.match(migration, /select distinct em\.user_id/);
  assert.match(migration, /perform realtime\.send/);
});

test("Play Together subscribes after authenticated startup and cleans up on page exit", () => {
  assert.match(ui, /subscribePlayTogetherRealtime\(\{refresh\}\)/);
  assert.match(ui, /addEventListener\("pagehide",unsubscribe/);
});

test("Realtime refreshes debounce bursts and preserve one change received during a refresh", async () => {
  const timers=[]; let releases=[],calls=0;
  const schedule=createRealtimeRefreshScheduler(()=>{calls+=1;return new Promise(resolve=>releases.push(resolve));},{setTimer(fn){timers.push(fn);return fn;},clearTimer(fn){const index=timers.indexOf(fn);if(index>=0)timers.splice(index,1);}});
  schedule();schedule();schedule();assert.equal(timers.length,1);
  const first=timers.shift()();assert.equal(calls,1);schedule();schedule();releases.shift()();await first;await Promise.resolve();
  assert.equal(timers.length,1);
  const second=timers.shift()();assert.equal(calls,2);releases.shift()();await second;
});

test("subscription uses only the current signed-in user's private topic", () => {
  const userId="11111111-1111-4111-8111-111111111111";let candidate;
  const unsubscribe=subscribePlayTogetherRealtime({refresh(){},getUserId:()=>userId,subscribe(value){candidate=value;return()=>{};}});
  assert.equal(candidate.topic,`play-together:user:${userId}`);
  assert.equal(candidate.event,"state_changed");
  assert.equal(typeof candidate.onMessage,"function");
  unsubscribe();
});

test("Realtime transport joins a private Broadcast channel and uses Phoenix heartbeats", async () => {
  const sockets=[];let heartbeat;
  class FakeSocket {
    static OPEN=1;
    constructor(url){this.url=url;this.readyState=1;this.sent=[];this.listeners={};sockets.push(this);}
    addEventListener(name,fn){this.listeners[name]=fn;}
    send(value){this.sent.push(JSON.parse(value));}
    close(){this.readyState=3;}
  }
  const stop=subscribePrivateBroadcast({topic:"play-together:user:user-1",event:"state_changed",onMessage(){},WebSocketImpl:FakeSocket,getSession:async()=>({access_token:"USER.JWT"}),setIntervalImpl(fn){heartbeat=fn;return fn;},clearIntervalImpl(){}});
  await Promise.resolve();
  sockets[0].listeners.open();
  assert.equal(sockets[0].sent[0].event,"phx_join");
  assert.equal(sockets[0].sent[0].payload.config.private,true);
  assert.equal(sockets[0].sent[0].payload.access_token,"USER.JWT");
  heartbeat();
  assert.equal(sockets[0].sent[1].topic,"phoenix");
  assert.equal(sockets[0].sent[1].event,"heartbeat");
  stop();
});
