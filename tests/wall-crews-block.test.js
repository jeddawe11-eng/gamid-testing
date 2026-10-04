// MY CREW as a GamID BLOCK on the Personal Wall (correction of a3c0ae4, which appended a fixed MY CREW section below the Wall). My Crew is now one more entry in the
// Wall editor's GamID Blocks list, directly below My Duo: the owner chooses to add it, places it on any Stage, moves / resizes it like every block, and it is saved
// and published with the Wall. Its data is the server-authoritative public_sections.crews (20261003234309_personal_gamid_crews: PUBLIC GamID, ACTIVE membership,
// existing Crew, PUBLISHED Crew Wall - no toggle). The database validator gains 'crews' in 20261004100000_wall_crews_block (tests/integration/wall-w2-db.sql).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createDocument } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { createWallPersistence } from "../dist/wall/persistence.js";
import { GAMID_BLOCKS, GAMID_BLOCK_INFO, createGamidPayload } from "../dist/wall-kit/gamid.js";
import { paintGamidBlock, BLOCK_TITLES } from "../dist/wall-kit/gamid-blocks.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import { INTERACTIVE_ATTR } from "../dist/wall-kit/interaction.js";
import * as ops from "../dist/wall-kit/ops.js";
import { loadPublicView, loadGamidSnapshot, publicCrewList, ownerCrews } from "../dist/wall-editor/gamid-data.js";
import { normalizeCrews, crewWallHref } from "../dist/public/identity-link.js";
import { preparePublicWall } from "../dist/public/public-wall.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const LOL = "11111111-2222-4333-8444-555555555555";
const VAL = "99999999-2222-4333-8444-555555555555";

