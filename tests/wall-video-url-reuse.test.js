import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublishedVideoUrlCache } from "../dist/public/published-video-url-cache.js";
import { preparePublicWall } from "../dist/public/public-wall.js";
import { createDocument } from "../dist/wall/schema.js";
const baseUrl = "https://project.supabase.co";
const hour = 3600000;
const urlFor = (path, exp, bucket = "wall-video") => `${baseUrl}/storage/v1/object/sign/${bucket}/${path}?token=e30.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
function lab() {
  let time = 1800000000000, calls = 0;
  const saved = new Map();
  const storage = () => ({ getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) });
  const cache = () => createPublishedVideoUrlCache({ baseUrl, now: () => time, storage });
  const get = (c, path = "u/a.mp4", bucket = "wall-video") => c.get({ bucket, path, sign: async () => { calls++; return urlFor(path, (time + 6 * hour) / 1000, bucket); } });
  return { cache, get, saved, storage, now: () => time, advance: n => time += n, calls: () => calls };
}
test("F4 valid URL reused and concurrent signing coalesced", async () => {
  const l = lab(), c = l.cache();
  const results = await Promise.all([l.get(c), l.get(c), l.get(c)]);
  assert.equal(new Set(results).size, 1); assert.equal(l.calls(), 1);
  assert.equal(await l.get(c), results[0]); assert.equal(l.calls(), 1);
});
test("F4 refresh/revisit restores same URL, expiry and 30-minute margin re-sign", async () => {
  const l = lab(), first = await l.get(l.cache());
  l.advance(hour);
  assert.equal(await l.get(l.cache()), first); assert.equal(l.calls(), 1);
  l.advance(4.5 * hour);
  const second = await l.get(l.cache()); assert.notEqual(second, first); assert.equal(l.calls(), 2);
  l.advance(6 * hour); assert.notEqual(await l.get(l.cache()), second); assert.equal(l.calls(), 3);
});
test("F4 distinct objects and source/derived buckets never share capabilities", async () => {
  const l = lab(), c = l.cache();
  const urls = await Promise.all([l.get(c), l.get(c, "u/b.webm"), l.get(c, "u/a.mp4", "wall-video-derived")]);
  assert.equal(new Set(urls).size, 3); assert.equal(l.calls(), 3);
});
test("F4 actual shorter token expiry wins; invalid/off-origin URLs are not retained", async () => {
  const l = lab(), c = l.cache(); let calls = 0;
  const sign = async () => { calls++; return urlFor("u/a.mp4", (l.now() + hour) / 1000); };
  await c.get({ bucket: "wall-video", path: "u/a.mp4", sign }); l.advance(hour / 2);
  await c.get({ bucket: "wall-video", path: "u/a.mp4", sign }); assert.equal(calls, 2);
  for (const url of ["https://evil.example/a", urlFor("u/other.mp4", (l.now() + 6 * hour) / 1000), `${baseUrl}/storage/v1/object/sign/wall-video/u/a.mp4?token=invalid`]) {
    const cache = lab().cache(); let count = 0;
    const bad = () => { count++; return url; };
    await cache.get({ bucket: "wall-video", path: "u/a.mp4", sign: bad });
    await cache.get({ bucket: "wall-video", path: "u/a.mp4", sign: bad }); assert.equal(count, 2);
  }
});
test("F4 failure retries, unavailable/corrupt storage falls back without breaking media", async () => {
  const c = createPublishedVideoUrlCache({ baseUrl, storage: () => { throw Error("blocked"); } });
  let calls = 0;
  const sign = async () => { if (++calls === 1) throw Error("403"); return null; };
  await assert.rejects(c.get({ bucket: "wall-video", path: "u/a.mp4", sign }));
  assert.equal(await c.get({ bucket: "wall-video", path: "u/a.mp4", sign }), null); assert.equal(calls, 2);
  const l = lab(); l.saved.set("gamid.testing.published-wall-video-urls.v1", "not json");
  assert.ok(await l.get(l.cache()));
});
test("F4 fresh publication gate: cached asset is not exposed when no longer in current manifest", async () => {
  const l = lab(), cache = l.cache(), doc = createDocument({ stageCount: 1 });
  const api = { signPublicWallVideo: async () => l.get(l.cache()), getPublicIdentity: async () => null, getPublicMyGames: async () => ({ games: [] }), loadPublicAvatar: async () => null };
  const asset = { asset_id: "v", storage_path: "u/a.mp4", mime_type: "video/mp4" };
  const first = await preparePublicWall({ document: doc, assets: [asset] }, "fixture", api, cache);
  const revisit = await preparePublicWall({ document: doc, assets: [asset] }, "fixture", api, l.cache());
  assert.equal(first.assets.videoUrlFor("v"), revisit.assets.videoUrlFor("v")); assert.equal(l.calls(), 1);
  const unpublishedAsset = await preparePublicWall({ document: doc, assets: [] }, "fixture", api, cache);
  assert.equal(unpublishedAsset.assets.videoUrlFor("v"), null);
  assert.equal(await preparePublicWall(null, "fixture", api, cache), null);
});
test("F4 privacy regression: public refresh still obtains server publication; owner path and RLS unchanged", () => {
  const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.match(read("dist/public/public.js"), /getPublicWall\(identity.gamid_handle\)/);
  assert.match(read("dist/public/public-wall.js"), /api === defaultApi \? publishedVideoUrls : null/);
  const client = read("dist/account/supabase-client.js");
  const owner = client.slice(client.indexOf("export async function signWallVideo("), client.indexOf("export async function signWallVideo(") + 850);
  assert.match(owner, /await restoreSession\(\)/); assert.match(owner, /token: session\?\.access_token/);
  assert.doesNotMatch(owner, /publishedVideoUrls|createPublishedVideoUrlCache/);
  const publicSigner = client.slice(client.indexOf("export async function signPublicWallVideo("), client.indexOf("export async function signPublicWallVideo(") + 1000);
  assert.doesNotMatch(publicSigner, /access_token|Authorization/);
  assert.match(client, /WALL_VIDEO_URL_SECONDS = 6 \* 60 \* 60/);
  assert.match(read("supabase/migrations/20261002120000_wall_public_publishing.sql"), /private.wall_object_is_published\(bucket_id, name\)/);
});
