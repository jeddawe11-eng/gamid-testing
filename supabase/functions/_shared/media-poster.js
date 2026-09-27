// Wall media posters (Supabase Edge Function `media-poster`). All behavior lives here and is tested under Node.
//
// A Wall facade (Player / Card / Link) shows the content's REAL thumbnail before anything plays. The browser never talks to the provider for it: it asks this
// function for { provider, kind, id } - the same strictly validated parts a Wall element stores - and gets image bytes back (or a typed "no poster"). So:
//   - privacy: a visitor's browser sends nothing to YouTube / TikTok / Spotify / ... just by looking at a Wall; only this server fetches, with no cookies;
//   - safety: the only addresses ever fetched are BUILT here from validated parts (never taken from the request), and every thumbnail address a provider returns
//     is checked against that provider's own image-host allowlist before it is fetched; redirects are followed by hand, each hop re-checked;
//   - the bytes are recognised by their signature (JPEG / PNG / WebP / GIF / AVIF only - never SVG or HTML), size-capped, and re-labelled with the real type;
//   - no secret is needed: every source is a public, documented endpoint (oEmbed, YouTube's image host, Steam's store appdetails, Twitch's live preview image).
// Sources (null = the provider documents no keyless thumbnail; the facade keeps its own neutral poster):
//   YouTube video      https://i.ytimg.com/vi/<id>/hqdefault.jpg             YouTube playlist   YouTube oEmbed thumbnail_url
//   Vimeo video        Vimeo oEmbed thumbnail_url (a private / embed-restricted video has none)
//   TikTok video       TikTok oEmbed thumbnail_url                             Spotify (all)      Spotify oEmbed thumbnail_url
//   SoundCloud (all)   SoundCloud oEmbed thumbnail_url                          Steam app          store.steampowered.com/api/appdetails header_image
//   Twitch channel     static-cdn.jtvnw.net live preview (only while LIVE: an offline channel redirects to a placeholder, which is treated as "no poster")
//   Twitch video/clip, Kick, Facebook, Instagram, X, Snapchat, Discord: none without an app token or an undocumented API -> neutral poster.
// Steam avatars (Connections): `?steam_avatar=<40 hex>` -> https://avatars.steamstatic.com/<hash>_full.jpg, the only avatar form Steam's GetPlayerSummaries returns.
import { sniffImage } from "./wall-assets.js";

export const POSTER_ORIGINS = Object.freeze(["https://jeddawe11-eng.github.io", "https://gamid-testing-static.gamid.workers.dev"]);
export const POSTER_LIMITS = Object.freeze({ maxImageBytes: 2 * 1024 * 1024, maxJsonChars: 200_000, timeoutMs: 8000, maxRedirects: 2 });
const USER_AGENT = "GamID-Testing-MediaPoster (https://gamid-testing-static.gamid.workers.dev/, 1.0)";

// The same id rules as the Wall's provider adapters (dist/wall-kit/embed/providers/*.js - a test keeps them identical).
export const POSTER_KINDS = Object.freeze({
  youtube: { video: "^[A-Za-z0-9_-]{11}$", playlist: "^[A-Za-z0-9_-]{13,64}$" },
  vimeo: { video: "^[0-9]{6,12}(:[0-9a-f]{6,20})?$" },
  tiktok: { video: "^[0-9]{8,25}$" },
  spotify: { track: "^[A-Za-z0-9]{22}$", episode: "^[A-Za-z0-9]{22}$", album: "^[A-Za-z0-9]{22}$", playlist: "^[A-Za-z0-9]{22}$", show: "^[A-Za-z0-9]{22}$", artist: "^[A-Za-z0-9]{22}$" },
  soundcloud: { track: "^[a-z0-9_-]{2,64}/[a-z0-9_-]{1,120}$", playlist: "^[a-z0-9_-]{2,64}/sets/[a-z0-9_-]{1,120}$", profile: "^[a-z0-9_-]{2,64}$" },
  steam: { app: "^[0-9]{1,10}$" },
  twitch: { channel: "^[A-Za-z0-9_]{3,25}$" },
});

