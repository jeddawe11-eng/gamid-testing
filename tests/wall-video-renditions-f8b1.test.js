// F8-B1 (Mazen's authorization 2026-10-21): conditional internal 1080p visitor renditions - eligibility (Edge Function), the worker's plan / encode arguments /
// validation / gate and its whole job with every failure path, the visitor page's original-versus-rendition choice, and the dispatcher. The database half is
// tests/wall-video-renditions-f8b1-db.test.js; real FFmpeg encodes are in tests/wall-video-renditions-f8b1-native.test.js (opt-in).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { handleWallAssetRegister, inspectMp4, renditionEligibility, RENDITION_RULES } from "../supabase/functions/_shared/wall-assets.js";
import { renditionPlan, renditionArgs, renditionGate, validateRendition, processOneWallVideoRendition, uploadRenditionFile, deleteRenditionObject, RENDITION } from "../worker/wall-rendition.mjs";
import { validateWebhookPayload } from "../worker/intro-dispatcher.mjs";
import { preparePublicWall } from "../dist/public/public-wall.js";

const text = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MB = 1024 * 1024;

// ---------- 1. eligibility (the server's own moov reading) ----------
test("F8-B1 eligibility: oversized (either orientation) or above 8 Mbit/s at 1080p30-equivalent; efficient, small, unreadable and too-long sources are skipped", () => {
  const at = (width, height, mbps, seconds, fps) => ({ width, height, bytes: Math.round(mbps * 1e6 / 8 * seconds), duration: seconds, samples: Math.round(fps * seconds) });
  assert.deepEqual(renditionEligibility(at(3840, 2160, 36, 11, 30)), { eligible: true, reason: "OVERSIZED" }, "the 50 MB 4K smoke-test upload");
  assert.deepEqual(renditionEligibility(at(2160, 3840, 20, 10, 30)), { eligible: true, reason: "OVERSIZED" }, "portrait 4K");
  assert.deepEqual(renditionEligibility(at(2560, 1080, 6, 10, 30)), { eligible: true, reason: "OVERSIZED" }, "ultrawide beyond 1920");
  assert.deepEqual(renditionEligibility(at(1920, 1080, 12, 12, 30)), { eligible: true, reason: "HIGH_BITRATE" });
  assert.deepEqual(renditionEligibility(at(1920, 1080, 2.5, 32, 30)), { eligible: false, reason: "EFFICIENT" }, "the Wall's existing 1080p backgrounds are left alone");
  assert.deepEqual(renditionEligibility(at(1920, 1080, 12, 10, 60)), { eligible: false, reason: "EFFICIENT" }, "60 fps doubles the allowance (16 Mbit/s)");
  assert.deepEqual(renditionEligibility(at(1280, 720, 5, 10, 30)), { eligible: true, reason: "HIGH_BITRATE" }, "720p30 allowance is 3.56 Mbit/s");
  // the authorized rule scales the allowance linearly by pixels: 848x360 gets 1.18 Mbit/s, so the Wall's 1.5 Mbit/s clip IS a candidate (the F8-B study measured
  // its re-encodes at VMAF 93-94.6, so the quality gate keeps the original - a few CPU-seconds, never a visible change)
  assert.deepEqual(renditionEligibility(at(848, 360, 1.5, 30, 30)), { eligible: true, reason: "HIGH_BITRATE" });
  assert.deepEqual(renditionEligibility(at(848, 360, 1.0, 30, 30)), { eligible: false, reason: "EFFICIENT" });
  assert.equal(renditionEligibility({ width: 3840, height: 2160, bytes: MB - 1, duration: 1, samples: 30 }).reason, "SMALL");
  assert.equal(renditionEligibility({ width: 3840, height: 2160, bytes: 40 * MB, duration: null, samples: 330 }).reason, "TIMING_UNREADABLE");
  assert.equal(renditionEligibility(at(3840, 2160, 5, 61, 30)).reason, "TOO_LONG");
  assert.deepEqual(RENDITION_RULES, { boxLong: 1920, boxShort: 1080, bitsPerSecondAt1080p30: 8_000_000, minBytes: MB, maxPixelFrames: 3840 * 2160 * 30 * 60 });
});

