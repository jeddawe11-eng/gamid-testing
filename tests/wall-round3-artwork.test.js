// Wall Round 3 - the ARTWORK engine: transparency, crop, masks, effects, blend, split (2..5, vertical / horizontal, draggable boundaries, reset, remove), lock,
// click-through and the Layers drag order. Pure ops + the real painter (a DOM-free node double); the database mirror is checked by the shared corpus.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { paintDocument, effectsFilter, MASK_CLIP } from "../dist/wall-kit/paint.js";
import { createImagePayload, cropFor, cropRatio, validateImagePayload, EFFECT_LIMITS, MASKS, BLENDS } from "../dist/wall-kit/image.js";
import { elementRegistry } from "../dist/wall/elements.js";
import * as ops from "../dist/wall-kit/ops.js";

const UUID = "3f2b8c1e-5a4d-4e7b-9c60-1d2e3f4a5b6c";
const docWith = (...elements) => { const d = createDocument({ stageCount: 2 }); d.stages[0].elements = elements; return d; };
const art = (id, over = {}, extra = {}) => createElement({ id, type: "image", x: 100, y: 100, width: 600, height: 300, z: 0, payload: createImagePayload(UUID, { aw: 1200, ah: 600, ...over }), ...extra });
const valid = doc => validateDocument(doc).valid;
const stageOf = (doc, i = 0) => doc.stages[i].elements;

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.style = { setProperty: (n, v) => this.props.set(n, v) }; }
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
const paint = (doc, ctx = {}) => paintDocument(doc, 1000, make, { assets: { urlFor: () => "blob:x/art" }, ...ctx }).stages[0];
const elNode = (stage, id) => all(stage, node => node.attrs["data-el"] === id)[0];
const frameOf = node => all(node, child => child.className === "wall-art-frame")[0];

// ---------- transparency and backwards compatibility ----------
test("A1 new artwork is truly transparent; a Wall saved before Round 3 keeps its exact dark backing and picture opacity", () => {
  const fresh = paint(docWith(art("a")));
  assert.equal(createImagePayload(UUID).backdrop, "none");
  assert.equal(frameOf(elNode(fresh, "a")).props.get("background"), undefined, "no forced backing");
  const legacyPayload = { assetId: UUID, fit: "cover", posX: 50, posY: 50, opacity: 0.5 };   // exactly what a pre-Round-3 document holds
  const legacy = paint(docWith(createElement({ id: "old", type: "image", x: 0, y: 0, width: 400, height: 300, z: 0, payload: legacyPayload })));
  const node = elNode(legacy, "old");
  assert.equal(frameOf(node).props.get("background"), "#14101f", "old Walls stay visually safe");
  assert.equal(all(node, child => child.tag === "img")[0].props.get("opacity"), "0.5", "legacy opacity stays on the picture");
  assert.equal(node.props.get("opacity"), undefined);
  const coloured = paint(docWith(art("c", { backdrop: "#223344", opacity: 0.4 })));
  assert.equal(frameOf(elNode(coloured, "c")).props.get("background"), "#223344", "an explicit backing colour");
  assert.equal(elNode(coloured, "c").props.get("opacity"), "0.4", "new artwork opacity applies to the whole artwork");
});

test("A1 the @black Espada Wall (read-only) is still valid and still draws its image plates on the classic backing", () => {
  const espada = JSON.parse(readFileSync(new URL("../docs/testing-backups/black-wall-espada-rev14.json", import.meta.url), "utf8"));
  assert.equal(validateDocument(espada).valid, true);
  const stage = paintDocument(espada, 1000, make, { assets: { urlFor: () => "blob:x/y" } }).stages[0];
  const images = all(stage, node => node.className?.includes?.("wall-el-image"));
  assert.ok(images.length >= 2);
  for (const image of images) assert.equal(frameOf(image).props.get("background"), "#14101f");
});

