import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  RETURN_URL, SITE_ORIGIN, STEAM_OPENID, buildAuthenticationUrl, callbackUrlFor, checkAssertionLocally, handleCallback, handleStart, readEnv, realmFor, returnToFor, verifyAssertion,
} from "../supabase/functions/_shared/steam-openid.js";

const SUPABASE = "https://example-project.supabase.co";
const SERVICE_KEY = "test-service-role-key-value";
const ANON_KEY = "test-anon-key-value";
const ENV = { supabaseUrl: SUPABASE, anonKey: ANON_KEY, serviceKey: SERVICE_KEY };
const CALLBACK = `${SUPABASE}/functions/v1/steam-connect-callback`;
const STEAM_A = "76561198000000001";
const STEAM_B = "76561198000000002";
const STEAM_SECRET = "fake-steam-signing-secret";

const SIGNED_FIELDS = ["signed", "op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"];

// A fake Steam that really signs assertions and really validates them (HMAC over the signed fields) and, like Steam, treats an
// assertion as valid only ONCE (its own replay protection). It records every request the backend makes to it.
function makeSteam() {
  const steam = { requests: [], usedNonces: new Set(), offline: false, status: 200, rawBody: null };
  const sign = fields => createHmac("sha256", STEAM_SECRET).update(["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"].map(k => `${k}:${fields[`openid.${k}`]}`).join("\n")).digest("base64");
  steam.assertion = ({ steamId = STEAM_A, returnTo, when = Date.now(), nonceSuffix = randomBytes(6).toString("base64") } = {}) => {
    const iso = new Date(when).toISOString().replace(/\.\d{3}Z$/, "Z");
    const fields = {
      "openid.ns": STEAM_OPENID.ns,
      "openid.mode": "id_res",
      "openid.op_endpoint": STEAM_OPENID.endpoint,
      "openid.claimed_id": `https://steamcommunity.com/openid/id/${steamId}`,
      "openid.identity": `https://steamcommunity.com/openid/id/${steamId}`,
      "openid.return_to": returnTo,
      "openid.response_nonce": `${iso}${nonceSuffix}`,
      "openid.assoc_handle": "1234567890",
      "openid.signed": SIGNED_FIELDS.join(","),
    };
    fields["openid.sig"] = sign(fields);
    return fields;
  };
  steam.respond = form => {
    steam.requests.push(form);
    if (steam.offline) throw new Error("steam unreachable");
    if (steam.rawBody !== null) return new Response(steam.rawBody, { status: steam.status });
    const fields = Object.fromEntries(form.entries());
    const genuine = fields["openid.mode"] === "check_authentication" && fields["openid.sig"] === sign(fields) && !steam.usedNonces.has(fields["openid.response_nonce"]);
    if (genuine) steam.usedNonces.add(fields["openid.response_nonce"]);
    return new Response(`ns:${STEAM_OPENID.ns}\nis_valid:${genuine}\n`, { status: steam.status });
  };
  return steam;
}

