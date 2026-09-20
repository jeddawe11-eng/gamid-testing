import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MARVEL_RIVALS_APP_ID, SITE_ORIGIN, STEAM_GAMES, buildOwnedGamesUrl, classifyOwnedGames, cleanGameName, fetchOwnedGames, handleRefresh, readEnv,
} from "../supabase/functions/_shared/steam-games.js";

const SUPABASE = "https://example-project.supabase.co";
const SERVICE_KEY = "test-service-role-key-value";
const ANON_KEY = "test-anon-key-value";
const STEAM_KEY = "A1B2C3D4E5F60718293A4B5C6D7E8F90"; // 32 hex: the shape of a real Steam Web API key (this one is fake)
const ENV = { supabaseUrl: SUPABASE, anonKey: ANON_KEY, serviceKey: SERVICE_KEY, steamApiKey: STEAM_KEY };
const STEAM_A = "76561198000000021";
const STEAM_B = "76561198000000022";
const ICON = "0bbb630d63262dd66d2fdde8f1d8f8b6b0dc0fca";
const API_HOST = "https://api.steampowered.com";

// ------------------------------------------------------------------------------------------------ a fake backend + a fake official Steam API
// The backend implements exactly the database contract proven against live TESTING by tests/integration/steam-games-db.sql:
// reserve (NOT_CONNECTED / COOLDOWN 120 s / 6 per hour / 20 per day), begin (SteamID from the stored connection, once), and a save that only
// lets AVAILABLE / EMPTY change the stored list.
function makeWorld(options = {}) {
  const world = {
    clock: 1_000_000_000_000,
    calls: [],
    attempts: [],
    users: { "user-a-jwt": { user: "user-a", entity: "entity-a" }, "user-b-jwt": { user: "user-b", entity: "entity-b" }, "user-c-jwt": { user: "user-c", entity: "entity-c" } },
    connections: { "entity-a": { id: "conn-a", steamId: STEAM_A }, "entity-b": { id: "conn-b", steamId: STEAM_B } }, // user C has none
    lists: {},   // connection id -> [{appid,name,icon,playtime}]
    states: {},  // connection id -> { last_result, game_count, last_success_at }
    steam: { requests: [], respond: null, throwWith: null, ...options.steam },
    logs: [],
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  world.log = (event, code) => world.logs.push(`${event}:${code}`);

  world.fetch = async (url, init = {}) => {
    const target = new URL(url);
    const record = { url: String(url), method: init.method || "GET", headers: { ...(init.headers || {}) }, body: init.body === undefined ? "" : String(init.body) };
    world.calls.push(record);

    if (target.origin === SUPABASE) {
      const name = target.pathname.replace("/rest/v1/rpc/", "");
      const args = (() => { try { return JSON.parse(record.body); } catch { return {}; } })();
      const bearer = String(record.headers.Authorization || "").replace(/^Bearer /, "");

      if (name === "reserve_steam_games_refresh") {
        if (options.reserveError) return json({ message: options.reserveError }, options.reserveStatus || 400);
        const who = world.users[bearer];
        if (!who) return json({ code: "PGRST301", message: "JWT invalid" }, 401);
        const conn = world.connections[who.entity];
        if (!conn) return json([{ reservation_id: null, status: "NOT_CONNECTED", retry_after_seconds: null }]);
        const mine = world.attempts.filter(a => a.entity === who.entity);
        const last = mine.at(-1);
        if (last && world.clock - last.at < 120_000) return json([{ reservation_id: null, status: "COOLDOWN", retry_after_seconds: Math.ceil((120_000 - (world.clock - last.at)) / 1000) }]);
        if (mine.filter(a => world.clock - a.at < 3_600_000).length >= 6) return json([{ reservation_id: null, status: "RATE_LIMITED", retry_after_seconds: 1800 }]);
        if (mine.filter(a => world.clock - a.at < 86_400_000).length >= 20) return json([{ reservation_id: null, status: "RATE_LIMITED", retry_after_seconds: 40000 }]);
        const attempt = { id: `res-${world.attempts.length + 1}`, entity: who.entity, connection: conn.id, at: world.clock, started: false, done: false };
        world.attempts.push(attempt);
        return json([{ reservation_id: attempt.id, status: "OK", retry_after_seconds: null }]);
      }

      // everything below is service_role only (the real functions raise BACKEND_ONLY otherwise)
      if (bearer !== SERVICE_KEY) return json({ message: "permission denied" }, 403);

      if (name === "begin_steam_games_fetch") {
        const attempt = world.attempts.find(a => a.id === args.candidate_reservation_id);
        if (!attempt || attempt.done) return json([{ status: "INVALID_RESERVATION", steam_id: null }]);
        if (attempt.started) return json([{ status: "ALREADY_STARTED", steam_id: null }]);
        const conn = Object.values(world.connections).find(c => c.id === attempt.connection);
        if (!conn) { attempt.done = true; return json([{ status: "CONNECTION_CHANGED", steam_id: null }]); }
        attempt.started = true;
        attempt.steamId = conn.steamId;
        return json([{ status: "OK", steam_id: conn.steamId }]);
      }

      if (name === "save_steam_games_result") {
        const attempt = world.attempts.find(a => a.id === args.candidate_reservation_id);
        if (!attempt || attempt.done || !attempt.started) return json("INVALID_RESERVATION");
        if (options.saveConnectionChanged) { attempt.done = true; return json("CONNECTION_CHANGED"); }
        attempt.done = true;
        let outcome = args.candidate_outcome;
        if (outcome === "AVAILABLE" && !(Array.isArray(args.candidate_games) && args.candidate_games.length)) outcome = "MALFORMED";
        const state = world.states[attempt.connection] || (world.states[attempt.connection] = { last_result: null, game_count: null, last_success_at: null });
        world.saved = { outcome, games: args.candidate_games };
        if (outcome === "AVAILABLE") {
          const seen = new Map();
          for (const g of args.candidate_games) seen.set(g.appid, g); // the database keeps one row per app id
          world.lists[attempt.connection] = [...seen.values()];
          Object.assign(state, { last_result: outcome, game_count: seen.size, last_success_at: world.clock });
        } else if (outcome === "EMPTY") {
          world.lists[attempt.connection] = [];
          Object.assign(state, { last_result: outcome, game_count: 0, last_success_at: world.clock });
        } else state.last_result = outcome; // a failed / private / malformed attempt keeps the last good list and count
        return json("SAVED");
      }
    }

    if (target.origin === API_HOST) {
      world.steam.requests.push({ url: String(url), method: record.method, headers: record.headers, redirect: init.redirect });
      if (world.steam.throwWith) throw world.steam.throwWith(String(url));
      return world.steam.respond(target);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return world;
}

const steamJson = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const LIBRARY = { response: { game_count: 3, games: [
  { appid: 570, name: "Dota 2", img_icon_url: ICON, playtime_forever: 5000 },
  { appid: 2767030, name: "Marvel Rivals", img_icon_url: ICON, playtime_forever: 120 },
  { appid: 730, playtime_forever: 0 },
] } };

const request = (body = { action: "refresh" }, { token = "user-a-jwt", method = "POST", headers = {}, url = `${SUPABASE}/functions/v1/steam-games-refresh` } = {}) =>
  new Request(url, { method, headers: { "content-type": "application/json", origin: SITE_ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: method === "POST" ? JSON.stringify(body) : undefined });
const run = (world, req, env = ENV) => handleRefresh({ request: req, env, fetchImpl: world.fetch, log: world.log });
const rpcNames = world => world.calls.filter(c => c.url.includes("/rpc/")).map(c => c.url.split("/rpc/")[1]);
const withSteam = (respond, options = {}) => makeWorld({ ...options, steam: { respond } });

// ------------------------------------------------------------------------------------------------ the official request

test("the request is the OFFICIAL GetOwnedGames endpoint with the documented parameters, including free-to-play games that were played", () => {
  const url = new URL(buildOwnedGamesUrl({ steamId: STEAM_A, apiKey: STEAM_KEY }));
  assert.equal(`${url.origin}${url.pathname}`, "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["format", "include_appinfo", "include_played_free_games", "key", "steamid"]);
  assert.equal(url.searchParams.get("include_played_free_games"), "true", "free-to-play games the account has played are requested (e.g. Marvel Rivals)");
  assert.equal(url.searchParams.get("include_appinfo"), "true", "names and icons come from the same official call");
  assert.equal(url.searchParams.get("steamid"), STEAM_A);
  assert.equal(url.searchParams.get("key"), STEAM_KEY);
  assert.equal(STEAM_GAMES.endpoint, "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
});

test("the request refuses a malformed SteamID or key instead of sending it (no injection into the URL)", () => {
  for (const steamId of ["", "123", "76561198000000021 ", "7656119800000002a", "76561198000000021&key=x", "76561198000000021/../x", null, undefined]) {
    assert.throws(() => buildOwnedGamesUrl({ steamId, apiKey: STEAM_KEY }), /INVALID_STEAM_ID/, String(steamId));
  }
  for (const apiKey of ["", "short", "G".repeat(32), `${STEAM_KEY}&steamid=1`, `${STEAM_KEY}0`, null, undefined]) {
    assert.throws(() => buildOwnedGamesUrl({ steamId: STEAM_A, apiKey }), /INVALID_KEY/, String(apiKey));
  }
});

// ------------------------------------------------------------------------------------------------ response classification

test("a library Steam returns is AVAILABLE, normalized to app id / name / icon / playtime, with free-to-play games included", () => {
  const result = classifyOwnedGames({ status: 200, text: JSON.stringify(LIBRARY) });
  assert.equal(result.kind, "AVAILABLE");
  assert.deepEqual(result.games, [
    { appid: "570", name: "Dota 2", icon: ICON, playtime: 5000 },
    { appid: "2767030", name: "Marvel Rivals", icon: ICON, playtime: 120 },
    { appid: "730", name: null, icon: null, playtime: 0 },
  ]);
  for (const game of result.games) assert.deepEqual(Object.keys(game).sort(), ["appid", "icon", "name", "playtime"], "nothing else is kept (no raw response)");
});

test("a private / unshared library is UNAVAILABLE - it is never reported as zero games", () => {
  assert.equal(classifyOwnedGames({ status: 200, text: JSON.stringify({ response: {} }) }).kind, "UNAVAILABLE");
  assert.equal(classifyOwnedGames({ status: 200, text: '{"response":{}}' }).games, undefined);
});

test("a genuinely accessible but empty library is EMPTY (game_count 0, or an empty games list)", () => {
  assert.equal(classifyOwnedGames({ status: 200, text: JSON.stringify({ response: { game_count: 0 } }) }).kind, "EMPTY");
  assert.equal(classifyOwnedGames({ status: 200, text: JSON.stringify({ response: { game_count: 0, games: [] } }) }).kind, "EMPTY");
  assert.equal(classifyOwnedGames({ status: 200, text: JSON.stringify({ response: { games: [] } }) }).kind, "EMPTY");
});

test("Steam being unreachable, throttled, or failing is a TEMPORARY error; a rejected key is a SERVICE error - neither is 'no games'", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(classifyOwnedGames({ status, text: "" }).kind, "TEMPORARY_ERROR", String(status));
  for (const status of [401, 403, 400, 404]) assert.equal(classifyOwnedGames({ status, text: "<html>Unauthorized</html>" }).kind, "SERVICE_ERROR", String(status));
  assert.equal(classifyOwnedGames({ status: 302, text: "" }).kind, "MALFORMED");
});

test("a malformed Steam response is MALFORMED (not JSON, wrong shape, contradictory counts, no usable game)", () => {
  const cases = [
    "not json at all", "", "null", "[]", '"string"', "{}", '{"response":null}', '{"response":[]}', '{"response":"x"}',
    '{"response":{"games":"nope"}}', '{"response":{"games":{}}}', '{"response":{"game_count":"3"}}', '{"response":{"game_count":-1}}', '{"response":{"game_count":2.5}}',
    '{"response":{"game_count":5}}', '{"response":{"game_count":2,"games":[]}}',
    '{"response":{"games":[null,1,"x",[],{}]}}', '{"response":{"games":[{"appid":"570"},{"appid":-1},{"appid":0},{"appid":1.5},{"appid":4294967296}]}}',
  ];
  for (const text of cases) {
    const kind = classifyOwnedGames({ status: 200, text }).kind;
    assert.equal(kind, "MALFORMED", text);
  }
  assert.equal(classifyOwnedGames({ status: 200, text: undefined }).kind, "MALFORMED");
  assert.equal(classifyOwnedGames({ status: 200, text: "x".repeat(STEAM_GAMES.maxBodyChars + 1) }).kind, "MALFORMED");
  // a body that IS valid JSON but larger than the cap is refused too (it would otherwise parse as an accessible empty library)
  assert.equal(classifyOwnedGames({ status: 200, text: `{"response":{"game_count":0}}${" ".repeat(STEAM_GAMES.maxBodyChars)}` }).kind, "MALFORMED");
  const tooMany = { response: { games: Array.from({ length: STEAM_GAMES.maxGames + 1 }, (_, i) => ({ appid: i + 1 })) } };
  assert.equal(classifyOwnedGames({ status: 200, text: JSON.stringify(tooMany) }).kind, "MALFORMED");
});

test("invalid entries are skipped individually while the valid games survive", () => {
  const text = JSON.stringify({ response: { game_count: 4, games: [{ appid: 10, name: "Counter-Strike" }, null, { appid: "x" }, { appid: 20, name: "Team Classic" }] } });
  const result = classifyOwnedGames({ status: 200, text });
  assert.equal(result.kind, "AVAILABLE");
  assert.deepEqual(result.games.map(g => g.appid), ["10", "20"]);
});

test("duplicate app ids collapse to one game, keeping the entry with the most playtime (and a name)", () => {
  const text = JSON.stringify({ response: { games: [
    { appid: 570, name: "Dota 2", playtime_forever: 100 },
    { appid: 570, name: "Dota 2 (dup)", playtime_forever: 5000, img_icon_url: ICON },
    { appid: 570, playtime_forever: 3 },
    { appid: 440 }, { appid: 440, name: "Team Fortress 2" },
  ] } });
  const result = classifyOwnedGames({ status: 200, text });
  assert.equal(result.games.length, 2);
  assert.deepEqual(result.games.find(g => g.appid === "570"), { appid: "570", name: "Dota 2 (dup)", icon: ICON, playtime: 5000 });
  assert.equal(result.games.find(g => g.appid === "440").name, "Team Fortress 2");
});

test("names, icons and playtime are validated: control/invisible characters stripped, junk icon hashes and negative playtime dropped", () => {
  const bidi = String.fromCharCode(0x202e);
  const zero = String.fromCharCode(0x200b);
  assert.equal(cleanGameName(`  Ha${zero}lf  Life\n 2${bidi}  `), "Ha lf Life 2");
  assert.equal(cleanGameName("x".repeat(500)).length, STEAM_GAMES.maxNameLength);
  assert.equal(cleanGameName("   "), null);
  assert.equal(cleanGameName(42), null);
  const text = JSON.stringify({ response: { games: [
    { appid: 1, name: "Bad icon", img_icon_url: "../../etc/passwd", playtime_forever: -5 },
    { appid: 2, name: "Upper icon", img_icon_url: ICON.toUpperCase(), playtime_forever: "12" },
    { appid: 3, name: "Fine", img_icon_url: ICON, playtime_forever: 2147483648 },
  ] } });
  const [a, b, c] = classifyOwnedGames({ status: 200, text }).games;
  assert.deepEqual([a.icon, a.playtime, b.icon, b.playtime, c.icon, c.playtime], [null, null, null, null, ICON, null]);
});

test("Marvel Rivals is recognized by Steam App ID 2767030 - as a plain discovered game, never as a verified identity", () => {
  assert.equal(MARVEL_RIVALS_APP_ID, "2767030");
  const result = classifyOwnedGames({ status: 200, text: JSON.stringify(LIBRARY) });
  const marvel = result.games.find(g => g.appid === MARVEL_RIVALS_APP_ID);
  assert.deepEqual(marvel, { appid: "2767030", name: "Marvel Rivals", icon: ICON, playtime: 120 });
  assert.equal(JSON.stringify(result).match(/verified|uid|rank|stats|account/i), null, "no verification, UID, rank, stats or account concept is produced");
  assert.equal(classifyOwnedGames({ status: 200, text: JSON.stringify({ response: { games: [{ appid: 2767031, name: "Marvel Rivals Lookalike" }] } }) }).games.some(g => g.appid === MARVEL_RIVALS_APP_ID), false, "only the exact App ID matches");
});

// ------------------------------------------------------------------------------------------------ the request pipeline

test("fetchOwnedGames makes ONE request, and every failure mode becomes a fixed outcome with nothing (esp. the key) leaked", async () => {
  const leaky = url => new Error(`connect ECONNRESET ${url}`);
  const world = withSteam(() => steamJson(LIBRARY));
  world.steam.throwWith = leaky;
  const result = await fetchOwnedGames({ steamId: STEAM_A, apiKey: STEAM_KEY, fetchImpl: world.fetch });
  assert.deepEqual(result, { kind: "TEMPORARY_ERROR" });
  assert.equal(JSON.stringify(result).includes(STEAM_KEY), false);
  assert.equal(world.steam.requests.length, 1, "no retry");
  assert.deepEqual(await fetchOwnedGames({ steamId: "nope", apiKey: STEAM_KEY, fetchImpl: world.fetch }), { kind: "SERVICE_ERROR" });
  assert.deepEqual(await fetchOwnedGames({ steamId: STEAM_A, apiKey: "bad", fetchImpl: world.fetch }), { kind: "SERVICE_ERROR" });
});

test("a Steam request that never answers is aborted after the timeout and reported as a TEMPORARY error", async () => {
  const hanging = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const result = await fetchOwnedGames({ steamId: STEAM_A, apiKey: STEAM_KEY, fetchImpl: hanging, timeoutMs: 25 });
  assert.deepEqual(result, { kind: "TEMPORARY_ERROR" });
});

test("an oversized declared response is refused before it is read", async () => {
  const big = () => new Response("{}", { status: 200, headers: { "content-length": String(STEAM_GAMES.maxBodyChars + 1) } });
  assert.deepEqual(await fetchOwnedGames({ steamId: STEAM_A, apiKey: STEAM_KEY, fetchImpl: big }), { kind: "MALFORMED" });
});

// ------------------------------------------------------------------------------------------------ handler: the success path and who it acts for

test("the owner's refresh reserves as THEM, reads the SteamID from their stored connection, asks Steam once, and saves the normalized list", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  const response = await run(world, request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "available", game_count: 3 });

  assert.deepEqual(rpcNames(world), ["reserve_steam_games_refresh", "begin_steam_games_fetch", "save_steam_games_result"], "reserve BEFORE any request to Steam, then begin, then save");
  const reserve = world.calls.find(c => c.url.endsWith("/reserve_steam_games_refresh"));
  assert.equal(reserve.headers.Authorization, "Bearer user-a-jwt", "the reservation is made with the caller's OWN token (auth.uid())");
  assert.equal(reserve.headers.apikey, ANON_KEY);
  assert.equal(reserve.body, "{}", "no SteamID or any parameter is sent to the reservation");

  assert.equal(world.steam.requests.length, 1);
  assert.equal(world.steam.requests[0].method, "GET");
  assert.equal(world.steam.requests[0].redirect, "manual", "Steam redirects are never followed");
  const steamUrl = new URL(world.steam.requests[0].url);
  assert.equal(steamUrl.searchParams.get("steamid"), STEAM_A, "the SteamID comes from the stored, authenticated connection");
  assert.equal(steamUrl.searchParams.get("key"), STEAM_KEY);
  const order = world.calls.map(c => (c.url.startsWith(API_HOST) ? "steam" : c.url.split("/rpc/")[1]));
  assert.ok(order.indexOf("reserve_steam_games_refresh") < order.indexOf("steam") && order.indexOf("steam") < order.indexOf("save_steam_games_result"));

  assert.equal(world.saved.outcome, "AVAILABLE");
  assert.deepEqual(world.lists["conn-a"].map(g => g.appid), ["570", "2767030", "730"]);
  assert.equal(world.lists["conn-b"], undefined, "another owner's connection is untouched");
});

test("CLIENT CANNOT SUBSTITUTE A STEAMID: any extra field (steamid, steam_id, provider id, query string, header) is refused or ignored - Steam is never asked about another account", async () => {
  for (const body of [
    { action: "refresh", steamid: STEAM_B }, { action: "refresh", steam_id: STEAM_B }, { action: "refresh", candidate_steam_id: STEAM_B },
    { action: "refresh", provider_account_id: STEAM_B }, { action: "refresh", extra: 1 }, { steamid: STEAM_B }, { action: "REFRESH" }, { action: "load" }, {}, [], null, "refresh",
  ]) {
    const world = withSteam(() => steamJson(LIBRARY));
    const response = await run(world, request(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(world.calls.length, 0, `${JSON.stringify(body)}: nothing reserved, nothing sent to Steam`);
  }
  const world = withSteam(() => steamJson(LIBRARY));
  const response = await run(world, request({ action: "refresh" }, { url: `${SUPABASE}/functions/v1/steam-games-refresh?steamid=${STEAM_B}&steam_id=${STEAM_B}`, headers: { "x-steamid": STEAM_B, "x-forwarded-for": STEAM_B } }));
  assert.equal(response.status, 200);
  assert.equal(new URL(world.steam.requests[0].url).searchParams.get("steamid"), STEAM_A, "query strings and headers are ignored; the stored connection decides");
});

test("CROSS-USER ISOLATION: each owner's refresh uses only their own connection, and their result is saved only under it", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  await run(world, request(undefined, { token: "user-b-jwt" }));
  assert.equal(new URL(world.steam.requests[0].url).searchParams.get("steamid"), STEAM_B);
  assert.equal(world.lists["conn-b"].length, 3);
  assert.equal(world.lists["conn-a"], undefined);
  await run(world, request(undefined, { token: "user-a-jwt" }));
  assert.equal(new URL(world.steam.requests[1].url).searchParams.get("steamid"), STEAM_A);
  assert.equal(world.lists["conn-a"].length, 3);
});

test("UNAUTHENTICATED requests are denied before anything else happens", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  assert.equal((await run(world, request(undefined, { token: null }))).status, 401);
  assert.equal((await run(world, request(undefined, { token: "not-a-user" }))).status, 401, "the database rejects a bad JWT");
  assert.equal((await run(world, request(undefined, { headers: { authorization: "Basic abc" }, token: null }))).status, 401);
  assert.equal(world.steam.requests.length, 0);
  const only = rpcNames(world);
  assert.ok(only.every(name => name === "reserve_steam_games_refresh"), "an unauthorized caller reaches nothing but the reservation, which refuses them");
});

test("the request must come from the GamID site and be a POST", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  assert.equal((await run(world, request(undefined, { headers: { origin: "https://evil.example" } }))).status, 403);
  assert.equal((await run(world, request(undefined, { method: "GET" }))).status, 405);
  const preflight = await run(world, new Request(`${SUPABASE}/functions/v1/steam-games-refresh`, { method: "OPTIONS", headers: { origin: SITE_ORIGIN } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), SITE_ORIGIN);
  assert.equal(world.calls.length, 0);
});

test("an owner with no Steam connection gets not_connected and Steam is never contacted", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  const response = await run(world, request(undefined, { token: "user-c-jwt" }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "not_connected" });
  assert.equal(world.steam.requests.length, 0);
});

test("database refusals map to safe fixed errors", async () => {
  for (const [message, status, expected, error] of [["EMAIL_NOT_VERIFIED", 403, 403, "email_not_verified"], ["IDENTITY_NOT_FOUND", 409, 409, "identity_not_found"], ["AUTH_REQUIRED", 401, 401, "unauthenticated"], ["surprising internal detail", 500, 502, "refresh_failed"]]) {
    const world = withSteam(() => steamJson(LIBRARY), { reserveError: message, reserveStatus: status });
    const response = await run(world, request());
    assert.equal(response.status, expected);
    const text = await response.text();
    assert.equal(text.includes("surprising internal detail"), false);
    assert.match(text, new RegExp(error));
    assert.equal(world.steam.requests.length, 0);
  }
});

// ------------------------------------------------------------------------------------------------ configuration and the secret

test("without a Steam Web API key the function reports not_configured, reserves NOTHING (no throttle consumed), and never contacts Steam", async () => {
  for (const steamApiKey of [undefined, "", "   ", "short", "G".repeat(32), `${STEAM_KEY}&x=1`]) {
    const world = withSteam(() => steamJson(LIBRARY));
    const response = await run(world, request(), { ...ENV, steamApiKey });
    assert.equal(response.status, 503, String(steamApiKey));
    assert.deepEqual(await response.json(), { error: "not_configured" });
    assert.equal(world.calls.length, 0, "no reservation, no Steam request");
    assert.equal(world.attempts.length, 0);
    assert.deepEqual(world.logs, ["games:not_configured"], "only the fixed event code is logged - never the key or its value");
  }
  const world = withSteam(() => steamJson(LIBRARY));
  assert.equal((await run(world, request(), { supabaseUrl: SUPABASE, steamApiKey: STEAM_KEY })).status, 503, "platform variables missing");
  assert.equal(readEnv(name => ({ SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", STEAM_WEB_API_KEY: STEAM_KEY }[name])).steamApiKey, STEAM_KEY);
});

test("the API key is never returned, logged, saved, or included in an error - on success or on every failure path", async () => {
  const scenarios = [
    () => steamJson(LIBRARY), () => steamJson({ response: {} }), () => steamJson({ response: { game_count: 0 } }),
    () => new Response("<html>Unauthorized key=" + STEAM_KEY + "</html>", { status: 403 }), () => new Response("boom " + STEAM_KEY, { status: 503 }),
    () => new Response("not json " + STEAM_KEY, { status: 200 }),
  ];
  for (const respond of scenarios) {
    const world = withSteam(respond);
    const response = await run(world, request());
    const haystack = [await response.text(), JSON.stringify([...response.headers]), world.logs.join(" "), JSON.stringify(world.saved ?? null), JSON.stringify(world.calls.filter(c => !c.url.startsWith(API_HOST)))].join(" ");
    assert.equal(haystack.includes(STEAM_KEY), false);
    assert.equal(haystack.includes("Unauthorized"), false, "nothing Steam says is passed through");
  }
  const throwing = withSteam(() => steamJson(LIBRARY));
  throwing.steam.throwWith = url => new Error(`request to ${url} failed`);
  const response = await run(throwing, request());
  assert.equal((await response.text()).includes(STEAM_KEY), false);
  assert.equal(throwing.logs.join(" ").includes(STEAM_KEY), false);
});

// ------------------------------------------------------------------------------------------------ privacy / availability states

test("PRIVATE library: the answer is 'unavailable', it is saved as UNAVAILABLE, and the last good list is NOT replaced by 'zero games'", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  await run(world, request());
  world.clock += 200_000;
  world.steam.respond = () => steamJson({ response: {} });
  const response = await run(world, request());
  assert.deepEqual(await response.json(), { status: "unavailable" });
  assert.equal(world.saved.outcome, "UNAVAILABLE");
  assert.equal(world.saved.games, null);
  assert.equal(world.lists["conn-a"].length, 3, "the 3 games from the last good refresh are still stored");
  assert.equal(world.states["conn-a"].last_result, "UNAVAILABLE");
  assert.equal(world.states["conn-a"].game_count, 3);
});

test("an accessible EMPTY library is 'empty' and clears the list", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  await run(world, request());
  world.clock += 200_000;
  world.steam.respond = () => steamJson({ response: { game_count: 0 } });
  const response = await run(world, request());
  assert.deepEqual(await response.json(), { status: "empty" });
  assert.equal(world.saved.outcome, "EMPTY");
  assert.deepEqual(world.lists["conn-a"], []);
  assert.equal(world.states["conn-a"].game_count, 0);
});

test("TEMPORARY Steam failures are 'temporary_error' and keep the last good list", async () => {
  for (const respond of [() => new Response("", { status: 503 }), () => new Response("", { status: 429 }), () => new Response("", { status: 500 })]) {
    const world = withSteam(() => steamJson(LIBRARY));
    await run(world, request());
    world.clock += 200_000;
    world.steam.respond = respond;
    assert.deepEqual(await (await run(world, request())).json(), { status: "temporary_error" });
    assert.equal(world.lists["conn-a"].length, 3);
  }
  const world = withSteam(() => steamJson(LIBRARY));
  await run(world, request());
  world.clock += 200_000;
  world.steam.throwWith = () => new Error("network down");
  assert.deepEqual(await (await run(world, request())).json(), { status: "temporary_error" });
  assert.equal(world.lists["conn-a"].length, 3);
});

test("a rejected API key is 'service_error' (our setup, not the user's privacy) and keeps the last good list", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  await run(world, request());
  world.clock += 200_000;
  world.steam.respond = () => new Response("<html><title>Unauthorized</title></html>", { status: 401 });
  assert.deepEqual(await (await run(world, request())).json(), { status: "service_error" });
  assert.equal(world.states["conn-a"].last_result, "SERVICE_ERROR");
  assert.equal(world.lists["conn-a"].length, 3);
});

test("a MALFORMED Steam response is 'malformed' and keeps the last good list", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  await run(world, request());
  world.clock += 200_000;
  for (const respond of [() => new Response("<html>oops</html>", { status: 200 }), () => steamJson({ response: { games: "nope" } }), () => steamJson({ response: { game_count: 9 } })]) {
    world.steam.respond = respond;
    assert.deepEqual(await (await run(world, request())).json(), { status: "malformed" });
    assert.equal(world.lists["conn-a"].length, 3);
    world.clock += 200_000;
  }
});

test("FAILED REFRESH PRESERVES LAST GOOD DATA across a whole sequence of bad outcomes, and a later success replaces it", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  await run(world, request());
  const good = JSON.stringify(world.lists["conn-a"]);
  for (const respond of [() => steamJson({ response: {} }), () => new Response("", { status: 503 }), () => new Response("", { status: 403 }), () => new Response("junk", { status: 200 })]) {
    world.clock += 200_000;
    world.steam.respond = respond;
    await run(world, request());
    assert.equal(JSON.stringify(world.lists["conn-a"]), good);
    assert.equal(world.states["conn-a"].last_success_at, 1_000_000_000_000, "the last SUCCESS time is not advanced by failures");
  }
  world.clock += 200_000;
  world.steam.respond = () => steamJson({ response: { game_count: 1, games: [{ appid: 440, name: "Team Fortress 2" }] } });
  await run(world, request());
  assert.deepEqual(world.lists["conn-a"].map(g => g.appid), ["440"]);
});

// ------------------------------------------------------------------------------------------------ throttling: an explicit action only, never repeated

test("REFRESH THROTTLING: a second request straight away is 429 cooldown and Steam is asked only once; the wait is reported", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  assert.equal((await run(world, request())).status, 200);
  const again = await run(world, request());
  assert.equal(again.status, 429);
  const body = await again.json();
  assert.equal(body.error, "cooldown");
  assert.ok(Number.isInteger(body.retry_after_seconds) && body.retry_after_seconds > 0 && body.retry_after_seconds <= 120);
  assert.equal(again.headers.get("retry-after"), String(body.retry_after_seconds));
  assert.equal(world.steam.requests.length, 1, "the throttled request never reached Steam");
  assert.equal(rpcNames(world).filter(name => name === "begin_steam_games_fetch").length, 1);
});

