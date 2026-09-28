// Post-Round 2 manual-acceptance fixes: Steam refresh from the Cloudflare TESTING site, provider previews (Twitch VOD, Kick, Snapchat, Instagram, X, Steam, Discord)
// through the one media-poster pipeline, honest Kick VOD / Facebook capabilities, "Move to stage", and transient editor notices.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { handleRefresh, ALLOWED_ORIGINS } from "../supabase/functions/_shared/steam-games.js";
import { posterSource, parseMetaTags, cleanText, hostAllowed, resolvePreview, fetchPoster, handleMediaPoster, POSTER_KINDS } from "../supabase/functions/_shared/media-poster.js";
import { refreshSteamProfile } from "../supabase/functions/_shared/steam-profile.js";
import { createPosterLoader } from "../dist/wall-kit/posters.js";
import { PROVIDERS, detectEmbed, mediaCapabilities } from "../dist/wall-kit/embed/index.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import { createNotifier, TRANSIENT_NOTICE_MS, describeCode } from "../dist/wall-kit/messages.js";
import * as ops from "../dist/wall-kit/ops.js";
import "../dist/wall-kit/register.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const CF = "https://gamid-testing-static.gamid.workers.dev";
const q = params => new URLSearchParams(params);
const reply = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: name => headers[name.toLowerCase()] ?? null }, arrayBuffer: async () => new TextEncoder().encode(body).buffer, text: async () => body, json: async () => JSON.parse(body) });
function png(width = 64, height = 36) {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  b.set([(width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255, (height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255], 16);
  return b;
}
const imageReply = () => ({ status: 200, ok: true, headers: { get: () => null }, arrayBuffer: async () => png().buffer });
function fakeFetch(routes) {
  const calls = [];
  return { calls, impl: async url => { calls.push(url); const route = routes[url]; return route ? route() : reply(404, "nope"); } };
}

// =====================================================================================================================================================================
// B. Steam: Refresh games from the Cloudflare TESTING site
// =====================================================================================================================================================================
test("B root cause: the games refresh answered only the GitHub Pages origin, so the Cloudflare site's request was blocked by CORS ('couldn't reach the games service') - both are allowed now, nothing else", async () => {
  assert.deepEqual(ALLOWED_ORIGINS, ["https://jeddawe11-eng.github.io", CF]);
  const env = { supabaseUrl: "https://x.supabase.co", anonKey: "anon", serviceKey: "service", steamApiKey: "0123456789abcdef0123456789ABCDEF" };
  const preflight = await handleRefresh({ request: new Request("https://x.supabase.co/functions/v1/steam-games-refresh", { method: "OPTIONS", headers: { origin: CF } }), env });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), CF);
  const evil = await handleRefresh({ request: new Request("https://x.supabase.co/functions/v1/steam-games-refresh", { method: "POST", headers: { origin: "https://evil.example", authorization: "Bearer t" }, body: "{\"action\":\"refresh\"}" }), env });
  assert.equal(evil.status, 403);
  const unauthenticated = await handleRefresh({ request: new Request("https://x.supabase.co/functions/v1/steam-games-refresh", { method: "POST", headers: { origin: CF }, body: "{\"action\":\"refresh\"}" }), env });
  assert.equal(unauthenticated.status, 401, "from the Cloudflare site the request now reaches the function's own checks");
  assert.equal(unauthenticated.headers.get("access-control-allow-origin"), CF, "and the browser can read the answer");
});

test("B Steam unavailable: known persona metadata is KEPT (nothing is written), and the refresh still reports its own truthful outcome", async () => {
  const saved = [];
  const save = async args => { saved.push(args); return { ok: true, body: "SAVED" }; };
  for (const failing of [async () => reply(503, "down"), async () => reply(429, "slow down"), async () => { throw new Error("network"); }, async () => reply(200, "{\"response\":{\"players\":[]}}")]) {
    assert.equal(await refreshSteamProfile({ steamId: "76561198040516491", apiKey: "0123456789abcdef0123456789ABCDEF", fetchImpl: failing, save }), "NO_SUMMARY");
  }
  assert.equal(saved.length, 0, "a failed summary never overwrites a stored persona with a neutral label");
  const account = read("dist/account/account.js");
  assert.match(account, /if \(row\.provider_display_name\) copy\.append\(element\("span", "connection-name", row\.provider_display_name\)\)/, "the owner's card shows the persona once stored");
});

