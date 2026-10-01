import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { latestHistory, playTogetherAttentionEvents } from "../dist/play-together/notifications.js";
import { createRealtimeRefreshScheduler } from "../dist/play-together/realtime.js";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261001160000_play_together_acceptance_fixes.sql");
const ui = read("../dist/play-together/play-together.js");
const html = read("../dist/play-together/index.html");
const css = read("../dist/play-together/play-together.css");

test("host recommendations remain symmetric and invitations require applicant acceptance", () => {
  assert.match(migration,/mine\.intent='NEED_PLAYERS' and s\.intent='FIND_SQUAD'/);
  assert.match(migration,/request_origin in \('APPLICANT_REQUEST','HOST_INVITE'\)/);
  assert.match(migration,/invite_play_together_squad_impl/);
  assert.match(migration,/req\.request_origin='HOST_INVITE' and applicant\.creator_entity_id<>me/);
  assert.match(migration,/not exists\(select 1 from public\.play_together_join_requests/);
  assert.match(ui,/invite_play_together_squad/);
  assert.match(ui,/Fresh acceptance is required/);
});

test("attention events cover invitations, requests, Ready Check and participant readiness", () => {
  const previous={invitations:[],host_invitations:[],incoming_requests:[],active_session:{session_id:"s",status:"MATCHING"},ready_responses:[{member_id:"m",response:"PENDING"}]};
  const next={invitations:[{session_id:"i",owner_handle:"host"}],host_invitations:[],incoming_requests:[{request_id:"r",owner_handle:"joiner"}],active_session:{session_id:"s",status:"READY_CHECK"},ready_responses:[{member_id:"m",response:"READY",display_name:"Z"}]};
  assert.deepEqual(playTogetherAttentionEvents(previous,next).map(x=>x.kind),["INVITATION","REQUEST","READY_CHECK","READY_RESPONSE"]);
  assert.match(html,/attentionPanel[^>]+aria-live="assertive"/);
  const voice=playTogetherAttentionEvents({team_room:{participants:[{member_id:"m",voice_state:"CONSENT_REQUIRED"}]}},{team_room:{participants:[{member_id:"m",voice_state:"READY",display_name:"Z"}]}});
  assert.equal(voice[0].kind,"VOICE");
  const completed=playTogetherAttentionEvents({active_session:{session_id:"s",status:"IN_PLAY"}},{active_session:null,history:[{session_id:"s",status:"COMPLETED"}]});
  assert.equal(completed[0].kind,"COMPLETED");
});

test("two participant clients independently refresh from one Realtime state change", async () => {
  const timers=[];let black=0,zshot=0;
  const options={delay:0,setTimer(fn){timers.push(fn);return fn;},clearTimer(){}};
  createRealtimeRefreshScheduler(async()=>{black++;},options)();
  createRealtimeRefreshScheduler(async()=>{zshot++;},options)();
  await Promise.all(timers.splice(0).map(fn=>fn()));
  assert.equal(black,1);assert.equal(zshot,1);
  assert.match(migration,/broadcast_play_together_user\(uid,changed\.session_id\)/);
});

test("history is deterministic and limited to the newest five", () => {
  const history=Array.from({length:7},(_,i)=>({session_id:String(i),ended_at:`2026-10-0${i+1}T00:00:00Z`}));
  assert.deepEqual(latestHistory({history}).map(x=>x.session_id),["6","5","4","3","2"]);
  assert.match(migration,/order by coalesce\(s\.ended_at,s\.created_at\) desc limit 5/);
});

test("acceptance UI distinguishes squad counts and destructive actions", () => {
  for(const label of ["Current squad","Looking for","Found","Final squad"]) assert.match(ui,new RegExp(label));
  assert.match(css,/\.danger\{[^}]*border-color/);
  assert.match(ui,/secondary compact danger/);
});
