// GamID Notifications - the reusable bell, Notification Log panel and live toast (20261002210000_gamid_notifications.sql). Producers are server-side; this module only
// reads the signed-in person's own log through the owner RPCs.
//
//   LIVE TOAST   a notification that ARRIVES while the page is open and visible is shown at once for TOAST_MS (5 s), counted from when it is displayed. Showing a
//                toast never marks it read. Notifications that were already there when the page loaded (e.g. from while the person was offline) are NEVER replayed as
//                toasts: they are counted on the bell and listed in the log.
//   BELL         🔔 with the server's UNREAD count (read = the person explicitly read it in the log: opened it, "Mark as read", or "Mark all as read").
//   LOG          newest first, read and unread, ~5 rows visible with its own scroll, "Show older" pages back. Opening the panel marks nothing read.
//   ACTIONS      a row (or the toast) opens its TYPED internal destination through the page's own handler (never a URL) and marks that one read.
// Delivery: the private, data-free Realtime signal notifications_changed (the page passes `subscribe`) wakes the bell; the database stays the source of truth. The
// page-load fetch and Realtime fetches are serialised and de-duplicated by id, so a race can neither toast twice nor list twice.
import { notificationText, destinationOf } from "./notification-types.js";

export const TOAST_MS = 5000;
export const PAGE_SIZE = 30;
export const VISIBLE_ROWS = 5;

export function formatWhen(iso, now = Date.now()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { short: "", full: "" };
  const seconds = Math.max(0, Math.round((now - at.getTime()) / 1000));
  const full = at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  if (seconds < 60) return { short: "just now", full };
  if (seconds < 3600) return { short: `${Math.floor(seconds / 60)} min ago`, full };
  if (seconds < 86400) return { short: `${Math.floor(seconds / 3600)} h ago`, full };
  if (seconds < 172800) return { short: "Yesterday", full };
  const sameYear = at.getFullYear() === new Date(now).getFullYear();
  return { short: at.toLocaleDateString(undefined, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }), full };
}

