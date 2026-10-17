// Mobile Intro landscape hint: a brief phone-rotation cue for landscape Intro videos on portrait touch screens.
// It never plays, pauses, seeks or reloads the video: fullscreen wraps the existing Intro layer (same <video>, same ambient canvas).
export const HINT_MS = 3000;
export const HINT_FADE_MS = 400;
export const LANDSCAPE_RATIO = 1.2;   // 4:3 and wider count as landscape; square and portrait clips never get the hint

// Shown only when every input is known: a touch-first (coarse pointer) screen held in portrait and a clearly landscape video.
export function landscapeHintEligible({ videoWidth, videoHeight, viewportWidth, viewportHeight, coarse }) {
  if (!coarse || !(videoWidth > 0) || !(videoHeight > 0) || !(viewportWidth > 0) || !(viewportHeight > 0)) return false;
  return videoWidth / videoHeight >= LANDSCAPE_RATIO && viewportHeight > viewportWidth;
}

export function createLandscapeHint({ doc = document, win = window, target, hint, exit }) {
  const fullscreen = {
    element: () => doc.fullscreenElement || doc.webkitFullscreenElement || null,
    enabled: () => Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled) && Boolean(target.requestFullscreen || target.webkitRequestFullscreen),
    request: () => target.requestFullscreen ? target.requestFullscreen({ navigationUI: "hide" }) : Promise.resolve(target.webkitRequestFullscreen()),
    exit: () => doc.exitFullscreen ? doc.exitFullscreen() : Promise.resolve(doc.webkitExitFullscreen?.()),
  };
  let shownFor = null, showTimer = 0, leaveTimer = 0, locked = false;
  const active = () => fullscreen.element() === target;
  function hide() {
    win.clearTimeout(showTimer); win.clearTimeout(leaveTimer); showTimer = leaveTimer = 0;
    hint.classList.remove("is-showing", "is-leaving"); hint.hidden = true;
  }
  // One hint per presentation (key = the player's playback token): replays and resizes never repeat it.
  function show(key) {
    if (shownFor === key || active()) return false;
    shownFor = key; hide();
    const canFullscreen = fullscreen.enabled();
    hint.dataset.mode = canFullscreen ? "fullscreen" : "rotate";
    hint.setAttribute("aria-label", canFullscreen ? "Watch in landscape fullscreen" : "Rotate your phone to watch in landscape");
    hint.hidden = false; void hint.offsetWidth; hint.classList.add("is-showing");
    leaveTimer = win.setTimeout(() => hint.classList.add("is-leaving"), HINT_MS - HINT_FADE_MS);
    showTimer = win.setTimeout(hide, HINT_MS);
    return true;
  }
  function unlock() { if (!locked) return; locked = false; try { win.screen?.orientation?.unlock?.(); } catch { /* nothing was locked */ } }
  function sync() { const on = active(); exit.hidden = !on; if (!on) unlock(); }
  // Fullscreen first (user gesture), then a landscape lock where the browser allows it; a refused lock still leaves fullscreen and manual rotation.
  async function enter() {
    hide();
    if (!fullscreen.enabled() || fullscreen.element()) return false;
    try { await fullscreen.request(); } catch { sync(); return false; }
    try { await win.screen?.orientation?.lock?.("landscape"); locked = Boolean(win.screen?.orientation?.lock); } catch { locked = false; }
    sync(); return true;
  }
  async function leave() {
    unlock();
    if (active()) { try { await fullscreen.exit(); } catch { /* already leaving */ } }
    sync();
  }
  doc.addEventListener("fullscreenchange", sync); doc.addEventListener("webkitfullscreenchange", sync);
  hint.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); if (hint.dataset.mode === "fullscreen") enter(); else hide(); });
  exit.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); leave(); });
  return { show, hide, leave, enter, reset() { hide(); shownFor = null; }, get active() { return active(); } };
}
