// The Wall `image` element type - ARTWORK (Round 3). One element for every uploaded picture: static images and animated GIFs alike (the asset's own type decides how
// the browser plays it). The payload never holds image bytes, a URL or a path: only an opaque `assetId` naming one of the OWNER's uploaded Wall assets (see assets.js;
// the database also refuses to save a Wall that names an asset the owner does not have). How the artwork is shown is typed, validated data:
//   assetId (uuid), fit (cover | contain | fill), posX / posY (0..100, where the picture sits inside its box - the crop position for cover), opacity (0..1)
//   optional (W3): radius (0..1000), alt (<= 120 characters, plain text), aw / ah (the source picture's pixel size, 1..20000, used only to keep its proportions)
//   optional (Round 3 - Artwork):
//     backdrop   "none" (truly transparent) | "#rrggbb". ABSENT = the pre-Round-3 look: a dark #14101f backing, so every earlier Wall renders exactly as before.
//     crop       { x, y, w, h, preset } - a NON-destructive window onto the source (fractions 0..1 of the source; the original asset is never rewritten).
//                preset: free | original | 1:1 | 16:9 | 9:16 (what the editor keeps the window's shape at).
//     mask       circle | rounded | hexagon | diamond (a clip, never baked into the file; absent = none)
//     effects    { shadow {color,blur,x,y}, glow {color,blur}, blur, brightness, contrast, saturation } - bounded numbers only, never CSS
//     blend      normal | screen | multiply | overlay | soft-light
//     locked     true = the canvas does not drag / resize / rotate it (still selectable; unlock from Layers or Properties)
//     clickThrough  true = a tap on the canvas passes through it to what is beneath (select it from Layers)
//     slice      { set, dir: v | h, from, to } - one piece of a SPLIT artwork: it shows the [from, to) band of the whole artwork. The pieces of one split share
//                `set` (also their group id) and the same asset, so a GIF split plays ONE shared animation timeline and nothing is re-encoded or re-uploaded.
//                Split hardening (optional, written by every new split):
//                  src    { x, y, w, h } - the artwork's exact geometry before it was split, so Remove Split is a clean inverse of Split
//                  scale  { w, h } - "Preserve source scale": the size (canonical units) of the WHOLE artwork every piece is a window onto. With it, moving or
//                         resizing a piece changes WHERE it is and WHICH PART it shows - never the picture's scale. Without it (pieces made before this), a
//                         piece's scale follows its own box, as before.
//                  cross  -1..1 - with `scale`: how far the window has moved across the cut direction (a fraction of the whole artwork), default 0
//   optional (media layers):
//     media      "video" = the asset is one of the owner's uploaded VIDEOS (MP4, or WebM - which may carry alpha transparency), shown as a muted, looping, inline video
//                layer with every artwork control. ABSENT = a picture (static image or GIF), exactly as before. A video is never split (INVALID_SLICE).
//     flipX, flipY   true = the media is mirrored horizontally / vertically where it is drawn (the file is never changed). Picture and video alike.
//     fade       { left, right } - 0..50 each: the percentage of the width over which the left / right edge fades to transparent (a mask, never baked in).
import { elementRegistry } from "../wall/elements.js";
import { isSet, isHex, inRange, isPlainObject } from "../wall/fields.js";

export const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const IMAGE_FITS = Object.freeze(["cover", "contain", "fill"]);
export const ALT_MAX = 120;
export const LEGACY_BACKDROP = "#14101f";
export const CROP_PRESETS = Object.freeze(["free", "original", "1:1", "16:9", "9:16"]);
export const MASKS = Object.freeze(["circle", "rounded", "hexagon", "diamond"]);
export const BLENDS = Object.freeze(["normal", "screen", "multiply", "overlay", "soft-light"]);
export const SLICE_DIRS = Object.freeze(["v", "h"]);
export const SPLIT_COUNTS = Object.freeze([2, 3, 4, 5]);
export const EFFECT_LIMITS = Object.freeze({ blur: [0, 40], brightness: [0, 2], contrast: [0, 2], saturation: [0, 3], shadowBlur: [0, 100], offset: [-100, 100] });
export const MIN_SLICE = 0.02;
export const SET_ID = /^[A-Za-z0-9_-]{1,64}$/;

const codePoints = value => Array.from(value).length;
const pixels = value => Number.isInteger(value) && value >= 1 && value <= 20000;
const EPS = 1e-9;

export function validateCrop(crop) {
  if (!isPlainObject(crop)) return false;
  if (Object.keys(crop).some(key => !["x", "y", "w", "h", "preset"].includes(key))) return false;
  if (!CROP_PRESETS.includes(crop.preset)) return false;
  if (![crop.x, crop.y].every(value => inRange(value, 0, 1)) || ![crop.w, crop.h].every(value => inRange(value, MIN_SLICE, 1))) return false;
  return crop.x + crop.w <= 1 + EPS && crop.y + crop.h <= 1 + EPS;
}