export function createNotificationCenter({ api, doc = globalThis.document, timers = globalThis, now = () => Date.now(), isVisible = () => globalThis.document?.visibilityState !== "hidden", onNavigate = () => {}, subscribe = null }) {
  const make = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const items = new Map();           // id -> row (everything this page has listed)
  let unread = 0;
  let baseline = null;               // highest id known when the page loaded: anything above it that arrives later is "live"
  let hasOlder = false;
  let open = false;
  let chain = Promise.resolve();     // serialises load / refresh so they never race
  const toastQueue = [];
  let toasting = null, toastTimer = null, stopped = false, unsubscribe = null;

  // ---- DOM ----
  const root = make("div", "gn");
  const bell = make("button", "gn-bell");
  bell.type = "button";
  bell.setAttribute("aria-haspopup", "dialog");
  bell.setAttribute("aria-expanded", "false");
  const bellIcon = make("span", "gn-bell-icon", "🔔");
  bellIcon.setAttribute("aria-hidden", "true");
  const badge = make("span", "gn-badge");
  badge.setAttribute("aria-hidden", "true");
  bell.append(bellIcon, badge);
  const panel = make("section", "gn-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Notifications");
  panel.hidden = true;
  const head = make("div", "gn-panel-head");
  const title = make("strong", "gn-title", "Notifications");
  const markAll = make("button", "gn-mark-all", "Mark all as read");
  markAll.type = "button";
  head.append(title, markAll);
  const list = make("ul", "gn-list");
  list.style?.setProperty?.("--gn-visible-rows", String(VISIBLE_ROWS));
  const empty = make("p", "gn-empty", "No notifications yet.");
  const older = make("button", "gn-older", "Show older");
  older.type = "button";
  panel.append(head, list, empty, older);
  root.append(bell, panel);
  const toast = make("button", "gn-toast");
  toast.type = "button";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;

  function renderBadge() {
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = unread <= 0;
    bell.classList?.toggle?.("has-unread", unread > 0);
    bell.setAttribute("aria-label", unread > 0 ? `Notifications, ${unread} unread` : "Notifications, none unread");
  }

  function row(item) {
    const isUnread = !item.read_at;
    const li = make("li", `gn-item${isUnread ? " is-unread" : " is-read"}`);
    li.dataset.id = String(item.notification_id);
    const openButton = make("button", "gn-open");
    openButton.type = "button";
    const when = formatWhen(item.created_at, now());
    const dot = make("span", "gn-dot");
    dot.setAttribute("aria-hidden", "true");
    const copy = make("span", "gn-copy");
    copy.append(make("span", "gn-text", notificationText(item)));
    const time = make("time", "gn-time", when.short);
    time.setAttribute("datetime", item.created_at ?? "");
    time.setAttribute("title", when.full);
    copy.append(time);
    openButton.append(dot, copy);
    openButton.setAttribute("aria-label", `${isUnread ? "Unread. " : ""}${notificationText(item)} ${when.short}`);
    openButton.addEventListener("click", () => activate(item));
    li.append(openButton);
    if (isUnread) {
      const read = make("button", "gn-read", "Mark read");
      read.type = "button";
      read.setAttribute("aria-label", `Mark as read: ${notificationText(item)}`);
      read.addEventListener("click", event => { event?.stopPropagation?.(); markRead([item.notification_id]); });
      li.append(read);
    }
    return li;
  }

  function renderList() {
    const rows = [...items.values()].sort((a, b) => Number(b.notification_id) - Number(a.notification_id));
    list.replaceChildren(...rows.map(row));
    empty.hidden = rows.length > 0;
    older.hidden = !hasOlder;
    markAll.disabled = unread <= 0;
  }
  const render = () => { renderBadge(); renderList(); };

  // ---- data ----
  const highest = rows => rows.reduce((max, item) => Math.max(max, Number(item.notification_id) || 0), 0);
  const merge = rows => { for (const item of rows) items.set(String(item.notification_id), { ...items.get(String(item.notification_id)), ...item }); };
  async function count() { try { unread = Math.max(0, Number(await api.getMyUnreadNotificationCount()) || 0); } catch { /* keep the last known count */ } }

  function load() {
    chain = chain.then(async () => {
      if (stopped) return;
      let rows = [];
      try { rows = (await api.getMyNotifications(null, PAGE_SIZE)) || []; } catch { rows = []; }
      merge(rows);
      hasOlder = rows.length >= PAGE_SIZE;
      baseline = Math.max(baseline ?? 0, highest(rows));   // everything known now is backlog: listed and counted, never toasted
      await count();
      render();
    });
    return chain;
  }

  // a Realtime signal, or the tab coming back: re-read the newest page and the count; what is NEW since load may be toasted (only while visible)
  function refresh() {
    chain = chain.then(async () => {
      if (stopped || baseline === null) return;
      let rows;
      try { rows = (await api.getMyNotifications(null, PAGE_SIZE)) || []; } catch { return; }
      const fresh = rows.filter(item => Number(item.notification_id) > baseline && !items.has(String(item.notification_id)));
      merge(rows);
      baseline = Math.max(baseline, highest(rows));
      await count();
      render();
      if (isVisible()) for (const item of fresh.sort((a, b) => Number(a.notification_id) - Number(b.notification_id))) if (!item.read_at) toastQueue.push(item);
      pumpToast();
    });
    return chain;
  }

  async function loadOlder() {
    const oldest = Math.min(...[...items.values()].map(item => Number(item.notification_id)));
    if (!Number.isFinite(oldest)) return;
    let rows = [];
    try { rows = (await api.getMyNotifications(oldest, PAGE_SIZE)) || []; } catch { return; }
    merge(rows);
    hasOlder = rows.length >= PAGE_SIZE;
    renderList();
  }

  async function markRead(ids) {
    const targets = ids.filter(id => items.get(String(id)) && !items.get(String(id)).read_at);
    if (!targets.length) return;
    const stamp = new Date(now()).toISOString();
    for (const id of targets) items.set(String(id), { ...items.get(String(id)), read_at: stamp });
    unread = Math.max(0, unread - targets.length);
    render();
    try { await api.markMyNotificationsRead(targets.map(Number)); } catch { /* the server count below corrects the badge */ }
    await count();
    renderBadge();
  }

  async function markAllRead() {
    const upTo = highest([...items.values()]);
    if (!upTo) return;
    const stamp = new Date(now()).toISOString();
    for (const [key, item] of items) if (!item.read_at && Number(item.notification_id) <= upTo) items.set(key, { ...item, read_at: stamp });
    unread = 0;
    render();
    try { await api.markAllMyNotificationsRead(upTo); } catch { /* corrected below */ }
    await count();
    renderBadge();
  }

  function activate(item) {
    if (!item.read_at) markRead([item.notification_id]);
    const destination = destinationOf(item);
    setOpen(false);
    if (destination) onNavigate(destination, item);
  }

  // ---- toast ----
  function pumpToast() {
    if (stopped || toasting || !toastQueue.length || !isVisible()) return;
    toasting = toastQueue.shift();
    toast.textContent = notificationText(toasting);
    toast.setAttribute("aria-label", `${notificationText(toasting)} Open`);
    toast.hidden = false;
    toastTimer = timers.setTimeout(() => { toastTimer = null; toasting = null; toast.hidden = true; pumpToast(); }, TOAST_MS);
  }
  toast.addEventListener("click", () => {
    const item = toasting && items.get(String(toasting.notification_id));
    if (toastTimer !== null) timers.clearTimeout(toastTimer);
    toastTimer = null; toasting = null; toast.hidden = true;
    if (item) activate(item);
    pumpToast();
  });

  // ---- panel ----
  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    bell.setAttribute("aria-expanded", String(open));
    if (open) renderList();   // opening shows the log - it marks nothing read
  }
  bell.addEventListener("click", () => setOpen(!open));
  markAll.addEventListener("click", () => markAllRead());
  older.addEventListener("click", () => loadOlder());
  const onKey = event => { if (open && event?.key === "Escape") { setOpen(false); bell.focus?.(); } };
  const onOutside = event => { if (open && root.contains && !root.contains(event?.target)) setOpen(false); };
  doc.addEventListener?.("keydown", onKey);
  doc.addEventListener?.("click", onOutside, true);

  return {
    root, toast,
    mount(host, toastHost = doc.body) { host.append(root); toastHost?.append?.(toast); render(); return load().then(() => { if (subscribe) unsubscribe = subscribe(() => refresh()); }); },
    load, refresh, markRead, markAllRead, setOpen,
    get unread() { return unread; },
    get items() { return [...items.values()].sort((a, b) => Number(b.notification_id) - Number(a.notification_id)); },
    get open() { return open; },
    destroy() {
      stopped = true;
      if (toastTimer !== null) timers.clearTimeout(toastTimer);
      unsubscribe?.();
      doc.removeEventListener?.("keydown", onKey);
      doc.removeEventListener?.("click", onOutside, true);
      root.remove?.(); toast.remove?.();
    },
  };
}
