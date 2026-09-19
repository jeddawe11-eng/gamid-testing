import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  DISCORD_OAUTH, RETURN_URL, SITE_ORIGIN, buildAuthorizeUrl, buildAvatarUrl, handleCallback, handleStart, isRiotType, readEnv, redirectUriFor, summarizeConnections,
} from "../supabase/functions/_shared/discord-oauth.js";

const SUPABASE = "https://example-project.supabase.co";
const SECRET = "test-discord-client-secret-value";
const SERVICE_KEY = "test-service-role-key-value";
const ANON_KEY = "test-anon-key-value";
const ENV = { supabaseUrl: SUPABASE, anonKey: ANON_KEY, serviceKey: SERVICE_KEY, discordClientId: "999000111222333444", discordClientSecret: SECRET };
const CALLBACK_URI = `${SUPABASE}/functions/v1/discord-connect-callback`;

// A fake backend + Discord that implements exactly the database contract proven against live TESTING by
// tests/integration/gaming-connections-db.sql (one-time consume, REPLAYED/EXPIRED/INVALID_STATE, ownership-safe linking).
function makeWorld(options = {}) {
  const world = {
    calls: [],
    attempts: new Map(),
    connections: [],
    finished: [],
    discord: { tokenOk: true, userOk: true, revokeOk: true, throwOnToken: false, tokenBody: null, userBody: null, connectionsOk: true, connectionsBody: [], throwOnConnections: false, ...options.discord },
    discovery: [],
    failRecord: Boolean(options.failRecord),
    throwOnConsume: Boolean(options.throwOnConsume),
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const usersByToken = { "user-a-jwt": { user: "user-a", entity: "entity-a" }, "user-b-jwt": { user: "user-b", entity: "entity-b" } };

  world.newAttempt = (user, entity, extra = {}) => {
    const state = randomBytes(32).toString("hex");
    world.attempts.set(state, { id: `attempt-${world.attempts.size + 1}`, user, entity, consumed: false, completed: false, expired: false, ...extra });
    return state;
  };

  world.fetch = async (url, init = {}) => {
    const target = new URL(url);
    const record = { url: String(url), method: init.method || "GET", headers: { ...(init.headers || {}) }, body: init.body === undefined ? "" : String(init.body) };
    world.calls.push(record);
    const args = () => { try { return JSON.parse(record.body); } catch { return {}; } };

    if (target.origin === SUPABASE) {
      const name = target.pathname.replace("/rest/v1/rpc/", "");
      const bearer = String(record.headers.Authorization || "").replace(/^Bearer /, "");
      if (name === "start_connection_attempt") {
        const who = usersByToken[bearer];
        if (options.startError) return json({ message: options.startError }, options.startStatus || 400);
        if (!who) return json({ code: "PGRST301", message: "JWT invalid" }, 401);
        return json([{ state: world.newAttempt(who.user, who.entity), expires_at: "2099-01-01T00:00:00Z" }]);
      }
      if (bearer !== SERVICE_KEY) return json({ message: "permission denied" }, 403);
      if (name === "consume_connection_attempt") {
        if (world.throwOnConsume) throw new Error("network down: secret-ish detail");
        const attempt = world.attempts.get(args().candidate_state);
        const row = status => [{ attempt_id: null, owner_user_id: null, owner_entity_id: null, provider: null, status }];
        if (!attempt) return json(row("INVALID_STATE"));
        if (attempt.consumed) return json(row("REPLAYED"));
        attempt.consumed = true;
        if (attempt.expired) return json(row("EXPIRED"));
        return json([{ attempt_id: attempt.id, owner_user_id: attempt.user, owner_entity_id: attempt.entity, provider: "discord", status: "OK" }]);
      }
      if (name === "finish_connection_attempt") { world.finished.push(args()); return json(null, 200); }
      if (name === "complete_connection_attempt") {
        const a = args();
        const attempt = [...world.attempts.values()].find(item => item.id === a.candidate_attempt_id);
        if (!attempt || !attempt.consumed) return json("INVALID_STATE");
        if (attempt.completed) return json("REPLAYED");
        attempt.completed = true;
        const mine = world.connections.find(c => c.entity === attempt.entity);
        if (mine) {
          if (mine.accountId !== a.candidate_account_id) { attempt.outcome = "OWNER_HAS_OTHER_ACCOUNT"; return json("OWNER_HAS_OTHER_ACCOUNT"); }
          Object.assign(mine, { username: a.candidate_username, displayName: a.candidate_display_name, avatar: a.candidate_avatar_url });
          attempt.outcome = "RECONNECTED";
          return json("RECONNECTED");
        }
        if (world.connections.find(c => c.accountId === a.candidate_account_id)) { attempt.outcome = "ACCOUNT_ALREADY_LINKED"; return json("ACCOUNT_ALREADY_LINKED"); }
        world.connections.push({ entity: attempt.entity, accountId: a.candidate_account_id, username: a.candidate_username, displayName: a.candidate_display_name, avatar: a.candidate_avatar_url });
        attempt.outcome = "CONNECTED";
        return json("CONNECTED");
      }
      // Mirrors private.record_connection_discovery_impl: only for a completed, successful link of the owner's own account.
      if (name === "record_connection_discovery") {
        const a = args();
        if (world.failRecord) return json({ message: "boom" }, 500);
        const attempt = [...world.attempts.values()].find(item => item.id === a.candidate_attempt_id);
        if (!attempt || !attempt.completed || !["CONNECTED", "RECONNECTED"].includes(attempt.outcome)) return json("INVALID_ATTEMPT");
        const connection = world.connections.find(c => c.entity === attempt.entity && c.accountId === a.candidate_account_id);
        if (!connection) return json("NO_CONNECTION");
        const found = a.candidate_status === "FOUND";
        connection.discovery = { ...a, candidate_attempt_id: undefined, candidate_account_id: undefined };
        if (!found) connection.discovery.candidate_name = null;
        world.discovery.push({ entity: attempt.entity, args: a });
        return json("RECORDED");
      }
    }

    if (String(url) === DISCORD_OAUTH.tokenUrl) {
      if (world.discord.throwOnToken) throw new Error("discord unreachable");
      if (!world.discord.tokenOk) return json({ error: "invalid_grant" }, 400);
      return json(world.discord.tokenBody || { access_token: "ACCESS_TOKEN_1", token_type: "Bearer", expires_in: 604800, refresh_token: "REFRESH_TOKEN_1", scope: "identify connections" });
    }
    if (String(url) === DISCORD_OAUTH.connectionsUrl) {
      if (world.discord.throwOnConnections) throw new Error("connections unreachable");
      if (!world.discord.connectionsOk) return json({ message: "403: Forbidden" }, 403);
      return json(world.discord.connectionsBody);
    }
    if (String(url) === DISCORD_OAUTH.userUrl) {
      if (!world.discord.userOk) return json({ message: "401: Unauthorized" }, 401);
      return json(world.discord.userBody || { id: "111111111111111111", username: "alice", global_name: "Alice", avatar: "a".repeat(32) });
    }
    if (String(url) === DISCORD_OAUTH.revokeUrl) return world.discord.revokeOk ? json({}) : json({ error: "server" }, 500);
    throw new Error(`unexpected fetch ${url}`);
  };
  return world;
}

const callbackRequest = (state, extra = "") => new Request(`${CALLBACK_URI}?code=abc123CODE&state=${state}${extra}`, { method: "GET" });
const runCallback = (world, request, log) => handleCallback({ request, env: ENV, fetchImpl: world.fetch, log });
const startRequest = (headers = {}, body = { provider: "discord" }, method = "POST") =>
  new Request(`${SUPABASE}/functions/v1/discord-connect-start`, { method, headers: { "content-type": "application/json", origin: SITE_ORIGIN, ...headers }, body: method === "POST" ? JSON.stringify(body) : undefined });
const discordCalls = world => world.calls.filter(c => c.url.startsWith("https://discord.com"));
const rpcCalls = (world, name) => world.calls.filter(c => c.url.endsWith(`/rpc/${name}`));
const location = response => new URL(response.headers.get("location"));

// ------------------------------------------------------------------------------------------------ authorization URL

test("the authorization URL is the official Discord authorize endpoint with exactly the intended scopes, exact redirect URI, and no PKCE fields", () => {
  const built = buildAuthorizeUrl({ clientId: "123", redirectUri: CALLBACK_URI, state: "s".repeat(64) });
  const url = new URL(built);
  assert.equal(`${url.origin}${url.pathname}`, "https://discord.com/oauth2/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "identify connections", "exactly two scopes: identify + connections (Riot discovery validation) — nothing broader");
  assert.match(built, /scope=identify%20connections(&|$)/, "scopes are separated by %20, the form Discord documents");
  assert.equal(built.includes("+"), false, "no form-encoded plus signs anywhere in the URL");
  assert.equal(url.searchParams.get("redirect_uri"), CALLBACK_URI);
  assert.equal(url.searchParams.get("client_id"), "123");
  assert.equal(url.searchParams.get("prompt"), "consent", "always show explicit consent; never silently re-authorize");
  assert.equal(url.searchParams.get("state"), "s".repeat(64));
  assert.equal(url.searchParams.has("code_challenge"), false, "PKCE is not documented by Discord and must not be simulated");
  assert.equal(url.searchParams.has("code_challenge_method"), false);
  assert.equal(DISCORD_OAUTH.scope, "identify connections");
  assert.deepEqual([...DISCORD_OAUTH.scopes], ["identify", "connections"]);
});

test("the redirect URI is derived from the project URL and matches the registered callback function exactly", () => {
  assert.equal(redirectUriFor(`${SUPABASE}/`), CALLBACK_URI);
  assert.equal(redirectUriFor(SUPABASE), CALLBACK_URI);
});

test("avatar URLs are only built from a valid Discord avatar hash on Discord's CDN", () => {
  assert.equal(buildAvatarUrl("111111111111111111", "a".repeat(32)), `https://cdn.discordapp.com/avatars/111111111111111111/${"a".repeat(32)}.png?size=128`);
  assert.equal(buildAvatarUrl("1", `a_${"b".repeat(32)}`)?.startsWith("https://cdn.discordapp.com/avatars/1/a_"), true);
  for (const bad of [null, undefined, "", "../../evil", "javascript:alert(1)", "z".repeat(32), "a".repeat(31)]) assert.equal(buildAvatarUrl("1", bad), null);
});

// ------------------------------------------------------------------------------------------------ START

test("start: CORS preflight is granted only to the GamID site origin", async () => {
  const allowed = await handleStart({ request: startRequest({}, null, "OPTIONS"), env: ENV, fetchImpl: makeWorld().fetch });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), SITE_ORIGIN);
  const denied = await handleStart({ request: startRequest({ origin: "https://evil.example" }, null, "OPTIONS"), env: ENV, fetchImpl: makeWorld().fetch });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("start: a foreign browser origin is refused and nothing is called", async () => {
  const world = makeWorld();
  const response = await handleStart({ request: startRequest({ origin: "https://evil.example", authorization: "Bearer user-a-jwt" }), env: ENV, fetchImpl: world.fetch });
  assert.equal(response.status, 403);
  assert.equal(world.calls.length, 0);
});

test("start: fails closed with 503 when Discord credentials are not configured, without calling the database", async () => {
  for (const missing of ["discordClientId", "discordClientSecret", "serviceKey"]) {
    const world = makeWorld();
    const response = await handleStart({ request: startRequest({ authorization: "Bearer user-a-jwt" }), env: { ...ENV, [missing]: undefined }, fetchImpl: world.fetch });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "not_configured");
    assert.equal(world.calls.length, 0);
  }
});

test("start: requires a Bearer token and rejects anything else before touching the database", async () => {
  for (const authorization of [undefined, "", "Basic abc", "Bearer", "Bearer has spaces here"]) {
    const world = makeWorld();
    const response = await handleStart({ request: startRequest(authorization === undefined ? {} : { authorization }), env: ENV, fetchImpl: world.fetch });
    assert.equal(response.status, 401, `authorization=${authorization}`);
    assert.equal(world.calls.length, 0);
  }
});

test("start: only the discord provider and only POST are accepted", async () => {
  const world = makeWorld();
  assert.equal((await handleStart({ request: startRequest({ authorization: "Bearer user-a-jwt" }, { provider: "steam" }), env: ENV, fetchImpl: world.fetch })).status, 400);
  assert.equal((await handleStart({ request: startRequest({ authorization: "Bearer user-a-jwt" }, null, "GET"), env: ENV, fetchImpl: world.fetch })).status, 405);
  assert.equal(world.calls.length, 0);
});

test("start: success returns only the official authorization URL, forwards the USER's token (never the service key), and never exposes the client secret", async () => {
  const world = makeWorld();
  const response = await handleStart({ request: startRequest({ authorization: "Bearer user-a-jwt" }), env: ENV, fetchImpl: world.fetch });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), SITE_ORIGIN);
  const text = await response.clone().text();
  const body = JSON.parse(text);
  const url = new URL(body.authorization_url);
  assert.equal(url.origin + url.pathname, "https://discord.com/oauth2/authorize");
  assert.match(url.searchParams.get("state"), /^[0-9a-f]{64}$/);
  assert.equal(url.searchParams.get("redirect_uri"), CALLBACK_URI);
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes(SERVICE_KEY), false);
  const [call] = rpcCalls(world, "start_connection_attempt");
  assert.equal(call.headers.Authorization, "Bearer user-a-jwt", "the database must authenticate the user's own JWT");
  assert.equal(call.headers.apikey, ANON_KEY);
  assert.equal(call.body.includes(SERVICE_KEY), false);
  assert.deepEqual(Object.keys(body).sort(), ["authorization_url", "expires_at"]);
});

