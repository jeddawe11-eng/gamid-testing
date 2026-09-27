// The safe player: turns an embed DESCRIPTOR into a real player only when a visitor asks (a tap), and only from the adapter-built, allowlisted frame URL.
//   - Nothing loads while editing or while a Wall is merely on screen: the page shows a facade (no third-party network at all).
//   - THE INLINE CONTRACT (Round 2): a Player always plays INSIDE ITS OWN Wall element - same position, same bounds, the selected shape (letterboxed, never
//     stretched). There is no automatic GamID overlay / enlarged modal at any size (manual-QA finding: TikTok and Twitch opened one on Play). Fullscreen happens only
//     when the visitor uses the provider's own fullscreen control (allowfullscreen).
//   - While it plays, an obvious Close sits in a bar at the top of the element, OUTSIDE the provider frame (nothing is drawn over a player). Close DESTROYS the frame
//     (nothing keeps playing or loading) and the element's facade/poster is shown again, with focus returned to it.
//   - One active player per provider: starting another closes the first. If a frame cannot be built, the Wall keeps rendering and the element falls back to opening
//     the content on the provider's own site.
import { isAllowedFrameUrl, isAllowedOpenUrl } from "./engine.js";
import { markInteractive } from "../interaction.js";

const HOSTNAME = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i;
// The Close bar: a full 44px touch target on a normal-sized element; on a small element (a phone's scaled column) it shrinks with the element, never below the
// WCAG 2.2 AA 24px target, so the frame keeps most of the element.
export const INLINE_BAR_PX = 44;
export const INLINE_BAR_MIN_PX = 24;
export const inlineBarPx = heightPx => Math.max(INLINE_BAR_MIN_PX, Math.min(INLINE_BAR_PX, Math.round((Number(heightPx) || 0) * 0.16)));
const FRAME_ALLOW = "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write";
// allow-popups-to-escape-sandbox: when a visitor uses a player's own "Watch on YouTube" (or any provider's "open on ..." link), the NEW TAB it opens must not
// inherit this sandbox. youtube.com sends Cross-Origin-Opener-Policy: same-origin-allow-popups, and a sandboxed browsing context that receives a COOP document is
// refused by the browser (ERR_BLOCKED_BY_RESPONSE - manual-QA finding). The flag frees ONLY such user-opened top-level tabs; the player frame itself stays fully
// sandboxed and still cannot navigate the Wall page (no allow-top-navigation of any kind).
const FRAME_SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms";

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

// The largest frame inside (maxW x maxH) that keeps a real aspect ratio (no stretching); providers with an "auto" ratio use the whole box.
export function fitFrame(aspect, maxW, maxH) {
  const ratio = ratioOf(aspect);
  if (!ratio) return { width: Math.max(1, Math.floor(maxW)), height: Math.max(1, Math.floor(maxH)) };
  const width = Math.min(maxW, maxH * ratio);
  return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(width / ratio)) };
}
// The frame an element of (widthPx x heightPx) on screen will actually draw: below the Close bar, fitted to the selected shape.
export const inlineFrameSize = (descriptor, widthPx, heightPx) => fitFrame(descriptor.aspect, widthPx, Math.max(1, heightPx - inlineBarPx(heightPx)));
// Does that frame reach the provider's documented comfortable minimum? Informational only (the editor warns); it never changes WHERE the player plays.
export function meetsInlineMinimum(descriptor, widthPx, heightPx) {
  const min = descriptor.minFrame ?? descriptor.minInline;
  if (!min) return true;
  const frame = inlineFrameSize(descriptor, widthPx, heightPx);
  return frame.width >= min.w && frame.height >= min.h;
}

export function createPlayerManager({ doc = globalThis.document, hostname = globalThis.location?.hostname } = {}) {
  const active = new Map();   // providerKey -> { close() }

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

  // Plays inside `box` (the element's own box): a Close bar on top, the frame below it, both inside the element's bounds. Close destroys the frame and gives focus
  // back to the facade that started it (the facade/poster is visible again). Returns false when it could not play (the caller then opens the content on its site).
  function playInline(box, descriptor, boxWidthPx, boxHeightPx, opener = null) {
    closeActive(descriptor.providerKey);
    const barPx = inlineBarPx(boxHeightPx);
    const size = inlineFrameSize(descriptor, boxWidthPx, boxHeightPx);
    const frame = buildFrame(descriptor, size);
    if (!frame) return false;
    const holder = doc.createElement("div");
    holder.className = "wall-player-inline";
    for (const [name, value] of [["position", "absolute"], ["inset", "0"], ["display", "flex"], ["flex-direction", "column"], ["background", "#000000"], ["overflow", "hidden"]]) holder.style.setProperty(name, value);
    markInteractive(holder);
    const bar = doc.createElement("div");
    bar.className = "wall-player-bar";
    for (const [name, value] of [["flex", "none"], ["height", `${barPx}px`], ["display", "flex"], ["align-items", "center"], ["justify-content", "flex-end"], ["padding", "0 4px"], ["box-sizing", "border-box"], ["background", "#14101f"]]) bar.style.setProperty(name, value);
    const close = doc.createElement("button");
    close.setAttribute("type", "button");
    close.setAttribute("aria-label", "Close player");
    close.className = "wall-player-close";
    close.textContent = barPx < INLINE_BAR_PX ? "✕" : "Close ✕";
    for (const [name, value] of [["min-width", `${Math.max(INLINE_BAR_MIN_PX, barPx)}px`], ["height", `${Math.max(INLINE_BAR_MIN_PX, barPx - 4)}px`], ["padding", barPx < INLINE_BAR_PX ? "0 .4rem" : "0 .9rem"], ["border", "1px solid rgba(255,255,255,.35)"], ["border-radius", "999px"], ["background", "rgba(20,16,31,.92)"], ["color", "#ffffff"], ["font", `800 ${barPx < INLINE_BAR_PX ? ".7rem" : ".85rem"} system-ui, sans-serif`], ["line-height", "1"], ["cursor", "pointer"]]) close.style.setProperty(name, value);
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

  // What a tap on a Player does: it plays inline in that element, at every size. A descriptor that is not a player, or a frame that cannot be built safely, opens the
  // content on its own site (a new tab) - never a broken player, never an overlay.
  function activate(box, descriptor, { widthPx, heightPx, opener = null } = {}) {
    if (!descriptor.inline) return openContent(descriptor);
    return playInline(box, descriptor, widthPx, heightPx, opener) || openContent(descriptor);
  }
  function openContent(descriptor) {
    if (!isAllowedOpenUrl(descriptor.providerKey, descriptor.openUrl)) return false;
    globalThis.open?.(descriptor.openUrl, "_blank", "noopener,noreferrer");
    return true;
  }
  function destroyAll() { for (const providerKey of [...active.keys()]) closeActive(providerKey); }

  return { activate, playInline, destroyAll, activeProviders: () => [...active.keys()] };
}
