// Provider-neutral expandable Game Profiles in My Games: model normalization, trust separation, expansion behavior, and safety.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_LIST_PREVIEW, buildGameLibrary } from "../dist/account/game-list.js";
import {
  GAME_PROFILE_MAX_FIELDS, attachGameProfile, buildGameProfilePanel, dataSourceLabel, displayValue, identityLabel, indexGameProfiles,
  normalizeGameProfile, profileForGame, trustPresentation,
} from "../dist/account/game-profile.js";
import { LEAGUE_LABELS, leagueRowToGameProfileRow } from "../dist/account/game-profile-league-compat.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// A minimal fake DOM element (there is no jsdom in this project): enough to inspect and click what the module builds.
function fake(tag, className, text) {
  const node = { tag, className: className || "", text: text ?? "", children: [], attrs: {}, dataset: {}, listeners: {}, id: "", type: "", hidden: false };
  node.append = (...items) => { node.children.push(...items); };
  node.setAttribute = (key, value) => { node.attrs[key] = String(value); };
  node.addEventListener = (event, handler) => { node.listeners[event] = handler; };
  node.click = () => node.listeners.click?.();
  return node;
}
const find = (node, predicate, out = []) => { if (predicate(node)) out.push(node); for (const child of node.children || []) if (child && typeof child === "object") find(child, predicate, out); return out; };
const textOf = node => [node.text, ...(node.children || []).map(child => (typeof child === "object" ? textOf(child) : ""))].join(" ");

const FIELDS = [
  { key: "rank", label: "Rank", value: "Gold II", kind: "rank" },
  { key: "win_rate", label: "Win rate", value: "58.3%", kind: "percent" },
  { key: "matches", label: "Matches", value: 142, kind: "number" },
  { key: "main_hero", label: "Main hero", value: "Sample Hero" },
];
const rawProfile = (extra = {}) => ({ game_key: "sample_game", identity_source: "MANUAL_UID", identity_ref: "1234567890", data_source: "SAMPLE_PROVIDER", data_source_class: "THIRD_PARTY", trust_status: "MANUAL", verification_basis: null, fields: FIELDS, fetched_at: "2026-09-21T10:00:00Z", is_public: false, ...extra });

// A compact discovered-game row exactly like the Steam list builds (icon + copy with provenance).
function discoveredRow(game) {
  const item = fake("li", "game-item");
  const copy = fake("span", "game-copy");
  copy.append(fake("span", "game-name", game.name), fake("span", "game-meta", "Discovered via Steam"));
  item.append(fake("span", "game-icon", game.name[0]), copy);
  return item;
}
const hasToggle = item => find(item, node => node.tag === "button" && node.className.includes("game-profile-toggle")).length === 1;

// ------------------------------------------------------------------------------------------------ model
test("a complete profile normalizes into the provider-neutral model (identity, stats source, fields and trust are separate)", () => {
  const p = normalizeGameProfile(rawProfile());
  assert.equal(p.gameKey, "sample_game");
  assert.equal(p.identitySource, "MANUAL_UID");
  assert.equal(p.identityRef, "1234567890");
  assert.equal(p.dataSource, "SAMPLE_PROVIDER");
  assert.equal(p.dataSourceClass, "THIRD_PARTY");
  assert.equal(p.trust, "MANUAL");
  assert.deepEqual(p.fields.map(f => f.key), ["rank", "win_rate", "matches", "main_hero"]);
  assert.equal(p.fetchedAt.toISOString(), "2026-09-21T10:00:00.000Z");
  assert.equal(p.isPublic, false);
  assert.ok(GAME_PROFILE_MAX_FIELDS >= 4, "the model carries whatever fields a game supplies: no fixed field names");
});

test("the model is game-agnostic: any game key and any field set normalizes, nothing is hard-coded to one game", () => {
  const other = normalizeGameProfile(rawProfile({ game_key: "another_game", fields: [{ key: "kd_ratio", label: "K/D", value: 1.42, kind: "number" }, { key: "favourite_map", label: "Favourite map", value: "Neon Yard" }] }));
  assert.equal(other.gameKey, "another_game");
  assert.deepEqual(other.fields.map(f => f.label), ["K/D", "Favourite map"]);
  const source = read("dist/account/game-profile.js").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /marvel|rivals|dota|steam|discord|playstation|xbox/i, "no game or discovery provider is named in the rendering logic");
});

