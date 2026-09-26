// Wall interaction & embed foundation fixes (after the W0 vs Unified Wall audit):
//   1. view-mode tap policy   2. player layering   3. inline player Close   4. selected-aspect refit / locked resize   5. per-type minimum sizes   6. text effect clipping
import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { paintDocument, overflowFor, ELEMENT_OVERFLOW } from "../dist/wall-kit/paint.js";
import { INTERACTIVE_ATTR } from "../dist/wall-kit/interaction.js";
import { createPlayerManager, INLINE_BAR_PX } from "../dist/wall-kit/embed/player.js";
import { createTextPayload } from "../dist/wall-kit/text.js";
import { GAMID_BLOCK_INFO } from "../dist/wall-kit/gamid.js";
import { elementRegistry } from "../dist/wall/elements.js";
import * as ops from "../dist/wall-kit/ops.js";

// ---------- a fake DOM with just enough CSS semantics: pointer-events is inherited, and .wall-el is `none` by the stylesheet ----------
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
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const pxOf = value => Number(String(value).replace("px", ""));
const isWallEl = node => typeof node.className === "string" && node.className.split(" ").includes("wall-el");

// The first node (self or descendant) that takes pointer events, resolving `pointer-events` the way CSS does (inline value, else inherited).
function takesTaps(node, inherited) {
  const own = node.props.get("pointer-events") ?? inherited;
  if (own === "auto") return node;
  for (const child of node.children) { const hit = takesTaps(child, own); if (hit) return hit; }
  return null;
}
// What a tap at (x, y) px on a painted stage reaches: element boxes are tested top-most first (z-index), and a box only takes the tap through a node that accepts
// pointer events. null = the tap falls through to the stage / page.
function tapAt(stage, x, y) {
  const boxes = stage.children.filter(isWallEl).sort((a, b) => Number(b.props.get("z-index")) - Number(a.props.get("z-index")));
  for (const box of boxes) {
    const left = pxOf(box.props.get("left")), top = pxOf(box.props.get("top")), width = pxOf(box.props.get("width")), height = pxOf(box.props.get("height"));
    if (x < left || x > left + width || y < top || y > top + height) continue;
    const hit = takesTaps(box, "none");
    if (hit) return { id: box.attrs["data-el"], node: hit };
  }
  return null;
}

const el = (id, type, payload, geometry, z) => createElement({ id, type, x: 0, y: 0, width: 400, height: 200, ...geometry, z, payload });
const text = (id, geometry, z, extra = {}) => el(id, "text", createTextPayload({ text: "DECORATIVE", ...extra }), geometry, z);
const rect = (id, geometry, z) => el(id, "rect", { fill: "#8b5dff" }, geometry, z);
const embed = (id, providerKey, data, geometry, z) => el(id, "embed", { providerKey, data }, geometry, z);
const youtube = (presentation = "embed", extra = {}) => ({ kind: "video", id: "dQw4w9WgXcQ", presentation, ...extra });
const docOf = (...elements) => { const doc = createDocument(); doc.stages[0].elements = elements; return doc; };
const stageOf = doc => doc.stages[0];
const byId = (doc, id) => stageOf(doc).elements.find(element => element.id === id);
const zOf = (doc, id) => byId(doc, id).z;
const games = n => Array.from({ length: n }, (_, i) => ({ name: `Game ${String(i + 1).padStart(3, "0")}`, minutes: 60 * (i + 1) }));
const snapshot = { profile: { displayName: "Espada", handle: "black", initial: "E", avatarUrl: null }, roles: [], connections: [], games: { total: 30, items: games(30), playtimeAllowed: false }, visibility: { profile: true, roles: true, connections: true, games: true } };