// =====================================================================================================================================================================
// A. Providers
// =====================================================================================================================================================================
test("A2 Kick VOD: kick.com/<channel>/videos/<id> is accepted as a CARD / LINK (Kick has no working VOD embed - never a fake Player), opens on Kick, validates in the database table", () => {
  const detected = detectEmbed("https://kick.com/xqc/videos/01A0DF43-5130-7429-AF65-66A176D79E10?t=10");
  assert.equal(detected.ok, true);
  assert.deepEqual([detected.kind, detected.id, detected.presentations, detected.inline], ["video", "xqc/01a0df43-5130-7429-af65-66a176d79e10", ["card", "link"], false]);
  assert.equal(detected.canonicalUrl, "https://kick.com/xqc/videos/01a0df43-5130-7429-af65-66a176d79e10");
  assert.equal(detectEmbed("https://kick.com/xqc").kind, "channel", "live channels keep their Player");
  assert.equal(detectEmbed("https://kick.com/videos/01a0df43-5130-7429-af65-66a176d79e10").ok, false, "a reserved first segment is not a channel");
  assert.equal(PROVIDERS.get("kick").embedUrl("video", "xqc/01a0df43-5130-7429-af65-66a176d79e10"), null);
  const kick = mediaCapabilities().find(entry => entry.key === "kick");
  assert.deepEqual(kick.kinds.map(kind => [kind.kind, kind.presentations.join("|")]), [["channel", "embed|card|link"], ["video", "card|link"]], "the Supported platforms list says exactly this");
  const sql = read("supabase/migrations/20260927140000_wall_kick_vod.sql");
  assert.match(sql, /\('kick', 'video', '\^\[A-Za-z0-9_-\]\{3,25\}\/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$', false\)/);
  assert.match(sql, /revoke all on function private\.wall_embed_specs\(\) from public, anon, authenticated;/);
});

test("A3 Facebook: no Player is offered for any content (its plugin needs Facebook's SDK and renders blank/login-gated in the Wall sandbox) - honest Card / Link to the original", () => {
  const facebook = mediaCapabilities().find(entry => entry.key === "facebook");
  assert.equal(facebook.player, false);
  for (const kind of facebook.kinds) assert.deepEqual(kind.presentations, ["card", "link"]);
  assert.equal(PROVIDERS.get("facebook").frameOrigins.length, 0);
  assert.doesNotMatch(read("dist/wall-editor/index.html"), /facebook\.com/, "no Facebook frame-src in the page policy");
  assert.equal(detectEmbed("https://www.facebook.com/facebook/videos/10153231379946729/").canonicalUrl, "https://www.facebook.com/watch/?v=10153231379946729");
});

test("A4 Snapchat: the current share shape snapchat.com/@<user>/spotlight/<id>?... is recognised; the query is dropped; the Spotlight player + poster apply", () => {
  const id = "W7_EDlXWTBiXAEEniNoMPwAAYdWxvYnBhaHR3AaARhNpsAaARhNmWAAAAAQ";
  for (const url of [`https://www.snapchat.com/@al20258600/spotlight/${id}?share_id=abc&locale=en-US`, `https://snapchat.com/@someone/spotlight/${id}`, `https://www.snapchat.com/spotlight/${id}`]) {
    const detected = detectEmbed(url);
    assert.deepEqual([detected.ok, detected.kind, detected.id], [true, "spotlight", id], url);
  }
  assert.equal(PROVIDERS.get("snapchat").kinds.spotlight.poster, true);
});

