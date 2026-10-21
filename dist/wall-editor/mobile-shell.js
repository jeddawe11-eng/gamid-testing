// Mobile Wall Editor V2 (2026-10-20): the phone interface of the Wall Editor. It is a SHELL only - every action goes through the editor's own buttons and
// handlers (Save, Undo, Preview, Publish, Add stage, Delete stage...) or the same pure operations (ops.js) the desktop uses, so the Wall Document, its
// validation, save / load, assets and rendering are the ones every other screen uses. Nothing here exists on a tablet or desktop: the elements are hidden
// there (editor.css) and this module does nothing while the phone query (phone.js) does not match.
//
//   top toolbar:    Back, stage (opens Stages), Undo, Redo, Save (its label is the save status), Preview, Wall menu (publishing, fit)
//   canvas:         view-only zoom / pan / fit (canvas.js `view`), the selection's quick actions above the bottom toolbar
//   bottom toolbar: Add, Layers, Stages, Assets (My Assets + Background), More (Text, Media & Links, Shapes, GamID, Templates, Multi-select)
//   sheets:         the editor's own tool panels and Properties as bottom sheets (half / full height; a side sheet in landscape) + Stages, More, Wall
import * as ops from "../wall-kit/ops.js";
import { stageDeleteQuestion } from "../wall-kit/messages.js";
import { PHONE_QUERY } from "./phone.js";

const $ = id => document.getElementById(id);
const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const icon = name => { const node = make("i", "mw-i"); node.dataset.i = name; node.setAttribute("aria-hidden", "true"); return node; };
const OWN_SHEETS = { stages: "mwStages", more: "mwMore", wall: "mwWall" };
const TOOL_TITLES = { add: "Add", text: "Text & fonts", media: "Media & Links", shapes: "Shapes", gamid: "GamID", layout: "Layers", assets: "Assets", templates: "Templates" };   // Background is inside Assets (2026-10-21)
const MORE_TOOLS = new Set(["text", "media", "shapes", "gamid", "templates"]);
const SAVE_LABEL = { loading: "Loading…", saved: "Saved", unsaved: "Save", saving: "Saving…", error: "Retry save", conflict: "Conflict", blocked: "Blocked" };
const SAVE_ANNOUNCE = { saved: "All changes saved.", unsaved: "Unsaved changes.", saving: "Saving…", error: "Save failed. Tap Retry save.", conflict: "A newer saved version exists.", blocked: "Editing is blocked." };