test("malformed or missing Game Profile data fails safely (null, never a throw, never a fake row)", () => {
  const bad = [undefined, null, 0, "x", [], {}, { game_key: "Bad Key", fields: FIELDS, data_source: "SAMPLE_PROVIDER" }, rawProfile({ fields: "nope" }), rawProfile({ fields: [] }),
    rawProfile({ fields: [{ key: "A B", label: "x", value: 1 }] }), rawProfile({ fields: [{ key: "rank", label: "", value: "x" }] }), rawProfile({ data_source: "lowercase" }), rawProfile({ data_source: undefined }),
    rawProfile({ fields: [{ key: "rank", label: "Rank", value: { nested: true } }] }), rawProfile({ fields: [{ key: "rank", label: "Rank", value: Number.NaN }] })];
  for (const raw of bad) assert.doesNotThrow(() => normalizeGameProfile(raw));
  for (const raw of bad) assert.equal(normalizeGameProfile(raw), null, JSON.stringify(raw));
  const cyclic = rawProfile(); cyclic.fields = FIELDS; Object.defineProperty(cyclic, "trust_status", { get() { throw new Error("boom"); } });
  assert.equal(normalizeGameProfile(cyclic), null, "even a hostile object cannot make the UI throw");
});

test("invalid individual fields are dropped, valid ones kept, duplicates ignored, the count is capped, and playtime can never ride in a profile", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, label: `L${i}`, value: i }));
  assert.equal(normalizeGameProfile(rawProfile({ fields: many })).fields.length, GAME_PROFILE_MAX_FIELDS);
  const mixed = normalizeGameProfile(rawProfile({ fields: [{ key: "rank", label: "Rank", value: "Gold" }, { key: "rank", label: "Again", value: "Silver" }, { key: "playtime", label: "Playtime", value: "10 h" }, { key: "hours_played", label: "Hours", value: 10 }, { key: "matches", label: "Matches", value: 5 }] }));
  assert.deepEqual(mixed.fields.map(f => f.key), ["rank", "matches"]);
  assert.equal(normalizeGameProfile(rawProfile({ fields: [{ key: "playtime", label: "Playtime", value: "10 h" }] })), null, "a profile holding only playtime has nothing to show");
});

// ------------------------------------------------------------------------------------------------ trust separation
test("a discovered game alone can never produce a Game Profile or a VERIFIED status", () => {
  const discovered = { external_game_id: "2767030", game_name: "Some Game", trust_status: "DISCOVERED_FROM_STEAM", recognized_game_key: "sample_game", source_provider: "steam" };
  assert.equal(normalizeGameProfile(discovered), null, "a discovery row is not a profile");
  assert.equal(profileForGame(indexGameProfiles([]), discovered.recognized_game_key), null, "no attached profile -> nothing to expand");
  assert.equal(profileForGame(indexGameProfiles(undefined), "sample_game"), null);
  const forged = normalizeGameProfile(rawProfile({ trust_status: "DISCOVERED_FROM_STEAM" }));
  assert.equal(forged.trust, "MANUAL", "an unknown / discovery trust value collapses to MANUAL, never VERIFIED");
});

