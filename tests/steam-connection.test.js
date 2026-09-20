import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260920190000_steam_connection_foundation.sql");
const foundation = read("supabase/migrations/20260919130000_gaming_connections_foundation.sql");
const sections = read("supabase/migrations/20260920140000_public_section_visibility.sql");
const controller = read("dist/account/account.js");
const client = read("dist/account/supabase-client.js");
const publicJs = read("dist/public/public.js");
const config = read("supabase/config.toml");

const stripComments = sql => sql.replace(/--[^\n]*/g, "");
const squash = text => stripComments(text).replace(/create or replace function/gi, "create function").replace(/\s+/g, " ").trim();
const code = stripComments(migration);

// The full text of one function definition (from its "create ... function <name>" line to its closing $$;)
function fn(sql, name) {
  const start = sql.search(new RegExp(`create (?:or replace )?function ${name.replace(/[.()]/g, "\\$&")}`));
  assert.ok(start >= 0, `${name} exists`);
  const end = sql.indexOf("\n$$;", start);
  assert.ok(end > start, `${name} is terminated`);
  return sql.slice(start, end + 4);
}

// ------------------------------------------------------------------------------------------------ migration: additive and minimal

test("the migration is additive: no destructive statement, no update/delete of any existing row, no table dropped or recreated", () => {
  assert.doesNotMatch(code, /\bdrop\s+(table|column|schema|function|policy)\b/i);
  assert.doesNotMatch(code, /\btruncate\b/i);
  assert.doesNotMatch(code, /\bdelete\s+from\b/i);
  // Rows are only ever written by the Steam completion function; nothing at top level updates existing data.
  const outsideFunctions = code.replace(/create (?:or replace )?function[\s\S]*?\n\$\$;/gi, "");
  assert.doesNotMatch(outsideFunctions, /\bupdate\s+public\./i);
  assert.doesNotMatch(outsideFunctions, /\binsert\s+into\s+public\.gaming_connections\b/i);
  assert.match(outsideFunctions, /insert into public\.connection_provider_catalog \(provider_key, label, sort_order\) values \('steam', 'Steam', 15\);/);
  assert.match(outsideFunctions, /insert into public\.public_section_catalog \(section_key, label, section_kind, sort_order\) values \('steam', 'Steam', 'CONNECTION', 15\);/);
  assert.equal([...outsideFunctions.matchAll(/\binsert\s+into\b/gi)].length, 2, "only the two registry rows are inserted");
  assert.match(code, /add column auth_method text/);
});

test("the only new column is nullable provenance; existing Discord rows are not back-filled or touched", () => {
  assert.equal([...code.matchAll(/add column/gi)].length, 1);
  assert.doesNotMatch(code, /auth_method[^;]*not null/i);
  // Nothing outside a function body (i.e. nothing that runs when the migration is applied) mentions Discord at all.
  const outsideFunctions = code.replace(/create (?:or replace )?function[\s\S]*?\n\$\$;/gi, "");
  assert.doesNotMatch(outsideFunctions, /discord/i);
});

test("a steam row is constrained by the table itself: SteamID64 shape and range, CONNECTED (never VERIFIED), Steam OpenID provenance - and NULL cannot slip past the CHECK", () => {
  const check = code.slice(code.indexOf("gaming_connections_steam_identity_check"), code.indexOf(");", code.indexOf("gaming_connections_steam_identity_check")));
  assert.match(check, /provider_key <> 'steam'/);
  assert.match(check, /provider_account_id ~ '\^\[0-9\]\{17\}\$'/);
  assert.match(check, /between '76561197960265729' and '76561202255233023'/);
  assert.match(check, /trust_status = 'CONNECTED'/);
  assert.doesNotMatch(check, /VERIFIED/);
  assert.match(check, /auth_method is not distinct from 'STEAM_OPENID_2_0'/, "IS NOT DISTINCT FROM: a plain '=' would let a NULL auth_method pass the CHECK");
});

// ------------------------------------------------------------------------------------------------ provider isolation

test("the shared ledger is provider-isolated: the Discord functions differ from their accepted versions ONLY by the added provider guard", () => {
  const oldConsume = squash(fn(foundation, "private.consume_connection_attempt_impl"));
  const newConsume = squash(fn(migration, "private.consume_connection_attempt_impl"));
  assert.equal(newConsume, oldConsume.replace("where t.state_hash = sha256(convert_to(candidate_state, 'UTF8')) for update;", "where t.state_hash = sha256(convert_to(candidate_state, 'UTF8')) and t.provider_key = 'discord' for update;"));
  assert.notEqual(newConsume, oldConsume);

  const oldComplete = squash(fn(foundation, "private.complete_connection_attempt_impl"));
  const newComplete = squash(fn(migration, "private.complete_connection_attempt_impl"));
  assert.equal(newComplete, oldComplete.replace("if not found or att.consumed_at is null then return 'INVALID_STATE'; end if;", "if not found or att.consumed_at is null or att.provider_key <> 'discord' then return 'INVALID_STATE'; end if;"));
  assert.notEqual(newComplete, oldComplete);
});

