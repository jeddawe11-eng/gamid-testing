// Wall asset registration with SERVER-SIDE content validation (Supabase Edge Function `wall-asset-register`). All behavior lives here and is tested under Node.
//
// The browser uploads a picture into its OWN folder of the private wall-media bucket (storage RLS), then asks this function to register it. The function:
//   1. CORS/origin, method, configuration, Bearer token -> the user the token proves (/auth/v1/user; nothing is taken from the request body about who the caller is)
//   2. the path must be <that user id>/<uuid>.<jpg|png|webp|avif|gif>
//   3. reads the STORED bytes (service role) - never a browser claim - and recognises the real format by its signature (JPEG, PNG, WebP, AVIF, GIF only: SVG, HTML
//      and everything else are refused), reads the real pixel size, and for a GIF walks every block to count frames
//   4. enforces the limits: 5 MiB, <= 8192 px a side, the file's extension must match its real format, and for a GIF (decode cost, not just size) <= 500 frames and
//      <= 50,000,000 frame-pixels (width x height x frames)
//   5. anything that fails is DELETED from storage and answered with a typed error; a valid image is registered through public.register_verified_wall_asset (service
//      role only), which re-checks every value in the database.
// It never logs names, tokens or file contents - only short codes.

export const WALL_ASSET_ORIGINS = Object.freeze(["https://jeddawe11-eng.github.io", "https://gamid-testing-static.gamid.workers.dev"]);
export const WALL_ASSET_LIMITS = Object.freeze({ maxBytes: 5 * 1024 * 1024, maxDimension: 8192, gifMaxFrames: 500, gifMaxFramePixels: 50_000_000 });
export const EXTENSION_TYPES = Object.freeze({ jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif" });

export function readWallAssetEnv(get) {
  return { supabaseUrl: get("SUPABASE_URL"), anonKey: get("SUPABASE_ANON_KEY"), serviceKey: get("SUPABASE_SERVICE_ROLE_KEY") };
}

// ---- format recognition (pure) ----------------------------------------------------------------------------------------------------------------------
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u32be = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));

function sniffPng(b) {
  if (b.length < 24 || b[0] !== 0x89 || ascii(b, 1, 3) !== "PNG" || b[4] !== 0x0d || b[5] !== 0x0a || b[6] !== 0x1a || b[7] !== 0x0a || ascii(b, 12, 4) !== "IHDR") return null;
  return { mime: "image/png", width: u32be(b, 16), height: u32be(b, 20), frames: null };
}

function sniffJpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return { invalid: true };
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    const length = u16be(b, i + 2);
    if (length < 2) return { invalid: true };
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame size
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { mime: "image/jpeg", height: u16be(b, i + 5), width: u16be(b, i + 7), frames: null };
    if (marker === 0xd9 || marker === 0xda) break;
    i += 2 + length;
  }
  return { invalid: true };
}

function sniffWebp(b) {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return { invalid: true };
    return { mime: "image/webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, frames: null };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return { invalid: true };
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, frames: null };
  }
  if (chunk === "VP8X") return { mime: "image/webp", width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), frames: null };
  return { invalid: true };
}

function sniffAvif(b) {
  if (b.length < 16 || ascii(b, 4, 4) !== "ftyp") return null;
  const boxSize = u32be(b, 0);
  const brands = [];
  for (let i = 8; i + 4 <= Math.min(boxSize, b.length); i += 4) if (i !== 12) brands.push(ascii(b, i, 4));
  if (!brands.includes("avif") && !brands.includes("avis")) return null;
  // the image spatial extent ('ispe') property: 4 bytes version/flags, then width and height (u32 big-endian)
  for (let i = 0; i + 16 <= b.length; i += 1) if (b[i] === 0x69 && ascii(b, i, 4) === "ispe") return { mime: "image/avif", width: u32be(b, i + 8), height: u32be(b, i + 12), frames: null };
  return { invalid: true };
}

// Walks a GIF's block structure (header, logical screen, optional global colour table, then extensions / image descriptors up to the trailer). Counts the frames and
// refuses anything malformed or truncated, so a file that only STARTS like a GIF is not accepted as one.
function sniffGif(b) {
  if (b.length < 13 || (ascii(b, 0, 6) !== "GIF87a" && ascii(b, 0, 6) !== "GIF89a")) return null;
  const width = u16le(b, 6), height = u16le(b, 8);
  let i = 13;
  if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 0x07) + 1));
  let frames = 0;
  const skipSubBlocks = at => { let p = at; while (p < b.length) { const size = b[p]; p += 1; if (size === 0) return p; p += size; } return -1; };
  while (i < b.length) {
    const introducer = b[i];
    if (introducer === 0x3b) return frames >= 1 ? { mime: "image/gif", width, height, frames } : { invalid: true };
    if (introducer === 0x21) { i = skipSubBlocks(i + 2); if (i < 0) return { invalid: true }; continue; }
    if (introducer === 0x2c) {
      if (i + 10 > b.length) return { invalid: true };
      const packed = b[i + 9];
      i += 10;
      if (packed & 0x80) i += 3 * (1 << ((packed & 0x07) + 1));
      i += 1;   // LZW minimum code size
      i = skipSubBlocks(i);
      if (i < 0) return { invalid: true };
      frames += 1;
      if (frames > WALL_ASSET_LIMITS.gifMaxFrames) return { mime: "image/gif", width, height, frames };   // no need to walk further: already over the limit
      continue;
    }
    return { invalid: true };
  }
  return { invalid: true };   // no trailer: truncated
}

