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
import { createElement, CANONICAL_CANVAS } from "../wall/schema.js";
import { createTextPayload } from "./text.js";
import { GAMID_BLOCK_INFO } from "./gamid.js";
import { cropRatio, MIN_SLICE, SPLIT_COUNTS, SLICE_DIRS } from "./image.js";
import { DATA_COLLECTIONS } from "./gamid-data.js";
import { PROVIDERS } from "./embed/engine.js";
import "./register.js";   // every element type, background kind and embed provider the kit provides

export const MIN_SIZE = 10;
export const DUPLICATE_OFFSET = 24;
export const SNAP_THRESHOLD = 8;

const clone = value => structuredClone(value);
const zThenId = (a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const EPS = 1e-6;

// ---- per-type minimum sizes -------------------------------------------------------------------------------------------------------------------------------
// Minimums are in canonical units, judged on the NARROWEST supported column (360 CSS px, W0's worst case: 1 unit = 0.36 px), so a minimum holds on every phone.
//   shapes, text, images   MIN_SIZE (10 units): decorative pieces stay fully flexible.
//   embed player           the provider's documented tile minimum when it declares one (YouTube: a thumbnail that starts playback must be at least 120x70 px ->
//                          334 x 195 units, turned to match a portrait player), and at least the provider's inline frame minimum plus the Close bar, because a
//                          Player always plays inside its own element (Round 2). Otherwise the smallest facade that still shows its ▶ and title (PLAYER_TILE_MIN).
//   embed card             the smallest card whose provider chip + one title line fit inside its padding (paint.js facadeLayout): 300 x 150 units - a card can
//                          never be shrunk into a clipped, broken box (manual-QA finding); its hint line appears once there is room for it.
//   embed link             the smallest pill whose one title line fits: 300 x 80 units.
//   GamID block            the block's own smallest readable layout (GAMID_BLOCK_INFO[block].minSize: its title plus a first row of real content).
// Every minimum is at least the WCAG 2.2 AA touch target (24 x 24 CSS px = 67 x 67 units).
export const NARROWEST_COLUMN_PX = 360;
export const TOUCH_TARGET_PX = 24;
export const pxToMinUnits = cssPx => Math.ceil(cssPx * CANONICAL_CANVAS.width / NARROWEST_COLUMN_PX);
const BASE_MIN = Object.freeze({ width: MIN_SIZE, height: MIN_SIZE });
const TOUCH_MIN = Object.freeze({ width: pxToMinUnits(TOUCH_TARGET_PX), height: pxToMinUnits(TOUCH_TARGET_PX) });

const embedDescriptor = element => elementRegistry.get("embed")?.render?.(element.payload)?.content ?? null;
const ratioOf = aspect => { const match = /^(\d+):(\d+)$/.exec(aspect ?? ""); return match ? Number(match[1]) / Number(match[2]) : null; };

export const CARD_MIN = Object.freeze({ width: 300, height: 150 });
export const LINK_MIN = Object.freeze({ width: 300, height: 80 });
export const PLAYER_TILE_MIN = Object.freeze({ long: 200, short: 140 });   // 60 padding + the 74 ▶ fit the short side; the title fits the long side
export const INLINE_CLOSE_BAR_UNITS = 44;   // = player.js INLINE_BAR_PX at full scale
export function minSizeOf(element) {
  if (element.type === "embed") {
    const descriptor = embedDescriptor(element);
    if (!descriptor) return TOUCH_MIN;
    if (descriptor.presentation === "link") return LINK_MIN;
    if (!descriptor.inline) return CARD_MIN;
    const tile = PROVIDERS.get(descriptor.providerKey)?.kinds?.[descriptor.contentKind]?.minTile;
    const long = tile ? pxToMinUnits(Math.max(tile.w, tile.h)) : PLAYER_TILE_MIN.long, short = tile ? pxToMinUnits(Math.min(tile.w, tile.h)) : PLAYER_TILE_MIN.short;
    const portrait = (ratioOf(descriptor.aspect) ?? 1) < 1;
    // Round 2 inline contract: a Player plays inside its own element, so at full scale (1 unit = 1 CSS px) the element must hold the provider's comfortable frame
    // minimum PLUS the inline Close bar.
    const inline = descriptor.minFrame ?? descriptor.minInline;
    const turn = inline && portrait && inline.w > inline.h;   // a landscape minimum turned for a portrait shape (YouTube 9:16)
    const frameW = inline ? (turn ? inline.h : inline.w) : 0, frameH = inline ? (turn ? inline.w : inline.h) + INLINE_CLOSE_BAR_UNITS : 0;
    return { width: Math.max(portrait ? short : long, frameW), height: Math.max(portrait ? long : short, frameH) };
  }
  if (element.type === "gamid") return GAMID_BLOCK_INFO[element.payload?.block]?.minSize ?? BASE_MIN;
  if (element.type === "gamidData" && DATA_COLLECTIONS[element.payload?.field]) return GAMID_BLOCK_INFO[DATA_COLLECTIONS[element.payload.field]]?.minSize ?? BASE_MIN;   // a live collection is the block
  return BASE_MIN;
}

// The smallest scale factor a uniform resize (pinch, Bigger/Smaller, group handles) may apply to a set of elements. Never above 1: an element that is already below
// its minimum (a document made before minimums existed) can still grow, it just cannot shrink further.
function shrinkFloor(elements) {
  let floor = 0;
  for (const element of elements) { const min = minSizeOf(element); floor = Math.max(floor, min.width / element.width, min.height / element.height); }
  return Math.min(1, floor);
}
// Per-member floor after rounding a uniform resize: the element's minimum, but never more than its size before the resize (an older, smaller element is not enlarged).
function minFloorFor(element) {
  const min = minSizeOf(element);
  return { width: Math.max(MIN_SIZE, Math.min(min.width, element.width)), height: Math.max(MIN_SIZE, Math.min(min.height, element.height)) };
}

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
  if (!valid) return fail(previous, ...errors);
  const lifts = next.stages.flatMap(stage => liftPlayers(stage));   // z-only: a valid document stays valid
  return { ok: true, doc: next, ...extras, ...(lifts.length ? { embedLifts: lifts } : {}) };
}

