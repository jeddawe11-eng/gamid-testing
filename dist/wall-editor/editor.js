// Wall Editor - boot and wiring. Owner-only: it needs a signed-in GamID session (the same session the account app keeps), and every Wall read/write goes
// through the W2 owner RPCs, which resolve the owner on the server. The editor edits the Wall Document directly; there is no second document format.
import * as api from "../account/supabase-client.js";
import { restoreSession, rpc } from "../account/supabase-client.js";
import { createWallPersistence, publicationState } from "../wall/persistence.js";
import { createEditorSession } from "../wall-kit/session.js";
import * as ops from "../wall-kit/ops.js";
import { paintDocument } from "../wall-kit/paint.js";
import { describeCode, describeErrors, stageDeleteQuestion, selectionSummary, createNotifier } from "../wall-kit/messages.js";
import { resolveEditorSession, planAuth, gateFor } from "../wall-kit/auth-gate.js";
import { elementRegistry } from "../wall/elements.js";
import { GAMID_BLOCK_INFO } from "../wall-kit/gamid.js";
import { DATA_FIELD_INFO } from "../wall-kit/gamid-data.js";
import { createPlayerManager } from "../wall-kit/embed/player.js";
import { createPosterLoader } from "../wall-kit/posters.js";
import { createVideoPool } from "../wall-kit/video-background.js";
import { createCanvas } from "./canvas.js";
import { createPropertiesPanel } from "./controls.js";
import { createTools } from "./tools.js";
import { createAssetStore } from "./assets.js";
import { loadGamidSnapshot, PUBLIC_SOURCE_LABELS } from "./gamid-data.js";
import { createWallDetails } from "../wall-kit/gamid-details.js";
import { accountSignInUrl } from "../account/testing-auth-handoff.js";
import { rememberReturnTo } from "../account/post-auth-return.js";

const $ = id => document.getElementById(id);
const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const isPhone = () => window.matchMedia("(max-width: 899px)").matches;

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
let gamidSnapshot = null;
let renderQueued = false;
let publication = { known: false, record: null, busy: false };   // the owner's publish status (see "publishing" below)
const session = createEditorSession({ persistence, onChange: () => renderAll() });

// Applies an operation result to the session. A failed operation changes nothing and tells the owner why.
function run(result, { coalesce = null, keepResultSelection = false, clearSelection = false } = {}) {
  if (!result.ok) { notify(describeErrors(result.errors).join(" ")); return result; }
  session.apply(result, { coalesce, select: keepResultSelection ? result.ids : clearSelection ? [] : undefined });
  if (result.embedLifts?.length) notify(describeCode("EMBED_KEPT_ON_TOP"));
  return result;
}

// One banner, two kinds (messages.js createNotifier): notify() is TRANSIENT (hides itself after ~5 s: hints, refused edits, the player z-order notice);
// notifyError() is PERSISTENT (a save failure / conflict that needs the owner). A newer message always replaces an older one and its timer.
let noticeShownAt = 0;
const notifier = createNotifier({
  show: (message, kind) => {
    $("errorText").textContent = message;
    $("errorBanner").dataset.kind = kind;
    $("errorBanner").setAttribute("role", kind === "error" ? "alert" : "status");
    $("errorBanner").hidden = false;
    noticeShownAt = Date.now();
  },
  hide: () => { $("errorText").textContent = ""; $("errorBanner").hidden = true; },
});
const notify = message => notifier.info(message);
const notifyError = message => notifier.error(message);
$("errorDismiss").addEventListener("click", () => notifier.dismiss());

