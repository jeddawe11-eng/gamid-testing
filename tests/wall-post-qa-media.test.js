// Post-manual-QA fixes (media): B card / link / player minimum sizes and never-clipped facades, C the player's "Watch on YouTube" new tab.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { paintDocument, facadeLayout, FACADE } from "../dist/wall-kit/paint.js";
import { createPlayerManager, fitsInline } from "../dist/wall-kit/embed/player.js";
import { PROVIDERS, detectEmbed, buildEmbedPayload, frameOrigins, isAllowedOpenUrl, isAllowedFrameUrl, mediaCapabilities, MEDIA_PROVIDER_ORDER } from "../dist/wall-kit/embed/index.js";
import * as ops from "../dist/wall-kit/ops.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
class PaintNode {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.style = { setProperty: (name, value) => this.props.set(name, value) }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { nodes.forEach(node => this.children.push(node)); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
}
const make = tag => new PaintNode(tag);
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const embedEl = (id, providerKey, data, geometry = {}) => createElement({ id, type: "embed", x: 0, y: 0, width: 800, height: 260, z: 0, ...geometry, payload: { providerKey, data } });
const docOf = (...elements) => { const doc = createDocument(); doc.stages[0].elements = elements; return doc; };
const byId = (doc, id) => doc.stages[0].elements.find(element => element.id === id);
const ytCard = { kind: "video", id: "dQw4w9WgXcQ", presentation: "card" };
const ytLink = { kind: "video", id: "dQw4w9WgXcQ", presentation: "link" };
const ytPlayer = { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" };

// The height a facade's content needs, from the same constants the painter uses.
function contentHeight(presentation, layout) {
  if (presentation === "link") return 2 * layout.padding + FACADE.border + FACADE.linkTitle;
  const items = [layout.showChip && FACADE.chip, FACADE.title * layout.titleLines, layout.showHint && FACADE.hint].filter(Boolean);
  return 2 * layout.padding + FACADE.border + (layout.showPlay ? FACADE.play : 0) + items.reduce((sum, h) => sum + h, 0) + FACADE.gap * (items.length - 1);
}

// ---------- B: minimums ----------
test("B minimums: card 300x150, link 300x80, players keep theirs (YouTube 334x195 from its documented tile; others the smallest facade) - all above the 24px touch floor", () => {
  const min = element => { const { width, height } = ops.minSizeOf(element); return [width, height]; };
  assert.deepEqual(min(embedEl("c", "youtube", ytCard)), [300, 150]);
  assert.deepEqual(min(embedEl("c", "steam", { kind: "profile", id: "gabelogannewell", presentation: "card" })), [300, 150], "a profile / no-player card too");
  assert.deepEqual(min(embedEl("l", "youtube", ytLink)), [300, 80]);
  assert.deepEqual(min(embedEl("p", "youtube", ytPlayer)), [334, 195], "the accepted YouTube player minimum is unchanged");
  assert.deepEqual(min(embedEl("p", "youtube", { ...ytPlayer, aspect: "9:16" })), [195, 334]);
  assert.deepEqual(min(embedEl("s", "spotify", { kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC", presentation: "embed" })), [200, 140]);
  for (const [w, h] of [[300, 150], [300, 80], [200, 140]]) assert.ok(w >= ops.pxToMinUnits(24) && h >= ops.pxToMinUnits(24));
});

test("B a CARD cannot be resized into a broken box: every handle, pinch and group resize stops at its minimum (manual-QA bug)", () => {
  const doc = docOf(embedEl("c", "youtube", ytCard, { x: 100, y: 100 }));
  const lock = ops.lockedAspect(byId(doc, "c"));
  for (const [handle, dx, dy] of [["se", -9999, -9999], ["nw", 9999, 9999], ["e", -9999, 0], ["w", 9999, 0]]) {
    const after = byId(ops.resizeElement(doc, "c", handle, dx, dy, { keepAspect: lock }).doc, "c");
    assert.ok(after.width >= 300 && after.height >= 150, `${handle}: ${after.width}x${after.height}`);
  }
  const free = byId(ops.resizeElement(doc, "c", "se", -9999, -9999).doc, "c");
  assert.deepEqual([free.width, free.height], [300, 150], "even an unlocked resize stops at the card minimum");
  const pinched = byId(ops.scaleSelection(doc, ["c"], 0.01).doc, "c");
  assert.ok(pinched.width >= 300 && pinched.height >= 150);
  const typed = byId(ops.updateGeometry(doc, "c", { width: 20, height: 20 }).doc, "c");
  assert.deepEqual([typed.width, typed.height], [300, 150]);
  const link = docOf(embedEl("l", "youtube", ytLink, { width: 640, height: 96 }));
  const tinyLink = byId(ops.resizeElement(link, "l", "se", -9999, -9999).doc, "l");
  assert.deepEqual([tinyLink.width, tinyLink.height], [300, 80]);
  // the YouTube PLAYER keeps its own (accepted) minimum and aspect
  const player = docOf(embedEl("p", "youtube", ytPlayer, { width: 800, height: 450 }));
  const tinyPlayer = byId(ops.resizeElement(player, "p", "se", -9999, -9999, { keepAspect: ops.lockedAspect(byId(player, "p")) }).doc, "p");
  assert.ok(tinyPlayer.width >= 334 && tinyPlayer.height >= 195 && Math.abs(tinyPlayer.width / tinyPlayer.height - 16 / 9) < 0.01);
});

test("B facades are never clipped: at EVERY size from the minimum up, what a card / link / player shows fits inside its box", () => {
  for (const presentation of ["card", "embed", "link"]) {
    const min = presentation === "card" ? ops.CARD_MIN : presentation === "link" ? ops.LINK_MIN : { width: 334, height: 195 };
    for (let h = min.height; h <= 1200; h += 7) {
      const layout = facadeLayout(presentation, min.width, h);
      assert.ok(contentHeight(presentation, layout) <= h, `${presentation} ${min.width}x${h}: needs ${contentHeight(presentation, layout)}`);
      assert.ok(layout.titleLines >= 1, "the title always shows");
    }
  }
  assert.deepEqual(facadeLayout("card", 300, 150), { padding: 20, showChip: true, showHint: false, titleLines: 1, showPlay: false }, "at the minimum: chip + title");
  assert.deepEqual(facadeLayout("card", 800, 260), { padding: 30, showChip: true, showHint: true, titleLines: 2, showPlay: false }, "the default card: chip, two title lines, hint");
  assert.equal(facadeLayout("embed", 334, 195).showChip, false, "a minimum-size player tile keeps its ▶ and title");
  assert.equal(facadeLayout("link", 300, 80).showChip, false);
  assert.equal(facadeLayout("link", 640, 96).showHint, true);
});

test("B painted: a minimum-size card shows its provider and title (no hint) with the title clamped; a default card shows the hint; a link title ellipsizes", () => {
  const doc = docOf(embedEl("small", "steam", { kind: "profile", id: "gabelogannewell", presentation: "card" }, { width: 300, height: 150 }), embedEl("big", "steam", { kind: "profile", id: "gabelogannewell", presentation: "card" }, { y: 300 }), embedEl("link", "youtube", ytLink, { y: 700, width: 300, height: 80 }));
  const [stage] = paintDocument(doc, 1000, make, { mode: "view" }).stages;
  const box = id => stage.children.find(node => node.attrs["data-el"] === id);
  const classes = id => all(box(id), node => typeof node.className === "string" && node.className.startsWith("wall-embed-")).map(node => node.className);
  assert.deepEqual(classes("small"), ["wall-embed-provider", "wall-embed-title"]);
  assert.deepEqual(classes("big"), ["wall-embed-provider", "wall-embed-title", "wall-embed-hint"]);
  const title = all(box("small"), node => node.className === "wall-embed-title")[0];
  assert.equal(title.props.get("-webkit-line-clamp"), "1");
  assert.equal(title.props.get("overflow"), "hidden");
  const linkTitle = all(box("link"), node => node.className === "wall-embed-title")[0];
  assert.deepEqual([linkTitle.props.get("white-space"), linkTitle.props.get("text-overflow"), linkTitle.props.get("min-width")], ["nowrap", "ellipsis", "0"]);
  const anchor = all(box("small"), node => node.tag === "a")[0];
  assert.match(anchor.attrs["aria-label"], /Steam Profile: open/, "the full meaning stays available to assistive tech");
});

// ---------- C: Watch on YouTube ----------
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { props: new Map(), setProperty(name, value) { this.props.set(name, value); }, removeProperty(name) { this.props.delete(name); } }; this.listeners = {}; this.className = ""; this.textContent = ""; this.parent = null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; } }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  focus() {}
}
test("C a player's own 'Watch on YouTube' opens a real, unsandboxed tab: popups escape the sandbox, the player frame itself stays sandboxed and cannot navigate the Wall", () => {
  const doc = new Node("document"); doc.body = new Node("body"); doc.createElement = tag => new Node(tag); doc.removeEventListener = () => {};
  const manager = createPlayerManager({ doc, hostname: "gamid-testing-static.gamid.workers.dev", viewport: () => ({ width: 1200, height: 900 }) });
  const describe = data => elementRegistry.get("embed").render({ providerKey: "youtube", data }).content;
  const box = new Node("div");
  manager.activate(box, describe(ytPlayer), { widthPx: 800, heightPx: 500 });
  const inline = (function find(node) { return node.tag === "iframe" ? node : node.children.map(find).find(Boolean); })(box);
  manager.activate(new Node("div"), describe({ ...ytPlayer, id: "abcdEFGhijk" }), { widthPx: 150, heightPx: 90 });
  const expanded = (function find(node) { return node.tag === "iframe" ? node : node.children.map(find).find(Boolean); })(doc.body);
  for (const frame of [inline, expanded]) {
    const flags = frame.attrs.sandbox.split(" ");
    assert.ok(flags.includes("allow-popups") && flags.includes("allow-popups-to-escape-sandbox"), "a user-opened youtube.com tab (COOP: same-origin-allow-popups) is not refused");
    assert.ok(flags.includes("allow-scripts") && flags.includes("allow-same-origin"));
    assert.equal(flags.some(flag => flag.startsWith("allow-top-navigation")), false, "the player can never navigate the Wall page itself");
    assert.equal(flags.includes("allow-modals"), false);
  }
  manager.destroyAll();
  assert.match(read("dist/wall-kit/embed/player.js"), /ERR_BLOCKED_BY_RESPONSE/, "the reason is documented next to the flag");
});

// ---------- D / E / F: provider set, capability matrix, per-provider shapes ----------
const matrix = () => Object.fromEntries(mediaCapabilities().map(entry => [entry.key, Object.fromEntries(entry.kinds.map(kind => [kind.kind, kind.presentations.join("|")]))]));

test("D capability matrix: the requested Media & Links providers in order, each with ONLY the modes that really work (a Player only where it was verified to play)", () => {
  const list = mediaCapabilities();
  assert.deepEqual(list.filter(entry => entry.featured).map(entry => entry.label), ["YouTube", "TikTok", "Twitch", "Spotify", "SoundCloud", "Vimeo", "Kick", "Facebook", "Snapchat", "X / Twitter", "Instagram"]);
  assert.deepEqual(list.filter(entry => !entry.featured).map(entry => entry.key), ["discord", "steam"], "still supported, listed after them");
  const P = "embed|card|link", C = "card|link";
  assert.deepEqual(matrix(), {
    youtube: { video: P, playlist: P, channel: C },
    tiktok: { video: P, profile: C },
    twitch: { channel: P, video: P, clip: P },
    spotify: { track: P, episode: P, album: P, playlist: P, show: P, artist: P },
    soundcloud: { track: P, playlist: P, profile: P },
    vimeo: { video: P, profile: C },
    kick: { channel: P },
    facebook: { video: C, reel: C, page: C },
    snapchat: { spotlight: P, profile: C },
    x: { post: P, profile: C },
    instagram: { post: P, reel: P, profile: C },
    discord: { invite: C },
    steam: { app: P, profile: C, group: C },
  });
  assert.equal(list.find(entry => entry.key === "facebook").player, false);
  for (const entry of list) assert.ok(entry.examples.length > 5, `${entry.key} tells the owner what to paste`);
  assert.deepEqual([...MEDIA_PROVIDER_ORDER], list.filter(entry => entry.featured).map(entry => entry.key));
});

test("D unsupported Player modes can never be chosen: the engine refuses them and the editor never offers them", () => {
  const refuse = url => buildEmbedPayload(detectEmbed(url), { presentation: "embed" }).errors;
  for (const url of ["https://www.facebook.com/watch/?v=10153231379946729", "https://www.facebook.com/reel/1234567890123", "https://www.facebook.com/NASA", "https://www.snapchat.com/add/snapchat", "https://vimeo.com/staff", "https://www.tiktok.com/@scout2015"]) assert.deepEqual(refuse(url), ["INVALID_PRESENTATION"], url);
  for (const url of ["https://kick.com/xqc", "https://vimeo.com/76979871", "https://soundcloud.com/forss", "https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYdWxvYnBhaHR3AaARhNpsAaARhNmWAAAAAQ"]) assert.deepEqual(refuse(url), [], url);
  for (const url of ["https://www.facebook.com/NASA", "https://www.snapchat.com/add/snapchat"]) assert.deepEqual(detectEmbed(url).presentations, ["card", "link"], `${url} is never offered as a Player`);
  const controls = read("dist/wall-editor/controls.js");
  assert.match(controls, /\.\.\.\(kind\?\.inline \? \[\{ value: "embed", label: "Player" \}\] : \[\]\)/, "Show as offers Player only for an inline kind");
});

test("D normalisation & allowlists for the new providers: only parts are stored, every address is rebuilt on the provider's own hosts, look-alikes and short links are refused", () => {
  const canon = url => detectEmbed(url).canonicalUrl;
  assert.equal(canon("https://soundcloud.com/Forss/Flickermood?si=x"), "https://soundcloud.com/forss/flickermood");
  assert.equal(canon("https://player.vimeo.com/video/76979871?h=abcdef1234&autoplay=1"), "https://vimeo.com/76979871/abcdef1234");
  assert.equal(canon("https://player.kick.com/xqc"), "https://kick.com/xqc");
  assert.equal(canon("https://m.facebook.com/facebook/videos/some-title/10153231379946729/"), "https://www.facebook.com/watch/?v=10153231379946729");
  assert.equal(canon("https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYdWxvYnBhaHR3AaARhNpsAaARhNmWAAAAAQ/embed"), "https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYdWxvYnBhaHR3AaARhNpsAaARhNmWAAAAAQ");
  assert.equal(canon("https://www.tiktok.com/@scout2015/video/6718335390845095173"), "https://www.tiktok.com/@/video/6718335390845095173", "opens the video on TikTok itself");
  const reason = url => detectEmbed(url).reason;
  assert.equal(reason("https://fb.watch/abc123/"), "UNRECOGNIZED_CONTENT", "short links cannot be resolved without following a third-party redirect");
  assert.equal(reason("https://on.soundcloud.com/abc123"), "UNRECOGNIZED_CONTENT");
  assert.equal(reason("https://soundcloud.com/forss/flickermood/s-SeCrEt"), "UNRECOGNIZED_CONTENT", "private (secret-link) tracks are not accepted");
  assert.equal(reason("https://kick.com/xqc/clips/clip_01ABC"), "UNRECOGNIZED_CONTENT", "Kick clips / VODs have no documented player");
  assert.equal(reason("https://vimeo.com/channels"), "UNRECOGNIZED_CONTENT");
  assert.equal(reason("https://www.facebook.com/groups/123"), "UNRECOGNIZED_CONTENT");
  for (const url of ["https://vimeo.com.evil.example/76979871", "https://evilsoundcloud.com/forss/x", "https://kick.com.evil.example/xqc", "https://snapchat.com.evil.example/spotlight/abcdefghijklmnopqrstu"]) assert.equal(reason(url), "UNSUPPORTED_SITE", url);
  for (const url of ["javascript:alert(1)", "data:text/html,x", "<iframe src=https://player.vimeo.com/video/76979871></iframe>"]) assert.notEqual(detectEmbed(url).ok, true, url);
  const stored = buildEmbedPayload(detectEmbed("https://soundcloud.com/forss/flickermood?utm_source=evil"), { presentation: "embed" }).payload;
  assert.deepEqual(stored, { providerKey: "soundcloud", data: { kind: "track", id: "forss/flickermood", presentation: "embed" } });
  for (const provider of PROVIDERS.values()) for (const origin of provider.frameOrigins) assert.ok(/^https:\/\/[a-z0-9.-]+$/.test(origin), `${origin}: an exact https origin, never a wildcard`);
  assert.equal(isAllowedFrameUrl("vimeo", "https://player.vimeo.com/video/76979871?dnt=1"), true);
  assert.equal(isAllowedFrameUrl("vimeo", "https://w.soundcloud.com/player/"), false, "another provider's origin is not this provider's");
  assert.equal(isAllowedOpenUrl("facebook", "https://www.facebook.com.evil.example/x"), false);
});

test("D CSP: the editor page's frame-src is EXACTLY the adapters' player origins - the four new player hosts added, Facebook adds none, no wildcard", () => {
  const html = read("dist/wall-editor/index.html");
  const frameSrc = html.match(/frame-src ([^;]+);/)[1].split(" ").sort();
  assert.deepEqual(frameSrc, frameOrigins());
  for (const origin of ["https://w.soundcloud.com", "https://player.vimeo.com", "https://player.kick.com", "https://www.snapchat.com"]) assert.ok(frameSrc.includes(origin), origin);
  assert.equal(frameSrc.some(origin => /facebook|\*/.test(origin)), false);
  assert.match(html, /script-src 'self';/, "providers add frames only - never scripts");
});

test("D the SQL provider table (latest migration) carries every new provider kind exactly - saved Walls with them validate server-side too", () => {
  const sql = read("supabase/migrations/20260927100000_wall_provider_capabilities.sql");
  for (const provider of PROVIDERS.values()) for (const [kind, spec] of Object.entries(provider.kinds)) assert.ok(sql.includes(`('${provider.key}', '${kind}', '${spec.id}', ${spec.inline === true})`), `${provider.key}/${kind}`);
  assert.match(sql, /create or replace function private\.wall_embed_specs\(\)/);
  assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\bupdate\b|\btruncate\b/i, "additive: no data is touched");
});

test("F shapes are per provider and per content - never YouTube's list copied: vertical-first TikTok, Twitch 16:9/4:3, fixed Kick / Snapchat, self-sizing audio and posts", () => {
  const shapes = key => Object.fromEntries(mediaCapabilities().find(entry => entry.key === key).kinds.filter(kind => kind.aspects.length).map(kind => [kind.kind, kind.aspects]));
  assert.deepEqual(shapes("youtube"), { video: ["16:9", "9:16", "1:1", "4:3"], playlist: ["16:9", "4:3"] });
  assert.deepEqual(shapes("tiktok"), { video: ["9:16", "1:1", "16:9"] });
  assert.equal(PROVIDERS.get("tiktok").kinds.video.aspect, "9:16", "TikTok starts vertical");
  assert.deepEqual(shapes("twitch"), { channel: ["16:9", "4:3"], video: ["16:9", "4:3"], clip: ["16:9", "4:3"] });
  assert.deepEqual(shapes("vimeo"), { video: ["16:9", "9:16", "1:1", "4:3"] });
  assert.deepEqual(shapes("kick"), { channel: ["16:9"] });
  assert.deepEqual(shapes("snapchat"), { spotlight: ["9:16"] });
  for (const key of ["spotify", "soundcloud", "instagram", "x"]) for (const aspects of Object.values(shapes(key))) assert.deepEqual(aspects, ["auto"], `${key} sizes itself to its box`);
});

test("F Shape change refits the element and a resize keeps the SELECTED shape - TikTok 9:16 -> 1:1 -> 16:9, Twitch 16:9 -> 4:3, Vimeo 16:9 -> 9:16", () => {
  const cases = [["tiktok", { kind: "video", id: "6718335390845095173" }, [["1:1", 1], ["16:9", 16 / 9], [undefined, 9 / 16]]], ["twitch", { kind: "clip", id: "FunnySlug-abcdef" }, [["4:3", 4 / 3], [undefined, 16 / 9]]], ["vimeo", { kind: "video", id: "76979871" }, [["9:16", 9 / 16], ["1:1", 1]]]];
  for (const [providerKey, data, steps] of cases) {
    const kind = PROVIDERS.get(providerKey).kinds[data.kind];
    let doc = ops.addCustomElement(createDocument(), "stage_1", { type: "embed", payload: { providerKey, data: { ...data, presentation: "embed" } }, width: kind.size.width, height: kind.size.height }).doc;
    const id = doc.stages[0].elements[0].id;
    for (const [aspect, ratio] of steps) {
      doc = ops.setEmbedData(doc, id, { aspect }).doc;
      const element = byId(doc, id);
      assert.ok(Math.abs(element.width / element.height - ratio) < 0.01, `${providerKey} ${aspect}: ${element.width}x${element.height}`);
      const resized = byId(ops.resizeElement(doc, id, "se", 150, 20, { keepAspect: ops.lockedAspect(element) }).doc, id);
      assert.ok(Math.abs(resized.width / resized.height - ratio) < 0.01, `${providerKey} ${aspect} after resize`);
    }
  }
  assert.equal(ops.setEmbedData(docOf(embedEl("k", "kick", { kind: "channel", id: "xqc", presentation: "embed" }, { width: 800, height: 450 })), "k", { aspect: "9:16" }).ok, false, "a shape the provider does not offer is refused");
  const controls = read("dist/wall-editor/controls.js");
  assert.match(controls, /element\.payload\.data\.presentation === "embed" && shapes\.length > 1\) root\.append\(selectField\(\{ label: "Shape"/, "Shape is offered only for a Player, from the adapter's own list");
  assert.match(controls, /set by \$\{provider\?\.label \?\? "the provider"\}'s player/, "a fixed-shape player says so");
});

test("D Twitch honours its documented 400x300 minimum: inline only when the fitted frame reaches it; on a phone in portrait it opens on Twitch instead of a too-small player", () => {
  const describe = data => elementRegistry.get("embed").render({ providerKey: "twitch", data: { presentation: "embed", ...data } }).content;
  const wide = describe({ kind: "channel", id: "shroud" });
  assert.equal(fitsInline(wide, 500, 300), false, "a 16:9 frame fitted in 500x300 is 500x281 - below 300 tall");
  assert.equal(fitsInline(wide, 600, 400), true);
  assert.equal(fitsInline(describe({ kind: "channel", id: "shroud", aspect: "4:3" }), 400, 300), true, "4:3 reaches the minimum in a narrower box");
  const opened = [];
  globalThis.open = (...args) => opened.push(args[0]);
  const doc = new Node("document"); doc.body = new Node("body"); doc.createElement = tag => new Node(tag); doc.removeEventListener = () => {}; doc.addEventListener = () => {};
  const phone = createPlayerManager({ doc, hostname: "gamid-testing-static.gamid.workers.dev", viewport: () => ({ width: 390, height: 844 }) });
  phone.activate(new Node("div"), wide, { widthPx: 300, heightPx: 200 });
  assert.equal(doc.body.children.length, 0, "no player below Twitch's minimum");
  assert.deepEqual(opened, ["https://www.twitch.tv/shroud"]);
  const desktop = createPlayerManager({ doc, hostname: "gamid-testing-static.gamid.workers.dev", viewport: () => ({ width: 1280, height: 800 }) });
  desktop.activate(new Node("div"), wide, { widthPx: 300, heightPx: 200 });
  const frame = (function find(node) { return node.tag === "iframe" ? node : node.children.map(find).find(Boolean); })(doc.body);
  assert.ok(parseInt(frame.style.props.get("width"), 10) >= 400 && parseInt(frame.style.props.get("height"), 10) >= 300, "the larger in-page player meets it");
  desktop.destroyAll();
  delete globalThis.open;
});

test("E provider discovery: the Media & Links panel lists every platform with its real modes, and each button opens what can be pasted for it (not decorative)", () => {
  const html = read("dist/wall-editor/index.html");
  assert.match(html, /id="mediaProviders" class="ed-providers" role="list"/);
  assert.match(html, /id="mediaProviderInfo" class="ed-provider-info" aria-live="polite" hidden/);
  assert.match(html, /<b>Player<\/b> plays on your Wall, <b>Card<\/b> and <b>Link<\/b> open it on the platform/);
  const tools = read("dist/wall-editor/tools.js");
  assert.match(tools, /const capabilities = mediaCapabilities\(\);/, "built from the adapters - no hand-written provider list");
  assert.match(tools, /"aria-expanded": "false", "aria-controls": "mediaProviderInfo"/);
  assert.match(tools, /onclick: \(\) => \{ openProvider = openProvider === entry\.key \? null : entry\.key; renderProviderInfo\(\); \}/);
  assert.match(tools, /Paste: \$\{entry\.examples\}/);
  const css = read("dist/wall-editor/editor.css");
  assert.match(css, /\.ed-providers \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(7rem, 1fr\)\);/, "wraps on a phone, several per row on desktop");
  assert.match(css, /\.ed-provider \{[^}]*min-width: 0;[^}]*min-height: 2\.9rem;/);
});
