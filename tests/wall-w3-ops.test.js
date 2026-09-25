// W3 - the editor's pure domain operations: geometry (move / resize / rotate / containment), layers, duplicate, groups, stages, snapping, alignment, hit
// testing. Deterministic unit tests under plain Node - the editor UI is only a thin driver of these functions.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../dist/wall/validate.js";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { renderDocument } from "../dist/wall/render.js";
import * as ops from "../dist/wall-kit/ops.js";
import { createTextPayload } from "../dist/wall-kit/text.js";

const W = 1000, H = 1778;
const rectEl = (id, x, y, width, height, extra = {}) => createElement({ id, type: "rect", x, y, width, height, z: extra.z ?? 0, payload: { fill: "#8b5dff" }, ...extra });
const docOf = (...elements) => { const d = createDocument(); d.stages[0].elements = elements; return d; };
const byId = (doc, id) => ops.locate(doc, id)?.element;
const stage0 = doc => doc.stages[0];
const zOrder = (doc, stageIndex = 0) => ops.ordered(doc.stages[stageIndex]).map(element => element.id);
const okDoc = result => { assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(validateDocument(result.doc).valid, true); return result.doc; };

// ---------- the safety net ----------
test("every operation is immutable and returns a document the W1 validator accepts", () => {
  const start = docOf(rectEl("a", 100, 100, 200, 200), rectEl("b", 400, 400, 200, 200, { z: 1 }));
  const frozen = JSON.stringify(start);
  const results = [
    ops.addElement(start, "stage_1", "text"), ops.moveElements(start, ["a"], 30, 30), ops.resizeElement(start, "a", "se", 20, 20), ops.rotateElement(start, "a", 30),
    ops.reorderLayers(start, ["a"], "front"), ops.duplicateElements(start, ["a"]), ops.deleteElements(start, ["a"]), ops.groupElements(start, ["a", "b"]),
    ops.alignElements(start, ["a"], "left"), ops.addStage(start), ops.updatePayload(start, "a", { fill: "#000000" }), ops.scaleSelection(start, ["a"], 1.5),
  ];
  for (const result of results) okDoc(result);
  assert.equal(JSON.stringify(start), frozen, "the input document was never mutated");
});
test("an operation that would produce an invalid document fails, reports the W1 error codes and returns the unchanged input", () => {
  const start = docOf(rectEl("a", 0, 0, 100, 100));
  const result = ops.updatePayload(start, "a", { fill: "not-a-colour" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["INVALID_FILL:a"]);
  assert.equal(result.doc, start);
});
test("operations are deterministic: the same input always gives the same output", () => {
  const start = docOf(rectEl("a", 100, 100, 200, 200), rectEl("b", 400, 400, 200, 200, { z: 1 }));
  assert.deepEqual(ops.duplicateElements(start, ["a", "b"]).doc, ops.duplicateElements(start, ["a", "b"]).doc);
  assert.deepEqual(ops.groupElements(start, ["a", "b"]).doc, ops.groupElements(start, ["a", "b"]).doc);
});

// ---------- ids ----------
test("ids: new element, stage and group ids are unique across the whole document and derived, not random", () => {
  let doc = createDocument();
  const ids = new Set();
  for (let i = 0; i < 12; i += 1) { const result = ops.addElement(doc, "stage_1", i % 2 ? "rect" : "text"); doc = okDoc(result); ids.add(result.ids[0]); }
  assert.equal(ids.size, 12);
  assert.deepEqual([...ids].slice(0, 3), ["el_1", "el_2", "el_3"]);
  const withStage = okDoc(ops.addStage(doc));
  assert.deepEqual(withStage.stages.map(stage => stage.id), ["stage_1", "stage_2"]);
  assert.equal(ops.nextId(docOf(rectEl("el_1", 0, 0, 10, 10)), "el"), "el_2");
});
test("ids: a duplicated selection never collides with existing ids, including group ids", () => {
  let doc = docOf(rectEl("el_1", 0, 0, 100, 100), rectEl("el_2", 200, 0, 100, 100, { z: 1 }), rectEl("el_3", 400, 0, 100, 100, { z: 2 }));
  doc = okDoc(ops.groupElements(doc, ["el_1", "el_2"]));
  const copy = ops.duplicateElements(doc, ["el_1"]);
  const all = stage0(okDoc(copy)).elements.map(element => element.id);
  assert.equal(new Set(all).size, all.length);
  const groups = new Set(stage0(copy.doc).elements.map(element => element.groupId).filter(Boolean));
  assert.equal(groups.size, 2, "the duplicate got its own group id");
});

// ---------- add ----------
test("add: text, rectangle, rounded rectangle and circle land centred inside the stage on top of everything", () => {
  let doc = docOf(rectEl("bg", 0, 0, 500, 500));
  for (const kind of Object.keys(ops.ELEMENT_KINDS)) doc = okDoc(ops.addElement(doc, "stage_1", kind));
  assert.equal(stage0(doc).elements.length, 5);
  const last = ops.ordered(stage0(doc)).at(-1);
  assert.equal(last.payload.radius, 1000);
  for (const element of stage0(doc).elements) assert.ok(element.x >= 0 && element.y >= 0 && element.x + element.width <= W && element.y + element.height <= H);
  assert.deepEqual(stage0(doc).elements.map(element => element.z).sort((a, b) => a - b), [0, 1, 2, 3, 4], "dense z");
  assert.equal(ops.addElement(doc, "nope", "text").ok, false);
  assert.equal(ops.addElement(doc, "stage_1", "hologram").ok, false);
});

// ---------- move + containment ----------
test("move: applies the delta in whole units", () => {
  const doc = okDoc(ops.moveElements(docOf(rectEl("a", 100, 100, 200, 200)), ["a"], 30.4, -20.6));
  assert.deepEqual([byId(doc, "a").x, byId(doc, "a").y], [130, 79]);
});
test("containment: an element stops at every stage edge and never leaves the stage", () => {
  const start = docOf(rectEl("a", 400, 400, 200, 200));
  const edge = (dx, dy) => { const doc = okDoc(ops.moveElements(start, ["a"], dx, dy)); const a = byId(doc, "a"); return [a.x, a.y]; };
  assert.deepEqual(edge(-9999, 0), [0, 400]);
  assert.deepEqual(edge(9999, 0), [800, 400]);
  assert.deepEqual(edge(0, -9999), [400, 0]);
  assert.deepEqual(edge(0, 9999), [400, H - 200]);
  assert.deepEqual(edge(-9999, -9999), [0, 0]);
});
test("containment: an edge element is still movable back inward (never stuck), and a group moves as one rigid unit that stops when its FIRST member hits an edge", () => {
  const atEdge = docOf(rectEl("a", 0, 0, 100, 100));
  assert.deepEqual([okDoc(ops.moveElements(atEdge, ["a"], 50, 50))].map(doc => [byId(doc, "a").x, byId(doc, "a").y])[0], [50, 50]);
  const grouped = okDoc(ops.groupElements(docOf(rectEl("a", 100, 100, 100, 100), rectEl("b", 700, 100, 100, 100, { z: 1 })), ["a", "b"]));
  const moved = okDoc(ops.moveElements(grouped, ["a"], 5000, 0));
  assert.deepEqual([byId(moved, "a").x, byId(moved, "b").x], [300, 900], "b reached the right edge, so the whole group stopped");
  assert.equal(byId(moved, "b").x - byId(moved, "a").x, 600, "the members kept their relative distance");
});
test("move: a whole selection across stages is refused", () => {
  const doc = createDocument({ stageCount: 2 });
  doc.stages[0].elements = [rectEl("a", 0, 0, 50, 50)];
  doc.stages[1].elements = [rectEl("b", 0, 0, 50, 50)];
  assert.equal(ops.moveElements(doc, ["a", "b"], 5, 5).ok, false);
});

// ---------- resize ----------
test("resize: each corner and side handle resizes from the geometry at gesture start and keeps the opposite edge fixed", () => {
  const start = docOf(rectEl("a", 300, 300, 200, 100));
  const geometry = (handle, dx, dy) => { const a = byId(okDoc(ops.resizeElement(start, "a", handle, dx, dy)), "a"); return [a.x, a.y, a.width, a.height]; };
  assert.deepEqual(geometry("se", 50, 30), [300, 300, 250, 130]);
  assert.deepEqual(geometry("nw", -40, -20), [260, 280, 240, 120]);
  assert.deepEqual(geometry("ne", 30, -10), [300, 290, 230, 110]);
  assert.deepEqual(geometry("sw", -30, 10), [270, 300, 230, 110]);
  assert.deepEqual(geometry("e", 60, 999), [300, 300, 260, 100], "side handles ignore the other axis");
  assert.deepEqual(geometry("w", -60, 999), [240, 300, 260, 100]);
});
test("resize: the same (start, delta) always gives the same result - the gesture is not cumulative", () => {
  const start = docOf(rectEl("a", 300, 300, 200, 100));
  const once = ops.resizeElement(start, "a", "se", 40, 40).doc;
  const again = ops.resizeElement(start, "a", "se", 40, 40).doc;
  assert.deepEqual(once, again);
});
test("resize: never below the minimum size, and never past the stage edge", () => {
  const start = docOf(rectEl("a", 300, 300, 200, 100));
  const tiny = byId(okDoc(ops.resizeElement(start, "a", "se", -9999, -9999)), "a");
  assert.deepEqual([tiny.width, tiny.height], [ops.MIN_SIZE, ops.MIN_SIZE]);
  const big = byId(okDoc(ops.resizeElement(start, "a", "se", 9999, 9999)), "a");
  assert.deepEqual([big.x + big.width, big.y + big.height], [W, H]);
  const west = byId(okDoc(ops.resizeElement(start, "a", "nw", -9999, -9999)), "a");
  assert.deepEqual([west.x, west.y], [0, 0]);
  assert.equal(west.x + west.width, 500, "the opposite (right) edge stayed put");
});
test("resize: an edge element and a tiny element near a stage corner can still be enlarged (the two W0 Samsung bugs)", () => {
  const cornerTiny = docOf(rectEl("a", 0, 0, 12, 12));
  const grown = byId(okDoc(ops.resizeElement(cornerTiny, "a", "se", 200, 200)), "a");
  assert.deepEqual([grown.width, grown.height], [212, 212]);
  const bottomRight = docOf(rectEl("a", W - 12, H - 12, 12, 12));
  const enlarged = byId(okDoc(ops.resizeElement(bottomRight, "a", "nw", -300, -300)), "a");
  assert.deepEqual([enlarged.width, enlarged.height], [312, 312]);
  assert.deepEqual([enlarged.x + enlarged.width, enlarged.y + enlarged.height], [W, H]);
  const gestureFree = byId(okDoc(ops.scaleSelection(cornerTiny, ["a"], 2)), "a");
  assert.equal(gestureFree.width, 24, "Bigger / 2x bigger works without any gesture");
  const centred = byId(okDoc(ops.scaleSelection(docOf(rectEl("a", 500, 500, 20, 20)), ["a"], 3)), "a");
  assert.deepEqual([centred.width, centred.x, centred.y], [60, 480, 480]);
});
test("resize: keepAspect on a corner preserves the proportions", () => {
  const start = docOf(rectEl("a", 100, 100, 200, 100));
  const a = byId(okDoc(ops.resizeElement(start, "a", "se", 100, 5, { keepAspect: true })), "a");
  assert.equal(a.width / a.height, 2);
});
test("resize: an element that belongs to a group cannot be resized on its own", () => {
  const grouped = okDoc(ops.groupElements(docOf(rectEl("a", 0, 0, 100, 100), rectEl("b", 200, 0, 100, 100, { z: 1 })), ["a", "b"]));
  assert.equal(ops.resizeElement(grouped, "a", "se", 10, 10).ok, false);
});

// ---------- group resize ----------
test("group resize: one uniform factor about the opposite corner scales positions and sizes; text sizes follow through the type's scale hook", () => {
  let doc = docOf(rectEl("a", 100, 100, 100, 100), createElement({ id: "t", type: "text", x: 300, y: 100, width: 200, height: 100, z: 1, payload: createTextPayload({ fontSize: 40 }) }));
  doc = okDoc(ops.groupElements(doc, ["a", "t"]));
  const result = ops.resizeGroup(doc, ["a"], "se", 200, 0);
  const scaled = okDoc(result);
  assert.ok(Math.abs(result.factor - 1.5) < 0.01);
  assert.deepEqual([byId(scaled, "a").x, byId(scaled, "a").y, byId(scaled, "a").width], [100, 100, 150]);
  assert.equal(byId(scaled, "t").payload.fontSize, 60);
  assert.equal(byId(scaled, "a").groupId, byId(scaled, "t").groupId);
});
test("group resize: capped by the stage, floored by the smallest member", () => {
  const doc = okDoc(ops.groupElements(docOf(rectEl("a", 100, 100, 100, 100), rectEl("b", 300, 100, 100, 100, { z: 1 })), ["a", "b"]));
  const huge = okDoc(ops.resizeGroup(doc, ["a"], "se", 99999, 99999));
  for (const element of stage0(huge).elements) assert.ok(element.x + element.width <= W && element.y + element.height <= H);
  const small = okDoc(ops.resizeGroup(doc, ["a"], "se", -99999, -99999));
  for (const element of stage0(small).elements) assert.ok(element.width >= ops.MIN_SIZE && element.height >= ops.MIN_SIZE);
});
test("multi-selection resizes uniformly too (a selection does not need to be a group)", () => {
  const doc = docOf(rectEl("a", 100, 100, 100, 100), rectEl("b", 300, 100, 100, 100, { z: 1 }));
  const scaled = okDoc(ops.resizeGroup(doc, ["a", "b"], "se", 300, 0));
  assert.equal(byId(scaled, "a").width, 200);
  assert.equal(byId(scaled, "b").width, 200);
});

// ---------- rotation ----------
test("rotation: sets an optional rotation, normalizes the angle, resets at 0 (removing the key), and keeps the rotated bounds inside the stage", () => {
  const start = docOf(rectEl("a", 400, 400, 200, 100));
  assert.equal(byId(okDoc(ops.rotateElement(start, "a", 90)), "a").rotation, 90);
  assert.equal(byId(okDoc(ops.rotateElement(start, "a", 270)), "a").rotation, -90);
  assert.equal(byId(okDoc(ops.rotateElement(start, "a", 360)), "a").rotation, undefined);
  const reset = okDoc(ops.rotateElement(okDoc(ops.rotateElement(start, "a", 45)), "a", 0));
  assert.equal("rotation" in byId(reset, "a"), false);
  assert.equal(ops.normalizeAngle(-180), 180);
  assert.ok(Number.isNaN(ops.normalizeAngle(Infinity)));
  const nearEdge = okDoc(ops.rotateElement(docOf(rectEl("a", 0, 0, 300, 100)), "a", 90));
  const box = ops.elementBounds(byId(nearEdge, "a"));
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= W && box.y + box.height <= H, "shifted back inside");
  assert.equal(ops.rotateElement(docOf(rectEl("a", 0, 0, W, 1000)), "a", 45).ok, false, "a 1000x1000 element cannot rotate 45 degrees inside a 1000-wide stage");
  assert.equal(ops.rotateElement(docOf(rectEl("a", 0, 0, W, 50)), "a", 90).ok, true, "but a wide thin one can turn upright");
});
test("rotation: moving and resizing a rotated element keeps its rotated bounds inside the stage", () => {
  const rotated = okDoc(ops.rotateElement(docOf(rectEl("a", 400, 800, 300, 100)), "a", 45));
  for (const [dx, dy] of [[-9999, 0], [9999, 0], [0, -9999], [0, 9999]]) {
    const moved = okDoc(ops.moveElements(rotated, ["a"], dx, dy));
    const box = ops.elementBounds(byId(moved, "a"));
    assert.ok(box.x >= -1e-6 && box.y >= -1e-6 && box.x + box.width <= W + 1e-6 && box.y + box.height <= H + 1e-6);
  }
  const grown = okDoc(ops.resizeElement(rotated, "a", "se", 9999, 9999));
  const box = ops.elementBounds(byId(grown, "a"));
  assert.ok(box.x >= -1e-6 && box.x + box.width <= W + 1e-6 && box.y + box.height <= H + 1e-6);
});
test("rotation: a grouped element cannot be rotated on its own", () => {
  const grouped = okDoc(ops.groupElements(docOf(rectEl("a", 0, 0, 100, 100), rectEl("b", 200, 0, 100, 100, { z: 1 })), ["a", "b"]));
  assert.equal(ops.rotateElement(grouped, "a", 10).ok, false);
});
test("rotation: the renderer receives the rotation and the document stays valid", () => {
  const doc = okDoc(ops.rotateElement(docOf(rectEl("a", 400, 800, 300, 100)), "a", 30));
  assert.equal(renderDocument(doc, { viewportWidth: 500 }).stages[0].elements[0].rotation, 30);
});

