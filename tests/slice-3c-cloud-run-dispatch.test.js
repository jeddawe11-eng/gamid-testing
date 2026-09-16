import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { authorizeWebhook, createDispatcherServer, validateWebhookPayload } from "../worker/intro-dispatcher.mjs";

const validPayload={ type:"INSERT",schema:"public",table:"intro_processing_jobs",record:{ job_id:"job-1",state:"pending",owner_user_id:"ignored" } };

test("dispatcher accepts only the exact secret without exposing it", () => {
  assert.equal(authorizeWebhook({ "x-gamid-dispatch-secret":"correct" },"correct"),true);
  assert.equal(authorizeWebhook({ "x-gamid-dispatch-secret":"wrong" },"correct"),false);
  assert.equal(authorizeWebhook({},"correct"),false);
});

test("dispatcher accepts only pending Intro insert webhooks", () => {
  assert.equal(validateWebhookPayload(validPayload),true);
  assert.equal(validateWebhookPayload({ ...validPayload,type:"UPDATE" }),false);
  assert.equal(validateWebhookPayload({ ...validPayload,table:"profiles" }),false);
  assert.equal(validateWebhookPayload({ ...validPayload,record:{ job_id:"job-1",state:"ready" } }),false);
});

test("valid webhook triggers the configured Cloud Run Job without trusting record ownership", async () => {
  const calls=[];
  const server=createDispatcherServer({
    environment:{ project:"gamid-testing",region:"asia-southeast1",job:"gamid-intro-worker-testing",secret:"test-secret" },
    executeJob:async environment => { calls.push(environment); return {}; }
  }).listen(0,"127.0.0.1");
  await once(server,"listening");
  try {
    const { port }=server.address();
    const response=await fetch(`http://127.0.0.1:${port}/dispatch`,{ method:"POST",headers:{ "Content-Type":"application/json","x-gamid-dispatch-secret":"test-secret" },body:JSON.stringify(validPayload) });
    assert.equal(response.status,202);
    assert.deepEqual(calls,[{ project:"gamid-testing",region:"asia-southeast1",job:"gamid-intro-worker-testing",secret:"test-secret" }]);
  } finally { server.close(); }
});

test("invalid secret and stale webhook cannot execute a paid job", async () => {
  let calls=0;
  const server=createDispatcherServer({
    environment:{ project:"gamid-testing",region:"asia-southeast1",job:"gamid-intro-worker-testing",secret:"test-secret" },
    executeJob:async () => { calls+=1; }
  }).listen(0,"127.0.0.1");
  await once(server,"listening");
  try {
    const { port }=server.address();
    const wrong=await fetch(`http://127.0.0.1:${port}/dispatch`,{ method:"POST",headers:{ "Content-Type":"application/json","x-gamid-dispatch-secret":"wrong" },body:JSON.stringify(validPayload) });
    const stale=await fetch(`http://127.0.0.1:${port}/dispatch`,{ method:"POST",headers:{ "Content-Type":"application/json","x-gamid-dispatch-secret":"test-secret" },body:JSON.stringify({ ...validPayload,type:"UPDATE" }) });
    assert.equal(wrong.status,401);
    assert.equal(stale.status,400);
    assert.equal(calls,0);
  } finally { server.close(); }
});
