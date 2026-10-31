// R2 Primary (DEC-0014) - the Worker's per-request revocation check (handoff §153): a valid lease for a 'primary/' key is served only while its registry row is
// 'stored'. Proves: before the logical delete GET/HEAD/Range are served; after it the SAME lease is a 404 for GET, HEAD and Range although the object is still in
// R2; a failed / slow / odd check is a 503 no-store and never content (fail closed); only positive answers are cached, briefly and bounded; pilot (Architecture F)
// keys are served exactly as before with no extra call; the browser cache header is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { handleMediaDelivery, isMediaKey, isPrimaryKey, isDeliveryKey, signDeliveryUrl, verifyDelivery, checkMediaObjectState, MEDIA_STATE_CACHE_MS } from "../cf-worker/media-r2.mjs";

const SITE = "https://gamid-testing-static.gamid.workers.dev", BASE = "https://upvtrczefcvigxdyuylw.supabase.co";
const SIGNING = "signing-fixture-0123456789abcdef0123456789abcdef";
const UID = "11111111-1111-4111-8111-111111111111", OBJ = "66666666-6666-4666-8666-666666666666", TOKEN = "33333333-3333-4333-8333-333333333333";
const PRIMARY = `primary/wall-video/${UID}/wall-1/clip.mp4/${OBJ}`;
const PILOT = `intro-media/${UID}/22222222-2222-4222-8222-222222222222/intro-d3.webm/${TOKEN}`;
const NOW = 1_800_000_000;
const BYTES = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 251));

function mockR2(keys) {
  const objects = new Map(keys.map(k => [k, BYTES])), calls = [];
  const meta = (key, b) => ({ key, size: b.byteLength, httpEtag: '"e"', httpMetadata: { contentType: "video/mp4" }, uploaded: new Date(NOW * 1000) });
  return {
    objects, calls,
    async head(key) { calls.push(["head", key]); const b = objects.get(key); return b ? meta(key, b) : null; },
    async get(key, options) {
      calls.push(["get", key]);
      const b = objects.get(key); if (!b) return null;
      const r = options?.range; let slice = b;
      if (r) slice = r.suffix !== undefined ? b.slice(b.byteLength - r.suffix) : b.slice(r.offset, r.length !== undefined ? r.offset + r.length : undefined);
      return { ...meta(key, b), range: r, body: new Response(slice).body };
    },
  };
}
const env = () => ({ MEDIA_R2_DELIVERY: "on", MEDIA_R2: mockR2([PRIMARY, PILOT]), MEDIA_R2_SIGNING_KEY: SIGNING });
const req = async (key, { method = "GET", headers = {}, exp = NOW + 21600 } = {}) => new Request(await signDeliveryUrl(SITE, key, exp, SIGNING), { method, headers });

// the registry as the RPC sees it, answered over a mock fetch exactly as PostgREST does (a bare JSON boolean)
function registry(initial = "stored") {
  const state = { value: initial, calls: 0, mode: "ok" };
  const fetchImpl = async (url, init) => {
    state.calls++;
    assert.equal(url, `${BASE}/rest/v1/rpc/media_r2_object_servable`);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.apikey, "publishable");
    const { candidate_r2_key } = JSON.parse(init.body);
    if (state.mode === "down") throw new TypeError("fetch failed");
    if (state.mode === "500") return new Response('{"message":"boom"}', { status: 500 });
    if (state.mode === "garbage") return new Response('"yes"', { status: 200 });
    if (state.mode === "hang") return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    return new Response(JSON.stringify(candidate_r2_key === PRIMARY && state.value === "stored"), { status: 200, headers: { "content-type": "application/json" } });
  };
  return Object.assign(state, { fetchImpl });
}
const checker = (reg, cache = new Map(), clock = { ms: NOW * 1000 }, timeoutMs = 2000) =>
  key => checkMediaObjectState(key, { supabaseUrl: BASE, publishableKey: "publishable", fetchImpl: reg.fetchImpl, cache, nowMs: clock.ms, timeoutMs });

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

