// F8-B1 (Mazen's authorization 2026-10-21): internal 1080p visitor renditions of NEW oversized / high-bitrate H.264 Wall MP4s, in the EXISTING worker image and
// Job (same claim / complete / fail RPC boundary as wall-video.mjs). The original upload is never changed, moved or deleted here; owners keep using it.
//
// One rendition, end to end:
//   claim (per-attempt claim token + object path) -> stream the private ORIGINAL to disk -> refuse at once if libvmaf is missing (the gate is never bypassed)
//   -> ffprobe: H.264, 8-bit 4:2:0, SDR, no alpha, readable timing -> encode H.264 High CRF 23 `slow`, 2 s GOP, faststart, within 1920x1080 (either orientation,
//   rotation applied), the SOURCE frame rate (passthrough) and EVERY audio stream kept (copied bit for bit when browser-playable, else AAC)
//   -> validate (codec, size, timing, audio streams; copied audio is compared packet for packet) -> VMAF against the source scaled to the rendition's size,
//   frames paired by index -> gate: mean >= 95, 5th percentile >= 90, at least 25% smaller -> only then upload (service role, private bucket) -> the database
//   re-checks the gate and marks READY. Any refusal or failure: nothing is READY and visitors keep the original; a written object is removed by the sweep.
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { uploadResumable } from "../dist/account/resumable-upload.js";
import { topLevelBoxes } from "./wall-video.mjs";

const run = promisify(execFile);
export const TESTING_PROJECT = "https://upvtrczefcvigxdyuylw.supabase.co";
export const RENDITION = Object.freeze({
  bucket: "wall-video-renditions",
  box: Object.freeze([1920, 1080]),
  crf: 23, preset: "slow", gopSeconds: 2, threads: 2,
  minVmafMean: 95, minVmafP5: 90, maxRatio: 0.75, maxBytes: 39321600,
  copyAudio: Object.freeze(["aac", "mp3", "opus"]),
});
const HDR = ["smpte2084", "arib-std-b67"];
const rate = (value = "0/1") => { const [n, d] = String(value).split("/").map(Number); return d ? n / d : 0; };
const even = n => Math.max(2, Math.floor(n / 2) * 2);

