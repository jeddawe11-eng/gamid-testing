// Game Catalog expansion: historical + modern platforms, canonical and per-platform release years, resumable Wikidata export, and the search-result year.
// Everything here is offline: no network, no database (the database rules are asserted in tests/integration/game-catalog-expansion-db.sql).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORMS, PLATFORM_QIDS, platformKeyForLabel } from "../scripts/catalog/platform-map.mjs";
import { MAX_RELEASE_YEAR, MIN_RELEASE_YEAR, buildCatalogItem, parseRelease } from "../scripts/catalog/wikidata-catalog.mjs";
import { normalizeSearchResults } from "../dist/account/game-search.js";
import { createAddGamePanel } from "../dist/account/manual-games.js";
import { buildLibraryRows, normalizeManualGames, normalizePlatformState, selectionKeys, selectablePlatforms, toggleSelection, initialSelection } from "../dist/account/game-platforms.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20260922000000_game_catalog_platforms_release_years.sql");
const sql = migration.replace(/--.*$/gm, "");
const walk = dir => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
const keys = PLATFORMS.map(platform => platform.key);
const byKey = new Map(PLATFORMS.map(platform => [platform.key, platform]));
const base = { qid: "Q1", label: "Some Game", sitelinks: 10, platformQids: [], identifiers: [], aliases: [], releases: [] };
const item = extra => buildCatalogItem({ ...base, ...extra });
const rel = (date, precision, platformQid = null) => ({ date: `${date}T00:00:00Z`, precision, platformQid });

// ------------------------------------------------------------------------------------------------ normalized platforms
test("the normalized platform set is stable and well-formed: unique provider-neutral keys, fixed families, unique sort order, every Wikidata item names ONE platform", () => {
  assert.equal(new Set(keys).size, keys.length);
  for (const platform of PLATFORMS) {
    assert.match(platform.key, /^[a-z][a-z0-9_]{1,31}$/, platform.key);
    assert.ok(platform.name.length >= 1 && platform.name.length <= 40, platform.name);
    assert.ok(["PC", "PLAYSTATION", "XBOX", "NINTENDO", "SEGA", "ATARI", "NEC", "SNK", "MOBILE", "OTHER"].includes(platform.family), `${platform.key} family`);
  }
  assert.equal(new Set(PLATFORMS.map(platform => platform.sort)).size, PLATFORMS.length, "sort order is unique");
  const seen = new Map();
  for (const platform of PLATFORMS) for (const qid of platform.qids) { assert.match(qid, /^Q[0-9]+$/); assert.ok(!seen.has(qid), `${qid} maps to two platforms (${seen.get(qid)} and ${platform.key})`); seen.set(qid, platform.key); }
  assert.ok(PLATFORMS.length >= 60, "broad historical + modern coverage");
  // every family is one contiguous block in the sort order
  const order = PLATFORMS.map(platform => platform.family);
  for (const family of new Set(order)) { const first = order.indexOf(family), last = order.lastIndexOf(family); assert.ok(order.slice(first, last + 1).every(value => value === family), `${family} is contiguous`); }
});

test("the eleven platforms already accepted keep their keys, names and meaning (Steam and Epic stay stores under PC)", () => {
  const accepted = { pc: ["PC", "PC"], steam: ["Steam", "PC"], epic_games: ["Epic Games Store", "PC"], ps4: ["PlayStation 4", "PLAYSTATION"], ps5: ["PlayStation 5", "PLAYSTATION"], xbox_one: ["Xbox One", "XBOX"], xbox_series: ["Xbox Series X|S", "XBOX"], switch: ["Nintendo Switch", "NINTENDO"], switch2: ["Nintendo Switch 2", "NINTENDO"], ios: ["iOS", "MOBILE"], android: ["Android", "MOBILE"] };
  for (const [key, [name, family]] of Object.entries(accepted)) { assert.equal(byKey.get(key)?.name, name, key); assert.equal(byKey.get(key)?.family, family, key); }
  assert.deepEqual(byKey.get("steam").qids, ["Q337535"]);
  assert.deepEqual(byKey.get("epic_games").qids, [], "Epic has no Wikidata platform item: it is proven only by a store identifier");
});

test("every platform named in the brief is present, historical and modern", () => {
  for (const key of ["ps1", "ps2", "ps3", "ps4", "ps5", "psp", "ps_vita", "xbox", "xbox_360", "xbox_one", "xbox_series", "nes", "snes", "n64", "gamecube", "wii", "wii_u", "switch", "switch2", "game_boy", "game_boy_color", "game_boy_advance", "nintendo_ds", "nintendo_dsi", "nintendo_3ds", "master_system", "genesis", "sega_cd", "sega_32x", "saturn", "dreamcast", "game_gear", "pc", "macos", "linux"]) assert.ok(byKey.has(key), key);
  for (const key of ["atari_2600", "atari_7800", "turbografx_16", "neo_geo", "three_do"]) assert.ok(byKey.has(key), `${key} (other established families present in the source data)`);
});