test("trust can only be lowered by the client, never raised: VERIFIED needs an official source AND a stated basis; CONNECTED needs a basis and a non-temporary source", () => {
  assert.equal(normalizeGameProfile(rawProfile({ trust_status: "VERIFIED", verification_basis: null, data_source_class: "OFFICIAL" })).trust, "MANUAL");
  assert.equal(normalizeGameProfile(rawProfile({ trust_status: "VERIFIED", verification_basis: "PLATFORM_OAUTH", data_source_class: "THIRD_PARTY" })).trust, "MANUAL");
  assert.equal(normalizeGameProfile(rawProfile({ trust_status: "VERIFIED", verification_basis: "PLATFORM_OAUTH", data_source_class: "UNOFFICIAL_TEMPORARY" })).trust, "MANUAL");
  assert.equal(normalizeGameProfile(rawProfile({ trust_status: "VERIFIED", verification_basis: "OFFICIAL_ACCOUNT_LINK", data_source_class: "OFFICIAL" })).trust, "VERIFIED");
  assert.equal(normalizeGameProfile(rawProfile({ trust_status: "CONNECTED", verification_basis: "PLATFORM_OAUTH", data_source_class: "UNOFFICIAL_TEMPORARY" })).trust, "MANUAL");
  assert.equal(normalizeGameProfile(rawProfile({ trust_status: "CONNECTED", verification_basis: "PLATFORM_OAUTH", data_source_class: "THIRD_PARTY" })).trust, "CONNECTED");
  assert.equal(normalizeGameProfile(rawProfile({ trust_status: "CONNECTED", verification_basis: null })).trust, "MANUAL");
});

test("MANUAL / UNVERIFIED stays representable and is presented as unverified, never as verified", () => {
  const p = normalizeGameProfile(rawProfile());
  const trust = trustPresentation(p);
  assert.equal(trust.label, "UNVERIFIED");
  assert.equal(trust.tone, "caution");
  assert.match(trust.note, /not proof that the identity belongs to you/);
  const panel = buildGameProfilePanel({ element: fake, profile: p, id: "x" });
  assert.ok(find(panel, node => node.className.includes("game-profile-chip") && node.text === "UNVERIFIED").length === 1);
  assert.equal(find(panel, node => /VERIFIED/.test(node.text) && node.text !== "UNVERIFIED").length, 0, "the word VERIFIED never appears for a manual identity");
});

test("the discovery provider and the stats provider are shown separately: the row says where the GAME came from, the panel says where the NUMBERS came from", () => {
  const item = discoveredRow({ name: "Sample Game" });
  const p = normalizeGameProfile(rawProfile({ data_source: "OPGG_TEMPORARY", data_source_class: "UNOFFICIAL_TEMPORARY" }));
  attachGameProfile({ element: fake, item, profile: p, stateKey: "steam:1", expanded: new Set(), gameName: "Sample Game", labels: LEAGUE_LABELS });
  const meta = find(item, node => node.className === "game-meta")[0];
  assert.equal(meta.text, "Discovered via Steam", "the discovery line is untouched by the profile");
  const panel = find(item, node => node.className === "game-profile-panel")[0];
  assert.equal(dataSourceLabel(p, LEAGUE_LABELS), "OP.GG (temporary, unofficial)");
  assert.equal(dataSourceLabel(p), "Opgg temporary", "without a supplied label an unknown source still shows as plain words: the neutral module needs no provider knowledge");
  assert.ok(textOf(panel).includes("OP.GG (temporary, unofficial)"));
  assert.ok(!textOf(panel).includes("Discovered via"), "the panel never repeats or replaces the discovery provenance");
  assert.ok(!textOf(find(item, node => node.className === "game-copy")[0]).includes("OP.GG"));
});

// ------------------------------------------------------------------------------------------------ attachment + expansion
test("a discovered game WITHOUT a Game Profile stays a plain compact row with no expansion affordance", () => {
  const item = discoveredRow({ name: "Plain Game" });
  const index = indexGameProfiles([rawProfile({ game_key: "some_other_game" })]);
  assert.equal(profileForGame(index, "plain_game"), null);
  assert.equal(profileForGame(index, undefined), null);
  assert.equal(profileForGame(index, null), null);
  assert.equal(item.children.length, 2, "icon + copy only");
  assert.equal(find(item, node => node.tag === "button").length, 0);
  assert.equal(item.className, "game-item");
});

