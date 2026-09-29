// "Keep inside stage" (TESTING): ON by default - every geometry op keeps an element inside its stage exactly as before. OFF (keepInside:false) frees the
// element: drag, resize, rotate, numeric X / Y and stage moves never pull it back, the validators (JS here, SQL via the shared corpus) accept it, and the stage
// acts as the artboard that clips it in Preview / on the Wall. Background positioning is a separate system and is not touched.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument, FREE_MARGIN } from "../dist/wall/validate.js";
import { paintDocument, paintStage } from "../dist/wall-kit/paint.js";
import { renderDocument } from "../dist/wall/render.js";
import { createImageBackground } from "../dist/wall-kit/background.js";
import * as ops from "../dist/wall-kit/ops.js";

const W = 1000, H = 1778;
const rect = (id, over = {}) => createElement({ id, type: "rect", x: 100, y: 100, width: 200, height: 100, z: 0, payload: { fill: "#aabbcc" }, ...over });
const docWith = (...elements) => { const doc = createDocument({ stageCount: 2 }); doc.stages[0].elements = elements; return doc; };
const el = (doc, id) => ops.locate(doc, id).element;
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(validateDocument(result.doc).valid, true, JSON.stringify(validateDocument(result.doc).errors)); return result.doc; };
const free = doc => ok(ops.setKeepInside(doc, ["a"], false));

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this.style = { setProperty: (n, v) => this.props.set(n, v) }; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  addEventListener() {}
}
const make = tag => new Node(tag);
const find = (node, predicate) => predicate(node) ? node : node.children.map(child => find(child, predicate)).find(Boolean) ?? null;

test("K1 default ON: a new element has no keepInside key and every geometry op still stops at the stage edges exactly as before", () => {
  const doc = docWith(rect("a"));
  assert.equal("keepInside" in el(doc, "a"), false);
  assert.equal(ops.keepsInside(el(doc, "a")), true);
  assert.deepEqual([el(ok(ops.moveElements(doc, ["a"], -5000, 0)), "a").x, el(ok(ops.moveElements(doc, ["a"], 5000, 0)), "a").x], [0, W - 200]);
  assert.deepEqual([el(ok(ops.moveElements(doc, ["a"], 0, -5000)), "a").y, el(ok(ops.moveElements(doc, ["a"], 0, 5000)), "a").y], [0, H - 100]);
  assert.equal(el(ok(ops.updateGeometry(doc, "a", { x: -300 })), "a").x, 0, "numeric X is contained");
  assert.equal(el(ok(ops.resizeElement(doc, "a", "e", 5000, 0)), "a").width, W - 100, "the dragged edge stops at the stage");
  // rotated: still the rotated-and-unrotated containment the editor always used
  const rotated = ok(ops.rotateElement(doc, "a", 45));
  const moved = el(ok(ops.moveElements(rotated, ["a"], -5000, 0)), "a");
  assert.ok(ops.containBounds(moved).x >= -1e-6 && ops.containBounds(moved).x < 1, "stops with its bounds on the left edge");
  assert.equal(validateDocument({ ...doc, stages: [{ ...doc.stages[0], elements: [{ ...el(doc, "a"), x: -1 }] }, doc.stages[1]] }).errors[0], "OUTSIDE_CANVAS:a", "the validator is unchanged for it");
});

test("K2 OFF: the element goes partly or wholly past the left, right, top and bottom edges - nothing pulls it back", () => {
  const doc = free(docWith(rect("a")));
  assert.equal(el(doc, "a").keepInside, false);
  assert.deepEqual([el(doc, "a").x, el(doc, "a").y], [100, 100], "turning it OFF moves nothing");
  const left = ok(ops.moveElements(doc, ["a"], -250, 0));
  assert.equal(el(left, "a").x, -150, "partly past the left edge");
  assert.equal(el(ok(ops.moveElements(doc, ["a"], -900, 0)), "a").x, -800, "wholly past the left edge");
  assert.equal(el(ok(ops.moveElements(doc, ["a"], 1000, 0)), "a").x, 1100, "wholly past the right edge");
  assert.equal(el(ok(ops.moveElements(doc, ["a"], 0, -180)), "a").y, -80, "partly past the top edge");
  assert.equal(el(ok(ops.moveElements(doc, ["a"], 0, 1750)), "a").y, 1850, "wholly past the bottom edge");
  assert.equal(el(ok(ops.updateGeometry(doc, "a", { x: -300, y: 1800 })), "a").x, -300, "numeric X / Y are not clamped");
  // a far drag stops only at the validator's sanity margin, never at the stage
  assert.equal(el(ok(ops.moveElements(doc, ["a"], -999999, 0)), "a").x, -FREE_MARGIN);
  // no forced snap: a small move just past the edge lands exactly where it was dragged
  assert.equal(el(ok(ops.moveElements(doc, ["a"], -103, 0)), "a").x, -3);
});

