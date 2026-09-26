// The safe player: turns an embed DESCRIPTOR into a real player only when a visitor asks (a tap), and only from the adapter-built, allowlisted frame URL.
//   - Nothing loads while editing or while a Wall is merely on screen: the page shows a facade (no third-party network at all).
//   - A big-enough box plays inline; a box below the provider's product minimum is a small tile that opens a LARGER in-page player (W0's real-device finding: a tiny
//     player "technically renders" but is unusable). The visitor stays inside the page.
//   - The expanded player has an obvious Close button (outside the video, never a permanent strip inside the Wall), closes on the backdrop and Escape, and DESTROYS the
//     frame so nothing keeps playing or loading. An inline player has its own Close in a bar above the frame, shown only while it plays, with the same lifecycle.
//   - One active player per provider: starting another closes the first. If a frame cannot be built or fails, the Wall keeps rendering and the element falls back to
//     opening the content on the provider's own site.
import { isAllowedFrameUrl, isAllowedOpenUrl } from "./engine.js";
import { markInteractive } from "../interaction.js";

const HOSTNAME = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i;
// An inline player keeps an obvious Close in a bar at the top of its own element box, OUTSIDE the provider frame (nothing is ever drawn over a player). The bar is
// one 44px touch target tall; the frame fits the rest of the box, so a box only plays inline when that remaining area still meets the provider's minimum.
export const INLINE_BAR_PX = 44;
const FRAME_ALLOW = "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write";
const FRAME_SANDBOX = "allow-scripts allow-same-origin allow-popups allow-presentation allow-forms";

// The frame URL for a descriptor, with the page host filled in where a provider needs it. null when it cannot be built safely.
export function resolveFrameUrl(descriptor, hostname) {
  if (!descriptor?.inline || typeof descriptor.embedUrl !== "string") return null;
  let url = descriptor.embedUrl;
  if (url.includes("{parent}")) {
    if (typeof hostname !== "string" || !HOSTNAME.test(hostname)) return null;
    url = url.replaceAll("{parent}", encodeURIComponent(hostname.toLowerCase()));
  }
  return isAllowedFrameUrl(descriptor.providerKey, url) ? url : null;
}

const RATIO = /^(\d+):(\d+)$/;
export const ratioOf = aspect => { const match = RATIO.exec(aspect ?? ""); return match ? Number(match[1]) / Number(match[2]) : null; };

// Is the box on screen big enough for an inline player? (px on screen, not stage units.)
export function fitsInline(descriptor, widthPx, heightPx) {
  if (!descriptor.minInline) return true;
  return widthPx >= descriptor.minInline.w && heightPx >= descriptor.minInline.h;
}

// The largest frame inside (maxW x maxH) that keeps a real aspect ratio (no stretching); providers with an "auto" ratio use the whole box.
export function fitFrame(aspect, maxW, maxH) {
  const ratio = ratioOf(aspect);
  if (!ratio) return { width: Math.max(1, Math.floor(maxW)), height: Math.max(1, Math.floor(maxH)) };
  const width = Math.min(maxW, maxH * ratio);
  return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(width / ratio)) };
}

// Expanded player size: at most 92% of the viewport (and a sensible cap); providers without a fixed ratio get a comfortable default.
export function expandedSize(descriptor, viewportW, viewportH) {
  const maxW = Math.min(viewportW * 0.92, 960), maxH = viewportH * 0.78;
  if (ratioOf(descriptor.aspect)) return fitFrame(descriptor.aspect, maxW, maxH);
  const min = descriptor.minInline ?? { w: 320, h: 240 };
  return { width: Math.floor(Math.min(maxW, Math.max(min.w, 560))), height: Math.floor(Math.min(maxH, Math.max(min.h * 1.6, 480))) };
}

