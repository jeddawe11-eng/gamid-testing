// Public Intro still poster (Infrastructure Optimization & Security Hardening V1, Mazen's task 2026-10-27): a WebP of EXACTLY the frame the public page shows
// while the Intro waits for Play, in the EXISTING worker image and Job (the same claim / complete / fail RPC shape as intro-share.mjs). The Intro's D3
// derivative is never changed, moved or deleted here.
//
//   claim (per-attempt claim token + object path) -> stream the private D3 derivative to disk -> its frame timestamps -> the frame a paused browser shows at
//   poster_ms (the last frame presented at or before it; 0 = the first frame) -> that ONE frame converted to RGB with the colour matrix the browser uses
//   for this derivative -> WebP -> validate (format, the Intro's own size, bytes) -> upload (service role, private bucket) -> the database re-checks it is
//   still current and marks READY. Any failure: the page keeps showing the frame by seeking the video, as before.
//
// Colour (measured 2026-10-27 in Chrome against the paused video, poster-lab): an untagged VP9 derivative is shown with BT.709 at every size (1920x1080,
// 1280x720, 640x360, 1080x1920: PSNR 41.3-42.8 dB; BT.601 instead: 24.2-24.5 dB, visibly wrong); a BT.601-tagged one with BT.601 (45.2 dB). HDR / BT.2020
// or any other tag is refused (POSTER_COLOR_UNSUPPORTED) rather than guessed.
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { TESTING_PROJECT, videoFrameTimes } from "./intro-share.mjs";

const run = promisify(execFile);
export const POSTER = Object.freeze({
  bucket: "intro-posters",
  maxBytes: 1024 * 1024,   // the bucket and the database enforce it too
  qualities: Object.freeze([90, 75]),   // 90 = the measured equivalent; 75 only when 90 would exceed maxBytes
  cacheControl: "no-cache",   // every read is revalidated, so every read re-checks the storage policy (as the public pictures)
});

export async function probePoster(path) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries",
    "format=format_name,duration:stream=index,codec_type,codec_name,width,height,pix_fmt,sample_aspect_ratio,color_space,color_primaries,color_transfer,color_range",
    "-of", "json", path], { maxBuffer: 2 * 1024 * 1024 });
  return JSON.parse(stdout);
}

const UNTAGGED = new Set([undefined, null, "", "unknown", "unspecified", "reserved"]);
const BT709 = new Set(["bt709"]), BT601 = new Set(["smpte170m", "bt470bg"]);
const SDR_TRANSFER = new Set(["bt709", "smpte170m", "bt470bg", "bt470m", "iec61966-2-1", "bt2020-10", "bt2020-12"]);
// the RGB conversion the browser applies to this stream, or null when it cannot be reproduced with confidence
export function posterColor(video) {
  const space = video?.color_space, primaries = video?.color_primaries, transfer = video?.color_transfer;
  if (!UNTAGGED.has(transfer) && !SDR_TRANSFER.has(transfer)) return null;   // PQ / HLG / anything else
  if (!UNTAGGED.has(primaries) && !BT709.has(primaries) && !BT601.has(primaries)) return null;   // BT.2020 and other wide gamuts
  const matrix = UNTAGGED.has(space) ? "bt709" : BT709.has(space) ? "bt709" : BT601.has(space) ? "bt601" : null;
  if (!matrix) return null;
  return { matrix, range: video?.color_range === "pc" ? "pc" : "tv" };
}

// ffprobe facts + frame times + the poster's time -> the plan, or a typed refusal
export function posterPlan(probe, times, posterMs, intro = {}) {
  const video = (probe?.streams ?? []).find(s => s.codec_type === "video");
  if (!video || video.codec_name !== "vp9" || video.pix_fmt !== "yuv420p") return { ok: false, code: "INTRO_NOT_D3" };
  if (!(video.width > 0 && video.height > 0) || !times?.length) return { ok: false, code: "INTRO_TIMING_UNREADABLE" };
  if (intro.width && intro.height && (video.width !== intro.width || video.height !== intro.height)) return { ok: false, code: "INTRO_CHANGED" };
  const sar = String(video.sample_aspect_ratio || "1:1");
  if (!["1:1", "0:1", "N/A"].includes(sar)) return { ok: false, code: "POSTER_NON_SQUARE_PIXELS" };   // never resized: the poster is the Intro's own size
  const color = posterColor(video);
  if (!color) return { ok: false, code: "POSTER_COLOR_UNSUPPORTED" };
  const duration = Number(probe?.format?.duration || 0);
  const at = Math.max(0, Number(posterMs) || 0) / 1000;
  if (at > 0 && !(at < duration)) return { ok: false, code: "THUMBNAIL_OUTSIDE_INTRO" };
  // the frame a paused player shows at `at`: the last one presented at or before it (times are relative to the first frame) - the share copy's rule
  const start = times[0];
  let frame = 0;
  for (let i = 0; i < times.length && times[i] - start <= at + 1e-6; i += 1) frame = i;
  return { ok: true, frame, width: video.width, height: video.height, ...color };
}

