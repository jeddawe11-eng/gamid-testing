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
import { createDuoNotifier, notificationText, DUO_NOTIFICATION_MS, DUO_NOTIFICATION_KINDS } from "../dist/account/duo-notifications.js";
import { createTransientMessage, TRANSIENT_MESSAGE_MS } from "../dist/account/transient-message.js";
import { subscribeDuoRealtime, createDuoRefreshScheduler } from "../dist/account/duo-realtime.js";
import { subscribePrivateBroadcast } from "../dist/account/realtime-client.js";

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
  const view = createDuoPanel({ api, root, message, element, visibilitySwitch, isOwnerPublished: () => true, timers: fakeTimers() });
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

// ---------- GamID UX rule: transient feedback shows at once and disappears after ~3 s; persistent state never auto-disappears ----------
function fakeTimers() {
  let next = 1;
  const pending = new Map();
  return {
    setTimeout(fn, ms) { const id = next++; pending.set(id, { fn, ms }); return id; },
    clearTimeout(id) { pending.delete(id); },
    get delays() { return [...pending.values()].map(entry => entry.ms); },
    runAll() { const due = [...pending.entries()]; pending.clear(); for (const [, entry] of due) entry.fn(); },
  };
}

test("UX rule module: shown immediately, hidden after exactly TRANSIENT_MESSAGE_MS (3 s), a newer message restarts the clock, an in-flight progress line never expires on its own", () => {
  const timers = fakeTimers();
  const line = element("p");
  line.hidden = true;
  const toned = [];
  line.classList = { toggle: (name, on) => { if (on) toned.push(name); } };
  const message = createTransientMessage(line, { timers });
  assert.equal(TRANSIENT_MESSAGE_MS, 3000, "about 3 seconds (the corrected GamID rule)");
  message.show("Saved.", { tone: "success" });
  assert.equal(line.hidden, false);
  assert.equal(line.textContent, "Saved.");
  assert.ok(toned.includes("success"));
  assert.deepEqual(timers.delays, [TRANSIENT_MESSAGE_MS]);
  message.show("Another one.", { tone: "warning" });
  assert.deepEqual(timers.delays, [TRANSIENT_MESSAGE_MS], "the previous timer is replaced, not stacked");
  assert.ok(toned.includes("is-warning"));
  timers.runAll();
  assert.equal(line.hidden, true, "gone after 3 s without any refresh");
  message.show("Working…", { progress: true });
  assert.deepEqual(timers.delays, [], "progress lasts exactly as long as the request");
  assert.equal(line.hidden, false);
  message.show("Couldn't do that.", { tone: "error" });
  assert.deepEqual(timers.delays, [TRANSIENT_MESSAGE_MS], "its outcome is transient again");
  message.hide();
  assert.equal(line.hidden, true);
  assert.deepEqual(timers.delays, []);
  message.show("");
  assert.equal(line.hidden, true, "an empty message just hides the line");
});

function livePanel(initialRows, actions) {
  const timers = fakeTimers();
  let rows = initialRows;
  const calls = [];
  const api = {
    getMyDuo: async () => rows,
    searchDuoCandidates: async () => [{ gamid_handle: "newbie", display_name: "New", is_published: true }],
    ...Object.fromEntries(Object.entries(actions).map(([name, next]) => [name, async (...args) => { calls.push([name, ...args]); if (next instanceof Error) throw next; rows = next(rows, ...args); }])),
  };
  const root = element("div"), message = element("p");
  message.hidden = true;
  const visibilitySwitch = ({ on, onChange, label }) => { const node = element("button", "visibility-switch", `${label}:${on ? "ON" : "OFF"}`); node.addEventListener("click", () => onChange(!on)); return node; };
  const view = createDuoPanel({ api, root, message, element, visibilitySwitch, isOwnerPublished: () => true, timers });
  return { view, root, message, timers, calls };
}

