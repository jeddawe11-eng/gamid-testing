// GAME ID WALL - W0 PROTOTYPE - mobile-first editor. THROWAWAY: state lives in memory only ("TEST / NOT SAVED"); nothing touches a backend.
import * as M from "./model.js?v=w0c";
import { createSampleWall } from "./sample.js?v=w0c";
import { ASSETS, BLOCKS, FONT_LABELS, SAMPLE_MEDIA } from "./assets.js?v=w0c";
import { el, css, buildNode, placeBox, renderEditStage, renderWallPage, attachColumnSizing, updateEmbedModes } from "./render.js?v=w0c";
import { EmbedController, activeIframeCount } from "./embeds.js?v=w0c";
import { startDiag } from "./diag.js?v=w0c";
import { createIntroSim } from "./intro-sim.js?v=w0c";

const $ = (selector, root = document) => root.querySelector(selector);
const app = $("#app"), viewport = $("#viewport"), sheetEl = $("#sheet"), toastEl = $("#toast"), diagEl = $("#diag"), dockEl = $("#dock"), stageBar = $("#stagebar"), modeBar = $("#modebar");
const previewRoot = $("#previewRoot"), previewBar = $("#previewBar");

const S = {
  doc: createSampleWall(), stage: 0, sel: [], multi: false, mode: "edit", col: 300, contain: "none", capPx: 640, sheet: null, seamGuides: true, adds: 0,
};
S.hist = new M.History(JSON.stringify(S.doc));
const node = id => S.doc.nodes[id];
const geo = id => M.geoOf(S.doc, id);
const stageDef = () => S.doc.stages[S.stage];
const committed = () => S.hist.stack[S.hist.index];

// ------------------------------------------------------------------------------------------------ feedback
let toastTimer;
function toast(message, kind = "info") {
  toastEl.textContent = message; toastEl.dataset.kind = kind; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5200);
}
const embedMessage = moves => {
  const provider = M.EMBED[node(moves[0].embed).provider].label;
  return `Kept behind the ${provider} player: nothing may be displayed in front of an embedded player. Elements can sit behind it.`;
};

// ------------------------------------------------------------------------------------------------ history
function commit() { S.hist.commit(JSON.stringify(S.doc)); updateChrome(); }
function restore(json) {
  S.doc = JSON.parse(json);
  S.sel = S.sel.filter(id => S.doc.nodes[id] && S.doc.stages[S.stage].children.includes(id));
  renderAll();
}
function undo() { const json = S.hist.undo(); if (json) restore(json); toast(json ? "Undo" : "Nothing to undo"); updateChrome(); }
function redo() { const json = S.hist.redo(); if (json) restore(json); toast(json ? "Redo" : "Nothing to redo"); updateChrome(); }

// Every completed edit ends here: enforce the embed rules, then commit (or revert when two players would overlap).
function finishEdit() {
  const moves = M.enforceEmbedOverlap(S.doc, S.stage);
  if (M.findEmbedEmbedOverlaps(S.doc, S.stage).length) { restore(committed()); toast("Two players can't overlap each other. Change reverted.", "warn"); return -1; }
  commit();
  if (moves.length) { renderEdit(); toast(embedMessage(moves), "warn"); } else renderSelection();
  return moves.length;
}

// ------------------------------------------------------------------------------------------------ rendering
const ctrl = new EmbedController({ getNode: id => S.doc.nodes[id], root: viewport, onChange: () => paintDiag() });

function stageEl() { return viewport.querySelector(".stage"); }

function renderAll() {
  ctrl.closeAll();
  if (S.mode === "overview") renderOverview(); else if (S.mode === "edit") renderEdit();
  updateChrome();
}

function renderEdit() {
  viewport.replaceChildren();
  viewport.className = "viewport is-edit";
  const rect = viewport.getBoundingClientRect(), pad = 26;
  S.col = Math.max(140, Math.floor(Math.min(rect.width - 2 * pad, ((rect.height - 2 * pad) * 9) / 16)));
  const { page, column } = renderEditStage(S.doc, S.stage, { contain: S.contain });
  css(column, { width: `${S.col}px` });
  css(page, { "--uw": `${S.col / M.UNITS_W}px` });
  viewport.append(page);
  updateEmbedModes(page, { live: false });
  renderSelection();
}

function renderOverview() {
  viewport.replaceChildren();
  viewport.className = "viewport is-overview";
  const rect = viewport.getBoundingClientRect();
  const { page, column } = renderWallPage(S.doc, { mode: "overview", live: false, capPx: Math.floor(Math.min(300, rect.width * 0.6)), contain: S.contain });
  page.classList.toggle("show-seams", S.seamGuides);
  viewport.append(page);
  attachColumnSizing(page, column, () => updateEmbedModes(page, { live: false }));
  column.querySelectorAll(".stage").forEach(stage => {
    const index = Number(stage.dataset.stage);
    const label = el("button", "stage-label", `STAGE ${index + 1} - tap to edit`);
    label.type = "button";
    label.addEventListener("click", () => { S.stage = index; S.sel = []; setMode("edit"); });
    stage.append(label);
    stage.append(el("div", "seam-guide"));
  });
}

function renderSelection() {
  const stage = stageEl();
  if (!stage) return;
  stage.querySelector(".sel-layer")?.remove();
  stage.querySelectorAll(".is-selected").forEach(n => n.classList.remove("is-selected"));
  if (S.sel.length) {
    const box = M.unionBox(S.sel.map(id => M.nodeBox(S.doc, id)));
    const layer = el("div", "sel-layer"), frame = el("div", "sel-box");
    placeBox(frame, box);
    if (S.sel.length === 1) {
      for (const corner of ["nw", "ne", "sw", "se"]) { const handle = el("div", "handle"); handle.dataset.corner = corner; frame.append(handle); }
      const only = node(S.sel[0]);
      const tag = only.type === "embed" ? `${M.EMBED[only.provider].label.toUpperCase()} - TOP LAYER ONLY` : only.type === "group" ? "GROUP" : only.type === "block" ? "GAMID BLOCK (one element)" : only.type.toUpperCase();
      frame.append(el("div", "sel-tag", tag));
    } else frame.append(el("div", "sel-tag", `${S.sel.length} SELECTED`));
    layer.append(frame);
    stage.append(layer);
    S.sel.forEach(id => stage.querySelector(`.stage-fg > [data-id="${id}"]`)?.classList.add("is-selected"));
  }
  updateChrome();
  if (S.sheet === "props") renderSheet();
}

