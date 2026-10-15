// Edit Crew Name (Mazen's task 2026-10-13; migration 20261013100000_crew_rename.sql). The owner renames a Crew inline from My Crew; the server decides (owner only,
// the create_crew name rule) and changes ONLY the name. Browser side: the fake DOM / fake server pattern of tests/my-crew.test.js. Database side: the REAL My Crew
// migration and this migration in an isolated PGlite Postgres (nothing touches TESTING).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCrewPanel, renameProblem, CREW_ERRORS } from "../dist/account/my-crew.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---------- the fake DOM and server (as in tests/my-crew.test.js) ----------
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.classList = { toggle: () => {} }; this.style = { setProperty: () => {} }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { for (const node of nodes) if (node) { node.parent = this; this.children.push(node); } }
  prepend(...nodes) { for (const node of nodes) node.parent = this; this.children.unshift(...nodes); }
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
const tick = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const timers = () => ({ setTimeout: () => 1, clearTimeout: () => {} });

const crewRow = (id, name, extra = {}) => ({ crew_id: id, game_key: "marvel-rivals", game_name: "Marvel Rivals", crew_name: name, my_role: "OWNER", my_status: "ACTIVE", owner_handle: "black", owner_display_name: "Black", member_count: 2, pending_count: 1, max_members: 15, ...extra });
const person = (handle, extra = {}) => ({ gamid_handle: handle, display_name: handle, avatar_media_reference: null, is_published: true, role: "MEMBER", status: "ACTIVE", joined_at: "2026-10-03T10:00:00Z", ...extra });
function fakeServer({ role = "OWNER", renameFails = null, slow = false } = {}) {
  const db = { name: "espada", calls: [], pending: null, wall: { stageCount: 2, published: true, revision: 4 } };
  db.api = {
    getMyCrews: async () => [crewRow("c1", db.name, role === "OWNER" ? {} : { my_role: "MEMBER", owner_handle: "zshot", pending_count: null })],
    getCrewMembers: async () => [person("black", { role: "OWNER" }), person("zshot"), person("fresh", { status: "INVITED" })],
    renameCrew: async (id, name) => {
      db.calls.push(["renameCrew", id, name]);
      if (slow) await new Promise(resolve => { db.pending = resolve; });
      if (renameFails) throw renameFails;
      db.name = name;
      return name;
    },
  };
  return db;
}
async function mount(db) {
  const root = element("div"), message = element("p");
  message.hidden = true;
  const view = createCrewPanel({ api: db.api, root, message, element, timers: timers() });
  await view.load();
  await byClass(root, "crew-list-open")[0]?.fire("click");
  return { view, root, message };
}
const nameShown = root => byClass(root, "crew-name").map(node => node.textContent);
const editButton = root => byClass(root, "crew-rename-edit")[0];
const field = root => all(byClass(root, "crew-rename")[0], node => node.tag === "input")[0];
const typeInto = async (input, value) => { input.value = value; await input.fire("input"); };
const submit = async root => { await byClass(root, "crew-rename")[0].fire("submit"); await tick(); };

// ---------- browser ----------
test("owner: a pencil beside the name opens an inline field with the current name; Save trims, sends ONLY the new name and shows it at once", async () => {
  const db = fakeServer();
  const p = await mount(db);
  assert.deepEqual(nameShown(p.root), ["espada"]);
  const edit = editButton(p.root);
  assert.equal(edit.textContent, "✎");
  assert.equal(edit.attrs["aria-label"], "Edit the name of espada");
  await edit.fire("click");
  assert.equal(field(p.root).value, "espada", "the field starts with the current name");
  assert.equal(byClass(p.root, "crew-rename-save")[0].textContent, "Save");
  await typeInto(field(p.root), "   Rivals Night   ");
  await submit(p.root);
  assert.deepEqual(db.calls, [["renameCrew", "c1", "Rivals Night"]], "one request, trimmed");
  assert.deepEqual(nameShown(p.root), ["Rivals Night"], "the new name is shown immediately");
  assert.equal(byClass(p.root, "crew-rename").length, 0, "the editor closes");
  assert.equal(p.message.textContent, "Renamed to Rivals Night.");
});

