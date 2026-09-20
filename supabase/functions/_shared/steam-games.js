// Steam "My Games" discovery for the GamID TESTING backend (Supabase Edge Function `steam-games-refresh`).
//
// DISCOVERY ONLY. On an explicit owner action, ask Steam's OFFICIAL Web API which games the owner's already-connected Steam account can
// access, and store only a normalized list. It is not proof of any in-game profile, character, UID, rank, or stats.
//
// Official capability: IPlayerService/GetOwnedGames (https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/), parameters `key`,
// `steamid`, `include_appinfo` (name + icon), `include_played_free_games` (free-to-play games the account has played, which are excluded
// by default). A Steam Web API key is REQUIRED by Steam; it lives only in the Edge Function environment (STEAM_WEB_API_KEY) and is never
// sent to the browser, logged, stored, or put in an error message.
//
// Order of operations for every refresh (each step can end the request):
//   1. CORS/origin, method, configuration (Supabase env + a well-formed Steam key), Bearer token, and a body that is exactly {"action":"refresh"}
//      (any other field - e.g. a SteamID - is refused; the browser is never a source of a SteamID).
//   2. Reserve the refresh in the database AS THE CALLER (their own JWT -> auth.uid()): proves ownership, requires a stored Steam
//      connection, enforces the throttle - all BEFORE any outbound request.
//   3. Read the SteamID64 of THAT owner's stored connection through a service_role RPC bound to the reservation.
//   4. ONE request to the official API. No retries, no polling.
//   5. Persist the normalized result through a service_role RPC bound to the reservation (a failed / private / malformed result only records
//      that the last attempt failed; the last good list is kept).
// The browser only ever receives a short status word; the stored list is read back through owner-only RPCs.

export const SITE_ORIGIN = "https://jeddawe11-eng.github.io";

export const STEAM_GAMES = Object.freeze({
  endpoint: "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/",
  timeoutMs: 15000,
  maxBodyChars: 16_000_000,
  maxGames: 10000,
  maxNameLength: 200,
  keyPattern: /^[0-9A-Fa-f]{32}$/,
  steamIdPattern: /^[0-9]{17}$/,
  iconPattern: /^[0-9a-f]{40}$/,
  maxAppId: 4294967295,
});

// Recognition only: "this account's accessible game data includes it". Never a Marvel account / UID / rank / stats verification.
export const MARVEL_RIVALS_APP_ID = "2767030";

const USER_AGENT = "GamID-Testing-SteamGames (https://jeddawe11-eng.github.io/gamid-testing/, 1.0)";

export function readEnv(get) {
  return {
    supabaseUrl: get("SUPABASE_URL"),
    anonKey: get("SUPABASE_ANON_KEY"),
    serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
    steamApiKey: get("STEAM_WEB_API_KEY"),
  };
}

const platformConfigured = env => Boolean(env?.supabaseUrl && env.anonKey && env.serviceKey);
// A key that is missing OR not shaped like a Steam key is treated as "not configured": it is never sent anywhere.
const steamKeyUsable = env => typeof env?.steamApiKey === "string" && STEAM_GAMES.keyPattern.test(env.steamApiKey);

// ---------------------------------------------------------------------------------------------------------------
// Request + response handling for the official API
// ---------------------------------------------------------------------------------------------------------------
export function buildOwnedGamesUrl({ steamId, apiKey }) {
  if (!STEAM_GAMES.steamIdPattern.test(String(steamId))) throw new Error("INVALID_STEAM_ID");
  if (!STEAM_GAMES.keyPattern.test(String(apiKey))) throw new Error("INVALID_KEY");
  const params = new URLSearchParams({
    key: apiKey,
    steamid: String(steamId),
    include_appinfo: "true",
    // Free-to-play games are excluded by default; this includes the free games the account has played (e.g. Marvel Rivals).
    include_played_free_games: "true",
    format: "json",
  });
  return `${STEAM_GAMES.endpoint}?${params.toString()}`;
}

