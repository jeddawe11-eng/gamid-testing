// Shapes V2 (Mazen's task 2026-10-19): the Freeform pen and Edit Points, on top of the Wall canvas (desktop editor). A freeform shape is an ordinary `rect`
// element with shape "custom" and a path (wall/shapes.js), so it moves, resizes, rotates, layers, duplicates, saves and publishes like every other element.
// While the pen or Edit Points is on, this layer covers the stage and takes the pointer, so drawing / point editing never moves the element itself;
// leaving it (Finish, Done, Cancel or Escape) gives the stage back to the normal selection and move / resize gestures.
// Every change is ONE ordinary edit through ops (undo / redo / save as usual): a new element when the pen finishes, the path + box together for each point edit.
import * as ops from "../wall-kit/ops.js";
import { SHAPE_LIMITS } from "../wall/shapes.js";

const NS = "http://www.w3.org/2000/svg";
const CLOSE_PX = 12, DRAG_PX = 4, MIN_SIZE = 20;
const r3 = value => Math.round(value * 1000) / 1000;
const svgEl = (tag, attrs = {}) => { const node = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v)); return node; };
const htmlEl = (tag, attrs = {}, text) => { const node = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === "class") node.className = v; else if (v === true) node.setAttribute(k, ""); else if (v !== false && v != null) node.setAttribute(k, String(v)); } if (text) node.textContent = text; return node; };
const clone = points => points.map(point => ({ ...point }));
const hasIn = point => point.ix !== undefined, hasOut = point => point.ox !== undefined;

// path data in px from absolute points (for the live preview); the same segment rule as wall/shapes.js customPath
function previewD(points, closed, toPx) {
  if (!points.length) return "";
  const at = (x, y) => { const p = toPx(x, y); return `${p.x} ${p.y}`; };
  let d = `M${at(points[0].x, points[0].y)}`;
  const seg = (a, b) => (!hasOut(a) && !hasIn(b) ? `L${at(b.x, b.y)}` : `C${at(a.ox ?? a.x, a.oy ?? a.y)} ${at(b.ix ?? b.x, b.iy ?? b.y)} ${at(b.x, b.y)}`);
  for (let i = 1; i < points.length; i++) d += seg(points[i - 1], points[i]);
  if (closed && points.length > 2) d += `${seg(points[points.length - 1], points[0])}Z`;
  return d;
}

// absolute points -> { box, path } with the box around every anchor and handle (at least MIN_SIZE), the points in 0..1 of it
export function normalizePath(points, closed) {
  const xs = [], ys = [];
  for (const p of points) { xs.push(p.x); ys.push(p.y); if (hasIn(p)) { xs.push(p.ix); ys.push(p.iy); } if (hasOut(p)) { xs.push(p.ox); ys.push(p.oy); } }
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 - x0 < MIN_SIZE) { const c = (x0 + x1) / 2; x0 = c - MIN_SIZE / 2; x1 = c + MIN_SIZE / 2; }
  if (y1 - y0 < MIN_SIZE) { const c = (y0 + y1) / 2; y0 = c - MIN_SIZE / 2; y1 = c + MIN_SIZE / 2; }
  const w = x1 - x0, h = y1 - y0;
  const u = value => r3((value - x0) / w), v = value => r3((value - y0) / h);
  return {
    box: { x: x0, y: y0, width: w, height: h },
    path: { closed, points: points.map(p => ({ x: u(p.x), y: v(p.y), ...(hasIn(p) ? { ix: u(p.ix), iy: v(p.iy) } : {}), ...(hasOut(p) ? { ox: u(p.ox), oy: v(p.oy) } : {}) })) },
  };
}

// de Casteljau split of segment a -> b at t = 0.5: the new middle point keeps the curve exactly
export function splitSegment(a, b) {
  const lerp = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  if (!hasOut(a) && !hasIn(b)) return { a: { ...a }, mid: lerp(a, b), b: { ...b } };
  const p0 = { x: a.x, y: a.y }, p1 = { x: a.ox ?? a.x, y: a.oy ?? a.y }, p2 = { x: b.ix ?? b.x, y: b.iy ?? b.y }, p3 = { x: b.x, y: b.y };
  const p01 = lerp(p0, p1), p12 = lerp(p1, p2), p23 = lerp(p2, p3), p012 = lerp(p01, p12), p123 = lerp(p12, p23), m = lerp(p012, p123);
  return { a: { ...a, ox: p01.x, oy: p01.y }, mid: { x: m.x, y: m.y, ix: p012.x, iy: p012.y, ox: p123.x, oy: p123.y }, b: { ...b, ix: p23.x, iy: p23.y } };
}

