// Media delivery Architecture F - TESTING pilot (DEC-0013): the Worker's signed R2 delivery + ingest (mock R2), public-media's pilot branch, the client's lease
// acceptance, the worker Job's replication against the real ingest handler, and static checks of the migration, wrangler.jsonc and the dispatcher.
// Proves: inert by default (no behavior change, no extra call), signatures cannot be forged / reused late / moved to another key, Range/HEAD/416 semantics equal
// the Supabase passthrough's, replicas are verified by size + SHA-256 before READY, the pilot is GM-TEST-01 only, and replicas never touch the quota.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import worker, { handleIntroRequest } from "../cf-worker/worker.mjs";
import { handleMediaDelivery, handleMediaIngest, isMediaKey, r2Range, signDeliveryUrl, verifyDelivery, MEDIA_LEASE_MAX_SECONDS } from "../cf-worker/media-r2.mjs";
import { handlePublicMedia, signMediaR2Url, readPublicMediaEnv } from "../supabase/functions/_shared/public-media.js";
import { createIntroSourceResolver } from "../dist/account/intro-source.js";
import { processOneMediaR2Replica, readMediaR2Ingest, ingestSignature } from "../worker/media-r2-replica.mjs";
import { validateWebhookPayload } from "../worker/intro-dispatcher.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SITE = "https://gamid-testing-static.gamid.workers.dev", BASE = "https://upvtrczefcvigxdyuylw.supabase.co";
const SIGNING = "signing-fixture-0123456789abcdef0123456789abcdef", INGEST = "ingest-fixture-0123456789abcdef0123456789abcdef";
const UID = "11111111-1111-4111-8111-111111111111", JOB = "22222222-2222-4222-8222-222222222222", TOKEN = "33333333-3333-4333-8333-333333333333";
const INTRO = `${UID}/${JOB}/intro-d3.webm`, KEY = `intro-media/${INTRO}/${TOKEN}`;
const SHARE_KEY = `intro-share-copies/${UID}/${JOB}/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555.webm/${TOKEN}`;
const NOW = 1_800_000_000;
const BYTES = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 251));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

// a minimal R2 binding with the semantics the Worker relies on (a range past the object throws, as R2 does; put verifies sha256)
function mockR2(initial = { [KEY]: BYTES }) {
  const objects = new Map(Object.entries(initial)), calls = [];
  const meta = (key, bytes) => ({ key, size: bytes.byteLength, httpEtag: `"${sha(bytes).slice(0, 16)}"`, httpMetadata: { contentType: "video/webm" }, uploaded: new Date(NOW * 1000) });
  return {
    objects, calls,
    async head(key) { calls.push(["head", key]); const b = objects.get(key); return b ? meta(key, b) : null; },
    async get(key, options) {
      calls.push(["get", key, options?.range]);
      const b = objects.get(key); if (!b) return null;
      let slice = b; const r = options?.range;
      if (r) {
        if (r.suffix !== undefined) slice = b.slice(Math.max(b.byteLength - r.suffix, 0));
        else { if (r.offset >= b.byteLength || (r.length !== undefined && r.offset + r.length > b.byteLength)) throw new Error("InvalidRange"); slice = b.slice(r.offset, r.length !== undefined ? r.offset + r.length : undefined); }
      }
      return { ...meta(key, b), range: r, body: new Response(slice).body };
    },
    async put(key, body, options) {
      calls.push(["put", key]);
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      if (options?.sha256 && options.sha256 !== sha(bytes)) throw new Error("BadDigest");
      objects.set(key, bytes);
      return { ...meta(key, bytes), checksums: { sha256: createHash("sha256").update(bytes).digest().buffer.slice(0) } };
    },
    async delete(key) { calls.push(["delete", key]); objects.delete(key); },
  };
}
const workerEnv = (overrides = {}) => ({ MEDIA_R2_DELIVERY: "on", MEDIA_R2: mockR2(), MEDIA_R2_SIGNING_KEY: SIGNING, MEDIA_R2_INGEST_KEY: INGEST,
  ASSETS: { fetch: async () => new Response("asset", { status: 200 }) }, ...overrides });