// ---- embed layering -----------------------------------------------------------------------------------------------------------------------------------------
// Invariant (W0's embed rule, expressed on z-order): a provider PLAYER (an embed shown as "Player") is never painted below another element whose box overlaps it.
// Nothing can then cover part of a player (providers forbid drawing over their player) or sit in front of its facade and take the tap that starts it. Only the
// player's z moves, just above whatever overlapped it; every other layer choice is left exactly as the owner made it, elements may still sit BEHIND a player, and
// links / cards (ordinary anchors) are arranged freely. Two players are not reordered against each other. z-only, so documents stay valid for the W1 validator.
const isPlayer = element => element.type === "embed" && embedDescriptor(element)?.inline === true;
function boxesOverlap(a, b) {
  const A = elementBounds(a), B = elementBounds(b);
  return A.x < B.x + B.width - 0.5 && B.x < A.x + A.width - 0.5 && A.y < B.y + B.height - 0.5 && B.y < A.y + A.height - 0.5;
}
// Mutates the stage's z-order; returns [{ stageId, player, above }] for every lift made.
function liftPlayers(stage) {
  if (!stage.elements.some(isPlayer)) return [];
  const list = ordered(stage);
  const player = new Map(list.map(element => [element.id, isPlayer(element)]));
  const lifts = [];
  for (let guard = 0; guard < list.length * list.length + 1; guard += 1) {
    let found = null;
    for (let i = 0; i < list.length && !found; i += 1) {
      if (!player.get(list[i].id)) continue;
      for (let j = list.length - 1; j > i; j -= 1) if (!player.get(list[j].id) && boxesOverlap(list[i], list[j])) { found = [i, j]; break; }
    }
    if (!found) break;
    const [i, j] = found;
    const [moved] = list.splice(i, 1);
    list.splice(j, 0, moved);   // j is now the slot just above the top-most element that overlapped it
    lifts.push({ stageId: stage.id, player: moved.id, above: list[j - 1].id });
  }
  if (lifts.length) assignZ(stage, list);
  return lifts;
}
// The same invariant applied to a document that was saved before it existed (Preview uses this, so a visitor-style view never shows anything over a player).
export function normalizeEmbedLayering(doc) {
  const next = clone(doc);
  const lifts = next.stages.flatMap(stage => liftPlayers(stage));
  return lifts.length ? { doc: next, lifts } : { doc, lifts };
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
// `min` is the size floor to apply: the generic floor for moves/alignment (so an older, smaller element is never silently enlarged), the element's own
// per-type minimum where its SIZE is being set (numeric size fields, adding an element).
function clampToCanvas(element, canvas, min = BASE_MIN) {
  if (!element.rotation) {
    element.width = Math.min(Math.max(min.width, Math.round(element.width)), canvas.width);
    element.height = Math.min(Math.max(min.height, Math.round(element.height)), canvas.height);
    element.x = Math.min(Math.max(0, Math.round(element.x)), canvas.width - element.width);
    element.y = Math.min(Math.max(0, Math.round(element.y)), canvas.height - element.height);
    return true;
  }
  element.width = Math.max(min.width, Math.round(element.width));
  element.height = Math.max(min.height, Math.round(element.height));
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
// What deleting a stage would remove - for the confirmation the editor ALWAYS shows before deleting any stage (empty, background-only or with elements).
export function stageDeletionInfo(doc, stageId) {
  const index = stageIndex(doc, stageId);
  if (index < 0) return null;
  const stage = doc.stages[index];
  return { stageId, number: index + 1, elementCount: stage.elements.length, hasBackground: stage.background !== undefined && stage.background !== null, isLast: doc.stages.length <= 1 };
}
// The destinations offered for "Move to stage": every OTHER stage, in Wall order, named by its number (so any stage is one step away - Stage 1 -> Stage 4).
export const stageMoveOptions = (doc, currentStageId) => doc.stages.map((stage, index) => ({ id: stage.id, label: `Stage ${index + 1}` })).filter(option => option.id !== currentStageId);
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
  clampToCanvas(element, next.canvas, minSizeOf(element));
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

// The aspect ratio (width / height) an element is held to while it is resized, or null for a free resize. The value itself is the lock - resizing never falls back
// to whatever shape the box happens to have:
//   - a PLAYER keeps the aspect SELECTED for it (the provider's default, or the owner's choice from the adapter's own list): a 9:16 player stays 9:16 (video is never
//     stretched); providers with an "auto" layout (Spotify, ...) resize freely;
//   - a link / card of fixed-ratio content keeps the proportions of its own card box (the video's ratio does not apply to a card);
//   - a picture drawn "show whole picture" keeps its source proportions; cover/fill crop or stretch by intent.
export function lockedAspect(element) {
  if (element.type === "embed") {
    const descriptor = embedDescriptor(element);
    const ratio = ratioOf(descriptor?.aspect);
    if (!ratio) return null;
    return descriptor.inline ? ratio : element.width / element.height;
  }
  if (element.type === "image") {
    // Round 3: a crop window keeps its own proportions (the crop IS the picture now); a split piece keeps its band of the whole artwork's proportions
    const { aw, ah, crop, slice, fit } = element.payload;
    const base = crop && aw && ah ? cropRatio(crop, aw, ah) : fit === "contain" && aw && ah ? aw / ah : null;
    if (!base) return null;
    if (!slice) return base;
    const band = slice.to - slice.from;
    return slice.dir === "h" ? base / band : base * band;
  }
  return null;
}

// Refits a box to `ratio` keeping its centre and (about) its area - so 16:9 -> 9:16 turns a landscape player into a portrait one of similar size rather than a
// giant or a sliver - then keeps it inside the stage and at least its minimum size. Whole units; the height follows the rounded width exactly.
function refitToRatio(element, ratio, canvas) {
  const min = minSizeOf(element);
  const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
  let width = Math.sqrt(element.width * element.height * ratio), height = width / ratio;
  const fit = Math.min(1, canvas.width / width, canvas.height / height);
  width *= fit; height *= fit;
  const grow = Math.max(1, min.width / width, min.height / height);
  width = Math.min(canvas.width, Math.round(width * grow));
  height = Math.round(width / ratio);
  if (height > canvas.height) { height = canvas.height; width = Math.round(height * ratio); }
  element.width = width; element.height = height;
  element.x = Math.round(cx - width / 2); element.y = Math.round(cy - height / 2);
}

// Changes an embed's own data (presentation, aspect, caption) from the editor. When the result is a PLAYER whose aspect or presentation changed, the box is refitted
// to the selected aspect in the same step (one undo step), so what the owner sees is the shape that will play. A key set to `undefined` is removed.
export function setEmbedData(doc, id, patch) {
  const found = locate(doc, id);
  if (!found) return fail(doc, "ELEMENT_NOT_FOUND");
  if (found.element.type !== "embed") return fail(doc, "NOT_AN_EMBED");
  // a Player may only take a shape its provider offers for this content (the adapter's own list, never another provider's)
  const kindSpec = PROVIDERS.get(found.element.payload.providerKey)?.kinds?.[found.element.payload.data?.kind];
  if (patch.aspect !== undefined && !(kindSpec?.aspects ?? [kindSpec?.aspect]).includes(patch.aspect)) return fail(doc, "INVALID_ASPECT");
  const next = clone(doc);
  const element = locate(next, id).element;
  const before = embedDescriptor(element);
  const data = { ...element.payload.data };
  for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete data[key]; else data[key] = value; }
  element.payload = { ...element.payload, data };
  const { valid, errors } = validateDocument(next);
  if (!valid) return fail(doc, ...errors);
  const after = embedDescriptor(element);
  const ratio = ratioOf(after?.aspect);
  if (after?.inline && ratio && (after.aspect !== before?.aspect || !before?.inline)) {
    refitToRatio(element, ratio, next.canvas);
    if (!clampToCanvas(element, next.canvas, minSizeOf(element))) return fail(doc, "OUTSIDE_CANVAS");
  } else if (after && (after.presentation !== before?.presentation)) {
    // a new presentation brings its own minimum (a Player holds its frame + Close bar; a card its chip + title): grow into it in the same undo step
    if (!clampToCanvas(element, next.canvas, minSizeOf(element))) return fail(doc, "OUTSIDE_CANVAS");
  }
  return finish(doc, next);
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

// A GamID block, or (Round 3) a live GamID Data COLLECTION - the same block, placed as live data: both take the block style.
const isStyledBlock = element => element.type === "gamid" || (element.type === "gamidData" && !!DATA_COLLECTIONS[element.payload?.field]);
// ---- GamID block styling (Round 2) -------------------------------------------------------------------------------------------------------------------
// Merges a partial style into EACH selected GamID block's own style (a key set to `undefined` goes back to its default; an empty style is removed, so the block is
// exactly the default look again). Validated like every other edit; one undo step.
export function setGamidStyle(doc, ids, patch) {
  const next = clone(doc);
  for (const id of ids) {
    const found = locate(next, id);
    if (!found) return fail(doc, "ELEMENT_NOT_FOUND");
    if (!isStyledBlock(found.element)) return fail(doc, "NOT_A_GAMID_BLOCK");
    const style = { ...(found.element.payload.style ?? {}) };
    for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete style[key]; else style[key] = value; }
    const payload = { ...found.element.payload };
    if (Object.keys(style).length) payload.style = style; else delete payload.style;
    found.element.payload = payload;
  }
  return finish(doc, next);
}
// "Apply to all GamID blocks": copies the source block's PRESENTATION (its style only - never its block kind, layout, games count, hours switch or geometry) to every
// other GamID block on every stage. Each block keeps its own copy, so it can still be changed on its own afterwards. -> { ok, doc, count } (count = blocks changed)
export function applyGamidStyleToAll(doc, sourceId) {
  const source = locate(doc, sourceId);
  if (!source) return fail(doc, "ELEMENT_NOT_FOUND");
  if (!isStyledBlock(source.element)) return fail(doc, "NOT_A_GAMID_BLOCK");
  const style = source.element.payload.style;
  const next = clone(doc);
  let count = 0;
  for (const stage of next.stages) for (const element of stage.elements) {
    if (!isStyledBlock(element) || element.id === sourceId) continue;
    const payload = { ...element.payload };
    if (style) payload.style = structuredClone(style); else delete payload.style;
    element.payload = payload;
    count += 1;
  }
  if (!count) return fail(doc, "NO_OTHER_GAMID_BLOCKS");
  const result = finish(doc, next);
  return result.ok ? { ...result, count } : result;
}

// Numeric geometry edits from the properties panel (x, y, width, height, rotation). Always re-contained inside the stage.
export function updateGeometry(doc, id, patch) {
  const found = locate(doc, id);
  if (!found) return fail(doc, "ELEMENT_NOT_FOUND");
  if (isLocked(found.element)) return fail(doc, "ELEMENT_LOCKED");
  const next = clone(doc);
  const element = locate(next, id).element;
  for (const key of ["x", "y", "width", "height"]) if (patch[key] !== undefined) element[key] = Number(patch[key]);
  if (patch.rotation !== undefined) {
    const rotation = normalizeAngle(Number(patch.rotation));
    if (!Number.isFinite(rotation)) return fail(doc, `INVALID_ROTATION:${id}`);
    if (rotation === 0) delete element.rotation; else element.rotation = rotation;
  }
  if ([element.x, element.y, element.width, element.height].some(value => !Number.isFinite(value))) return fail(doc, `INVALID_DIMENSIONS:${id}`);
  const sizing = patch.width !== undefined || patch.height !== undefined;
  if (!clampToCanvas(element, next.canvas, sizing ? minSizeOf(element) : BASE_MIN)) return fail(doc, "OUTSIDE_CANVAS");
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
  if (isLocked(found.element)) return fail(doc, "ELEMENT_LOCKED");
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
  if (members.some(isLocked)) return fail(doc, "ELEMENT_LOCKED");
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

// `keepAspect`: false (free), true (keep the box's current proportions - Shift), or a ratio number (width / height) the result is held to exactly - the element's
// locked aspect (lockedAspect), so a 9:16 player stays 9:16 whatever shape its box had. `min` is the element's minimum size (minSizeOf); a locked resize reaches its
// minimum by scaling, so it never breaks the ratio to get there.
function resizeGeometry(start, handle, dx, dy, keepAspect, min = BASE_MIN) {
  const [sx, sy] = HANDLES[handle];
  const angle = radians(start.rotation), cos = Math.cos(angle), sin = Math.sin(angle);
  // pointer delta in the element's own (rotated) axes
  const localX = dx * cos + dy * sin, localY = -dx * sin + dy * cos;
  let width = start.width + sx * localX, height = start.height + sy * localY;
  const ratio = typeof keepAspect === "number" && keepAspect > 0 ? keepAspect : keepAspect ? start.width / start.height : null;
  if (ratio) {
    // a corner follows whichever axis was dragged further; a side handle on a locked element scales the whole element
    width = sy !== 0 ? Math.max(width, height * ratio, EPS) : Math.max(width, EPS);
    height = width / ratio;
    const grow = Math.max(1, min.width / width, min.height / height);
    width *= grow; height *= grow;
  } else {
    width = Math.max(min.width, width); height = Math.max(min.height, height);
  }
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
  if (isLocked(found.element)) return fail(doc, "ELEMENT_LOCKED");
  const start = found.element;
  const min = minSizeOf(start);
  let geometry = null;
  // shrink the gesture toward zero until it fits: exact for unrotated elements after the first pass below, fine-stepped for rotated ones
  for (let step = 40; step >= 0; step -= 1) {
    const t = step / 40;
    const candidate = resizeGeometry(start, handle, dx * t, dy * t, keepAspect, min);
    if (inside(containBounds({ ...start, ...candidate }), doc.canvas)) { geometry = candidate; break; }
  }
  if (!geometry) return { ok: true, doc };
  if (!start.rotation) {
    // exact edge stop for the common (unrotated) case: clamp the dragged edges onto the stage instead of the 1/40 stepping above
    const [sx, sy] = HANDLES[handle];
    const free = resizeGeometry(start, handle, dx, dy, keepAspect, min);
    const fits = candidate => inside(candidate, doc.canvas);
    if (fits(free)) geometry = free;
    else if (!keepAspect) {
      const right = start.x + start.width, bottom = start.y + start.height;
      const left = sx < 0 ? Math.max(0, Math.min(free.x, right - min.width)) : start.x;
      const top = sy < 0 ? Math.max(0, Math.min(free.y, bottom - min.height)) : start.y;
      const farRight = sx > 0 ? Math.min(doc.canvas.width, Math.max(free.x + free.width, start.x + min.width)) : right;
      const farBottom = sy > 0 ? Math.min(doc.canvas.height, Math.max(free.y + free.height, start.y + min.height)) : bottom;
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
  if (members.some(isLocked)) return fail(doc, "ELEMENT_LOCKED");
  const box = unionContain(members);
  let factor = Math.max((box.width + sx * dx) / box.width, (box.height + sy * dy) / box.height);
  factor = Math.max(factor, shrinkFloor(members));   // no member goes below its own minimum (a player, a GamID block, ...)
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
    const floor = minFloorFor(element);
    element.width = Math.max(floor.width, Math.round(element.width * factor));
    element.height = Math.max(floor.height, Math.round(element.height * factor));
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
  if (members.some(isLocked)) return fail(doc, "ELEMENT_LOCKED");
  const box = unionContain(members);
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  const maxFactor = Math.min(next.canvas.width / box.width, next.canvas.height / box.height);
  const applied = Math.max(Math.min(factor, maxFactor), Math.min(shrinkFloor(members), maxFactor));   // pinch / Smaller stop at each member's minimum
  for (const element of members) {
    const elementCentre = [element.x + element.width / 2, element.y + element.height / 2];
    const newCentre = [centre[0] + (elementCentre[0] - centre[0]) * applied, centre[1] + (elementCentre[1] - centre[1]) * applied];
    const floor = minFloorFor(element);
    element.width = Math.max(floor.width, Math.round(element.width * applied));
    element.height = Math.max(floor.height, Math.round(element.height * applied));
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
  if (members.some(isLocked)) return fail(doc, "ELEMENT_LOCKED");
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
// A click-through artwork is never hit: the tap goes to what is beneath it (it stays selectable from Layers).
export function hitTest(stage, px, py, slop = 0) {
  const top = ordered(stage).reverse().filter(element => !isClickThrough(element));
  return top.find(element => elementContainsPoint(element, px, py, 0)) ?? (slop > 0 ? top.find(element => elementContainsPoint(element, px, py, slop)) ?? null : null);
}

// The layer list, top-most first, as shown in the Layers panel.
export const layerList = stage => ordered(stage).reverse();

// A stable, human number for each group on a stage ("Group 1", "Group 2", ...), numbered from the bottom layer up, so the Layers panel can show WHICH elements
// belong together instead of one identical "GROUP" tag for every group.
export function groupNumbers(stage) {
  const numbers = new Map();
  for (const element of ordered(stage)) if (element.groupId && !numbers.has(element.groupId)) numbers.set(element.groupId, numbers.size + 1);
  return numbers;
}

// ---- Artwork (Round 3): lock, click-through, split -------------------------------------------------------------------------------------------------------------
// Lock Position: the canvas (and every geometry op) leaves a locked artwork where it is; it stays selectable, styleable, layerable and movable to another stage.
export const isLocked = element => element?.type === "image" && element.payload?.locked === true;
// Click-through: a canvas tap passes through the artwork (hitTest skips it); Layers still selects it.
export const isClickThrough = element => element?.type === "image" && element.payload?.clickThrough === true;

const round6 = value => Math.round(value * 1e6) / 1e6;
// The pieces of the split a piece belongs to, on that piece's stage, in band order.
export function splitPieces(doc, id) {
  const found = locate(doc, id);
  const set = found?.element.type === "image" ? found.element.payload.slice?.set : null;
  if (!set) return [];
  return found.stage.elements.filter(element => element.type === "image" && element.payload.slice?.set === set).sort((a, b) => a.payload.slice.from - b.payload.slice.from);
}
// The size of the WHOLE artwork a piece is a band of (a piece always shows its band at the whole artwork's scale).
const wholeOf = piece => {
  const { dir, from, to } = piece.payload.slice;
  return dir === "h" ? { width: piece.width, height: piece.height / (to - from) } : { width: piece.width / (to - from), height: piece.height };
};

// Splits one artwork into `count` (2..5) equal pieces, vertical cuts ("v": side by side) or horizontal ("h": stacked). NON-destructive: the asset is not touched -
// every piece is the same artwork showing its own band, so a GIF plays ONE timeline across all pieces (they share the asset). The pieces are grouped (group id = the
// split set) so they move, resize and layer as one until the owner ungroups them. The first piece keeps the original element's id; they take its layer slot.
export function splitArtwork(doc, id, count, dir = "v") {
  const found = locate(doc, id);
  if (!found) return fail(doc, "ELEMENT_NOT_FOUND");
  const source = found.element;
  if (source.type !== "image") return fail(doc, "NOT_AN_ARTWORK");
  if (!SPLIT_COUNTS.includes(count) || !SLICE_DIRS.includes(dir)) return fail(doc, "INVALID_SPLIT");
  if (source.payload.slice) return fail(doc, "ALREADY_SPLIT");
  if (source.rotation) return fail(doc, "ROTATED_SPLIT_UNSUPPORTED");
  if (source.groupId) return fail(doc, "UNGROUP_BEFORE_SPLIT");
  if (isLocked(source)) return fail(doc, "ELEMENT_LOCKED");
  const span = dir === "h" ? source.height : source.width;
  if (span / count < MIN_SIZE || 1 / count < MIN_SLICE) return fail(doc, "TOO_SMALL_TO_SPLIT");
  const next = clone(doc);
  const stage = findStage(next, found.stage.id);
  const set = nextId(doc, "split");
  const taken = new Set([set]);
  const edges = Array.from({ length: count + 1 }, (_, i) => Math.round(span * i / count));
  const list = ordered(stage);
  const slot = list.findIndex(element => element.id === id);
  const pieces = edges.slice(0, -1).map((edge, i) => {
    const piece = clone(source);
    if (i > 0) { piece.id = nextId(next, "el", taken); taken.add(piece.id); }
    const size = edges[i + 1] - edge;
    if (dir === "h") { piece.y = source.y + edge; piece.height = size; } else { piece.x = source.x + edge; piece.width = size; }
    piece.groupId = set;
    piece.payload = { ...source.payload, slice: { set, dir, from: round6(edge / span), to: round6(edges[i + 1] / span) } };
    return piece;
  });
  assignZ(stage, [...list.slice(0, slot), ...pieces, ...list.slice(slot + 1)]);
  return finish(doc, next, { set, ids: pieces.map(piece => piece.id) });
}

// Moves the boundary between piece `index` and `index + 1` (in band order) to the fraction `cut` of the whole artwork. The outer edges stay where they are (the
// left piece keeps its start, the right piece its end); every band keeps at least MIN_SLICE of the artwork and MIN_SIZE units. Works for pieces that were moved apart.
export function moveSplitBoundary(doc, id, index, cut) {
  const pieces = splitPieces(doc, id);
  if (pieces.length < 2) return fail(doc, "NOT_SPLIT");
  if (!Number.isInteger(index) || index < 0 || index >= pieces.length - 1 || !Number.isFinite(cut)) return fail(doc, "INVALID_BOUNDARY");
  const [a, b] = [pieces[index], pieces[index + 1]];
  if (isLocked(a) || isLocked(b)) return fail(doc, "ELEMENT_LOCKED");
  const dir = a.payload.slice.dir;
  const wholeA = wholeOf(a), wholeB = wholeOf(b);
  const spanA = dir === "h" ? wholeA.height : wholeA.width, spanB = dir === "h" ? wholeB.height : wholeB.width;
  const lo = Math.max(a.payload.slice.from + MIN_SLICE, a.payload.slice.from + MIN_SIZE / spanA);
  const hi = Math.min(b.payload.slice.to - MIN_SLICE, b.payload.slice.to - MIN_SIZE / spanB);
  if (lo > hi) return fail(doc, "TOO_SMALL_TO_SPLIT");
  const at = Math.min(hi, Math.max(lo, cut));
  const next = clone(doc);
  const nextA = locate(next, a.id).element, nextB = locate(next, b.id).element;
  const endB = dir === "h" ? b.y + b.height : b.x + b.width;
  const sizeA = Math.max(MIN_SIZE, Math.ceil(spanA * MIN_SLICE), Math.round(spanA * (at - a.payload.slice.from)));
  const sizeB = Math.max(MIN_SIZE, Math.ceil(spanB * MIN_SLICE), Math.round(spanB * (b.payload.slice.to - at)));
  if (dir === "h") { nextA.height = sizeA; nextB.height = sizeB; nextB.y = endB - sizeB; } else { nextA.width = sizeA; nextB.width = sizeB; nextB.x = endB - sizeB; }
  // the stored band follows the rounded geometry exactly, so each piece still draws its band at the whole artwork's scale
  const cutA = round6(a.payload.slice.from + sizeA / spanA);
  const cutB = round6(b.payload.slice.to - sizeB / spanB);
  nextA.payload = { ...nextA.payload, slice: { ...nextA.payload.slice, to: cutA } };
  nextB.payload = { ...nextB.payload, slice: { ...nextB.payload.slice, from: cutB } };
  return finish(doc, next, { cut: at });
}

// Takes a split back to ONE artwork: the whole artwork is rebuilt from the first piece (its band and size give the whole box), keeping that piece's id, look and the
// topmost piece's layer slot. Nothing is lost - the split was never baked into the picture.
export function removeSplit(doc, id) {
  const pieces = splitPieces(doc, id);
  if (!pieces.length) return fail(doc, "NOT_SPLIT");
  const first = pieces[0];
  const { dir, from, set } = first.payload.slice;
  const whole = wholeOf(first);
  const next = clone(doc);
  const stage = locate(next, first.id).stage;
  const ids = new Set(pieces.map(piece => piece.id));
  const list = ordered(stage);
  const topIndex = Math.max(...list.map((element, index) => (ids.has(element.id) ? index : -1)));
  const merged = clone(first);
  if (dir === "h") { merged.height = Math.round(whole.height); merged.y = Math.round(first.y - from * whole.height); } else { merged.width = Math.round(whole.width); merged.x = Math.round(first.x - from * whole.width); }
  const { slice: _slice, ...payload } = merged.payload;
  merged.payload = payload;
  if (merged.groupId === set) delete merged.groupId;
  if (!clampToCanvas(merged, next.canvas)) return fail(doc, "OUTSIDE_CANVAS");
  const kept = list.filter(element => !ids.has(element.id));
  const slot = list.slice(0, topIndex + 1).filter(element => !ids.has(element.id)).length;
  assignZ(stage, [...kept.slice(0, slot), merged, ...kept.slice(slot)]);
  return finish(doc, next, { ids: [merged.id] });
}

// Reset: the same number of pieces, same direction, equal boundaries again, re-assembled in place (the whole artwork box rebuilt from the first piece).
export function resetSplit(doc, id) {
  const pieces = splitPieces(doc, id);
  if (!pieces.length) return fail(doc, "NOT_SPLIT");
  const { dir } = pieces[0].payload.slice;
  const merged = removeSplit(doc, id);
  if (!merged.ok) return merged;
  const again = splitArtwork(merged.doc, merged.ids[0], pieces.length, dir);
  return again.ok ? again : fail(doc, ...again.errors);
}

// Layers drag-and-drop: moves the dragged layer (its whole group, unless it is being reordered INSIDE its own group) directly above or below the target's unit.
// Groups stay contiguous, so there is one stacking model: the same one Forward / Backward / Front / Back use.
export function moveLayer(doc, id, targetId, place = "above") {
  const stage = commonStage(doc, [id, targetId]);
  if (!stage || id === targetId || !["above", "below"].includes(place)) return fail(doc, "SELECTION_INVALID");
  const next = clone(doc);
  const nextStage = findStage(next, stage.id);
  const list = ordered(nextStage);
  const dragged = list.find(element => element.id === id), target = list.find(element => element.id === targetId);
  const sameGroup = dragged.groupId && dragged.groupId === target.groupId;
  const moving = new Set(sameGroup ? [id] : expandSelection(nextStage, [id]));
  if (moving.has(targetId)) return { ok: true, doc };
  const anchorIds = new Set(sameGroup ? [targetId] : expandSelection(nextStage, [targetId]));
  const rest = list.filter(element => !moving.has(element.id));
  const unit = list.filter(element => moving.has(element.id));
  const anchorIndexes = rest.map((element, index) => (anchorIds.has(element.id) ? index : -1)).filter(index => index >= 0);
  const at = place === "above" ? Math.max(...anchorIndexes) + 1 : Math.min(...anchorIndexes);
  assignZ(nextStage, [...rest.slice(0, at), ...unit, ...rest.slice(at)]);
  return finish(doc, next);
}
// Crop (non-destructive): sets / clears an artwork's crop window. The box keeps its width and centre and takes the crop's proportions (so the crop is shown
// undistorted); `source` ({ aw, ah }) records the picture's pixel size when the element does not have it yet. One undo step. Not for split pieces (remove the split first).
export function setCrop(doc, id, crop, source = {}) {
  const found = locate(doc, id);
  if (!found) return fail(doc, "ELEMENT_NOT_FOUND");
  if (found.element.type !== "image") return fail(doc, "NOT_AN_ARTWORK");
  if (found.element.payload.slice) return fail(doc, "ALREADY_SPLIT");
  if (isLocked(found.element)) return fail(doc, "ELEMENT_LOCKED");
  const next = clone(doc);
  const element = locate(next, id).element;
  const payload = { ...element.payload };
  if (source.aw && source.ah && !(payload.aw && payload.ah)) { payload.aw = source.aw; payload.ah = source.ah; }
  if (!crop) { delete payload.crop; element.payload = payload; return finish(doc, next); }
  payload.crop = clone(crop);
  element.payload = payload;
  if (payload.aw && payload.ah) {
    const ratio = cropRatio(crop, payload.aw, payload.ah);
    const cy = element.y + element.height / 2;
    let width = element.width, height = Math.round(width / ratio);
    if (height > next.canvas.height) { height = next.canvas.height; width = Math.round(height * ratio); }
    const min = minSizeOf(element);
    if (height < min.height) { height = min.height; width = Math.round(height * ratio); }
    element.x = Math.round(element.x + (element.width - width) / 2);
    element.width = width; element.height = height;
    element.y = Math.round(cy - height / 2);
    if (!clampToCanvas(element, next.canvas)) return fail(doc, "OUTSIDE_CANVAS");
  }
  return finish(doc, next);
}