test("PlayStation / PS1 / PS2 / PS3 / PSP / Vita normalize to their own platforms", () => {
  assert.equal(PLATFORM_QIDS.Q10677, "ps1");
  assert.equal(PLATFORM_QIDS.Q10680, "ps2");
  assert.equal(PLATFORM_QIDS.Q10683, "ps3");
  assert.equal(PLATFORM_QIDS.Q170325, "psp");
  assert.equal(PLATFORM_QIDS.Q188808, "ps_vita");
  assert.deepEqual(item({ platformQids: ["Q10677", "Q10680", "Q10683", "Q170325", "Q188808"] }).platforms.sort(), ["ps1", "ps2", "ps3", "ps_vita", "psp"]);
});

test("original Xbox and Xbox 360 are not folded into Xbox One / Series", () => {
  assert.equal(PLATFORM_QIDS.Q132020, "xbox");
  assert.equal(PLATFORM_QIDS.Q48263, "xbox_360");
  assert.deepEqual(item({ platformQids: ["Q132020", "Q48263", "Q13361286", "Q98973368"] }).platforms.sort(), ["xbox", "xbox_360", "xbox_one", "xbox_series"]);
});

test("Nintendo historical platforms: consoles and handhelds, Famicom names resolve to the NES, Super Famicom to the SNES", () => {
  const expected = { Q172742: "nes", Q183259: "snes", Q184839: "n64", Q182172: "gamecube", Q8079: "wii", Q56942: "wii_u", Q186437: "game_boy", Q203992: "game_boy_color", Q188642: "game_boy_advance", Q170323: "nintendo_ds", Q637178: "nintendo_dsi", Q203597: "nintendo_3ds" };
  for (const [qid, key] of Object.entries(expected)) assert.equal(PLATFORM_QIDS[qid], key, qid);
  assert.equal(PLATFORM_QIDS.Q135321, "nes", "the Famicom Disk System is a Famicom add-on");
  assert.equal(PLATFORM_QIDS.Q491640, "nes", "Family Computer");
  assert.equal(PLATFORM_QIDS.Q17679679, "nintendo_3ds", "New Nintendo 3DS is the same platform family");
  assert.equal(platformKeyForLabel("Super Famicom"), "snes");
  assert.equal(platformKeyForLabel("Famicom"), "nes");
});

test("Sega historical platforms: Genesis / Mega Drive is ONE platform, Saturn and Dreamcast and Game Gear are their own", () => {
  const expected = { Q209868: "master_system", Q10676: "genesis", Q1047516: "sega_cd", Q1063978: "sega_32x", Q200912: "saturn", Q184198: "dreamcast", Q751719: "game_gear" };
  for (const [qid, key] of Object.entries(expected)) assert.equal(PLATFORM_QIDS[qid], key, qid);
  assert.equal(platformKeyForLabel("Sega Genesis"), "genesis");
  assert.equal(platformKeyForLabel("Mega Drive"), "genesis");
  assert.equal(platformKeyForLabel("Sega Mega-CD"), "sega_cd");
  assert.equal(byKey.get("genesis").name, "Sega Genesis / Mega Drive");
  assert.equal(item({ platformQids: ["Q184198"] }).platforms[0], "dreamcast");
});

test("platform aliases resolve to ONE normalized platform: PlayStation / PS1 / PSX, duplicate Wikidata items, regional names; no alias is claimed by two platforms", () => {
  for (const label of ["PlayStation", "PS1", "PSX", "PS one", "Sony PlayStation", "playstation 1"]) assert.equal(platformKeyForLabel(label), "ps1", label);
  assert.equal(platformKeyForLabel("PlayStation 2"), "ps2");
  assert.equal(PLATFORM_QIDS.Q10680, PLATFORM_QIDS.Q137982318, "a duplicate Wikidata item for the PS2 is the same platform");
  assert.equal(PLATFORM_QIDS.Q19610114, PLATFORM_QIDS.Q123392577, "and for the Switch");
  assert.equal(platformKeyForLabel("MS-DOS"), "dos");
  assert.equal(platformKeyForLabel("something nobody maps"), null);
  const claims = new Map();
  for (const platform of PLATFORMS) for (const label of [platform.name, ...platform.aliases]) {
    const folded = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    assert.ok(!claims.has(folded) || claims.get(folded) === platform.key, `"${label}" is claimed by ${claims.get(folded)} and ${platform.key}`);
    claims.set(folded, platform.key);
  }
});