test("start: database errors map to safe HTTP statuses without leaking details", async () => {
  const cases = [["AUTH_REQUIRED", 401, 401], ["EMAIL_NOT_VERIFIED", 403, 403], ["IDENTITY_NOT_FOUND", 409, 409], ["TOO_MANY_ATTEMPTS", 429, 429], ["SOMETHING_INTERNAL: relation x", 500, 502]];
  for (const [message, dbStatus, expected] of cases) {
    const world = makeWorld({ startError: message, startStatus: dbStatus });
    const response = await handleStart({ request: startRequest({ authorization: "Bearer user-a-jwt" }), env: ENV, fetchImpl: world.fetch });
    assert.equal(response.status, expected, message);
    assert.equal((await response.text()).includes("relation x"), false);
  }
  const invalid = await handleStart({ request: startRequest({ authorization: "Bearer bad" }), env: ENV, fetchImpl: makeWorld().fetch });
  assert.equal(invalid.status, 401);
});

// ------------------------------------------------------------------------------------------------ CALLBACK — success

test("callback: successful connection exchanges the code server-side, reads identity and the connections list, revokes the grant, and returns a non-sensitive result", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a");
  const events = [];
  const response = await runCallback(world, callbackRequest(state), (event, code) => events.push(`${event}:${code}`));

  assert.equal(response.status, 302);
  const target = location(response);
  assert.equal(`${target.origin}${target.pathname}`, RETURN_URL);
  assert.equal(target.searchParams.get("connection"), "discord");
  assert.equal(target.searchParams.get("result"), "connected");
  assert.equal(target.searchParams.get("reason"), null);
  assert.equal(target.searchParams.get("discovery"), "absent", "no Riot entry was returned");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");

  const [exchange, user, connections, revoke] = discordCalls(world);
  assert.equal(exchange.url, DISCORD_OAUTH.tokenUrl);
  const form = new URLSearchParams(exchange.body);
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("code"), "abc123CODE");
  assert.equal(form.get("redirect_uri"), CALLBACK_URI, "must match the redirect_uri used at authorization time");
  assert.equal(form.get("client_id"), ENV.discordClientId);
  assert.equal(form.get("client_secret"), SECRET);
  assert.equal(user.url, DISCORD_OAUTH.userUrl);
  assert.equal(user.headers.Authorization, "Bearer ACCESS_TOKEN_1");
  assert.equal(connections.url, DISCORD_OAUTH.connectionsUrl);
  assert.equal(connections.method, "GET");
  assert.equal(connections.headers.Authorization, "Bearer ACCESS_TOKEN_1");
  assert.equal(revoke.url, DISCORD_OAUTH.revokeUrl);
  const revokeForm = new URLSearchParams(revoke.body);
  assert.equal(revokeForm.get("token"), "ACCESS_TOKEN_1");
  assert.equal(revokeForm.get("token_type_hint"), "access_token");
  assert.equal(discordCalls(world).length, 4, "exchange + identity read + connections read + revoke only — no guilds or any other Discord call");

  assert.deepEqual(world.connections.map(({ discovery, ...link }) => link), [{ entity: "entity-a", accountId: "111111111111111111", username: "alice", displayName: "Alice", avatar: `https://cdn.discordapp.com/avatars/111111111111111111/${"a".repeat(32)}.png?size=128` }], "the identity link is exactly what it was before this slice");
  assert.equal(world.connections[0].discovery.candidate_status, "ABSENT");
  assert.deepEqual(events, ["callback:discovery_ABSENT", "callback:link_CONNECTED"]);
});

