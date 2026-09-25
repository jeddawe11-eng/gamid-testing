// "Show ranks & stats on my GamID" is a GLOBAL public-GamID privacy control (League card + Public My Games + Game Details), and the Steam source icon is the real Steam
// glyph. Live database behavior: tests/integration/public-stats-global-db.sql. The real public.js League renderer runs below against a tiny fake DOM.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { normalizePublicGame, buildGameRow, renderGamesPreview, createGamesLibrary, sourceBadges, gameDetails } from "../dist/public/public-games.js";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8").replace(/\r\n/g, "\n");
const stripSql = sql => sql.replace(/--.*$/gm, "");
const scopeName = "20260922200000_public_stats_global_scope.sql";
const scopeSql = stripSql(read(`supabase/migrations/${scopeName}`));
const scopeRaw = read(`supabase/migrations/${scopeName}`);
const publicJs = read("dist/public/public.js");
const publicCss = read("dist/public/public.css");
const account = read("dist/account/account.js");

// ------------------------------------------------------------------------------------------------------------------------------ a tiny fake DOM + the real League renderer
class FakeNode {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.listeners = {}; this.hidden = false; this.className = ""; this.disabled = false; this.value = ""; this._text = ""; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  append(...nodes) { for (const node of nodes) this.children.push(node); }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name]; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatch(type, event = {}) { for (const handler of this.listeners[type] || []) handler({ type, target: this, preventDefault() {}, ...event }); }
  click() { this.dispatch("click"); }
  focus() {}
  querySelectorAll() { return []; }
  hasClass(name) { return this.className.split(/\s+/).includes(name); }
  all(predicate, out = []) { for (const child of this.children) { if (predicate(child)) out.push(child); child.all(predicate, out); } return out; }
  byClass(name) { return this.all(node => node.hasClass?.(name)); }
  first(name) { return this.byClass(name)[0] || null; }
}
const element = (tag, className, text) => { const node = new FakeNode(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const textOf = node => node.textContent;

// the REAL renderer from public.js (its source between the League constants and buildConfig), run with a fake document
const rendererSource = publicJs.slice(publicJs.indexOf("const LEAGUE_APEX_TIERS"), publicJs.indexOf("async function buildConfig")).replace("export function renderPublicSections", "function renderPublicSections");
const { renderPublicSections } = new Function("document", `${rendererSource}\nreturn { renderPublicSections };`)({ createElement: tag => new FakeNode(tag) });
const render = sections => { const panel = new FakeNode("aside"); const count = renderPublicSections(panel, sections); return { panel, count, text: textOf(panel), league: panel.byClass("public-section").find(node => textOf(node).startsWith("LEAGUE")) }; };

const LEAGUE_IDENTITY = { game_name: "Espada black", tag_line: "esp", platform_id: "ME1", trust_status: "MANUAL", identity_source: "MANUAL_RIOT_ID", data_source: "OPGG_TEMPORARY", updated_at: "2026-09-20T10:00:00Z" };
const LEAGUE_RANK = { rank_state: "RANKED", tier: "BRONZE", division: "IV", lp: 7, wins: 2, losses: 3 };
const DISCORD = { display_name: "mazen~", username: "mazen9492", trust_status: "CONNECTED" };
const STEAM = { steam_id: "76561198040516491", trust_status: "CONNECTED" };

// ------------------------------------------------------------------------------------------------------------------------------ A: the global rank / stats scope
test("stats OFF: the League card keeps its identity, region, PROTOTYPE / UNVERIFIED and data source - and shows NO rank, LP, wins, losses or win rate", () => {
  const { text, league, count } = render({ league: LEAGUE_IDENTITY });
  assert.equal(count, 1);
  assert.match(text, /LEAGUE OF LEGENDS/);
  assert.match(text, /Espada black#esp · ME1/);
  assert.match(text, /PROTOTYPE \/ UNVERIFIED/);
  assert.match(text, /Data: OP\.GG · Updated /);
  assert.doesNotMatch(text, /Bronze|Silver|Gold|\bLP\b|\dW\b|\dL\b|\bW\b|win rate|Unranked|ranked|Solo\/Duo/i, "no rank / stat value or statement about it");
  assert.equal(league.byClass("public-section-sub").length, 1, "only the data-source line remains");
});

test("stats ON (+ League public): the existing rank line returns, with the same labels as before", () => {
  const { text } = render({ league: { ...LEAGUE_IDENTITY, ...LEAGUE_RANK } });
  assert.match(text, /Bronze IV · 7 LP · 2W 3L/);
  assert.match(text, /PROTOTYPE \/ UNVERIFIED/);
  assert.match(text, /Data: OP\.GG/);
  assert.match(render({ league: { ...LEAGUE_IDENTITY, rank_state: "UNRANKED" } }).text, /No ranked Solo\/Duo rank reported/, "an ON + unranked account still says so (the server sent rank_state)");
});

test("League Show on my GamID stays the first gate: no League section from the server means no League card at all, whatever the stats switch", () => {
  const { text, count } = render({});
  assert.equal(count, 0);
  assert.doesNotMatch(text, /LEAGUE/);
});

test("Discord and Steam cards are unaffected by the stats scope (same fields, same trust labels)", () => {
  const off = render({ discord: DISCORD, steam: STEAM, league: LEAGUE_IDENTITY });
  const on = render({ discord: DISCORD, steam: STEAM, league: { ...LEAGUE_IDENTITY, ...LEAGUE_RANK } });
  for (const { text } of [off, on]) { assert.match(text, /DISCORD\s*mazen~/); assert.match(text, /@mazen9492/); assert.match(text, /STEAM\s*76561198040516491/); assert.match(text, /SteamID64/); assert.equal((text.match(/CONNECTED/g) || []).length, 2); }
  assert.equal(off.count, 3);
  assert.equal(on.count, 3);
});

test("the page does NOT hide anything: it has no stats switch and no CSS / display:none branch for rank values - it simply draws what the server sent", () => {
  assert.doesNotMatch(publicJs.replace(/\/\/.*$/gm, ""), /show_game_stats|showStats|hideStats|display\s*=\s*["']none/);
  assert.match(publicJs, /if \(league\.rank_state\) block\.append\(node\("span", "public-section-sub", leagueRankLine\(league\)\)\);/);
  assert.doesNotMatch(publicCss, /public-section-sub[^{]*\{[^}]*display:\s*none/);
});

test("migration: the stats gate is GLOBAL (published + its own switch; no Show My Games requirement) and has no client grant", () => {
  assert.match(scopeSql, /select p\.show_game_stats and e\.visibility = 'PUBLIC'/);
  assert.doesNotMatch(scopeSql.slice(scopeSql.indexOf("create or replace function private.public_game_stats_allowed"), scopeSql.indexOf("create or replace function private.get_public_identity_impl")), /show_my_games/);
  assert.match(scopeSql, /coalesce\(\(/);
  assert.match(scopeSql, /, false\);/, "defaults closed");
  assert.doesNotMatch(scopeSql, /\bgrant\b|\brevoke\b/i, "create or replace keeps the existing privileges: the gate has none, the identity function keeps its anon grant");
});

test("migration: rank_state, tier, division, lp, wins and losses are added ONLY inside `case when private.public_game_stats_allowed(...)`; the always-present part has none of them", () => {
  const league = scopeSql.slice(scopeSql.indexOf("select 'league'::text"), scopeSql.indexOf("from public.league_profiles l"));
  const gated = league.slice(league.indexOf("case when private.public_game_stats_allowed(e.entity_id)"), league.indexOf("else '{}'::jsonb end)"));
  const always = league.replace(gated, "");
  for (const key of ["rank_state", "tier", "division", "lp", "wins", "losses"]) {
    assert.match(gated, new RegExp(`'${key}',`), `${key} is inside the gate`);
    assert.doesNotMatch(always, new RegExp(`'${key}'`), `${key} is NOT in the always-present part`);
  }
  assert.doesNotMatch(always, /solo_(tier|division|lp|wins|losses|rank_state)/, "no protected column is read outside the gate");
  for (const key of ["game_name", "tag_line", "platform_id", "trust_status", "data_source", "updated_at"]) assert.match(always, new RegExp(`'${key}',`), `${key} stays`);
  assert.match(league, /jsonb_strip_nulls\(/);
  assert.match(scopeSql, /from public\.league_profiles l\s+where l\.entity_id = e\.entity_id and l\.is_public/, "the League section switch is still the first gate");
});

test("migration: the rest of the public boundary is byte-for-byte what it was (14 columns, Discord / Steam / My Games sections, publish gate)", () => {
  const previous = stripSql(read("supabase/migrations/20260922100000_public_my_games.sql"));
  const cut = sql => { const from = sql.indexOf("create or replace function private.get_public_identity_impl"); return sql.slice(from, sql.indexOf("$$;", sql.indexOf("limit 1;", from)) + 3); };
  const norm = sql => sql.replace(/\s+/g, " ");
  const next = norm(cut(scopeSql)), before = norm(cut(previous));
  const withoutLeague = sql => sql.replace(/select 'league'::text.*?from public\.league_profiles l where l\.entity_id = e\.entity_id and l\.is_public/, "LEAGUE");
  assert.equal(withoutLeague(next), withoutLeague(before), "only the League branch differs");
  assert.match(next, /and e\.visibility = 'PUBLIC'/);
  assert.match(next, /private\.public_my_games\(e\.entity_id, null, 6, 0\)/);
});

test("migration: additive - it replaces two functions, drops nothing, writes no data, and is the newest migration", () => {
  assert.doesNotMatch(scopeSql, /\bdrop\b|\btruncate\b|\bdelete\b|\binsert\b|\bupdate\b|\balter\b|create table/i);
  // "newest" originally meant nothing later redefined these functions; later, unrelated migrations (e.g. Wall persistence) are fine
  const later = readdirSync(new URL("supabase/migrations/", root)).sort().filter(name => name > scopeName);
  assert.ok(readdirSync(new URL("supabase/migrations/", root)).includes(scopeName));
  for (const name of later) assert.doesNotMatch(stripSql(read(`supabase/migrations/${name}`)), /get_public_identity_impl|public_game_stats_allowed/, `${name} must not redefine the scoped public functions`);
  assert.doesNotMatch(scopeSql, /'VERIFIED'|verified/i, "League stays prototype / unverified");
});

test("playtime audit: playtime exists on exactly one public surface (Public My Games), behind its accepted gate; the League card and everything else never carry it", () => {
  const publicCode = (path) => read(path).replace(/\/\/.*$/gm, "");
  const carriers = ["dist/public/public.js", "dist/public/index.html", "dist/account/intro-preview.js", "dist/account/intro-preview.html", "dist/flow-layout.js", "dist/video-fit.js"].filter(path => /playtime|minutes_played|hours_played/i.test(publicCode(path)));
  assert.deepEqual(carriers, [], "no other page code knows playtime");
  assert.match(publicCode("dist/public/public-games.js"), /playtimeMinutes|playtime_minutes/);
  const identityFn = scopeSql.slice(scopeSql.indexOf("create or replace function private.get_public_identity_impl"));
  assert.doesNotMatch(identityFn, /playtime|show_game_playtime/, "the identity function itself never reads playtime");
  const mine = stripSql(read("supabase/migrations/20260922100000_public_my_games.sql"));
  assert.match(mine, /case when with_playtime and p\.minutes > 0 then p\.minutes end/);
  assert.match(mine, /with_playtime := private\.public_game_playtime_allowed\(candidate_entity_id\);/);
  for (const name of readdirSync(new URL("supabase/migrations/", root)).sort()) {
    if (name === "20260921000000_game_playtime_visibility.sql") continue;
    assert.doesNotMatch(stripSql(read(`supabase/migrations/${name}`)), /show_game_playtime/, `${name} reads the switch only through the accepted gate`);
  }
});

test("Account: the hints tell the truth about the global scope; the League card note explains rank follows the stats switch", () => {
  assert.match(account, /Ranks and stats may be shown anywhere on your public GamID — the League card and a game's details/);
  assert.match(account, /Hidden\. No rank or stat value is shown anywhere on your public GamID \(the League card keeps your Riot ID and region, but not your rank\)\./);
  assert.match(account, /Your rank and stats appear there only while “Show ranks & stats on my GamID” \(Game display\) is ON\./);
  assert.match(account, /Ranks & stats is global \(League card and game details\); playtime appears only for games shown through Show My Games/);
  assert.match(account, /They keep their PROTOTYPE \/ UNVERIFIED labels\./);
  assert.match(account, /there is no switch per game/);
  assert.doesNotMatch(account.slice(account.indexOf("function renderGameDisplay"), account.indexOf("async function changePublicGamesSetting")), /only for games shown through Show My Games, and only for stats/, "the old, narrower stats wording is gone");
});

// ------------------------------------------------------------------------------------------------------------------------------ B: the real Steam icon
const STEAM_PATH_FINGERPRINT = "M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658";
const steamRule = publicCss.match(/\.pg-icon\.is-steam\{[^}]*\}/)[0];
const manualRule = publicCss.match(/\.pg-icon\.is-manual\{[^}]*\}/)[0];
const providerRule = publicCss.match(/\.pg-icon\.is-provider\{[^}]*\}/)[0];

test("Steam icon: the standard Steam glyph, embedded locally as a data-URI mask - no remote image, no font, no dependency, no icon library", () => {
  assert.ok(steamRule.includes(STEAM_PATH_FINGERPRINT), "the Steam logo path");
  assert.match(steamRule, /viewBox='0 0 24 24'/);
  assert.match(steamRule, /^\.pg-icon\.is-steam\{width:1rem;height:1rem;--pg-icon:url\("data:image\/svg\+xml,/);
  assert.doesNotMatch(publicCss, /url\(\s*["']?https?:/i, "no remote asset");
  assert.doesNotMatch(publicCss.replace(/\/\*[\s\S]*?\*\//g, "") + read("dist/public/index.html") + read("dist/public/public.js").replace(/\/\/.*$/gm, ""), /steamstatic|steamcommunity|steampowered|cdn\.|font-awesome|fontawesome|unpkg|jsdelivr/i, "the profile never depends on an external icon URL");
  assert.doesNotMatch(steamRule, /circle/, "the old generic circle mark is gone");
  assert.doesNotMatch(read("package.json"), /"(dependencies|devDependencies)"/, "no runtime dependency was added");
  assert.match(publicCss, /simple-icons "steam" path, CC0/, "the source and license of the glyph are recorded next to it");
});

test("Manual and the generic provider marks are untouched: the pencil stays, and only Steam changed", () => {
  assert.match(manualRule, /M2\.5 13\.5l\.7-3\.1 7\.6-7\.6/);
  assert.ok(!manualRule.includes(STEAM_PATH_FINGERPRINT));
  assert.match(providerRule, /circle cx='8' cy='8' r='6\.4'/);
  assert.match(publicCss, /\.pg-badge\.is-manual\{[^}]*border-style:dashed/);
});

const steamGame = normalizePublicGame({ name: "Dota 2", year: 2013, sources: ["DISCOVERED_FROM_STEAM"], platforms: [{ key: "steam", label: "Steam", source: "DISCOVERED_FROM_STEAM" }] });
const manualGame = normalizePublicGame({ name: "Crash Bandicoot", year: 1996, sources: ["MANUAL"], platforms: [{ key: "ps1", label: "PlayStation (PS1)", source: "MANUAL" }] });
const mergedGame = normalizePublicGame({ name: "Marvel Rivals", year: 2024, sources: ["DISCOVERED_FROM_STEAM", "MANUAL"], platforms: [{ key: "steam", label: "Steam", source: "DISCOVERED_FROM_STEAM" }, { key: "ps5", label: "PlayStation 5", source: "MANUAL" }] });
const iconKinds = node => node.byClass("pg-icon").map(icon => icon.className.split(/\s+/).find(name => name.startsWith("is-")));

test("compact preview: a Steam row carries the Steam icon next to the text 'Steam · Discovered'; a manual row does not get it", () => {
  const preview = element("section");
  renderGamesPreview({ element, container: preview, library: { libraryCount: 3, totalCount: 3, games: [steamGame, manualGame, mergedGame] }, onOpenGame() {}, onViewAll() {} });
  const rows = preview.byClass("pg-item");
  assert.deepEqual(iconKinds(rows[0]), ["is-steam"]);
  assert.deepEqual(rows[0].byClass("pg-badge").map(textOf), ["Steam · Discovered"]);
  assert.deepEqual(iconKinds(rows[1]), ["is-manual"], "manual: pencil only, never the Steam mark");
  assert.deepEqual(iconKinds(rows[2]), ["is-steam", "is-manual"], "merged: Steam mark + manual mark on the SAME canonical game");
  assert.deepEqual(rows[2].byClass("pg-badge").map(textOf), ["Steam · Discovered", "Manual · PlayStation 5"]);
  assert.equal(preview.all(node => node.hasClass?.("pg-name") && textOf(node) === "Marvel Rivals").length, 1, "one row");
});

test("icon semantics: decorative (aria-hidden), the words carry the provenance, the row's accessible name says 'Discovered', and nothing says Verified", () => {
  for (const game of [steamGame, mergedGame]) {
    const row = buildGameRow({ element, game, onOpen() {} });
    for (const icon of row.byClass("pg-icon")) { assert.equal(icon.getAttribute("aria-hidden"), "true"); assert.equal(icon.textContent, "", "no text, no alt: nothing duplicated for a screen reader"); }
    assert.match(row.first("pg-row").getAttribute("aria-label"), /Steam · Discovered/);
    assert.doesNotMatch(textOf(row) + row.first("pg-row").getAttribute("aria-label"), /verified|✓|✔/i);
  }
  assert.deepEqual(sourceBadges(steamGame).map(badge => badge.text), ["Steam · Discovered"]);
  assert.match(sourceBadges(steamGame)[0].description, /Not verified/);
});

test("View all and library search results carry the Steam icon too (same row builder), and so does the Steam source in Game Details", async () => {
  const games = [steamGame, manualGame, mergedGame];
  const mounted = [];
  const server = { async getPublicMyGames(handle, { query = "" } = {}) { const rows = games.filter(game => !query || game.name.toLowerCase().includes(query.toLowerCase())); return { library_count: 3, total_count: rows.length, games: rows.map(game => ({ name: game.name, year: game.year, sources: game.sources, platforms: game.platforms })) }; } };
  const timers = [];
  const controller = createGamesLibrary({ element, handle: "black", api: server, mount: node => mounted.push(node), libraryCount: 3, schedule: fn => { timers.push(fn); return timers.length; }, cancel() {} });
  controller.openLibrary(null);
  await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
  const panel = mounted[0].children[1];
  const library = panel.children[0], detail = panel.children[1];
  const listRows = () => library.first("pg-list").byClass("pg-item");
  assert.deepEqual(listRows().map(iconKinds), [["is-steam"], ["is-manual"], ["is-steam", "is-manual"]], "View all");
  const input = library.first("pg-search-input");
  input.value = "dota"; input.dispatch("input"); timers.at(-1)();
  await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(listRows().map(row => textOf(row.first("pg-name"))), ["Dota 2"]);
  assert.deepEqual(iconKinds(listRows()[0]), ["is-steam"], "search result");
  listRows()[0].first("pg-row").click();
  const sources = detail.first("pg-sources");
  assert.deepEqual(iconKinds(sources), ["is-steam"], "Game Details source section");
  assert.equal(textOf(sources.first("pg-source-name")), "Steam");
  assert.match(textOf(sources.first("pg-source-text")), /Discovered through the connected Steam account/);
  assert.doesNotMatch(textOf(detail), /Verified\b|✓|✔/);
  controller.close();
  const merged = gameDetails(mergedGame);
  assert.deepEqual(merged.sources.map(source => source.kind), ["steam", "manual"]);
});

test("the compact badge still fits a 360px phone: it wraps inside its row, never wider than the row, and adds no fixed width", () => {
  assert.match(publicCss, /\.pg-badge\{[^}]*max-width:100%/);
  assert.match(publicCss, /\.pg-badges\{[^}]*flex-wrap:wrap/);
  assert.match(publicCss, /\.pg-badge-text\{[^}]*overflow-wrap:anywhere/);
  assert.match(publicCss, /\.pg-icon\{flex:none;/, "the icon never shrinks or stretches the badge");
  assert.doesNotMatch(steamRule.replace(/url\([^)]*\)/, ""), /min-width|padding|margin/, "the Steam mark adds nothing but its own 1rem box");
});