const EFFECT_KEYS = ["shadow", "glow", "blur", "brightness", "contrast", "saturation"];
export function validateEffects(effects) {
  if (!isPlainObject(effects)) return false;
  for (const [key, value] of Object.entries(effects)) {
    if (!EFFECT_KEYS.includes(key)) return false;
    if (!isSet(value)) continue;
    if (key === "shadow" && !(isPlainObject(value) && Object.keys(value).every(k => ["color", "blur", "x", "y"].includes(k)) && isHex(value.color) && inRange(value.blur, ...EFFECT_LIMITS.shadowBlur) && inRange(value.x, ...EFFECT_LIMITS.offset) && inRange(value.y, ...EFFECT_LIMITS.offset))) return false;
    if (key === "glow" && !(isPlainObject(value) && Object.keys(value).every(k => ["color", "blur"].includes(k)) && isHex(value.color) && inRange(value.blur, ...EFFECT_LIMITS.shadowBlur))) return false;
    if (["blur", "brightness", "contrast", "saturation"].includes(key) && !inRange(value, ...EFFECT_LIMITS[key])) return false;
  }
  return true;
}

export const SLICE_UNITS_MAX = 20000;
const onlyKeys = (value, keys) => isPlainObject(value) && Object.keys(value).every(key => keys.includes(key));
export function validateSlice(slice) {
  if (!onlyKeys(slice, ["set", "dir", "from", "to", "src", "scale", "cross"])) return false;
  if (typeof slice.set !== "string" || !SET_ID.test(slice.set) || !SLICE_DIRS.includes(slice.dir)) return false;
  if (!(inRange(slice.from, 0, 1) && inRange(slice.to, 0, 1) && slice.to - slice.from >= MIN_SLICE - EPS)) return false;
  if (isSet(slice.src) && !(onlyKeys(slice.src, ["x", "y", "w", "h"]) && inRange(slice.src.x, -SLICE_UNITS_MAX, SLICE_UNITS_MAX) && inRange(slice.src.y, -SLICE_UNITS_MAX, SLICE_UNITS_MAX)
    && inRange(slice.src.w, 1, SLICE_UNITS_MAX) && inRange(slice.src.h, 1, SLICE_UNITS_MAX))) return false;
  if (isSet(slice.scale) && !(onlyKeys(slice.scale, ["w", "h"]) && inRange(slice.scale.w, 1, SLICE_UNITS_MAX) && inRange(slice.scale.h, 1, SLICE_UNITS_MAX))) return false;
  if (isSet(slice.cross) && !inRange(slice.cross, -1, 1)) return false;
  return true;
}

// The shared LOOK of any picture on the Wall (an uploaded artwork, or the owner's live GamID avatar - gamid-data.js): one visual engine, one validator.
export function validateArtworkLook(payload, errors) {
  if (isSet(payload.backdrop) && !(payload.backdrop === "none" || isHex(payload.backdrop))) errors.push("INVALID_BACKDROP");
  if (isSet(payload.mask) && !MASKS.includes(payload.mask)) errors.push("INVALID_MASK");
  if (isSet(payload.effects) && !validateEffects(payload.effects)) errors.push("INVALID_EFFECTS");
  if (isSet(payload.blend) && !BLENDS.includes(payload.blend)) errors.push("INVALID_BLEND");
  if (isSet(payload.radius) && !inRange(payload.radius, 0, 1000)) errors.push("INVALID_RADIUS");
  return errors;
}

export function validateImagePayload(payload) {
  if (!isPlainObject(payload)) return ["PAYLOAD_NOT_OBJECT"];
  const errors = [];
  if (typeof payload.assetId !== "string" || !ASSET_ID.test(payload.assetId)) errors.push("INVALID_ASSET");
  if (!IMAGE_FITS.includes(payload.fit)) errors.push("INVALID_FIT");
  if (!inRange(payload.posX, 0, 100) || !inRange(payload.posY, 0, 100)) errors.push("INVALID_POSITION");
  if (!inRange(payload.opacity, 0, 1)) errors.push("INVALID_OPACITY");
  if (isSet(payload.alt) && (typeof payload.alt !== "string" || codePoints(payload.alt) > ALT_MAX)) errors.push("INVALID_ALT");
  if ((isSet(payload.aw) && !pixels(payload.aw)) || (isSet(payload.ah) && !pixels(payload.ah))) errors.push("INVALID_SOURCE_SIZE");
  validateArtworkLook(payload, errors);
  if (isSet(payload.crop) && !validateCrop(payload.crop)) errors.push("INVALID_CROP");
  if (isSet(payload.locked) && typeof payload.locked !== "boolean") errors.push("INVALID_LOCKED");
  if (isSet(payload.clickThrough) && typeof payload.clickThrough !== "boolean") errors.push("INVALID_CLICK_THROUGH");
  if (isSet(payload.media) && payload.media !== "video") errors.push("INVALID_MEDIA");
  if ((isSet(payload.slice) && !validateSlice(payload.slice)) || (payload.media === "video" && isSet(payload.slice))) errors.push("INVALID_SLICE");
  if ((isSet(payload.flipX) && typeof payload.flipX !== "boolean") || (isSet(payload.flipY) && typeof payload.flipY !== "boolean")) errors.push("INVALID_FLIP");
  if (isSet(payload.fade) && !validateFade(payload.fade)) errors.push("INVALID_FADE");
  return errors;
}