// =====================================================================================================================================================================
// FIX 1 - view-mode tap policy
// =====================================================================================================================================================================
test("tap policy: text and a shape painted OVER a link card do not swallow the tap - it reaches the card's link (before the fix the top box took it)", () => {
  const doc = docOf(
    embed("card", "steam", { kind: "profile", id: "gabelogannewell", presentation: "card" }, { width: 600, height: 300 }, 0),
    text("words", { width: 800, height: 140 }, 1),
    rect("shape", { x: 100, y: 50, width: 300, height: 200 }, 2),
  );
  const [stage] = paintDocument(doc, 500, make, { mode: "view" }).stages;   // scale 0.5
  const hit = tapAt(stage, 75, 50);                                          // (150, 100) units: under the text AND the shape
  assert.equal(hit.id, "card");
  assert.equal(hit.node.tag, "a");
  assert.equal(hit.node.attrs.href, "https://steamcommunity.com/id/gabelogannewell");
  // every element box is pass-through; only the real control opts in
  for (const box of stage.children.filter(isWallEl)) assert.equal(box.props.get("pointer-events"), "none");
  const marked = all(stage, node => node.attrs?.[INTERACTIVE_ATTR] === "true");
  assert.deepEqual(marked.map(node => node.tag), ["a"]);
  assert.equal(tapAt(stage, 450, 700), null, "a tap on empty stage falls through to the page");
});

test("tap policy: a player facade under decorative content still starts the player, and the control itself receives the tap", () => {
  const doc = docOf(embed("video", "youtube", youtube(), { width: 800, height: 450 }, 0), text("title", { y: 100, width: 800, height: 140 }, 1));
  const started = [];
  const players = { activate: (box, descriptor, sizing) => started.push([descriptor.providerKey, sizing.widthPx, sizing.heightPx]) };
  const [stage] = paintDocument(doc, 500, make, { mode: "view", players }).stages;
  const hit = tapAt(stage, 100, 80);
  assert.equal(hit.id, "video");
  assert.equal(hit.node.attrs.role, "button");
  hit.node.listeners.click[0]();
  assert.deepEqual(started, [["youtube", 400, 225]]);
});

test("tap policy: the Games Show all / Show fewer control stays tappable under a decorative overlap, and after every expand/collapse re-mount", () => {
  const doc = docOf(el("games", "gamid", { block: "games" }, { width: 800, height: 520 }, 0), text("banner", { y: 300, width: 800, height: 140 }, 1));
  const [stage] = paintDocument(doc, 500, make, { mode: "view", gamid: snapshot }).stages;
  const first = tapAt(stage, 200, 200);
  assert.equal(first.id, "games");
  assert.equal(first.node.className, "game-library", "the list region (scrolling + its toggle) takes taps");
  const toggle = () => all(stage, node => node.tag === "button" && node.className === "game-library-toggle")[0];
  assert.match(toggle().textContent, /Show all 30 games/);
  toggle().listeners.click[0]();
  assert.match(toggle().textContent, /Show fewer games/, "the control works");
  const again = tapAt(stage, 200, 200);
  assert.equal(again.node.className, "game-library", "the re-mounted list is marked again");
  assert.equal(again.node.dataset.expanded, "true");
  toggle().listeners.click[0]();
  assert.match(toggle().textContent, /Show all 30 games/);
});

test("tap policy: text effects never widen what a tap can hit - a glowing text box is pass-through and keeps its exact geometry", () => {
  const doc = docOf(embed("card", "steam", { kind: "app", id: "730", presentation: "card" }, { y: 300, width: 800, height: 260 }, 0), text("glow", { y: 150, width: 800, height: 140 }, 1, { glow: { color: "#62e7ff", blur: 60 } }));
  const [stage] = paintDocument(doc, 500, make, { mode: "view" }).stages;
  const glow = stage.children.find(node => node.attrs["data-el"] === "glow");
  assert.deepEqual(["left", "top", "width", "height"].map(key => glow.props.get(key)), ["0px", "75px", "400px", "70px"]);
  assert.equal(glow.props.get("overflow"), "visible");
  assert.equal(takesTaps(glow, "none"), null);
  assert.equal(tapAt(stage, 100, 150).id, "card", "just below the text box, inside its glow, the card still gets the tap");
});

test("edit mode: nothing is marked interactive, every box is pass-through, and the canvas still selects and drags the top-most element by hit-testing", () => {
  const doc = docOf(
    embed("video", "youtube", youtube(), { width: 800, height: 450 }, 0),
    el("games", "gamid", { block: "games" }, { y: 600, width: 800, height: 520 }, 1),
    text("title", { y: 100, width: 800, height: 140 }, 2),
  );
  const [stage] = paintDocument(doc, 500, make, { mode: "edit", gamid: snapshot }).stages;
  assert.equal(all(stage, node => node.attrs?.[INTERACTIVE_ATTR] !== undefined).length, 0);
  for (const box of stage.children.filter(isWallEl)) assert.equal(box.props.get("pointer-events"), "none");
  assert.equal(tapAt(stage, 200, 100), null, "the painted Wall never takes an editor tap - the canvas owns them");
  assert.equal(ops.hitTest(stageOf(doc), 400, 150)?.id, "title", "top-most element under the pointer");
  assert.equal(ops.hitTest(stageOf(doc), 400, 700)?.id, "games");
  const moved = ops.moveElements(doc, ["title"], 0, 400);
  assert.equal(moved.ok, true);
  assert.equal(byId(moved.doc, "title").y, 500);
});