// ---------- layers ----------
const stack = () => docOf(rectEl("a", 0, 0, 50, 50, { z: 0 }), rectEl("b", 100, 0, 50, 50, { z: 1 }), rectEl("c", 200, 0, 50, 50, { z: 2 }), rectEl("d", 300, 0, 50, 50, { z: 3 }));
test("layers: bring forward / send backward / to front / to back, stage-local and dense", () => {
  assert.deepEqual(zOrder(okDoc(ops.reorderLayers(stack(), ["b"], "forward"))), ["a", "c", "b", "d"]);
  assert.deepEqual(zOrder(okDoc(ops.reorderLayers(stack(), ["c"], "backward"))), ["a", "c", "b", "d"]);
  assert.deepEqual(zOrder(okDoc(ops.reorderLayers(stack(), ["a"], "front"))), ["b", "c", "d", "a"]);
  assert.deepEqual(zOrder(okDoc(ops.reorderLayers(stack(), ["d"], "back"))), ["d", "a", "b", "c"]);
  assert.deepEqual(zOrder(okDoc(ops.reorderLayers(stack(), ["d"], "forward"))), ["a", "b", "c", "d"], "already on top: no change");
  assert.deepEqual(zOrder(okDoc(ops.reorderLayers(stack(), ["a"], "backward"))), ["a", "b", "c", "d"], "already at the bottom: no change");
  const z = stage0(okDoc(ops.reorderLayers(stack(), ["a"], "front"))).elements.map(element => element.z).sort();
  assert.deepEqual(z, [0, 1, 2, 3]);
  assert.equal(ops.reorderLayers(stack(), ["a"], "sideways").ok, false);
});
test("layers: several selected elements move together and keep their relative order", () => {
  assert.deepEqual(zOrder(okDoc(ops.reorderLayers(stack(), ["a", "c"], "front"))), ["b", "d", "a", "c"]);
  assert.deepEqual(zOrder(okDoc(ops.reorderLayers(stack(), ["b", "c"], "forward"))), ["a", "d", "b", "c"]);
  assert.deepEqual(zOrder(okDoc(ops.reorderLayers(stack(), ["b", "d"], "backward"))), ["b", "a", "d", "c"]);
});
test("layers: the stacking order is z-then-id and never depends on the array/insertion order", () => {
  const shuffled = docOf(rectEl("d", 0, 0, 10, 10, { z: 3 }), rectEl("a", 0, 0, 10, 10, { z: 0 }), rectEl("c", 0, 0, 10, 10, { z: 2 }), rectEl("b", 0, 0, 10, 10, { z: 1 }));
  assert.deepEqual(zOrder(shuffled), ["a", "b", "c", "d"]);
  assert.deepEqual(zOrder(okDoc(ops.reorderLayers(shuffled, ["a"], "front"))), ["b", "c", "d", "a"]);
  const tie = docOf(rectEl("y", 0, 0, 10, 10, { z: 5 }), rectEl("x", 0, 0, 10, 10, { z: 5 }));
  assert.deepEqual(ops.layerList(stage0(tie)).map(element => element.id), ["y", "x"], "top-first list, ties broken by id");
  assert.deepEqual(renderDocument(shuffled, { viewportWidth: 100 }).stages[0].elements.map(element => element.id), ["a", "b", "c", "d"]);
});
test("layers: ordering in one stage never touches another stage", () => {
  const doc = createDocument({ stageCount: 2 });
  doc.stages[0].elements = [rectEl("a", 0, 0, 10, 10, { z: 0 }), rectEl("b", 0, 0, 10, 10, { z: 1 })];
  doc.stages[1].elements = [rectEl("c", 0, 0, 10, 10, { z: 7 })];
  const result = okDoc(ops.reorderLayers(doc, ["a"], "front"));
  assert.equal(byId(result, "c").z, 7);
});

