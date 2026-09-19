import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { LEAGUE_REGIONS, PLATFORM_IDS } from "../supabase/functions/_shared/league/league-domain.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const listFiles = async (dir, out = []) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) await listFiles(target, out); else out.push(target);
  }
  return out;
};

const html = await read("../dist/account/index.html");
const css = await read("../dist/account/account.css");
const controller = (await read("../dist/account/account.js")).replace(/\r\n/g, "\n");
const client = await read("../dist/account/supabase-client.js");
const domain = await read("../supabase/functions/_shared/league/league-domain.js");
const adapter = await read("../supabase/functions/_shared/league/opgg-adapter.js");
const service = await read("../supabase/functions/_shared/league/league-service.js");
const glue = await read("../supabase/functions/league-lookup/index.ts");
const migration = await read("../supabase/migrations/20260920100000_league_profile_prototype.sql");
const config = await read("../supabase/config.toml");
const pkg = JSON.parse(await read("../package.json"));
const discordModule = await read("../supabase/functions/_shared/discord-oauth.js");

const jsCode = text => text.replace(/^\s*\/\/.*$/gm, "");
const sqlCode = text => text.replace(/--.*$/gm, "");
const start = controller.indexOf("// League of Legends PROTOTYPE");
const leagueBlock = controller.slice(start, controller.indexOf("async function routeAuthenticated()"));

// ------------------------------------------------------------------------------------------------ isolation / replaceability

test("OP.GG is isolated: only the adapter (and the glue that wires it) names it; the domain, service and schema are source-neutral", () => {
  assert.match(adapter, /op\.gg/);
  for (const [name, text] of [["league-domain.js", domain], ["league-service.js", service]]) assert.doesNotMatch(text, /op\.gg|opgg|summoners/i, `${name} must not know about OP.GG`);
  // the schema names the source only as an opaque data_source value
  assert.doesNotMatch(migration.replaceAll("OPGG_TEMPORARY", ""), /op\.gg|opgg/i);
  assert.match(glue, /opggAdapter/);
  assert.equal(glue.match(/op\.gg/gi), null, "the glue passes an adapter object; it contains no OP.GG URL");
});

test("the service depends on an adapter contract, not on OP.GG — a replacement source only has to implement { sourceKey, lookup }", () => {
  assert.doesNotMatch(service, /^import .*opgg-adapter/m);
  assert.match(service, /adapter\.lookup\(/);
  assert.match(service, /candidate_data_source: adapter\.sourceKey/);
  assert.match(adapter, /export const opggAdapter = Object\.freeze\(\{ sourceKey: OPGG_SOURCE_KEY, lookup \}\)/);
  assert.match(adapter, /^import \{[^}]*\} from "\.\/league-domain\.js";/m);
  assert.doesNotMatch(domain, /^import /m, "the domain module has no dependencies at all");
});

test("the domain model is Riot-native and provenance is generic, so RSO + the official API can replace the temporary source without a redesign", () => {
  for (const column of ["game_name", "tag_line", "platform_id", "identity_source", "data_source", "trust_status", "solo_rank_state", "solo_tier", "solo_division", "solo_lp", "solo_wins", "solo_losses", "profile_icon_id", "source_url", "source_updated_at", "fetched_at"]) assert.match(migration, new RegExp(`\\b${column}\\b`), column);
  assert.match(migration, /identity_source text not null default 'MANUAL_RIOT_ID'/);
  assert.match(migration, /data_source text not null check \(data_source in \('OPGG_TEMPORARY'\)\)/);
  assert.doesNotMatch(sqlCode(migration), /\b(html|raw_response|payload|response_body|puuid)\b/i, "no HTML, raw response or player id is stored");
  assert.doesNotMatch(adapter, /puuid/i, "the adapter never reads the player id");
});

test("region catalogs agree everywhere: domain, database constraint, and the owner form", () => {
  const listed = /const LEAGUE_REGIONS = \[([\s\S]*?)\n\];/.exec(controller)[1];
  const ui = new Function(`return [${listed}]`)();
  assert.deepEqual(ui, LEAGUE_REGIONS.map(region => [region.platformId, region.label]));
  const check = /platform_id text not null check \(platform_id in \(([^)]*)\)\)/.exec(migration)[1];
  assert.deepEqual([...check.matchAll(/'([A-Z0-9]+)'/g)].map(match => match[1]), [...PLATFORM_IDS]);
  const reserve = /req_platform not in \(([^)]*)\)/.exec(migration)[1];
  assert.deepEqual([...reserve.matchAll(/'([A-Z0-9]+)'/g)].map(match => match[1]), [...PLATFORM_IDS]);
});

// ------------------------------------------------------------------------------------------------ trust wording