const deliveryRequest = async (key = KEY, { exp = NOW + 120, headers = {}, method = "GET", secret = SIGNING } = {}) =>
  new Request(await signDeliveryUrl(SITE, key, exp, secret), { method, headers });

// --------------------------------------------------------------------------------------------- signatures
test("delivery signature: public-media and the Worker sign identically; tampering, expiry, a far-future exp and another key are all refused", async () => {
  assert.equal(await signMediaR2Url(SITE, KEY, NOW + 120, SIGNING), await signDeliveryUrl(SITE, KEY, NOW + 120, SIGNING));
  const url = new URL(await signDeliveryUrl(SITE, KEY, NOW + 120, SIGNING));
  const sig = url.searchParams.get("sig");
  assert.equal(await verifyDelivery(KEY, String(NOW + 120), sig, SIGNING, NOW), true);
  assert.equal(await verifyDelivery(KEY, String(NOW + 121), sig, SIGNING, NOW), false, "exp is signed");
  assert.equal(await verifyDelivery(SHARE_KEY, String(NOW + 120), sig, SIGNING, NOW), false, "the key is signed");
  assert.equal(await verifyDelivery(KEY, String(NOW + 120), sig, "another-secret", NOW), false);
  assert.equal(await verifyDelivery(KEY, String(NOW + 120), sig.replace(/^./, c => (c === "0" ? "1" : "0")), SIGNING, NOW), false);
  assert.equal(await verifyDelivery(KEY, String(NOW + 120), sig, SIGNING, NOW + 120), false, "expired at exp");
  const far = new URL(await signDeliveryUrl(SITE, KEY, NOW + MEDIA_LEASE_MAX_SECONDS + 1, SIGNING)).searchParams.get("sig");
  assert.equal(await verifyDelivery(KEY, String(NOW + MEDIA_LEASE_MAX_SECONDS + 1), far, SIGNING, NOW), false, "never honoured further ahead than the longest lease");
  assert.equal(await verifyDelivery(KEY, String(NOW + 120), sig, "", NOW), false, "no secret = nothing verifies");
});

test("R2 keys: only <intro-media|intro-share-copies>/<source path>/<attempt uuid>; traversal and other buckets are refused", () => {
  assert.ok(isMediaKey(KEY)); assert.ok(isMediaKey(SHARE_KEY));
  for (const bad of [`avatars/${INTRO}/${TOKEN}`, `intro-media/${INTRO}`, `intro-media/../${INTRO}/${TOKEN}`, `intro-media/${UID}/../x/${TOKEN}`, `intro-media//${TOKEN}`, "", null, `intro-media/${INTRO}/${TOKEN}/x`])
    assert.equal(isMediaKey(bad), false, String(bad));
  assert.deepEqual(r2Range("bytes=0-99"), { offset: 0, length: 100 });
  assert.deepEqual(r2Range("bytes=500-"), { offset: 500 });
  assert.deepEqual(r2Range("bytes=-200"), { suffix: 200 });
  assert.equal(r2Range(null), undefined);
});

