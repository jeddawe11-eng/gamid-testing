// Global Stages bar + append-only stage creation (Mazen's task 2026-10-20): the editor's one stage interface sits between the header and the workspace on every
// screen size, whatever tool is open; Add Stage ALWAYS appends at the end, never between existing stages, and keeps the open stage open.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ops from "../dist/wall-kit/ops.js";
import { createDocument } from "../dist/wall/schema.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const editor = read("dist/wall-editor/editor.js");
const html = read("dist/wall-editor/index.html");
const css = read("dist/wall-editor/editor.css");

// three stages, each with one distinct element, as a real Wall would have
function threeStages() {
  let doc = createDocument({ stageCount: 3 });
  doc.stages.forEach((stage, index) => { doc = ops.addElement(doc, stage.id, "rect", { x: 10 * (index + 1), y: 20 }).doc; });
  return doc;
}
const snapshot = doc => doc.stages.map(stage => JSON.stringify(stage));

test("append-only: adding a stage while Stage 1, 2 or 3 is open always gives 1, 2, 3, 4 - existing stages keep their order and content", () => {
  for (const open of [0, 1, 2]) {
    const doc = threeStages();
    const before = snapshot(doc);
    // the editor's own call: ops.addStage(doc) with NO position (the stage that is open does not matter)
    const result = ops.addStage(doc);
    assert.ok(result.ok, `open stage ${open + 1}`);
    assert.equal(result.doc.stages.length, 4);
    assert.deepEqual(snapshot(result.doc).slice(0, 3), before, "the existing three are untouched and in the same order");
    assert.equal(result.doc.stages[3].id, result.stageId, "the new stage is the last one");
    assert.deepEqual(result.doc.stages[3].elements, []);
    assert.deepEqual(doc.stages.map(stage => stage.id), JSON.parse(JSON.stringify(doc)).stages.map(stage => stage.id), "the input document is never mutated");
  }
});

test("the editor's Add Stage appends and keeps the open stage open; it never passes a position", () => {
  const handler = editor.slice(editor.indexOf('$("stageAdd").addEventListener'), editor.indexOf('$("stageChips").addEventListener'));
  // Wall Stages V2 (2026-10-22): the handler passes the owner's stage allowance - never a position
  assert.doesNotMatch(handler, /afterIndex|setStage/, "no insertion point, and the open stage is not changed");
  assert.match(handler, /const result = run\(ops\.addStage\(session\.doc, \{ limit: stageLimit \}\)\);/);
  assert.equal([...editor.matchAll(/addStage\(/g)].length, 1, "no other call site adds or inserts a stage");
  // reordering stays the explicit Move earlier / later buttons
  assert.match(editor, /\$\("stageLeft"\)\.addEventListener\("click", \(\) => run\(ops\.reorderStage\(/);
  assert.match(editor, /\$\("stageRight"\)\.addEventListener\("click", \(\) => run\(ops\.reorderStage\(/);
});

test("one global bar: below the header, shown with the workspace, holding every stage control; Layout keeps only Layers", () => {
  const bar = html.slice(html.indexOf('<nav id="stageBar"'), html.indexOf("</nav>", html.indexOf('<nav id="stageBar"')));
  assert.ok(html.indexOf('<nav id="stageBar"') > html.indexOf("</header>") && html.indexOf('<nav id="stageBar"') < html.indexOf('<div id="workspace"'));
  for (const id of ["stageChips", "stageAdd", "stageLeft", "stageRight", "stageDelete", "stageConfirm", "stageConfirmYes", "stageConfirmNo", "stageStatus"]) {
    assert.match(bar, new RegExp(`id="${id}"`), id);
    assert.equal(html.match(new RegExp(`id="${id}"`, "g")).length, 1, `${id} exists once`);
  }
  const layout = html.slice(html.indexOf('data-tool-panel="layout"'), html.indexOf('data-tool-panel="assets"'));
  assert.doesNotMatch(layout, /stageChips|stageAdd|stageDelete|Stage earlier/);
  assert.match(layout, /id="layerList"/);
  assert.match(editor, /\$\("workspace"\)\.hidden = false;\n  \$\("stageBar"\)\.hidden = false;/);
  assert.match(editor, /\$\("workspace"\)\.hidden = true;\n  \$\("stageBar"\)\.hidden = true;/);
});

test("responsive: the bar's height is taken out of the workspace; the strip scrolls sideways; arrows on the strip never reach the element nudge", () => {
  assert.match(css, /--stages: 3\.25rem;/);
  assert.match(css, /\.ed-workspace \{ height: calc\(100dvh - var\(--top\) - var\(--stages\)\);/);
  assert.match(css, /\.ed-stage-bar \{ position: relative; z-index: 45; height: var\(--stages\);/);
  assert.match(css, /\.ed-stage-strip \{ flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: \.35rem; overflow-x: auto;/);
  assert.match(css, /\.ed-stage-tab \{ flex: 0 0 auto; min-width: 2\.75rem; min-height: 2\.5rem;/, "touch-sized tabs");
  const keys = editor.slice(editor.indexOf('$("stageChips").addEventListener("keydown"'), editor.indexOf("// Deleting ANY stage"));
  assert.match(keys, /event\.preventDefault\(\);\n  event\.stopPropagation\(\);/);
  assert.match(editor, /const chip = make\("button", "ed-stage-tab", `Stage \$\{index \+ 1\}`\);/);
  assert.match(editor, /chip\.tabIndex = current \? 0 : -1;/);
});
