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
//
// Background VIDEOS (MP4) are uploaded (resumably) into the separate private `wall-video` bucket as <user id>/<uuid>.mp4. For them the function never downloads the
// file: it reads only box HEADERS and the `moov` box with range requests, and requires a real ISO-BMFF MP4 (an `ftyp` first, an ISO / MP4 brand), a video track whose
// sample entry is H.264 (avc1 / avc3 - the codec every browser plays), a real picture size of at most 4096 px a side and at most 50 MiB. Anything else is deleted.
// HEVC / H.265 (hvc1 / hev1): when WALL_VIDEO_TRANSCODE_ENABLED is "true" (set only once the worker image that transcodes is deployed), a valid HEVC MP4 within the
// same limits and the transcoding budget is QUEUED (public.create_wall_video_job) instead: the worker makes a same-resolution H.264 derivative, which becomes the
// asset, and deletes the source. With the switch off, HEVC is refused exactly as before. H.264 always takes the direct path - never transcoded.
// WebM videos (<user id>/<uuid>.webm, same bucket and limits) are checked the same way - EBML header (DocType "webm") and the Tracks element only, a VP8 / VP9 video
// track (alpha transparency allowed and reported), <= 4096 px a side, <= 50 MiB. WebM is never transcoded.

export const WALL_ASSET_ORIGINS = Object.freeze(["https://jeddawe11-eng.github.io", "https://gamid-testing-static.gamid.workers.dev"]);
export const WALL_ASSET_LIMITS = Object.freeze({ maxBytes: 5 * 1024 * 1024, maxDimension: 8192, gifMaxFrames: 500, gifMaxFramePixels: 50_000_000 });
export const EXTENSION_TYPES = Object.freeze({ jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif", mp4: "video/mp4", webm: "video/webm" });
export const WALL_VIDEO_LIMITS = Object.freeze({ maxBytes: 50 * 1024 * 1024, maxDimension: 4096, maxMoovBytes: 8 * 1024 * 1024, maxTopLevelBoxes: 256, maxTranscodePixelFrames: 3840 * 2160 * 30 * 120 });
export const HEVC_CODECS = Object.freeze(["hvc1", "hev1"]);

export function readWallAssetEnv(get) {
  return { supabaseUrl: get("SUPABASE_URL"), anonKey: get("SUPABASE_ANON_KEY"), serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"), transcodeEnabled: get("WALL_VIDEO_TRANSCODE_ENABLED") === "true" };
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

// ---- MP4 (background video) recognition ------------------------------------------------------------------------------------------------------------------
const MP4_BRANDS = /^(isom|iso[2-9]|mp41|mp42|avc1|M4V |dash|mmp4)$/;
// The boxes directly inside [start, end) of `b`: { type, start (payload), end }; null when a size does not fit (a malformed file).
function boxes(b, start, end) {
  const out = [];
  let at = start;
  while (at + 8 <= end) {
    let size = u32be(b, at), header = 8;
    const type = ascii(b, at + 4, 4);
    if (size === 1) { if (at + 16 > end) return null; size = u32be(b, at + 8) * 2 ** 32 + u32be(b, at + 12); header = 16; }
    else if (size === 0) size = end - at;
    if (size < header || at + size > end) return null;
    out.push({ type, start: at + header, end: at + size });
    at += size;
  }
  return out;
}
const child = (b, box, type) => (boxes(b, box.start, box.end) ?? []).find(candidate => candidate.type === type) ?? null;

// Reads the video track out of a `moov` payload. -> { ok, mime, width, height, codec } | { ok: false, code }
export function parseMoov(b) {
  const top = boxes(b, 0, b.length);
  if (!top) return { ok: false, code: "INVALID_VIDEO" };
  let unsupported = null;
  for (const trak of top.filter(box => box.type === "trak")) {
    const mdia = child(b, trak, "mdia"), hdlr = mdia && child(b, mdia, "hdlr");
    if (!hdlr || hdlr.end - hdlr.start < 12 || ascii(b, hdlr.start + 8, 4) !== "vide") continue;
    const stbl = child(b, child(b, mdia, "minf") ?? { start: 0, end: 0 }, "stbl");
    const stsd = stbl && child(b, stbl, "stsd");
    if (!stsd || stsd.end - stsd.start < 16 + 36) return { ok: false, code: "INVALID_VIDEO" };
    const entry = stsd.start + 8;                     // version/flags (4) + entry count (4)
    const codec = ascii(b, entry + 4, 4);
    const hevc = HEVC_CODECS.includes(codec);
    if (codec !== "avc1" && codec !== "avc3" && !hevc) { unsupported = codec; continue; }
    // the sample entry's coded size: after size+type (8), reserved (6) + data ref (2), pre-defined / reserved (16)
    let width = u16be(b, entry + 32), height = u16be(b, entry + 34);
    const tkhd = child(b, trak, "tkhd");
    if (tkhd && tkhd.end - tkhd.start >= 84) {
      const at = b[tkhd.start] === 1 ? tkhd.start + 88 : tkhd.start + 76;   // display size (16.16 fixed point) at the end of the track header
      if (at + 8 <= tkhd.end) { const w = Math.round(u32be(b, at) / 65536), h = Math.round(u32be(b, at + 4) / 65536); if (w > 0 && h > 0) { width = w; height = h; } }
    }
    // the number of pictures (stsz sample count): the transcoding budget for an HEVC source
    const stsz = child(b, stbl, "stsz");
    const samples = stsz && stsz.end - stsz.start >= 12 ? u32be(b, stsz.start + 8) : null;
    return { ok: true, mime: "video/mp4", width, height, codec, frames: null, samples, transcode: hevc };
  }
  return { ok: false, code: unsupported ? "VIDEO_CODEC_UNSUPPORTED" : "INVALID_VIDEO" };
}

// Walks the top-level boxes with `read(offset, length) -> Uint8Array` (range reads) and inspects the `moov` box. -> like parseMoov
export async function inspectMp4(read, total) {
  if (!Number.isSafeInteger(total) || total < 16) return { ok: false, code: "INVALID_VIDEO" };
  let offset = 0, video = null;
  // every top-level box must fit the file exactly (a truncated upload fails here even when its moov came first)
  for (let guard = 0; offset < total && guard < WALL_VIDEO_LIMITS.maxTopLevelBoxes; guard += 1) {
    if (offset + 8 > total) return { ok: false, code: "INVALID_VIDEO" };
    const head = await read(offset, Math.min(16, total - offset));
    if (head.length < 8) return { ok: false, code: "INVALID_VIDEO" };
    let size = u32be(head, 0), header = 8;
    const type = ascii(head, 4, 4);
    if (size === 1) { if (head.length < 16) return { ok: false, code: "INVALID_VIDEO" }; size = u32be(head, 8) * 2 ** 32 + u32be(head, 12); header = 16; }
    else if (size === 0) size = total - offset;
    if (offset === 0 && type !== "ftyp") return { ok: false, code: "UNSUPPORTED_VIDEO_TYPE" };   // not an ISO-BMFF file at all (an image, a text file...)
    if (size < header || offset + size > total) return { ok: false, code: "INVALID_VIDEO" };
    if (offset === 0) {
      if (type !== "ftyp" || size > 4096) return { ok: false, code: "UNSUPPORTED_VIDEO_TYPE" };
      const ftyp = await read(0, size);
      const brands = [ascii(ftyp, 8, 4)];
      for (let i = 16; i + 4 <= ftyp.length; i += 4) brands.push(ascii(ftyp, i, 4));
      if (!brands.some(brand => MP4_BRANDS.test(brand))) return { ok: false, code: "UNSUPPORTED_VIDEO_TYPE" };
    } else if (type === "moov") {
      if (size > WALL_VIDEO_LIMITS.maxMoovBytes) return { ok: false, code: "INVALID_VIDEO" };
      if (video) return { ok: false, code: "INVALID_VIDEO" };
      const moov = await read(offset, size);
      if (moov.length !== size) return { ok: false, code: "INVALID_VIDEO" };
      video = parseMoov(moov.subarray(header));
      if (!video.ok) return video;
    }
    offset += size;
  }
  if (offset !== total || !video) return { ok: false, code: "INVALID_VIDEO" };
  return video;
}

// ---- WebM (video layers / backgrounds) recognition -------------------------------------------------------------------------------------------------------
// A WebM is an EBML (Matroska) file: an EBML header whose DocType is "webm", then one Segment holding Info, Tracks, Clusters... Only the header and the Tracks
// element are read (range reads), never the media itself. The video track must be VP8 or VP9 - the WebM codecs that can carry an ALPHA channel and that every
// browser with WebM support decodes; its AlphaMode flag (1 = the video has transparency) is reported. A file whose sizes do not fit (truncated) is refused.
export const WEBM_CODECS = Object.freeze(["V_VP8", "V_VP9"]);
const EBML = Object.freeze({ header: 0x1a45dfa3, docType: 0x4282, segment: 0x18538067, tracks: 0x1654ae6b, cluster: 0x1f43b675, trackEntry: 0xae, trackType: 0x83, codecId: 0x86,
  video: 0xe0, pixelWidth: 0xb0, pixelHeight: 0xba, displayWidth: 0x54b0, displayHeight: 0x54ba, alphaMode: 0x53c0 });
const WEBM_LIMITS = Object.freeze({ maxHeaderBytes: 4096, maxTracksBytes: 1024 * 1024, maxSegmentChildren: 256 });

// An EBML variable-length integer at b[i]: an element ID keeps its length marker; a size drops it (all value bits set = "unknown size"). -> { value, length, unknown } | null
function vint(b, i, isId) {
  const first = b[i];
  if (first === undefined || first === 0) return null;
  let length = 1, mask = 0x80;
  while (!(first & mask)) { mask >>= 1; length += 1; }
  if (length > (isId ? 4 : 8) || i + length > b.length) return null;
  let value = isId ? first : first & (mask - 1), unknown = !isId && (first & (mask - 1)) === mask - 1;
  for (let k = 1; k < length; k += 1) { value = value * 256 + b[i + k]; if (b[i + k] !== 0xff) unknown = false; }
  return { value, length, unknown };
}
// The element header at b[i] -> { id, dataStart (relative to b), size | null (unknown) } | null
function ebmlHeader(b, i) {
  const id = vint(b, i, true);
  if (!id) return null;
  const size = vint(b, i + id.length, false);
  if (!size) return null;
  return { id: id.value, dataStart: i + id.length + size.length, size: size.unknown ? null : size.value };
}
// The children of the master element whose data is b[start, end): [{ id, start, end }]; null when one does not fit.
function ebmlChildren(b, start, end) {
  const out = [];
  for (let at = start; at < end;) {
    const head = ebmlHeader(b, at);
    if (!head || head.size === null || head.dataStart + head.size > end) return null;
    out.push({ id: head.id, start: head.dataStart, end: head.dataStart + head.size });
    at = head.dataStart + head.size;
  }
  return out;
}
const ebmlUint = (b, el) => { let value = 0; for (let i = el.start; i < el.end; i += 1) value = value * 256 + b[i]; return el.end - el.start <= 7 ? value : NaN; };
const ebmlString = (b, el) => String.fromCharCode(...b.subarray(el.start, el.end)).replace(/\0+$/, "");

// Reads the video track out of a Tracks element's data. -> { ok, mime, width, height, codec, alpha } | { ok: false, code }
export function parseWebmTracks(b) {
  const entries = ebmlChildren(b, 0, b.length);
  if (!entries) return { ok: false, code: "INVALID_VIDEO" };
  let unsupported = null;
  for (const entry of entries.filter(el => el.id === EBML.trackEntry)) {
    const fields = ebmlChildren(b, entry.start, entry.end);
    if (!fields) return { ok: false, code: "INVALID_VIDEO" };
    const find = id => fields.find(el => el.id === id) ?? null;
    const type = find(EBML.trackType);
    if (!type || ebmlUint(b, type) !== 1) continue;   // 1 = video
    const codecEl = find(EBML.codecId);
    const codec = codecEl ? ebmlString(b, codecEl) : "";
    if (!WEBM_CODECS.includes(codec)) { unsupported = codec || "unknown"; continue; }
    const videoEl = find(EBML.video);
    const video = videoEl ? ebmlChildren(b, videoEl.start, videoEl.end) : null;
    if (!video) return { ok: false, code: "INVALID_VIDEO" };
    const value = id => { const el = video.find(child => child.id === id); return el ? ebmlUint(b, el) : null; };
    const width = value(EBML.pixelWidth), height = value(EBML.pixelHeight);
    return { ok: true, mime: "video/webm", width, height, codec, frames: null, alpha: value(EBML.alphaMode) === 1 };
  }
  return { ok: false, code: unsupported ? "WEBM_CODEC_UNSUPPORTED" : "INVALID_VIDEO" };
}

// Walks the EBML header and the Segment's children with `read(offset, length) -> Uint8Array` (range reads) until the Tracks element. -> like parseWebmTracks
export async function inspectWebm(read, total) {
  if (!Number.isSafeInteger(total) || total < 16) return { ok: false, code: "INVALID_VIDEO" };
  const first = await read(0, Math.min(64, total));
  const header = ebmlHeader(first, 0);
  if (!header || header.id !== EBML.header) return { ok: false, code: "UNSUPPORTED_VIDEO_TYPE" };   // not an EBML file at all
  if (header.size === null || header.dataStart + header.size > WEBM_LIMITS.maxHeaderBytes || header.dataStart + header.size > total) return { ok: false, code: "INVALID_VIDEO" };
  const head = await read(0, header.dataStart + header.size);
  const docType = (ebmlChildren(head, header.dataStart, header.dataStart + header.size) ?? []).find(el => el.id === EBML.docType);
  if (!docType || ebmlString(head, docType) !== "webm") return { ok: false, code: "UNSUPPORTED_VIDEO_TYPE" };   // Matroska / anything else is not WebM
  let offset = header.dataStart + header.size;
  const segHead = ebmlHeader(await read(offset, Math.min(16, total - offset)), 0);
  if (!segHead || segHead.id !== EBML.segment) return { ok: false, code: "INVALID_VIDEO" };
  const segmentStart = offset + segHead.dataStart;
  // a Segment of known size must end exactly at the end of the file (a truncated upload fails here); a live-recorded file may leave it unknown
  const segmentEnd = segHead.size === null ? total : segmentStart + segHead.size;
  if (segmentEnd !== total) return { ok: false, code: "INVALID_VIDEO" };
  offset = segmentStart;
  for (let guard = 0; offset < segmentEnd && guard < WEBM_LIMITS.maxSegmentChildren; guard += 1) {
    const el = ebmlHeader(await read(offset, Math.min(16, segmentEnd - offset)), 0);
    if (!el) return { ok: false, code: "INVALID_VIDEO" };
    if (el.id === EBML.cluster) return { ok: false, code: "INVALID_VIDEO" };   // media before any track description
    if (el.size === null || offset + el.dataStart + el.size > segmentEnd) return { ok: false, code: "INVALID_VIDEO" };
    if (el.id === EBML.tracks) {
      if (el.size > WEBM_LIMITS.maxTracksBytes) return { ok: false, code: "INVALID_VIDEO" };
      const tracks = await read(offset + el.dataStart, el.size);
      if (tracks.length !== el.size) return { ok: false, code: "INVALID_VIDEO" };
      return parseWebmTracks(tracks);
    }
    offset += el.dataStart + el.size;
  }
  return { ok: false, code: "INVALID_VIDEO" };
}

export function videoProblem(video, byteLength, { transcodeEnabled = false } = {}) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > WALL_VIDEO_LIMITS.maxBytes) return "VIDEO_TOO_LARGE";
  if (!video.ok) return video.code;
  const side = value => Number.isInteger(value) && value >= 1 && value <= WALL_VIDEO_LIMITS.maxDimension;
  if (!side(video.width) || !side(video.height)) return "INVALID_WALL_ASSET_SIZE";
  if (video.transcode) {
    if (!transcodeEnabled) return "VIDEO_CODEC_UNSUPPORTED";
    if (!(video.samples > 0)) return "INVALID_VIDEO";
    if (video.width * video.height * video.samples > WALL_VIDEO_LIMITS.maxTranscodePixelFrames) return "VIDEO_TOO_LONG_TO_CONVERT";
  }
  return null;
}

// ---- the request handler -----------------------------------------------------------------------------------------------------------------------------
const PATH = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp|avif|gif|mp4|webm)$/;
const json = (body, status, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const corsFor = origin => (WALL_ASSET_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" });
const DB_ERRORS = { VIDEO_CODEC_UNSUPPORTED: 400, WALL_VIDEO_LIMIT: 409, VIDEO_TOO_LARGE: 400, WALL_ASSET_LIMIT: 409, IDENTITY_NOT_FOUND: 409, WALL_ASSET_UPLOAD_NOT_FOUND: 404, INVALID_WALL_ASSET_PATH: 400, INVALID_WALL_ASSET_TYPE: 400, WALL_ASSET_TOO_LARGE: 400, INVALID_WALL_ASSET_SIZE: 400, GIF_TOO_COMPLEX: 400 };

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
  const isVideo = extension === "mp4" || extension === "webm";
  const objectUrl = `${base}/storage/v1/object/${isVideo ? "wall-video" : "wall-media"}/${path}`;
  const discard = () => fetchImpl(objectUrl, { method: "DELETE", headers: service }).catch(() => null);

  try {
    let image, byteLength;
    if (isVideo) {
      // 3v. a video is inspected with RANGE reads only (MP4: box headers + moov; WebM: EBML header + Tracks), never downloaded whole
      let total = null, missing = false;
      const read = async (offset, length) => {
        const response = await fetchImpl(objectUrl, { headers: { ...service, Range: `bytes=${offset}-${offset + length - 1}` } });
        if (response.status === 404 || response.status === 400) { missing = true; throw new Error("missing"); }
        if (!response.ok) throw new Error("read_failed");
        const range = /\/(\d+)\s*$/.exec(response.headers.get("content-range") || "");
        if (range) total = Number(range[1]);
        const buffer = new Uint8Array(await response.arrayBuffer());
        if (!range && response.status === 200) total = buffer.length;   // a server that ignores Range sent the whole file
        return response.status === 206 ? buffer : buffer.subarray(offset, offset + length);
      };
      try { await read(0, 16); } catch { if (missing) return json({ error: "WALL_ASSET_UPLOAD_NOT_FOUND" }, 404, cors); log("wall-asset", "read_failed"); return json({ error: "register_failed" }, 502, cors); }
      byteLength = total;
      if (!Number.isSafeInteger(byteLength) || byteLength > WALL_VIDEO_LIMITS.maxBytes) image = { ok: false, code: "VIDEO_TOO_LARGE" };
      else image = await (extension === "webm" ? inspectWebm : inspectMp4)(read, byteLength).catch(() => ({ ok: false, code: "INVALID_VIDEO" }));
      const problem = videoProblem(image, byteLength, { transcodeEnabled: env.transcodeEnabled === true });
      if (problem) { await discard(); log("wall-asset", `rejected_${problem}`); return json({ error: problem }, 400, cors); }
      if (image.transcode) {
        // 5v. HEVC: queue the server-side conversion; the source stays private until the worker has made (and the database has accepted) the H.264 copy
        const queued = await fetchImpl(`${base}/rest/v1/rpc/create_wall_video_job`, {
          method: "POST",
          headers: { ...service, "Content-Type": "application/json" },
          body: JSON.stringify({ candidate_owner: userId, candidate_path: path, candidate_bytes: byteLength, candidate_codec: image.codec, candidate_width: image.width, candidate_height: image.height, candidate_frames: image.samples }),
        });
        let queuedPayload = null;
        try { queuedPayload = await queued.json(); } catch { queuedPayload = null; }
        const job = Array.isArray(queuedPayload) ? queuedPayload[0] : null;
        if (!queued.ok || !job?.job_id) {
          const code = String(queuedPayload?.message || "");
          await discard();
          log("wall-asset", `queue_${DB_ERRORS[code] ? code : "failed"}`);
          return json({ error: DB_ERRORS[code] ? code : "register_failed" }, DB_ERRORS[code] ?? 502, cors);
        }
        log("wall-asset", "queued_hevc");
        return json({ job: { job_id: job.job_id, state: job.state, width: image.width, height: image.height } }, 202, cors);
      }
    } else {
      // 3. the STORED bytes, read with the service role
      const stored = await fetchImpl(objectUrl, { headers: service });
      if (stored.status === 404 || stored.status === 400) return json({ error: "WALL_ASSET_UPLOAD_NOT_FOUND" }, 404, cors);
      if (!stored.ok) { log("wall-asset", "read_failed"); return json({ error: "register_failed" }, 502, cors); }
      const bytes = new Uint8Array(await stored.arrayBuffer());
      // 4. recognise and check
      image = sniffImage(bytes);
      byteLength = bytes.length;
      const problem = assetProblem(image, extension, bytes.length);
      if (problem) { await discard(); log("wall-asset", `rejected_${problem}`); return json({ error: problem }, 400, cors); }
    }
    // 5. register (the database checks every value again)
    const registered = await fetchImpl(`${base}/rest/v1/rpc/register_verified_wall_asset`, {
      method: "POST",
      headers: { ...service, "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_owner: userId, candidate_path: path, candidate_mime: image.mime, candidate_bytes: byteLength, candidate_width: image.width, candidate_height: image.height, candidate_frames: image.mime === "image/gif" ? image.frames : null }),
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
    log("wall-asset", `registered_${extension}${image.alpha ? "_alpha" : ""}`);
    return json({ asset: row, ...(image.alpha ? { alpha: true } : {}) }, 200, cors);
  } catch {
    log("wall-asset", "exception");
    return json({ error: "register_failed" }, 502, cors);
  }
}
