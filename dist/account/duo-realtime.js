// My Duo live state: an open Account page follows Duo changes made elsewhere (the other person's request / accept / decline / cancel / end, a replacement that ends
// this Duo, the other person's public switch or GamID publication) without a manual refresh.
//
// Mechanism = the one Play Together already uses: a PRIVATE Supabase Realtime broadcast topic per signed-in user (identity:user:<auth uid>, authorized by the
// realtime.messages policy "identity_relationship_broadcasts"), fed by database triggers (20261002170000_my_duo_realtime.sql). A signal carries no data; it only
// says "your Duo state changed", and the page re-reads it through the owner RPC get_my_duo - so what is shown is always what the server authorizes now.
// Signals arriving in a burst (an accept that also ends two older Duos) are coalesced into one re-read. Broadcasts sent while the socket was down are not replayed,
// so the page also re-reads once when it becomes visible again or the network comes back (an event, not polling).
import { subscribePrivateBroadcast } from "./realtime-client.js";
import { userIdFromToken } from "./supabase-client.js";

export const DUO_TOPIC_PREFIX = "identity:user:";
export const DUO_EVENT = "duo_changed";
export const DUO_REFRESH_DELAY_MS = 120;

// one re-read per burst; a signal that arrives while a re-read is running schedules exactly one more
export function createDuoRefreshScheduler(refresh, { delay = DUO_REFRESH_DELAY_MS, timers = globalThis } = {}) {
  let timer = null, running = false, again = false;
  const run = async () => {
    timer = null;
    running = true;
    try { await refresh(); } catch { /* the next signal (or the next visibility change) retries through the same RPC */ }
    finally { running = false; if (again) { again = false; schedule(); } }
  };
  const schedule = () => {
    if (running) { again = true; return; }
    if (timer !== null) timers.clearTimeout(timer);
    timer = timers.setTimeout(run, delay);
  };
  schedule.cancel = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; again = false; };
  return schedule;
}

export function subscribeDuoRealtime({ refresh, subscribe = subscribePrivateBroadcast, getUserId = userIdFromToken, timers = globalThis, win = globalThis.window, doc = globalThis.document } = {}) {
  const userId = getUserId();
  if (!userId) return () => {};
  const schedule = createDuoRefreshScheduler(refresh, { timers });
  const unsubscribe = subscribe({ topic: `${DUO_TOPIC_PREFIX}${userId}`, event: DUO_EVENT, onMessage: () => schedule() });
  const onVisible = () => { if (doc?.visibilityState !== "hidden") schedule(); };
  doc?.addEventListener?.("visibilitychange", onVisible);
  win?.addEventListener?.("online", onVisible);
  return () => {
    schedule.cancel();
    unsubscribe();
    doc?.removeEventListener?.("visibilitychange", onVisible);
    win?.removeEventListener?.("online", onVisible);
  };
}