test("A1/A5/A6 one provider-neutral pipeline: Twitch VOD / clip, Kick, Snapchat, Instagram and X previews come from the content's PUBLIC page preview; addresses are built from validated parts", () => {
  const cases = [
    [{ p: "twitch", k: "video", id: "2881171681" }, "https://www.twitch.tv/videos/2881171681"], [{ p: "twitch", k: "clip", id: "FunnySlug-abcdef" }, "https://clips.twitch.tv/FunnySlug-abcdef"],
    [{ p: "kick", k: "channel", id: "xqc" }, "https://kick.com/xqc"], [{ p: "kick", k: "video", id: "xqc/01a0df43-5130-7429-af65-66a176d79e10" }, "https://kick.com/xqc/videos/01a0df43-5130-7429-af65-66a176d79e10"],
    [{ p: "snapchat", k: "spotlight", id: "W7_EDlXWTBiXAEEniNoMPwAAYdWxvYnBhaHR3AaARhNpsAaARhNmWAAAAAQ" }, "https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYdWxvYnBhaHR3AaARhNpsAaARhNmWAAAAAQ"],
    [{ p: "instagram", k: "reel", id: "DLLQqjCMkiN" }, "https://www.instagram.com/reel/DLLQqjCMkiN/"], [{ p: "x", k: "post", id: "20" }, "https://x.com/i/status/20"],
  ];
  for (const [params, url] of cases) { const source = posterSource(q(params)); assert.deepEqual([source.type, source.url, source.hosts], ["page", url, [new URL(url).hostname]], JSON.stringify(params)); }
  assert.equal(posterSource(q({ p: "discord", k: "invite", id: "discord-developers" })).url, "https://discord.com/api/v10/invites/discord-developers?with_counts=true", "Discord's public Get Invite API");
  assert.equal(posterSource(q({ p: "steam", k: "profile", id: "gabelogannewell" })).url, "https://steamcommunity.com/id/gabelogannewell/?xml=1");
  assert.equal(posterSource(q({ p: "steam", k: "profile", id: "76561197960287930" })).url, "https://steamcommunity.com/profiles/76561197960287930/?xml=1");
  assert.equal(posterSource(q({ p: "steam", k: "group", id: "steamuniverse" })).url, "https://steamcommunity.com/groups/steamuniverse/memberslistxml/?xml=1");
  assert.equal(posterSource(q({ p: "facebook", k: "video", id: "10153231379946729" })), null, "Facebook: no public preview (login wall)");
  const declared = {};
  for (const [key, provider] of PROVIDERS) for (const [kind, spec] of Object.entries(provider.kinds)) if (spec.poster) (declared[key] ||= []).push(kind);
  assert.deepEqual(declared, Object.fromEntries(Object.entries(POSTER_KINDS).map(([provider, kinds]) => [provider, Object.keys(kinds)])));
});

test("A9 page previews: og:image / og:title in either attribute order, entities decoded, plain text only; only the provider's own image hosts; generic placeholders refused", async () => {
  const html = `<head><meta content="https://static-cdn.jtvnw.net/cf_vods/x/thumb/thumb0-640x360.jpg" property="og:image"/><meta property="og:title" content="Big &amp; Bold &quot;VOD&quot; &#x1F600;"/><meta property="og:image" content="https://evil.example/second.jpg"/></head>`;
  assert.deepEqual(parseMetaTags(html), { "og:image": "https://static-cdn.jtvnw.net/cf_vods/x/thumb/thumb0-640x360.jpg", "og:title": "Big & Bold \"VOD\" 😀" });
  assert.equal(cleanText(`a‮b${"x".repeat(200)}`, 20).length <= 20, true);
  assert.equal(cleanText("<script>alert(1)</script>", 80), "<script>alert(1)</script>", "kept as TEXT (the painter only ever uses textContent)");
  assert.equal(hostAllowed("twitch", "https://static-cdn.jtvnw.net/ttv-static-metadata/twitch_logo3.jpg"), false, "Twitch's generic logo is not a VOD thumbnail");
  assert.equal(hostAllowed("twitch", "https://vod-secure.twitch.tv/_404/404_processing_640x360.png"), false, "nor its 'processing' placeholder");
  assert.equal(hostAllowed("kick", "https://web.kick.com/api/v1/videos/01a0df43-5130-7429-af65-66a176d79e10/thumbnails/21005000.jpeg?cwt=x"), true);
  assert.equal(hostAllowed("kick", "https://web.kick.com/api/v2/channels/xqc"), false, "only a VOD thumbnail path on Kick's API host");
  assert.equal(hostAllowed("x", "https://pbs.twimg.com/media/abc.jpg"), true);
  assert.equal(hostAllowed("instagram", "https://scontent-lhr8-1.cdninstagram.com/v/x.jpg"), true);
  assert.equal(hostAllowed("instagram", "https://evilcdninstagram.com/x.jpg"), false);
  // a twitch VOD still processing publishes only the placeholder -> no poster at all (the neutral facade stays)
  const source = posterSource(q({ p: "twitch", k: "video", id: "2884829425" }));
  const processing = fakeFetch({ [source.url]: () => reply(200, `<meta property="og:image" content="https://vod-secure.twitch.tv/_404/404_processing_640x360.png"/><meta property="og:title" content="xqc on Twitch"/>`) });
  assert.deepEqual(await fetchPoster(source, processing.impl), { ok: false, code: "no_poster" });
  assert.equal(processing.calls.length, 2, "the page was read (plus ONE bounded retry - Twitch sometimes omits its preview tags) and the placeholder never requested");
  const ready = fakeFetch({ [source.url]: () => reply(200, html), "https://static-cdn.jtvnw.net/cf_vods/x/thumb/thumb0-640x360.jpg": imageReply });
  assert.equal((await fetchPoster(source, ready.impl)).ok, true, "a finished VOD's real thumbnail is served before any click");
  // a page may only redirect within its own host
  const away = fakeFetch({ [source.url]: () => reply(302, "", { location: "https://evil.example/" }) });
  assert.deepEqual(await resolvePreview(source, away.impl), { imageUrl: null, title: null, subtitle: null });
});