test("REFRESH THROTTLING: after the cooldown it works again; six per hour and twenty per day are enforced, all before Steam is contacted", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  let ok = 0;
  for (let i = 0; i < 6; i++) { world.clock += 121_000; if ((await run(world, request())).status === 200) ok++; }
  assert.equal(ok, 6);
  world.clock += 121_000;
  const hourly = await run(world, request());
  assert.equal(hourly.status, 429);
  assert.equal((await hourly.json()).error, "rate_limited");
  assert.equal(world.steam.requests.length, 6);

  const daily = withSteam(() => steamJson(LIBRARY));
  let good = 0;
  for (let i = 0; i < 20; i++) { daily.clock += 3_700_000; if ((await run(daily, request())).status === 200) good++; }
  assert.equal(good, 20);
  daily.clock += 3_700_000;
  const capped = await run(daily, request());
  assert.equal(capped.status, 429);
  assert.equal((await capped.json()).error, "rate_limited");
});

test("NO POLLING: the module has no interval, no scheduled refresh, and no retry loop; Steam is contacted once per explicit request", async () => {
  const source = readFileSync(new URL("../supabase/functions/_shared/steam-games.js", import.meta.url), "utf8");
  const code = source.split("\n").filter(line => !line.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /setInterval|cron|schedule|EdgeRuntime\.waitUntil|while\s*\(|for\s*\(\s*let\s+attempt|retry\(/i);
  assert.equal([...code.matchAll(/setTimeout/g)].length, 1, "the only timer is the request timeout guard");
  const world = withSteam(() => steamJson(LIBRARY));
  await run(world, request());
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(world.steam.requests.length, 1, "nothing happens after the response");
});

// ------------------------------------------------------------------------------------------------ consistency between reservation and save

test("a reservation that cannot start, or whose connection changed, is refused without asking Steam or saving", async () => {
  const world = withSteam(() => steamJson(LIBRARY), { saveConnectionChanged: true });
  const response = await run(world, request());
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "connection_changed" });
  assert.equal(world.lists["conn-a"], undefined, "nothing was stored");

  const gone = withSteam(() => steamJson(LIBRARY));
  delete gone.connections["entity-a"];
  const noConn = await run(gone, request());
  assert.equal(noConn.status, 409, "no connection at all -> not_connected");
  assert.equal(gone.steam.requests.length, 0);
});

test("the browser response carries a status word (and a count) only - never games, SteamIDs, ids, or Steam's own text", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  const response = await run(world, request());
  const text = await response.text();
  assert.match(text, /^\{"status":"available","game_count":3\}$/);
  for (const secret of [STEAM_A, STEAM_KEY, "Dota", "Marvel", "2767030", "res-1", "conn-a", "entity-a", "user-a"]) assert.equal(text.includes(secret), false, secret);
});