// --------------------------------------------------------------------------------------------- delivery
test("delivery: 200 whole, 206 one range (incl. suffix and an end past the object), 416 with bytes */size, HEAD headers only; cached privately for the lease's remainder", async () => {
  const env = workerEnv();
  const opts = { nowSeconds: NOW };
  let r = await handleMediaDelivery(await deliveryRequest(), env, opts);
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-length"), "1000"); assert.equal(r.headers.get("accept-ranges"), "bytes");
  assert.equal(r.headers.get("content-type"), "video/webm"); assert.equal(r.headers.get("cache-control"), "private, max-age=120");
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), BYTES);
  r = await handleMediaDelivery(await deliveryRequest(KEY, { headers: { range: "bytes=10-19" } }), env, opts);
  assert.equal(r.status, 206); assert.equal(r.headers.get("content-range"), "bytes 10-19/1000"); assert.equal(r.headers.get("content-length"), "10");
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), BYTES.slice(10, 20));
  r = await handleMediaDelivery(await deliveryRequest(KEY, { headers: { range: "bytes=-100" } }), env, opts);
  assert.equal(r.status, 206); assert.equal(r.headers.get("content-range"), "bytes 900-999/1000");
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), BYTES.slice(900));
  r = await handleMediaDelivery(await deliveryRequest(KEY, { headers: { range: "bytes=990-5000" } }), env, opts);
  assert.equal(r.status, 206); assert.equal(r.headers.get("content-range"), "bytes 990-999/1000", "an end past the object is clamped, as an HTTP server does");
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), BYTES.slice(990));
  r = await handleMediaDelivery(await deliveryRequest(KEY, { headers: { range: "bytes=1000-" } }), env, opts);
  assert.equal(r.status, 416); assert.equal(r.headers.get("content-range"), "bytes */1000");
  const before = env.MEDIA_R2.calls.length;
  r = await handleMediaDelivery(await deliveryRequest(KEY, { method: "HEAD" }), env, opts);
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-length"), "1000"); assert.equal(r.body, null);
  assert.deepEqual(env.MEDIA_R2.calls.slice(before).map(c => c[0]), ["head"], "HEAD reads no body");
  r = await handleMediaDelivery(await deliveryRequest(KEY), env, { nowSeconds: NOW + 100 });
  assert.equal(r.headers.get("cache-control"), "private, max-age=20");
});

test("delivery: refused (one 404, R2 never read) when off, unconfigured, unsigned, expired or forged; 429 past the rate limit; a missing object is 404", async () => {
  const opts = { nowSeconds: NOW };
  for (const env of [workerEnv({ MEDIA_R2_DELIVERY: "off" }), workerEnv({ MEDIA_R2_DELIVERY: undefined }), workerEnv({ MEDIA_R2_SIGNING_KEY: undefined }), workerEnv({ MEDIA_R2: undefined })]) {
    const r = await handleMediaDelivery(await deliveryRequest(), env, opts);
    assert.equal(r.status, 404); assert.equal(env.MEDIA_R2?.calls.length ?? 0, 0);
  }
  const env = workerEnv();
  for (const request of [new Request(`${SITE}/media/v1/${KEY}`), await deliveryRequest(KEY, { exp: NOW - 1 }), await deliveryRequest(KEY, { secret: "forged" }),
    new Request((await signDeliveryUrl(SITE, KEY, NOW + 120, SIGNING)).replace(TOKEN, "66666666-6666-4666-8666-666666666666"))]) {
    assert.equal((await handleMediaDelivery(request, env, opts)).status, 404);
  }
  assert.equal(env.MEDIA_R2.calls.length, 0);
  assert.equal((await handleMediaDelivery(await deliveryRequest(), env, { ...opts, withinLimit: async () => false })).status, 429);
  const missing = `intro-media/${INTRO}/77777777-7777-4777-8777-777777777777`;
  assert.equal((await handleMediaDelivery(await deliveryRequest(missing), env, opts)).status, 404);
});

test("Worker routing: /media/v1 is GET/HEAD only with the single-range rule; with the pilot unconfigured every /media path is a 404 and assets are untouched", async () => {
  const env = workerEnv({ MEDIA_R2_DELIVERY: "off" });
  let assets = 0; env.ASSETS = { fetch: async () => { assets += 1; return new Response("asset"); } };
  assert.equal((await worker.fetch(new Request(`${SITE}/media/v1/${KEY}?exp=1&sig=x`), env)).status, 404);
  assert.equal((await worker.fetch(new Request(`${SITE}/media/v1/${KEY}`, { method: "POST" }), env)).status, 405);
  assert.equal((await worker.fetch(new Request(`${SITE}/media/v1/${KEY}`, { headers: { range: "bytes=0-1,5-6" } }), env)).status, 416);
  assert.equal((await worker.fetch(new Request(`${SITE}/media/v1-ingest/${KEY}`, { method: "PUT", body: "x" }), { ...env, MEDIA_R2_INGEST_KEY: undefined })).status, 404);
  assert.equal(assets, 0, "no /media request ever falls through to static assets");
  assert.equal((await worker.fetch(new Request(`${SITE}/account/`), env)).status, 200); assert.equal(assets, 1);
  const wrangler = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));
  assert.deepEqual(wrangler.assets.run_worker_first, ["/@*", "/media/*"]);
  assert.deepEqual(wrangler.r2_buckets, [{ binding: "MEDIA_R2", bucket_name: "gamid-media-testing" }]);
  assert.equal(wrangler.vars.MEDIA_R2_DELIVERY, "off", "delivery ships OFF");
  assert.doesNotMatch(read("wrangler.jsonc"), /SIGNING_KEY"\s*:|INGEST_KEY"\s*:/, "keys are Worker secrets, never config");
});

