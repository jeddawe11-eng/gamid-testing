// Wall background video: HEVC/H.265 -> H.264 transcoding in the EXISTING Intro worker image (same container, same Cloud Run Job, same service-role-only RPC
// boundary - see README.md). The worker never takes a path, owner or size from a browser: the job row (created by the wall-asset-register Edge Function after it
// inspected the stored file) is the only input.
//
// Codec conversion ONLY. The derivative keeps the source's EXACT width and height (no scale / crop / pad filter exists anywhere below), its aspect, frame rate and
// duration; it is H.264 High, yuv420p, MP4 with the index first (fast start), with no audio (a Wall background always plays muted). ffprobe then validates the
// result and ANY difference in width / height fails the job - there is no lower-resolution fallback. The database checks the dimensions a second time.
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

export const WALL_VIDEO_TRANSCODE = Object.freeze({
  maxSourceBytes: 50 * 1024 * 1024,          // the user's upload limit (unchanged)
  maxDerivativeBytes: 200 * 1024 * 1024,     // H.264 is larger than HEVC; the wall-video-derived bucket and the database hold the same cap
  maxSide: 4096,                             // 4K (3840 x 2160 / 4096 x 2160) and anything smaller; the Edge Function refuses larger before a job exists
  maxPixelFrames: 3840 * 2160 * 30 * 120,    // decode + encode budget: 120 s of 4K30 fits the Job's 10-minute timeout with room to spare
  threads: 2,                                // the Cloud Run Job has 2 vCPU
});

// The exact encoder arguments (codec conversion only - NO -vf / -s / scale / crop / pad).
export const transcodeArgs = (input, output) => [
  "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
  "-threads", String(WALL_VIDEO_TRANSCODE.threads), "-i", input,
  "-map", "0:v:0",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p",
  "-threads", String(WALL_VIDEO_TRANSCODE.threads), "-x264-params", "rc-lookahead=20",
  "-fps_mode", "passthrough",
  "-an", "-sn", "-dn", "-map_metadata", "-1",
  "-movflags", "+faststart", "-f", "mp4", output,
];

const rate = (value = "0/1") => { const [n, d] = String(value).split("/").map(Number); return d ? n / d : 0; };
export async function probeVideo(path) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries",
    "format=format_name,duration,size:stream=index,codec_type,codec_name,profile,width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_frames,sample_aspect_ratio,color_transfer",
    "-of", "json", path], { maxBuffer: 2 * 1024 * 1024 });
  const data = JSON.parse(stdout);
  const video = data.streams.find(stream => stream.codec_type === "video");
  const audio = data.streams.find(stream => stream.codec_type === "audio");
  return { data, video, audio, duration: Number(data.format.duration || video?.duration || 0), size: Number(data.format.size || 0), fps: rate(video?.avg_frame_rate || video?.r_frame_rate), formatName: String(data.format.format_name || "") };
}

// The top-level boxes of an MP4 file, read from their headers only.
export async function topLevelBoxes(path) {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const types = [];
    let offset = 0;
    const head = Buffer.alloc(16);
    while (offset + 8 <= size && types.length < 64) {
      await handle.read(head, 0, 16, offset);
      let boxSize = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (boxSize === 1) boxSize = Number(head.readBigUInt64BE(8));
      else if (boxSize === 0) boxSize = size - offset;
      if (boxSize < 8) break;
      types.push(type);
      offset += boxSize;
    }
    return types;
  } finally { await handle.close(); }
}

const sar = video => (!video?.sample_aspect_ratio || video.sample_aspect_ratio === "0:1" || video.sample_aspect_ratio === "N/A" ? "1:1" : video.sample_aspect_ratio);

