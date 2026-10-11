// Game artwork for the public Classic Profile - PROVISIONAL TESTING evaluation of SteamGridDB (Mazen 2026-10-11). Commercial artwork rights are NOT
// confirmed (SteamGridDB's terms describe personal, non-commercial use): this must not be rolled out beyond the TESTING evaluation without his approval.
//
//   GET /game-artwork/<handle> -> { provider, configured, enabled, artwork: { <game_key>: { icon?, grid?, hero? } }, myGames: { "<name>|<year>": <game_key> } }
//
// What can get artwork is decided by the server for that PUBLIC GamID only (game_artwork_targets): its My Games while My Games is public, League while its
// League profile is public, and the Crews its public 'crews' section lists - the same data a visitor already sees. Matching never guesses:
//   1. a catalog Steam app id -> SteamGridDB's own lookup for that Steam id (exact);
//   2. otherwise SteamGridDB search, accepted only when exactly ONE result has the same normalized title AND (when the catalog knows it) the same release year.
// Anything else is NO_MATCH: the page keeps its initials tile. Only metadata is cached (provider game id + image URLs on the provider CDN, 7 days); no image
// is downloaded, stored or re-served. The provider key is a server secret (STEAMGRIDDB_API_KEY): without it nothing is requested and nothing is cached. The
// settings row is a kill switch (enabled=false hides everything at once). A timeout, a 429 or any provider error stops further lookups for that request and
// caches nothing for the game, so the profile never breaks and a later visit can try again.
import { SITE_ORIGINS, clientKey } from "./public-media.js";

export const PROVIDER = "steamgriddb";
export const API_BASE = "https://www.steamgriddb.com/api/v2";
export const LIMITS = Object.freeze({ lookupsPerRequest: 6, requestTimeoutMs: 4000, perClientPerMinute: 30 });
const HANDLE = /^[a-z0-9_]{3,24}$/;
const CDN_URL = /^https:\/\/cdn2\.steamgriddb\.com\/[A-Za-z0-9/._-]{1,200}$/;
const IMAGE_FILTERS = "types=static&nsfw=false&humor=false&epilepsy=false&limit=1";