// --------------------------------------------------------------------------------------------- ingest
const ingestRequest = (method, key, { body = BYTES, digest = sha(BYTES), exp = NOW, secret = INGEST, length } = {}) => {
  const bytes = method === "PUT" ? String(length ?? body.byteLength) : "";
  const headers = { "x-gamid-ingest-exp": String(exp), "x-gamid-ingest-sig": ingestSignature(secret, method, key, String(exp), method === "PUT" ? digest : "", bytes) };
  if (method === "PUT") Object.assign(headers, { "x-gamid-sha256": digest, "content-length": bytes });
  return new Request(`${SITE}/media/v1-ingest/${key}`, { method, headers, body: method === "PUT" ? body : undefined, duplex: "half" });
};

test("ingest: a signed PUT stores the object only when R2 confirms the SHA-256; forged, stale, oversized or wrong-digest writes are refused; DELETE is signed too", async () => {
  const env = workerEnv({ MEDIA_R2: mockR2({}) });
  const opts = { nowSeconds: NOW };
  let r = await handleMediaIngest(ingestRequest("PUT", KEY), env, opts);
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { size: 1000, sha256: sha(BYTES) });
  assert.deepEqual(env.MEDIA_R2.objects.get(KEY), BYTES);
  assert.equal((await handleMediaIngest(ingestRequest("PUT", SHARE_KEY, { secret: "forged" }), env, opts)).status, 401);
  assert.equal((await handleMediaIngest(ingestRequest("PUT", SHARE_KEY, { exp: NOW - 301 }), env, opts)).status, 401, "a captured request expires in 5 minutes");
  assert.equal((await handleMediaIngest(ingestRequest("PUT", `avatars/${INTRO}/${TOKEN}`), env, opts)).status, 401, "pilot keys only");
  r = await handleMediaIngest(ingestRequest("PUT", SHARE_KEY, { digest: sha(new Uint8Array([1])) }), env, opts);
  assert.equal(r.status, 502, "R2 refused the body: its digest is not the signed one"); assert.equal(env.MEDIA_R2.objects.has(SHARE_KEY), false);
  const big = new Uint8Array(15728641);
  assert.equal((await handleMediaIngest(ingestRequest("PUT", SHARE_KEY, { body: big, digest: sha(big) }), env, opts)).status, 400);
  // a valid signature cannot be moved to another key or method
  const moved = ingestRequest("PUT", KEY); const forgedUrl = new Request(`${SITE}/media/v1-ingest/${SHARE_KEY}`, { method: "PUT", headers: moved.headers, body: BYTES, duplex: "half" });
  assert.equal((await handleMediaIngest(forgedUrl, env, opts)).status, 401);
  assert.equal((await handleMediaIngest(new Request(`${SITE}/media/v1-ingest/${KEY}`, { method: "DELETE", headers: { "x-gamid-ingest-exp": String(NOW), "x-gamid-ingest-sig": "0".repeat(64) } }), env, opts)).status, 401);
  r = await handleMediaIngest(ingestRequest("DELETE", KEY), env, opts);
  assert.equal(r.status, 200); assert.equal(env.MEDIA_R2.objects.has(KEY), false);
  assert.equal((await handleMediaIngest(new Request(`${SITE}/media/v1-ingest/${KEY}`), env, opts)).status, 405);
});

