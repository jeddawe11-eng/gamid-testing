// Mobile Public Wall Visitor V2 (2026-10-22): the visitor's stage navigator on a phone. The published Wall stays one vertical column of stages in the owner's order
// (its Whole-Wall background runs continuously from one stage into the next), so this only TELLS the visitor which stage they are on and MOVES the page to the
// previous / next stage - it never reorders, hides or repaints anything. On a landscape phone it also offers the Fit / Wide choice (the whole stage on screen, or
// the stage as wide as the screen). Drafts and unpublished stages never reach the page (the published snapshot is all that is painted), so nothing here can show one.
const make = (doc, tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const SVG = "http://www.w3.org/2000/svg";
const chevron = (doc, d) => {
  const svg = doc.createElementNS(SVG, "svg"), line = doc.createElementNS(SVG, "path");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  for (const [name, value] of [["d", d], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2.4"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"]]) line.setAttribute(name, value);
  svg.append(line);
  return svg;
};

// The stage the visitor is looking at: the one under the middle of the screen (or, past the last stage's middle, the nearest one). -> index, or -1 without stages
export function currentStageIndex(rects, viewportHeight) {
  if (!rects.length) return -1;
  const middle = viewportHeight / 2;
  const under = rects.findIndex(rect => rect.top <= middle && rect.bottom > middle);
  if (under >= 0) return under;
  let best = 0;
  rects.forEach((rect, index) => { if (Math.abs((rect.top + rect.bottom) / 2 - middle) < Math.abs((rects[best].top + rects[best].bottom) / 2 - middle)) best = index; });
  return best;
}

// Where the visitor is inside the Wall, so a repaint at another size (rotation, Fit / Wide) can bring them back to the same place: the stage at the top of the
// screen and how far into it they had scrolled (0..1).
export function scrollAnchor(rects) {
  if (!rects.length) return null;
  const index = Math.max(0, rects.findIndex(rect => rect.bottom > 1));
  const rect = rects[index] ?? rects[rects.length - 1];
  return { index, fraction: rect.height > 0 ? Math.min(1, Math.max(0, -rect.top / rect.height)) : 0 };
}

// topInset(): the room at the top of the screen a stage must stay below (the safe-area inset of a notched phone), so a jump never puts a stage under the notch
export function createWallStageNav({ doc = document, win = window, onWide = null, topInset = () => 0 } = {}) {
  let stages = [], index = -1, frame = 0, wide = false;
  const nav = make(doc, "nav", "wall-stage-nav");
  nav.setAttribute("aria-label", "Wall stages");
  nav.hidden = true;
  const prev = make(doc, "button", "wall-stage-nav-btn is-prev");
  prev.type = "button"; prev.setAttribute("aria-label", "Previous stage");
  prev.append(chevron(doc, "M5 15l7-7 7 7"));   // stages stack vertically: previous is up, next is down
  const next = make(doc, "button", "wall-stage-nav-btn is-next");
  next.type = "button"; next.setAttribute("aria-label", "Next stage");
  next.append(chevron(doc, "M5 9l7 7 7-7"));
  const label = make(doc, "span", "wall-stage-nav-label");
  const fit = make(doc, "button", "wall-stage-nav-fit");
  fit.type = "button";
  const steps = make(doc, "div", "wall-stage-nav-steps");
  steps.append(prev, label, next);
  nav.append(steps, fit);

  const rects = () => stages.map(stage => stage.getBoundingClientRect());
  const reduced = () => typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const render = () => {
    const count = stages.length;
    steps.hidden = count < 2;
    label.textContent = count > 1 ? `${index + 1} / ${count}` : "";
    label.setAttribute("aria-label", count > 1 ? `Stage ${index + 1} of ${count}` : "");
    prev.disabled = index <= 0;
    next.disabled = index < 0 || index >= count - 1;
    fit.textContent = wide ? "Fit" : "Wide";
    fit.setAttribute("aria-pressed", String(wide));
    fit.setAttribute("aria-label", wide ? "Show the whole stage" : "Show the stage as wide as the screen");
    fit.hidden = typeof onWide !== "function";
  };
  const track = () => { frame = 0; const found = currentStageIndex(rects(), win.innerHeight); if (found !== index) { index = found; render(); } };
  const onScroll = () => { if (!frame) frame = (win.requestAnimationFrame ?? (fn => setTimeout(fn, 16)))(track); };
  const go = target => {
    const stage = stages[target];
    if (!stage) return;
    win.scrollTo({ top: Math.max(0, stage.getBoundingClientRect().top + win.scrollY - topInset()), behavior: reduced() ? "auto" : "smooth" });
    index = target; render();
  };
  prev.addEventListener("click", () => go(index - 1));
  next.addEventListener("click", () => go(index + 1));
  fit.addEventListener("click", () => { wide = !wide; render(); onWide?.(wide); });
  win.addEventListener("scroll", onScroll, { passive: true });

  render();
  return {
    element: nav,
    get index() { return index; },
    get wide() { return wide; },
    // the painted stages (after every paint). `show`: this screen is a phone; `landscape`: the Fit / Wide choice belongs here too. A one-stage Wall in portrait
    // needs no navigator at all.
    attach(painted, show, landscape = false) {
      stages = painted; index = -1;
      nav.hidden = !show || (painted.length < 2 && !landscape);
      doc.documentElement.classList.toggle("has-wall-stage-nav", !nav.hidden && painted.length > 1);
      track(); render();
    },
    // where the visitor is (before a repaint) and the way back to it (after)
    anchor: () => scrollAnchor(rects()),
    restore(anchor) {
      const stage = anchor && stages[Math.min(anchor.index, stages.length - 1)];
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      win.scrollTo({ top: Math.max(0, rect.top + win.scrollY + anchor.fraction * rect.height - (anchor.fraction ? 0 : topInset())), behavior: "auto" });
      track();
    },
    hide() { nav.hidden = true; doc.documentElement.classList.remove("has-wall-stage-nav"); },
    destroy() { win.removeEventListener("scroll", onScroll); nav.remove(); },
  };
}