// Control characters and invisible / bidirectional-override characters are removed from names shown in the UI.
const INVISIBLE = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f${["2028", "2029", "200b", "200e", "200f", "202a", "202b", "202c", "202d", "202e", "2066", "2067", "2068", "2069", "feff"]
  .map(hex => String.fromCharCode(parseInt(hex, 16))).join("")}]`, "g");

export function cleanGameName(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim().slice(0, STEAM_GAMES.maxNameLength).trim();
  return cleaned || null;
}

const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

// Turns the raw HTTP result into one of:
//   AVAILABLE {games}   - Steam returned the account's games
//   EMPTY               - the library is accessible and genuinely has no games
//   UNAVAILABLE         - Steam did not share the list (private / hidden game details): NOT "zero games"
//   TEMPORARY_ERROR     - Steam is rate-limiting / down / unreachable: try again later
//   SERVICE_ERROR       - Steam rejected our request (e.g. the API key): a GamID-side setup problem
//   MALFORMED           - Steam answered, but not in the documented shape
export function classifyOwnedGames({ status, text }) {
  if (status === 429 || status === 408 || status >= 500) return { kind: "TEMPORARY_ERROR" };
  if (status === 401 || status === 403) return { kind: "SERVICE_ERROR" };
  if (status !== 200) return { kind: status >= 400 && status < 500 ? "SERVICE_ERROR" : "MALFORMED" };
  if (typeof text !== "string" || text.length > STEAM_GAMES.maxBodyChars) return { kind: "MALFORMED" };

  let payload;
  try { payload = JSON.parse(text); } catch { return { kind: "MALFORMED" }; }
  if (!isPlainObject(payload) || !isPlainObject(payload.response)) return { kind: "MALFORMED" };
  const body = payload.response;

  const hasCount = Object.prototype.hasOwnProperty.call(body, "game_count");
  if (hasCount && !(Number.isInteger(body.game_count) && body.game_count >= 0)) return { kind: "MALFORMED" };

  if (Object.prototype.hasOwnProperty.call(body, "games")) {
    if (!Array.isArray(body.games)) return { kind: "MALFORMED" };
    if (body.games.length > STEAM_GAMES.maxGames) return { kind: "MALFORMED" };
    if (body.games.length === 0) return hasCount && body.game_count > 0 ? { kind: "MALFORMED" } : { kind: "EMPTY" };

    // One entry per app id even if Steam repeats it: keep the entry with the most playtime (then one that has a name).
    const byApp = new Map();
    for (const entry of body.games) {
      if (!isPlainObject(entry)) continue;
      const appId = entry.appid;
      if (!Number.isSafeInteger(appId) || appId < 1 || appId > STEAM_GAMES.maxAppId) continue;
      const game = {
        appid: String(appId),
        name: cleanGameName(entry.name),
        icon: typeof entry.img_icon_url === "string" && STEAM_GAMES.iconPattern.test(entry.img_icon_url) ? entry.img_icon_url : null,
        playtime: Number.isSafeInteger(entry.playtime_forever) && entry.playtime_forever >= 0 && entry.playtime_forever <= 2147483647 ? entry.playtime_forever : null,
      };
      const existing = byApp.get(game.appid);
      if (!existing) { byApp.set(game.appid, game); continue; }
      const better = (game.playtime ?? -1) > (existing.playtime ?? -1) || ((game.playtime ?? -1) === (existing.playtime ?? -1) && !existing.name && game.name);
      if (better) byApp.set(game.appid, game);
    }
    if (byApp.size === 0) return { kind: "MALFORMED" };
    return { kind: "AVAILABLE", games: [...byApp.values()] };
  }

  // No `games` at all: a count of 0 is an accessible, genuinely empty library; a positive count without a list is broken; and no
  // count either (Steam's empty `response` object) means the list was not shared - it says NOTHING about how many games exist.
  if (hasCount) return body.game_count === 0 ? { kind: "EMPTY" } : { kind: "MALFORMED" };
  return { kind: "UNAVAILABLE" };
}

// One request, no retries. Every failure mode becomes a fixed outcome; nothing from the request URL (which carries the key) is kept.
export async function fetchOwnedGames({ steamId, apiKey, fetchImpl = fetch, timeoutMs = STEAM_GAMES.timeoutMs }) {
  let url;
  try { url = buildOwnedGamesUrl({ steamId, apiKey }); } catch { return { kind: "SERVICE_ERROR" }; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json", "User-Agent": USER_AGENT }, redirect: "manual", signal: controller.signal });
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > STEAM_GAMES.maxBodyChars) return { kind: "MALFORMED" };
    const text = await response.text();
    return classifyOwnedGames({ status: response.status, text });
  } catch {
    return { kind: "TEMPORARY_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------------------------------------------
function json(body, status, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
}

const corsFor = origin => (origin === SITE_ORIGIN ? { "Access-Control-Allow-Origin": SITE_ORIGIN, Vary: "Origin" } : { Vary: "Origin" });

async function rpc(fetchImpl, env, name, args, { bearer, apikey }) {
  const response = await fetchImpl(`${String(env.supabaseUrl).replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { ok: response.ok, status: response.status, body };
}

const serviceRpc = (fetchImpl, env, name, args) => rpc(fetchImpl, env, name, args, { bearer: env.serviceKey, apikey: env.serviceKey });

const OUTCOME_STATUS = {
  AVAILABLE: "available",
  EMPTY: "empty",
  UNAVAILABLE: "unavailable",
  TEMPORARY_ERROR: "temporary_error",
  SERVICE_ERROR: "service_error",
  MALFORMED: "malformed",
};