// ---------- duplicate / delete ----------
test("duplicate: a new unique id, a safe offset inside the stage, the type-owned payload preserved, placed on top", () => {
  const start = docOf(createElement({ id: "t", type: "text", x: 100, y: 100, width: 300, height: 100, z: 0, payload: createTextPayload({ text: "Hi", fontSize: 50, stroke: { color: "#000000", width: 2 } }) }), rectEl("r", 500, 500, 100, 100, { z: 1 }));
  const result = ops.duplicateElements(start, ["t"]);
  const doc = okDoc(result);
  const copy = byId(doc, result.ids[0]);
  assert.notEqual(copy.id, "t");
  assert.deepEqual([copy.x, copy.y], [100 + ops.DUPLICATE_OFFSET, 100 + ops.DUPLICATE_OFFSET]);
  assert.deepEqual(copy.payload, byId(start, "t").payload);
  assert.notEqual(copy.payload, byId(start, "t").payload, "a deep copy, not a shared reference");
  assert.equal(ops.ordered(stage0(doc)).at(-1).id, copy.id);
  assert.equal(byId(doc, "t").x, 100, "the original did not move");
});
test("duplicate: near the bottom-right edge the copy is offset the other way; an element filling the stage is copied in place", () => {
  const corner = ops.duplicateElements(docOf(rectEl("a", W - 100, H - 100, 100, 100)), ["a"]);
  const copy = byId(corner.doc, corner.ids[0]);
  assert.deepEqual([copy.x, copy.y], [W - 100 - ops.DUPLICATE_OFFSET, H - 100 - ops.DUPLICATE_OFFSET]);
  const full = ops.duplicateElements(docOf(rectEl("a", 0, 0, W, H)), ["a"]);
  assert.deepEqual([byId(full.doc, full.ids[0]).x, byId(full.doc, full.ids[0]).y], [0, 0]);
});
test("duplicate: a multi-selection is duplicated together, keeping relative layout; a duplicated group becomes its own new group", () => {
  const doc = okDoc(ops.groupElements(docOf(rectEl("a", 100, 100, 100, 100), rectEl("b", 300, 100, 100, 100, { z: 1 }), rectEl("c", 600, 100, 100, 100, { z: 2 })), ["a", "b"]));
  const result = ops.duplicateElements(doc, ["a"]);
  const out = okDoc(result);
  assert.equal(result.ids.length, 2);
  const [first, second] = result.ids.map(id => byId(out, id));
  assert.equal(second.x - first.x, 200);
  assert.equal(first.groupId, second.groupId);
  assert.notEqual(first.groupId, byId(out, "a").groupId);
  assert.equal(stage0(out).elements.length, 5);
});
test("delete: removes the selection (a whole group with it) and re-densifies z", () => {
  const doc = okDoc(ops.groupElements(stack(), ["a", "b"]));
  const result = okDoc(ops.deleteElements(doc, ["a"]));
  assert.deepEqual(zOrder(result), ["c", "d"]);
  assert.deepEqual(stage0(result).elements.map(element => element.z).sort(), [0, 1]);
  assert.equal(ops.deleteElements(doc, ["ghost"]).ok, false);
});