// -> { source, result, encodingMs } or throws a typed code
export async function transcodeWallBackground(input, output, { expectedWidth, expectedHeight } = {}) {
  const sourceStat = await stat(input);
  if (sourceStat.size > WALL_VIDEO_TRANSCODE.maxSourceBytes) throw new Error("SOURCE_TOO_LARGE");
  const source = await probeVideo(input);
  const v = source.video;
  if (!v || !["hevc", "h265"].includes(v.codec_name)) throw new Error("SOURCE_NOT_HEVC");
  if (!(v.width >= 1 && v.height >= 1 && v.width <= WALL_VIDEO_TRANSCODE.maxSide && v.height <= WALL_VIDEO_TRANSCODE.maxSide)) throw new Error("SOURCE_SIZE_UNSUPPORTED");
  if ((expectedWidth && v.width !== expectedWidth) || (expectedHeight && v.height !== expectedHeight)) throw new Error("SOURCE_DOES_NOT_MATCH_JOB");
  if (["smpte2084", "arib-std-b67"].includes(v.color_transfer)) throw new Error("SOURCE_HDR_UNSUPPORTED");   // an 8-bit SDR H.264 of an HDR source would look wrong
  if (!(source.duration > 0) || !(source.fps > 0)) throw new Error("SOURCE_TIMING_UNREADABLE");
  if (v.width * v.height * source.duration * source.fps > WALL_VIDEO_TRANSCODE.maxPixelFrames * 1.01) throw new Error("SOURCE_TOO_LONG");
  const started = performance.now();
  await run("ffmpeg", transcodeArgs(input, output), { maxBuffer: 4 * 1024 * 1024 });
  const encodingMs = Math.round(performance.now() - started);
  const result = await probeVideo(output);
  validateDerivative(source, result, await topLevelBoxes(output));
  return { source, result, encodingMs };
}

// ffprobe facts of the derivative against the source. Any failure is a typed error; a changed width or height is ALWAYS a failure.
export function validateDerivative(source, result, boxes) {
  const s = source.video, r = result.video;
  if (!r || r.codec_name !== "h264") throw new Error("DERIVATIVE_NOT_H264");
  if (r.pix_fmt !== "yuv420p") throw new Error("DERIVATIVE_PIXEL_FORMAT");
  if (!["High", "Main", "Constrained Baseline"].includes(r.profile)) throw new Error("DERIVATIVE_PROFILE");
  if (!result.formatName.includes("mp4")) throw new Error("DERIVATIVE_NOT_MP4");
  if (r.width !== s.width || r.height !== s.height) throw new Error("DERIVATIVE_RESOLUTION_CHANGED");
  if (sar(r) !== sar(s)) throw new Error("DERIVATIVE_ASPECT_CHANGED");
  if (result.audio) throw new Error("DERIVATIVE_HAS_AUDIO");
  if (Math.abs(result.fps - source.fps) > 0.02) throw new Error("DERIVATIVE_FRAME_RATE_CHANGED");
  if (Math.abs(result.duration - source.duration) > Math.max(0.25, 2 / source.fps)) throw new Error("DERIVATIVE_DURATION_CHANGED");
  if (!(result.size > 0) || result.size > WALL_VIDEO_TRANSCODE.maxDerivativeBytes) throw new Error("DERIVATIVE_TOO_LARGE");
  const moov = boxes.indexOf("moov"), mdat = boxes.indexOf("mdat");
  if (boxes[0] !== "ftyp" || moov < 0 || mdat < 0 || moov > mdat) throw new Error("DERIVATIVE_NOT_FAST_START");
  return true;
}

const storagePath = value => value.split("/").map(encodeURIComponent).join("/");