test("generic or non-platform Wikidata values are deliberately NOT mapped (no noise platforms)", () => {
  for (const qid of ["Q177234", "Q174666", "Q667808", "Q203315", "Q355", "Q1121542", "Q17517"]) assert.equal(PLATFORM_QIDS[qid], undefined, qid);
  for (const platform of PLATFORMS) assert.doesNotMatch(platform.name, /cross-platform|mainframe|virtual machine|processor|facebook/i);
});

test("multiple platforms attach to ONE game: every legitimately mapped platform is offered, an unmapped value is ignored, and a store adds its PC context", () => {
  const game = item({ platformQids: ["Q10677", "Q184198", "Q1406", "Q177234", "Q174666"], identifiers: [{ property: "P1733", value: "1234" }] });
  assert.deepEqual(game.platforms.sort(), ["dreamcast", "pc", "ps1", "steam"]);
  assert.equal(game.ref, "Q1", "one canonical game, not one per platform");
  assert.equal(item({ platformQids: ["Q337535"] }).platforms.sort().join(), "pc,steam", "Steam listed as a platform value carries its PC context");
});

// ------------------------------------------------------------------------------------------------ release years
test("canonical release year: taken from the source date at year precision or better; the date keeps only what the precision supports", () => {
  assert.deepEqual(parseRelease("1996-09-09T00:00:00Z", 11), { year: 1996, date: "1996-09-09", precision: 11 });
  assert.deepEqual(parseRelease("1996-09-09T00:00:00Z", 10), { year: 1996, date: "1996-09-01", precision: 10 }, "a month-precision date has no day");
  assert.deepEqual(parseRelease("1996-09-09T00:00:00Z", 9), { year: 1996, date: "1996-01-01", precision: 9 }, "a year-precision date has no month or day");
  const game = item({ platformQids: ["Q10677"], releases: [rel("1996-09-09", 11)] });
  assert.deepEqual([game.release_year, game.release_date, game.release_date_precision], [1996, "1996-09-09", 11]);
});

test("release year is nullable: no date, a decade / century precision, an implausible year, a BCE or malformed value all leave it NULL (never invented, never inferred from a title)", () => {
  assert.equal(item({ platformQids: ["Q1406"] }).release_year, null);
  for (const bad of [rel("1990-01-01", 8), rel("1990-01-01", 7), rel("1990-01-01", 0), rel("1990-01-01", NaN), rel("1949-12-31", 11), rel("2101-01-01", 9), { date: "-0044-03-15T00:00:00Z", precision: 11 }, { date: "not a date", precision: 11 }, { date: undefined, precision: 11 }, null, { date: "1990-13-45T00:00:00Z", precision: 11 }]) {
    assert.equal(item({ platformQids: ["Q1406"], releases: [bad] }).release_year, null, JSON.stringify(bad));
  }
  const titled = buildCatalogItem({ ...base, label: "Halo 2 (2004 remaster) 1998", platformQids: ["Q1406"] });
  assert.equal(titled.release_year, null, "a year written in a title is never used");
  assert.ok(MIN_RELEASE_YEAR === 1950 && MAX_RELEASE_YEAR === 2100);
});

test("dates the source claims to know precisely must be real calendar dates; a year-precision value ignores the month/day it carries", () => {
  assert.equal(parseRelease("1996-13-01T00:00:00Z", 10), null, "month 13 at month precision");
  assert.equal(parseRelease("1996-00-05T00:00:00Z", 10), null, "month 00 at month precision");
  assert.equal(parseRelease("1990-02-31T00:00:00Z", 11), null, "February 31st is not a date");
  assert.equal(parseRelease("1990-04-31T00:00:00Z", 11), null, "April 31st is not a date");
  assert.equal(parseRelease("1990-06-00T00:00:00Z", 11), null, "day 00 at day precision");
  assert.deepEqual(parseRelease("1992-02-29T00:00:00Z", 11), { year: 1992, date: "1992-02-29", precision: 11 }, "a real leap day is fine");
  assert.equal(parseRelease("1990-02-29T00:00:00Z", 11), null, "1990 was not a leap year");
  assert.deepEqual(parseRelease("1996-00-00T00:00:00Z", 9), { year: 1996, date: "1996-01-01", precision: 9 }, "Wikidata's year-precision form");
  assert.deepEqual(parseRelease("1996-12-99T00:00:00Z", 9), { year: 1996, date: "1996-01-01", precision: 9 });
});
test("multiple release dates: the EARLIEST wins as the canonical year and a later port never replaces it", () => {
  const game = item({ platformQids: ["Q10677", "Q1406", "Q184198"], releases: [rel("1999-11-27", 11, "Q184198"), rel("1998-03-01", 10, "Q1406"), rel("1996-09-09", 11, "Q10677")] });
  assert.equal(game.release_year, 1996);
  assert.equal(game.release_date, "1996-09-09");
  const reversed = item({ platformQids: ["Q10677", "Q1406", "Q184198"], releases: [rel("1996-09-09", 11, "Q10677"), rel("1998-03-01", 10, "Q1406"), rel("1999-11-27", 11, "Q184198")] });
  assert.deepEqual([reversed.release_year, reversed.release_date], [game.release_year, game.release_date], "source order does not matter");
  const undated = item({ platformQids: ["Q1406"], releases: [rel("2004-01-01", 9), rel("2001-05-05", 11), { date: "1870-01-01T00:00:00Z", precision: 9 }] });
  assert.equal(undated.release_year, 2001, "an implausible early value is ignored, not treated as the earliest");
});