export async function probeMedia(path) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries",
    "format=duration,size:stream=index,codec_type,codec_name,profile,width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_frames,color_transfer:stream_side_data=rotation:stream_tags=rotate",
    "-of", "json", path], { maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

// ffprobe facts -> the encode plan, or a typed refusal (the source is kept for visitors as it is)
export function renditionPlan(probe) {
  const streams = probe?.streams ?? [];
  const video = streams.find(s => s.codec_type === "video");
  if (!video || video.codec_name !== "h264") return { ok: false, code: "SOURCE_NOT_H264" };
  if (HDR.includes(video.color_transfer)) return { ok: false, code: "SOURCE_HDR_UNSUPPORTED" };
  if (/a/.test(String(video.pix_fmt).replace(/^yuvj?/, ""))) return { ok: false, code: "SOURCE_ALPHA_UNSUPPORTED" };
  if (!["yuv420p", "yuvj420p"].includes(video.pix_fmt)) return { ok: false, code: "SOURCE_FORMAT_UNSUPPORTED" };
  const fps = rate(video.avg_frame_rate) || rate(video.r_frame_rate);
  const duration = Number(probe?.format?.duration || 0);
  if (!(fps > 0) || !(duration > 0) || !(video.width > 0 && video.height > 0)) return { ok: false, code: "SOURCE_TIMING_UNREADABLE" };
  const rotation = Number(video.side_data_list?.find(d => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  const quarter = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  const [dw, dh] = quarter ? [video.height, video.width] : [video.width, video.height];   // the displayed size (ffmpeg applies the rotation when it decodes)
  const [bw, bh] = dw >= dh ? RENDITION.box : [RENDITION.box[1], RENDITION.box[0]];
  const scale = Math.min(1, bw / dw, bh / dh);
  const audio = streams.filter(s => s.codec_type === "audio").map((s, n) => ({ n, codec: s.codec_name, copy: RENDITION.copyAudio.includes(s.codec_name) }));
  const frames = Number(video.nb_frames) > 0 ? Number(video.nb_frames) : Math.round(duration * fps);
  return { ok: true, fps, duration, frames, rotation, display: [dw, dh], target: [even(dw * scale), even(dh * scale)], gop: Math.max(1, Math.round(RENDITION.gopSeconds * fps)), audio };
}

// The exact encoder arguments. Video: scale only DOWN into the box; frame rate passthrough. Audio: every stream mapped; copied when browser-playable.
export function renditionArgs(input, output, plan) {
  const [tw, th] = plan.target;
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-threads", String(RENDITION.threads), "-i", input,
    "-map", "0:v:0", ...plan.audio.flatMap(a => ["-map", `0:a:${a.n}`]),
    "-vf", `scale=${tw}:${th}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", RENDITION.preset, "-crf", String(RENDITION.crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", String(plan.gop),
    "-threads", String(RENDITION.threads), "-fps_mode", "passthrough",
    ...plan.audio.flatMap(a => (a.copy ? [`-c:a:${a.n}`, "copy"] : [`-c:a:${a.n}`, "aac", `-b:a:${a.n}`, "192k"])),
    "-sn", "-dn", "-map_metadata", "0", "-movflags", "+faststart", "-f", "mp4", output,
  ];
}

// Mazen's choice (2026-10-21): VMAF is measured with a SEPARATE pinned static FFmpeg that has libvmaf (worker/Dockerfile, GAMID_VMAF_FFMPEG); every encode
// (Intro F2, HEVC conversion, these renditions) keeps the image's Debian FFmpeg. Without that binary the gate cannot run, so nothing becomes READY.
export const VMAF_FFMPEG = process.env.GAMID_VMAF_FFMPEG || "ffmpeg";
export async function hasVmaf() {
  try { const { stdout } = await run(VMAF_FFMPEG, ["-hide_banner", "-filters"], { maxBuffer: 4 * 1024 * 1024 }); return /\slibvmaf\s/.test(stdout); } catch { return false; }
}

const filterPath = p => p.replace(/\\/g, "/").replace(/:/g, "\\:");
// VMAF of the rendition against the source scaled (lanczos) to the rendition's own size; frames paired by INDEX on both inputs (timestamp pairing mis-pairs
// frames on real files - F8-B study). -> { mean, p5, frames }
export async function measureVmaf(source, rendition, plan, dir) {
  const [tw, th] = plan.target, fps = plan.fps.toFixed(6), log = join(dir, "vmaf.json");
  await run(VMAF_FFMPEG, ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", rendition, "-i", source, "-lavfi",
    `[0:v]setsar=1,format=yuv420p,settb=AVTB,setpts=N/(${fps}*TB)[d];[1:v]scale=${tw}:${th}:flags=lanczos,setsar=1,format=yuv420p,settb=AVTB,setpts=N/(${fps}*TB)[r];[d][r]libvmaf=log_fmt=json:log_path='${filterPath(log)}':n_threads=${RENDITION.threads}:shortest=1`,
    "-f", "null", "-"], { maxBuffer: 16 * 1024 * 1024 });
  const scores = JSON.parse(await readFile(log, "utf8")).frames.map(f => f.metrics.vmaf).sort((a, b) => a - b);
  if (!scores.length) throw new Error("VMAF_NO_FRAMES");
  return { mean: scores.reduce((a, b) => a + b, 0) / scores.length, p5: scores[Math.floor(scores.length * 0.05)], frames: scores.length };
}

// SHA-256 of every packet of every audio stream: copied audio must be bit-identical
export async function audioHashes(path) {
  const { stdout } = await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", path, "-map", "0:a?", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "-"], { maxBuffer: 1024 * 1024 });
  return stdout.trim().split(/\r?\n/).filter(Boolean).map(line => line.replace(/^\d+,/, ""));
}

// The produced file against the plan. Any difference is a typed failure (the source stays the visitors' video).
export function validateRendition(plan, result, boxes) {
  const v = (result?.streams ?? []).find(s => s.codec_type === "video");
  if (!v || v.codec_name !== "h264" || v.pix_fmt !== "yuv420p") throw new Error("RENDITION_NOT_H264");
  if (v.width !== plan.target[0] || v.height !== plan.target[1]) throw new Error("RENDITION_SIZE_UNEXPECTED");
  if (Math.max(v.width, v.height) > RENDITION.box[0] || Math.min(v.width, v.height) > RENDITION.box[1]) throw new Error("RENDITION_TOO_LARGE");
  const audio = (result.streams ?? []).filter(s => s.codec_type === "audio");
  if (audio.length !== plan.audio.length) throw new Error("AUDIO_NOT_PRESERVED");
  const duration = Number(result?.format?.duration || 0), fps = rate(v.avg_frame_rate) || rate(v.r_frame_rate);
  if (Math.abs(duration - plan.duration) > Math.max(0.25, 2 / plan.fps)) throw new Error("RENDITION_DURATION_CHANGED");
  if (Math.abs(fps - plan.fps) > Math.max(0.05, plan.fps * 0.01)) throw new Error("RENDITION_FRAME_RATE_CHANGED");
  const moov = boxes.indexOf("moov"), mdat = boxes.indexOf("mdat");
  if (boxes[0] !== "ftyp" || moov < 0 || mdat < 0 || moov > mdat) throw new Error("RENDITION_NOT_FAST_START");
  return true;
}

// -> { ok: true } | { ok: false, code }. The same values are checked again by the database before anything is READY.
export function renditionGate({ vmaf, bytes, sourceBytes, frames, plan }) {
  if (!(frames >= Math.floor(plan.frames * 0.98))) return { ok: false, code: "VMAF_FRAME_MISMATCH", state: "failed" };
  if (!(vmaf.mean >= RENDITION.minVmafMean) || !(vmaf.p5 >= RENDITION.minVmafP5)) return { ok: false, code: "QUALITY_GATE", state: "rejected" };
  if (!(bytes > 0) || bytes > RENDITION.maxBytes || bytes * 4 > sourceBytes * 3) return { ok: false, code: "INSUFFICIENT_SAVINGS", state: "rejected" };
  return { ok: true };
}

// The real tools; tests replace any of them.
export const renditionTools = Object.freeze({
  hasVmaf, probe: probeMedia, encode: (input, output, plan) => run("ffmpeg", renditionArgs(input, output, plan), { maxBuffer: 4 * 1024 * 1024 }),
  vmaf: measureVmaf, audioHashes, boxes: topLevelBoxes, size: async path => (await stat(path)).size,
});

const storagePath = value => value.split("/").map(encodeURIComponent).join("/");
// service-role upload into the private renditions bucket (the usage gateway is for owner-counted objects; this one is internal and uncounted). TESTING only.
export async function uploadRenditionFile({ backend, path, filePath, fetchImpl = fetch }) {
  if (backend.url !== TESTING_PROJECT) throw new Error("TESTING_ONLY");
  const file = await open(filePath, "r"), { size } = await stat(filePath), headers = backend.headers(null);
  try {
    await uploadResumable({ endpoint: `${backend.url}/storage/v1/upload/resumable`, bucketName: RENDITION.bucket, objectName: path, contentType: "video/mp4",
      token: headers.Authorization?.replace(/^Bearer\s+/, ""), apikey: headers.apikey, fetcher: fetchImpl, terminateOnFailure: true,
      file: { size, slice: async (start, end, type) => { const buffer = Buffer.alloc(end - start); let at = 0; while (at < buffer.length) { const { bytesRead } = await file.read(buffer, at, buffer.length - at, start + at); if (!bytesRead) throw new Error("RENDITION_FILE_TRUNCATED"); at += bytesRead; } return new Blob([buffer], { type }); } } });
  } finally { await file.close(); }
}
export async function deleteRenditionObject(backend, path, fetchImpl = fetch) {
  if (backend.url !== TESTING_PROJECT) throw new Error("TESTING_ONLY");
  const response = await fetchImpl(`${backend.url}/storage/v1/object/${RENDITION.bucket}/${storagePath(path)}`, { method: "DELETE", headers: backend.headers(null) });
  if (!response.ok && response.status !== 404 && response.status !== 400) throw new Error(`RENDITION_CLEANUP_${response.status}`);
}

// One queued rendition, end to end. `backend` = { url, headers(contentType) } (the worker's service-role credentials, from the Job's secret only).
// -> { processed: false } | { processed: true, renditionId, state: "ready" | "rejected" | "failed", code?, metrics }
export async function processOneWallVideoRendition(backend, { fetchImpl = fetch, tools = renditionTools, upload = uploadRenditionFile } = {}) {
  const call = async (name, body) => {
    const response = await fetchImpl(`${backend.url}/rest/v1/rpc/${name}`, { method: "POST", headers: backend.headers("application/json"), body: JSON.stringify(body ?? {}) });
    const payload = (response.headers.get("content-type") || "").includes("json") ? await response.json() : await response.text();
    if (!response.ok) throw new Error(`WORKER_API_${response.status}:${typeof payload === "string" ? payload : payload?.message || "ERROR"}`);
    return payload;
  };
  const job = (await call("worker_claim_wall_video_rendition"))?.[0];
  if (!job) { await sweepWallVideoRenditions(backend, { fetchImpl, call }); return { processed: false }; }
  const finish = (state, code, metrics = {}) => call("worker_finish_wall_video_rendition", { candidate_rendition_id: job.rendition_id, candidate_claim_token: job.claim_token, candidate_state: state, candidate_code: code, candidate_vmaf_mean: metrics.vmaf?.mean ?? null, candidate_vmaf_p5: metrics.vmaf?.p5 ?? null, candidate_bytes: metrics.bytes ?? null });
  const dir = await mkdtemp(join(tmpdir(), "gamid-rendition-"));
  const input = join(dir, "source.mp4"), output = join(dir, "rendition.mp4");
  const metrics = {};
  try {
    const source = await fetchImpl(`${backend.url}/storage/v1/object/authenticated/wall-video/${storagePath(job.source_path)}`, { headers: backend.headers(null) });
    if (!source.ok || !source.body) throw new Error(`SOURCE_READ_${source.status}`);
    await pipeline(Readable.fromWeb(source.body), createWriteStream(input));
    if ((await tools.size(input)) !== Number(job.source_bytes)) throw new Error("SOURCE_CHANGED");
    if (!(await tools.hasVmaf())) { await finish("failed", "VMAF_UNAVAILABLE"); return { processed: true, renditionId: job.rendition_id, state: "failed", code: "VMAF_UNAVAILABLE", metrics }; }
    const plan = renditionPlan(await tools.probe(input));
    if (!plan.ok) { await finish("rejected", plan.code); return { processed: true, renditionId: job.rendition_id, state: "rejected", code: plan.code, metrics }; }
    const started = performance.now();
    await tools.encode(input, output, plan);
    metrics.encodingMs = Math.round(performance.now() - started);
    validateRendition(plan, await tools.probe(output), await tools.boxes(output));
    // copied audio must be bit-identical, stream for stream
    const copied = plan.audio.filter(a => a.copy).map(a => a.n);
    if (copied.length) {
      const [before, after] = [await tools.audioHashes(input), await tools.audioHashes(output)];
      if (copied.some(n => !before[n] || before[n] !== after[n])) throw new Error("AUDIO_NOT_PRESERVED");
      metrics.audio = "identical";
    } else metrics.audio = plan.audio.length ? "re-encoded" : "none";
    metrics.vmaf = await tools.vmaf(input, output, plan, dir);
    metrics.bytes = await tools.size(output);
    const gate = renditionGate({ vmaf: metrics.vmaf, bytes: metrics.bytes, sourceBytes: Number(job.source_bytes), frames: metrics.vmaf.frames, plan });
    if (!gate.ok) { await finish(gate.state, gate.code, metrics); return { processed: true, renditionId: job.rendition_id, state: gate.state, code: gate.code, metrics }; }
    await upload({ backend, path: job.rendition_path, filePath: output, fetchImpl });
    await call("worker_complete_wall_video_rendition", { candidate_rendition_id: job.rendition_id, candidate_claim_token: job.claim_token, candidate_path: job.rendition_path, candidate_bytes: metrics.bytes, candidate_width: plan.target[0], candidate_height: plan.target[1], candidate_vmaf_mean: Number(metrics.vmaf.mean.toFixed(3)), candidate_vmaf_p5: Number(metrics.vmaf.p5.toFixed(3)) });
    return { processed: true, renditionId: job.rendition_id, state: "ready", metrics };
  } catch (error) {
    const code = String(error?.message || "RENDITION_FAILED").split(":")[0];
    try { await finish("failed", code, metrics); } catch { /* keep the original failure; a later claim or the timeout settles the row */ }
    return { processed: true, renditionId: job.rendition_id, state: "failed", code, metrics };
  } finally {
    try { await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* the container's /tmp is discarded with it */ }
    try { await sweepWallVideoRenditions(backend, { fetchImpl, call }); } catch { /* the next run sweeps */ }
  }
}

// In-image smoke (no credentials, no Storage, no user data): a synthetic 3 s 4K30 clip with AAC audio through the REAL plan -> encode -> validation -> audio
// hashes -> VMAF -> gate, with the image's encoder and the VMAF-only binary. -> { ok, vmafAvailable, target, sizes, vmaf, audioIdentical, gate, encodeMs }
export async function renditionSmoke() {
  const dir = await mkdtemp(join(tmpdir(), "gamid-rendition-smoke-"));
  try {
    const input = join(dir, "source.mp4"), output = join(dir, "rendition.mp4");
    const vmafAvailable = await hasVmaf();
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc2=size=3840x2160:rate=30,gblur=sigma=6", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "3",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", input], { maxBuffer: 4 * 1024 * 1024 });
    const plan = renditionPlan(await probeMedia(input));
    if (!plan.ok) return { ok: false, vmafAvailable, code: plan.code };
    const started = performance.now();
    await renditionTools.encode(input, output, plan);
    const encodeMs = Math.round(performance.now() - started);
    validateRendition(plan, await probeMedia(output), await topLevelBoxes(output));
    const [before, after] = [await audioHashes(input), await audioHashes(output)];
    const audioIdentical = before.length === 1 && after.length === 1 && before[0] === after[0];
    const vmaf = vmafAvailable ? await measureVmaf(input, output, plan, dir) : null;
    const sizes = [(await stat(input)).size, (await stat(output)).size];
    const gate = vmaf ? renditionGate({ vmaf, bytes: sizes[1], sourceBytes: sizes[0], frames: vmaf.frames, plan }) : { ok: false, code: "VMAF_UNAVAILABLE" };
    return { ok: vmafAvailable && audioIdentical && gate.ok === true, renditionSmoke: true, vmafAvailable, target: plan.target, sizes, vmaf, audioIdentical, gate, encodeMs };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

// Deletes exactly what the database's storage-driven sweep lists: rendition objects that are not a live READY rendition nor the current attempt.
export async function sweepWallVideoRenditions(backend, { fetchImpl = fetch, call }) {
  const rows = await call("worker_wall_video_rendition_sweep", { candidate_limit: 20 });
  let deleted = 0;
  for (const row of rows || []) {
    if (typeof row?.object_path !== "string") continue;
    try { await deleteRenditionObject(backend, row.object_path, fetchImpl); deleted += 1; } catch { /* retried by the next sweep */ }
  }
  return deleted;
}
