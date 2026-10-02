// My Crew V1 - Slice 2: Crew Mini Wall. Database rules run on TESTING in tests/integration/crew-wall-db.sql; these tests pin the browser side and the migration shape.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { crewWallModel, buildCrewWallDocument, CARD, CREW_CANVAS_MIN_HEIGHT } from "../dist/crew/crew-wall.js";
import { publicPerson, crewIdFromSearch as pageCrewId, SCROLL_KEY } from "../dist/crew/crew.js";
import { validateDocument } from "../dist/wall/validate.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { crewIdFromSearch, crewWallHref, goBack } from "../dist/public/identity-link.js";
import { createVisitorNav } from "../dist/public/visitor-nav.js";
import { wallState, normalize, ops, renderCrewWallBox, crewWallHrefFor } from "../dist/account/crew-wall-panel.js";
import { createCrewPanel } from "../dist/account/my-crew.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ID = "11111111-2222-4333-8444-555555555555";

// ---------- a small fake DOM ----------
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.classList = { toggle: () => {} }; this.style = { setProperty: () => {} }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { for (const node of nodes) if (node) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  async fire(type, event = {}) { for (const handler of this.listeners[type] || []) await handler({ target: this, preventDefault() {}, ...event }); }
}
const element = (tag, className, text) => { const node = new El(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const buttons = (root, text) => all(root, node => node.tag === "button" && node.textContent === text);
const tick = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(resolve => setTimeout(resolve, 0)); };

// ---------- the model and the generated Wall document ----------
const view = (extra = {}) => ({ crew_id: ID, crew_name: "Espada", game_key: "league_of_legends", game_name: "League of Legends", accent_color: null, stage_count: 2, published: true, member_count: 3, owner_handle: "black",
  cards: [{ handle: "zshot", stage: 2, position: 0, role: "MEMBER" }, { handle: "black", stage: 1, position: 0, role: "OWNER" }, { handle: "third", stage: 1, position: 1, role: "MEMBER" }], ...extra });

test("model: the server's Crew Wall -> clean model (sorted by stage / position); malformed cards and ids are dropped", () => {
  const model = crewWallModel(view({ cards: [...view().cards, { handle: "bad handle", stage: 1, position: 3 }, { handle: "x9z", stage: 9, position: 0 }] }));
  assert.deepEqual(model.cards.map(card => `${card.handle}@${card.stage}.${card.position}`), ["black@1.0", "third@1.1", "zshot@2.0"]);
  assert.equal(model.cards[0].owner, true);
  assert.equal(model.accent, "#3d2a8a", "no approved game presentation yet -> neutral GamID accent");
  assert.equal(crewWallModel({ crew_id: "not-a-uuid" }), null);
  assert.equal(crewWallModel(null), null);
});

test("render: the model becomes an ORDINARY Wall document the accepted Wall core validates - one title per stage + member cards in their order", () => {
  const model = crewWallModel(view());
  const doc = buildCrewWallDocument(model);
  assert.deepEqual(validateDocument(doc).errors, [], "valid for the Wall engine (stages, scale, background)");
  assert.equal(doc.stages.length, 2);
  assert.deepEqual(doc.stages[0].elements.map(el => el.id), ["t1", "m-black", "m-third"]);
  assert.deepEqual(doc.stages[1].elements.map(el => el.id), ["t2", "m-zshot"]);
  assert.equal(doc.background.kind, "gradient");
  const big = buildCrewWallDocument(crewWallModel(view({ cards: Array.from({ length: 15 }, (_, i) => ({ handle: `p${String(i).padStart(3, "0")}`, stage: 1, position: i, role: "MEMBER" })) })));
  assert.deepEqual(validateDocument(big).errors, []);
  assert.ok(big.canvas.height > CREW_CANVAS_MIN_HEIGHT, "a full Crew grows the stage instead of overflowing it");
  const last = big.stages[0].elements.at(-1);
  assert.ok(last.y + last.height <= big.canvas.height);
  assert.equal(CARD.columns, 2);
});

test("isolation: the Crew element types exist only where the Crew renderer is loaded - the personal Wall editor and the personal Wall registry never learn them", () => {
  assert.ok(elementRegistry.get("crewMember") && elementRegistry.get("crewTitle"), "registered by crew-wall.js (this test imports it)");
  for (const dir of ["dist/wall-editor", "dist/wall-kit", "dist/wall"]) {
    for (const file of readdirSync(new URL(`../${dir}/`, import.meta.url)).filter(name => name.endsWith(".js"))) {
      assert.doesNotMatch(read(`${dir}/${file}`), /crew\/crew-wall|crewMember|crewTitle/, `${dir}/${file} knows nothing about Crew Walls`);
    }
  }
  assert.deepEqual(validateDocument(buildCrewWallDocument(crewWallModel(view({ cards: [{ handle: "black", stage: 1, position: 0, role: "OWNER", url: "https://evil.example" }] })))).errors, [], "extra server data never reaches the document");
  const crafted = { schemaVersion: 1, canvas: { width: 1000, height: 1778 }, stages: [{ id: "s1", elements: [{ id: "m-x", type: "crewMember", x: 0, y: 0, width: 400, height: 200, z: 1, payload: { handle: "black", href: "https://evil.example" } }] }] };
  assert.notDeepEqual(validateDocument(crafted).errors, [], "a card payload is ONLY a handle - no link / URL can be smuggled in");
  const sql = read("supabase/migrations/20261003120000_crew_wall.sql");
  assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ""), /wall_drafts|wall_publications|wall_assets|save_my_wall_draft/, "the Crew Wall migration never touches the personal Wall");
});