// ---------- 2. the Edge Function: register as before, then queue (best effort) ----------
const USER = "11111111-1111-4111-8111-111111111111", PATH = `${USER}/22222222-2222-4222-8222-222222222222.mp4`;
const padded = (bytes, total) => { const pad = total - bytes.length, box = Buffer.alloc(pad); box.writeUInt32BE(pad, 0); box.write("free", 4, "latin1"); return Buffer.concat([bytes, box]); };
function storage(bytes, { renditionStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? "GET", body: typeof options.body === "string" ? JSON.parse(options.body) : null });
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: USER }), { status: 200 });
    if (url.includes("/rpc/register_verified_wall_asset")) { const b = JSON.parse(options.body); return new Response(JSON.stringify([{ asset_id: "33333333-3333-4333-8333-333333333333", storage_path: b.candidate_path, mime_type: b.candidate_mime, width: b.candidate_width, height: b.candidate_height }]), { status: 200 }); }
    if (url.includes("/rpc/create_wall_video_rendition")) return new Response(JSON.stringify(renditionStatus === 200 ? [{ rendition_id: "r", state: "pending" }] : { message: "RENDITION_NOT_ELIGIBLE" }), { status: renditionStatus });
    if (options.method === "DELETE") return new Response("{}", { status: 200 });
    const m = /bytes=(\d+)-(\d+)/.exec(options.headers?.Range ?? "");
    const [from, to] = m ? [Number(m[1]), Math.min(Number(m[2]), bytes.length - 1)] : [0, bytes.length - 1];
    return new Response(bytes.subarray(from, to + 1), { status: 206, headers: { "content-range": `bytes ${from}-${to}/${bytes.length}` } });
  };
  return { calls, fetchImpl };
}
const request = () => new Request("https://x/functions/v1/wall-asset-register", { method: "POST", headers: { origin: "https://gamid-testing-static.gamid.workers.dev", authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ path: PATH }) });
const env = { supabaseUrl: "https://project.supabase.co", anonKey: "a", serviceKey: "s", transcodeEnabled: false };

test("F8-B1 Edge Function: a 4K H.264 upload is registered exactly as before and THEN queued with the server's own moov facts (duration from mdhd)", async () => {
  const fourK = padded(readFileSync(new URL("./fixtures/mp4/h264-4k-tiny.mp4", import.meta.url)), Math.round(1.5 * MB));
  const facts = await inspectMp4(async (o, l) => new Uint8Array(fourK.subarray(o, o + l)), fourK.length);
  assert.deepEqual([facts.codec, facts.width, facts.height, facts.samples, facts.duration], ["avc1", 3840, 2160, 2, 1]);
  const s = storage(fourK);
  const response = await handleWallAssetRegister({ request: request(), env, fetchImpl: s.fetchImpl, log: () => {} });
  const body = await response.json();
  assert.deepEqual([response.status, body.asset.width, body.asset.height], [200, 3840, 2160]);
  const names = s.calls.map(c => (c.url.match(/rpc\/(\w+)/) ?? [])[1]).filter(Boolean);
  assert.deepEqual(names, ["register_verified_wall_asset", "create_wall_video_rendition"], "registered first; queued only after");
  const queued = s.calls.find(c => c.url.includes("create_wall_video_rendition")).body;
  assert.deepEqual(queued, { candidate_owner: USER, candidate_asset_id: "33333333-3333-4333-8333-333333333333", candidate_bytes: fourK.length, candidate_width: 3840, candidate_height: 2160, candidate_duration_ms: 1000, candidate_frames: 2 });
});

