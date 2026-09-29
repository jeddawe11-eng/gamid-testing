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

// ---- background VIDEOS (MP4, background only) -------------------------------------------------------------------------------------------------------------
// The browser's early checks; the wall-video bucket (type + 50 MiB), the wall-asset-register Edge Function (the stored file must be a real MP4 with an H.264 video
// track of at most 4096 px a side) and the database (type, size, at most 10 videos) all enforce them again.
export const VIDEO_LIMITS = Object.freeze({ types: Object.freeze(["video/mp4"]), maxBytes: 50 * 1024 * 1024, maxDimension: 4096, maxVideos: 10 });
export const isVideoAsset = asset => asset?.mime_type === "video/mp4";
export function checkVideoFile({ type, size }) {
  if (!VIDEO_LIMITS.types.includes(type)) return { ok: false, code: "INVALID_VIDEO_TYPE", message: "Choose an MP4 video." };
  if (!Number.isFinite(size) || size < 1) return { ok: false, code: "EMPTY_FILE", message: "That file is empty." };
  if (size > VIDEO_LIMITS.maxBytes) return { ok: false, code: "VIDEO_TOO_LARGE", message: "Background videos must be 50 MB or smaller." };
  return { ok: true };
}
export function checkVideoMetadata({ width, height, duration } = {}) {
  const side = value => Number.isInteger(value) && value >= 1 && value <= VIDEO_LIMITS.maxDimension;
  if (!side(width) || !side(height)) return { ok: false, code: "INVALID_WALL_ASSET_SIZE", message: `Background videos can be at most ${VIDEO_LIMITS.maxDimension} pixels on a side.` };
  if (!(duration > 0)) return { ok: false, code: "INVALID_VIDEO", message: "That video could not be read. Try another MP4." };
  return { ok: true };
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
  INVALID_VIDEO_TYPE: "Choose an MP4 video.",
  VIDEO_TOO_LARGE: "Background videos must be 50 MB or smaller.",
  UNSUPPORTED_VIDEO_TYPE: "That file is not an MP4 video, so it was not added.",
  INVALID_VIDEO: "That video could not be read (damaged, incomplete or without a picture track). Try another MP4.",
  VIDEO_CODEC_UNSUPPORTED: "That MP4 is not H.264, which every browser can play. Export it as H.264 (MP4) and try again.",
  WALL_VIDEO_LIMIT: "You can keep up to 10 background videos. Delete one you no longer use first.",
  WALL_VIDEO_UPLOAD_FAILED: "The video upload did not finish. Check your connection and try again.",
  GIF_TOO_COMPLEX: "That GIF is too heavy to animate smoothly on phones (at most 500 frames, and fewer for large GIFs). Try a shorter or smaller GIF.",
  INVALID_WALL_ASSET_PATH: "The upload could not be checked. Try again.",
  IDENTITY_NOT_FOUND: "Create your GamID first, then come back to add images.",
  unauthenticated: "Your session ended. Sign in again from your account, then come back.",
  register_failed: "That image could not be added. Try again.",
};
export const describeAssetError = error => ASSET_ERROR_MESSAGES[error?.code] ?? ASSET_ERROR_MESSAGES[error?.message] ?? "That image could not be added. Try again.";