// A fake backend implementing exactly the database contract proven against live TESTING by tests/integration/steam-connection-db.sql:
// provider-bound one-time consumption (REPLAYED/EXPIRED/INVALID_STATE), owner-bound linking, one owner per SteamID64, one SteamID64 per owner.
function makeWorld(options = {}) {
  const world = {
    calls: [], attempts: new Map(), connections: [], finished: [], steam: makeSteam(), throwOnConsume: Boolean(options.throwOnConsume),
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const usersByToken = { "user-a-jwt": { user: "user-a", entity: "entity-a" }, "user-b-jwt": { user: "user-b", entity: "entity-b" } };

  world.newAttempt = (user, entity, extra = {}) => {
    const state = randomBytes(32).toString("hex");
    world.attempts.set(state, { id: `attempt-${world.attempts.size + 1}`, user, entity, provider: "steam", consumed: false, completed: false, expired: false, ...extra });
    return state;
  };

  world.fetch = async (url, init = {}) => {
    const target = new URL(url);
    const record = { url: String(url), method: init.method || "GET", headers: { ...(init.headers || {}) }, body: init.body === undefined ? "" : init.body };
    world.calls.push(record);
    const args = () => { try { return JSON.parse(String(record.body)); } catch { return {}; } };

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
      if (name === "consume_connection_attempt_for") {
        if (world.throwOnConsume) throw new Error("network down: secret-ish detail");
        const attempt = world.attempts.get(args().candidate_state);
        const row = status => [{ attempt_id: null, owner_user_id: null, owner_entity_id: null, provider: null, status }];
        // Provider-bound: another provider's state is INVALID_STATE and stays unconsumed.
        if (!attempt || attempt.provider !== args().expected_provider) return json(row("INVALID_STATE"));
        if (attempt.consumed) return json(row("REPLAYED"));
        attempt.consumed = true;
        if (attempt.expired) return json(row("EXPIRED"));
        return json([{ attempt_id: attempt.id, owner_user_id: attempt.user, owner_entity_id: attempt.entity, provider: attempt.provider, status: "OK" }]);
      }
      if (name === "finish_connection_attempt") { world.finished.push(args()); return json(null, 200); }
      if (name === "complete_steam_connection_attempt") {
        const a = args();
        const attempt = [...world.attempts.values()].find(item => item.id === a.candidate_attempt_id);
        if (!attempt || !attempt.consumed || attempt.provider !== "steam") return json("INVALID_STATE");
        if (attempt.completed) return json("REPLAYED");
        attempt.completed = true;
        const mine = world.connections.find(c => c.entity === attempt.entity);
        if (mine) {
          if (mine.steamId !== a.candidate_steam_id) { attempt.outcome = "OWNER_HAS_OTHER_ACCOUNT"; return json("OWNER_HAS_OTHER_ACCOUNT"); }
          attempt.outcome = "RECONNECTED";
          return json("RECONNECTED");
        }
        if (world.connections.find(c => c.steamId === a.candidate_steam_id)) { attempt.outcome = "ACCOUNT_ALREADY_LINKED"; return json("ACCOUNT_ALREADY_LINKED"); }
        world.connections.push({ entity: attempt.entity, steamId: a.candidate_steam_id, isPublic: false, trust: "CONNECTED" });
        attempt.outcome = "CONNECTED";
        return json("CONNECTED");
      }
    }

    if (String(url) === STEAM_OPENID.endpoint) {
      assert.equal(record.method, "POST", "the only request ever made to Steam is the direct verification POST");
      return world.steam.respond(record.body);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return world;
}

const location = response => new URL(response.headers.get("location"));
const steamCalls = world => world.calls.filter(c => c.url.includes("steamcommunity.com"));
const rpcCalls = (world, name) => world.calls.filter(c => c.url.endsWith(`/rpc/${name}`));
const runCallback = (world, request, extra = {}) => handleCallback({ request, env: ENV, fetchImpl: world.fetch, log: () => {}, ...extra });

// Builds the browser's callback request for a given attempt state and assertion fields.
function callbackRequest(state, fields, { stateParam = state } = {}) {
  const params = new URLSearchParams();
  if (stateParam !== null) params.set("state", stateParam);
  for (const [key, value] of Object.entries(fields)) params.set(key, value);
  return new Request(`${CALLBACK}?${params.toString()}`, { method: "GET" });
}

// The happy-path pieces most tests start from.
function setup(options) {
  const world = makeWorld(options);
  const state = world.newAttempt("user-a", "entity-a");
  const fields = world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, state) });
  return { world, state, fields };
}

const startRequest = (headers = {}, body = { provider: "steam" }, method = "POST") =>
  new Request(`${SUPABASE}/functions/v1/steam-connect-start`, { method, headers: { "content-type": "application/json", origin: SITE_ORIGIN, ...headers }, body: method === "POST" ? JSON.stringify(body) : undefined });

// ------------------------------------------------------------------------------------------------ authentication URL

test("the sign-in URL is Steam's official OpenID endpoint, identifier_select, with our exact return_to (state) and realm", () => {
  const state = "a".repeat(64);
  const url = new URL(buildAuthenticationUrl({ supabaseUrl: SUPABASE, state }));
  assert.equal(`${url.origin}${url.pathname}`, "https://steamcommunity.com/openid/login");
  assert.equal(url.searchParams.get("openid.ns"), "http://specs.openid.net/auth/2.0");
  assert.equal(url.searchParams.get("openid.mode"), "checkid_setup");
  assert.equal(url.searchParams.get("openid.identity"), "http://specs.openid.net/auth/2.0/identifier_select");
  assert.equal(url.searchParams.get("openid.claimed_id"), "http://specs.openid.net/auth/2.0/identifier_select");
  assert.equal(url.searchParams.get("openid.return_to"), `${CALLBACK}?state=${state}`);
  assert.equal(url.searchParams.get("openid.realm"), `${SUPABASE}/`);
  assert.equal(STEAM_OPENID.endpoint, "https://steamcommunity.com/openid/login");
  assert.equal(callbackUrlFor(`${SUPABASE}/`), CALLBACK);
  assert.equal(realmFor(SUPABASE), `${SUPABASE}/`);
  assert.ok(new URL(url.searchParams.get("openid.return_to")).href.startsWith(url.searchParams.get("openid.realm")), "return_to is under the realm");
  assert.equal([...url.searchParams.keys()].some(key => /key|secret|password|token|cookie/i.test(key)), false, "no credential-like field of any kind");
});

