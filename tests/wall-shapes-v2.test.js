// Shapes V2 (Mazen's task "My Wall Desktop Shapes V2", 2026-10-19): the vector shape library, freeform paths, Smart Shape parameters and Lock aspect ratio, as
// compatible optional fields of the existing `rect` element. Every Wall saved before stays valid and paints the same.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHAPES, SHAPE_KEYS, SHAPE_LIBRARY, SHAPE_CATEGORIES, SHAPE_PARAMS, shapeFieldErrors, shapePath, customPath, validatePath, libraryIdOf, shapeParam } from "../dist/wall/shapes.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { validateDocument } from "../dist/wall/validate.js";
import * as ops from "../dist/wall-kit/ops.js";
import { normalizePath, splitSegment } from "../dist/wall-editor/path-editor.js";
import "../dist/wall-kit/register.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const rect = elementRegistry.get("rect");
const docWith = (...elements) => ({ schemaVersion: 1, canvas: { width: 1000, height: 1778 }, stages: [{ id: "s1", elements }] });
const el = (payload, extra = {}) => ({ id: "a", type: "rect", x: 300, y: 600, width: 300, height: 200, z: 0, payload: { fill: "#8b5dff", ...payload }, ...extra });

test("library: 38 shapes in 6 categories, the three existing shapes first; every shape key draws a finite, non-empty path", () => {
  assert.equal(SHAPE_LIBRARY.length, 38);
  assert.deepEqual(SHAPE_CATEGORIES, ["Basic", "Polygons & stars", "Arrows", "Callouts", "Badges & banners", "Gaming"]);
  assert.deepEqual(SHAPE_LIBRARY.slice(0, 3).map(item => [item.id, item.shape]), [["rect", null], ["rounded", null], ["circle", null]], "Rectangle, Rounded and Circle stay the classic shapes");
  assert.equal(new Set(SHAPE_LIBRARY.map(item => item.id)).size, SHAPE_LIBRARY.length, "unique ids");
  for (const key of SHAPE_KEYS.filter(key => key !== "custom")) {
    const d = shapePath({ shape: key }, 4, 4, 300, 200);
    assert.ok(d.length > 10 && /^M/.test(d) && !/NaN|Infinity|undefined/.test(d), key);
    assert.match(d, /^[MLHVCAQZ0-9 .-]+$/, `${key}: only numbers and fixed path letters`);
  }
  for (const item of SHAPE_LIBRARY.filter(entry => entry.shape)) assert.deepEqual(shapeFieldErrors({ shape: item.shape, ...(item.params ? { params: item.params } : {}) }), [], item.id);
});

