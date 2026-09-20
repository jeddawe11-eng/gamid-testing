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
