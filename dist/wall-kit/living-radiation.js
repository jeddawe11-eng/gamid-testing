// Living Radiation (V1, waveform refinement) - the optional `radiation` setting of a Wall text element, and how a painted text gets it. Like living-fire.js this file
// has no graphics code: the renderer (living-radiation-engine.js, its shader and the distance-field Worker it shares with Living Fire) is fetched only when a painted
// Wall actually has a Living Radiation text.
//
//   radiation: the package's own settings contract (GAMID_LIVING_RADIATION_V1 source/settings.js), unchanged - every key required, no other key:
//     style reactor|meltdown|phantom, color one of ten presets or "custom", customColor #rrggbb, waveform geiger|fracture|spectral,
//     speed, intensity, width, interval, distortion, ripple, fragmentation, recovery, glow, cracks, afterglow (RADIATION_RANGES), particles, mist, scanLines, flicker
//
// The database mirrors it (private.wall_radiation_ok, INVALID_RADIATION). The letters keep the text's own font, weight, style and lines. A text over 80 characters, a
// device without WebGL2, a failed shader or a lost graphics context shows the readable static fallback (wall-kit.css .is-radiation-static) in the chosen energy colour.
import { isPlainObject } from "../wall/fields.js";
import { textFontCss } from "./custom-fonts.js";

// ---- the package's settings contract (source/settings.js), values unchanged ----
export const RADIATION_STYLES = Object.freeze({ reactor: "Reactor", meltdown: "Meltdown", phantom: "Phantom Radiation" });
export const RADIATION_COLORS = Object.freeze({ green: ["Radioactive Green", "#80ff2b"], yellow: ["Nuclear Yellow", "#ffe34d"], orange: ["Toxic Orange", "#ff862b"], red: ["Reactor Red", "#ff3d4f"], magenta: ["Magenta Core", "#ff38bb"], purple: ["Void Purple", "#a66aff"], blue: ["Arctic Blue", "#579cff"], cyan: ["Electric Cyan", "#3ceaff"], lime: ["Acid Lime", "#d0ff32"], white: ["White Hot", "#edf7ff"] });
export const RADIATION_RANGES = Object.freeze({ speed: [.25, 2], intensity: [.2, 1.4], width: [.08, .5], interval: [1, 12], distortion: [0, 1], ripple: [0, 1], fragmentation: [0, .65], recovery: [.4, 2], glow: [0, 1.5], cracks: [0, 1.5], afterglow: [.2, 3] });
export const RADIATION_WAVEFORMS = Object.freeze(["geiger", "fracture", "spectral"]);
export const RADIATION_LAYERS = Object.freeze(["particles", "mist", "scanLines", "flicker"]);
export const RADIATION_MAX_TEXT = 80;
export function createRadiation(style = "reactor") {
  return { style, color: "green", customColor: "#80ff2b", waveform: "geiger", speed: 1, intensity: 1, width: .22, interval: 3, distortion: .55, ripple: .5, fragmentation: .2, recovery: 1, glow: .8, cracks: .85, afterglow: 1.4, particles: true, mist: true, scanLines: false, flicker: false,
    ...(style === "meltdown" ? { intensity: 1.25, width: .29, distortion: .9, ripple: .85, fragmentation: .5, recovery: .75, cracks: 1.2, waveform: "fracture" } : style === "phantom" ? { speed: .6, width: .32, distortion: .45, ripple: .3, fragmentation: .08, recovery: .55, glow: .6, cracks: .45, afterglow: 2.5, particles: false, waveform: "spectral" } : {}) };
}
const KEYS = Object.keys(createRadiation());
export function validateRadiation(v) {
  return isPlainObject(v) && Object.keys(v).length === KEYS.length && KEYS.every(k => Object.hasOwn(v, k))
    && typeof v.style === "string" && typeof v.color === "string" && Object.hasOwn(RADIATION_STYLES, v.style) && (Object.hasOwn(RADIATION_COLORS, v.color) || v.color === "custom")
    && typeof v.customColor === "string" && /^#[0-9a-fA-F]{6}$/.test(v.customColor) && RADIATION_WAVEFORMS.includes(v.waveform)
    && RADIATION_LAYERS.every(k => typeof v[k] === "boolean")
    && Object.entries(RADIATION_RANGES).every(([k, [lo, hi]]) => typeof v[k] === "number" && Number.isFinite(v[k]) && v[k] >= lo && v[k] <= hi);
}
export const radiationColor = v => (v.color === "custom" ? v.customColor : RADIATION_COLORS[v.color][1]);
export const radiationText = text => String(text ?? "").replace(/\s+/g, " ").trim();
export const radiationTextFits = text => Array.from(radiationText(text)).length <= RADIATION_MAX_TEXT;
// The package's style chooser: a new style starts from that style's own defaults and keeps the chosen colour (source/lab.js chooseStyle).
export const radiationForStyle = (current, style) => ({ ...createRadiation(style), color: current?.color ?? "green", customColor: current?.customColor ?? "#80ff2b" });

