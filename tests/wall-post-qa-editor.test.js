// Post-manual-QA fixes (editor UX): K layout sidebar clipping, L group / ungroup UX, M always-confirm stage deletion.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { createWallPersistence } from "../dist/wall/persistence.js";
import { createEditorSession } from "../dist/wall-kit/session.js";
import { stageDeleteQuestion, selectionSummary } from "../dist/wall-kit/messages.js";
import * as ops from "../dist/wall-kit/ops.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rect = (id, extra = {}) => createElement({ id, type: "rect", x: 0, y: 0, width: 100, height: 100, z: 0, payload: { fill: "#8b5dff" }, ...extra });

function fakeServer(initial) {
  const server = { document: structuredClone(initial), revision: 1 };
  const row = () => [{ document: structuredClone(server.document), revision: server.revision, created_at: "t0", updated_at: "t1" }];
  server.rpc = async (name, body) => {
    if (name === "ensure_my_wall_draft" || name === "get_my_wall_draft") return row();
    if (name === "save_my_wall_draft") {
      if (body.candidate_expected_revision !== server.revision) throw Object.assign(new Error("WALL_REVISION_CONFLICT"), { payload: { message: "WALL_REVISION_CONFLICT", details: String(server.revision) } });
      server.document = structuredClone(body.candidate_document); server.revision += 1; return row();
    }
    throw new Error(`unexpected rpc ${name}`);
  };
  return server;
}

// ---------- K: Layout sidebar ----------
test("K layers panel: the list's one column may shrink and every row may shrink, so ▲ / ▼ always stay inside the panel (long names ellipsize)", () => {
  const css = read("dist/wall-editor/editor.css");
  assert.match(css, /\.ed-layers \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\)/, "an implicit auto track grew to the unwrapped layer name");
  assert.match(css, /\.ed-layer \{[^}]*min-width: 0;/);
  assert.match(css, /\.ed-layer-main \{[^}]*flex: 1;[^}]*min-width: 0;/);
  assert.match(css, /\.ed-layer-main span \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  assert.match(css, /\.ed-layer button\.ed-mini \{ flex: none; \}/, "the buttons never shrink away");
});

// ---------- L: group / ungroup ----------
test("L grouping: the status line says when the selection is ONE group; Layers numbers each group so members are recognisable", () => {
  assert.equal(selectionSummary([]), "");
  assert.equal(selectionSummary([rect("a"), rect("b")]), "2 selected");
  assert.equal(selectionSummary([rect("a", { groupId: "group_1" }), rect("b", { groupId: "group_1" })]), "Group of 2 selected");
  assert.equal(selectionSummary([rect("a", { groupId: "group_1" }), rect("b")]), "2 selected");
  const doc = createDocument();
  doc.stages[0].elements = [rect("a", { z: 0, groupId: "gx" }), rect("b", { z: 1 }), rect("c", { z: 2, groupId: "gy" }), rect("d", { z: 3, groupId: "gx" })];
  assert.deepEqual([...ops.groupNumbers(doc.stages[0])], [["gx", 1], ["gy", 2]]);
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /make\("span", "tag", `GROUP \$\{groups\.get\(element\.groupId\)\}`\)/);
  assert.match(editor, /selectionSummary\(/);
});

test("L grouping: after Group or Ungroup (button or Ctrl+G) the editor leaves Multi-select, so the next tap cannot toggle the new group off", () => {
  const controls = read("dist/wall-editor/controls.js");
  assert.match(controls, /const regroup = \(result\) => \{ const applied = exec\(result, \{ keepResultSelection: true \}\); if \(applied\.ok\) onGroupingChanged\(\); return applied; \};/);
  assert.match(controls, /button\("Group", \(\) => regroup\(ops\.groupElements\(session\.doc, ids\)\), units < 2\)/, "Group needs two or more units (a group counts as one)");
  assert.match(controls, /button\("Ungroup", \(\) => regroup\(ops\.ungroupElements\(session\.doc, ids\)\), !grouped\)/);
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /const leaveMultiSelect = \(\) => \{ if \(multi\) \{ multi = false; updateChrome\(\); \} \};/);
  assert.match(editor, /onGroupingChanged: leaveMultiSelect/);
  assert.match(editor, /ops\.groupElements\(session\.doc, ids\), \{ keepResultSelection: true \}\)\.ok\) leaveMultiSelect\(\)/);
});

