// Wall Editor - boot and wiring. Owner-only: it needs a signed-in GamID session (the same session the account app keeps), and every Wall read/write goes
// through the W2 owner RPCs, which resolve the owner on the server. The editor edits the W1 Wall Document directly; there is no second document format.
import { restoreSession, rpc } from "../account/supabase-client.js";
import { createWallPersistence } from "../wall/persistence.js";
import { createEditorSession } from "../wall-kit/session.js";
import * as ops from "../wall-kit/ops.js";
import { paintDocument } from "../wall-kit/paint.js";
import { describeCode, describeErrors } from "../wall-kit/messages.js";
import { resolveEditorSession, planAuth, gateFor } from "../wall-kit/auth-gate.js";
import { createCanvas } from "./canvas.js";
import { createPropertiesPanel } from "./controls.js";
import { legacyAccountHandoffUrl } from "../account/testing-auth-handoff.js";
import { rememberReturnTo } from "../account/post-auth-return.js";

const $ = id => document.getElementById(id);
const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

// ---- persistence over the account session ---------------------------------------------------------------------------------------------------------
// The session is refreshed before every call (a long editing session outlives an access token); an expired session surfaces as AUTH_REQUIRED.
const persistence = createWallPersistence({
  rpc: async (name, body) => {
    try { await restoreSession(); return await rpc(name, body); }
    catch (error) { if (error?.status === 401) throw new Error("AUTH_REQUIRED"); throw error; }
  },
});

let multi = false;
let workspaceVisible = false;
let pendingStageDelete = null;
const session = createEditorSession({ persistence, onChange: () => renderAll() });

// Applies an operation result to the session. A failed operation changes nothing and tells the owner why.
function run(result, { coalesce = null, keepResultSelection = false, clearSelection = false } = {}) {
  if (!result.ok) { notify(describeErrors(result.errors).join(" ")); return result; }
  session.apply(result, { coalesce, select: keepResultSelection ? result.ids : clearSelection ? [] : undefined });
  return result;
}

function notify(message) {
  $("errorText").textContent = message;
  $("errorBanner").hidden = !message;
}
$("errorDismiss").addEventListener("click", () => notify(""));

// ---- text box helper --------------------------------------------------------------------------------------------------------------------------------
// Sizes the box to its text: measures the painted text with an auto height, converts back to stage units.
function fitTextHeight(id) {
  const node = $("stageHost").querySelector(`[data-el="${CSS.escape(id)}"] .wall-text`);
  if (!node) return;
  const previous = node.style.height;
  node.style.height = "auto";
  const measured = node.scrollHeight;
  node.style.height = previous;
  const units = Math.ceil(measured / canvas.scale) + 4;
  run(ops.updateGeometry(session.doc, id, { height: units }));
}

const canvas = createCanvas({
  host: $("stageHost"),
  viewport: $("viewport"),
  session,
  isMulti: () => multi,
  onSelectedTap: () => { if (window.matchMedia("(max-width: 899px)").matches) setSheet("props"); },
  onEditText: () => {
    if (window.matchMedia("(max-width: 899px)").matches) setSheet("props");
    requestAnimationFrame(() => $("propsBody").querySelector("textarea")?.focus());
  },
});
const properties = createPropertiesPanel({ body: $("propsBody"), title: $("propsTitle"), session, run, fitTextHeight });

// ---- panels ------------------------------------------------------------------------------------------------------------------------------------------
// On a phone a bottom sheet covers the lower part of the stage: scroll the selection up into the part that stays visible above it.
function revealSelection() {
  if (!window.matchMedia("(max-width: 899px)").matches || !document.body.dataset.sheet) return;
  const box = $("stageHost").querySelector(".ed-sel");
  if (!box) return;
  const viewport = $("viewport");
  const sheet = document.body.dataset.sheet === "props" ? $("props") : $("leftPanel");
  const sheetTop = sheet.getBoundingClientRect().top;
  const overshoot = box.getBoundingClientRect().bottom - (sheetTop - 16);
  if (overshoot > 0) viewport.scrollTop += overshoot;
  const above = viewport.getBoundingClientRect().top + 8 - box.getBoundingClientRect().top;
  if (above > 0) viewport.scrollTop -= above;
}
function setSheet(name) { document.body.dataset.sheet = document.body.dataset.sheet === name ? "" : name; requestAnimationFrame(() => { canvas.render(); setTimeout(revealSelection, 220); }); }
for (const button of document.querySelectorAll("#mobileBar [data-sheet]")) button.addEventListener("click", () => setSheet(button.dataset.sheet));

