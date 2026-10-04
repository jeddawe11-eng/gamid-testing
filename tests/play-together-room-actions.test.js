import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRoomActions, roomActionAllowed, serializeRefresh } from "../dist/play-together/room-actions.js";
import { createStatusMessage } from "../dist/play-together/status-message.js";

const room = (owner = "black") => ({ my_entity: { entity_id: owner }, active_session: { session_id: "mr-room", creator_entity_id: "black", status: "IN_PLAY", game_key: "marvel_rivals" }, room: { room_status: "IN_PLAY" } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test("completion uses the displayed session once despite duplicate clicks and Realtime replacing the dashboard", async () => {
  let dashboard = room(); const gate = deferred(), calls = [], statuses = [], changes = [];
  const actions = createRoomActions({ getDashboard: () => dashboard, rpc: async (name, args) => { calls.push(args); await gate.promise; }, refresh: async () => { dashboard = { my_entity: { entity_id: "black" }, active_session: null, history: [{ session_id: "mr-room", status: "COMPLETED" }] }; }, message: (...args) => statuses.push(args), displayError: e => e.message, onChange: () => changes.push(actions.pending) });
  const first = actions.run("COMPLETE", "mr-room");
  assert.equal(actions.pending, true);
  await actions.run("COMPLETE", "mr-room");
  dashboard = { ...room(), active_session: null }; // terminal Realtime update arrives before the RPC reply
  gate.resolve(); await first;
  await actions.run("COMPLETE", "mr-room");
  dashboard = room(); // a stale pre-completion render may never submit again
  await actions.run("COMPLETE", "mr-room");
  assert.deepEqual(calls, [{ candidate_session_id: "mr-room", candidate_action: "COMPLETE" }]);
  assert.deepEqual(statuses, [["Session completed and saved to history.", true]]);
  assert.deepEqual(changes, [true, false]);
});

test("a participant's stale Complete control cannot generate NOT_HOST after the host completes", async () => {
  let calls = 0; const dashboard = room("zshot");
  // The old UI showed COMPLETE for every participant based solely on room_status.
  assert.ok(["OPEN", "IN_PLAY"].includes(dashboard.room.room_status));
  assert.equal(roomActionAllowed(dashboard, "COMPLETE"), false);
  const actions = createRoomActions({ getDashboard: () => dashboard, rpc: async () => { calls++; throw Error("NOT_HOST"); }, refresh() {}, message() { assert.fail("No false status should be shown"); }, displayError: e => e.message });
  await actions.run("COMPLETE", "mr-room");
  assert.equal(calls, 0);
});

test("stale displayed room cannot target a newly active session", async () => {
  const dashboard = room(); dashboard.active_session.session_id = "new-room";
  const actions = createRoomActions({ getDashboard: () => dashboard, rpc() { assert.fail("retargeted request"); }, message() {}, refresh() {}, displayError: e => e.message });
  await actions.run("COMPLETE", "mr-room");
});

test("completion success hides at five seconds but a genuine NOT_HOST remains actionable", async () => {
  const classes = new Set(), timers = new Map(); let id = 0, fail = false;
  const node = { textContent: "", hidden: true, classList: { toggle: (c, on) => on ? classes.add(c) : classes.delete(c), contains: c => classes.has(c) } };
  const message = createStatusMessage(node, { setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimer: key => timers.delete(key) });
  const actions = createRoomActions({ getDashboard: () => room(), rpc: async () => { if (fail) throw Error("NOT_HOST"); }, refresh: async () => {}, message, displayError: e => e.message });
  await actions.run("START", "mr-room"); // IN_PLAY cannot start again
  await actions.run("COMPLETE", "mr-room");
  const timer = [...timers.values()][0]; assert.equal(timer.ms, 5000); timer.fn(); assert.equal(node.hidden, true);
  fail = true;
  const denied = createRoomActions({ getDashboard: () => room(), rpc: async () => { throw Error("NOT_HOST"); }, refresh() {}, message, displayError: e => e.message });
  await denied.run("COMPLETE", "mr-room");
  assert.equal(node.textContent, "NOT_HOST"); assert.equal(node.hidden, false); assert.equal(timers.size, 0); assert.equal(denied.pending, false);
});

test("action and Realtime refreshes render in order; a failed read does not poison later refreshes", async () => {
  const gate = deferred(); let reads = 0; const rendered = [];
  const refresh = serializeRefresh(async () => { const read = ++reads; if (read === 1) await gate.promise; rendered.push(read); if (read === 2) throw Error("network"); });
  const old = refresh(); await Promise.resolve(); const action = refresh(); const latest = refresh();
  assert.equal(reads, 1); gate.resolve(); await old; await assert.rejects(action, /network/); await latest;
  assert.deepEqual(rendered, [1, 2, 3]);
});

test("production UI binds captured room IDs and routes all refreshes through the shared queue", () => {
  const js = readFileSync(new URL("../dist/play-together/play-together.js", import.meta.url), "utf8");
  assert.match(js, /const refresh=serializeRefresh/);
  assert.match(js, /node\.hidden=!roomActionAllowed\(dashboard,action\);node\.disabled=roomActions.pending/);
  assert.match(js, /roomActions.run\(action,\$\(id\).dataset.sessionId\)/);
  assert.match(js, /subscribePlayTogetherRealtime\(\{refresh\}\)/);
});