// --------------------------------------------------------------------------------------------- the worker Job
function supabaseFixture({ claim = [{ replica_id: "r1", claim_token: TOKEN, source_bucket: "intro-media", source_path: INTRO, source_bytes: 1000, r2_key: KEY }], source = BYTES, sweep = [] } = {}) {
  const rpcs = [];
  const fetchImpl = async (url, options = {}) => {
    if (url.startsWith(`${BASE}/rest/v1/rpc/`)) {
      const name = url.split("/").at(-1); rpcs.push([name, JSON.parse(options.body || "{}")]);
      if (name === "worker_claim_media_r2_replica") return json(claim);
      if (name === "worker_media_r2_sweep") return json(sweep);
      return json(null);
    }
    if (url.startsWith(`${BASE}/storage/v1/object/authenticated/intro-media/`)) return new Response(source, { status: 200, headers: { "content-length": String(source.byteLength) } });
    if (url.startsWith(`${SITE}/media/v1-ingest/`)) return handleMediaIngest(new Request(url, { ...options, duplex: "half" }), r2env);
    throw new Error(`unexpected ${url}`);
  };
  const r2env = workerEnv({ MEDIA_R2: mockR2({}) });
  return { fetchImpl, rpcs, r2: r2env.MEDIA_R2, backend: { url: BASE, headers: () => ({ apikey: "service-fixture" }) } };
}
const ingestConfig = { url: SITE, key: INGEST };

test("replication: source -> SHA-256 -> signed PUT through the real ingest handler -> READY with the verified size and digest", async () => {
  const f = supabaseFixture();
  const result = await processOneMediaR2Replica(f.backend, { fetchImpl: f.fetchImpl, ingestConfig });
  assert.deepEqual(result, { processed: true, replicaId: "r1", state: "ready", bytes: 1000 });
  assert.deepEqual(f.r2.objects.get(KEY), BYTES);
  const complete = f.rpcs.find(([n]) => n === "worker_complete_media_r2_replica")[1];
  assert.deepEqual(complete, { candidate_replica_id: "r1", candidate_claim_token: TOKEN, candidate_r2_key: KEY, candidate_bytes: 1000, candidate_sha256: sha(BYTES) });
});

test("replication: a source whose size changed fails (never READY, nothing stored); unconfigured = nothing claimed; the sweep deletes listed keys and confirms", async () => {
  let f = supabaseFixture({ source: BYTES.slice(0, 999) });
  let result = await processOneMediaR2Replica(f.backend, { fetchImpl: f.fetchImpl, ingestConfig });
  assert.equal(result.state, "failed"); assert.equal(result.code, "MEDIA_R2_SOURCE_CHANGED");
  assert.equal(f.rpcs.some(([n]) => n === "worker_complete_media_r2_replica"), false); assert.equal(f.r2.objects.size, 0);
  assert.deepEqual(f.rpcs.find(([n]) => n === "worker_fail_media_r2_replica")[1], { candidate_replica_id: "r1", candidate_claim_token: TOKEN, candidate_code: "MEDIA_R2_SOURCE_CHANGED" });
  f = supabaseFixture();
  assert.deepEqual(await processOneMediaR2Replica(f.backend, { fetchImpl: f.fetchImpl, ingestConfig: null }), { processed: false, skipped: "MEDIA_R2_NOT_CONFIGURED" });
  assert.equal(f.rpcs.length, 0, "no RPC at all without the pilot env");
  assert.equal(readMediaR2Ingest({}), null);
  assert.equal(readMediaR2Ingest({ GAMID_MEDIA_R2_INGEST_URL: "https://example.com", GAMID_MEDIA_R2_INGEST_KEY: INGEST }), null, "the TESTING Worker only");
  assert.deepEqual(readMediaR2Ingest({ GAMID_MEDIA_R2_INGEST_URL: SITE, GAMID_MEDIA_R2_INGEST_KEY: INGEST }), { url: SITE, key: INGEST });
  await assert.rejects(processOneMediaR2Replica({ url: "https://other.supabase.co", headers: () => ({}) }, { fetchImpl: f.fetchImpl, ingestConfig }), /TESTING_ONLY/);
  f = supabaseFixture({ claim: [], sweep: [{ replica_id: "r0", r2_key: SHARE_KEY }] });
  f.r2.objects.set(SHARE_KEY, BYTES);
  assert.deepEqual(await processOneMediaR2Replica(f.backend, { fetchImpl: f.fetchImpl, ingestConfig }), { processed: false });
  assert.equal(f.r2.objects.has(SHARE_KEY), false);
  assert.deepEqual(f.rpcs.find(([n]) => n === "worker_confirm_media_r2_deleted")[1], { candidate_replica_id: "r0", candidate_r2_key: SHARE_KEY });
  assert.equal(validateWebhookPayload({ type: "INSERT", schema: "public", table: "media_r2_replicas", record: { job_id: "r1", state: "pending" } }), true);
  assert.match(read("worker/Dockerfile"), /COPY worker\/media-r2-replica\.mjs \.\/media-r2-replica\.mjs/);
  assert.match(read("worker/cloud-run/usage-testing.gcloudignore"), /^!worker\/media-r2-replica\.mjs$/m);
});