// ---------- a small fake DOM (text only; innerHTML is forbidden) ----------
class El {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.hidden = false;
    this.props = new Map(); this.style = { setProperty: (name, value) => this.props.set(name, value), removeProperty: name => this.props.delete(name) };
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  append(...nodes) { for (const node of nodes) if (node) { node.parent = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  remove() {}
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  get textContent() { return this._text + this.children.map(child => child.textContent ?? "").join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  set innerHTML(_) { throw new Error("innerHTML is forbidden"); }
}
const make = tag => new El(tag);
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); (node.children ?? []).forEach(child => all(child, predicate, out)); return out; };
const byClass = (root, cls) => all(root, node => typeof node.className === "string" && node.className.split(" ").includes(cls));

// the server's public section, exactly as get_public_identity sends it
const SECTION = [
  { crew_id: LOL, crew_name: "Espada", game_key: "league_of_legends", game_name: "League of Legends", role: "OWNER", member_count: 2 },
  { crew_id: VAL, crew_name: "Zero", game_key: "valorant", game_name: "Valorant", role: "MEMBER", member_count: 1 },
];
const content = { kind: "gamid", block: "crews", layout: "card" };
const visitorView = (crews, extra = {}) => ({ public: { available: true, games: null, connections: [], crews: publicCrewList(crews, { newTab: false }), ...extra } });

// ---------- 1. the GamID Blocks list ----------
test("GamID Blocks: My Crew is listed directly below My Duo; the editor builds its list from GAMID_BLOCKS in order, each button adding that block", () => {
  assert.equal(GAMID_BLOCKS.indexOf("crews"), GAMID_BLOCKS.indexOf("duo") + 1, "directly below My Duo");
  assert.equal(GAMID_BLOCKS.at(-1), "crews");
  assert.equal(GAMID_BLOCK_INFO.crews.label, "My Crew");
  assert.equal(GAMID_BLOCK_INFO.duo.label, "My Duo");
  const { size, minSize } = GAMID_BLOCK_INFO.crews;
  assert.ok(minSize.width < size.width && minSize.height < size.height, "it uses the shared resize limits like every block");
  assert.equal(BLOCK_TITLES.crews, "MY CREW");
  const tools = read("dist/wall-editor/tools.js");
  assert.match(tools, /for \(const block of GAMID_BLOCKS\) \{\n\s+const info = GAMID_BLOCK_INFO\[block\];\n\s+blocksBox\.append\(h\("button", \{ class: "ed-btn", type: "button", onclick: \(\) => \{ const result = addCustom\("gamid", createGamidPayload\(block\), info\.size\);/,
    "the accepted list: no special case, My Crew is added only when the owner chooses it");
  assert.doesNotMatch(tools, /crews/, "no editor redesign - the list is data-driven");
});

// ---------- 2. adding it to a Stage ----------
const twoStages = () => createDocument({ stageCount: 2 });
const addCrews = (doc, stageId) => ops.addCustomElement(doc, stageId, { type: "gamid", payload: createGamidPayload("crews"), ...GAMID_BLOCK_INFO.crews.size });

test("adding: My Crew is placed inside the chosen Stage as a normal 'gamid' element - nothing is added automatically", () => {
  const doc = twoStages();
  assert.equal(doc.stages.flatMap(stage => stage.elements).length, 0, "a new Wall has no My Crew block");
  const added = addCrews(doc, doc.stages[1].id);
  assert.equal(added.ok, true, String(added.errors));
  const [id] = added.ids;
  assert.equal(added.doc.stages[0].elements.length, 0);
  const element = added.doc.stages[1].elements.find(item => item.id === id);
  assert.equal(element.type, "gamid");
  assert.deepEqual(element.payload, { block: "crews", layout: "card" }, "only WHICH block it is - the data is resolved when the Wall is drawn");
  assert.deepEqual([element.width, element.height], [GAMID_BLOCK_INFO.crews.size.width, GAMID_BLOCK_INFO.crews.size.height]);
  assert.deepEqual(validateDocument(added.doc).errors, []);
  assert.deepEqual(validateDocument({ ...added.doc, stages: [{ ...added.doc.stages[1], elements: [{ ...element, payload: { block: "crew" } }] }] }).errors, [`INVALID_BLOCK:${id}`], "unknown blocks still fail");
});

// ---------- 3. moving / resizing through the existing Wall behaviour ----------
test("positioning: My Crew moves, resizes (down to its own minimum), layers and changes Stage with the shared Wall operations", () => {
  let doc = addCrews(twoStages(), "stage_1").doc;
  const id = doc.stages[0].elements[0].id;
  const start = { ...doc.stages[0].elements[0] };
  const moved = ops.moveElements(doc, [id], -60, 200);
  assert.equal(moved.ok, true);
  doc = moved.doc;
  assert.deepEqual([doc.stages[0].elements[0].x, doc.stages[0].elements[0].y], [start.x - 60, start.y + 200]);
  const grown = ops.resizeElement(doc, id, "se", 40, 60);
  assert.equal(grown.ok, true);
  assert.deepEqual([grown.doc.stages[0].elements[0].width, grown.doc.stages[0].elements[0].height], [start.width + 40, start.height + 60]);
  const shrunk = ops.resizeElement(grown.doc, id, "se", -5000, -5000);
  assert.deepEqual([shrunk.doc.stages[0].elements[0].width, shrunk.doc.stages[0].elements[0].height], [GAMID_BLOCK_INFO.crews.minSize.width, GAMID_BLOCK_INFO.crews.minSize.height], "never smaller than one readable Crew row");
  const across = ops.moveElementsToStage(shrunk.doc, [id], "stage_2");
  assert.equal(across.ok, true);
  assert.equal(across.doc.stages[0].elements.length, 0);
  assert.equal(across.doc.stages[1].elements[0].payload.block, "crews");
  assert.equal(ops.setGamidStyle(across.doc, [id], { radius: 10 }).ok, true, "the shared GamID block styling applies too");
});

// ---------- 4. saving / reloading ----------
const fakeStore = () => {
  const store = { document: createDocument(), revision: 1 };
  const rpc = async (name, body) => {
    if (name === "get_my_wall_draft") return [{ document: structuredClone(store.document), revision: store.revision }];
    if (name === "save_my_wall_draft") {
      if (body.candidate_expected_revision !== store.revision) throw { code: "P0001", message: "WALL_REVISION_CONFLICT" };
      store.document = JSON.parse(JSON.stringify(body.candidate_document)); store.revision += 1;
      return [{ document: structuredClone(store.document), revision: store.revision }];
    }
    throw new Error(`unexpected ${name}`);
  };
  return { store, wall: createWallPersistence({ rpc }) };
};

test("save / reload: a placed My Crew block is stored with the Wall draft and comes back exactly where it was", async () => {
  const { wall } = fakeStore();
  const loaded = await wall.loadDraft();
  let doc = addCrews(loaded.document, "stage_1").doc;
  const id = doc.stages[0].elements[0].id;
  doc = ops.moveElements(doc, [id], 30, 40).doc;
  const saved = await wall.saveDraft(doc, loaded.revision);
  assert.equal(saved.revision, loaded.revision + 1);
  const reloaded = await wall.loadDraft();
  assert.deepEqual(reloaded.document, doc, "unchanged by the round trip");
  assert.equal(reloaded.document.stages[0].elements[0].payload.block, "crews");
  await assert.rejects(wall.saveDraft({ ...doc, stages: [{ ...doc.stages[0], elements: [{ ...doc.stages[0].elements[0], payload: { block: "team" } }] }] }, reloaded.revision), /INVALID_WALL_DOCUMENT/);
  const migration = read("supabase/migrations/20261004100000_wall_crews_block.sql");
  assert.match(migration, /\(payload ->> 'block'\) not in \('profile', 'roles', 'games', 'connections', 'duo', 'crews'\)/, "the database validator accepts it too (the save is re-validated there)");
});

test("the database migration is the accepted payload validator with ONLY 'crews' added to the block list", () => {
  const fn = sql => { const from = sql.indexOf("create or replace function private.wall_element_payload_errors"); return sql.slice(from, sql.indexOf("$$;", from) + 3); };
  const next = fn(read("supabase/migrations/20261004100000_wall_crews_block.sql"));
  const previous = fn(read("supabase/migrations/20261002150000_my_duo.sql"));
  assert.ok(next.length > 1000 && previous.length > 1000);
  assert.equal(next.replace("'duo', 'crews')", "'duo')"), previous);
  assert.doesNotMatch(read("supabase/migrations/20261004100000_wall_crews_block.sql").replace(/--.*$/gm, ""), /\bgrant\b|\brevoke\b|alter table|create table|drop |public_sections/i, "nothing else changes");
});

// ---------- 5. published visitor rendering + 6. the Crew link + 7. multiple Crews ----------
const publicApi = (sections = { crews: SECTION }) => ({
  loadPublicWallPicture: async () => null, signPublicWallVideo: async () => null,
  getPublicIdentity: async handle => ({ gamid_handle: handle, display_name: "Black", role_keys: [], public_sections: sections }),
  getPublicMyGames: async () => ({ games: [], total_count: 0 }), loadPublicAvatar: async () => null,
});
const publishedWith = (...blocks) => {
  let doc = createDocument();
  for (const block of blocks) doc = ops.addCustomElement(doc, "stage_1", { type: "gamid", payload: createGamidPayload(block), ...GAMID_BLOCK_INFO[block].size }).doc;
  return { document: doc, assets: [] };
};
const paintPublished = ready => paintDocument(ready.doc, 400, make, { mode: "view", assets: ready.assets, gamid: ready.gamid });

test("published Wall: a visitor sees the My Crew block where the owner placed it - MY CREW / game / Crew name / OWNER · N MEMBERS - each Crew linking to its Crew Wall", async () => {
  const ready = await preparePublicWall(publishedWith("crews"), "black", publicApi());
  const painted = paintPublished(ready);
  const block = byClass(painted.stages[0], "wall-gamid-crews")[0];
  assert.ok(block, "drawn inside the Stage");
  assert.match(block.textContent, /^MY CREW/);
  const cards = byClass(block, "wall-crew-card");
  assert.equal(cards.length, 2, "several Crews (one per game) in the same block");
  assert.deepEqual(cards.map(card => card.tag), ["a", "a"]);
  assert.deepEqual(cards.map(card => card.attrs.href), [`/crew/?c=${LOL}`, `/crew/?c=${VAL}`]);
  assert.equal(cards[0].textContent, "LEAGUE OF LEGENDSEspadaOWNER · 2 MEMBERS›");
  assert.equal(cards[1].textContent, "VALORANTZeroMEMBER · 1 MEMBER›");
  assert.ok(cards.every(card => card.attrs[INTERACTIVE_ATTR] === "true" && card.attrs.target === undefined), "a tap target; a visitor's Wall navigates in place");
  assert.equal(byClass(block, "wall-crew-list")[0].attrs[INTERACTIVE_ATTR], "true", "the list scrolls inside the block when several Crews do not fit");
  assert.match(cards[0].attrs["aria-label"], /My Crew for League of Legends: Espada, owner, 2 members\. Open the Crew Wall/);
});

test("the Crew link: /crew/?c=<id> on the permanent route, the crew/ folder on the temporary route, a new tab in the editor's Preview; never anything but a same-origin path", async () => {
  assert.equal(crewWallHref(LOL, { pathname: "/@black" }), `/crew/?c=${LOL}`);
  assert.equal(crewWallHref(LOL, { pathname: "/gamid-testing/public/index.html" }), `/gamid-testing/crew/?c=${LOL}`);
  assert.match(read("dist/public/public-wall.js"), /crewLink: \{ newTab: false, href: crewId => crewWallHref\(crewId, \{ pathname \}\) \}/);
  assert.match(read("dist/wall-editor/editor.js"), /crewLink: \{ newTab: true, href: crewId => `\$\{new URL\("\.\.\/crew\/", location\.href\)\.pathname\}\?c=\$\{crewId\}` \}/);
  const preview = paintGamidBlock(content, { public: { available: true, crews: publicCrewList(SECTION, { newTab: true, href: id => `/crew/?c=${id}` }) } }, make, { interactive: true });
  const card = byClass(preview, "wall-crew-card")[0];
  assert.equal(card.attrs.target, "_blank", "the editor is never left");
  assert.equal(card.attrs.rel, "noopener");
  for (const href of ["https://evil.example/crew/", "//evil.example", "javascript:alert(1)"]) {
    assert.equal(publicCrewList(SECTION, { href: () => href })[0].href, null, href);
    const unsafe = paintGamidBlock(content, { public: { available: true, crews: [{ ...normalizeCrews(SECTION)[0], href }] } }, make, { interactive: true });
    assert.equal(byClass(unsafe, "wall-crew-card")[0].tag, "div", href);
    assert.equal(byClass(unsafe, "wall-crew-card")[0].attrs.href, undefined);
  }
});

test("multiple Crews: every well-formed server entry is listed (text only); malformed or unsafe entries are dropped; a missing count is simply not shown", () => {
  const list = normalizeCrews([...SECTION, { crew_id: "x", crew_name: "Bad", game_name: "G", role: "OWNER" }, { crew_id: LOL, crew_name: "<script>", game_name: "G", role: "OWNER" }, { crew_id: LOL, crew_name: "Ok", game_name: "G", role: "ADMIN" }, { ...SECTION[0], member_count: "5" }]);
  assert.deepEqual(list.map(crew => [crew.name, crew.members]), [["Espada", 2], ["Zero", 1], ["Espada", null]]);
  const root = paintGamidBlock(content, visitorView([SECTION[0], { ...SECTION[1], member_count: null }]), make, { interactive: true });
  assert.deepEqual(byClass(root, "wall-crew-meta").map(node => node.textContent), ["OWNER · 2 MEMBERS", "MEMBER"]);
});

test("visitor view only: no Crew -> a plain line; a non-public GamID -> not public; the owner's private Crews never leak into VIEW mode", () => {
  assert.match(paintGamidBlock(content, visitorView([]), make, { interactive: true }).textContent, /No Crew is shown on this GamID yet/);
  assert.match(paintGamidBlock(content, { public: { available: false } }, make, { interactive: true }).textContent, /not public/);
  const owner = paintGamidBlock(content, { ...visitorView([]), crews: [{ ...normalizeCrews(SECTION)[0], name: "SecretCrew", shownToVisitors: false }] }, make, { interactive: true });
  assert.doesNotMatch(owner.textContent, /SecretCrew/);
});

test("visitor data: the block's list comes ONLY from public_sections.crews, through the anonymous public identity", async () => {
  const view = await loadPublicView(publicApi(), "black", { crewLink: { newTab: false, href: id => crewWallHref(id, { pathname: "/@black" }) } });
  assert.deepEqual(view.crews.map(crew => [crew.gameName, crew.name, crew.role, crew.members, crew.href]), [["League of Legends", "Espada", "OWNER", 2, `/crew/?c=${LOL}`], ["Valorant", "Zero", "MEMBER", 1, `/crew/?c=${VAL}`]]);
  assert.deepEqual((await loadPublicView(publicApi({}), "black")).crews, []);
  assert.deepEqual((await loadPublicView({ getPublicIdentity: async () => null }, "black")).crews, []);
});

// ---------- the owner's editor view ----------
test("Wall EDIT: the owner designs with their ACTIVE Crews (no links); Crews visitors would not see yet are marked, and PRIVATE shows while none is public", async () => {
  const rows = [
    { crew_id: LOL, crew_name: "Espada", game_key: "league_of_legends", game_name: "League of Legends", my_role: "OWNER", my_status: "ACTIVE", member_count: 2 },
    { crew_id: VAL, crew_name: "Zero", game_key: "valorant", game_name: "Valorant", my_role: "MEMBER", my_status: "ACTIVE", member_count: 1 },
    { crew_id: "33333333-2222-4333-8444-555555555555", crew_name: "Invite", game_key: "dota", game_name: "Dota 2", my_role: "MEMBER", my_status: "INVITED", member_count: 3 },
  ];
  const own = ownerCrews(rows, normalizeCrews([SECTION[0]]));
  assert.deepEqual(own.map(crew => [crew.name, crew.role, crew.shownToVisitors]), [["Espada", "OWNER", true], ["Zero", "MEMBER", false]], "never an invitation");
  const edit = paintGamidBlock(content, { crews: own, visibility: { crews: true } }, make, {});
  assert.deepEqual(byClass(edit, "wall-crew-card").map(card => card.tag), ["div", "div"], "the canvas keeps every tap for selecting and dragging");
  assert.doesNotMatch(edit.textContent, /PRIVATE/);
  assert.equal(byClass(edit, "wall-crew-note").length, 1);
  assert.match(byClass(edit, "wall-crew-note")[0].textContent, /until its Crew Wall is published/);
  assert.match(paintGamidBlock(content, { crews: own.map(crew => ({ ...crew, shownToVisitors: false })), visibility: { crews: false } }, make, {}).textContent, /PRIVATE/);
  assert.match(paintGamidBlock(content, { crews: [], visibility: { crews: false } }, make, {}).textContent, /No Crew yet/);
  const base = {
    getIdentity: async () => ({ gamid_handle: "black", display_name: "Black" }), getIdentityProfile: async () => ({}), getMyConnections: async () => [], getMyPublicGamesSettings: async () => null,
    getMyGameDisplaySettings: async () => ({}), getMyDiscoveredGames: async () => [], getMyManualGames: async () => [], getMyDuo: async () => [], ...publicApi({ crews: [SECTION[0]] }),
    getMyCrews: async () => rows,
  };
  const snapshot = await loadGamidSnapshot(base);
  assert.deepEqual(snapshot.crews.map(crew => crew.name), ["Espada", "Zero"]);
  assert.equal(snapshot.visibility.crews, true);
  assert.deepEqual(snapshot.public.crews.map(crew => crew.name), ["Espada"], "Preview shows only what a visitor gets");
  const failing = await loadGamidSnapshot({ ...base, getMyCrews: async () => { throw new Error("offline"); } });
  assert.deepEqual(failing.crews, [], "a failed read never breaks the other blocks");
});

// ---------- 8. removing the block ----------
test("removing: deleting the My Crew block takes it off the Wall; the saved and published Wall then shows no Crew at all", async () => {
  const { wall } = fakeStore();
  const loaded = await wall.loadDraft();
  const doc = addCrews(loaded.document, "stage_1").doc;
  const id = doc.stages[0].elements[0].id;
  const removed = ops.deleteElements(doc, [id]);
  assert.equal(removed.ok, true);
  assert.equal(removed.doc.stages[0].elements.length, 0);
  await wall.saveDraft(removed.doc, loaded.revision);
  const reloaded = await wall.loadDraft();
  assert.equal(JSON.stringify(reloaded.document).includes("crews"), false);
  const ready = await preparePublicWall({ document: reloaded.document, assets: [] }, "black", publicApi());
  assert.equal(byClass(paintPublished(ready).stages[0], "wall-crew-card").length, 0, "the Crews exist on the server, but the owner chose not to show the block");
});

// ---------- 9. no automatic MY CREW section below the Wall ----------
test("no automatic MY CREW: the public page appends nothing below the Wall - My Crew exists only as a Wall block the owner placed", () => {
  assert.equal(existsSync(new URL("../dist/public/public-crews.js", import.meta.url)), false, "the fixed-section module is gone");
  const page = read("dist/public/public.js");
  assert.doesNotMatch(page, /crews|public-crews|crewsSection|crewsBlock/i);
  const css = read("dist/public/public.css");
  assert.doesNotMatch(css, /public-crew|MY CREW/);
  assert.match(css, /\.public-shell\[data-mode="flow"\] \.replay-button\{grid-area:4\/1/, "the accepted page grid (Replay Intro right after the profile body / Wall)");
  assert.doesNotMatch(read("package.json"), /public-crews/);
  const sections = page.slice(page.indexOf("export function renderPublicSections"), page.indexOf("\n}\n", page.indexOf("export function renderPublicSections")));
  assert.ok(sections.length > 100);
  assert.doesNotMatch(sections, /crew/i, "the Public Profile sections do not render it either");
});

// ---------- 10. My Duo unchanged ----------
test("My Duo unchanged: still its own block (same place, size, title, badge and link) and drawn side by side with My Crew on one Stage", async () => {
  assert.deepEqual(GAMID_BLOCKS.slice(0, 5), ["profile", "roles", "games", "connections", "duo"]);
  assert.deepEqual(GAMID_BLOCK_INFO.duo, { label: "My Duo", description: "Your mutually accepted Duo. Visitors can open their GamID.", size: { width: 800, height: 260 }, minSize: { width: 300, height: 180 } });
  assert.equal(BLOCK_TITLES.duo, "MY DUO");
  const sections = { crews: SECTION, duo: { gamid_handle: "zshot", display_name: "HAMZA" } };
  const ready = await preparePublicWall(publishedWith("duo", "crews"), "black", publicApi(sections));
  const stage = paintPublished(ready).stages[0];
  const duo = byClass(stage, "wall-duo-card")[0];
  assert.equal(duo.tag, "a");
  assert.equal(duo.attrs.href, "/@zshot?from=black");
  assert.match(byClass(stage, "wall-gamid-duo")[0].textContent, /MY DUO.*Mutual Duo.*HAMZA/);
  assert.equal(byClass(byClass(stage, "wall-gamid-duo")[0], "wall-crew-card").length, 0);
  assert.equal(byClass(byClass(stage, "wall-gamid-crews")[0], "wall-duo-card").length, 0);
  assert.equal(byClass(stage, "wall-crew-card").length, 2);
});
