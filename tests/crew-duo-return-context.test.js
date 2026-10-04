// My Crew / My Duo final polish: on a PUBLISHED Personal GamID Wall, My Crew and My Duo navigate in the SAME tab and the destination returns to the originating
// GamID. One navigation system: the `from` handle My Duo already carried (/@duo?from=<owner>) now also rides on the Crew link (/crew/?c=<id>&from=<owner>); the Crew
// Wall shows the shared visitor navigation ("Back to @<owner>") and keeps `from` on member cards, so Personal GamID -> Crew -> Member -> Back to Crew -> Back to
// @<owner> works, with history back whenever the previous page IS the destination. The editor's Preview keeps opening a new tab (the editor is never left).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument } from "../dist/wall/schema.js";
import { GAMID_BLOCK_INFO, createGamidPayload } from "../dist/wall-kit/gamid.js";
import { paintGamidBlock } from "../dist/wall-kit/gamid-blocks.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import * as ops from "../dist/wall-kit/ops.js";
import { publicCrewList } from "../dist/wall-editor/gamid-data.js";
import { crewWallHref, gamidHref, goBack, backHandle } from "../dist/public/identity-link.js";
import { createVisitorNav } from "../dist/public/visitor-nav.js";
import { preparePublicWall } from "../dist/public/public-wall.js";
import { memberHref } from "../dist/crew/crew.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const CREW = "46705501-3848-44d3-8523-f2047965c9f1";
const CREW2 = "99999999-2222-4333-8444-555555555555";

class El {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.hidden = false;
    this.style = { setProperty() {}, removeProperty() {} }; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
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
}
const make = tag => new El(tag);
const doc = { createElement: make };
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); (node.children ?? []).forEach(child => all(child, predicate, out)); return out; };
const byClass = (root, cls) => all(root, node => typeof node.className === "string" && node.className.split(" ").includes(cls));
const backOf = nav => byClass(nav.element, "identity-back")[0];

// a published Wall of `owner` with My Duo + My Crew, prepared exactly as the visitor page prepares it
const publicApi = owner => ({
  loadPublicWallPicture: async () => null, signPublicWallVideo: async () => null, loadPublicAvatar: async () => null, getPublicMyGames: async () => ({ games: [], total_count: 0 }),
  getPublicIdentity: async handle => ({ gamid_handle: handle, display_name: owner, role_keys: [], public_sections: {
    duo: { gamid_handle: "zshot", display_name: "HAMZA" },
    crews: [{ crew_id: CREW, crew_name: "Espada", game_key: "league_of_legends", game_name: "League of Legends", role: "OWNER", member_count: 2 },
            { crew_id: CREW2, crew_name: "Zero", game_key: "valorant", game_name: "Valorant", role: "MEMBER", member_count: 3 }],
  } }),
});
async function publishedStage(owner) {
  let wallDoc = createDocument();
  for (const block of ["duo", "crews"]) wallDoc = ops.addCustomElement(wallDoc, "stage_1", { type: "gamid", payload: createGamidPayload(block), ...GAMID_BLOCK_INFO[block].size }).doc;
  const ready = await preparePublicWall({ document: wallDoc, assets: [] }, owner, publicApi(owner));
  return paintDocument(ready.doc, 400, make, { mode: "view", assets: ready.assets, gamid: ready.gamid }).stages[0];
}

test("published My Crew opens in the SAME tab and carries the originating GamID (any owner - nothing hard-coded)", async () => {
  for (const owner of ["black", "zshot"]) {
    const cards = byClass(await publishedStage(owner), "wall-crew-card");
    assert.deepEqual(cards.map(card => card.attrs.href), [`/crew/?c=${CREW}&from=${owner}`, `/crew/?c=${CREW2}&from=${owner}`]);
    for (const card of cards) { assert.equal(card.tag, "a"); assert.equal(card.attrs.target, undefined, "no new tab / window for visitors"); assert.equal(card.attrs.rel, undefined); }
  }
});

test("published My Duo opens in the SAME tab and carries the originating GamID", async () => {
  const duo = byClass(await publishedStage("black"), "wall-duo-card")[0];
  assert.equal(duo.tag, "a");
  assert.equal(duo.attrs.href, "/@zshot?from=black");
  assert.equal(duo.attrs.target, undefined);
});

test("Crew link: `from` is added only when it is a valid handle; the temporary route keeps its crew/ folder", () => {
  assert.equal(crewWallHref(CREW, { from: "Black" }), `/crew/?c=${CREW}&from=black`);
  assert.equal(crewWallHref(CREW, { from: "@zshot", pathname: "/gamid-testing/public/index.html" }), `/gamid-testing/crew/?c=${CREW}&from=zshot`);
  for (const bad of ["", "a b", "<script>", "../x", "//evil.example"]) assert.equal(crewWallHref(CREW, { from: bad }), `/crew/?c=${CREW}`, bad);
  assert.equal(crewWallHref("nope", { from: "black" }), null);
});

