// Living Ice (V5, material & colour control) - the optional `ice` setting of a Wall text element, and how a painted text gets it. Like living-fire.js this file has no
// graphics code: the renderer (living-ice-engine.js, its shaders and the distance-field Worker it shares with Living Fire) is fetched only when a painted Wall actually
// has a Living Ice text.
//
//   ice: the package's material profile (GAMID_LIVING_ICE_V5_MATERIALS source/materials.js) - its preset and settings, unchanged - every key required, no other key:
//     preset glacier|arctic|deep, base / frostColor / shadow / highlight #rrggbb, depth 0.3..2.2, transparency 0..1, frost 0..1, density 0..1, size 0.55..1.2,
//     scattering 0..2, roughness 0..1
//
// The preset is the factory starting point the settings came from (the package shows "edited" once they differ); every value stays editable. The database mirrors the
// rule (private.wall_ice_ok, INVALID_ICE). The letters keep the text's own font, weight, style and lines. A text over 80 characters, a device without WebGL2, a failed
// shader or a lost graphics context shows the readable static fallback (wall-kit.css .is-ice-static) in the chosen ice colours.
import { isPlainObject } from "../wall/fields.js";
import { textFontCss } from "./custom-fonts.js";

// ---- the package's material contract (source/materials.js), values unchanged ----
export const ICE_COLOR_KEYS = Object.freeze(["base", "frostColor", "shadow", "highlight"]);
export const ICE_LIMITS = Object.freeze({ depth: [.3, 2.2], transparency: [0, 1], frost: [0, 1], density: [0, 1], size: [.55, 1.2], scattering: [0, 2], roughness: [0, 1] });
export const ICE_PRESETS = Object.freeze({
  glacier: Object.freeze({ name: "Glacier Blue", base: "#2588d2", frostColor: "#effbff", shadow: "#041d49", highlight: "#c8f0ff", depth: 1.25, transparency: .44, frost: .72, density: .92, size: 1.08, scattering: 1.15, roughness: .34 }),
  arctic: Object.freeze({ name: "Arctic White", base: "#a2d3e8", frostColor: "#ffffff", shadow: "#235373", highlight: "#f1fdff", depth: .88, transparency: .25, frost: .94, density: .70, size: .84, scattering: .92, roughness: .64 }),
  deep: Object.freeze({ name: "Deep Ice", base: "#145bb0", frostColor: "#b0e9ff", shadow: "#010d32", highlight: "#87dfff", depth: 1.72, transparency: .65, frost: .38, density: .84, size: 1.16, scattering: 1.35, roughness: .23 }),
});
export const ICE_MAX_TEXT = 80;
const ICE_KEYS = ["preset", ...ICE_COLOR_KEYS, ...Object.keys(ICE_LIMITS)];
// A preset's own values (the package's fromPreset): choosing a preset starts from these; Glacier Blue is the package default.
export function createIce(preset = "glacier") {
  const { name, ...settings } = ICE_PRESETS[preset];
  return { preset, ...settings };
}
const HEX = /^#[0-9a-fA-F]{6}$/;
export function validateIce(value) {
  return isPlainObject(value) && Object.keys(value).length === ICE_KEYS.length && ICE_KEYS.every(key => Object.hasOwn(value, key))
    && typeof value.preset === "string" && Object.hasOwn(ICE_PRESETS, value.preset)
    && ICE_COLOR_KEYS.every(key => typeof value[key] === "string" && HEX.test(value[key]))
    && Object.entries(ICE_LIMITS).every(([key, [lo, hi]]) => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= lo && value[key] <= hi);
}
// true when the settings still equal their preset's own values (the package's "edited" indicator is the opposite)
export const iceMatchesPreset = value => { const base = createIce(value.preset); return ICE_KEYS.every(key => (typeof base[key] === "string" ? String(value[key]).toLowerCase() === base[key] : value[key] === base[key])); };
export const iceText = text => String(text ?? "").replace(/\s+/g, " ").trim();
export const iceTextFits = text => Array.from(iceText(text)).length <= ICE_MAX_TEXT;

// ---- painting ----
const DESIGN_W = 1920, DESIGN_H = 800, MAX_RENDER_W = 1536, MIN_RENDER_W = 64, DESIGN_SIZE = 430;   // the package's frame, master camera width and letter size
// The ice is ray-marched with fine facets and no anti-aliasing of its own: a Wall text a few dozen pixels tall would sample its 1920-unit frame far more coarsely
// than the package's master camera does (0.8 px per unit) and look speckled. It is drawn at twice its displayed resolution (never above the package's 1536 px
// camera) and the browser scales it down, which keeps the material's look at Wall sizes (measured: docs/WALL-PRO-EFFECTS.md).
export const ICE_SUPERSAMPLE = 2;
const num = value => String(Math.round(value * 1000) / 1000);
let engine = null, loading = null;
const loadEngine = () => (engine ? Promise.resolve(engine) : (loading ??= import("./living-ice-engine.js").then(module => (engine = module))));

// Called by paint.js for a text element that has `ice`, after its text node is painted. `item` is the painted box (px), `scale` the render scale.
export function attachIce(node, content, scale, item) {
  if (!validateIce(content.ice) || typeof document === "undefined" || !node.classList) return;
  node.classList.add("has-ice", "is-ice-static");
  for (const [name, key] of [["--ice-base", "base"], ["--ice-frost", "frostColor"], ["--ice-shadow", "shadow"]]) node.style?.setProperty?.(name, content.ice[key]);
  const text = iceText(content.text);
  if (!text || !iceTextFits(text)) { node.setAttribute("data-ice", "static"); return; }
  const canvas = document.createElement("canvas");
  if (typeof canvas.getContext !== "function") return;
  canvas.className = "wall-ice";
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
  // the 1920 x 800 frame is scaled so its letters are the text's own size, the box's top-left corner pinned to the element's (as Living Fire)
  const place = field => {
    const f = fontPx / field.size, width = DESIGN_W * f, height = DESIGN_H * f;
    const style = canvas.style;
    style.setProperty("left", `${num(-field.boxLeft * f)}px`); style.setProperty("top", `${num(-field.boxTop * f)}px`);
    style.setProperty("width", `${num(width)}px`); style.setProperty("height", `${num(height)}px`);
    const ratio = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const renderWidth = Math.max(MIN_RENDER_W, Math.min(MAX_RENDER_W, Math.round(width * ratio * ICE_SUPERSAMPLE)));
    canvas.width = renderWidth; canvas.height = Math.round((renderWidth * DESIGN_H) / DESIGN_W);
    canvas.hidden = false;
  };
  const setState = state => { node.classList.toggle("is-ice-live", state === "live"); node.classList.toggle("is-ice-static", state !== "live"); node.setAttribute("data-ice", state); };
  const start = module => { if (!module.mount({ canvas, id: item.id ?? key, spec, ice: content.ice, key, place, setState })) setState("static"); };
  if (engine) start(engine);
  else loadEngine().then(module => whenIdle(() => start(module)), () => setState("static"));
}
// the first WebGL2 context of a page is created when the page is idle, never before the Wall's first paint (as Living Fire)
const whenIdle = fn => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
