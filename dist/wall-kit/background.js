// Wall background KINDS, registered with the core's generic background registry (dist/wall/backgrounds.js). One Wall-wide background plus an optional per-stage
// override, so a Wall can feel continuous while a stage can still be treated on purpose. Kinds: color, gradient, image, video.
//   color:    { kind, color: #rrggbb }
//   gradient: { kind, from, to (#rrggbb), angle (0..360) }
//   image:    { kind, assetId, fit (cover | contain), posX, posY (0..100), opacity (0..1), overlay?: { color: #rrggbb, opacity: 0..1 } }
//   video:    the SAME fields as image, naming one of the owner's MP4 (H.264) video assets. Background only: it always plays muted, looping and inline, with no controls,
//             behind every element, and never takes a tap. The database checks that a video background names a video asset and every other asset reference an image.
//   image / video, optional: flipX, flipY (booleans) - mirror the DRAWN background horizontally / vertically. Only how it is shown: the uploaded file is untouched.
//             Absent (every background saved before) = not flipped.
import { backgroundRegistry } from "../wall/backgrounds.js";
import { isHex, isGradient, inRange, isSet, isPlainObject } from "../wall/fields.js";
import { ASSET_ID } from "./image.js";

export const BACKGROUND_FITS = Object.freeze(["cover", "contain"]);
export const BACKGROUND_KINDS = Object.freeze(["color", "gradient", "image", "video"]);

backgroundRegistry.register("color", {
  validate: background => (isHex(background.color) ? [] : ["INVALID_COLOR"]),
  render: background => ({ kind: "color", color: background.color }),
});

backgroundRegistry.register("gradient", {
  validate: background => (isGradient(background) ? [] : ["INVALID_GRADIENT"]),
  render: background => ({ kind: "gradient", from: background.from, to: background.to, angle: background.angle }),
});

const mediaBackground = kind => ({
  validate(background) {
    const errors = [];
    if (typeof background.assetId !== "string" || !ASSET_ID.test(background.assetId)) errors.push("INVALID_ASSET");
    if (!BACKGROUND_FITS.includes(background.fit)) errors.push("INVALID_FIT");
    if (!inRange(background.posX, 0, 100) || !inRange(background.posY, 0, 100)) errors.push("INVALID_POSITION");
    if (!inRange(background.opacity, 0, 1)) errors.push("INVALID_OPACITY");
    if (isSet(background.overlay) && !(isPlainObject(background.overlay) && isHex(background.overlay.color) && inRange(background.overlay.opacity, 0, 1))) errors.push("INVALID_OVERLAY");
    if ((isSet(background.flipX) && typeof background.flipX !== "boolean") || (isSet(background.flipY) && typeof background.flipY !== "boolean")) errors.push("INVALID_FLIP");
    return errors;
  },
  render(background) {
    const content = { kind, assetId: background.assetId, fit: background.fit, posX: background.posX, posY: background.posY, opacity: background.opacity };
    if (isSet(background.overlay)) content.overlay = { color: background.overlay.color, opacity: background.overlay.opacity };
    if (background.flipX === true) content.flipX = true;
    if (background.flipY === true) content.flipY = true;
    return content;
  },
});
backgroundRegistry.register("image", mediaBackground("image"));
backgroundRegistry.register("video", mediaBackground("video"));

export const defaultBackground = kind => ({
  color: { kind: "color", color: "#0d0b14" },
  gradient: { kind: "gradient", from: "#1a1030", to: "#07060b", angle: 180 },
  image: null,
  video: null,
})[kind];
export const createImageBackground = (assetId, overrides = {}) => ({ kind: "image", assetId, fit: "cover", posX: 50, posY: 50, opacity: 1, ...overrides });
// A video background covers its area by default (a cinematic fill that never distorts the video).
export const createVideoBackground = (assetId, overrides = {}) => ({ kind: "video", assetId, fit: "cover", posX: 50, posY: 50, opacity: 1, ...overrides });
