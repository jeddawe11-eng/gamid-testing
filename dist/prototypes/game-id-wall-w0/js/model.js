// GAME ID WALL - W0 PROTOTYPE - pure model (no DOM). THROWAWAY: this is a risk prototype, not the real Wall document model (that is W1).
//
// It encodes the accepted architecture rules so they can be exercised on real devices AND unit-tested:
//   * a Wall is 1-3 stacked 9:16 stages, each 1000 logical units wide (1000 x 1778), geometry stored in STAGE-LOCAL units, never pixels
//   * content is separate from geometry (doc.nodes vs doc.layouts.portrait)
//   * foreground nodes belong to exactly ONE stage; z-order (the children array) and groups are stage-local; groups do not nest in W0
//   * a GamID block is one indivisible node
//   * an embed (real third-party player) must never have another element in front of it where they overlap (YouTube's documented rule;
//     applied conservatively to Spotify), and two embeds may not overlap each other
//   * a small embed tile is allowed; below the provider's inline minimum a tap opens an in-page overlay player instead

export const UNITS_W = 1000;
export const STAGE_H = 1778;            // round(1000 * 16 / 9)
export const MAX_STAGES = 3;
export const MIN_COLUMN_PX = 360;       // narrowest supported column, used for worst-case unit minimums
export const LAYOUT = "portrait";

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const round1 = value => Math.round(value * 10) / 10;

// ------------------------------------------------------------------------------------------------ unit conversion (device pixels never enter the document)
export const unitsToPx = (units, columnPx) => (units * columnPx) / UNITS_W;
export const pxToUnits = (px, columnPx) => (px * UNITS_W) / columnPx;
export const stageHeightPx = columnPx => unitsToPx(STAGE_H, columnPx);
export const wallHeightUnits = stageCount => stageCount * STAGE_H;
export const wallY = (stageIndex, y) => stageIndex * STAGE_H + y;
export const stageOfWallY = wallYUnits => {
  const index = clamp(Math.floor(wallYUnits / STAGE_H), 0, MAX_STAGES - 1);
  return { index, y: wallYUnits - index * STAGE_H };
};
export const clampStageIndex = (index, stageCount) => clamp(Number.isFinite(index) ? Math.trunc(index) : 0, 0, Math.max(0, stageCount - 1));

// ------------------------------------------------------------------------------------------------ text limits (bounded styling; no arbitrary CSS)
export const FONT_KEYS = Object.freeze(["orbitron", "bebas", "russo", "rajdhani", "chakra"]);
export const HEX = /^#[0-9a-fA-F]{6}$/;
export const TEXT_LIMITS = Object.freeze({ size: [24, 420], outline: [0, 14], glow: [0, 60], shadowBlur: [0, 40], shadowOffset: [-30, 30], chars: 500 });

// Control characters plus invisible / bidirectional-override characters are removed from user text. Built from code points on purpose (pure-ASCII source).
const STRIP = new RegExp("[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f-\\x9f" + [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff].map(code => String.fromCharCode(code)).join("") + "]", "g");

export function sanitizeText(content) {
  const color = value => (typeof value === "string" && HEX.test(value) ? value : null);
  const num = (value, [min, max], fallback) => (Number.isFinite(Number(value)) ? clamp(Number(value), min, max) : fallback);
  const text = String(content.text ?? "").replace(STRIP, "").slice(0, TEXT_LIMITS.chars);
  const out = {
    type: "text", text,
    font: FONT_KEYS.includes(content.font) ? content.font : "orbitron",
    size: num(content.size, TEXT_LIMITS.size, 120),
    color: color(content.color) || "#ffffff",
    align: ["left", "center", "right"].includes(content.align) ? content.align : "center",
    gradient: null, outline: null, shadow: null, glow: null,
  };
  if (content.gradient && color(content.gradient.a) && color(content.gradient.b)) out.gradient = { a: content.gradient.a, b: content.gradient.b, angle: num(content.gradient.angle, [0, 360], 100) };
  if (content.outline && color(content.outline.color)) out.outline = { color: content.outline.color, width: num(content.outline.width, TEXT_LIMITS.outline, 2) };
  if (content.shadow && color(content.shadow.color)) out.shadow = { color: content.shadow.color, x: num(content.shadow.x, TEXT_LIMITS.shadowOffset, 0), y: num(content.shadow.y, TEXT_LIMITS.shadowOffset, 6), blur: num(content.shadow.blur, TEXT_LIMITS.shadowBlur, 10) };
  if (content.glow && color(content.glow.color)) out.glow = { color: content.glow.color, radius: num(content.glow.radius, TEXT_LIMITS.glow, 30) };
  return out;
}

