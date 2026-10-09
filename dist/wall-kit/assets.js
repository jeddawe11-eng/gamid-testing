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
  return count >= ASSET_LIMITS.maxAssets ? { ok: false, code: "WALL_ASSET_LIMIT", message: ASSET_ERROR_MESSAGES.WALL_ASSET_LIMIT } : { ok: true };
}

// ---- VIDEOS (MP4 and WebM: video layers from Assets, and backgrounds) --------------------------------------------------------------------------------------
// The browser's early checks; the wall-video bucket (type + 50 MiB), the wall-asset-register Edge Function (the stored file must be a real MP4 with an H.264 video
// track, or a real WebM with a VP8 / VP9 video track - alpha transparency allowed - of at most 4096 px a side) and the database (type, size, the Wall video limit) all
// enforce them again. The number of videos is decided by the database alone (private.wall_video_limit(); the figure is shown by Usage), never here.
export const VIDEO_LIMITS = Object.freeze({ types: Object.freeze(["video/mp4", "video/webm"]), maxBytes: 50 * 1024 * 1024, maxDimension: 4096 });
export const VIDEO_TYPE_LABEL = "MP4 or WebM";
export const isVideoAsset = asset => VIDEO_LIMITS.types.includes(asset?.mime_type);
export const isVideoFileType = type => VIDEO_LIMITS.types.includes(type);
export function checkVideoFile({ type, size }) {
  if (!VIDEO_LIMITS.types.includes(type)) return { ok: false, code: "INVALID_VIDEO_TYPE", message: `Choose an ${VIDEO_TYPE_LABEL} video.` };
  if (!Number.isFinite(size) || size < 1) return { ok: false, code: "EMPTY_FILE", message: "That file is empty." };
  if (size > VIDEO_LIMITS.maxBytes) return { ok: false, code: "VIDEO_TOO_LARGE", message: "Videos must be 50 MB or smaller." };
  return { ok: true };
}
export function checkVideoMetadata({ width, height, duration } = {}) {
  const side = value => Number.isInteger(value) && value >= 1 && value <= VIDEO_LIMITS.maxDimension;
  if (!side(width) || !side(height)) return { ok: false, code: "INVALID_WALL_ASSET_SIZE", message: `Videos can be at most ${VIDEO_LIMITS.maxDimension} pixels on a side.` };
  if (!(duration > 0)) return { ok: false, code: "INVALID_VIDEO", message: `That video could not be read. Try another ${VIDEO_TYPE_LABEL}.` };
  return { ok: true };
}

// Why a server-side conversion (HEVC -> H.264) did not finish, in words. Nothing is attached to the Wall when it fails.
export function describeVideoJobFailure(code) {
  if (code === "SOURCE_HDR_UNSUPPORTED") return "That video is HDR, which cannot be converted for every browser yet. Try an SDR version.";
  if (code === "SOURCE_TOO_LONG") return "That video is too long to convert (up to about 2 minutes of 4K). Try a shorter clip.";
  if (code === "WALL_VIDEO_LIMIT" || code === "WALL_ASSET_LIMIT") return "You have reached the video limit. Delete a video you no longer use, then try again.";
  return "That video could not be converted. Nothing on your Wall changed - try again, or choose another MP4.";
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
  WALL_ASSET_LIMIT: "You have reached your Wall asset limit (images and videos together). Delete one you no longer use, then add this one.",
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
  INVALID_VIDEO_TYPE: "Choose an MP4 or WebM video.",
  VIDEO_TOO_LARGE: "Videos must be 50 MB or smaller.",
  UNSUPPORTED_VIDEO_TYPE: "That file is not an MP4 or WebM video, so it was not added.",
  INVALID_VIDEO: "That video could not be read (damaged, incomplete or without a picture track). Try another MP4 or WebM.",
  VIDEO_CODEC_UNSUPPORTED: "That MP4 is not H.264, which every browser can play. Export it as H.264 (MP4) and try again.",
  WEBM_CODEC_UNSUPPORTED: "That WebM is not VP8 or VP9. Export it as VP9 WebM (keep the alpha channel for transparency) and try again.",
  VIDEO_TOO_LONG_TO_CONVERT: "That video is too long to convert (up to about 2 minutes of 4K). Try a shorter clip.",
  WALL_VIDEO_LIMIT: "You have reached your Wall video limit. Delete a video you no longer use, then add this one.",
  WALL_VIDEO_UPLOAD_FAILED: "The video upload did not finish. Check your connection and try again.",
  GIF_TOO_COMPLEX: "That GIF is too heavy to animate smoothly on phones (at most 500 frames, and fewer for large GIFs). Try a shorter or smaller GIF.",
  INVALID_WALL_ASSET_PATH: "The upload could not be checked. Try again.",
  IDENTITY_NOT_FOUND: "Create your GamID first, then come back to add images.",
  unauthenticated: "Your session ended. Sign in again from your account, then come back.",
  // answers from the upload gateway (supabase/functions/_shared/usage-upload.js) and the network
  ACCOUNT_STORAGE_QUOTA_EXCEEDED: "This upload would exceed your account storage. Delete media you no longer use, then add it again.",
  UPLOAD_EXPIRED: "The upload took too long and expired. Try again.",
  UPLOAD_CONFLICT: "Another upload of this file was already in progress. Try again.",
  UPLOAD_GATEWAY_FAILED: "The upload service is not responding right now. Try again in a moment.",
  CHUNK_TOO_LARGE: "That file could not be sent in one piece. Choose a smaller file.",
  NETWORK_ERROR: "The upload could not reach GamID. Check your connection and try again.",
};
// register_failed and unknown codes fall back to a message for the kind of file that failed (a video is never called an image).
const FALLBACK = { image: "That image could not be added. Try again.", video: "That video could not be added. Try again." };
export const describeAssetError = (error, { video = false } = {}) => ASSET_ERROR_MESSAGES[error?.code] ?? ASSET_ERROR_MESSAGES[error?.message] ?? FALLBACK[video ? "video" : "image"];