test("My Duo Request: the SENT card appears from the server's answer without a refresh; the confirmation shows for ~3 s; the pending card stays", async () => {
  const p = livePanel([], { sendDuoRequest: (rows, handle) => [...rows, { relation: "SENT", gamid_handle: handle, display_name: "New", is_published: true }] });
  await p.view.load();
  const input = all(p.root, node => node.tag === "input")[0];
  input.value = "newbie"; await input.fire("input");
  await all(p.root, node => node.tag === "form")[0].fire("submit"); await tick();
  await click(p.root, "Request");
  assert.match(p.root.textContent, /REQUEST SENT/, "state updated immediately");
  assert.match(p.root.textContent, /Waiting for @newbie to accept/);
  assert.equal(p.message.hidden, false);
  assert.equal(p.message.textContent, "Duo request sent to @newbie.");
  assert.deepEqual(p.timers.delays, [TRANSIENT_MESSAGE_MS]);
  p.timers.runAll();
  assert.equal(p.message.hidden, true, "the confirmation is gone after ~3 s");
  assert.match(p.root.textContent, /REQUEST SENT/, "the pending request is persistent state - it does not disappear");
});

test("My Duo Accept with replacement: the warning is persistent until answered; after Accept the new Duo shows at once and the outcome (naming the ended Duo) hides after ~3 s", async () => {
  const p = livePanel([DUO, { relation: "RECEIVED", gamid_handle: "fan1", display_name: "Fan" }], {
    respondToDuoRequest: () => [{ relation: "DUO", gamid_handle: "fan1", display_name: "Fan", is_published: true, show_public: false }],
  });
  await p.view.load();
  await click(p.root, "Accept");
  assert.match(p.root.textContent, /Accepting replaces your current Duo, @zshot/);
  assert.deepEqual(p.timers.delays, [], "the replacement warning is state, not a timed message");
  await click(p.root, "Accept and replace");
  assert.deepEqual(p.calls.at(-1), ["respondToDuoRequest", "fan1", true, true]);
  assert.match(p.root.textContent, /MY DUO/);
  assert.match(p.root.textContent, /@fan1/);
  assert.doesNotMatch(p.root.textContent, /DUO REQUEST|@zshot/, "the old Duo and the request are gone without a refresh");
  assert.equal(p.message.textContent, "@fan1 is now your Duo. Your Duo with @zshot has ended.");
  assert.deepEqual(p.timers.delays, [TRANSIENT_MESSAGE_MS]);
  p.timers.runAll();
  assert.equal(p.message.hidden, true);
});

test("My Duo Decline / Cancel / End Duo / Show switch: each re-renders from the server at once and confirms for ~3 s; a recoverable error also shows for ~3 s and the state is re-read", async () => {
  const cases = [
    { rows: [{ relation: "RECEIVED", gamid_handle: "fan1" }], action: "respondToDuoRequest", next: () => [], press: ["Decline"], text: "Declined @fan1's Duo request.", gone: /DUO REQUEST/ },
    { rows: [{ relation: "SENT", gamid_handle: "next" }], action: "cancelDuoRequest", next: () => [], press: ["Cancel request"], text: "Cancelled your Duo request to @next.", gone: /REQUEST SENT/ },
    { rows: [DUO], action: "removeMyDuo", next: () => [], press: ["End Duo", "End Duo"], text: "Your Duo has ended.", gone: /MUTUAL|End Duo/ },
  ];
  for (const item of cases) {
    const p = livePanel(item.rows, { [item.action]: item.next });
    await p.view.load();
    for (const label of item.press) await click(p.root, label);
    assert.doesNotMatch(p.root.textContent, item.gone, `${item.action}: state updated without a refresh`);
    assert.equal(p.message.textContent, item.text);
    assert.deepEqual(p.timers.delays, [TRANSIENT_MESSAGE_MS], item.action);
    p.timers.runAll();
    assert.equal(p.message.hidden, true, item.action);
  }
  const visible = livePanel([DUO], { setMyDuoVisibility: rows => rows.map(row => ({ ...row, show_public: true })) });
  await visible.view.load();
  await byClass(visible.root, "visibility-switch")[0].fire("click"); await tick();
  assert.match(visible.root.textContent, /Show My Duo on my GamID:ON/, "the switch reflects the server at once");
  assert.deepEqual(visible.timers.delays, [TRANSIENT_MESSAGE_MS]);

  const failing = livePanel([{ relation: "RECEIVED", gamid_handle: "fan1" }], { respondToDuoRequest: Object.assign(new Error("DUO_REQUEST_NOT_FOUND"), { code: "DUO_REQUEST_NOT_FOUND" }) });
  await failing.view.load();
  await click(failing.root, "Decline");
  assert.equal(failing.message.textContent, "That Duo request is no longer waiting. The list has been refreshed.");
  assert.deepEqual(failing.timers.delays, [TRANSIENT_MESSAGE_MS], "recoverable errors are transient too");
  failing.timers.runAll();
  assert.equal(failing.message.hidden, true);
});