// Image hosts each provider's thumbnails may come from (exact host, or ".suffix" for a CDN family).
export const IMAGE_HOSTS = Object.freeze({
  youtube: ["i.ytimg.com"],
  vimeo: ["i.vimeocdn.com"],
  tiktok: [".tiktokcdn.com", ".tiktokcdn-us.com", ".tiktokcdn-eu.com"],
  spotify: ["i.scdn.co", "mosaic.scdn.co", "image-cdn-ak.spotifycdn.com", "image-cdn-fa.spotifycdn.com", "seed-mix-image.spotifycdn.com", "t.scdn.co"],
  soundcloud: [".sndcdn.com"],
  steam: ["shared.akamai.steamstatic.com", "shared.cloudflare.steamstatic.com", "shared.fastly.steamstatic.com", "shared.steamstatic.com", "cdn.akamai.steamstatic.com", "cdn.cloudflare.steamstatic.com", "steamcdn-a.akamaihd.net"],
  twitch: ["static-cdn.jtvnw.net"],
  "steam-avatar": ["avatars.steamstatic.com", "avatars.akamai.steamstatic.com", "avatars.cloudflare.steamstatic.com", "avatars.fastly.steamstatic.com"],
});
export const STEAM_AVATAR_HASH = /^[0-9a-f]{40}$/;

export function hostAllowed(provider, url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  return (IMAGE_HOSTS[provider] ?? []).some(entry => (entry.startsWith(".") ? host.endsWith(entry) && host.length > entry.length : host === entry));
}

const oembed = (endpoint, pageUrl) => ({ type: "oembed", url: `${endpoint}${endpoint.includes("?") ? "&" : "?"}url=${encodeURIComponent(pageUrl)}` });

