// Canonical Game Catalog + manual games: migration contract, security shape, the catalog import transform, and scope guards (no fake data, no provider integration).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IDENTIFIER_PROPERTIES, MAX_ALIASES, PLATFORM_QIDS, batchSql, buildCatalogItem, orderForImport, pickLabel,
} from "../scripts/catalog/wikidata-catalog.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(root, path), "utf8");
const migrationPath = "supabase/migrations/20260921210000_game_catalog_manual_games.sql";
const migration = read(migrationPath);
const sql = migration.replace(/--.*$/gm, "");
const walk = dir => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });

// ------------------------------------------------------------------------------------------------ migration shape
test("the migration is additive: new tables and functions, one redefinition of the discovered-games reader, and no change to any existing row or table", () => {
  assert.doesNotMatch(sql, /\bdrop\s+(table|function|column|policy|index|schema)\b/i);
  assert.doesNotMatch(sql, /\balter\s+table\b(?![^;]*enable row level security)/i);
  assert.doesNotMatch(sql, /\b(update|delete\s+from|truncate)\s+(only\s+)?(public|private)\.(?!entity_game_platforms|game_catalog)/i, "no statement rewrites or deletes an existing table's rows");
  const replaced = [...sql.matchAll(/create or replace function ([\w.]+)/gi)].map(match => match[1]);
  assert.deepEqual(replaced, ["private.get_my_discovered_games_impl"], "the only pre-existing function touched is the recognition reader, and only to add a fallback");
  assert.doesNotMatch(sql, /known_game_sources\s+(set|values)|insert\s+into\s+public\.known_game_sources|update\s+public\.known_game_sources|delete\s+from\s+public\.known_game_sources/i, "the accepted recognition map is only read");
  for (const table of ["game_platforms", "game_catalog", "game_catalog_aliases", "game_catalog_platforms", "game_catalog_provider_ids", "entity_game_platforms"]) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`), table);
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), `RLS on ${table}`);
  }
});

test("ONE canonical catalog: the canonical key is GamID's own normalized game_key (same shape as the recognition map and Game Profiles); providers are attributes, never the identity", () => {
  assert.match(sql, /game_key text primary key check \(game_key ~ '\^\[a-z\]\[a-z0-9_\]\{1,63\}\$'\)/);
  const recognition = read("supabase/migrations/20260920230000_steam_my_games.sql");
  assert.match(recognition, /game_key text not null check \(game_key ~ '\^\[a-z\]\[a-z0-9_\]\{1,63\}\$'\)/, "the same key shape the recognition map already used");
  assert.match(read("supabase/migrations/20260921200000_game_profiles.sql"), /game_key text not null check \(game_key ~ '\^\[a-z\]\[a-z0-9_\]\{1,63\}\$'\)/, "and the one Game Profiles already join on");
  const catalog = sql.slice(sql.indexOf("create table public.game_catalog ("), sql.indexOf("create table public.game_catalog_aliases"));
  assert.doesNotMatch(catalog, /steam|app_?id|xbox|playstation|title_?id|riot|epic|external/i, "no provider identifier is a column of the canonical game");
  const providerIds = sql.slice(sql.indexOf("create table public.game_catalog_provider_ids"), sql.indexOf("create index game_catalog_provider_ids_game_idx"));
  assert.match(providerIds, /provider text not null check/);
  assert.match(providerIds, /primary key \(provider, external_id\)/, "one identifier names exactly one game; many identifiers can name the same game");
  assert.match(providerIds, /game_key text not null references public\.game_catalog \(game_key\)/);
  for (const provider of ["steam", "igdb", "wikidata"]) assert.ok(read("scripts/catalog/wikidata-catalog.mjs").includes(provider) || provider === "wikidata");
});

test("platform model: normalized, provider-neutral, Steam and Epic are storefronts UNDER PC (not 'PC = Steam'), families are fixed, nothing else is assumed", () => {
  for (const key of ["pc", "steam", "epic_games", "ps4", "ps5", "xbox_one", "xbox_series", "switch", "switch2", "ios", "android"]) assert.match(sql, new RegExp(`\\('${key}',`), key);
  assert.match(sql, /\('steam', 'Steam', 'PC', 'pc', 'steam', 11\)/);
  assert.match(sql, /\('epic_games', 'Epic Games Store', 'PC', 'pc', null, 12\)/);
  assert.match(sql, /\('pc', 'PC', 'PC', null, null, 10\)/);
  assert.match(sql, /family text not null check \(family in \('PC', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'MOBILE'\)\)/);
  assert.match(sql, /provider_key text check/, "which connection provider's discovery can establish a platform is DATA, not code");
});

test("MANUAL is a table rule, not a UI habit: a declaration can only be MANUAL and only for a platform the catalog lists for that game", () => {
  const table = sql.slice(sql.indexOf("create table public.entity_game_platforms"), sql.indexOf("alter table public.game_platforms enable"));
  assert.match(table, /trust_status text not null default 'MANUAL' check \(trust_status = 'MANUAL'\)/);
  assert.doesNotMatch(table, /VERIFIED|CONNECTED|DISCOVERED/);
  assert.match(table, /foreign key \(game_key, platform_key\) references public\.game_catalog_platforms \(game_key, platform_key\)/);
  assert.match(table, /primary key \(entity_id, game_key, platform_key\)/, "one row per identity, game and platform: no duplicate declaration");
  assert.match(table, /entity_id uuid not null references public\.entities \(entity_id\) on delete cascade/);
});

// ------------------------------------------------------------------------------------------------ security
test("no client role can read or write any catalog or declaration table: table privileges are revoked, access is only through owner-scoped functions", () => {
  assert.match(sql, /revoke all on table public\.game_platforms, public\.game_catalog, public\.game_catalog_aliases, public\.game_catalog_platforms, public\.game_catalog_provider_ids, public\.entity_game_platforms\s+from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[^;]*\bon\s+(table\s+)?public\./i, "no table grant to anyone");
  assert.doesNotMatch(sql, /create policy[^;]*for (insert|update|delete|all)/i, "no write policy exists: the catalog is not client-writable and declarations are written only by the definer function");
});

test("functions: owner-facing ones go to authenticated only; the import is granted to NO role; wrappers use the established invoker + private-impl pattern", () => {
  const statements = sql.split(";").map(statement => statement.trim());
  const granted = statements.filter(statement => /^grant execute on function/i.test(statement));
  assert.equal(granted.length, 1);
  assert.match(granted[0], /to authenticated$/);
  assert.doesNotMatch(granted[0], /import_game_catalog_batch|provider_established_platforms|game_search_normalize/);
  assert.match(sql, /revoke all on function[\s\S]*private\.import_game_catalog_batch\(jsonb\)[\s\S]*from public, anon, authenticated, service_role;/);
  for (const name of ["search_game_catalog", "get_my_game_platform_state", "get_my_manual_games", "save_my_manual_game", "remove_my_manual_game"]) {
    assert.match(sql, new RegExp(`create function public\\.${name}\\([^)]*\\)[\\s\\S]*?security invoker[\\s\\S]*?select[^;]*private\\.${name}_impl`), name);
    assert.match(sql, new RegExp(`create function private\\.${name}_impl\\([^)]*\\)[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`), `${name} impl is a definer with a pinned search_path`);
  }
});

test("every write is owner-scoped: the caller's identity comes from auth.uid(), never from a parameter, and email verification is required", () => {
  for (const impl of ["save_my_manual_game_impl", "remove_my_manual_game_impl", "get_my_manual_games_impl", "get_my_game_platform_state_impl"]) {
    const body = sql.slice(sql.indexOf(`create function private.${impl}(`), sql.indexOf("$$;", sql.indexOf(`create function private.${impl}(`)));
    assert.match(body, /caller uuid := \(select auth\.uid\(\)\)/, impl);
    assert.match(body, /m\.user_id = caller and m\.role = 'OWNER' and e\.entity_type = 'SOLO'/, impl);
    assert.doesNotMatch(body.slice(0, body.indexOf("as $$")), /entity_id|user_id/, `${impl} takes no identity parameter`);
  }
  const save = sql.slice(sql.indexOf("create function private.save_my_manual_game_impl("), sql.indexOf("create function private.remove_my_manual_game_impl("));
  assert.match(save, /email_confirmed_at is not null/);
  assert.match(save, /raise exception using errcode = '42501', message = 'EMAIL_NOT_VERIFIED'/);
});

test("the backend validates identity itself: only a canonical game_key + catalog platform keys are accepted (a client-supplied name is never identity)", () => {
  const save = sql.slice(sql.indexOf("create function private.save_my_manual_game_impl("), sql.indexOf("create function private.remove_my_manual_game_impl("));
  assert.match(save, /\(candidate_game_key text, candidate_platform_keys text\[\]\)/, "the signature carries no display name");
  assert.match(save, /from public\.game_catalog c where c\.game_key = candidate_game_key and c\.is_active/);
  for (const code of ["INVALID_GAME", "NO_PLATFORMS", "INVALID_PLATFORM", "PLATFORM_ALREADY_DISCOVERED", "GAME_LIMIT_REACHED", "EMAIL_NOT_VERIFIED"]) assert.match(save, new RegExp(code), code);
  assert.match(save, /game_catalog_platforms cp join public\.game_platforms p/, "each platform must be one the catalog lists for this game");
  assert.match(save, />= 300/, "a per-identity ceiling");
  assert.match(save, /pg_advisory_xact_lock/, "concurrent saves for one identity are serialized");
});

test("manual functions can never touch provider discovery: discovered_games is only ever READ (to protect it), never written", () => {
  for (const impl of ["save_my_manual_game_impl", "remove_my_manual_game_impl", "get_my_manual_games_impl", "get_my_game_platform_state_impl", "search_game_catalog_impl"]) {
    const body = sql.slice(sql.indexOf(`create function private.${impl}(`), sql.indexOf("$$;", sql.indexOf(`create function private.${impl}(`)));
    assert.doesNotMatch(body, /(insert\s+into|update|delete\s+from|truncate)\s+public\.(discovered_games|game_discovery_state|gaming_connections|known_game_sources)/i, impl);
  }
  const remove = sql.slice(sql.indexOf("create function private.remove_my_manual_game_impl("), sql.indexOf("create function private.import_game_catalog_batch("));
  assert.match(remove, /delete from public\.entity_game_platforms x where x\.entity_id = owned_entity_id and x\.game_key = candidate_game_key/);
  assert.equal([...remove.matchAll(/delete\s+from/gi)].length, 1, "removal deletes manual declarations and nothing else");
  const helper = sql.slice(sql.indexOf("create function private.provider_established_platforms("), sql.indexOf("create function private.search_game_catalog_impl("));
  assert.match(helper, /from public\.discovered_games d/);
  assert.match(helper, /returns setof text/);
});

test("search is bounded and indexed on the server: 3-character floor, at most 12 rows, trigram indexes, no client-controlled pattern", () => {
  const search = sql.slice(sql.indexOf("create function private.search_game_catalog_impl("), sql.indexOf("create function private.get_my_game_platform_state_impl("));
  assert.match(search, /least\(greatest\(coalesce\(candidate_limit, 10\), 1\), 12\)/);
  assert.match(search, /char_length\(compact\) < 3 then return/);
  assert.match(search, /char_length\(candidate_query\) > 80 then return/);
  assert.match(search, /private\.game_search_normalize\(candidate_query\)/, "the pattern is built from the normalized text: user-typed % and _ can never act as wildcards");
  assert.match(search, /c\.search_key like '%' \|\| compact \|\| '%'/);
  assert.match(sql, /create index game_catalog_search_key_trgm on public\.game_catalog using gin \(search_key extensions\.gin_trgm_ops\)/);
  assert.match(sql, /create index game_catalog_aliases_search_key_trgm on public\.game_catalog_aliases using gin \(search_key extensions\.gin_trgm_ops\)/);
  assert.doesNotMatch(search, /similarity\(|levenshtein|soundex|metaphone|<->/, "no fuzzy matching: it cannot be made precise enough not to suggest the wrong game");
  assert.doesNotMatch(sql, /\bselect\s+\*\s+from\s+public\.game_catalog\s*;/i, "no function returns the whole catalog");
});

test("the import is idempotent and merge-first: it resolves a game through ANY provider identifier before minting a key, and only ever adds", () => {
  const body = sql.slice(sql.indexOf("create function private.import_game_catalog_batch("), sql.indexOf("create function public.search_game_catalog("));
  assert.match(body, /select cp\.game_key into found_key from public\.game_catalog_provider_ids cp where cp\.provider = lower\(src\) and cp\.external_id = ref/);
  assert.match(body, /for ident in select value from jsonb_array_elements\(it->'ids'\) loop/);
  assert.equal([...body.matchAll(/on conflict[^;]*do nothing/gi)].length >= 4, true, "every dependent insert is idempotent");
  assert.doesNotMatch(body, /\bdelete\s+from\b|\btruncate\b|\bdrop\b/i, "an import never removes anything");
  assert.doesNotMatch(body, /update public\.game_catalog c set (display_name|is_active|normalized_name|search_key)/, "an import never renames or deactivates a game");
  assert.match(body, /popularity = greatest\(c\.popularity, pop\)/);
});

test("recognition for discovered games gains a catalog fallback without changing the accepted behavior (the recognition map still wins, nothing else moves)", () => {
  const reader = sql.slice(sql.indexOf("create or replace function private.get_my_discovered_games_impl"), sql.indexOf("create function private.provider_established_platforms("));
  assert.match(reader, /coalesce\(k\.game_key, cp\.game_key\), coalesce\(k\.display_name, c\.display_name\)/);
  assert.match(reader, /left join public\.game_catalog_provider_ids cp on cp\.provider = d\.source_provider and cp\.external_id = d\.external_game_id/);
  assert.match(reader, /order by d\.playtime_minutes desc nulls last, lower\(coalesce\(d\.game_name, ''\)\), d\.external_game_id/, "same ordering as before");
  assert.match(reader, /if wanted_provider is null or wanted_provider <> 'steam' then raise exception using errcode = '22023', message = 'INVALID_PROVIDER'/);
  assert.match(reader, /where d\.entity_id = owned_entity_id and d\.source_provider = wanted_provider/);
});

test("Game Profiles and the public boundary are untouched: no profile is created, no public projection includes a catalog or platform fact", () => {
  assert.doesNotMatch(sql, /game_profiles|save_game_profile|get_public_identity|public_sections|private\.public_game_profiles|is_public/);
  for (const path of walk(join(root, "dist/public"))) assert.doesNotMatch(readFileSync(path, "utf8"), /game_catalog|entity_game_platforms|search_game_catalog|save_my_manual_game|manual-games|game-platforms/, path);
  assert.doesNotMatch(read("supabase/migrations/20260921200000_game_profiles.sql"), /game_catalog|entity_game_platforms/, "the accepted Game Profile migration was not edited");
});

// ------------------------------------------------------------------------------------------------ no fake data, no provider integration
test("NO fabricated catalog: the migration seeds only from the accepted recognition map (SELECT ... FROM known_game_sources), never VALUES rows of games", () => {
  assert.match(sql, /insert into public\.game_catalog \(game_key, display_name, normalized_name, search_key, popularity, catalog_source\)\s+select distinct on \(k\.game_key\)[\s\S]*?from public\.known_game_sources k/);
  assert.match(sql, /insert into public\.game_catalog_provider_ids \(provider, external_id, game_key\)\s+select k\.source_provider, k\.external_game_id, k\.game_key from public\.known_game_sources k/);
  const seeded = sql.slice(0, sql.indexOf("create function private.import_game_catalog_batch("));
  assert.doesNotMatch(seeded, /insert into public\.game_catalog(_aliases|_platforms|_provider_ids)?\s*\([^)]*\)\s*values/i, "no hard-coded game row is seeded (the importer function inserts what it is given, which is different)");
  assert.doesNotMatch(sql, /\b(marvel|rivals|dota|fortnite|minecraft|zelda|mario|halo|valorant|league of legends)\b/i, "no game is named in the migration: the catalog is data, not code");
  const clientAndPublic = walk(join(root, "dist")).filter(path => /\.(js|json|html|css)$/.test(path) && !/prototypes[\\/]|qrcode\.min\.js$/.test(path));
  for (const path of clientAndPublic) assert.doesNotMatch(readFileSync(path, "utf8"), /catalog\s*=\s*\[\s*\{|"game_key"\s*:\s*"[a-z_]+"\s*,\s*"display_name"/i, path);
  assert.ok(!existsSync(join(root, "dist/account/catalog.json")) && !existsSync(join(root, "dist/catalog.json")), "no game list is shipped to the browser");
});

test("the catalog import source is documented, keyless and polite: one public host, a descriptive User-Agent, sequential requests, no key, no scraping", () => {
  const exporter = read("scripts/catalog/wikidata-export.mjs");
  const code = exporter.replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /const ENDPOINT = "https:\/\/query\.wikidata\.org\/sparql"/);
  assert.equal([...new Set([...code.matchAll(/https?:\/\/[^\s"'`)]+/g)].map(match => new URL(match[0]).host))].filter(host => !/jeddawe11-eng\.github\.io/.test(host)).sort().join(","), "query.wikidata.org,www.wikidata.org", "the only external hosts are Wikidata's own public query service and Action API");
  assert.match(code, /"User-Agent": USER_AGENT/);
  assert.match(code, /GamID-catalog-import\/1\.0/);
  assert.match(code, /retry-after/i);
  assert.doesNotMatch(code, /Promise\.all|Promise\.allSettled|apikey|api[_-]?key|Authorization|secret|token|cookie|puppeteer|cheerio|jsdom|\.scrape|innerHTML/i, "sequential, keyless, no scraping tooling");
  assert.match(read("scripts/catalog/wikidata-catalog.mjs"), /CC0/);
  assert.doesNotMatch(migration + exporter, /tracker\.gg|rivalsmeta|marvelrivalsapi|op\.gg|store\.steampowered\.com\/api|steamspy|igdb\.com\/v4|api\.twitch|rawg\.io/i, "no scraped site, no private API and no other catalog provider is contacted");
});