test("validation: shape, params, path and lockAspect are optional, bounded and typed; a classic shape is unchanged", () => {
  assert.deepEqual(rect.validatePayload({ fill: "#000000" }), [], "a W1 rectangle");
  assert.deepEqual(rect.validatePayload({ fill: "#000000", radius: 1000, stroke: "#ffffff", strokeWidth: 4, opacity: 0.5 }), [], "a W3 circle");
  const bad = [
    [{ shape: "dodecahedron" }, "INVALID_SHAPE"], [{ shape: 3 }, "INVALID_SHAPE"],
    [{ shape: "polygon", params: { sides: 2 } }, "INVALID_SHAPE_PARAMS"], [{ shape: "polygon", params: { sides: 6.5 } }, "INVALID_SHAPE_PARAMS"],
    [{ shape: "polygon", params: { points: 5 } }, "INVALID_SHAPE_PARAMS"], [{ params: { sides: 6 } }, "INVALID_SHAPE_PARAMS"], [{ shape: "star", params: { inner: 0.95 } }, "INVALID_SHAPE_PARAMS"],
    [{ shape: "custom" }, "INVALID_SHAPE_PATH"], [{ shape: "triangle", path: { closed: true, points: [] } }, "INVALID_SHAPE_PATH"],
    [{ shape: "custom", path: { closed: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }, "INVALID_SHAPE_PATH"],
    [{ shape: "custom", path: { closed: false, points: [{ x: 0, y: 0 }, { x: 1.2, y: 1 }] } }, "INVALID_SHAPE_PATH"],
    [{ shape: "custom", path: { closed: false, points: [{ x: 0, y: 0, ox: 0.5 }, { x: 1, y: 1 }] } }, "INVALID_SHAPE_PATH"],
    [{ shape: "custom", path: { closed: false, points: [{ x: 0, y: 0, d: "M0 0" }, { x: 1, y: 1 }] } }, "INVALID_SHAPE_PATH"],
    [{ shape: "custom", path: { closed: false, points: Array.from({ length: 101 }, (_, i) => ({ x: i / 100, y: 0 })) } }, "INVALID_SHAPE_PATH"],
    [{ lockAspect: 0 }, "INVALID_LOCK_ASPECT"], [{ lockAspect: "1" }, "INVALID_LOCK_ASPECT"], [{ lockAspect: 21 }, "INVALID_LOCK_ASPECT"],
  ];
  for (const [fields, code] of bad) assert.ok(rect.validatePayload({ fill: "#000000", ...fields }).includes(code), `${JSON.stringify(fields)} -> ${code}`);
  assert.deepEqual(rect.validatePayload({ fill: "#000000", shape: "custom", path: { closed: false, points: [{ x: 0, y: 0, ox: -1, oy: 2 }, { x: 1, y: 1 }] }, lockAspect: 1.5 }), []);
  // the painter only ever gets known fields
  assert.deepEqual(Object.keys(rect.render({ fill: "#000000", shape: "star", params: { points: 6 }, lockAspect: 1, extra: "x" })).sort(), ["fill", "kind", "params", "shape"]);
  assert.deepEqual(rect.render({ fill: "#000000", radius: 48 }), { kind: "rect", fill: "#000000", radius: 48 }, "a classic shape paints exactly as before");
});

test("freeform path: straight segments without handles, cubic curves with them, closed paths end in Z", () => {
  const open = { closed: false, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
  assert.equal(customPath(open, 0, 0, 100, 50), "M0 0L100 0");
  const curve = { closed: true, points: [{ x: 0, y: 1 }, { x: 0.5, y: 0, ix: 0.1, iy: 0.2, ox: 0.9, oy: 0.2 }, { x: 1, y: 1 }] };
  assert.equal(customPath(curve, 0, 0, 100, 100), "M0 100C0 100 10 20 50 0C90 20 100 100 100 100L0 100Z");
  assert.ok(validatePath(curve));
});

test("Smart Shapes: defaults, bounds and which library entry a payload is", () => {
  assert.equal(shapeParam({ shape: "polygon" }, "sides"), 6);
  assert.equal(shapeParam({ shape: "polygon", params: { sides: 99 } }, "sides"), 6, "an out-of-range value falls back to the default when painting");
  assert.deepEqual(Object.keys(SHAPE_PARAMS).sort(), ["cut", "head", "inner", "points", "shaft", "sides", "tail", "thickness"]);
  assert.equal(libraryIdOf({ fill: "#000000" }), "rect");
  assert.equal(libraryIdOf({ fill: "#000000", radius: 48 }), "rounded");
  assert.equal(libraryIdOf({ fill: "#000000", radius: 1000 }), "circle");
  assert.equal(libraryIdOf({ shape: "polygon", params: { sides: 8 } }), "octagon");
  assert.equal(libraryIdOf({ shape: "polygon", params: { sides: 7 } }), null, "a tuned polygon");
  assert.equal(libraryIdOf({ shape: "custom" }), null);
  assert.ok(Object.keys(SHAPES).length === SHAPE_KEYS.length);
});

test("Lock aspect ratio: dragging, Width and Height keep the locked ratio; unlocked shapes and every other element type are unchanged", () => {
  const locked = docWith(el({ shape: "star", lockAspect: 1.5 }));
  assert.equal(ops.lockedAspect(locked.stages[0].elements[0]), 1.5);
  assert.equal(ops.lockedAspect(docWith(el({ shape: "star" })).stages[0].elements[0]), null, "no lock = free");
  const widened = ops.updateGeometry(locked, "a", { width: 450 }).doc.stages[0].elements[0];
  assert.deepEqual([widened.width, widened.height], [450, 300], "Width sets Height");
  const taller = ops.updateGeometry(locked, "a", { height: 100 }).doc.stages[0].elements[0];
  assert.deepEqual([taller.width, taller.height], [150, 100], "Height sets Width");
  const both = ops.updateGeometry(locked, "a", { width: 500, height: 100 }).doc.stages[0].elements[0];
  assert.deepEqual([both.width, both.height], [500, 100], "both given: both kept (a point edit refits the box)");
  let drag = locked;
  for (let i = 0; i < 5; i++) drag = ops.resizeElement(drag, "a", "e", 17, 0, { keepAspect: ops.lockedAspect(drag.stages[0].elements[0]) }).doc;
  const dragged = drag.stages[0].elements[0];
  assert.ok(Math.abs(dragged.width / dragged.height - 1.5) < 0.01, `ratio after 5 drags ${dragged.width}/${dragged.height}`);
  const free = ops.updateGeometry(docWith(el({ shape: "star" })), "a", { width: 450 }).doc.stages[0].elements[0];
  assert.deepEqual([free.width, free.height], [450, 200], "unlocked: Width alone");
});

test("Edit Points math: normalising keeps every anchor and handle inside the box; splitting a segment keeps the curve", () => {
  const { box, path } = normalizePath([{ x: 100, y: 100 }, { x: 300, y: 120, ox: 340, oy: 60, ix: 260, iy: 180 }, { x: 200, y: 400 }], true);
  assert.deepEqual(box, { x: 100, y: 60, width: 240, height: 340 });
  assert.ok(validatePath(path));
  const { a, mid, b } = splitSegment({ x: 0, y: 0, ox: 0, oy: 100 }, { x: 100, y: 0, ix: 100, iy: 100 });
  assert.deepEqual(mid, { x: 50, y: 75, ix: 25, iy: 75, ox: 75, oy: 75 }, "the point at t = 0.5 of the cubic");
  assert.deepEqual([a.ox, a.oy, b.ix, b.iy], [0, 50, 100, 50]);
  assert.deepEqual(splitSegment({ x: 0, y: 0 }, { x: 10, y: 20 }).mid, { x: 5, y: 10 }, "a straight segment gets a straight middle point");
});

test("documents: new shapes validate as ordinary Wall elements; Walls saved before are untouched", () => {
  assert.deepEqual(validateDocument(docWith(el({ shape: "custom", path: { closed: true, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }] }, lockAspect: 1.5 }))).errors, []);
  assert.deepEqual(validateDocument(docWith(el({ radius: 1000 }))).errors, []);
  assert.ok(validateDocument(docWith(el({ shape: "nope" }))).errors.some(code => code.startsWith("INVALID_SHAPE")));
});

