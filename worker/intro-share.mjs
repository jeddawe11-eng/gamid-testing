// Intro Thumbnail for Discord (Mazen's task 2026-10-26): the Discord share copy of an owner's Intro, in the EXISTING worker image and Job (the same claim /
// complete / fail RPC shape as wall-rendition.mjs). The Intro's D3 derivative is never changed, moved or deleted here; the profile page keeps playing it.
//
// Discord shows a video's FIRST frame before Play. The proven lab technique (2026-10-26, social-lab th01: Discord Web + the Embed Debugger) puts ONE frame of
// the chosen thumbnail in front of the whole Intro and delays the audio by exactly that frame, so Play still runs the complete Intro from 0:00 in sync:
//   claim (per-attempt claim token + object path) -> stream the private D3 derivative to disk -> its frame timestamps -> the frame the owner saw at
//   thumbnail_ms (the last frame presented at or before it, as a paused browser shows it) -> VP9 / Opus at the accepted D3 settings: [that frame][every Intro
//   frame, timing unchanged], audio delayed by one frame -> validate (codec, geometry, every frame shifted by exactly one frame, duration) -> upload (service
//   role, private bucket) -> the database re-checks it is still the owner's current selection and marks READY. Any failure: Discord keeps the unchanged Intro.
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { uploadResumable } from "../dist/account/resumable-upload.js";

const run = promisify(execFile);
export const TESTING_PROJECT = "https://upvtrczefcvigxdyuylw.supabase.co";
export const SHARE = Object.freeze({
  bucket: "intro-share-copies",
  maxBytes: 15 * 1024 * 1024,   // the D3 cap; the bucket and the database enforce it too
  prefixFrames: 1,
  // the accepted D3 encode (worker/intro-worker.mjs encodeD3), unchanged
  video: Object.freeze(["-c:v", "libvpx-vp9", "-crf", "40", "-b:v", "0", "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", "-pix_fmt", "yuv420p"]),
  audio: Object.freeze(["-c:a", "libopus", "-b:a", "32k", "-vbr", "on", "-application", "audio"]),
});
const rate = (value = "0/1") => { const [n, d] = String(value).split("/").map(Number); return d ? n / d : 0; };

export async function probeShare(path) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries",
    "format=format_name,duration,size:stream=index,codec_type,codec_name,width,height,pix_fmt,sample_aspect_ratio,avg_frame_rate,r_frame_rate,sample_rate",
    "-of", "json", path], { maxBuffer: 2 * 1024 * 1024 });
  return JSON.parse(stdout);
}
// presentation times of every video frame, ascending (VP9 WebM: one packet per shown frame)
export async function videoFrameTimes(path) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "json", path], { maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout).packets.map(packet => Number(packet.pts_time)).filter(Number.isFinite).sort((a, b) => a - b);
}

// ffprobe facts + frame times + the owner's chosen time -> the encode plan, or a typed refusal (Discord keeps the unchanged Intro)
export function sharePlan(probe, times, thumbnailMs) {
  const streams = probe?.streams ?? [];
  const video = streams.find(s => s.codec_type === "video"), audio = streams.find(s => s.codec_type === "audio");
  if (!video || video.codec_name !== "vp9") return { ok: false, code: "INTRO_NOT_D3" };
  const fps = rate(video.r_frame_rate) || rate(video.avg_frame_rate);
  const duration = Number(probe?.format?.duration || 0);
  if (!(fps > 0 && fps <= 240) || !(duration > 0) || !times?.length || !(video.width > 0 && video.height > 0)) return { ok: false, code: "INTRO_TIMING_UNREADABLE" };
  const at = Number(thumbnailMs) / 1000;
  if (!(at > 0) || at >= duration) return { ok: false, code: "THUMBNAIL_OUTSIDE_INTRO" };
  // the frame a paused player shows at `at`: the last one presented at or before it (times are relative to the first frame)
  const start = times[0];
  let frame = 0;
  for (let i = 0; i < times.length && times[i] - start <= at + 1e-6; i += 1) frame = i;
  const prefixSeconds = SHARE.prefixFrames / fps;
  const sampleRate = Number(audio?.sample_rate) || 48000;
  const sar = /^[1-9]\d*:[1-9]\d*$/.test(String(video.sample_aspect_ratio || "")) ? video.sample_aspect_ratio.replace(":", "/") : "1";
  return { ok: true, fps, frameRate: video.r_frame_rate, duration, frames: times.length, width: video.width, height: video.height, sar, audio: Boolean(audio),
    frame, prefixSeconds, delaySamples: Math.round(sampleRate * prefixSeconds) };
}