// ------------------------------------------------------------------------------------------------ START

test("START forwards the owner's OWN JWT to the database (never the service key) and returns only the official Steam URL", async () => {
  const world = makeWorld();
  const response = await handleStart({ request: startRequest({ authorization: "Bearer user-a-jwt" }), env: ENV, fetchImpl: world.fetch });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.authorization_url, /^https:\/\/steamcommunity\.com\/openid\/login\?/);
  const [call] = rpcCalls(world, "start_connection_attempt");
  assert.equal(call.headers.Authorization, "Bearer user-a-jwt");
  assert.equal(call.headers.apikey, ANON_KEY);
  assert.equal(JSON.parse(call.body).candidate_provider, "steam");
  assert.deepEqual(Object.keys(payload).sort(), ["authorization_url", "expires_at"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), SITE_ORIGIN);
  const state = new URL(payload.authorization_url).searchParams.get("openid.return_to").split("state=")[1];
  assert.match(state, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(payload).includes(SERVICE_KEY), false);
});

test("START refuses anything but a signed-in POST for the steam provider from the GamID site", async () => {
  const world = makeWorld();
  const call = (request, options) => handleStart({ request, env: ENV, fetchImpl: world.fetch, ...options });
  assert.equal((await call(startRequest({}))).status, 401, "no bearer token");
  assert.equal((await call(startRequest({ authorization: "Bearer user-a-jwt" }, { provider: "discord" }))).status, 400, "another provider through the Steam function");
  assert.equal((await call(startRequest({ authorization: "Bearer user-a-jwt" }, {}))).status, 400);
  assert.equal((await call(startRequest({ authorization: "Bearer user-a-jwt", origin: "https://evil.example" }))).status, 403);
  assert.equal((await call(startRequest({ authorization: "Bearer user-a-jwt" }, undefined, "GET"))).status, 405);
  assert.equal((await call(startRequest({ authorization: "Bearer user-a-jwt" }), { env: { supabaseUrl: SUPABASE } })).status, 503);
  assert.equal((await call(startRequest({ authorization: "Bearer not-a-user" }))).status, 401, "the database rejects a bad JWT");
  const preflight = await call(new Request(`${SUPABASE}/functions/v1/steam-connect-start`, { method: "OPTIONS", headers: { origin: SITE_ORIGIN } }));
  assert.equal(preflight.status, 204);
  assert.equal(world.attempts.size, 0, "no attempt was created for any refused request");
  assert.equal(steamCalls(world).length, 0, "START never contacts Steam");
});

test("START maps database refusals to safe fixed errors", async () => {
  for (const [message, status, expected] of [["EMAIL_NOT_VERIFIED", 403, 403], ["IDENTITY_NOT_FOUND", 409, 409], ["TOO_MANY_ATTEMPTS", 429, 429], ["surprising internal detail", 500, 502]]) {
    const world = makeWorld({ startError: message, startStatus: status });
    const response = await handleStart({ request: startRequest({ authorization: "Bearer user-a-jwt" }), env: ENV, fetchImpl: world.fetch });
    assert.equal(response.status, expected);
    assert.equal((await response.text()).includes("surprising internal detail"), false);
  }
});

// ------------------------------------------------------------------------------------------------ CALLBACK: success

