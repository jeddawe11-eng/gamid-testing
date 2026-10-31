// R2 Primary (DEC-0014) - the Worker's per-request revocation check (handoff §153, §154): a valid lease for a 'primary/' key is served only while its registry row
// is 'stored'. Proves: before the logical delete GET/HEAD/Range are served; after it the SAME lease is a 404 for GET, HEAD and Range although the object is still in
// R2 - on the very next request, in the same isolate, with no delay (nothing is cached); a failed / slow / odd check is a 503 no-store and never content (fail
// closed); the check runs beside the R2 read (latency = the slower of the two, not their sum) and a refused request's R2 body is cancelled unread; pilot
// (Architecture F) keys are served exactly as before with no extra call; the browser cache header is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { handleMediaDelivery, isMediaKey, isPrimaryKey, isDeliveryKey, signDeliveryUrl, verifyDelivery, checkMediaObjectState } from "../cf-worker/media-r2.mjs";

const SITE = "https://gamid-testing-static.gamid.workers.dev", BASE = "https://upvtrczefcvigxdyuylw.supabase.co";
const SIGNING = "signing-fixture-0123456789abcdef0123456789abcdef";
const UID = "11111111-1111-4111-8111-111111111111", OBJ = "66666666-6666-4666-8666-666666666666", TOKEN = "33333333-3333-4333-8333-333333333333";
const PRIMARY = `primary/wall-video/${UID}/wall-1/clip.mp4/${OBJ}`;
const PILOT = `intro-media/${UID}/22222222-2222-4222-8222-222222222222/intro-d3.webm/${TOKEN}`;
const NOW = 1_800_000_000;
const BYTES = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 251));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// a minimal R2 binding; every body records whether it was read to the end or cancelled; delayMs simulates R2's own latency
function mockR2(keys, { delayMs = 0 } = {}) {
  const objects = new Map(keys.map(k => [k, BYTES])), calls = [], bodies = [];
  const meta = (key, b) => ({ key, size: b.byteLength, httpEtag: '"e"', httpMetadata: { contentType: "video/mp4" }, uploaded: new Date(NOW * 1000) });
  const body = bytes => {
    const record = { cancelled: false };
    bodies.push(record);
    return new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); }, cancel() { record.cancelled = true; } });
  };
  return {
    objects, calls, bodies,
    async head(key) { calls.push(["head", key]); await sleep(delayMs); const b = objects.get(key); return b ? meta(key, b) : null; },
    async get(key, options) {
      calls.push(["get", key]); await sleep(delayMs);
      const b = objects.get(key); if (!b) return null;
      const r = options?.range; let slice = b;
      if (r) slice = r.suffix !== undefined ? b.slice(b.byteLength - r.suffix) : b.slice(r.offset, r.length !== undefined ? r.offset + r.length : undefined);
      return { ...meta(key, b), range: r, body: body(slice) };
    },
  };
}
const env = (r2 = mockR2([PRIMARY, PILOT])) => ({ MEDIA_R2_DELIVERY: "on", MEDIA_R2: r2, MEDIA_R2_SIGNING_KEY: SIGNING });
const req = async (key, { method = "GET", headers = {}, exp = NOW + 21600 } = {}) => new Request(await signDeliveryUrl(SITE, key, exp, SIGNING), { method, headers });

// the registry as the RPC sees it, answered over a mock fetch exactly as PostgREST does (a bare JSON boolean); delayMs simulates the round trip
function registry(initial = "stored") {
  const state = { value: initial, calls: 0, mode: "ok", delayMs: 0 };
  const fetchImpl = async (url, init) => {
    state.calls++;
    assert.equal(url, `${BASE}/rest/v1/rpc/media_r2_object_servable`);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.apikey, "publishable");
    const { candidate_r2_key } = JSON.parse(init.body);
    // the answer is read when the request reaches the database, i.e. after the round trip's first half
    if (state.mode === "hang") return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    await sleep(state.delayMs);
    if (state.mode === "down") throw new TypeError("fetch failed");
    if (state.mode === "500") return new Response('{"message":"boom"}', { status: 500 });
    if (state.mode === "garbage") return new Response('"yes"', { status: 200 });
    return new Response(JSON.stringify(candidate_r2_key === PRIMARY && state.value === "stored"), { status: 200, headers: { "content-type": "application/json" } });
  };
  return Object.assign(state, { fetchImpl });
}
const checker = (reg, timeoutMs = 2000) => key => checkMediaObjectState(key, { supabaseUrl: BASE, publishableKey: "publishable", fetchImpl: reg.fetchImpl, timeoutMs });

