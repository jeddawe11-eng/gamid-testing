// Wakes the notification centre: the private, data-free Realtime signal notifications_changed on notifications:user:<auth uid> (authorized by the realtime.messages
// policy "gamid_notification_broadcasts"), through GamID's existing private-broadcast client. Bursts (e.g. "Mark all as read" in another tab) collapse into one re-read;
// the page also re-reads once when it becomes visible again or the network returns, because broadcasts sent while disconnected are not replayed. No polling.
import { subscribePrivateBroadcast } from "../account/realtime-client.js";
import { userIdFromToken } from "../account/supabase-client.js";

export const NOTIFICATIONS_TOPIC_PREFIX = "notifications:user:";
export const NOTIFICATIONS_EVENT = "notifications_changed";

export function notificationSubscriber({ subscribe = subscribePrivateBroadcast, getUserId = userIdFromToken, timers = globalThis, delay = 120, win = globalThis.window, doc = globalThis.document } = {}) {
  return onChange => {
    const userId = getUserId();
    if (!userId) return () => {};
    let timer = null;
    const schedule = () => { if (timer !== null) timers.clearTimeout(timer); timer = timers.setTimeout(() => { timer = null; onChange(); }, delay); };
    const stop = subscribe({ topic: `${NOTIFICATIONS_TOPIC_PREFIX}${userId}`, event: NOTIFICATIONS_EVENT, onMessage: () => schedule() });
    const onVisible = () => { if (doc?.visibilityState !== "hidden") schedule(); };
    doc?.addEventListener?.("visibilitychange", onVisible);
    win?.addEventListener?.("online", onVisible);
    return () => {
      if (timer !== null) timers.clearTimeout(timer);
      stop();
      doc?.removeEventListener?.("visibilitychange", onVisible);
      win?.removeEventListener?.("online", onVisible);
    };
  };
}
