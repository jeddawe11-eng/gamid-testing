import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const html = await read("../dist/account/index.html");
const css = await read("../dist/account/account.css");
const controller = (await read("../dist/account/account.js")).replace(/\r\n/g, "\n");
const client = await read("../dist/account/supabase-client.js");
const migration = await read("../supabase/migrations/20260919130000_gaming_connections_foundation.sql");
const config = await read("../supabase/config.toml");
const pkg = JSON.parse(await read("../package.json"));

const connectionsBlock = controller.slice(controller.indexOf("// Connections (Gaming Connections Engine"), controller.indexOf('window.addEventListener("pageshow", event => {\n  if (!event.persisted || !identity)'));

test("CONNECTIONS lives inside the existing YOUR GAMID identity view, not a new page", () => {
  const identityView = html.slice(html.indexOf('id="identityView"'));
  assert.ok(identityView.includes('id="connectionsSection"'), "Connections section must be inside the identity view");
  assert.match(html, /id="connectionsList"[^>]*aria-live="polite"/);
  assert.match(html, /id="connectionsMessage"[^>]*role="status"[^>]*hidden/);
  assert.match(html, /Connected accounts stay private until you choose to show them/);
});

test("the frontend only talks to the Discord connection boundary via the session-authenticated client", () => {
  // Steam Connection Foundation added a second provider; the list is an exact allow-list, never "any provider".
  assert.match(client, /CONNECTABLE_PROVIDERS = new Set\(\["discord", "steam"\]\)/);
  assert.match(client, /\/functions\/v1\/\$\{provider\}-connect-start/);
  assert.match(client, /export async function getMyConnections/);
  assert.match(client, /rpc\("disconnect_my_connection"/);
  assert.match(controller, /FRONTEND_CONNECTABLE = new Set\(\["discord", "steam"\]\)/);
});

test("the Connect action only navigates to the official provider URL (Discord authorize / Steam OpenID), validated first", () => {
  assert.match(connectionsBlock, /discord: \{ name: "Discord", prefix: "https:\/\/discord\.com\/oauth2\/authorize\?" \}/);
  assert.match(connectionsBlock, /steam: \{ name: "Steam", prefix: "https:\/\/steamcommunity\.com\/openid\/login\?" \}/);
  const assign = connectionsBlock.indexOf("location.assign(target)");
  const validation = connectionsBlock.indexOf("startsWith(auth.prefix)");
  assert.ok(validation > -1 && assign > validation, "URL must be validated before navigation");
});

test("connection UI renders server-provided values through DOM text APIs only", () => {
  assert.doesNotMatch(connectionsBlock, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(connectionsBlock, /replaceChildren/);
  assert.match(connectionsBlock, /referrerPolicy = "no-referrer"/);
  assert.match(connectionsBlock, /startsWith\("https:\/\/cdn\.discordapp\.com\/"\)/);
});

test("the UI shows no token, code, secret, or internal identifier", () => {
  assert.doesNotMatch(connectionsBlock, /provider_account_id|connection_id|entity_id|access_token|refresh_token|client_secret|authorization_code/);
  assert.match(connectionsBlock, /Private — not shown on your public GamID/);
  const owner = migration.slice(migration.indexOf("create function private.get_my_connections_impl"));
  const ownerSelect = owner.slice(0, owner.indexOf("$$;"));
  assert.doesNotMatch(ownerSelect, /provider_account_id/);
});

test("return parameters are consumed once, stripped from the URL, and mapped to allow-listed messages", () => {
  assert.match(connectionsBlock, /history\.replaceState\(null, "", `\$\{location\.pathname\}\$\{location\.hash\}`\)/);
  assert.match(connectionsBlock, /CONNECTION_ERRORS\[reason\] \|\| CONNECTION_ERRORS\.server_error/);
  for (const reason of ["invalid_state", "already_used", "expired", "account_in_use", "other_account_connected", "not_configured", "provider_error"]) {
    assert.match(connectionsBlock, new RegExp(`${reason}:`), `missing message for ${reason}`);
  }
  // Untrusted query text is never rendered directly.
  assert.doesNotMatch(connectionsBlock, /showConnectionsMessage\(\s*(params|reason|result)\b/);
});

test("disconnect is explicit (two steps) and preserves the rest of the GamID", () => {
  assert.match(connectionsBlock, /confirmingDisconnect = null; renderConnections\(\)/);
  assert.match(connectionsBlock, /Your GamID, Intro, and public profile stay exactly as they are/);
  assert.match(connectionsBlock, /api\.disconnectConnection\(provider\)/);
});

test("connect button is guarded against double-open and restored after bfcache return", () => {
  assert.match(connectionsBlock, /if \(connectingProvider\) return;/);
  assert.match(connectionsBlock, /button\.disabled = Boolean\(connectingProvider\)/);
  assert.match(controller, /event\.persisted \|\| !identity|!event\.persisted \|\| !identity/);
});

test("connections load before the identity view is shown and after it handle the return", () => {
  const show = controller.slice(controller.indexOf("  renderShare();\n  await loadConnections();"));
  assert.match(show, /await loadConnections\(\);\s*(await loadLeague\(\);\s*)?showView\("identity"\);\s*handleConnectionReturn\(\);/);
});

test("connections styling keeps touch targets and does not hide the message states", () => {
  assert.match(css, /\.connection-actions \.connection-button\{[^}]*min-height:2\.9rem/);
  assert.match(css, /\.connections-message\.success/);
  assert.match(css, /\.connection-chip\.is-connected/);
});

test("no secret material or service-role credentials ship in the static frontend", async () => {
  const files = [];
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
      if (entry.isDirectory()) await walk(target); else files.push(target);
    }
  };
  await walk(new URL("../dist/", import.meta.url));
  for (const file of files) {
    if (!/\.(js|html|css|json|txt|md)$/i.test(file.pathname)) continue;
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY|service_role|DISCORD_CLIENT_SECRET|client_secret/i, `${file.pathname} must not reference server secrets`);
  }
});