// ------------------------------------------------------------------------------------------------ document
export function createDoc({ stages = MAX_STAGES } = {}) {
  const doc = {
    schema: "w0-sketch",
    seq: 0,
    background: { base: { angle: 180, stops: [["#070512", 0], ["#1a0b3d", 16], ["#3a0f5e", 30], ["#12203f", 45], ["#0a3c52", 58], ["#2a0d48", 74], ["#0c0716", 100]] }, art: { enabled: true, asset: "wallArt", mode: "cover" } },
    stages: [],
    nodes: {},
    layouts: { [LAYOUT]: {} },
  };
  for (let i = 0; i < clamp(stages, 1, MAX_STAGES); i++) doc.stages.push({ id: `s${i + 1}`, background: { mode: "inherit" }, children: [] });
  return doc;
}

export const cloneDoc = doc => JSON.parse(JSON.stringify(doc));
export const geoOf = (doc, id) => doc.layouts[LAYOUT][id];
export function newId(doc, prefix = "n") { doc.seq += 1; return `${prefix}${doc.seq}`; }

export function addNode(doc, stageIndex, content, geo) {
  const id = newId(doc);
  doc.nodes[id] = content;
  doc.layouts[LAYOUT][id] = { ...geo };
  doc.stages[stageIndex].children.push(id);
  return id;
}

// ------------------------------------------------------------------------------------------------ boxes and containment (stage-local units)
export function groupLocalBox(doc, groupId) {
  let w = 0, h = 0;
  for (const childId of doc.nodes[groupId].children) { const g = geoOf(doc, childId); w = Math.max(w, g.x + g.w); h = Math.max(h, g.y + g.h); }
  return { w, h };
}

export function nodeBox(doc, id) {
  const node = doc.nodes[id], g = geoOf(doc, id);
  if (node.type === "group") { const local = groupLocalBox(doc, id); return { x: g.x, y: g.y, w: local.w * g.s, h: local.h * g.s }; }
  return { x: g.x, y: g.y, w: g.w, h: g.h };
}