test("K3 a rotated element uses its real rotated geometry and gets no artificial boundary when OFF", () => {
  const doc = ok(ops.rotateElement(free(docWith(rect("a", { width: 600, height: 120 }))), "a", 30));
  assert.deepEqual([el(doc, "a").x, el(doc, "a").y], [100, 100], "rotating near the edge does not shift it (ON would push it down so its rotated bounds fit)");
  const out = ok(ops.moveElements(doc, ["a"], -700, -300));
  assert.deepEqual([el(out, "a").x, el(out, "a").y], [-600, -200], "moved exactly by the drag");
  assert.ok(ops.elementBounds(el(out, "a")).x + ops.elementBounds(el(out, "a")).width < 50, "its rotated bounds are almost wholly outside");
  const turned = ok(ops.rotateElement(out, "a", 75));
  assert.deepEqual([el(turned, "a").x, el(turned, "a").y, el(turned, "a").rotation], [-600, -200, 75], "rotating in place never pulls it back inside");
  // with ON the same rotated element could not get closer than its bounds to the edge - the boundary is only for ON
  const kept = el(ok(ops.moveElements(ok(ops.setKeepInside(doc, ["a"], true)), ["a"], -700, -300)), "a");
  assert.ok(ops.containBounds(kept).x > -1e-6);
});

test("K4 resize and scale never force an OFF element back inside", () => {
  const doc = ok(ops.updateGeometry(free(docWith(rect("a"))), "a", { x: -150, y: 1700 }));
  const wider = el(ok(ops.resizeElement(doc, "a", "e", 1500, 0)), "a");
  assert.deepEqual([wider.x, wider.width], [-150, 1700], "grows past the right edge; its left stays outside");
  const fromLeft = el(ok(ops.resizeElement(doc, "a", "w", -400, 0)), "a");
  assert.deepEqual([fromLeft.x, fromLeft.width], [-550, 600], "the dragged left edge goes further out");
  const corner = el(ok(ops.resizeElement(doc, "a", "se", 100, 300)), "a");
  assert.deepEqual([corner.y, corner.height], [1700, 400], "past the bottom edge");
  const bigger = el(ok(ops.scaleSelection(doc, ["a"], 2)), "a");
  assert.deepEqual([bigger.width, bigger.height], [400, 200]);
  assert.ok(bigger.x < 0 && bigger.y + bigger.height > H, "scaled about its centre, still outside");
  const sized = el(ok(ops.updateGeometry(doc, "a", { width: 2400 })), "a");
  assert.deepEqual([sized.x, sized.width], [-150, 2400], "numeric size is not capped at the stage");
});

test("K5 Save -> Reload keeps the exact out-of-stage position and the setting; turning it back ON brings it inside in one step", () => {
  const edited = ok(ops.rotateElement(ok(ops.moveElements(free(docWith(rect("a"), rect("b", { x: 500, z: 1 }))), ["a"], -260, 1720)), "a", 20));
  const saved = JSON.parse(JSON.stringify(edited));   // what the draft stores, and what Reload reads back
  assert.equal(validateDocument(saved).valid, true);
  assert.deepEqual([el(saved, "a").x, el(saved, "a").y, el(saved, "a").rotation, el(saved, "a").keepInside], [-160, 1820, 20, false]);
  assert.equal("keepInside" in el(saved, "b"), false, "the other element keeps the default");
  const back = ok(ops.setKeepInside(saved, ["a"], true));
  assert.equal("keepInside" in el(back, "a"), false);
  assert.ok(ops.containBounds(el(back, "a")).x >= -1e-6 && ops.containBounds(el(back, "a")).y + ops.containBounds(el(back, "a")).height <= H + 1e-6, "inside again");
});