test("callback: the Discord client secret only ever goes to Discord, and the service key only ever goes to the database; neither appears in any redirect or log", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a");
  const logged = [];
  const response = await runCallback(world, callbackRequest(state), (...parts) => logged.push(parts.join(" ")));
  for (const call of world.calls) {
    const toDiscord = call.url.startsWith("https://discord.com");
    const haystack = `${call.body}${JSON.stringify(call.headers)}`;
    if (toDiscord) assert.equal(haystack.includes(SERVICE_KEY), false, `service key leaked to ${call.url}`);
    else assert.equal(haystack.includes(SECRET), false, `client secret leaked to ${call.url}`);
  }
  const everything = `${response.headers.get("location")}${logged.join("|")}`;
  for (const sensitive of [SECRET, SERVICE_KEY, ANON_KEY, "ACCESS_TOKEN_1", "REFRESH_TOKEN_1", "abc123CODE", state]) assert.equal(everything.includes(sensitive), false, `leaked ${sensitive.slice(0, 8)}…`);
});

test("callback: state is consumed BEFORE any Discord request is made", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a");
  await runCallback(world, callbackRequest(state));
  const order = world.calls.map(c => c.url.replace(SUPABASE, "").replace("https://discord.com", "discord"));
  assert.ok(order.findIndex(u => u.endsWith("consume_connection_attempt")) < order.findIndex(u => u.startsWith("discord")));
});