test("Edge Function JWT policy is pinned: start needs a GamID session, callback is Discord's redirect", () => {
  assert.match(config, /\[functions\.discord-connect-start\]\s*verify_jwt = true/);
  assert.match(config, /\[functions\.discord-connect-callback\]\s*verify_jwt = false/);
});

test("the OAuth helper is included in the syntax/type gate", () => {
  assert.match(pkg.scripts.typecheck, /supabase\/functions\/_shared\/discord-oauth\.js/);
});

test("the connections migration never widens anonymous access", () => {
  assert.match(migration, /revoke all on table[^;]*public\.gaming_connections[^;]*from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant[^;]*\bto\s+[^;]*\banon\b/i);
  assert.match(migration, /is_public boolean not null default false/);
  assert.match(migration, /alter table public\.gaming_connections enable row level security/);
});

// ================================================================================================
// Riot discovery validation — private diagnostic only
// ================================================================================================
const discoveryMigration = await read("../supabase/migrations/20260919170000_connection_discovery_riot_validation.sql");
const oauthModule = await read("../supabase/functions/_shared/discord-oauth.js");

const listFiles = async (dir, out = []) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) await listFiles(target, out); else out.push(target);
  }
  return out;
};

test("discovery panel is a private, explicitly-labelled diagnostic inside the existing Connections card", () => {
  assert.match(connectionsBlock, /DISCOVERED THROUGH DISCORD/);
  assert.match(connectionsBlock, /PRIVATE — DISCOVERY TEST/);
  assert.match(connectionsBlock, /Diagnostic only — never shown on your public GamID/);
  assert.match(connectionsBlock, /if \(row\.connected && row\.provider_key === "discord"\) card\.append\(discoveryPanel\(row\)\)/);
  assert.match(client, /export async function getMyConnectionDiscovery/);
  assert.match(client, /rpc\("get_my_connection_discovery"\)/);
});