function refreshEl(id) {
  const stage = stageEl(), old = stage?.querySelector(`.stage-fg > [data-id="${id}"]`);
  if (!old) return renderEdit();
  const fresh = buildNode(S.doc, id, { live: false });
  fresh.classList.toggle("is-selected", old.classList.contains("is-selected"));
  old.replaceWith(fresh);
  updateEmbedModes(stage, { live: false });
}

function updateGeometry(id) {
  const type = node(id).type, old = stageEl()?.querySelector(`.stage-fg > [data-id="${id}"]`);
  if (old && (type === "image" || type === "embed")) { placeBox(old, geo(id)); updateEmbedModes(stageEl(), { live: false }); } else refreshEl(id);
}

function updateSelBox() {
  const frame = stageEl()?.querySelector(".sel-box");
  if (frame && S.sel.length) placeBox(frame, M.unionBox(S.sel.map(id => M.nodeBox(S.doc, id))));
}

// Text boxes have a fixed frame; after any text/size change the frame height is re-fitted to the rendered text.
function fitText(id) {
  if (node(id).type !== "text") return;
  const stage = stageEl(), t = stage?.querySelector(`.stage-fg > [data-id="${id}"] .t`);
  if (!t) return;
  const upp = M.UNITS_W / stage.getBoundingClientRect().width, g = geo(id);
  g.h = Math.min(Math.max(30, Math.ceil(t.getBoundingClientRect().height * upp) + 6), M.STAGE_H - g.y);
  const wrap = stage.querySelector(`.stage-fg > [data-id="${id}"]`); if (wrap) placeBox(wrap, g);
  updateSelBox();
}

// ------------------------------------------------------------------------------------------------ gestures (Pointer Events; the active stage owns every touch, so there is no scroll-vs-drag ambiguity)
const pointers = new Map();
let gesture = null;
const MOVE_THRESHOLD_PX = 6;

const stageMetrics = () => { const rect = stageEl().getBoundingClientRect(); return { rect, upp: M.UNITS_W / rect.width }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function onDown(event) {
  if (S.mode !== "edit") return;
  const stage = stageEl();
  if (!stage || !stage.contains(event.target)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  try { viewport.setPointerCapture(event.pointerId); } catch { /* not capturable */ }

  if (pointers.size === 2) { if (S.sel.length === 1 && (!gesture || gesture.kind === "move")) startPinch(); return; }
  if (pointers.size > 2) return;

  const handle = event.target.closest(".handle");
  if (handle && S.sel.length === 1) { startResize(handle.dataset.corner, event); return; }

  const target = event.target.closest(".stage-fg > [data-id]");
  if (!target) { if (!S.multi) { S.sel = []; renderSelection(); } return; }
  const id = target.dataset.id;
  let togglePending = false;
  if (S.multi) { if (S.sel.includes(id)) togglePending = true; else S.sel.push(id); } else if (!S.sel.includes(id)) S.sel = [id];
  renderSelection();
  gesture = { kind: "move", pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, moved: false, togglePending, id,
    snaps: S.sel.map(sid => ({ id: sid, x: geo(sid).x, y: geo(sid).y })), box0: M.unionBox(S.sel.map(sid => M.nodeBox(S.doc, sid))) };
}

function onMovePointer(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!gesture) return;
  if (gesture.kind === "pinch") return pinchMove();
  if (event.pointerId !== gesture.pointerId) return;
  const p = pointers.get(event.pointerId);
  if (gesture.kind === "move") {
    if (!gesture.moved && Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) < MOVE_THRESHOLD_PX) return;   // accidental-movement guard
    if (!gesture.moved) { gesture.moved = true; stageEl().classList.add("is-dragging"); }
    const { upp } = stageMetrics();
    const { dx, dy } = M.clampMove(gesture.box0, (p.x - gesture.start.x) * upp, (p.y - gesture.start.y) * upp);   // HARD containment inside the stage
    for (const snap of gesture.snaps) {
      const g = geo(snap.id); g.x = snap.x + dx; g.y = snap.y + dy;
      const target = stageEl().querySelector(`.stage-fg > [data-id="${snap.id}"]`); if (target) css(target, { left: `calc(var(--u) * ${g.x})`, top: `calc(var(--u) * ${g.y})` });
    }
    updateSelBox();
  } else if (gesture.kind === "resize") {
    const { rect } = stageMetrics();
    const anchorPx = { x: rect.left + (gesture.anchor.x / M.UNITS_W) * rect.width, y: rect.top + (gesture.anchor.y / M.UNITS_W) * rect.width };
    scaleTo(gesture, Math.max(0.0001, dist(p, anchorPx) / gesture.d0));
  }
}

function onUpPointer(event) {
  pointers.delete(event.pointerId);
  if (!gesture) return;
  if (gesture.kind === "pinch") { if (pointers.size < 2) { const g = gesture; gesture = null; stageEl()?.classList.remove("is-dragging"); if (g.changed) finishEdit(); } return; }
  if (event.pointerId !== gesture.pointerId) return;
  const g = gesture; gesture = null;
  stageEl()?.classList.remove("is-dragging");
  if (g.kind === "move" && !g.moved) { if (g.togglePending) S.sel = S.sel.filter(id => id !== g.id); renderSelection(); return; }
  finishEdit();
}

