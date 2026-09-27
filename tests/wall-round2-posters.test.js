// Round 2 - real posters / thumbnails before play: the server proxy (supabase/functions/_shared/media-poster.js) and the client loader + painter (dist/wall-kit/posters.js,
// paint.js). No network: every provider answer is a fake.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POSTER_KINDS, IMAGE_HOSTS, POSTER_ORIGINS, posterSource, hostAllowed, fetchPoster, handleMediaPoster } from "../supabase/functions/_shared/media-poster.js";
import { posterQuery, hasPoster, createPosterLoader } from "../dist/wall-kit/posters.js";
import { PROVIDERS } from "../dist/wall-kit/embed/index.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { paintDocument } from "../dist/wall-kit/paint.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const q = params => new URLSearchParams(params);
const describe = (providerKey, data) => elementRegistry.get("embed").render({ providerKey, data: { presentation: "card", ...data } }).content;

// a real (tiny) 16x16 PNG header + IHDR is enough for the signature check
function png(width = 64, height = 36) {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  b.set([(width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255, (height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255], 16);
  return b;
}
const reply = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: name => headers[name.toLowerCase()] ?? null }, arrayBuffer: async () => (typeof body === "string" ? new TextEncoder().encode(body).buffer : body.buffer) });
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => { calls.push({ url, init }); const route = routes[url]; if (!route) return reply(404, "nope"); return typeof route === "function" ? route() : route; };
  return { impl, calls };
}

