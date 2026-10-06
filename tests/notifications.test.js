// GamID Notifications foundation (My Duo is the first producer). The database side - forgery, privacy, read model, retention, My Duo events - is exercised on TESTING
// by tests/integration/notifications-db.sql; these tests pin the browser side: live toast vs log, unread badge, read semantics, ordering, paging, race safety,
// typed destinations, and layout rules.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createNotificationCenter, formatWhen, TOAST_MS, VISIBLE_ROWS, PAGE_SIZE } from "../dist/notifications/notification-center.js";
import { notificationText, destinationOf, NOTIFICATION_TEXT, DESTINATIONS } from "../dist/notifications/notification-types.js";
import { notificationSubscriber, NOTIFICATIONS_TOPIC_PREFIX, NOTIFICATIONS_EVENT } from "../dist/notifications/notification-realtime.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---------- a small fake DOM ----------
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.style = { setProperty: (name, value) => { this.attrs[`style:${name}`] = value; } }; this.classList = { toggle: (name, on) => { const set = new Set(this.className.split(" ").filter(Boolean)); if (on) set.add(name); else set.delete(name); this.className = [...set].join(" "); } }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  append(...nodes) { for (const node of nodes) if (node) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  removeEventListener() {}
  contains(node) { for (let at = node; at; at = at.parent) if (at === this) return true; return false; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  focus() {}
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  async fire(type, event = {}) { for (const handler of this.listeners[type] || []) await handler({ target: this, preventDefault() {}, stopPropagation() {}, ...event }); }
}
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const byClass = (root, cls) => all(root, node => typeof node.className === "string" && node.className.split(" ").includes(cls));
const tick = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
function fakeTimers() {
  let next = 1; const pending = new Map();
  return { setTimeout(fn, ms) { const id = next++; pending.set(id, { fn, ms }); return id; }, clearTimeout(id) { pending.delete(id); }, get delays() { return [...pending.values()].map(entry => entry.ms); }, runAll() { const due = [...pending.values()]; pending.clear(); due.forEach(entry => entry.fn()); } };
}

// ---------- a fake owner log (what the owner RPCs return for ONE signed-in person) ----------
const NOW = Date.parse("2026-10-02T18:00:00Z");
const note = (id, type_key, actor = "zshot", extra = {}) => ({ notification_id: id, type_key, producer: "my_duo", destination: "account.my_duo", actor_handle: actor, actor_display_name: actor, created_at: new Date(NOW - (100 - id) * 60_000).toISOString(), read_at: null, ...extra });
function fakeServer(initial = []) {
  const rows = initial.map(row => ({ ...row }));
  const calls = { read: [], all: [], list: 0 };
  return {
    rows, calls,
    add(row) { rows.push({ ...row }); },
    api: {
      getMyNotifications: async (before = null, limit = 30) => { calls.list++; return rows.filter(row => before === null || row.notification_id < before).sort((a, b) => b.notification_id - a.notification_id).slice(0, limit).map(row => ({ ...row })); },
      getMyUnreadNotificationCount: async () => rows.filter(row => !row.read_at).length,
      markMyNotificationsRead: async ids => { calls.read.push(ids); let n = 0; for (const row of rows) if (ids.includes(row.notification_id) && !row.read_at) { row.read_at = new Date(NOW).toISOString(); n++; } return n; },
      markAllMyNotificationsRead: async upTo => { calls.all.push(upTo); let n = 0; for (const row of rows) if (row.notification_id <= upTo && !row.read_at) { row.read_at = new Date(NOW).toISOString(); n++; } return n; },
    },
  };
}
async function page(server, { visible = true, onNavigate = () => {} } = {}) {
  const timers = fakeTimers();
  const doc = { createElement: tag => new El(tag), addEventListener() {}, removeEventListener() {}, body: new El("body") };
  const state = { visible };
  let signal = null;
  const center = createNotificationCenter({ api: server.api, doc, timers, now: () => NOW, isVisible: () => state.visible, onNavigate, subscribe: onChange => { signal = onChange; return () => {}; } });
  const host = new El("span");
  await center.mount(host, doc.body);
  const bell = byClass(center.root, "gn-bell")[0];
  const badge = byClass(center.root, "gn-badge")[0];
  const panel = byClass(center.root, "gn-panel")[0];
  const rows = () => byClass(center.root, "gn-item");
  return { center, timers, state, bell, badge, panel, rows, toast: center.toast, signal: async () => { await signal(); await tick(); } };
}

test("destroying a global center during its initial read cannot later open an orphan Realtime subscription", async () => {
  const server = fakeServer(); let release, subscribed = 0;
  const api = { ...server.api, getMyNotifications: () => new Promise(resolve => { release = resolve; }) };
  const doc = { createElement: tag => new El(tag), addEventListener() {}, removeEventListener() {}, body: new El("body") };
  const center = createNotificationCenter({ api, doc, subscribe: () => { subscribed++; return () => {}; } });
  const mounted = center.mount(new El("span"), doc.body); await Promise.resolve();
  center.destroy(); release([]); await mounted;
  assert.equal(subscribed, 0); assert.equal(doc.body.children.length, 0);
});

test("Account and Play Together centers share owner unread/read state across live tabs and navigation", async () => {
  const server = fakeServer([note(1, "duo.request_received"), note(2, "crew.invite_received")]);
  const account = await page(server), playTogether = await page(server);
  assert.equal(account.center.unread, 2); assert.equal(playTogether.center.unread, 2);
  await playTogether.center.markRead([1]); await account.signal();
  assert.equal(account.center.unread, 1); assert.equal(account.center.items.find(n => n.notification_id === 1).read_at !== null, true);
  server.add(note(3, "crew.invite_accepted")); await account.signal(); await playTogether.signal();
  assert.equal(account.center.unread, 2); assert.equal(playTogether.center.unread, 2);
  await account.center.markAllRead(); await playTogether.signal(); assert.equal(playTogether.center.unread, 0);
  account.center.destroy(); playTogether.center.destroy();
  const returningAccount = await page(server);
  assert.equal(returningAccount.center.unread, 0); assert.equal(returningAccount.toast.hidden, true);
  assert.ok(returningAccount.center.items.every(n => n.read_at));
});

// ---------- 1 + 2: live toast vs offline backlog ----------
test("1. online: a NEW notification shows a 5 s live toast; after it hides the notification is still UNREAD in the log and the badge stays", async () => {
  const server = fakeServer();
  const a = await page(server);
  assert.equal(a.badge.hidden, true, "nothing unread");
  server.add(note(1, "duo.ended", "black"));             // @black ends the Duo while @zshot is online
  await a.signal();
  assert.equal(a.toast.hidden, false);
  assert.equal(a.toast.textContent, "@black ended your Duo.");
  assert.deepEqual(a.timers.delays, [TOAST_MS], "5 s, counted from display");
  assert.equal(TOAST_MS, 5000);
  assert.equal(a.badge.textContent, "1");
  a.timers.runAll();
  assert.equal(a.toast.hidden, true, "the toast hides");
  assert.equal(a.center.unread, 1, "showing a toast never marks it read");
  assert.equal(a.badge.hidden, false);
  assert.equal(a.bell.getAttribute("aria-label"), "Notifications, 1 unread");
  assert.match(a.rows()[0].className, /is-unread/);
  assert.deepEqual(server.calls.read, []);
});

test("2. offline: notifications from while the person was away are NOT replayed as toasts - the badge shows them and the log lists them", async () => {
  const server = fakeServer([note(1, "duo.request_received", "black"), note(2, "duo.request_cancelled", "black"), note(3, "duo.ended", "black")]);
  const a = await page(server);
  assert.equal(a.toast.hidden, true, "no old toast replay");
  assert.deepEqual(a.timers.delays, []);
  assert.equal(a.badge.textContent, "3");
  assert.equal(a.rows().length, 3);
  await a.signal();                                      // a later signal (e.g. a read in another tab) does not toast the backlog either
  assert.equal(a.toast.hidden, true);
});

test("a notification arriving while the tab is hidden is counted and listed, never toasted later", async () => {
  const server = fakeServer();
  const a = await page(server, { visible: false });
  server.add(note(1, "duo.request_received", "black"));
  await a.signal();
  assert.equal(a.toast.hidden, true);
  assert.equal(a.badge.textContent, "1");
  a.state.visible = true;
  await a.signal();
  assert.equal(a.toast.hidden, true);
});

// ---------- 3-6: read semantics ----------
test("3. opening the Notifications panel shows the log and marks NOTHING read", async () => {
  const server = fakeServer([note(1, "duo.request_received"), note(2, "duo.ended")]);
  const a = await page(server);
  await a.bell.fire("click");
  assert.equal(a.panel.hidden, false);
  assert.equal(a.bell.getAttribute("aria-expanded"), "true");
  assert.equal(a.center.unread, 2);
  assert.deepEqual(server.calls.read, []);
  assert.deepEqual(server.calls.all, []);
  await a.bell.fire("click");
  assert.equal(a.panel.hidden, true);
  assert.equal(a.center.unread, 2);
});

test("4. reading ONE notification (Mark read) lowers the unread count by exactly one; it stays listed, shown as read", async () => {
  const server = fakeServer([note(1, "duo.request_received"), note(2, "duo.ended")]);
  const a = await page(server);
  await a.bell.fire("click");
  const [newest] = a.rows();
  await byClass(newest, "gn-read")[0].fire("click"); await tick();
  assert.deepEqual(server.calls.read, [[2]]);
  assert.equal(a.center.unread, 1);
  assert.equal(a.badge.textContent, "1");
  assert.equal(a.rows().length, 2, "still in the log");
  assert.match(a.rows()[0].className, /is-read/);
  assert.equal(byClass(a.rows()[0], "gn-read").length, 0, "no Mark read on a read row");
});

test("5 + 6. Mark all as read sets unread to zero (up to what this page loaded); every notification remains in the history", async () => {
  const server = fakeServer([note(1, "duo.request_received"), note(2, "duo.request_cancelled"), note(3, "duo.ended")]);
  const a = await page(server);
  await a.bell.fire("click");
  await byClass(a.center.root, "gn-mark-all")[0].fire("click"); await tick();
  assert.deepEqual(server.calls.all, [3], "up to the newest id the page has loaded - a notification arriving a moment later stays unread");
  assert.equal(a.center.unread, 0);
  assert.equal(a.badge.hidden, true);
  assert.equal(a.rows().length, 3);
  assert.ok(a.rows().every(row => /is-read/.test(row.className)));
  assert.equal(byClass(a.center.root, "gn-mark-all")[0].disabled, true);
});

// ---------- 7 + 8: ordering, five rows, paging ----------
test("8. the log is newest first", async () => {
  const server = fakeServer([note(2, "duo.request_cancelled", "two"), note(5, "duo.ended", "five"), note(1, "duo.request_received", "one")]);
  const a = await page(server);
  assert.deepEqual(a.rows().map(row => row.dataset.id), ["5", "2", "1"]);
});

test("7. about five rows are visible at once, the list scrolls inside the panel, and older pages load on demand", async () => {
  assert.equal(VISIBLE_ROWS, 5);
  const css = read("dist/notifications/notifications.css");
  assert.match(css, /\.gn-list\{[^}]*max-height:calc\(var\(--gn-visible-rows,5\) \* var\(--gn-row-h\)\)[^}]*overflow-y:auto/, "five rows tall, then its own scroll");
  assert.match(css, /\.gn-item\{[^}]*height:var\(--gn-row-h\)/, "every row the same height: exactly five fit");
  assert.match(css, /\.gn-text\{[^}]*-webkit-line-clamp:2/, "rows keep a steady height");
  const many = Array.from({ length: PAGE_SIZE + 7 }, (_, i) => note(i + 1, "duo.request_received", `p${String(i + 1).padStart(3, "0")}`));
  const server = fakeServer(many);
  const a = await page(server);
  assert.equal(a.rows().length, PAGE_SIZE);
  const older = byClass(a.center.root, "gn-older")[0];
  assert.equal(older.hidden, false);
  await older.fire("click"); await tick();
  assert.equal(a.rows().length, PAGE_SIZE + 7);
  assert.deepEqual(a.rows().slice(-2).map(row => row.dataset.id), ["2", "1"], "still newest first");
  assert.equal(older.hidden, true);
});