// --------------------------------------------------------------------------------------------- public-media
function mediaBackend(delivery) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push(url);
    const name = url.split("/").at(-1);
    if (url.includes("/rest/v1/rpc/")) {
      if (name === "public_media_hit") return json(true);
      if (name === "public_media_lease_allowed") return json(true);
      if (name === "public_media_delivery") return delivery instanceof Error ? json({ message: "x" }, 500) : json(delivery);
    }
    if (url.includes("/storage/v1/object/sign/")) return json({ signedURL: `/object/sign/${url.split("/storage/v1/object/sign/")[1]}?token=t` });
    throw new Error(`unexpected ${url}`);
  };
  return { fetchImpl, calls, delivery: () => calls.filter(u => u.endsWith("/rpc/public_media_delivery")).length };
}
const leaseFor = (b, env, bucket = "intro-media", path = INTRO) => handlePublicMedia({ request: new Request(`${BASE}/functions/v1/public-media`, { method: "POST",
  headers: { origin: SITE, "Content-Type": "application/json" }, body: JSON.stringify({ bucket, path }) }), env, fetchImpl: b.fetchImpl });

test("public-media: without MEDIA_R2_SIGNING_KEY the lease is exactly today's (no delivery call); with it: r2 -> signed Worker URL, unavailable -> 404, else unchanged", async () => {
  const base = { supabaseUrl: BASE, serviceKey: "service-fixture" };
  let b = mediaBackend([{ mode: "r2", r2_key: KEY, bytes: 1000 }]);
  let r = await leaseFor(b, { ...base, mediaR2SigningKey: "" });
  assert.ok((await r.json()).signedURL.startsWith("/object/sign/intro-media/")); assert.equal(b.delivery(), 0);
  b = mediaBackend([{ mode: "r2", r2_key: KEY, bytes: 1000 }]);
  r = await leaseFor(b, { ...base, mediaR2SigningKey: SIGNING });
  const body = await r.json();
  assert.equal(body.expiresIn, 120); assert.equal(body.signedURL, undefined);
  const url = new URL(body.url);
  assert.equal(url.origin, SITE); assert.equal(url.pathname, `/media/v1/${KEY}`);
  const exp = Number(url.searchParams.get("exp")); const now = Math.floor(Date.now() / 1000);
  assert.ok(exp > now + 110 && exp <= now + 121, "the same 120 s Intro lease");
  assert.equal(await verifyDelivery(KEY, String(exp), url.searchParams.get("sig"), SIGNING, now), true, "the Worker accepts what public-media signs");
  assert.equal(b.calls.some(u => u.includes("/storage/v1/object/sign/")), false, "no Supabase lease for a replica");
  for (const mode of ["unavailable", "none"]) {
    b = mediaBackend([{ mode, r2_key: null, bytes: null }]);
    r = await leaseFor(b, { ...base, mediaR2SigningKey: SIGNING });
    assert.equal(r.status, 404); assert.equal(b.calls.some(u => u.includes("/storage/")), false);
  }
  for (const delivery of [[{ mode: "supabase" }], new Error("rpc"), [{ mode: "r2", r2_key: `avatars/${INTRO}/${TOKEN}` }], []]) {
    b = mediaBackend(delivery);
    r = await leaseFor(b, { ...base, mediaR2SigningKey: SIGNING });
    assert.ok((await r.json()).signedURL.startsWith("/object/sign/intro-media/"), "unchanged Supabase lease");
  }
  b = mediaBackend([{ mode: "r2", r2_key: KEY }]);
  r = await leaseFor(b, { ...base, mediaR2SigningKey: SIGNING }, "wall-video", `${UID}/33333333-3333-4333-8333-333333333333.webm`);
  assert.equal(r.status, 200); assert.equal(b.delivery(), 0, "Wall video is outside the pilot");
  assert.deepEqual(readPublicMediaEnv(name => ({ SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: "k" })[name]), { supabaseUrl: BASE, serviceKey: "k", mediaR2SigningKey: "" });
});