function scaleTo(g, wanted) {
  let f = Math.min(Math.max(wanted, g.range.min), g.range.max);
  f = Math.min(f, M.fitFactorWithinStage(g.box, g.anchor, f));
  const result = M.scaledNode(g.snapNode, g.snapGeo, f, g.anchor);
  S.doc.nodes[g.id] = result.content; S.doc.layouts[M.LAYOUT][g.id] = result.geo;
  g.changed = true;
  updateGeometry(g.id); updateSelBox();
}

function startResize(corner, event) {
  const id = S.sel[0], box = M.nodeBox(S.doc, id);
  const anchor = { nw: { x: box.x + box.w, y: box.y + box.h }, ne: { x: box.x, y: box.y + box.h }, sw: { x: box.x + box.w, y: box.y }, se: { x: box.x, y: box.y } }[corner];
  const { rect } = stageMetrics();
  const px = point => ({ x: rect.left + (point.x / M.UNITS_W) * rect.width, y: rect.top + (point.y / M.UNITS_W) * rect.width });
  const cornerPoint = { nw: { x: box.x, y: box.y }, ne: { x: box.x + box.w, y: box.y }, sw: { x: box.x, y: box.y + box.h }, se: { x: box.x + box.w, y: box.y + box.h } }[corner];
  gesture = { kind: "resize", pointerId: event.pointerId, id, corner, anchor, box, range: M.factorRange(S.doc, id), snapNode: JSON.parse(JSON.stringify(node(id))), snapGeo: { ...geo(id) }, d0: Math.max(1, dist(px(cornerPoint), px(anchor))), changed: false };
  stageEl().classList.add("is-dragging");
}

function startPinch() {
  const id = S.sel[0], box = M.nodeBox(S.doc, id), [a, b] = [...pointers.values()];
  const carried = gesture?.kind === "move" && gesture.moved;   // a drag already in progress stays part of the same edit
  gesture = { kind: "pinch", id, box, anchor: { x: box.x + box.w / 2, y: box.y + box.h / 2 }, range: M.factorRange(S.doc, id), snapNode: JSON.parse(JSON.stringify(node(id))), snapGeo: { ...geo(id) }, d0: Math.max(1, dist(a, b)), changed: carried };
  stageEl().classList.add("is-dragging");
}
function pinchMove() { const [a, b] = [...pointers.values()]; if (a && b) scaleTo(gesture, dist(a, b) / gesture.d0); }

viewport.addEventListener("pointerdown", onDown);
viewport.addEventListener("pointermove", onMovePointer);
viewport.addEventListener("pointerup", onUpPointer);
viewport.addEventListener("pointercancel", onUpPointer);

// ------------------------------------------------------------------------------------------------ actions
const hasSel = () => S.sel.length > 0;
const single = () => (S.sel.length === 1 ? node(S.sel[0]) : null);

function groupSelected() {
  const result = M.groupNodes(S.doc, S.stage, S.sel);
  if (result.error) { toast(result.error === "NEED_TWO_ELEMENTS" ? "Select two or more elements (turn on Multi, then tap them)." : "Nested groups are not part of W0. Ungroup first.", "warn"); return; }
  S.sel = [result.groupId];
  if (finishEdit() === 0) { renderEdit(); toast("Grouped: move and resize as one. Ungroup restores the elements."); }
}
function ungroupSelected() {
  const only = single();
  if (!only || only.type !== "group") return;
  const result = M.ungroupNode(S.doc, S.stage, S.sel[0]);
  S.sel = result.released.slice();
  if (finishEdit() === 0) { renderEdit(); toast("Ungrouped: elements are independent again."); }
}
function deleteSelected() {
  if (!hasSel()) return;
  for (const id of S.sel) {
    const item = node(id);
    if (item.type === "group") for (const childId of item.children) { delete S.doc.nodes[childId]; delete S.doc.layouts[M.LAYOUT][childId]; }
    delete S.doc.nodes[id]; delete S.doc.layouts[M.LAYOUT][id];
    stageDef().children = stageDef().children.filter(x => x !== id);
  }
  S.sel = []; commit(); renderEdit(); toast("Deleted");
}
function layer(kind) {
  if (!hasSel()) return;
  if (kind === "fwd") M.bringForward(S.doc, S.stage, S.sel); else if (kind === "back") M.sendBackward(S.doc, S.stage, S.sel);
  else if (kind === "front") M.bringToFront(S.doc, S.stage, S.sel); else M.sendToBack(S.doc, S.stage, S.sel);
  const moves = M.enforceEmbedOverlap(S.doc, S.stage);
  commit(); renderEdit();
  toast(moves.length ? embedMessage(moves) : `Layer: ${{ fwd: "brought forward", back: "sent back", front: "brought to front", backmost: "sent to back" }[kind]}`, moves.length ? "warn" : "info");
  if (S.sheet === "layers") renderSheet();
}
function moveSelectedTo(index) {
  const result = M.moveToStage(S.doc, S.stage, S.sel, index);
  if (result.error) { toast("Pick a different stage.", "warn"); return; }
  const moves = M.enforceEmbedOverlap(S.doc, index);
  const ee = M.findEmbedEmbedOverlaps(S.doc, index);
  if (ee.length) { restore(committed()); toast("That would overlap another player on the target stage. Move reverted.", "warn"); return; }
  S.sel = []; commit(); renderEdit(); closeSheet();
  toast(`Moved to Stage ${index + 1}. Elements never cross a stage boundary.` + (moves.length ? " " + embedMessage(moves) : ""));
}