// =====================================================================================================================================================================
// FIX 2 - player layering
// =====================================================================================================================================================================
const playerDoc = () => ops.addCustomElement(createDocument(), "stage_1", { type: "embed", payload: { providerKey: "youtube", data: youtube() }, width: 800, height: 450, x: 100, y: 200 });

test("layering: text added on top of a player, or brought to front over it, is kept behind the player; the result says so", () => {
  const start = playerDoc().doc;
  const player = stageOf(start).elements[0].id;
  const added = ops.addElement(start, "stage_1", "text", { x: 150, y: 300 });
  assert.equal(added.ok, true);
  const words = added.ids[0];
  assert.ok(zOf(added.doc, player) > zOf(added.doc, words), "nothing may be drawn over a player");
  assert.deepEqual(added.embedLifts, [{ stageId: "stage_1", player, above: words }]);
  const front = ops.reorderLayers(added.doc, [words], "front");
  assert.ok(zOf(front.doc, player) > zOf(front.doc, words));
  assert.equal(validateDocument(front.doc).valid, true);
});

test("layering: a shape dragged onto a player ends up behind it; elements that do not overlap the player keep the owner's order", () => {
  let doc = playerDoc().doc;
  const player = stageOf(doc).elements[0].id;
  doc = ops.addElement(doc, "stage_1", "rect", { x: 0, y: 1400 }).doc;          // far below the player
  const shape = stageOf(doc).elements.find(element => element.type === "rect").id;
  assert.ok(zOf(doc, shape) > zOf(doc, player), "no overlap: the shape stays above as placed");
  const dragged = ops.moveElements(doc, [shape], 200, -1100);
  assert.ok(zOf(dragged.doc, player) > zOf(dragged.doc, shape));
  const away = ops.moveElements(dragged.doc, [shape], 0, 1100);
  assert.equal(away.embedLifts, undefined, "nothing to fix once they no longer overlap");
});

test("layering: elements may sit BEHIND a player; links / cards and ordinary layers are arranged freely; two players are not reordered against each other", () => {
  // behind is fine
  let doc = docOf(rect("backdrop", { x: 50, y: 150, width: 900, height: 600 }, 0), embed("video", "youtube", youtube(), { x: 100, y: 200, width: 800, height: 450 }, 1));
  const kept = ops.moveElements(doc, ["backdrop"], 10, 10);
  assert.equal(kept.embedLifts, undefined);
  assert.ok(zOf(kept.doc, "video") > zOf(kept.doc, "backdrop"));
  // a card is an ordinary link: text may cover it
  doc = docOf(embed("card", "youtube", youtube("card"), { width: 800, height: 260 }, 0), text("over", { width: 800, height: 140 }, 1));
  const card = ops.moveElements(doc, ["over"], 0, 10);
  assert.ok(zOf(card.doc, "over") > zOf(card.doc, "card"));
  // normal layer operations are unchanged
  doc = docOf(rect("a", {}, 0), rect("b", {}, 1), rect("c", {}, 2));
  assert.deepEqual(ops.layerList(stageOf(ops.reorderLayers(doc, ["a"], "forward").doc)).map(e => e.id), ["c", "a", "b"]);
  assert.deepEqual(ops.layerList(stageOf(ops.reorderLayers(doc, ["c"], "back").doc)).map(e => e.id), ["b", "a", "c"]);
  // two overlapping players keep their order
  doc = docOf(embed("p1", "youtube", youtube(), { width: 800, height: 450 }, 0), embed("p2", "youtube", youtube("embed", { id: "abcdEFGhijk" }), { y: 200, width: 800, height: 450 }, 1));
  const players = ops.moveElements(doc, ["p1"], 0, 10);
  assert.equal(players.embedLifts, undefined);
  assert.ok(zOf(players.doc, "p2") > zOf(players.doc, "p1"));
});