export function unionBox(boxes) {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
  const x1 = Math.max(...boxes.map(b => b.x + b.w)), y1 = Math.max(...boxes.map(b => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const insideStage = (box, eps = 0.01) => box.x >= -eps && box.y >= -eps && box.x + box.w <= UNITS_W + eps && box.y + box.h <= STAGE_H + eps;

// Hard containment: how far a box may actually move so it stays fully inside its stage.
export function clampMove(box, dx, dy) {
  const nx = clamp(box.x + dx, 0, Math.max(0, UNITS_W - box.w));
  const ny = clamp(box.y + dy, 0, Math.max(0, STAGE_H - box.h));
  return { dx: nx - box.x, dy: ny - box.y };
}

// Largest scale factor (<= wanted) that keeps a box inside its stage when scaled about an anchor point.
export function fitFactorWithinStage(box, anchor, wanted) {
  let f = wanted;
  const left = box.x - anchor.x, right = box.x + box.w - anchor.x, top = box.y - anchor.y, bottom = box.y + box.h - anchor.y;
  if (left < 0) f = Math.min(f, anchor.x / -left);
  if (right > 0) f = Math.min(f, (UNITS_W - anchor.x) / right);
  if (top < 0) f = Math.min(f, anchor.y / -top);
  if (bottom > 0) f = Math.min(f, (STAGE_H - anchor.y) / bottom);
  return Math.max(0, f);
}

// ------------------------------------------------------------------------------------------------ flattened paint order (stage-local)
export function flattenStage(doc, stageIndex) {
  const out = [];
  for (const id of doc.stages[stageIndex].children) {
    const node = doc.nodes[id];
    if (node.type === "group") {
      const g = geoOf(doc, id);
      for (const childId of node.children) { const c = geoOf(doc, childId); out.push({ id: childId, top: id, group: id, box: { x: g.x + g.s * c.x, y: g.y + g.s * c.y, w: g.s * c.w, h: g.s * c.h } }); }
    } else out.push({ id, top: id, group: null, box: nodeBox(doc, id) });
  }
  return out;
}

export const overlaps = (a, b, eps = 0.5) => a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;

// ------------------------------------------------------------------------------------------------ embed rules
export const EMBED = Object.freeze({
  youtube: Object.freeze({
    label: "YouTube",
    aspects: Object.freeze({ "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1 }),
    tileMinPx: Object.freeze({ w: 120, h: 70 }),          // documented: a thumbnail that initiates playback must be >= 120x70
    inlineMinPx: Object.freeze({ w: 200, h: 200 }),        // documented: the embedded player viewport must be >= 200x200
    recommendedPx: Object.freeze({ w: 480, h: 270 }),      // documented recommendation for 16:9 (never enforced)
  }),
  spotify: Object.freeze({
    label: "Spotify",
    // Spotify documents NO minimum/maximum size. These ratios are W0 measurement candidates (152 / 352 px heights at a ~390 px column), not policy.
    variants: Object.freeze({ compact: 152 / 390, standard: 352 / 390 }),
    labFloorPx: 44,                                        // only a tap-target floor so a tile cannot vanish; NOT a provider minimum
  }),
});

export const EMBED_KINDS = Object.freeze({ youtube: ["video"], spotify: ["track", "album", "playlist"] });
export const EMBED_ID = Object.freeze({ youtube: /^[A-Za-z0-9_-]{11}$/, spotify: /^[A-Za-z0-9]{22}$/ });

// width / height of the embed box, or null when the height is free (Spotify "free" lab variant)
export function embedAspect(node) {
  if (node.provider === "youtube") return EMBED.youtube.aspects[node.aspect] || EMBED.youtube.aspects["16:9"];
  if (node.provider === "spotify") { const ratio = EMBED.spotify.variants[node.variant]; return ratio ? 1 / ratio : null; }
  return null;
}

// Smallest embed width (in units) that is still a valid facade tile on the NARROWEST supported column.
export function embedMinWidthUnits(node) {
  if (node.provider === "youtube") { const aspect = embedAspect(node); const px = Math.max(EMBED.youtube.tileMinPx.w, EMBED.youtube.tileMinPx.h * aspect); return Math.ceil((px * UNITS_W) / MIN_COLUMN_PX); }
  return Math.ceil((EMBED.spotify.labFloorPx * UNITS_W) / MIN_COLUMN_PX);
}

// What a tap does, given the embed's ACTUAL rendered size in CSS pixels on this device.
export function classifyEmbedPx(provider, widthPx, heightPx) {
  if (provider === "youtube") {
    const spec = EMBED.youtube;
    if (widthPx >= spec.inlineMinPx.w && heightPx >= spec.inlineMinPx.h) return { mode: "inline", reason: "meets the 200x200 minimum" };
    return { mode: "overlay", reason: widthPx >= spec.tileMinPx.w && heightPx >= spec.tileMinPx.h ? "small tile: opens a larger in-page player" : "below the tile minimum" };
  }
  if (provider === "spotify") {
    const floor = EMBED.spotify.labFloorPx;
    return widthPx >= floor && heightPx >= floor ? { mode: "inline", reason: "W0 lab: Spotify documents no minimum" } : { mode: "overlay", reason: "below the tap-target floor" };
  }
  return { mode: "overlay", reason: "unknown provider" };
}

// Units an inline-capable YouTube box needs on a given column width (for the editor's readout).
export function youtubeInlineMinUnits(columnPx, aspect = 16 / 9) {
  const px = Math.max(EMBED.youtube.inlineMinPx.w, EMBED.youtube.inlineMinPx.h * aspect);
  return (px * UNITS_W) / columnPx;
}

export function locate(doc, stageIndex, id) {
  const stage = doc.stages[stageIndex];
  if (stage.children.includes(id)) return { parent: stage.id, list: stage.children, top: id };
  for (const groupId of stage.children) { const node = doc.nodes[groupId]; if (node.type === "group" && node.children.includes(id)) return { parent: groupId, list: node.children, top: groupId }; }
  return null;
}

function moveAbove(list, id, refId) {
  list.splice(list.indexOf(id), 1);
  list.splice(list.indexOf(refId) + 1, 0, id);
}

// { embed, over }: `over` is painted in front of the embed and overlaps its box (flattened stage-local paint order).
export function findEmbedViolations(doc, stageIndex) {
  const flat = flattenStage(doc, stageIndex), out = [];
  flat.forEach((entry, i) => {
    if (doc.nodes[entry.id].type !== "embed") return;
    for (let j = i + 1; j < flat.length; j++) if (overlaps(entry.box, flat[j].box)) out.push({ embed: entry.id, over: flat[j].id });
  });
  return out;
}

export function findEmbedEmbedOverlaps(doc, stageIndex) {
  const embeds = flattenStage(doc, stageIndex).filter(entry => doc.nodes[entry.id].type === "embed"), out = [];
  for (let i = 0; i < embeds.length; i++) for (let j = i + 1; j < embeds.length; j++) if (overlaps(embeds[i].box, embeds[j].box)) out.push([embeds[i].id, embeds[j].id]);
  return out;
}

// Enforce "an embed is always above anything it overlaps". Elements may sit BEHIND an embed; nothing may sit in front of it.
// Returns the corrections made, so the editor can explain them.
export function enforceEmbedOverlap(doc, stageIndex) {
  const moves = [];
  for (let guard = 0; guard < 200; guard++) {
    const violation = findEmbedViolations(doc, stageIndex).find(v => doc.nodes[v.over].type !== "embed");
    if (!violation) break;
    const stage = doc.stages[stageIndex];
    const e = locate(doc, stageIndex, violation.embed), x = locate(doc, stageIndex, violation.over);
    if (e.parent === x.parent) moveAbove(e.list, violation.embed, violation.over); else moveAbove(stage.children, e.top, x.top);
    moves.push({ embed: violation.embed, above: violation.over });
  }
  return moves;
}

// ------------------------------------------------------------------------------------------------ layers (stage-local z-order = children array, bottom -> top)
export function bringForward(doc, stageIndex, ids) {
  const list = doc.stages[stageIndex].children, selected = new Set(ids);
  for (let i = list.length - 2; i >= 0; i--) if (selected.has(list[i]) && !selected.has(list[i + 1])) [list[i], list[i + 1]] = [list[i + 1], list[i]];
}
export function sendBackward(doc, stageIndex, ids) {
  const list = doc.stages[stageIndex].children, selected = new Set(ids);
  for (let i = 1; i < list.length; i++) if (selected.has(list[i]) && !selected.has(list[i - 1])) [list[i], list[i - 1]] = [list[i - 1], list[i]];
}
export function bringToFront(doc, stageIndex, ids) {
  const stage = doc.stages[stageIndex], selected = new Set(ids);
  stage.children = [...stage.children.filter(id => !selected.has(id)), ...stage.children.filter(id => selected.has(id))];
}
export function sendToBack(doc, stageIndex, ids) {
  const stage = doc.stages[stageIndex], selected = new Set(ids);
  stage.children = [...stage.children.filter(id => selected.has(id)), ...stage.children.filter(id => !selected.has(id))];
}

// ------------------------------------------------------------------------------------------------ move to stage (no cross-stage element ever exists)
export function moveToStage(doc, fromIndex, ids, toIndex) {
  if (toIndex < 0 || toIndex >= doc.stages.length || toIndex === fromIndex) return { error: "INVALID_TARGET_STAGE" };
  const from = doc.stages[fromIndex].children, to = doc.stages[toIndex].children;
  const moving = from.filter(id => ids.includes(id));
  for (const id of moving) {
    from.splice(from.indexOf(id), 1);
    to.push(id);
    const box = nodeBox(doc, id), { dx, dy } = clampMove(box, 0, 0);
    const g = geoOf(doc, id); g.x += dx; g.y += dy;
  }
  return { moved: moving };
}

// ------------------------------------------------------------------------------------------------ scaling (used by corner resize, pinch, and group resize)
export function scaleContent(node, f) {
  if (node.type !== "text") return node;
  const next = JSON.parse(JSON.stringify(node));
  next.size = next.size * f;
  if (next.outline) next.outline.width *= f;
  if (next.glow) next.glow.radius *= f;
  if (next.shadow) { next.shadow.x *= f; next.shadow.y *= f; next.shadow.blur *= f; }
  return next;
}

// Pure: new {geo, content} for `factor` about `anchor` (stage units), from the START snapshot of a gesture (never cumulative).
export function scaledNode(node, geo, factor, anchor) {
  const at = (v, a) => a + (v - a) * factor;
  if (node.type === "group") return { geo: { x: at(geo.x, anchor.x), y: at(geo.y, anchor.y), s: geo.s * factor }, content: node };
  return { geo: { x: at(geo.x, anchor.x), y: at(geo.y, anchor.y), w: geo.w * factor, h: geo.h * factor }, content: scaleContent(node, factor) };
}

// Allowed factor range for one top-level node: minimum sizes only (the stage fit is applied separately).
export function factorRange(doc, id) {
  const node = doc.nodes[id], g = geoOf(doc, id);
  if (node.type === "text") return { min: Math.max(TEXT_LIMITS.size[0] / node.size, 60 / g.w), max: TEXT_LIMITS.size[1] / node.size };
  if (node.type === "image") return { min: 60 / g.w, max: Infinity };
  if (node.type === "block") return { min: 200 / g.w, max: Infinity };
  if (node.type === "embed") return { min: embedMinWidthUnits(node) / g.w, max: Infinity };
  if (node.type === "group") {
    let min = 0.2;
    for (const childId of node.children) { const child = doc.nodes[childId]; if (child.type === "embed") min = Math.max(min, embedMinWidthUnits(child) / (g.s * geoOf(doc, childId).w)); }
    return { min, max: Infinity };
  }
  return { min: 0.1, max: Infinity };
}

// ------------------------------------------------------------------------------------------------ selection controls that stay usable for tiny elements and elements against a stage edge
// Handles live in SCREEN space: however small the selected box is on screen, its four corner handles are pushed OUTWARD until neighbouring handle
// centres are at least HANDLE_GAP_PX apart (>= the 44 px hit target), so they never stack on top of each other. A box smaller than MOVE_PAD_PX also gets
// a centred move pad so it can still be dragged. Nothing here limits how small an element may be (only the per-type minimums in factorRange do).
export const HANDLE_HIT_PX = 44;
export const HANDLE_GAP_PX = 56;
export const MOVE_PAD_PX = 44;
export function handleOffsets(widthPx, heightPx, gap = HANDLE_GAP_PX) {
  return { ox: Math.max(0, (gap - widthPx) / 2), oy: Math.max(0, (gap - heightPx) / 2) };
}
export const needsMovePad = (widthPx, heightPx, min = MOVE_PAD_PX) => Math.min(widthPx, heightPx) < min;

// Where the four corner handle centres sit (px, relative to the box's top-left) for a box of the given on-screen size.
export function handleCentres(widthPx, heightPx) {
  const { ox, oy } = handleOffsets(widthPx, heightPx);
  return { nw: { x: -ox, y: -oy }, ne: { x: widthPx + ox, y: -oy }, sw: { x: -ox, y: heightPx + oy }, se: { x: widthPx + ox, y: heightPx + oy } };
}

// Button-style resize (no gesture): scale about the box centre, never beyond the stage, then slide back inside. Pure.
// Used as the recovery path for an element that is hard to grab: it can always be made bigger from the Props sheet.
export function scaleAboutCenterInStage(node, geo, box, factor) {
  const f = Math.max(0, Math.min(factor, UNITS_W / box.w, STAGE_H / box.h));
  const anchor = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const next = scaledNode(node, geo, f, anchor);
  const scaled = { x: anchor.x + (box.x - anchor.x) * f, y: anchor.y + (box.y - anchor.y) * f, w: box.w * f, h: box.h * f };
  const { dx, dy } = clampMove(scaled, 0, 0);
  next.geo.x += dx; next.geo.y += dy;
  return { geo: next.geo, content: next.content, factor: f };
}

// ------------------------------------------------------------------------------------------------ groups (stage-local, uniform scale only, no nesting in W0)
export function groupNodes(doc, stageIndex, ids) {
  const stage = doc.stages[stageIndex];
  const members = stage.children.filter(id => ids.includes(id));
  if (members.length < 2) return { error: "NEED_TWO_ELEMENTS" };
  if (members.some(id => doc.nodes[id].type === "group")) return { error: "NESTED_GROUPS_NOT_IN_W0" };
  const box = unionBox(members.map(id => nodeBox(doc, id)));
  const groupId = newId(doc, "g");
  doc.nodes[groupId] = { type: "group", children: members.slice() };
  doc.layouts[LAYOUT][groupId] = { x: box.x, y: box.y, s: 1 };
  for (const id of members) { const g = geoOf(doc, id); g.x -= box.x; g.y -= box.y; }
  // the group takes the z-slot of its top-most member (Figma-style); the other members leave the stage list
  const topIndex = Math.max(...members.map(id => stage.children.indexOf(id)));
  stage.children.splice(topIndex, 0, groupId);
  stage.children = stage.children.filter(id => !members.includes(id));
  return { groupId };
}

export function ungroupNode(doc, stageIndex, groupId) {
  const stage = doc.stages[stageIndex], node = doc.nodes[groupId];
  if (!node || node.type !== "group") return { error: "NOT_A_GROUP" };
  const g = geoOf(doc, groupId), at = stage.children.indexOf(groupId), released = [];
  for (const childId of node.children) {
    const c = geoOf(doc, childId);
    doc.layouts[LAYOUT][childId] = { x: g.x + g.s * c.x, y: g.y + g.s * c.y, w: g.s * c.w, h: g.s * c.h };
    doc.nodes[childId] = scaleContent(doc.nodes[childId], g.s);   // bake the group scale into type-specific sizes (text size, effects)
    released.push(childId);
  }
  stage.children.splice(at, 1, ...released);
  delete doc.nodes[groupId];
  delete doc.layouts[LAYOUT][groupId];
  return { released };
}

// ------------------------------------------------------------------------------------------------ validation (strict; used by tests and after every W0 edit)
export function validateDoc(doc) {
  const errors = [], seen = new Set();
  if (!(doc.stages.length >= 1 && doc.stages.length <= MAX_STAGES)) errors.push("STAGE_COUNT");
  const visit = (id, stageIndex, depth) => {
    const node = doc.nodes[id], g = geoOf(doc, id);
    if (!node) { errors.push(`MISSING_NODE:${id}`); return; }
    if (seen.has(id)) { errors.push(`DUPLICATE_NODE:${id}`); return; }
    seen.add(id);
    if (!g) errors.push(`MISSING_GEOMETRY:${id}`);
    if (node.type === "group") {
      if (depth > 0) errors.push(`NESTED_GROUP:${id}`);
      for (const childId of node.children) { if (doc.nodes[childId]?.type === "group") errors.push(`NESTED_GROUP:${childId}`); visit(childId, stageIndex, depth + 1); }
    } else if (!["text", "image", "block", "embed"].includes(node.type)) errors.push(`UNKNOWN_TYPE:${id}`);
    if (node.type === "embed") {
      if (!EMBED_KINDS[node.provider]?.includes(node.kind)) errors.push(`EMBED_KIND:${id}`);
      if (!EMBED_ID[node.provider]?.test(node.id || "")) errors.push(`EMBED_ID:${id}`);
    }
    if (depth === 0 && g && !insideStage(nodeBox(doc, id))) errors.push(`OUTSIDE_STAGE:${id}`);
  };
  doc.stages.forEach((stage, si) => stage.children.forEach(id => visit(id, si, 0)));
  for (const id of Object.keys(doc.nodes)) if (!seen.has(id)) errors.push(`ORPHAN_NODE:${id}`);
  doc.stages.forEach((_, si) => {
    if (findEmbedViolations(doc, si).length) errors.push(`EMBED_OVERLAY:stage${si + 1}`);
    if (findEmbedEmbedOverlaps(doc, si).length) errors.push(`EMBED_EMBED_OVERLAP:stage${si + 1}`);
  });
  return errors;
}

// ------------------------------------------------------------------------------------------------ active third-party players (max ONE per provider)
export class ActivePlayers {
  constructor() { this.byProvider = {}; }
  // returns the node id that must be deactivated (the previous player of the SAME provider), or null
  activate(provider, id) { const previous = this.byProvider[provider] ?? null; this.byProvider[provider] = id; return previous && previous !== id ? previous : null; }
  deactivate(provider, id) { if (this.byProvider[provider] === id) delete this.byProvider[provider]; }
  isActive(provider, id) { return this.byProvider[provider] === id; }
  count() { return Object.keys(this.byProvider).length; }
  ids() { return Object.values(this.byProvider); }
}
export const facadeState = (players, provider, id) => (players.isActive(provider, id) ? "active" : "facade");

// ------------------------------------------------------------------------------------------------ undo / redo
export class History {
  constructor(initial, limit = 60) { this.stack = [initial]; this.index = 0; this.limit = limit; }
  commit(snapshot) {
    if (snapshot === this.stack[this.index]) return false;
    this.stack.splice(this.index + 1);
    this.stack.push(snapshot);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
    return true;
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }
  undo() { return this.canUndo ? this.stack[--this.index] : null; }
  redo() { return this.canRedo ? this.stack[++this.index] : null; }
}