test("the owner UI uses prototype/unverified wording and never claims Riot verification", () => {
  for (const phrase of ["PROTOTYPE / UNVERIFIED", "Data source", "Last updated", "Add League Account", "League of Legends", "Refresh", "Remove", "Riot ID", "Private — not shown on your public GamID", "isn't proof of account ownership", "OP.GG"]) assert.ok(leagueBlock.includes(phrase), `missing: ${phrase}`);
  for (const file of [html, css, jsCode(controller), jsCode(client)]) assert.doesNotMatch(file, /verified by riot|official riot|riot verified|riot connection|riot-verified/i);
  assert.match(migration, /league_profiles_temporary_source_is_never_verified check \(data_source <> 'OPGG_TEMPORARY' or trust_status = 'MANUAL'\)/);
  assert.match(migration, /trust_status text not null default 'MANUAL'/);
});

test("the League area lives inside the existing Connections section of YOUR GAMID", () => {
  const section = html.slice(html.indexOf('id="connectionsSection"'), html.indexOf("</section>", html.indexOf('id="connectionsSection"')));
  assert.ok(section.includes('id="leagueSection"') && section.includes('id="leagueCard"') && section.includes('id="leagueMessage"'));
  assert.match(html, /id="leagueCard"[^>]*aria-live="polite"/);
  assert.match(html, /id="leagueMessage"[^>]*role="status"[^>]*hidden/);
});

// ------------------------------------------------------------------------------------------------ lookups only on explicit actions; no polling