function addAt(content, w, h) {
  const x = Math.round((M.UNITS_W - w) / 2), y0 = Math.round((M.STAGE_H - h) / 2 + (S.adds % 5) * 34 - 68);
  const place = y => ({ x, y: M.clamp(y, 0, M.STAGE_H - h), w, h });
  let y = y0, id;
  const isEmbed = content.type === "embed";
  id = M.addNode(S.doc, S.stage, content, place(y));
  // a new player may not overlap another player: slide it down until it fits
  while (isEmbed && M.findEmbedEmbedOverlaps(S.doc, S.stage).length && y + h < M.STAGE_H) { y += 60; S.doc.layouts[M.LAYOUT][id] = place(y); }
  if (isEmbed && M.findEmbedEmbedOverlaps(S.doc, S.stage).length) { delete S.doc.nodes[id]; delete S.doc.layouts[M.LAYOUT][id]; stageDef().children.pop(); toast("No free space for another player on this stage.", "warn"); return; }
  S.adds += 1; S.sel = [id];
  const corrected = finishEdit();
  if (corrected < 0) { S.sel = []; renderEdit(); closeSheet(); return; }
  renderEdit();
  if (corrected === 0) toast(isEmbed ? "Added a facade. It becomes a real player only in Preview, after a tap." : "Added");
  closeSheet();
}

const adders = {
  text: () => addAt(M.sanitizeText({ text: "NEW TEXT", font: "orbitron", size: 130, gradient: { a: "#38e3ff", b: "#ff4fd8", angle: 100 }, glow: { color: "#38e3ff", radius: 24 } }), 800, 160),
  photo: () => addAt({ type: "image", asset: "photo", alt: ASSETS.photo.alt, opacity: 1 }, 520, Math.round((520 * ASSETS.photo.h) / ASSETS.photo.w)),
  character: () => addAt({ type: "image", asset: "character", alt: ASSETS.character.alt, opacity: 1 }, 420, Math.round((420 * ASSETS.character.h) / ASSETS.character.w)),
  frame: () => addAt({ type: "image", asset: "frame", alt: ASSETS.frame.alt, opacity: 1 }, 700, Math.round((700 * ASSETS.frame.h) / ASSETS.frame.w)),
  rank: () => addAt({ type: "block", block: "league.rank", variant: "standard" }, 560, 230),
  identity: () => addAt({ type: "block", block: "identity.card", variant: "standard" }, 620, 240),
  youtube: () => addAt({ type: "embed", ...SAMPLE_MEDIA.youtube, aspect: "16:9", variant: "standard" }, 640, 360),
  spotifyPlaylist: () => addAt({ type: "embed", ...SAMPLE_MEDIA.spotifyPlaylist, aspect: "16:9", variant: "standard" }, 640, Math.round(640 * M.EMBED.spotify.variants.standard)),
  spotifyTrack: () => addAt({ type: "embed", ...SAMPLE_MEDIA.spotifyTrack, aspect: "16:9", variant: "compact" }, 720, Math.round(720 * M.EMBED.spotify.variants.compact)),
};

// ------------------------------------------------------------------------------------------------ sheets (property panels)
function field(label, ...controls) { const row = el("div", "row"); row.append(el("label", "", label), ...controls); return row; }
function range(min, max, step, value, onInput, onChange) {
  const input = el("input"); input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
  const out = el("output", "", String(Math.round(Number(value) * 100) / 100));
  input.addEventListener("input", () => { out.textContent = String(Math.round(Number(input.value) * 100) / 100); onInput(Number(input.value)); });
  input.addEventListener("change", () => onChange?.());
  const wrap = el("span", "rangebox"); wrap.append(input, out); return wrap;
}
function colorInput(value, onInput, onChange) { const input = el("input"); input.type = "color"; input.value = value; input.addEventListener("input", () => onInput(input.value)); input.addEventListener("change", () => onChange?.()); return input; }
function checkbox(checked, onChange) { const input = el("input"); input.type = "checkbox"; input.checked = checked; input.addEventListener("change", () => onChange(input.checked)); return input; }
function select(options, value, onChange) { const input = el("select"); for (const [key, label] of options) { const o = el("option", "", label); o.value = key; input.append(o); } input.value = value; input.addEventListener("change", () => onChange(input.value)); return input; }
function button(label, onClick, cls = "") { const b = el("button", `sbtn ${cls}`, label); b.type = "button"; b.addEventListener("click", onClick); return b; }
function segment(options, current, onPick) { const wrap = el("span", "seg"); for (const [key, label] of options) { const b = button(label, () => onPick(key), key === current ? "on" : ""); wrap.append(b); } return wrap; }

function textUpdate(mutate, done) {
  const id = S.sel[0], next = JSON.parse(JSON.stringify(node(id)));
  mutate(next);
  S.doc.nodes[id] = M.sanitizeText(next);
  refreshEl(id); fitText(id);
  if (done) finishEdit();
}