// ---------- 9: race ----------
test("9. a Realtime signal racing the page-load fetch never duplicates a row or a toast", async () => {
  const server = fakeServer([note(1, "duo.request_received")]);
  const timers = fakeTimers();
  const doc = { createElement: tag => new El(tag), addEventListener() {}, removeEventListener() {}, body: new El("body") };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const slow = { ...server.api, getMyNotifications: async (...args) => { await gate; return server.api.getMyNotifications(...args); } };
  let signal;
  const center = createNotificationCenter({ api: slow, doc, timers, now: () => NOW, isVisible: () => true, subscribe: onChange => { signal = onChange; return () => {}; } });
  const mounted = center.mount(new El("span"), doc.body);
  const early = center.refresh();                         // a signal while the first load is still in flight
  server.add(note(2, "duo.request_accepted"));           // ... and a new event lands at the same moment
  release(); await mounted; await early; await tick();
  assert.deepEqual(center.items.map(item => item.notification_id), [2, 1], "each id once");
  await signal(); await signal(); await tick();
  assert.deepEqual(center.items.map(item => item.notification_id), [2, 1]);
  assert.ok(timers.delays.length <= 1, "at most one toast was ever started");
});

test("a second NEW notification while a toast is showing waits its turn; each new one toasts once", async () => {
  const server = fakeServer();
  const a = await page(server);
  server.add(note(1, "duo.request_received", "black"));
  server.add(note(2, "duo.request_cancelled", "black"));
  await a.signal();
  assert.equal(a.toast.textContent, "@black sent you a Duo request.");
  await a.signal();
  a.timers.runAll(); await tick();
  assert.equal(a.toast.textContent, "@black cancelled their Duo request.");
  a.timers.runAll(); await tick();
  assert.equal(a.toast.hidden, true);
  await a.signal();
  assert.equal(a.toast.hidden, true, "never repeated");
  assert.equal(a.center.unread, 2);
});

