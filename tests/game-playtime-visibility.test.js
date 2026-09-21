// Game playtime visibility: provider-neutral, owner-only, OFF by default, and never part of the public-safe payload unless the owner turned it ON.
// (Live behavior is in tests/integration/game-playtime-visibility-db.sql.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const stripSqlComments = sql => sql.replace(/--.*$/gm, "");
const migrations = readdirSync(new URL("supabase/migrations/", root)).sort();
const migrationName = "20260921000000_game_playtime_visibility.sql";
const migration = stripSqlComments(read(`supabase/migrations/${migrationName}`));
const client = read("dist/account/supabase-client.js");
const account = read("dist/account/account.js");
const html = read("dist/account/index.html");
const publicJs = read("dist/public/public.js");

test("the migration is additive and adds exactly one NOT NULL DEFAULT false column (no backfill, no data-dependent ON)", () => {
  assert.ok(migrations.includes(migrationName), "the playtime migration exists");   // narrowed: it was the newest when written; later additive migrations may follow
  assert.match(migration, /alter table public\.profiles add column show_game_playtime boolean not null default false;/);
  assert.doesNotMatch(migration, /\bupdate\s+public\.profiles\s+(p\s+)?set\b(?![^;]*candidate_visible)/i, "the only UPDATE is the owner RPC's, which sets the caller-supplied value");
  assert.doesNotMatch(migration, /\b(drop|truncate|delete\s+from)\b/i);
  assert.doesNotMatch(migration, /show_game_playtime\s*=\s*true/i, "nothing ever sets it ON by itself");
});

test("provider-neutral: the migration names no provider and touches no game, connection, League, Discord or section-visibility table", () => {
  assert.doesNotMatch(migration, /steam|discord|xbox|playstation|riot|league|discovered_games|gaming_connections|game_discovery|known_game_sources|public_section_catalog|show_education_work|is_public/i);
});

test("owner-only: the two RPCs resolve the identity from auth.uid(), are authenticated-only, and never accept an identity from the caller", () => {
  assert.match(migration, /caller uuid := \(select auth\.uid\(\)\)/);
  assert.match(migration, /m\.user_id = caller and m\.role = 'OWNER'/);
  assert.doesNotMatch(migration.slice(migration.indexOf("create function private.set_my_game_playtime_visibility_impl"), migration.indexOf("create function private.public_game_playtime_allowed")), /candidate_(entity|user)/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated;/);
  const grants = migration.slice(migration.indexOf("grant execute on function"));
  assert.match(grants, /public\.get_my_game_display_settings\(\), public\.set_my_game_playtime_visibility\(boolean\)\nto authenticated;/);
  assert.doesNotMatch(grants, /anon|service_role|public_game_playtime_allowed/, "the public gate is granted to no client role");
  assert.match(migration, /if candidate_visible is null then raise exception using errcode = '22023', message = 'INVALID_VISIBILITY'/);
});

test("the public gate needs BOTH the owner's switch ON and a published GamID, and defaults to closed", () => {
  const gate = migration.slice(migration.indexOf("create function private.public_game_playtime_allowed"), migration.indexOf("-- Public wrappers") > 0 ? undefined : undefined);
  assert.match(gate, /p\.show_game_playtime and e\.visibility = 'PUBLIC'/);
  assert.match(gate, /select coalesce\(\(/);
  assert.match(gate, /, false\);/);
  assert.match(gate, /security definer/);
});

test("the accepted public-safe boundary was NOT modified by this change (no game data, no playtime)", () => {
  assert.doesNotMatch(migration, /get_public_identity|create or replace function public\.get_public|public_sections/i);
  const publicFunctionMigrations = migrations.filter(name => /public/.test(name) && name !== migrationName);
  assert.ok(publicFunctionMigrations.length > 0);
  for (const name of migrations.filter(item => item !== migrationName)) assert.doesNotMatch(stripSqlComments(read(`supabase/migrations/${name}`)), /show_game_playtime/, `${name} does not reference the switch`);
  // The public page's own code still has no playtime logic and no access to the owner switches or to discovery data. (Since Public My Games it DOES render a playtime value, but only
  // inside public-games.js, and only one the server chose to include: see tests/public-my-games.test.js. The server is the gate, not the page.)
  assert.doesNotMatch(publicJs.replace(/\/\/.*$/gm, ""), /playtime|show_game|discovered_games|hours_played|minutes_played/i);
  for (const path of ["dist/public/index.html", "dist/public/public.css"]) assert.doesNotMatch(read(path), /discovered_games|show_game/i);
});

test("client: two owner RPCs only; the value is coerced to a boolean; the default answer is OFF", () => {
  assert.match(client, /export async function getMyGameDisplaySettings\(\) \{\s*const rows = await rpc\("get_my_game_display_settings"\);\s*return rows\?\.\[0\] \|\| \{ show_game_playtime: false \};/);
  assert.match(client, /rpc\("set_my_game_playtime_visibility", \{ candidate_visible: Boolean\(visible\) \}\)/);
  assert.doesNotMatch(client.slice(client.indexOf("getMyGameDisplaySettings")), /show_game_playtime:\s*true/, "the client never assumes ON");
});

test("editor: the switch is shown only when a game-supplying provider is connected, reflects the server value, and is never turned on automatically", () => {
  assert.match(account, /const GAME_PROVIDERS = new Set\(\["steam"\]\);/, "one place to add a future provider");
  assert.match(account, /connectionRows\?\.some\(row => row\.connected && GAME_PROVIDERS\.has\(row\.provider_key\)\)/);
  assert.match(account, /const on = Boolean\(gameDisplay\.show_game_playtime\);/);
  assert.match(account, /label: "Show playtime on my GamID"/);
  assert.match(account, /onChange: changePlaytimeVisibility/);
  const calls = [...account.matchAll(/setGamePlaytimeVisibility\(([^)]*)\)/g)].map(match => match[1]);
  assert.deepEqual(calls, ["visible"], "the only caller passes the value the owner just chose");
  assert.match(account, /Hidden\. Hours played are never shown on your public GamID\./);
  assert.match(account, /only for games shown through Show My Games/, "honest about the scope: playtime only ever accompanies a game the owner chose to show");
  assert.match(html, /id="gameDisplaySection"[^>]*hidden/);
  assert.match(html, /id="gameDisplaySlot"/);
});

test("the owner still sees their own playtime privately; the setting only concerns the public GamID", () => {
  assert.match(account, /Number\.isInteger\(game\.playtime_minutes\) \? gameHours\(game\.playtime_minutes\)/);
  assert.match(account, /You always see your own playtime in your private lists\./);
});

test("the switch is provider-neutral in the editor code too: no provider name inside the game display block", () => {
  const block = account.slice(account.indexOf("// Game display (provider-neutral)"), account.indexOf("async function loadConnections"));
  assert.doesNotMatch(block.replace('new Set(["steam"])', ""), /steam|xbox|playstation|discord/i);
  assert.doesNotMatch(block, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test("no earlier migration or module was rewritten: the previous newest migration is intact and still the one before this", () => {
  assert.equal(migrations[migrations.indexOf(migrationName) - 1], "20260920230000_steam_my_games.sql");
  assert.match(read("supabase/migrations/20260920230000_steam_my_games.sql"), /playtime_minutes integer check \(playtime_minutes is null or playtime_minutes >= 0\)/);
});