// ---------- groups ----------
test("group: needs two elements, lands contiguous at the topmost member's slot, and keeps everything else in order", () => {
  const doc = stack();   // a b c d (bottom to top)
  const grouped = ops.groupElements(doc, ["a", "c"]);
  const out = okDoc(grouped);
  assert.deepEqual(zOrder(out), ["b", "a", "c", "d"], "the group sits where its top member (c) was: above b, below d");
  assert.equal(byId(out, "a").groupId, grouped.groupId);
  assert.equal(byId(out, "c").groupId, grouped.groupId);
  assert.equal(byId(out, "b").groupId, undefined);
  assert.equal(ops.groupElements(doc, ["a"]).ok, false);
});
test("group: selecting one member selects the whole group; grouping a group with another element merges into ONE group (no nesting)", () => {
  const grouped = okDoc(ops.groupElements(stack(), ["a", "b"]));
  assert.deepEqual(ops.expandSelection(stage0(grouped), ["a"]).sort(), ["a", "b"]);
  const merged = okDoc(ops.groupElements(grouped, ["a", "d"]));
  const ids = new Set(stage0(merged).elements.filter(element => element.groupId).map(element => element.groupId));
  assert.equal(ids.size, 1);
  assert.equal(stage0(merged).elements.filter(element => element.groupId).length, 3);
});
test("ungroup: removes the group and changes nothing else - positions, sizes and order are identical", () => {
  const grouped = okDoc(ops.groupElements(stack(), ["a", "c"]));
  const back = okDoc(ops.ungroupElements(grouped, ["a"]));
  assert.equal(stage0(back).elements.some(element => element.groupId), false);
  assert.deepEqual(zOrder(back), zOrder(grouped));
  assert.equal(ops.ungroupElements(stack(), ["a"]).ok, false);
});
test("group -> resize -> ungroup: the resized geometry is kept (nothing needs baking, unlike W0's model)", () => {
  const grouped = okDoc(ops.groupElements(docOf(rectEl("a", 100, 100, 100, 100), rectEl("b", 300, 100, 100, 100, { z: 1 })), ["a", "b"]));
  const resized = okDoc(ops.resizeGroup(grouped, ["a"], "se", 150, 0));
  const back = okDoc(ops.ungroupElements(resized, ["a"]));
  assert.deepEqual(stage0(back).elements.map(element => [element.x, element.width]), stage0(resized).elements.map(element => [element.x, element.width]));
});
test("group: moving a group moves every member by the same amount", () => {
  const grouped = okDoc(ops.groupElements(docOf(rectEl("a", 100, 100, 100, 100), rectEl("b", 300, 200, 100, 100, { z: 1 })), ["a", "b"]));
  const moved = okDoc(ops.moveElements(grouped, ["b"], 40, 60));
  assert.deepEqual([byId(moved, "a").x, byId(moved, "a").y, byId(moved, "b").x, byId(moved, "b").y], [140, 160, 340, 260]);
});