// --------------------------------------------------------------------------------------------- client
test("client: the Intro resolver accepts the signed Worker URL of THIS Intro only (same 120 s cap); anything else is refused as before", async () => {
  const now = () => NOW * 1000;
  const make = url => createIntroSourceResolver({ baseUrl: BASE, current: async () => ({ key: "gm_test_01", path: INTRO }), sign: async () => url, now });
  const good = await signDeliveryUrl(SITE, KEY, NOW + 120, SIGNING);
  const ok = await make(good).resolve();
  assert.equal(ok.url, good); assert.equal(ok.expiresAt, (NOW + 120) * 1000);
  const capped = await make(await signDeliveryUrl(SITE, KEY, NOW + 3600, SIGNING)).resolve();
  assert.equal(capped.expiresAt, (NOW + 120) * 1000, "never trusted past 120 s");
  for (const bad of [await signDeliveryUrl("https://evil.example", KEY, NOW + 120, SIGNING), await signDeliveryUrl(SITE, SHARE_KEY, NOW + 120, SIGNING),
    await signDeliveryUrl(SITE, `intro-media/${UID}/${JOB}/other.webm/${TOKEN}`, NOW + 120, SIGNING), good.replace(/sig=[0-9a-f]+/, "sig=zz"), good.replace(/exp=\d+/, "exp=x"),
    await signDeliveryUrl(SITE, KEY, NOW + 30, SIGNING)]) {
    assert.equal(await make(bad).resolve(), null, bad);
  }
  assert.match(read("dist/account/supabase-client.js"), /bucket === "intro-media" && typeof lease\?\.url === "string" && lease\.url\.startsWith\(`\$\{MEDIA_R2_LEASE_ORIGIN\}\/media\/v1\/\$\{bucket\}\/`\)/);
});

// --------------------------------------------------------------------------------------------- crawler routes
test("crawler routes: with delivery off no extra call is made; on: r2 -> served from R2 (public, max-age=60), unavailable -> 404, supabase / failure -> the passthrough", async () => {
  const check = { valid: true, handle: "gm_test_01" }, identity = { intro_derivative_path: INTRO };
  const original = globalThis.fetch;
  let passthrough = 0;
  globalThis.fetch = async url => { if (String(url).includes("/storage/v1/object/authenticated/")) { passthrough += 1; return new Response(BYTES, { status: 200, headers: { "content-type": "video/webm" } }); } throw new Error(`unexpected ${url}`); };
  try {
    const rpcs = [];
    const rpc = answer => async (url, options) => { rpcs.push(JSON.parse(options.body)); return answer instanceof Error ? json({}, 500) : json(answer); };
    let r = await handleIntroRequest(new Request(`${SITE}/@gm_test_01/intro.webm`), check, identity, null, workerEnv({ MEDIA_R2_DELIVERY: "off" }), rpc([]));
    assert.equal(r.status, 200); assert.equal(rpcs.length, 0); assert.equal(passthrough, 1);
    const env = workerEnv();
    r = await handleIntroRequest(new Request(`${SITE}/@gm_test_01/intro.webm`, { headers: { range: "bytes=0-9" } }), check, identity, null, env, rpc([{ mode: "r2", r2_key: KEY, bytes: 1000 }]));
    assert.equal(r.status, 206); assert.equal(r.headers.get("cache-control"), "public, max-age=60"); assert.equal(r.headers.get("content-range"), "bytes 0-9/1000");
    assert.deepEqual(rpcs.at(-1), { candidate_bucket: "intro-media", candidate_path: INTRO }); assert.equal(passthrough, 1);
    const share = { path: SHARE_KEY.slice("intro-share-copies/".length, -(TOKEN.length + 1)) };
    r = await handleIntroRequest(new Request(`${SITE}/@gm_test_01/intro-discord.webm`), check, null, share, env, rpc([{ mode: "unavailable" }]));
    assert.equal(r.status, 404); assert.deepEqual(rpcs.at(-1), { candidate_bucket: "intro-share-copies", candidate_path: share.path }); assert.equal(passthrough, 1);
    for (const answer of [[{ mode: "supabase" }], new Error("down"), [{ mode: "r2", r2_key: "avatars/x" }]]) {
      r = await handleIntroRequest(new Request(`${SITE}/@gm_test_01/intro.webm`), check, identity, null, env, rpc(answer));
      assert.equal(r.status, 200);
    }
    assert.equal(passthrough, 4);
  } finally { globalThis.fetch = original; }
});