const STATUS_TEXT = { loading: "Loading…", saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…", error: "Save failed", conflict: "Newer version exists", blocked: "Editing blocked" };
let lastStatus = null;
function updateChrome() {
  const status = session.status;
  $("saveState").textContent = STATUS_TEXT[status] ?? status;
  $("saveState").dataset.state = status;
  $("saveBtn").disabled = !(status === "unsaved" || status === "error");
  $("undoBtn").disabled = !session.canUndo;
  $("redoBtn").disabled = !session.canRedo;
  $("previewBtn").disabled = !workspaceVisible;
  $("conflict").hidden = status !== "conflict";
  if (status !== lastStatus && status === "error" && session.state.errorCode) notify(describeCode(session.state.errorCode));
  lastStatus = status;
  const index = session.doc.stages.findIndex(stage => stage.id === session.state.stageId);
  $("stageLabel").textContent = `Stage ${index + 1} of ${session.doc.stages.length}`;
  const count = session.state.selection.length;
  $("selInfo").textContent = count ? `${count} selected` : "";
  $("multiBtn").setAttribute("aria-pressed", String(multi));
}

function renderStages() {
  const chips = $("stageChips");
  chips.replaceChildren();
  session.doc.stages.forEach((stage, index) => {
    const chip = make("button", "ed-chip", String(index + 1));
    chip.type = "button";
    chip.setAttribute("role", "tab");
    chip.setAttribute("aria-label", `Stage ${index + 1}`);
    chip.setAttribute("aria-selected", String(stage.id === session.state.stageId));
    chip.addEventListener("click", () => { pendingStageDelete = null; session.setStage(stage.id); });
    chips.append(chip);
  });
  const index = ops.stageIndex(session.doc, session.state.stageId);
  $("stageLeft").disabled = index <= 0;
  $("stageRight").disabled = index >= session.doc.stages.length - 1;
  $("stageDelete").disabled = session.doc.stages.length <= 1;
  $("stageConfirm").hidden = pendingStageDelete === null;
  if (pendingStageDelete !== null) $("stageConfirmText").textContent = `Stage ${index + 1} has ${pendingStageDelete} element${pendingStageDelete === 1 ? "" : "s"}. Delete it and everything on it? You can undo this.`;
}

function layerName(element) {
  if (element.type === "text") return `Text: ${element.payload.text.replace(/\s+/g, " ").slice(0, 24) || "(empty)"}`;
  if (element.type === "rect") return element.payload.radius >= Math.min(element.width, element.height) / 2 && element.width === element.height ? "Circle" : element.payload.radius ? "Rounded rectangle" : "Rectangle";
  return element.type;
}
function renderLayers() {
  const list = $("layerList");
  list.replaceChildren();
  const stage = session.stage;
  if (!stage || !stage.elements.length) { const empty = make("li", "ed-empty", "This stage is empty. Use Add to place text or a shape."); list.append(empty); return; }
  const selected = new Set(session.state.selection);
  for (const element of ops.layerList(stage)) {
    const row = make("li", `ed-layer${selected.has(element.id) ? " is-selected" : ""}`);
    const main = make("button", "ed-layer-main");
    main.type = "button";
    main.append(make("span", "", layerName(element)));
    if (element.groupId) main.append(make("span", "tag", "GROUP"));
    main.addEventListener("click", () => { if (multi) session.toggle(element.id); else session.select([element.id]); });
    const up = make("button", "ed-mini", "▲"), down = make("button", "ed-mini", "▼");
    up.type = down.type = "button";
    up.setAttribute("aria-label", "Bring forward"); down.setAttribute("aria-label", "Send backward");
    up.addEventListener("click", () => run(ops.reorderLayers(session.doc, [element.id], "forward")));
    down.addEventListener("click", () => run(ops.reorderLayers(session.doc, [element.id], "backward")));
    row.append(main, up, down);
    list.append(row);
  }
}

let lastSelectionKey = "";
function renderAll() {
  updateChrome();
  if (!workspaceVisible) return;
  canvas.render();
  renderStages();
  renderLayers();
  properties.update();
  const key = session.state.selection.join(",");
  if (key !== lastSelectionKey) { lastSelectionKey = key; if (key) requestAnimationFrame(revealSelection); }
}

// ---- actions -----------------------------------------------------------------------------------------------------------------------------------------
for (const button of document.querySelectorAll("[data-add]")) {
  button.addEventListener("click", () => {
    const result = run(ops.addElement(session.doc, session.state.stageId, button.dataset.add), { keepResultSelection: true });
    if (result.ok && button.dataset.add === "text") {
      if (window.matchMedia("(max-width: 899px)").matches) document.body.dataset.sheet = "props";
      requestAnimationFrame(() => { $("propsBody").querySelector("textarea")?.select(); setTimeout(revealSelection, 220); });
    } else if (result.ok) document.body.dataset.sheet = "";
  });
}
$("multiBtn").addEventListener("click", () => { multi = !multi; updateChrome(); });
$("undoBtn").addEventListener("click", () => session.undo());
$("redoBtn").addEventListener("click", () => session.redo());

$("stageAdd").addEventListener("click", () => {
  const result = run(ops.addStage(session.doc, { afterIndex: ops.stageIndex(session.doc, session.state.stageId) }));
  if (result.ok) session.setStage(result.stageId);
});
$("stageLeft").addEventListener("click", () => run(ops.reorderStage(session.doc, session.state.stageId, ops.stageIndex(session.doc, session.state.stageId) - 1)));
$("stageRight").addEventListener("click", () => run(ops.reorderStage(session.doc, session.state.stageId, ops.stageIndex(session.doc, session.state.stageId) + 1)));
$("stageDelete").addEventListener("click", () => {
  const result = ops.deleteStage(session.doc, session.state.stageId);
  if (result.ok) { removeStage(result); return; }
  if (result.errors[0] === "STAGE_NOT_EMPTY") { pendingStageDelete = result.elementCount; renderStages(); return; }
  notify(describeErrors(result.errors).join(" "));
});
$("stageConfirmNo").addEventListener("click", () => { pendingStageDelete = null; renderStages(); });
$("stageConfirmYes").addEventListener("click", () => { removeStage(ops.deleteStage(session.doc, session.state.stageId, { force: true })); pendingStageDelete = null; });
function removeStage(result) {
  const index = ops.stageIndex(session.doc, session.state.stageId);
  const neighbour = session.doc.stages[Math.max(0, index - 1) === index ? 1 : Math.max(0, index - 1)]?.id;
  if (run(result).ok && neighbour) session.setStage(neighbour);
}

async function save() {
  if (session.status === "error") session.retry();
  notify("");
  await session.save();
}
$("saveBtn").addEventListener("click", save);
$("conflictReload").addEventListener("click", async () => { await session.reloadLatest(); });
$("conflictOverwrite").addEventListener("click", async () => {
  if (window.confirm("Overwrite the newer saved version of your Wall with what you have here? The newer version will be replaced.")) await session.overwriteWithMine();
});

// ---- preview (visitor-style, uses the real render pipeline; never touches the document) -----------------------------------------------------------
$("previewBtn").addEventListener("click", () => {
  const scroll = $("previewScroll");
  $("preview").hidden = false;
  const width = Math.min(560, scroll.clientWidth || window.innerWidth);
  const painted = paintDocument(session.doc, width);
  $("previewColumn").replaceChildren(...(painted.ok ? painted.stages : [make("p", "ed-empty", "This Wall cannot be previewed: " + describeErrors(painted.errors).join(" "))]));
  scroll.scrollTop = 0;
});
$("previewClose").addEventListener("click", () => { $("preview").hidden = true; $("previewColumn").replaceChildren(); });

// ---- keyboard (desktop) ------------------------------------------------------------------------------------------------------------------------------
document.addEventListener("keydown", event => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); if (!$("saveBtn").disabled) save(); return; }
  if (typing || !workspaceVisible || !$("preview").hidden) return;
  const ids = session.state.selection;
  if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) session.redo(); else session.undo(); return; }
  if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); session.redo(); return; }
  if (!ids.length) return;
  if (mod && event.key.toLowerCase() === "d") { event.preventDefault(); run(ops.duplicateElements(session.doc, ids), { keepResultSelection: true }); return; }
  if (mod && event.key.toLowerCase() === "g") { event.preventDefault(); run(event.shiftKey ? ops.ungroupElements(session.doc, ids) : ops.groupElements(session.doc, ids), { keepResultSelection: true }); return; }
  if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); run(ops.deleteElements(session.doc, ids), { clearSelection: true }); return; }
  if (event.key === "Escape") { session.clearSelection(); return; }
  const step = event.shiftKey ? 10 : 1;
  const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
  if (nudge) { event.preventDefault(); run(ops.moveElements(session.doc, ids, nudge[0], nudge[1]), { coalesce: "nudge" }); }
});

