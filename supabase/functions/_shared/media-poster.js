// Wall media posters and previews (Supabase Edge Function `media-poster`). All behavior lives here and is tested under Node.
//
// A Wall facade (Player / Card / Link) shows the content's REAL thumbnail - and, for some content, its real name - before anything plays or opens. The browser never
// talks to the provider for it: it asks this function for { provider, kind, id } - the same strictly validated parts a Wall element stores - and gets image bytes back
// (or, with want=meta, a small JSON { title, subtitle }), or a typed "nothing". So:
//   - privacy: a visitor's browser sends nothing to the provider just by looking at a Wall; only this server fetches, with no cookies;
//   - safety (no SSRF): every address fetched is BUILT here from validated parts (never taken from the request) and must be on that source's own host list; every
//     image address a provider returns is checked against that provider's image-host allowlist; redirects are followed by hand, each hop re-checked;
//   - the image bytes are recognised by their signature (JPEG / PNG / WebP / GIF / AVIF only - never SVG or HTML), size-capped and re-labelled with the real type;
//     page / JSON bodies are size-capped too; titles are plain text (entities decoded, control characters removed, length-capped);
//   - no secret is needed: every source is public and keyless.
// One pipeline for every provider:  { provider, kind, id } -> SOURCE (built here) -> { imageUrl, title, subtitle } -> image bytes / meta JSON.
// Source kinds:
//   image       a documented image address                      YouTube video (i.ytimg.com), Twitch LIVE channel preview (an offline channel redirects to a
//                                                                placeholder, which is refused)
//   oembed      the provider's official oEmbed thumbnail_url    YouTube playlist, Vimeo, TikTok, Spotify, SoundCloud
//   steam-app   Steam store appdetails                          header image + game name + short description
//   steam-xml   Steam Community's public profile / group XML    persona / group name, avatar, member count
//   discord     Discord's public Get Invite API                 server name, member counts, server icon
//   page        the content's own PUBLIC page, read for its link-preview metadata (Open Graph: og:image / og:title - the same data every chat app uses
//               to unfurl a shared link): Twitch VOD / clip, Kick channel / VOD, Snapchat Spotlight, Instagram post / Reel, X post.
// Content with no public preview source keeps the neutral facade (Facebook: its pages need a login; Twitch videos still being processed only publish a
// placeholder, which is refused). Steam avatars for Connections: `?steam_avatar=<40 hex>`.
import { sniffImage } from "./wall-assets.js";

export const POSTER_ORIGINS = Object.freeze(["https://jeddawe11-eng.github.io", "https://gamid-testing-static.gamid.workers.dev"]);
export const POSTER_LIMITS = Object.freeze({ maxImageBytes: 2 * 1024 * 1024, maxJsonChars: 200_000, maxPageBytes: 2_500_000, timeoutMs: 8000, pageTimeoutMs: 15000, maxRedirects: 2, maxTitle: 120, maxSubtitle: 120 });
const USER_AGENT = "GamID-Testing-MediaPoster (https://gamid-testing-static.gamid.workers.dev/, 1.0)";

// The same id rules as the Wall's provider adapters (dist/wall-kit/embed/providers/*.js - a test keeps them identical).
const SPOTIFY_ID = "^[A-Za-z0-9]{22}$";
export const POSTER_KINDS = Object.freeze({
  youtube: { video: "^[A-Za-z0-9_-]{11}$", playlist: "^[A-Za-z0-9_-]{13,64}$" },
  vimeo: { video: "^[0-9]{6,12}(:[0-9a-f]{6,20})?$" },
  tiktok: { video: "^[0-9]{8,25}$" },
  spotify: { track: SPOTIFY_ID, episode: SPOTIFY_ID, album: SPOTIFY_ID, playlist: SPOTIFY_ID, show: SPOTIFY_ID, artist: SPOTIFY_ID },
  soundcloud: { track: "^[a-z0-9_-]{2,64}/[a-z0-9_-]{1,120}$", playlist: "^[a-z0-9_-]{2,64}/sets/[a-z0-9_-]{1,120}$", profile: "^[a-z0-9_-]{2,64}$" },
  steam: { app: "^[0-9]{1,10}$", profile: "^(7656119[0-9]{10}|[A-Za-z0-9_-]{2,32})$", group: "^[A-Za-z0-9_-]{2,64}$" },
  twitch: { channel: "^[A-Za-z0-9_]{3,25}$", video: "^[0-9]{5,15}$", clip: "^[A-Za-z0-9_-]{5,100}$" },
  kick: { channel: "^[A-Za-z0-9_-]{3,25}$", video: "^[A-Za-z0-9_-]{3,25}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" },
  snapchat: { spotlight: "^[A-Za-z0-9_-]{20,160}$" },
  instagram: { post: "^[A-Za-z0-9_-]{5,30}$", reel: "^[A-Za-z0-9_-]{5,30}$" },
  x: { post: "^[0-9]{1,25}$" },
  discord: { invite: "^[A-Za-z0-9-]{2,32}$" },
});