// ---------- crop ----------
test("A2 crop presets: Original / 1:1 / 16:9 / 9:16 / Free give windows of exactly that shape; zoom and focus stay inside the source", () => {
  const size = { aw: 1200, ah: 600 };
  for (const [preset, ratio] of [["original", 2], ["1:1", 1], ["16:9", 16 / 9], ["9:16", 9 / 16], ["free", 0.75]]) {
    for (const zoom of [1, 2.5, 8]) for (const [fx, fy] of [[0, 0], [50, 50], [100, 100]]) {
      const crop = cropFor(preset, { ...size, zoom, focusX: fx, focusY: fy, ratio: 0.75 });
      assert.ok(Math.abs(cropRatio(crop, 1200, 600) - ratio) < 0.01, `${preset} ${zoom}`);
      assert.equal(validateImagePayload(createImagePayload(UUID, { crop })).length, 0, `${preset} valid`);
    }
  }
});
test("A2 crop is non-destructive: the box takes the crop's proportions, the picture is positioned by percentages, Reset removes it", () => {
  let doc = docWith(art("a"));
  const crop = cropFor("1:1", { aw: 1200, ah: 600, zoom: 2, focusX: 25, focusY: 50 });
  const set = ops.setCrop(doc, "a", crop);
  assert.equal(set.ok, true);
  doc = set.doc;
  const element = stageOf(doc)[0];
  assert.equal(element.width, element.height, "square box for a 1:1 crop");
  assert.equal(element.payload.assetId, UUID, "the same asset - nothing re-encoded");
  assert.equal(ops.lockedAspect(element), 1, "resizing keeps the crop undistorted");
  const img = all(elNode(paint(doc), "a"), node => node.tag === "img")[0];
  assert.equal(img.props.get("width"), `${Math.round((100 / crop.w) * 1000) / 1000}%`);
  assert.match(img.props.get("left"), /^-\d/);
  const reset = ops.setCrop(doc, "a", null);
  assert.equal(stageOf(reset.doc)[0].payload.crop, undefined);
  assert.equal(ops.setCrop(docWith(art("s", { slice: { set: "s1", dir: "v", from: 0, to: 0.5 } })), "s", crop).errors[0], "ALREADY_SPLIT");
});

// ---------- mask, effects, blend ----------
test("A3 masks, effects and blend modes are enumerated / bounded data drawn by the painter - never CSS from the document", () => {
  for (const mask of MASKS) {
    const stage = paint(docWith(art("a", { mask })));
    assert.equal(frameOf(elNode(stage, "a")).props.get("clip-path"), MASK_CLIP[mask]);
  }
  for (const blend of BLENDS) {
    const stage = paint(docWith(art("a", { blend })));
    assert.equal(elNode(stage, "a").props.get("mix-blend-mode"), blend === "normal" ? undefined : blend);
  }
  const effects = { shadow: { color: "#000000", blur: 20, x: 5, y: 10 }, glow: { color: "#62e7ff", blur: 40 }, blur: 4, brightness: 1.5, contrast: 0.5, saturation: 2 };
  const node = elNode(paint(docWith(art("a", { effects }))), "a");
  assert.equal(node.props.get("filter"), "brightness(1.5) contrast(0.5) saturate(2) blur(4px) drop-shadow(5px 10px 20px #000000) drop-shadow(0 0 20px #62e7ff) drop-shadow(0 0 40px #62e7ff)");
  assert.equal(node.props.get("overflow"), "visible", "effects may spread past the box; the frame clips the picture");
  assert.equal(effectsFilter({ blur: 999, brightness: -5, shadow: { color: "red;x", blur: 1e9, x: 1e9, y: -1e9 } }, 1), "brightness(0) blur(40px) drop-shadow(100px -100px 100px #000000)", "the painter re-bounds every number and colour");
  assert.deepEqual(EFFECT_LIMITS.blur, [0, 40]);
  for (const bad of [{ blur: 41 }, { brightness: 2.1 }, { contrast: -1 }, { saturation: 3.1 }, { filter: "blur(1px)" }, { shadow: { color: "#000000", blur: 1, x: 0 } }]) assert.deepEqual(validateImagePayload(createImagePayload(UUID, { effects: bad })), ["INVALID_EFFECTS"], JSON.stringify(bad));
  const scaled = elementRegistry.get("image").scale(createImagePayload(UUID, { effects, radius: 40 }), 0.5);
  assert.deepEqual([scaled.radius, scaled.effects.blur, scaled.effects.shadow.blur, scaled.effects.glow.blur, scaled.effects.brightness], [20, 2, 10, 20, 1.5], "sizes scale, colour grading does not");
});

