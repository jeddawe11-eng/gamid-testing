// Visitor media access (Phase 1D, ISS-0009) - GamID TESTING. Two public Edge Functions share this module; everything environmental is injected so the Node
// suite exercises the exact code.
//
//   public-media    POST {bucket, path} -> {signedURL, expiresIn}: a streaming lease for an Intro or a published Wall video. Visitors can no longer sign Storage
//                   objects themselves (restrictive RLS, 20261010140000). The server decides with the SAME predicates as the accepted read policies
//                   (public_media_lease_allowed) and signs with its own credentials and its own lifetime: Intro 120 s (accepted F5 lease), Wall video 6 h
//                   (accepted F4 lifetime). The caller never chooses a lifetime.
//   profile-banner  GET|HEAD /profile-banner/<handle> -> the attached Banner of a PUBLIC GamID as image/jpeg with Cache-Control: no-store. No Storage URL of any
//                   kind leaves the server. The decision is taken before AND after reading the bytes, so a concurrent PRIVATE / replace / remove is honoured.
//
// Every refusal (unknown, PRIVATE, DRAFT, unpublished, disabled, detached, malformed) is the same body-less 404, so nothing can be enumerated. Both functions
// are rate limited by a hashed client key (never an IP is stored). Service credentials never appear in a response, a log line or a URL handed out.
export const SITE_ORIGINS = Object.freeze(["https://gamid-testing-static.gamid.workers.dev", "https://jeddawe11-eng.github.io"]);
export const LEASE_SECONDS = Object.freeze({ "intro-media": 120, "wall-video": 6 * 60 * 60, "wall-video-derived": 6 * 60 * 60 });
export const BANNER_MAX_BYTES = 5 * 1024 * 1024;
export const LIMITS = Object.freeze({ mediaPerClient: 240, bannerPerClient: 120, bannerPerHandle: 600 });
const PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,120}(\/[A-Za-z0-9._-]{1,120}){0,2}$/;
const HANDLE = /^[a-z0-9_]{3,24}$/;
const safePath = path => typeof path === "string" && path.length <= 400 && PATH.test(path) && !path.split("/").some(part => /^\.+$/.test(part));
const SIGNED_PREFIX = bucket => `/object/sign/${bucket}/`;

export function readPublicMediaEnv(get) {
  return { supabaseUrl: get("SUPABASE_URL"), serviceKey: get("SUPABASE_SERVICE_ROLE_KEY") };
}
const configured = env => typeof env?.supabaseUrl === "string" && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.supabaseUrl.replace(/\/+$/, "")) && Boolean(env.serviceKey);
const base = env => env.supabaseUrl.replace(/\/+$/, "");
const encodePath = p => p.split("/").map(encodeURIComponent).join("/");

function corsFor(origin) {
  return SITE_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" };
}
const json = (body, status, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
const notFound = (headers = {}) => new Response(null, { status: 404, headers: { "Cache-Control": "no-store", ...headers } });
const tooMany = (headers = {}) => new Response(null, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60", ...headers } });

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
// A per-day pseudonymous client key: sha256(day : client address : server secret). The address is never stored, logged or returned.
export async function clientKey(request, env, now = new Date()) {
  const address = request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  return (await sha256Hex(`${now.toISOString().slice(0, 10)}:${address}:${await sha256Hex(env.serviceKey)}`)).slice(0, 32);
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
const withinLimit = async (fetchImpl, env, key, limit) => (await serviceRpc(fetchImpl, env, "public_media_hit", { candidate_key: key, candidate_limit: limit })) === true;

// ---------------------------------------------------------------------------------------------------------------
// public-media
// ---------------------------------------------------------------------------------------------------------------
export async function handlePublicMedia({ request, env, fetchImpl = fetch, log = () => {} }) {
  const origin = request.headers.get("origin");
  const cors = corsFor(origin);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "apikey, content-type, x-client-info, authorization", "Access-Control-Max-Age": "600" } });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && !SITE_ORIGINS.includes(origin)) return json({ error: "origin_not_allowed" }, 403);
  if (!configured(env)) return json({ error: "not_configured" }, 503, cors);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const bucket = body?.bucket, path = body?.path;
  if (!Object.hasOwn(LEASE_SECONDS, bucket) || !safePath(path)) return notFound(cors);
  try {
    if (!(await withinLimit(fetchImpl, env, `media:${await clientKey(request, env)}`, LIMITS.mediaPerClient))) { log("public-media", "rate_limited"); return tooMany(cors); }
    if ((await serviceRpc(fetchImpl, env, "public_media_lease_allowed", { candidate_bucket: bucket, candidate_path: path })) !== true) return notFound(cors);
    const signed = await fetchImpl(`${base(env)}/storage/v1/object/sign/${bucket}/${encodePath(path)}`, {
      method: "POST",
      headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: LEASE_SECONDS[bucket] }),
    });
    if (!signed.ok) return notFound(cors);
    const relative = (await signed.json().catch(() => null))?.signedURL;
    if (typeof relative !== "string" || !relative.startsWith(SIGNED_PREFIX(bucket) + encodePath(path) + "?token=")) { log("public-media", "unexpected_sign"); return notFound(cors); }
    return json({ signedURL: relative, expiresIn: LEASE_SECONDS[bucket] }, 200, cors);
  } catch {
    log("public-media", "error");
    return json({ error: "unavailable" }, 503, cors);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// profile-banner
// ---------------------------------------------------------------------------------------------------------------
const BANNER_HEADERS = Object.freeze({
  "Content-Type": "image/jpeg",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Referrer-Policy": "no-referrer",
});
export function bannerHandleFrom(url) {
  const match = /\/profile-banner\/([^/?#]+)\/?$/.exec(new URL(url).pathname);
  if (!match) return null;
  let handle;
  try { handle = decodeURIComponent(match[1]).trim().toLowerCase(); } catch { return null; }
  return HANDLE.test(handle) ? handle : null;
}

export async function handleProfileBanner({ request, env, fetchImpl = fetch, log = () => {} }) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  if (!configured(env)) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  const handle = bannerHandleFrom(request.url);
  if (!handle) return notFound();
  try {
    if (!(await withinLimit(fetchImpl, env, `banner:${await clientKey(request, env)}`, LIMITS.bannerPerClient))) { log("profile-banner", "rate_limited"); return tooMany(); }
    if (!(await withinLimit(fetchImpl, env, `handle:${(await sha256Hex(handle)).slice(0, 32)}`, LIMITS.bannerPerHandle))) { log("profile-banner", "rate_limited"); return tooMany(); }
    const path = await serviceRpc(fetchImpl, env, "public_banner_object", { candidate_handle: handle });
    if (!safePath(path) || path.split("/")[1] !== "banner") return notFound();
    const object = await fetchImpl(`${base(env)}/storage/v1/object/authenticated/avatars/${encodePath(path)}`, {
      headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!object.ok) return notFound();
    const declared = Number(object.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > BANNER_MAX_BYTES) return notFound();
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length < 4 || bytes.length > BANNER_MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) return notFound();
    // re-check after the read: a GamID made PRIVATE, or a Banner replaced / removed while the bytes were in flight, is never served
    if ((await serviceRpc(fetchImpl, env, "public_banner_object", { candidate_handle: handle })) !== path) return notFound();
    return new Response(request.method === "HEAD" ? null : bytes, { status: 200, headers: { ...BANNER_HEADERS, "Content-Length": String(bytes.length) } });
  } catch {
    log("profile-banner", "error");
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
