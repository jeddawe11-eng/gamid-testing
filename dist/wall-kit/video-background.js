// Background VIDEO playback (Wall backgrounds only - never an element, never a player). A background video is visual media: it always plays MUTED, LOOPING and INLINE,
// has no controls, is hidden from assistive tech and never takes a tap. The address comes only from the asset resolver (a blob: or https: URL for the owner's own
// asset) - a document string can never become a video address.
//
// The editor repaints its canvas on every change. A video element that was recreated each time would restart and re-download; the POOL hands the same element back to
// every repaint instead (a media element moved to its new parent within the same task keeps playing), so editing never restarts the background.
// A Whole-Wall video is painted once per stage (each stage shows its own part of the Wall-wide layer, like an image background). Those elements share one family and
// follow the first one's clock, so the stages of one Wall show one continuous timeline.
export const safeMediaUrl = url => (typeof url === "string" && /^(blob:|https:\/\/)/.test(url) ? url : null);

export function configureBackgroundVideo(video) {
  for (const name of ["muted", "autoplay", "loop", "playsinline", "disablepictureinpicture", "disableremoteplayback"]) video.setAttribute(name, "");
  video.setAttribute("preload", "auto");
  video.setAttribute("aria-hidden", "true");
  video.setAttribute("tabindex", "-1");
  video.removeAttribute?.("controls");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.loop = true;
  video.autoplay = true;
  video.controls = false;
  return video;
}

const play = video => { try { const started = video.play?.(); if (started && typeof started.catch === "function") started.catch(() => {}); } catch { /* autoplay refused: the first frame still shows */ } };

// -> { take(family, url, createNode) -> <video>, size }. One pool per surface that repaints (the editor canvas; Preview).
// A background video that could not start (the browser pauses silent video in a hidden tab to save power, or play() came before any data) starts as soon as it can:
// when it has data, and again whenever the page becomes visible.
const resumeIfPaused = video => { if (video.paused && video.isConnected !== false) play(video); };

export function createVideoPool() {
  const families = new Map();   // family -> [{ video, url }]
  let claimed = new Set();
  let resetQueued = false;
  const release = () => { claimed = new Set(); resetQueued = false; };
  const resumeAll = () => { for (const list of families.values()) for (const { video } of list) resumeIfPaused(video); };
  const onVisible = () => { if (document.visibilityState !== "hidden") resumeAll(); };
  if (typeof document !== "undefined") document.addEventListener?.("visibilitychange", onVisible);
  return {
    take(family, url, createNode) {
      if (!resetQueued) { resetQueued = true; (typeof queueMicrotask === "function" ? queueMicrotask : fn => Promise.resolve().then(fn))(release); }
      const list = families.get(family) ?? [];
      families.set(family, list);
      let entry = list.find(candidate => !claimed.has(candidate) && candidate.url === url);
      if (!entry) {
        const video = configureBackgroundVideo(createNode("video"));
        const leader = list.find(candidate => candidate.url === url);
        video.setAttribute("src", url);
        video.addEventListener?.("canplay", () => resumeIfPaused(video));
        // a stage joining a Wall-wide video starts at the family's current time, so all stages show one timeline
        if (leader) video.addEventListener?.("loadedmetadata", () => { try { if (!leader.video.paused) video.currentTime = leader.video.currentTime; } catch { /* not seekable yet */ } }, { once: true });
        entry = { video, url };
        list.push(entry);
      }
      claimed.add(entry);
      queueMicrotaskPlay(entry.video);
      return entry.video;
    },
    get size() { let n = 0; for (const list of families.values()) n += list.length; return n; },
    clear() { for (const list of families.values()) for (const { video } of list) { try { video.pause?.(); video.removeAttribute?.("src"); video.load?.(); } catch { /* gone */ } } families.clear(); release(); if (typeof document !== "undefined") document.removeEventListener?.("visibilitychange", onVisible); },
    resume: resumeAll,
  };
}
// play once the element is attached (after this paint pass)
const queueMicrotaskPlay = video => (typeof queueMicrotask === "function" ? queueMicrotask : fn => Promise.resolve().then(fn))(() => play(video));

// A single background video for a surface without a pool (e.g. a one-off render).
export function backgroundVideo(url, createNode) {
  const video = configureBackgroundVideo(createNode("video"));
  video.setAttribute("src", url);
  video.addEventListener?.("canplay", () => resumeIfPaused(video));
  queueMicrotaskPlay(video);
  return video;
}