// ---------- F: sources ----------
test("F poster sources: every one is BUILT from validated parts (never taken from the request) and comes from a documented, keyless endpoint", () => {
  assert.deepEqual(posterSource(q({ p: "youtube", k: "video", id: "dQw4w9WgXcQ" })), { provider: "youtube", type: "image", url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" });
  assert.equal(posterSource(q({ p: "youtube", k: "playlist", id: "PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-" })).url, "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fplaylist%3Flist%3DPLrEnWoR732-BHrPp_Pm8_VleD68f9s14-");
  assert.equal(posterSource(q({ p: "vimeo", k: "video", id: "1084537:abcdef12" })).url, `https://vimeo.com/api/oembed.json?url=${encodeURIComponent("https://vimeo.com/1084537/abcdef12")}`, "an unlisted video keeps its hash");
  assert.equal(posterSource(q({ p: "tiktok", k: "video", id: "6718335390845095173" })).url, `https://www.tiktok.com/oembed?url=${encodeURIComponent("https://www.tiktok.com/@/video/6718335390845095173")}`);
  assert.equal(posterSource(q({ p: "spotify", k: "album", id: "4aawyAB9vmqN3uQ7FjRGTy" })).url, `https://open.spotify.com/oembed?url=${encodeURIComponent("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy")}`);
  assert.equal(posterSource(q({ p: "soundcloud", k: "track", id: "forss/flickermood" })).url, `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent("https://soundcloud.com/forss/flickermood")}`);
  assert.equal(posterSource(q({ p: "steam", k: "app", id: "570" })).url, "https://store.steampowered.com/api/appdetails?appids=570&filters=basic");
  assert.equal(posterSource(q({ p: "twitch", k: "channel", id: "TwitchDev" })).url, "https://static-cdn.jtvnw.net/previews-ttv/live_user_twitchdev-640x360.jpg");
  assert.equal(posterSource(q({ steam_avatar: "fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb" })).url, "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg");
});

test("F poster requests: anything not exactly a known provider + kind + valid id is refused (no open proxy, no path tricks)", () => {
  for (const params of [
    {}, { p: "youtube" }, { p: "youtube", k: "video" }, { p: "youtube", k: "video", id: "short" }, { p: "youtube", k: "video", id: "dQw4w9WgXcQ/../x" },
    { p: "youtube", k: "channel", id: "@name" }, { p: "kick", k: "channel", id: "xqc" }, { p: "x", k: "post", id: "20" }, { p: "instagram", k: "post", id: "DLLQqjCMkiN" },
    { p: "facebook", k: "video", id: "10153231379946729" }, { p: "snapchat", k: "spotlight", id: "W7_EDlXWTBiXAEEniNoMPwAAYdWxvYnBhaHR3AaARhNpsAaARhNmWAAAAAQ" },
    { p: "twitch", k: "clip", id: "FunnySlug-abcdef" }, { p: "__proto__", k: "video", id: "x" }, { p: "youtube", k: "constructor", id: "x" },
    { p: "soundcloud", k: "track", id: "Forss/Flickermood" }, { p: "steam", k: "app", id: "570&x=1" }, { steam_avatar: "../../etc" }, { steam_avatar: "FEF49E7FA7E1997310D705B2A6158FF8DC1CDFEB" },
  ]) assert.equal(posterSource(q(params)), null, JSON.stringify(params));
});

test("F the server's id rules are the Wall adapters' own rules (no drift), and the client asks only for what the server can answer", () => {
  for (const [provider, kinds] of Object.entries(POSTER_KINDS)) {
    for (const [kind, pattern] of Object.entries(kinds)) assert.equal(pattern, PROVIDERS.get(provider).kinds[kind].id, `${provider}/${kind}`);
  }
  const declared = {};
  for (const [key, provider] of PROVIDERS) for (const [kind, spec] of Object.entries(provider.kinds)) if (spec.poster) (declared[key] ||= []).push(kind);
  assert.deepEqual(declared, Object.fromEntries(Object.entries(POSTER_KINDS).map(([provider, kinds]) => [provider, Object.keys(kinds)])), "adapters declare `poster` exactly where the server has a source");
  assert.equal(posterQuery(describe("youtube", { kind: "video", id: "dQw4w9WgXcQ" })), "p=youtube&k=video&id=dQw4w9WgXcQ");
  assert.equal(posterQuery(describe("kick", { kind: "channel", id: "xqc" })), null, "no documented keyless source: no request at all");
  assert.equal(hasPoster(describe("x", { kind: "post", id: "20" })), false);
});

test("F image hosts: only https on the provider's own image hosts; no ports, no credentials, no look-alike suffixes", () => {
  assert.equal(hostAllowed("tiktok", "https://p16-common-sign.tiktokcdn.com/a.jpeg?x=1"), true);
  assert.equal(hostAllowed("tiktok", "https://tiktokcdn.com/a.jpeg"), false, "a suffix entry needs a real subdomain");
  assert.equal(hostAllowed("tiktok", "https://evil-tiktokcdn.com/a.jpeg"), false);
  assert.equal(hostAllowed("spotify", "https://i.scdn.co/image/ab67"), true);
  assert.equal(hostAllowed("spotify", "https://i.ytimg.com/vi/x/hqdefault.jpg"), false, "another provider's host is not this provider's");
  assert.equal(hostAllowed("youtube", "http://i.ytimg.com/vi/x/hqdefault.jpg"), false);
  assert.equal(hostAllowed("youtube", "https://i.ytimg.com:8443/vi/x/hqdefault.jpg"), false);
  assert.equal(hostAllowed("youtube", "https://user:pw@i.ytimg.com/vi/x.jpg"), false);
  assert.equal(hostAllowed("youtube", "javascript:alert(1)"), false);
  assert.deepEqual(Object.keys(IMAGE_HOSTS).sort(), [...Object.keys(POSTER_KINDS), "steam-avatar"].sort());
});

// ---------- G: fetching ----------
test("G YouTube: the real thumbnail is fetched from i.ytimg.com and re-labelled by its real signature", async () => {
  const { impl, calls } = fakeFetch({ "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg": reply(200, png(480, 360), { "content-type": "text/html" }) });
  const poster = await fetchPoster(posterSource(q({ p: "youtube", k: "video", id: "dQw4w9WgXcQ" })), impl);
  assert.equal(poster.ok, true);
  assert.equal(poster.mime, "image/png", "the type comes from the bytes, not the upstream header");
  assert.equal(calls[0].init.redirect, "manual", "redirects are never followed blindly");
  assert.equal(calls[0].init.headers.Cookie, undefined, "no cookies");
});

test("G oEmbed: the thumbnail_url is fetched only when it is on the provider's own image host", async () => {
  const src = posterSource(q({ p: "tiktok", k: "video", id: "6718335390845095173" }));
  const good = fakeFetch({ [src.url]: reply(200, JSON.stringify({ thumbnail_url: "https://p16-sign.tiktokcdn.com/obj/x.jpeg" })), "https://p16-sign.tiktokcdn.com/obj/x.jpeg": reply(200, png()) });
  assert.equal((await fetchPoster(src, good.impl)).ok, true);
  const hostile = fakeFetch({ [src.url]: reply(200, JSON.stringify({ thumbnail_url: "https://attacker.example/x.jpeg" })) });
  assert.deepEqual(await fetchPoster(src, hostile.impl), { ok: false, code: "no_poster" });
  assert.equal(hostile.calls.length, 1, "the foreign address is never requested");
  const internal = fakeFetch({ [src.url]: reply(200, JSON.stringify({ thumbnail_url: "http://169.254.169.254/latest" })) });
  assert.deepEqual(await fetchPoster(src, internal.impl), { ok: false, code: "no_poster" });
});

test("G redirects are followed by hand and re-checked; a Twitch channel that is OFFLINE (redirect to the placeholder) has no poster", async () => {
  const twitch = posterSource(q({ p: "twitch", k: "channel", id: "twitchdev" }));
  const offline = fakeFetch({ [twitch.url]: reply(302, "", { location: "https://static-cdn.jtvnw.net/ttv-static/404_preview-640x360.jpg" }), "https://static-cdn.jtvnw.net/ttv-static/404_preview-640x360.jpg": reply(200, png()) });
  assert.deepEqual(await fetchPoster(twitch, offline.impl), { ok: false, code: "no_poster" });
  assert.equal(offline.calls.length, 1, "the placeholder is not even requested");
  const live = fakeFetch({ [twitch.url]: reply(200, png(640, 360)) });
  assert.equal((await fetchPoster(twitch, live.impl)).ok, true);
  const yt = posterSource(q({ p: "youtube", k: "video", id: "dQw4w9WgXcQ" }));
  const away = fakeFetch({ [yt.url]: reply(301, "", { location: "https://evil.example/x.png" }) });
  assert.deepEqual(await fetchPoster(yt, away.impl), { ok: false, code: "no_poster" });
  assert.equal(away.calls.length, 1);
});

test("G never a broken image: non-images (HTML, SVG), tiny or oversized answers are refused", async () => {
  const src = posterSource(q({ p: "youtube", k: "video", id: "dQw4w9WgXcQ" }));
  for (const body of ["<html>not an image</html>", "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"]) {
    assert.deepEqual(await fetchPoster(src, fakeFetch({ [src.url]: reply(200, body, { "content-type": "image/jpeg" }) }).impl), { ok: false, code: "no_poster" });
  }
  assert.deepEqual(await fetchPoster(src, fakeFetch({ [src.url]: reply(200, png(8, 8)) }).impl), { ok: false, code: "no_poster" }, "a 1x1-style tracking pixel is not a poster");
  assert.deepEqual(await fetchPoster(src, fakeFetch({ [src.url]: reply(200, png(), { "content-length": String(3 * 1024 * 1024) }) }).impl), { ok: false, code: "no_poster" });
  assert.deepEqual(await fetchPoster(src, fakeFetch({ [src.url]: reply(404, png()) }).impl), { ok: false, code: "no_poster" });
});

test("G Steam app header comes from the store's appdetails header_image on a Steam image host", async () => {
  const src = posterSource(q({ p: "steam", k: "app", id: "570" }));
  const image = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/header.jpg?t=1";
  const { impl } = fakeFetch({ [src.url]: reply(200, JSON.stringify({ 2120612: { success: true, data: { steam_appid: 570, header_image: image } } })), [image]: reply(200, png(460, 215)) });
  assert.equal((await fetchPoster(src, impl)).ok, true, "matched on data.steam_appid (Steam's own key can differ - seen live)");
  const other = fakeFetch({ [src.url]: reply(200, JSON.stringify({ 730: { success: true, data: { steam_appid: 730, header_image: image } } })) });
  assert.deepEqual(await fetchPoster(src, other.impl), { ok: false, code: "no_poster" }, "another app's picture is never used");
  const bad = fakeFetch({ [src.url]: reply(200, JSON.stringify({ 570: { success: false } })) });
  assert.deepEqual(await fetchPoster(src, bad.impl), { ok: false, code: "no_poster" });
});

test("G the handler: GET only, allowed origins only, typed errors, safe headers, cacheable images", async () => {
  const request = (url, { method = "GET", origin = "https://gamid-testing-static.gamid.workers.dev" } = {}) => new Request(url, { method, headers: origin ? { origin } : {} });
  const base = "https://x.supabase.co/functions/v1/media-poster";
  const { impl } = fakeFetch({ "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg": reply(200, png(480, 360)) });
  const ok = await handleMediaPoster({ request: request(`${base}?p=youtube&k=video&id=dQw4w9WgXcQ`), fetchImpl: impl });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  assert.match(ok.headers.get("cache-control"), /public, max-age=\d+/);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://gamid-testing-static.gamid.workers.dev");
  assert.equal((await handleMediaPoster({ request: request(`${base}?p=youtube&k=video&id=dQw4w9WgXcQ`, { origin: "https://evil.example" }), fetchImpl: impl })).status, 403);
  assert.equal((await handleMediaPoster({ request: request(`${base}?p=youtube&k=video&id=dQw4w9WgXcQ`, { method: "POST" }), fetchImpl: impl })).status, 405);
  assert.equal((await handleMediaPoster({ request: request(`${base}?p=kick&k=channel&id=xqc`), fetchImpl: impl })).status, 400);
  const none = await handleMediaPoster({ request: request(`${base}?p=youtube&k=video&id=aaaaaaaaaaa`), fetchImpl: impl });
  assert.equal(none.status, 404);
  assert.deepEqual(await none.json(), { error: "no_poster" });
  assert.deepEqual(POSTER_ORIGINS, ["https://jeddawe11-eng.github.io", "https://gamid-testing-static.gamid.workers.dev"]);
  const glue = read("supabase/functions/media-poster/index.ts");
  assert.match(glue, /handleMediaPoster/);
  assert.doesNotMatch(read("supabase/functions/_shared/media-poster.js"), /STEAM_WEB_API_KEY|SERVICE_ROLE/, "the proxy needs and reads no secret");
  assert.match(read("supabase/config.toml"), /\[functions\.media-poster\]\r?\nverify_jwt = false/);
});

// ---------- client ----------
test("F client loader: one request per poster (cached), only to GamID's own endpoint, credentials omitted; a failure is null (never a broken image)", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return url.includes("dQw4w9WgXcQ") ? { ok: true, headers: { get: () => "image/jpeg" }, blob: async () => "BLOB" } : { ok: false, headers: { get: () => "application/json" } }; };
  const loader = createPosterLoader({ endpoint: "https://x.supabase.co/functions/v1/media-poster", fetchImpl, createUrl: () => "blob:poster-1" });
  const yt = describe("youtube", { kind: "video", id: "dQw4w9WgXcQ" });
  assert.equal(await loader.forDescriptor(yt), "blob:poster-1");
  assert.equal(await loader.forDescriptor(yt), "blob:poster-1");
  assert.equal(calls.length, 1, "cached");
  assert.equal(loader.readyFor(yt), "blob:poster-1");
  assert.equal(calls[0].url, "https://x.supabase.co/functions/v1/media-poster?p=youtube&k=video&id=dQw4w9WgXcQ");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.referrerPolicy, "no-referrer");
  assert.equal(await loader.forDescriptor(describe("youtube", { kind: "video", id: "aaaaaaaaaaa" })), null);
  assert.equal(await loader.forDescriptor(describe("kick", { kind: "channel", id: "xqc" })), null);
  assert.equal(calls.length, 2, "a provider without a poster source is never requested");
  for (const bad of ["", "a=b c", "x=1&y=<script>", "u=https://evil.example/x", null]) assert.equal(await loader.load(bad), null, String(bad));
  assert.equal(calls.length, 2, "a malformed query is never sent");
});

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { props: new Map(), setProperty(n, v) { this.props.set(n, v); }, removeProperty(n) { this.props.delete(n); } }; this.listeners = {}; this.className = ""; this.textContent = ""; this.parent = null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  append(...nodes) { for (const node of nodes) { if (typeof node === "string") continue; node.parent = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  prepend(...nodes) { for (const node of nodes.reverse()) { node.parent = this; this.children.unshift(node); } }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; } }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  fire(type) { for (const handler of this.listeners[type] || []) handler({ target: this }); }
}
const all = (root, predicate) => { const out = []; const walk = node => { if (predicate(node)) out.push(node); node.children.forEach(walk); }; walk(root); return out; };