export const FADE_MAX = 50;
export const validateFade = fade => onlyKeys(fade, ["left", "right"]) && ["left", "right"].every(side => !isSet(fade[side]) || inRange(fade[side], 0, FADE_MAX));
export const isVideoMedia = payload => payload?.media === "video";

const LOOK_KEYS = ["backdrop", "mask", "effects", "blend", "radius"];
export function renderImagePayload(payload) {
  const content = { kind: "image", assetId: payload.assetId, fit: payload.fit, posX: payload.posX, posY: payload.posY, opacity: payload.opacity };
  for (const key of ["alt", "aw", "ah", "crop", "locked", "clickThrough", "slice", "media", "flipX", "flipY", "fade", ...LOOK_KEYS]) if (isSet(payload[key])) content[key] = payload[key];
  return content;
}

// New artwork is TRANSPARENT by default (backdrop "none"); only documents saved before Round 3 lack the field and keep their dark backing.
export const createImagePayload = (assetId, overrides = {}) => ({ assetId, fit: "cover", posX: 50, posY: 50, opacity: 1, backdrop: "none", ...overrides });

// A uniform resize scales the sizes that are canonical units (corner radius, effect offsets / blurs); proportions (crop, slice) are fractions and do not change.
function scaleImagePayload(payload, factor) {
  const next = { ...payload };
  if (typeof payload.radius === "number") next.radius = Math.min(1000, Math.round(payload.radius * factor));
  if (isPlainObject(payload.effects)) {
    const clampTo = (value, [min, max]) => Math.min(max, Math.max(min, Math.round(value * factor * 10) / 10));
    const effects = { ...payload.effects };
    if (typeof effects.blur === "number") effects.blur = clampTo(effects.blur, EFFECT_LIMITS.blur);
    if (isPlainObject(effects.shadow)) effects.shadow = { ...effects.shadow, blur: clampTo(effects.shadow.blur, EFFECT_LIMITS.shadowBlur), x: clampTo(effects.shadow.x, EFFECT_LIMITS.offset), y: clampTo(effects.shadow.y, EFFECT_LIMITS.offset) };
    if (isPlainObject(effects.glow)) effects.glow = { ...effects.glow, blur: clampTo(effects.glow.blur, EFFECT_LIMITS.shadowBlur) };
    next.effects = effects;
  }
  // a split piece's preserved source scale follows a uniform resize of its group (the whole artwork is being resized on purpose); `src` stays the pre-split record
  if (isPlainObject(payload.slice?.scale)) {
    const fit = value => Math.min(SLICE_UNITS_MAX, Math.max(1, Math.round(value * factor * 100) / 100));
    next.slice = { ...payload.slice, scale: { w: fit(payload.slice.scale.w), h: fit(payload.slice.scale.h) } };
  }
  return next;
}

// ---- crop geometry (pure; used by the editor and the painter) ----------------------------------------------------------------------------------------------
const PRESET_RATIO = { "1:1": 1, "16:9": 16 / 9, "9:16": 9 / 16 };
// The crop window for a preset, a zoom (1 = the largest window of that shape) and a focal point (0..100 %), in fractions of a source of aw x ah pixels.
// `ratio` (on-screen width / height) is what "free" keeps - the box's current proportions - so a free crop never distorts the picture.
export function cropFor(preset, { zoom = 1, focusX = 50, focusY = 50, aw = 1, ah = 1, ratio = null } = {}) {
  const sourceRatio = aw / ah;
  const target = preset === "original" ? sourceRatio : preset === "free" ? (ratio > 0 ? ratio : sourceRatio) : PRESET_RATIO[preset];
  let w = 1, h = 1;
  if (target > sourceRatio) h = sourceRatio / target; else w = target / sourceRatio;
  const z = Math.min(8, Math.max(1, zoom));
  // 4-decimal fractions; the position is placed with the ROUNDED size and rounded down, so the window always stays inside the source (x + w <= 1)
  const round = value => Math.round(value * 10000) / 10000, down = value => Math.floor(value * 10000 + 1e-7) / 10000;
  w = Math.min(1, round(Math.max(MIN_SLICE, w / z))); h = Math.min(1, round(Math.max(MIN_SLICE, h / z)));
  const x = down(Math.min(1 - w, Math.max(0, (focusX / 100) - w / 2))), y = down(Math.min(1 - h, Math.max(0, (focusY / 100) - h / 2)));
  return { x, y, w, h, preset };
}
// The on-screen proportions (width / height) of a crop window of a source aw x ah (the editor keeps the element box at this ratio).
export const cropRatio = (crop, aw, ah) => (crop.w * aw) / (crop.h * ah);

elementRegistry.register("image", { validatePayload: validateImagePayload, render: renderImagePayload, scale: scaleImagePayload });