test("a game WITH a Game Profile gets one small affordance and a collapsed panel; nothing is expanded by default", () => {
  const item = discoveredRow({ name: "Profile Game" });
  const p = normalizeGameProfile(rawProfile());
  const { toggle, panel } = attachGameProfile({ element: fake, item, profile: p, stateKey: "steam:42", expanded: new Set(), gameName: "Profile Game" });
  assert.ok(hasToggle(item));
  assert.equal(toggle.tag, "button");
  assert.equal(toggle.type, "button");
  assert.equal(toggle.attrs["aria-expanded"], "false");
  assert.equal(toggle.attrs["aria-controls"], panel.id);
  assert.equal(toggle.attrs["aria-label"], "Game Profile for Profile Game");
  assert.equal(panel.hidden, true);
  assert.match(item.className, /has-game-profile/);
  assert.ok(find(toggle, node => node.className === "game-profile-chevron").length === 1, "a chevron");
  assert.ok(find(toggle, node => node.text === "Profile").length === 1, "a compact label so it is discoverable");
});

test("tapping expands the profile inline and tapping again collapses it, in place (no re-render)", () => {
  const item = discoveredRow({ name: "Profile Game" });
  const expanded = new Set();
  const { toggle, panel } = attachGameProfile({ element: fake, item, profile: normalizeGameProfile(rawProfile()), stateKey: "steam:42", expanded, gameName: "Profile Game" });
  const before = [...item.children];
  toggle.click();
  assert.equal(toggle.attrs["aria-expanded"], "true");
  assert.equal(panel.hidden, false);
  assert.ok(expanded.has("steam:42"));
  toggle.click();
  assert.equal(toggle.attrs["aria-expanded"], "false");
  assert.equal(panel.hidden, true);
  assert.ok(!expanded.has("steam:42"));
  assert.deepEqual(item.children, before, "the same nodes stay in place: nothing was rebuilt, so the page cannot jump");
});

test("expansion state is independent per game: opening one leaves the others closed and closing one leaves the others open", () => {
  const expanded = new Set(), rows = [];
  for (const id of ["1", "2", "3"]) { const item = discoveredRow({ name: `Game ${id}` }); rows.push(attachGameProfile({ element: fake, item, profile: normalizeGameProfile(rawProfile()), stateKey: `steam:${id}`, expanded, gameName: `Game ${id}` })); }
  const ids = new Set(rows.map(r => r.panel.id));
  assert.equal(ids.size, 3, "every panel has its own id");
  rows[1].toggle.click();
  assert.deepEqual(rows.map(r => r.panel.hidden), [true, false, true]);
  rows[0].toggle.click();
  assert.deepEqual(rows.map(r => r.panel.hidden), [false, false, true]);
  rows[1].toggle.click();
  assert.deepEqual(rows.map(r => r.panel.hidden), [false, true, true]);
  assert.deepEqual([...expanded], ["steam:1"]);
});

test("a state restored from the caller's Set re-renders the same rows open (e.g. after a refresh), and others stay closed", () => {
  const expanded = new Set(["steam:2"]);
  const a = attachGameProfile({ element: fake, item: discoveredRow({ name: "A" }), profile: normalizeGameProfile(rawProfile()), stateKey: "steam:1", expanded, gameName: "A" });
  const b = attachGameProfile({ element: fake, item: discoveredRow({ name: "B" }), profile: normalizeGameProfile(rawProfile()), stateKey: "steam:2", expanded, gameName: "B" });
  assert.equal(a.panel.hidden, true);
  assert.equal(b.panel.hidden, false);
  assert.equal(b.toggle.attrs["aria-expanded"], "true");
});

test("the expanded panel renders normalized fields as plain text, with trust, source, identity and an honest private note", () => {
  const p = normalizeGameProfile(rawProfile());
  const panel = buildGameProfilePanel({ element: fake, profile: p, id: "p1" });
  const labels = find(panel, node => node.tag === "dt").map(node => node.text), values = find(panel, node => node.tag === "dd").map(node => node.text);
  assert.deepEqual(labels, ["Rank", "Win rate", "Matches", "Main hero"]);
  assert.deepEqual(values, ["Gold II", "58.3%", "142", "Sample Hero"]);
  assert.equal(identityLabel(p), "UID (entered manually): 1234567890");
  const notes = find(panel, node => node.className === "game-profile-note").map(node => node.text).join(" | ");
  assert.match(notes, /Updated /);
  assert.match(notes, /Private to you: Game Profiles are not shown on your public GamID\./);
  assert.equal(displayValue({ kind: "percent", value: 58.3 }), "58.3%");
  assert.equal(displayValue({ kind: "number", value: 7 }), "7");
  const hostile = normalizeGameProfile(rawProfile({ fields: [{ key: "rank", label: "<img src=x onerror=alert(1)>", value: "<script>alert(1)</script>" }] }));
  const hostilePanel = buildGameProfilePanel({ element: fake, profile: hostile, id: "p2" });
  assert.equal(find(hostilePanel, node => node.tag === "dd")[0].text, "<script>alert(1)</script>", "server data is only ever set as text");
});

