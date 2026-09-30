import test from "node:test";
import assert from "node:assert/strict";
import { NIGHT_SIGNAL } from "../dist/wall-kit/templates/catalog.js";
import { applyTemplate, validateTemplate } from "../dist/wall-kit/templates/apply.js";
import { createDocument } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { renderDocument } from "../dist/wall/render.js";
import { createEditorSession } from "../dist/wall-kit/session.js";
import * as ops from "../dist/wall-kit/ops.js";
import { initialFixture, fixturePersistence } from "../prototypes/wall-templates-lab/fixture.js";
import { createTemplatesPanel } from "../dist/wall-editor/templates.js";
const clone = value => JSON.parse(JSON.stringify(value));
const apply = (doc, options = {}, template = NIGHT_SIGNAL) => applyTemplate(doc, template, { scope: "stage", stageId: doc.stages[0].id, confirmed: true, ...options });
const memory = () => { const map = new Map(); return { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) }; };

test("template is versioned canonical data; preview uses real render tree and identity bindings", () => {
  assert.deepEqual(validateTemplate(NIGHT_SIGNAL), { valid: true, errors: [] });
  const doc = NIGHT_SIGNAL.recipe.document;
  assert.equal(doc.stages[0].elements.length, 15);
  assert.deepEqual(new Set(doc.stages[0].elements.map(e => e.type)), new Set(["rect", "text", "gamid"]));
  assert.equal(renderDocument(doc, { viewportWidth: 390 }).stages[0].elements.length, 15);
  assert.equal(Object.isFrozen(doc.stages[0].elements), true);
  assert.ok(!JSON.stringify(NIGHT_SIGNAL).includes("template_fixture"));
});
test("both scopes require explicit confirmation and failures preserve input identity", () => {
  const doc = initialFixture();
  for (const scope of ["wall", "stage"]) {
    const result = apply(doc, { scope, confirmed: false });
    assert.equal(result.ok, false); assert.equal(result.doc, doc);
    assert.deepEqual(result.errors, ["TEMPLATE_CONFIRMATION_REQUIRED"]);
  }
});
test("stage replacement preserves unrelated stages, Wall background, stage id/order and input", () => {
  const doc = initialFixture(); doc.background = { kind: "color", color: "#aabbcc" };
  const before = clone(doc);
  const result = apply(doc);
  assert.equal(result.ok, true);
  assert.deepEqual(doc, before);
  assert.equal(result.doc.stages.length, 2);
  assert.equal(result.doc.stages[0].id, doc.stages[0].id);
  assert.deepEqual(result.doc.stages[1], doc.stages[1]);
  assert.deepEqual(result.doc.background, doc.background);
  assert.notEqual(result.doc.stages[0].elements[0], NIGHT_SIGNAL.recipe.document.stages[0].elements[0]);
});
test("Wall replacement removes old composition/background and contains no template metadata", () => {
  const doc = initialFixture(); doc.background = { kind: "color", color: "#ffffff" };
  const result = apply(doc, { scope: "wall" });
  assert.equal(result.ok, true); assert.equal(result.doc.stages.length, 1);
  assert.equal(result.doc.background, undefined);
  assert.deepEqual(Object.keys(result.doc).sort(), ["canvas", "schemaVersion", "stages"]);
  assert.ok(!JSON.stringify(result.doc).includes(NIGHT_SIGNAL.id));
});
test("repeated application remaps element and group IDs without aliasing catalog or unrelated elements", () => {
  const template = clone(NIGHT_SIGNAL);
  template.recipe.document.stages[0].elements.slice(0, 2).forEach(e => { e.groupId = "template_group"; });
  const first = apply(initialFixture(), {}, template).doc;
  const second = apply(first, { stageId: first.stages[1].id }, template).doc;
  const all = second.stages.flatMap(s => s.elements.map(e => e.id));
  assert.equal(new Set(all).size, all.length);
  assert.notEqual(second.stages[0].elements[0].groupId, second.stages[1].elements[0].groupId);
  assert.deepEqual(second.stages[0], first.stages[0]);
  assert.equal(validateDocument(second).valid, true);
});
test("selection, normal editing, undo/redo and Save → new session Reload preserve editable data", async () => {
  const persistence = fixturePersistence(memory());
  const session = createEditorSession({ persistence }); await session.load();
  const before = clone(session.doc);
  session.apply(apply(session.doc));
  const applied = clone(session.doc);
  assert.equal(session.dirty, true);
  session.undo(); assert.deepEqual(session.doc, before);
  session.redo(); assert.deepEqual(session.doc, applied);
  const title = session.stage.elements.find(e => e.type === "text" && e.payload.text === "NIGHT\nSIGNAL");
  session.select([title.id]); assert.deepEqual(session.state.selection, [title.id]);
  assert.equal(session.apply(ops.updatePayload(session.doc, title.id, { text: "MY CALLSIGN" })).ok, true);
  assert.equal(session.apply(ops.moveElements(session.doc, [title.id], 5, 5)).ok, true);
  assert.equal((await session.save()).ok, true);
  const reloaded = createEditorSession({ persistence }); await reloaded.load();
  assert.deepEqual(reloaded.doc, session.doc);
  assert.deepEqual(reloaded.doc.stages[1], before.stages[1]);
  reloaded.select([title.id]);
  assert.equal(reloaded.apply(ops.updatePayload(reloaded.doc, title.id, { color: "#ff99cc" })).ok, true);
});
test("invalid metadata, recipe, scope, target and mismatched canvas fail atomically", () => {
  const doc = initialFixture();
  for (const t of [null, { ...NIGHT_SIGNAL, templateSchemaVersion: 2 }, { ...NIGHT_SIGNAL, name: "" },
    { ...NIGHT_SIGNAL, recipe: { kind: "html" } }, { ...NIGHT_SIGNAL, preview: { kind: "recipe", stageId: "missing" } }]) {
    const result = apply(doc, {}, t); assert.equal(result.ok, false); assert.equal(result.doc, doc);
  }
  assert.equal(apply(doc, { scope: "section" }).ok, false);
  assert.equal(apply(doc, { stageId: "missing" }).ok, false);
  assert.equal(apply(doc, { sourceStageId: "missing" }).ok, false);
  const small = createDocument({ canvas: { width: 500, height: 889 } });
  assert.deepEqual(apply(small).errors, ["TEMPLATE_CANVAS_MISMATCH"]);
  const bad = clone(NIGHT_SIGNAL); bad.recipe.document.stages[0].elements[0].payload.fill = "bad";
  assert.equal(apply(doc, {}, bad).ok, false);
});
test("multi-stage recipes expose explicit source stage; effective background is localized", () => {
  const template = clone(NIGHT_SIGNAL);
  const extra = clone(template.recipe.document.stages[0]);
  extra.id = "second"; extra.elements.forEach(e => { e.id += "_second"; });
  delete extra.background;
  template.recipe.document.stages.push(extra);
  template.recipe.document.background = { kind: "color", color: "#123456" };
  const doc = initialFixture();
  const stage = apply(doc, { sourceStageId: "second" }, template);
  assert.equal(stage.ok, true);
  assert.deepEqual(stage.doc.stages[0].background, template.recipe.document.background);
  assert.equal(stage.doc.background, undefined);
  assert.deepEqual(stage.doc.stages[1], doc.stages[1]);
  assert.equal(apply(doc, { scope: "wall" }, template).doc.stages.length, 2);
});
test("pre-template Walls remain valid and rendering is unchanged by template application elsewhere", () => {
  const legacy = initialFixture(); const rendered = renderDocument(legacy, { viewportWidth: 500 });
  apply(legacy);
  assert.equal(validateDocument(legacy).valid, true);
  assert.deepEqual(renderDocument(legacy, { viewportWidth: 500 }), rendered);
});

