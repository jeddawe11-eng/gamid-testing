// The visitor's navigation on a GamID opened from another GamID (My Duo: /@duo?from=<owner>). One group, top-right, above the Intro:
//   ‹ Back to @previous   - returns to the GamID the visitor came from (history back when the previous page IS that GamID, otherwise it opens it)
//   Skip Intro →          - only while THIS GamID's Intro is playing: skips it at once, straight to the published Wall, or the Public Profile when there is none
//                           (the Intro frame performs the skip - the same code path as its own Skip button - and hides its own Skip, config.hostSkip, so there is
//                           never two). Pressing nothing lets the Intro finish normally. Replay Intro stays the page's existing control after the Intro.
// Without a valid `from` nothing is rendered and the page behaves exactly as before.
import { gamidHref, goBack } from "./identity-link.js";

export function createVisitorNav({ from, pathname = "/", doc = globalThis.document, referrer = "", origin = "", history = null, onSkip = () => {} }) {
  const href = from ? gamidHref(from, { pathname }) : null;
  if (!href) return null;
  const node = (tag, className, text) => { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const nav = node("nav", "identity-nav");
  nav.setAttribute("aria-label", "GamID navigation");
  const back = node("a", "identity-back", "");
  back.href = href;
  back.setAttribute("aria-label", `Back to @${from}`);
  back.append(node("span", "identity-back-arrow", "‹"), node("span", "", `Back to @${from}`));
  back.addEventListener("click", event => goBack(event, { href, referrer, origin, history }));
  const skip = node("button", "identity-skip", "");
  skip.type = "button";
  skip.hidden = true;
  skip.setAttribute("aria-label", "Skip Intro");
  skip.append(node("span", "", "Skip Intro"), node("span", "identity-skip-arrow", "→"));
  skip.addEventListener("click", () => { skip.hidden = true; onSkip(); });
  nav.append(back, skip);
  return {
    element: nav,
    // the Intro frame's state: "intro" (playing), "transitioning", "profile" (entered)
    setIntroState(state) { skip.hidden = state !== "intro"; },
    get skipVisible() { return !skip.hidden; },
  };
}