function textPanel(id) {
  const n = node(id), panel = el("div", "panel");
  const area = el("textarea"); area.value = n.text; area.rows = 2; area.maxLength = M.TEXT_LIMITS.chars;
  area.addEventListener("input", () => textUpdate(t => { t.text = area.value; }, false));
  area.addEventListener("change", () => finishEdit());
  panel.append(field("Text", area));
  panel.append(field("Font", select(M.FONT_KEYS.map(k => [k, FONT_LABELS[k]]), n.font, v => textUpdate(t => { t.font = v; }, true))));
  panel.append(field("Size", range(24, 420, 1, Math.round(n.size), v => textUpdate(t => { t.size = v; }, false), () => finishEdit())));
  panel.append(field("Color", colorInput(n.color, v => textUpdate(t => { t.color = v; }, false), () => finishEdit())));
  panel.append(field("Align", segment([["left", "Left"], ["center", "Center"], ["right", "Right"]], n.align, v => textUpdate(t => { t.align = v; }, true))));
  const g = n.gradient, o = n.outline, s = n.shadow, gl = n.glow;
  panel.append(field("Gradient", checkbox(!!g, on => { textUpdate(t => { t.gradient = on ? { a: "#ff4fd8", b: "#38e3ff", angle: 100 } : null; }, true); renderSheet(); })));
  if (g) { panel.append(field(" from", colorInput(g.a, v => textUpdate(t => { t.gradient.a = v; }, false), () => finishEdit()))); panel.append(field(" to", colorInput(g.b, v => textUpdate(t => { t.gradient.b = v; }, false), () => finishEdit()))); panel.append(field(" angle", range(0, 360, 5, g.angle, v => textUpdate(t => { t.gradient.angle = v; }, false), () => finishEdit()))); }
  panel.append(field("Outline", checkbox(!!o, on => { textUpdate(t => { t.outline = on ? { color: "#ff4fd8", width: 3 } : null; }, true); renderSheet(); })));
  if (o) { panel.append(field(" color", colorInput(o.color, v => textUpdate(t => { t.outline.color = v; }, false), () => finishEdit()))); panel.append(field(" width", range(0, 14, 0.5, o.width, v => textUpdate(t => { t.outline.width = v; }, false), () => finishEdit()))); }
  panel.append(field("Shadow", checkbox(!!s, on => { textUpdate(t => { t.shadow = on ? { color: "#000000", x: 0, y: 8, blur: 12 } : null; }, true); renderSheet(); })));
  if (s) { panel.append(field(" color", colorInput(s.color, v => textUpdate(t => { t.shadow.color = v; }, false), () => finishEdit()))); panel.append(field(" blur", range(0, 40, 1, s.blur, v => textUpdate(t => { t.shadow.blur = v; }, false), () => finishEdit()))); panel.append(field(" offset y", range(-30, 30, 1, s.y, v => textUpdate(t => { t.shadow.y = v; }, false), () => finishEdit()))); }
  panel.append(field("Glow", checkbox(!!gl, on => { textUpdate(t => { t.glow = on ? { color: "#38e3ff", radius: 30 } : null; }, true); renderSheet(); })));
  if (gl) { panel.append(field(" color", colorInput(gl.color, v => textUpdate(t => { t.glow.color = v; }, false), () => finishEdit()))); panel.append(field(" radius", range(0, 60, 1, gl.radius, v => textUpdate(t => { t.glow.radius = v; }, false), () => finishEdit()))); }
  panel.append(el("p", "note", "Bounded styling only: no arbitrary CSS. Try glow / shadow near the top and bottom edges of a stage to see whether seams clip them."));
  return panel;
}

function imagePanel(id) {
  const n = node(id), panel = el("div", "panel");
  panel.append(field("Image", select(Object.keys(ASSETS).filter(k => !["wallArt", "stageAlt"].includes(k)).map(k => [k, k]), n.asset, v => { S.doc.nodes[id] = { ...n, asset: v, alt: ASSETS[v].alt }; refreshEl(id); finishEdit(); })));
  panel.append(field("Opacity", range(0.1, 1, 0.05, n.opacity ?? 1, v => { S.doc.nodes[id] = { ...node(id), opacity: v }; refreshEl(id); }, () => finishEdit())));
  panel.append(el("p", "note", "Use Forward / Back to layer it behind or in front of text. The transparent character shows the text through its empty areas."));
  return panel;
}

function blockPanel(id) {
  const n = node(id), panel = el("div", "panel");
  panel.append(field("Block", select(Object.entries(BLOCKS).map(([k, b]) => [k, b.label]), n.block, v => { const g = geo(id); S.doc.nodes[id] = { ...n, block: v }; g.h = Math.round((g.w * BLOCKS[v].h) / BLOCKS[v].w); refreshEl(id); finishEdit(); })));
  panel.append(el("p", "note", "A GamID block is ONE logical element with FAKE sample data. It scales as a whole and cannot be exploded. It carries a mandatory provenance chip."));
  return panel;
}

function setEmbedWidth(id, widthUnits) {
  const n = node(id), g = geo(id), aspect = M.embedAspect(n);
  const w = Math.max(widthUnits, M.embedMinWidthUnits(n)), h = aspect ? w / aspect : g.h;
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  g.w = Math.min(w, M.UNITS_W); g.h = Math.min(h, M.STAGE_H);
  g.x = M.clamp(cx - g.w / 2, 0, M.UNITS_W - g.w); g.y = M.clamp(cy - g.h / 2, 0, M.STAGE_H - g.h);
  updateGeometry(id); updateSelBox();
}

function embedPanel(id) {
  const n = node(id), g = geo(id), panel = el("div", "panel");
  panel.append(el("p", "info", `${M.EMBED[n.provider].label} ${n.kind}  -  ${Math.round(g.w)} x ${Math.round(g.h)} units`));
  if (n.provider === "youtube") {
    const aspect = M.embedAspect(n), need = col => Math.ceil(M.youtubeInlineMinUnits(col, aspect));
    panel.append(el("p", "info", `Inline needs >= 200x200 CSS px: at least ${need(360)} units wide on a 360 px phone, ${need(412)} on 412, ${need(640)} on a 640 px desktop column. Smaller stays a tile and a tap opens a larger in-page player.`));
    panel.append(field("Size", segment([["large", "Full width"], ["medium", "Medium"], ["small", "Small tile"]], "", v => { setEmbedWidth(id, { large: 1000, medium: 560, small: 350 }[v]); finishEdit(); renderSheet(); })));
    panel.append(field("Aspect", segment([["16:9", "16:9"], ["9:16", "9:16"], ["1:1", "1:1"]], n.aspect, v => { S.doc.nodes[id] = { ...n, aspect: v }; setEmbedWidth(id, v === "9:16" ? 340 : g.w); finishEdit(); renderSheet(); })));
  } else {
    panel.append(field("Variant", segment([["compact", "Compact"], ["standard", "Standard"], ["free", "Free (lab)"]], n.variant, v => { S.doc.nodes[id] = { ...n, variant: v }; setEmbedWidth(id, geo(id).w); finishEdit(); renderSheet(); })));
    panel.append(field("Width", segment([["900", "Wide"], ["640", "Medium"], ["420", "Narrow"], ["300", "Tiny"]], "", v => { setEmbedWidth(id, Number(v)); finishEdit(); renderSheet(); })));
    if (n.variant === "free") panel.append(field("Height", range(60, 900, 5, Math.round(g.h), v => { g.h = Math.min(v, M.STAGE_H - g.y); updateGeometry(id); updateSelBox(); }, () => finishEdit())));
    panel.append(el("p", "info", `Spotify documents no minimum or maximum size: W0 measures it. Editor floor is only a ${M.EMBED.spotify.labFloorPx}px tap target.`));
  }
  panel.append(field("Real player", button("Preview / Interact", () => { ctrl.open(id, { forceOverlay: true }); }, "primary")));
  panel.append(el("p", "note", "Edit mode never loads a real third-party player. Preview / Interact opens a temporary overlay and destroys it on close. Elements can sit behind an embed; the editor keeps anything from staying in front of it. The public Close player button sits outside the player, just below it, so leave free space there."));
  return panel;
}