export function createPlayerManager({ doc = globalThis.document, hostname = globalThis.location?.hostname, viewport = () => ({ width: globalThis.innerWidth ?? 800, height: globalThis.innerHeight ?? 600 }) } = {}) {
  const active = new Map();   // providerKey -> { close() }
  let expanded = null;

  const closeActive = providerKey => { const existing = active.get(providerKey); if (existing) { active.delete(providerKey); existing.close(); } };

  function buildFrame(descriptor, size) {
    const url = resolveFrameUrl(descriptor, hostname);
    if (!url) return null;
    const frame = doc.createElement("iframe");
    frame.setAttribute("src", url);
    frame.setAttribute("title", `${descriptor.providerLabel} ${descriptor.contentLabel.toLowerCase()}`);
    frame.setAttribute("allow", FRAME_ALLOW);
    frame.setAttribute("allowfullscreen", "");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.setAttribute("loading", "lazy");
    frame.setAttribute("sandbox", FRAME_SANDBOX);
    frame.style.setProperty("border", "0");
    frame.style.setProperty("width", `${size.width}px`);
    frame.style.setProperty("height", `${size.height}px`);
    frame.style.setProperty("display", "block");
    return frame;
  }
  const destroyFrame = frame => { try { frame.setAttribute("src", "about:blank"); } catch { /* already gone */ } frame.remove?.(); };

  // Plays inside `box` (the element's own box): a Close bar on top, the frame below it. Close destroys the frame (same lifecycle as the larger player) and gives
  // focus back to the facade that started it. Returns false when it could not play (the caller then opens the content on the provider's site).
  function playInline(box, descriptor, boxWidthPx, boxHeightPx, opener = null) {
    closeActive(descriptor.providerKey);
    const size = fitFrame(descriptor.aspect, boxWidthPx, Math.max(1, boxHeightPx - INLINE_BAR_PX));
    const frame = buildFrame(descriptor, size);
    if (!frame) return false;
    const holder = doc.createElement("div");
    holder.className = "wall-player-inline";
    for (const [name, value] of [["position", "absolute"], ["inset", "0"], ["display", "flex"], ["flex-direction", "column"], ["background", "#000000"]]) holder.style.setProperty(name, value);
    markInteractive(holder);
    const bar = doc.createElement("div");
    bar.className = "wall-player-bar";
    for (const [name, value] of [["flex", "none"], ["height", `${INLINE_BAR_PX}px`], ["display", "flex"], ["align-items", "center"], ["justify-content", "flex-end"], ["padding", "0 4px"], ["box-sizing", "border-box"], ["background", "#14101f"]]) bar.style.setProperty(name, value);
    const close = doc.createElement("button");
    close.setAttribute("type", "button");
    close.setAttribute("aria-label", "Close player");
    close.className = "wall-player-close";
    close.textContent = "Close ✕";
    for (const [name, value] of [["min-width", "44px"], ["min-height", "40px"], ["padding", "0 .9rem"], ["border", "1px solid rgba(255,255,255,.35)"], ["border-radius", "999px"], ["background", "rgba(20,16,31,.92)"], ["color", "#ffffff"], ["font", "800 .85rem system-ui, sans-serif"], ["cursor", "pointer"]]) close.style.setProperty(name, value);
    bar.append(close);
    const stageBox = doc.createElement("div");
    for (const [name, value] of [["flex", "1"], ["min-height", "0"], ["display", "grid"], ["place-items", "center"]]) stageBox.style.setProperty(name, value);
    stageBox.append(frame);
    holder.append(bar, stageBox);
    box.append(holder);
    box.setAttribute("data-playing", "true");
    const entry = { close() { destroyFrame(frame); holder.remove?.(); box.setAttribute("data-playing", "false"); } };
    close.addEventListener("click", () => {
      if (active.get(descriptor.providerKey) !== entry) return;
      closeActive(descriptor.providerKey);
      opener?.focus?.();
    });
    active.set(descriptor.providerKey, entry);
    close.focus?.();
    return true;
  }

  function closeExpanded() {
    if (!expanded) return;
    const current = expanded;
    expanded = null;
    doc.removeEventListener?.("keydown", current.onKey);
    destroyFrame(current.frame);
    current.overlay.remove?.();
    doc.body.style.removeProperty("overflow");
    current.opener?.focus?.();
  }

  function openExpanded(descriptor, opener = null) {
    closeExpanded();
    closeActive(descriptor.providerKey);
    const { width: vw, height: vh } = viewport();
    const size = expandedSize(descriptor, vw, vh);
    const frame = buildFrame(descriptor, size);
    if (!frame) return false;
    const overlay = doc.createElement("div");
    overlay.className = "wall-player-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `${descriptor.providerLabel} player`);
    for (const [name, value] of [["position", "fixed"], ["inset", "0"], ["z-index", "2147483000"], ["display", "grid"], ["place-items", "center"], ["background", "rgba(3,2,7,.88)"], ["padding", "3.4rem 0 1rem"]]) overlay.style.setProperty(name, value);
    const close = doc.createElement("button");
    close.setAttribute("type", "button");
    close.setAttribute("aria-label", "Close player");
    close.className = "wall-player-close";
    close.textContent = "Close ✕";
    for (const [name, value] of [["position", "fixed"], ["top", "max(.6rem, env(safe-area-inset-top))"], ["right", ".8rem"], ["min-width", "44px"], ["min-height", "44px"], ["padding", ".5rem 1rem"], ["border", "1px solid rgba(255,255,255,.35)"], ["border-radius", "999px"], ["background", "rgba(20,16,31,.92)"], ["color", "#ffffff"], ["font", "800 .9rem system-ui, sans-serif"], ["cursor", "pointer"]]) close.style.setProperty(name, value);
    const stageBox = doc.createElement("div");
    stageBox.style.setProperty("width", `${size.width}px`);
    stageBox.style.setProperty("height", `${size.height}px`);
    stageBox.style.setProperty("max-width", "100%");
    stageBox.style.setProperty("background", "#000000");
    stageBox.append(frame);
    overlay.append(close, stageBox);
    const onKey = event => { if (event.key === "Escape") closeExpanded(); };
    close.addEventListener("click", closeExpanded);
    overlay.addEventListener("click", event => { if (event.target === overlay) closeExpanded(); });
    doc.addEventListener("keydown", onKey);
    doc.body.append(overlay);
    doc.body.style.setProperty("overflow", "hidden");
    close.focus?.();
    expanded = { overlay, frame, onKey, opener };
    return true;
  }

  // What a tap on an embed does: small box -> larger player; big enough box -> inline; anything that cannot play -> open the content on its own site.
  function activate(box, descriptor, { widthPx, heightPx, opener = null } = {}) {
    if (!descriptor.inline) return openContent(descriptor);
    const played = fitsInline(descriptor, widthPx, heightPx - INLINE_BAR_PX) ? playInline(box, descriptor, widthPx, heightPx, opener) : openExpanded(descriptor, opener);
    return played || openContent(descriptor);
  }
  function openContent(descriptor) {
    if (!isAllowedOpenUrl(descriptor.providerKey, descriptor.openUrl)) return false;
    globalThis.open?.(descriptor.openUrl, "_blank", "noopener,noreferrer");
    return true;
  }
  function destroyAll() { closeExpanded(); for (const providerKey of [...active.keys()]) closeActive(providerKey); }

  return { activate, playInline, openExpanded, closeExpanded, destroyAll, get expanded() { return !!expanded; }, activeProviders: () => [...active.keys()] };
}
