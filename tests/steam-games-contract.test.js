import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = path => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20260920230000_steam_my_games.sql");
const steamFoundation = read("supabase/migrations/20260920190000_steam_connection_foundation.sql");
const controller = read("dist/account/account.js");
const client = read("dist/account/supabase-client.js");
const css = read("dist/account/account.css");
const publicJs = read("dist/public/public.js");
const config = read("supabase/config.toml");
const module = read("supabase/functions/_shared/steam-games.js");
const glue = read("supabase/functions/steam-games-refresh/index.ts");

const stripComments = sql => sql.replace(/--[^\n]*/g, "");
const code = stripComments(migration);
const outsideFunctions = code.replace(/create function[\s\S]*?\n\$\$;/gi, "");

function fn(name) {
  const start = code.indexOf(`create function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const body = code.indexOf("as $$", start);
  assert.ok(body > start, `${name} has a body`);
  const end = code.indexOf("$$;", body + 5);
  assert.ok(end > body, `${name} terminates`);
  return code.slice(start, end + 3);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files); else files.push(full);
  }
  return files;
}

// ------------------------------------------------------------------------------------------------ migration: additive, private, provider-neutral

test("the migration is additive: it creates new objects only and never alters, updates, or deletes anything that exists", () => {
  assert.doesNotMatch(code, /\bdrop\s+(table|column|schema|function|policy|constraint)\b/i);
  assert.doesNotMatch(code, /\btruncate\b|\balter\s+table\s+public\.(gaming_connections|profiles|entities|league_profiles)/i);
  assert.doesNotMatch(code, /\bcreate or replace\b/i, "no existing function is redefined");
  assert.doesNotMatch(outsideFunctions, /\b(update|delete)\s+(from\s+)?public\./i);
  const inserts = [...outsideFunctions.matchAll(/\binsert\s+into\s+([a-z_.]+)/gi)].map(match => match[1]);
  assert.deepEqual(inserts, ["public.known_game_sources"], "the only seed is the recognition map");
  assert.deepEqual([...code.matchAll(/create table ([a-z_.]+)/g)].map(match => match[1]), ["public.known_game_sources", "public.discovered_games", "public.game_discovery_state", "private.game_discovery_attempts"]);
});

test("the PUBLIC boundary and the visibility/section architecture are untouched: no public function, no section, no anon grant", () => {
  assert.doesNotMatch(code, /get_public_identity|public_sections|public_section_catalog|set_my_section_visibility|get_my_section_visibility|set_my_identity_visibility/);
  assert.doesNotMatch(code, /\bto\s+anon\b|\bto\s+public\b|grant\s+(select|insert|update|delete|all)\s+on/i);
  assert.doesNotMatch(code, /is_public/);
  // (Public My Games has its own public function now; the page still never reads the discovery tables or the owner's private discovery functions.)
  assert.doesNotMatch(read("dist/public/index.html") + publicJs, /discovered_games|get_my_discovered_games|game_discovery|steam-games/i, "the public page never reads discovered games");
});

test("RLS is on for every new table, no client role has any table privilege, and owner policies are read-only", () => {
  for (const table of ["public.known_game_sources", "public.discovered_games", "public.game_discovery_state", "private.game_discovery_attempts"]) {
    assert.match(code, new RegExp(`alter table ${table.replace(".", "\\.")} enable row level security`), table);
  }
  assert.match(code, /revoke all on table public\.known_game_sources, public\.discovered_games, public\.game_discovery_state, private\.game_discovery_attempts from public, anon, authenticated;/);
  for (const policy of [...code.matchAll(/create policy [^;]*;/g)].map(match => match[0])) {
    assert.match(policy, /for select to authenticated/);
    assert.match(policy, /m\.user_id = \(select auth\.uid\(\)\) and m\.role = 'OWNER'/);
  }
  assert.equal([...code.matchAll(/create policy/g)].length, 2);
});

test("function privileges: the three owner functions are authenticated-only, the two Edge Function functions are service_role-only with an in-function guard", () => {
  const owner = ["reserve_steam_games_refresh", "get_my_discovered_games", "get_my_game_discovery_state"];
  const backend = ["begin_steam_games_fetch", "save_steam_games_result"];
  const revoke = code.slice(code.indexOf("revoke all on function"), code.indexOf("grant execute on function"));
  const grants = code.slice(code.indexOf("grant execute on function"));
  const toAuthenticated = grants.slice(0, grants.indexOf("to authenticated"));
  const toService = grants.slice(grants.indexOf("to authenticated") + 16, grants.indexOf("to service_role"));
  for (const name of [...owner, ...backend]) assert.match(revoke, new RegExp(`public\\.${name}\\(`), `${name} is revoked from public, anon and authenticated first`);
  assert.match(revoke, /from public, anon, authenticated;/);
  for (const name of owner) { assert.match(toAuthenticated, new RegExp(`public\\.${name}\\(`)); assert.doesNotMatch(toService, new RegExp(`public\\.${name}\\(`)); }
  for (const name of backend) { assert.match(toService, new RegExp(`public\\.${name}\\(`)); assert.doesNotMatch(toAuthenticated, new RegExp(`public\\.${name}\\(`)); }
  for (const name of backend) assert.match(fn(`public.${name}`), /current_user <> 'service_role'[^;]*BACKEND_ONLY/);
  for (const name of [...owner, ...backend]) assert.match(fn(`private.${name}_impl`), /security definer\s+set search_path = ''/);
});

test("discovered games can never be verified: the table CHECK ties the trust label to DISCOVERED_FROM_<PROVIDER>, and the state has only the six discovery outcomes", () => {
  assert.match(code, /trust_status text not null check \(trust_status = 'DISCOVERED_FROM_' \|\| upper\(source_provider\)\)/);
  assert.doesNotMatch(code, /(?<!NOT_)VERIFIED|'MANUAL'/);
  assert.match(code, /last_result in \('AVAILABLE', 'EMPTY', 'UNAVAILABLE', 'TEMPORARY_ERROR', 'SERVICE_ERROR', 'MALFORMED'\)/);
  assert.match(code, /'DISCOVERED_FROM_STEAM'/);
});

test("the data model is provider-neutral and stores only what is needed: no raw response, no credential, no SteamID column", () => {
  const games = code.slice(code.indexOf("create table public.discovered_games"), code.indexOf("create index discovered_games_entity_idx"));
  const columns = [...games.matchAll(/^\s{2}([a-z_]+) (?:uuid|text|integer|timestamptz)/gm)].map(match => match[1]);
  assert.deepEqual(columns, ["connection_id", "entity_id", "source_provider", "external_game_id", "game_name", "icon_ref", "playtime_minutes", "trust_status", "first_seen_at", "last_seen_at"]);
  assert.doesNotMatch(games, /jsonb|\bjson\b|\braw\b|payload|response|steam_id|steamid|provider_account_id|api_?key/i);
  assert.match(games, /connection_id uuid not null references public\.gaming_connections\(connection_id\) on delete cascade/, "removing the Steam connection removes its discovered games");
});

test("Marvel Rivals is only a recognition entry (App ID 2767030) in a provider-neutral map: no Marvel table, column, or profile", () => {
  assert.match(code, /values \('steam', '2767030', 'marvel_rivals', 'Marvel Rivals'\);/);
  assert.equal([...code.matchAll(/marvel/gi)].length, 2, "the seed row and its comment only");
  assert.doesNotMatch(code, /marvel[_ -]?(uid|rank|stats?)|\brank\b|\bstats?\b|(?<!NOT_)VERIFIED/i, "no Marvel UID / rank / stats / verification concept in the schema");
});

// ------------------------------------------------------------------------------------------------ security shape of the functions

test("the reservation takes NO parameters and resolves the Steam connection from the caller's own identity: the browser cannot influence the account", () => {
  const reserve = fn("private.reserve_steam_games_refresh_impl");
  assert.match(reserve, /create function private\.reserve_steam_games_refresh_impl\(\)/);
  assert.match(reserve, /caller uuid := \(select auth\.uid\(\)\)/);
  assert.match(reserve, /m\.user_id = caller and m\.role = 'OWNER'/);
  assert.match(reserve, /from public\.gaming_connections g where g\.entity_id = owned_entity_id and g\.provider_key = 'steam'/);
  assert.match(reserve, /email_confirmed_at is not null/);
  assert.match(fn("public.reserve_steam_games_refresh"), /reserve_steam_games_refresh\(\)\s+returns/);
});

test("throttling is in the database, before any outbound request: 120 s spacing, 6 per hour, 20 per day, serialized per identity, and survives disconnect/reconnect", () => {
  const reserve = fn("private.reserve_steam_games_refresh_impl");
  assert.match(reserve, /pg_advisory_xact_lock/);
  assert.match(reserve, /interval '120 seconds'/);
  assert.match(reserve, /recent_count >= 6/);
  assert.match(reserve, /recent_count >= 20/);
  assert.match(reserve, /interval '1 hour'/);
  assert.match(reserve, /interval '1 day'/);
  const ledger = code.slice(code.indexOf("create table private.game_discovery_attempts"), code.indexOf("create index game_discovery_attempts_entity_created_idx"));
  assert.match(ledger, /entity_id uuid not null references public\.entities\(entity_id\) on delete cascade/);
  assert.match(ledger, /connection_id uuid not null,/, "deliberately not a foreign key: removing a connection must not erase its throttle history");
  assert.doesNotMatch(ledger, /connection_id uuid not null references/);
});

test("the SteamID is returned only to the backend, once, from the reserving owner's connection, and is snapshotted on the reservation", () => {
  const begin = fn("private.begin_steam_games_fetch_impl");
  assert.match(begin, /att\.started_at is not null then\s+return query select 'ALREADY_STARTED'/);
  assert.match(begin, /g\.connection_id = att\.connection_id and g\.entity_id = att\.entity_id and g\.provider_key = 'steam'/);
  assert.match(begin, /provider_account_id = conn\.provider_account_id/);
  assert.match(begin, /interval '3 minutes'/);
  for (const owner of ["private.get_my_discovered_games_impl", "private.get_my_game_discovery_state_impl"]) {
    assert.doesNotMatch(fn(owner).split("return query")[1] || "", /provider_account_id|steam_id/, `${owner} never returns the SteamID64`);
  }
});

test("only AVAILABLE or EMPTY may change the stored list; every other outcome only records the failed attempt (last good data is preserved)", () => {
  const save = fn("private.save_steam_games_result_impl");
  const successBranch = save.slice(save.indexOf("if outcome_key in ('AVAILABLE', 'EMPTY') then"), save.indexOf("  else\n    -- a failed"));
  const failureBranch = save.slice(save.indexOf("  else\n    -- a failed"), save.indexOf("update private.game_discovery_attempts a set completed_at = now(), outcome = outcome_key"));
  assert.match(successBranch, /delete from public\.discovered_games/);
  assert.match(successBranch, /exception when check_violation/, "database-rejected data rolls back atomically and preserves the list");
  assert.doesNotMatch(failureBranch, /discovered_games|game_count|last_success_at/, "a failed attempt touches neither the list, the count, nor the success time");
  assert.match(save, /g\.provider_account_id = att\.provider_account_id/, "the saved result must belong to the very Steam account that was fetched");
  assert.match(save, /distinct on \(x\.appid\)/, "duplicates collapse to one row per app id");
  assert.match(save, /jsonb_array_length\(candidate_games\) not between 1 and 10000/);
});

// ------------------------------------------------------------------------------------------------ the Edge Function

test("the Edge Function is pinned verify_jwt, thin glue, and logs fixed codes only", () => {
  assert.match(config, /\[functions\.steam-games-refresh\]\s*verify_jwt = true/);
  assert.match(glue, /from "\.\.\/_shared\/steam-games\.js"/);
  assert.match(glue, /log: \(event: string, code: string\) => console\.log\(`\$\{event\}:\$\{code\}`\)/);
  assert.doesNotMatch(glue, /Deno\.env\.get\("STEAM/, "the key is read only inside the shared module's readEnv");
});

test("the Steam Web API key is server-side only: it appears in exactly one source file, and never in the browser, the migration, or any committed literal", () => {
  const sources = [...walk(join(root, "supabase")), ...walk(join(root, "dist")), ...walk(join(root, "scripts"))].filter(path => /\.(js|ts|html|css|toml|sql|mjs|json)$/.test(path));
  const withKeyName = sources.filter(path => /STEAM_WEB_API_KEY/.test(readFileSync(path, "utf8"))).map(path => path.replace(/\\/g, "/").replace(/^.*\/(supabase|dist|scripts)\//, "$1/"));
  assert.deepEqual(withKeyName, ["supabase/functions/_shared/steam-games.js"]);
  for (const path of sources) assert.doesNotMatch(readFileSync(path, "utf8"), /[?&]key=[0-9A-Fa-f]{32}\b|STEAM_WEB_API_KEY\s*[:=]\s*["'][0-9A-Fa-f]{32}/, `${path} contains no key literal`);
  assert.doesNotMatch(controller + client + publicJs, /api\.steampowered|GetOwnedGames|steamApiKey|STEAM_WEB_API_KEY/);
  assert.doesNotMatch(module, /console\.(log|error|warn)|JSON\.stringify\(env|env\.steamApiKey[^;]*(log|throw)/, "the module never logs directly");
});

test("the module only ever talks to the official API host and the Supabase project; it never scrapes Steam pages", () => {
  const urls = [...module.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map(match => match[0]).filter(url => !/jeddawe11-eng|specs\.openid/.test(url));
  assert.deepEqual([...new Set(urls)], ["https://api.steampowered.com"]);
  assert.doesNotMatch(module, /steamcommunity\.com|store\.steampowered|\/profiles\/|\/games\/\?|xml=1|cheerio|DOMParser|querySelector|puppeteer/i);
  assert.doesNotMatch(module, /GetPlayerSummaries|GetRecentlyPlayedGames|GetUserStatsForGame|GetPlayerAchievements|GetSteamLevel|ISteamUserStats/);
});

// ------------------------------------------------------------------------------------------------ frontend

test("the browser reads stored games with database reads and contacts Steam only through the explicit refresh action, sending no SteamID", () => {
  const block = client.slice(client.indexOf("export async function getMyGameDiscoveryState"), client.indexOf("// League of Legends prototype"));
  assert.match(block, /rpc\("get_my_game_discovery_state", \{ candidate_provider: provider \}\)/);
  assert.match(block, /rpc\("get_my_discovered_games", \{ candidate_provider: provider, candidate_limit: limit, candidate_offset: 0 \}\)/);
  assert.match(block, /body: JSON\.stringify\(\{ action: "refresh" \}\)/);
  assert.match(block, /functions\/v1\/steam-games-refresh/);
  assert.doesNotMatch(block, /steamid|steam_id|provider_account_id|provider_username/i);
});

test("YOUR GAMID: the Steam card keeps Load My Games / Refresh Games (its games are listed in the one My Games library), private, with clear states and no polling", () => {
  const panel = controller.slice(controller.indexOf("// Steam \"My Games\""), controller.indexOf("// League of Legends PROTOTYPE"));
  assert.match(panel, /"Load My Games"/);
  assert.match(panel, /"Refresh Games"/);
  assert.match(panel, /"Asking Steam…"/);
  assert.match(panel, /The discovery details stay private to you; whether your games appear on your public GamID is your choice under Game display/);
  assert.match(controller, /card\.append\(steamGamesPanel\(\)\)/);
  assert.doesNotMatch(panel, /setInterval|requestAnimationFrame|EventSource|WebSocket/);
  assert.equal([...panel.matchAll(/setTimeout/g)].length, 1, "one local timer that only re-renders when the cooldown ends");
  assert.match(panel, /setTimeout\(renderConnections, waitMs \+ 250\)/);
  // the panel reads only stored data + the explicit refresh; nothing calls Steam on load
  const loader = panel.slice(panel.indexOf("async function loadSteamGames"), panel.indexOf("async function refreshMySteamGames"));
  assert.doesNotMatch(loader, /refreshSteamGames/);
  assert.match(controller, /await loadSteamGames\(\);\n  renderConnections\(\);/);
});

test("the three states are told apart, and an unavailable library is never presented as zero games", () => {
  const panel = controller.slice(controller.indexOf("function steamGamesStatus"), controller.indexOf("function gameIcon"));
  for (const outcome of ["AVAILABLE", "EMPTY", "UNAVAILABLE", "TEMPORARY_ERROR", "SERVICE_ERROR", "MALFORMED"]) assert.match(panel, new RegExp(`case "${outcome}"`));
  const unavailable = panel.slice(panel.indexOf('case "UNAVAILABLE"'), panel.indexOf('case "TEMPORARY_ERROR"'));
  assert.match(unavailable, /this does NOT mean you have no games/);
  assert.match(unavailable, /Privacy Settings/);
  assert.match(unavailable, /"Game details"/);
  assert.match(unavailable, /GamID never changes anything in Steam/);
  assert.match(panel, /Still showing your last successful list/);
  assert.doesNotMatch(unavailable.replace("does NOT mean you have no games", ""), /no games|0 games|library is empty|empty library/i, "apart from the explicit negation, it never says the library is empty");
  assert.match(controller, /not_configured: "Steam game lookup isn't set up yet on this TESTING site\."/);
});

test("Marvel Rivals is shown only as 'Discovered via Steam', with the explicit statement that it verifies no Marvel account, UID, rank, or stats", () => {
  const recognition = controller.slice(controller.indexOf("function marvelRecognition"), controller.indexOf("function steamGamesPanel"));
  assert.match(recognition, /"DISCOVERED VIA STEAM"/);
  assert.match(recognition, /it does not verify a Marvel account, UID, rank, or stats/);
  assert.match(recognition, /item\.game_key === "marvel_rivals"/, "recognition comes from the server's recognition map, not a client-side guess");
  assert.doesNotMatch(recognition, /VERIFIED|verified badge|✓|uid:/i);
  assert.match(controller, /"Discovered via Steam"/, "every game row carries its provenance");
});

test("server data is rendered as text only; icons come from Steam's media host with a validated app id and hash and no referrer", () => {
  const panel = controller.slice(controller.indexOf("// Steam \"My Games\""), controller.indexOf("// League of Legends PROTOTYPE"));
  assert.doesNotMatch(panel, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  assert.match(panel, /const STEAM_ICON_BASE = "https:\/\/media\.steampowered\.com\/steamcommunity\/public\/images\/apps";/);
  assert.match(panel, /\/\^\[0-9\]\{1,10\}\$\/\.test\(game\.external_game_id\) && \/\^\[0-9a-f\]\{40\}\$\/\.test\(game\.icon_ref \|\| ""\)/);
  assert.match(panel, /image\.referrerPolicy = "no-referrer"/);
  assert.match(panel, /image\.loading = "lazy"/);
  assert.match(panel, /image\.alt = ""/);
  assert.doesNotMatch(panel, /provider_account_id|provider_username|steam_id|entity_id|connection_id/, "the panel never reads an account identifier");
  // narrowed (was: 50 rows in a Steam-only list): the list is now the provider-neutral compact library (dist/account/game-list.js, tests/game-list.test.js)
  assert.match(panel, /buildGameLibrary\(\{/, "long libraries render through the provider-neutral collapsed list until the owner asks for more");
  assert.doesNotMatch(panel, /STEAM_GAMES_PREVIEW|steamGamesShowAll/, "no Steam-specific preview size or expand flag remains");
});

test("layout: the My Games styles are scoped to the Steam card and let long names wrap", () => {
  const block = css.slice(css.indexOf("/* Steam My Games (discovery only)"));
  const selectors = [...block.matchAll(/(^|\})\s*([^{}\/]+)\{/g)].map(match => match[2].trim()).filter(Boolean);
  assert.ok(selectors.length >= 10);
  for (const selector of selectors) for (const part of selector.split(",")) assert.match(part.trim(), /^\.connection-card\[data-provider="steam"\]/, `${part.trim()} is Steam-scoped`);
  assert.match(block, /\.game-name\{[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(block, /text-overflow:ellipsis|white-space:nowrap/);
});

// ------------------------------------------------------------------------------------------------ scope and regressions

test("Discord, League, OpenID, Intro and the public boundary were not modified in behavior by this slice", () => {
  const discordAndLeague = ["supabase/functions/_shared/discord-oauth.js", "supabase/functions/discord-connect-start/index.ts", "supabase/functions/discord-connect-callback/index.ts",
    "supabase/functions/_shared/league/league-service.js", "supabase/functions/_shared/league/league-domain.js", "supabase/functions/_shared/league/opgg-adapter.js", "supabase/functions/league-lookup/index.ts",
    "supabase/functions/_shared/steam-openid.js", "supabase/functions/steam-connect-start/index.ts", "supabase/functions/steam-connect-callback/index.ts"];
  for (const path of discordAndLeague) assert.doesNotMatch(read(path), /discovered_games|game_discovery|steam-games|GetOwnedGames|discovered|My Games/i, path);
  assert.doesNotMatch(read("dist/account/intro-preview.js") + read("dist/account/intro-status-poller.js"), /steam|discovered|My Games/i);
  // the Steam foundation migration still holds no library/game concept (its own boundary test lives in steam-connection.test.js)
  assert.doesNotMatch(stripComments(steamFoundation), /discovered_games|owned_games|game_library/i);
});

test("nothing beyond discovery was started: no Marvel API/stats/UID, no third-party game source, no Game ID Wall, no other provider, no Production reference", () => {
  const files = [...walk(join(root, "dist")), ...walk(join(root, "supabase"))].filter(path => /\.(js|ts|html|css|sql|toml)$/.test(path) && !/qrcode\.min\.js$/.test(path)
    // the isolated W0 throwaway prototype is a separate, unlinked feasibility page (its own isolation is asserted in game-id-wall-w0.test.js)
    && !/[\\/]dist[\\/]prototypes[\\/]game-id-wall-w0[\\/]/.test(path)
    // Game ID Wall W1 (the versioned document/validation/renderer foundation) is separately, explicitly authorized product work - not scope creep from
    // this Steam slice. It has no live route and is provider-neutral by construction (its own isolation/no-provider-dependency is asserted in
    // game-id-wall-w1.test.js); this guard still applies to every other file, so a stray Wall reference inside an actual Steam file is still caught.
    && !/[\\/]dist[\\/]wall[\\/]/.test(path)
    // the Game Catalog migration only lists platform NAMES as reference data (e.g. the Epic Games Store as a storefront under PC); it integrates no provider.
    // That is asserted for them in tests/game-catalog-contract.test.js, which forbids every provider integration pattern in them (the expansion migration seeds more platform names).
    && !/_game_catalog_(manual_games|platforms_release_years)\.sql$/.test(path));
  const all = files.map(path => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(all, /tracker\.gg|rivalsmeta|marvelrivalsapi|mrapi|op\.gg\/marvel|marvel[-_ ]?uid|marvel[-_ ]?rank|marvel[-_ ]?stats|game[-_ ]?id[-_ ]?wall|profile[-_ ]?canvas|xbox live|playstation network|battle\.net|epic games/i);
  assert.doesNotMatch(migration + module + glue, /production|prod\./i);
});