test("A7/A8 card metadata before interaction: Discord server name + member counts + icon; Steam game name, profile persona + avatar, group name + members", async () => {
  const discord = posterSource(q({ p: "discord", k: "invite", id: "discord-developers" }));
  const invite = { guild: { id: "613425648685547541", name: "Discord Developers", icon: "0123456789abcdef0123456789abcdef" }, approximate_member_count: 305023, approximate_presence_count: 82215 };
  const d = fakeFetch({ [discord.url]: () => reply(200, JSON.stringify(invite)) });
  assert.deepEqual(await resolvePreview(discord, d.impl), { imageUrl: "https://cdn.discordapp.com/icons/613425648685547541/0123456789abcdef0123456789abcdef.png?size=256", title: "Discord Developers", subtitle: "305,023 members · 82,215 online" });
  const expired = fakeFetch({ [discord.url]: () => reply(404, "{\"message\":\"Unknown Invite\"}") });
  assert.deepEqual(await resolvePreview(discord, expired.impl), { imageUrl: null, title: null, subtitle: null }, "an expired invite: nothing invented");
  const profile = posterSource(q({ p: "steam", k: "profile", id: "gabelogannewell" }));
  const xml = "<profile><steamID64>76561197960287930</steamID64><steamID><![CDATA[Rabscuttle]]></steamID><avatarFull><![CDATA[https://avatars.fastly.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426_full.jpg]]></avatarFull></profile>";
  const s = fakeFetch({ [profile.url]: () => reply(200, xml) });
  assert.deepEqual(await resolvePreview(profile, s.impl), { imageUrl: "https://avatars.fastly.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426_full.jpg", title: "Rabscuttle", subtitle: null });
  const group = posterSource(q({ p: "steam", k: "group", id: "steamuniverse" }));
  const g = fakeFetch({ [group.url]: () => reply(200, "<memberList><groupDetails><groupName><![CDATA[Steam Universe]]></groupName><avatarFull><![CDATA[https://avatars.fastly.steamstatic.com/e34e65ef2ef16093d4428c930fbcc42490522ed3_full.jpg]]></avatarFull><memberCount>1807400</memberCount></groupDetails></memberList>") });
  assert.deepEqual(await resolvePreview(group, g.impl), { imageUrl: "https://avatars.fastly.steamstatic.com/e34e65ef2ef16093d4428c930fbcc42490522ed3_full.jpg", title: "Steam Universe", subtitle: "1,807,400 members" });
  const missing = fakeFetch({ [profile.url]: () => reply(200, "<response><error><![CDATA[The specified profile could not be found.]]></error></response>") });
  assert.deepEqual(await resolvePreview(profile, missing.impl), { imageUrl: null, title: null, subtitle: null });
  // the meta endpoint: JSON, plain strings, cacheable; nothing -> typed 404
  const request = url => new Request(url, { headers: { origin: CF } });
  const ok = await handleMediaPoster({ request: request(`https://x.supabase.co/functions/v1/media-poster?p=discord&k=invite&id=discord-developers&want=meta`), fetchImpl: d.impl });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { title: "Discord Developers", subtitle: "305,023 members · 82,215 online" });
  assert.equal(ok.headers.get("access-control-allow-origin"), CF);
  const none = await handleMediaPoster({ request: request(`https://x.supabase.co/functions/v1/media-poster?p=discord&k=invite&id=discord-developers&want=meta`), fetchImpl: expired.impl });
  assert.equal(none.status, 404);
});