test("My Duo keeps no message of its own timing: every status line goes through the shared ~3 s rule module", () => {
  const source = read("dist/account/my-duo.js").replace(/\/\/.*$/gm, "");
  assert.match(source, /import \{ createTransientMessage \} from "\.\/transient-message\.js";/);
  assert.doesNotMatch(source, /setTimeout|clearTimeout|8000|10000/, "no private timers or other durations");
  assert.doesNotMatch(source, /message\.(textContent|hidden)\s*=/, "the status line is only written by the rule module");
});

// ---------- live shared state: A has the page open, B changes the Duo state, A's page updates without a manual refresh ----------
// A fake Supabase Realtime socket for the REAL private-broadcast client (realtime-client.js), so the whole path is exercised: join -> broadcast -> re-read -> re-render.
function fakeRealtime() {
  const sockets = [];
  class FakeSocket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.listeners = {}; sockets.push(this); }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { this.readyState = 3; this.closed = true; }
    open() { this.readyState = 1; for (const handler of this.listeners.open || []) handler(); }
    deliver(envelope) { for (const handler of this.listeners.message || []) handler({ data: JSON.stringify(envelope) }); }
  }
  return { FakeSocket, sockets };
}

async function openLiveSession({ rows, userId = "11111111-1111-4111-8111-111111111111", api: extraApi = {} }) {
  const server = { rows };
  const timers = fakeTimers();
  const { FakeSocket, sockets } = fakeRealtime();
  const reads = { count: 0 };
  const api = { getMyDuo: async () => { reads.count++; return server.rows; }, ...extraApi };
  const root = element("div"), message = element("p");
  message.hidden = true;
  const visibilitySwitch = ({ on, label }) => element("button", "visibility-switch", `${label}:${on ? "ON" : "OFF"}`);
  const view = createDuoPanel({ api, root, message, element, visibilitySwitch, isOwnerPublished: () => true, timers });
  await view.load();
  const subscribe = options => subscribePrivateBroadcast({ ...options, WebSocketImpl: FakeSocket, getSession: async () => ({ access_token: "token-for-test" }), setTimer: () => 0, clearTimer: () => {}, setIntervalImpl: () => 0, clearIntervalImpl: () => {} });
  const stop = subscribeDuoRealtime({ refresh: () => view.refresh(), subscribe, getUserId: () => userId, timers, win: null, doc: null });
  await tick();
  sockets[0].open();
  // the server signals this user's private topic (what the database trigger sends after B's action)
  const signal = async () => {
    sockets[0].deliver({ topic: `realtime:identity:user:${userId}`, event: "broadcast", payload: { event: "duo_changed", payload: { kind: "DUO" } } });
    timers.runAll();
    await tick(); await tick();
  };
  return { server, view, root, message, timers, sockets, signal, stop, reads, userId };
}

test("live: the page joins ONLY its own private topic identity:user:<uid> (the realtime.messages policy authorizes exactly that) and listens for duo_changed", async () => {
  const a = await openLiveSession({ rows: [] });
  const join = a.sockets[0].sent[0];
  assert.equal(join.event, "phx_join");
  assert.equal(join.topic, `realtime:identity:user:${a.userId}`);
  assert.equal(join.payload.config.private, true, "a private channel: Realtime checks the RLS policy");
  assert.equal(join.payload.access_token, "token-for-test");
  const other = await openLiveSession({ rows: [] });
  other.sockets[0].deliver({ topic: "realtime:identity:user:someone-else", event: "broadcast", payload: { event: "duo_changed", payload: { kind: "DUO" } } });
  other.sockets[0].deliver({ topic: `realtime:identity:user:${other.userId}`, event: "broadcast", payload: { event: "state_changed", payload: {} } });
  other.timers.runAll(); await tick();
  assert.equal(other.reads.count, 1, "another topic or another event never triggers a re-read");
  a.stop(); other.stop();
  assert.ok(a.sockets[0].closed);
});

