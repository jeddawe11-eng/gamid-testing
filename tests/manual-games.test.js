// Manual game add / edit / remove in the ONE My Games library: platform selection, merge with provider discovery, MANUAL trust, and the accepted list behavior.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_LIST_PREVIEW, buildGameLibrary } from "../dist/account/game-list.js";
import { attachGameProfile, indexGameProfiles, profileForGame } from "../dist/account/game-profile.js";
import {
  buildLibraryRows, initialSelection, normalizeManualGames, normalizePlatformState, platformSummary, rowGameKey, saveDisabledReason, selectablePlatforms, selectionKeys, toggleSelection,
} from "../dist/account/game-platforms.js";
import { addManualPlatformsToDiscoveredItem, createAddGamePanel, manualGameItem } from "../dist/account/manual-games.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ------------------------------------------------------------------------------------------------ a minimal fake DOM (no jsdom in this project)
function fake(tag, className, text) {
  const node = { tag, className: className || "", text: text ?? "", children: [], attrs: {}, dataset: {}, listeners: {}, id: "", type: "", hidden: false, value: "", checked: false, disabled: false, focused: false };
  Object.defineProperty(node, "textContent", { get: () => node.text, set: value => { node.text = value; } });
  node.append = (...items) => { node.children.push(...items); };
  node.replaceChildren = (...items) => { node.children = items; };
  node.setAttribute = (key, value) => { node.attrs[key] = String(value); };
  node.addEventListener = (event, handler) => { (node.listeners[event] ||= []).push(handler); };
  node.dispatch = (event, payload = {}) => { for (const handler of node.listeners[event] || []) handler({ ...payload }); };
  node.click = () => { if (!node.disabled) node.dispatch("click"); };
  node.focus = () => { node.focused = true; };
  return node;
}
const find = (node, predicate, out = []) => { if (predicate(node)) out.push(node); for (const child of node.children || []) if (child && typeof child === "object") find(child, predicate, out); return out; };
const byClass = (node, name) => find(node, n => n.className.split(" ").includes(name));
const textOf = node => [node.text, ...(node.children || []).map(child => (typeof child === "object" ? textOf(child) : ""))].join(" ").replace(/\s+/g, " ").trim();
const flush = () => new Promise(resolve => setImmediate(resolve));
const tick = async () => { await flush(); await flush(); };

// ------------------------------------------------------------------------------------------------ fixtures
const P = (platform_key, display_name, family = "PC", parent_platform_key = null) => ({ platform_key, display_name, family, parent_platform_key });
const MARVEL = {
  game_key: "marvel_rivals", display_name: "Marvel Rivals",
  supported: [P("pc", "PC"), P("steam", "Steam", "PC", "pc"), P("ps5", "PlayStation 5", "PLAYSTATION"), P("xbox_series", "Xbox Series X|S", "XBOX")],
  established: [{ platform_key: "steam", display_name: "Steam" }],
  manual: [],
};
const ZORK = {
  game_key: "qzxplore_saga", display_name: "Qzxplore Saga",
  supported: [P("pc", "PC"), P("ps5", "PlayStation 5", "PLAYSTATION"), P("xbox_one", "Xbox One", "XBOX")],
  established: [], manual: [],
};
const CATALOG = [
  { game_key: "marvel_rivals", display_name: "Marvel Rivals", matched_alias: null },
  { game_key: "mario_kart", display_name: "Mario Kart", matched_alias: null },
  { game_key: "qzxplore_saga", display_name: "Qzxplore Saga", matched_alias: "Zorkling Chronicles" },
];

