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
  assert.match(client, /CONNECTABLE_PROVIDERS = new Set\(\["discord"\]\)/);
  assert.match(client, /\/functions\/v1\/\$\{provider\}-connect-start/);
  assert.match(client, /export async function getMyConnections/);
  assert.match(client, /rpc\("disconnect_my_connection"/);
  assert.match(controller, /FRONTEND_CONNECTABLE = new Set\(\["discord"\]\)/);
});

test("the Connect action only navigates to the official Discord authorize URL", () => {
  assert.match(connectionsBlock, /startsWith\("https:\/\/discord\.com\/oauth2\/authorize\?"\)/);
  const assign = connectionsBlock.indexOf("location.assign(target)");
  const validation = connectionsBlock.indexOf('startsWith("https://discord.com/oauth2/authorize?")');
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
  assert.match(show, /await loadConnections\(\);\s*showView\("identity"\);\s*handleConnectionReturn\(\);/);
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