test("callback: the grant is revoked before the link is written, and the token is never persisted anywhere", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a");
  await runCallback(world, callbackRequest(state));
  const order = world.calls.map(c => c.url);
  assert.ok(order.indexOf(DISCORD_OAUTH.revokeUrl) < order.findIndex(u => u.endsWith("complete_connection_attempt")));
  const completeArgs = JSON.parse(rpcCalls(world, "complete_connection_attempt")[0].body);
  assert.deepEqual(Object.keys(completeArgs).sort(), ["candidate_account_id", "candidate_attempt_id", "candidate_avatar_url", "candidate_display_name", "candidate_username"]);
  assert.equal(JSON.stringify(world.calls.filter(c => !c.url.startsWith("https://discord.com")).map(c => c.body)).includes("ACCESS_TOKEN"), false);
  assert.equal(JSON.stringify(world.calls.filter(c => !c.url.startsWith("https://discord.com")).map(c => c.body)).includes("REFRESH_TOKEN"), false);
});

test("callback: a revoke failure never fails the (already verified) connection", async () => {
  const world = makeWorld({ discord: { revokeOk: false } });
  const state = world.newAttempt("user-a", "entity-a");
  const events = [];
  const response = await runCallback(world, callbackRequest(state), (event, code) => events.push(code));
  assert.equal(location(response).searchParams.get("result"), "connected");
  assert.ok(events.includes("revoke_failed"));
});

// ------------------------------------------------------------------------------------------------ CALLBACK — state protection

test("callback: an unknown or malformed state is rejected and Discord is never contacted", async () => {
  for (const state of ["", "garbage", "0".repeat(64), "../../etc/passwd"]) {
    const world = makeWorld();
    const response = await runCallback(world, callbackRequest(encodeURIComponent(state)));
    const target = location(response);
    assert.equal(target.searchParams.get("result"), "error");
    assert.equal(target.searchParams.get("reason"), "invalid_state");
    assert.equal(discordCalls(world).length, 0);
    assert.equal(world.connections.length, 0);
  }
});

test("callback: a replayed callback is rejected as already used and never exchanges the code a second time", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a");
  const first = await runCallback(world, callbackRequest(state));
  const callsAfterFirst = discordCalls(world).length;
  const second = await runCallback(world, callbackRequest(state));
  assert.equal(location(first).searchParams.get("result"), "connected");
  assert.equal(location(second).searchParams.get("reason"), "already_used");
  assert.equal(discordCalls(world).length, callsAfterFirst, "no additional Discord traffic on replay");
  assert.equal(world.connections.length, 1);
});

test("callback: two simultaneous deliveries (double-open / multiple tabs) result in exactly one exchange and one connection", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a");
  const [one, two] = await Promise.all([runCallback(world, callbackRequest(state)), runCallback(world, callbackRequest(state))]);
  const results = [location(one).searchParams.get("result"), location(two).searchParams.get("result")].sort();
  assert.deepEqual(results, ["connected", "error"]);
  assert.equal(discordCalls(world).filter(c => c.url === DISCORD_OAUTH.tokenUrl).length, 1);
  assert.equal(world.connections.length, 1);
});

test("callback: an expired attempt is rejected and Discord is never contacted", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a", { expired: true });
  const response = await runCallback(world, callbackRequest(state));
  assert.equal(location(response).searchParams.get("reason"), "expired");
  assert.equal(discordCalls(world).length, 0);
});

test("callback: user/entity identifiers supplied in the callback URL are ignored — the target identity comes only from the DB-bound state (cross-user linking protection)", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a");
  await runCallback(world, callbackRequest(state, "&user_id=user-b&entity_id=entity-b&gamid=victim"));
  assert.equal(world.connections.length, 1);
  assert.equal(world.connections[0].entity, "entity-a");
  const args = JSON.parse(rpcCalls(world, "complete_connection_attempt")[0].body);
  assert.equal(JSON.stringify(args).includes("entity-b"), false);
});

// ------------------------------------------------------------------------------------------------ CALLBACK — cancellation and provider failures

test("callback: user cancelling at Discord is recorded, is not treated as an error, and never contacts Discord's token endpoint", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a");
  const response = await handleCallback({ request: new Request(`${CALLBACK_URI}?error=access_denied&error_description=The+resource+owner+denied&state=${state}`), env: ENV, fetchImpl: world.fetch });
  assert.equal(location(response).searchParams.get("result"), "cancelled");
  assert.equal(location(response).searchParams.get("reason"), null);
  assert.deepEqual(world.finished.map(f => f.candidate_outcome), ["DENIED"]);
  assert.equal(discordCalls(world).length, 0);
  assert.equal(world.connections.length, 0);
});

test("callback: any other Discord error is a generic provider error", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a");
  const response = await handleCallback({ request: new Request(`${CALLBACK_URI}?error=server_error&state=${state}`), env: ENV, fetchImpl: world.fetch });
  assert.equal(location(response).searchParams.get("reason"), "provider_error");
  assert.deepEqual(world.finished.map(f => f.candidate_outcome), ["PROVIDER_ERROR"]);
});

test("callback: a missing or malformed authorization code is a provider error and no token exchange is attempted", async () => {
  for (const suffix of ["", "code=", "code=" + encodeURIComponent("a b<script>")]) {
    const world = makeWorld();
    const state = world.newAttempt("user-a", "entity-a");
    const response = await handleCallback({ request: new Request(`${CALLBACK_URI}?${suffix}&state=${state}`), env: ENV, fetchImpl: world.fetch });
    assert.equal(location(response).searchParams.get("reason"), "provider_error");
    assert.equal(discordCalls(world).length, 0);
  }
});

