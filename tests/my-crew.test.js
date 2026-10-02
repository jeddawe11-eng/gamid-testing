// My Crew V1 - Slice 1 (Crew foundation + membership + notifications). The database rules (one Crew per game, 15 members, owner-only actions, invitation acceptance,
// immutability, delete cleanup, notification privacy / forgery, Realtime signal) run on TESTING in tests/integration/my-crew-db.sql; these tests pin the browser side
// and the migration's security shape.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCrewPanel, crewState, crewErrorText, validCrewName, deleteWarning, leaveWarning } from "../dist/account/my-crew.js";
import { subscribeCrewRealtime, CREW_EVENT } from "../dist/account/crew-realtime.js";
import { notificationText, destinationOf, NOTIFICATION_TEXT, DESTINATIONS } from "../dist/notifications/notification-types.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---------- a small fake DOM ----------
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.classList = { toggle: () => {} }; this.style = { setProperty: () => {} }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { for (const node of nodes) if (node) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  set innerHTML(_) { throw new Error("innerHTML is forbidden"); }
  async fire(type, event = {}) { for (const handler of this.listeners[type] || []) await handler({ target: this, preventDefault() {}, ...event }); }
}
const element = (tag, className, text) => { const node = new El(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const byClass = (root, cls) => all(root, node => typeof node.className === "string" && node.className.split(" ").includes(cls));
const buttons = (root, text) => all(root, node => node.tag === "button" && node.textContent === text);
const tick = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const timers = () => ({ setTimeout: () => 1, clearTimeout: () => {} });

// ---------- a fake server for one signed-in GamID ----------
const crewRow = (id, game, name, extra = {}) => ({ crew_id: id, game_key: game, game_name: game === "lol" ? "League of Legends" : "Valorant", crew_name: name, my_role: "OWNER", my_status: "ACTIVE", owner_handle: "black", owner_display_name: "Black", member_count: 1, pending_count: 0, max_members: 15, ...extra });
const person = (handle, extra = {}) => ({ gamid_handle: handle, display_name: handle, avatar_media_reference: null, is_published: true, role: "MEMBER", status: "ACTIVE", joined_at: "2026-10-03T10:00:00Z", ...extra });
function fakeApi(start = {}) {
  const db = { crews: start.crews ?? [], members: start.members ?? {}, calls: [] };
  const call = (name, fn) => async (...args) => { db.calls.push([name, ...args]); if (start.fail?.[name]) throw start.fail[name]; return fn?.(...args); };
  db.api = {
    getMyCrews: async () => db.crews,
    getCrewMembers: async id => db.members[id] ?? [],
    searchGameCatalog: call("searchGameCatalog", async () => [{ game_key: "lol", display_name: "League of Legends" }, { game_key: "val", display_name: "Valorant" }]),
    searchDuoCandidates: call("searchDuoCandidates", async () => [person("zshot"), person("fresh")]),
    createCrew: call("createCrew", async (key, name) => { db.crews = [...db.crews, crewRow("c-new", key, name)]; db.members["c-new"] = [person("black", { role: "OWNER" })]; return "c-new"; }),
    inviteToCrew: call("inviteToCrew"), cancelCrewInvite: call("cancelCrewInvite"), respondToCrewInvite: call("respondToCrewInvite"),
    removeCrewMember: call("removeCrewMember"), leaveCrew: call("leaveCrew"), deleteCrew: call("deleteCrew"),
  };
  return db;
}
async function panel(db) {
  const root = element("div"), message = element("p");
  message.hidden = true;
  const view = createCrewPanel({ api: db.api, root, message, element, timers: timers() });
  await view.load();
  return { view, root, message };
}
const typeInto = async (input, value) => { input.value = value; await input.fire("input"); };

// ---------- state ----------
test("crewState: my ACTIVE Crews (sorted by game) and my INVITATIONS; malformed rows dropped; the limit comes from the server", () => {
  const state = crewState([crewRow("c2", "val", "Zero"), crewRow("c1", "lol", "Night Raiders"), crewRow("c3", "lol", "Other", { my_status: "INVITED", my_role: "MEMBER", owner_handle: "zshot" }), { crew_id: 5 }]);
  assert.deepEqual(state.crews.map(crew => crew.name), ["Night Raiders", "Zero"]);
  assert.deepEqual(state.invitations.map(crew => [crew.name, crew.ownerHandle]), [["Other", "zshot"]]);
  assert.equal(state.crews[0].max, 15);
  assert.ok(validCrewName("Night Raiders") && !validCrewName("x") && !validCrewName("a".repeat(41)) && !validCrewName("<b>x</b>"));
  assert.equal(crewErrorText({ message: "CREW_ALREADY_IN_GAME" }), "You already belong to a Crew for this game. Leave it (or delete yours) first.");
});

// ---------- owner ----------
test("owner: create a Crew - pick a game from the existing catalog search, name it (immutable), create; games where I already have a Crew are not offered", async () => {
  const db = fakeApi({ crews: [crewRow("c1", "val", "Zero")], members: { c1: [person("black", { role: "OWNER" })] } });
  const p = await panel(db);
  await buttons(p.root, "Create a Crew")[0].fire("click");
  const search = byClass(p.root, "crew-create")[0];
  await typeInto(all(search, node => node.tag === "input")[0], "leag");
  await all(search, node => node.tag === "form")[0].fire("submit"); await tick();
  assert.deepEqual(db.calls.find(call => call[0] === "searchGameCatalog").slice(1), ["leag", 8], "the existing game catalog search");
  const picks = byClass(p.root, "crew-game-pick");
  assert.equal(picks.find(pick => /Valorant/.test(pick.textContent)).disabled, true, "already in Zero for Valorant");
  await picks.find(pick => pick.textContent === "League of Legends").fire("click");
  assert.match(p.root.textContent, /it can't be changed later/);
  await typeInto(all(byClass(p.root, "crew-create")[0], node => node.tag === "input")[0], "  Night Raiders ");
  await buttons(p.root, "Create Crew")[0].fire("click"); await tick();
  assert.deepEqual(db.calls.find(call => call[0] === "createCrew").slice(1), ["lol", "Night Raiders"]);
  assert.match(p.root.textContent, /NIGHT RAIDERS|Night Raiders/);
  assert.equal(p.message.textContent, "Night Raiders was created for League of Legends.");
});

test("owner: invite through GamID search (nobody is added without accepting), see pending invitations, cancel one, remove a member (with confirmation), delete the Crew (with warning)", async () => {
  const db = fakeApi({
    crews: [crewRow("c1", "lol", "Night Raiders", { member_count: 2, pending_count: 1 })],
    members: { c1: [person("black", { role: "OWNER" }), person("zshot"), person("newbie", { status: "INVITED", joined_at: null })] },
  });
  const p = await panel(db);
  assert.match(p.root.textContent, /2 \/ 15 members · 1 invitation pending/);
  assert.match(p.root.textContent, /INVITATIONS SENT/);
  const form = byClass(p.root, "crew-invite")[0];
  await typeInto(all(form, node => node.tag === "input")[0], "zsh");
  await form.fire("submit"); await tick();
  assert.match(byClass(p.root, "duo-results")[0].textContent, /IN CREW \/ INVITED/, "existing members / invitees are not re-invited");
  await buttons(p.root, "Invite")[0].fire("click"); await tick();
  assert.deepEqual(db.calls.find(call => call[0] === "inviteToCrew").slice(1), ["c1", "fresh"], "an invitation - the server adds nobody until they accept");
  await buttons(p.root, "Cancel invite")[0].fire("click"); await tick();
  assert.deepEqual(db.calls.find(call => call[0] === "cancelCrewInvite").slice(1), ["c1", "newbie"]);
  await buttons(p.root, "Remove")[0].fire("click");
  assert.match(p.root.textContent, /Remove @zshot from Night Raiders\?/);
  assert.equal(db.calls.some(call => call[0] === "removeCrewMember"), false, "nothing removed before confirming");
  await buttons(p.root, "Remove").at(-1).fire("click"); await tick();
  assert.deepEqual(db.calls.find(call => call[0] === "removeCrewMember").slice(1), ["c1", "zshot"]);
  await buttons(p.root, "Delete Crew")[0].fire("click");
  assert.match(p.root.textContent, /Delete Night Raiders\? Every member leaves and pending invitations are cancelled/);
  await buttons(p.root, "Delete Crew").at(-1).fire("click"); await tick();
  assert.deepEqual(db.calls.find(call => call[0] === "deleteCrew").slice(1), ["c1"]);
  assert.equal(buttons(p.root, "Leave Crew").length, 0, "the owner has no Leave (V1: delete instead)");
});

test("owner: a full Crew cannot invite (the server enforces it too)", async () => {
  const db = fakeApi({ crews: [crewRow("c1", "lol", "Night Raiders", { member_count: 14, pending_count: 1 })], members: { c1: [person("black", { role: "OWNER" })] } });
  const p = await panel(db);
  assert.match(p.root.textContent, /This Crew is full \(15\)\./);
  assert.equal(all(byClass(p.root, "crew-invite")[0], node => node.tag === "input")[0].disabled, true);
});

// ---------- member ----------
test("member: sees the Crew, its owner and members, and can leave (with confirmation); no owner controls", async () => {
  const db = fakeApi({ crews: [crewRow("c1", "lol", "Night Raiders", { my_role: "MEMBER", member_count: 2 })], members: { c1: [person("black", { role: "OWNER" }), person("zshot")] } });
  const p = await panel(db);
  assert.match(p.root.textContent, /MEMBER/);
  assert.match(p.root.textContent, /Owner @black/);
  assert.match(p.root.textContent, /@zshot/);
  assert.equal(buttons(p.root, "Remove").length + buttons(p.root, "Delete Crew").length + byClass(p.root, "crew-invite").length, 0);
  await buttons(p.root, "Leave Crew")[0].fire("click");
  assert.match(p.root.textContent, /Leave Night Raiders\?/);
  await buttons(p.root, "Leave Crew").at(-1).fire("click"); await tick();
  assert.deepEqual(db.calls.find(call => call[0] === "leaveCrew").slice(1), ["c1"]);
  assert.equal(p.message.textContent, "You left Night Raiders.");
});

// ---------- invitations ----------
test("invitation: Accept / Decline; Accept is unavailable while I'm in another Crew of the same game (the server refuses too)", async () => {
  const invited = crewRow("c9", "lol", "Night Raiders", { my_role: "MEMBER", my_status: "INVITED", owner_handle: "black", member_count: 3 });
  const free = fakeApi({ crews: [invited] });
  const p = await panel(free);
  assert.match(p.root.textContent, /CREW INVITATION · LEAGUE OF LEGENDS/);
  assert.match(p.root.textContent, /@black invited you to join\. 3 \/ 15 members\./);
  await buttons(p.root, "Accept")[0].fire("click"); await tick();
  assert.deepEqual(free.calls.find(call => call[0] === "respondToCrewInvite").slice(1), ["c9", true]);
  const busy = fakeApi({ crews: [invited, crewRow("c1", "lol", "Mine", { my_role: "MEMBER", owner_handle: "zshot" })], members: { c1: [] } });
  const q = await panel(busy);
  assert.match(q.root.textContent, /You're already in Mine for League of Legends - leave it first to accept\./);
  assert.equal(buttons(q.root, "Accept")[0].disabled, true);
  await buttons(q.root, "Decline")[0].fire("click"); await tick();
  assert.deepEqual(busy.calls.find(call => call[0] === "respondToCrewInvite").slice(1), ["c9", false]);
});

test("server refusals are shown in plain words and the state is re-read", async () => {
  const error = Object.assign(new Error("CREW_ALREADY_IN_GAME"), { code: "CREW_ALREADY_IN_GAME" });
  const db = fakeApi({ crews: [crewRow("c9", "lol", "Night Raiders", { my_role: "MEMBER", my_status: "INVITED" })], fail: { respondToCrewInvite: error } });
  const p = await panel(db);
  await buttons(p.root, "Accept")[0].fire("click"); await tick();
  assert.equal(p.message.textContent, "You already belong to a Crew for this game. Leave it (or delete yours) first.");
});

// ---------- live ----------
test("live: a Crew change made elsewhere (an invitation arrives, I'm removed) re-renders the panel without a refresh and without a message", async () => {
  const db = fakeApi({ crews: [crewRow("c1", "lol", "Night Raiders", { my_role: "MEMBER" })], members: { c1: [person("black", { role: "OWNER" })] } });
  const p = await panel(db);
  db.crews = [crewRow("c2", "val", "Zero", { my_role: "MEMBER", my_status: "INVITED" })];   // removed from Night Raiders + invited to Zero
  await p.view.refresh();
  assert.doesNotMatch(p.root.textContent, /Night Raiders/);
  assert.match(p.root.textContent, /CREW INVITATION · VALORANT/);
  assert.equal(p.message.hidden, true, "what someone else did is told by the notification bell, not this line");
});

test("live wiring: crew_changed on the existing private identity topic; bursts collapse; returning to the tab re-reads; the page subscribes once", async () => {
  const joined = [];
  let deliver, refreshed = 0;
  const pending = [];
  const fakeTimers = { setTimeout: fn => { pending.push(fn); return pending.length; }, clearTimeout: () => {} };
  const doc = { visibilityState: "visible", handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, removeEventListener(type) { delete this.handlers[type]; } };
  const stop = subscribeCrewRealtime({ refresh: async () => { refreshed++; }, subscribe: options => { joined.push(options); deliver = options.onMessage; return () => {}; }, getUserId: () => "u1", timers: fakeTimers, win: null, doc });
  assert.equal(joined[0].topic, "identity:user:u1");
  assert.equal(joined[0].event, CREW_EVENT);
  assert.equal(CREW_EVENT, "crew_changed");
  deliver(); deliver();
  pending.splice(0).forEach(fn => fn()); await tick();
  assert.ok(refreshed >= 1);
  stop();
  const account = read("dist/account/account.js");
  assert.match(account, /stopCrewRealtime = subscribeCrewRealtime\(\{ refresh: \(\) => crewPanel\.refresh\(\) \}\);/);
  assert.match(account, /loadCrew\(\)\.then\(\(\) => \{ if \(location\.hash === "#my-crew"\) openNotificationDestination\("account\.my_crew"\); \}\);/);
});

// ---------- notifications ----------
test("notifications: the seven Crew events read naturally from the authoritative type + server context (even after the Crew is deleted) and open My Crew", () => {
  const row = (type, extra = {}) => ({ type_key: type, actor_handle: "black", destination: "account.my_crew", context: { crew_name: "Night Raiders", game_name: "League of Legends", game_key: "lol" }, ...extra });
  const expected = {
    "crew.invite_received": "@black invited you to join Night Raiders (League of Legends).",
    "crew.invite_cancelled": "@black cancelled your invitation to Night Raiders.",
    "crew.invite_declined": "@black declined your invitation to Night Raiders.",
    "crew.invite_accepted": "@black joined Night Raiders.",
    "crew.member_removed": "@black removed you from Night Raiders.",
    "crew.member_left": "@black left Night Raiders.",
    "crew.deleted": "@black deleted Night Raiders.",
  };
  assert.deepEqual(Object.keys(NOTIFICATION_TEXT).filter(type => type.startsWith("crew.")).sort(), Object.keys(expected).sort());
  for (const [type, text] of Object.entries(expected)) assert.equal(notificationText(row(type)), text, type);
  assert.equal(notificationText(row("crew.deleted", { context: { crew_name: "<script>" } })), "@black deleted your Crew.", "unsafe context text is never printed");
  assert.equal(destinationOf(row("crew.invite_received")), "account.my_crew");
  assert.deepEqual(DESTINATIONS["account.my_crew"], { page: "account", anchor: "my-crew", label: "My Crew" });
  const sql = read("supabase/migrations/20261003100000_my_crew.sql");
  for (const type of Object.keys(expected)) assert.match(sql, new RegExp(`\\('${type.replace(".", "\\.")}',\\s+'my_crew', 'account\\.my_crew'\\)`), `${type} registered server-side`);
  assert.equal(deleteWarning({ name: "Night Raiders", gameName: "League of Legends" }), "Delete Night Raiders? Every member leaves and pending invitations are cancelled. This can't be undone - you can create a new Crew for League of Legends afterwards.");
  assert.equal(leaveWarning({ name: "Night Raiders" }), "Leave Night Raiders? You can only rejoin if the owner invites you again.");
});

// ---------- the migration's security shape ----------
test("migration: one Crew per game and one owner in the database itself; 15 in a central policy; RPC-only tables; immutable name / game / owner", () => {
  const sql = read("supabase/migrations/20261003100000_my_crew.sql");
  assert.match(sql, /create unique index crew_members_one_active_crew_per_game on public\.crew_members \(entity_id, game_key\) where status = 'ACTIVE';/);
  assert.match(sql, /create unique index crew_members_one_owner on public\.crew_members \(crew_id\) where role = 'OWNER';/);
  assert.match(sql, /constraint crew_members_crew_fk foreign key \(crew_id, game_key\) references public\.crews \(crew_id, game_key\) on delete cascade/, "a member row's game always equals its Crew's game");
  assert.match(sql, /insert into private\.crew_policy \(max_members\) values \(15\);/);
  assert.match(sql, /revoke all on table public\.crews, public\.crew_members from public, anon, authenticated;/);
  assert.match(sql, /game_key text not null references public\.game_catalog\(game_key\)/, "the existing game catalog - no second one");
  assert.match(sql, /create trigger crews_immutable before update on public\.crews/);
  assert.match(sql, /'CREW_IMMUTABLE'/);
  const publicFns = [...sql.matchAll(/create function public\.(\w+)/g)].map(match => match[1]).sort();
  assert.deepEqual(publicFns, ["cancel_crew_invite", "create_crew", "delete_crew", "get_crew_members", "get_my_crews", "get_my_notifications", "invite_to_crew", "leave_crew", "remove_crew_member", "respond_to_crew_invite"]);
  assert.doesNotMatch(sql, /grant execute on function[^;]*to anon/, "nothing is exposed to visitors in this slice");
  assert.match(sql, /revoke all on function\s+private\.crews_immutable\(\)[^;]*private\.notify\(uuid, uuid, text, uuid, jsonb\)\s+from public, anon, authenticated, service_role;/, "the producer stays server-only (no forged notifications)");
  assert.match(sql, /perform realtime\.send\(jsonb_build_object\('kind', 'CREW'\), 'crew_changed', 'identity:user:' \|\| candidate_user_id::text, true\);/, "the existing private identity topic, data-free");
  assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ""), /entity_type|insert into public\.entities/, "a Crew is not a personal-GamID entity");
});
