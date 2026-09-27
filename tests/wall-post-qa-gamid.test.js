// Post-manual-QA fixes (GamID blocks): G Games rows open Game Details and surface connected / discovered metadata; H Connections are interactive. Both draw from the
// VISITOR view of the GamID (the same anonymous public data the public profile uses), so privacy is exactly the server's.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import { paintGamidBlock } from "../dist/wall-kit/gamid-blocks.js";
import { createWallDetails } from "../dist/wall-kit/gamid-details.js";
import { INTERACTIVE_ATTR } from "../dist/wall-kit/interaction.js";
import { loadGamidSnapshot, loadPublicView, publicConnections, PUBLIC_SOURCE_LABELS, PUBLIC_PAGE_SIZE } from "../dist/wall-editor/gamid-data.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---------- a fake DOM rich enough for the accepted components ----------
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.hidden = false; this.style = { setProperty: (name, value) => this.props.set(name, value) }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  append(...nodes) { for (const node of nodes) if (node) { node.parent = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  focus() { this.focused = true; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  set innerHTML(_) { throw new Error("innerHTML is forbidden"); }
  async click() { for (const handler of this.listeners.click || []) await handler({ target: this, preventDefault() {} }); }
}
const element = (tag, className, text) => { const node = new El(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const make = tag => new El(tag);
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const byClass = (root, cls) => all(root, node => typeof node.className === "string" && node.className.split(" ").includes(cls));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// ---------- public data as the server returns it ----------
const game = (name, extra = {}) => ({ name, sources: ["DISCOVERED_FROM_STEAM"], platforms: [], ...extra });
const league = { name: "League of Legends", sources: ["MANUAL"], platforms: [{ key: "pc", label: "PC", source: "MANUAL" }], stats: { league: { solo_rank_state: "RANKED", solo_tier: "BRONZE", solo_division: "IV", solo_lp: 32, solo_wins: 10, solo_losses: 12, data_source: "OPGG_TEMPORARY", fetched_at: "2026-09-20T00:00:00Z", game_name: "Black", tag_line: "ME1", is_public: true } } };
const library = (names, extra = {}) => ({ library_count: names.length, total_count: names.length, games: names.map(name => (name === "League of Legends" ? league : game(name, extra[name] ?? {}))) });
const PUBLIC_NAMES = ["League of Legends", ...Array.from({ length: 119 }, (_, i) => `Public Game ${String(i + 1).padStart(3, "0")}`)];
const sections = {
  discord: { display_name: "Espada", username: "espada" },
  steam: { steam_id: "76561197960287930" },
  league: { game_name: "Black", tag_line: "ME1", platform_id: "ME1", rank_state: "RANKED", tier: "BRONZE", division: "IV", lp: 32, wins: 10, losses: 12, data_source: "OPGG_TEMPORARY", updated_at: "2026-09-20T00:00:00Z" },
  my_games: { library_count: 120, games: PUBLIC_NAMES.slice(0, 6).map(name => (name === "League of Legends" ? league : game(name))) },
};
function fakeApi({ identity = { gamid_handle: "black", public_sections: sections }, names = PUBLIC_NAMES } = {}) {
  const calls = [];
  return {
    calls,
    getPublicIdentity: async handle => { calls.push(["identity", handle]); return identity; },
    getPublicMyGames: async (handle, { query = "", limit = 30, offset = 0 } = {}) => {
      calls.push(["games", handle, query, limit, offset]);
      const matched = names.filter(name => !query || name.toLowerCase().includes(query.toLowerCase()));
      const page = library(matched.slice(offset, offset + limit), { "Public Game 002": { playtime_minutes: 754 } });
      return { ...page, library_count: names.length, total_count: matched.length };
    },
  };
}

test("G/H the Wall's Game Details styles are an EXACT copy of the accepted public-profile .pg-* rules (drift guard)", () => {
  const pgRules = css => {
    const out = [];
    for (const match of css.matchAll(/(@media[^{]*)\{((?:[^{}]*\{[^{}]*\})*)\s*\}|([^{}@]+)\{([^{}]*)\}/g)) {
      if (match[1]) { for (const inner of match[2].matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (/\.pg-/.test(inner[1])) out.push(`${match[1].trim()} ${inner[1].trim()}{${inner[2].trim()}}`); }
      else if (/\.pg-/.test(match[3])) out.push(`${match[3].trim()}{${match[4].trim()}}`);
    }
    return out;
  };
  const publicRules = pgRules(read("dist/public/public.css").replace(/\/\*[\s\S]*?\*\//g, ""));
  const wallRules = pgRules(read("dist/wall-kit/game-details.css").replace(/\/\*[\s\S]*?\*\//g, ""));
  assert.ok(publicRules.length > 50);
  for (const rule of publicRules) assert.ok(wallRules.includes(rule), `missing or changed in game-details.css: ${rule.slice(0, 120)}`);
  const extra = wallRules.filter(rule => !publicRules.includes(rule));
  assert.ok(extra.every(rule => /wall-details/.test(rule)), `only Wall-scoped additions may differ: ${extra.join(" | ")}`);
  assert.match(read("dist/wall-editor/index.html"), /<link rel="stylesheet" href="\.\.\/wall-kit\/game-details\.css" \/>/);
});

test("H public connections: only what the public profile shows, plus real actions - Steam's own profile address, copy a Discord username, open the League game", () => {
  const list = publicConnections(sections);
  assert.deepEqual(list.map(item => [item.key, item.name, item.sub, item.trust]), [
    ["discord", "Espada", "@espada", "CONNECTED"],
    ["steam", "76561197960287930", "SteamID64", "CONNECTED"],
    ["league", "Black#ME1", "Region ME1", "PROTOTYPE / UNVERIFIED"],
  ]);
  assert.deepEqual(list[0].actions, [{ kind: "copy", label: "Copy username", value: "espada" }]);
  assert.deepEqual(list[1].actions, [{ kind: "open", label: "Open Steam profile", url: "https://steamcommunity.com/profiles/76561197960287930" }]);
  assert.deepEqual(list[2].actions, [{ kind: "game", label: "View League of Legends game", gameName: "League of Legends" }]);
  assert.equal(list[2].lines[0], "Bronze IV · 32 LP · 10W 12L");
  assert.match(list[2].lines[1], /^Data: OP\.GG/);
  // privacy: nothing is shown or invented beyond the server's answer
  assert.deepEqual(publicConnections({}), []);
  assert.equal(publicConnections({ steam: { steam_id: "not-an-id" } }).length, 0, "a malformed id is dropped, never turned into an address");
  const noStats = publicConnections({ league: { ...sections.league, rank_state: undefined } })[0];
  assert.equal(noStats.lines.some(line => /Bronze|LP|rank/i.test(line)), false, "ranks & stats off on the GamID: no rank line at all");
  assert.equal(PUBLIC_SOURCE_LABELS.OPGG_TEMPORARY.startsWith("OP.GG"), true, "the accepted label, not a copy");
});

test("G visitor view: built ONLY from the anonymous public calls - private games never appear, My Games off means no list, unpublished means nothing", async () => {
  const api = fakeApi();
  const view = await loadPublicView(api, "black");
  assert.equal(view.available, true);
  assert.deepEqual(api.calls[0], ["identity", "black"]);
  assert.deepEqual(api.calls[1], ["games", "black", "", PUBLIC_PAGE_SIZE, 0], "one page of 50, not the whole library");
  assert.equal(view.games.libraryCount, 120);
  assert.equal(view.games.items.length, 50);
  assert.equal(await view.games.loadMore(), true);
  assert.equal(view.games.items.length, 100);
  assert.deepEqual(api.calls.at(-1), ["games", "black", "", 50, 50]);
  await view.games.loadMore();
  assert.equal(await view.games.loadMore(), false, "nothing left to load");
  assert.equal(view.games.items.length, 120);
  const off = await loadPublicView(fakeApi({ identity: { gamid_handle: "black", public_sections: { discord: sections.discord } } }), "black");
  assert.equal(off.games, null, "My Games off: visitors get no game list");
  assert.equal((await loadPublicView(fakeApi({ identity: null }), "black")).available, false, "an unpublished GamID shows visitors nothing");
  // the full snapshot: the owner's own (private) game is in the editor's data, never in the visitor view
  const owner = {
    ...fakeApi(), getIdentity: async () => ({ gamid_handle: "black", display_name: "Espada" }), getIdentityProfile: async () => ({}), getMyConnections: async () => [],
    getMyPublicGamesSettings: async () => ({ show_my_games: true }), getMyGameDisplaySettings: async () => ({ show_game_playtime: true }),
    getMyDiscoveredGames: async () => [{ game_name: "Secret Owner Game", playtime_minutes: 99 }], getMyManualGames: async () => [], loadAvatar: async () => null,
  };
  const snapshot = await loadGamidSnapshot(owner);
  assert.ok(snapshot.games.items.some(item => item.name === "Secret Owner Game"), "the owner designs with their own data");
  assert.equal(snapshot.public.games.items.some(item => item.name === "Secret Owner Game"), false, "a visitor never sees it");
});

const gamesDoc = (payload = {}) => { const doc = createDocument(); doc.stages[0].elements = [createElement({ id: "g", type: "gamid", x: 0, y: 0, width: 800, height: 700, z: 0, payload: { block: "games", ...payload } }), createElement({ id: "c", type: "gamid", x: 0, y: 900, width: 800, height: 400, z: 1, payload: { block: "connections" } })]; return doc; };

test("G Games in Preview: rows are buttons that open Game Details, show source badges and a rank line where allowed, stay collapsed, expand, and page in more", async () => {
  const view = await loadPublicView(fakeApi(), "black");
  const opened = [];
  const details = { openGame: (game, opener) => opened.push([game.name, opener.tag]), openConnection: () => {} };
  const [stage] = paintDocument(gamesDoc({ initial: 8 }), 500, make, { mode: "view", gamid: { public: view, games: { items: [] }, visibility: {} }, details }).stages;
  const box = stage.children.find(node => node.attrs["data-el"] === "g");
  const rows = () => byClass(box, "wall-game").filter(node => node.tag === "button");
  assert.equal(rows().length, 8, "collapsed: only the first few rows exist");
  const libraryRegion = byClass(box, "game-library")[0];
  assert.equal(libraryRegion.attrs[INTERACTIVE_ATTR], "true", "the list (rows, toggle, More) takes taps under the shared tap policy");
  const first = rows()[0];
  assert.match(first.textContent, /League of Legends/);
  assert.match(first.textContent, /Manual · PC/, "the accepted source badge (never 'verified')");
  assert.match(first.textContent, /Solo\/Duo rank Bronze IV/, "the connected League data enriches the GAME itself");
  assert.match(rows()[1].textContent, /Steam · Discovered/);
  assert.match(first.attrs["aria-label"], /Open game details/);
  await first.click();
  assert.deepEqual(opened, [["League of Legends", "button"]], "tapping a game opens its Game Details");
  const toggle = () => byClass(box, "game-library-toggle").find(node => !node.className.includes("wall-game-more"));
  assert.match(toggle().textContent, /Show all 120 games/);
  await toggle().click();
  assert.equal(rows().length, 50, "expanded: the loaded page");
  const more = byClass(box, "wall-game-more")[0];
  assert.match(more.textContent, /Show more games \(70 left\)/);
  await more.click();
  await tick();
  assert.equal(rows().length, 100, "more games page in on request - thousands never load at once");
  await toggle().click();
  assert.equal(rows().length, 8, "Show fewer collapses again");
});

test("G hours appear only when the block shows them AND the server sent them (the owner's playtime switch); edit mode keeps the owner's static rows", async () => {
  const view = await loadPublicView(fakeApi(), "black");
  const paintRows = payload => byClass(paintGamidBlock({ kind: "gamid", block: "games", layout: "card", initial: 8, ...payload }, { public: view, games: { items: [] } }, make, { interactive: true, details: null }), "wall-game-hours").map(node => node.textContent);
  assert.deepEqual(paintRows({ showPlaytime: false }), []);
  assert.deepEqual(paintRows({ showPlaytime: true }), ["13 h"], "only the game the server sent playtime for");
  const ownerOnly = paintGamidBlock({ kind: "gamid", block: "games", layout: "card", initial: 8 }, { public: view, games: { total: 1, items: [{ name: "Secret Owner Game", minutes: 99 }], playtimeAllowed: false }, visibility: {} }, make, { interactive: false });
  assert.match(ownerOnly.textContent, /Secret Owner Game/, "the editor canvas still shows the owner's own data to design with");
  assert.equal(all(ownerOnly, node => node.tag === "button" && String(node.className).includes("wall-game")).length, 0, "and it is not interactive there");
  const hidden = paintGamidBlock({ kind: "gamid", block: "games", layout: "card", initial: 8 }, { public: { available: true, games: null, connections: [] } }, make, { interactive: true });
  assert.match(hidden.textContent, /My Games is off/);
  const unpublished = paintGamidBlock({ kind: "gamid", block: "connections", layout: "card" }, { public: { available: false, games: null, connections: [] } }, make, { interactive: true });
  assert.match(unpublished.textContent, /not public/);
});

test("H Connections in Preview: each public connection is a button that opens its details; a private connection is simply absent", async () => {
  const view = await loadPublicView(fakeApi({ identity: { gamid_handle: "black", public_sections: { steam: sections.steam, league: sections.league } } }), "black");
  const opened = [];
  const [stage] = paintDocument(gamesDoc(), 500, make, { mode: "view", gamid: { public: view, games: { items: [] } }, details: { openGame: () => {}, openConnection: (connection, opener) => opened.push([connection.key, opener.tag]) } }).stages;
  const box = stage.children.find(node => node.attrs["data-el"] === "c");
  const buttons = byClass(box, "wall-connection");
  assert.deepEqual(buttons.map(button => button.children[0].textContent), ["Steam", "League of Legends"], "Discord was not made public: it is not drawn");
  assert.equal(byClass(box, "wall-gamid-connections").find(node => node.tag === "ul").attrs[INTERACTIVE_ATTR], "true");
  await buttons[1].click();
  assert.deepEqual(opened, [["league", "button"]]);
  assert.match(buttons[1].textContent, /PROTOTYPE \/ UNVERIFIED/, "the trust label is carried, never upgraded");
});

test("G/H details: Game Details IS the accepted public component (League rank & stats with their trust label); connection actions are real and safe", async () => {
  const mounted = [];
  const api = fakeApi();
  const copied = [];
  const details = createWallDetails({ element, handle: "black", api, mount: node => mounted.push(node), sourceLabels: PUBLIC_SOURCE_LABELS, clipboard: { writeText: async value => copied.push(value) } });
  assert.equal(mounted.length, 2);
  assert.ok(mounted.every(root => root.className.includes("pg-modal") && root.className.includes("wall-details")));
  const view = await loadPublicView(api, "black");
  details.openGame(view.games.items[0], element("button"));
  const gameRoot = mounted[0];
  assert.equal(gameRoot.hidden, false);
  const text = gameRoot.textContent;
  assert.match(text, /League of Legends/);
  assert.match(text, /Rank & stats/);
  assert.match(text, /PROTOTYPE \/ UNVERIFIED/, "the accepted League trust label");
  assert.match(text, /Bronze IV/);
  details.closeAll();
  // connection sheet
  const [discord, steam, leagueConnection] = publicConnections(sections);
  const sheet = mounted[1];
  details.openConnection(steam, element("button"));
  const link = all(sheet, node => node.tag === "a")[0];
  assert.deepEqual([link.attrs.href, link.attrs.target, link.attrs.rel], ["https://steamcommunity.com/profiles/76561197960287930", "_blank", "noopener noreferrer nofollow"]);
  details.openConnection(discord, element("button"));
  await all(sheet, node => node.tag === "button" && node.textContent === "Copy username")[0].click();
  assert.deepEqual(copied, ["espada"]);
  details.openConnection(leagueConnection, element("button"));
  await all(sheet, node => node.tag === "button" && /View League of Legends game/.test(node.textContent))[0].click();
  assert.deepEqual(api.calls.at(-1), ["games", "black", "League of Legends", 10, 0], "the game is found through the same public function");
  assert.equal(gameRoot.hidden, false, "the connection leads to the GAME's details");
  assert.equal(sheet.hidden, true);
  // an unsafe address is never shown
  details.openConnection({ label: "X", name: "x", trust: "CONNECTED", actions: [{ kind: "open", label: "Open", url: "javascript:alert(1)" }, { kind: "open", label: "Open", url: "https://user:pw@example.com/" }] }, null);
  assert.equal(all(sheet, node => node.tag === "a").length, 0);
});