export function createMobileShell({ session, canvas, run, openTool, closeTools, layerName, isWorkspaceVisible, toggleTool }) {
  const query = typeof matchMedia === "function" ? matchMedia(PHONE_QUERY) : null;
  const active = () => Boolean(query?.matches);
  const body = document.body;
  let own = null;               // "stages" | "more" | "wall" | null - the shell's own sheets (tool sheets are the editor's: body.is-sheet-open + data-tool)
  let lastStatus = null, lastStageId = null, selKey = "", layerKey = "", stageKey = "", lastEditKey = "";

  const toolSheetOpen = () => body.classList.contains("is-sheet-open");
  const anySheet = () => own !== null || toolSheetOpen();
  const say = text => { $("mwStatus").textContent = ""; requestAnimationFrame(() => { $("mwStatus").textContent = text; }); };
  const relayout = () => setTimeout(() => { canvas.render(); canvas.revealSelection(); }, 16);   // the canvas is re-fitted to the space a sheet leaves free

  // ---- sheets -------------------------------------------------------------------------------------------------------------------------------------------
  function setSize(size) { body.dataset.mwSize = size; relayout(); }
  function openOwn(name, { focus = true } = {}) {
    if (toolSheetOpen()) body.classList.remove("is-sheet-open");
    own = name;
    body.dataset.mwSheet = name;
    body.dataset.mwSize = "half";
    for (const [key, id] of Object.entries(OWN_SHEETS)) $(id).hidden = key !== name;
    update();
    relayout();
    if (focus) requestAnimationFrame(() => $(OWN_SHEETS[name])?.querySelector(".mw-sheet-title")?.focus({ preventScroll: true }));
  }
  function closeOwn() {
    if (!own) return;
    const was = own;
    own = null;
    delete body.dataset.mwSheet;
    for (const id of Object.values(OWN_SHEETS)) $(id).hidden = true;
    update();
    relayout();
    return was;
  }
  function closeAll() {
    const button = own === "wall" ? $("mwMenuBtn") : own === "stages" ? $("mwStage") : null;
    if (own) closeOwn();
    if (toolSheetOpen()) closeTools();
    button?.focus({ preventScroll: true });
  }
  // the editor opened a tool sheet (a tool, or Properties after a tap / an Add): the shell's own sheet steps aside, and the new sheet starts at half height
  function toolOpened() {
    if (!active()) return;
    if (own) { own = null; delete body.dataset.mwSheet; for (const id of Object.values(OWN_SHEETS)) $(id).hidden = true; }
    body.dataset.mwSize = "half";
    update();
  }

  // grab handle: a tap toggles half / full height; a drag up opens it full, a drag down shrinks it (or closes it from half height)
  for (const grab of document.querySelectorAll("[data-mw-grab]")) {
    let startY = null;
    grab.addEventListener("pointerdown", event => { startY = event.clientY; try { grab.setPointerCapture(event.pointerId); } catch { /* not capturable */ } });
    grab.addEventListener("pointerup", event => {
      if (startY === null) return;
      const dy = event.clientY - startY;
      startY = null;
      if (Math.abs(dy) < 12) { setSize(body.dataset.mwSize === "full" ? "half" : "full"); return; }
      if (dy < 0) setSize("full");
      else if (body.dataset.mwSize === "full") setSize("half");
      else closeAll();
    });
    grab.addEventListener("pointercancel", () => { startY = null; });
    grab.addEventListener("click", event => { if (event.detail === 0) setSize(body.dataset.mwSize === "full" ? "half" : "full"); });   // keyboard (Enter / Space)
  }
  for (const close of document.querySelectorAll("[data-mw-close]")) close.addEventListener("click", closeAll);
  // Escape closes the open sheet first (and only that), before the editor's own Escape (clear the selection)
  window.addEventListener("keydown", event => {
    if (!active() || event.key !== "Escape" || !anySheet() || !$("preview").hidden) return;
    event.stopPropagation();
    event.preventDefault();
    closeAll();
  }, true);

  // ---- top toolbar ---------------------------------------------------------------------------------------------------------------------------------------
  // (some handlers redraw only their own control - e.g. Delete stage shows its confirmation - so the shell mirrors right after)
  const proxy = (from, to) => $(from).addEventListener("click", () => { if (!$(to).disabled) $(to).click(); update(); });
  proxy("mwUndo", "undoBtn");
  proxy("mwRedo", "redoBtn");
  proxy("mwSave", "saveBtn");
  proxy("mwPreview", "previewBtn");
  proxy("mwPublish", "publishBtn");
  proxy("mwUnpublish", "unpublishBtn");
  proxy("mwMulti", "multiBtn");
  $("mwStage").addEventListener("click", () => (own === "stages" ? closeOwn() : openOwn("stages")));
  $("mwMenuBtn").addEventListener("click", () => (own === "wall" ? closeOwn() : openOwn("wall")));
  $("mwFit").addEventListener("click", () => canvas.fit());

  // ---- bottom toolbar -----------------------------------------------------------------------------------------------------------------------------------------
  for (const button of document.querySelectorAll("#mwBar [data-mw]")) {
    button.addEventListener("click", () => {
      const name = button.dataset.mw;
      if (name === "stages" || name === "more") { if (own === name) closeOwn(); else openOwn(name); return; }
      if (own) closeOwn();
      toggleTool(name);
    });
  }
  for (const button of document.querySelectorAll("#mwMore [data-mw-tool]")) button.addEventListener("click", () => openTool(button.dataset.mwTool));
  // the phone Add sheet's extra entries go to the existing ones: Video = the artwork upload (it takes MP4 / WebM too), Icons = Media & Links (Icon / Icon Group)
  for (const button of document.querySelectorAll("[data-mw-add]")) button.addEventListener("click", () => {
    const target = button.dataset.mwAdd;
    if (target === "templates") openTool("templates");
    else document.querySelector(`[data-add-action="${target}"]`)?.click();
  });

  // ---- canvas zoom ------------------------------------------------------------------------------------------------------------------------------------------
  $("mwZoomIn").addEventListener("click", () => canvas.zoomBy(1.5));
  $("mwZoomOut").addEventListener("click", () => canvas.zoomBy(1 / 1.5));
  $("mwZoomFit").addEventListener("click", () => canvas.fit());
  function zoomChanged({ zoom }) {
    const fitted = zoom <= 1.001;
    $("mwZoomText").textContent = fitted ? "Fit" : `${Math.round(zoom * 100)}%`;
    $("mwZoomFit").setAttribute("aria-label", fitted ? "The whole stage fits the screen" : `Zoom ${Math.round(zoom * 100)}%. Fit the stage to the screen`);
    $("mwZoomOut").disabled = fitted;
    $("mwZoomIn").disabled = zoom >= 5.99;
    $("mwFit").disabled = fitted;
  }

  // ---- the selection's quick actions (canvas) and the Layers sheet's selected-layer actions ---------------------------------------------------------------
  const selection = () => { const stage = session.stage, chosen = new Set(session.state.selection); return stage ? stage.elements.filter(element => chosen.has(element.id)) : []; };
  const ids = () => session.state.selection;
  const actions = {
    edit: () => openTool("props"),
    duplicate: () => { if (run(ops.duplicateElements(session.doc, ids()), { keepResultSelection: true }).ok) say("Duplicated. The copy is selected."); },
    remove: () => { const count = ids().length; if (run(ops.deleteElements(session.doc, ids()), { clearSelection: true }).ok) say(`${count === 1 ? "Element" : `${count} elements`} deleted. Undo brings ${count === 1 ? "it" : "them"} back.`); },
    forward: () => run(ops.reorderLayers(session.doc, ids(), "forward")),
    backward: () => run(ops.reorderLayers(session.doc, ids(), "backward")),
    lock: element => run(ops.updatePayload(session.doc, element.id, { locked: element.payload.locked ? undefined : true })),
    done: () => session.clearSelection(),
  };
  const actionButton = (label, iconName, handler, { text = null, pressed = null, danger = false } = {}) => {
    const button = make("button", `mw-act${danger ? " is-danger" : ""}`);
    button.type = "button";
    button.setAttribute("aria-label", label);
    if (pressed !== null) button.setAttribute("aria-pressed", String(pressed));
    button.append(icon(iconName));
    if (text) button.append(make("span", "", text));
    button.addEventListener("click", handler);
    return button;
  };
  function renderSelBar(selected) {
    const bar = $("mwSelBar");
    const show = active() && isWorkspaceVisible() && selected.length > 0 && !anySheet() && $("preview").hidden;
    bar.hidden = !show;
    if (!show) { selKey = ""; return; }
    const single = selected.length === 1 ? selected[0] : null;
    const key = JSON.stringify([selected.map(element => element.id), single?.type === "image" ? single.payload.locked === true : null, single ? layerName(single) : ""]);
    if (key === selKey) return;
    selKey = key;
    const label = make("span", "mw-sel-name", single ? layerName(single) : `${selected.length} selected`);
    bar.replaceChildren(label,
      actionButton("Edit the selection", "edit", actions.edit, { text: "Edit" }),
      actionButton("Duplicate", "copy", actions.duplicate),
      actionButton("Bring forward", "up", actions.forward),
      actionButton("Send backward", "down", actions.backward),
      ...(single?.type === "image" ? [actionButton(single.payload.locked ? "Unlock position" : "Lock position", single.payload.locked ? "lock" : "unlock", () => actions.lock(single), { pressed: single.payload.locked === true })] : []),
      actionButton("Delete", "trash", actions.remove, { danger: true }),
      actionButton("Deselect", "close", actions.done));
  }
  function renderLayerActions(selected) {
    const box = $("mwLayerActions");
    if (!active()) { box.replaceChildren(); layerKey = ""; return; }
    const single = selected.length === 1 ? selected[0] : null;
    const key = JSON.stringify([session.state.stageId, session.doc.stages.map(stage => stage.id), selected.map(element => element.id), single?.type === "image" ? single.payload.locked === true : null, single ? layerName(single) : ""]);
    if (key === layerKey) return;
    layerKey = key;
    if (!selected.length) { box.replaceChildren(make("p", "ed-hint", "Tap a layer to select it. ▲ ▼ change its order; the selected layer can be duplicated, deleted or moved to another stage here.")); return; }
    const head = make("p", "mw-layer-sel", single ? `Selected: ${layerName(single)}` : `${selected.length} selected`);
    const row = make("div", "mw-layer-row");
    row.append(actionButton("Duplicate the selected layer", "copy", actions.duplicate, { text: "Duplicate" }), actionButton("Delete the selected layer", "trash", actions.remove, { text: "Delete", danger: true }));
    if (single?.type === "image") row.append(actionButton(single.payload.locked ? "Unlock position" : "Lock position", single.payload.locked ? "lock" : "unlock", () => actions.lock(single), { text: single.payload.locked ? "Unlock" : "Lock", pressed: single.payload.locked === true }));
    const parts = [head, row];
    const options = session.doc.stages.length > 1 ? ops.stageMoveOptions(session.doc, session.state.stageId) : [];
    if (options.length) {
      const select = make("select", "mw-move-select");
      select.setAttribute("aria-label", "Move the selected layer to stage");
      for (const option of options) { const node = make("option", "", option.label); node.value = option.id; select.append(node); }
      const move = make("button", "ed-btn", "Move");
      move.type = "button";
      move.addEventListener("click", () => {
        const moving = ops.expandSelection(session.stage, session.state.selection);
        const destination = select.value;
        if (!run(ops.moveElementsToStage(session.doc, moving, destination), { clearSelection: true }).ok) return;
        session.setStage(destination);
        session.select(moving);
        say(`Moved to Stage ${ops.stageIndex(session.doc, destination) + 1}.`);
      });
      const label = make("label", "mw-move");
      label.append(make("span", "", "Move to stage"), select);
      const moveRow = make("div", "mw-layer-row");
      moveRow.append(label, move);
      parts.push(moveRow);
    }
    box.replaceChildren(...parts);
  }

  // ---- Stages sheet (the same handlers as the Stages bar: Add appends at the end, Delete always asks first) ------------------------------------------------
  proxy("mwStageAdd", "stageAdd");
  proxy("mwStageEarlier", "stageLeft");
  proxy("mwStageLater", "stageRight");
  proxy("mwStageDelete", "stageDelete");
  proxy("mwStageConfirmYes", "stageConfirmYes");
  proxy("mwStageConfirmNo", "stageConfirmNo");
  $("mwStageAdd").addEventListener("click", () => {
    say($("stageStatus").textContent);
    requestAnimationFrame(() => $("mwStageList").lastElementChild?.scrollIntoView?.({ block: "nearest" }));
  });
  $("mwStageDelete").addEventListener("click", () => requestAnimationFrame(() => { if (!$("mwStageConfirm").hidden) $("mwStageConfirmNo").focus(); }));
  function renderStages() {
    const index = ops.stageIndex(session.doc, session.state.stageId), count = session.doc.stages.length;
    $("mwStageText").textContent = `${index + 1}/${count}`;
    $("mwStage").setAttribute("aria-label", `Stage ${index + 1} of ${count}. Open Stages`);
    const key = JSON.stringify([session.doc.stages.map(stage => [stage.id, stage.elements.length, Boolean(stage.background)]), session.state.stageId]);
    if (key !== stageKey) {
      stageKey = key;
      const list = $("mwStageList");
      const focused = list.contains(document.activeElement);
      list.replaceChildren(...session.doc.stages.map((stage, at) => {
        const item = make("li");
        const button = make("button", "mw-stage-row");
        button.type = "button";
        const current = stage.id === session.state.stageId;
        if (current) button.setAttribute("aria-current", "true");
        const n = stage.elements.length;
        button.append(make("b", "", `Stage ${at + 1}`), make("small", "", `${n ? `${n} element${n === 1 ? "" : "s"}` : "Empty"}${stage.background ? " · own background" : ""}${current ? " · open" : ""}`));
        button.addEventListener("click", () => { if (!current) { $("stageConfirmNo").click(); session.setStage(stage.id); say(`Stage ${at + 1} of ${count} open.`); } });
        item.append(button);
        if (current && focused) requestAnimationFrame(() => button.focus({ preventScroll: true }));
        return item;
      }));
    }
    $("mwStageEarlier").disabled = $("stageLeft").disabled;
    $("mwStageLater").disabled = $("stageRight").disabled;
    $("mwStageDelete").disabled = $("stageDelete").disabled;
    $("mwStageConfirm").hidden = $("stageConfirm").hidden;
    $("mwStageConfirmText").textContent = $("stageConfirmText").textContent;
  }

  // ---- keyboard: the software keyboard must never hide the field being typed in -----------------------------------------------------------------------------
  // The visual viewport shrinks while the keyboard is up; the open sheet is lifted above it (--mw-kb) and the focused field is scrolled into its visible part.
  const vv = window.visualViewport;
  function keyboardChanged() {
    if (!vv) return;
    const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const open = active() && covered > 80;
    document.documentElement.style.setProperty("--mw-kb", `${open ? covered : 0}px`);
    document.documentElement.style.setProperty("--mw-vvh", `${Math.round(vv.height)}px`);
    body.classList.toggle("is-mw-keyboard", open);
    if (open) revealField();
  }
  function revealField() {
    const field = document.activeElement;
    if (!field || !/^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName) || !field.closest(".ed-panel, .mw-sheet")) return;
    setTimeout(() => field.scrollIntoView({ block: "center", inline: "nearest" }), 60);
  }
  vv?.addEventListener("resize", keyboardChanged);
  vv?.addEventListener("scroll", keyboardChanged);
  document.addEventListener("focusin", () => { if (active() && body.classList.contains("is-mw-keyboard")) revealField(); });

  // ---- mode changes (rotation across the phone breakpoint) ----------------------------------------------------------------------------------------------------
  query?.addEventListener?.("change", () => {
    closeOwn();
    body.classList.remove("is-sheet-open", "is-mw-keyboard");
    delete body.dataset.mwSize;
    if (!active() && body.dataset.tool === "props") body.dataset.tool = "add";   // Properties is a sheet only on small screens
    canvas.fit();
    update();
  });

  // ---- one update for everything the shell shows (called with the editor's own chrome update) ---------------------------------------------------------------
  function update() {
    const visible = isWorkspaceVisible();
    const on = active() && visible;
    $("mwTop").hidden = !on;
    $("mwBar").hidden = !on;
    body.classList.toggle("is-mw-editing", on);
    if (!on) { $("mwSelBar").hidden = true; return; }
    // save status IS the Save button's label: "Save" when there is something to save, "Saved" when not
    const status = session.status;
    $("mwSave").textContent = SAVE_LABEL[status] ?? status;
    $("mwSave").dataset.state = status;
    $("mwSave").disabled = $("saveBtn").disabled;
    $("mwSave").setAttribute("aria-label", status === "unsaved" ? "Save. You have unsaved changes" : status === "error" ? "Save failed. Retry save" : `Save status: ${SAVE_LABEL[status] ?? status}`);
    if (lastStatus !== null && status !== lastStatus && SAVE_ANNOUNCE[status]) say(SAVE_ANNOUNCE[status]);
    lastStatus = status;
    $("mwSaveText").textContent = $("saveState").textContent;
    $("mwUndo").disabled = $("undoBtn").disabled;
    $("mwRedo").disabled = $("redoBtn").disabled;
    $("mwPreview").disabled = $("previewBtn").disabled;
    // publishing: shown exactly as the desktop shows it, never changed by anything but Publish / Unpublish
    $("mwPublishText").textContent = $("publishState").hidden ? "Status unavailable" : $("publishState").textContent;
    $("mwPublish").disabled = $("publishBtn").disabled;
    $("mwPublish").textContent = $("publishBtn").textContent;
    $("mwUnpublish").hidden = $("unpublishBtn").hidden;
    $("mwUnpublish").disabled = $("unpublishBtn").disabled;
    $("mwPublicLink").hidden = $("publicLink").hidden;
    if (!$("publicLink").hidden) $("mwPublicLink").href = $("publicLink").href;
    const multi = $("multiBtn").getAttribute("aria-pressed") === "true";
    $("mwMulti").setAttribute("aria-pressed", String(multi));
    $("mwMulti").textContent = multi ? "Multi-select: on" : "Multi-select: off";
    // toolbar state
    const tool = toolSheetOpen() ? body.dataset.tool : null;
    for (const button of document.querySelectorAll("#mwBar [data-mw]")) {
      const name = button.dataset.mw;
      const on = own ? own === name : name === "more" ? MORE_TOOLS.has(tool) : tool === name;
      button.setAttribute("aria-expanded", String(Boolean(on)));
    }
    $("mwStage").setAttribute("aria-expanded", String(own === "stages"));
    $("mwMenuBtn").setAttribute("aria-expanded", String(own === "wall"));
    $("mwDrawerTitle").textContent = TOOL_TITLES[body.dataset.tool] ?? "Tools";
    const propsHead = $("props").querySelector(".mw-sheet-title");
    if (propsHead) propsHead.textContent = $("propsTitle").textContent === "Properties" ? "Edit" : `Edit ${$("propsTitle").textContent}`;
    // a new stage opens fitted
    if (session.state.stageId !== lastStageId) { if (lastStageId !== null) canvas.fit(); lastStageId = session.state.stageId; }
    const selected = selection();
    // another element's Edit sheet starts at its top (its common controls), not where the previous element's panel was scrolled to
    const editKey = session.state.selection.join(",");
    if (editKey !== lastEditKey) { lastEditKey = editKey; $("props").scrollTop = 0; }
    renderSelBar(selected);
    renderLayerActions(selected);
    renderStages();
  }

  zoomChanged({ zoom: 1 });
  return { active, update, toolOpened, closeOwn, zoomChanged, view: { enabled: active, onChange: state => zoomChanged(state) } };
}