// ---------- split ----------
for (const [count, dir] of [[2, "v"], [3, "v"], [5, "v"], [2, "h"], [3, "h"], [5, "h"]]) {
  test(`A4 split ${count} ${dir === "v" ? "vertical" : "horizontal"}: equal grouped pieces of ONE artwork that tile the original exactly`, () => {
    const doc = docWith(art("a", { mask: "circle" }), createElement({ id: "top", type: "rect", x: 0, y: 0, width: 50, height: 50, z: 1, payload: { fill: "#ffffff" } }));
    const result = ops.splitArtwork(doc, "a", count, dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const pieces = stageOf(result.doc).filter(element => element.payload.slice);
    assert.equal(pieces.length, count);
    assert.equal(pieces[0].id, "a", "the first piece keeps the element id");
    assert.ok(pieces.every(piece => piece.groupId === result.set && piece.payload.slice.set === result.set && piece.payload.assetId === UUID && piece.payload.mask === "circle"));
    const span = dir === "h" ? 300 : 600;
    assert.equal(pieces.reduce((sum, piece) => sum + (dir === "h" ? piece.height : piece.width), 0), span, "no gap, no overlap");
    const sizes = pieces.map(piece => (dir === "h" ? piece.height : piece.width));
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, "equal initial boundaries");
    assert.equal(pieces[0].payload.slice.from, 0);
    assert.equal(pieces.at(-1).payload.slice.to, 1);
    assert.equal(stageOf(result.doc).find(element => element.id === "top").z, count, "the pieces took the original's layer slot");
    // every piece draws the WHOLE artwork (same mask, same picture) shifted by its band - one picture across the pieces
    const stage = paint(result.doc);
    const frames = pieces.map(piece => frameOf(elNode(stage, piece.id)));
    assert.ok(frames.every(frame => frame.props.get("clip-path") === MASK_CLIP.circle));
    assert.equal(new Set(pieces.map(piece => all(elNode(stage, piece.id), node => node.tag === "img")[0].attrs.src)).size, 1, "one shared picture -> a GIF plays one timeline");
    assert.equal(valid(result.doc), true);
    // remove -> exactly the original artwork back
    const removed = ops.removeSplit(result.doc, pieces[1].id);
    const back = stageOf(removed.doc).find(element => element.type === "image");
    assert.deepEqual([back.id, back.x, back.y, back.width, back.height, back.payload.slice, back.groupId], ["a", 100, 100, 600, 300, undefined, undefined]);
  });
}