// ---- assets and GamID data --------------------------------------------------------------------------------------------------------------------------
// (setTimeout, not requestAnimationFrame: a hidden or backgrounded tab pauses animation frames, and an image that finished loading must still appear when the tab returns)
const scheduleRender = () => { if (renderQueued) return; renderQueued = true; setTimeout(() => { renderQueued = false; if (workspaceVisible) renderAll(); }, 16); };
const assetStore = createAssetStore({ api, userId: null, onChange: scheduleRender });
const posters = createPosterLoader({ endpoint: api.MEDIA_POSTER_URL });
// background videos: one pool for the canvas (repaints never restart the video) and one for Preview
const canvasVideos = createVideoPool();
let previewVideos = null;
async function refreshGamid() {
  gamidSnapshot = null;
  scheduleRender();
  // Preview opens the Duo's GamID in a new tab (the editor is never left), at the same permanent /@handle address the account page shares
  gamidSnapshot = await loadGamidSnapshot(api, { duoLink: { newTab: true, href: handle => new URL(`../@${handle}`, location.href).pathname }, crewLink: { newTab: true, href: crewId => `${new URL("../crew/", location.href).pathname}?c=${crewId}` } });
  scheduleRender();
}

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
  getPaintContext: () => ({ assets: assetStore, gamid: gamidSnapshot, posters, videos: canvasVideos }),
  onSelectedTap: () => { if (isPhone()) openTool("props"); },
  onEditText: () => {
    if (isPhone()) openTool("props");
    requestAnimationFrame(() => $("propsBody").querySelector("textarea")?.focus());
  },
});
const leaveMultiSelect = () => { if (multi) { multi = false; updateChrome(); } };
const properties = createPropertiesPanel({ body: $("propsBody"), title: $("propsTitle"), session, run, fitTextHeight, assets: assetStore, refreshGamid, getGamid: () => gamidSnapshot, onGroupingChanged: leaveMultiSelect });

// ---- tools: one rail, one drawer ------------------------------------------------------------------------------------------------------------------
// On a phone a bottom sheet covers the lower part of the stage: scroll the selection up into the part that stays visible above it.
function revealSelection() {
  if (!isPhone() || !document.body.classList.contains("is-sheet-open")) return;
  const box = $("stageHost").querySelector(".ed-sel");
  if (!box) return;
  const viewport = $("viewport");
  const sheet = document.body.dataset.tool === "props" ? $("props") : $("drawer");
  const sheetTop = sheet.getBoundingClientRect().top;
  const overshoot = box.getBoundingClientRect().bottom - (sheetTop - 16);
  if (overshoot > 0) viewport.scrollTop += overshoot;
  const above = viewport.getBoundingClientRect().top + 8 - box.getBoundingClientRect().top;
  if (above > 0) viewport.scrollTop -= above;
}
function afterToolChange() { setTimeout(() => { canvas.render(); setTimeout(revealSelection, 220); }, 16); }
// Opens a tool (desktop: the drawer always shows one tool and the Edit inspector is always visible; phone: the tool opens as a bottom sheet).
function openTool(name) {
  if (!isPhone() && name === "props") return;
  document.body.dataset.tool = name;
  document.body.classList.add("is-sheet-open");
  tools?.update();
  afterToolChange();
}
function toggleTool(name) {
  const open = document.body.classList.contains("is-sheet-open") && document.body.dataset.tool === name;
  if (isPhone() && open) { document.body.classList.remove("is-sheet-open"); afterToolChange(); return; }
  openTool(name);
}
for (const button of document.querySelectorAll("#rail [data-tool]")) button.addEventListener("click", () => toggleTool(button.dataset.tool));

const assetFile = $("assetFile");
let placeNextUpload = false;
const tools = createTools({
  session, run, notify, assets: assetStore, getGamid: () => gamidSnapshot, refreshGamid, setTool: openTool,
  pickImage: () => { placeNextUpload = true; assetFile.click(); },
});
$("assetUpload").addEventListener("click", () => { placeNextUpload = false; assetFile.click(); });
assetFile.addEventListener("change", async () => {
  const file = assetFile.files?.[0];
  assetFile.value = "";
  if (file) await tools.uploadFile(file, { place: placeNextUpload });
  placeNextUpload = false;
});

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
  updatePublishChrome();
  if (status !== lastStatus && status === "error" && session.state.errorCode) notifyError(describeCode(session.state.errorCode));
  lastStatus = status;
  const index = session.doc.stages.findIndex(stage => stage.id === session.state.stageId);
  $("stageLabel").textContent = `Stage ${index + 1} of ${session.doc.stages.length}`;
  const chosen = new Set(session.state.selection);
  $("selInfo").textContent = selectionSummary(session.stage ? session.stage.elements.filter(element => chosen.has(element.id)) : []);
  $("multiBtn").setAttribute("aria-pressed", String(multi));
}

