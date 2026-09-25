// The real Wall `text` element type. It registers itself into the Wall core's element registry (importing this module is what makes a document with text
// elements valid) - the core files never name it. The payload is owned entirely by this type:
//
//   text (string, <= 2000 characters), fontFamily (catalog key), fontSize (4..600), fontWeight (100..900 in steps of 100), italic, underline, color (#rrggbb),
//   align (left|center|right), lineHeight (0.5..4), letterSpacing (-20..100), opacity (0..1), direction (ltr|rtl|auto), wrap (boolean)
//   optional: fontRef (opaque string reserved for a future font asset - never inspected here), stroke {color,width}, shadow {color,blur,x,y}, glow {color,blur},
//             gradient {from,to,angle}
//
// All sizes are canonical design units (the 1000-wide stage space), never pixels. Strings are only ever painted as text (textContent), never as markup, and the
// Wall core's universal unsafe-content scan additionally rejects markup-shaped text before it can be stored.
import { elementRegistry } from "../wall/elements.js";
import { isSet, isHex, inRange, isGradient, isPlainObject } from "../wall/fields.js";
import { FONT_KEY } from "./fonts.js";

export const TEXT_LIMITS = Object.freeze({
  maxLength: 2000, fontSize: [4, 600], lineHeight: [0.5, 4], letterSpacing: [-20, 100], opacity: [0, 1],
  strokeWidth: [0, 50], blur: [0, 100], offset: [-100, 100], fontRefMax: 200,
});
export const ALIGNS = Object.freeze(["left", "center", "right"]);
export const DIRECTIONS = Object.freeze(["ltr", "rtl", "auto"]);
export const WEIGHTS = Object.freeze([100, 200, 300, 400, 500, 600, 700, 800, 900]);

const codePoints = value => Array.from(value).length;
const stroke = value => isPlainObject(value) && isHex(value.color) && inRange(value.width, ...TEXT_LIMITS.strokeWidth);
const shadow = value => isPlainObject(value) && isHex(value.color) && inRange(value.blur, ...TEXT_LIMITS.blur) && inRange(value.x, ...TEXT_LIMITS.offset) && inRange(value.y, ...TEXT_LIMITS.offset);
const glow = value => isPlainObject(value) && isHex(value.color) && inRange(value.blur, ...TEXT_LIMITS.blur);

export function validateTextPayload(payload) {
  if (!isPlainObject(payload)) return ["PAYLOAD_NOT_OBJECT"];
  const errors = [];
  if (typeof payload.text !== "string" || codePoints(payload.text) > TEXT_LIMITS.maxLength) errors.push("INVALID_TEXT");
  if (typeof payload.fontFamily !== "string" || !FONT_KEY.test(payload.fontFamily)) errors.push("INVALID_FONT_FAMILY");
  if (!inRange(payload.fontSize, ...TEXT_LIMITS.fontSize)) errors.push("INVALID_FONT_SIZE");
  if (!(Number.isInteger(payload.fontWeight) && payload.fontWeight >= 100 && payload.fontWeight <= 900 && payload.fontWeight % 100 === 0)) errors.push("INVALID_FONT_WEIGHT");
  if (typeof payload.italic !== "boolean") errors.push("INVALID_ITALIC");
  if (typeof payload.underline !== "boolean") errors.push("INVALID_UNDERLINE");
  if (!isHex(payload.color)) errors.push("INVALID_COLOR");
  if (!ALIGNS.includes(payload.align)) errors.push("INVALID_ALIGN");
  if (!inRange(payload.lineHeight, ...TEXT_LIMITS.lineHeight)) errors.push("INVALID_LINE_HEIGHT");
  if (!inRange(payload.letterSpacing, ...TEXT_LIMITS.letterSpacing)) errors.push("INVALID_LETTER_SPACING");
  if (!inRange(payload.opacity, ...TEXT_LIMITS.opacity)) errors.push("INVALID_OPACITY");
  if (!DIRECTIONS.includes(payload.direction)) errors.push("INVALID_DIRECTION");
  if (typeof payload.wrap !== "boolean") errors.push("INVALID_WRAP");
  if (isSet(payload.fontRef) && (typeof payload.fontRef !== "string" || !payload.fontRef || codePoints(payload.fontRef) > TEXT_LIMITS.fontRefMax)) errors.push("INVALID_FONT_REF");
  if (isSet(payload.stroke) && !stroke(payload.stroke)) errors.push("INVALID_STROKE");
  if (isSet(payload.shadow) && !shadow(payload.shadow)) errors.push("INVALID_SHADOW");
  if (isSet(payload.glow) && !glow(payload.glow)) errors.push("INVALID_GLOW");
  if (isSet(payload.gradient) && !isGradient(payload.gradient)) errors.push("INVALID_GRADIENT");
  return errors;
}

const OPTIONAL = ["fontRef", "stroke", "shadow", "glow", "gradient"];
const CORE = ["text", "fontFamily", "fontSize", "fontWeight", "italic", "underline", "color", "align", "lineHeight", "letterSpacing", "opacity", "direction", "wrap"];

// A plain, JSON-serializable description of how to paint the text (canonical units). Only known fields are copied: unknown payload keys never reach a painter.
export function renderTextPayload(payload) {
  const content = { kind: "text" };
  for (const key of CORE) content[key] = payload[key];
  for (const key of OPTIONAL) if (isSet(payload[key])) content[key] = payload[key];
  return content;
}

const r1 = value => Math.round(value * 10) / 10;
const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));

// A uniform group resize scales sizes but never changes what the text says or how it reads.
export function scaleTextPayload(payload, factor) {
  const next = { ...payload };
  next.fontSize = clamp(r1(payload.fontSize * factor), TEXT_LIMITS.fontSize);
  next.letterSpacing = clamp(r1(payload.letterSpacing * factor), TEXT_LIMITS.letterSpacing);
  if (isPlainObject(payload.stroke)) next.stroke = { ...payload.stroke, width: clamp(r1(payload.stroke.width * factor), TEXT_LIMITS.strokeWidth) };
  if (isPlainObject(payload.shadow)) next.shadow = { ...payload.shadow, blur: clamp(r1(payload.shadow.blur * factor), TEXT_LIMITS.blur), x: clamp(r1(payload.shadow.x * factor), TEXT_LIMITS.offset), y: clamp(r1(payload.shadow.y * factor), TEXT_LIMITS.offset) };
  if (isPlainObject(payload.glow)) next.glow = { ...payload.glow, blur: clamp(r1(payload.glow.blur * factor), TEXT_LIMITS.blur) };
  return next;
}

// A new text element's payload. Overrides are applied on top; the result is always a complete, valid payload.
export function createTextPayload(overrides = {}) {
  return {
    text: "Your text", fontFamily: "orbitron", fontSize: 96, fontWeight: 700, italic: false, underline: false, color: "#ffffff", align: "center",
    lineHeight: 1.2, letterSpacing: 0, opacity: 1, direction: "auto", wrap: true, ...overrides,
  };
}

elementRegistry.register("text", { validatePayload: validateTextPayload, render: renderTextPayload, scale: scaleTextPayload });