// the exact encoder arguments: ONE decoded frame -> RGB with the chosen matrix (no resize) -> lossy WebP
export function posterArgs(input, output, plan, quality = POSTER.qualities[0]) {
  return ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", input,
    "-vf", `select=eq(n\\,${plan.frame}),scale=in_color_matrix=${plan.matrix}:in_range=${plan.range}:out_range=pc,format=rgb24`,
    "-frames:v", "1", "-fps_mode", "passthrough", "-an", "-c:v", "libwebp", "-quality", String(quality), "-preset", "picture", "-f", "webp", output];
}

export function validatePoster(plan, result, bytes) {
  const v = (result?.streams ?? []).find(s => s.codec_type === "video");
  if (!v || v.codec_name !== "webp") throw new Error("INVALID_POSTER_IMAGE");
  if (v.width !== plan.width || v.height !== plan.height) throw new Error("POSTER_GEOMETRY_CHANGED");
  if (!(bytes > 0) || bytes > POSTER.maxBytes) throw new Error("POSTER_TOO_LARGE");
  return { bytes };
}

export const posterTools = Object.freeze({
  probe: probePoster, times: videoFrameTimes, size: async path => (await stat(path)).size,
  encode: (input, output, plan, quality) => run("ffmpeg", posterArgs(input, output, plan, quality), { maxBuffer: 4 * 1024 * 1024 }),
});

// encode at the measured quality, falling back once when the still would exceed the bucket's limit
export async function encodePoster(input, output, plan, tools = posterTools) {
  for (const quality of POSTER.qualities) {
    await tools.encode(input, output, plan, quality);
    const bytes = await tools.size(output);
    if (bytes <= POSTER.maxBytes) return { quality, bytes };
  }
  throw new Error("POSTER_TOO_LARGE");
}

const storagePath = value => value.split("/").map(encodeURIComponent).join("/");
// service-role upload into the private poster bucket (internal and uncounted, like the share copy). One small object: a plain upload, never an overwrite.
export async function uploadPosterFile({ backend, path, filePath, fetchImpl = fetch }) {
  if (backend.url !== TESTING_PROJECT) throw new Error("TESTING_ONLY");
  const response = await fetchImpl(`${backend.url}/storage/v1/object/${POSTER.bucket}/${storagePath(path)}`, {
    method: "POST", headers: { ...backend.headers("image/webp"), "cache-control": POSTER.cacheControl, "x-upsert": "false" }, body: await readFile(filePath) });
  if (!response.ok) throw new Error(`POSTER_UPLOAD_${response.status}`);
}
export async function deletePosterObject(backend, path, fetchImpl = fetch) {
  if (backend.url !== TESTING_PROJECT) throw new Error("TESTING_ONLY");
  const response = await fetchImpl(`${backend.url}/storage/v1/object/${POSTER.bucket}/${storagePath(path)}`, { method: "DELETE", headers: backend.headers(null) });
  if (!response.ok && response.status !== 404 && response.status !== 400) throw new Error(`POSTER_CLEANUP_${response.status}`);
}

const rpcCaller = (backend, fetchImpl) => async (name, body) => {
  const response = await fetchImpl(`${backend.url}/rest/v1/rpc/${name}`, { method: "POST", headers: backend.headers("application/json"), body: JSON.stringify(body ?? {}) });
  const payload = (response.headers.get("content-type") || "").includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(`WORKER_API_${response.status}:${typeof payload === "string" ? payload : payload?.message || "ERROR"}`);
  return payload;
};