test("callback: a failed code exchange is safe and recorded", async () => {
  const world = makeWorld({ discord: { tokenOk: false } });
  const state = world.newAttempt("user-a", "entity-a");
  const response = await runCallback(world, callbackRequest(state));
  assert.equal(location(response).searchParams.get("reason"), "exchange_failed");
  assert.deepEqual(world.finished.map(f => f.candidate_outcome), ["EXCHANGE_FAILED"]);
  assert.equal(world.connections.length, 0);
});

test("callback: network failure reaching Discord is handled without leaking the error", async () => {
  const world = makeWorld({ discord: { throwOnToken: true } });
  const state = world.newAttempt("user-a", "entity-a");
  const response = await runCallback(world, callbackRequest(state));
  assert.equal(location(response).searchParams.get("reason"), "exchange_failed");
  assert.equal(response.headers.get("location").includes("unreachable"), false);
});

test("callback: a token whose scopes are not EXACTLY identify + connections (broader, narrower, or different) is rejected and immediately revoked", async () => {
  for (const scope of ["identify connections guilds", "identify guilds", "identify", "connections", "identify email", ""]) {
    const world = makeWorld({ discord: { tokenBody: { access_token: "BROAD_TOKEN", token_type: "Bearer", scope } } });
    const state = world.newAttempt("user-a", "entity-a");
    const response = await runCallback(world, callbackRequest(state));
    assert.equal(location(response).searchParams.get("reason"), "exchange_failed", `scope: ${scope}`);
    assert.equal(discordCalls(world).some(c => c.url === DISCORD_OAUTH.userUrl || c.url === DISCORD_OAUTH.connectionsUrl), false, "must not use a wrongly-scoped token to read anything");
    assert.equal(new URLSearchParams(discordCalls(world).find(c => c.url === DISCORD_OAUTH.revokeUrl).body).get("token"), "BROAD_TOKEN");
    assert.equal(world.connections.length, 0);
  }
});

test("callback: if the identity cannot be read the token is still revoked and nothing is linked", async () => {
  const world = makeWorld({ discord: { userOk: false } });
  const state = world.newAttempt("user-a", "entity-a");
  const response = await runCallback(world, callbackRequest(state));
  assert.equal(location(response).searchParams.get("reason"), "provider_error");
  assert.ok(discordCalls(world).some(c => c.url === DISCORD_OAUTH.revokeUrl));
  assert.equal(world.connections.length, 0);
});

test("callback: a malformed Discord user id is never linked", async () => {
  for (const id of ["abc", "", "1", "1".repeat(40), "12345; drop table"]) {
    const world = makeWorld({ discord: { userBody: { id, username: "x" } } });
    const state = world.newAttempt("user-a", "entity-a");
    const response = await runCallback(world, callbackRequest(state));
    assert.equal(location(response).searchParams.get("reason"), "provider_error", id);
    assert.equal(world.connections.length, 0);
  }
});

// ------------------------------------------------------------------------------------------------ CALLBACK — ownership outcomes

test("callback: a Discord account already linked to another GamID fails safely and changes nothing", async () => {
  const world = makeWorld();
  await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  const response = await runCallback(world, callbackRequest(world.newAttempt("user-b", "entity-b")));
  assert.equal(location(response).searchParams.get("result"), "error");
  assert.equal(location(response).searchParams.get("reason"), "account_in_use");
  assert.deepEqual(world.connections.map(c => c.entity), ["entity-a"]);
});

test("callback: the same GamID attempting a different Discord account is never silently overwritten", async () => {
  const world = makeWorld();
  await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  world.discord.userBody = { id: "222222222222222222", username: "other" };
  const response = await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  assert.equal(location(response).searchParams.get("reason"), "other_account_connected");
  assert.equal(world.connections.length, 1);
  assert.equal(world.connections[0].accountId, "111111111111111111");
});

test("callback: the same GamID reconnecting the same Discord account refreshes it without duplicating", async () => {
  const world = makeWorld();
  await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  world.discord.userBody = { id: "111111111111111111", username: "alice_new", global_name: "Alice New", avatar: null };
  const response = await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  assert.equal(location(response).searchParams.get("result"), "reconnected");
  assert.equal(world.connections.length, 1);
  assert.equal(world.connections[0].username, "alice_new");
  assert.equal(world.connections[0].avatar, null);
});

// ------------------------------------------------------------------------------------------------ CALLBACK — robustness

test("callback: only GET is accepted", async () => {
  const world = makeWorld();
  const response = await handleCallback({ request: new Request(`${CALLBACK_URI}?state=x`, { method: "POST" }), env: ENV, fetchImpl: world.fetch });
  assert.equal(response.status, 405);
  assert.equal(world.calls.length, 0);
});

test("callback: unconfigured Discord credentials fail closed with a safe redirect and no traffic", async () => {
  const world = makeWorld();
  const response = await handleCallback({ request: callbackRequest("a".repeat(64)), env: { ...ENV, discordClientSecret: undefined }, fetchImpl: world.fetch });
  assert.equal(location(response).searchParams.get("reason"), "not_configured");
  assert.equal(world.calls.length, 0);
});

test("callback: an unexpected exception becomes a generic server_error redirect that leaks nothing", async () => {
  const world = makeWorld({ throwOnConsume: true });
  const events = [];
  const response = await runCallback(world, callbackRequest("a".repeat(64)), (event, code) => events.push(code));
  assert.equal(response.status, 302);
  assert.equal(location(response).searchParams.get("reason"), "server_error");
  assert.equal(response.headers.get("location").includes("secret-ish"), false);
  assert.equal(events.join("|").includes("secret-ish"), false);
});