test("the extra Discord permission is only requested by an explicit user click — never silently, never by disconnecting", () => {
  assert.match(connectionsBlock, /Grant permission & run Riot discovery test/);
  assert.match(connectionsBlock, /Run Riot discovery test again/);
  const panel = connectionsBlock.slice(connectionsBlock.indexOf("function discoveryPanel"), connectionsBlock.indexOf("function connectionCard"));
  assert.match(panel, /button\.addEventListener\("click", \(\) => beginConnection\(row\.provider_key\)\)/);
  assert.doesNotMatch(panel, /disconnectConnection|finishDisconnect|location\.assign|setTimeout/);
  const load = connectionsBlock.slice(connectionsBlock.indexOf("async function loadConnections"), connectionsBlock.indexOf("async function beginConnection"));
  assert.doesNotMatch(load, /beginConnection|startConnection|location\./, "loading connections never starts an authorization on its own");
});

test("the discovery panel never renders or requests the id fingerprint, raw ids, tokens or unrelated accounts", () => {
  const panel = connectionsBlock.slice(connectionsBlock.indexOf("function discoveryPanel"), connectionsBlock.indexOf("function connectionCard"));
  assert.doesNotMatch(panel, /sha256|fingerprint|candidate_|access_token|refresh_token|connection_id|entity_id|provider_account_id|innerHTML/);
  assert.match(panel, /not stored or shown/);
  const ownerFn = discoveryMigration.slice(discoveryMigration.indexOf("create function private.get_my_connection_discovery_impl"), discoveryMigration.indexOf("create function public.get_my_connection_discovery"));
  assert.doesNotMatch(ownerFn.slice(0, ownerFn.indexOf("language plpgsql")), /sha256|connection_id|entity_id/, "the owner RPC's declared columns exclude the fingerprint and internal ids");
  assert.doesNotMatch(ownerFn.slice(ownerFn.indexOf("return query")), /external_id_sha256/);
});

test("discovery return codes are mapped to fixed messages; nothing from the URL is rendered", () => {
  for (const word of ["found", "absent", "unavailable"]) assert.match(connectionsBlock, new RegExp(`${word}: "`));
  assert.match(connectionsBlock, /DISCOVERY_RETURN\[discovery\]/);
  assert.doesNotMatch(connectionsBlock, /showConnectionsMessage\([^)]*params\.get/);
});