test("live: B sends A a request -> A's open page shows the incoming request; B cancels -> it disappears; no manual refresh", async () => {
  const a = await openLiveSession({ rows: [] });
  assert.match(a.root.textContent, /You don't have a Duo yet/);
  a.server.rows = [{ relation: "RECEIVED", gamid_handle: "zshot", display_name: "zshot", is_published: true }];
  await a.signal();
  assert.match(a.root.textContent, /DUO REQUEST/);
  assert.match(a.root.textContent, /@zshot wants to be your Duo/);
  assert.equal(a.message.hidden, true, "the state is redrawn silently - what the other person did is told by the durable notification (tests below), never guessed");
  a.server.rows = [];
  await a.signal();
  assert.doesNotMatch(a.root.textContent, /DUO REQUEST/);
  assert.equal(a.message.hidden, true);
  a.stop();
});

// ---------- durable user-to-user notifications (what ANOTHER person did): survive offline, shown 5 s from display, marked seen only once displayed ----------
const person = (relation, handle, extra = {}) => ({ relation, gamid_handle: handle, display_name: handle, is_published: true, show_public: false, ...extra });
function notificationServer(initial = []) {
  const rows = initial.map(row => ({ ...row, seen: false }));
  const marks = [];
  return {
    rows, marks,
    add(row) { rows.push({ ...row, seen: false }); },
    api: {
      getMyDuoNotifications: async () => rows.filter(row => !row.seen).map(({ seen, ...row }) => row),
      markMyDuoNotificationsSeen: async ids => { marks.push(ids); for (const row of rows) if (ids.includes(row.notification_id)) row.seen = true; return ids.length; },
    },
  };
}
function notifierPage(server, { visible = true } = {}) {
  const timers = fakeTimers();
  const notice = element("p");
  notice.hidden = true;
  const page = { visible };
  const notifier = createDuoNotifier({ api: server.api, notice, timers, isVisible: () => page.visible });
  return { notifier, notice, timers, page };
}
const note = (id, kind, actor = "zshot") => ({ notification_id: id, kind, actor_handle: actor, actor_display_name: actor, created_at: `2026-10-02T17:00:0${id}Z` });

test("notifications: the authoritative event kind decides the wording (never inferred from state); an unknown kind or unsafe handle is never shown", () => {
  const expected = {
    DUO_REQUEST_RECEIVED: "@zshot sent you a Duo request.",
    DUO_REQUEST_CANCELLED: "@zshot cancelled their Duo request.",
    DUO_REQUEST_DECLINED: "@zshot declined your Duo request.",
    DUO_REQUEST_ACCEPTED: "@zshot accepted your Duo request. You're now Duo.",
    DUO_ENDED: "@zshot ended your Duo.",
    DUO_REPLACED: "Your Duo with @zshot has ended because @zshot chose a new Duo.",
  };
  assert.deepEqual([...DUO_NOTIFICATION_KINDS].sort(), Object.keys(expected).sort());
  for (const [kind, text] of Object.entries(expected)) assert.equal(notificationText(note(1, kind)).text, text, kind);
  assert.equal(notificationText(note(1, "SOMETHING_ELSE")), null);
  assert.equal(notificationText({ ...note(1, "DUO_ENDED"), actor_handle: "<b>x</b>" }), null);
  assert.equal(DUO_NOTIFICATION_MS, 5000, "5 seconds for user-to-user notifications");
  assert.equal(TRANSIENT_MESSAGE_MS, 3000, "own-action feedback stays ~3 s");
  const migration = read("supabase/migrations/20261002190000_my_duo_notifications.sql");
  for (const kind of Object.keys(expected)) assert.match(migration, new RegExp(`'${kind}'`), `${kind} is written by the action itself`);
});

test("notifications: recipient online - B acts, the signal arrives, the notice appears at once, is marked seen once, and hides 5 s later", async () => {
  const server = notificationServer();
  const a = notifierPage(server);
  await a.notifier.check();                          // page load: nothing pending
  assert.equal(a.notice.hidden, true);
  server.add(note(1, "DUO_REQUEST_DECLINED"));        // B declines while A is online
  await a.notifier.check(); await tick();            // the Realtime signal's fetch
  assert.equal(a.notice.hidden, false);
  assert.equal(a.notice.textContent, "@zshot declined your Duo request.");
  assert.deepEqual(server.marks, [[1]], "marked seen once - when displayed");
  assert.deepEqual(a.timers.delays, [DUO_NOTIFICATION_MS]);
  a.timers.runAll();
  assert.equal(a.notice.hidden, true, "gone after 5 s");
  await a.notifier.check(); await tick();
  assert.equal(a.notice.hidden, true, "not shown again");
  assert.deepEqual(server.marks, [[1]]);
});

test("notifications: recipient offline - the action happens while A is away; A signs in later and still gets it (it was never marked seen by the event or a signal)", async () => {
  const server = notificationServer([note(7, "DUO_ENDED")]);   // stored while A was offline
  assert.deepEqual(server.marks, []);
  const later = notifierPage(server);
  await later.notifier.check(); await tick();
  assert.equal(later.notice.textContent, "@zshot ended your Duo.");
  assert.deepEqual(server.marks, [[7]]);
});

test("notifications: the 5 s begin when it is DISPLAYED - a hidden tab keeps it pending (not shown, not marked) until the person looks", async () => {
  const server = notificationServer([note(1, "DUO_REQUEST_ACCEPTED")]);
  const a = notifierPage(server, { visible: false });
  await a.notifier.check(); await tick();
  assert.equal(a.notice.hidden, true, "not displayed in a background tab");
  assert.deepEqual(server.marks, [], "not marked seen merely because it was fetched");
  assert.deepEqual(a.timers.delays, [], "no clock running yet");
  a.page.visible = true;
  a.notifier.pump(); await tick();                   // the tab became visible (duo-realtime.js re-checks on visibilitychange)
  assert.equal(a.notice.textContent, "@zshot accepted your Duo request. You're now Duo.");
  assert.deepEqual(a.timers.delays, [DUO_NOTIFICATION_MS], "the 5 s start now");
  assert.deepEqual(server.marks, [[1]]);
});

test("notifications: once seen, a later visit / refresh shows nothing again", async () => {
  const server = notificationServer([note(1, "DUO_REQUEST_RECEIVED")]);
  const first = notifierPage(server);
  await first.notifier.check(); await tick();
  assert.equal(first.notice.textContent, "@zshot sent you a Duo request.");
  const second = notifierPage(server);               // the page is reloaded
  await second.notifier.check(); await tick();
  assert.equal(second.notice.hidden, true);
  assert.deepEqual(server.marks, [[1]]);
});

test("notifications: a Realtime fetch racing the page-load fetch (both return the same unseen row) shows it once and marks it once", async () => {
  let release;
  const server = notificationServer([note(4, "DUO_REQUEST_CANCELLED")]);
  const slow = { ...server.api, getMyDuoNotifications: async () => { await new Promise(resolve => { release = resolve; }); return server.api.getMyDuoNotifications(); } };
  const timers = fakeTimers();
  const notice = element("p");
  const notifier = createDuoNotifier({ api: slow, notice, timers, isVisible: () => true });
  const load = notifier.check();
  const live = notifier.check();                     // the signal arrives while the first fetch is still running
  release(); await tick(); release?.(); await load; await live; await tick(); await tick();
  assert.equal(notice.textContent, "@zshot cancelled their Duo request.");
  assert.deepEqual(server.marks, [[4]], "one display, one mark");
  timers.runAll(); await tick();
  assert.equal(notice.hidden, true, "and nothing queued behind it");

  // the same row returned twice by two separate fetches (mark not yet applied on the server) is still shown once
  const racing = notificationServer([note(5, "DUO_ENDED")]);
  const stale = { ...racing.api, markMyDuoNotificationsSeen: async ids => { racing.marks.push(ids); return 1; } };   // the mark has not landed yet
  const page = notifierPage({ api: stale });
  await page.notifier.check(); await tick();
  await page.notifier.check(); await tick();
  page.timers.runAll(); await tick();
  assert.equal(page.notice.hidden, true, "not repeated after it hid");
  assert.deepEqual(racing.marks, [[5]]);
});

test("notifications: several that piled up while offline are shown one by one, oldest first, 5 s each, each marked only when its turn comes", async () => {
  const server = notificationServer([note(3, "DUO_REQUEST_DECLINED", "third"), note(1, "DUO_REQUEST_RECEIVED", "first"), note(2, "DUO_REQUEST_CANCELLED", "first")]);
  const a = notifierPage(server);
  await a.notifier.check(); await tick();
  const seen = [a.notice.textContent];
  assert.deepEqual(server.marks, [[1]], "only the one on screen is marked");
  a.timers.runAll(); await tick();
  seen.push(a.notice.textContent);
  assert.deepEqual(server.marks, [[1], [2]]);
  a.timers.runAll(); await tick();
  seen.push(a.notice.textContent);
  assert.deepEqual(seen, ["@first sent you a Duo request.", "@first cancelled their Duo request.", "@third declined your Duo request."]);
  assert.deepEqual(server.marks, [[1], [2], [3]]);
  a.timers.runAll(); await tick();
  assert.equal(a.notice.hidden, true);
});

test("notifications: the persistent Duo cards are separate - the request card stays after its notification was seen; own actions keep their ~3 s result line", async () => {
  const a = await openLiveSession({ rows: [person("RECEIVED", "zshot")] });
  const server = notificationServer([note(1, "DUO_REQUEST_RECEIVED")]);
  const n = notifierPage(server);
  await n.notifier.check(); await tick();
  n.timers.runAll();
  assert.equal(n.notice.hidden, true);
  await a.signal();
  assert.match(a.root.textContent, /DUO REQUEST/, "the pending request is still on screen until answered");
  a.stop();
  const html = read("dist/account/index.html");
  assert.match(html, /<p id="duoNotice" class="connections-message duo-notice" role="status" aria-live="polite" hidden><\/p>/, "notifications have their own line, apart from the own-action result line");
  const wiring = read("dist/account/account.js");
  assert.match(wiring, /duoNotifier\.check\(\);/, "pending notifications are fetched when the page loads");
  assert.match(wiring, /subscribeDuoRealtime\(\{ refresh: \(\) => Promise\.all\(\[duoPanel\.refresh\(\), duoNotifier\.check\(\)\]\) \}\)/, "and on every live signal");
});

test("notifications: privacy - stored per recipient, RPC-only, marking is scoped to the caller, the actor is never notified, the signal stays data-free", () => {
  const sql = read("supabase/migrations/20261002190000_my_duo_notifications.sql");
  assert.match(sql, /alter table public\.identity_notifications enable row level security;\nrevoke all on table public\.identity_notifications from public, anon, authenticated;/);
  assert.match(sql, /where n\.recipient_entity_id = me and n\.seen_at is null and n\.notification_id = any \(candidate_ids\)/, "only the caller's own, only unseen");
  assert.match(sql, /where n\.recipient_entity_id = me and n\.seen_at is null\s+order by n\.notification_id/, "only the caller's own, oldest first");
  assert.match(sql, /where candidate_recipient is not null and candidate_actor is not null and candidate_recipient <> candidate_actor/, "nobody is notified of their own action");
  assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ""), /realtime\.send/, "no new Realtime payload: the existing data-free signal wakes the page");
  assert.match(sql, /constraint identity_notifications_not_self check \(recipient_entity_id <> actor_entity_id\)/);
  const table = sql.slice(sql.indexOf("create table public.identity_notifications"), sql.indexOf(");", sql.indexOf("create table public.identity_notifications")));
  assert.deepEqual([...table.matchAll(/^\s+([a-z_]+) (bigint|uuid|text|timestamptz)/gm)].map(match => match[1]), ["notification_id", "recipient_entity_id", "actor_entity_id", "kind", "created_at", "seen_at"], "minimal: no message text, handles or relationship ids are stored");
  const client = read("dist/account/duo-notifications.js").replace(/\/\/.*$/gm, "");
  assert.match(client, /api\.markMyDuoNotificationsSeen\(\[id\]\)/, "the page marks exactly the one it displayed");
  assert.doesNotMatch(read("dist/account/my-duo.js"), /describeDuoChange|ownActionRecently/, "no more guessing from before/after state");
});

