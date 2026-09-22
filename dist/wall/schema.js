// GamID Wall Document - W1 FOUNDATION. The versioned, canonical internal representation of a Game ID Wall: not coupled to the current prototype UI,
// Supabase storage, a specific editor, a specific device, or any provider. Later phases (persistence, the visual editor, publishing, embeds) build on
// this exact shape without redesigning it - that is the whole point of W1.
//
// Geometry is carried over from the W0 risk prototype (its model.js), which validated it on a real device: a Wall is a small number of stacked, portrait
// (9:16) "stages", each a fixed-size canonical design-space canvas (1000 units wide, so round(1000 * 16 / 9) = 1778 units tall). Geometry is stored in
// these abstract UNITS, never device pixels, so the SAME document renders correctly at any viewport width - see render.js's computeScale.
//
// Stage count: the CORE schema requires only a non-empty stages collection - there is no architectural maximum. W0 happened to cap its own editor UX at
// 3 stages, but that was a product/UX decision for that prototype, not a technical limit of the document shape; a future product/editor/plan layer is
// free to enforce whatever business limit it wants (3, 5, unlimited, a per-plan number, ...) without the Wall Document ever needing a schema change.
//
// Everything W0 additionally proved (groups, text/image/block content types, resize/undo-redo editor mechanics, the exact embed pixel thresholds) is
// deliberately NOT carried into W1: those are editor/content-type/product decisions for later phases, not part of the minimum document foundation.
export const CURRENT_SCHEMA_VERSION = 1;
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([1]);

export const CANONICAL_CANVAS = Object.freeze({ width: 1000, height: 1778 });

export function createStage(id, elements = []) {
  return { id, elements: [...elements] };
}

export function createElement({ id, type, x, y, width, height, z = 0, payload = {} }) {
  return { id, type, x, y, width, height, z, payload };
}

// A new, empty, already-valid document: one stage, the canonical canvas, no elements. A real starting point for tests and for whatever creates the
// first document for a new Wall later (W2) - never something callers have to hand-assemble field by field.
export function createDocument({ stageCount = 1, canvas = CANONICAL_CANVAS } = {}) {
  const count = Math.max(1, Math.trunc(stageCount) || 1);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    canvas: { width: canvas.width, height: canvas.height },
    stages: Array.from({ length: count }, (_, i) => createStage(`stage_${i + 1}`)),
  };
}