window.addEventListener("beforeunload", event => { if (session.dirty) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("resize", () => { if (workspaceVisible) canvas.render(); });
if (typeof ResizeObserver === "function") {
  const observer = new ResizeObserver(() => { if (workspaceVisible) canvas.render(); });
  observer.observe($("viewport"));
  observer.observe($("workspace"));
}

// ---- gate + boot -------------------------------------------------------------------------------------------------------------------------------------
function gate({ title, text, loader = false, link = false, retry = false }) {
  $("gate").hidden = false;
  $("workspace").hidden = true;
  $("mobileBar").hidden = true;
  workspaceVisible = false;
  $("gateLoader").hidden = !loader;
  $("gateTitle").textContent = title;
  $("gateText").textContent = text;
  $("gateLink").hidden = !link;
 $("gateRetry").hidden = !retry;
  updateChrome();
}
const sessionStorageOrNull = () => { try { return window.sessionStorage; } catch { return null; } };
async function boot() {
  gate({ title: "Opening your Wall…", text: "Checking your GamID session.", loader: true });
  // The established account session (same localStorage session the Account page uses) - the editor keeps no session of its own.
  const check = await resolveEditorSession(restoreSession);
  const plan = planAuth(check, { attempts: sessionStorageOrNull(), handoffUrl: legacyAccountHandoffUrl({ origin: location.origin, pathname: "/play-together/" }) });
  if (plan.action === "HANDOFF") {
    // Owner signed in on the legacy TESTING origin only: use the established handoff, and come back here when the session arrives. Nothing is shown.
    rememberReturnTo("/wall-editor/");
    location.replace(plan.url);
    return;
  }
  if (plan.action !== "OPEN") { document.documentElement.dataset.authReason = plan.reason; gate(gateFor(plan.action)); return; }
  const loaded = await session.load();
  if (!loaded) {
    const code = session.state.errorCode;
    gate({ title: code === "IDENTITY_NOT_FOUND" ? "Create your GamID first" : "Your Wall could not be opened", text: describeCode(code), link: code === "AUTH_REQUIRED" || code === "IDENTITY_NOT_FOUND", retry: code !== "STORED_DOCUMENT_INVALID" });
    return;
  }
  $("gate").hidden = true;
  $("workspace").hidden = false;
  $("mobileBar").hidden = false;
  workspaceVisible = true;
  renderAll();
  requestAnimationFrame(() => canvas.render());
}
$("gateRetry").addEventListener("click", boot);
boot();
