// Wall Round 3 - LIVE GamID DATA elements: bindings (never copies), owner-only pickers, visitor resolution from the anonymous public view only, missing-data
// diagnostics, privacy (no SteamID64, no provider ids persisted) and reuse of the Text / Artwork / GamID block primitives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import { createGamidDataPayload, validateGamidDataPayload, renderGamidDataPayload, dataTextStyle, gameRef, DATA_FIELDS, DATA_FIELD_INFO } from "../dist/wall-kit/gamid-data.js";
import { resolveGamidData } from "../dist/wall-kit/gamid-data-paint.js";
import { loadGamidSnapshot, loadPublicView } from "../dist/wall-editor/gamid-data.js";
import * as ops from "../dist/wall-kit/ops.js";

const STEAM_ID = "76561198000000001";
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.style = { setProperty: (n, v) => this.props.set(n, v) }; this.dataset = {}; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  getAttribute(n) { return this.attrs[n] ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = [...nodes]; this._text = ""; }
  addEventListener() {}
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  set innerHTML(_) { throw new Error("innerHTML is forbidden"); }
}
const make = tag => new Node(tag);
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const data = (id, payload, extra = {}) => createElement({ id, type: "gamidData", x: 100, y: 100, width: 800, height: 200, z: 0, payload, ...extra });
const docWith = (...elements) => { const d = createDocument(); d.stages[0].elements = elements; return d; };

// an owner account with real-looking data (fixture - never a real account)
const api = (over = {}) => ({
  getIdentity: async () => ({ gamid_handle: "lab", display_name: "Lab Espada" }),
  getIdentityProfile: async () => ({ display_name: "Lab Espada", bio: "Forged in every match.", avatar_media_reference: "u/a.png", role_keys: ["competitive_player", "content_creator"], primary_role_key: "competitive_player",
    role_catalog: [{ key: "competitive_player", label: "Competitive Player" }, { key: "content_creator", label: "Content Creator" }] }),
  loadAvatar: async path => `blob:owner/${path}`,
  loadPublicAvatar: async path => `blob:public/${path}`,
  getMyConnections: async () => [{ provider_key: "steam", connected: true, is_public: true, provider_username: STEAM_ID, provider_display_name: "jeddawe_ekaa", access_token: "SECRET" },
    { provider_key: "discord", connected: true, is_public: false, provider_display_name: "Hidden" }],
  getMyPublicGamesSettings: async () => ({ show_my_games: true }),
  getMyGameDisplaySettings: async () => ({ show_game_playtime: false }),
  getMyDiscoveredGames: async () => [{ game_name: "CS2 (Steam name)", recognized_name: "Counter-Strike 2", external_game_id: "730", playtime_minutes: 10 }, { game_name: "Unmapped Indie", external_game_id: "999" }],
  getMyManualGames: async () => [{ game_key: "league_of_legends", display_name: "League of Legends" }],
  getPublicIdentity: async handle => ({ gamid_handle: handle, display_name: "Lab Espada", bio: "Forged in every match.", avatar_media_reference: "u/a.png", role_keys: ["competitive_player"], primary_role_key: "competitive_player",
    role_catalog: [{ key: "competitive_player", label: "Competitive Player" }], public_sections: { steam: { steam_id: STEAM_ID, trust_status: "CONNECTED", persona_name: "jeddawe_ekaa" }, my_games: { library_count: 60, total_count: 60, games: [{ name: "League of Legends", sources: ["MANUAL"] }] } } }),
  getPublicMyGames: async (handle, { query = "" } = {}) => ({ library_count: 60, total_count: 60, games: query ? [{ name: "Counter-Strike 2", sources: ["DISCOVERED_FROM_STEAM"] }] : [{ name: "League of Legends", sources: ["MANUAL"] }] }),
  ...over,
});

test("B1 a data element is a BINDING: field + (for one item) a reference - never the value, never a URL, never a provider id", () => {
  for (const field of DATA_FIELDS) assert.ok(DATA_FIELD_INFO[field], field);
  const payload = createGamidDataPayload("displayName", { text: dataTextStyle("displayName") });
  assert.deepEqual(Object.keys(payload).sort(), ["field", "text"]);
  assert.equal("text" in payload.text, false, "a text STYLE, no text");
  assert.deepEqual(validateGamidDataPayload({ field: "displayName", value: "Espada" }), ["INVALID_DATA_KEY"], "a copied value is refused");
  assert.deepEqual(validateGamidDataPayload({ field: "avatar", url: "https://x/a.png" }), ["INVALID_DATA_KEY"]);
  assert.deepEqual(validateGamidDataPayload({ field: "connection", ref: STEAM_ID }), ["INVALID_DATA_REF"], "a SteamID64 cannot be a reference");
  assert.deepEqual(validateGamidDataPayload({ field: "game", ref: "730" }), [], "a library name that happens to be digits is still only a name");
  assert.equal(gameRef("  Counter-Strike   2 "), "counter-strike 2");
  assert.equal(gameRef("Ｄota 2"), "dota 2");
  assert.equal(validateDocument(docWith(data("d", { field: "games", style: { accentColor: "#ff3b2f" }, initial: 12 }))).valid, true);
});