export function readGameArtworkEnv(get) {
  return { supabaseUrl: get("SUPABASE_URL"), serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"), providerKey: get("STEAMGRIDDB_API_KEY") || "" };
}
const configured = env => typeof env?.supabaseUrl === "string" && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.supabaseUrl.replace(/\/+$/, "")) && Boolean(env.serviceKey);
const base = env => env.supabaseUrl.replace(/\/+$/, "");
const corsFor = origin => (SITE_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" });
const json = (body, status, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", ...headers } });

export const normalizeTitle = text => String(text ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const gameRowKey = (name, year) => `${name}|${Number.isInteger(year) ? year : ""}`;
export const safeCdnUrl = url => (typeof url === "string" && CDN_URL.test(url) ? url : null);

export function handleFrom(url) {
  const match = /\/game-artwork\/([^/?#]+)\/?$/.exec(new URL(url).pathname);
  if (!match) return null;
  let handle;
  try { handle = decodeURIComponent(match[1]).trim().toLowerCase(); } catch { return null; }
  return HANDLE.test(handle) ? handle : null;
}

async function serviceRpc(fetchImpl, env, name, args) {
  const response = await fetchImpl(`${base(env)}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) throw new Error("RPC_FAILED");
  return body;
}

class ProviderStop extends Error {}   // timeout / 429 / 5xx / network: stop asking for this request, cache nothing for this game

async function providerGet(fetchImpl, env, path) {
  let response;
  try {
    response = await fetchImpl(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${env.providerKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(LIMITS.requestTimeoutMs) });
  } catch { throw new ProviderStop("network"); }
  if (response.status === 404) return null;
  if (response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403) throw new ProviderStop(String(response.status));
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  return body && body.success !== false ? body.data ?? null : null;
}

// a catalog game -> { game_key, status, match_basis, provider_game_id, icon_url, grid_url, hero_url }
export async function resolveGame(fetchImpl, env, game) {
  let id = null, basis = null;
  if (Number.isSafeInteger(game.steam_appid) && game.steam_appid > 0) {
    const found = await providerGet(fetchImpl, env, `/games/steam/${game.steam_appid}`);
    if (Number.isSafeInteger(found?.id)) { id = found.id; basis = "steam_appid"; }
  }
  if (id === null) {
    const wanted = normalizeTitle(game.name);
    const results = wanted ? await providerGet(fetchImpl, env, `/search/autocomplete/${encodeURIComponent(game.name)}`) : null;
    const same = (Array.isArray(results) ? results : []).filter(r => Number.isSafeInteger(r?.id) && normalizeTitle(r.name) === wanted);
    const yearOf = r => (Number.isFinite(r.release_date) ? new Date(r.release_date * 1000).getUTCFullYear() : null);
    const candidates = Number.isInteger(game.year) ? same.filter(r => yearOf(r) === game.year) : same;
    if (candidates.length === 1) { id = candidates[0].id; basis = Number.isInteger(game.year) ? "exact_name_year" : "exact_name"; }
  }
  if (id === null) return { game_key: game.game_key, status: "NO_MATCH" };
  const first = data => safeCdnUrl(Array.isArray(data) ? data[0]?.url : null);
  const icon = first(await providerGet(fetchImpl, env, `/icons/game/${id}?styles=official,custom&${IMAGE_FILTERS}`));
  const grid = first(await providerGet(fetchImpl, env, `/grids/game/${id}?dimensions=460x215,920x430&${IMAGE_FILTERS}`));
  const hero = game.purposes?.includes("crews") ? first(await providerGet(fetchImpl, env, `/heroes/game/${id}?${IMAGE_FILTERS}`)) : null;
  if (!icon && !grid && !hero) return { game_key: game.game_key, status: "NO_MATCH" };
  return { game_key: game.game_key, status: "MATCHED", match_basis: basis, provider_game_id: id, icon_url: icon, grid_url: grid, hero_url: hero };
}

const presentable = row => {
  if (row?.status !== "MATCHED") return null;
  const out = {};
  for (const [field, key] of [["icon_url", "icon"], ["grid_url", "grid"], ["hero_url", "hero"]]) { const url = safeCdnUrl(row[field]); if (url) out[key] = url; }
  return Object.keys(out).length ? out : null;
};

export async function handleGameArtwork({ request, env, fetchImpl = fetch, log = () => {} }) {
  const origin = request.headers.get("origin");
  const cors = corsFor(origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "apikey, content-type, x-client-info, authorization", "Access-Control-Max-Age": "600" } });
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && !SITE_ORIGINS.includes(origin)) return json({ error: "origin_not_allowed" }, 403);
  const empty = extra => json({ provider: PROVIDER, configured: Boolean(env?.providerKey), enabled: false, artwork: {}, myGames: {}, ...extra }, 200, cors);
  if (!configured(env)) return empty({ configured: false });
  const handle = handleFrom(request.url);
  if (!handle) return empty();
  try {
    if ((await serviceRpc(fetchImpl, env, "public_media_hit", { candidate_key: `artwork:${await clientKey(request, env)}`, candidate_limit: LIMITS.perClientPerMinute })) !== true) {
      log("game-artwork", "rate_limited");
      return new Response(null, { status: 429, headers: { ...cors, "Cache-Control": "no-store", "Retry-After": "60" } });
    }
    const targets = await serviceRpc(fetchImpl, env, "game_artwork_targets", { candidate_handle: handle });
    const games = Array.isArray(targets?.games) ? targets.games.filter(g => typeof g?.game_key === "string" && typeof g?.name === "string") : [];
    if (!targets?.enabled) return empty();
    // the visitor's page knows My Games rows by title + year only: map them to this GamID's own library keys - only when unique within that library
    const myGames = {}, seen = new Map();
    for (const g of games.filter(g => g.purposes?.includes("my_games"))) { const k = gameRowKey(g.name, g.year); seen.set(k, (seen.get(k) || 0) + 1); myGames[k] = g.game_key; }
    for (const [k, count] of seen) if (count > 1) delete myGames[k];
    const cached = await serviceRpc(fetchImpl, env, "game_artwork_cache_get", { candidate_keys: games.map(g => g.game_key).slice(0, 64) });
    const byKey = new Map((Array.isArray(cached) ? cached : []).map(row => [row.game_key, row]));
    if (env.providerKey) {
      const fresh = [];
      // connected games and crews first (few, prominent), then My Games
      const order = g => (g.purposes?.includes("connected") ? 0 : g.purposes?.includes("crews") ? 1 : 2);
      const missing = games.filter(g => !byKey.has(g.game_key)).sort((a, b) => order(a) - order(b)).slice(0, LIMITS.lookupsPerRequest);
      for (const game of missing) {
        try { const row = await resolveGame(fetchImpl, env, game); fresh.push(row); byKey.set(game.game_key, row); }
        catch (error) { if (error instanceof ProviderStop) { log("game-artwork", `provider_stop_${error.message}`); break; } throw error; }
      }
      if (fresh.length) await serviceRpc(fetchImpl, env, "game_artwork_cache_put", { candidate_rows: fresh });
    }
    const artwork = {};
    for (const [key, row] of byKey) { const shown = presentable(row); if (shown) artwork[key] = shown; }
    return json({ provider: PROVIDER, configured: Boolean(env.providerKey), enabled: true, artwork, myGames }, 200, cors);
  } catch {
    log("game-artwork", "error");
    return empty({ error: "unavailable" });
  }
}