test("F8-B1 Edge Function: a failed queue never fails or changes the upload; small / efficient uploads and every non-MP4 are never queued", async () => {
  const fourK = padded(readFileSync(new URL("./fixtures/mp4/h264-4k-tiny.mp4", import.meta.url)), Math.round(1.5 * MB));
  const logs = [];
  const failing = storage(fourK, { renditionStatus: 500 });
  const response = await handleWallAssetRegister({ request: request(), env, fetchImpl: failing.fetchImpl, log: (e, c) => logs.push(c) });
  assert.equal(response.status, 200);
  assert.ok(!failing.calls.some(c => c.method === "DELETE"), "the registered original is never discarded because of the rendition");
  assert.ok(logs.includes("rendition_queue_failed"));
  for (const name of ["h264-moov-at-end.mp4", "h264-faststart.mp4"]) {
    const small = storage(readFileSync(new URL(`./fixtures/mp4/${name}`, import.meta.url)));
    assert.equal((await handleWallAssetRegister({ request: request(), env, fetchImpl: small.fetchImpl, log: () => {} })).status, 200);
    assert.ok(!small.calls.some(c => c.url.includes("create_wall_video_rendition")), name);
  }
  const source = text("supabase/functions/_shared/wall-assets.js");
  assert.match(source, /if \(extension === "mp4" && \(image\.codec === "avc1" \|\| image\.codec === "avc3"\) && typeof row\.asset_id === "string"\)/, "direct H.264 MP4 only (HEVC jobs and WebM never)");
});

// ---------- 3. the worker: plan, arguments, validation, gate ----------
const source = (extra = {}, audio = [{ codec_type: "audio", codec_name: "aac" }]) => ({ format: { duration: "11.033", size: "50550323" }, streams: [{ codec_type: "video", codec_name: "h264", width: 3840, height: 2160, pix_fmt: "yuv420p", avg_frame_rate: "331000/11033", r_frame_rate: "30/1", nb_frames: "331", color_transfer: "bt709", ...extra }, ...audio] });
test("F8-B1 plan: fit inside 1920x1080 (rotation applied, never upscaled), source frame rate, 2 s GOP, every audio stream kept; unsupported sources are refused", () => {
  const plan = renditionPlan(source());
  assert.deepEqual([plan.ok, plan.target, plan.gop, plan.frames, plan.audio], [true, [1920, 1080], 60, 331, [{ n: 0, codec: "aac", copy: true }]]);
  assert.ok(Math.abs(plan.fps - 30.0009) < 0.001, "the source's own (odd) rate");
  assert.deepEqual(renditionPlan(source({ side_data_list: [{ rotation: -90 }] })).target, [1080, 1920], "a rotated 4K phone clip becomes portrait 1080x1920");
  assert.deepEqual(renditionPlan(source({ width: 2160, height: 3840 })).target, [1080, 1920]);
  assert.deepEqual(renditionPlan(source({ width: 2560, height: 1080 })).target, [1920, 810], "ultrawide keeps its ratio inside the box");
  assert.deepEqual(renditionPlan(source({ width: 1920, height: 1080 })).target, [1920, 1080], "a high-bitrate 1080p is re-encoded at its own size");
  assert.deepEqual(renditionPlan(source({ width: 1280, height: 720 })).target, [1280, 720], "never upscaled");
  assert.deepEqual(renditionPlan(source({}, [{ codec_type: "audio", codec_name: "aac" }, { codec_type: "audio", codec_name: "pcm_s16le" }])).audio, [{ n: 0, codec: "aac", copy: true }, { n: 1, codec: "pcm_s16le", copy: false }]);
  assert.deepEqual(renditionPlan(source({}, [])).audio, []);
  assert.equal(renditionPlan(source({ color_transfer: "smpte2084" })).code, "SOURCE_HDR_UNSUPPORTED");
  assert.equal(renditionPlan(source({ color_transfer: "arib-std-b67" })).code, "SOURCE_HDR_UNSUPPORTED");
  assert.equal(renditionPlan(source({ pix_fmt: "yuva420p" })).code, "SOURCE_ALPHA_UNSUPPORTED");
  assert.equal(renditionPlan(source({ pix_fmt: "yuv420p10le" })).code, "SOURCE_FORMAT_UNSUPPORTED");
  assert.equal(renditionPlan(source({ codec_name: "hevc" })).code, "SOURCE_NOT_H264");
  assert.equal(renditionPlan({ format: {}, streams: [] }).code, "SOURCE_NOT_H264");
});

