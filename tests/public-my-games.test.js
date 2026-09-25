// Public My Games: compact profile list (max six), View all, search inside THIS identity's own games, Game Details, source / trust presentation, and the
// server-side privacy contract (Show My Games, playtime, ranks & stats). Live database behavior: tests/integration/public-my-games-db.sql (64 steps).
// The DOM builders run for real against a tiny fake DOM below; layout at real widths was measured in a real browser (see PROJECT_HANDOFF section 7w).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  PREVIEW_LIMIT, PAGE_SIZE, SEARCH_MAX_CHARS, SEARCH_DELAY_MS, normalizePublicGame, normalizeLibrary, sourceBadges, gameDetails, formatPlaytime,
  buildGameRow, renderGamesPreview, createGamesLibrary,
} from "../dist/public/public-games.js";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const stripSql = sql => sql.replace(/--.*$/gm, "");
const migrationName = "20260922100000_public_my_games.sql";
const migration = stripSql(read(`supabase/migrations/${migrationName}`));
const publicJs = read("dist/public/public.js");
const gamesJs = read("dist/public/public-games.js");
const gamesCode = gamesJs.replace(/\/\/.*$/gm, "");   // the presenter without its comments
const publicCss = read("dist/public/public.css");
const html = read("dist/public/index.html");
const account = read("dist/account/account.js");
const client = read("dist/account/supabase-client.js");

const libraryQuery = () => migration.slice(migration.indexOf("create function private.public_my_games("), migration.indexOf("create function private.get_public_my_games_impl"));