test("a genuine Steam response is verified by Steam, then links exactly that SteamID64 to exactly the attempt's owner", async () => {
  const { world, state, fields } = setup();
  const logs = [];
  const response = await runCallback(world, callbackRequest(state, fields), { log: (event, code) => logs.push(`${event}:${code}`) });
  assert.equal(response.status, 302);
  const back = location(response);
  assert.equal(`${back.origin}${back.pathname}`, RETURN_URL);
  assert.equal(back.searchParams.get("connection"), "steam");
  assert.equal(back.searchParams.get("result"), "connected");
  assert.deepEqual([...back.searchParams.keys()].sort(), ["connection", "result"]);
  assert.deepEqual(world.connections, [{ entity: "entity-a", steamId: STEAM_A, isPublic: false, trust: "CONNECTED" }]);
  assert.equal(world.connections[0].isPublic, false, "a new Steam connection is private");

  // Steam was asked to validate the assertion exactly once, at the fixed endpoint, with mode=check_authentication.
  assert.equal(steamCalls(world).length, 1);
  assert.equal(steamCalls(world)[0].url, STEAM_OPENID.endpoint);
  const sent = Object.fromEntries(world.steam.requests[0].entries());
  assert.equal(sent["openid.mode"], "check_authentication");
  for (const key of Object.keys(fields).filter(k => k !== "openid.mode")) assert.equal(sent[key], fields[key], `${key} is forwarded unchanged`);
  assert.equal("state" in sent, false, "the raw callback state param is not forwarded to Steam");

  const complete = JSON.parse(rpcCalls(world, "complete_steam_connection_attempt")[0].body);
  assert.deepEqual(complete, { candidate_attempt_id: "attempt-1", candidate_steam_id: STEAM_A });
  assert.deepEqual(logs, ["callback:link_CONNECTED"]);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(String(response.headers.get("location")).includes(STEAM_A), false, "the SteamID64 is not put in the return URL");
});

test("signing in again with the SAME Steam account is a reconnect (still exactly one connection)", async () => {
  const { world, state, fields } = setup();
  await runCallback(world, callbackRequest(state, fields));
  const second = world.newAttempt("user-a", "entity-a");
  const again = await runCallback(world, callbackRequest(second, world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, second) })));
  assert.equal(location(again).searchParams.get("result"), "reconnected");
  assert.equal(world.connections.length, 1);
});

// ------------------------------------------------------------------------------------------------ CALLBACK: rejection of bad responses

test("an invalid OpenID response (Steam says the signature is not valid) is rejected and links nothing", async () => {
  const { world, state, fields } = setup();
  fields["openid.sig"] = "AAAAinvalidsignatureAAAA=";
  const response = await runCallback(world, callbackRequest(state, fields));
  assert.equal(location(response).searchParams.get("result"), "error");
  assert.equal(location(response).searchParams.get("reason"), "verification_failed");
  assert.equal(world.connections.length, 0);
  assert.equal(steamCalls(world).length, 1, "Steam was asked, and refused");
  assert.equal(world.finished.at(-1).candidate_outcome, "EXCHANGE_FAILED");
  assert.equal(rpcCalls(world, "complete_steam_connection_attempt").length, 0);
});

test("a FORGED SteamID64 (claimed_id swapped after signing) is rejected: Steam's signature check fails", async () => {
  const { world, state, fields } = setup();
  fields["openid.claimed_id"] = `https://steamcommunity.com/openid/id/${STEAM_B}`;
  fields["openid.identity"] = `https://steamcommunity.com/openid/id/${STEAM_B}`;
  const response = await runCallback(world, callbackRequest(state, fields));
  assert.equal(location(response).searchParams.get("reason"), "verification_failed");
  assert.equal(world.connections.length, 0, "the forged identity is never linked");
});

test("a fully browser-fabricated assertion (never issued by Steam) is rejected", async () => {
  const { world, state } = setup();
  const fabricated = {
    "openid.ns": STEAM_OPENID.ns, "openid.mode": "id_res", "openid.op_endpoint": STEAM_OPENID.endpoint,
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAM_B}`, "openid.identity": `https://steamcommunity.com/openid/id/${STEAM_B}`,
    "openid.return_to": returnToFor(SUPABASE, state), "openid.response_nonce": `${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}abc`,
    "openid.assoc_handle": "1", "openid.signed": SIGNED_FIELDS.join(","), "openid.sig": "ZmFrZQ==",
  };
  const response = await runCallback(world, callbackRequest(state, fabricated));
  assert.equal(location(response).searchParams.get("reason"), "verification_failed");
  assert.equal(world.connections.length, 0);
});

