// Post-Round 2 acceptance (second pass): the Steam connection avatar in the connection detail sheet and on the owner's editor canvas, and Instagram's honest
// Card / Link capability (no Player - an Instagram platform limitation) with saved Instagram Players staying valid.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWallDetails } from "../dist/wall-kit/gamid-details.js";
import { paintGamidBlock } from "../dist/wall-kit/gamid-blocks.js";
import { publicConnections, loadGamidSnapshot } from "../dist/wall-editor/gamid-data.js";
import { renderGamidPayload } from "../dist/wall-kit/gamid.js";
import { detectEmbed, mediaCapabilities, frameOrigins } from "../dist/wall-kit/embed/index.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import * as ops from "../dist/wall-kit/ops.js";
import "../dist/wall-kit/register.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const AVATAR = "https://avatars.steamstatic.com/1756d62447ed20e683a2867e984d92311c7595e2_full.jpg";
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { props: new Map(), setProperty(n, v) { this.props.set(n, v); } }; this.className = ""; this.textContent = ""; this.listeners = {}; this.hidden = false; this.dataset = {}; }
  setAttribute(n, v) { this.attrs[n] = String(v); } getAttribute(n) { return this.attrs[n] ?? null; }
  append(...nodes) { for (const node of nodes) if (node && typeof node === "object") { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  fire(type) { for (const handler of this.listeners[type] || []) handler({ target: this }); }
  focus() {}
}
const element = (tag, className, text) => { const n = new Node(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const all = (root, predicate) => { const out = []; const walk = node => { if (predicate(node)) out.push(node); node.children.forEach(walk); }; walk(root); return out; };
const steamSection = { steam_id: "76561198205768860", trust_status: "CONNECTED", persona_name: "HAMZA", avatar_url: AVATAR, profile_url: "https://steamcommunity.com/id/HAMZA010/" };

test("A1 root cause: the stored avatar reached the public view, but the connection DETAIL sheet never drew it - it now shows [avatar] HAMZA / CONNECTED / Open Steam profile", async () => {
  const [steam] = publicConnections({ steam: steamSection });
  assert.deepEqual([steam.name, steam.avatarQuery, steam.actions[0].url], ["HAMZA", "steam_avatar=1756d62447ed20e683a2867e984d92311c7595e2", "https://steamcommunity.com/id/HAMZA010/"]);
  const asked = [];
  const posters = { ready: () => null, load: async query => { asked.push(query); return "blob:avatar"; } };
  const mounted = [];
  const details = createWallDetails({ element, handle: "zshot", api: { getPublicMyGames: async () => ({ games: [] }) }, mount: node => mounted.push(node), posters });
  details.openConnection(steam, element("button"));
  await new Promise(resolve => setTimeout(resolve, 0));
  const sheet = mounted[1];
  const [avatar] = all(sheet, node => node.tag === "img");
  assert.equal(avatar.className, "wall-connection-detail-avatar");
  assert.equal(avatar.attrs.src, "blob:avatar", "loaded only through GamID's image proxy");
  assert.equal(avatar.attrs.alt, "");
  avatar.fire("load");
  assert.equal(avatar.attrs["data-ready"], "true");
  const title = all(sheet, node => node.className === "pg-detail-title")[0];
  assert.deepEqual(title.children.map(node => node.className), ["wall-connection-detail-avatar", "pg-detail-name"], "the avatar sits before the name");
  assert.match(all(sheet, node => node.className === "pg-detail-name")[0].textContent, /^HAMZA$/);
  assert.equal(all(sheet, node => node.tag === "a")[0].attrs.href, "https://steamcommunity.com/id/HAMZA010/");
  assert.deepEqual(asked, ["steam_avatar=1756d62447ed20e683a2867e984d92311c7595e2"]);
  // no avatar / no loader: the name alone, as before - never a broken image
  const bare = createWallDetails({ element, handle: "zshot", api: {}, mount: () => {}, posters: null });
  bare.openConnection({ ...steam }, element("button"));
  assert.match(read("dist/wall-editor/editor.js"), /sourceLabels: PUBLIC_SOURCE_LABELS, posters \}\)/, "the editor gives the sheet its image loader");
  assert.match(read("dist/wall-kit/wall-kit.css"), /\.wall-details \.wall-connection-detail-avatar\[data-ready="true"\] \{ opacity: 1; \}/);
});

test("A1 the owner's editor canvas draws the Steam avatar too (it used to show only the label and name); the SteamID64 is still never shown", async () => {
  const api = {
    getIdentity: async () => ({ gamid_handle: "black", display_name: "Espada" }), getIdentityProfile: async () => ({}), getMyPublicGamesSettings: async () => null, getMyGameDisplaySettings: async () => ({}),
    getMyDiscoveredGames: async () => [], getMyManualGames: async () => [],
    getMyConnections: async () => [{ provider_key: "steam", connected: true, is_public: true, provider_username: "76561198205768860", provider_display_name: "HAMZA", provider_avatar_url: AVATAR }, { provider_key: "discord", connected: true, is_public: true, provider_username: "x", provider_display_name: "X", provider_avatar_url: "https://cdn.discordapp.com/avatars/1/abc.png" }],
  };
  const snapshot = await loadGamidSnapshot(api);
  assert.deepEqual(snapshot.connections, [{ key: "steam", label: "Steam", name: "HAMZA", avatarQuery: "steam_avatar=1756d62447ed20e683a2867e984d92311c7595e2" }, { key: "discord", label: "Discord", name: "X" }], "only Steam avatars go through the proxy");
  const posters = { ready: () => "blob:known", load: async () => "blob:known" };
  const root = paintGamidBlock(renderGamidPayload({ block: "connections", layout: "card" }), snapshot, tag => new Node(tag), { interactive: false, posters });
  const [img] = all(root, node => node.tag === "img");
  assert.equal(img.attrs.src, "blob:known");
  assert.equal(JSON.stringify(root.children.map(function text(node) { return [node.textContent, ...node.children.map(text)]; })).includes("76561198205768860"), false);
});

test("A2 Instagram: no Player (Instagram does not play Reels / videos inside third-party pages for logged-out visitors; its official embed needs a Meta token + its own script) - Card / Link with the real poster", () => {
  for (const url of ["https://www.instagram.com/reel/C0hQSaMpD97/", "https://www.instagram.com/p/DLLQqjCMkiN/", "https://www.instagram.com/nasagoddard/reel/C0hQSaMpD97/"]) {
    const detected = detectEmbed(url);
    assert.deepEqual([detected.ok, detected.presentations, detected.inline], [true, ["card", "link"], false], url);
  }
  const instagram = mediaCapabilities().find(entry => entry.key === "instagram");
  assert.equal(instagram.player, false, "the Supported platforms list no longer advertises a Player");
  assert.equal(frameOrigins().includes("https://www.instagram.com"), false);
  assert.doesNotMatch(read("dist/wall-editor/index.html"), /instagram\.com/, "the page policy no longer allows an Instagram frame");
  assert.match(read("dist/wall-kit/embed/providers/instagram.js"), /Instagram platform limitation/);
});

test("A2 a Wall saved while Instagram offered a Player stays valid (browser and database) and is drawn as a Card with its poster - never a Play button that leaves the page", () => {
  const doc = createDocument();
  doc.stages[0].elements = [createElement({ id: "ig", type: "embed", x: 0, y: 0, z: 0, width: 540, height: 700, payload: { providerKey: "instagram", data: { kind: "reel", id: "C0hQSaMpD97", presentation: "embed" } } })];
  assert.equal(validateDocument(doc).valid, true);
  const descriptor = elementRegistry.get("embed").render(doc.stages[0].elements[0].payload).content;
  assert.deepEqual([descriptor.presentation, descriptor.inline, descriptor.embedUrl, descriptor.poster], ["card", false, null, true]);
  assert.deepEqual(ops.minSizeOf(doc.stages[0].elements[0]), { width: ops.CARD_MIN.width, height: ops.CARD_MIN.height });
  const fresh = createDocument();
  fresh.stages[0].elements = [createElement({ id: "p", type: "embed", x: 0, y: 0, z: 0, width: 540, height: 700, payload: { providerKey: "facebook", data: { kind: "video", id: "10153231379946729", presentation: "embed" } } })];
  assert.equal(validateDocument(fresh).valid, false, "legacy acceptance is only for kinds that really offered a Player before (Facebook never did)");
  const sql = read("supabase/migrations/20260927140000_wall_kick_vod.sql");
  assert.match(sql, /\('instagram', 'reel', '\^\[A-Za-z0-9_-\]\{5,30\}\$', true\)/, "the database table still accepts saved Instagram Players (no migration needed)");
});