test("platform-specific release years are kept where the source ties a date to that platform, earliest per platform, and never fabricated", () => {
  const game = item({ platformQids: ["Q10677", "Q1406", "Q184198", "Q10683"], releases: [rel("1996-09-09", 11, "Q10677"), rel("1998-03-01", 10, "Q1406"), rel("1999-11-27", 11, "Q184198"), rel("2001-01-01", 9, "Q1406"), rel("1997-05-05", 11)] });
  const years = Object.fromEntries(game.platform_releases.map(entry => [entry.platform, entry.year]));
  assert.deepEqual(years, { ps1: 1996, pc: 1998, dreamcast: 1999 }, "the earlier PC date wins; PS3 has no dated release so it has no year");
  assert.equal(game.release_year, 1996, "and the canonical year is the earliest overall");
  assert.ok(game.platforms.includes("ps3") && !("ps3" in years));
  assert.ok(game.platform_releases.every(entry => entry.year >= game.release_year), "no platform release is earlier than the game's first release");
  // a date with no platform association is a canonical year only
  const general = item({ platformQids: ["Q1406", "Q10677"], releases: [rel("2010-06-01", 10)] });
  assert.deepEqual([general.release_year, general.platform_releases], [2010, []]);
});

test("a platform named ONLY by a dated release is still offered (the source states the game was released there), and an unmapped release platform is ignored", () => {
  const game = item({ platformQids: [], releases: [rel("1994-12-03", 11, "Q10677"), rel("1995-01-01", 9, "Q177234")] });
  assert.deepEqual(game.platforms, ["ps1"]);
  assert.deepEqual(game.platform_releases.map(entry => entry.platform), ["ps1"]);
  assert.equal(game.release_year, 1994);
});

test("old and new catalog games go through the SAME rules: the transform is a pure function of the source facts (repeat-safe, order independent)", () => {
  const input = { ...base, platformQids: ["Q1406", "Q10677"], identifiers: [{ property: "P1733", value: "55" }, { property: "P1733", value: "55" }], aliases: ["Alias One", "alias one", "Other Alias"], releases: [rel("2001-01-01", 9, "Q1406"), rel("1999-09-09", 11, "Q10677")] };
  const first = buildCatalogItem(input);
  assert.deepEqual(buildCatalogItem(structuredClone(input)), first, "running it again gives the identical item");
  assert.deepEqual(buildCatalogItem({ ...input, releases: [...input.releases].reverse() }), first);
  assert.equal(first.ids.length, 1, "a duplicate provider id collapses");
  assert.equal(first.aliases.length, 2, "a duplicate alias collapses");
});

// ------------------------------------------------------------------------------------------------ the expansion migration
test("the expansion migration is additive: no table, column, row or accepted platform is removed or renamed, and no key changes", () => {
  assert.doesNotMatch(sql, /\bdrop\s+(table|column|schema|policy|index|type)\b/i);
  assert.doesNotMatch(sql, /\b(delete\s+from|truncate)\b/i);
  const drops = [...sql.matchAll(/\bdrop\s+(function|constraint)\s+(?:if exists\s+)?([\w.]+)/gi)].map(match => `${match[1]} ${match[2]}`);
  assert.deepEqual(drops, ["constraint game_platforms_family_check", "function public.search_game_catalog", "function private.search_game_catalog_impl"], "only the family CHECK is widened and the search functions are recreated with one more column");
  assert.doesNotMatch(sql, /\b(update|insert\s+into)\s+public\.(entity_game_platforms|discovered_games|known_game_sources|game_profiles|gaming_connections)\b/i, "no user, discovery or recognition row is touched");
  assert.doesNotMatch(sql, /alter\s+table\s+public\.(entity_game_platforms|discovered_games|game_profiles|game_catalog_aliases|game_catalog_provider_ids)/i, "no other accepted table is altered");
  assert.doesNotMatch(sql, /game_key\s+(text\s+)?(primary|generated)|alter\s+column\s+game_key/i, "game_key is untouched");
});

