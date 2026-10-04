// The visitor's navigation on a GamID opened from another GamID (My Duo: /@duo?from=<owner>) or from a Crew Wall (My Crew: /@member?crew=<crew id>). One group,
// top-right, above the Intro:
//   ‹ Back to @previous / Back to <Crew>   - returns to where the visitor came from (history back when the previous page IS that GamID / that Crew Wall - which keeps
//                                            its stage and scroll position - otherwise it opens it)
//   Skip Intro →                            - only while THIS GamID's Intro is playing: skips it at once, straight to the published Wall, or the Public Profile when there
//                                            is none (the Intro frame performs the skip - the same code path as its own Skip button - and hides its own Skip,
//                                            config.hostSkip, so there is never two). Pressing nothing lets the Intro finish normally. Replay Intro stays the page's
//                                            existing control after the Intro.
// The Crew Wall page uses the same group with `from` only (/crew/?c=<id>&from=<handle>, opened from a Personal GamID's My Crew block): "Back to @<handle>".
// Without a valid `from` / `crew` nothing is rendered and the page behaves exactly as before.
import { gamidHref, goBack, crewWallHref } from "./identity-link.js";

export function createVisitorNav({ from, crew = "", pathname = "/", doc = globalThis.document, referrer = "", origin = "", history = null, onSkip = () => {} }) {
  // returning to a Crew Wall keeps where the visitor entered the Crew from (`from`), so that Crew Wall can still lead back to the originating GamID
  const href = crew ? crewWallHref(crew, { pathname, from }) : from ? gamidHref(from, { pathname }) : null;
  if (!href) return null;
  const node = (tag, className, text) => { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const nav = node("nav", "identity-nav");
  nav.setAttribute("aria-label", "GamID navigation");
  const back = node("a", "identity-back", "");
  back.href = href;
  const label = node("span", "", crew ? "Back to Crew" : `Back to @${from}`);
  back.setAttribute("aria-label", crew ? "Back to Crew" : `Back to @${from}`);
  back.append(node("span", "identity-back-arrow", "‹"), label);
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
    // a Crew's name arrives after the page asked the public Crew Wall for it (plain text only)
    setBackName(name) {
      const clean = typeof name === "string" ? name.trim().slice(0, 40) : "";
      if (!crew || !clean || /[<>\u0000-\u001f]/.test(clean)) return;
      label.textContent = `Back to ${clean}`;
      back.setAttribute("aria-label", `Back to ${clean}`);
    },
    get skipVisible() { return !skip.hidden; },
  };
}