// ---- layout: stages and layers ----------------------------------------------------------------------------------------------------------------------
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
  // the confirmation belongs to the stage it was asked for; switching stages dismisses it
  if (pendingStageDelete !== null && pendingStageDelete.stageId !== session.state.stageId) pendingStageDelete = null;
  $("stageConfirm").hidden = pendingStageDelete === null;
  if (pendingStageDelete !== null) $("stageConfirmText").textContent = stageDeleteQuestion(pendingStageDelete);
}

function layerName(element) {
  if (element.type === "text") return `${element.payload.link ? "Link" : "Text"}: ${element.payload.text.replace(/\s+/g, " ").slice(0, 24) || "(empty)"}`;
  if (element.type === "rect") return element.payload.radius >= Math.min(element.width, element.height) / 2 && element.width === element.height ? "Circle" : element.payload.radius ? "Rounded rectangle" : "Rectangle";
  if (element.type === "image") {
    const noun = element.payload.media === "video" ? "Video" : "Artwork";
    const base = element.payload.alt ? `${noun}: ${element.payload.alt.slice(0, 22)}` : noun;
    const slice = element.payload.slice;
    return slice ? `${base} · piece ${Math.round(slice.from * 100)}–${Math.round(slice.to * 100)}%` : base;
  }
  if (element.type === "gamidData") return `GamID data: ${DATA_FIELD_INFO[element.payload.field]?.label ?? "field"}`;
  if (element.type === "embed") { const descriptor = elementRegistry.get("embed").render(element.payload).content; return `${descriptor?.providerLabel ?? "Link"} ${descriptor?.contentLabel?.toLowerCase() ?? ""}`.trim(); }
  if (element.type === "gamid") return `GamID: ${GAMID_BLOCK_INFO[element.payload.block]?.label ?? "block"}`;
  return element.type;
}
function renderLayers() {
  const list = $("layerList");
  list.replaceChildren();
  const stage = session.stage;
  if (!stage || !stage.elements.length) { list.append(make("li", "ed-empty", "This stage is empty. Use Add to place text, a shape, an image, a link or a GamID block.")); return; }
  const selected = new Set(session.state.selection);
  const groups = ops.groupNumbers(stage);
  for (const element of ops.layerList(stage)) {
    const row = make("li", `ed-layer${selected.has(element.id) ? " is-selected" : ""}`);
    const main = make("button", "ed-layer-main");
    main.type = "button";
    main.append(make("span", "", layerName(element)));
    if (element.groupId) main.append(make("span", "tag", `GROUP ${groups.get(element.groupId)}`));
    main.addEventListener("click", () => { if (multi) session.toggle(element.id); else session.select([element.id]); });
    const up = make("button", "ed-mini", "▲"), down = make("button", "ed-mini", "▼");
    up.type = down.type = "button";
    up.setAttribute("aria-label", "Bring forward"); down.setAttribute("aria-label", "Send backward");
    up.addEventListener("click", () => run(ops.reorderLayers(session.doc, [element.id], "forward")));
    down.addEventListener("click", () => run(ops.reorderLayers(session.doc, [element.id], "backward")));
    row.append(main);
    // Round 3 - an artwork's Lock and Click-through are always reachable here, even when the canvas cannot pick it
    if (element.type === "image") {
      const lock = make("button", "ed-mini", element.payload.locked ? "🔒" : "🔓");
      lock.type = "button";
      lock.setAttribute("aria-pressed", String(element.payload.locked === true));
      lock.setAttribute("aria-label", element.payload.locked ? "Unlock position" : "Lock position");
      lock.title = lock.getAttribute("aria-label");
      lock.addEventListener("click", () => run(ops.updatePayload(session.doc, element.id, { locked: element.payload.locked ? undefined : true })));
      row.append(lock);
      if (element.payload.clickThrough) main.append(make("span", "tag", "CLICK-THROUGH"));
    }
    row.append(up, down);
    // drag a row onto another to place it above / below that layer (groups move as one unless reordered inside their own group)
    row.draggable = true;
    row.dataset.id = element.id;
    row.addEventListener("dragstart", event => { event.dataTransfer?.setData("text/plain", element.id); row.classList.add("is-dragging"); });
    row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
    row.addEventListener("dragover", event => {
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      const above = event.clientY < rect.top + rect.height / 2;
      row.classList.toggle("is-drop-above", above); row.classList.toggle("is-drop-below", !above);
    });
    row.addEventListener("dragleave", () => row.classList.remove("is-drop-above", "is-drop-below"));
    row.addEventListener("drop", event => {
      event.preventDefault();
      const dragged = event.dataTransfer?.getData("text/plain");
      const above = row.classList.contains("is-drop-above");
      row.classList.remove("is-drop-above", "is-drop-below");
      if (dragged && dragged !== element.id) run(ops.moveLayer(session.doc, dragged, element.id, above ? "above" : "below"));
    });
    list.append(row);
  }
}