// ------------------------------------------------------------------------------------------------------------------------------ a tiny fake DOM
class FakeNode {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.listeners = {}; this.hidden = false; this.className = ""; this.disabled = false; this.value = ""; this.parent = null; this._text = ""; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  append(...nodes) { for (const node of nodes) { if (typeof node === "string") { const text = new FakeNode("#text"); text._text = node; this.children.push(text); } else { node.parent = this; this.children.push(node); } } }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name]; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatch(type, event = {}) { for (const handler of this.listeners[type] || []) handler({ type, target: this, preventDefault() {}, ...event }); }
  click() { if (!this.disabled) this.dispatch("click"); }
  focus() { FakeNode.active = this; }
  querySelectorAll() { return []; }
  hasClass(name) { return this.className.split(/\s+/).includes(name); }
  all(predicate, out = []) { for (const child of this.children) { if (predicate(child)) out.push(child); child.all(predicate, out); } return out; }
  byClass(name) { return this.all(node => node.hasClass?.(name)); }
  first(name) { return this.byClass(name)[0] || null; }
}
const element = (tag, className, text) => { const node = new FakeNode(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const textOf = node => node.textContent;

const steam = { key: "steam", label: "Steam", source: "DISCOVERED_FROM_STEAM" };
const manual = (key, label) => ({ key, label, source: "MANUAL" });
const raw = {
  steamOnly: { name: "Cyberpunk 2077", year: 2020, sources: ["DISCOVERED_FROM_STEAM"], platforms: [steam], playtime_minutes: 7440 },
  manualOnly: { name: "Crash Bandicoot", year: 1996, sources: ["MANUAL"], platforms: [manual("ps1", "PlayStation (PS1)")] },
  merged: { name: "Marvel Rivals", year: 2024, sources: ["DISCOVERED_FROM_STEAM", "MANUAL"], platforms: [steam, manual("ps5", "PlayStation 5")] },
  noYear: { name: "Nameless Year", sources: ["MANUAL"], platforms: [manual("pc", "PC")] },
  league: { name: "League of Legends", year: 2009, sources: ["MANUAL"], platforms: [manual("pc", "PC")], stats: { league: { solo_rank_state: "RANKED", solo_tier: "GOLD", solo_division: "II", solo_lp: 43, solo_wins: 120, solo_losses: 110, data_source: "OPGG_TEMPORARY", trust_status: "MANUAL", fetched_at: "2026-09-20T10:00:00Z", is_public: true } } },
};
const labels = { OPGG_TEMPORARY: "OP.GG" };
const game = key => normalizePublicGame(raw[key], labels);
const lib = (games, extra = {}) => ({ libraryCount: games.length, totalCount: games.length, games, ...extra });
const makeGames = count => Array.from({ length: count }, (_, i) => normalizePublicGame({ name: `Game ${String(i + 1).padStart(4, "0")}`, year: 2000 + (i % 24), sources: [i % 2 ? "MANUAL" : "DISCOVERED_FROM_STEAM"], platforms: [i % 2 ? manual("pc", "PC") : steam] }));

// ------------------------------------------------------------------------------------------------------------------------------ normalization + trust presentation
test("Steam-discovered, manual and merged games normalize; malformed rows are dropped (fail safe); a game must say where it came from", () => {
  assert.equal(game("steamOnly").name, "Cyberpunk 2077");
  assert.equal(game("manualOnly").sources.join(), "MANUAL");
  assert.deepEqual(game("merged").sources, ["DISCOVERED_FROM_STEAM", "MANUAL"]);
  for (const bad of [null, [], "x", {}, { name: "" , sources: ["MANUAL"] }, { name: "X", sources: [] }, { name: "X", sources: ["VERIFIED"] }, { name: "X", sources: ["steam"] }, { name: "x".repeat(201), sources: ["MANUAL"] }]) assert.equal(normalizePublicGame(bad), null, JSON.stringify(bad));
  assert.equal(normalizePublicGame({ name: "X", sources: ["MANUAL", "VERIFIED"], platforms: [] }).sources.join(), "MANUAL", "an unknown provenance word is dropped, never displayed");
  assert.equal(normalizePublicGame({ name: "X", sources: ["MANUAL"], platforms: [{ key: "PC", label: "PC", source: "MANUAL" }, { key: "pc", label: "", source: "MANUAL" }, { key: "pc", label: "PC", source: "VERIFIED" }] }).platforms.length, 0);
});

test("release year: shown when known, omitted when NULL / invalid (never 'Unknown', 'N/A' or 0)", () => {
  assert.equal(game("steamOnly").year, 2020);
  for (const year of [undefined, null, 0, "2020", 1949, 2101, 1997.5]) assert.equal(normalizePublicGame({ ...raw.noYear, year }).year, null, String(year));
  const details = gameDetails(game("noYear"));
  assert.equal(details.year, null);
  const row = buildGameRow({ element, game: game("noYear"), onOpen() {} });
  assert.equal(row.first("pg-year"), null, "no year element at all");
  assert.doesNotMatch(textOf(row), /unknown|n\/a|\b0\b/i);
  assert.equal(textOf(buildGameRow({ element, game: game("manualOnly"), onOpen() {} }).first("pg-year")), "(1996)");
});

test("Steam source: Steam icon + text 'Steam · Discovered' - NOT verified, no checkmark", () => {
  const badges = sourceBadges(game("steamOnly"));
  assert.deepEqual(badges.map(badge => [badge.kind, badge.text]), [["steam", "Steam · Discovered"]]);
  assert.match(badges[0].description, /Not verified/);
  const row = buildGameRow({ element, game: game("steamOnly"), onOpen() {} });
  assert.ok(row.first("pg-icon"), "an icon element is present");
  assert.ok(row.first("pg-icon").hasClass("is-steam"));
  assert.equal(row.first("pg-icon").getAttribute("aria-hidden"), "true", "the icon is decoration: the text carries the meaning");
  assert.doesNotMatch(textOf(row), /verified|✓|✔|☑/i);
});

test("Manual source: distinct manual icon + text 'Manual · <platform>' - never verified", () => {
  const badges = sourceBadges(game("manualOnly"));
  assert.deepEqual(badges.map(badge => [badge.kind, badge.text]), [["manual", "Manual · PlayStation (PS1)"]]);
  assert.match(badges[0].description, /Added manually by the owner\. Not verified\./);
  const row = buildGameRow({ element, game: game("manualOnly"), onOpen() {} });
  assert.ok(row.first("pg-icon").hasClass("is-manual"));
  assert.doesNotMatch(textOf(row), /verified|✓|✔|☑/i);
});

test("merged Steam + Manual: ONE row carries BOTH provenance states (icon + text each), never two rows", () => {
  const row = buildGameRow({ element, game: game("merged"), onOpen() {} });
  assert.deepEqual(row.byClass("pg-badge").map(textOf), ["Steam · Discovered", "Manual · PlayStation 5"]);
  assert.deepEqual(row.byClass("pg-icon").map(node => node.className.split(" ").pop()), ["is-steam", "is-manual"]);
  const preview = element("section");
  renderGamesPreview({ element, container: preview, library: lib([game("merged"), game("steamOnly")]), onOpenGame() {}, onViewAll() {} });
  assert.equal(preview.all(node => node.hasClass?.("pg-name") && textOf(node) === "Marvel Rivals").length, 1);
});

test("provenance is understandable WITHOUT colour: every badge is icon + words, and the aria-label spells the sources out", () => {
  for (const key of ["steamOnly", "manualOnly", "merged"]) {
    const row = buildGameRow({ element, game: game(key), onOpen() {} });
    for (const badge of row.byClass("pg-badge")) assert.match(textOf(badge), /Discovered|Manual/);
    const label = row.first("pg-row").getAttribute("aria-label");
    assert.match(label, /Discovered|Manual/);
    assert.match(label, /Open game details/);
  }
  assert.match(publicCss, /\.pg-badge\.is-manual\{[^}]*border-style:dashed/, "the two states also differ in outline style, not colour alone");
});

test("a future provider still renders as '<Provider> · Discovered' (provider-neutral), and a Discord source can never appear: there is no such provenance", () => {
  const xbox = normalizePublicGame({ name: "Halo", sources: ["DISCOVERED_FROM_XBOX_LIVE"], platforms: [{ key: "xbox_series", label: "Xbox Series X|S", source: "DISCOVERED_FROM_XBOX_LIVE" }] });
  assert.equal(sourceBadges(xbox)[0].text, "Xbox live · Discovered");
  assert.doesNotMatch(gamesCode + libraryQuery(), /discord/i, "neither the presenter nor the library query knows Discord: Discord is a connection, not a game source");
});

test("VERIFIED is never produced: nothing in the library data or code labels a game verified", () => {
  assert.doesNotMatch(migration, /'VERIFIED'|verified/i);
  const badgeAndDetailCode = gamesJs.slice(gamesJs.indexOf("export function sourceBadges"), gamesJs.indexOf("// ---- DOM builders"));
  assert.doesNotMatch(badgeAndDetailCode.replace(/Not verified|Not proof|does not verify/g, ""), /verified|✓|✔/i);
  assert.doesNotMatch(publicCss, /content:\s*["'](\\2713|\\2714|✓|✔)/i, "no checkmark glyph");
});

// ------------------------------------------------------------------------------------------------------------------------------ compact list
test("compact Public Profile section: at most SIX rows whatever the library size, the true count, View all only when there is more (0 / 1 / 6 / 7 / 82 / 300 / 1000)", () => {
  assert.equal(PREVIEW_LIMIT, 6);
  for (const [count, rows, viewAll] of [[1, 1, null], [6, 6, null], [7, 6, "View all 7 games"], [82, 6, "View all 82 games"], [300, 6, "View all 300 games"], [1000, 6, "View all 1000 games"]]) {
    const container = element("section");
    const shown = renderGamesPreview({ element, container, library: { libraryCount: count, totalCount: count, games: makeGames(Math.min(count, 12)) }, onOpenGame() {}, onViewAll() {} });
    assert.equal(shown, rows, `${count} games`);
    assert.equal(container.byClass("pg-row").length, rows);
    assert.equal(textOf(container.first("pg-count")), String(count), "the count is the whole library, not the six");
    assert.equal(container.first("pg-viewall") ? textOf(container.first("pg-viewall")) : null, viewAll);
  }
});

test("zero games: the section is simply not rendered (no giant empty section) - the page only builds it for a non-empty library", () => {
  assert.equal(normalizeLibrary({ library_count: 0, total_count: 0, games: [] }).libraryCount, 0);
  assert.match(publicJs, /gamesPreview && gamesPreview\.libraryCount > 0 && gamesPreview\.games\.length > 0/);
  assert.match(html, /<section id="publicGames" class="public-games"[^>]*hidden><\/section>/);
  assert.match(migration, /where m\.payload is not null and \(m\.payload ->> 'library_count'\)::integer > 0/, "and the server sends no section for an empty library");
});

test("EVERY row has a chevron and it works - with or without a year, playtime or stats (the chevron is not conditional)", () => {
  const opened = [];
  for (const key of ["steamOnly", "manualOnly", "merged", "noYear", "league"]) {
    const row = buildGameRow({ element, game: game(key), onOpen: item => opened.push(item.name) });
    assert.equal(textOf(row.first("pg-chevron")), "›", key);
    assert.equal(row.first("pg-chevron").getAttribute("aria-hidden"), "true");
    assert.equal(row.first("pg-row").tag, "button", "the whole row is one real button (keyboard + touch target)");
    assert.equal(row.first("pg-row").type, "button");
    row.first("pg-row").click();
  }
  assert.deepEqual(opened, ["Cyberpunk 2077", "Crash Bandicoot", "Marvel Rivals", "Nameless Year", "League of Legends"]);
});

test("long titles and many badges / platforms wrap instead of overflowing (CSS)", () => {
  assert.match(publicCss, /\.pg-name\{[^}]*overflow-wrap:anywhere/);
  assert.match(publicCss, /\.pg-badges\{[^}]*flex-wrap:wrap/);
  assert.match(publicCss, /\.pg-badge-text\{[^}]*overflow-wrap:anywhere/);
  assert.match(publicCss, /\.pg-copy\{[^}]*min-width:0/);
  assert.match(publicCss, /\.pg-row\{[^}]*min-height:2\.9rem/, "row touch target above 44px");
  assert.match(publicCss, /\.pg-viewall,\.pg-more\{[^}]*min-height:2\.75rem/);
  assert.match(publicCss, /\.pg-search-input\{[^}]*font-size:1rem/, "16px input: no zoom-on-focus on phones");
});

// ------------------------------------------------------------------------------------------------------------------------------ Game Details
test("Game Details of a basic manual game shows only what exists - no 'N/A', no empty stat cards, no unavailable notices", () => {
  const details = gameDetails(game("manualOnly"));
  assert.deepEqual(details.platforms, ["PlayStation (PS1)"]);
  assert.deepEqual(details.sources.map(item => [item.kind, item.heading, item.text]), [["manual", "PlayStation (PS1)", "Added manually · Not verified"]]);
  assert.equal(details.playtime, null);
  assert.equal(details.stats, null);
  assert.equal(details.year, 1996);
});

test("Game Details of a Steam game: platform Steam, the source explained, playtime only when the server sent it", () => {
  const details = gameDetails(game("steamOnly"));
  assert.deepEqual(details.platforms, ["Steam"]);
  assert.equal(details.sources[0].kind, "steam");
  assert.match(details.sources[0].text, /Discovered through the connected Steam account\. It does not verify ownership on any other platform\./);
  assert.equal(details.playtime, "124 hours");
  const hidden = normalizePublicGame({ ...raw.steamOnly, playtime_minutes: undefined });
  assert.equal(gameDetails(hidden).playtime, null, "the server left it out (playtime OFF): nothing is shown, nothing is inferred");
  const opened = createDetailsText(hidden);
  assert.doesNotMatch(opened, /playtime|hours|N\/A/i);
});

test("Game Details of a merged game: ONE game, two provenance entries, and ONLY the user's platforms", () => {
  const details = gameDetails(game("merged"));
  assert.deepEqual(details.platforms, ["Steam", "PlayStation 5"]);
  assert.deepEqual(details.sources.map(item => [item.kind, item.heading]), [["steam", "Steam"], ["manual", "PlayStation 5"]]);
  assert.equal(details.sources[1].text, "Added manually · Not verified");
  assert.equal(details.title, "Marvel Rivals");
});

test("user platforms only: whatever the catalog lists for a game, the details show exactly the platforms the server sent for THIS user", () => {
  const ff7 = normalizePublicGame({ name: "Final Fantasy VII", year: 1997, sources: ["MANUAL"], platforms: [manual("ps1", "PlayStation (PS1)")] });
  assert.deepEqual(gameDetails(ff7).platforms, ["PlayStation (PS1)"]);
  assert.doesNotMatch(createDetailsText(ff7), /Switch|Xbox|Android|iOS|PC\b/);
  assert.match(migration, /from public\.entity_game_platforms x/, "the manual side reads the user's own declarations");
  assert.doesNotMatch(migration.slice(migration.indexOf("create function private.public_my_games("), migration.indexOf("create function private.get_public_my_games_impl")), /game_catalog_platforms/, "the catalog's platform list is never consulted");
});

test("ranks & stats: League keeps PROTOTYPE / UNVERIFIED with its plain source label; a generic Game Profile shows only what the model allows", () => {
  const stats = game("league").stats;
  assert.equal(stats.trust, "PROTOTYPE / UNVERIFIED");
  assert.equal(stats.tone, "caution");
  assert.deepEqual(stats.fields.map(field => [field.label, field.value]), [["Solo/Duo rank", "Gold II"], ["LP", "43"], ["Matches", "230"], ["Win rate", "52.2%"]]);
  assert.match(stats.source, /^Data: OP\.GG · Updated /);
  const text = createDetailsText(game("league"));
  assert.match(text, /PROTOTYPE \/ UNVERIFIED/);
  assert.match(text, /Win rate/);
  const generic = normalizePublicGame({ name: "Some Game", sources: ["MANUAL"], platforms: [manual("pc", "PC")], stats: { profile: { game_key: "some_game", data_source: "SOME_SOURCE", data_source_class: "THIRD_PARTY", trust_status: "VERIFIED", fields: [{ key: "rank", label: "Rank", value: "Gold", kind: "rank" }], fetched_at: null } } });
  assert.equal(generic.stats.trust, "UNVERIFIED", "the public gate carries no verification basis, so a profile can only ever be shown at MANUAL / UNVERIFIED: trust is lowered, never raised");
  assert.equal(normalizePublicGame({ ...raw.league, stats: { league: { solo_rank_state: "RANKED" } } }).stats, null, "a malformed stats object shows no stats");
  assert.equal(normalizePublicGame({ ...raw.league, stats: {} }).stats, null);
  assert.doesNotMatch(gamesJs, /op\.gg|opgg/i, "this module names no stats provider: its label is injected by the page");
});

test("playtime formatting: minutes, hours with one decimal below 100, whole hours from 100", () => {
  assert.equal(formatPlaytime(1), "1 minute");
  assert.equal(formatPlaytime(45), "45 minutes");
  assert.equal(formatPlaytime(60), "1 hour");
  assert.equal(formatPlaytime(90), "1.5 hours");
  assert.equal(formatPlaytime(7440), "124 hours");
  assert.equal(formatPlaytime(0), null);
  assert.equal(formatPlaytime(null), null);
  assert.equal(formatPlaytime(-5), null);
  assert.equal(formatPlaytime(1.5), null);
});

function createDetailsText(item) {
  const modal = openedModal(item);
  return textOf(modal.detailView);
}
function openedModal(item) {
  const mounted = [];
  const controller = createGamesLibrary({ element, handle: "black", api: { getPublicMyGames: async () => null }, mount: node => mounted.push(node), sourceLabels: labels });
  controller.openGame(item, null);
  const panel = mounted[0].children[1];
  return { controller, detailView: panel.children[1], libraryView: panel.children[0], root: mounted[0], panel };
}

// ------------------------------------------------------------------------------------------------------------------------------ library: paging, search, details, focus
function fakeServer(games, { pageDelay = () => Promise.resolve() } = {}) {
  const calls = [];
  const norm = text => String(text).toLowerCase().replace(/['’`´]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/ /g, "");
  return {
    calls,
    async getPublicMyGames(handle, { query = "", limit = 30, offset = 0 } = {}) {
      calls.push({ handle, query, limit, offset });
      await pageDelay(query);
      const compact = norm(query);
      const rows = games.filter(item => (query.trim() && !compact ? false : !compact || norm(item.name).includes(compact)));
      const raws = rows.slice(offset, offset + Math.min(limit, 50)).map(item => ({ name: item.name, year: item.year ?? undefined, sources: item.sources, platforms: item.platforms }));
      return { library_count: games.length, total_count: rows.length, games: raws };
    },
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function mountLibrary(games, options = {}) {
  const server = fakeServer(games, options);
  const timers = [];
  const scroll = [];
  const mounted = [];
  const controller = createGamesLibrary({
    element, handle: "black", api: server, mount: node => mounted.push(node), lockScroll: locked => scroll.push(locked), libraryCount: games.length, sourceLabels: labels,
    schedule: (fn, ms) => { timers.push({ fn, ms, cancelled: false }); return timers.length - 1; },
    cancel: id => { if (timers[id]) timers[id].cancelled = true; },
  });
  const rootNode = mounted[0];
  const panel = rootNode.children[1];
  const view = { root: rootNode, panel, library: panel.children[0], detail: panel.children[1] };
  const ui = {
    input: () => view.library.first("pg-search-input"),
    rows: () => view.library.first("pg-list").byClass("pg-row"),
    names: () => view.library.first("pg-list").byClass("pg-name").map(textOf),
    status: () => textOf(view.library.first("pg-status")),
    more: () => view.library.first("pg-more"),
    title: () => textOf(view.library.first("pg-modal-title")),
    type: async text => { ui.input().value = text; ui.input().dispatch("input"); const timer = timers.at(-1); if (timer && !timer.cancelled) { timer.fn(); } await flush(); await flush(); },
  };
  return { controller, server, timers, scroll, view, ui };
}
const eightyTwo = makeGames(82);

test("VIEW ALL opens the complete library: title 'MY GAMES · 82', page of 30, 'Show more' until everything is loaded, page scroll locked while open", async () => {
  const m = mountLibrary(eightyTwo);
  assert.equal(m.view.root.hidden, true);
  m.controller.openLibrary(null);
  await flush();
  assert.equal(m.view.root.hidden, false);
  assert.deepEqual(m.scroll, [true]);
  assert.equal(m.ui.title(), "MY GAMES · 82");
  assert.equal(m.ui.rows().length, PAGE_SIZE);
  assert.deepEqual(m.server.calls, [{ handle: "black", query: "", limit: 30, offset: 0 }]);
  assert.equal(textOf(m.ui.more()), "Show more games (52 left)");
  m.ui.more().click(); await flush();
  assert.equal(m.ui.rows().length, 60);
  m.ui.more().click(); await flush();
  assert.equal(m.ui.rows().length, 82, "the complete library is reachable");
  assert.equal(m.ui.more().hidden, true);
  assert.deepEqual(m.server.calls.map(call => call.offset), [0, 30, 60]);
  assert.equal(new Set(m.ui.names()).size, 82, "no duplicates");
});

test("SEARCH searches only this identity's library: debounced, trimmed and capped, always through the identity's own function (never a catalog search)", async () => {
  const m = mountLibrary(eightyTwo);
  m.controller.openLibrary(null); await flush();
  await m.ui.type("  game 0007  ");
  assert.equal(m.timers.at(-1).ms, SEARCH_DELAY_MS);
  assert.deepEqual(m.server.calls.at(-1), { handle: "black", query: "game 0007", limit: 30, offset: 0 });
  assert.deepEqual(m.ui.names(), ["Game 0007"]);
  assert.equal(m.ui.status(), "1 of 82 games");
  await m.ui.type("GAME 00");
  assert.equal(m.ui.rows().length, 30);
  await m.ui.type("x".repeat(500));
  assert.equal(m.server.calls.at(-1).query.length, SEARCH_MAX_CHARS);
  assert.equal(new Set(m.server.calls.map(call => call.handle)).size, 1);
  assert.doesNotMatch(gamesJs + publicJs, /search_game_catalog|searchGameCatalog|game_catalog/, "the public page never touches the global catalog");
  assert.match(client, /export async function getPublicMyGames\(handle[\s\S]*?\{ anonymous: true \}/, "an anonymous, identity-scoped RPC");
});

test("SEARCH: case-insensitive, punctuation tolerant; no match says 'No matching games' and shows nothing else; clearing the box restores the library", async () => {
  const m = mountLibrary([...eightyTwo, normalizePublicGame({ name: "Marvel's Spider-Man", sources: ["MANUAL"], platforms: [manual("ps5", "PlayStation 5")] })]);
  m.controller.openLibrary(null); await flush();
  await m.ui.type("SPIDERMAN");
  assert.deepEqual(m.ui.names(), ["Marvel's Spider-Man"]);
  await m.ui.type("spider man");
  assert.deepEqual(m.ui.names(), ["Marvel's Spider-Man"]);
  await m.ui.type("zzzzzz");
  assert.equal(m.ui.status(), "No matching games");
  assert.equal(m.ui.rows().length, 0, "no catalog suggestions, nothing");
  assert.equal(m.ui.more().hidden, true);
  await m.ui.type("");
  assert.equal(m.ui.rows().length, 30);
  assert.equal(m.ui.title(), "MY GAMES · 83");
});

test("SEARCH ignores a stale answer: typing fast never shows results for an older query", async () => {
  const gates = new Map();
  const m = mountLibrary(eightyTwo, { pageDelay: query => new Promise(resolve => gates.set(query, resolve)) });
  m.controller.openLibrary(null);
  await flush(); gates.get("")?.(); await flush();
  m.ui.input().value = "game 0001"; m.ui.input().dispatch("input"); m.timers.at(-1).fn(); await flush();
  m.ui.input().value = "game 0002"; m.ui.input().dispatch("input"); m.timers.at(-1).fn(); await flush();
  gates.get("game 0002")(); await flush(); await flush();
  gates.get("game 0001")(); await flush(); await flush();
  assert.deepEqual(m.ui.names(), ["Game 0002"], "the older, slower answer was ignored");
});

test("a failed load says so and offers Try again; closing cancels everything in flight and unlocks the page", async () => {
  let fail = true;
  const m = mountLibrary(eightyTwo);
  const original = m.server.getPublicMyGames.bind(m.server);
  m.server.getPublicMyGames = async (...args) => { if (fail) throw new Error("network"); return original(...args); };
  m.controller.openLibrary(null); await flush(); await flush();
  assert.equal(m.ui.status(), "Couldn't load games right now.");
  assert.equal(textOf(m.ui.more()), "Try again");
  fail = false;
  m.ui.more().click(); await flush(); await flush();
  assert.equal(m.ui.rows().length, 30);
  m.controller.close();
  assert.equal(m.view.root.hidden, true);
  assert.deepEqual(m.scroll, [true, false]);
  assert.equal(m.controller.isOpen(), false);
});

test("the server says nothing (My Games OFF / unpublished): the library shows an error state, never a guess", async () => {
  const m = mountLibrary(eightyTwo);
  m.server.getPublicMyGames = async () => null;
  m.controller.openLibrary(null); await flush(); await flush();
  assert.equal(m.ui.status(), "Couldn't load games right now.");
  assert.equal(m.ui.rows().length, 0);
});

test("Game Details from the compact list opens directly (no request, no Back); from the library it has Back that keeps the search and the loaded page", async () => {
  const m = mountLibrary(eightyTwo);
  m.controller.openGame(game("merged"), null);
  assert.equal(m.controller.view(), "detail");
  assert.equal(m.view.detail.hidden, false);
  assert.equal(m.view.detail.first("pg-back").hidden, true, "no Back when opened from the profile");
  assert.equal(m.server.calls.length, 0, "the preview row already carries everything");
  assert.match(textOf(m.view.detail), /Marvel Rivals/);
  m.controller.close();

  const n = mountLibrary(eightyTwo);
  n.controller.openLibrary(null); await flush();
  await n.ui.type("game 00");
  const before = n.ui.names();
  n.ui.rows()[3].click();
  assert.equal(n.controller.view(), "detail");
  assert.equal(n.view.detail.first("pg-back").hidden, false);
  assert.equal(n.view.library.hidden, true);
  n.view.detail.first("pg-back").click();
  assert.equal(n.controller.view(), "library");
  assert.equal(n.ui.input().value, "game 00", "the search text is kept");
  assert.deepEqual(n.ui.names(), before, "and so is the list");
  assert.equal(n.server.calls.length, 2, "going back re-uses the loaded list (no extra request)");
});

test("keyboard: Escape closes the modal (from a library-opened detail it goes Back first); the backdrop and Close close it; focus returns to the opener", async () => {
  const m = mountLibrary(eightyTwo);
  const opener = element("button", "pg-viewall");
  m.controller.openLibrary(opener); await flush();
  m.ui.rows()[0].click();
  m.view.root.dispatch("keydown", { key: "Escape" });
  assert.equal(m.controller.view(), "library");
  assert.equal(m.controller.isOpen(), true);
  m.view.root.dispatch("keydown", { key: "Escape" });
  assert.equal(m.controller.isOpen(), false);
  assert.equal(FakeNode.active, opener, "focus goes back to the button that opened it");
  m.controller.openLibrary(opener); await flush();
  m.view.root.first("pg-backdrop").click();
  assert.equal(m.controller.isOpen(), false);
  m.controller.openLibrary(opener); await flush();
  m.view.library.first("pg-close").click();
  assert.equal(m.controller.isOpen(), false);
  assert.equal(m.view.panel.getAttribute("role"), "dialog");
  assert.equal(m.view.panel.getAttribute("aria-modal"), "true");
  assert.equal(m.view.library.first("pg-close").getAttribute("aria-label"), "Close My Games");
});

test("LARGE libraries: 300 and 1,000+ games never render more than one page per request (bounded DOM), and search narrows on the server", async () => {
  for (const size of [300, 1000, 1500]) {
    const big = makeGames(size);
    const m = mountLibrary(big);
    m.controller.openLibrary(null); await flush();
    assert.equal(m.ui.title(), `MY GAMES · ${size}`);
    assert.equal(m.ui.rows().length, PAGE_SIZE, `${size}: one page`);
    for (let i = 0; i < 4; i += 1) { m.ui.more().click(); await flush(); }
    assert.equal(m.ui.rows().length, PAGE_SIZE * 5, "five pages after five requests, not the whole library");
    assert.ok(m.server.calls.every(call => call.limit === PAGE_SIZE && call.limit <= 50));
    await m.ui.type("game 0042");
    assert.deepEqual(m.ui.names(), ["Game 0042"]);
    assert.equal(m.ui.rows().length, 1);
  }
  const renderedPreview = element("section");
  renderGamesPreview({ element, container: renderedPreview, library: { libraryCount: 1500, totalCount: 1500, games: makeGames(6) }, onOpenGame() {}, onViewAll() {} });
  assert.equal(renderedPreview.byClass("pg-row").length, 6);
});

// ------------------------------------------------------------------------------------------------------------------------------ the page wiring
test("public.js: the section comes from the identity response, appears only while the profile shows, closes with the Intro, and joins the normal flow before Replay Intro", () => {
  assert.match(publicJs, /import \{ normalizeLibrary, renderGamesPreview, createGamesLibrary \} from "\.\/public-games\.js";/);
  assert.match(publicJs, /normalizeLibrary\(identity\.public_sections\?\.my_games, LEAGUE_SOURCE_LABELS\)/);
  assert.match(publicJs, /gamesBlock\.hidden = !hasGames \|\| event\.data\.state !== "profile";/);
  assert.match(publicJs, /if \(event\.data\.state !== "profile"\) gamesLibrary\?\.close\(\);/);
  assert.match(publicJs, /handle: identity\.gamid_handle/, "the library is always scoped to the identity the server returned (works for handle and QR routes)");
  assert.match(publicJs, /document\.documentElement\.classList\.toggle\("is-games-open", locked\)/);
  const order = ["publicSections", "publicGames", "replayIntroButton"].map(id => html.indexOf(`id="${id}"`));
  assert.ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2], "connections panel -> My Games -> Replay Intro");
  assert.ok(html.indexOf('id="publicGames"') < html.indexOf("</main>"), "inside the flow shell, so the page grows with it");
  assert.doesNotMatch(publicJs.replace(/\/\/.*$/gm, ""), /playtime|show_game|discovered_games/i, "the page has no privacy logic of its own: the server already applied it");
});

test("Discord is not a game source anywhere in the public library path", () => {
  assert.doesNotMatch(gamesCode, /discord/i);
  assert.doesNotMatch(publicJs.slice(publicJs.indexOf("const gamesPreview")), /discord/i);
  const query = libraryQuery();
  assert.doesNotMatch(query, /gaming_connections g\b[\s\S]{0,80}provider_key\s*=\s*'discord'/i);
  assert.match(query, /from public\.discovered_games d/);
  assert.match(query, /from public\.entity_game_platforms x/);
});

test("the section and the modal are ordinary text: no innerHTML anywhere in the presenter", () => {
  assert.doesNotMatch(gamesCode, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(/);
});

// ------------------------------------------------------------------------------------------------------------------------------ the server contract (static; the live behavior is in the SQL test)
test("migration: additive, two NOT NULL DEFAULT false switches, no backfill, no per-game switch, existing accepted migrations untouched", () => {
  assert.match(migration, /alter table public\.profiles add column show_my_games boolean not null default false;/);
  assert.match(migration, /alter table public\.profiles add column show_game_stats boolean not null default false;/);
  assert.doesNotMatch(migration, /\bdrop\b|\btruncate\b|\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.profiles\s+(p\s+)?set\b(?![^;]*candidate_visible)/i, "the only UPDATEs are the owner RPC's");
  assert.doesNotMatch(migration, /create table|per_game|show_this_game|game_visibility/i, "no table, and no per-game visibility toggle of any kind");
  assert.doesNotMatch(migration, /show_game_playtime/, "playtime is consulted only through the accepted gate");
  const names = readdirSync(new URL("supabase/migrations/", root)).sort();
  assert.equal(names[names.indexOf(migrationName) - 1], "20260922010000_game_catalog_import_key_fix.sql");
  assert.deepEqual(
    // Wall migrations (persistence, editor types) are unrelated later additions; everything else after this migration stays pinned exactly
    names.slice(names.indexOf(migrationName) + 1).filter(name => !/_wall_/.test(name)),
    [
      "20260922173758_play_together_vertical_slice_1.sql",
      "20260922174129_play_together_fk_indexes.sql",
      "20260922200000_public_stats_global_scope.sql",
      "20260924120909_play_together_me1_region.sql",
      "20260925090000_play_together_complete_milestone.sql",
      "20260925093000_play_together_complete_fk_indexes.sql",
      "20260925094500_play_together_dashboard_join_fix.sql",
    ],
    "later additive features may sit between Public My Games and the migration that makes the stats gate global",
  );
});

test("migration (as first written): Show My Games is a hard server gate (published AND switched on); both default closed. The stats gate was later made GLOBAL by 20260922200000: it no longer needs Show My Games", () => {
  assert.match(migration, /select p\.show_my_games and e\.visibility = 'PUBLIC'/);
  assert.match(migration, /select p\.show_game_stats and p\.show_my_games and e\.visibility = 'PUBLIC'/);
  assert.match(migration, /if not private\.public_my_games_allowed\(candidate_entity_id\) then return null; end if;/);
  assert.match(migration, /with_playtime := private\.public_game_playtime_allowed\(candidate_entity_id\);/, "the accepted playtime gate, reused as is");
  assert.match(migration, /with_stats := private\.public_game_stats_allowed\(candidate_entity_id\);/);
  assert.match(migration, /'playtime_minutes', case when with_playtime and p\.minutes > 0 then p\.minutes end/, "the value never enters the response unless the gate is open");
  assert.match(migration, /'stats', case when with_stats then/);
  assert.match(migration, /private\.public_game_profiles\(candidate_entity_id\)/, "Game Profiles only through their accepted public gate");
  assert.match(migration, /l\.entity_id = candidate_entity_id and l\.is_public/, "League only when its own section switch is public too");
  assert.doesNotMatch(migration, /game_profiles\b(?!\()/, "the game_profiles table itself is not read here");
});

test("migration: playtime, hours and stats never order, filter or count the library", () => {
  const body = migration.slice(migration.indexOf("create function private.public_my_games("), migration.indexOf("create function private.get_public_my_games_impl"));
  const clauses = [...body.matchAll(/order by\s+([^\n]+)/g)].map(match => match[1]);
  assert.ok(clauses.length >= 3);
  for (const clause of clauses) assert.doesNotMatch(clause, /minutes|playtime|stats|league/i, clause);
  assert.match(body, /r\.tier, case when r\.has_manual then 0 else 1 end, r\.sort_name collate "C", coalesce\(r\.gkey, r\.gid\) collate "C"/, "the exact, documented ordering rule");
  assert.match(body, /count\(\*\) over \(\) as library_count/);
  assert.doesNotMatch(body.slice(0, body.indexOf("'playtime_minutes'")), /minutes\s*(>|<|=)/, "no filter on minutes before the response is built");
});

test("migration: the response carries no identifier of the provider account, the app, the icon or the connection", () => {
  const body = migration.slice(migration.indexOf("jsonb_build_object(\n      'library_count'"), migration.indexOf("create function private.get_public_my_games_impl"));
  assert.doesNotMatch(body, /provider_account_id|external_game_id|icon_ref|connection_id|entity_id'|first_seen|last_seen|access_token|source_url|game_name'|tag_line/);
  assert.match(body, /'name', p\.name/);
});

test("migration: privileges - anon may only read the public library; the owner switches are authenticated-only; the gates and builder have no client grant", () => {
  const grants = migration.slice(migration.indexOf("revoke all on function\n  private.get_my_public_games_settings_impl()"));
  assert.match(grants, /revoke all on function[\s\S]*from public, anon, authenticated;/);
  assert.match(grants, /grant execute on function\n  private\.get_my_public_games_settings_impl\(\), private\.set_my_public_games_setting_impl\(text, boolean\),\n  public\.get_my_public_games_settings\(\), public\.set_my_public_games_setting\(text, boolean\)\nto authenticated;/);
  assert.match(grants, /grant execute on function private\.get_public_my_games_impl\(text, text, integer, integer\), public\.get_public_my_games\(text, text, integer, integer\) to anon, authenticated;/);
  assert.doesNotMatch(grants, /grant execute on function[^;]*public_my_games_allowed|grant execute on function[^;]*public_game_stats_allowed|grant execute on function[^;]*private\.public_my_games\(/);
  assert.doesNotMatch(migration.slice(migration.indexOf("create function private.get_my_public_games_settings_impl"), migration.indexOf("create function private.public_my_games_allowed")), /candidate_(entity|user)/, "the owner functions never accept an identity from the caller");
  assert.match(migration, /caller uuid := \(select auth\.uid\(\)\);/);
  assert.match(migration, /m\.user_id = caller and m\.role = 'OWNER'/);
  assert.match(migration, /least\(greatest\(coalesce\(candidate_limit, 30\), 0\), 50\)/, "a page is at most 50 rows, whatever the caller asks");
});

test("migration: the accepted public identity boundary keeps its 14 columns; My Games is one more allowlisted section (first six games + counts)", () => {
  const columns = ["gamid_handle", "display_name", "avatar_media_reference", "bio", "role_keys", "primary_role_key", "role_catalog", "education_work_status", "institution", "field_of_study", "education_work_catalog", "intro_transition_key", "intro_derivative_path", "public_sections"];
  const fn = migration.slice(migration.indexOf("create or replace function private.get_public_identity_impl"));
  const returns = fn.slice(fn.indexOf("returns table ("), fn.indexOf(")\nlanguage sql"));
  assert.deepEqual([...returns.matchAll(/^\s+(\w+) /gm)].map(match => match[1]), columns);
  assert.match(fn, /private\.public_my_games\(e\.entity_id, null, 6, 0\)/);
  assert.match(fn, /select 'discord'::text as section_key/);
  assert.match(fn, /select 'steam'::text/);
  assert.match(fn, /select 'league'::text/);
});

test("Not hidden by CSS: a value that is switched off is absent from the payload the page receives (the presenter has no 'hidden' branch)", () => {
  assert.doesNotMatch(gamesCode, /display\s*:\s*none|\.style\.|visibility/);
  assert.doesNotMatch(publicCss.slice(publicCss.indexOf("PUBLIC MY GAMES")), /pg-(playtime|stats)[^{]*\{[^}]*display:\s*none/);
});

// ------------------------------------------------------------------------------------------------------------------------------ the owner controls
test("Account: three separate library-wide switches, each calling its own RPC; no per-game toggle anywhere; they persist through the server, not the browser", () => {
  for (const label of ["Show My Games on my GamID", "Show playtime on my GamID", "Show ranks & stats on my GamID"]) assert.match(account, new RegExp(`label: "${label}"`));
  assert.match(account, /changePublicGamesSetting\("my_games", visible\)/);
  assert.match(account, /changePublicGamesSetting\("stats", visible\)/);
  assert.match(account, /onChange: changePlaytimeVisibility/);
  assert.match(account, /api\.setMyPublicGamesSetting\(setting, visible\)/);
  assert.match(account, /publicGamesSettings = await api\.getMyPublicGamesSettings\(\);/, "the switch value is re-read from the server after every change");
  assert.match(account, /await loadPublicGamesSettings\(\);/, "read on load: survives a refresh");
  assert.doesNotMatch(account, /Show this game/i);
  assert.match(account, /there is no switch per game/);
  assert.match(client, /rpc\("get_my_public_games_settings"\)/);
  assert.match(client, /rpc\("set_my_public_games_setting", \{ candidate_setting: setting, candidate_visible: Boolean\(visible\) \}\)/);
  assert.match(client, /\{ show_my_games: false, show_game_stats: false \}/, "the default answer is OFF");
  assert.doesNotMatch(client.slice(client.indexOf("getMyPublicGamesSettings")), /show_my_games:\s*true|show_game_stats:\s*true/, "the client never assumes ON");
});

test("Account: the switches do not touch connections, games, discovery or each other", () => {
  const block = account.slice(account.indexOf("async function changePublicGamesSetting"), account.indexOf("async function loadPublicGamesSettings"));
  assert.doesNotMatch(block, /disconnect|refreshSteamGames|saveMyManualGame|removeMyManualGame|setSectionVisibility|setGamePlaytimeVisibility/);
  const hints = account.slice(account.indexOf("function renderGameDisplay"), account.indexOf("async function changePublicGamesSetting"));
  assert.match(hints, /never "verified" because of that/);
  assert.match(hints, /They keep their PROTOTYPE \/ UNVERIFIED labels/);
  assert.match(hints, /These three settings are separate from each other/);
});

test("Account: an unpublished GamID is told plainly that nothing is public yet; the My Games badge reflects the owner's switch", () => {
  assert.match(account, /Nothing is public until you publish your GamID\./);
  assert.match(account, /shown \? \(isGamidPublished\(\) \? "PUBLIC" : "PUBLIC WHEN PUBLISHED"\) : "PRIVATE"/);
});

test("regression: the Public Profile flow, Replay Intro and the Intro handshake are untouched by this change", () => {
  for (const symbol of ["createFlowLayout", "layout.setProfileShowing", "layout.setHeight", "replayButton.addEventListener(\"click\", layout.enterExperience)", "gamid-intro-preview-ready", "gamid-intro-preview-state", "sendReplay"]) assert.ok(publicJs.includes(symbol), symbol);
  assert.match(html, /<button id="replayIntroButton" class="replay-button" type="button" hidden>↻ Replay Intro<\/button>/);
  assert.match(publicCss, /\.public-shell\[data-mode="flow"\] \.replay-button\{grid-area:4\/1\}/, "Replay Intro is the LAST row");
  assert.match(publicCss, /\.public-shell\[data-mode="flow"\] \.public-games\{grid-area:3\/1\}/);
  assert.ok(!read("dist/account/intro-preview.js").includes("publicGames"), "the profile document (iframe) is not involved: the section is host-page flow content");
});