test("Cancel leaves the name unchanged and sends nothing; an unchanged name sends nothing either", async () => {
  const db = fakeServer();
  const p = await mount(db);
  await editButton(p.root).fire("click");
  await typeInto(field(p.root), "Something else");
  await byClass(p.root, "crew-rename-cancel")[0].fire("click");
  assert.deepEqual(nameShown(p.root), ["espada"]);
  assert.equal(db.calls.length, 0);
  await editButton(p.root).fire("click");
  assert.equal(field(p.root).value, "espada", "a new edit starts from the saved name again");
  await typeInto(field(p.root), " espada ");
  await submit(p.root);
  assert.equal(db.calls.length, 0, "nothing to save");
  assert.deepEqual(nameShown(p.root), ["espada"]);
});

test("invalid names are refused before anything is sent: empty, whitespace only, too short, too long, markup or control characters", async () => {
  for (const [value, text] of [["", CREW_ERRORS.EMPTY_CREW_NAME], ["     ", CREW_ERRORS.EMPTY_CREW_NAME], ["x", CREW_ERRORS.INVALID_CREW_NAME], ["a".repeat(41), CREW_ERRORS.INVALID_CREW_NAME], ["<b>Raid</b>", CREW_ERRORS.INVALID_CREW_NAME], ["Night\u0007Raid", CREW_ERRORS.INVALID_CREW_NAME]]) {
    const db = fakeServer();
    const p = await mount(db);
    await editButton(p.root).fire("click");
    await typeInto(field(p.root), value);
    await submit(p.root);
    assert.equal(db.calls.length, 0, JSON.stringify(value));
    const error = byClass(p.root, "crew-rename-error")[0];
    assert.equal(error.textContent, text, JSON.stringify(value));
    assert.equal(error.attrs.role, "alert");
  }
  assert.deepEqual(renameProblem("  Night Raiders  ", "espada"), { name: "Night Raiders", unchanged: false });
  assert.deepEqual(renameProblem("a".repeat(40), "espada"), { name: "a".repeat(40), unchanged: false }, "40 characters is the maximum, as at creation");
});

test("while saving: a loading state, Save and Cancel disabled, and a second submit sends nothing (no duplicate request)", async () => {
  const db = fakeServer({ slow: true });
  const p = await mount(db);
  await editButton(p.root).fire("click");
  await typeInto(field(p.root), "Rivals Night");
  byClass(p.root, "crew-rename")[0].fire("submit");
  await tick();
  const save = byClass(p.root, "crew-rename-save")[0];
  assert.deepEqual([save.textContent, save.disabled, save.attrs["aria-busy"], byClass(p.root, "crew-rename-cancel")[0].disabled, field(p.root).disabled], ["Saving…", true, "true", true, true]);
  await byClass(p.root, "crew-rename")[0].fire("submit");
  await tick();
  assert.equal(db.calls.length, 1, "only one request");
  db.pending();
  await tick();
  assert.deepEqual(nameShown(p.root), ["Rivals Night"]);
});

test("a failed save keeps the editor open with a persistent inline error (permission, validation, network, server); typing clears it in place", async () => {
  for (const [failure, text] of [[{ message: "CREW_OWNER_ONLY" }, CREW_ERRORS.CREW_OWNER_ONLY], [{ message: "INVALID_CREW_NAME" }, CREW_ERRORS.INVALID_CREW_NAME], [{ code: "NETWORK_ERROR", message: "Failed to fetch" }, CREW_ERRORS.NETWORK_ERROR], [{ message: "boom" }, "Something went wrong. Please try again."]]) {
    const db = fakeServer({ renameFails: failure });
    const p = await mount(db);
    await editButton(p.root).fire("click");
    await typeInto(field(p.root), "Rivals Night");
    await submit(p.root);
    const error = byClass(p.root, "crew-rename-error")[0];
    assert.equal(error.textContent, text, failure.message);
    assert.equal(field(p.root).value, "Rivals Night", "what the owner typed is kept");
    assert.deepEqual(nameShown(p.root), [], "still editing");
    assert.equal(byClass(p.root, "crew-rename-save")[0].disabled, false, "they can try again");
    await typeInto(field(p.root), "Rivals Night 2");
    assert.equal(error.hidden, true, "typing hides the error without a re-render");
  }
  // the Crew is gone: the list is re-read and the editor closes
  const db = fakeServer({ renameFails: { message: "CREW_NOT_FOUND" } });
  const p = await mount(db);
  await editButton(p.root).fire("click");
  await typeInto(field(p.root), "Rivals Night");
  await submit(p.root);
  assert.equal(byClass(p.root, "crew-rename").length, 0);
  assert.equal(p.message.textContent, CREW_ERRORS.CREW_NOT_FOUND);
});