// ---------- member card data (privacy) ----------
test("member cards use ONLY the member's public GamID response: name, primary role, and the Crew game's public section (rank only when their stats are public)", () => {
  const identity = { display_name: "Zshot", primary_role_key: "competitive_player", role_catalog: [{ key: "competitive_player", label: "Competitive Player" }],
    public_sections: { league: { game_name: "Hamza", tag_line: "EUW", rank_state: "RANKED", tier: "GOLD", division: "II" } } };
  assert.deepEqual(publicPerson(identity, "league_of_legends", "blob:a"), { displayName: "Zshot", role: "Competitive Player", gameLine: "Hamza#EUW · Gold II", avatarUrl: "blob:a" });
  const noStats = { ...identity, public_sections: { league: { game_name: "Hamza", tag_line: "EUW" } } };
  assert.equal(publicPerson(noStats, "league_of_legends").gameLine, "Hamza#EUW", "no rank unless the member shows ranks & stats");
  assert.equal(publicPerson({ ...identity, public_sections: {} }, "league_of_legends").gameLine, "", "League hidden on their GamID -> nothing about League");
  assert.equal(publicPerson(identity, "valorant").gameLine, "", "only the Crew's game");
  assert.equal(publicPerson(null, "league_of_legends"), null, "a GamID that is not public shows nothing");
  const page = read("dist/crew/crew.js");
  assert.match(page, /getPublicIdentity\(card\.handle\)/, "resolved live through the accepted public identity function - no stored snapshot");
  assert.doesNotMatch(page, /getMyConnections|getMyGameProfiles|get_my_/, "never an owner-only read");
});

// ---------- route + navigation ----------
test("route: the Crew Wall lives at /crew/?c=<id> (never under /@); member links carry ?crew=<id>; ids are validated", () => {
  assert.equal(pageCrewId(`?c=${ID}`), ID);
  assert.equal(pageCrewId("?c=../../etc"), "");
  assert.equal(crewWallHref(ID), `/crew/?c=${ID}`);
  assert.equal(crewWallHref(ID, { pathname: "/gamid-testing/public/index.html" }), `/gamid-testing/crew/?c=${ID}`);
  assert.equal(crewWallHref("<script>"), null);
  assert.equal(crewIdFromSearch(`?crew=${ID.toUpperCase()}`), ID);
  assert.equal(crewIdFromSearch("?crew=javascript:alert(1)"), "");
  assert.match(read("dist/crew/crew.js"), /cardHref: handle => `\$\{new URL\(`\.\.\/@\$\{handle\}`, location\.href\)\.pathname\}\?crew=\$\{encodeURIComponent\(model\.crewId\)\}`/);
  assert.equal(SCROLL_KEY(ID), `gamid.crewWall.scroll.${ID}`);
  const wrangler = read("wrangler.jsonc");
  assert.match(wrangler, /"run_worker_first": \["\/@\*"\]/, "only /@* is dynamic - /crew/ is a static page, no collision");
});