test("rendering and editor wiring: SVG built only from wall/shapes.js; classic shapes keep the CSS box; desktop-only UI", () => {
  const paint = read("dist/wall-kit/paint.js"), tools = read("dist/wall-editor/tools.js"), controls = read("dist/wall-editor/controls.js"), canvas = read("dist/wall-editor/canvas.js");
  assert.match(paint, /if \(content\.shape\) \{ paintShape\(node, content, scale, item\); return; \}/, "only a payload with `shape` takes the SVG path");
  assert.match(paint, /const d = shapePath\(content, inset, inset,/);
  assert.doesNotMatch(paint.replace(/\/\/.*$/gm, ""), /innerHTML|insertAdjacentHTML/, "code only (the header comment promises exactly this)");
  assert.match(tools, /const renderShapeMode = \(\) => \{ if \(shapeQuick\) shapeQuick\.style\.setProperty\("display", accordionOn\(\) \? "none" : ""\); \};/, "the phone keeps its three buttons");
  assert.match(read("dist/wall-editor/editor.css"), /\.ed-shape-library \{ display: none; \}/);
  assert.match(controls, /const SHAPE_SECTIONS = \[\["shape", "Shape & Geometry"\], \["appearance", "Appearance"\], \["geometry", "Position & Size"\], \["arrange", "Arrange"\], \["align", "Align to Stage"\]\];/);
  assert.match(controls, /const shapeSectionOpen = \{ shape: true, appearance: true, geometry: false, arrange: false, align: false \};/, "its own remembered state");
  assert.match(controls, /if \(types\.length === 1 && types\[0\] === "rect" && desktopProps\?\.matches\) \{/);
  assert.match(controls, /geometryControls\(sections\.geometry, \{ titled: false, afterSize: lockAspectControl\(\) \}\)/, "Lock aspect ratio right after Width / Height");
  assert.match(canvas, /element\?\.type === "rect" && element\.payload\?\.shape === "custom"\) \{ lastTap = null; onEditShape\?\.\(id\); return; \}/, "double-tap: freeform shapes only");
  assert.match(read("dist/wall-kit/ops.js"), /if \(element\.type === "rect"\) return typeof element\.payload\?\.lockAspect === "number"/);
});

test("library categories are accordions like the font library: Basic open, the rest closed, kept for the session; the selected shape's category is marked", () => {
  const tools = read("dist/wall-editor/tools.js"), css = read("dist/wall-editor/editor-desktop.css");
  assert.match(tools, /const shapeCategoryOpen = new Map\(SHAPE_CATEGORIES\.map\(\(category, index\) => \[category, index === 0\]\)\);/);
  assert.match(tools, /h\("button", \{ class: "ed-font-group-toggle ed-shape-cat-toggle", type: "button", "aria-controls": gridId,/, "the accepted font-library heading button");
  assert.match(tools, /toggle\.setAttribute\("aria-expanded", String\(open\)\); grid\.hidden = !open;/);
  assert.match(tools, /if \(category === currentCategory\) toggle\.setAttribute\("data-current", "true"\);/);
  assert.match(css, /\[data-tool-panel="shapes"\] \.ed-shape-grid:not\(\[hidden\]\) \{ display: grid;/, "a closed category's grid really hides (no display: none rule needed)");
  assert.ok(tools.indexOf('class: "ed-btn ed-shape-free"') < tools.indexOf("for (const category of SHAPE_CATEGORIES)"), "Freeform stays above the categories");
});