let lastSelectionKey = "";
let lastStageId = null, lastNoticeSelection = "";
function renderAll() {
  updateChrome();
  // a transient notice belongs to what was on screen when it appeared: switching stage hides it at once, and so does choosing a different selection once the
  // notice has been visible for a moment (the action that raised it may itself have just changed the selection)
  const selectionKey = session.state.selection.join(",");
  if (session.state.stageId !== lastStageId) { if (lastStageId !== null) notifier.clearTransient(); lastStageId = session.state.stageId; }
  else if (selectionKey !== lastNoticeSelection && Date.now() - noticeShownAt > 800) notifier.clearTransient();
  lastNoticeSelection = selectionKey;
  if (!workspaceVisible) return;
  canvas.render();
  renderStages();
  renderLayers();
  properties.update();
  tools.update();
  const key = session.state.selection.join(",");
  if (key !== lastSelectionKey) { lastSelectionKey = key; if (key) requestAnimationFrame(revealSelection); }
}

// ---- actions -----------------------------------------------------------------------------------------------------------------------------------------
$("multiBtn").addEventListener("click", () => { multi = !multi; updateChrome(); });
$("undoBtn").addEventListener("click", () => { session.undo(); tools.invalidate(); });
$("redoBtn").addEventListener("click", () => { session.redo(); tools.invalidate(); });

$("stageAdd").addEventListener("click", () => {
  const result = run(ops.addStage(session.doc, { afterIndex: ops.stageIndex(session.doc, session.state.stageId) }));
  if (result.ok) session.setStage(result.stageId);
});
$("stageLeft").addEventListener("click", () => run(ops.reorderStage(session.doc, session.state.stageId, ops.stageIndex(session.doc, session.state.stageId) - 1)));
$("stageRight").addEventListener("click", () => run(ops.reorderStage(session.doc, session.state.stageId, ops.stageIndex(session.doc, session.state.stageId) + 1)));
// Deleting ANY stage is confirmed first - with elements, with only a background, or completely empty. Undo restores it either way.
$("stageDelete").addEventListener("click", () => {
  const info = ops.stageDeletionInfo(session.doc, session.state.stageId);
  if (!info || info.isLast) { notify(describeErrors(["LAST_STAGE"]).join(" ")); return; }
  pendingStageDelete = info;
  renderStages();
});
$("stageConfirmNo").addEventListener("click", () => { pendingStageDelete = null; renderStages(); });
$("stageConfirmYes").addEventListener("click", () => {
  if (!pendingStageDelete || pendingStageDelete.stageId !== session.state.stageId) { pendingStageDelete = null; renderStages(); return; }
  pendingStageDelete = null;
  removeStage(ops.deleteStage(session.doc, session.state.stageId, { force: true }));
});
function removeStage(result) {
  const index = ops.stageIndex(session.doc, session.state.stageId);
  const neighbour = session.doc.stages[Math.max(0, index - 1) === index ? 1 : Math.max(0, index - 1)]?.id;
  if (run(result).ok && neighbour) session.setStage(neighbour);
}

async function save() {
  if (session.status === "error") session.retry();
  notifier.dismiss();
  await session.save();
}
$("saveBtn").addEventListener("click", save);

