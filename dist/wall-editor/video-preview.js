// Wall editor: ONE representative STILL frame per video asset for the Assets and background-video lists, so an owner can recognise a video before adding it.
// A list never holds a playing (or even a paused) <video>: each video is opened once per page, off-screen, only when its card scrolls into view (at most two at a
// time), seeked to a few sample points, and the best frame is kept as a small canvas; the probe is then released. Nothing autoplays, nothing keeps decoding,
// nothing is uploaded or stored - the original video stays the asset and the preview costs no storage, quota or lifecycle.
//
// Frame choice (deterministic, no computer vision): sample points at 50 %, 25 %, 75 %, 10 % and 90 % of the duration (never the very first or last frame).
// Each sampled frame is composited over the preview box's own background and scored by how much it differs from an empty box: the spread of its
// brightness, scaled down when little of it is visible. The first frame that is clearly good wins at once; otherwise the best-scoring one. If no sample
// scores above the minimum (every sample transparent, blank or uniform), the deterministic fallback is a "Video" placeholder - never an empty box.
// If the browser cannot read the pixels back (a cross-origin address without CORS), the first sample frame is shown unscored.

export const PREVIEW_FRACTIONS = Object.freeze([0.5, 0.25, 0.75, 0.1, 0.9]);
export const PREVIEW_MAX_SIDE = 320;
export const PREVIEW_BACKGROUND = Object.freeze([13, 11, 20]);   // .ed-asset .thumb { background: #0d0b14 }
const VISIBLE_ALPHA = 32;          // a pixel counts as visible from this alpha up
const FULL_COVERAGE = 0.15;        // a frame showing at least 15 % visible pixels is not penalised for coverage
export const MIN_SCORE = 6;        // below this a frame is indistinguishable from an empty or uniform box
const GOOD_SPREAD = 12;            // a frame with full coverage and this much spread is clearly recognisable: stop sampling

// sample points in seconds for a video of `duration` seconds (unknown length: the first seconds - a seek past the end is clamped by the browser)
export function candidateTimes(duration) {
  if (!(duration > 0) || !Number.isFinite(duration)) return [0.5, 1, 2];
  const edge = Math.min(0.1, duration / 10);
  const out = [];
  for (const fraction of PREVIEW_FRACTIONS) {
    const time = Math.round(Math.min(duration - edge, Math.max(edge, duration * fraction)) * 1000) / 1000;
    if (!out.includes(time)) out.push(time);
  }
  return out;
}

// RGBA pixels (unpremultiplied, as getImageData returns them) -> { visible: share of visible pixels, spread: brightness standard deviation of the frame
// composited over the preview background }. A transparent frame and a uniform frame both have spread 0.
export function frameStats(data, background = PREVIEW_BACKGROUND) {
  const pixels = Math.floor(data.length / 4);
  if (!pixels) return { visible: 0, spread: 0 };
  let visible = 0, sum = 0, sumSq = 0;
  const [br, bg, bb] = background;
  for (let i = 0; i < pixels * 4; i += 4) {
    const alpha = data[i + 3] / 255;
    if (data[i + 3] >= VISIBLE_ALPHA) visible += 1;
    const r = data[i] * alpha + br * (1 - alpha), g = data[i + 1] * alpha + bg * (1 - alpha), b = data[i + 2] * alpha + bb * (1 - alpha);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luma; sumSq += luma * luma;
  }
  const mean = sum / pixels;
  return { visible: visible / pixels, spread: Math.sqrt(Math.max(0, sumSq / pixels - mean * mean)) };
}
export const frameScore = stats => stats.spread * Math.min(1, stats.visible / FULL_COVERAGE);
export const isClearlyGood = stats => stats.visible >= FULL_COVERAGE && stats.spread >= GOOD_SPREAD;

// samples [{ time, stats }] in sampling order -> the chosen { time, score } or null (fallback). The first clearly good sample wins; else the best score
// (ties: the earlier sample); nothing at or above MIN_SCORE -> null.
export function pickFrame(samples) {
  let best = null;
  for (const sample of samples) {
    const score = frameScore(sample.stats);
    if (isClearlyGood(sample.stats)) return { time: sample.time, score };
    if (!best || score > best.score) best = { time: sample.time, score };
  }
  return best && best.score >= MIN_SCORE ? best : null;
}

const waitFor = (target, event, timeoutMs) => new Promise((resolve, reject) => {
  const cleanup = () => { clearTimeout(timer); target.removeEventListener?.(event, onEvent); target.removeEventListener?.("error", onError); };
  const onEvent = () => { cleanup(); resolve(); };
  const onError = () => { cleanup(); reject(new Error("VIDEO_ERROR")); };
  const timer = setTimeout(() => { cleanup(); reject(new Error("VIDEO_TIMEOUT")); }, timeoutMs);
  target.addEventListener(event, onEvent);
  target.addEventListener("error", onError);
});

