// Intro video presentation policy. Pure, dependency-free, shared by the Intro preview / public Intro page and its tests.
//
// The Intro is shown edge-to-edge in a box whose shape depends on the device (portrait phone, landscape desktop, anything in between) and the uploaded
// source may be portrait, landscape or square. The video is NEVER stretched: it is only ever drawn with object-fit `cover` (fills the box, crops the overflow)
// or `contain` (whole picture visible, bars on the spare sides). Which one is chosen depends on how much of the picture cover would throw away:
//   visible = min(videoAspect / boxAspect, boxAspect / videoAspect)    (1 = same shape, ~0 = wildly different shape)
// Cover is only used when at least MIN_VISIBLE of the picture survives (a portrait clip on a tall phone, a 16:9 clip on a 16:9 window). Otherwise the whole picture
// is shown with bars (a landscape clip on a portrait phone, a portrait clip on a desktop window) instead of a huge, blurry, cropped zoom-in.
export const MIN_VISIBLE = 0.7;

export function visibleFraction(videoWidth, videoHeight, boxWidth, boxHeight) {
  const ok = [videoWidth, videoHeight, boxWidth, boxHeight].every(value => Number.isFinite(value) && value > 0);
  if (!ok) return 0;
  const video = videoWidth / videoHeight, box = boxWidth / boxHeight;
  return Math.min(video / box, box / video);
}

// "cover" | "contain". Unknown dimensions (metadata not loaded yet) resolve to the safe choice: contain never crops and never distorts.
export function resolveVideoFit(videoWidth, videoHeight, boxWidth, boxHeight, minVisible = MIN_VISIBLE) {
  return visibleFraction(videoWidth, videoHeight, boxWidth, boxHeight) >= minVisible ? "cover" : "contain";
}

// The rectangle the picture actually occupies inside the box for a given fit (used by tests and diagnostics; the browser does the real drawing).
export function drawnRect(fit, videoWidth, videoHeight, boxWidth, boxHeight) {
  const scale = fit === "cover" ? Math.max(boxWidth / videoWidth, boxHeight / videoHeight) : Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale, height = videoHeight * scale;
  return { width, height, x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, scaleX: scale, scaleY: scale };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// LANDSCAPE (and square) sources: a deliberate presentation instead of filling the monitor.
//
// The processed Intro is a low-bitrate derivative (VP9 CRF 40, source resolution, ~1.1 Mbps for a 1080p clip), so enlarging it to cover a large or
// high-DPI desktop viewport makes compression softness obvious. For wide sources the real video therefore stays the sharp, centered, aspect-correct
// FOREGROUND, drawn with contain (never cropped) and never enlarged beyond MAX_UPSCALE device pixels per source pixel; everything left over is filled by a
// dark ambient glow derived from the SAME video (see intro-preview.js): a tiny canvas copy of the current frame, scaled up with the browser's own smoothing.
// Portrait sources keep the existing cover/contain policy above, untouched.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export const MAX_UPSCALE = 1.5;        // device pixels drawn per source pixel, at most (a 1080p clip may cover up to 2880 device px of width)
export const AMBIENT_WIDTH = 32;       // the ambient canvas is 32 px wide (height follows the source shape): ~1.4 K pixels copied per drawn frame
export const AMBIENT_OVERSCAN = 1.08;  // the ambient layer is scaled slightly past the stage so its soft edges never show

export const isWideSource = (videoWidth, videoHeight) => Number.isFinite(videoWidth) && Number.isFinite(videoHeight) && videoWidth > 0 && videoHeight > 0 && videoWidth >= videoHeight;

// Foreground box in CSS pixels: the largest aspect-correct size that fits the stage, but never more than MAX_UPSCALE device px per source px.
export function wideForeground(videoWidth, videoHeight, boxWidth, boxHeight, devicePixelRatio = 1, maxUpscale = MAX_UPSCALE) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const fit = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const cap = maxUpscale / dpr;
  const scale = Math.min(fit, cap);
  return { width: videoWidth * scale, height: videoHeight * scale, scale, capped: cap < fit, deviceUpscale: scale * dpr };
}

export function ambientCanvasSize(videoWidth, videoHeight, width = AMBIENT_WIDTH) {
  return { width, height: Math.max(4, Math.round((width * videoHeight) / videoWidth)) };
}

// Uniform scale that makes the (aspect-correct) ambient canvas cover the whole stage.
export function ambientCoverScale(canvasWidth, canvasHeight, boxWidth, boxHeight, overscan = AMBIENT_OVERSCAN) {
  return Math.max(boxWidth / canvasWidth, boxHeight / canvasHeight) * overscan;
}

// The whole decision in one place. orientation "wide" (landscape or square): contain foreground + ambient. "portrait": the original policy.
export function resolvePresentation(videoWidth, videoHeight, boxWidth, boxHeight, devicePixelRatio = 1) {
  const valid = [videoWidth, videoHeight, boxWidth, boxHeight].every(value => Number.isFinite(value) && value > 0);
  if (!valid) return { orientation: "unknown", fit: "contain", foreground: null, ambient: false };
  if (isWideSource(videoWidth, videoHeight)) {
    return { orientation: "wide", fit: "contain", foreground: wideForeground(videoWidth, videoHeight, boxWidth, boxHeight, devicePixelRatio), ambient: true };
  }
  return { orientation: "portrait", fit: resolveVideoFit(videoWidth, videoHeight, boxWidth, boxHeight), foreground: null, ambient: false };
}