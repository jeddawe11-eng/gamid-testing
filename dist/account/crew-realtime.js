// My Crew live state: the open Account page follows Crew changes made elsewhere (an invitation, an acceptance, a removal, someone leaving, a deleted Crew) without a
// manual refresh. Same mechanism as My Duo (duo-realtime.js): the existing PRIVATE topic identity:user:<auth uid> (policy identity_relationship_broadcasts), here with
// the event crew_changed (20261003100000_my_crew.sql). The signal carries no data; the page re-reads its Crews through get_my_crews / get_crew_members. Bursts collapse
// into one re-read, and the page re-reads once when it becomes visible again (broadcasts sent while disconnected are not replayed). No polling.
import { subscribePrivateBroadcast } from "./realtime-client.js";
import { userIdFromToken } from "./supabase-client.js";
import { createDuoRefreshScheduler, DUO_TOPIC_PREFIX } from "./duo-realtime.js";

export const CREW_EVENT = "crew_changed";

export function subscribeCrewRealtime({ refresh, subscribe = subscribePrivateBroadcast, getUserId = userIdFromToken, timers = globalThis, win = globalThis.window, doc = globalThis.document } = {}) {
  const userId = getUserId();
  if (!userId) return () => {};
  const schedule = createDuoRefreshScheduler(refresh, { timers });
  const unsubscribe = subscribe({ topic: `${DUO_TOPIC_PREFIX}${userId}`, event: CREW_EVENT, onMessage: () => schedule() });
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