// ------------------------------------------------------------------------------------------------ large libraries + multiple providers
test("a large library keeps the bounded Show all / Show fewer behavior; profile expansion neither adds rows nor disturbs the list control", () => {
  const games = Array.from({ length: 300 }, (_, i) => ({ id: String(i + 1), name: `Game ${i + 1}`, key: i % 3 === 0 ? "sample_game" : null }));
  const index = indexGameProfiles([rawProfile()]);
  const expanded = new Set(), listExpanded = { value: false };
  let rebuilt = 0;
  const renderItem = game => {
    const item = discoveredRow(game);
    const profile = profileForGame(index, game.key);
    if (profile) attachGameProfile({ element: fake, item, profile, stateKey: `steam:${game.id}`, expanded, gameName: game.name });
    return item;
  };
  const build = () => { rebuilt += 1; return buildGameLibrary({ element: fake, games, renderItem, expanded: listExpanded.value, onToggle: () => { listExpanded.value = !listExpanded.value; }, id: "gameList-steam" }); };
  const collapsedList = build();
  const rows = find(collapsedList, node => node.tag === "li");
  assert.equal(rows.length, GAME_LIST_PREVIEW, "still only the bounded preview is rendered");
  const withProfile = rows.filter(hasToggle);
  assert.ok(withProfile.length > 0 && withProfile.length < rows.length, "only rows with a real profile get the affordance");
  const listToggle = find(collapsedList, node => node.tag === "button" && node.className === "game-library-toggle")[0];
  assert.equal(listToggle.attrs["aria-expanded"], "false");
  find(withProfile[0], node => node.className.includes("game-profile-toggle"))[0].click();
  assert.equal(find(collapsedList, node => node.tag === "li").length, GAME_LIST_PREVIEW, "expanding a profile adds no game rows");
  assert.equal(listToggle.attrs["aria-expanded"], "false", "and does not touch the Show all control");
  assert.equal(rebuilt, 1, "no rebuild happened");
  listToggle.listeners.click();
  const expandedList = build();
  assert.equal(find(expandedList, node => node.tag === "li").length, 300, "Show all still shows every game");
  const reopened = find(expandedList, node => node.tag === "li").filter(hasToggle)[0];
  assert.equal(find(reopened, node => node.className === "game-profile-panel")[0].hidden, false, "the row the owner opened stays open across Show all");
  assert.equal(find(expandedList, node => node.tag === "li").filter(hasToggle).length, 100, "every third of 300 games has the attached profile, and no other row does");
});

test("the same game discovered through several providers resolves to ONE profile: provenance never forces duplicate profiles", () => {
  const index = indexGameProfiles([rawProfile(), rawProfile({ fields: [{ key: "rank", label: "Rank", value: "Duplicate row" }] })]);
  assert.equal(index.size, 1, "one profile per normalized game key");
  const viaSteam = { source_provider: "steam", external_game_id: "2767030", recognized_game_key: "sample_game" };
  const viaDiscord = { source_provider: "discord", external_game_id: "abc", recognized_game_key: "sample_game" };
  const viaPlayStation = { source_provider: "playstation", external_game_id: "CUSA1", recognized_game_key: "sample_game" };
  const profiles = [viaSteam, viaDiscord, viaPlayStation].map(game => profileForGame(index, game.recognized_game_key));
  assert.ok(profiles.every(p => p === profiles[0]), "all three discoveries point at the same profile object");
  assert.equal(profiles[0].fields[0].value, "Gold II", "the first record wins deterministically");
  const migration = read("supabase/migrations/20260921200000_game_profiles.sql");
  assert.match(migration, /constraint game_profiles_one_per_game unique \(entity_id, game_key\)/, "and the schema itself allows exactly one per game");
  assert.doesNotMatch(migration.replace(/--.*$/gm, ""), /source_provider|provider_key|connection_id|discovered_games/, "the profile table knows no discovery provider");
});