test("the section-visibility functions differ from Phase 1 ONLY by the added steam branches", () => {
  const stripSteamLines = text => text.replace(/\n\s*when 'steam' then[^\n]*/g, "");
  assert.equal(squash(stripSteamLines(fn(migration, "private.get_my_section_visibility_impl"))), squash(fn(sections, "private.get_my_section_visibility_impl")));
  const setNew = fn(migration, "private.set_my_section_visibility_impl").replace(/\n\s*elsif key = 'steam' then[\s\S]*?(?=\n\s*elsif key = 'league' then)/, "");
  assert.equal(squash(setNew), squash(fn(sections, "private.set_my_section_visibility_impl")));
});

test("the public boundary differs from Phase 1 ONLY by the steam section (same function, same 14 columns, same grants)", () => {
  const withoutSteam = fn(migration, "private.get_public_identity_impl").replace(/select 'steam'::text,[\s\S]*?g\.provider_key = 'steam' and g\.is_public\s*union all\s*/, "");
  assert.equal(squash(withoutSteam), squash(fn(sections, "private.get_public_identity_impl")));
  assert.doesNotMatch(code, /create (?:or replace )?function public\.get_public_identity/, "the anonymous wrappers, their columns and grants are not redefined");
  assert.doesNotMatch(code, /grant execute[^;]*get_public_identity[^;]*anon/i);
});

test("Steam is public ONLY when published (existing gate) AND the owner switched it on, and exposes exactly the SteamID64 and the trust label", () => {
  const impl = fn(migration, "private.get_public_identity_impl");
  assert.match(impl, /e\.visibility = 'PUBLIC'/, "the whole-GamID gate stays on top");
  const branch = impl.slice(impl.indexOf("select 'steam'::text"), impl.indexOf("union all", impl.indexOf("select 'steam'::text")));
  assert.match(branch, /g\.provider_key = 'steam' and g\.is_public/);
  const payload = branch.slice(branch.indexOf("jsonb_build_object"), branch.indexOf("from public.gaming_connections"));
  assert.deepEqual([...payload.matchAll(/'([a-z_]+)',/g)].map(match => match[1]), ["steam_id", "trust_status"]);
  assert.doesNotMatch(payload, /connection_id|entity_id|auth_method|provider_username|connected_at|updated_at|is_public|attempt|state|token/);
  assert.doesNotMatch(impl, /connection_oauth_attempts/);
});

// ------------------------------------------------------------------------------------------------ privileges

test("the Steam ledger functions are backend-only (service_role) and unreachable by anon/authenticated; RLS is not weakened", () => {
  for (const name of ["consume_connection_attempt_for", "complete_steam_connection_attempt"]) {
    assert.match(fn(migration, `public.${name}`), /current_user <> 'service_role'[^;]*BACKEND_ONLY/);
  }
  assert.match(code, /revoke all on function\s+private\.consume_connection_attempt_for_impl\(text, text\), private\.complete_steam_connection_attempt_impl\(uuid, text\),\s+public\.consume_connection_attempt_for\(text, text\), public\.complete_steam_connection_attempt\(uuid, text\)\s+from public, anon, authenticated;/);
  assert.match(code, /grant execute on function\s+private\.consume_connection_attempt_for_impl\(text, text\), private\.complete_steam_connection_attempt_impl\(uuid, text\),\s+public\.consume_connection_attempt_for\(text, text\), public\.complete_steam_connection_attempt\(uuid, text\)\s+to service_role;/);
  assert.doesNotMatch(code, /to anon/i);
  assert.doesNotMatch(code, /grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?/i, "no new table grant of any kind");
  assert.doesNotMatch(code, /disable row level security|create policy|drop policy|alter policy/i);
  for (const definition of [fn(migration, "private.consume_connection_attempt_for_impl"), fn(migration, "private.complete_steam_connection_attempt_impl")]) {
    assert.match(definition, /security definer\s+set search_path = ''/);
  }
});