test("B2 owner snapshot: pickers list only the owner's real roles / games / connections; game refs follow the PUBLIC library name; no ids or tokens", async () => {
  const snapshot = await loadGamidSnapshot(api());
  assert.deepEqual(snapshot.roles.map(role => [role.key, role.label, role.primary]), [["competitive_player", "Competitive Player", true], ["content_creator", "Content Creator", false]]);
  assert.deepEqual(snapshot.connections.map(connection => connection.key), ["steam"], "only public connections");
  assert.deepEqual(snapshot.games.items.map(game => [game.ref, game.refName]).sort(), [["counter-strike 2", "Counter-Strike 2"], ["league of legends", "League of Legends"], ["unmapped indie", "Unmapped Indie"]]);
  assert.equal(snapshot.profile.bio, "Forged in every match.");
  assert.doesNotMatch(JSON.stringify(snapshot), /SECRET|76561198|"730"|"999"|access_token|Hidden/);
});

test("B3 EDIT resolves every field from the owner's data; gone data shows a plain diagnostic; private data is tagged", async () => {
  const snapshot = await loadGamidSnapshot(api());
  const resolve = payload => resolveGamidData(renderGamidDataPayload(payload), snapshot, "edit");
  assert.equal(resolve({ field: "displayName" }).value, "Lab Espada");
  assert.equal(resolve({ field: "handle" }).value, "@lab");
  assert.equal(resolve({ field: "bio" }).value, "Forged in every match.");
  assert.match(resolve({ field: "avatar" }).value.url, /^blob:owner\//);
  assert.equal(resolve({ field: "role", ref: "@primary" }).value, "Competitive Player");
  assert.equal(resolve({ field: "role", ref: "content_creator" }).value, "Content Creator");
  assert.equal(resolve({ field: "game", ref: "counter-strike 2" }).value, "Counter-Strike 2");
  assert.equal(resolve({ field: "connection", ref: "steam" }).value, "Steam · jeddawe_ekaa");
  assert.equal(resolve({ field: "connection", ref: "steam", withLabel: false }).value, "jeddawe_ekaa");
  assert.deepEqual(resolve({ field: "connection", ref: "discord" }), { state: "missing", message: "Discord connection is no longer available." });
  const noSteam = await loadGamidSnapshot(api({ getMyConnections: async () => [] }));
  assert.equal(resolveGamidData(renderGamidDataPayload({ field: "connection", ref: "steam" }), noSteam, "edit").message, "Steam connection is no longer available.");
  assert.equal(resolve({ field: "role", ref: "retired_role" }).message, "This role is no longer on your GamID.");
  assert.equal(resolve({ field: "game", ref: "halo" }).message, "This game is no longer in your games.");
  const quiet = await loadGamidSnapshot(api({ getIdentityProfile: async () => ({ display_name: "Zed", role_keys: [] }) }));
  assert.equal(resolveGamidData(renderGamidDataPayload({ field: "bio" }), quiet, "edit").message, "Your GamID has no bio yet.");
  assert.equal(resolveGamidData(renderGamidDataPayload({ field: "role", ref: "@primary" }), quiet, "edit").message, "You have no primary role on your GamID.");
  const hiddenGames = await loadGamidSnapshot(api({ getMyPublicGamesSettings: async () => ({ show_my_games: false }) }));
  assert.equal(resolveGamidData(renderGamidDataPayload({ field: "game", ref: "counter-strike 2" }), hiddenGames, "edit").private, true, "My Games off -> Private tag");
});

test("B4 VIEW (visitor) resolves ONLY the anonymous public view - current public data, never owner data, nothing when private", async () => {
  const view = await loadPublicView(api(), "lab");
  const snapshot = { public: view, profile: { displayName: "OWNER ONLY NAME", bio: "owner-only bio", avatarUrl: "blob:owner/x" }, roles: [{ key: "secret_role", label: "Secret", primary: false }], connections: [], games: { items: [] }, visibility: {} };
  const resolve = payload => resolveGamidData(renderGamidDataPayload(payload), snapshot, "view");
  assert.equal(resolve({ field: "displayName" }).value, "Lab Espada");
  assert.match(resolve({ field: "avatar" }).value.url, /^blob:public\//, "the public avatar read, not the owner's");
  assert.equal(resolve({ field: "role", ref: "secret_role" }).state, "hidden", "an owner-only role is not public");
  assert.equal(resolve({ field: "connection", ref: "steam" }).value, "Steam · jeddawe_ekaa");
  const game = resolve({ field: "game", ref: "counter-strike 2" });
  assert.equal(game.state, "pending");
  assert.equal(await game.promise, "Counter-Strike 2", "found through the identity's own public search, beyond the first page");
  assert.equal(await resolve({ field: "game", ref: "halo" }).promise, null, "not public -> nothing");
  const gone = await loadPublicView(api({ getPublicIdentity: async () => null }), "lab");
  for (const field of ["displayName", "avatar", "bio", "roles", "games"]) assert.equal(resolveGamidData(renderGamidDataPayload({ field }), { ...snapshot, public: gone }, "view").state, "hidden", field);
  // no persona stored yet -> never the SteamID64
  const bare = await loadPublicView(api({ getPublicIdentity: async handle => ({ gamid_handle: handle, display_name: "X", public_sections: { steam: { steam_id: STEAM_ID, trust_status: "CONNECTED" } } }) }), "lab");
  const steam = resolveGamidData(renderGamidDataPayload({ field: "connection", ref: "steam" }), { public: bare }, "view");
  assert.equal(steam.value, "Steam · Steam account");
  assert.doesNotMatch(JSON.stringify(steam), /7656/);
});

test("B5 painting reuses the primitives: Text style for text fields, the Artwork look for the picture, the GamID block for collections; visitors never see diagnostics", async () => {
  const snapshot = await loadGamidSnapshot(api());
  const doc = docWith(
    data("name", { field: "displayName", text: dataTextStyle("displayName", { color: "#ff3b2f", glow: { color: "#b3121b", blur: 30 } }) }, { z: 0 }),
    data("pic", { field: "avatar", look: { backdrop: "none", mask: "hexagon", effects: { glow: { color: "#62e7ff", blur: 40 } } } }, { z: 1 }),
    data("roles", { field: "roles", style: { accentColor: "#ff3b2f" } }, { y: 400, height: 260, z: 2 }),
    data("gone", { field: "connection", ref: "discord" }, { y: 700, z: 3 }),
  );
  const stage = paintDocument(doc, 1000, make, { mode: "edit", gamid: snapshot }).stages[0];
  const node = id => all(stage, child => child.attrs["data-el"] === id)[0];
  const text = all(node("name"), child => child.className === "wall-text")[0];
  assert.equal(text.textContent, "Lab Espada");
  assert.equal(text.props.get("color"), "#ff3b2f");
  assert.match(text.props.get("text-shadow"), /#b3121b/);
  const frame = all(node("pic"), child => child.className === "wall-art-frame")[0];
  assert.match(frame.props.get("clip-path"), /^polygon/);
  assert.match(node("pic").props.get("filter"), /drop-shadow/);
  assert.equal(all(node("pic"), child => child.tag === "img")[0].attrs.src, "blob:owner/u/a.png");
  assert.ok(all(node("roles"), child => String(child.className).includes("wall-gamid-roles")).length, "the accepted GamID block painter");
  assert.equal(node("gone").attrs["data-state"], "missing");
  assert.match(node("gone").textContent, /Discord connection is no longer available/);
  const visitor = paintDocument(doc, 1000, make, { mode: "view", gamid: { ...snapshot, public: { available: false } } }).stages[0];
  for (const id of ["name", "pic", "roles", "gone"]) {
    const painted = all(visitor, child => child.attrs["data-el"] === id)[0];
    assert.equal(painted.attrs["data-state"], "hidden", id);
    assert.equal(painted.textContent, "", `${id}: a visitor sees nothing`);
  }
});

test("B6 layers, groups, Move to Stage, uniform resize and block styling all work on data elements like on any element", async () => {
  let doc = createDocument({ stageCount: 2 });
  doc.stages[0].elements = [data("a", { field: "handle", text: dataTextStyle("handle") }), data("b", { field: "games" }, { y: 400, height: 520, z: 1 })];
  doc = ops.groupElements(doc, ["a", "b"]).doc;
  const scaled = ops.resizeGroup(doc, ["a"], "se", -200, -200);
  assert.equal(scaled.ok, true);
  assert.ok(scaled.doc.stages[0].elements.find(element => element.id === "a").payload.text.fontSize < 56, "text sizes follow a uniform resize");
  assert.equal(ops.moveElementsToStage(doc, ["a"], doc.stages[1].id).ok, true);
  assert.equal(ops.setGamidStyle(doc, ["b"], { accentColor: "#ff3b2f" }).ok, true, "a live collection takes the GamID block style");
  assert.equal(ops.setGamidStyle(doc, ["a"], { accentColor: "#ff3b2f" }).ok, false, "a text field does not");
  assert.deepEqual(ops.minSizeOf(doc.stages[0].elements.find(element => element.id === "b")), { width: 300, height: 240 }, "the Games block's own minimum");
});

test("B7 the kit stays provider-neutral and markup-free; the editor offers pickers built from the owner's snapshot only", () => {
  const kit = ["dist/wall-kit/gamid-data.js", "dist/wall-kit/gamid-data-paint.js"].map(path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, ""));
  for (const source of kit) {
    assert.doesNotMatch(source, /steam|discord|league|riot|https?:/i);
    assert.doesNotMatch(source, /\.innerHTML|insertAdjacentHTML|fetch\(/);
  }
  const tools = readFileSync(new URL("../dist/wall-editor/tools.js", import.meta.url), "utf8");
  assert.match(tools, /snapshot\?\.roles/);
  assert.match(tools, /snapshot\?\.games\?\.items/);
  assert.match(tools, /snapshot\?\.connections/);
  const html = readFileSync(new URL("../dist/wall-editor/index.html", import.meta.url), "utf8");
  assert.match(html, /data-add-action="gamidData"/);
  assert.match(html, /id="gamidData"/);
});
