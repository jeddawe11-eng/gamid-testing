// Wall asset rules (the pure part): what a picture may be before it is uploaded, and how the editor picks starting sizes. These are only the browser's early checks: the
// storage bucket enforces type + size, and the wall-asset-register Edge Function reads the STORED bytes, recognises the real format, reads the real pixel size, counts a
// GIF's frames (decode-cost limits) and deletes anything invalid before the database - which checks everything again - registers it. A hand-made request cannot bypass
// that. SVG is deliberately not allowed (it can carry script); only raster images are. A GIF stays animated wherever it is drawn (an ordinary picture, never video).
export const ASSET_LIMITS = Object.freeze({
  types: Object.freeze(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]),
  maxBytes: 5 * 1024 * 1024,
  maxDimension: 8192,
  maxAssets: 60,
  gifMaxFrames: 500,
  gifMaxFramePixels: 50_000_000,
});
export const ASSET_TYPE_LABEL = "JPG, PNG, WebP, AVIF or GIF";

// -> { ok: true } | { ok: false, code, message }
export function checkAssetFile({ type, size }) {
  if (!ASSET_LIMITS.types.includes(type)) return { ok: false, code: "INVALID_FILE_TYPE", message: `Choose a ${ASSET_TYPE_LABEL} image.` };
  if (!Number.isFinite(size) || size < 1) return { ok: false, code: "EMPTY_FILE", message: "That file is empty." };
  if (size > ASSET_LIMITS.maxBytes) return { ok: false, code: "FILE_TOO_LARGE", message: "Images must be 5 MB or smaller." };
  return { ok: true };
}

export function checkAssetDimensions({ width, height }) {
  const valid = value => Number.isInteger(value) && value >= 1 && value <= ASSET_LIMITS.maxDimension;
  if (!valid(width) || !valid(height)) return { ok: false, code: "INVALID_DIMENSIONS", message: `Images can be at most ${ASSET_LIMITS.maxDimension} pixels on a side.` };
  return { ok: true };
}

export function checkAssetCount(count) {
  return count >= ASSET_LIMITS.maxAssets ? { ok: false, code: "WALL_ASSET_LIMIT", message: `You can keep up to ${ASSET_LIMITS.maxAssets} images. Delete one you no longer use first.` } : { ok: true };
}

// A starting element size (canonical units) for a picture of the given pixel size: as large as 640 wide / 900 tall while keeping its proportions.
export function startingImageSize(width, height) {
  const ratio = width / height;
  const maxW = 640, maxH = 900;
  const w = Math.min(maxW, maxH * ratio);
  return { width: Math.max(10, Math.round(w)), height: Math.max(10, Math.round(w / ratio)) };
}

export const ASSET_ERROR_MESSAGES = {
  INVALID_FILE_TYPE: `Choose a ${ASSET_TYPE_LABEL} image.`,
  FILE_TOO_LARGE: "Images must be 5 MB or smaller.",
  INVALID_DIMENSIONS: `Images can be at most ${ASSET_LIMITS.maxDimension} pixels on a side.`,
  WALL_ASSET_LIMIT: `You can keep up to ${ASSET_LIMITS.maxAssets} images. Delete one you no longer use first.`,
  WALL_ASSET_IN_USE: "That image is still used on your Wall. Remove it from the Wall first.",
  WALL_ASSET_NOT_FOUND: "That image could not be found.",
  WALL_ASSET_UPLOAD_NOT_FOUND: "The upload did not finish. Try again.",
  INVALID_WALL_ASSET_SIZE: `Images can be at most ${ASSET_LIMITS.maxDimension} pixels on a side.`,
  WALL_ASSET_TOO_LARGE: "Images must be 5 MB or smaller.",
  INVALID_WALL_ASSET_TYPE: `Choose a ${ASSET_TYPE_LABEL} image.`,
  // answers from the server-side check of the stored file
  UNSUPPORTED_IMAGE_TYPE: `That file is not a ${ASSET_TYPE_LABEL} image, so it was not added.`,
  INVALID_IMAGE: "That image file is damaged or incomplete, so it was not added.",
  WALL_ASSET_TYPE_MISMATCH: "That file's contents do not match its type, so it was not added.",
  GIF_TOO_COMPLEX: "That GIF is too heavy to animate smoothly on phones (at most 500 frames, and fewer for large GIFs). Try a shorter or smaller GIF.",
  INVALID_WALL_ASSET_PATH: "The upload could not be checked. Try again.",
  IDENTITY_NOT_FOUND: "Create your GamID first, then come back to add images.",
  unauthenticated: "Your session ended. Sign in again from your account, then come back.",
  register_failed: "That image could not be added. Try again.",
};
export const describeAssetError = error => ASSET_ERROR_MESSAGES[error?.code] ?? ASSET_ERROR_MESSAGES[error?.message] ?? "That image could not be added. Try again.";