test("primary keys: primary/<video bucket>/<owner uuid>/<path>/<object uuid> only; delivery accepts primary and pilot keys, the pilot regex is unchanged", async () => {
  assert.ok(isPrimaryKey(PRIMARY)); assert.ok(isDeliveryKey(PRIMARY)); assert.equal(isMediaKey(PRIMARY), false);
  assert.ok(isPrimaryKey(`primary/intro-media/${UID}/${TOKEN}/intro.webm/${OBJ}`));
  assert.ok(isDeliveryKey(PILOT)); assert.equal(isPrimaryKey(PILOT), false);
  for (const bad of [`primary/avatars/${UID}/a.png/${OBJ}`, `primary/wall-video/${UID}/${OBJ}`, `primary/wall-video/not-a-uuid/a.mp4/${OBJ}`, `primary/wall-video/${UID}/../a.mp4/${OBJ}`,
    `primary/wall-video/${UID}//a.mp4/${OBJ}`, `primary/wall-video/${UID}/a.mp4/${OBJ}/x`, `primary/wall-video/${UID}/a.mp4`, `primary/wall-video/${UID}/a/b/c/d/e/f/g.mp4/${OBJ}`, "", null])
    assert.equal(isPrimaryKey(bad), false, String(bad));
  const sig = new URL(await signDeliveryUrl(SITE, PRIMARY, NOW + 60, SIGNING)).searchParams.get("sig");
  assert.equal(await verifyDelivery(PRIMARY, String(NOW + 60), sig, SIGNING, NOW), true);
});

test("the same valid lease: served while stored, then 404 for GET, HEAD and Range on the very next request after the logical delete, same isolate, no delay", async () => {
  const r2 = mockR2([PRIMARY, PILOT]), e = env(r2), reg = registry("stored");
  const opts = { nowSeconds: NOW, checkState: checker(reg) };   // ONE checker for every request, as in one Worker isolate
  const get = await req(PRIMARY), head = await req(PRIMARY, { method: "HEAD" }), range = await req(PRIMARY, { headers: { range: "bytes=0-99" } });
  let r = await handleMediaDelivery(get.clone(), e, opts);
  assert.equal(r.status, 200); assert.equal((await r.arrayBuffer()).byteLength, 1000);
  assert.equal(r.headers.get("cache-control"), "private, max-age=21600", "the browser cache header is unchanged (F6-A)");
  r = await handleMediaDelivery(head.clone(), e, opts); assert.equal(r.status, 200); assert.equal(r.headers.get("content-length"), "1000");
  r = await handleMediaDelivery(range.clone(), e, opts); assert.equal(r.status, 206); assert.equal(r.headers.get("content-range"), "bytes 0-99/1000");
  assert.equal(reg.calls, 3, "every request asked the registry");
  // the delete commits (state 'deleting'; later 'deleted' / 'missing'; or a failed / pending object) - the very next request of the same playback is refused
  for (const s of ["deleting", "deleted", "missing", "failed", "pending"]) {
    reg.value = s;
    for (const rq of [get, head, range]) {
      const before = r2.bodies.length;
      r = await handleMediaDelivery(rq.clone(), e, opts);
      assert.equal(r.status, 404, `${s} ${rq.method} ${rq.headers.get("range") ?? ""}`);
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal(await r.text(), "Not Found");
      assert.ok(r2.bodies.slice(before).every(b => b.cancelled), "the R2 body read beside the check is cancelled, never sent");
    }
  }
  assert.ok(r2.objects.has(PRIMARY), "revocation does not depend on the physical delete");
  // and back: nothing negative is remembered either (a restore is not a product flow, but the check is purely per request)
  reg.value = "stored";
  assert.equal((await handleMediaDelivery(get.clone(), e, opts)).status, 200);
});

test("no shared answer: parallel requests each ask the registry; a delete between two parallel batches is seen by the whole second batch", async () => {
  const e = env(), reg = registry("stored"), opts = { nowSeconds: NOW, checkState: checker(reg) };
  const batch = async () => Promise.all(Array.from({ length: 8 }, async (_, i) => (await handleMediaDelivery(await req(PRIMARY, { headers: { range: `bytes=${i * 100}-${i * 100 + 99}` } }), e, opts)).status));
  assert.deepEqual(await batch(), Array(8).fill(206));
  assert.equal(reg.calls, 8);
  reg.value = "deleting";
  assert.deepEqual(await batch(), Array(8).fill(404));
  assert.equal(reg.calls, 16);
});