// Tiny DOM for the real panel and painter, matching existing Wall DOM tests.
class Node {
  constructor(tag) { this.tag = tag; this.childNodes = []; this.attrs = {}; this.listeners = {}; this.style = { setProperty() {} }; this.classList = { add() {}, toggle() {} }; }
  append(...nodes) { this.childNodes.push(...nodes); }
  appendChild(node) { this.append(node); }
  replaceChildren(...nodes) { this.childNodes = nodes; }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(name, action) { this.listeners[name] = action; }
  focus() {}
  click() { if (!this.disabled) this.listeners.click?.(); }
}
const nodes = root => [root, ...root.childNodes.flatMap(nodes)];
test("panel cancellation, stale confirmation and save-in-flight guard never replace data", async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Node(tag) };
  try {
    const session = createEditorSession({ persistence: fixturePersistence(memory()) }); await session.load();
    const host = new Node("div");
    const panel = createTemplatesPanel({ host, session, run: result => session.apply(result) });
    const byText = text => nodes(host).find(node => node.textContent === text);
    const review = byText("Review replacement"), accept = byText("Replace composition"), cancel = byText("Cancel");
    const original = clone(session.doc);
    review.click(); cancel.click(); accept.click(); assert.deepEqual(session.doc, original);
    review.click(); session.setStage(session.doc.stages[1].id); accept.click(); assert.deepEqual(session.doc, original);
    review.click(); session.apply(ops.addElement(session.doc, session.state.stageId, "rect"));
    const changed = clone(session.doc); accept.click(); assert.deepEqual(session.doc, changed);
    review.click(); session.state.status = "saving"; panel.update();
    assert.equal(review.disabled, true); accept.click(); assert.deepEqual(session.doc, changed);
    session.state.status = "unsaved"; panel.update(); review.click(); accept.click();
    assert.equal(session.stage.elements.length, 15);
  } finally { globalThis.document = previous; }
});
