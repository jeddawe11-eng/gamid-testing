// GamID UX rule - TRANSIENT system feedback vs PERSISTENT state.
//
// Transient feedback (success messages, action confirmations, informational notices, warnings, recoverable errors) appears immediately, in the status line of the
// place where the person acted, and disappears by itself after TRANSIENT_MESSAGE_MS (5 seconds). A newer message replaces the current one and restarts the clock.
//
// Persistent state is NOT a message and never auto-disappears: a pending request, an incoming request awaiting action, unpublished changes, a problem that prevents
// continuing - anything the person still needs to act on - is part of the rendered state itself (a card, a banner, a warning box with its own buttons) and stays
// until the state changes. The only non-expiring message is an in-flight progress line ("Working…"), which lasts exactly as long as the request and is always
// replaced by its outcome.
//
// The status line is the existing GamID message element (.connections-message, role="status"); this module only owns its text, tone and timer.
export const TRANSIENT_MESSAGE_MS = 5000;
export const MESSAGE_TONES = Object.freeze(["info", "success", "warning", "error"]);

export function createTransientMessage(element, { timers = globalThis } = {}) {
  let timer = null;
  const stop = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; };
  const hide = () => { stop(); element.hidden = true; };
  return {
    // tone: info | success | warning | error. `progress: true` = an in-flight line that stays until the next show() / hide() (never use it for an outcome).
    show(text, { tone = "info", progress = false } = {}) {
      stop();
      if (!text) { hide(); return; }
      element.textContent = text;
      const kind = MESSAGE_TONES.includes(tone) ? tone : "info";
      element.classList.toggle("success", kind === "success");
      element.classList.toggle("is-info", kind === "info");
      element.classList.toggle("is-warning", kind === "warning");
      element.hidden = false;
      if (!progress) timer = timers.setTimeout(hide, TRANSIENT_MESSAGE_MS);
    },
    hide,
    get pending() { return timer !== null; },
  };
}