test("navigation: on a member's GamID opened from the Crew Wall - Back to <Crew> + Skip Intro (the accepted My Duo pattern); Back returns to the same Crew Wall", async () => {
  const skips = [];
  const nav = createVisitorNav({ crew: ID, pathname: "/@zshot", doc: { createElement: tag => new El(tag) }, onSkip: () => skips.push(1) });
  const back = all(nav.element, node => node.className === "identity-back")[0];
  const skip = all(nav.element, node => node.className === "identity-skip")[0];
  assert.equal(back.href, `/crew/?c=${ID}`);
  assert.match(back.textContent, /Back to Crew/);
  nav.setBackName("Espada");
  assert.match(back.textContent, /Back to Espada/);
  nav.setBackName("<img onerror=x>");
  assert.match(back.textContent, /Back to Espada/, "an unsafe name is ignored");
  nav.setIntroState("intro");
  assert.equal(skip.hidden, false);
  await skip.fire("click");
  assert.deepEqual(skips, [1]);
  nav.setIntroState("profile");
  assert.equal(skip.hidden, true);
  const history = { length: 3, back() { this.went = true; } };
  assert.equal(goBack({ preventDefault() {} }, { href: `/crew/?c=${ID}`, referrer: `https://site.example/crew/?c=${ID}`, origin: "https://site.example", history }), true, "history back keeps the stage + scroll");
  assert.ok(history.went);
  assert.equal(goBack({}, { href: `/crew/?c=${ID}`, referrer: "https://site.example/crew/?c=99999999-2222-4333-8444-555555555555", origin: "https://site.example", history: { length: 3, back() { throw new Error("no"); } } }), false, "another Crew: open the right one instead");
  const page = read("dist/public/public.js");
  assert.match(page, /if \(visitorNav && fromCrew\) getPublicCrewWall\(fromCrew\)\.then\(view => visitorNav\.setBackName\(view\?\.crew_name\), \(\) => \{\}\);/);
  const duo = createVisitorNav({ from: "black", pathname: "/@zshot", doc: { createElement: tag => new El(tag) } });
  assert.equal(all(duo.element, node => node.className === "identity-back")[0].href, "/@black", "My Duo navigation is unchanged");
});

// ---------- the owner's editor ----------
const wallView = { stage_count: 1, stages_allowed: 2, published: false, revision: 4, cards: [{ handle: "black", stage: 1, position: 0 }, { handle: "zshot", stage: 1, position: 1 }] };

test("editor ops: place / reorder / move between stages / remove from the Wall / drop the last stage - always normalized positions", () => {
  const wall = wallState(wallView);
  assert.deepEqual(ops.move(wall, "zshot", -1), [{ handle: "zshot", stage: 1, position: 0 }, { handle: "black", stage: 1, position: 1 }]);
  const two = { ...wall, stageCount: 2 };
  assert.deepEqual(ops.toStage(two, "zshot", 2), [{ handle: "black", stage: 1, position: 0 }, { handle: "zshot", stage: 2, position: 0 }]);
  assert.deepEqual(ops.remove(wall, "zshot"), [{ handle: "black", stage: 1, position: 0 }], "off the Wall only - the Crew membership is untouched");
  assert.deepEqual(ops.place(wall, "third", 1), [...wall.cards, { handle: "third", stage: 1, position: 2 }]);
  const withStage2 = { ...two, cards: [{ handle: "black", stage: 1, position: 0 }, { handle: "zshot", stage: 2, position: 0 }] };
  assert.deepEqual(ops.removeLastStage(withStage2), [{ handle: "black", stage: 1, position: 0 }, { handle: "zshot", stage: 1, position: 1 }], "dropping Stage 2 keeps its cards");
  assert.deepEqual(normalize([{ handle: "a", stage: 1, position: 7 }, { handle: "b", stage: 1, position: 9 }], 1).map(card => card.position), [0, 1]);
});

test("editor box: usage 1 / 2, Add Stage 2 within the server allowance, members not yet placed can be added; at the allowance no Add Stage", async () => {
  const saves = [];
  const members = [{ gamid_handle: "black", display_name: "Black", status: "ACTIVE", role: "OWNER" }, { gamid_handle: "zshot", display_name: "Zshot", status: "ACTIVE" }, { gamid_handle: "third", display_name: "Third", status: "ACTIVE" }, { gamid_handle: "invitee", status: "INVITED" }];
  const button = (text, className, onClick, disabled = false) => { const node = element("button", className, text); node.disabled = disabled; node.addEventListener("click", onClick); return node; };
  const box = renderCrewWallBox({ crew: { id: ID }, wall: wallState(wallView), members, element, button, editing: true, onToggleEdit() {}, save: (cards, stageCount) => saves.push([cards, stageCount]), publish() {} });
  assert.match(box.textContent, /Stages 1 \/ 2 used · 2 member cards/);
  assert.match(box.textContent, /NOT PUBLISHED/);
  assert.match(box.textContent, /NOT ON THE WALL/);
  assert.doesNotMatch(box.textContent, /invitee/, "only ACTIVE members can be placed");
  await buttons(box, "Add Stage 2")[0].fire("click");
  assert.equal(saves.at(-1)[1], 2);
  await buttons(box, "Add to Stage 1")[0].fire("click");
  assert.deepEqual(saves.at(-1)[0].map(card => card.handle), ["black", "zshot", "third"]);
  const full = renderCrewWallBox({ crew: { id: ID }, wall: wallState({ ...wallView, stage_count: 2 }), members, element, button, editing: true, onToggleEdit() {}, save() {}, publish() {} });
  assert.equal(buttons(full, "Add Stage 3").length, 0);
  assert.match(full.textContent, /uses all 2 stages available/);
  assert.equal(crewWallHrefFor(ID), `../crew/?c=${ID}`);
});

