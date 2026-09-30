import { createEditorSession } from "../../dist/wall-kit/session.js";
import { createCanvas } from "../../dist/wall-editor/canvas.js";
import { createPropertiesPanel } from "../../dist/wall-editor/controls.js";
import { createTemplatesPanel } from "../../dist/wall-editor/templates.js";
import { fixturePersistence, sampleIdentity } from "./fixture.js";
const $ = id => document.getElementById(id);
const session = createEditorSession({ persistence: fixturePersistence(localStorage), onChange: () => render() });
const run = (result, options = {}) => session.apply(result, { ...options, select: options.clearSelection ? [] : undefined });
const canvas = createCanvas({ host: $("stageHost"), viewport: $("viewport"), session, isMulti: () => false,
  getPaintContext: () => ({ gamid: sampleIdentity, mode: "edit" }), onSelectedTap: () => {}, onEditText: () => $("propsBody").querySelector("textarea")?.focus() });
const properties = createPropertiesPanel({ body: $("propsBody"), title: $("propsTitle"), session, run, getGamid: () => sampleIdentity, fitTextHeight: () => {} });
const templates = createTemplatesPanel({ host: $("templatesBody"), session, run, getGamid: () => sampleIdentity });
function button(text, action) { const el = document.createElement("button"); el.type = "button"; el.className = "ed-btn"; el.textContent = text; el.addEventListener("click", action); return el; }
function render() {
  canvas.render(); properties.update(); templates.update();
  $("status").textContent = `${session.status} · revision ${session.state.revision ?? 0}`;
  $("stages").replaceChildren(...session.doc.stages.map((stage, i) => button(`Stage ${i + 1}${stage.id === session.state.stageId ? " •" : ""}`, () => session.setStage(stage.id))));
  $("layers").replaceChildren(...session.stage.elements.map(element => button(`${element.type}: ${element.payload.text?.replaceAll("\n", " ").slice(0, 24) || element.payload.block || element.id}`, () => session.select([element.id]))));
  $("undo").disabled = !session.canUndo; $("redo").disabled = !session.canRedo;
}
$("save").addEventListener("click", () => session.save());
$("reload").addEventListener("click", () => { if (!session.dirty || confirm("Discard unsaved fixture changes?")) session.reloadLatest(); });
$("undo").addEventListener("click", () => session.undo()); $("redo").addEventListener("click", () => session.redo());
window.addEventListener("resize", () => canvas.render());
await session.load();
