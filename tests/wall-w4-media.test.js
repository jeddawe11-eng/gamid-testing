// Images / Assets, Backgrounds and GamID blocks: models, validation, painting, the asset store, and the privacy rules of real GamID data on the Wall.
import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { renderDocument } from "../dist/wall/render.js";
import { backgroundRegistry } from "../dist/wall/backgrounds.js";
import "../dist/wall-kit/register.js";
import { validateImagePayload, renderImagePayload, createImagePayload, ASSET_ID } from "../dist/wall-kit/image.js";
import { defaultBackground, createImageBackground, BACKGROUND_KINDS } from "../dist/wall-kit/background.js";
import { validateGamidPayload, renderGamidPayload, GAMID_BLOCKS, GAMES_INITIAL, createGamidPayload } from "../dist/wall-kit/gamid.js";
import { paintGamidBlock, hoursLabel, gamesInitiallyRendered } from "../dist/wall-kit/gamid-blocks.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import { ASSET_LIMITS, checkAssetFile, checkAssetDimensions, checkAssetCount, startingImageSize, describeAssetError } from "../dist/wall-kit/assets.js";
import { createAssetStore } from "../dist/wall-editor/assets.js";
import { loadGamidSnapshot, providerLabel } from "../dist/wall-editor/gamid-data.js";
import * as ops from "../dist/wall-kit/ops.js";

const UUID = "3f2b8c1e-5a4d-4e7b-9c60-1d2e3f4a5b6c";
const UUID2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const docWith = (...elements) => { const d = createDocument(); d.stages[0].elements = elements; return d; };
const image = (id, over = {}, extra = {}) => createElement({ id, type: "image", x: 10, y: 10, width: 400, height: 300, z: 0, payload: createImagePayload(UUID, over), ...extra });
const gamid = (id, payload, extra = {}) => createElement({ id, type: "gamid", x: 10, y: 10, width: 700, height: 400, z: 0, payload, ...extra });
const errors = doc => validateDocument(doc).errors;