test("layering: a Wall saved before the rule is shown with it applied (Preview), without changing the saved document; the result is still valid", () => {
  const legacy = docOf(embed("video", "youtube", youtube(), { x: 100, y: 200, width: 800, height: 450 }, 0), text("over", { x: 150, y: 300, width: 600, height: 140 }, 1), rect("far", { y: 1500, width: 200, height: 200 }, 2));
  const snapshotBefore = JSON.stringify(legacy);
  const { doc, lifts } = ops.normalizeEmbedLayering(legacy);
  assert.equal(JSON.stringify(legacy), snapshotBefore, "the input is never mutated");
  assert.deepEqual(lifts.map(lift => lift.player), ["video"]);
  assert.deepEqual(ops.layerList(stageOf(doc)).map(e => e.id), ["far", "video", "over"]);
  assert.equal(validateDocument(doc).valid, true);
  const untouched = docOf(rect("a", {}, 0));
  assert.equal(ops.normalizeEmbedLayering(untouched).doc, untouched, "nothing to do: the same document is returned");
});

// =====================================================================================================================================================================
// FIX 3 - inline player Close
// =====================================================================================================================================================================
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { props: new Map(), setProperty(name, value) { this.props.set(name, value); }, removeProperty(name) { this.props.delete(name); } }; this.listeners = {}; this.className = ""; this.textContent = ""; this.parent = null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; } }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  focus() { this.focused = true; }
  fire(type, event = {}) { for (const handler of this.listeners[type] || []) handler({ target: this, ...event }); }
}
const fakeDoc = () => { const doc = new Node("document"); doc.body = new Node("body"); doc.createElement = tag => new Node(tag); doc.removeEventListener = () => {}; return doc; };
const describe = (providerKey, data) => elementRegistry.get("embed").render({ providerKey, data }).content;
const find = (root, predicate) => { const out = []; const walk = node => { if (predicate(node)) out.push(node); node.children.forEach(walk); }; walk(root); return out; };

test("inline Close: an obvious, touch-sized Close sits in a bar ABOVE the frame (never over it); Close destroys the frame and returns focus to the facade", () => {
  const doc = fakeDoc();
  const manager = createPlayerManager({ doc, hostname: "example.com" });
  const box = new Node("div"), facade = new Node("div");
  manager.activate(box, describe("youtube", youtube()), { widthPx: 400, heightPx: 300, opener: facade });
  const [holder] = box.children;
  assert.equal(holder.attrs[INTERACTIVE_ATTR], "true", "the playing player takes taps");
  const [bar, stageBox] = holder.children;
  assert.equal(bar.style.props.get("height"), `${INLINE_BAR_PX}px`);
  assert.equal(INLINE_BAR_PX >= 44, true, "a real touch target");
  const [close] = bar.children;
  assert.equal(close.tag, "button");
  assert.equal(close.attrs["aria-label"], "Close player");
  assert.match(close.textContent, /Close/);
  const [frame] = find(box, node => node.tag === "iframe");
  assert.equal(frame.parent, stageBox, "the frame lives in its own area, the Close is outside it");
  assert.equal(find(stageBox, node => node.tag === "button").length, 0, "nothing is drawn over the player");
  assert.deepEqual([frame.style.props.get("width"), frame.style.props.get("height")], ["400px", "225px"], "the frame fits the box below the bar, 16:9 kept");
  close.fire("click");
  assert.equal(frame.attrs.src, "about:blank", "destroyed, not hidden");
  assert.equal(find(box, node => node.tag === "iframe").length, 0);
  assert.equal(box.attrs["data-playing"], "false");
  assert.deepEqual(manager.activeProviders(), []);
  assert.equal(facade.focused, true);
});

test("inline Close: one active player per provider is kept - a stale Close from a replaced player cannot close the new one", () => {
  const doc = fakeDoc();
  const manager = createPlayerManager({ doc, hostname: "example.com" });
  const a = new Node("div"), b = new Node("div");
  manager.activate(a, describe("youtube", youtube()), { widthPx: 400, heightPx: 300 });
  const staleClose = find(a, node => node.tag === "button")[0];
  manager.activate(b, describe("youtube", youtube("embed", { id: "abcdEFGhijk" })), { widthPx: 400, heightPx: 300 });
  assert.equal(find(a, node => node.tag === "iframe").length, 0, "starting a second player closed the first");
  staleClose.fire("click");
  assert.equal(find(b, node => node.tag === "iframe").length, 1, "the new player keeps playing");
  manager.destroyAll();
  assert.equal(find(b, node => node.tag === "iframe").length, 0);
});

