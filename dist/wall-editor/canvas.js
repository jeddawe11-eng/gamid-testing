// The Wall canvas: paints the current stage through the real W1 render pipeline, draws the selection overlay, and turns pointer/touch gestures into pure
// editing operations (ops.js). Every gesture is a function of (document at gesture start, total pointer delta): the live preview is computed the same way as
// the committed result, and the session is only touched once, on release - so one gesture is one undo step, and a cancelled gesture changes nothing.
//
// Real-device lessons kept from the W0 prototype (Samsung / Chrome):
//   - touch-action:none on the stage so a drag never fights page scroll (the stage is fitted to the screen, so it never needs to scroll);
//   - hard containment at the stage edges (in ops.js) - unless the owner turns "Keep inside stage" OFF for an element (then the stage is an artboard that clips);
//   - a tiny element stays recoverable: generous tap slop, a move pad, and handles pushed OUTSIDE a small box so all four stay reachable;
//   - a selected group/multi-selection shows a clear box with four corner handles and resizes uniformly.
import { renderDocument } from "../wall/render.js";
import { paintStage } from "../wall-kit/paint.js";
import * as ops from "../wall-kit/ops.js";

const TAP_SLOP_PX = 22;          // 44px-wide touch target around thin/small elements
const MOVE_THRESHOLD_PX = 4;
const HANDLE_TARGET_PX = 64;     // a selection smaller than this pushes its handles outward
const PAD_MIN_PX = 48;
const ROTATE_SNAP_DEG = 15;
// Mobile Wall Editor V2 (2026-10-20): a VIEW-only zoom on top of the fitted scale (1 = the whole stage fits). It changes how big the stage is drawn, never the
// document: every gesture still converts screen pixels back to stage units through `scale`.
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
const ZOOM_SCALE_MAX = 3;        // never draw the stage larger than 3 screen px per stage unit

const el = (tag, className, styles = {}) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(styles)) node.style.setProperty(key, value);
  return node;
};
const px = value => `${Math.round(value * 100) / 100}px`;