test("the same valid lease: served while stored, then 404 for GET, HEAD and Range right after the logical delete although the R2 object still exists", async () => {
  const e = env(), reg = registry("stored"), opts = { nowSeconds: NOW, checkState: checker(reg, new Map()) };
  const get = await req(PRIMARY), head = await req(PRIMARY, { method: "HEAD" }), range = await req(PRIMARY, { headers: { range: "bytes=0-99" } });
  let r = await handleMediaDelivery(get.clone(), e, opts);
  assert.equal(r.status, 200); assert.equal((await r.arrayBuffer()).byteLength, 1000);
  assert.equal(r.headers.get("cache-control"), "private, max-age=21600", "the browser cache header is unchanged (F6-A)");
  r = await handleMediaDelivery(head.clone(), e, opts); assert.equal(r.status, 200); assert.equal(r.headers.get("content-length"), "1000");
  r = await handleMediaDelivery(range.clone(), e, opts); assert.equal(r.status, 206); assert.equal(r.headers.get("content-range"), "bytes 0-99/1000");
  // the delete commits: state 'deleting' (and later 'deleted' / 'missing' / a replacement) - the RPC answers false; a fresh cache = another isolate, or the TTL passed
  for (const s of ["deleting", "deleted", "missing", "failed", "pending"]) {
    reg.value = s;
    const o = { nowSeconds: NOW, checkState: checker(reg, new Map()) };
    for (const rq of [get, head, range]) {
      e.MEDIA_R2.calls.length = 0;
      r = await handleMediaDelivery(rq.clone(), e, o);
      assert.equal(r.status, 404, `${s} ${rq.method} ${rq.headers.get("range") ?? ""}`);
      assert.equal(await r.text(), "Not Found");
      assert.deepEqual(e.MEDIA_R2.calls, [], "R2 is never read for a revoked lease");
    }
  }
  assert.ok(e.MEDIA_R2.objects.has(PRIMARY), "revocation does not depend on the physical delete");
});

test("fail closed: a down, erroring, slow or odd check is a 503 no-store, never content; a throwing checkState and no checkState at all too", async () => {
  const e = env();
  for (const mode of ["down", "500", "garbage", "hang"]) {
    const reg = registry("stored"); reg.mode = mode;
    const started = Date.now();
    const r = await handleMediaDelivery(await req(PRIMARY), e, { nowSeconds: NOW, checkState: checker(reg, new Map(), undefined, 50) });
    assert.equal(r.status, 503, mode); assert.equal(r.headers.get("cache-control"), "no-store"); assert.equal(r.headers.get("retry-after"), "5");
    assert.equal(await r.text(), "Service Unavailable");
    assert.ok(Date.now() - started < 1500, `${mode}: bounded by the timeout`);
  }
  let r = await handleMediaDelivery(await req(PRIMARY), e, { nowSeconds: NOW, checkState: async () => { throw new Error("x"); } });
  assert.equal(r.status, 503);
  r = await handleMediaDelivery(await req(PRIMARY), e, { nowSeconds: NOW });
  assert.equal(r.status, 503, "no checker wired = nothing primary is served");
  // a failure is not cached: the next request asks again and serves once the database answers
  const reg = registry("stored"); reg.mode = "down"; const cache = new Map();
  assert.equal(await checker(reg, cache)(PRIMARY), "unknown"); assert.equal(cache.size, 0);
  reg.mode = "ok"; assert.equal(await checker(reg, cache)(PRIMARY), "stored"); assert.equal(reg.calls, 2);
});

test("cache: positive answers only, for MEDIA_STATE_CACHE_MS, bounded; a negative answer is never cached; the lease check still runs first", async () => {
  const reg = registry("stored"), cache = new Map(), clock = { ms: NOW * 1000 };
  const check = key => checkMediaObjectState(key, { supabaseUrl: BASE, publishableKey: "publishable", fetchImpl: reg.fetchImpl, cache, nowMs: clock.ms });
  assert.equal(await check(PRIMARY), "stored"); assert.equal(await check(PRIMARY), "stored"); assert.equal(reg.calls, 1, "one playback's Range requests ~ one check");
  reg.value = "deleting";
  clock.ms += MEDIA_STATE_CACHE_MS - 1; assert.equal(await check(PRIMARY), "stored", "the documented bound: at most MEDIA_STATE_CACHE_MS late");
  clock.ms += 1; assert.equal(await check(PRIMARY), "gone"); assert.equal(await check(PRIMARY), "gone"); assert.equal(reg.calls, 3, "negatives are not cached");
  assert.equal(cache.has(PRIMARY), false);
  // bounded: the oldest entry is dropped at 1000
  reg.value = "stored";
  const big = new Map(Array.from({ length: 1000 }, (_, i) => [`k${i}`, clock.ms + 1e9]));
  await checkMediaObjectState(PRIMARY, { supabaseUrl: BASE, publishableKey: "publishable", fetchImpl: reg.fetchImpl, cache: big, nowMs: clock.ms });
  assert.equal(big.size, 1000); assert.equal(big.has("k0"), false); assert.ok(big.has(PRIMARY));
  // an invalid or expired lease never reaches the check
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