test("inline Close: a box too short for the provider minimum PLUS the Close bar opens the larger in-page player instead of a cramped inline one", () => {
  const doc = fakeDoc();
  const manager = createPlayerManager({ doc, hostname: "example.com", viewport: () => ({ width: 390, height: 800 }) });
  const box = new Node("div");
  manager.activate(box, describe("youtube", youtube()), { widthPx: 320, heightPx: 150 });   // 150 - 44 = 106 < 112
  assert.equal(find(box, node => node.tag === "iframe").length, 0);
  assert.equal(manager.expanded, true);
  manager.destroyAll();
});

// =====================================================================================================================================================================
// FIX 4 - selected aspect: refit on change, locked resize keeps it
// =====================================================================================================================================================================
const ratio = element => element.width / element.height;
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.01, `${message}: ${actual} vs ${expected}`);

test("aspect: 16:9 -> 9:16 -> 1:1 -> 4:3 -> 16:9 refits the player box each time (same centre, about the same area), and a locked resize keeps the selected aspect", () => {
  let doc = playerDoc().doc;
  const id = stageOf(doc).elements[0].id;
  near(ratio(byId(doc, id)), 16 / 9, "starts 16:9");
  for (const [aspect, value] of [["9:16", 9 / 16], ["1:1", 1], ["4:3", 4 / 3], [undefined, 16 / 9]]) {
    const before = byId(doc, id);
    const changed = ops.setEmbedData(doc, id, { aspect });
    assert.equal(changed.ok, true);
    doc = changed.doc;
    const after = byId(doc, id);
    assert.equal(after.payload.data.aspect, aspect, "the data change and the refit are ONE operation (one undo step)");
    near(ratio(after), value, `refitted to ${aspect ?? "16:9"}`);
    assert.ok(Math.abs(after.x + after.width / 2 - (before.x + before.width / 2)) <= 1 && Math.abs(after.y + after.height / 2 - (before.y + before.height / 2)) <= 1, "centre kept");
    assert.ok(Math.abs(after.width * after.height / (before.width * before.height) - 1) < 0.02, "about the same area - no giant, no sliver");
    const locked = ops.lockedAspect(after);
    near(locked, value, "the lock is the SELECTED aspect");
    for (const [handle, dx, dy] of [["se", 120, 10], ["nw", -40, -200], ["e", -150, 0], ["w", 60, 0]]) {
      const resized = byId(ops.resizeElement(doc, id, handle, dx, dy, { keepAspect: locked }).doc, id);
      near(ratio(resized), value, `${handle} resize keeps ${aspect ?? "16:9"}`);
    }
  }
});

test("aspect: a box that drifted from its aspect (saved before this fix) snaps to the SELECTED aspect on the next locked resize - never to its current shape", () => {
  const doc = docOf(embed("video", "youtube", youtube("embed", { aspect: "9:16" }), { x: 100, y: 100, width: 800, height: 450 }, 0));
  const resized = byId(ops.resizeElement(doc, "video", "se", 0, 200, { keepAspect: ops.lockedAspect(byId(doc, "video")) }).doc, "video");
  near(ratio(resized), 9 / 16, "9:16");
});