test("the Steam completion links only what the consumed attempt owns, never overwrites, defaults to private, and records provenance", () => {
  const complete = fn(migration, "private.complete_steam_connection_attempt_impl");
  assert.match(complete, /att\.consumed_at is null or att\.provider_key <> 'steam'/);
  assert.match(complete, /for update/, "the attempt row is locked so concurrent callbacks serialize");
  assert.match(complete, /att\.user_id and m\.entity_id = att\.entity_id and m\.role = 'OWNER'|m\.user_id = att\.user_id and m\.entity_id = att\.entity_id and m\.role = 'OWNER'/);
  assert.match(complete, /OWNER_HAS_OTHER_ACCOUNT/);
  assert.match(complete, /ACCOUNT_ALREADY_LINKED/);
  const insert = complete.slice(complete.indexOf("insert into public.gaming_connections"), complete.indexOf("result := 'CONNECTED'"));
  assert.match(insert, /\(entity_id, provider_key, provider_account_id, provider_username, trust_status, auth_method\)/);
  assert.match(insert, /'CONNECTED', 'STEAM_OPENID_2_0'/);
  assert.doesNotMatch(insert, /is_public/, "left at its default (false)");
  const reconnect = complete.slice(complete.indexOf("if found then"), complete.indexOf("else\n    begin"));
  assert.doesNotMatch(reconnect, /is_public/, "a same-account re-authentication never flips the visibility switch");
});

test("no library, ownership, game, or Steam Web API concept exists in the schema", () => {
  assert.doesNotMatch(code, /owned_games|game_library|appid|playtime|achievement|marvel|rivals|api\.steampowered|steam_api/i);
});

// ------------------------------------------------------------------------------------------------ functions config

test("Steam functions are pinned like Discord's: start needs the owner's JWT, the callback (Steam's redirect) cannot carry one", () => {
  assert.match(config, /\[functions\.steam-connect-start\]\s*verify_jwt = true/);
  assert.match(config, /\[functions\.steam-connect-callback\]\s*verify_jwt = false/);
  assert.match(config, /\[functions\.discord-connect-start\]\s*verify_jwt = true/);
  assert.match(config, /\[functions\.discord-connect-callback\]\s*verify_jwt = false/);
});

// ------------------------------------------------------------------------------------------------ frontend

test("YOUR GAMID: Steam is a Gaming Connection with Connect Steam, CONNECTED, a Show on my GamID switch, and the shared confirm-to-disconnect flow", () => {
  assert.match(client, /CONNECTABLE_PROVIDERS = new Set\(\["discord", "steam"\]\)/);
  assert.match(controller, /FRONTEND_CONNECTABLE = new Set\(\["discord", "steam"\]\)/);
  const card = controller.slice(controller.indexOf("function connectionCard"), controller.indexOf("function renderConnections"));
  assert.match(card, /`Connect \$\{row\.label\}`/);
  assert.match(card, /"CONNECTED" : "NOT CONNECTED"/);
  assert.match(card, /row\.provider_key === "discord" \|\| row\.provider_key === "steam"/);
  assert.match(card, /confirmingDisconnect === row\.provider_key/, "Disconnect asks for a deliberate confirmation, the same path Discord uses");
  assert.match(card, /`Disconnect \$\{row\.label\} from your GamID\? Your GamID, Intro, and public profile stay exactly as they are\.`/);
  assert.match(card, /SteamID64 \$\{row\.provider_username\}/);
  // (Steam My Games later added the explicit, owner-triggered discovery; the connection note now only claims what sign-in proves.)
  assert.match(card, /Signed in through Steam\. This confirms the Steam account only; nothing about any game is verified\./);
  assert.doesNotMatch(card, /provider_account_id|connection_id|entity_id/);
  assert.match(card, /Only your SteamID64 \$\{row\.is_public \? "is" : "would be"\} shown\./);
  assert.match(card, /row\.connected && row\.provider_key === "discord"\) card\.append\(discoveryPanel\(row\)\)/, "the Riot discovery panel stays Discord-only");
  assert.equal([...card.matchAll(/discoveryPanel/g)].length, 1, "and is referenced exactly once (never for Steam)");
});