export async function handleRefresh({ request, env, fetchImpl = fetch, log = () => {} }) {
  const origin = request.headers.get("origin");
  const cors = corsFor(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Max-Age": "600" },
    });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && origin !== SITE_ORIGIN) return json({ error: "origin_not_allowed" }, 403);
  if (!platformConfigured(env)) return json({ error: "not_configured" }, 503, cors);

  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/.exec(request.headers.get("authorization") || "");
  if (!match) return json({ error: "unauthenticated" }, 401, cors);

  // The request is exactly {"action":"refresh"}. A SteamID (or anything else) in the body is refused, never used.
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  if (!isPlainObject(body) || body.action !== "refresh" || Object.keys(body).length !== 1) return json({ error: "invalid_request" }, 400, cors);

  // Checked before anything is reserved, so a missing key never consumes the owner's throttle.
  if (!steamKeyUsable(env)) { log("games", "not_configured"); return json({ error: "not_configured" }, 503, cors); }

  try {
    // Step 2 - the database, acting as the signed-in caller, authorizes, resolves their Steam connection, and throttles.
    const reserved = await rpc(fetchImpl, env, "reserve_steam_games_refresh", {}, { bearer: match[1], apikey: env.anonKey });
    if (!reserved.ok) {
      const message = String(reserved.body?.message || "");
      if (reserved.status === 401 || message === "AUTH_REQUIRED") return json({ error: "unauthenticated" }, 401, cors);
      if (message === "EMAIL_NOT_VERIFIED") return json({ error: "email_not_verified" }, 403, cors);
      if (message === "IDENTITY_NOT_FOUND") return json({ error: "identity_not_found" }, 409, cors);
      log("games", "reserve_failed");
      return json({ error: "refresh_failed" }, 502, cors);
    }
    const slot = Array.isArray(reserved.body) ? reserved.body[0] : null;
    if (!slot) return json({ error: "refresh_failed" }, 502, cors);
    if (slot.status === "NOT_CONNECTED") return json({ error: "not_connected" }, 409, cors);
    if (slot.status === "COOLDOWN" || slot.status === "RATE_LIMITED") {
      const retry = Number.isInteger(slot.retry_after_seconds) && slot.retry_after_seconds > 0 ? slot.retry_after_seconds : 120;
      log("games", slot.status.toLowerCase());
      return json({ error: slot.status === "COOLDOWN" ? "cooldown" : "rate_limited", retry_after_seconds: retry }, 429, { ...cors, "Retry-After": String(retry) });
    }
    if (slot.status !== "OK" || !slot.reservation_id) return json({ error: "refresh_failed" }, 502, cors);
    const reservationId = slot.reservation_id;

    // Step 3 - the SteamID64 comes ONLY from the reserving owner's stored, authenticated connection.
    const begun = await serviceRpc(fetchImpl, env, "begin_steam_games_fetch", { candidate_reservation_id: reservationId });
    const start = begun.ok && Array.isArray(begun.body) ? begun.body[0] : null;
    if (!start || start.status !== "OK" || !STEAM_GAMES.steamIdPattern.test(String(start.steam_id))) {
      const why = start?.status || "BEGIN_FAILED";
      log("games", `begin_${why}`);
      return why === "CONNECTION_CHANGED" ? json({ error: "connection_changed" }, 409, cors) : json({ error: "refresh_failed" }, 502, cors);
    }

    // Step 4 - exactly one request to the official API.
    const result = await fetchOwnedGames({ steamId: start.steam_id, apiKey: env.steamApiKey, fetchImpl });
    log("games", `fetch_${result.kind}`);

    // Step 5 - persist the outcome. Only AVAILABLE / EMPTY can change the stored list.
    const saved = await serviceRpc(fetchImpl, env, "save_steam_games_result", {
      candidate_reservation_id: reservationId,
      candidate_outcome: result.kind,
      candidate_games: result.kind === "AVAILABLE" ? result.games : null,
    });
    const outcome = saved.ok && typeof saved.body === "string" ? saved.body : "SAVE_FAILED";
    log("games", `save_${outcome}`);
    if (outcome === "SAVED") return json({ status: OUTCOME_STATUS[result.kind], ...(result.kind === "AVAILABLE" ? { game_count: result.games.length } : {}) }, 200, cors);
    if (outcome === "INVALID_DATA") return json({ status: "malformed" }, 200, cors);
    if (outcome === "CONNECTION_CHANGED") return json({ error: "connection_changed" }, 409, cors);
    return json({ error: "save_failed" }, 502, cors);
  } catch (error) {
    log("games", `unexpected_${error?.name || "error"}`);
    return json({ error: "refresh_failed" }, 502, cors);
  }
}