test("fail closed: a down, erroring, slow or odd check is a 503 no-store, never content (the R2 body is cancelled); a throwing checkState and no checkState at all too", async () => {
  for (const mode of ["down", "500", "garbage", "hang"]) {
    const r2 = mockR2([PRIMARY]), reg = registry("stored"); reg.mode = mode;
    const started = Date.now();
    const r = await handleMediaDelivery(await req(PRIMARY), env(r2), { nowSeconds: NOW, checkState: checker(reg, 50) });
    assert.equal(r.status, 503, mode); assert.equal(r.headers.get("cache-control"), "no-store"); assert.equal(r.headers.get("retry-after"), "5");
    assert.equal(await r.text(), "Service Unavailable");
    assert.ok(r2.bodies.every(b => b.cancelled), `${mode}: R2 body cancelled`);
    assert.ok(Date.now() - started < 1500, `${mode}: bounded by the timeout`);
  }
  let r = await handleMediaDelivery(await req(PRIMARY), env(), { nowSeconds: NOW, checkState: async () => { throw new Error("x"); } });
  assert.equal(r.status, 503);
  r = await handleMediaDelivery(await req(PRIMARY), env(), { nowSeconds: NOW, checkState: () => { throw new Error("sync"); } });
  assert.equal(r.status, 503, "a synchronous throw is contained too");
  r = await handleMediaDelivery(await req(PRIMARY), env(), { nowSeconds: NOW });
  assert.equal(r.status, 503, "no checker wired = nothing primary is served");
  // a failure is not remembered: the next request asks again and serves once the database answers
  const reg = registry("stored"); reg.mode = "down";
  const opts = { nowSeconds: NOW, checkState: checker(reg) };
  assert.equal((await handleMediaDelivery(await req(PRIMARY), env(), opts)).status, 503);
  reg.mode = "ok";
  assert.equal((await handleMediaDelivery(await req(PRIMARY), env(), opts)).status, 200);
  // an object missing in R2 stays a 404 whatever the registry says
  assert.equal((await handleMediaDelivery(await req(PRIMARY), env(mockR2([])), { nowSeconds: NOW, checkState: async () => "stored" })).status, 404);
});

test("latency: the check runs beside the R2 read, so a request costs about the slower of the two, not their sum; invalid, expired and rate-limited requests never reach the check", async () => {
  // deterministic overlap proof: the R2 read finishes only once the check has started, and the check answers only once the R2 read has started -
  // run one after the other, either side would wait for the other forever (bounded here by a 1 s failure)
  const signal = () => { let open; const p = new Promise(resolve => { open = resolve; }); return { p, open }; };
  const within = (p, what) => Promise.race([p, sleep(1000).then(() => { throw new Error(`${what}: not concurrent`); })]);
  const r2Started = signal(), checkStarted = signal();
  const r2 = mockR2([PRIMARY]);
  const get = r2.get.bind(r2);
  r2.get = async (...args) => { r2Started.open(); await within(checkStarted.p, "R2 waited for the check"); return get(...args); };
  const reg = registry("stored");
  let r = await handleMediaDelivery(await req(PRIMARY), env(r2), { nowSeconds: NOW,
    checkState: async key => { checkStarted.open(); await within(r2Started.p, "the check waited for R2"); return checker(reg)(key); } });
  assert.equal(r.status, 200);
  assert.equal(reg.calls, 1);
  r = await handleMediaDelivery(await req(PILOT, { exp: NOW + 120 }), env(), { nowSeconds: NOW, checkState: checker(reg) });
  assert.equal(r.status, 200); assert.equal(reg.calls, 1, "pilot: no check");
  let asked = 0;
  const o = { nowSeconds: NOW, checkState: async () => { asked++; return "stored"; } };
  const forged = new URL(await signDeliveryUrl(SITE, PRIMARY, NOW + 60, "another-secret"));
  assert.equal((await handleMediaDelivery(new Request(forged), env(), o)).status, 404);
  assert.equal((await handleMediaDelivery(await req(PRIMARY, { exp: NOW }), env(), o)).status, 404);
  assert.equal((await handleMediaDelivery(await req(PRIMARY), env(), { ...o, withinLimit: async () => false })).status, 429);
  assert.equal(asked, 0);
});

test("pilot / Architecture F keys are served exactly as before: no state call; delivery OFF stays a 404 for everything", async () => {
  let asked = 0;
  const o = { nowSeconds: NOW, checkState: async () => { asked++; return "gone"; } };
  const e = env();
  let r = await handleMediaDelivery(await req(PILOT, { exp: NOW + 120 }), e, o);
  assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "private, max-age=120");
  r = await handleMediaDelivery(await req(PILOT, { exp: NOW + 120, headers: { range: "bytes=10-19" } }), e, o); assert.equal(r.status, 206);
  assert.equal(asked, 0);
  r = await handleMediaDelivery(await req(PRIMARY), { ...e, MEDIA_R2_DELIVERY: "off" }, { nowSeconds: NOW, checkState: async () => "stored" });
  assert.equal(r.status, 404);
});