function groupPanel(id) {
  const g = geo(id), panel = el("div", "panel");
  panel.append(el("p", "info", `Group of ${node(id).children.length}  -  uniform scale ${g.s.toFixed(2)}`));
  panel.append(field("", button("Ungroup", ungroupSelected, "primary")));
  panel.append(el("p", "note", "Drag the group, or its corner handles to resize uniformly. Groups are stage-local and do not nest in W0."));
  return panel;
}

const labelOf = id => { const n = node(id); return n.type === "text" ? `Text "${n.text.slice(0, 16)}"` : n.type === "image" ? `Image ${n.asset}` : n.type === "block" ? `Block ${n.block}` : n.type === "embed" ? `${M.EMBED[n.provider].label} ${n.kind}` : `Group (${n.children.length})`; };

function layersPanel() {
  const panel = el("div", "panel");
  panel.append(el("p", "info", `Stage ${S.stage + 1} layers (top first). Tap to select.`));
  const list = el("div", "layerlist");
  [...stageDef().children].reverse().forEach(id => { const b = button(labelOf(id), () => { S.sel = [id]; renderSelection(); renderSheet(); }, S.sel.includes(id) ? "on" : ""); list.append(b); });
  panel.append(list);
  panel.append(field("Order", segment([["front", "To front"], ["fwd", "Forward"], ["back", "Back"], ["backmost", "To back"]], "", layer)));
  return panel;
}

function movePanel() {
  const panel = el("div", "panel");
  panel.append(el("p", "info", "Elements never cross a stage boundary. Move sends the selection to the top of another stage."));
  panel.append(field("Move to", segment(S.doc.stages.map((_, i) => [String(i), `Stage ${i + 1}`]).filter(([i]) => Number(i) !== S.stage), "", v => moveSelectedTo(Number(v)))));
  return panel;
}

const PRESETS = {
  violet: [["#070512", 0], ["#1a0b3d", 16], ["#3a0f5e", 30], ["#12203f", 45], ["#0a3c52", 58], ["#2a0d48", 74], ["#0c0716", 100]],
  ember: [["#0d0503", 0], ["#3a1206", 30], ["#7a2a0a", 55], ["#2a0c14", 80], ["#0a0304", 100]],
};
function bgPanel() {
  const panel = el("div", "panel"), bg = S.doc.background, def = stageDef();
  panel.append(el("h4", "", "Continuous Wall background"));
  panel.append(field("Gradient", segment([["violet", "Violet night"], ["ember", "Ember"]], bg.base.stops.length === 7 ? "violet" : "ember", v => { bg.base = { angle: 180, stops: PRESETS[v] }; commit(); renderAll(); })));
  panel.append(field("Art", segment([["on", "On"], ["off", "Off"]], bg.art.enabled ? "on" : "off", v => { bg.art.enabled = v === "on"; commit(); renderAll(); })));
  panel.append(field("Art fit", segment([["cover", "Cover"], ["fit-width", "Fit width"]], bg.art.mode, v => { bg.art.mode = v; commit(); renderAll(); })));
  panel.append(el("h4", "", `Stage ${S.stage + 1} background`));
  const mode = def.background.mode === "inherit" ? "inherit" : def.background.kind;
  panel.append(field("This stage", segment([["inherit", "Inherit Wall"], ["art", "Own art"], ["gradient", "Own gradient"]], mode, v => {
    def.background = v === "inherit" ? { mode: "inherit" } : v === "art" ? { mode: "own", kind: "art", asset: "stageAlt" } : { mode: "own", kind: "gradient", base: { angle: 160, stops: [["#0b1f2e", 0], ["#0f4c5c", 50], ["#08141c", 100]] } };
    commit(); renderAll();
  })));
  panel.append(el("h4", "", "Seam containment (W0 diagnostic)"));
  panel.append(field("Stages", segment([["none", "None"], ["clip", "Clip"], ["paint", "Paint"], ["cv", "Skip offscreen"]], S.contain, v => { S.contain = v; renderAll(); toast(`Containment: ${v}. Look at the glow near the stage edges (Overview / Preview show the seams).`); })));
  panel.append(el("p", "note", "None: effects may overflow into the neighbour stage. Clip / Paint: contained (glow is cut at the edge). Skip offscreen: content-visibility:auto."));
  return panel;
}

function morePanel() {
  const panel = el("div", "panel");
  panel.append(field("Diagnostics", button(diagEl.hidden ? "Show" : "Hide", () => { diagEl.hidden = !diagEl.hidden; renderSheet(); paintDiag(); })));
  panel.append(field("Seam guides (overview)", button(S.seamGuides ? "On" : "Off", () => { S.seamGuides = !S.seamGuides; renderSheet(); if (S.mode === "overview") renderOverview(); })));
  panel.append(field("Hosting tests", button("Send this Wall to hosting-test pages", () => { try { localStorage.setItem("gamid.w0.wall", JSON.stringify(S.doc)); toast("Saved to THIS browser only (localStorage) for the hosting / viewport pages. Not a real save."); } catch { toast("Browser storage is unavailable.", "warn"); } })));
  panel.append(field("Reset", button("Reset to sample Wall", () => { S.doc = createSampleWall(); S.sel = []; S.hist = new M.History(JSON.stringify(S.doc)); renderAll(); toast("Sample Wall restored"); })));
  panel.append(field("Prototype hub", el("a", "sbtn", "Open hub")));
  panel.lastChild.lastChild.href = "index.html";
  return panel;
}

