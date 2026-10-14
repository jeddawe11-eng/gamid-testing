// Game artwork for the public Classic Profile - PROVISIONAL TESTING evaluation of SteamGridDB (Mazen 2026-10-11). Commercial artwork rights are NOT
// confirmed (SteamGridDB's terms describe personal, non-commercial use): this must not be rolled out beyond the TESTING evaluation without his approval.
//
//   GET /game-artwork/<handle> -> { provider, configured, enabled, artwork: { <game_key>: { icon?, grid?, hero? } }, myGames: { "<name>|<year>": <game_key> } }
//   GET /game-artwork/owner/self -> authenticated caller's canonical library plus their existing public Classic targets; private, no-store.
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
  return { supabaseUrl: get("SUPABASE_URL"), serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"), anonKey:get('SUPABASE_ANON_KEY'), providerKey: get("STEAMGRIDDB_API_KEY") || "" };
}
const configured = env => typeof env?.supabaseUrl === "string" && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.supabaseUrl.replace(/\/+$/, "")) && Boolean(env.serviceKey);
const base = env => env.supabaseUrl.replace(/\/+$/, "");
const corsFor = origin => (SITE_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" });
const json = (body, status, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", ...headers } });

export const normalizeTitle = text => String(text ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const gameRowKey = (name, year) => `${name}|${Number.isInteger(year) ? year : ""}`;
export const safeCdnUrl = url => (typeof url === "string" && CDN_URL.test(url) ? url : null);

const CREW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// GET /game-artwork/crew/<crew id>: the game of one Crew whose Crew Wall is published (the Crew header)
export function crewFrom(url) {
  const match = /\/game-artwork\/crew\/([^/?#]+)\/?$/.exec(new URL(url).pathname);
  const id = match ? match[1].toLowerCase() : "";
  return CREW_ID.test(id) ? id : null;
}

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

// Owner editor / owner Classic preview: caller-scoped existing RPCs establish the library.
// No caller-supplied handle or game keys can select another person's private games.
async function ownerTargets(fetchImpl,env,bearer){
 const rpc=async(name,args={})=>{const response=await fetchImpl(`${base(env)}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:env.anonKey||env.serviceKey,Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:JSON.stringify(args)});if(!response.ok)throw Error('OWNER_AUTH_REQUIRED');return response.json();};
 const identity=(await rpc('get_my_identity_profile'))?.[0];if(!HANDLE.test(identity?.gamid_handle||''))throw Error('OWNER_AUTH_REQUIRED');
 const settings=await serviceRpc(fetchImpl,env,'game_artwork_targets',{candidate_handle:identity.gamid_handle});if(!settings?.enabled)return {enabled:false,games:[]};
 const [manual,discovered,favorites]=await Promise.all([rpc('get_my_manual_games'),rpc('get_my_discovered_games',{candidate_provider:'steam',candidate_limit:1000,candidate_offset:0}),rpc('get_my_favorite_games')]);
 const valid=key=>typeof key==='string'&&/^[a-z0-9_-]{1,100}$/.test(key);
 const owned=new Set([...(Array.isArray(manual)?manual:[]).map(g=>g.game_key),...(Array.isArray(discovered)?discovered:[]).map(g=>g.recognized_game_key)].filter(valid));
 const publicGames=new Map((Array.isArray(settings.games)?settings.games:[]).filter(g=>valid(g?.game_key)).map(g=>[g.game_key,g]));
 const allowed=new Set([...owned,...publicGames.keys()]);const favs=new Set((Array.isArray(favorites)?favorites:[]).filter(key=>owned.has(key)));
 const keys=[...favs,...[...allowed].filter(key=>!favs.has(key))].slice(0,64);if(!keys.length)return {enabled:true,games:[]};
 const query=new URLSearchParams({select:'game_key,display_name,release_year,game_catalog_provider_ids(provider,external_id)',game_key:`in.(${keys.join(',')})`,is_active:'eq.true'});
 const response=await fetchImpl(`${base(env)}/rest/v1/game_catalog?${query}`,{headers:{apikey:env.serviceKey,Authorization:`Bearer ${env.serviceKey}`}});if(!response.ok)throw Error('CATALOG_UNAVAILABLE');
 const catalog=await response.json();if(!Array.isArray(catalog))throw Error('CATALOG_UNAVAILABLE');
 return {enabled:true,games:catalog.filter(g=>allowed.has(g.game_key)&&typeof g.display_name==='string').map(g=>{const ids=(g.game_catalog_provider_ids||[]).filter(p=>p.provider==='steam'&&/^[0-9]{1,10}$/.test(p.external_id)).map(p=>Number(p.external_id));const purposes=new Set(publicGames.get(g.game_key)?.purposes||[]);if(owned.has(g.game_key))purposes.add('my_games');if(favs.has(g.game_key))purposes.add('favorites');return {game_key:g.game_key,name:g.display_name,year:g.release_year,steam_appid:ids.length?Math.min(...ids):null,purposes:[...purposes]};})};
}

async function providerGet(fetchImpl, env, path) {
  let response;
  try {
    response = await fetchImpl(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${env.providerKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(LIMITS.requestTimeoutMs) });
  } catch { throw new ProviderStop("network"); }
  if (response.status === 404) return null;
  if (response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403) throw new ProviderStop(String(response.status));
  if (!response.ok) return null;
  // a 200 that is not the documented { success, data } shape is a provider fault, not "no artwork": stop and cache nothing
  const body = await response.json().catch(() => undefined);
  if (!body || typeof body !== "object" || body.success !== true || !("data" in body)) throw new ProviderStop("malformed");
  return body.data ?? null;
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
  const icon = first(await providerGet(fetchImpl, env, `/icons/game/${id}?styles=official,custom&mimes=image/png&${IMAGE_FILTERS}`));
  const grid = first(await providerGet(fetchImpl, env, `/grids/game/${id}?dimensions=460x215,920x430&${IMAGE_FILTERS}`));
  const hero = game.purposes?.includes("crews") ? first(await providerGet(fetchImpl, env, `/heroes/game/${id}?${IMAGE_FILTERS}`)) : null;
  const wantsCover = Boolean(game.purposes?.includes("favorites"));
  const cover = wantsCover ? await resolveCover(fetchImpl, env, id) : null;
  if (!icon && !grid && !hero && !cover) return { game_key: game.game_key, status: "NO_MATCH" };
  return { game_key: game.game_key, status: "MATCHED", match_basis: basis, provider_game_id: id, icon_url: icon, grid_url: grid, hero_url: hero, cover_url: cover, cover_checked: wantsCover };
}

// a portrait cover (the provider's 600x900 grid family) for Favorite Games - asked only for favorites
const COVER_DIMENSIONS = "600x900,342x482,660x930";
async function resolveCover(fetchImpl, env, providerGameId) {
  const data = await providerGet(fetchImpl, env, `/grids/game/${providerGameId}?dimensions=${COVER_DIMENSIONS}&${IMAGE_FILTERS}`);
  return safeCdnUrl(Array.isArray(data) ? data[0]?.url : null);
}

const presentable = row => {
  if (row?.status !== "MATCHED") return null;
  const out = {};
  for (const [field, key] of [["icon_url", "icon"], ["grid_url", "grid"], ["hero_url", "hero"], ["cover_url", "cover"]]) { const url = safeCdnUrl(row[field]); if (url) out[key] = url; }
  return Object.keys(out).length ? out : null;
};

export async function handleGameArtwork({ request, env, fetchImpl = fetch, log = () => {} }) {
  const origin = request.headers.get("origin");
  const owner=/\/game-artwork\/owner\/self\/?$/.test(new URL(request.url).pathname);
  const cors = {...corsFor(origin),...(owner?{'Cache-Control':'private, no-store',Vary:'Origin, Authorization'}:{})};
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "apikey, content-type, x-client-info, authorization", "Access-Control-Max-Age": "600" } });
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && !SITE_ORIGINS.includes(origin)) return json({ error: "origin_not_allowed" }, 403);
  const bearer=owner?/^Bearer\s+([A-Za-z0-9._~+/=-]+)$/.exec(request.headers.get('authorization')||'')?.[1]:null;
  if(owner&&!bearer)return json({error:'unauthenticated'},401,cors);
  const empty = extra => json({ provider: PROVIDER, configured: Boolean(env?.providerKey), enabled: false, artwork: {}, myGames: {}, ...extra }, 200, cors);
  if (!configured(env)) return empty({ configured: false });
  const crew = crewFrom(request.url);
  const handle = crew ? null : handleFrom(request.url);
  if (!handle && !crew && !owner) return empty();
  try {
    if ((await serviceRpc(fetchImpl, env, "public_media_hit", { candidate_key: `artwork:${await clientKey(request, env)}`, candidate_limit: LIMITS.perClientPerMinute })) !== true) {
      log("game-artwork", "rate_limited");
      return new Response(null, { status: 429, headers: { ...cors, "Cache-Control": "no-store", "Retry-After": "60" } });
    }
    const targets = owner?await ownerTargets(fetchImpl,env,bearer):crew ? await serviceRpc(fetchImpl, env, "game_artwork_crew_targets", { candidate_crew: crew }) : await serviceRpc(fetchImpl, env, "game_artwork_targets", { candidate_handle: handle });
    const games = Array.isArray(targets?.games) ? targets.games.filter(g => typeof g?.game_key === "string" && typeof g?.name === "string") : [];
    if (!targets?.enabled) return empty();
    // the visitor's page knows My Games rows by title + year only: map them to this GamID's own library keys - only when unique within that library
    const myGames = {}, seen = new Map();
    for (const g of games.filter(g => g.purposes?.includes("my_games"))) { const k = gameRowKey(g.name, g.year); seen.set(k, (seen.get(k) || 0) + 1); myGames[k] = g.game_key; }
    for (const [k, count] of seen) if (count > 1) delete myGames[k];
    const cached = await serviceRpc(fetchImpl, env, "game_artwork_cache_get", { candidate_keys: games.map(g => g.game_key).slice(0, 64) });
    const allowedKeys=new Set(games.map(g=>g.game_key));
    const byKey = new Map((Array.isArray(cached) ? cached : []).filter(row=>allowedKeys.has(row.game_key)).map(row => [row.game_key, row]));
    if (env.providerKey) {
      const fresh = [];
      // favorites, connected games and crews first (few, prominent), then My Games. A cached match that never looked for a cover gets only its cover.
      const order = g => (g.purposes?.includes("favorites") ? 0 : g.purposes?.includes("connected") ? 1 : g.purposes?.includes("crews") ? 2 : 3);
      const needsCover = g => { const row = byKey.get(g.game_key); return g.purposes?.includes("favorites") && row?.status === "MATCHED" && !row.cover_checked && Number.isSafeInteger(Number(row.provider_game_id)); };
      const missing = games.filter(g => !byKey.has(g.game_key) || needsCover(g)).sort((a, b) => order(a) - order(b)).slice(0, LIMITS.lookupsPerRequest);
      for (const game of missing) {
        try {
          const cached = byKey.get(game.game_key);
          const row = cached && needsCover(game) ? { ...cached, cover_url: await resolveCover(fetchImpl, env, Number(cached.provider_game_id)), cover_checked: true } : await resolveGame(fetchImpl, env, game);
          fresh.push(row); byKey.set(game.game_key, row);
        }
        catch (error) { if (error instanceof ProviderStop) { log("game-artwork", `provider_stop_${error.message}`); break; } throw error; }
      }
      if (fresh.length) await serviceRpc(fetchImpl, env, "game_artwork_cache_put", { candidate_rows: fresh });
    }
    const artwork = {};
    for (const [key, row] of byKey) { const shown = presentable(row); if (shown) artwork[key] = shown; }
    return json({ provider: PROVIDER, configured: Boolean(env.providerKey), enabled: true, artwork, myGames }, 200, cors);
  } catch(error) {
    log("game-artwork", "error");
    if(owner&&error?.message==='OWNER_AUTH_REQUIRED')return json({error:'unauthenticated'},401,cors);
    return empty({ error: "unavailable" });
  }
}