test("the name persists after a reload, and a live refresh while editing keeps the field and what was typed", async () => {
  const db = fakeServer();
  const first = await mount(db);
  await editButton(first.root).fire("click");
  await typeInto(field(first.root), "Rivals Night");
  await submit(first.root);
  const reloaded = await mount(db);
  assert.deepEqual(nameShown(reloaded.root), ["Rivals Night"], "a fresh page reads the stored name");
  await editButton(reloaded.root).fire("click");
  await typeInto(field(reloaded.root), "Typing...");
  await reloaded.view.refresh();
  assert.equal(field(reloaded.root).value, "Typing...", "a change made elsewhere does not throw away the edit");
});

test("only the owner sees the pencil; a member never can rename (the server refuses it too)", async () => {
  const p = await mount(fakeServer({ role: "MEMBER" }));
  assert.equal(byClass(p.root, "crew-rename-edit").length, 0);
  assert.deepEqual(nameShown(p.root), ["espada"]);
  assert.match(read("dist/account/my-crew.js"), /if \(crew\.role === "OWNER"\) \{\n\s+const edit = button\("✎"/);
  assert.match(read("dist/account/supabase-client.js"), /export const renameCrew = \(crewId, name\) => rpc\("rename_crew", \{ candidate_crew: crewId, candidate_name: name \}\);/);
  assert.match(read("dist/account/my-crew.js"), /"Crew name \(you can rename it later\)"/, "creating no longer says the name is permanent");
});

test("layout: the existing card design with a 44px pencil and a full-width field that wraps on a phone (no ellipsis / nowrap)", () => {
  const css = read("dist/account/account.css");
  const block = css.slice(css.indexOf("/* Edit Crew Name (owner)"), css.indexOf(".crew-card-head:has(.crew-rename) .crew-titles{flex:1 1 16rem}") + 60);
  assert.match(block, /\.crew-name-line \.crew-rename-edit\{flex:0 0 auto;width:2\.75rem;min-width:2\.75rem;min-height:2\.75rem;/, "a 44px square, not the full-width .text-button");
  assert.match(block, /\.crew-rename-label input\{width:100%;min-width:0\}/);
  assert.doesNotMatch(block, /nowrap|ellipsis|data-provider|overflow-wrap:anywhere/);
  assert.ok(css.indexOf("/* Edit Crew Name (owner)") < css.indexOf("/* Steam Connection Foundation:"));
});

// ---------- database: the real migrations in PGlite ----------
const ME = "11111111-1111-4111-8111-111111111111", MEMBER = "22222222-2222-4222-8222-222222222222", OUTSIDER = "33333333-3333-4333-8333-333333333333", INVITEE = "44444444-4444-4444-8444-444444444444";
const E = { black: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", zshot: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", other: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", fresh: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema realtime;
    grant usage on schema public, private, auth, realtime to anon, authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.entities (entity_id uuid primary key, gamid_handle text unique, display_name text, avatar_media_reference text, visibility text default 'PUBLIC');
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.game_catalog (game_key text primary key, display_name text, is_active boolean default true);
    create table public.notification_types (type_key text primary key, producer text, destination text, active boolean default true);
    create table public.notifications (notification_id bigserial primary key, recipient_entity_id uuid, actor_entity_id uuid, type_key text, created_at timestamptz default now(), read_at timestamptz);
    create table realtime.sent (event text, topic text);
    create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language sql as $$ insert into realtime.sent values (event, topic) $$;
    create function private.notification_cleanup(uuid) returns void language sql as $$ select $$;
    create function private.notifications_owner_entity() returns uuid language sql stable as $$ select null::uuid $$;
    create function private.identity_my_entity() returns uuid language sql stable security definer set search_path = '' as $$ select m.entity_id from public.entity_memberships m where m.user_id = auth.uid() and m.role = 'OWNER' limit 1 $$;
    create function private.identity_entity_by_handle(text) returns uuid language sql stable security definer set search_path = '' as $$ select e.entity_id from public.entities e where e.gamid_handle = $1 $$;
    create function private.get_my_notifications_impl(bigint, integer) returns void language sql as $$ select $$;
    create function public.get_my_notifications(bigint, integer) returns void language sql as $$ select $$;
    grant execute on all functions in schema auth to anon, authenticated;
    insert into public.entities (entity_id, gamid_handle, display_name) values ('${E.black}', 'black', 'Black'), ('${E.zshot}', 'zshot', 'Zshot'), ('${E.other}', 'other', 'Other'), ('${E.fresh}', 'fresh', 'Fresh');
    insert into public.entity_memberships values ('${E.black}', '${ME}', 'OWNER'), ('${E.zshot}', '${MEMBER}', 'OWNER'), ('${E.other}', '${OUTSIDER}', 'OWNER'), ('${E.fresh}', '${INVITEE}', 'OWNER');
    insert into public.game_catalog values ('marvel-rivals', 'Marvel Rivals', true);`);
  await db.exec(read("supabase/migrations/20261003100000_my_crew.sql"));
  // the Crew Wall tables exactly as their migration creates them (to prove a rename never touches them)
  const wall = read("supabase/migrations/20261003120000_crew_wall.sql");
  await db.exec(wall.slice(wall.indexOf("create table public.crew_walls"), wall.indexOf("alter table public.crew_walls enable row level security;")));
  await db.exec(read("supabase/migrations/20261013100000_crew_rename.sql"));
  const as = async uid => db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';");
  const admin = () => db.exec("reset role;");
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  // a Crew "espada" owned by @black with an ACTIVE member, a pending invitation and a published two-stage Crew Wall with two cards
  await as(ME);
  const crew = (await one("select public.create_crew('marvel-rivals', 'espada') as id")).id;
  await db.query("select public.invite_to_crew($1, 'zshot')", [crew]);
  await as(MEMBER); await db.query("select public.respond_to_crew_invite($1, true)", [crew]);
  await as(ME); await db.query("select public.invite_to_crew($1, 'fresh')", [crew]);
  await admin();
  await db.query("insert into public.crew_walls (crew_id, stage_count, published, revision) values ($1, 2, true, 4)", [crew]);
  await db.query(`insert into public.crew_wall_cards values ($1, '${E.black}', 1, 0), ($1, '${E.zshot}', 2, 0)`, [crew]);
  return { db, as, admin, one, crew };
}
const code = error => error?.message ?? String(error);
const snapshot = async (f) => {
  await f.admin();
  const crew = await f.one("select crew_id, game_key, owner_entity_id, created_at from public.crews where crew_id = $1", [f.crew]);
  const members = (await f.db.query("select entity_id, role, status, joined_at, invited_by_entity_id from public.crew_members where crew_id = $1 order by entity_id", [f.crew])).rows;
  const wall = await f.one("select stage_count, published, revision, updated_at from public.crew_walls where crew_id = $1", [f.crew]);
  const cards = (await f.db.query("select entity_id, stage_no, position from public.crew_wall_cards where crew_id = $1 order by entity_id", [f.crew])).rows;
  return JSON.stringify({ crew, members, wall, cards });
};

test("database: the owner renames the Crew (trimmed); ONLY the name changes - id, game, owner, members, invitations, Crew Wall and its cards are identical", async () => {
  const f = await database();
  const before = await snapshot(f);
  await f.admin(); await f.db.exec("delete from realtime.sent");
  await f.as(ME);
  assert.equal((await f.one("select public.rename_crew($1, '  Rivals Night  ') as name", [f.crew])).name, "Rivals Night");
  assert.equal((await f.one("select crew_name from public.get_my_crews() where crew_id = $1", [f.crew])).crew_name, "Rivals Night", "every read sees the new name");
  assert.equal(await snapshot(f), before, "nothing else changed");
  const sent = (await f.db.query("select topic from realtime.sent order by topic")).rows.map(row => row.topic);
  assert.deepEqual(sent, [`identity:user:${ME}`, `identity:user:${MEMBER}`, `identity:user:${INVITEE}`].sort(), "the owner, the member and the invitee are told to re-read (data-free signal)");
  await f.as(MEMBER);
  assert.equal((await f.one("select crew_name from public.get_my_crews() where crew_id = $1", [f.crew])).crew_name, "Rivals Night", "the member sees it too");
  await f.as(INVITEE);
  assert.equal((await f.one("select crew_name from public.get_my_crews() where crew_id = $1", [f.crew])).crew_name, "Rivals Night", "and the pending invitee");
  await f.as(ME);
  assert.equal((await f.one("select public.rename_crew($1, 'Rivals Night') as name", [f.crew])).name, "Rivals Night", "the same name again changes nothing");
});

test("database: a member, an outsider, an invitee and a visitor cannot rename; a Crew that does not exist is CREW_NOT_FOUND", async () => {
  const f = await database();
  const before = await snapshot(f);
  for (const uid of [MEMBER, OUTSIDER, INVITEE]) {
    await f.as(uid);
    await assert.rejects(f.db.query("select public.rename_crew($1, 'Hijacked')", [f.crew]), error => code(error) === "CREW_OWNER_ONLY", uid);
  }
  await f.as(null);
  await assert.rejects(f.db.query("select public.rename_crew($1, 'Hijacked')", [f.crew]), /permission denied/);
  await f.as(ME);
  await assert.rejects(f.db.query("select public.rename_crew('99999999-9999-4999-8999-999999999999', 'Ghost')"), error => code(error) === "CREW_NOT_FOUND");
  assert.equal(await snapshot(f), before);
  await f.admin();
  assert.equal((await f.one("select name from public.crews where crew_id = $1", [f.crew])).name, "espada");
});

test("database: invalid names are refused exactly like at creation, and the name stays", async () => {
  const f = await database();
  await f.as(ME);
  for (const bad of ["", "   ", "x", " y ", "a".repeat(41), "<b>Raid</b>", "Night\u0007Raid", "Line\nBreak", null]) {
    await assert.rejects(f.db.query("select public.rename_crew($1, $2)", [f.crew, bad]), error => code(error) === "INVALID_CREW_NAME", JSON.stringify(bad));
  }
  assert.equal((await f.one("select public.rename_crew($1, $2) as name", [f.crew, "a".repeat(40)])).name, "a".repeat(40), "40 characters is allowed");
  await f.admin();
  assert.equal((await f.one("select name from public.crews where crew_id = $1", [f.crew])).name, "a".repeat(40));
});

test("database: the Crew's game, owner and id are still immutable; the tables stay closed to clients", async () => {
  const f = await database();
  await f.admin();
  await assert.rejects(f.db.query("update public.crews set owner_entity_id = $2 where crew_id = $1", [f.crew, E.zshot]), error => code(error) === "CREW_IMMUTABLE");
  await f.db.query("insert into public.game_catalog values ('valorant', 'Valorant', true)");
  await assert.rejects(f.db.query("update public.crews set game_key = 'valorant' where crew_id = $1", [f.crew]), /CREW_IMMUTABLE|violates foreign key/);
  await f.as(ME);
  await assert.rejects(f.db.query("update public.crews set name = 'Direct' where crew_id = $1", [f.crew]), /permission denied/, "renaming is only possible through the owner RPC");
});

test("migration 20261013100000: only the name rule changes; rename is owner-checked under the row lock and granted to signed-in users only", () => {
  const sql = read("supabase/migrations/20261013100000_crew_rename.sql");
  const code = sql.replace(/--.*$/gm, "");
  assert.deepEqual([...code.matchAll(/create (?:or replace )?function ([\w.]+)\(/g)].map(match => match[1]), ["private.crews_immutable", "private.rename_crew_impl", "public.rename_crew"]);
  assert.match(code, /if new\.game_key is distinct from old\.game_key or new\.owner_entity_id is distinct from old\.owner_entity_id or new\.crew_id is distinct from old\.crew_id then/);
  assert.doesNotMatch(code.slice(code.indexOf("private.crews_immutable"), code.indexOf("create function private.rename_crew_impl")), /new\.name/);
  assert.match(code, /crew public\.crews%rowtype := private\.crew_lock\(candidate_crew\);/);
  assert.match(code, /if crew\.owner_entity_id <> me then raise exception using errcode = '42501', message = 'CREW_OWNER_ONLY'; end if;/);
  assert.match(code, /if char_length\(clean_name\) not between 2 and 40 or clean_name ~ '\[\[:cntrl:\]<>\]' then raise exception using errcode = '22023', message = 'INVALID_CREW_NAME'; end if;/, "the create_crew rule, unchanged");
  assert.match(code, /update public\.crews c set name = clean_name where c\.crew_id = crew\.crew_id;/);
  assert.doesNotMatch(code, /\b(drop|truncate|alter table|insert into|delete from)\b|crew_members m set|crew_walls|crew_wall_cards set/i);
  assert.match(code, /revoke all on function private\.rename_crew_impl\(uuid, text\), public\.rename_crew\(uuid, text\) from public, anon, authenticated;/);
  assert.match(code, /grant execute on function private\.rename_crew_impl\(uuid, text\), public\.rename_crew\(uuid, text\) to authenticated;/);
  assert.doesNotMatch(code, /to anon/);
});
