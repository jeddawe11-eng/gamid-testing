import test from "node:test";
import assert from "node:assert/strict";
import { INTRO_STATUS_POLL_INTERVAL_MS, INTRO_STATUS_POLL_MAX_MS, IntroStatusPoller } from "../dist/account/intro-status-poller.js";

function harness(states) {
  let now=0; let nextId=1;
  const timers=new Map(); const rendered=[];
  const poller=new IntroStatusPoller({
    load:async () => states.shift(), onState:async state => rendered.push(state.latest_job_state),
    now:() => now,
    setTimer(callback,delay) { const id=nextId++; timers.set(id,{callback,at:now+delay}); return id; },
    clearTimer:id => timers.delete(id),
  });
  const advance=async milliseconds => {
    now+=milliseconds;
    const due=[...timers.entries()].filter(([,timer]) => timer.at <= now);
    for (const [id,timer] of due) { timers.delete(id); await timer.callback(); }
  };
  return { poller,timers,rendered,advance,setNow:value => { now=value; } };
}

test("Intro status polling uses one 3-second loop and stops when READY is detected", async () => {
  const run=harness([{latest_job_state:"pending"},{latest_job_state:"processing"},{latest_job_state:"ready"}]);
  assert.equal(INTRO_STATUS_POLL_INTERVAL_MS,3000);
  assert.equal(run.poller.start(),true);
  assert.equal(run.poller.start(),false);
  assert.equal(run.timers.size,1);
  await run.advance(3000); await run.advance(3000); await run.advance(3000);
  assert.deepEqual(run.rendered,["pending","processing","ready"]);
  assert.equal(run.poller.active,false);
  assert.equal(run.timers.size,0);
});

test("Intro status polling stops on failure or cancellation", async () => {
  for (const terminal of ["failed","cancelled"]) {
    const run=harness([{latest_job_state:terminal}]);
    run.poller.start(); await run.advance(3000);
    assert.deepEqual(run.rendered,[terminal]);
    assert.equal(run.poller.active,false);
    assert.equal(run.timers.size,0);
  }
});

test("Intro status polling expires after five minutes and stop cleans its timer", async () => {
  const run=harness([{latest_job_state:"pending"}]);
  assert.equal(INTRO_STATUS_POLL_MAX_MS,300000);
  run.poller.start();
  run.setNow(300000);
  await run.advance(0);
  assert.equal(run.poller.active,false);
  assert.equal(run.timers.size,0);
  run.poller.start();
  assert.equal(run.timers.size,1);
  run.poller.stop();
  assert.equal(run.timers.size,0);
});

test("foreground refresh shares an in-flight backend read", async () => {
  let resolveLoad; let loads=0; const rendered=[];
  const poller=new IntroStatusPoller({
    load:() => { loads+=1; return new Promise(resolve => { resolveLoad=resolve; }); },
    onState:async intro => rendered.push(intro.latest_job_state),
  });
  const first=poller.refreshNow(); const second=poller.refreshNow();
  assert.equal(loads,1);
  resolveLoad({latest_job_state:"ready"});
  await Promise.all([first,second]);
  assert.deepEqual(rendered,["ready"]);
});