function addPanel() {
  const panel = el("div", "panel"), grid = el("div", "addgrid");
  const items = [["Text", "text"], ["Photo", "photo"], ["Transparent character", "character"], ["Frame", "frame"], ["GamID rank block", "rank"], ["GamID identity block", "identity"], ["YouTube", "youtube"], ["Spotify playlist", "spotifyPlaylist"], ["Spotify track", "spotifyTrack"]];
  for (const [label, key] of items) grid.append(button(label, adders[key]));
  panel.append(grid);
  panel.append(el("p", "note", "Sample content only. YouTube / Spotify use hard-coded sample resources; no URL can be entered in W0."));
  return panel;
}

function propsPanel() {
  const only = single();
  if (!only) { const p = el("div", "panel"); p.append(el("p", "info", hasSel() ? "Select ONE element to edit its properties." : "Tap an element first.")); return p; }
  const id = S.sel[0];
  return { text: textPanel, image: imagePanel, block: blockPanel, embed: embedPanel, group: groupPanel }[only.type](id);
}

const SHEETS = { add: ["Add", addPanel], props: ["Properties", propsPanel], layers: ["Layers", layersPanel], move: ["Move to stage", movePanel], bg: ["Backgrounds", bgPanel], more: ["More", morePanel] };
function renderSheet() {
  if (!S.sheet) { sheetEl.hidden = true; return; }
  const [title, build] = SHEETS[S.sheet];
  sheetEl.replaceChildren();
  const head = el("div", "sheet-head"); head.append(el("strong", "", title), button("Close", closeSheet, "small"));
  sheetEl.append(head, build());
  sheetEl.hidden = false;
}
function toggleSheet(name) { if (S.sheet === name) closeSheet(); else { S.sheet = name; renderSheet(); } updateChrome(); }
function closeSheet() { S.sheet = null; sheetEl.hidden = true; updateChrome(); }

// ------------------------------------------------------------------------------------------------ chrome: mode bar, stage bar, dock
const DOCK = [
  { id: "add", label: "Add", run: () => toggleSheet("add") },
  { id: "multi", label: "Multi", toggle: () => S.multi, run: () => { S.multi = !S.multi; if (!S.multi && S.sel.length > 1) S.sel = [S.sel[0]]; renderSelection(); toast(S.multi ? "Multi-select ON: tap elements to add / remove" : "Multi-select off"); } },
  { id: "group", label: "Group", run: groupSelected, enabled: () => S.sel.length >= 2 },
  { id: "ungroup", label: "Ungroup", run: ungroupSelected, enabled: () => single()?.type === "group" },
  { id: "fwd", label: "Forward", run: () => layer("fwd"), enabled: hasSel },
  { id: "back", label: "Back", run: () => layer("back"), enabled: hasSel },
  { id: "layers", label: "Layers", run: () => toggleSheet("layers") },
  { id: "move", label: "Move to", run: () => toggleSheet("move"), enabled: hasSel },
  { id: "props", label: "Props", run: () => toggleSheet("props"), enabled: hasSel },
  { id: "delete", label: "Delete", run: deleteSelected, enabled: hasSel },
  { id: "undo", label: "Undo", run: undo, enabled: () => S.hist.canUndo },
  { id: "redo", label: "Redo", run: redo, enabled: () => S.hist.canRedo },
];
function buildChrome() {
  for (const item of DOCK) { const b = el("button", "dbtn", item.label); b.type = "button"; b.dataset.id = item.id; b.addEventListener("click", item.run); dockEl.append(b); }
  for (const [mode, label] of [["edit", "Edit"], ["overview", "Overview"], ["preview", "Preview"]]) { const b = el("button", "mbtn", label); b.type = "button"; b.dataset.mode = mode; b.addEventListener("click", () => setMode(mode)); modeBar.append(b); }
  S.doc.stages.forEach((_, i) => { const b = el("button", "stbtn", String(i + 1)); b.type = "button"; b.dataset.stage = String(i); b.setAttribute("aria-label", `Stage ${i + 1}`); b.addEventListener("click", () => { if (S.mode !== "edit") { S.stage = i; S.sel = []; setMode("edit"); return; } if (S.stage === i) return; S.stage = i; S.sel = []; closeSheet(); renderEdit(); }); stageBar.append(b); });
  const bg = el("button", "sbtn small", "Backgrounds"); bg.type = "button"; bg.addEventListener("click", () => toggleSheet("bg")); stageBar.append(bg);
  const more = el("button", "sbtn small", "More"); more.type = "button"; more.addEventListener("click", () => toggleSheet("more")); stageBar.append(more);
}
function updateChrome() {
  dockEl.querySelectorAll(".dbtn").forEach(b => { const item = DOCK.find(d => d.id === b.dataset.id); b.disabled = item.enabled ? !item.enabled() : false; b.classList.toggle("on", item.toggle ? item.toggle() : S.sheet === item.id); });
  modeBar.querySelectorAll(".mbtn").forEach(b => b.classList.toggle("on", b.dataset.mode === S.mode));
  stageBar.querySelectorAll(".stbtn").forEach(b => b.classList.toggle("on", S.mode === "edit" && Number(b.dataset.stage) === S.stage));
  $("#stageLabel").textContent = S.mode === "edit" ? `Editing Stage ${S.stage + 1} of ${S.doc.stages.length}` : S.mode === "overview" ? "Wall overview (read-only)" : "Visitor preview";
  dockEl.hidden = S.mode !== "edit";
}