test("Crew Wall -> Back to the originating GamID: the shared visitor navigation, history back when the previous page IS that GamID", () => {
  const page = read("dist/crew/crew.js");
  assert.match(page, /import \{ createVisitorNav \} from "\.\.\/public\/visitor-nav\.js";/, "the same navigation module as My Duo and Back to Crew - not a second system");
  assert.match(page, /const from = backHandle\(location\.search, ""\);\n  const nav = createVisitorNav\(\{ from, pathname: location\.pathname, referrer: document\.referrer, origin: location\.origin, history \}\);\n  if \(nav\) document\.getElementById\("crewShell"\)\.prepend\(nav\.element\);/);
  assert.equal(backHandle(`?c=${CREW}&from=black`, ""), "black");
  assert.equal(backHandle(`?c=${CREW}`, ""), "", "opened directly: no Back control, the page is as before");
  const nav = createVisitorNav({ from: backHandle(`?c=${CREW}&from=black`, ""), pathname: "/crew/", doc });
  assert.equal(backOf(nav).href, "/@black");
  assert.match(backOf(nav).textContent, /Back to @black/);
  assert.equal(nav.skipVisible, false, "no Intro on a Crew Wall: Skip Intro never shows");
  const history = { length: 3, back() { this.went = true; } };
  assert.equal(goBack({ preventDefault() {} }, { href: "/@black", referrer: "https://site.example/@black", origin: "https://site.example", history }), true, "browser-natural: back in history");
  assert.ok(history.went);
  assert.equal(goBack({}, { href: "/@black", referrer: "", origin: "https://site.example", history: { length: 1, back() { throw new Error("no"); } } }), false, "opened fresh: the link opens @black instead");
  assert.equal(createVisitorNav({ from: "", pathname: "/crew/", doc }), null);
  const css = read("dist/crew/crew.css");
  assert.match(css, /\.crew-shell \.identity-nav\{display:flex;justify-content:flex-start;margin:0 0 \.75rem\}/, "in the page flow above the Wall (the Crew page does not load the public page's stylesheet)");
  assert.doesNotMatch(css.slice(css.indexOf("Back to @<GamID>")), /white-space:\s*nowrap|text-overflow:\s*ellipsis/);
});

test("Crew -> Member -> Back to Crew -> Back to @origin: member cards keep `from`, Back to Crew keeps it, so the Crew Wall can still return to the origin", () => {
  assert.equal(memberHref("/@zshot", CREW, "black"), `/@zshot?crew=${CREW}&from=black`);
  assert.equal(memberHref("/@zshot", CREW, ""), `/@zshot?crew=${CREW}`, "opened directly: exactly the accepted member link");
  // on the member's GamID: Back to Crew (crew mode wins) whose address keeps the origin
  const onMember = createVisitorNav({ crew: CREW, from: "black", pathname: "/@zshot", doc });
  assert.equal(backOf(onMember).href, `/crew/?c=${CREW}&from=black`);
  assert.match(backOf(onMember).textContent, /Back to Crew/);
  // the origin may be a member of that Crew itself (@black opening their own Crew): `from` is carried, not dropped
  assert.match(read("dist/public/public.js"), /from: fromCrew \? backHandle\(location\.search, ""\) : backHandle\(location\.search, identity\?\.gamid_handle \?\? handle\),/);
  assert.equal(backHandle(`?crew=${CREW}&from=black`, ""), "black");
  const history = { length: 4, back() { this.went = true; } };
  assert.equal(goBack({ preventDefault() {} }, { href: `/crew/?c=${CREW}&from=black`, referrer: `https://site.example/crew/?c=${CREW}&from=black`, origin: "https://site.example", history }), true, "history back to the Crew Wall (stage + scroll kept)");
  assert.ok(history.went);
});

test("existing Crew -> Member -> Back to Crew is unchanged when there is no origin", () => {
  const nav = createVisitorNav({ crew: CREW, pathname: "/@zshot", doc });
  assert.equal(backOf(nav).href, `/crew/?c=${CREW}`);
  nav.setBackName("Espada");
  assert.match(backOf(nav).textContent, /Back to Espada/);
  const duo = createVisitorNav({ from: "black", pathname: "/@zshot", doc });
  assert.equal(backOf(duo).href, "/@black", "My Duo: Back to @black, as before");
  assert.equal(gamidHref("zshot", { from: "black" }), "/@zshot?from=black");
});

test("Editor Preview stays safe: Crew and Duo open a NEW tab there (the editor is never left) and carry no visitor origin", () => {
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /duoLink: \{ newTab: true, href: handle => new URL\(`\.\.\/@\$\{handle\}`, location\.href\)\.pathname \}/);
  assert.match(editor, /crewLink: \{ newTab: true, href: crewId => `\$\{new URL\("\.\.\/crew\/", location\.href\)\.pathname\}\?c=\$\{crewId\}` \}/);
  const crews = publicCrewList([{ crew_id: CREW, crew_name: "Espada", game_name: "League of Legends", role: "OWNER", member_count: 2 }], { newTab: true, href: id => `/crew/?c=${id}` });
  const card = byClass(paintGamidBlock({ kind: "gamid", block: "crews", layout: "card" }, { public: { available: true, crews } }, make, { interactive: true }), "wall-crew-card")[0];
  assert.equal(card.attrs.target, "_blank");
  assert.equal(card.attrs.rel, "noopener");
  const duo = byClass(paintGamidBlock({ kind: "gamid", block: "duo", layout: "card" }, { public: { available: true, duo: { handle: "zshot", displayName: "HAMZA", href: "/@zshot", newTab: true } } }, make, { interactive: true }), "wall-duo-card")[0];
  assert.equal(duo.attrs.target, "_blank");
});

test("regression: the published Wall's link options are the only place visitors' Crew / Duo addresses are built", () => {
  const wall = read("dist/public/public-wall.js");
  assert.match(wall, /duoLink: \{ newTab: false, href: duo => gamidHref\(duo, \{ from: handle, pathname \}\) \}, crewLink: \{ newTab: false, href: crewId => crewWallHref\(crewId, \{ pathname, from: handle \}\) \}/);
  for (const file of ["dist/public/public-wall.js", "dist/public/visitor-nav.js", "dist/public/identity-link.js"]) assert.doesNotMatch(read(file), /@black|\bblack\b|Espada|league_of_legends/, `${file}: nothing hard-coded`);
  assert.doesNotMatch(read("dist/crew/crew.js"), /black|Espada/, "the Crew page names no GamID / Crew");
});