test("callback: every redirect goes to the fixed GamID return URL and carries only allow-listed result codes", async () => {
  const allowedResults = new Set(["connected", "reconnected", "cancelled", "error"]);
  const allowedReasons = new Set([null, "invalid_state", "already_used", "expired", "provider_error", "exchange_failed", "account_in_use", "other_account_connected", "identity_not_found", "server_error", "not_configured"]);
  const scenarios = [
    w => callbackRequest("bad"),
    w => callbackRequest(w.newAttempt("user-a", "entity-a")),
    w => callbackRequest(w.newAttempt("user-a", "entity-a", { expired: true })),
    w => new Request(`${CALLBACK_URI}?error=access_denied&state=${w.newAttempt("user-a", "entity-a")}`),
  ];
  for (const build of scenarios) {
    const world = makeWorld();
    const response = await runCallback(world, build(world));
    const target = location(response);
    assert.equal(`${target.origin}${target.pathname}`, RETURN_URL);
    assert.ok(allowedResults.has(target.searchParams.get("result")));
    assert.ok(allowedReasons.has(target.searchParams.get("reason")));
    assert.deepEqual([...target.searchParams.keys()].filter(k => !["connection", "result", "reason", "discovery"].includes(k)), []);
    assert.ok(new Set([null, "found", "absent", "unavailable"]).has(target.searchParams.get("discovery")));
  }
});