test("F painter: a card / player facade gets its poster behind the text (hidden until decoded); a failed poster is removed; links stay plain pills; no poster, no request", async () => {
  const doc = createDocument();
  const embed = (id, providerKey, data, y) => createElement({ id, type: "embed", x: 0, y, z: 0, width: 600, height: 300, payload: { providerKey, data } });
  doc.stages[0].elements = [
    embed("yt", "youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" }, 0),
    embed("gone", "youtube", { kind: "video", id: "aaaaaaaaaaa", presentation: "card" }, 310),
    embed("pill", "youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "link" }, 620),
    embed("kick", "kick", { kind: "channel", id: "xqc", presentation: "embed" }, 930),
  ];
  const asked = [];
  let resolveGone;
  const posters = { forDescriptor: descriptor => { asked.push(descriptor.id); return descriptor.id === "aaaaaaaaaaa" ? new Promise(resolve => { resolveGone = resolve; }) : Promise.resolve("blob:yt"); }, readyFor: () => null };
  const painted = paintDocument(doc, 500, tag => new Node(tag), { mode: "view", posters, players: { activate() {} } });
  const stage = painted.stages[0];
  await new Promise(resolve => setTimeout(resolve, 0));
  const box = id => all(stage, node => node.attrs?.["data-el"] === id)[0];
  const [img] = all(box("yt"), node => node.tag === "img");
  assert.equal(img.attrs.src, "blob:yt");
  assert.equal(img.attrs.alt, "", "decorative: the facade's own label names the content");
  assert.equal(img.style.props.get("opacity"), "0", "hidden until it has really decoded");
  img.fire("load");
  assert.equal(img.style.props.get("opacity"), "1");
  const facade = img.parent;
  assert.equal(facade.attrs["data-poster"], "true");
  assert.equal(facade.children[0], img, "behind everything else");
  const title = all(facade, node => node.className === "wall-embed-title")[0];
  assert.equal(title.style.props.get("z-index"), "1", "text sits above the poster");
  resolveGone(null);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(all(box("gone"), node => node.tag === "img").length, 0, "no poster: the neutral facade stays, no broken image");
  assert.equal(all(box("pill"), node => node.tag === "img").length, 0, "a Link stays a plain pill");
  assert.equal(all(box("kick"), node => node.tag === "img").length, 0);
  assert.deepEqual(asked.sort(), ["aaaaaaaaaaa", "dQw4w9WgXcQ"], "Kick (no documented keyless source) is never requested");
  assert.equal(all(stage, node => node.tag === "iframe").length, 0, "a poster never starts a player (no autoplay)");
});

test("F the editor wires the loader to GamID's own endpoint; the page CSP is unchanged (img-src already allows blob:, no provider image host added)", () => {
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /createPosterLoader\(\{ endpoint: api\.MEDIA_POSTER_URL \}\)/);
  assert.match(read("dist/account/supabase-client.js"), /export const MEDIA_POSTER_URL = `\$\{SUPABASE_URL\}\/functions\/v1\/media-poster`/);
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(read("dist/wall-editor/index.html"))[1];
  assert.match(csp, /img-src 'self' data: blob:;/);
  for (const host of ["ytimg", "tiktokcdn", "scdn", "sndcdn", "vimeocdn", "steamstatic", "jtvnw"]) assert.equal(csp.includes(host), false, host);
});
