// My Duo V1: a mutual GamID-to-GamID identity relationship. The database is authoritative (tests/integration/my-duo-db.sql runs the real rules on TESTING); these tests
// pin the browser side: identity navigation (links, Back), the Wall "duo" GamID block, the visitor / owner data it is drawn from, the Public Profile card, and the owner
// panel's required confirmations - plus source guards for the migration's security shape.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isHandle, normalizeDuo, gamidHref, backHandle, goBack, relationshipBadge, RELATIONSHIP_BADGE_TEXT } from "../dist/public/identity-link.js";
import { duoSection } from "../dist/public/public-duo.js";
import { validateDocument } from "../dist/wall/validate.js";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { GAMID_BLOCKS, GAMID_BLOCK_INFO, createGamidPayload } from "../dist/wall-kit/gamid.js";
import { paintGamidBlock, BLOCK_TITLES } from "../dist/wall-kit/gamid-blocks.js";
import { INTERACTIVE_ATTR } from "../dist/wall-kit/interaction.js";
import { loadPublicView, loadGamidSnapshot, ownerDuo } from "../dist/wall-editor/gamid-data.js";
import { createDuoPanel, duoState, sendWarning, acceptWarning, publicHint, duoErrorText } from "../dist/account/my-duo.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---------- a small fake DOM ----------
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.hidden = false; this.classList = { toggle: () => {} }; this.style = { setProperty: () => {} }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  append(...nodes) { for (const node of nodes) if (node) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  set innerHTML(_) { throw new Error("innerHTML is forbidden"); }
  async fire(type, event = {}) { for (const handler of this.listeners[type] || []) await handler({ target: this, preventDefault() {}, ...event }); }
}
const make = tag => new El(tag);
const element = (tag, className, text) => { const node = new El(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const byClass = (root, cls) => all(root, node => typeof node.className === "string" && node.className.split(" ").includes(cls));
const byText = (root, tag, text) => all(root, node => node.tag === tag && node.textContent === text);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const fakeDoc = { createElement: make };

// ---------- identity navigation ----------
test("handles: the database's own format; the public duo section is normalized and anything malformed is dropped", () => {
  assert.ok(isHandle("zshot") && isHandle("black") && isHandle("a_b1"));
  for (const bad of ["", "ab", "-zz", "a__b", "Zshot", "x".repeat(25), "z shot", "../x"]) assert.equal(isHandle(bad), false, bad);
  assert.deepEqual(normalizeDuo({ gamid_handle: "zshot", display_name: " HAMZA ", avatar_media_reference: "u/a.png" }), { handle: "zshot", displayName: "HAMZA", avatarPath: "u/a.png" });
  assert.deepEqual(normalizeDuo({ gamid_handle: "zshot" }), { handle: "zshot", displayName: "@zshot", avatarPath: null });
  for (const bad of [null, "zshot", {}, { gamid_handle: "a b" }, { gamid_handle: "//evil.example" }]) assert.equal(normalizeDuo(bad), null);
});

test("links: the Duo's real /@handle on the permanent route, ?handle= on the temporary public page; `from` only when valid and not the destination", () => {
  assert.equal(gamidHref("zshot", { from: "black" }), "/@zshot?from=black");
  assert.equal(gamidHref("ZShot", { from: "@Black", pathname: "/@black" }), "/@zshot?from=black");
  assert.equal(gamidHref("zshot"), "/@zshot");
  assert.equal(gamidHref("zshot", { from: "zshot" }), "/@zshot", "never Back to the same page");
  assert.equal(gamidHref("zshot", { from: "<script>" }), "/@zshot");
  assert.equal(gamidHref("zshot", { from: "black", pathname: "/gamid-testing/public/index.html" }), "/gamid-testing/public/index.html?handle=zshot&from=black");
  for (const bad of ["", "https://evil.example", "//evil", "a b"]) assert.equal(gamidHref(bad), null);
});

test("Back: the visited page reads `from` (valid, not itself); returning goes back in history only when the previous page IS that GamID, otherwise it navigates", () => {
  assert.equal(backHandle("?from=black", "zshot"), "black");
  assert.equal(backHandle("?from=Black", "zshot"), "black");
  assert.equal(backHandle("?from=zshot", "zshot"), "");
  assert.equal(backHandle("?from=..%2Fx", "zshot"), "");
  assert.equal(backHandle("", "zshot"), "");
  const history = { length: 3, back() { this.went = true; } };
  let prevented = false;
  const event = { preventDefault() { prevented = true; } };
  assert.equal(goBack(event, { href: "/@black", referrer: "https://site.example/@black", origin: "https://site.example", history }), true);
  assert.ok(history.went && prevented);
  const other = { length: 3, back() { throw new Error("must not go back"); } };
  assert.equal(goBack({}, { href: "/@black", referrer: "https://site.example/@someone", origin: "https://site.example", history: other }), false, "previous page is another GamID: navigate instead");
  assert.equal(goBack({}, { href: "/@black", referrer: "https://elsewhere.example/@black", origin: "https://site.example", history: other }), false, "another site: navigate");
  assert.equal(goBack({}, { href: "/@black", referrer: "", origin: "https://site.example", history: other }), false, "opened directly: navigate");
  assert.equal(goBack({}, { href: "/p/index.html?handle=black", referrer: "https://site.example/p/index.html?handle=black&from=zshot", origin: "https://site.example", history }), true, "temporary route too");
});

test("the relationship badge says 'mutual', never 'verified', and is no check mark", () => {
  const badge = relationshipBadge("duo", make);
  assert.equal(badge.textContent, "Mutual Duo");
  assert.equal(RELATIONSHIP_BADGE_TEXT.duo, "Mutual Duo");
  const source = read("dist/public/identity-link.js");
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ""), /verified|✓|✔|check/i);
  assert.match(source, /createElementNS\(ns, "circle"\)/, "two linked rings");
});

