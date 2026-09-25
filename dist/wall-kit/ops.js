// Pure, deterministic Wall Document editing operations. Every operation takes a Wall Document and returns a NEW document (the input is never mutated):
//   { ok: true, doc, ...extras }   or   { ok: false, doc: <the unchanged input>, errors: [codes] }
// and nothing is ever returned as ok unless the resulting document passes the real W1 validator - the editor can therefore never hold, save or preview a
// document the Wall core would reject. There is no DOM, no clock and no randomness here (new ids are derived from the document), so every behavior is
// unit-testable under plain Node.
//
// Geometry rules (carried over from the real-device-proven W0 editor, expressed in the canonical 1000 x 1778 stage space):
//   - HARD containment: an element (its rotated bounding box, if rotated) never leaves its stage; drags/resizes stop at the edge.
//   - Whole-unit geometry: x, y, width, height are integers, so containment sums are exact.
//   - Every drag/resize is a pure function of (document at gesture start, total pointer delta), so a gesture is deterministic and cancelable.
//   - Layer order is stage-local, dense (0..n-1 after any ordering operation) and never depends on array/insertion order.
import { validateDocument } from "../wall/validate.js";
import { elementRegistry } from "../wall/elements.js";
import { createElement } from "../wall/schema.js";
import { createTextPayload } from "./text.js";
import "./register.js";   // every element type, background kind and embed provider the kit provides

export const MIN_SIZE = 10;
export const DUPLICATE_OFFSET = 24;
export const SNAP_THRESHOLD = 8;