test("the discovery migration is owner-private, backend-write-only, cascade-deleted, and stores no token or raw id", () => {
  assert.match(discoveryMigration, /alter table public\.connection_discovery_results enable row level security/);
  assert.match(discoveryMigration, /revoke all on table public\.connection_discovery_results from public, anon, authenticated/);
  assert.match(discoveryMigration, /connection_id uuid not null references public\.gaming_connections\(connection_id\) on delete cascade/);
  assert.doesNotMatch(discoveryMigration, /grant[^;]*\bto\s+[^;]*\banon\b/i);
  assert.doesNotMatch(discoveryMigration, /access_token|refresh_token|\btoken\b\s+text/i);
  assert.doesNotMatch(discoveryMigration, /external_id\s+text/, "the raw external id has no column");
  assert.match(discoveryMigration, /external_id_sha256 text check \(external_id_sha256 is null or external_id_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(discoveryMigration, /current_user <> 'service_role'/);
  const grants = discoveryMigration.slice(discoveryMigration.indexOf("grant execute on function private.get_my_connection_discovery_impl()"));
  assert.match(grants, /public\.get_my_connection_discovery\(\) to authenticated/);
  assert.match(grants, /public\.record_connection_discovery\([^)]*\)\s*to service_role/);
  assert.doesNotMatch(discoveryMigration, /gaming_connections\s+add column|alter table public\.gaming_connections\s+(add|alter|drop)/i, "the existing connections table is untouched (no schema change to accepted Discord data)");
});

test("the requested Discord scopes are exactly identify + connections, and no other Discord endpoint is used", () => {
  assert.match(oauthModule, /scopes: Object\.freeze\(\["identify", "connections"\]\)/);
  assert.match(oauthModule, /scope: "identify connections"/);
  const urls = [...oauthModule.matchAll(/https:\/\/discord\.com\/[^"'`\s)]+/g)].map(match => match[0]).sort();
  assert.deepEqual(urls, [
    "https://discord.com/api/oauth2/token",
    "https://discord.com/api/oauth2/token/revoke",
    "https://discord.com/api/v10/users/@me",
    "https://discord.com/api/v10/users/@me/connections",
    "https://discord.com/oauth2/authorize",
  ]);
  assert.doesNotMatch(oauthModule, /scopes?:\s*[^\n]*(guilds|email|messages\.read|activities|rpc|\bbot\b|webhook)/i, "no broader scope is ever requested");
  assert.equal([...oauthModule.matchAll(/scope: "([^"]*)"/g)].map(match => match[1]).join("|"), "identify connections");
});

// Updated by Public Profile Expansion Phase 1: Discord may now be PRESENTED on the public route, but only from the server-gated
// `public_sections` object of the anonymous public-safe response (a hidden section is simply absent). The route must still know
// nothing about the private connection machinery: discovery, owner RPCs, the connections table, tokens, or provider ids.
test("the public route presents Discord only from the server-gated public_sections and knows nothing of the private connection machinery", async () => {
  const files = (await listFiles(new URL("../dist/public/", import.meta.url))).filter(file => /\.(js|html|css)$/i.test(file.pathname));
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /discovery|get_my_|gaming_connections|connection_discovery|connection_oauth|provider_account|access_token|refresh_token|client_secret|avatar_url|snowflake/i, `${file.pathname} must not know about private connection data`);
  }
  const publicJs = await readFile(new URL("../dist/public/public.js", import.meta.url), "utf8");
  assert.match(publicJs, /identity\.public_sections/);
  assert.doesNotMatch(publicJs, /rpc\(|fetch\(/, "the public renderer makes no requests of its own");
});

// Updated by the League prototype slice: the original guard forbade OP.GG everywhere. OP.GG is now allowed in exactly ONE
// isolated adapter module (plus the Edge Function glue that names it and the owner UI's plain-text "OP.GG" source label);
// everything else must still be free of it, and no official Riot API / RSO / development key may appear anywhere.
test("no Riot API, RSO, or Riot key exists anywhere in the shipped code; OP.GG exists only in the isolated adapter (plus its glue and a UI label)", async () => {
  const files = [...(await listFiles(new URL("../dist/", import.meta.url))), ...(await listFiles(new URL("../supabase/functions/", import.meta.url)))]
    .filter(file => /\.(js|ts|html)$/i.test(file.pathname) && !/qrcode\.min\.js$/i.test(file.pathname));
  const allowedOpgg = /(_shared\/league\/opgg-adapter\.js|functions\/league-lookup\/index\.ts|dist\/account\/account\.js|dist\/public\/public\.js)$/;
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /api\.riotgames\.com|riotgames\.com\/oauth|auth\.riotgames|RGAPI-|leagueoflegends\.com|RIOT_API_KEY|RSO_/i, `${file.pathname} must not use official Riot APIs, RSO, or a Riot key`);
    if (allowedOpgg.test(file.pathname)) continue;
    assert.doesNotMatch(text, /op\.gg|opgg|\/lol\/(summoner|league)/i, `${file.pathname} must not know about OP.GG`);
  }
  const ui = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /https?:\/\/[^\s"'`]*op\.gg/i, "the browser code never contains an OP.GG URL");
  assert.doesNotMatch(await readFile(new URL("../dist/public/public.js", import.meta.url), "utf8"), /https?:\/\/[^\s"'`]*op\.gg/i, "the public renderer carries only the plain-text source label, never an OP.GG URL");
});