// Deterministic static rendering: a pure function from (valid Wall Document, viewport width) to a plain, JSON-serializable render tree - never a DOM
// node, never an HTML string, so it runs (and is tested) anywhere, including under plain Node with no browser. Turning this tree into actual on-screen
// output is a later phase's job; this file only computes WHAT to draw and WHERE, never HOW to draw it into markup.
import { validateDocument } from "./validate.js";
import { elementRegistry } from "./elements.js";

// Deterministic order within a stage: by z ascending, then by id ascending on ties. Re-rendering the SAME document always produces the SAME order, and
// two elements sharing a z value never depend on array/insertion order, which persistence or an editor could reorder without changing z.
function orderedElements(stage) {
  return [...stage.elements].sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// The ONE scale factor the whole Wall renders from: canonical design-space units -> the given viewport width, in pixels. The SAME document therefore
// preserves its composition at any viewport size - this is the entire responsive strategy (carried over from the real-device-proven W0 precedent,
// the W0 prototype's `--uw = columnPx / 1000`), not a breakpoint/override system.
export function computeScale(canvas, viewportWidth) {
  return viewportWidth / canvas.width;
}

function renderElement(element, scale) {
  const definition = elementRegistry.get(element.type);   // always found: renderDocument only ever reaches here for an already-validated document
  return {
    id: element.id,
    type: element.type,
    z: element.z,
    x: element.x * scale,
    y: element.y * scale,
    width: element.width * scale,
    height: element.height * scale,
    content: definition.render ? definition.render(element.payload) : null,
  };
}

// Refuses to render an invalid document rather than guessing at partial output - the render-time half of "safe handling/rejection of invalid
// documents". Each stage renders as its own self-contained tree (elements positioned relative to their OWN stage's origin): stacking/continuous
// presentation across stages is a presentation choice for whatever consumes this tree later, not a universal renderer behavior W1 needs to bake in.
export function renderDocument(doc, { viewportWidth } = {}) {
  const { valid, errors } = validateDocument(doc);
  if (!valid) return { ok: false, errors };
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return { ok: false, errors: ["INVALID_VIEWPORT_WIDTH"] };

  const scale = computeScale(doc.canvas, viewportWidth);
  const stages = doc.stages.map(stage => ({
    id: stage.id,
    width: doc.canvas.width * scale,
    height: doc.canvas.height * scale,
    elements: orderedElements(stage).map(element => renderElement(element, scale)),
  }));
  return { ok: true, scale, stages };
}