test("only the three approved database functions are ever called, and the existing Steam connection is never changed by a refresh", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  const before = JSON.stringify(world.connections);
  await run(world, request());
  world.clock += 200_000;
  world.steam.respond = () => steamJson({ response: {} });
  await run(world, request());
  assert.equal(JSON.stringify(world.connections), before);
  assert.ok(new Set(rpcNames(world)).size === 3 && rpcNames(world).every(name => ["reserve_steam_games_refresh", "begin_steam_games_fetch", "save_steam_games_result"].includes(name)),
    "no connect/disconnect/complete/visibility/League/Discord function is touched");
});

test("an unexpected failure returns a fixed error and leaks nothing", async () => {
  const world = withSteam(() => steamJson(LIBRARY));
  const boom = async (url, init) => { if (String(url).includes("begin_steam_games_fetch")) throw new Error(`secret-ish ${STEAM_KEY} ${STEAM_A}`); return world.fetch(url, init); };
  const response = await handleRefresh({ request: request(), env: ENV, fetchImpl: boom, log: world.log });
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.equal(text.includes("secret-ish") || text.includes(STEAM_KEY) || text.includes(STEAM_A), false);
  assert.equal(world.logs.join(" ").includes("secret-ish"), false);
  assert.equal(world.steam.requests.length, 0);
});