// A fake backend that records every call, plus a manual clock for the debounce.
function setup({ states = { marvel_rivals: MARVEL, qzxplore_saga: ZORK }, inLibrary = () => false, saveError = null, removeError = null, searchRows = CATALOG } = {}) {
  const calls = { search: [], state: [], save: [], remove: [] };
  const done = [];
  const timers = new Map();
  let nextTimer = 1;
  const api = {
    searchGames: async (query, limit) => { calls.search.push({ query, limit }); return searchRows; },
    getPlatformState: async key => { calls.state.push(key); if (!states[key]) throw Object.assign(new Error("INVALID_GAME"), { code: "22023" }); return states[key]; },
    saveGame: async (key, platforms) => { calls.save.push({ key, platforms }); if (saveError) throw new Error(saveError); return "SAVED"; },
    removeGame: async key => { calls.remove.push(key); if (removeError) throw new Error(removeError); return 1; },
  };
  const panel = createAddGamePanel({
    element: fake, api, isInLibrary: inLibrary, onDone: result => done.push(result),
    schedule: (fn, delay) => { const id = nextTimer++; timers.set(id, fn); return id; },
    cancel: id => timers.delete(id),
  });
  const input = byClass(panel.root, "game-add-input")[0];
  const type = text => { input.value = text; input.dispatch("input"); };
  const fireTimers = async () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } await tick(); };
  const hint = () => textOf(byClass(panel.root, "game-add-hint")[0]);
  const results = () => byClass(panel.root, "game-result");
  const platformBoxes = () => find(panel.root, n => n.tag === "input" && n.type === "checkbox");
  const option = name => byClass(panel.root, "game-platform-option").find(o => textOf(o).startsWith(name));
  const button = cls => byClass(panel.root, cls)[0];
  return { panel, calls, done, api, input, type, fireTimers, hint, results, platformBoxes, option, button };
}

// ------------------------------------------------------------------------------------------------ search UX inside the panel
test("opening the panel queries nothing and says what to do; below 3 characters still nothing, and no full catalog is ever loaded", async () => {
  const t = setup();
  assert.equal(t.panel.root.hidden, true, "closed until the owner taps + Add Game");
  assert.deepEqual(t.calls, { search: [], state: [], save: [], remove: [] }, "constructing the panel asks the server nothing");
  t.panel.openSearch();
  assert.equal(t.panel.root.hidden, false);
  assert.equal(t.hint(), "Type at least 3 characters to search.");
  assert.equal(t.input.focused, true);
  t.type("m"); t.type("ma");
  await t.fireTimers();
  assert.equal(t.calls.search.length, 0);
  assert.equal(t.hint(), "Type at least 3 characters to search.");
  assert.equal(t.results().length, 0);
});

test("at 3 characters the panel searches (debounced), shows bounded suggestions, and narrows as more is typed", async () => {
  const t = setup();
  t.panel.openSearch();
  t.type("mar");
  assert.equal(t.calls.search.length, 0, "not on the keystroke");
  assert.equal(t.hint(), "Searching…");
  await t.fireTimers();
  assert.deepEqual(t.calls.search, [{ query: "mar", limit: 10 }]);
  assert.deepEqual(t.results().map(r => textOf(byClass(r, "game-result-name")[0])), ["Marvel Rivals", "Mario Kart", "Qzxplore Saga"]);
  assert.match(textOf(t.results()[2]), /Also known as Zorkling Chronicles/, "an alias match says which alias matched");
  assert.equal(t.hint(), "Choose your game. Keep typing to narrow the list.");
});

test("a large catalog never floods the list: at most 10 suggestions render however many the backend returns", async () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ game_key: `game_${String(i).padStart(3, "0")}`, display_name: `Game ${i}`, matched_alias: null }));
  const t = setup({ searchRows: many });
  t.panel.openSearch();
  t.type("gam");
  await t.fireTimers();
  assert.equal(t.results().length, 10);
  assert.match(t.hint(), /closest matches/);
});