test("live: B accepts / declines A's request -> A's 'Request sent' card turns into MY DUO / disappears", async () => {
  const sentToB = [{ relation: "SENT", gamid_handle: "zshot", display_name: "zshot", is_published: true }];
  const accepted = await openLiveSession({ rows: sentToB });
  assert.match(accepted.root.textContent, /REQUEST SENT/);
  accepted.server.rows = [{ relation: "DUO", gamid_handle: "zshot", display_name: "zshot", is_published: true, show_public: false }];
  await accepted.signal();
  assert.doesNotMatch(accepted.root.textContent, /REQUEST SENT/);
  assert.match(accepted.root.textContent, /MY DUO/);
  assert.match(accepted.root.textContent, /Mutual Duo/);
  accepted.stop();
  const declined = await openLiveSession({ rows: sentToB });
  declined.server.rows = [];
  await declined.signal();
  assert.doesNotMatch(declined.root.textContent, /REQUEST SENT|MY DUO/);
  assert.match(declined.root.textContent, /You don't have a Duo yet/);
  declined.stop();
});

test("live: B ends the Duo, or B's acceptance of someone else replaces it -> A's Duo card disappears; B publishing / unpublishing updates A's card", async () => {
  const duo = { relation: "DUO", gamid_handle: "zshot", display_name: "zshot", is_published: false, show_public: true };
  const a = await openLiveSession({ rows: [duo] });
  assert.match(a.root.textContent, /GamID not published/);
  a.server.rows = [{ ...duo, is_published: true }];
  await a.signal();
  assert.doesNotMatch(a.root.textContent, /GamID not published/, "the Duo published their GamID");
  assert.match(a.root.textContent, /Shown on your public GamID/);
  a.server.rows = [];
  await a.signal();
  assert.doesNotMatch(a.root.textContent, /MY DUOMutual|@zshot/);
  assert.match(a.root.textContent, /You don't have a Duo yet/);
  a.stop();
});

test("live: a confirmation the person has open survives a signal only while what it confirms still exists; a burst of signals is ONE re-read", async () => {
  const a = await openLiveSession({ rows: [DUO, { relation: "RECEIVED", gamid_handle: "fan1" }] });
  await click(a.root, "Accept");
  assert.match(a.root.textContent, /Accepting replaces your current Duo/);
  await a.signal();
  assert.match(a.root.textContent, /Accepting replaces your current Duo/, "unrelated change: the open warning stays");
  a.server.rows = [DUO];
  await a.signal();
  assert.doesNotMatch(a.root.textContent, /Accepting replaces|DUO REQUEST/, "the request was withdrawn: its warning goes with it");
  const before = a.reads.count;
  for (let i = 0; i < 3; i++) a.sockets[0].deliver({ topic: `realtime:identity:user:${a.userId}`, event: "broadcast", payload: { event: "duo_changed", payload: { kind: "DUO" } } });
  a.timers.runAll(); await tick(); await tick();
  assert.equal(a.reads.count, before + 1, "an accept that also ends older Duos sends several signals - one re-read");
  a.stop();
});

test("live scheduler + reconnect catch-up: signals during a re-read schedule exactly one more; becoming visible again re-reads once", async () => {
  const timers = fakeTimers();
  let release, runs = 0;
  const schedule = createDuoRefreshScheduler(() => { runs++; return new Promise(resolve => { release = resolve; }); }, { timers });
  schedule(); schedule(); timers.runAll(); await tick();
  assert.equal(runs, 1);
  schedule(); schedule();
  assert.deepEqual(timers.delays, [], "nothing queued while running");
  release(); await tick(); await tick();
  timers.runAll(); await tick();
  assert.equal(runs, 2, "exactly one follow-up");
  release(); await tick();

  const doc = { visibilityState: "visible", handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, removeEventListener(type) { delete this.handlers[type]; } };
  let refreshed = 0;
  const stop = subscribeDuoRealtime({ refresh: async () => { refreshed++; }, subscribe: () => () => {}, getUserId: () => "u1", timers, win: null, doc });
  doc.handlers.visibilitychange(); timers.runAll(); await tick();
  assert.equal(refreshed, 1, "back to the tab: one catch-up re-read (broadcasts are not replayed after a disconnect)");
  doc.visibilityState = "hidden"; doc.handlers.visibilitychange(); timers.runAll(); await tick();
  assert.equal(refreshed, 1, "not while hidden");
  stop();
  assert.equal(doc.handlers.visibilitychange, undefined);
  assert.deepEqual(subscribeDuoRealtime({ refresh: () => {}, subscribe: () => { throw new Error("must not subscribe"); }, getUserId: () => null })(), undefined, "signed out: nothing to join");
});

test("live: a re-read never interrupts the page's own running action, and a failed re-read keeps the state on screen", async () => {
  let resolveSend;
  const server = { rows: [] };
  const api = {
    getMyDuo: async () => { if (server.fail) throw new Error("offline"); return server.rows; },
    searchDuoCandidates: async () => [{ gamid_handle: "newbie", display_name: "New", is_published: true }],
    sendDuoRequest: () => new Promise(resolve => { resolveSend = resolve; }),
  };
  const root = element("div"), message = element("p");
  const view = createDuoPanel({ api, root, message, element, visibilitySwitch: () => element("span"), timers: fakeTimers() });
  await view.load();
  const input = all(root, node => node.tag === "input")[0];
  input.value = "newbie"; await input.fire("input");
  await all(root, node => node.tag === "form")[0].fire("submit"); await tick();
  const [request] = byText(root, "button", "Request");
  const pending = request.fire("click");
  server.rows = [{ relation: "RECEIVED", gamid_handle: "other" }];
  await view.refresh();
  assert.doesNotMatch(root.textContent, /DUO REQUEST/, "skipped while the own action runs");
  server.rows = [{ relation: "SENT", gamid_handle: "newbie" }];
  resolveSend(); await pending; await tick();
  assert.match(root.textContent, /REQUEST SENT/, "the action itself re-reads when it finishes");
  server.fail = true;
  await view.refresh();
  assert.match(root.textContent, /REQUEST SENT/, "a failed live re-read keeps the last good state");
});

test("live: the migration signals both participants of every relationship change (and Duo partners of a GamID publication / name / avatar change) with a data-free private broadcast", () => {
  const sql = read("supabase/migrations/20261002170000_my_duo_realtime.sql");
  assert.match(sql, /create policy "identity_relationship_broadcasts"\s+on realtime\.messages for select to authenticated\s+using \(\s+extension = 'broadcast'\s+and realtime\.topic\(\) = 'identity:user:' \|\| \(select auth\.uid\(\)\)::text\s+\);/);
  assert.match(sql, /realtime\.send\(jsonb_build_object\('kind', 'DUO'\), 'duo_changed', 'identity:user:' \|\| candidate_user_id::text, true\)/, "private, no ids");
  assert.match(sql, /after insert or update or delete on public\.identity_relationships/);
  assert.match(sql, /old\.requester_entity_id[\s\S]*old\.addressee_entity_id[\s\S]*new\.requester_entity_id[\s\S]*new\.addressee_entity_id/, "old and new row: an ended Duo signals its former partner too");
  assert.match(sql, /after update of visibility, display_name, avatar_media_reference on public\.entities/);
  assert.match(sql, /exception when others then\s+-- live delivery must never roll back/);
  assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ""), /create table|alter table|drop |insert into public|update public|delete from public/i, "no business data or rule changes");
  const client = read("dist/account/duo-realtime.js").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(client, /setInterval/, "no polling");
  assert.match(read("dist/account/account.js"), /stopDuoRealtime = subscribeDuoRealtime\(\{ refresh: \(\) => Promise\.all\(\[duoPanel\.refresh\(\), duoNotifier\.check\(\)\]\) \}\);/);
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