export function createPathEditor({ host, bar, getScale, session, run, notify = () => {}, onFinish = () => {} }) {
  let mode = null, pen = null, edit = null, layer = null;

  // ---- the selected custom element, in its own unrotated frame (stage units) --------------------------------------------------------------------------
  const element = () => (edit ? session.stage?.elements.find(item => item.id === edit.id) : null);
  const frame = el => ({ cx: el.x + el.width / 2, cy: el.y + el.height / 2, a: ((el.rotation || 0) * Math.PI) / 180 });
  const rotate = (x, y, f, sign = 1) => { const c = Math.cos(sign * f.a), s = Math.sin(sign * f.a), dx = x - f.cx, dy = y - f.cy; return { x: f.cx + dx * c - dy * s, y: f.cy + dx * s + dy * c }; };
  const absolutePoints = el => el.payload.path.points.map(p => {
    const X = u => el.x + u * el.width, Y = v => el.y + v * el.height;
    return { x: X(p.x), y: Y(p.y), ...(p.ix !== undefined ? { ix: X(p.ix), iy: Y(p.iy) } : {}), ...(p.ox !== undefined ? { ox: X(p.ox), oy: Y(p.oy) } : {}) };
  });
  const toUnits = event => { const rect = host.getBoundingClientRect(), s = getScale(); return { x: (event.clientX - rect.left) / s, y: (event.clientY - rect.top) / s }; };

  // ---- the canvas bar controls ---------------------------------------------------------------------------------------------------------------------
  function renderBar() {
    if (!bar) return;
    bar.hidden = !mode;
    if (!mode) { bar.replaceChildren(); return; }
    const add = (text, fn, disabled = false, primary = false) => { const b = htmlEl("button", { class: `ed-btn${primary ? " ed-primary" : ""}`, type: "button", disabled }, text); b.addEventListener("click", fn); return b; };
    if (mode === "pen") {
      const n = pen.points.length;
      bar.replaceChildren(htmlEl("span", { class: "ed-path-note" }, n ? `Freeform: ${n} point${n === 1 ? "" : "s"} · drag to curve · click the first point to close` : "Freeform: click to add points · drag while clicking to curve"),
        add("Undo point", undoPoint, n === 0), add("Finish open", () => finishPen(false), n < 2), add("Close shape", () => finishPen(true), n < 3, true), add("Cancel", stop));
    } else {
      const el = element(), count = el?.payload.path.points.length ?? 0, closed = el?.payload.path.closed;
      const sel = edit.selected;
      bar.replaceChildren(htmlEl("span", { class: "ed-path-note" }, sel === null ? "Edit points: select a point, or drag a point or a curve handle" : `Point ${sel + 1} of ${count}`),
        add("Add point", addPoint, sel === null || count >= SHAPE_LIMITS.maxPoints), add("Delete point", deletePoint, sel === null || count <= (closed ? 3 : 2)),
        add("Smooth / Corner", togglePoint, sel === null), add("Done", stop, false, true));
    }
  }

  // ---- drawing ---------------------------------------------------------------------------------------------------------------------------------------
  // The layer is created once per pen / Edit Points session and kept (a pointer drag keeps its capture); a canvas repaint detaches it and mount() puts it back.
  function mount() {
    host.classList.toggle("is-path-editing", Boolean(mode));   // the element's own selection box and handles step aside while the points are edited
    if (!mode) { layer?.remove(); layer = null; renderBar(); return; }
    if (mode === "edit") {
      const el = element();
      if (!el || el.payload.shape !== "custom" || session.state.selection.length !== 1 || session.state.selection[0] !== edit.id) { stop(); return; }
      if (!edit.drag) edit.points = absolutePoints(el);
      if (edit.selected !== null && edit.selected >= edit.points.length) edit.selected = null;
    }
    if (!layer) {
      layer = htmlEl("div", { class: "ed-path-layer" });
      layer.append(svgEl("svg", { class: "ed-path-svg", width: "100%", height: "100%" }));
      layer.addEventListener("pointerdown", onDown);
      layer.addEventListener("pointermove", onMove);
      layer.addEventListener("pointerup", onUp);
      layer.addEventListener("pointercancel", onUp);
    }
    layer.className = `ed-path-layer is-${mode}`;
    layer.setAttribute("role", "application");
    layer.setAttribute("aria-label", mode === "pen" ? "Freeform pen: click to add points" : "Edit points");
    if (layer.parentNode !== host) host.append(layer);
    const s = getScale();
    const svg = layer.firstChild;
    svg.replaceChildren();
    const f = mode === "edit" ? frame(element()) : null;
    const toPx = (x, y) => { const p = f ? rotate(x, y, f) : { x, y }; return { x: Math.round(p.x * s * 10) / 10, y: Math.round(p.y * s * 10) / 10 }; };
    const points = mode === "pen" ? pen.points : edit.points;
    const closed = mode === "pen" ? false : element().payload.path.closed;
    svg.append(svgEl("path", { class: "ed-path-preview", d: previewD(points, closed, toPx) }));
    if (mode === "pen" && pen.hover && points.length) {
      const a = toPx(points[points.length - 1].x, points[points.length - 1].y), b = toPx(pen.hover.x, pen.hover.y);
      svg.append(svgEl("line", { class: "ed-path-rubber", x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    }
    points.forEach((p, index) => {
      const a = toPx(p.x, p.y);
      for (const [kind, hx, hy] of [["in", p.ix, p.iy], ["out", p.ox, p.oy]]) {
        if (hx === undefined || (mode === "edit" && edit.selected !== null && Math.abs(edit.selected - index) > 1 && !(closed && Math.abs(edit.selected - index) === points.length - 1))) continue;
        const q = toPx(hx, hy);
        svg.append(svgEl("line", { class: "ed-path-arm", x1: a.x, y1: a.y, x2: q.x, y2: q.y }));
        svg.append(svgEl("circle", { class: "ed-path-handle", cx: q.x, cy: q.y, r: 5, "data-kind": kind, "data-index": index }));
      }
      const selected = mode === "edit" && edit.selected === index, first = mode === "pen" && index === 0 && points.length >= 3;
      svg.append(svgEl("rect", { class: `ed-path-anchor${selected ? " is-selected" : ""}${first ? " is-first" : ""}`, x: a.x - 5, y: a.y - 5, width: 10, height: 10, "data-kind": "anchor", "data-index": index }));
    });
    renderBar();
  }

  // ---- pointer --------------------------------------------------------------------------------------------------------------------------------------
  function onDown(event) {
    event.stopPropagation(); event.preventDefault();
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try { layer.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
    const p = toUnits(event), s = getScale();
    if (mode === "pen") {
      const first = pen.points[0];
      if (pen.points.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) * s <= CLOSE_PX) { finishPen(true); return; }
      if (pen.points.length >= SHAPE_LIMITS.maxPoints) { notify(`A freeform shape has at most ${SHAPE_LIMITS.maxPoints} points.`); return; }
      pen.points.push({ x: p.x, y: p.y });
      pen.drag = { index: pen.points.length - 1, start: p, pointerId: event.pointerId };
      mount();
      return;
    }
    const target = event.target.closest?.("[data-kind]");
    if (!target) { edit.selected = null; mount(); return; }
    const index = Number(target.getAttribute("data-index")), kind = target.getAttribute("data-kind");
    if (kind === "anchor") edit.selected = index;
    edit.drag = { kind, index, start: p, startPoints: clone(edit.points), pointerId: event.pointerId, moved: false };
    mount();
  }
  function onMove(event) {
    event.stopPropagation();
    const p = toUnits(event), s = getScale();
    if (mode === "pen") {
      pen.hover = p;
      const drag = pen.drag;
      if (drag && event.pointerId === drag.pointerId && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) * s > DRAG_PX) {
        const a = pen.points[drag.index];
        Object.assign(a, { ox: p.x, oy: p.y, ix: 2 * a.x - p.x, iy: 2 * a.y - p.y });   // a smooth point: the handles mirror each other
      }
      mount();
      return;
    }
    const drag = edit?.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const f = frame(element());
    // the pointer movement in the element's own (unrotated) frame
    const q = rotate(p.x, p.y, f, -1), q0 = rotate(drag.start.x, drag.start.y, f, -1);
    const dx = q.x - q0.x, dy = q.y - q0.y;
    if (!drag.moved && Math.hypot(dx, dy) * s < DRAG_PX) return;
    drag.moved = true;
    const points = clone(drag.startPoints), pt = points[drag.index];
    if (drag.kind === "anchor") { pt.x += dx; pt.y += dy; if (hasIn(pt)) { pt.ix += dx; pt.iy += dy; } if (hasOut(pt)) { pt.ox += dx; pt.oy += dy; } }
    else if (drag.kind === "in") { pt.ix += dx; pt.iy += dy; }
    else { pt.ox += dx; pt.oy += dy; }
    edit.points = points;
    mount();
  }
  function onUp(event) {
    event.stopPropagation();
    try { layer?.releasePointerCapture(event.pointerId); } catch { /* released */ }
    if (mode === "pen") { pen.drag = null; return; }
    const drag = edit?.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    edit.drag = null;
    if (drag.moved) commit(edit.points); else mount();
  }

  // ---- edits --------------------------------------------------------------------------------------------------------------------------------------
  // the edited points become the new path AND the new box (its centre moved through the rotation, so the shape stays where it is on the stage)
  function commit(points, closed = element().payload.path.closed) {
    const el = element(), f = frame(el);
    const { box, path } = normalizePath(points, closed);
    const centre = rotate(box.x + box.width / 2, box.y + box.height / 2, f);
    const payload = { path, ...(typeof el.payload.lockAspect === "number" ? { lockAspect: Math.min(SHAPE_LIMITS.aspect[1], Math.max(SHAPE_LIMITS.aspect[0], r3(box.width / box.height))) } : {}) };
    const step = ops.updatePayloadMany(session.doc, [el.id], payload);
    const result = step.ok ? ops.updateGeometry(step.doc, el.id, { x: Math.round(centre.x - box.width / 2), y: Math.round(centre.y - box.height / 2), width: Math.round(box.width), height: Math.round(box.height) }) : step;
    if (!run(result).ok) mount();
  }
  function addPoint() {
    const el = element(), closed = el.payload.path.closed, points = clone(edit.points), i = edit.selected;
    if (i === null) return;
    const from = closed || i < points.length - 1 ? i : i - 1, to = (from + 1) % points.length;
    const { a, mid, b } = splitSegment(points[from], points[to]);
    points[from] = a; points[to] = b;
    points.splice(from + 1, 0, mid);
    edit.selected = from + 1;
    commit(points);
  }
  function deletePoint() {
    const el = element(), points = clone(edit.points), i = edit.selected;
    if (i === null || points.length <= (el.payload.path.closed ? 3 : 2)) return;
    points.splice(i, 1);
    edit.selected = null;
    commit(points);
  }
  function togglePoint() {
    const points = clone(edit.points), i = edit.selected;
    if (i === null) return;
    const p = points[i];
    if (hasIn(p) || hasOut(p)) { delete p.ix; delete p.iy; delete p.ox; delete p.oy; }
    else {
      const prev = points[(i - 1 + points.length) % points.length], next = points[(i + 1) % points.length];
      const dx = (next.x - prev.x) / 4, dy = (next.y - prev.y) / 4;
      Object.assign(p, { ix: p.x - dx, iy: p.y - dy, ox: p.x + dx, oy: p.y + dy });
    }
    commit(points);
  }
  function undoPoint() { if (pen?.points.length) { pen.points.pop(); mount(); } }
  function finishPen(closed) {
    const points = pen.points;
    if (points.length < (closed ? 3 : 2)) return;
    const { box, path } = normalizePath(points, closed);
    const payload = { fill: "#8b5dff", shape: "custom", path, ...(closed ? {} : { stroke: "#62e7ff", strokeWidth: 6 }) };
    const result = ops.addCustomElement(session.doc, session.state.stageId, { type: "rect", payload, width: Math.round(box.width), height: Math.round(box.height), x: Math.round(box.x), y: Math.round(box.y) });
    mode = null; pen = null;
    const applied = run(result, { keepResultSelection: true });
    mount();
    if (applied.ok) onFinish(applied);
  }

  // ---- keyboard: while drawing or editing, these keys belong to the pen / points, not to the element ----------------------------------------------
  window.addEventListener("keydown", event => {
    if (!mode || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    const mod = event.ctrlKey || event.metaKey, key = event.key;
    let handled = true;
    if (key === "Escape") stop();
    else if (mode === "pen" && key === "Enter") finishPen(pen.points.length >= 3);
    else if (mode === "pen" && (key === "Backspace" || key === "Delete" || (mod && key.toLowerCase() === "z"))) undoPoint();
    else if (mode === "edit" && (key === "Backspace" || key === "Delete")) deletePoint();
    else if (mode === "edit" && key === "Enter") stop();
    else handled = false;
    if (handled) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);

  function stop() { mode = null; pen = null; edit = null; mount(); }
  return {
    get mode() { return mode; },
    startPen() { session.clearSelection(); mode = "pen"; pen = { points: [], drag: null, hover: null }; edit = null; mount(); },
    editPoints(id) { session.select([id]); mode = "edit"; edit = { id, selected: null, drag: null, points: [] }; mount(); },
    stop,
    mount,
  };
}