test("a bare SteamID in the query (no assertion at all) links nothing and never contacts Steam", async () => {
  const { world, state } = setup();
  const response = await handleCallback({ request: new Request(`${CALLBACK}?state=${state}&steamid=${STEAM_B}&openid.claimed_id=${STEAM_B}`), env: ENV, fetchImpl: world.fetch });
  assert.equal(location(response).searchParams.get("result"), "error");
  assert.equal(world.connections.length, 0);
  assert.equal(steamCalls(world).length, 0);
});

test("locally inconsistent assertions are rejected WITHOUT contacting Steam (foreign OP, foreign identifier, mismatched ids, out-of-range ids)", async () => {
  const cases = {
    "another OP endpoint": f => { f["openid.op_endpoint"] = "https://evil.example/openid/login"; },
    "claimed_id on another host": f => { f["openid.claimed_id"] = f["openid.identity"] = `https://evil.example/openid/id/${STEAM_A}`; },
    "claimed_id path is not an openid id": f => { f["openid.claimed_id"] = f["openid.identity"] = `https://steamcommunity.com/id/somebody`; },
    "identity differs from claimed_id": f => { f["openid.identity"] = `https://steamcommunity.com/openid/id/${STEAM_B}`; },
    "SteamID below the individual range": f => { f["openid.claimed_id"] = f["openid.identity"] = "https://steamcommunity.com/openid/id/12345678901234567"; },
    "SteamID above the individual range": f => { f["openid.claimed_id"] = f["openid.identity"] = "https://steamcommunity.com/openid/id/76561202255233024"; },
    "SteamID with extra characters": f => { f["openid.claimed_id"] = f["openid.identity"] = `https://steamcommunity.com/openid/id/${STEAM_A}/../x`; },
    "wrong namespace": f => { f["openid.ns"] = "http://specs.openid.net/auth/1.1"; },
    "wrong mode": f => { f["openid.mode"] = "setup_needed"; },
    "not signed: claimed_id": f => { f["openid.signed"] = SIGNED_FIELDS.filter(k => k !== "claimed_id").join(","); },
    "not signed: return_to": f => { f["openid.signed"] = SIGNED_FIELDS.filter(k => k !== "return_to").join(","); },
    "not signed: response_nonce": f => { f["openid.signed"] = SIGNED_FIELDS.filter(k => k !== "response_nonce").join(","); },
    "no signature": f => { delete f["openid.sig"]; },
    "no association handle": f => { delete f["openid.assoc_handle"]; },
    "malformed nonce": f => { f["openid.response_nonce"] = "not-a-timestamp"; },
    "stale nonce (older than 10 minutes)": f => { f["openid.response_nonce"] = `${new Date(Date.now() - 11 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")}abc`; },
    "nonce from the future": f => { f["openid.response_nonce"] = `${new Date(Date.now() + 10 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")}abc`; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const { world, state, fields } = setup();
    mutate(fields);
    const response = await runCallback(world, callbackRequest(state, fields));
    assert.equal(location(response).searchParams.get("reason"), "verification_failed", name);
    assert.equal(world.connections.length, 0, name);
    assert.equal(steamCalls(world).length, 0, `${name}: nothing was sent to Steam`);
  }
});

test("repeated protocol parameters (parameter pollution) are refused", async () => {
  const { world, state, fields } = setup();
  const params = new URLSearchParams({ state, ...fields });
  params.append("openid.claimed_id", `https://steamcommunity.com/openid/id/${STEAM_B}`);
  const response = await runCallback(world, new Request(`${CALLBACK}?${params.toString()}`));
  assert.equal(location(response).searchParams.get("reason"), "verification_failed");
  assert.equal(world.connections.length, 0);
  assert.equal(steamCalls(world).length, 0);
});

test("Steam's answer must be exactly one is_valid:true line (false, empty, duplicated, or an error status are refusals)", async () => {
  for (const [name, body, status, reason] of [
    ["is_valid:false", "ns:http://specs.openid.net/auth/2.0\nis_valid:false\n", 200, "verification_failed"],
    ["empty body", "", 200, "verification_failed"],
    ["duplicated with false", "is_valid:true\nis_valid:false\n", 200, "verification_failed"],
    ["html page", "<html>is_valid:true</html>", 200, "verification_failed"],
    ["HTTP 500", "is_valid:true", 500, "provider_error"],
  ]) {
    const { world, state, fields } = setup();
    world.steam.rawBody = body;
    world.steam.status = status;
    const response = await runCallback(world, callbackRequest(state, fields));
    assert.equal(location(response).searchParams.get("reason"), reason, name);
    assert.equal(world.connections.length, 0, name);
  }
});

test("Steam being unreachable is a safe provider error and links nothing", async () => {
  const { world, state, fields } = setup();
  world.steam.offline = true;
  const logs = [];
  const response = await runCallback(world, callbackRequest(state, fields), { log: (e, c) => logs.push(`${e}:${c}`) });
  assert.equal(location(response).searchParams.get("reason"), "provider_error");
  assert.equal(world.connections.length, 0);
  assert.equal(world.finished.at(-1).candidate_outcome, "PROVIDER_ERROR");
  assert.deepEqual(logs, ["callback:verify_provider_unavailable"]);
});

test("cancelling on Steam is recorded as cancelled, contacts nothing, links nothing", async () => {
  const { world, state } = setup();
  const response = await runCallback(world, callbackRequest(state, { "openid.ns": STEAM_OPENID.ns, "openid.mode": "cancel" }));
  assert.equal(location(response).searchParams.get("result"), "cancelled");
  assert.equal(world.connections.length, 0);
  assert.equal(steamCalls(world).length, 0);
  assert.equal(world.finished.at(-1).candidate_outcome, "DENIED");
});

// ------------------------------------------------------------------------------------------------ CALLBACK: state

test("missing or malformed state is rejected and Steam is never contacted", async () => {
  for (const state of [null, "", "not-hex", "A".repeat(64), "a".repeat(63), "a".repeat(65), `${"a".repeat(64)}&x=1`]) {
    const world = makeWorld();
    const real = world.newAttempt("user-a", "entity-a");
    const fields = world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, real) });
    const response = await runCallback(world, callbackRequest(real, fields, { stateParam: state }));
    assert.equal(location(response).searchParams.get("result"), "error", String(state));
    assert.equal(location(response).searchParams.get("reason"), "invalid_state", String(state));
    assert.equal(world.connections.length, 0);
    assert.equal(steamCalls(world).length, 0);
    assert.equal(world.attempts.get(real).consumed, false, "the real attempt was not touched");
  }
});

