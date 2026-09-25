// Wall background KINDS, registered with the core's generic background registry (dist/wall/backgrounds.js). One Wall-wide background plus an optional per-stage
// override, so a Wall can feel continuous while a stage can still be treated on purpose. Kinds: color, gradient, image. (A video background is deferred: see the milestone
// notes - it needs bounded video storage/streaming rules and autoplay handling on phones, and the registry already leaves room for it as another kind.)
//   color:    { kind, color: #rrggbb }
//   gradient: { kind, from, to (#rrggbb), angle (0..360) }
//   image:    { kind, assetId, fit (cover | contain), posX, posY (0..100), opacity (0..1), overlay?: { color: #rrggbb, opacity: 0..1 } }
import { backgroundRegistry } from "../wall/backgrounds.js";
import { isHex, isGradient, inRange, isSet, isPlainObject } from "../wall/fields.js";
import { ASSET_ID } from "./image.js";

export const BACKGROUND_FITS = Object.freeze(["cover", "contain"]);
export const BACKGROUND_KINDS = Object.freeze(["color", "gradient", "image"]);

backgroundRegistry.register("color", {
  validate: background => (isHex(background.color) ? [] : ["INVALID_COLOR"]),
  render: background => ({ kind: "color", color: background.color }),
});

backgroundRegistry.register("gradient", {
  validate: background => (isGradient(background) ? [] : ["INVALID_GRADIENT"]),
  render: background => ({ kind: "gradient", from: background.from, to: background.to, angle: background.angle }),
});

backgroundRegistry.register("image", {
  validate(background) {
    const errors = [];
    if (typeof background.assetId !== "string" || !ASSET_ID.test(background.assetId)) errors.push("INVALID_ASSET");
    if (!BACKGROUND_FITS.includes(background.fit)) errors.push("INVALID_FIT");
    if (!inRange(background.posX, 0, 100) || !inRange(background.posY, 0, 100)) errors.push("INVALID_POSITION");
    if (!inRange(background.opacity, 0, 1)) errors.push("INVALID_OPACITY");
    if (isSet(background.overlay) && !(isPlainObject(background.overlay) && isHex(background.overlay.color) && inRange(background.overlay.opacity, 0, 1))) errors.push("INVALID_OVERLAY");
    return errors;
  },
  render(background) {
    const content = { kind: "image", assetId: background.assetId, fit: background.fit, posX: background.posX, posY: background.posY, opacity: background.opacity };
    if (isSet(background.overlay)) content.overlay = { color: background.overlay.color, opacity: background.overlay.opacity };
    return content;
  },
});

export const defaultBackground = kind => ({
  color: { kind: "color", color: "#0d0b14" },
  gradient: { kind: "gradient", from: "#1a1030", to: "#07060b", angle: 180 },
  image: null,
})[kind];
export const createImageBackground = (assetId, overrides = {}) => ({ kind: "image", assetId, fit: "cover", posX: 50, posY: 50, opacity: 1, ...overrides });