// The request -> where the poster comes from. null = not a valid request or no documented source.
export function posterSource(query) {
  const avatar = query.get("steam_avatar");
  if (avatar !== null) return STEAM_AVATAR_HASH.test(avatar) ? { provider: "steam-avatar", type: "image", url: `https://avatars.steamstatic.com/${avatar}_full.jpg` } : null;
  const provider = query.get("p"), kind = query.get("k"), id = query.get("id");
  const pattern = typeof provider === "string" && typeof kind === "string" && Object.hasOwn(POSTER_KINDS, provider) && Object.hasOwn(POSTER_KINDS[provider], kind) ? POSTER_KINDS[provider][kind] : null;
  if (!pattern || typeof id !== "string" || !new RegExp(pattern).test(id)) return null;
  const at = source => ({ provider, ...source });
  switch (provider) {
    case "youtube": return kind === "video" ? at({ type: "image", url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }) : at(oembed("https://www.youtube.com/oembed?format=json", `https://www.youtube.com/playlist?list=${id}`));
    case "vimeo": { const [number, hash] = id.split(":"); return at(oembed("https://vimeo.com/api/oembed.json", `https://vimeo.com/${number}${hash ? `/${hash}` : ""}`)); }
    case "tiktok": return at(oembed("https://www.tiktok.com/oembed", `https://www.tiktok.com/@/video/${id}`));
    case "spotify": return at(oembed("https://open.spotify.com/oembed", `https://open.spotify.com/${kind}/${id}`));
    case "soundcloud": return at(oembed("https://soundcloud.com/oembed?format=json", `https://soundcloud.com/${id}`));
    case "steam": return at({ type: "steam-app", url: `https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`, appId: id });
    case "twitch": return at({ type: "image", url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${id.toLowerCase()}-640x360.jpg` });
    default: return null;
  }
}

// ---- fetching -----------------------------------------------------------------------------------------------------------------------------------------------------
// One GET with a timeout; redirects are followed BY HAND (at most two), and every hop must still be allowed.
async function guardedFetch(fetchImpl, url, allowed) {
  let current = url;
  for (let hop = 0; hop <= POSTER_LIMITS.maxRedirects; hop += 1) {
    if (!allowed(current)) return null;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), POSTER_LIMITS.timeoutMs) : null;
    let response;
    try { response = await fetchImpl(current, { redirect: "manual", headers: { "User-Agent": USER_AGENT, Accept: "*/*" }, signal: controller?.signal }); } catch { return null; } finally { if (timer) clearTimeout(timer); }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      try { current = new URL(location, current).href; } catch { return null; }
      continue;
    }
    return response.ok ? response : null;
  }
  return null;
}

async function readLimited(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const buffer = new Uint8Array(await response.arrayBuffer());
  return buffer.length > maxBytes ? null : buffer;
}

async function readJson(fetchImpl, url, allowed) {
  const response = await guardedFetch(fetchImpl, url, allowed);
  if (!response) return null;
  const bytes = await readLimited(response, POSTER_LIMITS.maxJsonChars);
  if (!bytes) return null;
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

const DATA_HOSTS = Object.freeze({ "www.youtube.com": true, "vimeo.com": true, "www.tiktok.com": true, "open.spotify.com": true, "soundcloud.com": true, "store.steampowered.com": true });
const dataHostAllowed = url => { try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.port && DATA_HOSTS[parsed.hostname] === true; } catch { return false; } };

// The thumbnail address for a source (an image host of THAT provider), or null.
export async function resolveImageUrl(source, fetchImpl) {
  if (source.type === "image") return source.url;
  if (source.type === "oembed") {
    const data = await readJson(fetchImpl, source.url, dataHostAllowed);
    const thumb = typeof data?.thumbnail_url === "string" ? data.thumbnail_url : null;
    return thumb && hostAllowed(source.provider, thumb) ? thumb : null;
  }
  if (source.type === "steam-app") {
    const data = await readJson(fetchImpl, source.url, dataHostAllowed);
    // Steam does not always key the answer by the requested app id (seen live: appids=570 -> key "2120612"), so the entry is matched on data.steam_appid
    const entry = data && typeof data === "object" ? Object.values(data).find(value => value?.success === true && String(value.data?.steam_appid) === source.appId) : null;
    const thumb = typeof entry?.data?.header_image === "string" ? entry.data.header_image : null;
    return thumb && hostAllowed("steam", thumb) ? thumb : null;
  }
  return null;
}

// -> { ok: true, bytes, mime } | { ok: false, code }
export async function fetchPoster(source, fetchImpl) {
  const imageUrl = await resolveImageUrl(source, fetchImpl);
  if (!imageUrl) return { ok: false, code: "no_poster" };
  // Twitch: an offline channel redirects to a generic "offline" placeholder - that is not this channel's picture
  const allowed = url => hostAllowed(source.provider, url) && !(source.provider === "twitch" && new URL(url).pathname.startsWith("/ttv-static/"));
  const response = await guardedFetch(fetchImpl, imageUrl, allowed);
  if (!response) return { ok: false, code: "no_poster" };
  const bytes = await readLimited(response, POSTER_LIMITS.maxImageBytes);
  if (!bytes) return { ok: false, code: "no_poster" };
  const image = sniffImage(bytes);
  if (!image.ok || !(image.width >= 16 && image.height >= 16 && image.width <= 4096 && image.height <= 4096)) return { ok: false, code: "no_poster" };
  return { ok: true, bytes, mime: image.mime };
}

// ---- the request handler ----------------------------------------------------------------------------------------------------------------------------------------------
const corsFor = origin => (POSTER_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" });
const SAFE = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "cross-origin", "Referrer-Policy": "no-referrer" };
const json = (body, status, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...SAFE, ...extra } });

export async function handleMediaPoster({ request, fetchImpl = fetch, log = () => {} }) {
  const origin = request.headers.get("origin");
  const cors = corsFor(origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "600" } });
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { ...cors, "Cache-Control": "no-store" });
  if (origin && !POSTER_ORIGINS.includes(origin)) return json({ error: "origin_not_allowed" }, 403, { "Cache-Control": "no-store" });
  let query;
  try { query = new URL(request.url).searchParams; } catch { return json({ error: "invalid_request" }, 400, { ...cors, "Cache-Control": "no-store" }); }
  const source = posterSource(query);
  if (!source) return json({ error: "invalid_request" }, 400, { ...cors, "Cache-Control": "public, max-age=86400" });
  try {
    const poster = await fetchPoster(source, fetchImpl);
    if (!poster.ok) { log("poster", `none_${source.provider}`); return json({ error: poster.code }, 404, { ...cors, "Cache-Control": "public, max-age=1800" }); }
    // a live Twitch preview changes every few minutes; everything else is stable content art
    const maxAge = source.provider === "twitch" ? 300 : 21600;
    return new Response(poster.bytes, { status: 200, headers: { "Content-Type": poster.mime, "Content-Length": String(poster.bytes.length), "Cache-Control": `public, max-age=${maxAge}`, ...SAFE, ...cors } });
  } catch {
    log("poster", "exception");
    return json({ error: "no_poster" }, 404, { ...cors, "Cache-Control": "public, max-age=300" });
  }
}
