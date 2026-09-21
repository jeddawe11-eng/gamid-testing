// Content-driven layout for the public profile (no DOM of its own: the caller passes the elements, so this is unit-testable).
//
// The public GamID renders its profile inside an iframe. While the Intro plays, that iframe must be a full-viewport overlay; once the profile shows it must be
// ordinary page content whose height is whatever the profile actually needs. Two small pieces make that structural instead of a guessed height:
//   * createHeightReporter (runs inside the profile document): reports the profile's own content height, only when it really changed and only when it is measurable
//   * createFlowLayout     (runs in the host page): switches between the full-viewport "experience" stage and the "flow" layout, and sizes the frame to the reported height
// There is no fallback number anywhere: without a real height the host keeps the overlay (the previous behavior) rather than inventing one.

export const FLOW_MAX_HEIGHT = 50000;   // sanity bound for a reported height, in CSS px

// measure(): the profile block's current height (content-sized in flow mode, so it never depends on the frame's own height: no resize loop)
// active():  true only while the profile is showing in flow mode (a hidden or intro-time frame is not measurable)
// post(h):   sends the height to the host
export function createHeightReporter({ measure, active, post }) {
  let last = 0;
  return function reportHeight() {
    if (!active()) { last = 0; return false; }   // leaving flow forgets the last value, so coming back always reports again
    const height = Math.ceil(Number(measure()));
    if (!Number.isFinite(height) || height <= 0 || height === last) return false;
    last = height;
    post(height);
    return true;
  };
}

// shell: element carrying data-mode; frame: the profile iframe; root: <html> (gets is-public-flow); scrollToTop(): called when the overlay comes back;
// onEnterFlow(): called once each time the page enters flow layout (the host uses it to ask for a settle re-measure: entering flow can change the frame's width, for
// example when a classic scrollbar appears, and the text then wraps differently)
export function createFlowLayout({ shell, frame, root, scrollToTop, onEnterFlow = () => {} }) {
  let wantsFlow = false;
  let height = 0;
  let inFlow = false;

  function sync() {
    const flow = wantsFlow && height > 0;
    if (flow) frame.style.height = `${height}px`;
    shell.dataset.mode = flow ? "flow" : "experience";
    if (flow === inFlow) return;
    inFlow = flow;
    root.classList.toggle("is-public-flow", flow);
    if (!flow) { frame.style.height = ""; scrollToTop(); } else onEnterFlow();
  }

  return {
    // the profile is (not) the thing on screen: false during the Intro and its transition
    setProfileShowing(showing) { wantsFlow = Boolean(showing); sync(); },
    // a reported height; anything that is not a sane positive number is ignored
    setHeight(value) {
      const next = Number(value);
      if (Number.isFinite(next) && next > 0 && next < FLOW_MAX_HEIGHT) { height = Math.ceil(next); sync(); }
    },
    // Replay Intro: the Intro needs the whole viewport again
    enterExperience() { wantsFlow = false; sync(); },
    get mode() { return inFlow ? "flow" : "experience"; },
  };
}
