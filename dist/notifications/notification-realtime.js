// Wakes the notification centre: the private, data-free Realtime signal notifications_changed on notifications:user:<auth uid> (authorized by the realtime.messages
// policy "gamid_notification_broadcasts"), through GamID's existing private-broadcast client. Bursts (e.g. "Mark all as read" in another tab) collapse into one re-read;
// the page also re-reads once when it becomes visible again or the network returns, because broadcasts sent while disconnected are not replayed. No polling.
import { subscribePrivateBroadcast } from "../account/realtime-client.js";
import { userIdFromToken } from "../account/supabase-client.js";

export const NOTIFICATIONS_TOPIC_PREFIX = "notifications:user:";
export const NOTIFICATIONS_EVENT = "notifications_changed";

export function notificationSubscriber({ subscribe = subscribePrivateBroadcast, getUserId = userIdFromToken, timers = globalThis, delay = 120, win = globalThis.window, doc = globalThis.document, onUsageChange = null } = {}) {
  return onChange => {
    const userId = getUserId();
    if (!userId) return () => {};
    let timer = null, notify=false, usage=false;
    const schedule = (n=true,u=false) => { notify ||= n;usage ||= u; if (timer !== null) timers.clearTimeout(timer); timer = timers.setTimeout(() => { timer = null; const readNotifications=notify,readUsage=usage;notify=usage=false;if(readNotifications)onChange();if(readUsage)onUsageChange?.(); }, delay); };
    const stop = subscribe({ topic: `${NOTIFICATIONS_TOPIC_PREFIX}${userId}`, event: onUsageChange?[NOTIFICATIONS_EVENT,'usage_changed']:NOTIFICATIONS_EVENT, onMessage: (_payload,event) => schedule(event!=='usage_changed',event==='usage_changed') });
    const onVisible = () => { if (doc?.visibilityState !== "hidden") schedule(true,!!onUsageChange); };
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