// One queued poster, end to end. `backend` = { url, headers(contentType) } (the worker's service-role credentials, from the Job's secret only).
// -> { processed: false } | { processed: true, posterId, state: "ready" | "failed", code?, metrics }
export async function processOneIntroPoster(backend, { fetchImpl = fetch, tools = posterTools, upload = uploadPosterFile } = {}) {
  const call = rpcCaller(backend, fetchImpl);
  const job = (await call("worker_claim_intro_poster"))?.[0];
  if (!job) { await sweepIntroPosters(backend, { fetchImpl, call }); return { processed: false }; }
  const dir = await mkdtemp(join(tmpdir(), "gamid-intro-poster-"));
  const input = join(dir, "intro-d3.webm"), output = join(dir, "intro-poster.webp");
  const metrics = {};
  try {
    const source = await fetchImpl(`${backend.url}/storage/v1/object/authenticated/intro-media/${storagePath(job.derivative_path)}`, { headers: backend.headers(null) });
    if (!source.ok || !source.body) throw new Error(`INTRO_READ_${source.status}`);
    await pipeline(Readable.fromWeb(source.body), createWriteStream(input));
    if ((await tools.size(input)) !== Number(job.derivative_bytes)) throw new Error("INTRO_CHANGED");
    const plan = posterPlan(await tools.probe(input), await tools.times(input), job.poster_ms, { width: job.intro_width, height: job.intro_height });
    if (!plan.ok) throw new Error(plan.code);
    const started = performance.now();
    const encoded = await encodePoster(input, output, plan, tools);
    metrics.encodingMs = Math.round(performance.now() - started);
    metrics.quality = encoded.quality;
    metrics.bytes = validatePoster(plan, await tools.probe(output), encoded.bytes).bytes;
    await upload({ backend, path: job.poster_path, filePath: output, fetchImpl });
    await call("worker_complete_intro_poster", { candidate_poster_id: job.poster_id, candidate_claim_token: job.claim_token, candidate_path: job.poster_path,
      candidate_bytes: metrics.bytes, candidate_width: plan.width, candidate_height: plan.height });
    return { processed: true, posterId: job.poster_id, state: "ready", metrics };
  } catch (error) {
    const code = String(error?.message || "INTRO_POSTER_FAILED").split(":")[0];
    try { await call("worker_fail_intro_poster", { candidate_poster_id: job.poster_id, candidate_claim_token: job.claim_token, candidate_code: code }); } catch { /* a later claim or the timeout settles the row */ }
    return { processed: true, posterId: job.poster_id, state: "failed", code, metrics };
  } finally {
    try { await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* the container's /tmp is discarded with it */ }
    try { await sweepIntroPosters(backend, { fetchImpl, call }); } catch { /* the next run sweeps */ }
  }
}

// Deletes exactly what the database's storage-driven sweep lists: poster objects that are neither a current READY poster nor the current attempt.
export async function sweepIntroPosters(backend, { fetchImpl = fetch, call = rpcCaller(backend, fetchImpl) } = {}) {
  const rows = await call("worker_intro_poster_sweep", { candidate_limit: 20 });
  let deleted = 0;
  for (const row of rows || []) {
    if (typeof row?.object_path !== "string") continue;
    try { await deletePosterObject(backend, row.object_path, fetchImpl); deleted += 1; } catch { /* retried by the next sweep */ }
  }
  return deleted;
}

// In-image smoke (no credentials, no Storage, no user data): a synthetic Intro through the REAL accepted D3 encode (passed in by intro-worker.mjs), then the
// REAL plan -> encode -> validation, for the first frame and a chosen one. -> { ok, posters: [{ ms, frame, bytes, quality }] }
export async function posterSmoke(encodeD3) {
  const dir = await mkdtemp(join(tmpdir(), "gamid-intro-poster-smoke-"));
  try {
    const source = join(dir, "source.mp4"), input = join(dir, "intro-d3.webm");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-t", "3",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", source], { maxBuffer: 4 * 1024 * 1024 });
    await encodeD3(source, input);
    const probe = await probePoster(input), times = await videoFrameTimes(input), posters = [];
    for (const ms of [0, 2000]) {
      const output = join(dir, `poster-${ms}.webp`);
      const plan = posterPlan(probe, times, ms);
      if (!plan.ok) return { ok: false, code: plan.code };
      const encoded = await encodePoster(input, output, plan);
      validatePoster(plan, await probePoster(output), encoded.bytes);
      posters.push({ ms, frame: plan.frame, matrix: plan.matrix, ...encoded });
    }
    return { ok: true, posterSmoke: true, posters };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