// ------------------------------------------------------------------------------------------------ no network
test("building and rendering My Games / Game Profiles makes no network request of any kind", () => {
  const calls = [];
  const original = { fetch: globalThis.fetch, xhr: globalThis.XMLHttpRequest, beacon: globalThis.navigator?.sendBeacon };
  globalThis.fetch = (...args) => { calls.push(["fetch", ...args]); throw new Error("no network allowed"); };
  globalThis.XMLHttpRequest = function () { calls.push(["xhr"]); throw new Error("no network allowed"); };
  try {
    const p = normalizeGameProfile(rawProfile());
    const item = discoveredRow({ name: "X" });
    const { toggle } = attachGameProfile({ element: fake, item, profile: p, stateKey: "steam:1", expanded: new Set(), gameName: "X" });
    toggle.click(); toggle.click();
    indexGameProfiles([rawProfile(), null, {}, "x"]);
    leagueRowToGameProfileRow({ solo_rank_state: "RANKED", solo_tier: "GOLD", solo_division: "II", solo_lp: 64, solo_wins: 20, solo_losses: 18, data_source: "OPGG_TEMPORARY", trust_status: "MANUAL" });
  } finally { globalThis.fetch = original.fetch; globalThis.XMLHttpRequest = original.xhr; }
  assert.deepEqual(calls, []);
  const source = read("dist/account/game-profile.js").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\s+.*supabase|api\./);
  const account = read("dist/account/account.js");
  const loader = account.slice(account.indexOf("async function loadGameProfiles"), account.indexOf("async function loadGameDisplay"));
  assert.match(loader, /api\.getMyGameProfiles\(\)/, "the only call is the owner's database read");
  assert.doesNotMatch(loader, /refresh|lookup|opgg|marvel|tracker/i);
  const row = account.slice(account.indexOf("function gameItem"), account.indexOf("// Recognition only"));
  assert.doesNotMatch(row, /api\.|fetch\(/, "rendering a row never calls an API");
});

// ------------------------------------------------------------------------------------------------ League compatibility (read-only shape check)
test("the accepted League / OP.GG owner row can be represented by the generic model without changing League", () => {
  const league = { game_name: "Sample", tag_line: "EUW", platform_id: "EUW1", identity_source: "MANUAL_RIOT_ID", data_source: "OPGG_TEMPORARY", trust_status: "MANUAL", solo_rank_state: "RANKED", solo_tier: "GOLD", solo_division: "II", solo_lp: 64, solo_wins: 20, solo_losses: 18, fetched_at: "2026-09-20T10:00:00Z", is_public: false };
  const row = leagueRowToGameProfileRow(league);
  const p = normalizeGameProfile(row);
  assert.equal(p.gameKey, "league_of_legends");
  assert.equal(p.identitySource, "MANUAL_RIOT_ID");
  assert.equal(p.identityRef, "Sample#EUW");
  assert.equal(p.dataSource, "OPGG_TEMPORARY");
  assert.equal(p.dataSourceClass, "UNOFFICIAL_TEMPORARY");
  assert.equal(p.trust, "MANUAL", "the accepted League trust label is carried over unchanged, never raised");
  assert.deepEqual(p.fields.map(f => [f.label, displayValue(f)]), [["Solo/Duo rank", "Gold II"], ["LP", "64"], ["Matches", "38"], ["Win rate", "52.6%"]]);
  assert.equal(dataSourceLabel(p, LEAGUE_LABELS), "OP.GG (temporary, unofficial)");
  assert.equal(identityLabel(p, LEAGUE_LABELS), "Riot ID (entered manually): Sample#EUW");
  const apex = normalizeGameProfile(leagueRowToGameProfileRow({ ...league, solo_tier: "CHALLENGER", solo_division: null, solo_lp: 900 }));
  assert.equal(apex.fields[0].value, "Challenger");
  const unranked = normalizeGameProfile(leagueRowToGameProfileRow({ ...league, solo_rank_state: "UNRANKED", solo_tier: null, solo_division: null, solo_lp: null, solo_wins: null, solo_losses: null }));
  assert.equal(unranked.fields[0].value, "Unranked");
  assert.equal(leagueRowToGameProfileRow(null), null);
  assert.equal(normalizeGameProfile(leagueRowToGameProfileRow({})), null, "an empty League row has nothing to show");
  const neutral = read("dist/account/game-profile.js");
  assert.doesNotMatch(neutral, /OP\.GG|OPGG|Riot|League/i, "the neutral module is free of any provider: the League shape lives in its own isolated module");
  // the accepted League implementation is untouched: no League file mentions the generic model
  for (const path of ["supabase/functions/_shared/league/league-domain.js", "supabase/functions/_shared/league/league-service.js", "supabase/functions/_shared/league/opgg-adapter.js", "supabase/migrations/20260920100000_league_profile_prototype.sql"]) assert.doesNotMatch(read(path), /game_profile|game-profile/i, path);
});

