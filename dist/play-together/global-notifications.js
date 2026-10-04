import * as api from "../account/supabase-client.js";
import { createNotificationCenter } from "../notifications/notification-center.js";
import { notificationSubscriber } from "../notifications/notification-realtime.js";
import { DESTINATIONS } from "../notifications/notification-types.js";

// Page adapter only: the component, owner log, read operations and subscription
// are exactly the ones Account uses. Typed destinations belong to Account.
export async function mountGlobalNotifications({ doc = document, win = window, client = api, createCenter = createNotificationCenter, subscribe = notificationSubscriber(), navigate = url => location.assign(url) } = {}) {
  const host = doc.getElementById("notificationsHost");
  if (!host) return null;
  const center = createCenter({ api: client, doc, subscribe, onNavigate: destination => {
    const target = Object.hasOwn(DESTINATIONS, destination) && DESTINATIONS[destination];
    if (target?.page === "account") navigate(`../account/#${target.anchor}`);
  } });
  await center.mount(host, doc.body);
  win.addEventListener("pagehide", () => center.destroy(), { once: true });
  return center;
}