// ---------- 12: typed destinations ----------
test("12. clicking a My Duo notification opens/focuses My Duo through the page's own handler and marks that one read; a non-registered destination does nothing", async () => {
  const opened = [];
  const server = fakeServer([note(1, "duo.request_received", "black"), note(2, "duo.ended", "black", { destination: "https://evil.example/" }), note(3, "duo.request_accepted", "black")]);
  const a = await page(server, { onNavigate: (destination, item) => opened.push([destination, item.notification_id]) });
  await a.bell.fire("click");
  const byId = id => a.rows().find(row => row.dataset.id === String(id));
  await byClass(byId(3), "gn-open")[0].fire("click"); await tick();
  assert.deepEqual(opened, [["account.my_duo", 3]]);
  assert.deepEqual(server.calls.read, [[3]]);
  assert.equal(a.panel.hidden, true, "the panel closes to show the destination");
  await a.bell.fire("click");
  await byClass(byId(2), "gn-open")[0].fire("click"); await tick();
  assert.deepEqual(opened, [["account.my_duo", 3]], "a URL is never a destination");
  assert.equal(destinationOf({ destination: "account.my_duo" }), "account.my_duo");
  assert.equal(destinationOf({ destination: "javascript:alert(1)" }), null);
  assert.deepEqual(Object.keys(DESTINATIONS), ["account.my_duo", "account.my_crew", "play_together.requests", "play_together.session"]);   // + My Crew (20261003100000_my_crew), + Play Together (20261006090000)
  const account = read("dist/account/account.js");
  assert.match(account, /function openNotificationDestination\(destination\) \{\n  const sectionId = \{ "account\.my_duo": "duoSection", "account\.my_crew": "crewSection" \}\[destination\];\n  if \(!sectionId\) return;/);
  assert.match(account, /if \(location\.hash === "#my-duo"\) openNotificationDestination\("account\.my_duo"\);/);
});

test("the live toast itself opens its destination (and marks it read); waiting for it to hide does not", async () => {
  const opened = [];
  const server = fakeServer();
  const a = await page(server, { onNavigate: destination => opened.push(destination) });
  server.add(note(1, "duo.request_received", "black"));
  await a.signal();
  await a.toast.fire("click"); await tick();
  assert.deepEqual(opened, ["account.my_duo"]);
  assert.deepEqual(server.calls.read, [[1]]);
  assert.equal(a.toast.hidden, true);
});

// ---------- wording / time ----------
test("wording comes from the authoritative type (never guessed); unsafe handles are never printed; times are relative with the exact time on hover", () => {
  const expected = {
    "duo.request_received": "@zshot sent you a Duo request.",
    "duo.request_cancelled": "@zshot cancelled their Duo request.",
    "duo.request_declined": "@zshot declined your Duo request.",
    "duo.request_accepted": "@zshot accepted your Duo request. You're now Duo.",
    "duo.ended": "@zshot ended your Duo.",
    "duo.replaced": "Your Duo with @zshot has ended because @zshot chose a new Duo.",
  };
  assert.deepEqual(Object.keys(NOTIFICATION_TEXT).filter(type => type.startsWith("duo.")).sort(), Object.keys(expected).sort());   // My Duo's six (My Crew's are pinned in my-crew.test.js)
  for (const [type, text] of Object.entries(expected)) assert.equal(notificationText(note(1, type)), text, type);
  assert.equal(notificationText(note(1, "duo.ended", "<img>")), "A GamID ended your Duo.");
  assert.equal(notificationText({ type_key: "future.thing" }), "You have a new GamID notification.");
  const sql = read("supabase/migrations/20261002210000_gamid_notifications.sql");
  for (const type of Object.keys(expected)) assert.match(sql, new RegExp(`\\('${type.replace(".", "\\.")}',\\s+'my_duo', 'account\\.my_duo'\\)`), `${type} is registered server-side`);
  assert.equal(formatWhen(new Date(NOW - 20_000).toISOString(), NOW).short, "just now");
  assert.equal(formatWhen(new Date(NOW - 5 * 60_000).toISOString(), NOW).short, "5 min ago");
  assert.equal(formatWhen(new Date(NOW - 3 * 3_600_000).toISOString(), NOW).short, "3 h ago");
  assert.equal(formatWhen(new Date(NOW - 30 * 3_600_000).toISOString(), NOW).short, "Yesterday");
  assert.ok(formatWhen(new Date(NOW - 20_000).toISOString(), NOW).full.length > 5);
});

// ---------- realtime wiring ----------
test("Realtime only wakes the bell: the page joins its own private notifications topic; bursts collapse into one re-read; returning to the tab re-reads", () => {
  const timers = fakeTimers();
  const joined = [];
  let deliver;
  const doc = { visibilityState: "visible", handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, removeEventListener(type) { delete this.handlers[type]; } };
  const subscribe = notificationSubscriber({ subscribe: options => { joined.push(options); deliver = options.onMessage; return () => { joined.length = 0; }; }, getUserId: () => "u-1", timers, win: null, doc });
  let calls = 0;
  const stop = subscribe(() => { calls++; });
  assert.equal(joined[0].topic, `${NOTIFICATIONS_TOPIC_PREFIX}u-1`);
  assert.equal(joined[0].event, NOTIFICATIONS_EVENT);
  deliver({}); deliver({}); deliver({});
  timers.runAll();
  assert.equal(calls, 1);
  doc.handlers.visibilitychange(); timers.runAll();
  assert.equal(calls, 2);
  stop();
  assert.equal(doc.handlers.visibilitychange, undefined);
  assert.deepEqual(notificationSubscriber({ getUserId: () => null })(() => {})(), undefined, "signed out: nothing joined");
});

// ---------- 10 + 11: privacy / forgery (browser side; the database side is in tests/integration/notifications-db.sql) ----------
test("10 + 11. the browser can only read its own log and mark read - it has no way to create a notification; the server-only producer is private.notify", () => {
  const client = read("dist/account/supabase-client.js");
  const notificationCalls = [...client.matchAll(/rpc\("([a-z_]*notification[a-z_]*)"/g)].map(match => match[1]).sort();
  assert.deepEqual(notificationCalls, ["get_my_notifications", "get_my_unread_notification_count", "mark_all_my_notifications_read", "mark_my_notifications_read"]);
  const sql = read("supabase/migrations/20261002210000_gamid_notifications.sql");
  assert.match(sql, /revoke all on function\s+private\.notify\(uuid, uuid, text\), private\.notification_cleanup\(uuid\), private\.notifications_realtime_trigger\(\), private\.notifications_owner_entity\(\)\s+from public, anon, authenticated, service_role;/);
  assert.match(sql, /alter table public\.notifications enable row level security;\nrevoke all on table public\.notifications from public, anon, authenticated;/);
  assert.match(sql, /update public\.notifications n set read_at = now\(\) where n\.recipient_entity_id = me and n\.read_at is null and n\.notification_id = any \(candidate_ids\);/, "marking is scoped to the caller");
  assert.match(sql, /where n\.recipient_entity_id = me and \(candidate_before_id is null or n\.notification_id < candidate_before_id\)\s+order by n\.notification_id desc/, "the log is the caller's own, newest first");
  assert.match(sql, /realtime\.send\(jsonb_build_object\('kind', 'NOTIFICATIONS'\), 'notifications_changed', 'notifications:user:' \|\| candidate_user_id::text, true\)/, "data-free private wake-up");
  assert.match(sql, /drop function public\.get_my_duo_notifications\(\);/, "one system: the My-Duo-only functions are gone");
  assert.match(sql, /alter table public\.identity_notifications rename to notifications;/, "the existing table (and any rows) is evolved, not duplicated");
});

test("retention is central and documented: 90 days and 500 per person; reading never deletes", () => {
  const sql = read("supabase/migrations/20261002210000_gamid_notifications.sql");
  assert.match(sql, /insert into private\.notification_policy \(retention_days, max_per_recipient\) values \(90, 500\);/);
  const cleanup = sql.slice(sql.indexOf("create function private.notification_cleanup"), sql.indexOf("create function private.notify("));
  assert.doesNotMatch(cleanup, /read_at/, "read status never decides deletion");
});

// ---------- 13: layout ----------
test("13. mobile and desktop: the panel never exceeds the viewport, becomes a full-width sheet on phones, and the bell sits in the header on the Account page", () => {
  const css = read("dist/notifications/notifications.css");
  assert.match(css, /\.gn-panel\{[^}]*width:min\(23rem,calc\(100vw - 2rem\)\)/, "desktop: a compact dropdown no wider than the viewport");
  assert.match(css, /@media \(max-width:540px\)\{\s*\.gn-panel\{position:fixed;top:4\.4rem;left:1rem;right:1rem;width:auto\}/, "phones: 16 px side gutters, no horizontal overflow");
  assert.match(css, /\.gn-toast\{[^}]*width:min\(26rem,calc\(100vw - 2rem\)\)/);
  const html = read("dist/account/index.html");
  assert.match(read("dist/app/authenticated-shell.js"), /notifications\/notifications.css/);
  assert.match(html, /<div class="site-head-end"><span class="test-badge">TESTING<\/span><\/div>/);
  assert.match(read("dist/app/authenticated-shell.js"), /host.id = "notificationsHost"/);
});
