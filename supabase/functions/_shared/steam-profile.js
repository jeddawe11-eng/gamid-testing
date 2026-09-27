// Steam public identity (persona name, avatar, profile address) for a CONNECTED Steam account - used by the steam-connect-callback and steam-games-refresh Edge
// Functions. All behavior lives here and is tested under Node.
//
// Official capability: ISteamUser/GetPlayerSummaries v2 (https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/), parameters `key`, `steamids`. It returns the
// account's PUBLIC summary: personaname, avatar / avatarmedium / avatarfull, profileurl (these are public even for a private profile). The key is passed in by the
// caller (it is read only in steam-games.js readEnv, from the Edge Function environment) and never leaves the server: it is not logged, stored, or put in any error.
//
// Rules:
//   - the SteamID64 always comes from an authenticated source (the verified OpenID callback, or the owner's own reserved refresh) - never from a browser;
//   - only the entry whose steamid equals that SteamID64 is used; nothing is invented: no summary -> nothing is stored and the Wall shows a neutral "Steam account";
//   - persona is cleaned (control / invisible characters removed, whitespace collapsed, 1..64 chars); the avatar must be a steamstatic avatar address; the profile
//     address must be Steam's own https://steamcommunity.com/id/<vanity>/ or /profiles/<that SteamID64>/ exactly as Steam returned it. The database re-checks all of it;
//   - best effort: a failure here never changes the connect / refresh outcome the owner sees.

import { readSteamApiKey } from "./steam-games.js";

export const STEAM_PROFILE = Object.freeze({
  endpoint: "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
  timeoutMs: 10000,
  maxBodyChars: 200_000,
  keyPattern: /^[0-9A-Fa-f]{32}$/,
  steamIdPattern: /^[0-9]{17}$/,
  avatarPattern: /^https:\/\/avatars\.(akamai\.|cloudflare\.|fastly\.)?steamstatic\.com\/[0-9a-f]{40}(_full|_medium)?\.jpg$/,
  vanityProfile: /^https:\/\/steamcommunity\.com\/id\/[A-Za-z0-9_-]{2,32}\/?$/,
});

const USER_AGENT = "GamID-Testing-SteamProfile (https://jeddawe11-eng.github.io/gamid-testing/, 1.0)";
const INVISIBLE = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f${["2028", "2029", "200b", "200e", "200f", "202a", "202b", "202c", "202d", "202e", "2066", "2067", "2068", "2069", "feff"]
  .map(hex => String.fromCharCode(parseInt(hex, 16))).join("")}]`, "g");

export function cleanPersona(value) {
  if (typeof value !== "string") return null;
  const cleaned = Array.from(value.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim()).slice(0, 64).join("").trim();
  return cleaned || null;
}
export const safeAvatar = value => (typeof value === "string" && STEAM_PROFILE.avatarPattern.test(value) ? value : null);
export function safeProfileUrl(value, steamId) {
  if (typeof value !== "string") return null;
  if (STEAM_PROFILE.vanityProfile.test(value)) return value;
  return value === `https://steamcommunity.com/profiles/${steamId}/` || value === `https://steamcommunity.com/profiles/${steamId}` ? value : null;
}

export function buildSummaryUrl({ steamId, apiKey }) {
  if (!STEAM_PROFILE.steamIdPattern.test(String(steamId))) throw new Error("INVALID_STEAM_ID");
  if (!STEAM_PROFILE.keyPattern.test(String(apiKey))) throw new Error("INVALID_KEY");
  return `${STEAM_PROFILE.endpoint}?${new URLSearchParams({ key: apiKey, steamids: String(steamId), format: "json" }).toString()}`;
}

// -> { persona, avatarUrl, profileUrl } | null
export function parsePlayerSummary(text, steamId) {
  if (typeof text !== "string" || text.length > STEAM_PROFILE.maxBodyChars) return null;
  let payload;
  try { payload = JSON.parse(text); } catch { return null; }
  const players = payload?.response?.players;
  if (!Array.isArray(players)) return null;
  const player = players.find(entry => entry && typeof entry === "object" && String(entry.steamid) === String(steamId));
  const persona = cleanPersona(player?.personaname);
  if (!persona) return null;
  return { persona, avatarUrl: safeAvatar(player.avatarfull) ?? safeAvatar(player.avatarmedium), profileUrl: safeProfileUrl(player.profileurl, steamId) };
}

export async function fetchPlayerSummary({ steamId, apiKey, fetchImpl = fetch, timeoutMs = STEAM_PROFILE.timeoutMs }) {
  let url;
  try { url = buildSummaryUrl({ steamId, apiKey }); } catch { return null; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json", "User-Agent": USER_AGENT }, redirect: "manual", signal: controller.signal });
    if (!response || response.status !== 200) return null;
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > STEAM_PROFILE.maxBodyChars) return null;
    return parsePlayerSummary(await response.text(), steamId);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The connect callback's hook (supabase/functions/steam-connect-callback/index.ts): the key is read through steam-games.js readSteamApiKey (the one place its
// environment name appears); without a well-formed key nothing is requested.
export function profileRefresherFromEnv(get) {
  const apiKey = readSteamApiKey(get);
  if (typeof apiKey !== "string" || !STEAM_PROFILE.keyPattern.test(apiKey)) return null;
  return ({ steamId, fetchImpl, save }) => refreshSteamProfile({ steamId, apiKey, fetchImpl, save });
}

// Fetch + store. `save(args)` is the caller's service-role RPC to public.save_steam_profile. -> "SAVED" | "NO_SUMMARY" | "NOT_CONNECTED" | "INVALID_DATA" | "SAVE_FAILED"
export async function refreshSteamProfile({ steamId, apiKey, fetchImpl = fetch, save }) {
  try {
    const summary = await fetchPlayerSummary({ steamId, apiKey, fetchImpl });
    if (!summary) return "NO_SUMMARY";
    const saved = await save({ candidate_steam_id: String(steamId), candidate_persona: summary.persona, candidate_avatar_url: summary.avatarUrl, candidate_profile_url: summary.profileUrl });
    return saved?.ok && ["SAVED", "NOT_CONNECTED", "INVALID_DATA"].includes(saved.body) ? saved.body : "SAVE_FAILED";
  } catch {
    return "SAVE_FAILED";
  }
}