// ---- publishing (owner-only) -------------------------------------------------------------------------------------------------------------------------------
// The draft stays private. Publish copies the SAVED draft to the snapshot visitors of /@handle see (unsaved edits are saved first, so what is published is
// exactly what is on screen); further edits only reach visitors on the next Publish. Unpublish shows visitors the Public Profile again; the draft is kept.
const PUBLISH_TEXT = { unpublished: "Not published", published: "Published", changes: "Unpublished changes" };
function updatePublishChrome() {
  const known = publication.known && workspaceVisible;
  const state = publicationState(publication.record, { revision: session.state.revision, dirty: session.dirty });
  $("publishState").hidden = !known;
  $("publishState").dataset.publish = known ? state : "unknown";
  $("publishState").textContent = PUBLISH_TEXT[state];
  const blocked = ["loading", "saving", "conflict", "blocked"].includes(session.status);
  $("publishBtn").disabled = !known || publication.busy || blocked || state === "published";
  $("publishBtn").textContent = state === "changes" ? "Publish changes" : "Publish";
  $("unpublishBtn").hidden = !known || !publication.record;
  $("unpublishBtn").disabled = publication.busy;
  const handle = gamidSnapshot?.profile?.handle;
  $("publicLink").hidden = !known || !publication.record || !handle;
  if (handle) $("publicLink").href = new URL(`../@${encodeURIComponent(handle)}`, location.href).href;
}
async function refreshPublication() {
  try { publication = { ...publication, known: true, record: await persistence.loadPublication() }; }
  catch { publication = { ...publication, known: false }; }   // the status simply is not shown; editing is unaffected
  updateChrome();
}
async function publish() {
  if (publication.busy) return;
  publication = { ...publication, busy: true };
  updateChrome();
  try {
    if (session.dirty || session.status === "unsaved" || session.status === "error") {
      await save();
      if (session.dirty || session.status !== "saved") return;   // the save did not go through (its own message is already shown); nothing is published
    }
    const record = await persistence.publish(session.state.revision);
    publication = { ...publication, record };
    notify("Published. Visitors to your GamID now see this Wall.");
  } catch (error) {
    notify(describeCode(error?.code || "WALL_SAVE_FAILED"));
    await refreshPublication();
  } finally {
    publication = { ...publication, busy: false };
    updateChrome();
  }
}
async function unpublish() {
  if (publication.busy || !window.confirm("Unpublish your Wall? Visitors will see your Public Profile again. Your Wall draft is kept.")) return;
  publication = { ...publication, busy: true };
  updateChrome();
  try {
    await persistence.unpublish();
    publication = { ...publication, record: null };
    notify("Unpublished. Visitors see your Public Profile again.");
  } catch (error) {
    notify(describeCode(error?.code || "WALL_SAVE_FAILED"));
  } finally {
    publication = { ...publication, busy: false };
    updateChrome();
  }
}
$("publishBtn").addEventListener("click", publish);
$("unpublishBtn").addEventListener("click", unpublish);
$("conflictReload").addEventListener("click", async () => { await session.reloadLatest(); tools.invalidate(); });
$("conflictOverwrite").addEventListener("click", async () => {
  if (window.confirm("Overwrite the newer saved version of your Wall with what you have here? The newer version will be replaced.")) await session.overwriteWithMine();
});