test("environment is read from the standard Supabase and Discord variable names", () => {
  const seen = [];
  readEnv(name => { seen.push(name); return "x"; });
  assert.deepEqual(seen.sort(), ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"]);
});

// ================================================================================================
// Riot discovery validation (Discord `connections` scope) — minimal diagnostic, private, no tokens
// ================================================================================================

const RIOT_ID = "8a3f2c1e-5b6d-4e7f-9a0b-1c2d3e4f5a6b";
const riotEntry = (over = {}) => ({ id: RIOT_ID, name: "Gamer#NA1", type: "riotgames", revoked: false, integrations: [], verified: true, friend_sync: false, show_activity: true, two_way_link: false, visibility: 1, ...over });
const otherEntries = () => [
  { id: "steam-76561198000000000", name: "PRIVATE_STEAM_NAME", type: "steam", verified: true, visibility: 1, integrations: [] },
  { id: "twitch-4242", name: "PRIVATE_TWITCH_NAME", type: "twitch", verified: true, visibility: 0, integrations: [] },
];
const everythingSent = world => JSON.stringify(world.calls.filter(c => !c.url.startsWith("https://discord.com")).map(c => [c.url, c.body])); // what left toward the database

test("riot discovery: an entry is Riot only by its type (never guessed from names); Riot's own game names count, look-alikes do not", () => {
  for (const type of ["riotgames", "riot", "riot-games", "Riot Games", "RIOT_GAMES", "leagueoflegends", "valorant"]) assert.equal(isRiotType(type), true, type);
  for (const type of ["steam", "twitch", "patriot", "friotless", "", "  ", null, undefined, 123, {}, [], "x".repeat(60)]) assert.equal(isRiotType(type), false, String(type));
});

test("riot discovery: summarizing keeps ONLY the Riot entry's allow-listed fields and never any other account", async () => {
  const summary = await summarizeConnections([...otherEntries(), riotEntry(), { id: "reddit-1", name: "PRIVATE_REDDIT_NAME", type: "reddit" }]);
  assert.equal(summary.status, "FOUND");
  assert.equal(summary.total, 4, "the count of everything Discord returned is the only trace of other entries");
  assert.equal(summary.matchCount, 1);
  assert.equal(summary.riot.type, "riotgames");
  assert.equal(summary.riot.name, "Gamer#NA1");
  assert.equal(summary.riot.idShape, "uuid");
  assert.equal(summary.riot.idLength, RIOT_ID.length);
  assert.match(summary.riot.idSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual([summary.riot.verified, summary.riot.revoked, summary.riot.friendSync, summary.riot.visibility], [true, false, false, 1]);
  assert.deepEqual(summary.riot.fields, ["friend_sync", "id", "integrations", "name", "revoked", "show_activity", "two_way_link", "type", "verified", "visibility"]);
  const serialized = JSON.stringify(summary);
  for (const secret of ["PRIVATE_STEAM_NAME", "PRIVATE_TWITCH_NAME", "PRIVATE_REDDIT_NAME", "steam-7656", "twitch-4242", "reddit-1", "steam", "twitch", "reddit"]) assert.equal(serialized.includes(secret), false, `unrelated data retained: ${secret}`);
  assert.equal(serialized.includes(RIOT_ID), false, "the raw external id is never retained — only its shape, length and SHA-256");
});

test("riot discovery: Riot absent is reported as absent with only the total — nothing is inferred or faked", async () => {
  const summary = await summarizeConnections(otherEntries());
  assert.deepEqual(summary, { status: "ABSENT", total: 2, matchCount: 0, riot: null });
  assert.deepEqual(await summarizeConnections([]), { status: "ABSENT", total: 0, matchCount: 0, riot: null });
});

test("riot discovery: a malformed connections response is UNAVAILABLE, and malformed individual entries are ignored safely", async () => {
  for (const bad of [null, undefined, "nope", 42, {}, { message: "x" }, true]) assert.deepEqual(await summarizeConnections(bad), { status: "UNAVAILABLE", total: null, matchCount: null, riot: null }, JSON.stringify(bad));
  const summary = await summarizeConnections([null, 7, "riotgames", [], { type: 5 }, { type: "riotgames" }]);
  assert.equal(summary.status, "FOUND", "the one well-formed Riot-typed object is still found");
  assert.equal(summary.riot.name, null);
  assert.equal(summary.riot.idSha256, null);
  assert.equal(summary.riot.idShape, null);
});

test("riot discovery: returned values are validated — non-boolean flags, out-of-range visibility, hostile names and odd ids are neutralized", async () => {
  const summary = await summarizeConnections([riotEntry({ name: "  Bad\u0000Name\u001f  ", verified: "yes", revoked: 1, friend_sync: null, visibility: 99, id: 12345678901234 })]);
  assert.equal(summary.riot.name, "BadName");
  assert.deepEqual([summary.riot.verified, summary.riot.revoked, summary.riot.friendSync, summary.riot.visibility], [null, null, null, null]);
  assert.equal(summary.riot.idShape, "digits");
  const long = await summarizeConnections([riotEntry({ name: "n".repeat(500), id: "x".repeat(500) })]);
  assert.equal(long.riot.name.length, 128);
  assert.equal(long.riot.idSha256, null, "an oversized id is not retained even as a fingerprint");
  const weird = await summarizeConnections([{ type: "riotgames", "Bad Key!": 1, "with-dash": 2, ok_key: 3, UPPER: 4, digit1: 5 }]);
  assert.deepEqual(weird.riot.fields, ["ok_key", "type"], "only lowercase snake_case field names are reported");
  const many = await summarizeConnections([Object.fromEntries([["type", "riotgames"], ...Array.from({ length: 60 }, (_, i) => [`f${String.fromCharCode(97 + (i % 26))}_${"a".repeat(i % 5)}`, 1])])]);
  assert.ok(many.riot.fields.length <= 24);
});

test("riot discovery: several Riot-typed entries keep only the first and report the match count", async () => {
  const summary = await summarizeConnections([riotEntry({ name: "First#1" }), riotEntry({ name: "Second#2", type: "valorant" })]);
  assert.equal(summary.riot.name, "First#1");
  assert.equal(summary.matchCount, 2);
  assert.equal(JSON.stringify(summary).includes("Second#2"), false);
});

test("callback: Riot present — reads the connections endpoint with the temporary token BEFORE revoking, records only the Riot result, and reports 'found'", async () => {
  const world = makeWorld({ discord: { connectionsBody: [...otherEntries(), riotEntry()] } });
  const state = world.newAttempt("user-a", "entity-a");
  const events = [];
  const response = await runCallback(world, callbackRequest(state), (event, code) => events.push(`${event}:${code}`));
  const target = location(response);
  assert.equal(target.searchParams.get("result"), "connected");
  assert.equal(target.searchParams.get("discovery"), "found");

  const order = world.calls.map(c => c.url);
  assert.ok(order.indexOf(DISCORD_OAUTH.connectionsUrl) > order.indexOf(DISCORD_OAUTH.userUrl));
  assert.ok(order.indexOf(DISCORD_OAUTH.connectionsUrl) < order.indexOf(DISCORD_OAUTH.revokeUrl), "connections is read while the token is valid, then the token is revoked");
  assert.ok(order.indexOf(DISCORD_OAUTH.revokeUrl) < order.findIndex(u => u.endsWith("record_connection_discovery")), "the grant is revoked before anything is written");
  assert.equal(discordCalls(world).filter(c => c.url === DISCORD_OAUTH.connectionsUrl).length, 1);

  const recorded = JSON.parse(rpcCalls(world, "record_connection_discovery")[0].body);
  assert.equal(recorded.candidate_provider, "riot");
  assert.equal(recorded.candidate_status, "FOUND");
  assert.equal(recorded.candidate_total, 3);
  assert.equal(recorded.candidate_type, "riotgames");
  assert.equal(recorded.candidate_name, "Gamer#NA1");
  assert.equal(recorded.candidate_id_shape, "uuid");
  assert.match(recorded.candidate_id_sha256, /^[0-9a-f]{64}$/);
  assert.equal(recorded.candidate_account_id, "111111111111111111", "bound to the just-linked Discord account, not to anything Discord returned in the list");
  assert.deepEqual(events, ["callback:discovery_FOUND", "callback:link_CONNECTED"]);
});

test("callback: what leaves toward the database, the redirect and the logs contains no unrelated account, no raw Riot id, and no token", async () => {
  const world = makeWorld({ discord: { connectionsBody: [...otherEntries(), riotEntry()] } });
  const state = world.newAttempt("user-a", "entity-a");
  const logged = [];
  const response = await runCallback(world, callbackRequest(state), (...parts) => logged.push(parts.join(" ")));
  const outbound = `${everythingSent(world)}${response.headers.get("location")}${logged.join("|")}`;
  for (const forbidden of ["PRIVATE_STEAM_NAME", "PRIVATE_TWITCH_NAME", "steam-7656", "twitch-4242", RIOT_ID, "ACCESS_TOKEN_1", "REFRESH_TOKEN_1", "abc123CODE", SECRET, SERVICE_KEY]) assert.equal(outbound.includes(forbidden), false, `leaked ${forbidden.slice(0, 10)}…`);
  assert.equal(outbound.includes("Gamer#NA1") && response.headers.get("location").includes("Gamer"), false, "the Riot name is stored, never put in a URL or a log");
  assert.equal(logged.join("|").includes("Gamer"), false);
  const args = Object.keys(JSON.parse(rpcCalls(world, "record_connection_discovery")[0].body)).sort();
  assert.deepEqual(args, ["candidate_account_id", "candidate_attempt_id", "candidate_fields", "candidate_friend_sync", "candidate_id_length", "candidate_id_sha256", "candidate_id_shape", "candidate_match_count", "candidate_name", "candidate_provider", "candidate_revoked", "candidate_status", "candidate_total", "candidate_type", "candidate_verified", "candidate_visibility"]);
});

test("callback: the full connections payload is never exposed to the browser — the redirect carries only an allow-listed discovery word", async () => {
  const world = makeWorld({ discord: { connectionsBody: [riotEntry()] } });
  const response = await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  const target = location(response);
  assert.deepEqual([...target.searchParams.keys()].sort(), ["connection", "discovery", "result"]);
  assert.equal(target.searchParams.get("discovery"), "found");
});

test("callback: Riot absent — link succeeds, ABSENT is recorded with no Riot fields, unrelated accounts are not retained", async () => {
  const world = makeWorld({ discord: { connectionsBody: otherEntries() } });
  const response = await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  assert.equal(location(response).searchParams.get("result"), "connected");
  assert.equal(location(response).searchParams.get("discovery"), "absent");
  const recorded = JSON.parse(rpcCalls(world, "record_connection_discovery")[0].body);
  assert.equal(recorded.candidate_status, "ABSENT");
  assert.equal(recorded.candidate_total, 2);
  assert.equal(recorded.candidate_match_count, 0);
  for (const key of ["candidate_type", "candidate_name", "candidate_id_shape", "candidate_id_length", "candidate_id_sha256", "candidate_verified", "candidate_revoked", "candidate_friend_sync", "candidate_visibility", "candidate_fields"]) assert.equal(recorded[key], null, key);
  assert.equal(everythingSent(world).includes("STEAM"), false);
});

test("callback: a connections failure (HTTP error, network error, malformed body) never fails the identity link — it is recorded as UNAVAILABLE and the token is still revoked", async () => {
  const scenarios = [
    { connectionsOk: false },
    { throwOnConnections: true },
    { connectionsBody: { message: "not an array" } },
    { connectionsBody: "garbage" },
  ];
  for (const discord of scenarios) {
    const world = makeWorld({ discord });
    const response = await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
    assert.equal(location(response).searchParams.get("result"), "connected", JSON.stringify(discord));
    assert.equal(location(response).searchParams.get("discovery"), "unavailable", JSON.stringify(discord));
    assert.equal(JSON.parse(rpcCalls(world, "record_connection_discovery")[0].body).candidate_status, "UNAVAILABLE");
    assert.ok(discordCalls(world).some(c => c.url === DISCORD_OAUTH.revokeUrl), "token revoked even when connections failed");
    assert.equal(world.connections.length, 1);
  }
});

test("callback: failing to save the diagnostic never undoes or misreports the link", async () => {
  const world = makeWorld({ failRecord: true, discord: { connectionsBody: [riotEntry()] } });
  const events = [];
  const response = await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")), (event, code) => events.push(code));
  assert.equal(location(response).searchParams.get("result"), "connected");
  assert.equal(location(response).searchParams.get("discovery"), "unavailable");
  assert.ok(events.includes("discovery_record_failed"));
  assert.equal(world.connections.length, 1);
});

test("callback: a record call that throws (network) still yields a successful link redirect, not a server error", async () => {
  const world = makeWorld({ discord: { connectionsBody: [riotEntry()] } });
  const original = world.fetch;
  world.fetch = async (url, init) => { if (String(url).endsWith("/rpc/record_connection_discovery")) throw new Error("db unreachable"); return original(url, init); };
  const response = await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  assert.equal(location(response).searchParams.get("result"), "connected");
  assert.equal(location(response).searchParams.get("discovery"), "unavailable");
});

test("callback: nothing is recorded when the link is refused (account in use / different account) — discovery data cannot leak across identities", async () => {
  const world = makeWorld({ discord: { connectionsBody: [riotEntry()] } });
  await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  const before = world.discovery.length;
  const inUse = await runCallback(world, callbackRequest(world.newAttempt("user-b", "entity-b")));
  assert.equal(location(inUse).searchParams.get("reason"), "account_in_use");
  assert.equal(location(inUse).searchParams.get("discovery"), null);
  world.discord.userBody = { id: "222222222222222222", username: "other" };
  const other = await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  assert.equal(location(other).searchParams.get("reason"), "other_account_connected");
  assert.equal(location(other).searchParams.get("discovery"), null);
  assert.equal(world.discovery.length, before, "no discovery row written for either refused attempt");
  assert.equal(world.connections.length, 1);
});

test("callback: cancelling or denying never reads connections and records nothing", async () => {
  const world = makeWorld({ discord: { connectionsBody: [riotEntry()] } });
  const response = await runCallback(world, new Request(`${CALLBACK_URI}?error=access_denied&state=${world.newAttempt("user-a", "entity-a")}`));
  assert.equal(location(response).searchParams.get("result"), "cancelled");
  assert.equal(discordCalls(world).length, 0);
  assert.equal(rpcCalls(world, "record_connection_discovery").length, 0);
});

test("callback: a failed exchange or unreadable identity never reads connections and records nothing", async () => {
  for (const discord of [{ tokenOk: false }, { userOk: false }]) {
    const world = makeWorld({ discord: { connectionsBody: [riotEntry()], ...discord } });
    await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
    assert.equal(discordCalls(world).some(c => c.url === DISCORD_OAUTH.connectionsUrl), false, JSON.stringify(discord));
    assert.equal(rpcCalls(world, "record_connection_discovery").length, 0);
  }
});

test("callback: re-authorizing the same Discord account (RECONNECTED) refreshes the discovery result; existing identity behavior is unchanged", async () => {
  const world = makeWorld({ discord: { connectionsBody: otherEntries() } });
  await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  assert.equal(world.connections[0].discovery.candidate_status, "ABSENT");
  world.discord.connectionsBody = [riotEntry({ name: "Now#EUW" })];
  world.discord.userBody = { id: "111111111111111111", username: "alice_new", global_name: "Alice New", avatar: null };
  const response = await runCallback(world, callbackRequest(world.newAttempt("user-a", "entity-a")));
  assert.equal(location(response).searchParams.get("result"), "reconnected");
  assert.equal(location(response).searchParams.get("discovery"), "found");
  assert.equal(world.connections.length, 1);
  assert.equal(world.connections[0].username, "alice_new");
  assert.equal(world.connections[0].discovery.candidate_name, "Now#EUW");
  const completeArgs = JSON.parse(rpcCalls(world, "complete_connection_attempt").at(-1).body);
  assert.deepEqual(Object.keys(completeArgs).sort(), ["candidate_account_id", "candidate_attempt_id", "candidate_avatar_url", "candidate_display_name", "candidate_username"], "the identity link contract is unchanged");
});

test("callback: a replayed callback cannot re-run discovery", async () => {
  const world = makeWorld({ discord: { connectionsBody: [riotEntry()] } });
  const state = world.newAttempt("user-a", "entity-a");
  await runCallback(world, callbackRequest(state));
  const calls = world.calls.length;
  const replay = await runCallback(world, callbackRequest(state));
  assert.equal(location(replay).searchParams.get("reason"), "already_used");
  assert.equal(world.discovery.length, 1);
  assert.equal(discordCalls(world).filter(c => c.url === DISCORD_OAUTH.connectionsUrl).length, 1);
  assert.ok(world.calls.length - calls <= 1, "only the state consume call was made");
});

test("start: the authorization URL handed to the browser requests exactly identify + connections", async () => {
  const world = makeWorld();
  const response = await handleStart({ request: startRequest({ authorization: "Bearer user-a-jwt" }), env: ENV, fetchImpl: world.fetch });
  const url = new URL((await response.json()).authorization_url);
  assert.equal(url.searchParams.get("scope"), "identify connections");
  assert.equal(url.searchParams.get("prompt"), "consent", "the extra permission is always shown to the user for explicit consent");
});