// ---------- the Wall: the duo GamID block ----------
const docWith = (...elements) => { const doc = createDocument(); doc.stages[0].elements = elements; return doc; };
const gamidEl = payload => createElement({ id: "g1", type: "gamid", x: 0, y: 0, width: 800, height: 260, z: 0, payload });

test("Wall: 'duo' is a real GamID block (owner places it like any block) and the validator accepts it; unknown blocks still fail", () => {
  assert.ok(GAMID_BLOCKS.includes("duo"));
  assert.equal(GAMID_BLOCK_INFO.duo.label, "My Duo");
  assert.ok(GAMID_BLOCK_INFO.duo.minSize.width < GAMID_BLOCK_INFO.duo.size.width && GAMID_BLOCK_INFO.duo.minSize.height < GAMID_BLOCK_INFO.duo.size.height);
  assert.equal(BLOCK_TITLES.duo, "MY DUO");
  assert.deepEqual(validateDocument(docWith(gamidEl(createGamidPayload("duo")))).errors, []);
  assert.deepEqual(validateDocument(docWith(gamidEl({ block: "duo", layout: "compact" }))).errors, []);
  assert.deepEqual(validateDocument(docWith(gamidEl({ block: "team" }))).errors, ["INVALID_BLOCK:g1"]);
  const migration = read("supabase/migrations/20261002150000_my_duo.sql");
  assert.match(migration, /\(payload ->> 'block'\) not in \('profile', 'roles', 'games', 'connections', 'duo'\)/, "the database validator mirrors it");
});

const content = { kind: "gamid", block: "duo", layout: "card" };
const visitorDuo = { handle: "zshot", displayName: "HAMZA", avatarUrl: "blob:x", href: "/@zshot?from=black", newTab: false };

