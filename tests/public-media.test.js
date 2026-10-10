// Visitor media access (Phase 1D, ISS-0009): the public-media lease function and the profile-banner delivery function, against a fake backend.
// Proves: server-chosen lifetimes, the accepted public predicates decide (service-only RPC), refusals are one body-less 404, malformed input never reaches the
// backend, rate limits answer 429, no service credential or Storage URL leaks, and the Banner is re-checked after the read (concurrent PRIVATE / replace).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handlePublicMedia, handleProfileBanner, bannerHandleFrom, LEASE_SECONDS, BANNER_MAX_BYTES, clientKey } from "../supabase/functions/_shared/public-media.js";

const BASE = "https://upvtrczefcvigxdyuylw.supabase.co", SITE = "https://gamid-testing-static.gamid.workers.dev";
const env = { supabaseUrl: BASE, serviceKey: "private-service-fixture" };
const UID = "11111111-1111-4111-8111-111111111111";
const INTRO = `${UID}/22222222-2222-4222-8222-222222222222/intro-d3.webm`, WALL = `${UID}/33333333-3333-4333-8333-333333333333.webm`, BANNER = `${UID}/banner/44444444-4444-4444-8444-444444444444.jpg`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

function backend({ allowed = true, limit = true, banner = [BANNER, BANNER], bytes = JPEG, signedPath = null, length = null } = {}) {
  const calls = [];
  const bannerAnswers = [...banner];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, ...options });
    if (url.includes("/rest/v1/rpc/")) {
      const name = url.split("/").at(-1), body = JSON.parse(options.body || "{}");
      if (name === "public_media_hit") return json(typeof limit === "function" ? limit(body) : limit);
      if (name === "public_media_lease_allowed") return json(allowed);
      if (name === "public_banner_object") return json(bannerAnswers.length ? bannerAnswers.shift() : null);
    }
    if (url.includes("/storage/v1/object/sign/")) { const p = url.split("/storage/v1/object/sign/")[1]; return json({ signedURL: `/object/sign/${signedPath ?? p}?token=server.issued.token` }); }
    if (url.includes("/storage/v1/object/authenticated/avatars/")) return new Response(bytes, { status: 200, headers: { "Content-Type": "image/jpeg", ...(length === null ? {} : { "Content-Length": String(length) }) } });
    throw new Error(`unexpected ${url}`);
  };
  return { fetchImpl, calls, rpc: name => calls.filter(c => c.url.endsWith(`/rpc/${name}`)), storage: () => calls.filter(c => c.url.includes("/storage/")) };
}
const lease = (b, body, headers = {}) => handlePublicMedia({ request: new Request(`${BASE}/functions/v1/public-media`, { method: "POST", headers: { origin: SITE, "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers }, body: JSON.stringify(body) }), env, fetchImpl: b.fetchImpl });
const banner = (b, handle = "gm_test_01", method = "GET") => handleProfileBanner({ request: new Request(`${BASE}/functions/v1/profile-banner/${handle}`, { method, headers: { "cf-connecting-ip": "203.0.113.7" } }), env, fetchImpl: b.fetchImpl });

test("public-media: the server chooses the lifetime (Intro 120 s, Wall video 6 h) and the accepted predicates decide; visitor-supplied lifetimes are ignored", async () => {
  for (const [bucket, path] of [["intro-media", INTRO], ["wall-video", WALL], ["wall-video-derived", `${UID}/33333333-3333-4333-8333-333333333333.h264.mp4`]]) {
    const b = backend();
    const r = await lease(b, { bucket, path, expiresIn: 31536000 });
    assert.equal(r.status, 200, bucket);
    const body = await r.json();
    assert.equal(body.expiresIn, LEASE_SECONDS[bucket]);
    assert.ok(body.signedURL.startsWith(`/object/sign/${bucket}/${path}?token=`));
    const sign = b.storage()[0];
    assert.equal(JSON.parse(sign.body).expiresIn, LEASE_SECONDS[bucket], "the server's lifetime, never the caller's");
    assert.deepEqual(JSON.parse(b.rpc("public_media_lease_allowed")[0].body), { candidate_bucket: bucket, candidate_path: path });
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), SITE);
    assert.doesNotMatch(JSON.stringify(body), /private-service-fixture/);
  }
  assert.deepEqual(LEASE_SECONDS, { "intro-media": 120, "wall-video": 21600, "wall-video-derived": 21600 });
});

test("public-media: not public -> one body-less 404 and nothing is signed; malformed input never reaches the backend", async () => {
  let b = backend({ allowed: false });
  let r = await lease(b, { bucket: "intro-media", path: INTRO });
  assert.equal(r.status, 404); assert.equal(await r.text(), ""); assert.equal(b.storage().length, 0);
  for (const body of [{ bucket: "avatars", path: `${UID}/avatar-x.webp` }, { bucket: "wall-media", path: `${UID}/x.png` }, { bucket: "intro-sources", path: `${UID}/j/source.mp4` }, { bucket: "intro-media", path: `${UID}/../x` }, { bucket: "intro-media", path: "x/y" }, { bucket: "intro-media" }, {}]) {
    b = backend();
    r = await lease(b, body);
    assert.equal(r.status, 404, JSON.stringify(body)); assert.equal(b.calls.length, 0, "no RPC, no Storage call");
  }
  b = backend({ signedPath: `intro-media/${UID}/other.webm` });
  r = await lease(b, { bucket: "intro-media", path: INTRO });
  assert.equal(r.status, 404, "a signed address for any other object is never handed out");
});

test("public-media: rate limited per hashed client key; CORS only for the GamID site; methods", async () => {
  const b = backend({ limit: false });
  const r = await lease(b, { bucket: "intro-media", path: INTRO });
  assert.equal(r.status, 429); assert.equal(r.headers.get("Retry-After"), "60"); assert.equal(b.rpc("public_media_lease_allowed").length, 0);
  const key = JSON.parse(b.rpc("public_media_hit")[0].body).candidate_key;
  assert.match(key, /^media:[0-9a-f]{32}$/); assert.doesNotMatch(key, /203\.0\.113\.7/, "never the address itself");
  assert.equal((await lease(backend(), { bucket: "intro-media", path: INTRO }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await handlePublicMedia({ request: new Request(`${BASE}/functions/v1/public-media`, { method: "GET" }), env, fetchImpl: backend().fetchImpl })).status, 405);
  assert.equal((await handlePublicMedia({ request: new Request(`${BASE}/functions/v1/public-media`, { method: "OPTIONS", headers: { origin: SITE } }), env })).status, 204);
  assert.equal((await handlePublicMedia({ request: new Request(`${BASE}/functions/v1/public-media`, { method: "POST", body: "{}" }), env: { supabaseUrl: BASE } })).status, 503);
  const k1 = await clientKey(new Request(BASE, { headers: { "cf-connecting-ip": "203.0.113.7" } }), env, new Date("2026-10-10T10:00:00Z"));
  const k2 = await clientKey(new Request(BASE, { headers: { "cf-connecting-ip": "203.0.113.7" } }), env, new Date("2026-10-11T10:00:00Z"));
  assert.notEqual(k1, k2, "the key rotates daily");
});

test("profile-banner: the attached Banner of a PUBLIC GamID as no-store JPEG bytes - no Storage URL, no credential", async () => {
  const b = backend();
  const r = await banner(b);
  assert.equal(r.status, 200);
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), JPEG);
  for (const [k, v] of Object.entries({ "Content-Type": "image/jpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "cross-origin", "Referrer-Policy": "no-referrer" })) assert.equal(r.headers.get(k), v, k);
  assert.match(r.headers.get("Content-Security-Policy"), /default-src 'none'/);
  assert.equal(r.headers.get("ETag"), null);
  assert.equal(b.storage().filter(c => c.url.includes("/object/sign/")).length, 0, "never signs");
  assert.equal(b.rpc("public_banner_object").length, 2, "decided before and after the read");
  assert.equal((await banner(backend(), "gm_test_01", "HEAD")).status, 200);
  assert.equal(await (await banner(backend(), "gm_test_01", "HEAD")).text(), "");
});

test("profile-banner: PRIVATE / DRAFT / detached / unknown, a change during the read, non-JPEG or oversized bytes, bad handles -> the same body-less 404", async () => {
  const cases = [
    ["not public / detached / unknown", backend({ banner: [null] })],
    ["made PRIVATE during the read", backend({ banner: [BANNER, null] })],
    ["replaced during the read", backend({ banner: [BANNER, `${UID}/banner/55555555-5555-4555-8555-555555555555.jpg`] })],
    ["not a JPEG", backend({ bytes: new TextEncoder().encode("<html>") })],
    ["declared oversized", backend({ length: BANNER_MAX_BYTES + 1 })],
    ["actually oversized", backend({ bytes: (() => { const x = new Uint8Array(BANNER_MAX_BYTES + 1); x[0] = 0xff; x[1] = 0xd8; return x; })() })],
    ["an Avatar path", backend({ banner: [`${UID}/avatar-x.webp`] })],
  ];
  for (const [label, b] of cases) { const r = await banner(b); assert.equal(r.status, 404, label); assert.equal(await r.text(), "", label); assert.equal(r.headers.get("Cache-Control"), "no-store"); }
  for (const handle of ["", "a", "UPPER%20x", "x%2F..%2Fy", "a".repeat(25), "<script>"]) { const b = backend(); assert.equal((await banner(b, handle)).status, 404, handle); assert.equal(b.calls.length, 0, `${handle}: no backend call`); }
  assert.equal(bannerHandleFrom(`${BASE}/functions/v1/profile-banner/GM_Test_01`), "gm_test_01");
  assert.equal((await handleProfileBanner({ request: new Request(`${BASE}/functions/v1/profile-banner/gm_test_01`, { method: "POST" }), env })).status, 405);
});

test("profile-banner: per-client and per-handle rate limits answer 429 before anything is read", async () => {
  for (const which of ["banner:", "handle:"]) {
    const b = backend({ limit: body => !body.candidate_key.startsWith(which) });
    const r = await banner(b);
    assert.equal(r.status, 429, which); assert.equal(b.rpc("public_banner_object").length, 0); assert.equal(b.storage().length, 0);
  }
});

test("Edge Function glue and the client: no visitor signs Storage objects any more; the page asks public-media", () => {
  const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.match(read("supabase/functions/public-media/index.ts"), /handlePublicMedia\(\{/);
  assert.match(read("supabase/functions/profile-banner/index.ts"), /handleProfileBanner\(\{/);
  assert.match(read("supabase/config.toml"), /\[functions\.public-media\]\nverify_jwt = false\n\[functions\.profile-banner\]\nverify_jwt = false/);
  const client = read("dist/account/supabase-client.js");
  const visitor = client.slice(client.indexOf("async function publicMediaLease("), client.indexOf("export async function signIntroMedia("));
  assert.match(visitor, /\/functions\/v1\/public-media/);
  assert.doesNotMatch(visitor, /\/storage\/v1\/object\/sign|expiresIn|access_token|Authorization/, "visitors never call the Storage signer nor choose a lifetime");
});