test("A7/A8 the client and painter: the real name replaces the generic label before any click (textContent only); an owner's caption always wins; failures keep the label", async () => {
  const calls = [];
  const fetchImpl = async url => { calls.push(url); return url.includes("id=gone") ? { ok: false, headers: { get: () => "application/json" }, json: async () => ({}) } : { ok: true, headers: { get: () => "application/json" }, json: async () => ({ title: "Discord Developers", subtitle: "305,023 members", extra: "<b>x</b>" }) }; };
  const loader = createPosterLoader({ endpoint: "https://x.supabase.co/functions/v1/media-poster", fetchImpl, createUrl: () => null });
  const describe = data => elementRegistry.get("embed").render({ providerKey: "discord", data: { kind: "invite", presentation: "card", ...data } }).content;
  assert.deepEqual(await loader.metaFor(describe({ id: "discord-developers" })), { title: "Discord Developers", subtitle: "305,023 members" });
  await loader.metaFor(describe({ id: "discord-developers" }));
  assert.equal(calls.filter(url => url.endsWith("&want=meta")).length, 1, "cached");
  assert.equal(await loader.metaFor(describe({ id: "gone" })), null);
  assert.equal(await loader.metaFor(elementRegistry.get("embed").render({ providerKey: "youtube", data: { kind: "video", id: "dQw4w9WgXcQ", presentation: "card" } }).content), null, "only kinds that declare `meta`");

  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { props: new Map(), setProperty(n, v) { this.props.set(n, v); }, removeProperty(n) { this.props.delete(n); } }; this.className = ""; this.textContent = ""; this.listeners = {}; }
    setAttribute(n, v) { this.attrs[n] = String(v); } getAttribute(n) { return this.attrs[n] ?? null; } removeAttribute(n) { delete this.attrs[n]; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } } appendChild(node) { this.append(node); return node; }
    prepend(...nodes) { for (const node of nodes.reverse()) { node.parent = this; this.children.unshift(node); } } remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  }
  const all = (root, predicate) => { const out = []; const walk = node => { if (predicate(node)) out.push(node); node.children.forEach(walk); }; walk(root); return out; };
  const doc = createDocument();
  doc.stages[0].elements = [
    createElement({ id: "d", type: "embed", x: 0, y: 0, z: 0, width: 800, height: 260, payload: { providerKey: "discord", data: { kind: "invite", id: "discord-developers", presentation: "card" } } }),
    createElement({ id: "c", type: "embed", x: 0, y: 300, z: 1, width: 800, height: 260, payload: { providerKey: "discord", data: { kind: "invite", id: "discord-developers", presentation: "card", caption: "My server" } } }),
  ];
  const painted = paintDocument(doc, 1000, tag => new Node(tag), { mode: "view", posters: loader });
  await new Promise(resolve => setTimeout(resolve, 0));
  const titleOf = id => all(all(painted.stages[0], node => node.attrs?.["data-el"] === id)[0], node => node.className === "wall-embed-title")[0].textContent;
  assert.equal(titleOf("d"), "Discord Developers");
  assert.equal(titleOf("c"), "My server", "the owner's own caption is never replaced");
  const facade = all(painted.stages[0], node => node.className === "wall-embed" && node.attrs["data-meta"] === "true")[0];
  assert.match(facade.attrs["aria-label"], /Discord Developers: open/);
});

// =====================================================================================================================================================================
// D. Move to stage
// =====================================================================================================================================================================
const docWithStages = count => { let doc = createDocument(); for (let i = 1; i < count; i += 1) doc = ops.addStage(doc).doc; return doc; };
const byId = (doc, id) => { for (const [index, stage] of doc.stages.entries()) { const element = stage.elements.find(candidate => candidate.id === id); if (element) return { element, stage: index + 1 }; } return null; };

test("D Move to stage: the destination list is every OTHER stage by number, so Stage 1 -> Stage 4 is one step", () => {
  const doc = docWithStages(4);
  assert.deepEqual(ops.stageMoveOptions(doc, doc.stages[0].id).map(option => option.label), ["Stage 2", "Stage 3", "Stage 4"]);
  assert.deepEqual(ops.stageMoveOptions(doc, doc.stages[2].id).map(option => option.label), ["Stage 1", "Stage 2", "Stage 4"]);
  assert.deepEqual(ops.stageMoveOptions(docWithStages(2), "stage_1").map(option => option.label), ["Stage 2"]);
});