test("no results and a failed search are different messages, and neither offers an invented game", async () => {
  const empty = setup({ searchRows: [] });
  empty.panel.openSearch(); empty.type("zzz"); await empty.fireTimers();
  assert.match(empty.hint(), /No matching games/);
  const broken = setup();
  broken.api.searchGames = async () => { throw new Error("NETWORK_ERROR"); };
  broken.panel.openSearch(); broken.type("mar"); await broken.fireTimers();
  assert.match(broken.hint(), /Couldn't search right now/);
  assert.equal(broken.results().length, 0);
});

test("a game already in the library is flagged 'In My Games' in the results (it is the same canonical game, not a new one)", async () => {
  const t = setup({ inLibrary: key => key === "marvel_rivals" });
  t.panel.openSearch(); t.type("marv"); await t.fireTimers();
  assert.match(textOf(t.results()[0]), /In My Games/);
  assert.doesNotMatch(textOf(t.results()[1]), /In My Games/);
});

// ------------------------------------------------------------------------------------------------ platform selection: one, several, locked provider platforms
test("selecting a result loads THAT game's platforms only, and Add stays disabled until at least one is chosen", async () => {
  const t = setup();
  t.panel.openSearch(); t.type("qzx"); await t.fireTimers();
  t.results()[2].click(); await tick();
  assert.deepEqual(t.calls.state, ["qzxplore_saga"]);
  assert.equal(textOf(byClass(t.panel.root, "game-add-title")[0]), "Qzxplore Saga");
  assert.deepEqual(byClass(t.panel.root, "game-platform-option").map(o => textOf(o)), ["PC", "PlayStation 5", "Xbox One"], "only the platforms the catalog lists, in the catalog's order");
  assert.equal(t.button("game-add-save").disabled, true);
  assert.equal(textOf(t.button("game-add-save")), "Add to My Games");
});

test("one platform: saves exactly that platform for the canonical game key, then closes and reports 'added'", async () => {
  const t = setup();
  t.panel.openSearch(); t.type("qzx"); await t.fireTimers();
  t.results()[2].click(); await tick();
  const [pc] = t.platformBoxes();
  pc.checked = true; pc.dispatch("change");
  assert.equal(t.button("game-add-save").disabled, false);
  t.button("game-add-save").click(); await tick();
  assert.deepEqual(t.calls.save, [{ key: "qzxplore_saga", platforms: ["pc"] }]);
  assert.deepEqual(t.done, [{ mode: "added", gameKey: "qzxplore_saga", name: "Qzxplore Saga" }]);
  assert.equal(t.panel.root.hidden, true);
});

test("multiple platforms: every ticked platform is saved in the catalog's order, and un-ticking removes it before saving", async () => {
  const t = setup();
  t.panel.openSearch(); t.type("qzx"); await t.fireTimers();
  t.results()[2].click(); await tick();
  const [pc, ps5, xb1] = t.platformBoxes();
  for (const box of [xb1, pc, ps5]) { box.checked = true; box.dispatch("change"); }
  ps5.checked = false; ps5.dispatch("change");
  t.button("game-add-save").click(); await tick();
  assert.deepEqual(t.calls.save, [{ key: "qzxplore_saga", platforms: ["pc", "xbox_one"] }]);
});

test("a platform a provider already established is shown LOCKED (checked, disabled, explained) and can never be sent as a manual declaration", async () => {
  const t = setup();
  t.panel.openSearch(); t.type("marv"); await t.fireTimers();
  t.results()[0].click(); await tick();
  const locked = byClass(t.panel.root, "game-platform-option").filter(o => o.className.includes("is-locked"));
  assert.equal(locked.length, 1);
  assert.match(textOf(locked[0]), /Steam.*Discovered through your connected account/);
  const lockedBox = find(locked[0], n => n.tag === "input")[0];
  assert.equal(lockedBox.checked, true);
  assert.equal(lockedBox.disabled, true);
  assert.deepEqual(byClass(t.panel.root, "game-platform-option").filter(o => !o.className.includes("is-locked")).map(o => textOf(o)), ["PC", "PlayStation 5", "Xbox Series X|S"]);
  // tick PlayStation 5 only: Steam is not part of the request
  const selectable = t.platformBoxes().filter(box => !box.disabled);
  selectable[1].checked = true; selectable[1].dispatch("change");
  t.button("game-add-save").click(); await tick();
  assert.deepEqual(t.calls.save, [{ key: "marvel_rivals", platforms: ["ps5"] }]);
});

test("everything the panel says about a manual game says MANUAL: never verified, never connected, never 'discovered via'", async () => {
  const t = setup();
  t.panel.openSearch(); t.type("qzx"); await t.fireTimers();
  t.results()[2].click(); await tick();
  const text = textOf(t.panel.root);
  assert.match(text, /MANUAL: platforms you choose here are declared by you\. GamID does not verify them/);
  assert.doesNotMatch(text, /VERIFIED|CONNECTED|Discovered via/);
  assert.doesNotMatch(text, /verified by|✓/);
});

// ------------------------------------------------------------------------------------------------ edit and remove
test("editing a manual game opens straight on its platforms with the declared ones ticked; saving reports 'updated'", async () => {
  const t = setup({ states: { qzxplore_saga: { ...ZORK, manual: [{ platform_key: "pc", display_name: "PC" }, { platform_key: "ps5", display_name: "PlayStation 5" }] } } });
  t.panel.openEditor("qzxplore_saga", "Qzxplore Saga"); await tick();
  assert.equal(t.panel.root.hidden, false);
  assert.deepEqual(t.platformBoxes().map(box => box.checked), [true, true, false]);
  assert.equal(textOf(t.button("game-add-save")), "Save platforms");
  assert.equal(textOf(t.button("game-add-back")), "Cancel", "opened from a row, there is no search to go back to");
  const ps5 = t.platformBoxes()[1];
  ps5.checked = false; ps5.dispatch("change");
  t.button("game-add-save").click(); await tick();
  assert.deepEqual(t.calls.save, [{ key: "qzxplore_saga", platforms: ["pc"] }]);
  assert.equal(t.done[0].mode, "updated");
});

test("a game with no manual platform left cannot be 'saved empty': removal is its own explicit, confirmed action", async () => {
  const t = setup({ states: { qzxplore_saga: { ...ZORK, manual: [{ platform_key: "pc", display_name: "PC" }] } } });
  t.panel.openEditor("qzxplore_saga", "Qzxplore Saga"); await tick();
  const pc = t.platformBoxes()[0];
  pc.checked = false; pc.dispatch("change");
  assert.equal(t.button("game-add-save").disabled, true);
  assert.equal(t.calls.remove.length, 0);
});

test("REMOVE a manual-only game: asks first, then removes only that game's manual declarations", async () => {
  const t = setup({ states: { qzxplore_saga: { ...ZORK, manual: [{ platform_key: "pc", display_name: "PC" }] } } });
  t.panel.openEditor("qzxplore_saga", "Qzxplore Saga"); await tick();
  assert.equal(textOf(t.button("game-add-remove")), "Remove from My Games");
  t.button("game-add-remove").click();
  assert.equal(t.calls.remove.length, 0, "one tap only asks");
  assert.match(textOf(byClass(t.panel.root, "game-add-confirm")[0]), /Remove Qzxplore Saga from My Games\? Only the platforms you added are removed\./);
  t.button("game-add-keep").click();
  assert.equal(t.calls.remove.length, 0);
  t.button("game-add-remove").click();
  t.button("game-add-remove-confirm").click(); await tick();
  assert.deepEqual(t.calls.remove, ["qzxplore_saga"]);
  assert.deepEqual(t.done, [{ mode: "removed", gameKey: "qzxplore_saga", name: "Qzxplore Saga" }]);
});

test("REMOVE on a game a provider discovered says so and only removes what the owner added (the discovered game stays)", async () => {
  const t = setup({ states: { marvel_rivals: { ...MARVEL, manual: [{ platform_key: "ps5", display_name: "PlayStation 5" }] } } });
  t.panel.openEditor("marvel_rivals", "Marvel Rivals"); await tick();
  assert.equal(textOf(t.button("game-add-remove")), "Remove what I added");
  t.button("game-add-remove").click();
  assert.match(textOf(byClass(t.panel.root, "game-add-confirm")[0]), /stays in My Games because your connected account discovered it/);
  assert.equal(textOf(t.button("game-add-remove-confirm")), "Remove what I added");
  t.button("game-add-remove-confirm").click(); await tick();
  assert.deepEqual(t.calls.remove, ["marvel_rivals"]);
});

test("a removal that fails keeps the game and tells the owner; a save that fails keeps the panel open with a plain message", async () => {
  const t = setup({ states: { qzxplore_saga: { ...ZORK, manual: [{ platform_key: "pc", display_name: "PC" }] } }, removeError: "NETWORK_ERROR" });
  t.panel.openEditor("qzxplore_saga", "Qzxplore Saga"); await tick();
  t.button("game-add-remove").click(); t.button("game-add-remove-confirm").click(); await tick();
  assert.equal(t.done.length, 0);
  assert.equal(t.panel.root.hidden, false);
  assert.match(textOf(byClass(t.panel.root, "game-add-message")[0]), /couldn't be reached/);
  const s = setup({ saveError: "PLATFORM_ALREADY_DISCOVERED" });
  s.panel.openSearch(); s.type("qzx"); await s.fireTimers(); s.results()[2].click(); await tick();
  s.platformBoxes()[0].checked = true; s.platformBoxes()[0].dispatch("change");
  s.button("game-add-save").click(); await tick();
  assert.equal(s.done.length, 0);
  assert.match(textOf(byClass(s.panel.root, "game-add-message")[0]), /already discovered through your connected account/);
  assert.equal(s.button("game-add-save").disabled, false, "the owner can adjust and try again");
});

test("an unknown or malformed platform state is refused, not guessed (the owner sees a message and can go back)", async () => {
  const t = setup({ states: {} });
  t.panel.openSearch(); t.type("mar"); await t.fireTimers();
  t.results()[0].click(); await tick();
  assert.match(textOf(byClass(t.panel.root, "game-add-message")[0]), /isn't in the catalog/);
  assert.equal(byClass(t.panel.root, "game-platform-option").length, 0);
  t.button("game-add-back").click();
  assert.equal(t.hint().length > 0, true);
});

test("Escape and Close leave without saving anything; the input is cleared for the next time", async () => {
  const t = setup();
  t.panel.openSearch(); t.type("mar"); await t.fireTimers();
  t.panel.root.dispatch("keydown", { key: "Escape" });
  assert.equal(t.panel.root.hidden, true);
  assert.deepEqual(t.done, [{ mode: "closed" }]);
  assert.equal(t.calls.save.length, 0);
  t.panel.openSearch();
  assert.equal(t.input.value, "");
  assert.equal(t.results().length, 0);
});

// ------------------------------------------------------------------------------------------------ platform model
test("platform state is normalized fail-safe: unknown/invalid platforms are dropped, manual outside the catalog list is not offered", () => {
  const state = normalizePlatformState({ ...MARVEL, supported: [...MARVEL.supported, { platform_key: "Bad Key", display_name: "x" }, null], manual: [{ platform_key: "ps5", display_name: "PlayStation 5" }, { platform_key: "switch", display_name: "Nintendo Switch" }] });
  assert.deepEqual(state.supported.map(p => p.key), ["pc", "steam", "ps5", "xbox_series"]);
  assert.deepEqual(state.manual.map(p => p.key), ["ps5"], "a stored declaration the catalog no longer lists is not editable here");
  assert.deepEqual(state.established.map(p => p.key), ["steam"]);
  for (const bad of [null, undefined, {}, { game_key: "Bad Key", display_name: "x" }, { game_key: "ok_game", display_name: "" }, "x"]) assert.equal(normalizePlatformState(bad), null);
});

test("selection logic: locked and unknown keys cannot be toggled, one or many can be chosen, the request follows the catalog order", () => {
  const state = normalizePlatformState(MARVEL);
  assert.deepEqual(selectablePlatforms(state).map(p => p.key), ["pc", "ps5", "xbox_series"], "Steam is established by the provider, so it is not selectable");
  let selection = initialSelection(state);
  assert.equal(saveDisabledReason(state, selection), "Choose at least one platform.");
  selection = toggleSelection(selection, "steam", state);
  assert.equal(selection.has("steam"), false, "a provider-established platform cannot be toggled by hand");
  selection = toggleSelection(selection, "nonsense", state);
  assert.equal(selection.size, 0);
  selection = toggleSelection(toggleSelection(selection, "xbox_series", state), "pc", state);
  assert.deepEqual(selectionKeys(selection, state), ["pc", "xbox_series"]);
  assert.equal(saveDisabledReason(state, selection), null);
  const onlyEstablished = normalizePlatformState({ ...MARVEL, supported: [P("steam", "Steam")] });
  assert.match(saveDisabledReason(onlyEstablished, new Set()), /doesn't list any other platforms/);
});

test("manual game rows are always MANUAL, whatever the server field says, and malformed rows are dropped", () => {
  const games = normalizeManualGames([
    { game_key: "qzxplore_saga", display_name: "Qzxplore Saga", trust_status: "VERIFIED", added_at: "2026-09-21T10:00:00Z", platforms: [{ platform_key: "pc", display_name: "PC" }] },
    { game_key: "qzxplore_saga", display_name: "duplicate", platforms: [{ platform_key: "pc", display_name: "PC" }] },
    { game_key: "no_platforms", display_name: "No platforms", platforms: [] }, { game_key: "Bad Key", display_name: "x", platforms: [{ platform_key: "pc", display_name: "PC" }] }, null,
  ]);
  assert.equal(games.length, 1);
  assert.equal(games[0].trust, "MANUAL");
  assert.equal(platformSummary(games[0].platforms), "PC");
});

// ------------------------------------------------------------------------------------------------ one library: merge, no duplicates
const steamGame = (id, name, key = null, playtime = 60) => ({ external_game_id: String(id), game_name: name, icon_ref: null, playtime_minutes: playtime, trust_status: "DISCOVERED_FROM_STEAM", recognized_game_key: key });
const manualGame = (key, name, platforms) => normalizeManualGames([{ game_key: key, display_name: name, added_at: "2026-09-21T10:00:00Z", platforms: platforms.map(([k, label]) => ({ platform_key: k, display_name: label })) }])[0];

test("MERGE: a manual game the provider already discovered becomes ONE row (the discovered row), never a second Marvel Rivals", () => {
  const discovered = [steamGame(2767030, "Marvel Rivals", "marvel_rivals", 7200), steamGame(570, "Dota 2", null)];
  const manual = [manualGame("marvel_rivals", "Marvel Rivals", [["ps5", "PlayStation 5"]])];
  const rows = buildLibraryRows(discovered, manual);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter(row => rowGameKey(row) === "marvel_rivals").length, 1);
  const marvel = rows.find(row => rowGameKey(row) === "marvel_rivals");
  assert.equal(marvel.kind, "discovered", "the provider provenance row is the one that is shown");
  assert.equal(marvel.manual.platforms[0].key, "ps5");
  assert.equal(rows.find(row => row.game.external_game_id === "570").manual, null);
});

test("MERGE: manual-only games are listed first (a short deliberate list is not buried under a long provider library); a duplicate provider key merges only once", () => {
  const discovered = Array.from({ length: 82 }, (_, i) => steamGame(1000 + i, `Steam Game ${i}`, i === 1 || i === 2 ? "same_game" : null));
  const rows = buildLibraryRows(discovered, [manualGame("qzxplore_saga", "Qzxplore Saga", [["pc", "PC"]]), manualGame("same_game", "Same Game", [["ps5", "PlayStation 5"]])]);
  assert.equal(rows.length, 83, "82 discovered + 1 manual-only; the merged manual game adds no row");
  assert.equal(rows[0].kind, "manual");
  assert.equal(rows.filter(row => row.kind === "discovered" && row.manual).length, 1, "two discovered rows with the same canonical key never both claim one declaration");
});

test("the row for a manual-only game states its provenance plainly (added by you, manual, not verified) and offers Edit; it never says discovered", () => {
  const row = buildLibraryRows([], [manualGame("qzxplore_saga", "Qzxplore Saga", [["pc", "PC"], ["ps5", "PlayStation 5"]])])[0];
  let edited = 0;
  const item = manualGameItem({ element: fake, row, onEdit: () => { edited += 1; } });
  const text = textOf(item);
  assert.match(text, /Qzxplore Saga/);
  assert.match(text, /Added by you \(manual, not verified\)/);
  assert.match(text, /PC · PlayStation 5/);
  assert.doesNotMatch(text, /Discovered via|VERIFIED|CONNECTED/);
  const edit = byClass(item, "game-edit-button")[0];
  assert.equal(edit.attrs["aria-label"], "Edit the platforms you added for Qzxplore Saga");
  edit.click();
  assert.equal(edited, 1);
});

test("the merged row keeps its real provider line and adds a separate, labelled line for what the owner added", () => {
  const item = fake("li", "game-item");
  const copy = fake("span", "game-copy");
  copy.append(fake("span", "game-name", "Marvel Rivals"), fake("span", "game-meta", "120 h · Discovered via Steam"));
  item.append(fake("span", "game-icon", "M"), copy);
  addManualPlatformsToDiscoveredItem({ element: fake, item, copy, manual: manualGame("marvel_rivals", "Marvel Rivals", [["ps5", "PlayStation 5"], ["xbox_series", "Xbox Series X|S"]]), gameName: "Marvel Rivals", onEdit: () => {} });
  const text = textOf(item);
  assert.match(text, /120 h · Discovered via Steam/);
  assert.match(text, /Also added by you: PlayStation 5 · Xbox Series X\|S/);
  assert.doesNotMatch(text, /Discovered via (PlayStation|Xbox)/i, "no provider is claimed for a platform that was only declared");
});

// ------------------------------------------------------------------------------------------------ accepted behavior preserved
test("Show all / Show fewer still bound a large mixed library: 8 rows collapsed, the count is the real total, manual rows included", () => {
  const rows = buildLibraryRows(Array.from({ length: 243 }, (_, i) => steamGame(i + 1, `Game ${i + 1}`)), [manualGame("qzxplore_saga", "Qzxplore Saga", [["pc", "PC"]])]);
  let expanded = false;
  const build = () => buildGameLibrary({ element: fake, games: rows, renderItem: row => fake("li", "game-item", row.kind), expanded, onToggle: () => { expanded = !expanded; }, id: "gameList-library" });
  const collapsed = build();
  assert.equal(byClass(collapsed, "game-item").length, GAME_LIST_PREVIEW);
  assert.equal(textOf(byClass(collapsed, "game-library-count")[0]), "244 games");
  assert.equal(byClass(collapsed, "game-item")[0].text, "manual", "the manual game is inside the collapsed preview");
  byClass(collapsed, "game-library-toggle")[0].click();
  const open = build();
  assert.equal(byClass(open, "game-item").length, 244);
  assert.match(textOf(byClass(open, "game-library-toggle")[0]), /Show fewer games/);
});

test("the Game Profile affordance still attaches to a merged row by canonical key, and manual-only rows get none (no profile, no arrow)", () => {
  const profile = { game_key: "marvel_rivals", identity_source: "MANUAL_UID", identity_ref: "1", data_source: "SAMPLE_PROVIDER", data_source_class: "THIRD_PARTY", trust_status: "MANUAL", fields: [{ key: "rank", label: "Rank", value: "Gold" }], fetched_at: null };
  const index = indexGameProfiles([profile]);
  const item = fake("li", "game-item");
  const copy = fake("span", "game-copy");
  item.append(fake("span", "game-icon", "M"), copy);
  addManualPlatformsToDiscoveredItem({ element: fake, item, copy, manual: manualGame("marvel_rivals", "Marvel Rivals", [["ps5", "PlayStation 5"]]), gameName: "Marvel Rivals", onEdit: () => {} });
  attachGameProfile({ element: fake, item, profile: profileForGame(index, "marvel_rivals"), stateKey: "steam:2767030", expanded: new Set(), gameName: "Marvel Rivals" });
  assert.equal(byClass(item, "game-profile-toggle").length, 1);
  assert.equal(byClass(item, "game-edit-button").length, 1);
  const manualOnly = manualGameItem({ element: fake, row: buildLibraryRows([], [manualGame("qzxplore_saga", "Qzxplore Saga", [["pc", "PC"]])])[0], onEdit: () => {} });
  assert.equal(byClass(manualOnly, "game-profile-toggle").length, 0);
  const account = read("dist/account/account.js");
  assert.match(account, /if \(profile\) attachGameProfile\(/);
  assert.match(account, /profileForGame\(gameProfileIndex, game\.recognized_game_key\)/);
});

test("playtime privacy is untouched: manual games carry no playtime, and the owner-private playtime line and the public switch are exactly as before", () => {
  const account = read("dist/account/account.js");
  assert.match(account, /Number\.isInteger\(game\.playtime_minutes\) \? gameHours\(game\.playtime_minutes\)/);
  assert.match(account, /label: "Show playtime on my GamID"/);
  assert.match(account, /Hidden\. Hours played are never shown on your public GamID\./);
  const manualSource = read("dist/account/manual-games.js") + read("dist/account/game-platforms.js");
  assert.doesNotMatch(manualSource, /playtime|hours/i, "a manual declaration has no playtime at all");
});

// ------------------------------------------------------------------------------------------------ wiring, network and mobile
test("rendering My Games asks the catalog nothing: only typing in the panel searches, and nothing external is contacted", () => {
  const account = read("dist/account/account.js");
  const start = account.indexOf("// My Games: the ONE library.");
  const region = account.slice(start, account.indexOf("// League of Legends PROTOTYPE"));
  const render = region.slice(region.indexOf("function renderMyGames"), region.indexOf("async function loadManualGames"));
  assert.doesNotMatch(render, /searchGameCatalog|getMyGamePlatformState|saveMyManualGame|removeMyManualGame|fetch\(/);
  assert.match(region, /api: \{ searchGames: api\.searchGameCatalog, getPlatformState: api\.getMyGamePlatformState, saveGame: api\.saveMyManualGame, removeGame: api\.removeMyManualGame \}/);
  // the only page-load read is the owner's own manual list (a database read)
  const loader = account.slice(account.indexOf("async function loadConnections"), account.indexOf("async function beginConnection"));
  assert.match(loader, /await loadManualGames\(\);/);
  assert.doesNotMatch(loader, /searchGameCatalog/);
  for (const path of ["dist/account/manual-games.js", "dist/account/game-platforms.js", "dist/account/game-search.js"]) {
    assert.doesNotMatch(read(path).replace(/\/\/.*$/gm, ""), /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|https?:\/\/|innerHTML|outerHTML|insertAdjacentHTML|localStorage/, path);
  }
  const client = read("dist/account/supabase-client.js");
  assert.match(client, /rpc\("search_game_catalog", \{ candidate_query: query, candidate_limit: limit \}\)/);
  assert.doesNotMatch(client, /from\("game_catalog|\/rest\/v1\/game_catalog|\/rest\/v1\/entity_game_platforms|\/rest\/v1\/game_platforms/, "no direct table access from the browser");
});

test("the new modules are provider-neutral: no provider or game is named in the catalog search, platform logic or Add Game UI", () => {
  for (const path of ["dist/account/manual-games.js", "dist/account/game-platforms.js", "dist/account/game-search.js"]) {
    assert.doesNotMatch(read(path).replace(/\/\/.*$/gm, ""), /steam|xbox|playstation|discord|riot|epic|nintendo|marvel|rivals|wikidata|igdb|opgg/i, path);
  }
});

test("mobile and touch: 44 px targets, wrapping text, no hover-only affordance, no clipping, single column", () => {
  const css = read("dist/account/account.css");
  const block = css.slice(css.indexOf("/* My Games: the ONE provider-neutral library"), css.indexOf("/* Steam Connection Foundation:"));
  assert.ok(block.length > 500);
  for (const selector of [".game-result", ".game-platform-option"]) assert.match(block, new RegExp(`${selector.replace(".", "\\.")}\\{[^}]*min-height:2\\.75rem`), `${selector} is a 44 px target`);
  assert.match(block, /\.game-library \.game-edit-button\{[^}]*min-height:2\.75rem[^}]*min-width:2\.75rem/);
  assert.match(block, /\.my-games \.game-add-button\{[^}]*min-height:2\.9rem/);
  assert.match(block, /\.game-add-panel \.game-add-close\{[^}]*min-height:2\.75rem/);
  assert.match(block, /touch-action:manipulation/);
  assert.match(block, /\.game-platform-option input\{[^}]*width:1\.35rem/, "the checkbox is not stretched by the page-wide input rule");
  assert.match(block, /overflow-wrap:anywhere/);
  assert.doesNotMatch(block, /text-overflow:ellipsis|white-space:nowrap|data-provider|:hover\{[^}]*display/);
  assert.match(block, /\.game-add-panel\[hidden\],\.game-add-search\[hidden\],\.game-add-platforms\[hidden\]\{display:none\}/, "the hidden attribute is respected");
});

test("the account page has ONE My Games region outside the connection cards and the existing Connections section is intact", () => {
  const html = read("dist/account/index.html");
  assert.equal([...html.matchAll(/id="myGamesSection"/g)].length, 1);
  const connections = html.slice(html.indexOf('id="connectionsSection"'), html.indexOf("</section>", html.indexOf('id="connectionsSection"')));
  assert.ok(connections.includes('id="myGamesSection"') && connections.includes('id="leagueSection"') && connections.includes('id="gameDisplaySection"'));
  const account = read("dist/account/account.js");
  assert.equal([...account.matchAll(/createAddGamePanel\(/g)].length, 1, "one Add Game panel, one library");
  assert.doesNotMatch(account, /manualGamesLibrary|buildManualLibrary/i, "no second manual-games library");
  assert.match(account, /buildGameLibrary\(\{/);
  assert.equal([...account.matchAll(/buildGameLibrary\(\{/g)].length, 1);
});