test("A4 split boundaries drag (bounded), reset to equal, survive group resize, ungroup, Move to Stage and save/reload", () => {
  let doc = ops.splitArtwork(docWith(art("a")), "a", 3, "v").doc;
  const moved = ops.moveSplitBoundary(doc, "a", 0, 0.5);
  assert.equal(moved.ok, true);
  let pieces = ops.splitPieces(moved.doc, "a");
  assert.ok(Math.abs(pieces[0].width - 300) <= 1 && Math.abs(pieces[0].payload.slice.to - 0.5) < 0.01, "left piece grew to half");
  assert.equal(pieces[1].x + pieces[1].width, 500, "the right piece keeps its far edge");
  const clamped = ops.splitPieces(ops.moveSplitBoundary(doc, "a", 0, 0.99).doc, "a");
  assert.ok(clamped[1].payload.slice.to - clamped[1].payload.slice.from >= 0.02 - 1e-9 && clamped[1].width >= ops.MIN_SIZE, "a band never collapses");
  assert.equal(ops.moveSplitBoundary(doc, "a", 5, 0.5).errors[0], "INVALID_BOUNDARY");
  const reset = ops.resetSplit(moved.doc, "a");
  assert.deepEqual(ops.splitPieces(reset.doc, "a").map(piece => piece.width), [200, 200, 200]);
  // a split artwork is a group: it resizes uniformly as one
  const grown = ops.resizeGroup(doc, ["a"], "se", 120, 60);
  assert.equal(grown.ok, true);
  pieces = ops.splitPieces(grown.doc, "a");
  const wholes = pieces.map(piece => piece.width / (piece.payload.slice.to - piece.payload.slice.from));
  assert.ok(Math.max(...wholes) - Math.min(...wholes) < 3, "every piece still draws the same whole artwork");
  // ungroup -> each piece is its own layer; a piece can go to another stage alone
  doc = ops.ungroupElements(doc, ["a"]).doc;
  const middle = ops.splitPieces(doc, "a")[1].id;
  const sent = ops.moveElementsToStage(doc, [middle], doc.stages[1].id);
  assert.equal(sent.ok, true);
  assert.equal(stageOf(sent.doc, 1)[0].payload.slice.set, stageOf(sent.doc)[0].payload.slice.set);
  assert.equal(ops.splitPieces(sent.doc, "a").length, 2, "split tools work per stage");
  const reloaded = JSON.parse(JSON.stringify(sent.doc));
  assert.equal(valid(reloaded), true);
  assert.deepEqual(reloaded, sent.doc);
});

test("A4 split refusals: rotated, grouped, locked, already split, too small, bad count / direction", () => {
  assert.equal(ops.splitArtwork(docWith(art("a", {}, { rotation: 10 })), "a", 2).errors[0], "ROTATED_SPLIT_UNSUPPORTED");
  assert.equal(ops.splitArtwork(docWith(art("a", {}, { groupId: "g" }), art("b", {}, { groupId: "g", x: 0 })), "a", 2).errors[0], "UNGROUP_BEFORE_SPLIT");
  assert.equal(ops.splitArtwork(docWith(art("a", { locked: true })), "a", 2).errors[0], "ELEMENT_LOCKED");
  assert.equal(ops.splitArtwork(ops.splitArtwork(docWith(art("a")), "a", 2).doc, "a", 2).errors[0], "ALREADY_SPLIT");
  assert.equal(ops.splitArtwork(docWith(art("a", {}, { width: 40 })), "a", 5).errors[0], "TOO_SMALL_TO_SPLIT");
  for (const [count, dir] of [[1, "v"], [6, "v"], [2, "d"]]) assert.equal(ops.splitArtwork(docWith(art("a")), "a", count, dir).errors[0], "INVALID_SPLIT");
  assert.equal(ops.splitArtwork(docWith(createElement({ id: "r", type: "rect", x: 0, y: 0, width: 100, height: 100, z: 0, payload: { fill: "#000000" } })), "r", 2).errors[0], "NOT_AN_ARTWORK");
});

