// Media delivery Architecture F - TESTING pilot (DEC-0013; supabase/migrations/20261029100000_media_r2_pilot.sql). Supabase stays authoritative; a verified
// copy of a pilot profile's visitor video lives in the PRIVATE R2 bucket gamid-media-testing (binding MEDIA_R2), and this Worker is its only reader and writer:
//
//   GET/HEAD /media/v1/<key>?exp=<unix>&sig=<hex>   a visitor's short lease, issued only by the public-media Edge Function after its unchanged authorization
//                                                   (HMAC-SHA256 with MEDIA_R2_SIGNING_KEY over "v1\n<key>\n<exp>"; the same lifetime as today's Supabase lease)
//   PUT/DELETE /media/v1-ingest/<key>              the worker Job's replica writes (HMAC-SHA256 with MEDIA_R2_INGEST_KEY; PUT carries the source's SHA-256,
//                                                   which R2 itself verifies before it stores the object)
//   /@<handle>/intro.webm, /intro-discord.webm     (worker.mjs) the crawler routes serve the replica when the anonymous delivery decision says 'r2'
//
// Inert by default: delivery needs the var MEDIA_R2_DELIVERY = "on" (wrangler.jsonc ships "off"), the R2 binding and the signing key; ingest needs the binding
// and the ingest key. Without them every /media/* request is a plain 404 and the crawler routes make no extra call - today's behavior exactly.
// The bucket stays private (no public access, no r2.dev, no custom domain): an object is reachable only through a signature this Worker verifies.

export const MEDIA_ROUTE_PREFIX = "/media/v1/";
export const MEDIA_INGEST_PREFIX = "/media/v1-ingest/";
export const MEDIA_MAX_BYTES = 15728640;            // the largest source the migration queues (15 MiB)
export const MEDIA_LEASE_MAX_SECONDS = 21600;       // no signature is honoured further ahead than the longest accepted lease
const INGEST_MAX_SKEW_SECONDS = 300;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// <source bucket>/<source path>/<attempt claim token>, exactly as private.worker_claim_media_r2_replica_impl builds it
const MEDIA_KEY_RE = new RegExp(`^(intro-media|intro-share-copies)/(?:[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}/){1,6}${UUID}$`);

export const isMediaKey = key => typeof key === "string" && key.length <= 600 && MEDIA_KEY_RE.test(key) && !key.includes("..");
export const deliveryEnabled = env => env?.MEDIA_R2_DELIVERY === "on" && typeof env?.MEDIA_R2?.get === "function";

const encoder = new TextEncoder();
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

// constant-time over equal-length hex strings
function sameHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const deliveryMessage = (key, exp) => `v1\n${key}\n${exp}`;
export const ingestMessage = (method, key, exp, sha256 = "", bytes = "") => `ingest-v1\n${method}\n${key}\n${exp}\n${sha256}\n${bytes}`;

// The same function public-media uses (supabase/functions/_shared/public-media.js signMediaR2Url): kept byte-identical by tests/media-r2-pilot.test.js.
export async function signDeliveryUrl(origin, key, exp, secret) {
  const sig = await hmacHex(secret, deliveryMessage(key, exp));
  return `${origin}${MEDIA_ROUTE_PREFIX}${key.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig}`;
}

export async function verifyDelivery(key, expRaw, sig, secret, nowSeconds) {
  if (!secret || !isMediaKey(key) || !/^\d{1,12}$/.test(String(expRaw ?? "")) || !/^[0-9a-f]{64}$/.test(String(sig ?? ""))) return false;
  const exp = Number(expRaw);
  if (exp <= nowSeconds || exp > nowSeconds + MEDIA_LEASE_MAX_SECONDS) return false;
  return sameHex(await hmacHex(secret, deliveryMessage(key, exp)), sig);
}

function keyFromPath(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  try { return pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/"); } catch { return null; }
}

const notFound = () => new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });

// exactly one byte range (worker.mjs acceptableRange already refused anything else) -> an R2 range, or undefined for the whole object
export function r2Range(header) {
  if (!header) return undefined;
  const [start, end] = String(header).trim().slice(6).split("-");
  if (start === "") return { suffix: Number(end) };
  return end === "" ? { offset: Number(start) } : { offset: Number(start), length: Number(end) - Number(start) + 1 };
}