// The exact encoder arguments: the derivative is read twice - once for the chosen frame, once for the whole Intro (its own timing, only shifted by one frame).
// WebM frames carry no duration, so `concat` would start the Intro ON the prefix frame; the Intro is shifted explicitly and the two are merged by timestamp.
export function shareArgs(input, output, plan) {
  const graph = [
    `[0:v]select='eq(n,${plan.frame})',setpts=PTS-STARTPTS,format=yuv420p,setsar=${plan.sar}[p]`,
    `[1:v]setpts=PTS-STARTPTS+(${SHARE.prefixFrames}/(${plan.frameRate}))/TB,format=yuv420p,setsar=${plan.sar}[i]`,
    "[p][i]interleave=nb_inputs=2[v]",
    ...(plan.audio ? [`[1:a]asetpts=PTS-STARTPTS,adelay=${plan.delaySamples}S:all=1[a]`] : []),
  ].join(";");
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-i", input, "-i", input, "-filter_complex", graph,
    "-map", "[v]", ...(plan.audio ? ["-map", "[a]", ...SHARE.audio] : ["-an"]), ...SHARE.video, "-f", "webm", output,
  ];
}

// The produced copy against the plan: every Intro frame must come exactly one frame later, nothing dropped or added. Any difference is a typed failure.
export function validateShare(plan, result, resultTimes, sourceTimes, bytes) {
  const v = (result?.streams ?? []).find(s => s.codec_type === "video"), a = (result?.streams ?? []).find(s => s.codec_type === "audio");
  if (!v || v.codec_name !== "vp9" || v.pix_fmt !== "yuv420p" || !String(result?.format?.format_name).includes("webm")) throw new Error("INVALID_SHARE_VIDEO");
  if (v.width !== plan.width || v.height !== plan.height) throw new Error("SHARE_GEOMETRY_CHANGED");
  if (plan.audio ? a?.codec_name !== "opus" : Boolean(a)) throw new Error("SHARE_AUDIO_NOT_PRESERVED");
  if (!(bytes > 0) || bytes > SHARE.maxBytes) throw new Error("SHARE_TOO_LARGE");
  if (resultTimes.length !== sourceTimes.length + SHARE.prefixFrames) throw new Error("SHARE_FRAMES_CHANGED");
  const tolerance = 0.5 / plan.fps + 0.001;   // encoder time-base rounding + WebM millisecond precision (as the D3 frame-timing check)
  if (Math.abs(resultTimes[SHARE.prefixFrames] - resultTimes[0] - plan.prefixSeconds) > tolerance) throw new Error("SHARE_PREFIX_TIMING");
  const shift = resultTimes[SHARE.prefixFrames] - sourceTimes[0];
  if (sourceTimes.some((time, i) => Math.abs(resultTimes[i + SHARE.prefixFrames] - shift - time) > tolerance)) throw new Error("SHARE_TIMING_CHANGED");
  const duration = Number(result?.format?.duration || 0);
  if (Math.abs(duration - (plan.duration + plan.prefixSeconds)) > Math.max(0.1, 2 / plan.fps)) throw new Error("SHARE_DURATION_CHANGED");
  return { durationMs: Math.round(duration * 1000) };
}

// The real tools; tests replace any of them.
export const shareTools = Object.freeze({
  probe: probeShare, times: videoFrameTimes, size: async path => (await stat(path)).size,
  encode: (input, output, plan) => run("ffmpeg", shareArgs(input, output, plan), { maxBuffer: 4 * 1024 * 1024 }),
});

const storagePath = value => value.split("/").map(encodeURIComponent).join("/");
// service-role upload into the private share bucket (internal and uncounted, like F8-B1's renditions). TESTING only.
export async function uploadShareFile({ backend, path, filePath, fetchImpl = fetch }) {
  if (backend.url !== TESTING_PROJECT) throw new Error("TESTING_ONLY");
  const file = await open(filePath, "r"), { size } = await stat(filePath), headers = backend.headers(null);
  try {
    await uploadResumable({ endpoint: `${backend.url}/storage/v1/upload/resumable`, bucketName: SHARE.bucket, objectName: path, contentType: "video/webm",
      token: headers.Authorization?.replace(/^Bearer\s+/, ""), apikey: headers.apikey, fetcher: fetchImpl, terminateOnFailure: true,
      file: { size, slice: async (start, end, type) => { const buffer = Buffer.alloc(end - start); let at = 0; while (at < buffer.length) { const { bytesRead } = await file.read(buffer, at, buffer.length - at, start + at); if (!bytesRead) throw new Error("SHARE_FILE_TRUNCATED"); at += bytesRead; } return new Blob([buffer], { type }); } } });
  } finally { await file.close(); }
}
export async function deleteShareObject(backend, path, fetchImpl = fetch) {
  if (backend.url !== TESTING_PROJECT) throw new Error("TESTING_ONLY");
  const response = await fetchImpl(`${backend.url}/storage/v1/object/${SHARE.bucket}/${storagePath(path)}`, { method: "DELETE", headers: backend.headers(null) });
  if (!response.ok && response.status !== 404 && response.status !== 400) throw new Error(`SHARE_CLEANUP_${response.status}`);
}