test("the seed is exactly the platform map (one source of truth) and only ever ADDS platforms: an accepted platform keeps its name, family and parent", () => {
  const seed = [...sql.matchAll(/^\s*\('([a-z0-9_]+)', '((?:[^']|'')*)', '([A-Z]+)', ((?:null|'[a-z0-9_]+')), ((?:null|'[a-z0-9_]+')), (\d+)\)/gm)];
  assert.equal(seed.length, PLATFORMS.length);
  for (const [, key, name, family, , , sort] of seed) {
    const platform = byKey.get(key);
    assert.ok(platform, `${key} is in the map`);
    assert.equal(name.replace(/''/g, "'"), platform.name, key);
    assert.equal(family, platform.family, key);
    assert.equal(Number(sort), platform.sort, key);
  }
  assert.deepEqual(seed.map(match => match[1]).sort(), keys.slice().sort());
  assert.match(sql, /on conflict \(platform_key\) do update set sort_order = excluded\.sort_order/, "an existing platform changes ONLY its position in the list");
  assert.doesNotMatch(sql, /do update set[^;]*(display_name|family|parent_platform_key|provider_key|is_active)/i);
  assert.match(sql, /\('steam', 'Steam', 'PC', 'pc', 'steam', 111\)/, "Steam is still a store under PC, discovered through the Steam connection");
  assert.match(sql, /\('epic_games', 'Epic Games Store', 'PC', 'pc', null, 112\)/);
  for (const family of ["SEGA", "ATARI", "NEC", "SNK", "OTHER"]) assert.match(sql, new RegExp(`'${family}'`));
});

test("release year and date are nullable columns on the canonical game and on the game <-> platform link, kept consistent by table CHECKs (game_key is NOT a year)", () => {
  for (const table of ["game_catalog", "game_catalog_platforms"]) {
    const block = new RegExp(`alter table public\\.${table}\\s+add column[\\s\\S]*?\\);`).exec(sql)?.[0] ?? "";
    assert.ok(block.length > 100, `${table} alter block found`);
    assert.match(block, /add column release_year smallint check \(release_year between 1950 and 2100\)/, table);
    assert.match(block, /add column release_date date,/, table);
    assert.match(block, /add column release_date_precision smallint check \(release_date_precision in \(9, 10, 11\)\)/, table);
    assert.doesNotMatch(block, /add column[^,]*\bnot null\b/i, `${table}: all three columns are nullable`);
    assert.match(block, /release_year = extract\(year from release_date\)/, table);
  }
  assert.doesNotMatch(sql, /\b(new_key|base_key)\s*:=[^;]*release_(year|date)/i, "a game key is never built from a release year");
});

test("search: same semantics (3-character floor, 12 rows, normalization, ranking, wildcards) plus the canonical release year, granted to authenticated only", () => {
  const search = sql.slice(sql.indexOf("create function private.search_game_catalog_impl("), sql.indexOf("create function public.search_game_catalog("));
  assert.match(search, /returns table \(game_key text, display_name text, matched_alias text, release_year integer\)/);
  assert.match(search, /least\(greatest\(coalesce\(candidate_limit, 10\), 1\), 12\)/);
  assert.match(search, /char_length\(compact\) < 3 then return/);
  assert.match(search, /char_length\(candidate_query\) > 80 then return/);
  assert.match(search, /private\.game_search_normalize\(candidate_query\)/);
  assert.match(search, /c\.search_key like '%' \|\| compact \|\| '%'/);
  assert.match(search, /order by b\.tier, b\.pop desc, b\.hit_name, b\.hit_key/, "ranking is unchanged");
  assert.match(sql, /grant execute on function private\.search_game_catalog_impl\(text, integer\), public\.search_game_catalog\(text, integer\) to authenticated;/);
  assert.doesNotMatch(sql, /\bto (anon|public)\b/i);
  assert.match(sql, /'release_year', cp\.release_year/, "the platform picture of a game also carries each platform's own year");
});

