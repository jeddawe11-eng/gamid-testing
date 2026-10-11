// ISS-0010: the Profile Editor's Intro Preview ends in the editor. The Intro frame (intro-preview.html) reports its experience state; once a preview has actually
// started ("intro" / "transitioning"), its next "profile" state - reached by Skip Intro or by the natural end after the transition - means the Intro is over, and
// onEnd returns the owner to the editor. A "profile" that arrives without a started preview (a previous preview being stopped, a frame that never played) is
// ignored. The editor asks the frame for hostReveal, so the frame's own profile card is never shown. The public visitor page has its own host and is unaffected.
export function createEditorPreviewEnd(onEnd) {
  let started = false;
  return {
    reset() { started = false; },
    state(value) {
      if (value === "intro" || value === "transitioning") { started = true; return false; }
      if (value === "profile" && started) { started = false; onEnd(); return true; }
      return false;
    },
  };
}