// One queued wall video job, end to end. `backend` = { url, headers(contentType) } (the worker's service-role credentials, from the Job's secret only).
// -> { processed: false } | { processed: true, jobId, assetId, encodingMs } ; a failure marks the job failed (nothing is attached to any Wall) and rethrows.
export async function processOneWallVideoJob(backend, { fetchImpl = fetch, transcode = transcodeWallBackground } = {}) {
  const call = async (name, body) => {
    const response = await fetchImpl(`${backend.url}/rest/v1/rpc/${name}`, { method: "POST", headers: backend.headers("application/json"), body: JSON.stringify(body ?? {}) });
    const payload = (response.headers.get("content-type") || "").includes("json") ? await response.json() : await response.text();
    if (!response.ok) throw new Error(`WORKER_API_${response.status}:${typeof payload === "string" ? payload : payload?.message || "ERROR"}`);
    return payload;
  };
  const job = (await call("worker_claim_wall_video_job"))?.[0];
  if (!job) { await cleanupWallVideo(backend, { fetchImpl, call }); return { processed: false }; }
  const dir = await mkdtemp(join(tmpdir(), "gamid-wall-video-"));
  const input = join(dir, "source.mp4"), output = join(dir, "background.h264.mp4");
  let outgoing = null;
  try {
    // stream the private source to disk (never held whole in memory)
    const source = await fetchImpl(`${backend.url}/storage/v1/object/authenticated/wall-video/${storagePath(job.source_path)}`, { headers: backend.headers(null) });
    if (!source.ok || !source.body) throw new Error(`SOURCE_READ_${source.status}`);
    await pipeline(Readable.fromWeb(source.body), createWriteStream(input));
    const { result, encodingMs } = await transcode(input, output, { expectedWidth: job.source_width, expectedHeight: job.source_height });
    // stream the derivative into the owner's folder of the private derived bucket
    const { size } = await stat(output);
    outgoing = createReadStream(output);
    const uploaded = await fetchImpl(`${backend.url}/storage/v1/object/wall-video-derived/${storagePath(job.derivative_path)}`, {
      method: "POST", headers: { ...backend.headers("video/mp4"), "Content-Length": String(size), "x-upsert": "true", "cache-control": "3600" },
      body: Readable.toWeb(outgoing), duplex: "half",
    });
    if (!uploaded.ok) throw new Error(`DERIVATIVE_UPLOAD_${uploaded.status}`);
    const completed = await call("worker_complete_wall_video_job", { candidate_job_id: job.job_id, candidate_derivative_path: job.derivative_path, candidate_bytes: size, candidate_width: result.video.width, candidate_height: result.video.height });
    await cleanupWallVideo(backend, { fetchImpl, call });
    return { processed: true, jobId: job.job_id, assetId: completed?.[0]?.asset_id ?? null, encodingMs, width: result.video.width, height: result.video.height, bytes: size };
  } catch (error) {
    try { await call("worker_fail_wall_video_job", { candidate_job_id: job.job_id, candidate_failure_code: String(error.message).split(":")[0] }); } catch { /* keep the original failure */ }
    try { await cleanupWallVideo(backend, { fetchImpl, call }); } catch { /* the next run cleans up */ }
    throw error;
  } finally {
    outgoing?.destroy();
    // the temporary copies never outlive the run (and a cleanup problem never hides the real result)
    try { await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* the container's /tmp is discarded with it */ }
  }
}

// Deletes exactly what the database lists: the source of every finished job, and the partial derivative of a failed one - never a ready asset.
export async function cleanupWallVideo(backend, { fetchImpl = fetch, call }) {
  const rows = await call("worker_wall_video_cleanup_candidates", { candidate_limit: 20 });
  for (const row of rows || []) {
    const remove = async (bucket, path) => {
      if (!path) return false;
      const response = await fetchImpl(`${backend.url}/storage/v1/object/${bucket}/${storagePath(path)}`, { method: "DELETE", headers: backend.headers(null) });
      return response.ok || response.status === 404 || response.status === 400;   // already gone counts as deleted
    };
    const sourceDeleted = await remove("wall-video", row.source_path);
    const derivativeDeleted = await remove("wall-video-derived", row.derivative_path);
    await call("worker_confirm_wall_video_cleanup", { candidate_job_id: row.job_id, candidate_source_deleted: sourceDeleted, candidate_derivative_deleted: derivativeDeleted });
  }
}
