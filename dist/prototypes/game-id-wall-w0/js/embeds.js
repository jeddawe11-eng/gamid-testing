// GAME ID WALL - W0 PROTOTYPE - embed providers + click-to-load controller.
//
// Accepted W0 behaviour:
//   * EDIT mode never creates a real third-party iframe (facades only). "Preview / Interact" opens a temporary overlay player.
//   * PUBLIC/preview mode starts with the facade. NOTHING autoplays and NOTHING is requested from a provider until the visitor taps.
//   * inline playback when the box meets the provider minimum; a smaller tile opens a larger IN-PAGE overlay player (never navigates away)
//   * at most ONE active player per provider (activating another of the same provider reverts the previous one to its facade)
//   * no early connection hints to providers, no provider JS API: plain iframes only, built from constants + a validated resource id (never user markup)
import { ActivePlayers, EMBED_ID, classifyEmbedPx, embedAspect, EMBED } from "./model.js?v=w0c";
import { el, css } from "./render.js?v=w0c";

export const PROVIDERS = Object.freeze({
  youtube: Object.freeze({
    label: "YouTube",
    // privacy-enhanced embed host (documented by YouTube Help). Referrer must be SENT: YouTube fails with error 153 without a Referer.
    allow: "autoplay; encrypted-media; fullscreen; picture-in-picture",
    referrerpolicy: "strict-origin-when-cross-origin",
    src(node, { autoplay }) {
      if (!EMBED_ID.youtube.test(node.id)) throw new Error("INVALID_YOUTUBE_ID");
      return `https://www.youtube-nocookie.com/embed/${node.id}?playsinline=1&rel=0${autoplay ? "&autoplay=1" : ""}`;
    },
  }),
  spotify: Object.freeze({
    label: "Spotify",
    allow: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",   // Spotify's documented list
    referrerpolicy: "strict-origin-when-cross-origin",
    src(node) {
      if (!EMBED_ID.spotify.test(node.id) || !["track", "album", "playlist"].includes(node.kind)) throw new Error("INVALID_SPOTIFY_RESOURCE");
      return `https://open.spotify.com/embed/${node.kind}/${node.id}`;
    },
  }),
});

export function buildIframe(node, { autoplay = false } = {}) {
  const spec = PROVIDERS[node.provider];
  const frame = document.createElement("iframe");
  frame.setAttribute("src", spec.src(node, { autoplay }));
  frame.setAttribute("title", `${spec.label} player`);
  frame.setAttribute("allow", spec.allow);
  frame.setAttribute("referrerpolicy", spec.referrerpolicy);
  frame.setAttribute("allowfullscreen", "");
  frame.setAttribute("loading", "eager");
  frame.className = "embed-iframe";
  frame.dataset.w0Embed = node.provider;
  return frame;
}

export function activeIframeCount() { return document.querySelectorAll("iframe[data-w0-embed]").length; }

export class EmbedController {
  // getNode(id) -> embed node content; root: element that contains the rendered .n-embed elements
  constructor({ getNode, root, onChange = () => {}, log = () => {} }) {
    this.getNode = getNode; this.root = root; this.onChange = onChange; this.log = log;
    this.players = new ActivePlayers();
    this.state = new Map();          // node id -> { provider, mode, iframe, outer, overlay, opener }
    this.onKey = event => { if (event.key === "Escape") this.closeOverlay(); };
  }

  outerFor(id) { return this.root.querySelector(`.n-embed[data-id="${id}"]`); }
  isActive(id) { return this.state.has(id); }

  open(id, { forceOverlay = false } = {}) {
    const node = this.getNode(id);
    if (!node || this.state.has(id)) return null;
    const outer = this.outerFor(id);
    let mode = "overlay";
    if (!forceOverlay && outer) { const rect = outer.getBoundingClientRect(); mode = classifyEmbedPx(node.provider, rect.width, rect.height).mode; }
    const previous = this.players.activate(node.provider, id);
    if (previous) this.close(previous);                        // one active player per provider
    if (mode === "overlay") this.closeOverlay();               // one overlay at a time
    const entry = { provider: node.provider, mode, outer, iframe: null, overlay: null, opener: document.activeElement };
    this.state.set(id, entry);
    if (mode === "inline" && outer) this.#openInline(id, node, entry);
    else this.#openOverlay(id, node, entry);
    this.log(`open ${node.provider} ${id} -> ${mode}`);
    this.onChange();
    return mode;
  }

  #openInline(id, node, entry) {
    const { outer } = entry;
    entry.iframe = buildIframe(node, { autoplay: true });
    outer.querySelector(".player-slot").append(entry.iframe);
    outer.querySelector(".facade").hidden = true;
    outer.classList.add("is-live");
    // the close control lives OUTSIDE the player box: nothing may be displayed in front of any part of a YouTube player
    const close = el("button", "embed-close", "Close player");
    close.type = "button";
    close.addEventListener("click", () => this.close(id));
    outer.append(close);
    entry.chip = close;
  }

  #openOverlay(id, node, entry) {
    const overlay = el("div", "embed-overlay");
    overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", `${PROVIDERS[node.provider].label} player`);
    const backdrop = el("div", "ov-backdrop"); backdrop.addEventListener("click", () => this.close(id));
    const panel = el("div", "ov-panel");
    const bar = el("div", "ov-bar");
    bar.append(el("span", "ov-title", `${PROVIDERS[node.provider].label} - larger in-page player`));
    const close = el("button", "ov-close", "Close"); close.type = "button"; close.addEventListener("click", () => this.close(id));
    bar.append(close);
    const frameBox = el("div", `ov-frame ov-${node.provider}`);
    if (node.provider === "youtube") css(frameBox, { "--ar": String(embedAspect(node) || 16 / 9) });
    else css(frameBox, { "--h": `${node.variant === "compact" ? 152 : 352}px` });
    entry.iframe = buildIframe(node, { autoplay: node.provider === "youtube" });
    frameBox.append(entry.iframe);
    panel.append(bar, frameBox);
    overlay.append(backdrop, panel);
    document.body.append(overlay);
    document.documentElement.classList.add("w0-lock");
    document.addEventListener("keydown", this.onKey);
    entry.overlay = overlay;
    close.focus();
  }

  close(id) {
    const entry = this.state.get(id);
    if (!entry) return;
    if (entry.iframe) { entry.iframe.setAttribute("src", "about:blank"); entry.iframe.remove(); }   // destroy: stops playback, releases the frame
    if (entry.chip) entry.chip.remove();
    if (entry.outer) { entry.outer.classList.remove("is-live"); const facade = entry.outer.querySelector(".facade"); if (facade) facade.hidden = false; }
    if (entry.overlay) { entry.overlay.remove(); document.documentElement.classList.remove("w0-lock"); document.removeEventListener("keydown", this.onKey); }
    this.players.deactivate(entry.provider, id);
    this.state.delete(id);
    try { entry.opener?.focus?.(); } catch { /* the opener may be gone */ }
    this.log(`close ${entry.provider} ${id}`);
    this.onChange();
  }

  closeOverlay() { for (const [id, entry] of this.state) if (entry.overlay) { this.close(id); return; } }
  closeAll() { for (const id of [...this.state.keys()]) this.close(id); }
  summary() { return { active: this.players.count(), iframes: activeIframeCount(), byProvider: { ...this.players.byProvider } }; }
}