test("a state that was never issued is invalid; a duplicated state parameter is invalid", async () => {
  const { world, state, fields } = setup();
  const unknown = randomBytes(32).toString("hex");
  const response = await runCallback(world, callbackRequest(unknown, world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, unknown) })));
  assert.equal(location(response).searchParams.get("reason"), "invalid_state");
  const params = new URLSearchParams({ state, ...fields });
  params.append("state", unknown);
  const doubled = await runCallback(world, new Request(`${CALLBACK}?${params.toString()}`));
  assert.equal(location(doubled).searchParams.get("reason"), "invalid_state");
  assert.equal(world.connections.length, 0);
  assert.equal(steamCalls(world).length, 0);
});

test("an EXPIRED state is rejected before Steam is contacted", async () => {
  const world = makeWorld();
  const state = world.newAttempt("user-a", "entity-a", { expired: true });
  const response = await runCallback(world, callbackRequest(state, world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, state) })));
  assert.equal(location(response).searchParams.get("reason"), "expired");
  assert.equal(world.connections.length, 0);
  assert.equal(steamCalls(world).length, 0);
});

test("a REUSED state is rejected (the callback is single-use), even with a fresh genuine assertion", async () => {
  const { world, state, fields } = setup();
  const first = await runCallback(world, callbackRequest(state, fields));
  assert.equal(location(first).searchParams.get("result"), "connected");
  const replay = await runCallback(world, callbackRequest(state, fields));
  assert.equal(location(replay).searchParams.get("reason"), "already_used");
  const fresh = await runCallback(world, callbackRequest(state, world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, state) })));
  assert.equal(location(fresh).searchParams.get("reason"), "already_used");
  assert.equal(world.connections.length, 1);
  assert.equal(steamCalls(world).length, 1, "Steam was contacted only for the first, valid use");
});

test("concurrent callbacks with the same state link at most once", async () => {
  const { world, state, fields } = setup();
  const results = await Promise.all([1, 2, 3].map(() => runCallback(world, callbackRequest(state, fields))));
  const outcomes = results.map(r => location(r).searchParams.get("result") || location(r).searchParams.get("reason"));
  assert.equal(outcomes.filter(o => o === "connected").length, 1);
  assert.equal(world.connections.length, 1);
});