test("Wall VIEW: a visitor's Duo card shows avatar, name, @handle, MY DUO and the badge, and links to the Duo's GamID (a tap target)", () => {
  const root = paintGamidBlock(content, { public: { available: true, duo: visitorDuo } }, make, { interactive: true });
  assert.match(root.textContent, /MY DUO/);
  assert.match(root.textContent, /Mutual Duo/);
  const card = byClass(root, "wall-duo-card")[0];
  assert.equal(card.tag, "a");
  assert.equal(card.attrs.href, "/@zshot?from=black");
  assert.equal(card.attrs.target, undefined, "a visitor's Wall navigates in place");
  assert.equal(card.attrs[INTERACTIVE_ATTR], "true", "the card takes taps on a visitor's Wall");
  assert.match(card.textContent, /HAMZA/);
  assert.match(card.textContent, /@zshot/);
  assert.equal(byClass(root, "wall-duo-avatar")[0].children[0].attrs.src, "blob:x");
  const preview = paintGamidBlock(content, { public: { available: true, duo: { ...visitorDuo, href: "/@zshot", newTab: true } } }, make, { interactive: true });
  assert.equal(byClass(preview, "wall-duo-card")[0].attrs.target, "_blank", "the editor's Preview opens a new tab");
  assert.equal(byClass(preview, "wall-duo-card")[0].attrs.rel, "noopener");
});