test("the SteamID64 wraps instead of being ellipsized on narrow screens, with rules scoped to the Steam card only", () => {
  const css = read("dist/account/account.css");
  const block = css.slice(css.indexOf("/* Steam Connection Foundation:"));
  assert.match(block, /\.connection-card\[data-provider="steam"\] \.connection-head\{flex-wrap:wrap/);
  assert.match(block, /\.connection-card\[data-provider="steam"\] \.connection-name\{overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere/);
  const selectors = [...block.matchAll(/(^|\})\s*([^{}\/]+)\{/g)].map(match => match[2].trim()).filter(Boolean);
  assert.ok(selectors.length >= 4);
  for (const selector of selectors) {
    for (const part of selector.split(",")) assert.match(part.trim(), /^\.connection-card\[data-provider="steam"\]/, `${part.trim()} is Steam-scoped`);
  }
  assert.match(controller, /card\.dataset\.provider = row\.provider_key/, "the Steam card is addressable by its provider key");
});

test("Connect Steam navigates only to Steam's official OpenID URL, validated before navigation; Steam return codes are fixed allow-listed messages", () => {
  assert.match(controller, /steam: \{ name: "Steam", prefix: "https:\/\/steamcommunity\.com\/openid\/login\?" \}/);
  const begin = controller.slice(controller.indexOf("async function beginConnection"), controller.indexOf("async function finishDisconnect"));
  assert.ok(begin.indexOf("startsWith(auth.prefix)") > -1 && begin.indexOf("location.assign(target)") > begin.indexOf("startsWith(auth.prefix)"));
  const back = controller.slice(controller.indexOf("function handleConnectionReturn"), controller.indexOf('window.addEventListener("pageshow"'));
  assert.match(back, /provider !== "discord" && provider !== "steam"/);
  assert.match(back, /STEAM_RETURN_OK\[result\]/);
  assert.match(back, /history\.replaceState/, "return parameters are stripped from the URL");
  assert.doesNotMatch(back, /openid|steamid|claimed_id|assertion/i, "the browser never reads an OpenID field or a SteamID from the URL");
  for (const reason of ["provider_error", "verification_failed", "account_in_use", "other_account_connected", "not_configured", "server_error"]) {
    assert.match(controller, new RegExp(`STEAM_ERRORS = \\{[\\s\\S]*${reason}:`));
  }
});

test("the browser never asks for or handles a Steam credential, an OpenID assertion, or a Steam API", () => {
  const everything = controller + client;
  assert.doesNotMatch(everything, /steam(?:community)?\.com\/(?:profiles|id)\/|api\.steampowered|GetOwnedGames|steam_?api|Steam ?Guard/i);
  assert.doesNotMatch(controller.slice(controller.indexOf("STEAM_ERRORS"), controller.indexOf("STEAM_ERRORS") + 900), /password/i);
});

test("the public page shows Steam only from public_sections, as validated plain text, saying CONNECTED and nothing about any game", () => {
  const block = publicJs.slice(publicJs.indexOf("const steam = sections?.steam;"), publicJs.indexOf("const league = sections?.league;"));
  assert.match(block, /\/\^\[0-9\]\{17\}\$\/\.test\(steam\.steam_id\)/);
  assert.match(block, /node\("span", "public-chip", "CONNECTED"\)/);
  assert.doesNotMatch(block, /VERIFIED|verified|game|owns|library|href|innerHTML|<a /i);
  assert.doesNotMatch(publicJs, /steamcommunity|api\.steampowered/i);
});

// ------------------------------------------------------------------------------------------------ scope guards

test("Steam code is isolated from Discord code and Discord's own source was not changed by this phase", () => {
  for (const path of ["supabase/functions/_shared/discord-oauth.js", "supabase/functions/discord-connect-start/index.ts", "supabase/functions/discord-connect-callback/index.ts"]) {
    assert.doesNotMatch(read(path), /steam/i, `${path} has no Steam logic`);
  }
  assert.doesNotMatch(read("supabase/functions/_shared/steam-openid.js"), /discord/i);
});

test("scope of the Steam code: the official games API lives in exactly one backend module, Marvel Rivals is only recognized, no other provider, no Production reference", () => {
  const files = [];
  const walk = dir => { for (const entry of readdirSync(dir)) { const full = join(dir, entry); if (statSync(full).isDirectory()) walk(full); else files.push(full); } };
  for (const root of ["dist", "supabase/functions"]) walk(new URL(`../${root}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const source = files.filter(path => /\.(js|ts|html|css)$/.test(path) && !/qrcode\.min\.js$/.test(path)).map(path => readFileSync(path, "utf8")).join("\n");
  const filesMatching = pattern => files.filter(path => /\.(js|ts|html|css)$/.test(path) && !/qrcode\.min\.js$/.test(path) && pattern.test(readFileSync(path, "utf8"))).map(path => path.replace(/\\/g, "/").replace(/^.*\/(dist|supabase)\//, "$1/"));
  // Steam My Games: the official Web API is contacted from ONE backend module only - never from the browser, the public page, or the OpenID module.
  assert.deepEqual(filesMatching(/GetOwnedGames|IPlayerService|api\.steampowered/i), ["supabase/functions/_shared/steam-games.js"]);
  // Marvel Rivals is only ever RECOGNIZED (an App ID constant and a "Discovered via Steam" label) - never on the public page, never in the schema of the OpenID/foundation.
  assert.deepEqual(filesMatching(/marvel ?rivals/i).sort(), ["dist/account/account.js", "supabase/functions/_shared/steam-games.js"]);
  assert.doesNotMatch(source, /xbox live|playstation network|battle\.net/i);
  assert.doesNotMatch(migration + read("supabase/functions/_shared/steam-openid.js"), /production|prod\./i);
});
