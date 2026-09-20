// GAME ID WALL - W0 PROTOTYPE - a deliberately tiny SIMULATED Intro overlay. It is NOT the real Intro engine and shares no code with it.
// It only reproduces the relationship the architecture study needs to compare:
//   overlay visible -> page scroll LOCKED -> transition/reveal -> Wall starts at the TOP of Stage 1 -> scroll UNLOCKED -> Replay.
import { el } from "./render.js?v=w0c";

export function createIntroSim({ container = document.body, durationMs = 3500, onReveal = () => {}, onState = () => {} } = {}) {
  let overlay = null, timer = null, state = "idle";
  const setState = next => { state = next; onState(next); };

  function reveal() {
    if (state !== "intro") return;
    setState("transitioning");
    overlay.classList.add("is-leaving");
    setTimeout(() => {
      overlay?.remove(); overlay = null;
      document.documentElement.classList.remove("w0-lock");
      window.scrollTo(0, 0);                 // the Wall always starts at the top of Stage 1
      setState("wall");
      onReveal();
    }, 750);
  }

  function play() {
    clearTimeout(timer);
    overlay?.remove();
    window.scrollTo(0, 0);
    document.documentElement.classList.add("w0-lock");   // scroll locked while the Intro is visible
    overlay = el("div", "intro-sim");
    overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-label", "Simulated Intro");
    const label = el("div", "intro-label");
    label.append(el("strong", "", "SIMULATED INTRO"), el("span", "", "W0 test overlay - not the real Intro engine"));
    const bar = el("div", "intro-bar"); bar.append(el("i", ""));
    const skip = el("button", "intro-skip", "Skip"); skip.type = "button"; skip.addEventListener("click", reveal);
    overlay.append(label, bar, skip);
    container.append(overlay);
    setState("intro");
    timer = setTimeout(reveal, durationMs);
  }

  return { play, skip: reveal, get state() { return state; } };
}