test("no automatic polling or background work anywhere in the League feature", async () => {
  for (const [name, text] of [["league block", leagueBlock], ["league-domain", domain], ["opgg-adapter", adapter], ["league-service", service], ["glue", glue]]) {
    assert.doesNotMatch(text, /setInterval|Deno\.cron|\bcron\b|requestIdleCallback|navigator\.sendBeacon|EventSource|WebSocket|BroadcastChannel|serviceWorker/, `${name} must not schedule anything`);
  }
  assert.doesNotMatch(migration, /cron\.schedule|pg_cron|pg_net|pg_background/i);
  assert.doesNotMatch(config, /cron|schedule/i);
  assert.equal([...leagueBlock.matchAll(/setTimeout\(/g)].length, 2, "only two UI timers exist: hide the message, and re-render when the Refresh cooldown ends (neither makes a request)");
  assert.match(leagueBlock, /leagueRefreshTimer = setTimeout\(renderLeague,/);
});

test("a lookup is only ever started by the owner's Add / Refresh click — never by loading, rendering, or page events", () => {
  const callers = [...leagueBlock.matchAll(/runLeagueLookup\(/g)].length;
  assert.equal(callers, 3, "definition + the add and refresh handlers");
  assert.match(leagueBlock, /function submitLeagueAdd\(\) \{[\s\S]*?runLeagueLookup\("add", "add"\);/);
  assert.match(leagueBlock, /function submitLeagueRefresh\(\) \{ runLeagueLookup\("refresh", "refresh"\); \}/);
  assert.match(leagueBlock, /submit\.addEventListener|form\.addEventListener\("submit"/);
  assert.match(leagueBlock, /refresh\.addEventListener\("click", submitLeagueRefresh\)/);
  assert.equal([...controller.matchAll(/lookupLeagueProfile\(/g)].length, 1, "the client function is called from exactly one place");
  const load = leagueBlock.slice(leagueBlock.indexOf("async function loadLeague"), leagueBlock.indexOf("function splitRiotId"));
  assert.doesNotMatch(load, /lookupLeagueProfile|runLeagueLookup|submitLeague/, "loading only READS the stored profile");
  const pageEvents = controller.slice(controller.indexOf('window.addEventListener("pageshow"'), controller.indexOf("// League of Legends PROTOTYPE"));
  assert.doesNotMatch(pageEvents, /League/, "page events never touch League");
  const render = leagueBlock.slice(leagueBlock.indexOf("function renderLeague"), leagueBlock.indexOf("async function loadLeague"));
  assert.doesNotMatch(render, /lookupLeagueProfile|runLeagueLookup|api\./, "rendering makes no requests");
});

test("Refresh is disabled during its cooldown in the UI (the server enforces it regardless)", () => {
  assert.match(leagueBlock, /refresh\.disabled = Boolean\(leagueBusy\) \|\| waitMs > 0/);
  assert.match(leagueBlock, /Refresh available in/);
  assert.match(leagueBlock, /if \(leagueBusy\) return;/, "double-clicks cannot start two lookups");
});

test("the browser never contacts the data source; it only calls the GamID backend", () => {
  const fn = client.slice(client.indexOf("export async function lookupLeagueProfile"), client.indexOf("export async function removeLeagueProfile"));
  assert.match(fn, /\$\{SUPABASE_URL\}\/functions\/v1\/league-lookup/);
  assert.doesNotMatch(fn, /op\.gg/i);
  assert.match(client, /rpc\("get_my_league_profile"\)/);
  assert.match(client, /rpc\("remove_my_league_profile"\)/);
  assert.doesNotMatch(leagueBlock, /\bfetch\(/);
});

// ------------------------------------------------------------------------------------------------ safe rendering

test("owner UI renders stored values as text only and links only to https, with noopener", () => {
  assert.doesNotMatch(leagueBlock, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(leagueBlock, /url\.protocol === "https:"/);
  assert.match(leagueBlock, /link\.rel = "noopener noreferrer nofollow"/);
  assert.match(leagueBlock, /replaceChildren/);
  assert.doesNotMatch(leagueBlock, /entity_id|league_profile_id|reservation|attempt_id|access_token/);
});

test("the tagline format is not assumed by the owner UI (no fixed length/charset pattern)", () => {
  assert.doesNotMatch(leagueBlock, /pattern\s*=|\{3,5\}|\[A-Za-z0-9\]\{/);
});

// ------------------------------------------------------------------------------------------------ security / privacy boundary

test("the League migration is owner-private, backend-write-only, and throttled in the database before any outbound request", () => {
  assert.match(migration, /alter table public\.league_profiles enable row level security/);
  assert.match(migration, /revoke all on table public\.league_profiles, private\.league_lookup_attempts from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant[^;]*\bto\s+[^;]*\banon\b/i, "nothing is granted to anon");
  assert.match(migration, /is_public boolean not null default false/);
  assert.match(migration, /entity_id uuid not null unique references public\.entities\(entity_id\) on delete cascade/);
  const grants = migration.slice(migration.indexOf("grant execute on function"));
  assert.match(grants, /public\.reserve_league_lookup\(text, text, text, text\)[\s\S]*?to authenticated/);
  assert.match(grants, /public\.save_league_lookup\([^)]*\),\s*public\.finish_league_lookup\(uuid, text\)\s*to service_role/);
  assert.equal([...migration.matchAll(/current_user <> 'service_role'/g)].length, 2, "save and finish are backend-only");
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /interval '60 seconds'/);
  assert.match(migration, /interval '10 minutes'/);
  assert.match(migration, /recent_count >= 6/);
  assert.match(migration, /a refresh can only ever re-check the stored identity/);
  assert.doesNotMatch(migration, /alter table public\.(gaming_connections|connection_discovery_results|entities)|create or replace function public\.get_public/i, "no existing table or public function is altered");
});

test("the Edge Function requires a signed-in owner (verify_jwt) and reads no third-party secrets", () => {
  assert.match(config, /\[functions\.league-lookup\]\s*verify_jwt = true/);
  assert.match(service, /\^Bearer\\s\+/);
  assert.doesNotMatch(service + glue, /RIOT|RGAPI|DISCORD_|API_KEY/);
  assert.match(pkg.scripts.typecheck, /_shared\/league\/league-domain\.js/);
  assert.match(pkg.scripts.typecheck, /_shared\/league\/opgg-adapter\.js/);
  assert.match(pkg.scripts.typecheck, /_shared\/league\/league-service\.js/);
});

test("the public profile is unchanged: no League code, data, or RPC reaches the public route", async () => {
  const files = (await listFiles(new URL("../dist/public/", import.meta.url))).filter(file => /\.(js|html|css)$/i.test(file.pathname));
  assert.ok(files.length > 0);
  for (const file of files) assert.doesNotMatch(await readFile(file, "utf8"), /league|league_profiles|get_my_league|riot|op\.gg/i, `${file.pathname} must not know about League data`);
  const publicMigrations = (await Promise.all((await readdir(new URL("../supabase/migrations/", import.meta.url))).filter(n => /public_profile|public_identity/.test(n)).map(n => read(`../supabase/migrations/${n}`)))).join("\n");
  assert.doesNotMatch(publicMigrations, /league_profiles/, "no public RPC reads League data");
});

test("the existing Discord integration is untouched by this slice", () => {
  for (const [name, text] of [["league-domain", domain], ["opgg-adapter", adapter], ["league-service", service], ["glue", glue], ["migration", migration]]) {
    assert.doesNotMatch(name === "migration" ? sqlCode(text) : jsCode(text), /discord|gaming_connections|connection_discovery/i, `${name} must not reference Discord data`);
  }
  assert.match(discordModule, /scope: "identify connections"/, "the accepted Discord scopes are unchanged");
  assert.match(config, /\[functions\.discord-connect-start\]\s*verify_jwt = true/);
  assert.match(config, /\[functions\.discord-connect-callback\]\s*verify_jwt = false/);
});

test("no Production access: every project URL in shipped code is the TESTING project, and the League code has none hard-coded", async () => {
  const testingRef = "upvtrczefcvigxdyuylw";
  for (const file of (await listFiles(new URL("../dist/", import.meta.url))).filter(f => /\.(js|html)$/i.test(f.pathname))) {
    for (const host of (await readFile(file, "utf8")).matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)) assert.equal(host[1], testingRef, `${file.pathname} references a non-TESTING project`);
  }
  for (const text of [domain, adapter, service, glue]) assert.doesNotMatch(text, /supabase\.co/, "the backend modules take their project URL from the environment");
});
