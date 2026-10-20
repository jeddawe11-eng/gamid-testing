// F6-A (Mazen's authorization 2026-10-21): published-Wall video URLs are reused across the tabs of one browser - without extending any lease, without becoming an
// authorization decision, and scoped to the Wall, publication and asset of the CURRENT manifest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublishedVideoUrlCache, forgetPublishedWallVideos, PUBLISHED_VIDEO_URL_CACHE_KEY } from "../dist/public/published-video-url-cache.js";
import { preparePublicWall } from "../dist/public/public-wall.js";
import { createDocument } from "../dist/wall/schema.js";

const baseUrl = "https://project.supabase.co";
const hour = 3600000;
const urlFor = (path, exp, bucket = "wall-video") => `${baseUrl}/storage/v1/object/sign/${bucket}/${path}?token=e30.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// one browser: a shared localStorage (all tabs) and, per tab, a sessionStorage
function browser() {
  let time = 1800000000000, calls = 0;
  const shared = new Map();
  const local = () => ({ getItem: k => shared.get(k) ?? null, setItem: (k, v) => shared.set(k, String(v)), removeItem: k => shared.delete(k) });
  const tab = () => createPublishedVideoUrlCache({ baseUrl, now: () => time, storage: local, legacyStorage: () => null });
  const scope = (handle = "black", publishedAt = "2026-10-20T10:00:00Z", assetId = "a1") => ({ handle, publishedAt, assetId });
  const get = (cache, { path = "u/a.mp4", bucket = "wall-video", sc = scope(), life = 6 * hour } = {}) => cache.get({ bucket, path, scope: sc, sign: async () => { calls++; return urlFor(path, (time + life) / 1000, bucket); } });
  return { tab, get, scope, shared, local, now: () => time, advance: n => { time += n; }, calls: () => calls };
}
const stored = b => JSON.parse(b.shared.get(PUBLISHED_VIDEO_URL_CACHE_KEY) ?? "[]");

test("F6-A a new tab of the same browser reuses the URL another tab signed (no second lease); browser restart too, until the 30-minute margin", async () => {
  const b = browser();
  const first = await b.get(b.tab());
  assert.equal(await b.get(b.tab()), first, "new tab");
  assert.equal(b.calls(), 1);
  b.advance(5 * hour);                                     // browser closed and reopened 5 h later: still before issue + 6 h - 30 min
  assert.equal(await b.get(b.tab()), first);
  assert.equal(b.calls(), 1);
  b.advance(0.6 * hour);                                   // inside the last 30 minutes: never reused, signed again
  const second = await b.get(b.tab());
  assert.notEqual(second, first);
  assert.equal(b.calls(), 2);
});

test("F6-A the lease is never extended: the token's own expiry wins, expired entries are dropped from storage", async () => {
  const b = browser();
  await b.get(b.tab(), { life: hour });                    // a server lease shorter than 6 h
  b.advance(0.6 * hour);
  await b.get(b.tab(), { life: hour });                    // 36 min of 60 used: inside the margin -> re-sign
  assert.equal(b.calls(), 2);
  b.advance(2 * hour);
  b.tab();                                                 // any tab prunes on open
  assert.equal(stored(b).length, 0, "nothing expired stays in the browser");
});

test("F6-A scope: another Wall, another publication, another asset or another object never shares a URL", async () => {
  const b = browser(), tab = b.tab();
  const urls = await Promise.all([
    b.get(tab),
    b.get(tab, { sc: b.scope("zshot") }),
    b.get(tab, { sc: b.scope("black", "2026-10-21T08:00:00Z") }),
    b.get(tab, { sc: b.scope("black", "2026-10-20T10:00:00Z", "a2") }),
    b.get(tab, { path: "u/b.webm" }),
    b.get(tab, { bucket: "wall-video-derived" }),
  ]);
  assert.equal(b.calls(), 6, "each scope signed its own lease");
  assert.equal(stored(b).length, 6, "six separately scoped entries");
});

test("F6-A a fresh manifest keeps only its own entries: removed / replaced media and older publications are forgotten, other Walls untouched", async () => {
  const b = browser(), tab = b.tab();
  await b.get(tab, { path: "u/a.mp4", sc: b.scope("black", "p1", "a1") });
  await b.get(tab, { path: "u/b.mp4", sc: b.scope("black", "p1", "a2") });
  await b.get(tab, { path: "u/z.mp4", sc: b.scope("zshot", "q1", "z1") });
  // republished: a1 kept, a2 removed
  tab.retain("black", [{ bucket: "wall-video", path: "u/a.mp4", scope: b.scope("black", "p1", "a1") }]);
  const keys = stored(b).map(([key]) => JSON.parse(key));
  assert.deepEqual(keys.map(k => [k[2], k[3]]).sort(), [["u/a.mp4", "black"], ["u/z.mp4", "zshot"]]);
  // a new publication of the same asset is a new scope: the old entry is not kept for it
  tab.retain("BLACK", [{ bucket: "wall-video", path: "u/a.mp4", scope: b.scope("black", "p2", "a1") }]);
  assert.deepEqual(stored(b).map(([key]) => JSON.parse(key)[3]), ["zshot"]);
});

test("F6-A unpublished / disabled / private Wall: forgetPublishedWallVideos drops every URL of that handle only", async () => {
  const b = browser(), tab = b.tab();
  await b.get(tab, { sc: b.scope("black") });
  await b.get(tab, { path: "u/z.mp4", sc: b.scope("zshot", "q", "z") });
  forgetPublishedWallVideos("Black", { storage: b.local });
  assert.deepEqual(stored(b).map(([key]) => JSON.parse(key)[3]), ["zshot"]);
  forgetPublishedWallVideos("zshot", { storage: b.local });
  assert.equal(b.shared.has(PUBLISHED_VIDEO_URL_CACHE_KEY), false);
  forgetPublishedWallVideos(null, { storage: b.local });   // never throws
  forgetPublishedWallVideos("x", { storage: () => { throw new Error("blocked"); } });
});

test("F6-A preparePublicWall: scoped lookups, a republish signs again, a removed asset or a missing Wall is forgotten - a stale URL never revives an asset", async () => {
  const b = browser(), doc = createDocument({ stageCount: 1 });
  let signs = 0;
  const api = { signPublicWallVideo: async path => { signs++; return urlFor(path, (b.now() + 6 * hour) / 1000); }, getPublicIdentity: async () => null, getPublicMyGames: async () => ({ games: [] }), loadPublicAvatar: async () => null };
  const asset = { asset_id: "v1", storage_path: "u/a.mp4", mime_type: "video/mp4" };
  const v1 = { document: doc, published_at: "p1", assets: [asset] };
  const first = await preparePublicWall(v1, "black", api, b.tab());
  const otherTab = await preparePublicWall(v1, "black", api, b.tab());
  assert.equal(otherTab.assets.videoUrlFor("v1"), first.assets.videoUrlFor("v1"));
  assert.equal(signs, 1, "the second tab did not ask for a new lease");
  const republished = await preparePublicWall({ ...v1, published_at: "p2" }, "black", api, b.tab());
  assert.equal(signs, 2, "a new publication is a new scope");
  assert.ok(republished.assets.videoUrlFor("v1"));
  const removed = await preparePublicWall({ ...v1, published_at: "p2", assets: [] }, "black", api, b.tab());
  assert.equal(removed.assets.videoUrlFor("v1"), null);
  assert.equal(stored(b).length, 0, "the removed asset's URL left the browser");
  await preparePublicWall({ ...v1, published_at: "p3" }, "black", api, b.tab());
  assert.equal(await preparePublicWall(null, "black", api, b.tab()), null);
  assert.equal(stored(b).length, 0, "no published Wall: nothing kept");
});

test("F6-A concurrent tabs merge (neither overwrites the other); same-tab requests still coalesce", async () => {
  const b = browser(), tabA = b.tab(), tabB = b.tab();
  await Promise.all([b.get(tabA, { path: "u/a.mp4", sc: b.scope("black", "p", "a") }), b.get(tabB, { path: "u/b.mp4", sc: b.scope("black", "p", "b") })]);
  assert.equal(stored(b).length, 2);
  const c = browser(), tab = c.tab();
  const same = await Promise.all([c.get(tab), c.get(tab), c.get(tab)]);
  assert.equal(new Set(same).size, 1);
  assert.equal(c.calls(), 1);
});

test("F6-A corrupt, foreign, tampered or blocked storage is never trusted and never fatal", async () => {
  for (const junk of ["not json", "{}", "[1,2,3]", JSON.stringify([["[\"x\"]", { url: 1, issued: 0 }]]),
    JSON.stringify([[JSON.stringify([baseUrl, "wall-video", "u/a.mp4", "black", "2026-10-20T10:00:00Z", "a1"]), { url: urlFor("u/OTHER.mp4", 1900000000), issued: 1800000000000 }]]),
    JSON.stringify([[JSON.stringify(["https://evil.example", "wall-video", "u/a.mp4", "black", "2026-10-20T10:00:00Z", "a1"]), { url: urlFor("u/a.mp4", 1900000000), issued: 1800000000000 }]])]) {
    const b = browser();
    b.shared.set(PUBLISHED_VIDEO_URL_CACHE_KEY, junk);
    const url = await b.get(b.tab());
    assert.match(url, /u\/a\.mp4\?token=/);
    assert.equal(b.calls(), 1, `re-signed for ${junk.slice(0, 40)}`);
  }
  const blocked = createPublishedVideoUrlCache({ baseUrl, storage: () => { throw new Error("blocked"); }, legacyStorage: () => { throw new Error("blocked"); } });
  let calls = 0;
  const sign = async () => { calls++; return urlFor("u/a.mp4", Date.now() / 1000 + 6 * 3600); };
  const one = await blocked.get({ bucket: "wall-video", path: "u/a.mp4", sign, scope: { handle: "black", publishedAt: "p", assetId: "a" } });
  assert.equal(await blocked.get({ bucket: "wall-video", path: "u/a.mp4", sign, scope: { handle: "black", publishedAt: "p", assetId: "a" } }), one);
  assert.equal(calls, 1, "blocked storage: memory only for this tab");
});

test("F6-A the per-tab F4 cache is removed when seen; sign-out clears the shared one; nothing is ever logged", () => {
  const legacy = new Map([["gamid.testing.published-wall-video-urls.v1", "[]"]]);
  createPublishedVideoUrlCache({ baseUrl, storage: () => null, legacyStorage: () => ({ removeItem: k => legacy.delete(k) }) });
  assert.equal(legacy.size, 0);
  const client = read("dist/account/supabase-client.js");
  const signOut = client.slice(client.indexOf("export async function signOut("), client.indexOf("export async function sendPasswordReset("));
  assert.ok(signOut.includes(`removeItem("${PUBLISHED_VIDEO_URL_CACHE_KEY}")`), "sign-out clears exactly the cache key");
  const source = read("dist/public/published-video-url-cache.js");
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ""), /console\.|navigator\.sendBeacon|fetch\(/);
  assert.match(source, /const storage = defaultStorage|storage = defaultStorage/);
  assert.match(source, /const defaultStorage = \(\) => globalThis\.localStorage;/);
  assert.match(source, /const MARGIN = 30 \* 60 \* 1000;/);
  assert.match(source, /const LIFETIME = WALL_VIDEO_URL_SECONDS \* 1000;/);
});

test("F6-A the public page forgets a Wall that is not public / not published, and keeps owner signing out of the cache", () => {
  const page = read("dist/public/public.js");
  assert.match(page, /if \(!identity && !ownerPreview && handle\) forgetPublishedWallVideos\(handle\);/);
  assert.match(page, /if \(!ownerPreview && !published\?\.document\) forgetPublishedWallVideos\(identity\.gamid_handle\);/);
  const wall = read("dist/public/public-wall.js");
  assert.match(wall, /videoCache\?\.retain\?\.\(handle, scoped\);/);
  assert.match(wall, /if \(!doc \|\| !validateDocument\(doc\)\.valid\) \{ videoCache\?\.forget\?\.\(handle\); return null; \}/);
  assert.match(wall, /scope: \{ handle, publishedAt: publication, assetId: id \}/);
  // the lease lifetimes are the server's, unchanged
  assert.match(read("supabase/functions/_shared/public-media.js"), /"wall-video": 6 \* 60 \* 60, "wall-video-derived": 6 \* 60 \* 60/);
});
