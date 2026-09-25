// The Wall canvas: paints the current stage through the real W1 render pipeline, draws the selection overlay, and turns pointer/touch gestures into pure
// editing operations (ops.js). Every gesture is a function of (document at gesture start, total pointer delta): the live preview is computed the same way as
// the committed result, and the session is only touched once, on release - so one gesture is one undo step, and a cancelled gesture changes nothing.
//
// Real-device lessons kept from the W0 prototype (Samsung / Chrome):
//   - touch-action:none on the stage so a drag never fights page scroll (the stage is fitted to the screen, so it never needs to scroll);
//   - hard containment at the stage edges (in ops.js);
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

const el = (tag, className, styles = {}) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(styles)) node.style.setProperty(key, value);
  return node;
};
const px = value => `${Math.round(value * 100) / 100}px`;

export function createCanvas({ host, viewport, session, isMulti, onSelectedTap, onEditText }) {
  let scale = 0.3;
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
    return Math.max(0.12, Math.min(availW / canvas.width, availH / canvas.height, 1));
  }

  function render() {
    scale = computeScale();
    const source = doc();
    const tree = renderDocument(source, { viewportWidth: source.canvas.width * scale });
    if (!tree.ok) return;
    const index = source.stages.findIndex(stage => stage.id === session.state.stageId);
    const stageNode = paintStage(tree.stages[index], tree.scale);
    const overlay = el("div", "ed-overlay");
    host.style.setProperty("width", px(tree.stages[index].width));
    host.style.setProperty("height", px(tree.stages[index].height));
    host.replaceChildren(stageNode, overlay);
    drawOverlay(overlay);
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

  // ---- gestures -------------------------------------------------------------------------------------------------------------------------------------------
  const toStage = event => { const rect = host.getBoundingClientRect(); return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale }; };
  const isAdditive = event => isMulti() || event.shiftKey || event.ctrlKey || event.metaKey;

  function begin(kind, event, extra = {}) {
    gesture = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startDoc: session.doc, ids: [...session.state.selection], moved: false, ...extra };
    try { host.setPointerCapture(event.pointerId); } catch { /* a synthetic event without an active pointer cannot be captured */ }
  }

  host.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.preventDefault();
    if (pointers.size === 2 && session.state.selection.length) {
      // two fingers on a selection: pinch to scale it (W0 proved this gesture on the Samsung)
      const [a, b] = [...pointers.values()];
      gesture = { kind: "pinch", pointerId: event.pointerId, startDoc: session.doc, ids: [...session.state.selection], startDistance: Math.hypot(a.x - b.x, a.y - b.y) || 1, moved: true };
      return;
    }
    if (gesture) return;
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

  host.addEventListener("pointermove", event => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture) return;
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
    if (gesture.kind === "background") return;
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
      result = multi ? ops.resizeGroup(gesture.startDoc, gesture.ids, gesture.handle, dx, dy) : ops.resizeElement(gesture.startDoc, gesture.ids[0], gesture.handle, dx, dy, { keepAspect: event.shiftKey });
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
    }
    render();
  }
  host.addEventListener("pointerup", event => finish(event, false));
  host.addEventListener("pointercancel", event => finish(event, true));
  host.addEventListener("dblclick", event => {
    const point = toStage(event);
    const hit = ops.hitTest(currentStage(), point.x, point.y, TAP_SLOP_PX / scale);
    if (hit?.type === "text") { session.select([hit.id]); onEditText?.(hit.id); }
  });

  const locateGrouped = (source, id) => !!ops.locate(source, id)?.element.groupId;
  return { render, get scale() { return scale; }, cancel() { gesture = null; liveDoc = null; guides = []; pointers.clear(); render(); } };
}
