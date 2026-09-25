// The Wall `image` element type. The payload never holds image bytes, a URL or a path: only an opaque `assetId` naming one of the OWNER's uploaded Wall assets
// (see assets.js; the database also refuses to save a Wall that names an asset the owner does not have). How the picture is shown is data:
//   assetId (uuid), fit (cover | contain | fill), posX / posY (0..100, where the picture sits inside its box - the crop position for cover), opacity (0..1)
//   optional: radius (0..1000), alt (<= 120 characters, plain text), aw / ah (the source picture's pixel size, 1..20000, used only to keep its proportions)
import { elementRegistry } from "../wall/elements.js";
import { isSet, inRange, isPlainObject } from "../wall/fields.js";

export const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const IMAGE_FITS = Object.freeze(["cover", "contain", "fill"]);
export const ALT_MAX = 120;

const codePoints = value => Array.from(value).length;
const pixels = value => Number.isInteger(value) && value >= 1 && value <= 20000;

export function validateImagePayload(payload) {
  if (!isPlainObject(payload)) return ["PAYLOAD_NOT_OBJECT"];
  const errors = [];
  if (typeof payload.assetId !== "string" || !ASSET_ID.test(payload.assetId)) errors.push("INVALID_ASSET");
  if (!IMAGE_FITS.includes(payload.fit)) errors.push("INVALID_FIT");
  if (!inRange(payload.posX, 0, 100) || !inRange(payload.posY, 0, 100)) errors.push("INVALID_POSITION");
  if (!inRange(payload.opacity, 0, 1)) errors.push("INVALID_OPACITY");
  if (isSet(payload.radius) && !inRange(payload.radius, 0, 1000)) errors.push("INVALID_RADIUS");
  if (isSet(payload.alt) && (typeof payload.alt !== "string" || codePoints(payload.alt) > ALT_MAX)) errors.push("INVALID_ALT");
  if ((isSet(payload.aw) && !pixels(payload.aw)) || (isSet(payload.ah) && !pixels(payload.ah))) errors.push("INVALID_SOURCE_SIZE");
  return errors;
}

export function renderImagePayload(payload) {
  const content = { kind: "image", assetId: payload.assetId, fit: payload.fit, posX: payload.posX, posY: payload.posY, opacity: payload.opacity };
  for (const key of ["radius", "alt", "aw", "ah"]) if (isSet(payload[key])) content[key] = payload[key];
  return content;
}

export const createImagePayload = (assetId, overrides = {}) => ({ assetId, fit: "cover", posX: 50, posY: 50, opacity: 1, ...overrides });

elementRegistry.register("image", {
  validatePayload: validateImagePayload,
  render: renderImagePayload,
  scale: (payload, factor) => (typeof payload.radius === "number" ? { ...payload, radius: Math.min(1000, Math.round(payload.radius * factor)) } : { ...payload }),
});