test("My Crew panel: the owner's Crew card carries the Crew Wall box and saves with the Wall's revision; a member only gets Open Crew Wall", async () => {
  const calls = [];
  const crewRow = role => ({ crew_id: ID, game_key: "league_of_legends", game_name: "League of Legends", crew_name: "Espada", my_role: role, my_status: "ACTIVE", owner_handle: "black", member_count: 2, pending_count: 0, max_members: 15 });
  const members = [{ gamid_handle: "black", display_name: "Black", role: "OWNER", status: "ACTIVE", is_published: true }, { gamid_handle: "zshot", display_name: "Zshot", role: "MEMBER", status: "ACTIVE", is_published: true }];
  const api = role => ({
    getMyCrews: async () => [crewRow(role)], getCrewMembers: async () => members,
    getMyCrewWall: async id => { calls.push(["getMyCrewWall", id]); return wallView; },
    saveCrewWall: async (...args) => { calls.push(["saveCrewWall", ...args]); return 5; },
    setCrewWallPublished: async (...args) => { calls.push(["publish", ...args]); return true; },
  });
  const ownerRoot = element("div");
  const owner = createCrewPanel({ api: api("OWNER"), root: ownerRoot, message: element("p"), element, timers: { setTimeout: () => 1, clearTimeout() {} } });
  await owner.load();
  assert.match(ownerRoot.textContent, /CREW WALL/);
  assert.match(ownerRoot.textContent, /Stages 1 \/ 2 used/);
  await buttons(ownerRoot, "Edit Crew Wall")[0].fire("click");
  await buttons(ownerRoot, "↓")[0].fire("click"); await tick();
  assert.deepEqual(calls.find(call => call[0] === "saveCrewWall").slice(1), [ID, 1, [{ handle: "zshot", stage: 1, position: 0 }, { handle: "black", stage: 1, position: 1 }], 4]);
  await buttons(ownerRoot, "Publish")[0].fire("click"); await tick();
  assert.deepEqual(calls.find(call => call[0] === "publish").slice(1), [ID, true]);
  const memberRoot = element("div");
  const memberCalls = api("MEMBER");
  const member = createCrewPanel({ api: memberCalls, root: memberRoot, message: element("p"), element, timers: { setTimeout: () => 1, clearTimeout() {} } });
  await member.load();
  assert.doesNotMatch(memberRoot.textContent, /Edit Crew Wall|Publish/);
  assert.equal(all(memberRoot, node => node.tag === "a" && node.textContent === "Open Crew Wall")[0].href, `../crew/?c=${ID}`);
});

// ---------- migration shape ----------
test("migration: placements reference the membership row (cleanup is automatic), only ACTIVE members, one central stage allowance, visitors get only the published view", () => {
  const sql = read("supabase/migrations/20261003120000_crew_wall.sql");
  assert.match(sql, /constraint crew_wall_cards_member_fk foreign key \(crew_id, entity_id\) references public\.crew_members \(crew_id, entity_id\) on delete cascade/);
  assert.match(sql, /crew_id uuid primary key references public\.crews\(crew_id\) on delete cascade/, "the Wall goes with its Crew");
  assert.match(sql, /create trigger crew_wall_cards_active_member before insert or update on public\.crew_wall_cards/);
  assert.match(sql, /alter table private\.crew_policy add column wall_stage_allowance integer not null default 2/);
  assert.match(sql, /create function private\.crew_wall_stage_allowance\(candidate_crew uuid\)/, "THE place a Crew's allowance is decided (future plans)");
  assert.match(sql, /if candidate_stage_count > private\.crew_wall_stage_allowance\(candidate_crew\) then raise exception using errcode = '54000', message = 'CREW_WALL_STAGE_LIMIT'/);
  assert.match(sql, /revoke all on table public\.crew_walls, public\.crew_wall_cards from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function private\.get_public_crew_wall_impl\(uuid\), public\.get_public_crew_wall\(uuid\) to anon, authenticated;/);
  assert.equal((sql.match(/to anon/g) || []).length, 1, "nothing else is open to visitors");
  assert.match(sql, /select private\.crew_wall_view\(w\.crew_id, false\) from public\.crew_walls w where w\.crew_id = candidate_crew and w\.published;/);
  assert.match(sql, /where k\.crew_id = c\.crew_id and \(candidate_preview or e\.visibility = 'PUBLIC'\)/, "a member whose GamID is not public never appears to visitors");
  assert.match(sql, /logo_path text check \(logo_path is null or logo_path ~ '\^\[a-z0-9\]\[a-z0-9\/_\.-\]\{0,199\}\$'\)/, "approved media are GamID storage paths, never URLs");
});
