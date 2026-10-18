// Living Fire (V3) - the optional `fire` setting of a Wall text element, and how a painted text gets it. This file is small and has no graphics code: the V3
// renderer (living-fire-engine.js, its shaders and the distance-field Worker) is fetched only when a painted Wall actually has a Living Fire text, so every other
// Wall and every other page loads exactly what it loaded before.
//
//   fire: { style: organic|cinematic|mythic, intensity 0.2..1.4, speed 0.15..2, turbulence 0.15..1.5, color: natural|crimson|blue, sparks: boolean, mode: full|letters }
//
// Every key is required and no other key is allowed (the database mirrors this: private.wall_text_payload_errors, INVALID_FIRE). The three styles are three looks
// of the same V3 effect, not fonts: the letters keep the text's own font, weight, style and LINES (the same line breaks, alignment and line height as the painted
// text, so the fire sits inside the text's box). Living Fire draws at most FIRE_LIMITS.maxText characters;
// a longer text, a device without WebGL2, a failed shader or a lost graphics context shows the readable static fallback (wall-kit.css .is-fire-static).
import { isPlainObject } from "../wall/fields.js";
import { textFontCss } from "./custom-fonts.js";

export const FIRE_STYLES = Object.freeze(["organic", "cinematic", "mythic"]);
export const FIRE_COLORS = Object.freeze(["natural", "crimson", "blue"]);
export const FIRE_MODES = Object.freeze(["full", "letters"]);
export const FIRE_LIMITS = Object.freeze({ intensity: [0.2, 1.4], speed: [0.15, 2], turbulence: [0.15, 1.5], maxText: 80 });
// At most this many fire texts animate at once on a page (fewer on a slow device; the rest show a still V3 frame). Set from the Phase C audit: software rendering
// keeps ~29 fps flames at 2 texts and falls to 17 fps at 4, a mid GPU keeps 29 fps at 24 (docs/WALL-EDITOR-TEXT-EFFECTS.md).
export const FIRE_LIVE_LIMIT = 4;
// Each style's own tuning in the V3 package (its setDirection presets): choosing a style starts from these.
export const FIRE_STYLE_DEFAULTS = Object.freeze({
  organic: Object.freeze({ intensity: 1, turbulence: 0.9, speed: 1 }),
  cinematic: Object.freeze({ intensity: 1.08, turbulence: 0.9, speed: 1.05 }),
  mythic: Object.freeze({ intensity: 1, turbulence: 0.95, speed: 0.9 }),
});
const FIRE_KEYS = ["style", "intensity", "speed", "turbulence", "color", "sparks", "mode"];
export const createFire = (style = "organic") => ({ style, ...FIRE_STYLE_DEFAULTS[style], color: "natural", sparks: false, mode: "full" });

const within = (value, [min, max]) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
export function validateFire(value) {
  return isPlainObject(value) && Object.keys(value).length === FIRE_KEYS.length && FIRE_KEYS.every(key => key in value)
    && FIRE_STYLES.includes(value.style) && FIRE_COLORS.includes(value.color) && FIRE_MODES.includes(value.mode) && typeof value.sparks === "boolean"
    && within(value.intensity, FIRE_LIMITS.intensity) && within(value.speed, FIRE_LIMITS.speed) && within(value.turbulence, FIRE_LIMITS.turbulence);
}

// The characters counted against FIRE_LIMITS.maxText: line breaks and runs of spaces count as one space.
export const fireText = text => String(text ?? "").replace(/\s+/g, " ").trim();
export const fireTextFits = text => Array.from(fireText(text)).length <= FIRE_LIMITS.maxText;

const DESIGN_W = 1200, DESIGN_H = 640, MAX_RENDER_W = 960, MIN_RENDER_W = 64, DESIGN_SIZE = 220;
const num = value => String(Math.round(value * 1000) / 1000);
let engine = null, loading = null;
const loadEngine = () => (engine ? Promise.resolve(engine) : (loading ??= import("./living-fire-engine.js").then(module => (engine = module))));

// Called by paint.js for a text element that has `fire`, after its text node is painted. `item` is the painted box (px), `scale` the render scale.
export function attachFire(node, content, scale, item) {
  if (!validateFire(content.fire) || typeof document === "undefined" || !node.classList) return;
  node.classList.add("has-fire", "is-fire-static");
  const text = fireText(content.text);
  if (!text || !fireTextFits(text)) { node.setAttribute("data-fire", "static"); return; }
  const canvas = document.createElement("canvas");
  if (typeof canvas.getContext !== "function") return;
  canvas.className = "wall-fire";
  canvas.setAttribute("aria-hidden", "true");
  canvas.hidden = true;   // out of the layout until it is placed: a fire text never causes a layout shift
  canvas.style.setProperty("opacity", num(content.opacity));
  node.appendChild(canvas);
  const fontPx = content.fontSize * scale;
  const rtl = content.direction === "rtl" || (content.direction === "auto" && /[֐-ࣿיִ-ﻼ]/.test(text));
  // the letters are laid out like the painted text: its own line breaks and, with wrap on, the box width (boxEm: the box width in units of the font size)
  const lines = String(content.text).replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  const boxEm = Math.round((item.width / fontPx) * 100) / 100;
  const spec = { text: lines, wrap: content.wrap === true, boxEm, lineHeight: content.lineHeight, align: content.align, family: textFontCss(content), weight: content.fontWeight, italic: content.italic === true, letterSpacing: content.letterSpacing / content.fontSize, size: DESIGN_SIZE, rtl };
  const key = JSON.stringify([spec.text, spec.wrap ? boxEm : 0, spec.lineHeight, spec.align, spec.family, spec.weight, spec.italic, Math.round(spec.letterSpacing * 1000), rtl]);
  // The V3 frame (1200 x 640 design units) is scaled so its letters are the text's own size; the field records where the text box's top-left corner is in that
  // frame, so that corner is pinned to the element's: every line then sits exactly where the painted text puts it (Bounding box fix, 2026-10-19).
  const place = field => {
    const f = fontPx / field.size, width = DESIGN_W * f, height = DESIGN_H * f;
    const left = -field.boxLeft * f, top = -field.boxTop * f;
    const style = canvas.style;
    style.setProperty("left", `${num(left)}px`); style.setProperty("top", `${num(top)}px`);
    style.setProperty("width", `${num(width)}px`); style.setProperty("height", `${num(height)}px`);
    const ratio = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const renderWidth = Math.max(MIN_RENDER_W, Math.min(MAX_RENDER_W, Math.round(width * ratio)));
    canvas.width = renderWidth; canvas.height = Math.round((renderWidth * DESIGN_H) / DESIGN_W);
    canvas.hidden = false;
  };
  const setState = state => { node.classList.toggle("is-fire-live", state === "live"); node.classList.toggle("is-fire-static", state !== "live"); node.setAttribute("data-fire", state); };
  const start = module => { if (!module.mount({ canvas, id: item.id ?? key, spec, fire: content.fire, key, place, setState })) setState("static"); };
  if (engine) start(engine);
  else loadEngine().then(module => whenIdle(() => start(module)), () => setState("static"));
}
// The first WebGL2 context of a page takes the browser ~0.2 s to create (measured, docs/WALL-EDITOR-TEXT-EFFECTS.md): it is started when the page is idle, so it never
// delays the Wall's first paint; the text shows its static fallback until then.
const whenIdle = fn => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
