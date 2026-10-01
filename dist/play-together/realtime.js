import { subscribePrivateBroadcast } from "../account/realtime-client.js";
import { userIdFromToken } from "../account/supabase-client.js";

export function createRealtimeRefreshScheduler(refresh, { delay = 75, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null, running = false, pending = false;
  const run = async () => {
    timer = null;
    if (running) { pending = true; return; }
    running = true;
    try { await refresh(); } catch {
      // A transient refresh failure must not become an unhandled background error.
      // The next database invalidation will retry through the normal authorized RPC.
    } finally {
      running = false;
      if (pending) { pending = false; schedule(); }
    }
  };
  const schedule = () => {
    if (running) { pending = true; return; }
    if (timer) clearTimer(timer);
    timer = setTimer(run, delay);
  };
  schedule.cancel = () => { if (timer) clearTimer(timer); timer = null; pending = false; };
  return schedule;
}

export function subscribePlayTogetherRealtime({ refresh, subscribe = subscribePrivateBroadcast, getUserId = userIdFromToken }) {
  const userId = getUserId();
  if (!userId) return () => {};
  const scheduleRefresh = createRealtimeRefreshScheduler(refresh);
  const unsubscribe = subscribe({ topic: `play-together:user:${userId}`, event: "state_changed", onMessage: scheduleRefresh });
  return () => { scheduleRefresh.cancel(); unsubscribe(); };
}