// ---- preview (visitor-style, the real render pipeline in VIEW mode; never touches the document) ------------------------------------------------------
let previewMode = "mobile";
let players = null;
let details = null;   // Game Details / Connection Details, built once from the visitor view of this GamID (dist/wall-kit/gamid-details.js)
function detailsFor(snapshot) {
  const handle = snapshot?.public?.handle;
  if (!handle) return null;
  if (!details) details = createWallDetails({ element: make, handle, api, mount: node => document.body.append(node), sourceLabels: PUBLIC_SOURCE_LABELS, posters });
  return details;
}
function renderPreview() {
  const scroll = $("previewScroll");
  players?.destroyAll();
  players = createPlayerManager();
  const available = Math.max(280, (scroll.clientWidth || window.innerWidth) - 16);
  const width = previewMode === "mobile" ? Math.min(390, available) : Math.min(900, available);
  // a Wall saved before the player-layering rule existed is shown with that rule applied (nothing drawn over a player); the document itself is not changed
  previewVideos ??= createVideoPool();
  const painted = paintDocument(ops.normalizeEmbedLayering(session.doc).doc, width, undefined, { mode: "view", assets: assetStore, gamid: gamidSnapshot, players, posters, details: detailsFor(gamidSnapshot), videos: previewVideos });
  $("previewColumn").replaceChildren(...(painted.ok ? painted.stages : [make("p", "ed-empty", "This Wall cannot be previewed: " + describeErrors(painted.errors).join(" "))]));
  $("previewMobile").setAttribute("aria-pressed", String(previewMode === "mobile"));
  $("previewDesktop").setAttribute("aria-pressed", String(previewMode === "desktop"));
}
$("previewBtn").addEventListener("click", () => { $("preview").hidden = false; renderPreview(); $("previewScroll").scrollTop = 0; });
$("previewMobile").addEventListener("click", () => { previewMode = "mobile"; renderPreview(); });
$("previewDesktop").addEventListener("click", () => { previewMode = "desktop"; renderPreview(); });
$("previewClose").addEventListener("click", () => { players?.destroyAll(); players = null; details?.closeAll(); previewVideos?.clear(); previewVideos = null; $("preview").hidden = true; $("previewColumn").replaceChildren(); });

// ---- keyboard (desktop) ------------------------------------------------------------------------------------------------------------------------------
document.addEventListener("keydown", event => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); if (!$("saveBtn").disabled) save(); return; }
  if (typing || !workspaceVisible || !$("preview").hidden) return;
  const ids = session.state.selection;
  if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) session.redo(); else session.undo(); tools.invalidate(); return; }
  if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); session.redo(); tools.invalidate(); return; }
  if (!ids.length) return;
  if (mod && event.key.toLowerCase() === "d") { event.preventDefault(); run(ops.duplicateElements(session.doc, ids), { keepResultSelection: true }); return; }
  if (mod && event.key.toLowerCase() === "g") { event.preventDefault(); if (run(event.shiftKey ? ops.ungroupElements(session.doc, ids) : ops.groupElements(session.doc, ids), { keepResultSelection: true }).ok) leaveMultiSelect(); return; }
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
  workspaceVisible = false;
  $("gateLoader").hidden = !loader;
  $("gateTitle").textContent = title;
  $("gateText").textContent = text;
  $("gateLink").hidden = !link;
  $("gateRetry").hidden = !retry;
  updateChrome();
}
async function boot() {
  gate({ title: "Opening your Wall…", text: "Checking your GamID session.", loader: true });
  // The established account session (same localStorage session the Account page uses) - the editor keeps no session of its own.
  const check = await resolveEditorSession(restoreSession);
  const plan = planAuth(check);
  if (plan.action !== "OPEN") { document.documentElement.dataset.authReason = plan.reason; gate(gateFor(plan.action)); return; }
  const loaded = await session.load();
  if (!loaded) {
    const code = session.state.errorCode;
    gate({ title: code === "IDENTITY_NOT_FOUND" ? "Create your GamID first" : "Your Wall could not be opened", text: describeCode(code), link: code === "AUTH_REQUIRED" || code === "IDENTITY_NOT_FOUND", retry: code !== "STORED_DOCUMENT_INVALID" });
    return;
  }
  $("gate").hidden = true;
  $("workspace").hidden = false;
  workspaceVisible = true;
  document.body.dataset.tool = document.body.dataset.tool || "add";
  renderAll();
  requestAnimationFrame(() => canvas.render());
  // the owner's own images and GamID data load in the background; the Wall is usable immediately
  assetStore.setUserId(api.userIdFromToken());
  assetStore.refresh().catch(() => { /* Assets shows an empty state; the Wall itself is unaffected */ });
  refreshGamid().catch(() => { /* blocks show a plain "not available" note */ });
  refreshPublication();
}
$("gateLink").addEventListener("click", event => {
  const target = accountSignInUrl(location);
  if (!target) return;
  event.preventDefault();
  if (["NO_STORED_SESSION", "SESSION_REFRESH_REJECTED"].includes(document.documentElement.dataset.authReason)) rememberReturnTo("/wall-editor/");
  location.assign(target);
});
$("gateRetry").addEventListener("click", boot);
boot();
