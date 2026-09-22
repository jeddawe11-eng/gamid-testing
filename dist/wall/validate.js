// Wall-level and element-level validation. Never throws on malformed input - a Wall Document may come from anywhere later (persistence, an editor,
// a future import path) and must be safe to validate defensively. Returns { valid, errors }; never partially trusts a document once one structural
// check fails, since a malformed top-level shape makes it unsafe to even iterate stages/elements.
import { SUPPORTED_SCHEMA_VERSIONS } from "./schema.js";
import { elementRegistry } from "./elements.js";

// Never allow arbitrary user-supplied HTML, JavaScript, iframe markup, or executable embed code anywhere in a payload - a Wall-CORE guarantee, applied
// to every element's payload regardless of type or provider, so no current or future element/provider implementation can accidentally (or maliciously)
// smuggle markup through as "just data". Structural: any string value anywhere inside a payload is scanned, not just specific known fields.
const UNSAFE_PATTERNS = [/<\s*script/i, /<\s*iframe/i, /<\s*\/?[a-z][\s\S]*>/i, /javascript:/i, /\bon[a-z]+\s*=/i];

function scanForUnsafeContent(value, path, errors) {
  if (typeof value === "string") {
    if (UNSAFE_PATTERNS.some(pattern => pattern.test(value))) errors.push(`UNSAFE_PAYLOAD_CONTENT:${path}`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((item, i) => scanForUnsafeContent(item, `${path}[${i}]`, errors)); return; }
  if (value && typeof value === "object") { for (const [key, item] of Object.entries(value)) scanForUnsafeContent(item, `${path}.${key}`, errors); }
}

function validateElement(element, errors) {
  if (!element || typeof element !== "object") { errors.push("MALFORMED_ELEMENT"); return; }
  const { id, type, x, y, width, height, z, payload } = element;
  if (typeof id !== "string" || !id) { errors.push("INVALID_ELEMENT_ID"); return; }
  if (!Number.isFinite(x) || !Number.isFinite(y)) errors.push(`INVALID_POSITION:${id}`);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) errors.push(`INVALID_DIMENSIONS:${id}`);
  if (!Number.isFinite(z)) errors.push(`INVALID_Z_ORDER:${id}`);

  const definition = elementRegistry.get(type);
  if (!definition) { errors.push(`UNKNOWN_ELEMENT_TYPE:${id}`); return; }   // unsupported type: nothing further about this element can be trusted

  const payloadErrors = definition.validatePayload ? definition.validatePayload(payload) : [];
  for (const code of payloadErrors || []) errors.push(`${code}:${id}`);
  scanForUnsafeContent(payload, `${id}.payload`, errors);
}

const fitsCanvas = (element, canvas) =>
  element.x >= 0 && element.y >= 0 && element.x + element.width <= canvas.width && element.y + element.height <= canvas.height;

export function validateDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") return { valid: false, errors: ["MALFORMED_DOCUMENT"] };
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(doc.schemaVersion)) return { valid: false, errors: ["UNSUPPORTED_SCHEMA_VERSION"] };

  if (!doc.canvas || !Number.isFinite(doc.canvas.width) || doc.canvas.width <= 0 || !Number.isFinite(doc.canvas.height) || doc.canvas.height <= 0) {
    errors.push("INVALID_CANVAS");
  }
  // No architectural maximum here on purpose: a Wall may have any positive number of stages. A future product/editor/plan layer enforces whatever
  // business limit it wants (W0's own editor happened to cap itself at 3) without this document schema ever needing to change.
  if (!Array.isArray(doc.stages) || doc.stages.length < 1) errors.push("INVALID_STAGE_COUNT");
  if (errors.length) return { valid: false, errors };   // the top-level shape itself is untrustworthy; do not attempt to inspect stages/elements

  const seenElementIds = new Set();
  const seenStageIds = new Set();
  for (const stage of doc.stages) {
    if (!stage || typeof stage.id !== "string" || !stage.id) { errors.push("INVALID_STAGE_ID"); continue; }
    if (seenStageIds.has(stage.id)) errors.push(`DUPLICATE_STAGE_ID:${stage.id}`);
    seenStageIds.add(stage.id);
    if (!Array.isArray(stage.elements)) { errors.push(`INVALID_STAGE_ELEMENTS:${stage.id}`); continue; }
    for (const element of stage.elements) {
      validateElement(element, errors);
      if (element && typeof element.id === "string" && element.id) {
        if (seenElementIds.has(element.id)) errors.push(`DUPLICATE_ELEMENT_ID:${element.id}`);
        seenElementIds.add(element.id);
        if (Number.isFinite(element.x) && Number.isFinite(element.y) && Number.isFinite(element.width) && Number.isFinite(element.height) && !fitsCanvas(element, doc.canvas)) {
          errors.push(`OUTSIDE_CANVAS:${element.id}`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