test("the importer stays merge-first, idempotent and additive, and applies the earliest-wins release rules", () => {
  const body = sql.slice(sql.indexOf("create or replace function private.import_game_catalog_batch"));
  assert.match(body, /select cp\.game_key into found_key from public\.game_catalog_provider_ids cp where cp\.provider = lower\(src\) and cp\.external_id = ref/);
  assert.match(body, /for ident in select value from jsonb_array_elements\(it->'ids'\) loop/);
  assert.match(body, /where c\.game_key = found_key and \(c\.release_date is null or rel_date < c\.release_date\)/, "canonical: only an EARLIER date replaces, a missing one never overwrites");
  assert.match(body, /where l\.release_date is null or excluded\.release_date < l\.release_date/, "per platform: earliest wins");
  assert.match(body, /extract\(year from rel_date\) not between 1950 and 2100/, "implausible dates are ignored");
  assert.match(body, /rel_prec not in \(9, 10, 11\)/);
  assert.match(body, /from \(select l\.release_date as d, l\.release_date_precision as prec from public\.game_catalog_platforms l\s+where l\.game_key = found_key and l\.release_date is not null order by l\.release_date/, "the canonical date is lowered to the earliest platform date, so it can never be later than one");
  assert.equal([...body.matchAll(/on conflict[^;]*(do nothing|do update)/gi)].length >= 5, true, "every dependent write is repeat-safe");
  assert.doesNotMatch(body, /\bdelete\s+from\b|\btruncate\b|\bdrop\b/i, "an import never removes anything");
  assert.doesNotMatch(body, /update public\.game_catalog c set (display_name|is_active|normalized_name|search_key|game_key)/, "an import never renames or deactivates a game or changes its key");
  assert.doesNotMatch(body, /release_date = null|release_year = null/, "a NULL never erases a known date");
  assert.doesNotMatch(sql, /grant execute[^;]*import_game_catalog_batch/i, "the importer is still granted to no role");
});

test("Game Profiles, discovery, manual declarations and the public boundary are not touched by the expansion", () => {
  assert.doesNotMatch(sql, /game_profiles|get_public_identity|public_sections|gaming_connections/i);
  assert.doesNotMatch(sql, /\b(insert\s+into|update|delete\s+from)\s+public\.(entity_game_platforms|discovered_games|game_profiles|gaming_connections)\b/i, "user, discovery and profile tables are never written");
  assert.match(sql, /insert into public\.game_platforms/);
  for (const path of walk(join(root, "dist/public"))) assert.doesNotMatch(readFileSync(path, "utf8"), /release_year|game_catalog|entity_game_platforms/, path);
});

test("the key-generation fix migration redefines ONLY the importer (same signature and behavior), and a title without plain Latin letters still gets a valid, deterministic game_key", () => {
  const fix = read("supabase/migrations/20260922010000_game_catalog_import_key_fix.sql");
  const code = fix.replace(/--.*$/gm, "");
  assert.deepEqual([...code.matchAll(/create (?:or replace )?function ([\w.]+)\(([^)]*)\)/gi)].map(match => `${match[1]}(${match[2]})`), ["private.import_game_catalog_batch(candidate_items jsonb)"]);
  assert.doesNotMatch(code, /\b(create\s+table|alter\s+table|drop\s+|grant\s|revoke\s|delete\s+from|truncate)\b/i, "no table, privilege or row is touched");
  assert.match(code, /if base_key = '' then base_key := 'g_' \|\| left\(regexp_replace\(lower\(ref\), '\[\^a-z0-9\]', '', 'g'\), 40\); end if;/, "a title with no Latin letters/digits gets a key from its source id");
  assert.match(code, /if char_length\(base_key\) < 3 then base_key := 'g_' \|\| base_key; end if;/, "a one-letter slug is prefixed to reach the accepted key shape");
  assert.doesNotMatch(code, /base_key = '' then skipped/, "such a game is no longer silently skipped");
  const previous = sql.slice(sql.indexOf("create or replace function private.import_game_catalog_batch"));
  const strip = text => text.replace(/\s+/g, " ").replace(/-- [^\n]*/g, "");
  for (const rule of ["where c.game_key = found_key and (c.release_date is null or rel_date < c.release_date)", "where l.release_date is null or excluded.release_date < l.release_date", "on conflict (provider, external_id) do nothing", "select cp.game_key into found_key from public.game_catalog_provider_ids cp where cp.provider = lower(src) and cp.external_id = ref"]) {
    assert.ok(strip(code).includes(rule) && strip(previous).includes(rule), `both definitions keep: ${rule}`);
  }
  // the normalization floor is unchanged: a title with fewer than 2 normalized characters (e.g. "N++") is still not importable
  assert.match(code, /char_length\(norm\) < 2 or char_length\(norm\) > 160/);
});
// ------------------------------------------------------------------------------------------------ export pipeline: resumable, respectful, one source
test("the Wikidata export is resumable and respectful: a cached batch is never asked again, failures back off, requests are sequential, one documented source only", () => {
  const exporter = read("scripts/catalog/wikidata-export.mjs");
  const code = exporter.replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /if \(existsSync\(file\)\) continue;/, "a completed batch is skipped on resume");
  assert.match(code, /writeFileSync\(file, JSON\.stringify\(part\)\)/, "progress is persisted per batch");
  assert.match(code, /--no-fetch/);
  assert.match(code, /const MAX_ATTEMPTS = 30;/);
  assert.match(code, /Math\.min\(15 \* attempt, 180\)/);
  assert.match(code, /retry-after/i);
  assert.match(code, /response\.status === 429 \|\| response\.status >= 500/);
  assert.doesNotMatch(code, /Promise\.all|Promise\.allSettled/, "strictly sequential");
  assert.doesNotMatch(code, /apikey|api[_-]?key|Authorization|secret|token|cookie|puppeteer|cheerio|jsdom/i);
  assert.equal([...new Set([...code.matchAll(/https?:\/\/[^\s"'`)]+/g)].map(match => new URL(match[0]).host))].filter(host => !/jeddawe11-eng\.github\.io/.test(host)).sort().join(","), "query.wikidata.org,www.wikidata.org");
  assert.doesNotMatch(exporter, /igdb\.com\/v4|api\.twitch|rawg\.io|giantbomb|mobygames|ign\.com|tracker\.gg|store\.steampowered\.com\/api/i, "no other catalog provider is contacted");
  assert.match(code, /const itemId = value => \(\/\^Q\[0-9\]\+\$\/\.test\(value\) \? value : null\);/, "an anonymous 'unknown value' node is never treated as a platform");
});

// ------------------------------------------------------------------------------------------------ search result rendering + manual add with historical platforms
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
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const P = (platform_key, display_name, family, release_year = null) => ({ platform_key, display_name, family, parent_platform_key: null, release_year });

function panel({ rows, state, established = [] }) {
  const timers = new Map();
  const calls = { save: [], search: [] };
  const api = {
    searchGames: async query => { calls.search.push(query); return rows; },
    getPlatformState: async () => state,
    saveGame: async (key, platforms) => { calls.save.push({ key, platforms }); return "SAVED"; },
    removeGame: async () => 1,
  };
  const p = createAddGamePanel({ element: fake, api, isInLibrary: () => false, onDone: () => {}, schedule: (fn) => { const id = timers.size + 1; timers.set(id, fn); return id; }, cancel: id => timers.delete(id) });
  const input = byClass(p.root, "game-add-input")[0];
  return { p, calls, input, type: async text => { input.value = text; input.dispatch("input"); for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } await tick(); } };
}

test("search results show the canonical release year next to the title, compact and secondary: 'Crash Bandicoot (1996)'", async () => {
  const t = panel({ rows: [{ game_key: "crash_bandicoot", display_name: "Crash Bandicoot", matched_alias: null, release_year: 1996 }, { game_key: "another_game", display_name: "Another Game", matched_alias: null, release_year: 2021 }] });
  t.p.openSearch();
  await t.type("cra");
  const results = byClass(t.p.root, "game-result");
  assert.equal(textOf(results[0]), "Crash Bandicoot (1996)");
  assert.equal(textOf(results[1]), "Another Game (2021)");
  assert.equal(byClass(results[0], "game-result-year").length, 1, "the year is its own secondary element (not part of the title)");
  assert.equal(textOf(byClass(results[0], "game-result-name")[0]), "Crash Bandicoot");
});

test("a game with no release year shows just its title: never 'Unknown', 'N/A', '0' or empty parentheses", async () => {
  const rows = [{ game_key: "no_year", display_name: "Game Name", matched_alias: null, release_year: null }, { game_key: "missing_year", display_name: "Second Game", matched_alias: null }, { game_key: "zero_year", display_name: "Third Game", matched_alias: null, release_year: 0 }, { game_key: "text_year", display_name: "Fourth Game", matched_alias: null, release_year: "1996" }, { game_key: "old_year", display_name: "Fifth Game", matched_alias: null, release_year: 1800 }];
  const t = panel({ rows });
  t.p.openSearch();
  await t.type("gam");
  const texts = byClass(t.p.root, "game-result").map(textOf);
  assert.deepEqual(texts, ["Game Name", "Second Game", "Third Game", "Fourth Game", "Fifth Game"]);
  for (const text of texts) assert.doesNotMatch(text, /unknown|n\/a|\(\s*\)|\(0\)|null|undefined|NaN/i);
  assert.deepEqual(normalizeSearchResults(rows).map(row => row.year), [null, null, null, null, null]);
  assert.equal(normalizeSearchResults([{ game_key: "ok_game", display_name: "Ok", release_year: 2100 }, { game_key: "old_game", display_name: "Old", release_year: 1950 }]).map(row => row.year).join(), "2100,1950");
});

test("alias search still reports the alias, and the year sits with the title (existing search behavior is preserved)", async () => {
  const t = panel({ rows: [{ game_key: "qzxplore_saga", display_name: "Qzxplore Saga", matched_alias: "Zorkling Chronicles", release_year: 2011 }] });
  t.p.openSearch();
  await t.type("zork");
  const text = textOf(byClass(t.p.root, "game-result")[0]);
  assert.equal(text, "Qzxplore Saga (2011) Also known as Zorkling Chronicles");
  assert.deepEqual(t.calls.search, ["zork"]);
});

test("manual add with historical platforms: ONLY the platforms known for THAT game are offered, single and multi-platform selection save in the catalog's order", async () => {
  const crash = { game_key: "crash_bandicoot", display_name: "Crash Bandicoot", supported: [P("pc", "PC", "PC", 1998), P("ps1", "PlayStation (PS1)", "PLAYSTATION", 1996), P("dreamcast", "Sega Dreamcast", "SEGA", 1999)], established: [], manual: [] };
  const only = { game_key: "lone_game", display_name: "Lone Game", supported: [P("ps2", "PlayStation 2", "PLAYSTATION")], established: [], manual: [] };
  const t = panel({ rows: [{ game_key: "crash_bandicoot", display_name: "Crash Bandicoot", release_year: 1996 }], state: crash });
  t.p.openSearch();
  await t.type("cra");
  byClass(t.p.root, "game-result")[0].click();
  await tick();
  assert.deepEqual(byClass(t.p.root, "game-platform-option").map(textOf), ["PC", "PlayStation (PS1)", "Sega Dreamcast"], "not every GamID platform, only the ones this game has");
  const boxes = find(t.p.root, n => n.tag === "input" && n.type === "checkbox");
  for (const box of [boxes[2], boxes[1]]) { box.checked = true; box.dispatch("change"); }
  byClass(t.p.root, "game-add-save")[0].click();
  await tick();
  assert.deepEqual(t.calls.save, [{ key: "crash_bandicoot", platforms: ["ps1", "dreamcast"] }]);
  const single = panel({ rows: [{ game_key: "lone_game", display_name: "Lone Game", release_year: null }], state: only });
  single.p.openSearch();
  await single.type("lon");
  byClass(single.p.root, "game-result")[0].click();
  await tick();
  assert.deepEqual(byClass(single.p.root, "game-platform-option").map(textOf), ["PlayStation 2"]);
  find(single.p.root, n => n.tag === "input" && n.type === "checkbox")[0].dispatch("change");
});

test("selecting historical platforms keeps the accepted rules: a provider-established platform stays locked, manual and discovered rows still merge into ONE row", () => {
  const state = normalizePlatformState({ game_key: "marvel_rivals", display_name: "Marvel Rivals", supported: [P("pc", "PC", "PC"), P("steam", "Steam", "PC"), P("ps1", "PlayStation (PS1)", "PLAYSTATION")], established: [{ platform_key: "steam", display_name: "Steam" }], manual: [] });
  assert.deepEqual(selectablePlatforms(state).map(p => p.key), ["pc", "ps1"]);
  assert.equal(toggleSelection(initialSelection(state), "steam", state).size, 0);
  assert.deepEqual(selectionKeys(new Set(["ps1", "pc"]), state), ["pc", "ps1"]);
  const rows = buildLibraryRows([{ external_game_id: "1", game_name: "Marvel Rivals", recognized_game_key: "marvel_rivals" }], normalizeManualGames([{ game_key: "marvel_rivals", display_name: "Marvel Rivals", platforms: [{ platform_key: "ps1", display_name: "PlayStation (PS1)" }] }]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "discovered");
  assert.equal(rows[0].manual.trust, "MANUAL");
});

test("the release year is rendered as text only and stays compact on a phone: it wraps with the title, is muted, and adds no fixed width or hover-only behavior", () => {
  const css = read("dist/account/account.css");
  const block = css.slice(css.indexOf("/* My Games: the ONE provider-neutral library"), css.indexOf("/* Steam Connection Foundation:"));
  assert.match(block, /\.game-result-year\{[^}]*color:var\(--muted\)[^}]*font-size:\.74rem/);
  assert.doesNotMatch(block.slice(block.indexOf(".game-result-year")), /^[^\n]*\.game-result-year\{[^}]*(nowrap|ellipsis|width:)/);
  assert.match(block, /\.game-result\{[^}]*flex-wrap:wrap[^}]*min-height:2\.75rem/, "the row still wraps and stays a 44 px target");
  assert.match(block, /\.game-result-name\{[^}]*overflow-wrap:anywhere/, "a very long title still wraps inside the row (no horizontal overflow)");
  const source = read("dist/account/manual-games.js");
  assert.match(source, /if \(game\.year !== null && game\.year !== undefined\) button\.append\(element\("span", "game-result-year", `\(\$\{game\.year\}\)`\)\);/);
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ""), /innerHTML|insertAdjacentHTML/);
});