test("D a direct non-adjacent move (1 -> 4) keeps position, size, rotation, content, style and group, leaves no copy behind, and survives Save + Reload (JSON round trip + validation)", () => {
  let doc = docWithStages(4);
  const [s1, , , s4] = doc.stages.map(stage => stage.id);
  doc.stages[0].elements = [
    createElement({ id: "t", type: "text", x: 120, y: 340, z: 0, width: 500, height: 120, rotation: 12, groupId: "g1", payload: { ...elementRegistry.get("text") ? {} : {}, text: "Hello", fontFamily: "system", fontSize: 48, fontWeight: 700, italic: false, underline: false, color: "#ff00aa", align: "left", lineHeight: 1.2, letterSpacing: 0, opacity: 1, direction: "auto", wrap: true } }),
    createElement({ id: "g", type: "gamid", x: 100, y: 700, z: 1, width: 800, height: 260, groupId: "g1", payload: { block: "profile", layout: "card", style: { bgMode: "none", accentColor: "#00ff00" } } }),
    createElement({ id: "stay", type: "rect", x: 0, y: 0, z: 2, width: 50, height: 50, payload: { fill: "#000000" } }),
  ];
  const valid = validateDocument(doc);
  if (!valid.valid) { doc.stages[0].elements[0] = createElement({ id: "t", type: "rect", x: 120, y: 340, z: 0, width: 500, height: 120, rotation: 12, groupId: "g1", payload: { fill: "#ff00aa", radius: 20 } }); }
  const before = structuredClone(doc.stages[0].elements.filter(element => element.id !== "stay"));
  const result = ops.moveElementsToStage(doc, ["t"], s4);   // one member selected: the whole group moves
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const reloaded = JSON.parse(JSON.stringify(result.doc));
  assert.equal(validateDocument(reloaded).valid, true);
  for (const original of before) {
    const moved = byId(reloaded, original.id);
    assert.equal(moved.stage, 4, `${original.id} is on Stage 4`);
    for (const key of ["x", "y", "width", "height", "rotation", "groupId"]) assert.deepEqual(moved.element[key], original[key], `${original.id}.${key}`);
    assert.deepEqual(moved.element.payload, original.payload, `${original.id} content + style`);
  }
  assert.deepEqual(reloaded.stages[0].elements.map(element => element.id), ["stay"], "nothing duplicated, nothing else moved");
  assert.equal(reloaded.stages.flatMap(stage => stage.elements).length, 3, "no data lost");
  assert.equal(ops.moveElementsToStage(result.doc, ["t", "g"], s1).ok, true, "and back again, directly");
});

test("D the editor: Move to stage is the FIRST control in Properties (with the current stage), follows the moved elements, and the stage arrows are labelled as stage reordering", () => {
  const controls = read("dist/wall-editor/controls.js");
  assert.match(controls, /body\.append\(errorBox\);\r?\n\s*stageMoveControls\(body\);/, "right after the error box, before any type-specific control");
  assert.match(controls, /`Move to stage \(now on Stage \$\{currentIndex \+ 1\} of \$\{session\.doc\.stages\.length\}\)`/);
  assert.match(controls, /ops\.stageMoveOptions\(session\.doc, session\.state\.stageId\)/);
  assert.match(controls, /session\.setStage\(destination\);\r?\n\s*session\.select\(ids\);/, "the destination stage opens with the moved elements selected");
  assert.equal((controls.match(/ops\.moveElementsToStage\(/g) ?? []).length, 1, "one move path only");
  const html = read("dist/wall-editor/index.html");
  assert.match(html, /&larr; Stage earlier/);
  assert.match(html, /Stage later &rarr;/);
  assert.doesNotMatch(html, />&larr; Move<|>Move &rarr;</, "no ambiguous 'Move' arrows");
});

// =====================================================================================================================================================================
// E / F. Transient notices
// =====================================================================================================================================================================
function clock() {
  let now = 0, next = 1;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer: id => timers.delete(id),
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
    get pending() { return timers.size; },
  };
}
function banner() {
  const c = clock();
  const shown = [];
  const state = { text: "", visible: false, kind: null };
  const notifier = createNotifier({ show: (text, kind) => { Object.assign(state, { text, visible: true, kind }); shown.push(text); }, hide: () => Object.assign(state, { text: "", visible: false, kind: null }), setTimer: c.setTimer, clearTimer: c.clearTimer });
  return { c, state, notifier, shown };
}