test("STATE SUBSTITUTION: an assertion issued for one attempt cannot be used with another attempt's state", async () => {
  const world = makeWorld();
  const stateA = world.newAttempt("user-a", "entity-a");
  const stateB = world.newAttempt("user-b", "entity-b");
  // The attacker (user B) signs in on Steam for THEIR attempt, then presents that assertion together with A's state.
  const forB = world.steam.assertion({ steamId: STEAM_B, returnTo: returnToFor(SUPABASE, stateB) });
  const response = await runCallback(world, callbackRequest(stateA, forB));
  assert.equal(location(response).searchParams.get("reason"), "verification_failed");
  assert.equal(world.connections.length, 0, "nothing was linked to A");
  assert.equal(steamCalls(world).length, 0, "the return_to mismatch is caught locally");
  // ... and the reverse: A's state alone with B's assertion in the return_to of a different callback host
  const evil = world.steam.assertion({ steamId: STEAM_B, returnTo: `https://evil.example/cb?state=${stateB}` });
  const response2 = await runCallback(world, callbackRequest(stateB, evil));
  assert.equal(location(response2).searchParams.get("reason"), "verification_failed");
  assert.equal(world.connections.length, 0);
});

test("a state issued for ANOTHER provider (Discord) is invalid at the Steam callback and stays unconsumed", async () => {
  const world = makeWorld();
  const discordState = world.newAttempt("user-a", "entity-a", { provider: "discord" });
  const response = await runCallback(world, callbackRequest(discordState, world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, discordState) })));
  assert.equal(location(response).searchParams.get("reason"), "invalid_state");
  assert.equal(world.connections.length, 0);
  assert.equal(steamCalls(world).length, 0);
  assert.equal(world.attempts.get(discordState).consumed, false, "the Discord attempt is untouched");
  assert.equal(JSON.parse(rpcCalls(world, "consume_connection_attempt_for")[0].body).expected_provider, "steam");
});

// ------------------------------------------------------------------------------------------------ ownership / uniqueness

test("the callback links the SteamID64 only to the account that STARTED the attempt, never to anyone else", async () => {
  const world = makeWorld();
  const stateB = world.newAttempt("user-b", "entity-b");
  // Whoever's browser delivers the callback (even one signed in as user A elsewhere), the owner is derived from the state only.
  const request = callbackRequest(stateB, world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, stateB) }));
  request.headers.set?.("authorization", "Bearer user-a-jwt");
  await runCallback(world, request);
  assert.deepEqual(world.connections.map(c => c.entity), ["entity-b"]);
  assert.equal(world.calls.filter(c => c.headers.Authorization === "Bearer user-a-jwt").length, 0, "no caller-supplied credential is used");
});

test("the same SteamID64 cannot belong to two GamID accounts, and the first owner is left untouched", async () => {
  const world = makeWorld();
  const stateA = world.newAttempt("user-a", "entity-a");
  await runCallback(world, callbackRequest(stateA, world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, stateA) })));
  const stateB = world.newAttempt("user-b", "entity-b");
  const response = await runCallback(world, callbackRequest(stateB, world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, stateB) })));
  assert.equal(location(response).searchParams.get("result"), "error");
  assert.equal(location(response).searchParams.get("reason"), "account_in_use");
  assert.deepEqual(world.connections, [{ entity: "entity-a", steamId: STEAM_A, isPublic: false, trust: "CONNECTED" }], "not silently transferred");
});

test("an owner with a different Steam account connected is told to disconnect first (never silently replaced)", async () => {
  const world = makeWorld();
  const first = world.newAttempt("user-a", "entity-a");
  await runCallback(world, callbackRequest(first, world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, first) })));
  const second = world.newAttempt("user-a", "entity-a");
  const response = await runCallback(world, callbackRequest(second, world.steam.assertion({ steamId: STEAM_B, returnTo: returnToFor(SUPABASE, second) })));
  assert.equal(location(response).searchParams.get("reason"), "other_account_connected");
  assert.equal(world.connections[0].steamId, STEAM_A);
});

// ------------------------------------------------------------------------------------------------ robustness / hygiene