// ---- painting ----
const DESIGN_W = 1200, DESIGN_H = 640, MAX_RENDER_W = 960, MIN_RENDER_W = 64, DESIGN_SIZE = 220;
const num = value => String(Math.round(value * 1000) / 1000);
let engine = null, loading = null;
const loadEngine = () => (engine ? Promise.resolve(engine) : (loading ??= import("./living-radiation-engine.js").then(module => (engine = module))));

// Called by paint.js for a text element that has `radiation`, after its text node is painted. `item` is the painted box (px), `scale` the render scale.
export function attachRadiation(node, content, scale, item) {
  if (!validateRadiation(content.radiation) || typeof document === "undefined" || !node.classList) return;
  node.classList.add("has-radiation", "is-radiation-static");
  node.style?.setProperty?.("--radiation-color", radiationColor(content.radiation));
  const text = radiationText(content.text);
  if (!text || !radiationTextFits(text)) { node.setAttribute("data-radiation", "static"); return; }
  const canvas = document.createElement("canvas");
  if (typeof canvas.getContext !== "function") return;
  canvas.className = "wall-radiation";
  canvas.setAttribute("aria-hidden", "true");
  canvas.hidden = true;   // out of the layout until it is placed: never a layout shift
  canvas.style.setProperty("opacity", num(content.opacity));
  node.appendChild(canvas);
  const fontPx = content.fontSize * scale;
  const rtl = content.direction === "rtl" || (content.direction === "auto" && /[֐-ࣿיִ-ﻼ]/.test(text));
  const lines = String(content.text).replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  const boxEm = Math.round((item.width / fontPx) * 100) / 100;
  const spec = { text: lines, wrap: content.wrap === true, boxEm, lineHeight: content.lineHeight, align: content.align, family: textFontCss(content), weight: content.fontWeight, italic: content.italic === true, letterSpacing: content.letterSpacing / content.fontSize, size: DESIGN_SIZE, rtl };
  const key = JSON.stringify([spec.text, spec.wrap ? boxEm : 0, spec.lineHeight, spec.align, spec.family, spec.weight, spec.italic, Math.round(spec.letterSpacing * 1000), rtl]);
  // the 1200 x 640 frame is scaled so its letters are the text's own size, the box's top-left corner pinned to the element's (as Living Fire)
  const place = field => {
    const f = fontPx / field.size, width = DESIGN_W * f, height = DESIGN_H * f;
    const style = canvas.style;
    style.setProperty("left", `${num(-field.boxLeft * f)}px`); style.setProperty("top", `${num(-field.boxTop * f)}px`);
    style.setProperty("width", `${num(width)}px`); style.setProperty("height", `${num(height)}px`);
    const ratio = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const renderWidth = Math.max(MIN_RENDER_W, Math.min(MAX_RENDER_W, Math.round(width * ratio)));
    canvas.width = renderWidth; canvas.height = Math.round((renderWidth * DESIGN_H) / DESIGN_W);
    canvas.hidden = false;
  };
  const setState = state => { node.classList.toggle("is-radiation-live", state === "live"); node.classList.toggle("is-radiation-static", state !== "live"); node.setAttribute("data-radiation", state); };
  const start = module => { if (!module.mount({ canvas, id: item.id ?? key, spec, radiation: content.radiation, key, place, setState })) setState("static"); };
  if (engine) start(engine);
  else loadEngine().then(module => whenIdle(() => start(module)), () => setState("static"));
}
// the first WebGL2 context of a page is created when the page is idle, never before the Wall's first paint (as Living Fire)
const whenIdle = fn => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
