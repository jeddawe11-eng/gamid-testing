// GamID UX rule - TRANSIENT system feedback vs PERSISTENT state.
//
// Transient feedback (success messages, action confirmations, informational notices, warnings, recoverable errors) appears immediately, in the status line of the
// place where the person acted, and disappears by itself after TRANSIENT_MESSAGE_MS (about 3 seconds). A newer message replaces the current one and restarts the clock.
//
// Persistent state is NOT a message and never auto-disappears: a pending request, an incoming request awaiting action, unpublished changes, a problem that prevents
// continuing - anything the person still needs to act on - is part of the rendered state itself (a card, a banner, a warning box with its own buttons) and stays
// until the state changes. The only non-expiring message is an in-flight progress line ("Working…"), which lasts exactly as long as the request and is always
// replaced by its outcome.
//
// Shared-state changes made by SOMEONE ELSE (another person's action that this open page depends on) are a third thing: they are not messages either - the page
// re-reads and re-renders its state when the server signals a change (see duo-realtime.js for My Duo).
//
// The status line is the existing GamID message element (.connections-message, role="status"); this module only owns its text, tone and timer.
export const TRANSIENT_MESSAGE_MS = 3000;
export const MESSAGE_TONES = Object.freeze(["info", "success", "warning", "error"]);

// Profile section nodes survive sign-out/sign-in: one feedback clock may own each reused node.
const profileMessages = new WeakMap();
export function createTransientMessage(element, { timers = globalThis, now = Date.now, durationMs = element.closest?.("[data-profile-editor]") ? 5000 : TRANSIENT_MESSAGE_MS } = {}) {
  if(durationMs===5000)profileMessages.get(element)?.hide();
  let timer = null, remaining = durationMs, started = 0, transient = false;
  const visible = () => element.ownerDocument?.visibilityState !== "hidden" && !element.hidden && (typeof element.getClientRects !== "function" || (element.getClientRects().length > 0 && element.getBoundingClientRect().bottom > 0 && element.getBoundingClientRect().top < (globalThis.innerHeight || Infinity)));
  const stop = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; };
  const hide = () => { transient=false;stop(); element.hidden = true; };
  if(durationMs===5000 && typeof globalThis.IntersectionObserver==='function'){
    const observe=()=>{if(!transient||element.hidden)return;if(visible()){if(timer===null){started=now();timer=timers.setTimeout(hide,remaining);}}else if(timer!==null){remaining=Math.max(0,remaining-(now()-started));stop();}};
    new IntersectionObserver(observe).observe(element);
    new MutationObserver(observe).observe(element.ownerDocument.getElementById('identityView'),{attributes:true,subtree:true,attributeFilter:['hidden','class']});
    element.ownerDocument.addEventListener('visibilitychange',observe);
  }
  const feedback = {
    // tone: info | success | warning | error. `progress: true` = an in-flight line that stays until the next show() / hide() (never use it for an outcome).
    show(text, { tone = "info", progress = false, persistent = false } = {}) {
      stop();
      if (!text) { hide(); return; }
      element.textContent = text;
      const kind = MESSAGE_TONES.includes(tone) ? tone : "info";
      element.classList.toggle("success", kind === "success");
      element.classList.toggle("is-info", kind === "info");
      element.classList.toggle("is-warning", kind === "warning");
      element.hidden = false;
      transient = !progress && !persistent && !(durationMs===5000 && kind==="error");remaining=durationMs;
      if(transient && visible()){started=now();timer=timers.setTimeout(hide,remaining);}
    },
    hide,
    get pending() { return timer !== null; },
  };
  if(durationMs===5000)profileMessages.set(element,feedback);
  return feedback;
}