test("aspect: providers with their own layout ('auto', e.g. Spotify) are never refitted and resize freely; a card keeps its own box; switching card -> Player refits", () => {
  const spotify = ops.addCustomElement(createDocument(), "stage_1", { type: "embed", payload: { providerKey: "spotify", data: { kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC", presentation: "embed" } }, width: 800, height: 240 }).doc;
  const sid = stageOf(spotify).elements[0].id;
  assert.equal(ops.lockedAspect(byId(spotify, sid)), null);
  const captioned = ops.setEmbedData(spotify, sid, { caption: "My mix" }).doc;
  assert.deepEqual([byId(captioned, sid).width, byId(captioned, sid).height], [800, 240]);
  const card = ops.addCustomElement(createDocument(), "stage_1", { type: "embed", payload: { providerKey: "youtube", data: youtube("card") }, width: 800, height: 260 }).doc;
  const cid = stageOf(card).elements[0].id;
  near(ops.lockedAspect(byId(card, cid)), 800 / 260, "a card keeps its own proportions");
  const shaped = ops.setEmbedData(card, cid, { aspect: "9:16" }).doc;
  assert.deepEqual([byId(shaped, cid).width, byId(shaped, cid).height], [800, 260], "a card is not a player: no refit");
  const player = ops.setEmbedData(shaped, cid, { presentation: "embed" }).doc;
  near(ratio(byId(player, cid)), 9 / 16, "becoming a Player refits to the selected aspect");
  assert.equal(ops.setEmbedData(docOf(rect("r", {}, 0)), "r", { aspect: "1:1" }).ok, false);
  assert.equal(ops.setEmbedData(card, cid, { aspect: "7:3" }).ok, false, "only the adapter's own aspects validate");
});

test("aspect: a portrait refit near the bottom of the stage stays inside the stage and valid", () => {
  const doc = docOf(embed("video", "youtube", youtube(), { x: 0, y: 1328, width: 800, height: 450 }, 0));
  const tall = ops.setEmbedData(doc, "video", { aspect: "9:16" });
  assert.equal(tall.ok, true);
  const element = byId(tall.doc, "video");
  assert.ok(element.y >= 0 && element.y + element.height <= 1778 && element.x >= 0 && element.x + element.width <= 1000);
  near(ratio(element), 9 / 16, "9:16");
});

// =====================================================================================================================================================================
// FIX 5 - per-type minimum sizes
// =====================================================================================================================================================================
test("minimums: documented per-type table (canonical units on the narrowest 360 px column)", () => {
  assert.equal(ops.pxToMinUnits(24), 67);
  assert.equal(ops.pxToMinUnits(120), 334);
  assert.equal(ops.pxToMinUnits(70), 195);
  const min = element => { const { width, height } = ops.minSizeOf(element); return [width, height]; };
  assert.deepEqual(min(rect("r", {}, 0)), [10, 10], "shapes stay flexible");
  assert.deepEqual(min(text("t", {}, 0)), [10, 10], "text stays flexible");
  assert.deepEqual(min(el("i", "image", { assetId: "a".repeat(32), fit: "cover", posX: 50, posY: 50, opacity: 1 }, {}, 0)), [10, 10], "images stay flexible");
  assert.deepEqual(min(embed("y", "youtube", youtube(), {}, 0)), [334, 195], "YouTube: its documented 120x70 px playable tile");
  assert.deepEqual(min(embed("y", "youtube", youtube("embed", { aspect: "9:16" }), {}, 0)), [195, 334], "turned for a portrait player");
  assert.deepEqual(min(embed("s", "spotify", { kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC", presentation: "embed" }, {}, 0)), [67, 67], "no documented tile: the 24 px touch floor");
  assert.deepEqual(min(embed("c", "youtube", youtube("card"), {}, 0)), [67, 67], "links / cards: the 24 px touch floor");
  for (const block of ["profile", "roles", "games", "connections"]) {
    const { width, height } = GAMID_BLOCK_INFO[block].minSize;
    assert.deepEqual(min(el("g", "gamid", { block }, {}, 0)), [width, height]);
    assert.ok(width < GAMID_BLOCK_INFO[block].size.width && height < GAMID_BLOCK_INFO[block].size.height, "never bigger than the default block");
  }
});

test("minimums: handle resize stops a player (keeping its aspect) and a GamID block at their minimum; shapes still go down to 10", () => {
  const video = docOf(embed("v", "youtube", youtube(), { x: 100, y: 100, width: 800, height: 450 }, 0));
  const small = byId(ops.resizeElement(video, "v", "se", -9999, -9999, { keepAspect: ops.lockedAspect(byId(video, "v")) }).doc, "v");
  assert.ok(small.width >= 334 && small.height >= 195, `${small.width}x${small.height}`);
  near(ratio(small), 16 / 9, "aspect kept at the minimum");
  const block = docOf(el("g", "gamid", { block: "games" }, { x: 100, y: 100, width: 800, height: 520 }, 0));
  const tiny = byId(ops.resizeElement(block, "g", "nw", 9999, 9999).doc, "g");
  assert.deepEqual([tiny.width, tiny.height], [300, 240]);
  assert.equal(byId(ops.resizeElement(block, "g", "e", -9999, 0).doc, "g").width, 300);
  const shape = docOf(rect("r", { x: 100, y: 100 }, 0));
  const dot = byId(ops.resizeElement(shape, "r", "se", -9999, -9999).doc, "r");
  assert.deepEqual([dot.width, dot.height], [ops.MIN_SIZE, ops.MIN_SIZE]);
});

test("minimums: pinch / Smaller and group resize stop at each member's minimum; numeric sizes and adding respect it; an older smaller element is never enlarged by a move", () => {
  const doc = docOf(embed("v", "youtube", youtube(), { x: 100, y: 100, width: 800, height: 450 }, 0), rect("r", { x: 100, y: 700, width: 400, height: 200 }, 1), el("g", "gamid", { block: "profile" }, { x: 100, y: 1000, width: 800, height: 260 }, 2));
  const pinched = ops.scaleSelection(doc, ["v"], 0.01).doc;
  assert.ok(byId(pinched, "v").width >= 334 && byId(pinched, "v").height >= 195);
  const grouped = ops.groupElements(doc, ["v", "r", "g"]).doc;
  const shrunk = ops.resizeGroup(grouped, ["v"], "se", -99999, -99999);
  assert.equal(shrunk.ok, true);
  assert.ok(byId(shrunk.doc, "v").width >= 334 && byId(shrunk.doc, "v").height >= 195, "the player stops at its minimum");
  assert.ok(byId(shrunk.doc, "g").width >= 300 && byId(shrunk.doc, "g").height >= 180, "so does the block");
  near(byId(shrunk.doc, "r").width / byId(shrunk.doc, "r").height, 2, "the composition stays uniform");
  assert.equal(byId(ops.updateGeometry(doc, "g", { width: 5 }).doc, "g").width, 300, "a typed size is raised to the minimum");
  const added = ops.addCustomElement(createDocument(), "stage_1", { type: "gamid", payload: { block: "games" }, width: 50, height: 50 });
  assert.deepEqual([stageOf(added.doc).elements[0].width, stageOf(added.doc).elements[0].height], [300, 240]);
  const legacy = docOf(el("old", "gamid", { block: "games" }, { width: 120, height: 90 }, 0));
  const moved = byId(ops.moveElements(legacy, ["old"], 50, 50).doc, "old");
  assert.deepEqual([moved.width, moved.height], [120, 90], "moving never resizes");
  const grown = byId(ops.scaleSelection(legacy, ["old"], 1.25).doc, "old");
  assert.ok(grown.width > 120, "it can still grow");
  assert.deepEqual([byId(ops.scaleSelection(legacy, ["old"], 0.5).doc, "old").width, byId(ops.scaleSelection(legacy, ["old"], 0.5).doc, "old").height], [120, 90], "but not shrink further");
});

// =====================================================================================================================================================================
// FIX 6 - text effect clipping
// =====================================================================================================================================================================
test("overflow policy: text is never clipped by its own box (glow / shadow / outline can spread); pictures, shapes, players and blocks keep their exact geometry", () => {
  assert.deepEqual({ ...ELEMENT_OVERFLOW }, { text: "visible" });
  for (const kind of ["rect", "image", "embed", "gamid", undefined]) assert.equal(overflowFor(kind), "hidden");
  const doc = docOf(
    text("t", { width: 600, height: 140 }, 0, { shadow: { color: "#000000", x: 0, y: 10, blur: 20 }, stroke: { color: "#ff4fd8", width: 4 } }),
    rect("r", { y: 200 }, 1),
    embed("v", "youtube", youtube(), { y: 500, width: 800, height: 450 }, 2),
    el("g", "gamid", { block: "roles" }, { y: 1000, width: 800, height: 200 }, 3),
  );
  const [stage] = paintDocument(doc, 500, make, { mode: "view", gamid: snapshot }).stages;
  const overflow = id => stage.children.find(node => node.attrs["data-el"] === id).props.get("overflow");
  assert.deepEqual(["t", "r", "v", "g"].map(overflow), ["visible", "hidden", "hidden", "hidden"]);
  assert.equal(stage.props.get("overflow"), "hidden", "the stage still ends at its edge");
});