class PaintNode {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.style = { setProperty: (name, value) => this.props.set(name, value) }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { nodes.forEach(node => this.children.push(node)); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  set innerHTML(_) { throw new Error("innerHTML is forbidden"); }
}
const make = tag => new PaintNode(tag);
const all = (node, test, out = []) => { if (test(node)) out.push(node); node.children.forEach(child => all(child, test, out)); return out; };
const resolver = map => ({ urlFor: id => map[id] ?? null });

// ---------- image element ----------
test("image: a picture is an opaque reference to the owner's asset plus display choices - never bytes, a URL or a path", () => {
  assert.deepEqual(errors(docWith(image("i"))), []);
  assert.deepEqual(errors(docWith(image("i", { fit: "contain", posX: 0, posY: 100, opacity: 0.4, radius: 40, alt: "My setup", aw: 1920, ah: 1080 }))), []);
  for (const bad of ["not-a-uuid", "user/abc.png", "https://evil.example/a.png", "data:image/png;base64,AAAA", UUID.toUpperCase(), 5, undefined]) assert.deepEqual(errors(docWith(image("i", { assetId: bad }))), ["INVALID_ASSET:i"], String(bad));
  assert.match(UUID, ASSET_ID);
});
test("image: every display field is bounded", () => {
  const bad = over => errors(docWith(image("i", over)));
  assert.deepEqual(bad({ fit: "tile" }), ["INVALID_FIT:i"]);
  assert.deepEqual(bad({ posX: 101 }), ["INVALID_POSITION:i"]);
  assert.deepEqual(bad({ posY: -1 }), ["INVALID_POSITION:i"]);
  assert.deepEqual(bad({ opacity: 1.5 }), ["INVALID_OPACITY:i"]);
  assert.deepEqual(bad({ radius: 1001 }), ["INVALID_RADIUS:i"]);
  assert.deepEqual(bad({ alt: "a".repeat(121) }), ["INVALID_ALT:i"]);
  assert.deepEqual(bad({ aw: 0, ah: 5 }), ["INVALID_SOURCE_SIZE:i"]);
  assert.deepEqual(bad({ aw: 5, ah: 20001 }), ["INVALID_SOURCE_SIZE:i"]);
  assert.deepEqual(bad({ alt: "<img src=x onerror=alert(1)>" }), ["UNSAFE_PAYLOAD_CONTENT:i.payload.alt"]);
  assert.deepEqual(validateImagePayload([]), ["PAYLOAD_NOT_OBJECT"]);
});
test("image: rotation, groups and layers work like any element; the render content carries only known fields", () => {
  const rotated = docWith(image("i", {}, { rotation: 20, groupId: "g" }), image("j", {}, { x: 500, groupId: "g" }));
  assert.deepEqual(errors(rotated), []);
  const content = renderImagePayload({ ...createImagePayload(UUID), evil: "<script>", radius: 10, alt: "x" });
  assert.deepEqual(content, { kind: "image", assetId: UUID, fit: "cover", posX: 50, posY: 50, opacity: 1, radius: 10, alt: "x" });
  const scaled = ops.resizeGroup(ops.groupElements(docWith(image("a", { radius: 40 }, { x: 0, y: 0, width: 200, height: 200 }), image("b", {}, { x: 300, y: 0, width: 200, height: 200, z: 1 })), ["a", "b"]).doc, ["a"], "se", 500, 0);
  assert.equal(scaled.ok, true);
});
test("image: painting - only a blob: URL from the asset resolver is ever used; a document string can never become an image address", () => {
  const doc = docWith(image("i", { fit: "contain", posX: 20, posY: 80, opacity: 0.5, radius: 30, alt: "Setup" }));
  const shown = paintDocument(doc, 500, make, { assets: resolver({ [UUID]: "blob:https://x/abc" }) }).stages[0];
  const [img] = all(shown, node => node.tag === "img");
  assert.equal(img.attrs.src, "blob:https://x/abc");
  assert.equal(img.attrs.alt, "Setup");
  assert.equal(img.props.get("object-fit"), "contain");
  assert.equal(img.props.get("object-position"), "20% 80%");
  assert.equal(img.props.get("opacity"), "0.5");
  for (const unsafe of ["https://evil.example/a.png", "javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "//evil.example/a.png", "file:///etc/passwd", ""]) {
    const painted = paintDocument(doc, 500, make, { assets: resolver({ [UUID]: unsafe }) }).stages[0];
    assert.equal(all(painted, node => node.tag === "img").length, 0, unsafe);
    assert.match(painted.textContent, /Image/);
  }
  const missing = paintDocument(doc, 500, make, {}).stages[0];
  assert.equal(all(missing, node => node.tag === "img").length, 0, "no resolver -> a neutral placeholder, the Wall still renders");
});

// ---------- asset rules ----------
test("assets: type, size, pixel size and count limits (SVG is never allowed)", () => {
  assert.deepEqual(ASSET_LIMITS.types, ["image/jpeg", "image/png", "image/webp", "image/avif"]);
  assert.equal(checkAssetFile({ type: "image/png", size: 1000 }).ok, true);
  for (const type of ["image/svg+xml", "image/gif", "text/html", "application/pdf", "video/mp4", ""]) assert.equal(checkAssetFile({ type, size: 1000 }).code, "INVALID_FILE_TYPE", type);
  assert.equal(checkAssetFile({ type: "image/png", size: ASSET_LIMITS.maxBytes }).ok, true);
  assert.equal(checkAssetFile({ type: "image/png", size: ASSET_LIMITS.maxBytes + 1 }).code, "FILE_TOO_LARGE");
  assert.equal(checkAssetFile({ type: "image/png", size: 0 }).code, "EMPTY_FILE");
  assert.equal(checkAssetDimensions({ width: 8192, height: 8192 }).ok, true);
  assert.equal(checkAssetDimensions({ width: 8193, height: 100 }).code, "INVALID_DIMENSIONS");
  assert.equal(checkAssetDimensions({ width: 0, height: 100 }).code, "INVALID_DIMENSIONS");
  assert.equal(checkAssetDimensions({ width: 1.5, height: 10 }).code, "INVALID_DIMENSIONS");
  assert.equal(checkAssetCount(59).ok, true);
  assert.equal(checkAssetCount(60).code, "WALL_ASSET_LIMIT");
  assert.deepEqual(startingImageSize(1000, 500), { width: 640, height: 320 });
  assert.deepEqual(startingImageSize(500, 1000), { width: 450, height: 900 });
  assert.match(describeAssetError({ code: "WALL_ASSET_IN_USE" }), /still used/);
  assert.match(describeAssetError({ message: "WALL_ASSET_LIMIT" }), /60/);
  assert.match(describeAssetError(new Error("???")), /could not be added/);
});

function fakeApi(over = {}) {
  const calls = [];
  const rows = [];
  const api = {
    calls, rows,
    listWallAssets: async () => [...rows],
    uploadWallAsset: async (file, userId, size) => { calls.push(["upload", userId, size, file.type]); const row = { asset_id: `${rows.length + 1}0000000-0000-4000-8000-000000000000`, storage_path: `${userId}/x.png`, mime_type: file.type, byte_size: file.size, width: size.width, height: size.height }; rows.unshift(row); return row; },
    loadWallAsset: async path => `blob:test/${path}`,
    deleteWallAsset: async id => { calls.push(["delete", id]); rows.splice(rows.findIndex(row => row.asset_id === id), 1); return true; },
    ...over,
  };
  return api;
}
const file = (type = "image/png", size = 1000) => ({ type, size });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("asset store: uploads pass the SAME rules before anything is sent, then appear in the list with a blob URL", async () => {
  const api = fakeApi();
  let changes = 0;
  const store = createAssetStore({ api, userId: "user-1", decode: async () => ({ width: 640, height: 360 }), onChange: () => { changes += 1; } });
  const svg = await store.upload(file("image/svg+xml"));
  assert.equal(svg.ok, false);
  assert.equal((await store.upload(file("image/png", ASSET_LIMITS.maxBytes + 1))).code, "FILE_TOO_LARGE");
  assert.equal(api.calls.length, 0, "nothing was sent for rejected files");
  const ok = await store.upload(file());
  assert.equal(ok.ok, true);
  assert.deepEqual(api.calls[0], ["upload", "user-1", { width: 640, height: 360 }, "image/png"]);
  assert.equal(store.assets.length, 1);
  await tick(); await tick();
  assert.equal(store.urlFor(ok.asset.asset_id), "blob:test/user-1/x.png", "the owner's private picture is fetched with their own session and handed out as a blob: URL");
  assert.equal(store.urlFor(ok.asset.asset_id), "blob:test/user-1/x.png");
  assert.ok(changes > 0);
  const tooBig = createAssetStore({ api: fakeApi(), userId: "u", decode: async () => ({ width: 9000, height: 100 }) });
  assert.equal((await tooBig.upload(file())).code, "INVALID_DIMENSIONS");
  const unreadable = createAssetStore({ api: fakeApi(), userId: "u", decode: async () => { throw new Error("bad image"); } });
  assert.match((await unreadable.upload(file())).message, /could not be read/);
});
test("asset store: the per-owner limit is checked before uploading, and a server refusal becomes a plain message", async () => {
  const api = fakeApi();
  for (let i = 0; i < 60; i += 1) api.rows.push({ asset_id: `${i}`.padStart(8, "0") + "-0000-4000-8000-000000000000`", storage_path: `u/${i}.png`, width: 1, height: 1, byte_size: 1 });
  const store = createAssetStore({ api, userId: "u", decode: async () => ({ width: 10, height: 10 }) });
  await store.refresh();
  assert.equal((await store.upload(file())).code, "WALL_ASSET_LIMIT");
  assert.equal(api.calls.length, 0);
  const refusing = createAssetStore({ api: fakeApi({ uploadWallAsset: async () => { const error = new Error("WALL_ASSET_TOO_LARGE"); throw error; } }), userId: "u", decode: async () => ({ width: 10, height: 10 }) });
  assert.match((await refusing.upload(file())).message, /5 MB/);
});
test("asset store: a picture in use is never deleted from under the Wall being edited; an unused one is", async () => {
  const api = fakeApi();
  const store = createAssetStore({ api, userId: "u", decode: async () => ({ width: 10, height: 10 }) });
  const { asset } = await store.upload(file());
  const using = docWith(createElement({ id: "i", type: "image", x: 0, y: 0, width: 10, height: 10, payload: createImagePayload(asset.asset_id) }));
  const blocked = await store.remove(asset.asset_id, using);
  assert.equal(blocked.code, "WALL_ASSET_IN_USE");
  assert.equal(api.calls.some(call => call[0] === "delete"), false);
  const usedByBackground = createDocument();
  usedByBackground.background = createImageBackground(asset.asset_id);
  assert.equal((await store.remove(asset.asset_id, usedByBackground)).code, "WALL_ASSET_IN_USE", "a background counts as use");
  assert.equal((await store.remove(asset.asset_id, createDocument())).ok, true);
  assert.equal(store.assets.length, 0);
  assert.equal((await createAssetStore({ api: fakeApi({ deleteWallAsset: async () => { throw Object.assign(new Error("WALL_ASSET_IN_USE"), { code: "PT409" }); } }), userId: "u" }).remove("x", createDocument())).ok, false, "the server's own refusal is respected too");
});

// ---------- backgrounds ----------
const withBg = (background, stageBackground) => { const d = createDocument(); if (background !== undefined) d.background = background; if (stageBackground !== undefined) d.stages[0].background = stageBackground; return d; };

test("background: color, gradient and image kinds are registered with the generic core registry (video is deferred)", () => {
  assert.deepEqual(backgroundRegistry.keys().sort(), ["color", "gradient", "image"]);
  assert.deepEqual([...BACKGROUND_KINDS], ["color", "gradient", "image"]);
  assert.equal(errors(withBg({ kind: "video", assetId: UUID })).join(), "UNKNOWN_BACKGROUND_KIND:wall");
});
test("background: Wall-wide and per-stage, each validated by its kind with a scope-tagged code", () => {
  assert.deepEqual(errors(withBg(defaultBackground("color"), defaultBackground("gradient"))), []);
  assert.deepEqual(errors(withBg(createImageBackground(UUID, { overlay: { color: "#000000", opacity: 0.4 } }))), []);
  assert.deepEqual(errors(withBg({ kind: "color", color: "red" })), ["BACKGROUND:INVALID_COLOR:wall"]);
  assert.deepEqual(errors(withBg(undefined, { kind: "gradient", from: "#000000", to: "x", angle: 5 })), ["BACKGROUND:INVALID_GRADIENT:stage_1"]);
  assert.deepEqual(errors(withBg({ kind: "image", assetId: "bad", fit: "fill", posX: 200, posY: 0, opacity: 3, overlay: { color: "b", opacity: 0 } })).sort(), ["BACKGROUND:INVALID_ASSET:wall", "BACKGROUND:INVALID_FIT:wall", "BACKGROUND:INVALID_OPACITY:wall", "BACKGROUND:INVALID_OVERLAY:wall", "BACKGROUND:INVALID_POSITION:wall"]);
  for (const bad of ["blue", [], 5, { color: "#000000" }, { kind: "" }]) assert.deepEqual(errors(withBg(bad)), ["INVALID_BACKGROUND:wall"], JSON.stringify(bad));
  assert.deepEqual(errors(withBg(null, null)), [], "null means not set");
});
test("background: unsafe strings anywhere in a background are rejected, never sanitized", () => {
  assert.deepEqual(errors(withBg({ kind: "color", color: "#000000", x: "<script>alert(1)</script>" })), ["UNSAFE_PAYLOAD_CONTENT:wall.background.x"]);
  assert.deepEqual(errors(withBg(undefined, { kind: "color", color: "#000000", label: "javascript:alert(1)" })), ["UNSAFE_PAYLOAD_CONTENT:stage_1.background.label"]);
});
test("background: it renders through the core, is carried in the render tree only when set, and stays out of layer order", () => {
  const plain = renderDocument(docWith(image("i")), { viewportWidth: 500 });
  assert.equal("background" in plain, false);
  assert.equal("background" in plain.stages[0], false);
  const doc = withBg(defaultBackground("color"), createImageBackground(UUID, { opacity: 0.5 }));
  const tree = renderDocument(doc, { viewportWidth: 500 });
  assert.deepEqual(tree.background, { kind: "color", color: "#0d0b14" });
  assert.deepEqual(tree.stages[0].background, { kind: "image", assetId: UUID, fit: "cover", posX: 50, posY: 50, opacity: 0.5 });
});
test("background: the Whole-Wall background runs continuously across stages; a stage's own background replaces it on that stage only", () => {
  const doc = createDocument({ stageCount: 3 });
  doc.background = { kind: "gradient", from: "#000000", to: "#ffffff", angle: 180 };
  doc.stages[1].background = { kind: "color", color: "#ff0000" };
  const painted = paintDocument(doc, 500, make, {});
  const layers = painted.stages.map(stage => all(stage, node => node.className === "wall-bg")[0]);
  const stageHeight = 500 * 1778 / 1000;
  assert.equal(layers[0].props.get("height"), `${stageHeight * 3}px`, "the Wall gradient is one tall layer spanning all three stages");
  assert.equal(layers[0].props.get("top"), "0px");
  assert.equal(layers[2].props.get("top"), `${-stageHeight * 2}px`, "each stage shows its own slice of the SAME layer");
  assert.equal(layers[1].props.get("background"), "#ff0000");
  assert.equal(layers[1].props.get("height"), `${stageHeight}px`, "the override covers only its stage");
  assert.equal(all(painted.stages[0], node => node.className === "wall-bg").length, 1);
});
test("background: an image background and its overlay paint only from the asset resolver; no stage maximum constrains backgrounds", () => {
  const doc = withBg(createImageBackground(UUID, { fit: "contain", posX: 10, posY: 90, opacity: 0.7, overlay: { color: "#000000", opacity: 0.35 } }));
  const layer = all(paintDocument(doc, 400, make, { assets: resolver({ [UUID]: "blob:x/1" }) }).stages[0], node => node.className === "wall-bg")[0];
  const [img] = all(layer, node => node.tag === "img");
  assert.equal(img.attrs.src, "blob:x/1");
  assert.equal(img.props.get("object-fit"), "contain");
  assert.equal(layer.children.length, 2, "picture + overlay");
  assert.equal(layer.children[1].props.get("opacity"), "0.35");
  assert.equal(all(paintDocument(doc, 400, make, { assets: resolver({ [UUID]: "https://evil.example/a.png" }) }).stages[0], node => node.tag === "img").length, 0);
  let many = createDocument();
  for (let i = 0; i < 20; i += 1) many = ops.addStage(many).doc;
  assert.equal(ops.setBackground(many, "wall", defaultBackground("gradient")).ok, true);
  assert.equal(paintDocument(ops.setBackground(many, "wall", defaultBackground("gradient")).doc, 300, make, {}).stages.length, 21);
});
test("background ops: set / replace / remove at either scope, undo-friendly and validated", () => {
  const start = createDocument({ stageCount: 2 });
  const withWall = ops.setBackground(start, "wall", defaultBackground("color"));
  assert.equal(withWall.ok, true);
  assert.deepEqual(withWall.doc.background, { kind: "color", color: "#0d0b14" });
  assert.equal("background" in start, false, "immutable");
  const withStage = ops.setBackground(withWall.doc, "stage_2", defaultBackground("gradient")).doc;
  assert.equal(withStage.stages[1].background.kind, "gradient");
  assert.equal("background" in ops.setBackground(withStage, "wall", null).doc, false);
  assert.equal(ops.setBackground(start, "ghost", defaultBackground("color")).ok, false);
  const bad = ops.setBackground(start, "wall", { kind: "color", color: "nope" });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.errors, ["BACKGROUND:INVALID_COLOR:wall"]);
});
test("assetsInUse: every picture the Wall uses, in elements and in backgrounds, on every stage", () => {
  const doc = createDocument({ stageCount: 2 });
  doc.stages[0].elements = [image("i")];
  doc.stages[1].elements = [createElement({ id: "j", type: "image", x: 0, y: 0, width: 10, height: 10, payload: createImagePayload(UUID2) })];
  doc.background = createImageBackground("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  doc.stages[0].background = createImageBackground("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  assert.deepEqual([...ops.assetsInUse(doc)].sort(), [UUID, UUID2, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"].sort());
  assert.equal(ops.assetsInUse(createDocument()).size, 0);
});

// ---------- GamID blocks ----------
test("GamID blocks: only real, existing blocks are accepted - stats, ranks and other future blocks are rejected, not faked", () => {
  for (const block of GAMID_BLOCKS) assert.deepEqual(errors(docWith(gamid("g", createGamidPayload(block)))), [], block);
  assert.deepEqual([...GAMID_BLOCKS], ["profile", "roles", "games", "connections"]);
  for (const block of ["stats", "ranks", "achievements", "play_together", "teams", "tournaments", "history", "", undefined, 5]) assert.deepEqual(errors(docWith(gamid("g", { block }))), ["INVALID_BLOCK:g"], String(block));
  assert.deepEqual(errors(docWith(gamid("g", { block: "games", layout: "grid" }))), ["INVALID_LAYOUT:g"]);
  assert.deepEqual(errors(docWith(gamid("g", { block: "games", showPlaytime: "yes" }))), ["INVALID_SHOW_PLAYTIME:g"]);
  assert.deepEqual(errors(docWith(gamid("g", { block: "games", initial: 2 }))), ["INVALID_INITIAL:g"]);
  assert.deepEqual(errors(docWith(gamid("g", { block: "games", initial: 25 }))), ["INVALID_INITIAL:g"]);
  assert.deepEqual(errors(docWith(gamid("g", { block: "games", initial: 5.5 }))), ["INVALID_INITIAL:g"]);
  assert.deepEqual(validateGamidPayload([]), ["PAYLOAD_NOT_OBJECT"]);
});
test("GamID blocks: the element stores NO GamID data (only which block and how to show it), and playtime is OFF unless explicitly enabled", () => {
  assert.deepEqual(renderGamidPayload({ block: "games" }), { kind: "gamid", block: "games", layout: "card", showPlaytime: false, initial: GAMES_INITIAL.default });
  assert.equal(renderGamidPayload({ block: "games", showPlaytime: true }).showPlaytime, true);
  assert.equal(renderGamidPayload({ block: "games", showPlaytime: false }).showPlaytime, false);
  assert.deepEqual(Object.keys(createGamidPayload("profile")).sort(), ["block", "layout"]);
  assert.doesNotMatch(JSON.stringify(createGamidPayload("games")), /minutes|handle|name|steam|token/i);
});

const games = count => Array.from({ length: count }, (_, i) => ({ name: `Game ${String(i + 1).padStart(3, "0")}`, minutes: 60 * (i % 40) }));
const snapshot = over => ({
  profile: { displayName: "Espada", handle: "black", initial: "E", avatarUrl: null },
  roles: [{ key: "competitive_player", label: "Competitive Player", primary: true }, { key: "content_creator", label: "Content Creator", primary: false }],
  connections: [{ label: "Steam", name: "Espada" }],
  games: { total: 300, items: games(300), playtimeAllowed: false },
  visibility: { profile: true, roles: true, connections: true, games: true },
  ...over,
});
const block = (payload, snap = snapshot()) => paintGamidBlock(renderGamidPayload(payload), snap, make);

test("GamID profile block: real avatar (blob only), display name and @handle; initials when there is no avatar", () => {
  assert.match(block({ block: "profile" }).textContent, /Espada@black/);
  assert.equal(all(block({ block: "profile" }), node => node.tag === "img").length, 0);
  const withAvatar = block({ block: "profile" }, snapshot({ profile: { displayName: "Espada", handle: "black", initial: "E", avatarUrl: "blob:x/avatar" } }));
  assert.equal(all(withAvatar, node => node.tag === "img")[0].attrs.src, "blob:x/avatar");
  const hostile = block({ block: "profile" }, snapshot({ profile: { displayName: "<img src=x onerror=alert(1)>", handle: "x", initial: "<", avatarUrl: "https://evil.example/a.png" } }));
  assert.equal(all(hostile, node => node.tag === "img").length, 0, "only blob: avatars");
  assert.match(hostile.textContent, /<img src=x onerror=alert\(1\)>/, "even a hostile name is only text");
});
test("GamID roles / connections blocks show what the owner chose; empty sections say so and fake nothing", () => {
  assert.match(block({ block: "roles" }).textContent, /Competitive Player.*Content Creator/);
  assert.match(block({ block: "roles" }, snapshot({ roles: [] })).textContent, /No gaming roles chosen yet/);
  assert.match(block({ block: "connections" }).textContent, /SteamEspada/);
  assert.match(block({ block: "connections" }, snapshot({ connections: [] })).textContent, /No connections are shown/);
  assert.match(paintGamidBlock(renderGamidPayload({ block: "games" }), null, make).textContent, /not available/);
  assert.match(block({ block: "games" }, snapshot({ games: { total: 0, items: [], playtimeAllowed: false } })).textContent, /No games to show yet/);
});
test("Games block: collapsed by default with a bounded initial count - 300 games render only the first few until the person expands", () => {
  const root = block({ block: "games" });
  assert.equal(all(root, node => node.className === "wall-game").length, GAMES_INITIAL.default);
  assert.match(root.textContent, /300 games/);
  assert.match(root.textContent, /Show all 300 games/);
  assert.equal(all(root, node => node.className === "wall-game").length < 300, true);
  assert.equal(all(block({ block: "games", initial: 3 }), node => node.className === "wall-game").length, 3);
  assert.equal(all(block({ block: "games", initial: 24 }), node => node.className === "wall-game").length, 24);
  assert.equal(gamesInitiallyRendered(300, 8), 8);
  assert.equal(gamesInitiallyRendered(5, 8), 5);
  const toggle = all(root, node => node.tag === "button")[0];
  assert.equal(toggle.attrs["aria-expanded"], "false");
  toggle.listeners.click[0]();
  assert.equal(all(root, node => node.className === "wall-game").length, 300, "an explicit tap expands");
  all(root, node => node.tag === "button")[0].listeners.click[0]();
  assert.equal(all(root, node => node.className === "wall-game").length, GAMES_INITIAL.default, "and collapses again");
});
test("Games block: hours are hidden by default, and shown only when the block AND the owner's playtime setting both allow it", () => {
  const text = (payload, playtimeAllowed) => block(payload, snapshot({ games: { total: 300, items: games(300), playtimeAllowed } })).textContent;
  assert.doesNotMatch(text({ block: "games" }, true), /\d+(\.\d)? h/, "the owner's setting alone shows nothing");
  assert.doesNotMatch(text({ block: "games", showPlaytime: true }, false), /\d+(\.\d)? h/, "the block's switch alone shows nothing");
  assert.doesNotMatch(text({ block: "games", showPlaytime: false }, true), /\d+(\.\d)? h/);
  assert.match(text({ block: "games", showPlaytime: true }, true), /\d+(\.\d)? h/, "both allow it -> hours appear");
  assert.equal(hoursLabel(0), "");
  assert.equal(hoursLabel(null), "");
  assert.equal(hoursLabel(90), "1.5 h");
  assert.equal(hoursLabel(60000), "1000 h");
});
test("privacy tag: a block whose public switch is off still previews for its owner but is labelled PRIVATE", () => {
  assert.doesNotMatch(block({ block: "games" }).textContent, /PRIVATE/);
  assert.match(block({ block: "games" }, snapshot({ visibility: { profile: true, roles: true, connections: true, games: false } })).textContent, /PRIVATE/);
  assert.match(block({ block: "connections" }, snapshot({ visibility: { profile: true, roles: true, connections: false, games: true }, connections: [] })).textContent, /PRIVATE/);
});

test("GamID data snapshot: built from the accepted account APIs, public-safe only - no provider ids, no private connections, hours only if the owner's setting allows", async () => {
  const api = {
    getIdentity: async () => ({ gamid_handle: "black", display_name: "Espada" }),
    getIdentityProfile: async () => ({ display_name: "Espada", role_keys: ["competitive_player"], primary_role_key: "competitive_player", avatar_media_reference: "u/avatar.png" }),
    loadAvatar: async path => `blob:x/${path}`,
    getMyConnections: async () => [
      { provider_key: "steam", connected: true, is_public: true, provider_display_name: "Espada", provider_username: "76561198000000000", access_token: "SECRET", provider_account_id: "12345" },
      { provider_key: "discord", connected: true, is_public: false, provider_display_name: "PrivateOne" },
      { provider_key: "riot", connected: false, is_public: true, provider_display_name: "NotConnected" },
    ],
    getMyPublicGamesSettings: async () => ({ show_my_games: false, show_game_stats: false }),
    getMyGameDisplaySettings: async () => ({ show_game_playtime: false }),
    getMyDiscoveredGames: async () => [{ game_name: "Halo", playtime_minutes: 120, external_game_id: "1" }, { game_name: "halo", playtime_minutes: 5 }, { game_name: "Apex", playtime_minutes: null }],
    getMyManualGames: async () => [{ display_name: "Chess" }, { display_name: "Apex" }],
  };
  const snap = await loadGamidSnapshot(api);
  assert.deepEqual(snap.profile, { displayName: "Espada", handle: "black", initial: "E", avatarUrl: "blob:x/u/avatar.png" });
  assert.deepEqual(snap.roles, [{ key: "competitive_player", label: "Competitive Player", primary: true }]);
  assert.deepEqual(snap.connections, [{ label: "Steam", name: "Espada" }], "only the connection the owner made public, with its existing public name");
  assert.deepEqual(snap.games.items.map(game => game.name), ["Apex", "Chess", "Halo"], "provider-neutral, de-duplicated, sorted");
  assert.equal(snap.games.total, 3);
  assert.equal(snap.games.playtimeAllowed, false);
  assert.deepEqual(snap.visibility, { profile: true, roles: true, connections: true, games: false });
  const dump = JSON.stringify(snap);
  assert.doesNotMatch(dump, /SECRET|76561198000000000|12345|PrivateOne|NotConnected|access_token|provider_account/);
  assert.equal(providerLabel("steam"), "Steam");
  assert.equal(providerLabel("some_new_thing"), "Some New Thing");
});
test("GamID data snapshot: one section failing never breaks the others; nothing is invented", async () => {
  const failing = () => { throw new Error("down"); };
  const snap = await loadGamidSnapshot({ getIdentity: failing, getIdentityProfile: async () => ({ display_name: "Zed", role_keys: [] }), getMyConnections: failing, getMyPublicGamesSettings: failing, getMyGameDisplaySettings: failing, getMyDiscoveredGames: failing, getMyManualGames: failing, loadAvatar: failing });
  assert.equal(snap.profile.displayName, "Zed");
  assert.deepEqual(snap.connections, []);
  assert.deepEqual(snap.games, { total: 0, items: [], playtimeAllowed: false });
  assert.equal(snap.visibility.games, false);
});
test("large libraries: 1000 discovered games build a snapshot instantly and the block still renders only its initial rows", async () => {
  const many = Array.from({ length: 1000 }, (_, i) => ({ game_name: `G${i}`, playtime_minutes: i }));
  const snap = await loadGamidSnapshot({ getMyDiscoveredGames: async () => many });
  assert.equal(snap.games.total, 1000);
  assert.equal(all(block({ block: "games" }, snap), node => node.className === "wall-game").length, GAMES_INITIAL.default);
});

// ---------- preview purity, mixed walls ----------
test("preview: painting a Wall of every element type never mutates the document and is repeatable", () => {
  let doc = createDocument({ stageCount: 2 });
  doc = ops.addElement(doc, "stage_1", "text").doc;
  doc = ops.addElement(doc, "stage_1", "circle").doc;
  doc = ops.addCustomElement(doc, "stage_1", { type: "image", payload: createImagePayload(UUID), width: 400, height: 300 }).doc;
  doc = ops.addCustomElement(doc, "stage_1", { type: "gamid", payload: createGamidPayload("games"), width: 700, height: 500 }).doc;
  doc = ops.addCustomElement(doc, "stage_2", { type: "embed", payload: { providerKey: "youtube", data: { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" } }, width: 800, height: 450 }).doc;
  doc = ops.setBackground(doc, "wall", defaultBackground("gradient")).doc;
  doc = ops.setBackground(doc, "stage_2", createImageBackground(UUID)).doc;
  assert.equal(validateDocument(doc).valid, true);
  const before = JSON.stringify(doc);
  const ctx = { mode: "view", assets: resolver({ [UUID]: "blob:x/1" }), gamid: snapshot(), players: { activate() {} } };
  const first = paintDocument(doc, 390, make, ctx);
  const second = paintDocument(doc, 900, make, ctx);
  assert.equal(JSON.stringify(doc), before);
  assert.equal(first.stages.length, 2);
  assert.equal(second.stages.length, 2);
  const kinds = all(first.stages[0], node => node.className.startsWith("wall-el")).map(node => node.className.replace("wall-el wall-el-", ""));
  assert.deepEqual(kinds.sort(), ["gamid", "image", "rect", "text"]);
  assert.equal(all(first.stages[1], node => node.className.startsWith("wall-el-embed") || node.attrs?.["data-provider"]).length > 0, true);
});
test("addCustomElement: any registered type is placed centred on top, oversized ones are shrunk to the stage, unknown types refused", () => {
  const added = ops.addCustomElement(createDocument(), "stage_1", { type: "image", payload: createImagePayload(UUID), width: 5000, height: 4000 });
  assert.equal(added.ok, true);
  const element = added.doc.stages[0].elements[0];
  assert.ok(element.width <= 1000 && element.height <= 1778);
  assert.ok(Math.abs(element.width / element.height - 5000 / 4000) < 0.01, "shrunk proportionally");
  assert.equal(ops.addCustomElement(createDocument(), "stage_1", { type: "hologram", payload: {}, width: 10, height: 10 }).ok, false);
  assert.equal(ops.addCustomElement(createDocument(), "nope", { type: "image", payload: createImagePayload(UUID), width: 10, height: 10 }).ok, false);
  const bad = ops.addCustomElement(createDocument(), "stage_1", { type: "image", payload: { assetId: "x" }, width: 100, height: 100 });
  assert.equal(bad.ok, false, "an invalid payload is never added");
});