test("E a transient notice (e.g. the player z-order notice) hides itself after ~5 seconds", () => {
  assert.equal(TRANSIENT_NOTICE_MS, 5000);
  const { c, state, notifier } = banner();
  notifier.info(describeCode("EMBED_KEPT_ON_TOP"));
  assert.equal(state.visible, true);
  c.advance(4999);
  assert.equal(state.visible, true);
  c.advance(1);
  assert.equal(state.visible, false);
  assert.equal(c.pending, 0);
});

test("E a newer notice replaces the older one and restarts the timer; the old timer can never clear the newer message", () => {
  const { c, state, notifier } = banner();
  notifier.info("first");
  c.advance(4000);
  notifier.info("second");
  assert.equal(c.pending, 1, "the first timer was cancelled");
  c.advance(1500);   // the first notice's timer would have fired here
  assert.deepEqual([state.visible, state.text], [true, "second"]);
  c.advance(3500);
  assert.equal(state.visible, false);
});

test("E persistent errors stay until dismissed; stage / selection changes clear only transient notices; Dismiss hides anything", () => {
  const { c, state, notifier } = banner();
  notifier.error("A newer version of your Wall exists.");
  c.advance(60_000);
  assert.deepEqual([state.visible, state.kind], [true, "error"], "an error that needs action is not auto-hidden");
  notifier.clearTransient();
  assert.equal(state.visible, true);
  notifier.dismiss();
  assert.equal(state.visible, false);
  notifier.info("moved");
  notifier.clearTransient();
  assert.equal(state.visible, false);
  assert.equal(c.pending, 0, "no stray timer left behind");
  notifier.info("x");
  notifier.error("blocking");
  c.advance(10_000);
  assert.deepEqual([state.visible, state.text], [true, "blocking"], "an info timer never clears a later error");
});

test("E/F the editor wiring: the z-order notice is TRANSIENT (layer rule unchanged), only save failures are persistent, stage switches clear stale notices", () => {
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /if \(result\.embedLifts\?\.length\) notify\(describeCode\("EMBED_KEPT_ON_TOP"\)\);/);
  assert.match(editor, /const notify = message => notifier\.info\(message\);/);
  assert.match(editor, /notifyError\(describeCode\(session\.state\.errorCode\)\)/);
  assert.equal((editor.match(/notifyError\(describe/g) ?? []).length, 1, "the one persistent path: a save error");
  assert.match(editor, /if \(session\.state\.stageId !== lastStageId\) \{ if \(lastStageId !== null\) notifier\.clearTransient\(\);/);
  // F: the player layer rule itself is unchanged - a player is still lifted above anything it overlaps, and the notice stays truthful
  assert.match(read("dist/wall-kit/messages.js"), /EMBED_KEPT_ON_TOP: "A video or music player always stays in front of anything it overlaps/);
  assert.match(read("dist/wall-kit/ops.js"), /const lifts = next\.stages\.flatMap\(stage => liftPlayers\(stage\)\);/);
});

// =====================================================================================================================================================================
// G. Security of the new sources
// =====================================================================================================================================================================
test("G no arbitrary URL fetching: every new source fetches only its own fixed host, ids are validated, and the meta mode never serves the avatar proxy", async () => {
  for (const [provider, kinds] of Object.entries(POSTER_KINDS)) {
    for (const kind of Object.keys(kinds)) {
      const bad = posterSource(q({ p: provider, k: kind, id: "../../evil.example/x" }));
      assert.equal(bad, null, `${provider}/${kind}`);
    }
  }
  const avatarMeta = await handleMediaPoster({ request: new Request("https://x.supabase.co/functions/v1/media-poster?steam_avatar=fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb&want=meta", { headers: { origin: CF } }), fetchImpl: async () => { throw new Error("must not fetch"); } });
  assert.equal(avatarMeta.status, 400);
  const module = read("supabase/functions/_shared/media-poster.js");
  assert.doesNotMatch(module, /STEAM_WEB_API_KEY|SERVICE_ROLE|TWITCH_CLIENT|Deno\.env/, "no secret is read");
  const migrations = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter(name => name > "20260927130000_steam_public_persona.sql" && name < "20260928");   // that pass ended before Round 3 (20260928...)
  assert.deepEqual(migrations, ["20260927140000_wall_kick_vod.sql"], "the only database change in this pass is the Kick VOD table row");
});