// -> { ok: true, mime, width, height, frames } | { ok: false, code }
export function sniffImage(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const sniff of [sniffPng, sniffJpeg, sniffGif, sniffWebp, sniffAvif]) {
    const found = sniff(b);
    if (!found) continue;
    if (found.invalid) return { ok: false, code: "INVALID_IMAGE" };
    return { ok: true, ...found };
  }
  return { ok: false, code: "UNSUPPORTED_IMAGE_TYPE" };
}

// The limits for a recognised image stored under `extension`. -> null (fine) | an error code
export function assetProblem(image, extension, byteLength) {
  if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > WALL_ASSET_LIMITS.maxBytes) return "WALL_ASSET_TOO_LARGE";
  if (!image.ok) return image.code;
  if (EXTENSION_TYPES[extension] !== image.mime) return "WALL_ASSET_TYPE_MISMATCH";
  const side = value => Number.isInteger(value) && value >= 1 && value <= WALL_ASSET_LIMITS.maxDimension;
  if (!side(image.width) || !side(image.height)) return "INVALID_WALL_ASSET_SIZE";
  if (image.mime === "image/gif" && (image.frames < 1 || image.frames > WALL_ASSET_LIMITS.gifMaxFrames || image.width * image.height * image.frames > WALL_ASSET_LIMITS.gifMaxFramePixels)) return "GIF_TOO_COMPLEX";
  return null;
}

// ---- the request handler -----------------------------------------------------------------------------------------------------------------------------
const PATH = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp|avif|gif)$/;
const json = (body, status, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const corsFor = origin => (WALL_ASSET_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" });
const DB_ERRORS = { WALL_ASSET_LIMIT: 409, IDENTITY_NOT_FOUND: 409, WALL_ASSET_UPLOAD_NOT_FOUND: 404, INVALID_WALL_ASSET_PATH: 400, INVALID_WALL_ASSET_TYPE: 400, WALL_ASSET_TOO_LARGE: 400, INVALID_WALL_ASSET_SIZE: 400, GIF_TOO_COMPLEX: 400 };

export async function handleWallAssetRegister({ request, env, fetchImpl = fetch, log = () => {} }) {
  const origin = request.headers.get("origin");
  const cors = corsFor(origin);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Max-Age": "600" } });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && !WALL_ASSET_ORIGINS.includes(origin)) return json({ error: "origin_not_allowed" }, 403);
  if (!env?.supabaseUrl || !env.anonKey || !env.serviceKey) return json({ error: "not_configured" }, 503, cors);
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/.exec(request.headers.get("authorization") || "");
  if (!match) return json({ error: "unauthenticated" }, 401, cors);
  const base = String(env.supabaseUrl).replace(/\/+$/, "");
  const service = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };

  // 1. who is calling - proved by the token, never taken from the body
  let userId = null;
  try {
    const who = await fetchImpl(`${base}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: `Bearer ${match[1]}` } });
    if (who.ok) userId = (await who.json())?.id ?? null;
  } catch { userId = null; }
  if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/.test(userId)) return json({ error: "unauthenticated" }, 401, cors);

  // 2. the upload must be in the caller's own folder
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const path = typeof body?.path === "string" ? body.path : "";
  const parts = PATH.exec(path);
  if (!parts || parts[1] !== userId) return json({ error: "INVALID_WALL_ASSET_PATH" }, 400, cors);
  const extension = parts[2];
  const objectUrl = `${base}/storage/v1/object/wall-media/${path}`;
  const discard = () => fetchImpl(objectUrl, { method: "DELETE", headers: service }).catch(() => null);

  try {
    // 3. the STORED bytes, read with the service role
    const stored = await fetchImpl(objectUrl, { headers: service });
    if (stored.status === 404 || stored.status === 400) return json({ error: "WALL_ASSET_UPLOAD_NOT_FOUND" }, 404, cors);
    if (!stored.ok) { log("wall-asset", "read_failed"); return json({ error: "register_failed" }, 502, cors); }
    const bytes = new Uint8Array(await stored.arrayBuffer());
    // 4. recognise and check
    const image = sniffImage(bytes);
    const problem = assetProblem(image, extension, bytes.length);
    if (problem) { await discard(); log("wall-asset", `rejected_${problem}`); return json({ error: problem }, 400, cors); }
    // 5. register (the database checks every value again)
    const registered = await fetchImpl(`${base}/rest/v1/rpc/register_verified_wall_asset`, {
      method: "POST",
      headers: { ...service, "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_owner: userId, candidate_path: path, candidate_mime: image.mime, candidate_bytes: bytes.length, candidate_width: image.width, candidate_height: image.height, candidate_frames: image.mime === "image/gif" ? image.frames : null }),
    });
    let payload = null;
    try { payload = await registered.json(); } catch { payload = null; }
    if (!registered.ok) {
      const code = String(payload?.message || "");
      await discard();
      log("wall-asset", `register_${DB_ERRORS[code] ? code : "failed"}`);
      return json({ error: DB_ERRORS[code] ? code : "register_failed" }, DB_ERRORS[code] ?? 502, cors);
    }
    const row = Array.isArray(payload) ? payload[0] : null;
    if (!row) { await discard(); return json({ error: "register_failed" }, 502, cors); }
    log("wall-asset", `registered_${extension}`);
    return json({ asset: row }, 200, cors);
  } catch {
    log("wall-asset", "exception");
    return json({ error: "register_failed" }, 502, cors);
  }
}
