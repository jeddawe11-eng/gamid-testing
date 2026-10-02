// My Duo DURABLE user-to-user notifications on the owner's open page (20261002190000_my_duo_notifications.sql).
//
// Two kinds of feedback exist on GamID:
//   - LOCAL transient feedback about the person's OWN action (Request sent, Cancelled, Saved, Link copied) - transient-message.js, ~3 s, never stored;
//   - DURABLE notifications about what ANOTHER person did that affects this person (a request arrived / was cancelled, your request was declined / accepted, your Duo
//     ended or was replaced). They are stored for the recipient alone, survive being offline, and are shown here.
//
// Rules this module implements:
//   - fetched on page load and whenever the private "duo changed" Realtime signal arrives (duo-realtime.js) - the server returns only the caller's UNSEEN ones,
//     oldest first, with the authoritative event kind (never inferred from state);
//   - shown one at a time in that order, each for DUO_NOTIFICATION_MS (5 s) counted from the moment it is DISPLAYED - never from when the event happened;
//   - displayed only while the page is visible (a background tab keeps them pending until the person looks);
//   - marked seen only once it has been displayed; a page shows each id at most once, so the page-load fetch and a Realtime fetch racing each other never
//     duplicate it, and a seen one is never returned again;
//   - the persistent My Duo cards are separate: a pending request stays on screen until it is answered, whether or not its notification was seen.
export const DUO_NOTIFICATION_MS = 5000;

export const DUO_NOTIFICATION_KINDS = Object.freeze(["DUO_REQUEST_RECEIVED", "DUO_REQUEST_CANCELLED", "DUO_REQUEST_DECLINED", "DUO_REQUEST_ACCEPTED", "DUO_ENDED", "DUO_REPLACED"]);

const HANDLE = /^[a-z0-9][a-z0-9_]{1,22}[a-z0-9]$/;

// the visible wording for one notification row (or null when it cannot be shown safely)
export function notificationText(row) {
  const handle = typeof row?.actor_handle === "string" && HANDLE.test(row.actor_handle) ? `@${row.actor_handle}` : null;
  if (!handle) return null;
  switch (row.kind) {
    case "DUO_REQUEST_RECEIVED": return { text: `${handle} sent you a Duo request.`, tone: "info" };
    case "DUO_REQUEST_CANCELLED": return { text: `${handle} cancelled their Duo request.`, tone: "info" };
    case "DUO_REQUEST_DECLINED": return { text: `${handle} declined your Duo request.`, tone: "warning" };
    case "DUO_REQUEST_ACCEPTED": return { text: `${handle} accepted your Duo request. You're now Duo.`, tone: "success" };
    case "DUO_ENDED": return { text: `${handle} ended your Duo.`, tone: "warning" };
    case "DUO_REPLACED": return { text: `Your Duo with ${handle} has ended because ${handle} chose a new Duo.`, tone: "warning" };
    default: return null;
  }
}

export function createDuoNotifier({ api, notice, timers = globalThis, isVisible = () => globalThis.document?.visibilityState !== "hidden" }) {
  const known = new Set();   // ids queued or shown by this page (each at most once)
  const queue = [];
  let showing = null, timer = null, fetching = null, again = false, stopped = false;

  const hide = () => { notice.hidden = true; notice.textContent = ""; };
  const tone = kind => { notice.classList.toggle("success", kind === "success"); notice.classList.toggle("is-info", kind === "info"); notice.classList.toggle("is-warning", kind === "warning"); };

  function pump() {
    if (stopped || showing || !queue.length || !isVisible()) return;
    const item = queue.shift();
    const shown = notificationText(item);
    if (!shown) { markSeen(item.notification_id); pump(); return; }   // an unknown kind is consumed, never shown as something else
    showing = item;
    notice.textContent = shown.text;
    tone(shown.tone);
    notice.hidden = false;
    markSeen(item.notification_id);   // it is on screen now: only now does it count as seen
    timer = timers.setTimeout(() => { timer = null; showing = null; hide(); pump(); }, DUO_NOTIFICATION_MS);
  }

  function markSeen(id) {
    // if this fails it simply stays unseen on the server and is shown again on a later visit (never lost); this page will not repeat it
    Promise.resolve().then(() => api.markMyDuoNotificationsSeen([id])).catch(() => {});
  }

  async function fetchOnce() {
    let rows;
    try { rows = await api.getMyDuoNotifications(); } catch { return; }
    for (const row of (Array.isArray(rows) ? rows : []).slice().sort((a, b) => Number(a.notification_id) - Number(b.notification_id))) {
      const id = row?.notification_id;
      if ((typeof id !== "number" && typeof id !== "string") || known.has(String(id))) continue;
      known.add(String(id));
      queue.push(row);
    }
  }

  // fetch the pending ones (page load, a Realtime signal, the tab becoming visible); concurrent calls collapse into one more fetch
  async function check() {
    if (stopped) return;
    if (fetching) { again = true; return fetching; }
    fetching = (async () => {
      do { again = false; await fetchOnce(); } while (again && !stopped);
      fetching = null;
      pump();
    })();
    return fetching;
  }

  return {
    check,
    pump,
    stop() { stopped = true; if (timer !== null) timers.clearTimeout(timer); timer = null; showing = null; queue.length = 0; hide(); },
    get showing() { return showing; },
    get queued() { return queue.length; },
  };
}