test("K6 Preview / the Wall clip at the stage: out-of-stage content never bleeds; only the editor shows it", () => {
  const doc = ok(ops.moveElements(free(docWith(rect("a"))), ["a"], -250, -150));
  doc.background = createImageBackground("3f2b8c1e-5a4d-4e7b-9c60-1d2e3f4a5b6c");
  const [first, second] = paintDocument(doc, W, make).stages;
  assert.equal(first.props.get("overflow"), "hidden", "Preview: stage 1 is the artboard and clips");
  assert.equal(second.props.get("overflow"), "hidden");
  const node = find(first, n => n.attrs["data-el"] === "a");
  assert.deepEqual([node.props.get("left"), node.props.get("top")], ["-150px", "-50px"], "drawn at its real position, cut by the stage");
  assert.equal(find(second, n => n.attrs["data-el"] === "a"), null, "never painted on another stage");
  const tree = renderDocument(doc, { viewportWidth: W });
  const editing = paintStage(tree.stages[0], tree.scale, make, { mode: "edit", showOutside: true, wallBackground: tree.background, stageIndex: 0, stageCount: 2 });
  assert.equal(editing.props.get("overflow"), "visible", "the editor shows the outside part");
  const layer = find(editing, n => n.className === "wall-bg");
  assert.equal(layer.props.get("clip-path"), `inset(0px 0 ${H}px 0)`, "the Whole Wall background still shows only this stage's slice");
  assert.equal(find(paintStage(tree.stages[0], tree.scale, make, { wallBackground: tree.background, stageIndex: 0, stageCount: 2 }), n => n.className === "wall-bg").props.get("clip-path"), undefined);
});

test("K7 selections: a group moves as one; one member kept inside keeps the unit inside; the Background is untouched", () => {
  const grouped = ok(ops.groupElements(docWith(rect("a"), rect("b", { x: 400, z: 1 })), ["a", "b"]));
  const freeGroup = ok(ops.setKeepInside(grouped, ["a"], false));
  assert.deepEqual([el(freeGroup, "a").keepInside, el(freeGroup, "b").keepInside], [false, false], "the whole group follows the setting");
  const moved = ok(ops.moveElements(freeGroup, ["a"], -600, 0));
  assert.deepEqual([el(moved, "a").x, el(moved, "b").x], [-500, -200], "rigid, past the edge");
  const mixed = ok(ops.moveElements(ok(ops.setKeepInside(docWith(rect("a"), rect("b", { x: 400, z: 1 })), ["a"], false)), ["a", "b"], -600, 0));
  assert.deepEqual([el(mixed, "a").x, el(mixed, "b").x], [-300, 0], "b (kept inside) stops the selection at the edge");
  assert.equal(ok(ops.setKeepInside(docWith(rect("a")), ["a"], false)).background, undefined, "no background change");
  const tools = readFileSync(new URL("../dist/wall-editor/tools.js", import.meta.url), "utf8");
  assert.doesNotMatch(tools, /keepInside|keepsInside/, "the Background panel has nothing to do with it");
  const controls = readFileSync(new URL("../dist/wall-editor/controls.js", import.meta.url), "utf8");
  assert.match(controls, /field\("Keep inside stage", keep\)/);
  assert.match(controls, /ops\.setKeepInside\(session\.doc, session\.state\.selection, keep\.checked\)/);
});

test("K8 the migration only replaces the document validator (no destructive statement) and mirrors the JS margin", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260930140000_wall_keep_inside_stage.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.match(sql, /create or replace function private\.wall_document_errors\(doc jsonb\)/);
  assert.match(sql, /INVALID_KEEP_INSIDE/);
  assert.match(sql, new RegExp(`then ${FREE_MARGIN} else 0 end`));
  assert.doesNotMatch(sql, /\b(drop|alter|delete|update|insert|truncate)\b/i);
});