test("L grouping model unchanged: selecting any member selects the whole group; grouping keeps the group selected; ungroup keeps the members selected", async () => {
  const doc = createDocument();
  doc.stages[0].elements = [rect("a", { z: 0 }), rect("b", { z: 1, x: 200 })];
  const session = createEditorSession({ persistence: createWallPersistence({ rpc: fakeServer(doc).rpc }) });
  await session.load();
  const grouped = ops.groupElements(session.doc, ["a", "b"]);
  session.apply(grouped, { select: grouped.ids });
  assert.deepEqual([...session.state.selection].sort(), ["a", "b"]);
  session.clearSelection();
  session.select(["b"]);
  assert.deepEqual([...session.state.selection].sort(), ["a", "b"], "one tap on a member = the whole group");
  const ungrouped = ops.ungroupElements(session.doc, session.state.selection);
  session.apply(ungrouped, { select: ungrouped.ids });
  assert.equal(session.doc.stages[0].elements.some(element => element.groupId), false);
  assert.deepEqual([...session.state.selection].sort(), ["a", "b"]);
});

// ---------- M: always confirm stage deletion ----------
test("M stage deletion: the question covers a stage with elements, one with only a background, and an empty one - and never says it cannot be undone", () => {
  const doc = createDocument({ stageCount: 3 });
  doc.stages[0].elements = [rect("a"), rect("b", { z: 1 })];
  doc.stages[0].background = { kind: "color", color: "#101010" };
  doc.stages[1].background = { kind: "color", color: "#202020" };
  assert.equal(validateDocument(doc).valid, true);
  const [full, bgOnly, empty] = doc.stages.map(stage => ops.stageDeletionInfo(doc, stage.id));
  assert.deepEqual(full, { stageId: doc.stages[0].id, number: 1, elementCount: 2, hasBackground: true, isLast: false });
  assert.equal(stageDeleteQuestion(full), "Stage 1 has 2 elements and its own background. Delete it and everything on it? You can undo this.");
  assert.equal(stageDeleteQuestion(bgOnly), "Stage 2 has no elements but has its own background. Delete this stage? You can undo this.");
  assert.equal(stageDeleteQuestion(empty), "Stage 3 is empty. Delete this stage? You can undo this.");
  assert.equal(stageDeleteQuestion({ ...empty, elementCount: 1 }), "Stage 3 has 1 element. Delete it and everything on it? You can undo this.");
  for (const info of [full, bgOnly, empty]) assert.doesNotMatch(stageDeleteQuestion(info), /cannot|irreversible|permanent/i);
  const only = createDocument();
  assert.equal(ops.stageDeletionInfo(only, only.stages[0].id).isLast, true);
  assert.equal(ops.stageDeletionInfo(only, "nope"), null);
});

test("M stage deletion: the Delete button ALWAYS asks first (it never deletes directly), and Yes deletes exactly the stage it asked about", () => {
  const editor = read("dist/wall-editor/editor.js");
  const handler = editor.slice(editor.indexOf('$("stageDelete").addEventListener'), editor.indexOf('$("stageConfirmNo")'));
  assert.match(handler, /pendingStageDelete = info;/);
  assert.doesNotMatch(handler, /deleteStage\(|removeStage\(/, "the button itself never deletes");
  const yes = editor.slice(editor.indexOf('$("stageConfirmYes")'), editor.indexOf("function removeStage"));
  assert.match(yes, /pendingStageDelete\.stageId !== session\.state\.stageId/);
  assert.match(yes, /ops\.deleteStage\(session\.doc, session\.state\.stageId, \{ force: true \}\)/);
  assert.match(editor, /stageDeleteQuestion\(pendingStageDelete\)/);
});

test("M stage deletion: Undo restores a deleted stage - elements, background and position - whether it had elements, only a background, or nothing", async () => {
  const doc = createDocument({ stageCount: 3 });
  doc.stages[0].elements = [rect("a")];
  doc.stages[1].background = { kind: "gradient", from: "#101010", to: "#303030", angle: 90 };
  for (const index of [0, 1, 2]) {
    const session = createEditorSession({ persistence: createWallPersistence({ rpc: fakeServer(doc).rpc }) });
    await session.load();
    const before = JSON.stringify(session.doc);
    const stageId = session.doc.stages[index].id;
    session.apply(ops.deleteStage(session.doc, stageId, { force: true }));
    assert.equal(session.doc.stages.length, 2);
    session.undo();
    assert.equal(JSON.stringify(session.doc), before, `stage ${index + 1} is back exactly as it was`);
  }
});