test("no provider integration was started: no Xbox / PlayStation / Riot / Discord / Epic connection code, key, or endpoint in the catalog or manual-game files", () => {
  const files = ["dist/account/manual-games.js", "dist/account/game-platforms.js", "dist/account/game-search.js", "scripts/catalog/wikidata-catalog.mjs", "scripts/catalog/wikidata-export.mjs", "scripts/catalog/platform-map.mjs", "scripts/catalog/print-platform-seed.mjs", migrationPath, "supabase/migrations/20260922000000_game_catalog_platforms_release_years.sql", "supabase/migrations/20260922010000_game_catalog_import_key_fix.sql"];
  for (const path of files) assert.doesNotMatch(read(path), /xbox live|playstation network|psn\b|battle\.net|riot games api|x-api-key|oauth|openid|client_secret|service_role_key/i, path);
  const supabaseFunctions = walk(join(root, "supabase/functions")).map(path => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(supabaseFunctions, /game_catalog|entity_game_platforms|search_game_catalog|save_my_manual_game/, "no Edge Function was added or changed for the catalog: it is database-only");
  assert.doesNotMatch(read("dist/account/account.js") + read("dist/account/manual-games.js"), /marvelrivalsapi|tracker\.gg|game[-_ ]?id[-_ ]?wall/i);
});

test("the live database test rolls back always and uses only disposable users and invented Qzx games (no real game, no real user)", () => {
  const live = read("tests/integration/game-catalog-db.sql");
  assert.match(live, /raise exception 'TEST_RESULTS:%', res::text/);
  assert.match(live, /gen_random_uuid\(\)/);
  assert.match(live, /@example\.invalid/);
  assert.doesNotMatch(live.replace(/--.*$/gm, ""), /jeddawe11|gmail\.com|@black|'black'/i, "no real account is referenced by the executable statements");
  assert.ok(([...live.matchAll(/jsonb_build_object\('step'/g)].length) >= 60, "a broad live matrix");
});

// ------------------------------------------------------------------------------------------------ the import transform
test("Wikidata platforms map to GamID's normalized platform keys; a platform GamID does not model is ignored, never re-mapped", () => {
  // the nine originally accepted mappings are unchanged (the catalog expansion only ADDED platforms: tests/game-catalog-expansion.test.js)
  const accepted = { Q1406: "pc", Q5014725: "ps4", Q63184502: "ps5", Q13361286: "xbox_one", Q98973368: "xbox_series", Q19610114: "switch", Q122761124: "switch2", Q48493: "ios", Q94: "android" };
  for (const [qid, key] of Object.entries(accepted)) assert.equal(PLATFORM_QIDS[qid], key, qid);
  const item = buildCatalogItem({ qid: "Q1", label: "A Game", sitelinks: 5, platformQids: ["Q63184502", "Q98973368", "Q177234", "Q174666", "Q1406"], identifiers: [], aliases: [] });
  assert.deepEqual([...item.platforms].sort(), ["pc", "ps5", "xbox_series"], "a mainframe computer / a bare cross-platform marker are simply not offered");
  assert.equal(buildCatalogItem({ qid: "Q2", label: "Only On Nothing We Model", sitelinks: 3, platformQids: ["Q177234", "Q174666"], identifiers: [], aliases: [] }), null, "no platform GamID can name -> not offered (fail safe)");
});

test("a storefront identifier proves the store AND its PC context; a game with no store proof is not offered a store", () => {
  const steam = buildCatalogItem({ qid: "Q3", label: "Steam Only Game", sitelinks: 1, platformQids: [], identifiers: [{ property: "P1733", value: "12345" }], aliases: [] });
  assert.deepEqual([...steam.platforms].sort(), ["pc", "steam"]);
  assert.deepEqual(steam.ids, [{ provider: "steam", id: "12345" }]);
  const both = buildCatalogItem({ qid: "Q4", label: "Both Stores", sitelinks: 1, platformQids: ["Q1406"], identifiers: [{ property: "P1733", value: "1" }, { property: "P6278", value: "both-stores" }], aliases: [] });
  assert.deepEqual([...both.platforms].sort(), ["epic_games", "pc", "steam"]);
  const windowsOnly = buildCatalogItem({ qid: "Q5", label: "Windows Only", sitelinks: 1, platformQids: ["Q1406"], identifiers: [], aliases: [] });
  assert.deepEqual(windowsOnly.platforms, ["pc"], "Windows alone never implies Steam or Epic: PC is not a storefront");
  assert.equal(IDENTIFIER_PROPERTIES.P1733, "steam");
});

test("identifiers are validated: a Steam id must be a plain app id, duplicates collapse, junk is dropped", () => {
  const item = buildCatalogItem({ qid: "Q6", label: "Ids", sitelinks: 1, platformQids: ["Q1406"], identifiers: [
    { property: "P1733", value: "271590" }, { property: "P1733", value: "271590" }, { property: "P1733", value: "not-a-number" }, { property: "P1733", value: "12345678901" },
    { property: "P5794", value: "grand-theft-auto-v" }, { property: "P5794", value: "bad id with spaces" }, { property: "P9999", value: "unknown" }, { property: "P6278", value: "" }, null,
  ], aliases: [] });
  assert.deepEqual(item.ids, [{ provider: "steam", id: "271590" }, { provider: "igdb", id: "grand-theft-auto-v" }]);
});

test("titles: an unlabelled item (its bare Q-number), a blank or oversized title is not offered; aliases are deduplicated, bounded and never repeat the title", () => {
  const base = { sitelinks: 1, platformQids: ["Q1406"], identifiers: [], aliases: [] };
  for (const label of ["Q123456", "", "  ", "x", "y".repeat(121), null, undefined]) assert.equal(buildCatalogItem({ ...base, qid: "Q7", label }), null, String(label));
  assert.equal(buildCatalogItem({ ...base, qid: "not-a-qid", label: "Fine Title" }), null);
  const aliases = ["Same Title", "same   title", "GTA V", "gta v", "Grand Theft Auto 5", "ab", "x".repeat(121), ...Array.from({ length: 30 }, (_, i) => `Alias number ${i}`)];
  const item = buildCatalogItem({ ...base, qid: "Q8", label: "Same Title", aliases });
  assert.equal(item.aliases[0], "GTA V");
  assert.ok(!item.aliases.some(alias => alias.toLowerCase() === "same title"));
  assert.ok(!item.aliases.includes("ab"));
  assert.equal(item.aliases.length, MAX_ALIASES);
  assert.equal(buildCatalogItem({ ...base, qid: "Q9", label: "  Spaced    Out  " }).name, "Spaced Out");
});

test("the item is neutral catalog data only: popularity from the source, provenance WIKIDATA + its id, and NO trust, ownership, user or verification field", () => {
  const item = buildCatalogItem({ qid: "Q10", label: "Neutral", sitelinks: 42, platformQids: ["Q1406"], identifiers: [], aliases: [] });
  assert.deepEqual(Object.keys(item).sort(), ["aliases", "ids", "name", "platform_releases", "platforms", "popularity", "ref", "release_date", "release_date_precision", "release_year", "source"]);
  assert.deepEqual([item.release_year, item.release_date, item.release_date_precision, item.platform_releases], [null, null, null, []], "no date in the source -> no date (never invented)");
  assert.equal(item.source, "WIKIDATA");
  assert.equal(item.ref, "Q10");
  assert.equal(item.popularity, 42);
  assert.equal(buildCatalogItem({ qid: "Q11", label: "No Links", sitelinks: -3, platformQids: ["Q1406"] }).popularity, 0);
});

test("label choice prefers English, then the language-neutral label; import order puts the most notable game first so it gets the clean canonical key", () => {
  assert.equal(pickLabel([{ lang: "mul", value: "Neutral" }, { lang: "en", value: "English" }]), "English");
  assert.equal(pickLabel([{ lang: "mul", value: "Neutral" }]), "Neutral");
  assert.equal(pickLabel([{ lang: "de", value: "Deutsch" }]), null);
  assert.equal(pickLabel(undefined), null);
  const ordered = orderForImport([{ ref: "Q9", popularity: 1 }, { ref: "Q500", popularity: 50 }, { ref: "Q20", popularity: 50 }, { ref: "Q3", popularity: 90 }]);
  assert.deepEqual(ordered.map(item => item.ref), ["Q3", "Q20", "Q500", "Q9"]);
});

test("a batch becomes one importer call with a dollar-quoted JSON literal, and a payload that could break out of the quoting is refused", () => {
  const items = [{ source: "WIKIDATA", ref: "Q1", name: "It's a \"game\" $$ ", popularity: 1, platforms: ["pc"], aliases: [], ids: [] }];
  const text = batchSql(items);
  assert.match(text, /^select private\.import_game_catalog_batch\(\$gamid_catalog_json\$\[/);
  assert.match(text, /\]\$gamid_catalog_json\$::jsonb\);\n$/);
  assert.deepEqual(JSON.parse(text.slice(text.indexOf("$gamid_catalog_json$") + 20, text.lastIndexOf("$gamid_catalog_json$"))), items);
  assert.throws(() => batchSql([{ ...items[0], name: "evil $gamid_catalog_json$ break out" }]), /dollar-quote/);
});