// One probe: opens the video off-screen (muted, never played), samples frames, returns { canvas, checked, time } or null. Always releases the video.
export async function captureRepresentativeFrame(url, { createVideo, createCanvas, stepTimeoutMs = 4000 }) {
  const video = createVideo();
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";   // the signed storage address answers with CORS, so the frame can be read back to score it
    const loaded = waitFor(video, "loadedmetadata", stepTimeoutMs);
    video.src = url;
    await loaded;
    const width = video.videoWidth, height = video.videoHeight;
    if (!(width > 0 && height > 0)) return null;
    const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const work = createCanvas(), keep = createCanvas();
    work.width = keep.width = w; work.height = keep.height = h;
    const ctx = work.getContext("2d", { willReadFrequently: true }), keepCtx = keep.getContext("2d");
    const samples = [];
    for (const time of candidateTimes(video.duration)) {
      try { const seeked = waitFor(video, "seeked", stepTimeoutMs); video.currentTime = time; await seeked; } catch { continue; }
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(video, 0, 0, w, h);
      let stats;
      try { stats = frameStats(ctx.getImageData(0, 0, w, h).data); }
      catch { keepCtx.clearRect(0, 0, w, h); keepCtx.drawImage(work, 0, 0); return { canvas: keep, checked: false, time }; }   // pixels unreadable: shown unscored
      samples.push({ time, stats });
      const chosen = pickFrame(samples);
      if (chosen?.time === time) { keepCtx.clearRect(0, 0, w, h); keepCtx.drawImage(work, 0, 0); }   // keep the best frame so far
      if (isClearlyGood(stats)) break;
    }
    const chosen = pickFrame(samples);
    return chosen ? { canvas: keep, checked: true, time: chosen.time } : null;
  } catch {
    return null;
  } finally {
    try { video.removeAttribute?.("src"); video.load?.(); } catch { /* already released */ }
  }
}

// The list-side controller. mount(thumb, { id, url }) fills a .thumb box: data-preview = "loading" (…) | "ready" (the still frame) | "fallback" ("Video").
// Results are cached per asset for the page; a box that is waiting is filled in place when its frame is ready (no list repaint needed).
export function createVideoPreviews({
  createVideo = () => document.createElement("video"),
  createCanvas = () => document.createElement("canvas"),
  createElement = tag => document.createElement(tag),
  observe = defaultObserve,
  capture = captureRepresentativeFrame,
  maxConcurrent = 2,
  stepTimeoutMs = 4000,
} = {}) {
  const entries = new Map();   // asset id -> { state: idle | loading | ready | fallback, result, url, boxes: Set }
  const queue = [];
  let running = 0;
  const pump = () => {
    while (running < maxConcurrent && queue.length) {
      const entry = queue.shift();
      running += 1;
      Promise.resolve()
        .then(() => capture(entry.url, { createVideo, createCanvas, stepTimeoutMs }))
        .catch(() => null)
        .then(result => {
          entry.result = result; entry.state = result ? "ready" : "fallback";
          for (const box of entry.boxes) { try { if (box.isConnected !== false) paint(box, entry); } catch { /* a box that cannot be painted keeps its placeholder */ } }
          entry.boxes.clear();
        })
        .finally(() => { running -= 1; pump(); });
    }
  };
  const start = entry => { if (entry.state !== "idle") return; entry.state = "loading"; queue.push(entry); pump(); };

  function paint(box, entry) {
    box.dataset.preview = entry.state === "ready" ? "ready" : entry.state === "fallback" ? "fallback" : "loading";
    box.replaceChildren();
    if (entry.state === "ready") {
      const frame = createCanvas();
      frame.width = entry.result.canvas.width; frame.height = entry.result.canvas.height;
      frame.getContext("2d").drawImage(entry.result.canvas, 0, 0);
      frame.className = "thumb-frame";
      frame.setAttribute("aria-hidden", "true");
      box.append(frame);
    } else if (entry.state === "fallback") {
      const note = createElement("span");
      note.className = "thumb-fallback";
      note.textContent = "▶ Video";
      box.append(note);
    } else box.textContent = "…";
  }

  return {
    mount(box, { id, url }) {
      let entry = entries.get(id);
      if (!entry) { entry = { state: "idle", result: null, url: null, boxes: new Set() }; entries.set(id, entry); }
      if (url && entry.state === "idle") entry.url = url;
      paint(box, entry);
      if (entry.state === "ready" || entry.state === "fallback") return;
      entry.boxes.add(box);
      if (!entry.url) return;   // the signed address is on its way; the list mounts the box again once it has it
      if (entry.state === "idle") observe(box, () => start(entry));
    },
    forget(id) { entries.delete(id); },
    retain(ids) { for (const id of [...entries.keys()]) if (!ids.has(id)) entries.delete(id); },
    stateOf: id => entries.get(id)?.state ?? null,
  };
}

// start when the box first scrolls into view (a closed panel never loads anything); without IntersectionObserver, at once
function defaultObserve(box, onVisible) {
  if (typeof IntersectionObserver !== "function") { onVisible(); return; }
  const observer = new IntersectionObserver(items => { if (items.some(item => item.isIntersecting)) { observer.disconnect(); onVisible(); } }, { rootMargin: "120px" });
  observer.observe(box);
}