test("callback refuses non-GET, and an unconfigured backend redirects safely without contacting anything", async () => {
  const { world, state, fields } = setup();
  assert.equal((await runCallback(world, new Request(`${CALLBACK}?state=${state}`, { method: "POST", body: "x" }))).status, 405);
  const unconfigured = await handleCallback({ request: callbackRequest(state, fields), env: { supabaseUrl: SUPABASE }, fetchImpl: world.fetch });
  assert.equal(location(unconfigured).searchParams.get("reason"), "not_configured");
  assert.equal(world.calls.length, 0);
});

test("an unexpected failure redirects with a fixed code and leaks nothing (not the exception, not the state)", async () => {
  const { world, state, fields } = setup({ throwOnConsume: true });
  const logs = [];
  const response = await runCallback(world, callbackRequest(state, fields), { log: (event, code) => logs.push(`${event}:${code}`) });
  assert.equal(location(response).searchParams.get("reason"), "server_error");
  const text = `${response.headers.get("location")} ${logs.join(" ")}`;
  assert.equal(text.includes("secret-ish"), false);
  assert.equal(text.includes(state), false);
  assert.deepEqual(logs, ["callback:unexpected_Error"]);
});

test("nothing sensitive ever appears in a redirect or a log line across success and failure paths", async () => {
  const outputs = [];
  for (const mutate of [() => {}, f => { f["openid.sig"] = "bad"; }]) {
    const { world, state, fields } = setup();
    mutate(fields);
    const logs = [];
    const response = await runCallback(world, callbackRequest(state, fields), { log: (e, c) => logs.push(`${e}:${c}`) });
    outputs.push(response.headers.get("location"), ...logs);
  }
  const text = outputs.join(" ");
  for (const secret of [STEAM_A, STEAM_SECRET, SERVICE_KEY, ANON_KEY, "openid.", "sig=", "assoc"]) assert.equal(text.includes(secret), false, `no ${secret}`);
  assert.match(text, /^\S+account\/\?connection=steam&result=connected callback:link_CONNECTED \S+result=error&reason=verification_failed callback:verify_verification_failed$/);
});

test("verification talks only to the one fixed Steam endpoint: a hostile claimed_id never makes the backend contact another server", async () => {
  const { world, state, fields } = setup();
  fields["openid.claimed_id"] = fields["openid.identity"] = "https://evil.example/openid/id/76561198000000001";
  await runCallback(world, callbackRequest(state, fields));
  assert.deepEqual(world.calls.map(c => new URL(c.url).origin).filter(origin => origin !== SUPABASE), []);
  const direct = await verifyAssertion({ searchParams: new URLSearchParams(fields), expectedReturnTo: returnToFor(SUPABASE, state), fetchImpl: world.fetch });
  assert.equal(direct.ok, false);
});

test("checkAssertionLocally accepts a well-formed assertion and reads only the SteamID64 from it", () => {
  const world = makeWorld();
  const state = "b".repeat(64);
  const fields = world.steam.assertion({ steamId: STEAM_A, returnTo: returnToFor(SUPABASE, state) });
  const result = checkAssertionLocally({ searchParams: new URLSearchParams(fields), expectedReturnTo: returnToFor(SUPABASE, state) });
  assert.equal(result.ok, true);
  assert.equal(result.steamId, STEAM_A);
  assert.equal(readEnv(name => ({ SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s" }[name])).serviceKey, "s");
});

test("the Steam module holds no credential, requests no Steam Web API, and does no library/ownership discovery", () => {
  const source = readFileSync(new URL("../supabase/functions/_shared/steam-openid.js", import.meta.url), "utf8");
  const code = source.split("\n").filter(line => !line.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /api\.steampowered|IPlayerService|GetOwnedGames|ISteamUser|ISteamUserStats|steamcommunity\.com\/(?:profiles|id)\/|STEAM_API_KEY|steam[_-]?(?:web[_-]?)?api|steam[_-]?key|marvel|rivals|appid|playtime|achievement/i);
  assert.doesNotMatch(code, /password|Steam ?Guard|cookie|set-cookie|sessionid|localStorage/i);
  for (const name of ["steam-connect-start", "steam-connect-callback"]) {
    const entry = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), "utf8");
    assert.match(entry, /from "\.\.\/_shared\/steam-openid\.js"/);
    assert.doesNotMatch(entry, /discord/i, "Steam functions are isolated from the Discord provider module");
  }
  assert.doesNotMatch(code, /discord/i, "the Steam provider module has no Discord dependency");
});