// ---------- lock, click-through, layers ----------
test("A5 Lock Position: every geometry change is refused, the artwork stays selectable, styleable, layerable and movable between stages", () => {
  const doc = docWith(art("a", { locked: true }), art("b", {}, { x: 0, y: 600, z: 1 }));
  for (const result of [ops.moveElements(doc, ["a"], 10, 0), ops.resizeElement(doc, "a", "se", 10, 10), ops.rotateElement(doc, "a", 15), ops.scaleSelection(doc, ["a"], 2),
    ops.alignElements(doc, ["a"], "left"), ops.updateGeometry(doc, "a", { x: 0 }), ops.moveElements(doc, ["a", "b"], 5, 5)]) assert.deepEqual(result.errors, ["ELEMENT_LOCKED"]);
  assert.equal(ops.hitTest(doc.stages[0], 300, 200)?.id, "a", "still selectable on the canvas");
  assert.equal(ops.updatePayload(doc, "a", { mask: "diamond" }).ok, true, "Properties still work");
  assert.equal(ops.reorderLayers(doc, ["a"], "front").ok, true, "layering still works");
  assert.equal(ops.moveElementsToStage(doc, ["a"], doc.stages[1].id).ok, true);
  assert.equal(ops.updatePayload(doc, "a", { locked: undefined }).ok, true, "Unlock");
});
test("A5 Click-through: a canvas tap passes to what is beneath; the artwork stays manageable from Layers", () => {
  const under = createElement({ id: "under", type: "rect", x: 100, y: 100, width: 600, height: 300, z: 0, payload: { fill: "#000000" } });
  const doc = docWith(under, art("a", { clickThrough: true }, { z: 1 }));
  assert.equal(ops.hitTest(doc.stages[0], 300, 200)?.id, "under");
  assert.equal(ops.hitTest(docWith(art("a", { clickThrough: true })).stages[0], 300, 200), null);
  assert.equal(ops.layerList(doc.stages[0])[0].id, "a", "listed in Layers");
});
test("A6 Layers drag order: one stacking model - a group moves as a unit, a member can be reordered inside its group", () => {
  const rect = (id, z, groupId) => createElement({ id, type: "rect", x: 0, y: 0, width: 50, height: 50, z, payload: { fill: "#000000" }, ...(groupId ? { groupId } : {}) });
  const doc = docWith(rect("a", 0), rect("b", 1, "g"), rect("c", 2, "g"), rect("d", 3));
  const order = result => ops.layerList(result.doc.stages[0]).map(element => element.id);
  assert.deepEqual(order(ops.moveLayer(doc, "a", "d", "above")), ["a", "d", "c", "b"]);
  assert.deepEqual(order(ops.moveLayer(doc, "d", "a", "below")), ["c", "b", "a", "d"]);
  assert.deepEqual(order(ops.moveLayer(doc, "b", "d", "above")), ["c", "b", "d", "a"], "the whole group moves");
  assert.deepEqual(order(ops.moveLayer(doc, "b", "c", "above")), ["d", "b", "c", "a"], "reorder inside the group");
  assert.deepEqual(order(ops.moveLayer(doc, "a", "b", "above")), ["d", "a", "c", "b"], "dropped next to a group -> beside the whole group");
  assert.equal(ops.moveLayer(doc, "a", "a", "above").ok, false);
});

// ---------- the editor wiring (source-level) ----------
test("A7 the editor offers the Artwork sections, the split boundary handles, the lock badge and Layer drag - built with DOM APIs only", () => {
  const controls = readFileSync(new URL("../dist/wall-editor/controls.js", import.meta.url), "utf8");
  for (const name of ["Artwork", "Crop", "Mask", "Split", "Appearance", "Effects", "Layering"]) assert.match(controls, new RegExp(`section\\((?:root|[a-z]+), "${name}"`), name);
  const canvas = readFileSync(new URL("../dist/wall-editor/canvas.js", import.meta.url), "utf8");
  assert.match(canvas, /data-boundary/);
  assert.match(canvas, /ops\.moveSplitBoundary/);
  assert.match(canvas, /ed-lock-badge/);
  const editor = readFileSync(new URL("../dist/wall-editor/editor.js", import.meta.url), "utf8");
  assert.match(editor, /ops\.moveLayer\(/);
  for (const source of [controls, canvas, editor]) assert.doesNotMatch(source.replace(/\/\/.*$/gm, ""), /\.innerHTML|insertAdjacentHTML|outerHTML/);
});