// view (Mobile Wall Editor V2, phones only): { enabled: () => boolean, onChange: ({ zoom }) => void }. While enabled, two fingers that do not start on the
// selection zoom the canvas around their midpoint, one finger on empty canvas pans it, and events on the canvas margin around the stage count too. Disabled
// (desktop, tablet), the canvas behaves exactly as before.
export function createCanvas({ host, viewport, session, isMulti, onSelectedTap, onEditText, onEditShape, afterRender, getPaintContext = () => ({}), view = null }) {
  let scale = 0.3;
  let zoom = 1;
  const zoomOn = () => view?.enabled?.() === true;
  let liveDoc = null;          // the in-progress gesture result (never stored in the session)
  let guides = [];
  let gesture = null;
  const pointers = new Map();
  let frame = 0;

  const doc = () => liveDoc ?? session.doc;
  const currentStage = () => ops.findStage(doc(), session.state.stageId);

  function computeScale() {
    const center = viewport.parentElement;
    const styles = getComputedStyle(viewport);
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const padY = parseFloat(styles.paddingTop) + 24;
    const availW = viewport.clientWidth - padX;
    const availH = center.clientHeight - center.querySelector(".ed-canvas-bar").offsetHeight - padY;
    const canvas = session.doc.canvas;
    const fit = Math.max(0.12, Math.min(availW / canvas.width, availH / canvas.height, 1));
    return zoomOn() && zoom > 1 ? Math.min(fit * zoom, Math.max(fit, ZOOM_SCALE_MAX)) : fit;
  }

  function render() {
    scale = computeScale();
    const source = doc();
    const tree = renderDocument(source, { viewportWidth: source.canvas.width * scale });
    if (!tree.ok) return;
    const index = source.stages.findIndex(stage => stage.id === session.state.stageId);
    // Keep inside stage OFF: while editing, what lies beyond the stage stays visible (dimmed outside the artboard edge) so it can be seen and grabbed; Preview and
    // the Wall clip it at the stage
    const free = source.stages[index].elements.some(element => !ops.keepsInside(element));
    const stageNode = paintStage(tree.stages[index], tree.scale, undefined, { ...getPaintContext(), mode: "edit", showOutside: free, wallBackground: tree.background ?? null, stageIndex: index, stageCount: tree.stages.length });
    const overlay = el("div", "ed-overlay");
    if (free) overlay.append(el("div", "ed-artboard"));
    host.style.setProperty("width", px(tree.stages[index].width));
    host.style.setProperty("height", px(tree.stages[index].height));
    host.replaceChildren(stageNode, overlay);
    drawOverlay(overlay);
    afterRender?.();   // Shapes V2: the Freeform pen / Edit Points layer goes back on top after every repaint
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); };

  // ---- selection overlay ------------------------------------------------------------------------------------------------------------------------------
  function selectedElements() {
    const stage = currentStage();
    const chosen = new Set(session.state.selection);
    return stage ? stage.elements.filter(element => chosen.has(element.id)) : [];
  }

  function drawOverlay(overlay) {
    for (const guide of guides) overlay.append(el("div", `ed-guide ${guide.axis}`, guide.axis === "x" ? { left: px(guide.at * scale) } : { top: px(guide.at * scale) }));
    const selected = selectedElements();
    if (!selected.length) return;
    const single = selected.length === 1 && !selected[0].groupId;
    const isGroup = selected.some(element => element.groupId);
    const box = single ? null : ops.unionBounds(selected);
    // the displayed (rotated for a single element) rectangle in stage px
    const view = single
      ? { cx: (selected[0].x + selected[0].width / 2) * scale, cy: (selected[0].y + selected[0].height / 2) * scale, w: selected[0].width * scale, h: selected[0].height * scale, angle: (selected[0].rotation || 0) * Math.PI / 180 }
      : { cx: (box.x + box.width / 2) * scale, cy: (box.y + box.height / 2) * scale, w: box.width * scale, h: box.height * scale, angle: 0 };
    const outline = el("div", `ed-sel${isGroup ? " is-group" : ""}${selected.length > 1 && !isGroup ? " is-multi" : ""}`, {
      left: px(view.cx - view.w / 2), top: px(view.cy - view.h / 2), width: px(view.w), height: px(view.h), transform: `rotate(${view.angle}rad)`,
    });
    overlay.append(outline);
    // Round 3 - Lock Position: a locked artwork is still selected (outline + Properties + Layers) but shows no move pad and no handles, only a lock badge
    if (selected.some(ops.isLocked)) {
      outline.classList.add("is-locked");
      const badge = el("div", "ed-lock-badge", { left: px(view.cx - view.w / 2), top: px(view.cy - view.h / 2) });
      badge.textContent = "Locked";
      overlay.append(badge);
      return;
    }
    drawSplitBoundaries(overlay, selected);
    // a small selection gets a move pad so it can still be dragged
    if (Math.min(view.w, view.h) < PAD_MIN_PX) {
      const padW = Math.max(PAD_MIN_PX, view.w), padH = Math.max(PAD_MIN_PX, view.h);
      overlay.append(el("div", "ed-pad", { left: px(view.cx - padW / 2), top: px(view.cy - padH / 2), width: px(padW), height: px(padH) }));
    }
    const push = Math.max(0, (HANDLE_TARGET_PX - Math.min(view.w, view.h)) / 2);   // W0 fix: handles sit outside a tiny box, each grabbable
    const place = (name, lx, ly, className = "") => {
      const cos = Math.cos(view.angle), sin = Math.sin(view.angle);
      const x = view.cx + lx * cos - ly * sin, y = view.cy + lx * sin + ly * cos;
      const handle = el("div", `ed-handle${className}${isGroup ? " is-group" : ""}`, { left: px(x), top: px(y) });
      handle.setAttribute("data-handle", name);
      overlay.append(handle);
    };
    const corners = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
    for (const [name, [sx, sy]] of Object.entries(corners)) place(name, sx * (view.w / 2 + push), sy * (view.h / 2 + push));
    if (single) {
      place("w", -(view.w / 2 + push), 0);
      place("e", view.w / 2 + push, 0);
      const above = view.cy - view.h / 2 - 44 - push > -8 || Math.abs(Math.sin(view.angle)) > 0.7;
      place("rotate", 0, above ? -(view.h / 2 + 34 + push) : view.h / 2 + 34 + push, " is-rotate");
    }
  }

  // Round 3 - Split: when a whole split artwork is selected, every inner boundary gets a drag handle (the line between two pieces).
  function drawSplitBoundaries(overlay, selected) {
    const pieces = ops.splitPieces(doc(), selected[0].id);
    if (pieces.length < 2 || selected.length !== pieces.length || !pieces.every(piece => selected.includes(piece))) return;
    const dir = pieces[0].payload.slice.dir;
    for (let index = 0; index < pieces.length - 1; index += 1) {
      const a = pieces[index], b = pieces[index + 1];
      const line = dir === "h"
        ? { left: px(Math.min(a.x, b.x) * scale), top: px(((a.y + a.height + b.y) / 2) * scale), width: px(Math.max(a.width, b.width) * scale) }
        : { left: px(((a.x + a.width + b.x) / 2) * scale), top: px(Math.min(a.y, b.y) * scale), height: px(Math.max(a.height, b.height) * scale) };
      const handle = el("div", `ed-boundary is-${dir}`, line);
      handle.setAttribute("data-boundary", String(index));
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-label", `Split boundary ${index + 1}`);
      overlay.append(handle);
    }
  }

  // ---- gestures -------------------------------------------------------------------------------------------------------------------------------------------
  const toStage = event => { const rect = host.getBoundingClientRect(); return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale }; };
  const isAdditive = event => isMulti() || event.shiftKey || event.ctrlKey || event.metaKey;

  function begin(kind, event, extra = {}) {
    gesture = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startDoc: session.doc, ids: [...session.state.selection], moved: false, ...extra };
    try { host.setPointerCapture(event.pointerId); } catch { /* a synthetic event without an active pointer cannot be captured */ }
  }

  // ---- view zoom / pan (Mobile V2) ---------------------------------------------------------------------------------------------------------------------------
  const clampZoom = value => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
  const midpoint = () => { const [a, b] = [...pointers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
  // Redraws at the new zoom and scrolls so that the stage point `anchor` (stage units) sits under the screen point `at` - the pinch midpoint or the canvas centre.
  function applyZoom(next, anchor = null, at = null) {
    zoom = clampZoom(next);
    render();
    if (anchor && at) {
      const rect = host.getBoundingClientRect();
      viewport.scrollLeft += rect.left + anchor.x * scale - at.x;
      viewport.scrollTop += rect.top + anchor.y * scale - at.y;
    }
    view?.onChange?.({ zoom });
  }
  function viewCentre() { const rect = viewport.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }
  function zoomBy(factor) { const at = viewCentre(); applyZoom(zoom * factor, toStage({ clientX: at.x, clientY: at.y }), at); }
  function fit() { zoom = 1; render(); viewport.scrollLeft = 0; viewport.scrollTop = 0; view?.onChange?.({ zoom }); }
  // Brings the selection into the visible canvas (after it was added, chosen in Layers, or moved to by a stage switch) - scrolling only, never zooming.
  function revealSelection() {
    const box = host.querySelector(".ed-sel");
    if (!box || zoom <= 1) return;
    const sel = box.getBoundingClientRect(), port = viewport.getBoundingClientRect();
    const margin = 24;
    if (sel.right < port.left + margin || sel.left > port.right - margin) viewport.scrollLeft += sel.left + sel.width / 2 - (port.left + port.width / 2);
    if (sel.bottom < port.top + margin || sel.top > port.bottom - margin) viewport.scrollTop += sel.top + sel.height / 2 - (port.top + port.height / 2);
  }
  let zoomFrame = 0;
  function zoomMove() {
    if (zoomFrame) return;
    zoomFrame = requestAnimationFrame(() => {
      zoomFrame = 0;
      if (gesture?.kind !== "zoom" || pointers.size < 2) return;
      const now = midpoint();
      applyZoom(gesture.startZoom * (now.distance / gesture.startDistance), gesture.anchor, now);   // pinch + two-finger pan in one gesture
    });
  }

  // Events are read on the viewport: on a phone the margin around the stage is canvas too (pinch / pan there). Elsewhere only the stage reacts, as before.
  const surface = viewport;
  surface.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!zoomOn() && !host.contains(event.target)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.preventDefault();
    // Mobile V2: two fingers zoom the CANVAS unless the first one started on what was ALREADY selected (then they scale the selection, the W0 gesture) - a
    // pinch that merely lands on another element zooms. An element drag that is interrupted this way is dropped (nothing is committed).
    const firstOnFreshElement = gesture?.kind === "move" && gesture.tapOn && !gesture.wasSelected;
    if (pointers.size === 2 && zoomOn() && (!gesture || gesture.kind === "background" || !session.state.selection.length || firstOnFreshElement)) {
      liveDoc = null; guides = [];
      const mid = midpoint();
      gesture = { kind: "zoom", pointerId: event.pointerId, startZoom: zoom, startDistance: mid.distance, anchor: toStage({ clientX: mid.x, clientY: mid.y }), moved: true };
      try { host.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
      render();
      return;
    }
    if (gesture?.kind === "zoom") return;
    if (pointers.size === 2 && session.state.selection.length) {
      // two fingers on a selection: pinch to scale it (W0 proved this gesture on the Samsung)
      const [a, b] = [...pointers.values()];
      gesture = { kind: "pinch", pointerId: event.pointerId, startDoc: session.doc, ids: [...session.state.selection], startDistance: Math.hypot(a.x - b.x, a.y - b.y) || 1, moved: true };
      return;
    }
    if (gesture) return;
    const boundary = event.target.closest?.("[data-boundary]");
    if (boundary) {
      const pieces = ops.splitPieces(session.doc, session.state.selection[0]);
      const index = Number(boundary.getAttribute("data-boundary"));
      if (pieces[index + 1]) { begin("boundary", event, { index, pieceId: pieces[index].id, piece: pieces[index] }); return; }
    }
    const handle = event.target.closest?.("[data-handle]");
    if (handle) {
      const name = handle.getAttribute("data-handle");
      begin(name === "rotate" ? "rotate" : "resize", event, { handle: name });
      return;
    }
    const point = toStage(event);
    const stage = currentStage();
    const hit = ops.hitTest(stage, point.x, point.y, TAP_SLOP_PX / scale);
    if (event.target.closest?.(".ed-pad")) { begin("move", event); return; }
    if (hit) {
      const alreadySelected = session.state.selection.includes(hit.id);
      if (isAdditive(event)) {
        session.toggle(hit.id);
        if (session.state.selection.includes(hit.id)) begin("move", event, { tapOn: hit.id });
        return;
      }
      if (!alreadySelected) session.select([hit.id]);
      begin("move", event, { tapOn: hit.id, wasSelected: alreadySelected });
      return;
    }
    // an empty spot inside the current selection's bounds still drags the selection; otherwise it is a background tap
    const selected = selectedElements();
    if (selected.length) {
      const bounds = ops.unionBounds(selected);
      if (point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height) { begin("move", event); return; }
    }
    begin("background", event);
  });

  surface.addEventListener("pointermove", event => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture) return;
    if (gesture.kind === "zoom") { zoomMove(); return; }
    if (gesture.kind === "pinch") {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const factor = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / gesture.startDistance;
      const result = ops.scaleSelection(gesture.startDoc, gesture.ids, factor);
      if (result.ok) { liveDoc = result.doc; schedule(); }
      return;
    }
    if (event.pointerId !== gesture.pointerId) return;
    const rawDx = event.clientX - gesture.startX, rawDy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(rawDx, rawDy) < MOVE_THRESHOLD_PX) return;
    if (gesture.kind === "background") {
      // Mobile V2: one finger on empty canvas pans a zoomed stage (it is then no longer a tap, so it keeps the selection)
      if (!zoomOn() || (!gesture.panning && Math.hypot(rawDx, rawDy) < TAP_SLOP_PX / 2)) return;
      if (!gesture.panning) { gesture.panning = true; gesture.moved = true; gesture.scrollX = viewport.scrollLeft; gesture.scrollY = viewport.scrollTop; }
      viewport.scrollLeft = gesture.scrollX - rawDx;
      viewport.scrollTop = gesture.scrollY - rawDy;
      return;
    }
    gesture.moved = true;
    const dx = rawDx / scale, dy = rawDy / scale;
    let result;
    guides = [];
    if (gesture.kind === "move") {
      result = ops.moveElements(gesture.startDoc, gesture.ids, dx, dy);
      if (result.ok) {
        const stage = ops.findStage(result.doc, session.state.stageId);
        const moved = new Set(ops.expandSelection(stage, gesture.ids));
        const box = ops.unionBounds(stage.elements.filter(element => moved.has(element.id)));
        const snap = ops.computeSnap(box, stage, [...moved], result.doc.canvas, 8 / scale);
        if (snap.dx || snap.dy) { const snapped = ops.moveElements(gesture.startDoc, gesture.ids, dx + snap.dx, dy + snap.dy); if (snapped.ok) result = snapped; }
        guides = snap.guides;
      }
    } else if (gesture.kind === "resize") {
      const multi = gesture.ids.length > 1 || locateGrouped(gesture.startDoc, gesture.ids[0]);
      // an element with a locked aspect (a player's selected aspect, a whole picture) is held to exactly that ratio; Shift keeps any other box's proportions
      result = multi ? ops.resizeGroup(gesture.startDoc, gesture.ids, gesture.handle, dx, dy) : ops.resizeElement(gesture.startDoc, gesture.ids[0], gesture.handle, dx, dy, { keepAspect: ops.lockedAspect(ops.locate(gesture.startDoc, gesture.ids[0]).element) ?? event.shiftKey });
    } else if (gesture.kind === "boundary") {
      // the boundary follows the pointer along the split direction, in fractions of the whole artwork
      const { piece, index } = gesture;
      const { dir, from, to } = piece.payload.slice;
      const span = dir === "h" ? piece.height / (to - from) : piece.width / (to - from);
      const edge = (dir === "h" ? piece.height : piece.width) + (dir === "h" ? dy : dx);
      result = ops.moveSplitBoundary(gesture.startDoc, gesture.pieceId, index, from + edge / span);
    } else if (gesture.kind === "rotate") {
      const found = ops.locate(gesture.startDoc, gesture.ids[0]);
      const rect = host.getBoundingClientRect();
      const centre = { x: rect.left + (found.element.x + found.element.width / 2) * scale, y: rect.top + (found.element.y + found.element.height / 2) * scale };
      let angle = Math.atan2(event.clientY - centre.y, event.clientX - centre.x) * 180 / Math.PI + 90;
      const snapped = Math.round(angle / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
      if (event.shiftKey || Math.abs(angle - snapped) < 4) angle = snapped;
      result = ops.rotateElement(gesture.startDoc, gesture.ids[0], angle);
    }
    if (result?.ok) { liveDoc = result.doc; schedule(); }
  });

  function finish(event, cancelled) {
    pointers.delete(event.pointerId);
    if (!gesture) return;
    if (gesture.kind === "zoom") {
      // the zoom ends when fewer than two fingers remain; a finger left on the glass does nothing until it lifts (it never starts an element drag)
      if (pointers.size >= 2 && !cancelled) return;
      gesture = null;
      try { host.releasePointerCapture(event.pointerId); } catch { /* already released */ }
      view?.onChange?.({ zoom });
      return;
    }
    if (gesture.kind === "pinch") {
      if (pointers.size >= 1 && !cancelled) return;   // wait until the last finger lifts
    } else if (event.pointerId !== gesture.pointerId) return;
    const done = gesture;
    gesture = null;
    const result = liveDoc;
    liveDoc = null; guides = [];
    try { host.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (!cancelled && result && done.moved) session.apply({ ok: true, doc: result });
    else if (!cancelled && !done.moved) {
      if (done.kind === "background") session.clearSelection();
      else if (done.kind === "move" && done.wasSelected && !isMulti()) onSelectedTap?.(done.tapOn);
      if (done.kind === "move" && done.tapOn) doubleTap(done.tapOn);
    }
    render();
  }
  surface.addEventListener("pointerup", event => finish(event, false));
  surface.addEventListener("pointercancel", event => finish(event, true));
  surface.addEventListener("dblclick", event => {
    if (!host.contains(event.target)) return;
    const point = toStage(event);
    const hit = ops.hitTest(currentStage(), point.x, point.y, TAP_SLOP_PX / scale);
    if (hit?.type === "text") { session.select([hit.id]); onEditText?.(hit.id); }
    else if (hit?.type === "rect" && hit.payload?.shape === "custom") onEditShape?.(hit.id);   // a freeform shape: double-click edits its points
  });

  // Shapes V2: two quick taps on the same freeform shape open Edit Points. (A real dblclick rarely reaches the stage here: the first tap repaints it, so the
  // browser sees two different targets.) Freeform shapes only: every other element keeps exactly its existing tap behaviour.
  let lastTap = null;
  function doubleTap(id) {
    const now = Date.now();
    const element = ops.locate(session.doc, id)?.element;
    if (lastTap && lastTap.id === id && now - lastTap.at < 450 && element?.type === "rect" && element.payload?.shape === "custom") { lastTap = null; onEditShape?.(id); return; }
    lastTap = { id, at: now };
  }
  const locateGrouped = (source, id) => !!ops.locate(source, id)?.element.groupId;
  return {
    render, get scale() { return scale; }, cancel() { gesture = null; liveDoc = null; guides = []; pointers.clear(); render(); },
    // Mobile V2 view controls (they never touch the document)
    get zoom() { return zoom; }, get busy() { return gesture !== null; }, zoomBy, fit, revealSelection,
  };
}