// ------------------------------------------------------------------------------------------------ mobile / touch + privacy regressions
test("touch and mobile: a real 44 px target, wraps under the row, single column on narrow screens, no hover-only affordance, no clipped text", () => {
  const css = read("dist/account/account.css");
  const block = css.slice(css.indexOf("/* Optional expandable Game Profile"), css.indexOf("/* Steam Connection Foundation:"));
  assert.match(block, /\.game-profile-toggle\{[^}]*min-height:2\.75rem[^}]*min-width:2\.75rem/);
  assert.match(block, /touch-action:manipulation/);
  assert.match(block, /\.game-library \.game-item\{flex-wrap:wrap\}/, "the panel opens inline under its row");
  assert.match(block, /\.game-profile-panel\{flex:0 0 100%/);
  assert.match(block, /\.game-profile-panel\[hidden\]\{display:none\}/, "the hidden attribute is respected");
  assert.match(block, /\.game-profile-toggle\[aria-expanded="true"\] \.game-profile-chevron\{/);
  assert.match(block, /@media\(max-width:23rem\)\{\.game-profile-fields\{grid-template-columns:1fr\}\}/);
  assert.doesNotMatch(block, /data-provider|text-overflow:ellipsis|white-space:nowrap|:hover\{[^}]*display/);
  assert.match(block, /overflow-wrap:anywhere/);
});

test("existing privacy is unchanged: owner playtime still shows privately, the playtime switch is untouched, and profiles cannot carry playtime", () => {
  const account = read("dist/account/account.js");
  assert.match(account, /Number\.isInteger\(game\.playtime_minutes\) \? gameHours\(game\.playtime_minutes\)/);
  assert.match(account, /label: "Show playtime on my GamID"/);
  assert.match(account, /Hidden\. Hours played are never shown on your public GamID\./);
  assert.equal(normalizeGameProfile(rawProfile({ fields: [{ key: "playtime", label: "Playtime", value: "300 h" }, { key: "rank", label: "Rank", value: "Gold" }] })).fields.length, 1);
});

test("the accepted list behavior is preserved: rows still come from buildGameLibrary with a per-provider expanded set and provenance labels", () => {
  const account = read("dist/account/account.js");
  assert.match(account, /buildGameLibrary\(\{/);
  assert.match(account, /expanded: gameListExpanded\.has\("steam"\)/);
  assert.match(account, /"Discovered via Steam"/);
  assert.match(account, /const expandedGameProfiles = new Set\(\);/, "profile expansion state is separate from the list's Show all state");
  assert.match(account, /if \(profile\) attachGameProfile\(/);
  assert.match(account, /profileForGame\(gameProfileIndex, game\.recognized_game_key\)/, "attachment is by the normalized game key, never by provider");
});
