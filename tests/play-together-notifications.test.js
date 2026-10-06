// Play Together -> GamID Notifications (20261006090000_play_together_notifications.sql): the producer for the three approved Play Together contracts.
// The live behaviour is proven by tests/integration/play-together-notifications-db.sql (disposable fixtures, rolled back); these tests pin the contract mapping,
// that only contracted events notify, that the copied Play Together actions are otherwise unchanged, and how the bell presents and opens each type.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { notificationText, destinationOf, NOTIFICATION_TEXT, DESTINATIONS } from "../dist/notifications/notification-types.js";
import { createAuthenticatedShell } from "../dist/app/authenticated-shell.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MIGRATION = "supabase/migrations/20261006090000_play_together_notifications.sql";
const sql = read(MIGRATION);
const TYPES = { "pt.join-request-notifies-host": "play_together.request_received", "pt.approve-notifies-requester": "play_together.request_approved", "pt.reject-notifies-requester": "play_together.request_rejected" };
const bodyOf = (text, name) => { const at = text.lastIndexOf(`function private.${name}(`); const start = text.indexOf("$$", at) + 2; return text.slice(start, text.indexOf("$$", start)); };

test("each approved Play Together notification contract in GamID Truth has exactly one registered type; no other Play Together type exists", () => {
  const truth = JSON.parse(read("gamid-truth.json"));
  const pt = truth.capabilities.find(c => c.id === "play-together");
  assert.deepEqual(pt.contracts.map(c => c.id).sort(), Object.keys(TYPES).sort());
  assert.deepEqual(pt.noContract, ["CREATE", "READY", "READY_CHECK_START", "START", "COMPLETE"]);
  const registered = [...sql.matchAll(/\('(play_together\.[a-z_]+)', 'play_together', '(play_together\.[a-z_]+)'\)/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(registered, [["play_together.request_received", "play_together.requests"], ["play_together.request_approved", "play_together.session"], ["play_together.request_rejected", "play_together.session"]]);
  // no other migration registers or produces a Play Together notification
  for (const file of readdirSync(new URL("../supabase/migrations/", import.meta.url))) {
    if (file === "20261006090000_play_together_notifications.sql") continue;
    assert.doesNotMatch(read(`supabase/migrations/${file}`), /'play_together\.[a-z_]+'/, file);
  }
});

test("recipients: a join request notifies the HOST session's creator; approve / reject notify the REQUESTER (applicant session creator) - only for applicant-originated requests", () => {
  const request = bodyOf(sql, "request_play_together_host_impl");
  assert.match(request, /perform private\.notify\(\(select h\.creator_entity_id from public\.play_together_sessions h where h\.session_id=candidate_host_session_id\), me, 'play_together\.request_received', candidate_host_session_id, private\.play_together_notification_context\(candidate_host_session_id\)\);\n return created;/);
  const respond = bodyOf(sql, "respond_play_together_request_impl");
  assert.match(respond, /if req\.request_origin='APPLICANT_REQUEST' then perform private\.notify\(applicant\.creator_entity_id, me, 'play_together\.request_rejected', host\.session_id, private\.play_together_notification_context\(host\.session_id\)\); end if;\n   return 'REJECTED';/);
  assert.match(respond, /if req\.request_origin='APPLICANT_REQUEST' then perform private\.notify\(applicant\.creator_entity_id, me, 'play_together\.request_approved', host\.session_id, private\.play_together_notification_context\(host\.session_id\)\); end if;\n if host\.intent='TEAM_VS_TEAM'/);
  assert.equal((sql.match(/perform private\.notify\(/g) ?? []).length, 3, "exactly the three contracted notifications");
  // the context is a small server-written display fact, never client input
  assert.match(sql, /create or replace function private\.play_together_notification_context\(candidate_session_id uuid\)\nreturns jsonb language sql stable security definer set search_path = '' as \$\$\n  select jsonb_build_object\('queue_name', left\(q\.official_name, 120\)\)/);
  assert.match(sql, /revoke all on function private\.play_together_notification_context\(uuid\) from public, anon, authenticated, service_role;/);
});

test("the two Play Together actions are copied unchanged from their latest definitions apart from the notification calls (accepted behaviour preserved)", () => {
  const priorRequest = bodyOf(read("supabase/migrations/20260925090000_play_together_complete_milestone.sql"), "request_play_together_host_impl");
  const priorRespond = bodyOf(read("supabase/migrations/20261001160000_play_together_acceptance_fixes.sql"), "respond_play_together_request_impl");
  // statement streams with the added "-- pt.* comment" lines and "if ... then perform private.notify(...); end if;" statements removed
  const statements = body => body.replace(/\r/g, "").split("\n").filter(line => !/^\s*-- pt\./.test(line)).join(" ").replace(/\s+/g, " ")
    .replace(/(if req\.request_origin='APPLICANT_REQUEST' then )?perform private\.notify\([^;]*\);( end if;)?/g, "").split(";").map(s => s.trim()).filter(Boolean);
  assert.deepEqual(statements(bodyOf(sql, "request_play_together_host_impl")), statements(priorRequest));
  assert.deepEqual(statements(bodyOf(sql, "respond_play_together_request_impl")), statements(priorRespond));
});

test("no uncontracted Play Together event notifies: create, invitations, Ready, Ready Check, start and complete stay silent", () => {
  for (const file of readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter(f => /play_together/.test(f) && f !== "20261006090000_play_together_notifications.sql")) {
    assert.doesNotMatch(read(`supabase/migrations/${file}`), /private\.notify\(/, `${file} has no notification producer`);
  }
  for (const fn of ["create_play_together_attempt_impl", "invite_play_together_squad_impl", "respond_play_together_ready_impl", "open_play_together_ready_check", "advance_play_together_room_impl"]) assert.doesNotMatch(sql, new RegExp(`function private\\.${fn}\\(`), `${fn} is not redefined`);
});

test("the bell's wording for each Play Together type, with the server-written queue name; unsafe handles and context are never printed", () => {
  const row = (type, handle = "zshot", context = { queue_name: "Quick Match" }) => ({ type_key: type, actor_handle: handle, context });
  assert.equal(notificationText(row("play_together.request_received")), "@zshot requested to join your Play Together squad (Quick Match).");
  assert.equal(notificationText(row("play_together.request_approved")), "@zshot approved your request to join their Play Together squad (Quick Match).");
  assert.equal(notificationText(row("play_together.request_rejected")), "@zshot declined your request to join their Play Together squad (Quick Match).");
  assert.equal(notificationText(row("play_together.request_received", "<img>", { queue_name: "<script>" })), "A GamID requested to join your Play Together squad.");
  assert.equal(notificationText(row("play_together.request_approved", "zshot", null)), "@zshot approved your request to join their Play Together squad.");
  assert.deepEqual(Object.keys(NOTIFICATION_TEXT).filter(type => type.startsWith("play_together.")).sort(), Object.values(TYPES).sort());
});

test("opening a Play Together notification goes to the Play Together page section it is about (anchors exist); unknown destinations do nothing", async () => {
  assert.deepEqual(DESTINATIONS["play_together.requests"], { page: "play-together", anchor: "requestSection", label: "Play Together" });
  assert.deepEqual(DESTINATIONS["play_together.session"], { page: "play-together", anchor: "activePanel", label: "Play Together" });
  const html = read("dist/play-together/index.html");
  for (const anchor of ["requestSection", "activePanel"]) assert.match(html, new RegExp(`id="${anchor}"`));
  assert.equal(destinationOf({ destination: "play_together.session" }), "play_together.session");
  // through the real shell: the typed key becomes the internal page link
  const urls = [], created = [];
  const header = { querySelector: () => null, append() {} };
  const doc = { documentElement: { dataset: {} }, body: {}, querySelector: () => header, createElement: () => ({ remove() {} }) };
  const events = new Map();
  const win = { location: {}, addEventListener: (k, fn) => events.set(k, fn), removeEventListener: k => events.delete(k), CustomEvent: class { constructor(type, o) { Object.assign(this, o); this.type = type; this.defaultPrevented = false; } preventDefault() { this.defaultPrevented = true; } }, dispatchEvent(e) { events.get(e.type)?.(e); return !e.defaultPrevented; } };
  win.parent = win;
  const shell = createAuthenticatedShell({ doc, win, client: { restoreSession: async () => ({ access_token: "x" }), userIdFromToken: () => "u" }, subscribe: () => {}, createUsage: () => ({ mount: async () => {}, refresh() {}, destroy() {} }), navigate: url => urls.push(url), createCenter: options => { const c = { options, mount: async () => {}, destroy() {} }; created.push(c); return c; } });
  await shell.sync();
  created[0].options.onNavigate("play_together.requests");
  created[0].options.onNavigate("play_together.session");
  created[0].options.onNavigate("https://evil.example");
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/play-together\/#requestSection$/);
  assert.match(urls[1], /\/play-together\/#activePanel$/);
});
