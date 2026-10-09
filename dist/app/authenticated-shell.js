import * as api from "../account/supabase-client.js";
import { createNotificationCenter } from "../notifications/notification-center.js";
import { notificationSubscriber } from "../notifications/notification-realtime.js";
import { DESTINATIONS } from "../notifications/notification-types.js";
import { createUsageCenter } from "../usage/usage-center.js";

export function shellEligible(doc, win) {
  return win?.parent === win && doc?.documentElement?.dataset?.gamidSurface !== "public";
}

// One owner center per document, including sign-in, sign-out and bfcache restores.
// There is no shell unread store: the existing owner RPCs remain the authority.
export function createAuthenticatedShell({ doc = document, win = window, client = api, createCenter = createNotificationCenter, createUsage = createUsageCenter, subscribe = null, navigate = url => win.location.assign(url) } = {}) {
  let center = null, usage = null, owner = null, host = null, stopped = false, chain = Promise.resolve();
  const notifySubscribe = subscribe || notificationSubscriber({onUsageChange:()=>usage?.refresh()});
  const clear = () => { usage?.destroy(); usage=null; center?.destroy(); center = null; owner = null; host?.remove(); host = null; };
  function destination(key) {
    const target = Object.hasOwn(DESTINATIONS, key) && DESTINATIONS[key];
    if (!target) return;
    // Page owners may handle a typed destination in place (Account focuses its
    // existing section). No notification UI or data logic belongs to the page.
    const event = new win.CustomEvent("gamid:notification-navigate", { detail: { destination: key }, cancelable: true });
    if (!win.dispatchEvent(event)) return;
    navigate(new URL(`../${target.page}/#${target.anchor}`, import.meta.url).href);
  }
  async function reconcile() {
    if (stopped || !shellEligible(doc, win)) return;
    let session;
    try { session = await client.restoreSession(); } catch { return; }
    const uid = session?.access_token ? client.userIdFromToken() : null;
    if (stopped) return;
    if (!uid) { clear(); return; }
    if (owner === uid && center) return;
    clear();
    const header = doc.querySelector("header");
    if (!header) throw new Error("An authenticated GamID surface requires a header");
    host = doc.createElement("span"); host.id = "notificationsHost"; host.className = "gamid-global-notifications";
    const slot = header.querySelector(".site-head-end") || header;
    slot.append(host);
    owner = uid;
    usage = createUsage({api:client,doc,onOpen:()=>center?.setOpen?.(false)});
    center = createCenter({ api: client, doc, subscribe:notifySubscribe, onNavigate: destination });
    const mounted = center;
    // Both controls mount immediately. Usage availability never delays the bell.
    await Promise.all([usage.mount(host), mounted.mount(host, doc.body)]);
    // An auth event can destroy a center while its initial read is in flight.
    if (stopped || client.userIdFromToken() !== uid) { if (center === mounted) clear(); else mounted.destroy(); }
  }
  function sync() {
    if (owner && owner !== client.userIdFromToken()) clear();
    const next = chain.then(reconcile);
    chain = next.catch(() => {});
    return next;
  }
  const onAuth = () => { sync().catch(error => console.error("GamID shell", error)); };
  const onStorage = event => { if (event.key === "gamid.testing.auth.session.v1" || event.key === null) onAuth(); };
  const onHide = () => { stopped = true; clear(); };
  const onShow = () => { stopped = false; onAuth(); };
  win.addEventListener(api.AUTH_SESSION_EVENT, onAuth);
  win.addEventListener("storage", onStorage);
  win.addEventListener("pagehide", onHide);
  win.addEventListener("pageshow", onShow);
  return {
    sync,
    get center() { return center; },
    get usage() {return usage;},
    destroy() {
      stopped = true; clear();
      win.removeEventListener(api.AUTH_SESSION_EVENT, onAuth);
      win.removeEventListener("storage", onStorage);
      win.removeEventListener("pagehide", onHide);
      win.removeEventListener("pageshow", onShow);
    },
  };
}

let shell = null;
export async function bootAuthenticatedShell() {
  if (!shellEligible(document, window)) return null;
  if (!shell) {
    for (const path of ["../notifications/notifications.css", "../usage/usage.css", "./authenticated-shell.css"]) {
      const link = document.createElement("link"); link.rel = "stylesheet"; link.href = new URL(path, import.meta.url).href; document.head.append(link);
    }
    shell = createAuthenticatedShell();
  }
  await shell.sync();
  return shell;
}

// Opens the existing global Usage panel for a page (an upload refused for storage or a Wall limit, Product Memory ISS-0001); false when no Usage is mounted.
export function openUsagePanel() {
  const usage = shell?.usage;
  if (!usage) return false;
  usage.setOpen(true);
  usage.button?.focus?.();
  return true;
}