function setMode(mode) {
  if (mode === S.mode) return;
  if (S.mode === "preview") exitPreview(false);
  closeSheet(); ctrl.closeAll();
  S.mode = mode;
  document.body.dataset.mode = mode;
  if (mode === "preview") { enterPreview(); return; }
  app.hidden = false; previewRoot.hidden = true; previewBar.hidden = true;
  renderAll();
}

// ------------------------------------------------------------------------------------------------ visitor-style PREVIEW (normal page scroll; real players after a tap)
let previewCtrl = null, previewIntro = null, previewDispose = null;
function enterPreview() {
  app.hidden = true; previewRoot.hidden = false; previewBar.hidden = false;
  document.body.classList.add("is-preview");
  previewCtrl = new EmbedController({ getNode: id => S.doc.nodes[id], root: previewRoot, onChange: () => paintDiag() });
  const { page, column } = renderWallPage(S.doc, { mode: "view", live: true, capPx: S.capPx, contain: S.contain, embeds: previewCtrl });
  const end = el("div", "preview-end"), back = el("button", "pbtn primary", "Back to editor"); back.type = "button"; back.addEventListener("click", () => setMode("edit")); end.append(back);
  previewRoot.replaceChildren(page, end);
  previewDispose = attachColumnSizing(page, column, () => updateEmbedModes(page, { live: true }));
  previewIntro = createIntroSim({ onState: () => paintDiag() });
  window.scrollTo(0, 0);
  updateChrome();
}
function exitPreview(rerender = true) {
  previewCtrl?.closeAll(); previewCtrl = null;
  previewDispose?.(); previewDispose = null; previewIntro = null;
  document.querySelector(".intro-sim")?.remove();
  document.documentElement.classList.remove("w0-lock");
  document.body.classList.remove("is-preview");
  previewRoot.replaceChildren(); previewRoot.hidden = true; previewBar.hidden = true;
  app.hidden = false;
  if (rerender) { S.mode = "edit"; document.body.dataset.mode = "edit"; renderAll(); }
}
function buildPreviewBar() {
  const exit = el("button", "pbtn primary", "Exit preview"); exit.type = "button"; exit.addEventListener("click", () => setMode("edit"));
  previewBar.append(exit, el("span", "plabel", "Desktop column:"));
  for (const px of [560, 640, 720, 0]) {
    const b = el("button", "pbtn", px ? `${px}` : "Full"); b.type = "button";
    b.addEventListener("click", () => { S.capPx = px || 4000; previewRoot.querySelector(".wall-page")?.style.setProperty("--cap", `${S.capPx}px`); previewBar.querySelectorAll(".pbtn.cap").forEach(x => x.classList.toggle("on", x === b)); });
    b.classList.add("cap"); if ((px || 4000) === S.capPx) b.classList.add("on");
    previewBar.append(b);
  }
  const intro = el("button", "pbtn", "Play simulated Intro"); intro.type = "button"; intro.addEventListener("click", () => previewIntro?.play()); previewBar.append(intro);
  const diag = el("button", "pbtn", "Diag"); diag.type = "button"; diag.addEventListener("click", () => { diagEl.hidden = !diagEl.hidden; paintDiag(); }); previewBar.append(diag);
}

// ------------------------------------------------------------------------------------------------ diagnostics
let diagHandle = null;
function paintDiag() { diagHandle?.paint(); }
function collectDiag() {
  const stage = document.querySelector(".stage"), width = stage ? stage.getBoundingClientRect().width : 0;
  const column = document.querySelector(".wall-column"), colPx = column ? column.getBoundingClientRect().width : 0;
  const summary = (previewCtrl || ctrl).summary();
  return {
    mode: S.mode, "stage": S.mode === "edit" ? `${S.stage + 1} of ${S.doc.stages.length}` : "all",
    "column": `${Math.round(colPx || width)} px`, "unit scale": `${((colPx || width) / M.UNITS_W).toFixed(4)} px per unit`,
    nodes: `${Object.keys(S.doc.nodes).length}  (per stage ${S.doc.stages.map(s => s.children.length).join(" / ")})`,
    "iframes": `${activeIframeCount()} live  (active players: ${summary.active} ${JSON.stringify(summary.byProvider)})`,
    "desktop col": S.mode === "preview" ? `${S.capPx >= 4000 ? "full" : S.capPx + " px"} candidate` : "n/a",
    contain: S.contain, selected: S.sel.length ? S.sel.join(",") : "-",
  };
}

// ------------------------------------------------------------------------------------------------ keyboard (desktop convenience for testing)
document.addEventListener("keydown", event => {
  if (S.mode !== "edit" || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
  else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); }
  else if (event.key === "Escape") { if (S.sheet) closeSheet(); else { S.sel = []; renderSelection(); } }
});

// ------------------------------------------------------------------------------------------------ boot
buildChrome();
buildPreviewBar();
diagHandle = startDiag(diagEl, collectDiag, 1000);
const query = new URLSearchParams(location.search);
if (query.has("stage")) S.stage = M.clampStageIndex(Number(query.get("stage")) - 1, S.doc.stages.length);
if (query.get("contain")) S.contain = query.get("contain");
let resizeTimer;
new ResizeObserver(() => { if (S.mode !== "edit" && S.mode !== "overview") return; clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!gesture) renderAll(); }, 120); }).observe(viewport);
requestAnimationFrame(() => {
  const start = query.get("mode");
  if (start === "preview") { S.mode = "edit"; setMode("preview"); } else { if (start === "overview") S.mode = "overview"; renderAll(); }
  document.body.dataset.mode = S.mode;
  if (query.get("sheet") && SHEETS[query.get("sheet")]) { S.sheet = query.get("sheet"); renderSheet(); }
  if (query.get("diag") === "1") { diagEl.hidden = false; paintDiag(); }
  updateChrome();
});

// test hook: lets the automated browser checks inspect state without changing behaviour
window.__w0 = { S, M, ctrl, get gesture() { return gesture; }, renderAll, setMode, groupSelected, ungroupSelected, layer, moveSelectedTo, adders, undo, redo };