test("Wall VIEW: only what the server's public view holds - no Duo, a non-public GamID, or a non-path address never become a link", () => {
  assert.match(paintGamidBlock(content, { public: { available: true, duo: null } }, make, { interactive: true }).textContent, /My Duo isn't shown on this GamID/);
  assert.match(paintGamidBlock(content, { public: { available: false } }, make, { interactive: true }).textContent, /not public/);
  for (const href of ["https://evil.example/@zshot", "//evil.example", "javascript:alert(1)", null]) {
    const card = byClass(paintGamidBlock(content, { public: { available: true, duo: { ...visitorDuo, href } } }, make, { interactive: true }), "wall-duo-card")[0];
    assert.equal(card.tag, "div", String(href));
    assert.equal(card.attrs.href, undefined);
  }
  const owner = paintGamidBlock(content, { public: { available: true, duo: null }, duo: { handle: "secret", displayName: "Owner Only" } }, make, { interactive: true });
  assert.doesNotMatch(owner.textContent, /secret|Owner Only/, "view mode never falls back to the owner's private data");
});

test("Wall EDIT: the owner designs with their own Duo (no link), labelled PRIVATE while visitors would not see it; no Duo = a plain hint", () => {
  const shown = paintGamidBlock(content, { duo: { handle: "zshot", displayName: "HAMZA", avatarUrl: null }, visibility: { duo: true } }, make, {});
  assert.equal(byClass(shown, "wall-duo-card")[0].tag, "div");
  assert.doesNotMatch(shown.textContent, /PRIVATE/);
  assert.match(shown.textContent, /HAMZA@zshot/);
  const hidden = paintGamidBlock(content, { duo: { handle: "zshot", displayName: "HAMZA" }, visibility: { duo: false } }, make, {});
  assert.match(hidden.textContent, /PRIVATE/);
  assert.match(paintGamidBlock(content, { duo: null, visibility: { duo: false } }, make, {}).textContent, /No Duo yet/);
});

// ---------- the data the block is drawn from ----------
test("visitor view: the Duo comes ONLY from the public 'duo' section, with its public avatar and the caller-chosen link", async () => {
  const api = {
    getPublicIdentity: async () => ({ gamid_handle: "black", display_name: "Black", public_sections: { duo: { gamid_handle: "zshot", display_name: "HAMZA", avatar_media_reference: "u/z.png" } } }),
    getPublicMyGames: async () => null,
    loadPublicAvatar: async path => (path === "u/z.png" ? "blob:z" : null),
  };
  const view = await loadPublicView(api, "black", { duoLink: { newTab: false, href: handle => gamidHref(handle, { from: "black" }) } });
  assert.deepEqual(view.duo, { handle: "zshot", displayName: "HAMZA", avatarUrl: "blob:z", href: "/@zshot?from=black", newTab: false });
  const none = await loadPublicView({ ...api, getPublicIdentity: async () => ({ gamid_handle: "black", public_sections: {} }) }, "black");
  assert.equal(none.duo, null);
});

test("owner snapshot: only an ACCEPTED Duo (never a pending request); 'shown to visitors' = owner's switch ON and the Duo published", async () => {
  assert.equal(ownerDuo([{ relation: "SENT", gamid_handle: "zshot" }, { relation: "RECEIVED", gamid_handle: "other" }]), null);
  assert.deepEqual(ownerDuo([{ relation: "DUO", gamid_handle: "zshot", display_name: "HAMZA", is_published: true, show_public: false }]),
    { handle: "zshot", displayName: "HAMZA", avatarUrl: null, isPublished: true, showPublic: false, shownToVisitors: false });
  const api = {
    getIdentity: async () => ({ gamid_handle: "black", display_name: "Black" }), getIdentityProfile: async () => ({}), getMyConnections: async () => [], getMyPublicGamesSettings: async () => null,
    getMyGameDisplaySettings: async () => ({}), getMyDiscoveredGames: async () => [], getMyManualGames: async () => [], getPublicIdentity: async () => null,
    getMyDuo: async () => [{ relation: "DUO", gamid_handle: "zshot", display_name: "HAMZA", avatar_media_reference: "u/z.png", is_published: true, show_public: true }],
    loadPublicAvatar: async () => "blob:z",
  };
  const snapshot = await loadGamidSnapshot(api);
  assert.equal(snapshot.duo.handle, "zshot");
  assert.equal(snapshot.duo.avatarUrl, "blob:z");
  assert.equal(snapshot.visibility.duo, true);
  const failing = await loadGamidSnapshot({ ...api, getMyDuo: async () => { throw new Error("offline"); } });
  assert.equal(failing.duo, null, "a failed read never breaks the other blocks");
});

// ---------- the Public Profile card ----------
test("Public Profile: the Duo card links to /@duo carrying `from`, shows MY DUO + the badge, and swaps in the public avatar only as a blob: URL", async () => {
  const block = duoSection({ gamid_handle: "zshot", display_name: "HAMZA", avatar_media_reference: "u/z.png" }, { ownerHandle: "black", pathname: "/@black", loadAvatar: async () => "blob:z", doc: fakeDoc });
  const link = byClass(block, "public-duo-card")[0];
  assert.equal(link.href, "/@zshot?from=black");
  assert.match(block.textContent, /MY DUO/);
  assert.match(block.textContent, /Mutual Duo/);
  assert.match(block.textContent, /HAMZA@zshot/);
  await tick();
  assert.equal(byClass(block, "public-duo-avatar")[0].children[0].src, "blob:z");
  const unsafe = duoSection({ gamid_handle: "zshot", display_name: "HAMZA", avatar_media_reference: "u/z.png" }, { ownerHandle: "black", loadAvatar: async () => "https://evil.example/x.png", doc: fakeDoc });
  await tick();
  assert.equal(byClass(unsafe, "public-duo-avatar")[0].children.length, 0);
  assert.equal(duoSection(null, { doc: fakeDoc }), null);
  assert.equal(duoSection({ gamid_handle: "bad handle" }, { doc: fakeDoc }), null);
});

test("public page: the Duo leads the sections, the Back control is built from `from` and returns via goBack", () => {
  const source = read("dist/public/public.js");
  assert.match(source, /renderPublicSections\(sectionsPanel, identity\.public_sections, \{ ownerHandle: identity\.gamid_handle, pathname: location\.pathname, loadAvatar: loadPublicAvatar \}\)/);
  assert.match(source, /renderBackControl\(backHandle\(location\.search, identity\?\.gamid_handle \?\? handle\)\)/);
  assert.match(source, /goBack\(event, \{ href, referrer: document\.referrer, origin: location\.origin, history \}\)/);
  assert.match(read("dist/public/public.css"), /\.identity-back\{position:fixed;z-index:30/, "above the Intro (z 20), below dialogs (z 50)");
  assert.match(read("dist/public/public-wall.js"), /gamidHref\(duo, \{ from: handle, pathname \}\)/, "a published Wall's Duo navigates in place with `from`");
});

// ---------- the owner panel ----------
const DUO = { relation: "DUO", gamid_handle: "zshot", display_name: "HAMZA", is_published: true, show_public: false };
function panel(rows, overrides = {}) {
  const calls = [];
  let current = rows;
  const api = {
    getMyDuo: async () => current,
    searchDuoCandidates: async query => { calls.push(["search", query]); return [{ gamid_handle: "newbie", display_name: "New", is_published: false }]; },
    sendDuoRequest: async (...args) => { calls.push(["send", ...args]); },
    respondToDuoRequest: async (...args) => { calls.push(["respond", ...args]); },
    cancelDuoRequest: async (...args) => { calls.push(["cancel", ...args]); },
    removeMyDuo: async () => { calls.push(["remove"]); },
    setMyDuoVisibility: async (...args) => { calls.push(["visible", ...args]); },
    ...overrides,
  };
  const root = element("div"), message = element("p");
  const visibilitySwitch = ({ on, onChange, label }) => { const node = element("button", "visibility-switch", `${label}:${on ? "ON" : "OFF"}`); node.addEventListener("click", () => onChange(!on)); return node; };
  const view = createDuoPanel({ api, root, message, element, visibilitySwitch, isOwnerPublished: () => true });
  return { view, root, message, calls, setRows: next => { current = next; } };
}
const click = async (root, text) => { const [button] = byText(root, "button", text); assert.ok(button, `button "${text}"`); await button.fire("click"); await tick(); };

test("owner panel: state from get_my_duo; the exact required warnings; hints follow the owner switch and the Duo's publication", () => {
  const state = duoState([DUO, { relation: "SENT", gamid_handle: "next" }, { relation: "RECEIVED", gamid_handle: "fan1" }, { relation: "RECEIVED", gamid_handle: "bad handle" }]);
  assert.equal(state.duo.handle, "zshot");
  assert.equal(state.sent.handle, "next");
  assert.deepEqual(state.received.map(person => person.handle), ["fan1"]);
  assert.equal(sendWarning(state.duo, "next"), "You already have a Duo: @zshot. @zshot stays your Duo while this request is pending, but will be replaced if @next accepts.");
  assert.equal(acceptWarning(state.duo, "fan1"), "Accepting replaces your current Duo, @zshot. Your Duo with @zshot ends for both of you, and @fan1 becomes your Duo.");
  assert.match(publicHint({ ...state.duo, showPublic: false }, true), /Private/);
  assert.match(publicHint({ ...state.duo, showPublic: true, isPublished: false }, true), /isn't published/);
  assert.match(publicHint({ ...state.duo, showPublic: true, isPublished: true }, true), /Shown on your public GamID/);
  assert.equal(duoErrorText({ message: "DUO_REQUEST_PENDING" }), "You already have a Duo request waiting. Cancel it first to ask someone else.");
});

test("owner panel: without a Duo, a request is sent directly (no replacement to confirm)", async () => {
  const p = panel([]);
  await p.view.load();
  assert.match(p.root.textContent, /You don't have a Duo yet/);
  const input = all(p.root, node => node.tag === "input")[0];
  input.value = "newbie"; await input.fire("input");
  await all(p.root, node => node.tag === "form")[0].fire("submit");
  await tick();
  await click(p.root, "Request");
  assert.deepEqual(p.calls.at(-1), ["send", "newbie", false]);
});

test("owner panel: with a Duo, Request first shows the pending/replace warning; only 'Send request' sends, with the confirmation", async () => {
  const p = panel([DUO]);
  await p.view.load();
  const input = all(p.root, node => node.tag === "input")[0];
  input.value = "newbie"; await input.fire("input");
  await all(p.root, node => node.tag === "form")[0].fire("submit");
  await tick();
  await click(p.root, "Request");
  assert.equal(p.calls.filter(call => call[0] === "send").length, 0, "nothing sent yet");
  assert.match(p.root.textContent, /@zshot stays your Duo while this request is pending, but will be replaced if @newbie accepts/);
  await click(p.root, "Send request");
  assert.deepEqual(p.calls.at(-1), ["send", "newbie", true]);
});

test("owner panel: accepting while having a Duo warns first; accepting without one is direct; decline and cancel name only the other @handle", async () => {
  const withDuo = panel([DUO, { relation: "RECEIVED", gamid_handle: "fan1", display_name: "Fan" }]);
  await withDuo.view.load();
  await click(withDuo.root, "Accept");
  assert.equal(withDuo.calls.length, 0);
  assert.match(withDuo.root.textContent, /Accepting replaces your current Duo, @zshot/);
  await click(withDuo.root, "Accept and replace");
  assert.deepEqual(withDuo.calls.at(-1), ["respond", "fan1", true, true]);

  const fresh = panel([{ relation: "RECEIVED", gamid_handle: "fan1" }]);
  await fresh.view.load();
  await click(fresh.root, "Accept");
  assert.deepEqual(fresh.calls.at(-1), ["respond", "fan1", true, false]);

  const declining = panel([{ relation: "RECEIVED", gamid_handle: "fan1" }]);
  await declining.view.load();
  await click(declining.root, "Decline");
  assert.deepEqual(declining.calls.at(-1), ["respond", "fan1", false, false]);

  const sent = panel([DUO, { relation: "SENT", gamid_handle: "next" }]);
  await sent.view.load();
  assert.match(sent.root.textContent, /@zshot stays your Duo until then; if @next accepts, they replace @zshot/);
  assert.equal(all(sent.root, node => node.tag === "form").length, 0, "one outgoing request at a time: no search while one waits");
  await click(sent.root, "Cancel request");
  assert.deepEqual(sent.calls.at(-1), ["cancel", "next"]);
});

test("owner panel: the public switch is the owner's own; ending a Duo asks first; server errors are shown in plain words", async () => {
  const p = panel([DUO]);
  await p.view.load();
  assert.match(p.root.textContent, /Show My Duo on my GamID:OFF/);
  assert.match(p.root.textContent, /@zshot decides separately whether you appear on their GamID/);
  await byClass(p.root, "visibility-switch")[0].fire("click"); await tick();
  assert.deepEqual(p.calls.at(-1), ["visible", true]);
  await click(p.root, "End Duo");
  assert.equal(p.calls.at(-1)[0], "visible", "not ended yet");
  assert.match(p.root.textContent, /It ends for both of you/);
  await click(p.root, "End Duo");
  assert.deepEqual(p.calls.at(-1), ["remove"]);

  const failing = panel([{ relation: "RECEIVED", gamid_handle: "fan1" }], { respondToDuoRequest: async () => { throw Object.assign(new Error("DUO_REQUEST_NOT_FOUND"), { code: "DUO_REQUEST_NOT_FOUND" }); } });
  await failing.view.load();
  await click(failing.root, "Decline");
  assert.equal(failing.message.textContent, "That Duo request is no longer waiting. The list has been refreshed.");
});

// ---------- layout regression (manual QA: a search result's name and @handle broke one character per line under a full-width Request button) ----------
const cssRule = (css, selector) => { const at = css.indexOf(`${selector}{`); assert.ok(at >= 0, `rule ${selector}`); return css.slice(at + selector.length + 1, css.indexOf("}", at)); };

test("layout: every My Duo state draws its person through ONE identity row (avatar, identity, then the action) - search result, request sent, request received, accepted Duo", async () => {
  const p = panel([DUO, { relation: "RECEIVED", gamid_handle: "fan1" }]);
  await p.view.load();
  const input = all(p.root, node => node.tag === "input")[0];
  input.value = "newbie"; await input.fire("input");
  await all(p.root, node => node.tag === "form")[0].fire("submit"); await tick();
  const sent = panel([{ relation: "SENT", gamid_handle: "next" }]);
  await sent.view.load();
  const rows = [...byClass(p.root, "duo-person"), ...byClass(sent.root, "duo-person")];
  assert.equal(rows.length, 4, "accepted Duo, received request, search result, sent request");
  for (const row of rows) {
    assert.deepEqual(row.children.slice(0, 2).map(child => child.className), ["duo-avatar", "duo-names"], "avatar, then identity");
    for (const extra of row.children.slice(2)) assert.ok(/duo-button|duo-tag/.test(extra.className), "only an action may follow the identity, inside the same row");
  }
  const result = byClass(p.root, "duo-results")[0];
  const action = byClass(result, "duo-person")[0].children[2];
  assert.equal(action.tag, "button");
  assert.match(action.className, /\bduo-button\b/);
});

test("layout: the identity keeps a readable width, the action never takes the row (the page-wide full-width button rule is overridden), and narrow rows wrap instead of overlapping", () => {
  const css = read("dist/account/account.css");
  assert.match(css, /\.primary,\.secondary,\.text-button\{width:100%/, "the page-wide rule this row must override");
  const row = cssRule(css, ".duo-person");
  assert.match(row, /display:flex/);
  assert.match(row, /flex-wrap:wrap/, "the action moves below the identity when the row is too narrow");
  assert.match(row, /min-width:0/);
  const names = cssRule(css, ".duo-names");
  assert.match(names, /flex:1 1 9rem/, "the identity column keeps a readable basis");
  assert.match(names, /grid-template-columns:minmax\(0,1fr\)/, "a long unbroken name can never push the card wider");
  assert.match(names, /min-width:0/);
  const action = cssRule(css, ".duo-person .duo-button");
  assert.match(action, /flex:0 0 auto/);
  assert.match(action, /width:auto/, "the action is its own size, never 100% of the row");
  assert.match(action, /margin:0 0 0 auto/, "end of the row (or of its own line once wrapped)");
  assert.match(cssRule(css, ".duo-tag"), /margin-left:auto/);
  const duoRules = css.slice(css.indexOf("/* MY DUO (my-duo.js)"), css.indexOf("/* Steam Connection Foundation:"));
  assert.doesNotMatch(duoRules, /overflow-wrap:anywhere|word-break:break-all/, "names and @handles break only between words (a single over-long word only when it cannot fit at all)");
  assert.match(cssRule(css, ".duo-names strong"), /overflow-wrap:break-word/);
  assert.match(cssRule(css, ".duo-handle"), /overflow-wrap:break-word/);
});

// ---------- source guards ----------
test("migration: RPC-only table, owner from auth.uid(), no relationship id accepted from a client, atomic replacement under locks", () => {
  const sql = read("supabase/migrations/20261002150000_my_duo.sql");
  assert.match(sql, /alter table public\.identity_relationships enable row level security;\nrevoke all on table public\.identity_relationships from public, anon, authenticated;/);
  const publicSignatures = [...sql.matchAll(/create function public\.(\w+)\(([^)]*)\)/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(publicSignatures.map(([name]) => name).sort(), ["cancel_duo_request", "get_my_duo", "remove_my_duo", "respond_to_duo_request", "search_duo_candidates", "send_duo_request", "set_my_duo_visibility"]);
  for (const [name, args] of publicSignatures) assert.doesNotMatch(args, /uuid|relationship/i, `${name} takes no relationship id`);
  assert.match(sql, /perform private\.identity_lock_pair\(me, requester\);[\s\S]*delete from public\.identity_relationships r\s+where r\.kind = 'DUO' and r\.status = 'ACCEPTED'\s+and \(r\.requester_entity_id in \(me, requester\) or r\.addressee_entity_id in \(me, requester\)\);/);
  assert.match(sql, /candidate_replace_confirmed is not true then\s+raise exception using errcode = 'PT409', message = 'DUO_REPLACE_CONFIRMATION_REQUIRED'/);
  assert.match(sql, /and d\.entity_type = 'SOLO' and d\.visibility = 'PUBLIC'/, "public display needs the Duo's GamID published");
  assert.match(sql, /\(ir\.requester_entity_id = e\.entity_id and ir\.requester_shows_public\) or \(ir\.addressee_entity_id = e\.entity_id and ir\.addressee_shows_public\)/, "each owner's own switch");
  assert.match(sql, /requester_shows_public boolean not null default false,\n  addressee_shows_public boolean not null default false,/, "OFF by default");
});

test("My Duo is kept apart from Avoid Playing With (Play Together's matchmaking preference) and from Official Teams / Squads", () => {
  for (const path of ["supabase/migrations/20261002150000_my_duo.sql", "dist/account/my-duo.js", "dist/public/identity-link.js", "dist/public/public-duo.js"]) {
    const code = read(path).replace(/^\s*--.*$/gm, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /play_together|avoid/i, path);
  }
  assert.match(read("supabase/migrations/20261002150000_my_duo.sql"), /kind text not null check \(kind in \('DUO'\)\)/, "only DUO is built");
});