test("F8-B1 encoder arguments: H.264 High CRF 23 slow, 2 s GOP, passthrough frame rate, faststart; audio mapped and copied (or AAC), never dropped", () => {
  const plan = renditionPlan(source({}, [{ codec_type: "audio", codec_name: "aac" }, { codec_type: "audio", codec_name: "ac3" }]));
  const args = renditionArgs("in.mp4", "out.mp4", plan).join(" ");
  for (const part of ["-map 0:v:0 -map 0:a:0 -map 0:a:1", "-vf scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v libx264 -preset slow -crf 23 -profile:v high -pix_fmt yuv420p -g 60",
    "-fps_mode passthrough", "-c:a:0 copy", "-c:a:1 aac -b:a:1 192k", "-movflags +faststart -f mp4 out.mp4", "-map_metadata 0"]) assert.ok(args.includes(part), part);
  assert.doesNotMatch(args, /\s-an\b|-r\s|fps=/, "no audio removal and no frame-rate change");
  assert.deepEqual(RENDITION.box, [1920, 1080]);
});

test("F8-B1 gate and validation: VMAF mean >= 95 and p5 >= 90, >= 25% smaller, all frames scored; the produced file must match the plan", () => {
  const plan = renditionPlan(source());
  const ok = { vmaf: { mean: 99.5, p5: 96.1 }, bytes: 13 * MB, sourceBytes: 50 * MB, frames: 331, plan };
  assert.deepEqual(renditionGate(ok), { ok: true });
  assert.equal(renditionGate({ ...ok, vmaf: { mean: 94.99, p5: 96 } }).code, "QUALITY_GATE");
  assert.equal(renditionGate({ ...ok, vmaf: { mean: 99, p5: 89.9 } }).code, "QUALITY_GATE");
  assert.equal(renditionGate({ ...ok, bytes: Math.ceil(50 * MB * 0.75) + 1 }).code, "INSUFFICIENT_SAVINGS");
  assert.equal(renditionGate({ ...ok, bytes: 38 * MB, sourceBytes: 52 * MB }).code, "INSUFFICIENT_SAVINGS", "above the 37.5 MiB internal cap");
  assert.deepEqual(renditionGate({ ...ok, frames: 300 }), { ok: false, code: "VMAF_FRAME_MISMATCH", state: "failed" }, "a short comparison is a failure, never a pass");
  const out = (extra = {}, audio = [{ codec_type: "audio", codec_name: "aac" }]) => ({ format: { duration: "11.04" }, streams: [{ codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p", width: 1920, height: 1080, avg_frame_rate: "331000/11033", ...extra }, ...audio] });
  assert.equal(validateRendition(plan, out(), ["ftyp", "moov", "mdat"]), true);
  assert.throws(() => validateRendition(plan, out({}, []), ["ftyp", "moov", "mdat"]), /AUDIO_NOT_PRESERVED/);
  assert.throws(() => validateRendition(plan, out({ width: 1280, height: 720 }), ["ftyp", "moov", "mdat"]), /RENDITION_SIZE_UNEXPECTED/);
  assert.throws(() => validateRendition(plan, out({ avg_frame_rate: "25/1" }), ["ftyp", "moov", "mdat"]), /FRAME_RATE_CHANGED/);
  assert.throws(() => validateRendition(plan, out(), ["ftyp", "mdat", "moov"]), /NOT_FAST_START/);
});

// ---------- 4. one job, end to end, with every failure path ----------
const OWNER = "99999999-8888-4777-8666-555555555555";
const JOB = { rendition_id: "11111111-2222-4333-8444-555555555555", claim_token: "66666666-7777-4888-8999-000000000000", owner_user_id: OWNER, source_path: `${OWNER}/abcabcab-0000-4000-8000-000000000001.mp4`, rendition_path: `${OWNER}/11111111-2222-4333-8444-555555555555/66666666-7777-4888-8999-000000000000.mp4`, source_bytes: 4000, source_width: 3840, source_height: 2160 };
function worker({ job = JOB, sourceBytes = 4000, sweep = [], completeError = null, uploadError = null } = {}) {
  const calls = [], uploads = [], encodes = [];
  const fetchImpl = async (url, options = {}) => {
    const body = typeof options.body === "string" ? JSON.parse(options.body) : null;
    calls.push({ url, method: options.method ?? "GET", body });
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
    if (url.endsWith("/rpc/worker_claim_wall_video_rendition")) return json(job ? [job] : []);
    if (url.endsWith("/rpc/worker_wall_video_rendition_sweep")) return json(sweep.map(object_path => ({ object_path })));
    if (url.endsWith("/rpc/worker_finish_wall_video_rendition")) return json(null);
    if (url.endsWith("/rpc/worker_complete_wall_video_rendition")) return completeError ? json({ message: completeError }, 400) : json([{ rendition_id: job.rendition_id, state: "ready" }]);
    if (url.includes("/storage/v1/object/authenticated/wall-video/")) return new Response(Buffer.alloc(sourceBytes, 7), { status: 200 });
    if (options.method === "DELETE") return new Response("{}", { status: 200 });
    return new Response("unexpected", { status: 500 });
  };
  const backend = { url: "https://upvtrczefcvigxdyuylw.supabase.co", headers: type => ({ apikey: "k", Authorization: "Bearer k", ...(type ? { "Content-Type": type } : {}) }) };
  return { calls, uploads, encodes, fetchImpl, backend, upload: async args => { uploads.push(args); if (uploadError) throw new Error(uploadError); } };
}
const tools = ({ vmafAvailable = true, vmaf = { mean: 99.5, p5: 96.1, frames: 331 }, outBytes = 1000, encodeError = null, audioOut = ["aac-hash"], plan = source() } = {}) => {
  const seen = { encodes: 0, dirs: [] };
  return { seen, tools: {
    hasVmaf: async () => vmafAvailable,
    probe: async path => (/rendition\.mp4$/.test(path) ? { format: { duration: "11.04" }, streams: [{ codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p", width: 1920, height: 1080, avg_frame_rate: "331000/11033" }, { codec_type: "audio", codec_name: "aac" }] } : plan),
    encode: async (input, output) => { seen.encodes += 1; seen.dirs.push(output); if (encodeError) throw new Error(encodeError); writeFileSync(output, Buffer.alloc(outBytes, 1)); },
    vmaf: async () => vmaf, audioHashes: async path => (/rendition\.mp4$/.test(path) ? audioOut : ["aac-hash"]), boxes: async () => ["ftyp", "moov", "mdat"],
    size: async path => readFileSync(path).length,
  } };
};
const rpcNames = calls => calls.map(c => (c.url.match(/rpc\/(\w+)/) ?? [])[1]).filter(Boolean);

test("F8-B1 job: READY only after encode, validation, bit-identical audio, VMAF and savings pass - then upload and the database completion; temp files removed", async () => {
  const w = worker(), t = tools();
  const result = await processOneWallVideoRendition(w.backend, { fetchImpl: w.fetchImpl, tools: t.tools, upload: w.upload });
  assert.deepEqual([result.state, result.metrics.audio, result.metrics.bytes], ["ready", "identical", 1000]);
  assert.deepEqual(rpcNames(w.calls), ["worker_claim_wall_video_rendition", "worker_complete_wall_video_rendition", "worker_wall_video_rendition_sweep"]);
  assert.equal(w.uploads.length, 1);
  assert.equal(w.uploads[0].path, JOB.rendition_path, "written only at this attempt's own path");
  const complete = w.calls.find(c => c.url.endsWith("worker_complete_wall_video_rendition")).body;
  assert.deepEqual(complete, { candidate_rendition_id: JOB.rendition_id, candidate_claim_token: JOB.claim_token, candidate_path: JOB.rendition_path, candidate_bytes: 1000, candidate_width: 1920, candidate_height: 1080, candidate_vmaf_mean: 99.5, candidate_vmaf_p5: 96.1 });
  assert.ok(!existsSync(t.seen.dirs[0]), "the temporary rendition never outlives the run");
});

test("F8-B1 job: no libvmaf -> failed VMAF_UNAVAILABLE, nothing encoded or uploaded (the gate is never bypassed)", async () => {
  const w = worker(), t = tools({ vmafAvailable: false });
  const result = await processOneWallVideoRendition(w.backend, { fetchImpl: w.fetchImpl, tools: t.tools, upload: w.upload });
  assert.deepEqual([result.state, result.code, t.seen.encodes, w.uploads.length], ["failed", "VMAF_UNAVAILABLE", 0, 0]);
  const finish = w.calls.find(c => c.url.endsWith("worker_finish_wall_video_rendition")).body;
  assert.deepEqual([finish.candidate_state, finish.candidate_code, finish.candidate_claim_token], ["failed", "VMAF_UNAVAILABLE", JOB.claim_token]);
  assert.ok(!rpcNames(w.calls).includes("worker_complete_wall_video_rendition"));
});

test("F8-B1 job: quality or savings refusal -> rejected with its measurements, never uploaded; unsupported sources rejected before encoding", async () => {
  for (const [options, code] of [[{ vmaf: { mean: 93.1, p5: 85.2, frames: 331 } }, "QUALITY_GATE"], [{ vmaf: { mean: 99, p5: 89.5, frames: 331 } }, "QUALITY_GATE"], [{ outBytes: 3100 }, "INSUFFICIENT_SAVINGS"],
    [{ plan: source({ color_transfer: "smpte2084" }) }, "SOURCE_HDR_UNSUPPORTED"], [{ plan: source({ pix_fmt: "yuva420p" }) }, "SOURCE_ALPHA_UNSUPPORTED"]]) {
    const w = worker(), t = tools(options);
    const result = await processOneWallVideoRendition(w.backend, { fetchImpl: w.fetchImpl, tools: t.tools, upload: w.upload });
    assert.deepEqual([result.state, result.code, w.uploads.length], ["rejected", code, 0], code);
    const finish = w.calls.find(c => c.url.endsWith("worker_finish_wall_video_rendition")).body;
    assert.equal(finish.candidate_state, "rejected");
    if (code === "QUALITY_GATE") assert.equal(finish.candidate_vmaf_mean, options.vmaf.mean, "kept for review");
    if (/^SOURCE_/.test(code)) assert.equal(t.seen.encodes, 0);
  }
});

test("F8-B1 job: interrupted encode, lost audio, failed upload, refused completion, changed source -> failed; the original stays the visitors' video", async () => {
  for (const [workerOptions, toolOptions, code, uploaded] of [
    [{}, { encodeError: "ENCODE_KILLED" }, "ENCODE_KILLED", 0],
    [{}, { audioOut: ["different"] }, "AUDIO_NOT_PRESERVED", 0],
    [{ uploadError: "UPLOAD_INTERRUPTED" }, {}, "UPLOAD_INTERRUPTED", 1],
    [{ completeError: "SOURCE_GONE" }, {}, "WORKER_API_400", 1],
    [{ sourceBytes: 3999 }, {}, "SOURCE_CHANGED", 0],
  ]) {
    const w = worker(workerOptions), t = tools(toolOptions);
    const result = await processOneWallVideoRendition(w.backend, { fetchImpl: w.fetchImpl, tools: t.tools, upload: w.upload });
    assert.deepEqual([result.state, result.code, w.uploads.length], ["failed", code, uploaded], code);
    assert.equal(w.calls.filter(c => c.url.endsWith("worker_finish_wall_video_rendition")).at(-1).body.candidate_state, "failed");
    assert.ok(rpcNames(w.calls).includes("worker_wall_video_rendition_sweep"), "a written object is left to the storage-driven sweep");
  }
});

test("F8-B1 sweep: with nothing queued the worker deletes exactly the listed rendition objects (service role, renditions bucket only); TESTING only", async () => {
  const stale = [`${OWNER}/a1a1a1a1-0000-4000-8000-000000000001/b2b2b2b2-0000-4000-8000-000000000002.mp4`];
  const w = worker({ job: null, sweep: stale });
  assert.deepEqual(await processOneWallVideoRendition(w.backend, { fetchImpl: w.fetchImpl, tools: tools().tools, upload: w.upload }), { processed: false });
  const deletes = w.calls.filter(c => c.method === "DELETE");
  assert.deepEqual(deletes.map(c => c.url), [`https://upvtrczefcvigxdyuylw.supabase.co/storage/v1/object/wall-video-renditions/${stale[0]}`]);
  const prod = { url: "https://otherproject.supabase.co", headers: () => ({}) };
  await assert.rejects(uploadRenditionFile({ backend: prod, path: stale[0], filePath: "x" }), /TESTING_ONLY/);
  await assert.rejects(deleteRenditionObject(prod, stale[0]), /TESTING_ONLY/);
});

// ---------- 5. the visitor page: original versus rendition ----------
const RID = `${OWNER}/11111111-2222-4333-8444-555555555555/66666666-7777-4888-8999-000000000000.mp4`;
const VID = "dddddddd-0000-4000-8000-000000000004";
async function visit(assetExtra, { rendition = "https://x/storage/v1/object/sign/wall-video-renditions/r?token=t" } = {}) {
  const { createDocument, createElement } = await import("../dist/wall/schema.js");
  const { createImagePayload } = await import("../dist/wall-kit/image.js");
  const doc = createDocument({ stageCount: 1 });
  doc.stages[0].elements.push(createElement({ id: "v1", type: "image", x: 0, y: 0, width: 200, height: 200, z: 1, payload: { ...createImagePayload(VID), media: "video" } }));
  const signed = [];
  const api = {
    signPublicWallVideo: async path => { signed.push(["original", path]); return "https://x/storage/v1/object/sign/wall-video/o?token=t"; },
    signPublicWallRendition: async path => { signed.push(["rendition", path]); return rendition; },
    loadPublicWallPicture: async () => null, getPublicIdentity: async () => null, getPublicMyGames: async () => ({ games: [] }), loadPublicAvatar: async () => null,
  };
  const retained = [];
  const cache = { retain: (handle, scoped) => retained.push(...scoped), forget: () => {}, get: ({ sign }) => sign() };
  const ready = await preparePublicWall({ document: doc, published_at: "p", assets: [{ asset_id: VID, storage_path: `${OWNER}/abcabcab-0000-4000-8000-000000000001.mp4`, mime_type: "video/mp4", ...assetExtra }] }, "fixture", api, cache);
  return { url: ready.assets.videoUrlFor(VID), signed, retained };
}
test("F8-B1 visitor page: a READY rendition is played; without one (or if its lease fails) the original, exactly as before; a malformed name is ignored", async () => {
  const withRendition = await visit({ rendition_path: RID });
  assert.match(withRendition.url, /wall-video-renditions/);
  assert.deepEqual(withRendition.signed, [["rendition", RID]], "the original is not even signed when the rendition plays");
  assert.deepEqual(withRendition.retained.map(r => r.bucket), ["wall-video", "wall-video-renditions"], "F6-A scopes both objects of the same asset");
  const fallback = await visit({ rendition_path: RID }, { rendition: null });
  assert.match(fallback.url, /\/wall-video\//);
  assert.deepEqual(fallback.signed.map(s => s[0]), ["rendition", "original"]);
  const none = await visit({});
  assert.deepEqual(none.signed.map(s => s[0]), ["original"]);
  for (const bad of ["../etc/x.mp4", `${OWNER}/x.mp4`, "https://evil.example/x.mp4", 42]) {
    const r = await visit({ rendition_path: bad });
    assert.deepEqual(r.signed.map(s => s[0]), ["original"], String(bad));
  }
});

// ---------- 6. dispatcher, image, worker order ----------
test("F8-B1 wiring: the dispatcher accepts the renditions table; the image ships the module; conversions run before renditions", () => {
  const payload = table => ({ type: "INSERT", schema: "public", table, record: { job_id: "j", state: "pending" } });
  assert.equal(validateWebhookPayload(payload("wall_video_renditions")), true);
  assert.equal(validateWebhookPayload(payload("wall_assets")), false);
  assert.match(text("worker/Dockerfile"), /COPY worker\/wall-rendition\.mjs \.\/wall-rendition\.mjs/);
  const worker = text("worker/intro-worker.mjs");
  assert.ok(worker.indexOf("processOneWallVideoJob({") < worker.indexOf("processOneWallVideoRendition({"), "HEVC conversions keep priority");
});
