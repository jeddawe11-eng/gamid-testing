// Intro Thumbnail for Discord (Mazen's task 2026-10-26): the owner scrubs their SAVED Intro and picks the exact frame Discord shows before Play.
// The paused video IS the preview: what it shows at the chosen time is the frame the worker puts first (worker/intro-share.mjs, "the last frame presented at or
// before it"). Nothing is uploaded from here: the choice is a time in milliseconds, saved with the Intro section's Save Changes (set_my_intro_thumbnail).
// The video is loaded only when the owner asks to choose a frame, so opening the editor costs no extra Intro download.

export const formatThumbnailTime = ms => {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const minutes = Math.floor(total / 60000), seconds = Math.floor(total / 1000) % 60, hundredths = Math.floor(total / 10) % 100;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
};
// 0 (or nothing) is the Intro's own first frame: the default, which needs no share copy
export const normalizeThumbnailMs = ms => (Number.isInteger(ms) && ms > 0 ? ms : null);

// saved = { jobId, thumbnailMs, shareState, shareFailureCode, durationMs, fps } from get_my_intro_thumbnail, or null; `draft` is the frame being chosen
export function describeThumbnail(saved, draft) {
  if (!saved?.jobId) return { tone: "", text: "" };
  if (draft !== saved.thumbnailMs) return { tone: "processing", text: draft ? `Unsaved · the frame at ${formatThumbnailTime(draft)} · Save Changes to use it on Discord.` : "Unsaved · back to the Intro's first frame · Save Changes to use it." };
  if (!saved.thumbnailMs) return { tone: "", text: "Discord shows your Intro's first frame." };
  const at = formatThumbnailTime(saved.thumbnailMs);
  if (saved.shareState === "ready") return { tone: "ready", text: `Discord shows the frame at ${at}. Post your GamID link again to see it.` };
  if (saved.shareState === "failed") return { tone: "failed", text: `The frame at ${at} could not be prepared for Discord, so Discord shows your Intro's first frame. Choose the frame again to retry.` };
  return { tone: "processing", text: `Preparing the frame at ${at} for Discord… Discord shows your Intro's first frame until it is ready.` };
}

export function mountIntroThumbnailPicker(doc, { resolveSource, loadState, onChange = () => {}, pollMs = 4000, pollLimit = 60, win = doc.defaultView } = {}) {
  const $ = id => doc.getElementById(id);
  const root = $("introThumbnailPicker"), open = $("introThumbnailOpen"), stage = $("introThumbnailStage"), video = $("introThumbnailVideo");
  const range = $("introThumbnailRange"), back = $("introThumbnailBack"), forward = $("introThumbnailForward"), reset = $("introThumbnailReset");
  const time = $("introThumbnailTime"), status = $("introThumbnailStatus");
  let saved = null, draft = null, enabled = false, loading = 0, poll = null, polls = 0;
  const frameMs = () => Math.max(1, Math.round(1000 / (Number(saved?.fps) > 0 ? Number(saved.fps) : 30)));
  const maxMs = () => Math.max(0, (Number(saved?.durationMs) || 0) - 1);

  function render() {
    root.hidden = !enabled || !saved?.jobId;
    const { tone, text } = describeThumbnail(saved, draft);
    status.className = `intro-file-status${tone ? ` ${tone}` : ""}`;
    status.textContent = text;
    time.textContent = draft ? `Frame at ${formatThumbnailTime(draft)}` : "First frame (default)";
    reset.disabled = !draft;
  }
  function seek(ms) {
    draft = normalizeThumbnailMs(Math.min(maxMs(), Math.max(0, Math.round(ms))));
    range.value = String(draft || 0);
    if (video.getAttribute("src")) { try { video.currentTime = (draft || 0) / 1000; } catch { /* metadata not loaded yet: applied on loadedmetadata */ } }
    render(); onChange();
  }
  function unload() {
    loading += 1;
    video.pause?.(); video.removeAttribute("src"); video.load?.();
    stage.hidden = true; open.hidden = false; open.disabled = false;
  }
  function stopPolling() { if (poll) win.clearTimeout(poll); poll = null; }
  function schedulePoll() {
    stopPolling();
    if (!enabled || !saved?.thumbnailMs || !["pending", "processing"].includes(saved.shareState) || polls >= pollLimit) return;
    poll = win.setTimeout(async () => {
      poll = null; polls += 1;
      if (doc.visibilityState !== "hidden") {
        try { const next = await loadState(); if (next?.jobId === saved?.jobId && next.thumbnailMs === saved?.thumbnailMs) { saved = next; render(); } } catch { /* the next poll retries */ }
      }
      schedulePoll();
    }, pollMs);
  }

  open.addEventListener("click", async () => {
    const request = ++loading;
    open.disabled = true; status.className = "intro-file-status processing"; status.textContent = "Loading your Intro…";
    try {
      const source = await resolveSource();
      if (request !== loading) return;
      if (!source?.url) throw Error("THUMBNAIL_SOURCE_UNAVAILABLE");
      video.onloadedmetadata = () => { if (request === loading) { range.max = String(maxMs()); range.step = "1"; video.currentTime = (draft || 0) / 1000; } };
      video.src = source.url; video.load?.();
      stage.hidden = false; open.hidden = true; render();
    } catch {
      if (request !== loading) return;
      open.disabled = false; status.className = "intro-file-status failed"; status.textContent = "Your Intro could not be loaded to choose a frame. Try again.";
    }
  });
  range.addEventListener("input", () => seek(Number(range.value)));
  back.addEventListener("click", () => seek((draft || 0) - frameMs()));
  forward.addEventListener("click", () => seek((draft || 0) + frameMs()));
  reset.addEventListener("click", () => seek(0));

  return {
    // the saved state for the ACTIVE Intro (null: no Intro); a different Intro or saved frame discards the unsaved choice and the loaded video
    setSaved(next) {
      const changed = next?.jobId !== saved?.jobId;
      saved = next?.jobId ? { ...next, thumbnailMs: normalizeThumbnailMs(next.thumbnailMs) } : null;
      draft = saved?.thumbnailMs ?? null; polls = 0;
      if (changed) unload();
      range.max = String(maxMs()); range.value = String(draft || 0);
      if (video.getAttribute("src")) { try { video.currentTime = (draft || 0) / 1000; } catch { /* applied on load */ } }
      render(); schedulePoll();
    },
    // hidden while a new Intro is chosen, being removed, or still processing (a frame belongs to one Intro)
    setEnabled(next) { if (enabled === next) return; enabled = next; if (!enabled) { draft = saved?.thumbnailMs ?? null; unload(); stopPolling(); } else schedulePoll(); render(); },
    get value() { return enabled ? draft : saved?.thumbnailMs ?? null; },
    get saved() { return saved?.thumbnailMs ?? null; },
    get jobId() { return saved?.jobId ?? null; },
    destroy() { stopPolling(); unload(); saved = null; draft = null; render(); },
  };
}