// ---------- stages ----------
test("stages: add (after the current one), reorder, select, and there is NO stage maximum", () => {
  let doc = createDocument();
  for (let i = 0; i < 25; i += 1) doc = okDoc(ops.addStage(doc));
  assert.equal(doc.stages.length, 26, "no architectural (or hidden editor) stage limit");
  const inserted = okDoc(ops.addStage(createDocument({ stageCount: 3 }), { afterIndex: 0 }));
  assert.deepEqual(inserted.stages.map(stage => stage.id), ["stage_1", "stage_4", "stage_2", "stage_3"]);
  const reordered = okDoc(ops.reorderStage(createDocument({ stageCount: 3 }), "stage_1", 2));
  assert.deepEqual(reordered.stages.map(stage => stage.id), ["stage_2", "stage_3", "stage_1"]);
  assert.equal(ops.reorderStage(createDocument(), "ghost", 0).ok, false);
  assert.deepEqual(ops.reorderStage(createDocument({ stageCount: 2 }), "stage_1", 0).doc.stages.length, 2);
});
test("stages: deleting a stage with elements needs explicit confirmation (force); the last stage can never be deleted", () => {
  const doc = createDocument({ stageCount: 2 });
  doc.stages[1].elements = [rectEl("a", 0, 0, 10, 10), rectEl("b", 0, 0, 10, 10, { z: 1 })];
  const guarded = ops.deleteStage(doc, "stage_2");
  assert.equal(guarded.ok, false);
  assert.deepEqual(guarded.errors, ["STAGE_NOT_EMPTY"]);
  assert.equal(guarded.elementCount, 2);
  assert.equal(okDoc(ops.deleteStage(doc, "stage_2", { force: true })).stages.length, 1);
  assert.equal(okDoc(ops.deleteStage(doc, "stage_1")).stages.length, 1, "an empty stage deletes without confirmation");
  assert.deepEqual(ops.deleteStage(createDocument(), "stage_1", { force: true }).errors, ["LAST_STAGE"]);
});
test("stages: moving elements to another stage puts them on top there, keeps groups whole and keeps them inside the stage", () => {
  const doc = createDocument({ stageCount: 2 });
  doc.stages[0].elements = [rectEl("a", 100, 100, 100, 100), rectEl("b", 300, 100, 100, 100, { z: 1 }), rectEl("c", 500, 100, 100, 100, { z: 2 })];
  doc.stages[1].elements = [rectEl("x", 0, 0, 50, 50)];
  const grouped = okDoc(ops.groupElements(doc, ["a", "b"]));
  const moved = okDoc(ops.moveElementsToStage(grouped, ["a"], "stage_2"));
  assert.deepEqual(moved.stages[0].elements.map(element => element.id), ["c"]);
  assert.deepEqual(zOrder(moved, 1), ["x", "a", "b"]);
  assert.equal(byId(moved, "a").groupId, byId(moved, "b").groupId);
  assert.deepEqual(moved.stages[0].elements.map(element => element.z), [0]);
  assert.equal(ops.moveElementsToStage(grouped, ["a"], "ghost").ok, false);
  assert.equal(ops.moveElementsToStage(grouped, ["a"], "stage_1").ok, true);
});
test("stages: every stage stays canonical 1000 x 1778 and the canvas is never changed by an operation", () => {
  let doc = createDocument();
  doc = okDoc(ops.addStage(doc));
  doc = okDoc(ops.addElement(doc, "stage_2", "text"));
  assert.deepEqual(doc.canvas, { width: 1000, height: 1778 });
  const tree = renderDocument(doc, { viewportWidth: 1000 });
  assert.deepEqual(tree.stages.map(stage => [stage.width, stage.height]), [[1000, 1778], [1000, 1778]]);
});

