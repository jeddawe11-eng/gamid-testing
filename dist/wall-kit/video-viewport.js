// Published-Wall playback only. The owner canvas/Preview keep their existing eager pool.
export const WALL_VIDEO_VIEWPORT_MARGIN = 320;
export function createVideoViewport({ win, doc, play }) {
  const entries = new Map();
  let enabled = true, queued = false;
  const allowed = entry => enabled && entry.near && doc.visibilityState !== "hidden" && entry.video.isConnected !== false;
  const activate = entry => {
    if (!allowed(entry)) {
      entry.video.autoplay = false;
      entry.video.removeAttribute?.("autoplay");
      if (entry.loaded) entry.video.setAttribute("preload", "metadata");
      entry.video.pause?.(); return;
    }
    entry.video.setAttribute("preload", "auto");
    entry.video.setAttribute("autoplay", "");
    entry.video.autoplay = true;
    if (!entry.loaded) {
      entry.loaded = true;
      entry.video.setAttribute("src", entry.url);
    }
    if (entry.video.paused) { entry.onActivate?.(); play(entry.video); }
  };
  const observer = typeof win.IntersectionObserver === "function"
    ? new win.IntersectionObserver(items => {
      for (const item of items) {
        const entry = entries.get(item.target);
        if (entry) { entry.near = item.isIntersecting; activate(entry); }
      }
    }, { rootMargin: `${WALL_VIDEO_VIEWPORT_MARGIN}px 0px`, threshold: 0 }) : null;
  // Geometry fallback remains lazy; clamp oversized/cropped video bounds to its frame and stage.
  function geometry(entry) {
    if (!entry.video.isConnected) return false;
    const source = entry.video.getBoundingClientRect();
    const rect = { top: source.top, bottom: source.bottom, left: source.left, right: source.right };
    for (const selector of [".wall-art-frame", ".wall-stage"]) {
      const clip = entry.video.closest?.(selector)?.getBoundingClientRect();
      if (clip) { rect.top = Math.max(rect.top, clip.top); rect.bottom = Math.min(rect.bottom, clip.bottom); rect.left = Math.max(rect.left, clip.left); rect.right = Math.min(rect.right, clip.right); }
    }
    return rect.bottom > rect.top && rect.right > rect.left && rect.bottom > -WALL_VIDEO_VIEWPORT_MARGIN
      && rect.top < win.innerHeight + WALL_VIDEO_VIEWPORT_MARGIN && rect.right > 0 && rect.left < win.innerWidth;
  }
  const check = () => { queued = false; for (const entry of entries.values()) { entry.near = geometry(entry); activate(entry); } };
  const schedule = () => { if (!queued) { queued = true; if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(check); else queueMicrotask(check); } };
  if (!observer) { win.addEventListener?.("scroll", schedule, { passive: true, capture: true }); win.addEventListener?.("resize", schedule); }
  const visibility = () => { for (const entry of entries.values()) activate(entry); };
  doc.addEventListener?.("visibilitychange", visibility);
  return {
    observe(video, url, onActivate) {
      if (!entries.has(video)) {
        const entry = { video, url, onActivate, near: false, loaded: false };
        entries.set(video, entry);
        video.addEventListener?.("canplay", () => activate(entry));
        observer?.observe(video);
      }
      if (!observer) schedule();
    },
    resume() { enabled = true; if (!observer) schedule(); else visibility(); },
    suspend() { enabled = false; visibility(); },
    clear() { enabled = false; observer?.disconnect(); entries.clear(); doc.removeEventListener?.("visibilitychange", visibility); if (!observer) { win.removeEventListener?.("scroll", schedule, true); win.removeEventListener?.("resize", schedule); } },
  };
}