// Serves one R2 object with the same semantics the Supabase passthrough has today: 200 (whole), 206 + Content-Range (one satisfiable range), 416 + bytes */size
// (unsatisfiable), HEAD = headers only (an R2 head, no body read). Any R2 failure is a generic 404 - never a bucket or backend detail.
export async function serveR2Object(request, bucket, key, cacheControl) {
  const rangeHeader = request.headers.get("range");
  const base = object => {
    const headers = new Headers();
    headers.set("content-type", object.httpMetadata?.contentType || "video/webm");
    headers.set("accept-ranges", "bytes");
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    if (object.uploaded instanceof Date) headers.set("last-modified", object.uploaded.toUTCString());
    headers.set("cache-control", cacheControl);
    headers.set("access-control-allow-origin", "*");
    return headers;
  };
  const range = r2Range(rangeHeader);
  if (request.method === "HEAD") {
    let object = null;
    try { object = await bucket.head(key); } catch { object = null; }
    if (!object) return notFound();
    const headers = base(object);
    headers.set("content-length", String(object.size));
    return new Response(null, { status: 200, headers });
  }
  const unsatisfiable = async () => {
    let object = null;
    try { object = await bucket.head(key); } catch { object = null; }
    if (!object) return notFound();
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${object.size}`, "cache-control": "no-store", "access-control-allow-origin": "*" } });
  };
  let object = null;
  try {
    object = await bucket.get(key, range ? { range } : undefined);
  } catch {
    if (!range) return notFound();
    // R2 refused the range as written (e.g. an end past the object): clamp it to the real size once, as an HTTP server would, or answer 416
    let meta = null;
    try { meta = await bucket.head(key); } catch { meta = null; }
    if (!meta) return notFound();
    const start = range.suffix !== undefined ? Math.max(meta.size - range.suffix, 0) : range.offset;
    if (start >= meta.size || range.suffix === 0) return unsatisfiable();
    const clamped = { offset: start, length: Math.min(range.length ?? meta.size - start, meta.size - start) };
    try { object = await bucket.get(key, { range: clamped }); } catch { return notFound(); }
    if (object) Object.assign(range, clamped, { suffix: undefined });
  }
  if (!object) return notFound();
  const size = object.size;
  const headers = base(object);
  if (!range) {
    headers.set("content-length", String(size));
    return new Response(object.body, { status: 200, headers });
  }
  const start = range.suffix !== undefined ? Math.max(size - range.suffix, 0) : range.offset;
  if (start >= size || (range.suffix !== undefined && range.suffix === 0)) { try { await object.body?.cancel(); } catch { /* released */ } return unsatisfiable(); }
  const end = range.length !== undefined ? Math.min(start + range.length, size) - 1 : size - 1;
  headers.set("content-range", `bytes ${start}-${end}/${size}`);
  headers.set("content-length", String(end - start + 1));
  return new Response(object.body, { status: 206, headers });
}

// GET/HEAD /media/v1/<key>: a verified, unexpired lease only; cached privately for no longer than the lease itself
export async function handleMediaDelivery(request, env, { nowSeconds = Math.floor(Date.now() / 1000), withinLimit = async () => true } = {}) {
  if (!deliveryEnabled(env) || !env.MEDIA_R2_SIGNING_KEY) return notFound();
  const url = new URL(request.url);
  const key = keyFromPath(url.pathname, MEDIA_ROUTE_PREFIX);
  const exp = url.searchParams.get("exp");
  if (!(await verifyDelivery(key, exp, url.searchParams.get("sig"), env.MEDIA_R2_SIGNING_KEY, nowSeconds))) return notFound();
  if (!(await withinLimit(key))) return new Response("Too Many Requests", { status: 429, headers: { "retry-after": "60", "cache-control": "no-store" } });
  return serveR2Object(request, env.MEDIA_R2, key, `private, max-age=${Math.max(Number(exp) - nowSeconds, 0)}`);
}

// PUT/DELETE /media/v1-ingest/<key>: the worker Job only. PUT streams the body into R2 with the signed SHA-256 (R2 refuses a body whose digest differs) and
// answers the stored size and digest, which the Job compares before it marks the replica READY in Supabase.
export async function handleMediaIngest(request, env, { nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (!env?.MEDIA_R2_INGEST_KEY || typeof env?.MEDIA_R2?.put !== "function") return notFound();
  if (request.method !== "PUT" && request.method !== "DELETE") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const key = keyFromPath(new URL(request.url).pathname, MEDIA_INGEST_PREFIX);
  const exp = request.headers.get("x-gamid-ingest-exp") || "";
  const sig = request.headers.get("x-gamid-ingest-sig") || "";
  const sha256 = request.method === "PUT" ? (request.headers.get("x-gamid-sha256") || "") : "";
  const bytes = request.method === "PUT" ? (request.headers.get("content-length") || "") : "";
  if (!isMediaKey(key) || !/^\d{1,12}$/.test(exp) || Math.abs(Number(exp) - nowSeconds) > INGEST_MAX_SKEW_SECONDS || !/^[0-9a-f]{64}$/.test(sig)) return json({ error: "UNAUTHORIZED" }, 401);
  if (!sameHex(await hmacHex(env.MEDIA_R2_INGEST_KEY, ingestMessage(request.method, key, exp, sha256, bytes)), sig)) return json({ error: "UNAUTHORIZED" }, 401);
  if (request.method === "DELETE") {
    try { await env.MEDIA_R2.delete(key); } catch { return json({ error: "R2_DELETE_FAILED" }, 502); }
    return json({ deleted: true });
  }
  if (!/^[0-9a-f]{64}$/.test(sha256) || !/^\d{1,9}$/.test(bytes) || Number(bytes) < 1 || Number(bytes) > MEDIA_MAX_BYTES || !request.body) return json({ error: "INVALID_REPLICA" }, 400);
  let stored = null;
  try {
    stored = await env.MEDIA_R2.put(key, request.body, { sha256, httpMetadata: { contentType: "video/webm" } });
  } catch {
    return json({ error: "R2_PUT_FAILED" }, 502);
  }
  const storedSha = stored?.checksums?.sha256 ? hex(stored.checksums.sha256) : null;
  if (!stored || stored.size !== Number(bytes) || storedSha !== sha256) {
    try { await env.MEDIA_R2.delete(key); } catch { /* the sweep deletes it */ }
    return json({ error: "REPLICA_MISMATCH" }, 422);
  }
  return json({ size: stored.size, sha256: storedSha });
}

// The anonymous delivery decision (public.get_public_media_delivery) for the crawler routes; any failure is null = today's Supabase passthrough
export async function fetchMediaDelivery(bucket, path, { supabaseUrl, publishableKey, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/get_public_media_delivery`, {
      method: "POST",
      headers: { apikey: publishableKey, "content-type": "application/json" },
      body: JSON.stringify({ candidate_bucket: bucket, candidate_path: path }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !["none", "supabase", "r2", "unavailable"].includes(row.mode)) return null;
    if (row.mode === "r2" && !isMediaKey(row.r2_key)) return null;
    return row;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