// ---------- payload / geometry edits ----------
test("updatePayload merges type-owned fields, removes a key set to undefined, and rejects unsafe text with the W1 error path", () => {
  let doc = okDoc(ops.addElement(createDocument(), "stage_1", "text"));
  doc = okDoc(ops.updatePayload(doc, "el_1", { text: "GG", fontFamily: "bebas-neue", fontSize: 120, italic: true, glow: { color: "#62e7ff", blur: 12 } }));
  assert.equal(byId(doc, "el_1").payload.fontFamily, "bebas-neue");
  doc = okDoc(ops.updatePayload(doc, "el_1", { glow: undefined }));
  assert.equal("glow" in byId(doc, "el_1").payload, false);
  const unsafe = ops.updatePayload(doc, "el_1", { text: "<script>alert(1)</script>" });
  assert.equal(unsafe.ok, false);
  assert.deepEqual(unsafe.errors, ["UNSAFE_PAYLOAD_CONTENT:el_1.payload.text"]);
  assert.equal(unsafe.doc, doc);
  assert.equal(ops.updatePayload(doc, "ghost", {}).ok, false);
});
test("updatePayloadMany applies one change to several elements atomically", () => {
  const doc = docOf(rectEl("a", 0, 0, 10, 10), rectEl("b", 20, 0, 10, 10, { z: 1 }));
  const changed = okDoc(ops.updatePayloadMany(doc, ["a", "b"], { fill: "#ff0000" }));
  assert.deepEqual([byId(changed, "a").payload.fill, byId(changed, "b").payload.fill], ["#ff0000", "#ff0000"]);
  const bad = ops.updatePayloadMany(doc, ["a", "b"], { fill: "nope" });
  assert.equal(bad.ok, false);
  assert.equal(bad.doc, doc);
});
test("updateGeometry: numeric position/size edits are contained in the stage and validated", () => {
  const doc = docOf(rectEl("a", 100, 100, 200, 200));
  const moved = byId(okDoc(ops.updateGeometry(doc, "a", { x: 5000, y: -50 })), "a");
  assert.deepEqual([moved.x, moved.y], [W - 200, 0]);
  const sized = byId(okDoc(ops.updateGeometry(doc, "a", { width: 5000, height: 1 })), "a");
  assert.deepEqual([sized.width, sized.height], [W, ops.MIN_SIZE]);
  assert.equal(ops.updateGeometry(doc, "a", { width: "abc" }).ok, false);
});