// --------------------------------------------------------------------------------------------- migration (static)
test("migration: inert by default, GM-TEST-01 only, bounded, service-only worker RPCs, and replicas never enter the 200 MB quota", () => {
  const sql = read("supabase/migrations/20261029100000_media_r2_pilot.sql");
  assert.match(sql, /replication_enabled boolean not null default false/); assert.match(sql, /delivery_enabled boolean not null default false/);
  assert.match(sql, /values \(false, false, 104857600, 1073741824, 50,/, "both switches OFF; 100 MiB/day + 1 GiB/month fallback; 50 copies/day");
  assert.match(sql, /where e\.gamid_handle = 'gm_test_01' and e\.entity_type = 'SOLO';\s+get diagnostics added = row_count;\s+if added <> 1 then raise exception 'MEDIA_R2_PILOT_FIXTURE_NOT_FOUND'/);
  assert.doesNotMatch(sql, /\b(black|zshot)\b/);
  assert.match(sql, /source_bucket in \('intro-media', 'intro-share-copies'\)/);
  assert.match(sql, /r\.attempts < 2/); assert.match(sql, /for update skip locked/);
  assert.match(sql, /replica_bytes = source_bytes and replica_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/, "READY requires the verified size and digest");
  assert.match(sql, /MEDIA_R2_SIZE_MISMATCH/); assert.match(sql, /MEDIA_R2_SUPERSEDED/);
  assert.match(sql, /'unavailable'::text/); assert.match(sql, /pg_advisory_xact_lock\(hashtext\('media_r2_fallback_budget'\)\)/);
  assert.match(sql, /private\.intro_media_is_public\(candidate_path\) else private\.intro_share_is_public\(candidate_path\)/, "the accepted public predicates decide first");
  // the quota: no quota function is touched, and no replica is a storage.objects row
  const code = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /usage_stored_bytes|get_my_usage|insert into storage\.objects|storage\.buckets/);
  assert.doesNotMatch(sql, /100 ?MB|104857600 *-- *storage/i);
  // privileges: worker RPCs are service_role only; anon gets the delivery decision alone
  const anonGrant = /grant execute on function ([^;]+) to anon, authenticated;/.exec(sql)[1];
  assert.doesNotMatch(anonGrant, /worker_/);
  assert.match(sql, /revoke all on table public\.media_r2_replicas from public, anon, authenticated;/);
  assert.equal((code.match(/security definer/g) || []).length, (code.match(/security definer\nset search_path = '';?\n/g) || []).length, "every definer pins search_path");
  const rollback = read("worker/cloud-run/media-r2-rollback.sql");
  assert.match(rollback, /^update private\.media_r2_settings set delivery_enabled = false, replication_enabled = false/m, "the immediate rollback is one live statement");
});