const clone = value => structuredClone(value);
const zThenId = (a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const EPS = 1e-6;

export const ordered = stage => [...stage.elements].sort(zThenId);
export const findStage = (doc, stageId) => doc.stages.find(stage => stage.id === stageId) ?? null;
export function locate(doc, id) {
  for (const stage of doc.stages) {
    const element = stage.elements.find(candidate => candidate.id === id);
    if (element) return { stage, element };
  }
  return null;
}
export const stageIndex = (doc, stageId) => doc.stages.findIndex(stage => stage.id === stageId);

// ---- results ----------------------------------------------------------------------------------------------------------------------------------------
const fail = (doc, ...errors) => ({ ok: false, doc, errors });
function finish(previous, next, extras = {}) {
  const { valid, errors } = validateDocument(next);
  return valid ? { ok: true, doc: next, ...extras } : fail(previous, ...errors);
}

// ---- geometry ---------------------------------------------------------------------------------------------------------------------------------------
const radians = degrees => (degrees || 0) * Math.PI / 180;
// Axis-aligned bounds of an element AFTER rotation about its centre.
export function elementBounds(element) {
  const angle = radians(element.rotation);
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  const width = element.width * cos + element.height * sin;
  const height = element.width * sin + element.height * cos;
  const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}
export function unionBounds(elements) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const element of elements) {
    const box = elementBounds(element);
    left = Math.min(left, box.x); top = Math.min(top, box.y); right = Math.max(right, box.x + box.width); bottom = Math.max(bottom, box.y + box.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
// The box that must stay inside the stage. W1 checks an element's UNROTATED box against the canvas, and the editor also keeps the ROTATED bounds inside (so nothing is visibly clipped):
// both hold exactly when the box with the larger half-extent on each axis (same centre) fits.
export function containBounds(element) {
  const rotated = elementBounds(element);
  const width = Math.max(element.width, rotated.width), height = Math.max(element.height, rotated.height);
  const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}
export function unionContain(elements) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const element of elements) {
    const box = containBounds(element);
    left = Math.min(left, box.x); top = Math.min(top, box.y); right = Math.max(right, box.x + box.width); bottom = Math.max(bottom, box.y + box.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
const inside = (box, canvas) => box.x >= -EPS && box.y >= -EPS && box.x + box.width <= canvas.width + EPS && box.y + box.height <= canvas.height + EPS;

// Puts an element back inside the canvas (shrinking an unrotated one that is too large). Returns false only when a rotated element cannot fit at all.
function clampToCanvas(element, canvas) {
  if (!element.rotation) {
    element.width = Math.min(Math.max(MIN_SIZE, Math.round(element.width)), canvas.width);
    element.height = Math.min(Math.max(MIN_SIZE, Math.round(element.height)), canvas.height);
    element.x = Math.min(Math.max(0, Math.round(element.x)), canvas.width - element.width);
    element.y = Math.min(Math.max(0, Math.round(element.y)), canvas.height - element.height);
    return true;
  }
  element.width = Math.max(MIN_SIZE, Math.round(element.width));
  element.height = Math.max(MIN_SIZE, Math.round(element.height));
  const box = containBounds(element);
  if (box.width > canvas.width + EPS || box.height > canvas.height + EPS) return false;
  // shift the centre so the rotated bounds sit inside, on whole units
  const offsetX = box.x - element.x, offsetY = box.y - element.y;   // bounds origin relative to x,y
  const minX = Math.ceil(-offsetX - EPS), maxX = Math.floor(canvas.width - box.width - offsetX + EPS);
  const minY = Math.ceil(-offsetY - EPS), maxY = Math.floor(canvas.height - box.height - offsetY + EPS);
  element.x = Math.min(Math.max(Math.round(element.x), minX), maxX);
  element.y = Math.min(Math.max(Math.round(element.y), minY), maxY);
  return inside(containBounds(element), canvas);
}

// ---- ids and selection ------------------------------------------------------------------------------------------------------------------------------
function usedIds(doc) {
  const used = new Set();
  for (const stage of doc.stages) {
    used.add(stage.id);
    for (const element of stage.elements) { used.add(element.id); if (element.groupId) used.add(element.groupId); }
  }
  return used;
}
// Deterministic, document-unique id: prefix_<n> for the smallest unused n.
export function nextId(doc, prefix, taken = new Set()) {
  const used = usedIds(doc);
  let n = 1;
  while (used.has(`${prefix}_${n}`) || taken.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

// Selecting one member of a group selects the whole group (groups are not nested, so one step is enough).
export function expandSelection(stage, ids) {
  const wanted = new Set(ids);
  const groups = new Set(stage.elements.filter(element => wanted.has(element.id) && element.groupId).map(element => element.groupId));
  return stage.elements.filter(element => wanted.has(element.id) || (element.groupId && groups.has(element.groupId))).map(element => element.id);
}
// One stage id for a set of element ids, or null when they span stages / do not exist.
function commonStage(doc, ids) {
  let stage = null;
  for (const id of ids) {
    const found = locate(doc, id);
    if (!found || (stage && found.stage !== stage)) return null;
    stage = found.stage;
  }
  return stage;
}
// Rewrites z as a dense 0..n-1 sequence in the given order.
function assignZ(stage, orderedElements) {
  orderedElements.forEach((element, index) => { element.z = index; });
  stage.elements = orderedElements;
}
const normalizeStageZ = stage => assignZ(stage, ordered(stage));

// ---- stages -----------------------------------------------------------------------------------------------------------------------------------------
export function addStage(doc, { afterIndex } = {}) {
  const next = clone(doc);
  const id = nextId(doc, "stage");
  const at = Number.isInteger(afterIndex) ? Math.min(Math.max(afterIndex + 1, 0), next.stages.length) : next.stages.length;
  next.stages.splice(at, 0, { id, elements: [] });
  return finish(doc, next, { stageId: id });
}
export function reorderStage(doc, stageId, toIndex) {
  const from = stageIndex(doc, stageId);
  if (from < 0) return fail(doc, "STAGE_NOT_FOUND");
  const to = Math.min(Math.max(toIndex, 0), doc.stages.length - 1);
  if (to === from) return { ok: true, doc };
  const next = clone(doc);
  const [moved] = next.stages.splice(from, 1);
  next.stages.splice(to, 0, moved);
  return finish(doc, next);
}
// Deleting a stage that holds elements needs `force` (the editor asks the owner to confirm first). The last remaining stage can never be deleted.
export function deleteStage(doc, stageId, { force = false } = {}) {
  const stage = findStage(doc, stageId);
  if (!stage) return fail(doc, "STAGE_NOT_FOUND");
  if (doc.stages.length <= 1) return fail(doc, "LAST_STAGE");
  if (stage.elements.length > 0 && !force) return { ...fail(doc, "STAGE_NOT_EMPTY"), elementCount: stage.elements.length };
  const next = clone(doc);
  next.stages = next.stages.filter(candidate => candidate.id !== stageId);
  return finish(doc, next);
}
// Moves whole groups/elements to another stage, on top of it, keeping their relative order. Sizes are kept; positions are clamped inside the stage.
export function moveElementsToStage(doc, ids, toStageId) {
  const source = commonStage(doc, ids);
  const target = findStage(doc, toStageId);
  if (!source) return fail(doc, "SELECTION_INVALID");
  if (!target) return fail(doc, "STAGE_NOT_FOUND");
  if (source.id === target.id) return { ok: true, doc };
  const next = clone(doc);
  const from = findStage(next, source.id), to = findStage(next, toStageId);
  const moving = new Set(expandSelection(from, ids));
  const moved = ordered(from).filter(element => moving.has(element.id));
  for (const element of moved) if (!clampToCanvas(element, next.canvas)) return fail(doc, "OUTSIDE_CANVAS");
  from.elements = from.elements.filter(element => !moving.has(element.id));
  normalizeStageZ(from);
  const top = to.elements.length;
  moved.forEach((element, index) => { element.z = top + index; });
  to.elements.push(...moved);
  normalizeStageZ(to);
  return finish(doc, next);
}

// ---- adding elements --------------------------------------------------------------------------------------------------------------------------------
export const ELEMENT_KINDS = Object.freeze({
  text: { type: "text", width: 800, height: 140, payload: () => createTextPayload() },
  rect: { type: "rect", width: 400, height: 260, payload: () => ({ fill: "#8b5dff" }) },
  rounded: { type: "rect", width: 400, height: 260, payload: () => ({ fill: "#62e7ff", radius: 48 }) },
  circle: { type: "rect", width: 300, height: 300, payload: () => ({ fill: "#ff4fd8", radius: 1000 }) },
});

export function addElement(doc, stageId, kind, { x, y } = {}) {
  const preset = ELEMENT_KINDS[kind];
  const stage = findStage(doc, stageId);
  if (!preset || !stage) return fail(doc, !preset ? "UNKNOWN_KIND" : "STAGE_NOT_FOUND");
  const next = clone(doc);
  const target = findStage(next, stageId);
  const id = nextId(doc, "el");
  const element = createElement({
    id, type: preset.type, width: preset.width, height: preset.height, z: target.elements.length, payload: preset.payload(),
    x: Math.round(x ?? (next.canvas.width - preset.width) / 2), y: Math.round(y ?? (next.canvas.height - preset.height) / 2),
  });
  clampToCanvas(element, next.canvas);
  target.elements.push(element);
  normalizeStageZ(target);
  return finish(doc, next, { ids: [id] });
}

// Adds an element of any registered type with a ready payload (image, embed, GamID block, ...), centred (or at x/y), on top. Larger than the stage -> shrunk to fit.
export function addCustomElement(doc, stageId, { type, payload, width, height, x, y }) {
  const stage = findStage(doc, stageId);
  if (!stage) return fail(doc, "STAGE_NOT_FOUND");
  if (!elementRegistry.get(type)) return fail(doc, `UNKNOWN_ELEMENT_TYPE:${type}`);
  const next = clone(doc);
  const target = findStage(next, stageId);
  const fitScale = Math.min(1, next.canvas.width / width, next.canvas.height / height);
  const w = Math.max(MIN_SIZE, Math.round(width * fitScale)), h = Math.max(MIN_SIZE, Math.round(height * fitScale));
  const id = nextId(doc, "el");
  const element = createElement({ id, type, x: Math.round(x ?? (next.canvas.width - w) / 2), y: Math.round(y ?? (next.canvas.height - h) / 2), width: w, height: h, z: target.elements.length, payload: clone(payload) });
  clampToCanvas(element, next.canvas);
  target.elements.push(element);
  normalizeStageZ(target);
  return finish(doc, next, { ids: [id] });
}

// The Wall-wide background (scope "wall") or one stage's own background (scope = stage id); `background` null removes it.
export function setBackground(doc, scope, background) {
  const next = clone(doc);
  const holder = scope === "wall" ? next : findStage(next, scope);
  if (!holder) return fail(doc, "STAGE_NOT_FOUND");
  if (background === null || background === undefined) delete holder.background; else holder.background = clone(background);
  return finish(doc, next);
}

// Every uploaded asset the document uses (image elements and image backgrounds): what may not be deleted from the Assets area while in use.
export function assetsInUse(doc) {
  const used = new Set();
  const scan = value => { if (value && typeof value === "object") { if (typeof value.assetId === "string") used.add(value.assetId); for (const child of Object.values(value)) scan(child); } };
  scan(doc.background);
  for (const stage of doc.stages) { scan(stage.background); for (const element of stage.elements) scan(element.payload); }
  return used;
}

// A fixed aspect ratio (width / height) an element should keep while it is resized, or null. Embeds keep their provider's real ratio (video is never stretched);
// pictures keep the proportions of their source unless they are drawn cover/fill (which crop or stretch by intent).
export function lockedAspect(element) {
  if (element.type === "embed") {
    const ratio = elementRegistry.get("embed")?.render?.(element.payload)?.content?.aspect;
    const match = /^(\d+):(\d+)$/.exec(ratio ?? "");
    return match ? Number(match[1]) / Number(match[2]) : null;
  }
  if (element.type === "image" && element.payload.fit === "contain" && element.payload.aw && element.payload.ah) return element.payload.aw / element.payload.ah;
  return null;
}
// ---- editing ----------------------------------------------------------------------------------------------------------------------------------------
// Merges a partial payload into the element's type-owned payload. A key set to `undefined` is removed (that is how an optional effect is switched off).
export function updatePayload(doc, id, patch) {
  const found = locate(doc, id);
  if (!found) return fail(doc, "ELEMENT_NOT_FOUND");
  const next = clone(doc);
  const element = locate(next, id).element;
  const payload = { ...element.payload };
  for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete payload[key]; else payload[key] = value; }
  element.payload = payload;
  return finish(doc, next);
}
// Same payload change applied to several elements of the same type at once (multi-select property edits).
export function updatePayloadMany(doc, ids, patch) {
  let current = doc;
  for (const id of ids) {
    const result = updatePayload(current, id, patch);
    if (!result.ok) return fail(doc, ...result.errors);
    current = result.doc;
  }
  return { ok: true, doc: current };
}

// Numeric geometry edits from the properties panel (x, y, width, height, rotation). Always re-contained inside the stage.
export function updateGeometry(doc, id, patch) {
  const found = locate(doc, id);
  if (!found) return fail(doc, "ELEMENT_NOT_FOUND");
  const next = clone(doc);
  const element = locate(next, id).element;
  for (const key of ["x", "y", "width", "height"]) if (patch[key] !== undefined) element[key] = Number(patch[key]);
  if (patch.rotation !== undefined) {
    const rotation = normalizeAngle(Number(patch.rotation));
    if (!Number.isFinite(rotation)) return fail(doc, `INVALID_ROTATION:${id}`);
    if (rotation === 0) delete element.rotation; else element.rotation = rotation;
  }
  if ([element.x, element.y, element.width, element.height].some(value => !Number.isFinite(value))) return fail(doc, `INVALID_DIMENSIONS:${id}`);
  if (!clampToCanvas(element, next.canvas)) return fail(doc, "OUTSIDE_CANVAS");
  return finish(doc, next);
}

export function normalizeAngle(degrees) {
  if (!Number.isFinite(degrees)) return NaN;
  let angle = ((degrees + 180) % 360 + 360) % 360 - 180;   // (-180, 180]
  if (angle === -180) angle = 180;
  return Math.round(angle * 10) / 10;
}

export function rotateElement(doc, id, degrees) {
  const found = locate(doc, id);
  if (!found) return fail(doc, "ELEMENT_NOT_FOUND");
  if (found.element.groupId) return fail(doc, "GROUP_ROTATION_UNSUPPORTED");
  return updateGeometry(doc, id, { rotation: degrees });
}

// ---- move -------------------------------------------------------------------------------------------------------------------------------------------
// Moves a selection as one rigid unit by (dx, dy) whole units; the unit stops at the stage edges.
export function moveElements(doc, ids, dx, dy) {
  const stage = commonStage(doc, ids);
  if (!stage) return fail(doc, "SELECTION_INVALID");
  const next = clone(doc);
  const nextStage = findStage(next, stage.id);
  const moving = new Set(expandSelection(nextStage, ids));
  const members = nextStage.elements.filter(element => moving.has(element.id));
  const box = unionContain(members);
  const minDx = Math.ceil(-box.x - EPS), maxDx = Math.floor(next.canvas.width - box.width - box.x + EPS);
  const minDy = Math.ceil(-box.y - EPS), maxDy = Math.floor(next.canvas.height - box.height - box.y + EPS);
  const moveX = Math.min(Math.max(Math.round(dx), minDx), Math.max(minDx, maxDx));
  const moveY = Math.min(Math.max(Math.round(dy), minDy), Math.max(minDy, maxDy));
  for (const element of members) { element.x += moveX; element.y += moveY; }
  return finish(doc, next, { dx: moveX, dy: moveY });
}

// ---- resize -----------------------------------------------------------------------------------------------------------------------------------------
export const HANDLES = Object.freeze({
  nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1], e: [1, 0], w: [-1, 0],
});

function resizeGeometry(start, handle, dx, dy, keepAspect, canvas) {
  const [sx, sy] = HANDLES[handle];
  const angle = radians(start.rotation), cos = Math.cos(angle), sin = Math.sin(angle);
  // pointer delta in the element's own (rotated) axes
  const localX = dx * cos + dy * sin, localY = -dx * sin + dy * cos;
  let width = start.width + sx * localX, height = start.height + sy * localY;
  if (keepAspect && sx !== 0 && sy !== 0) {
    const factor = Math.max(width / start.width, height / start.height);
    width = start.width * factor; height = start.height * factor;
  } else if (keepAspect && sx !== 0) {
    height = start.height * (width / start.width);   // a side handle on a proportion-locked element scales the whole element
  }
  width = Math.max(MIN_SIZE, width); height = Math.max(MIN_SIZE, height);
  // keep the opposite edge/corner fixed in world space
  const anchorLocal = [-sx * start.width / 2, -sy * start.height / 2];
  const centre = [start.x + start.width / 2, start.y + start.height / 2];
  const anchor = [centre[0] + anchorLocal[0] * cos - anchorLocal[1] * sin, centre[1] + anchorLocal[0] * sin + anchorLocal[1] * cos];
  const newAnchorLocal = [-sx * width / 2, -sy * height / 2];
  const newCentre = [anchor[0] - (newAnchorLocal[0] * cos - newAnchorLocal[1] * sin), anchor[1] - (newAnchorLocal[0] * sin + newAnchorLocal[1] * cos)];
  return { x: Math.round(newCentre[0] - width / 2), y: Math.round(newCentre[1] - height / 2), width: Math.round(width), height: Math.round(height) };
}

// Resizes ONE element from the geometry it had when the gesture started. The dragged edge stops at the stage boundary.
export function resizeElement(doc, id, handle, dx, dy, { keepAspect = false } = {}) {
  const found = locate(doc, id);
  if (!found || !HANDLES[handle]) return fail(doc, !found ? "ELEMENT_NOT_FOUND" : "UNKNOWN_HANDLE");
  if (found.element.groupId) return fail(doc, "GROUP_ELEMENT_RESIZE_UNSUPPORTED");
  const start = found.element;
  let geometry = null;
  // shrink the gesture toward zero until it fits: exact for unrotated elements after the first pass below, fine-stepped for rotated ones
  for (let step = 40; step >= 0; step -= 1) {
    const t = step / 40;
    const candidate = resizeGeometry(start, handle, dx * t, dy * t, keepAspect, doc.canvas);
    if (inside(containBounds({ ...start, ...candidate }), doc.canvas)) { geometry = candidate; break; }
  }
  if (!geometry) return { ok: true, doc };
  if (!start.rotation) {
    // exact edge stop for the common (unrotated) case: clamp the dragged edges onto the stage instead of the 1/40 stepping above
    const [sx, sy] = HANDLES[handle];
    const free = resizeGeometry(start, handle, dx, dy, keepAspect, doc.canvas);
    const fits = candidate => inside(candidate, doc.canvas);
    if (fits(free)) geometry = free;
    else if (!keepAspect) {
      const right = start.x + start.width, bottom = start.y + start.height;
      const left = sx < 0 ? Math.max(0, Math.min(free.x, right - MIN_SIZE)) : start.x;
      const top = sy < 0 ? Math.max(0, Math.min(free.y, bottom - MIN_SIZE)) : start.y;
      const farRight = sx > 0 ? Math.min(doc.canvas.width, Math.max(free.x + free.width, start.x + MIN_SIZE)) : right;
      const farBottom = sy > 0 ? Math.min(doc.canvas.height, Math.max(free.y + free.height, start.y + MIN_SIZE)) : bottom;
      geometry = { x: left, y: top, width: farRight - left, height: farBottom - top };
    }
  }
  const next = clone(doc);
  Object.assign(locate(next, id).element, geometry);
  return finish(doc, next);
}

// Uniformly resizes a whole selection (a group or a multi-selection) about the corner opposite the dragged one. Sizes, positions and type-owned sizes (via the
// type's `scale` hook) all follow one factor, so the composition is preserved.
export function resizeGroup(doc, ids, handle, dx, dy) {
  const stage = commonStage(doc, ids);
  if (!stage) return fail(doc, "SELECTION_INVALID");
  const corner = HANDLES[handle];
  if (!corner || corner[0] === 0 || corner[1] === 0) return fail(doc, "UNKNOWN_HANDLE");
  const [sx, sy] = corner;
  const next = clone(doc);
  const nextStage = findStage(next, stage.id);
  const moving = new Set(expandSelection(nextStage, ids));
  const members = nextStage.elements.filter(element => moving.has(element.id));
  const box = unionContain(members);
  let factor = Math.max((box.width + sx * dx) / box.width, (box.height + sy * dy) / box.height);
  const smallest = Math.min(...members.map(element => Math.min(element.width, element.height)));
  factor = Math.max(factor, MIN_SIZE / smallest);
  const anchor = { x: sx > 0 ? box.x : box.x + box.width, y: sy > 0 ? box.y : box.y + box.height };
  const room = {
    x: sx > 0 ? next.canvas.width - anchor.x : anchor.x,
    y: sy > 0 ? next.canvas.height - anchor.y : anchor.y,
  };
  factor = Math.min(factor, room.x / box.width, room.y / box.height);
  factor = Math.floor(factor * 1000) / 1000;
  if (!(factor > 0)) return { ok: true, doc };
  for (const element of members) {
    const centre = [element.x + element.width / 2, element.y + element.height / 2];
    const newCentre = [anchor.x + (centre[0] - anchor.x) * factor, anchor.y + (centre[1] - anchor.y) * factor];
    element.width = Math.max(MIN_SIZE, Math.round(element.width * factor));
    element.height = Math.max(MIN_SIZE, Math.round(element.height * factor));
    element.x = Math.round(newCentre[0] - element.width / 2);
    element.y = Math.round(newCentre[1] - element.height / 2);
    const scale = elementRegistry.get(element.type)?.scale;
    if (scale) element.payload = scale(element.payload, factor);
    if (!clampToCanvas(element, next.canvas)) return fail(doc, "OUTSIDE_CANVAS");
  }
  return finish(doc, next, { factor });
}

// "Bigger / 2x bigger" - the gesture-free way to recover a tiny element (W0's Samsung finding). Scales about the element's centre, staying inside the stage.
export function scaleSelection(doc, ids, factor) {
  const stage = commonStage(doc, ids);
  if (!stage || !(factor > 0)) return fail(doc, "SELECTION_INVALID");
  const next = clone(doc);
  const nextStage = findStage(next, stage.id);
  const moving = new Set(expandSelection(nextStage, ids));
  const members = nextStage.elements.filter(element => moving.has(element.id));
  const box = unionContain(members);
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  const maxFactor = Math.min(next.canvas.width / box.width, next.canvas.height / box.height);
  const applied = Math.min(factor, maxFactor);
  for (const element of members) {
    const elementCentre = [element.x + element.width / 2, element.y + element.height / 2];
    const newCentre = [centre[0] + (elementCentre[0] - centre[0]) * applied, centre[1] + (elementCentre[1] - centre[1]) * applied];
    element.width = Math.max(MIN_SIZE, Math.round(element.width * applied));
    element.height = Math.max(MIN_SIZE, Math.round(element.height * applied));
    element.x = Math.round(newCentre[0] - element.width / 2);
    element.y = Math.round(newCentre[1] - element.height / 2);
    const scale = elementRegistry.get(element.type)?.scale;
    if (scale) element.payload = scale(element.payload, applied);
    if (!clampToCanvas(element, next.canvas)) return fail(doc, "OUTSIDE_CANVAS");
  }
  return finish(doc, next);
}

// ---- layers / z-order -------------------------------------------------------------------------------------------------------------------------------
export const Z_MODES = Object.freeze(["forward", "backward", "front", "back"]);
export function reorderLayers(doc, ids, mode) {
  const stage = commonStage(doc, ids);
  if (!stage || !Z_MODES.includes(mode)) return fail(doc, "SELECTION_INVALID");
  const next = clone(doc);
  const nextStage = findStage(next, stage.id);
  const selected = new Set(expandSelection(nextStage, ids));
  const list = ordered(nextStage);
  let result = list;
  if (mode === "front") result = [...list.filter(element => !selected.has(element.id)), ...list.filter(element => selected.has(element.id))];
  else if (mode === "back") result = [...list.filter(element => selected.has(element.id)), ...list.filter(element => !selected.has(element.id))];
  else if (mode === "forward") {
    for (let i = list.length - 2; i >= 0; i -= 1) if (selected.has(list[i].id) && !selected.has(list[i + 1].id)) [list[i], list[i + 1]] = [list[i + 1], list[i]];
  } else {
    for (let i = 1; i < list.length; i += 1) if (selected.has(list[i].id) && !selected.has(list[i - 1].id)) [list[i], list[i - 1]] = [list[i - 1], list[i]];
  }
  assignZ(nextStage, result);
  return finish(doc, next);
}

// ---- duplicate / delete -----------------------------------------------------------------------------------------------------------------------------
export function duplicateElements(doc, ids) {
  const stage = commonStage(doc, ids);
  if (!stage) return fail(doc, "SELECTION_INVALID");
  const next = clone(doc);
  const nextStage = findStage(next, stage.id);
  const chosen = new Set(expandSelection(nextStage, ids));
  const sources = ordered(nextStage).filter(element => chosen.has(element.id));
  const taken = new Set();
  const claim = prefix => { const id = nextId(next, prefix, taken); taken.add(id); return id; };
  const groupMap = new Map();
  const copies = sources.map(source => {
    const copy = clone(source);
    copy.id = claim("el");
    if (source.groupId) { if (!groupMap.has(source.groupId)) groupMap.set(source.groupId, claim("group")); copy.groupId = groupMap.get(source.groupId); }
    return copy;
  });
  // a safe positional offset: down-right, or back up-left when that would leave the stage, or none when the unit fills the stage
  const box = unionContain(copies);
  const offsetX = box.x + box.width + DUPLICATE_OFFSET <= next.canvas.width ? DUPLICATE_OFFSET : box.x - DUPLICATE_OFFSET >= 0 ? -DUPLICATE_OFFSET : 0;
  const offsetY = box.y + box.height + DUPLICATE_OFFSET <= next.canvas.height ? DUPLICATE_OFFSET : box.y - DUPLICATE_OFFSET >= 0 ? -DUPLICATE_OFFSET : 0;
  const top = nextStage.elements.length;
  copies.forEach((copy, index) => { copy.x += offsetX; copy.y += offsetY; copy.z = top + index; });
  nextStage.elements.push(...copies);
  normalizeStageZ(nextStage);
  return finish(doc, next, { ids: copies.map(copy => copy.id) });
}

export function deleteElements(doc, ids) {
  const stage = commonStage(doc, ids);
  if (!stage) return fail(doc, "SELECTION_INVALID");
  const next = clone(doc);
  const nextStage = findStage(next, stage.id);
  const doomed = new Set(expandSelection(nextStage, ids));
  nextStage.elements = nextStage.elements.filter(element => !doomed.has(element.id));
  normalizeStageZ(nextStage);
  return finish(doc, next, { removed: [...doomed] });
}

// ---- groups -----------------------------------------------------------------------------------------------------------------------------------------
// Groups are the shared `groupId` of elements in one stage (no nesting). Grouping makes the members contiguous in the layer order, at the topmost member's slot.
export function groupElements(doc, ids) {
  const stage = commonStage(doc, ids);
  if (!stage) return fail(doc, "SELECTION_INVALID");
  const next = clone(doc);
  const nextStage = findStage(next, stage.id);
  const chosen = new Set(expandSelection(nextStage, ids));
  if (chosen.size < 2) return fail(doc, "GROUP_NEEDS_TWO");
  const groupId = nextId(doc, "group");
  const list = ordered(nextStage);
  const topIndex = Math.max(...list.map((element, index) => (chosen.has(element.id) ? index : -1)));
  const members = list.filter(element => chosen.has(element.id));
  const others = list.filter(element => !chosen.has(element.id));
  const slot = list.slice(0, topIndex + 1).filter(element => !chosen.has(element.id)).length;
  for (const member of members) member.groupId = groupId;
  assignZ(nextStage, [...others.slice(0, slot), ...members, ...others.slice(slot)]);
  return finish(doc, next, { groupId, ids: members.map(member => member.id) });
}

export function ungroupElements(doc, ids) {
  const stage = commonStage(doc, ids);
  if (!stage) return fail(doc, "SELECTION_INVALID");
  const next = clone(doc);
  const nextStage = findStage(next, stage.id);
  const chosen = new Set(expandSelection(nextStage, ids));
  let changed = 0;
  for (const element of nextStage.elements) if (chosen.has(element.id) && element.groupId) { delete element.groupId; changed += 1; }
  if (!changed) return fail(doc, "NOT_GROUPED");
  return finish(doc, next, { ids: [...chosen] });
}

// ---- alignment and snapping -------------------------------------------------------------------------------------------------------------------------
export const ALIGN_MODES = Object.freeze(["left", "hcenter", "right", "top", "vmiddle", "bottom"]);
// One selection aligns to the stage; several selected units (a group counts as one) align to their common bounds.
export function alignElements(doc, ids, mode) {
  const stage = commonStage(doc, ids);
  if (!stage || !ALIGN_MODES.includes(mode)) return fail(doc, "SELECTION_INVALID");
  const next = clone(doc);
  const nextStage = findStage(next, stage.id);
  const chosen = new Set(expandSelection(nextStage, ids));
  const members = nextStage.elements.filter(element => chosen.has(element.id));
  const units = new Map();
  for (const member of members) { const key = member.groupId ?? member.id; (units.get(key) ?? units.set(key, []).get(key)).push(member); }
  const boxes = [...units.values()].map(unit => ({ unit, box: unionBounds(unit) }));
  const frame = boxes.length === 1 ? { x: 0, y: 0, width: next.canvas.width, height: next.canvas.height } : unionBounds(members);
  for (const { unit, box } of boxes) {
    let dx = 0, dy = 0;
    if (mode === "left") dx = frame.x - box.x;
    if (mode === "hcenter") dx = frame.x + frame.width / 2 - (box.x + box.width / 2);
    if (mode === "right") dx = frame.x + frame.width - (box.x + box.width);
    if (mode === "top") dy = frame.y - box.y;
    if (mode === "vmiddle") dy = frame.y + frame.height / 2 - (box.y + box.height / 2);
    if (mode === "bottom") dy = frame.y + frame.height - (box.y + box.height);
    for (const element of unit) { element.x += Math.round(dx); element.y += Math.round(dy); }
  }
  for (const element of members) if (!clampToCanvas(element, next.canvas)) return fail(doc, "OUTSIDE_CANVAS");
  return finish(doc, next);
}

// Smart guides for a box being dragged: snaps its left/centre/right and top/middle/bottom to the stage edges, the stage centre lines and the edges/centres of
// the other elements, within `threshold` units. Returns the correction to apply and the guide lines to draw.
export function computeSnap(box, stage, excludeIds, canvas, threshold = SNAP_THRESHOLD) {
  const skip = new Set(excludeIds);
  const xLines = [0, canvas.width / 2, canvas.width], yLines = [0, canvas.height / 2, canvas.height];
  for (const element of stage.elements) {
    if (skip.has(element.id)) continue;
    const other = elementBounds(element);
    xLines.push(other.x, other.x + other.width / 2, other.x + other.width);
    yLines.push(other.y, other.y + other.height / 2, other.y + other.height);
  }
  const best = (edges, lines) => {
    let winner = null;
    for (const edge of edges) for (const line of lines) {
      const delta = line - edge;
      if (Math.abs(delta) <= threshold && (winner === null || Math.abs(delta) < Math.abs(winner.delta))) winner = { delta, line };
    }
    return winner;
  };
  const snapX = best([box.x, box.x + box.width / 2, box.x + box.width], xLines);
  const snapY = best([box.y, box.y + box.height / 2, box.y + box.height], yLines);
  const guides = [];
  if (snapX) guides.push({ axis: "x", at: snapX.line });
  if (snapY) guides.push({ axis: "y", at: snapY.line });
  return { dx: snapX ? Math.round(snapX.delta) : 0, dy: snapY ? Math.round(snapY.delta) : 0, guides };
}

// ---- hit testing ------------------------------------------------------------------------------------------------------------------------------------
// Does a point (in stage units) fall inside the element's rotated box, grown by `slop` units on every side?
export function elementContainsPoint(element, px, py, slop = 0) {
  const angle = -radians(element.rotation), cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = px - (element.x + element.width / 2), dy = py - (element.y + element.height / 2);
  const localX = dx * cos - dy * sin, localY = dx * sin + dy * cos;
  return Math.abs(localX) <= element.width / 2 + slop && Math.abs(localY) <= element.height / 2 + slop;
}
// The element a tap on (px, py) means: the top-most exact hit, else the top-most element within `slop` (so a tiny element stays selectable - W0's Samsung finding).
export function hitTest(stage, px, py, slop = 0) {
  const top = ordered(stage).reverse();
  return top.find(element => elementContainsPoint(element, px, py, 0)) ?? (slop > 0 ? top.find(element => elementContainsPoint(element, px, py, slop)) ?? null : null);
}

// The layer list, top-most first, as shown in the Layers panel.
export const layerList = stage => ordered(stage).reverse();