const rpcCaller = (backend, fetchImpl) => async (name, body) => {
  const response = await fetchImpl(`${backend.url}/rest/v1/rpc/${name}`, { method: "POST", headers: backend.headers("application/json"), body: JSON.stringify(body ?? {}) });
  const payload = (response.headers.get("content-type") || "").includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(`WORKER_API_${response.status}:${typeof payload === "string" ? payload : payload?.message || "ERROR"}`);
  return payload;
};

// One queued share copy, end to end. `backend` = { url, headers(contentType) } (the worker's service-role credentials, from the Job's secret only).
// -> { processed: false } | { processed: true, shareId, state: "ready" | "failed", code?, metrics }
export async function processOneIntroShare(backend, { fetchImpl = fetch, tools = shareTools, upload = uploadShareFile } = {}) {
  const call = rpcCaller(backend, fetchImpl);
  const job = (await call("worker_claim_intro_share"))?.[0];
  if (!job) { await sweepIntroShares(backend, { fetchImpl, call }); return { processed: false }; }
  const dir = await mkdtemp(join(tmpdir(), "gamid-intro-share-"));
  const input = join(dir, "intro-d3.webm"), output = join(dir, "intro-share.webm");
  const metrics = {};
  try {
    const source = await fetchImpl(`${backend.url}/storage/v1/object/authenticated/intro-media/${storagePath(job.derivative_path)}`, { headers: backend.headers(null) });
    if (!source.ok || !source.body) throw new Error(`INTRO_READ_${source.status}`);
    await pipeline(Readable.fromWeb(source.body), createWriteStream(input));
    if ((await tools.size(input)) !== Number(job.derivative_bytes)) throw new Error("INTRO_CHANGED");
    const sourceTimes = await tools.times(input);
    const plan = sharePlan(await tools.probe(input), sourceTimes, job.thumbnail_ms);
    if (!plan.ok) throw new Error(plan.code);
    const started = performance.now();
    await tools.encode(input, output, plan);
    metrics.encodingMs = Math.round(performance.now() - started);
    metrics.bytes = await tools.size(output);
    const { durationMs } = validateShare(plan, await tools.probe(output), await tools.times(output), sourceTimes, metrics.bytes);
    await upload({ backend, path: job.share_path, filePath: output, fetchImpl });
    await call("worker_complete_intro_share", { candidate_share_id: job.share_id, candidate_claim_token: job.claim_token, candidate_path: job.share_path, candidate_bytes: metrics.bytes,
      candidate_width: plan.width, candidate_height: plan.height, candidate_duration_ms: durationMs });
    return { processed: true, shareId: job.share_id, state: "ready", metrics };
  } catch (error) {
    const code = String(error?.message || "INTRO_SHARE_FAILED").split(":")[0];
    try { await call("worker_fail_intro_share", { candidate_share_id: job.share_id, candidate_claim_token: job.claim_token, candidate_code: code }); } catch { /* a later claim or the timeout settles the row */ }
    return { processed: true, shareId: job.share_id, state: "failed", code, metrics };
  } finally {
    try { await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* the container's /tmp is discarded with it */ }
    try { await sweepIntroShares(backend, { fetchImpl, call }); } catch { /* the next run sweeps */ }
  }
}

// Deletes exactly what the database's storage-driven sweep lists: share objects that are neither a current READY copy nor the current attempt.
export async function sweepIntroShares(backend, { fetchImpl = fetch, call = rpcCaller(backend, fetchImpl) } = {}) {
  const rows = await call("worker_intro_share_sweep", { candidate_limit: 20 });
  let deleted = 0;
  for (const row of rows || []) {
    if (typeof row?.object_path !== "string") continue;
    try { await deleteShareObject(backend, row.object_path, fetchImpl); deleted += 1; } catch { /* retried by the next sweep */ }
  }
  return deleted;
}

// In-image smoke (no credentials, no Storage, no user data): a synthetic Intro through the REAL accepted D3 encode (passed in by intro-worker.mjs), then the
// REAL plan -> encode -> validation. -> { ok, plan, sizes, encodeMs }
export async function shareSmoke(encodeD3) {
  const dir = await mkdtemp(join(tmpdir(), "gamid-intro-share-smoke-"));
  try {
    const source = join(dir, "source.mp4"), input = join(dir, "intro-d3.webm"), output = join(dir, "intro-share.webm");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "3",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", source], { maxBuffer: 4 * 1024 * 1024 });
    await encodeD3(source, input);
    const sourceTimes = await videoFrameTimes(input);
    const plan = sharePlan(await probeShare(input), sourceTimes, 2000);
    if (!plan.ok) return { ok: false, code: plan.code };
    const started = performance.now();
    await shareTools.encode(input, output, plan);
    const encodeMs = Math.round(performance.now() - started);
    const sizes = [(await stat(input)).size, (await stat(output)).size];
    validateShare(plan, await probeShare(output), await videoFrameTimes(output), sourceTimes, sizes[1]);
    return { ok: true, shareSmoke: true, frame: plan.frame, frames: plan.frames, sizes, encodeMs };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