// ---------- snapping / alignment / hit testing ----------
test("snap: centre lines, stage edges and other elements' edges attract within the threshold and report guide lines", () => {
  const stage = stage0(docOf(rectEl("other", 700, 1200, 100, 100)));
  const centred = ops.computeSnap({ x: 393, y: 500, width: 200, height: 100 }, stage, [], { width: W, height: H }, 8);
  assert.equal(centred.dx, 7, "the box centre snaps onto the stage centre line (x = 500)");
  assert.ok(centred.guides.some(guide => guide.axis === "x" && guide.at === 500));
  const edge = ops.computeSnap({ x: 4, y: 3, width: 100, height: 100 }, stage, [], { width: W, height: H }, 8);
  assert.deepEqual([edge.dx, edge.dy], [-4, -3]);
  const alignedToOther = ops.computeSnap({ x: 100, y: 1194, width: 100, height: 100 }, stage, [], { width: W, height: H }, 8);
  assert.equal(alignedToOther.dy, 6, "top edge snaps to the other element's top edge (y = 1200)");
  const far = ops.computeSnap({ x: 250, y: 300, width: 100, height: 100 }, stage, [], { width: W, height: H }, 8);
  assert.deepEqual([far.dx, far.dy, far.guides.length], [0, 0, 0]);
  const selfExcluded = ops.computeSnap({ x: 700, y: 1200, width: 100, height: 100 }, stage, ["other"], { width: W, height: H }, 8);
  assert.deepEqual([selfExcluded.dx, selfExcluded.dy], [0, 0]);
});
test("align: a single element aligns to the stage; several align to their common bounds; a group aligns as one unit", () => {
  const one = docOf(rectEl("a", 100, 100, 200, 100));
  assert.equal(byId(okDoc(ops.alignElements(one, ["a"], "hcenter")), "a").x, 400);
  assert.equal(byId(okDoc(ops.alignElements(one, ["a"], "right")), "a").x, 800);
  assert.equal(byId(okDoc(ops.alignElements(one, ["a"], "bottom")), "a").y, H - 100);
  assert.equal(byId(okDoc(ops.alignElements(one, ["a"], "vmiddle")), "a").y, (H - 100) / 2);
  const two = docOf(rectEl("a", 100, 100, 100, 100), rectEl("b", 500, 300, 200, 100, { z: 1 }));
  const left = okDoc(ops.alignElements(two, ["a", "b"], "left"));
  assert.deepEqual([byId(left, "a").x, byId(left, "b").x], [100, 100]);
  const top = okDoc(ops.alignElements(two, ["a", "b"], "top"));
  assert.deepEqual([byId(top, "a").y, byId(top, "b").y], [100, 100]);
  assert.equal(ops.alignElements(two, ["a"], "diagonal").ok, false);
});
test("hit testing: exact hits win (top-most first); a tiny element is still selectable through the tap slop; rotated boxes hit-test in their own axes", () => {
  const stage = stage0(docOf(rectEl("under", 100, 100, 300, 300, { z: 0 }), rectEl("over", 200, 200, 100, 100, { z: 1 }), rectEl("tiny", 600, 600, 6, 6, { z: 2 })));
  assert.equal(ops.hitTest(stage, 250, 250, 0).id, "over");
  assert.equal(ops.hitTest(stage, 150, 150, 0).id, "under");
  assert.equal(ops.hitTest(stage, 900, 900, 30), null);
  assert.equal(ops.hitTest(stage, 603, 603, 0).id, "tiny");
  assert.equal(ops.hitTest(stage, 625, 603, 0), null, "a bare tap beside a tiny element misses without slop...");
  assert.equal(ops.hitTest(stage, 625, 603, 30).id, "tiny", "...and finds it with the 44px-target slop");
  assert.equal(ops.hitTest(stage, 250, 250, 30).id, "over", "an exact hit is never stolen by a nearby slop hit");
  const rotated = { ...rectEl("r", 400, 800, 300, 40), rotation: 90 };
  assert.equal(ops.elementContainsPoint(rotated, 550, 700, 0), true, "the rotated (now tall) box covers points above/below its centre");
  assert.equal(ops.elementContainsPoint(rotated, 400, 820, 0), false);
});