// Image hosts each provider's pictures may come from (exact host, or ".suffix" for a CDN family), and image paths that are a provider's generic placeholder.
export const IMAGE_HOSTS = Object.freeze({
  youtube: ["i.ytimg.com"],
  vimeo: ["i.vimeocdn.com"],
  tiktok: [".tiktokcdn.com", ".tiktokcdn-us.com", ".tiktokcdn-eu.com"],
  spotify: ["i.scdn.co", "mosaic.scdn.co", "image-cdn-ak.spotifycdn.com", "image-cdn-fa.spotifycdn.com", "seed-mix-image.spotifycdn.com", "t.scdn.co"],
  soundcloud: [".sndcdn.com"],
  steam: ["shared.akamai.steamstatic.com", "shared.cloudflare.steamstatic.com", "shared.fastly.steamstatic.com", "shared.steamstatic.com", "cdn.akamai.steamstatic.com", "cdn.cloudflare.steamstatic.com", "steamcdn-a.akamaihd.net",
    "avatars.steamstatic.com", "avatars.akamai.steamstatic.com", "avatars.cloudflare.steamstatic.com", "avatars.fastly.steamstatic.com"],
  twitch: ["static-cdn.jtvnw.net"],
  kick: ["files.kick.com", "web.kick.com"],
  snapchat: ["story.snapchat.com", ".sc-cdn.net"],
  instagram: [".cdninstagram.com", ".fbcdn.net", "lookaside.instagram.com"],
  x: ["pbs.twimg.com"],
  discord: ["cdn.discordapp.com"],
  "steam-avatar": ["avatars.steamstatic.com", "avatars.akamai.steamstatic.com", "avatars.cloudflare.steamstatic.com", "avatars.fastly.steamstatic.com"],
});
// generic placeholders are not the content's picture: Twitch's logo / "offline" / "processing" images, Kick's non-video API paths, Steam's generic share image
const IMAGE_PATH_DENY = Object.freeze({ twitch: /^\/(ttv-static|ttv-static-metadata)\//, kick: /^\/api\/(?!v1\/videos\/[0-9a-f-]{36}\/thumbnails\/)/ });
export const STEAM_AVATAR_HASH = /^[0-9a-f]{40}$/;

export function hostAllowed(provider, url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  if (!(IMAGE_HOSTS[provider] ?? []).some(entry => (entry.startsWith(".") ? host.endsWith(entry) && host.length > entry.length : host === entry))) return false;
  return !(IMAGE_PATH_DENY[provider]?.test(parsed.pathname));
}

const oembed = (endpoint, pageUrl) => ({ type: "oembed", url: `${endpoint}${endpoint.includes("?") ? "&" : "?"}url=${encodeURIComponent(pageUrl)}`, hosts: [new URL(endpoint).hostname] });
const page = url => ({ type: "page", url, hosts: [new URL(url).hostname] });

// The request -> where the poster / preview comes from. null = not a valid request or no source.
export function posterSource(query) {
  const avatar = query.get("steam_avatar");
  if (avatar !== null) return STEAM_AVATAR_HASH.test(avatar) ? { provider: "steam-avatar", type: "image", url: `https://avatars.steamstatic.com/${avatar}_full.jpg` } : null;
  const provider = query.get("p"), kind = query.get("k"), id = query.get("id");
  const pattern = typeof provider === "string" && typeof kind === "string" && Object.hasOwn(POSTER_KINDS, provider) && Object.hasOwn(POSTER_KINDS[provider], kind) ? POSTER_KINDS[provider][kind] : null;
  if (!pattern || typeof id !== "string" || !new RegExp(pattern).test(id)) return null;
  const at = source => ({ provider, kind, ...source });
  switch (provider) {
    case "youtube": return kind === "video" ? at({ type: "image", url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }) : at(oembed("https://www.youtube.com/oembed?format=json", `https://www.youtube.com/playlist?list=${id}`));
    case "vimeo": { const [number, hash] = id.split(":"); return at(oembed("https://vimeo.com/api/oembed.json", `https://vimeo.com/${number}${hash ? `/${hash}` : ""}`)); }
    case "tiktok": return at(oembed("https://www.tiktok.com/oembed", `https://www.tiktok.com/@/video/${id}`));
    case "spotify": return at(oembed("https://open.spotify.com/oembed", `https://open.spotify.com/${kind}/${id}`));
    case "soundcloud": return at(oembed("https://soundcloud.com/oembed?format=json", `https://soundcloud.com/${id}`));
    case "steam":
      if (kind === "app") return at({ type: "steam-app", url: `https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`, hosts: ["store.steampowered.com"], appId: id });
      return at({ type: "steam-xml", url: kind === "group" ? `https://steamcommunity.com/groups/${id}/memberslistxml/?xml=1` : `https://steamcommunity.com/${/^7656119[0-9]{10}$/.test(id) ? "profiles" : "id"}/${id}/?xml=1`, hosts: ["steamcommunity.com"] });
    case "twitch":
      if (kind === "channel") return at({ type: "image", url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${id.toLowerCase()}-640x360.jpg` });
      return at(page(kind === "video" ? `https://www.twitch.tv/videos/${id}` : `https://clips.twitch.tv/${id}`));
    case "kick": { const [channel, video] = id.split("/"); return at(page(kind === "video" ? `https://kick.com/${channel}/videos/${video}` : `https://kick.com/${channel}`)); }
    case "snapchat": return at(page(`https://www.snapchat.com/spotlight/${id}`));
    case "instagram": return at(page(`https://www.instagram.com/${kind === "reel" ? "reel" : "p"}/${id}/`));
    case "x": return at(page(`https://x.com/i/status/${id}`));
    case "discord": return at({ type: "discord", url: `https://discord.com/api/v10/invites/${id}?with_counts=true`, hosts: ["discord.com"] });
    default: return null;
  }
}

// ---- fetching -----------------------------------------------------------------------------------------------------------------------------------------------------
// One GET with a timeout; redirects are followed BY HAND (at most two), and every hop must still be allowed.
async function guardedFetch(fetchImpl, url, allowed, timeoutMs = POSTER_LIMITS.timeoutMs) {
  let current = url;
  for (let hop = 0; hop <= POSTER_LIMITS.maxRedirects; hop += 1) {
    if (!allowed(current)) return null;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
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

const hostsCheck = hosts => url => { try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.port && !parsed.username && hosts.includes(parsed.hostname); } catch { return false; } };
async function readText(fetchImpl, source, maxBytes, timeoutMs) {
  const response = await guardedFetch(fetchImpl, source.url, hostsCheck(source.hosts), timeoutMs);
  if (!response) return null;
  const bytes = await readLimited(response, maxBytes);
  return bytes ? new TextDecoder().decode(bytes) : null;
}
const readJson = async (fetchImpl, source) => { const text = await readText(fetchImpl, source, POSTER_LIMITS.maxJsonChars); if (text === null) return null; try { return JSON.parse(text); } catch { return null; } };

// ---- plain-text cleaning and link-preview (Open Graph) parsing -------------------------------------------------------------------------------------------------------
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
export function decodeEntities(value) {
  return String(value).replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi, (whole, name) => {
    if (name[0] === "#") { const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10); return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}
const INVISIBLE = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f${["200b", "200c", "200d", "200e", "200f", "2028", "2029", "202a", "202b", "202c", "202d", "202e", "2066", "2067", "2068", "2069", "feff"].map(hex => String.fromCharCode(parseInt(hex, 16))).join("")}]`, "g");
export function cleanText(value, max) {
  if (typeof value !== "string") return null;
  const text = Array.from(decodeEntities(value).replace(INVISIBLE, " ").replace(/\s+/g, " ").trim());
  if (!text.length) return null;
  return text.length > max ? `${text.slice(0, max - 1).join("").trim()}…` : text.join("");
}
// <meta property|name="og:image" content="..."> in either attribute order -> { "og:image": "...", ... } (the first value of each key wins)
export function parseMetaTags(html) {
  const out = {};
  for (const [tag] of String(html).matchAll(/<meta\s[^>]{0,2000}>/gi)) {
    const key = /\s(?:property|name)\s*=\s*"([^"]{1,60})"/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\scontent\s*=\s*"([^"]{0,4000})"/i.exec(tag)?.[1];
    if (key && content !== undefined && !Object.hasOwn(out, key)) out[key] = decodeEntities(content);
  }
  return out;
}

const count = value => (Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("en-US") : null);

// A source -> { imageUrl, title, subtitle } (each may be null; an image address is only kept when it is on the provider's own image hosts).
export async function resolvePreview(source, fetchImpl) {
  const img = url => (typeof url === "string" && hostAllowed(source.provider, url) ? url : null);
  const empty = { imageUrl: null, title: null, subtitle: null };
  if (source.type === "image") return { ...empty, imageUrl: source.url };
  if (source.type === "oembed") {
    const data = await readJson(fetchImpl, source);
    return { imageUrl: img(data?.thumbnail_url), title: cleanText(data?.title, POSTER_LIMITS.maxTitle), subtitle: cleanText(data?.author_name, POSTER_LIMITS.maxSubtitle) };
  }
  if (source.type === "steam-app") {
    const data = await readJson(fetchImpl, source);
    // Steam does not always key the answer by the requested app id (seen live: appids=570 -> key "2120612"), so the entry is matched on data.steam_appid
    const entry = data && typeof data === "object" ? Object.values(data).find(value => value?.success === true && String(value.data?.steam_appid) === source.appId) : null;
    return entry ? { imageUrl: img(entry.data.header_image), title: cleanText(entry.data.name, POSTER_LIMITS.maxTitle), subtitle: cleanText(entry.data.is_free ? "Free to play" : entry.data.short_description, POSTER_LIMITS.maxSubtitle) } : empty;
  }
  if (source.type === "steam-xml") {
    const text = await readText(fetchImpl, source, POSTER_LIMITS.maxJsonChars);
    if (!text || /<error>/i.test(text)) return empty;
    // one XML element's text (CDATA or plain); names are fixed literals here, never input
    const pick = name => { const match = new RegExp(`<${name}>(?:<!\\[CDATA\\[([\\s\\S]{0,400}?)\\]\\]>|([^<]{0,400}))</${name}>`).exec(text); return match ? (match[1] ?? match[2] ?? null) : null; };
    const members = Number(pick("memberCount"));
    return {
      imageUrl: img(pick("avatarFull")), title: cleanText(source.kind === "group" ? pick("groupName") : pick("steamID"), POSTER_LIMITS.maxTitle),
      subtitle: source.kind === "group" && Number.isSafeInteger(members) ? `${count(members)} members` : null,
    };
  }
  if (source.type === "discord") {
    const data = await readJson(fetchImpl, source);
    const guild = data?.guild;
    if (!guild || !/^[0-9]{5,25}$/.test(String(guild.id ?? ""))) return empty;
    const icon = typeof guild.icon === "string" && /^(a_)?[0-9a-f]{32}$/.test(guild.icon) ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256` : null;
    const members = count(data.approximate_member_count), online = count(data.approximate_presence_count);
    return { imageUrl: img(icon), title: cleanText(guild.name, POSTER_LIMITS.maxTitle), subtitle: members ? `${members} members${online ? ` · ${online} online` : ""}` : null };
  }
  if (source.type === "page") {
    const html = await readText(fetchImpl, source, POSTER_LIMITS.maxPageBytes, POSTER_LIMITS.pageTimeoutMs);
    if (!html) return empty;
    const meta = parseMetaTags(html);
    return { imageUrl: img(meta["og:image"]) ?? img(meta["twitter:image"]), title: cleanText(meta["og:title"] ?? meta["twitter:title"], POSTER_LIMITS.maxTitle), subtitle: null };
  }
  return empty;
}

// Kept for callers that only need the picture address.
export const resolveImageUrl = async (source, fetchImpl) => (await resolvePreview(source, fetchImpl)).imageUrl;

// -> { ok: true, bytes, mime } | { ok: false, code }
export async function fetchPoster(source, fetchImpl) {
  const imageUrl = (await resolvePreview(source, fetchImpl)).imageUrl;
  if (!imageUrl) return { ok: false, code: "no_poster" };
  const response = await guardedFetch(fetchImpl, imageUrl, url => hostAllowed(source.provider, url));
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
  // a live Twitch preview changes every few minutes; everything else is stable content art
  const maxAge = source.provider === "twitch" && source.kind === "channel" ? 300 : 21600;
  try {
    if (query.get("want") === "meta") {
      if (source.provider === "steam-avatar") return json({ error: "invalid_request" }, 400, { ...cors, "Cache-Control": "public, max-age=86400" });
      const preview = await resolvePreview(source, fetchImpl);
      if (!preview.title && !preview.subtitle) { log("meta", `none_${source.provider}`); return json({ error: "no_meta" }, 404, { ...cors, "Cache-Control": "public, max-age=1800" }); }
      return json({ ...(preview.title ? { title: preview.title } : {}), ...(preview.subtitle ? { subtitle: preview.subtitle } : {}) }, 200, { ...cors, "Cache-Control": `public, max-age=${maxAge}` });
    }
    const poster = await fetchPoster(source, fetchImpl);
    if (!poster.ok) { log("poster", `none_${source.provider}`); return json({ error: poster.code }, 404, { ...cors, "Cache-Control": "public, max-age=1800" }); }
    return new Response(poster.bytes, { status: 200, headers: { "Content-Type": poster.mime, "Content-Length": String(poster.bytes.length), "Cache-Control": `public, max-age=${maxAge}`, ...SAFE, ...cors } });
  } catch {
    log("poster", "exception");
    return json({ error: "no_poster" }, 404, { ...cors, "Cache-Control": "public, max-age=300" });
  }
}
