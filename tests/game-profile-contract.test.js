// Game Profile foundation contract: additive schema, owner scoping, private by default, trust separation, public boundary untouched, and scope guards
// (no external provider, no scraping, no fake data). Live behavior: tests/integration/game-profiles-db.sql.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const stripSql = sql => sql.replace(/--.*$/gm, "");
const name = "20260921200000_game_profiles.sql";
const migration = stripSql(read(`supabase/migrations/${name}`));
const raw = read(`supabase/migrations/${name}`);
const migrations = readdirSync(new URL("supabase/migrations/", root)).sort();

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "prototypes", ".temp"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out); else out.push(path);
  }
  return out;
}

test("the migration is additive: one function, one table, owner read, backend writer, private gate; no drop/alter of anything existing", () => {
  assert.ok(migrations.includes(name));
  assert.match(migration, /create table public\.game_profiles \(/);
  assert.doesNotMatch(migration, /\bdrop\b|\btruncate\b|\bdelete\s+from\b|\balter\s+table\s+(?!public\.game_profiles)/i);
  assert.doesNotMatch(migration, /\binsert\s+into\s+public\.game_profiles\b[^;]*values\s*\(\s*'/i.source ? /\binsert\s+into\s+(?!public\.game_profiles as g)/i : /x/, "no seed data");
  assert.doesNotMatch(migration, /\bupdate\s+public\.(?!game_profiles)/i, "no existing table is updated");
  // no EARLIER migration was rewritten to mention it; a LATER one may only consume it through the accepted public gate (private.public_game_profiles), never the table
  for (const other of migrations.filter(item => item !== name)) {
    const code = stripSql(read(`supabase/migrations/${other}`));
    assert.doesNotMatch(other < name ? code : code.replaceAll("private.public_game_profiles", ""), /game_profiles/, `${other} does not touch the table (only the public gate may be called)`);
  }
});

test("no data is fabricated: the migration inserts no Game Profile and names no real game, provider API or player identity", () => {
  assert.doesNotMatch(migration, /insert\s+into\s+public\.game_profiles\s*\(/i.source ? /insert\s+into\s+public\.game_profiles\s*\([^)]*\)\s*(values|select)(?![\s\S]{0,40}candidate_)/i : /x/);
  assert.doesNotMatch(migration, /marvel|rivals|1391360211|espada|tracker|opgg|dota|steam|discord|xbox|playstation|riot/i, "provider- and game-neutral");
});

test("the five concepts are separate columns: identity, stats source (+ trust class), normalized fields, ownership trust, and NO discovery provider", () => {
  const table = migration.slice(migration.indexOf("create table public.game_profiles"), migration.indexOf("create index game_profiles_entity_idx"));
  for (const column of ["game_key", "identity_source", "identity_ref", "data_source", "data_source_class", "trust_status", "verification_basis", "fields jsonb", "fetched_at", "is_public"]) assert.match(table, new RegExp(`\\b${column}\\b`));
  assert.doesNotMatch(table, /source_provider|connection_id|external_game_id|discovered|playtime|rank\b|win_rate|hero/i, "no discovery column and no game-specific column");
  assert.match(table, /constraint game_profiles_one_per_game unique \(entity_id, game_key\)/);
});

test("trust rules are enforced by the table itself: MANUAL has no basis, CONNECTED/VERIFIED need one, temporary sources never exceed MANUAL, VERIFIED needs an OFFICIAL source", () => {
  assert.match(migration, /trust_status text not null default 'MANUAL' check \(trust_status in \('VERIFIED', 'CONNECTED', 'MANUAL'\)\)/);
  assert.match(migration, /game_profiles_manual_has_no_basis check \(trust_status <> 'MANUAL' or verification_basis is null\)/);
  assert.match(migration, /game_profiles_connected_needs_basis check \(trust_status <> 'CONNECTED' or \(verification_basis is not null and data_source_class <> 'UNOFFICIAL_TEMPORARY'\)\)/);
  assert.match(migration, /game_profiles_verified_needs_official_basis check \(trust_status <> 'VERIFIED' or \(verification_basis is not null and data_source_class = 'OFFICIAL'\)\)/);
  assert.doesNotMatch(migration, /discovered_games|game_discovery|known_game_sources|DISCOVERED_FROM/, "discovery is never consulted, so it can never create or upgrade a profile");
  // the same vocabulary as the accepted League table
  assert.match(read("supabase/migrations/20260920100000_league_profile_prototype.sql"), /trust_status in \('VERIFIED', 'CONNECTED', 'MANUAL'\)/);
});

test("private by default and never auto-published: is_public defaults false, no function sets it, the upsert leaves it alone", () => {
  assert.match(migration, /is_public boolean not null default false/);
  assert.doesNotMatch(migration, /is_public\s*=\s*(true|false|excluded)/i, "no statement in the migration ever assigns is_public");
  const upsert = migration.slice(migration.indexOf("on conflict on constraint game_profiles_one_per_game do update"), migration.indexOf("exception when check_violation"));
  assert.doesNotMatch(upsert, /is_public|created_at/);
});

test("owner scoping and privileges: RLS on, no table grant, the owner RPC resolves the identity from auth.uid(), the writer is service_role-only", () => {
  assert.match(migration, /alter table public\.game_profiles enable row level security;/);
  assert.match(migration, /revoke all on table public\.game_profiles from public, anon, authenticated;/);
  assert.match(migration, /create policy "owners read their own game profiles"[\s\S]*m\.user_id = \(select auth\.uid\(\)\) and m\.role = 'OWNER'/);
  const reader = migration.slice(migration.indexOf("create function private.get_my_game_profiles_impl"), migration.indexOf("create function private.save_game_profile_impl"));
  assert.match(reader, /caller uuid := \(select auth\.uid\(\)\)/);
  assert.match(reader, /where g\.entity_id = owned_entity_id/);
  assert.doesNotMatch(reader, /candidate_/, "the reader takes no identity from the caller");
  assert.match(migration, /if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'/);
  const grants = migration.slice(migration.indexOf("grant execute on function private.get_my_game_profiles_impl()"));
  assert.match(grants, /public\.get_my_game_profiles\(\) to authenticated;/);
  assert.match(grants, /public\.save_game_profile\([^)]*\) to service_role;/);
  const toClients = grants.split(";").filter(statement => /to authenticated|to anon|to public/.test(statement)).join(";");
  assert.doesNotMatch(toClients, /save_game_profile|public_game_profiles/, "the writer and the public gate are granted to no client role");
});

test("the field payload is bounded and cannot carry playtime: at most 12 typed fields, strict keys/labels/values, no extra properties", () => {
  const validator = migration.slice(migration.indexOf("create function private.game_profile_fields_valid"), migration.indexOf("create table public.game_profiles"));
  assert.match(validator, /jsonb_array_length\(candidate\) > 12/);
  assert.match(validator, /\^\[a-z\]\[a-z0-9_\]\{0,31\}\$/);
  assert.match(validator, /\(playtime\|hours\|minutes_played\|time_played\)/);
  assert.match(validator, /k not in \('key', 'label', 'value', 'kind'\)/);
  assert.match(validator, /not between 1 and 40/);
  assert.match(validator, /not between 1 and 80/);
  assert.match(migration, /fields jsonb not null default '\[\]'::jsonb check \(private\.game_profile_fields_valid\(fields\)\)/);
});

test("PUBLIC-SAFE: the accepted public boundary is untouched and the only public projection is a private, ungranted gate that hides identity and verification details", () => {
  assert.doesNotMatch(migration, /get_public_identity|public_sections|public_section_catalog|show_game_playtime/i);
  const gate = migration.slice(migration.indexOf("create function private.public_game_profiles"), migration.indexOf("create function public.get_my_game_profiles"));
  assert.match(gate, /g\.is_public and e\.visibility = 'PUBLIC'/);
  assert.doesNotMatch(gate, /identity_ref|identity_source|verification_basis|entity_id'|game_profile_id/);
  assert.match(gate, /'game_key', g\.game_key, 'data_source', g\.data_source, 'data_source_class', g\.data_source_class,\s*'trust_status', g\.trust_status, 'fields', g\.fields, 'fetched_at', g\.fetched_at/);
  const publicJs = read("dist/public/public.js");
  assert.doesNotMatch(publicJs, /game_profile|game-profile|getMyGameProfiles/i, "the public page renders no Game Profile");
  for (const path of ["dist/public/index.html", "dist/public/public.css"]) assert.doesNotMatch(read(path), /game_profile|game-profile/i);
});

test("client: the browser has ONE read RPC and NO write path for Game Profiles", () => {
  const client = read("dist/account/supabase-client.js");
  assert.match(client, /export async function getMyGameProfiles\(\) \{\s*return \(await rpc\("get_my_game_profiles"\)\) \|\| \[\];\s*\}/);
  assert.equal([...client.matchAll(/game_profile/g)].length, 1, "get_my_game_profiles is the only Game Profile call");
  assert.doesNotMatch(client.replace("get_my_game_profiles", ""), /save_game_profile|game_profiles/);
  const account = read("dist/account/account.js");
  assert.doesNotMatch(account, /save_game_profile|saveGameProfile|setGameProfile/);
  assert.equal([...account.matchAll(/getMyGameProfiles/g)].length, 1);
});

test("SCOPE: no Marvel adapter, no third-party stats API, no scraping, no key handling, and no fake Marvel data anywhere in the product code", () => {
  const files = [...walk(join(root.pathname.replace(/^\/([A-Za-z]:)/, "$1"), "dist")), ...walk(join(root.pathname.replace(/^\/([A-Za-z]:)/, "$1"), "supabase"))]
    .filter(path => /\.(js|ts|html|css|sql|toml)$/.test(path) && !/qrcode\.min\.js$/.test(path) && !/[\\/]prototypes[\\/]/.test(path) && !path.endsWith("game-profiles-db.sql"));
  for (const path of files) {
    const text = readFileSync(path, "utf8").replace(/\/\/.*$/gm, "").replace(/--.*$/gm, "");
    assert.doesNotMatch(text, /marvelrivalsapi|mrapi\.org|tracker\.gg|trackernetwork|rivalsmeta|1391360211|ESPADA BLACK|x-api-key/i, path);
  }
  const marvelKey = read("supabase/migrations/20260920230000_steam_my_games.sql");
  assert.match(marvelKey, /'marvel_rivals'/, "Marvel Rivals is still only a recognized discovered game (unchanged)");
  assert.doesNotMatch(migration, /marvel/i);
});

test("the shared test helper for the fake element does not leak into product code", () => {
  assert.doesNotMatch(read("dist/account/game-profile.js"), /fake\(|node:test/);
});