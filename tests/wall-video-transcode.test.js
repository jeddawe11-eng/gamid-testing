// Wall background video: automatic server-side HEVC/H.265 -> H.264 conversion at the SAME resolution (TESTING). The worker runs in the existing Intro worker image;
// the Edge Function queues an HEVC source only when WALL_VIDEO_TRANSCODE_ENABLED is on; H.264 keeps its direct path. No copyrighted media is committed: the
// real-file acceptance (3840x2160 HEVC -> 3840x2160 H.264) is scripts/wall-video-acceptance.mjs, run by hand with a local file.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcodeArgs, transcodeWallBackground, validateDerivative, processOneWallVideoJob, WALL_VIDEO_TRANSCODE } from "../worker/wall-video.mjs";
import { validateWebhookPayload } from "../worker/intro-dispatcher.mjs";
import { inspectMp4, handleWallAssetRegister, videoProblem } from "../supabase/functions/_shared/wall-assets.js";
import { createAssetStore } from "../dist/wall-editor/assets.js";
import { describeVideoJobFailure } from "../dist/wall-kit/assets.js";

const fixture = name => readFileSync(new URL(`./fixtures/mp4/${name}`, import.meta.url));
const text = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore" }); execFileSync("ffprobe", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

// ---------- 1. the encoder: codec conversion only ----------
test("T1 the encoder arguments convert the codec only: H.264 High yuv420p, fast start, no audio - and NO scale / crop / pad / aspect change anywhere", () => {
  const args = transcodeArgs("in.mp4", "out.mp4").join(" ");
  assert.match(args, /-c:v libx264 -preset veryfast -crf 20 -profile:v high -pix_fmt yuv420p/);
  assert.match(args, /-movflags \+faststart -f mp4/);
  assert.match(args, /-an -sn -dn/);
  assert.match(args, /-fps_mode passthrough/);
  assert.doesNotMatch(args, /-vf|-filter|scale|crop|pad=|-s |setsar|setdar|-aspect|-r /, "no resizing, cropping or frame-rate change");
  assert.doesNotMatch(text("worker/wall-video.mjs").replace(/\/\/.*$/gm, ""), /scale=|crop=|pad=|"-vf"|"-s"/);
});

const probe = (codec, width, height, extra = {}) => ({ video: { codec_name: codec, width, height, pix_fmt: "yuv420p", profile: codec === "h264" ? "High" : "Main", sample_aspect_ratio: "1:1" }, audio: null, duration: 32.2, fps: 30, size: 55_000_000, formatName: "mov,mp4,m4a,3gp,3g2,mj2", ...extra });
test("T2 derivative validation: exactly the source's width and height, H.264 yuv420p MP4, same timing, no audio, fast start - anything else fails", () => {
  const source = probe("hevc", 3840, 2160);
  const boxes = ["ftyp", "moov", "mdat"];
  assert.equal(validateDerivative(source, probe("h264", 3840, 2160), boxes), true);
  for (const [result, code] of [
    [probe("h264", 1920, 1080), "DERIVATIVE_RESOLUTION_CHANGED"],
    [probe("h264", 2560, 1440), "DERIVATIVE_RESOLUTION_CHANGED"],
    [probe("h264", 3840, 2158), "DERIVATIVE_RESOLUTION_CHANGED"],
    [probe("hevc", 3840, 2160), "DERIVATIVE_NOT_H264"],
    [{ ...probe("h264", 3840, 2160), video: { ...probe("h264", 3840, 2160).video, pix_fmt: "yuv420p10le" } }, "DERIVATIVE_PIXEL_FORMAT"],
    [{ ...probe("h264", 3840, 2160), video: { ...probe("h264", 3840, 2160).video, sample_aspect_ratio: "4:3" } }, "DERIVATIVE_ASPECT_CHANGED"],
    [probe("h264", 3840, 2160, { audio: { codec_name: "aac" } }), "DERIVATIVE_HAS_AUDIO"],
    [probe("h264", 3840, 2160, { fps: 29.97 }), "DERIVATIVE_FRAME_RATE_CHANGED"],
    [probe("h264", 3840, 2160, { duration: 30 }), "DERIVATIVE_DURATION_CHANGED"],
    [probe("h264", 3840, 2160, { size: WALL_VIDEO_TRANSCODE.maxDerivativeBytes + 1 }), "DERIVATIVE_TOO_LARGE"],
  ]) assert.throws(() => validateDerivative(source, result, boxes), new RegExp(code), code);
  assert.throws(() => validateDerivative(source, probe("h264", 3840, 2160), ["ftyp", "mdat", "moov"]), /DERIVATIVE_NOT_FAST_START/);
  assert.equal(validateDerivative(source, probe("h264", 3840, 2160, { size: 60 * 1024 * 1024 }), boxes), true, "a derivative larger than the 50 MB SOURCE limit is fine");
});

test("T3 real conversion (ffmpeg): an HEVC MP4 becomes an H.264 MP4 of EXACTLY the same width and height (ffprobe-verified)", { skip: !hasFfmpeg && "ffmpeg / ffprobe not installed here" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "wall-video-test-"));
  try {
    const input = join(dir, "hevc.mp4"), output = join(dir, "out.mp4");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25:duration=2", "-c:v", "libx265", "-tag:v", "hvc1", "-pix_fmt", "yuv420p", "-x265-params", "log-level=error", input]);
    const { source, result } = await transcodeWallBackground(input, output, { expectedWidth: 320, expectedHeight: 180 });
    const facts = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,pix_fmt,profile", "-of", "json", output]).toString()).streams[0];
    assert.deepEqual([facts.codec_name, facts.width, facts.height, facts.pix_fmt], ["h264", source.video.width, source.video.height, "yuv420p"]);
    assert.deepEqual([result.video.width, result.video.height], [320, 180]);
    await assert.rejects(transcodeWallBackground(input, join(dir, "b.mp4"), { expectedWidth: 3840, expectedHeight: 2160 }), /SOURCE_DOES_NOT_MATCH_JOB/, "the job's recorded size must be the file's");
    await assert.rejects(transcodeWallBackground(join(new URL("./fixtures/mp4/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "h264-faststart.mp4"), join(dir, "c.mp4")), /SOURCE_NOT_HEVC/, "H.264 never enters the conversion");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- 2. the worker job lifecycle ----------
function fakeBackend({ claim = null, completeError = null } = {}) {
  const calls = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? "GET", headers:options.headers, body: options.body && typeof options.body === "string" ? JSON.parse(options.body) : null });
    if(url.endsWith('/usage-upload/tus'))return new Response(null,{status:201,headers:{Location:'https://upvtrczefcvigxdyuylw.supabase.co/functions/v1/usage-upload/tus/fixture'}});
    if(options.method==='PATCH')return new Response(null,{status:204,headers:{'Upload-Offset':'1024'}});
    if (url.endsWith("/rpc/worker_claim_wall_video_job")) return json(claim ? [claim] : []);
    if (url.endsWith("/rpc/worker_complete_wall_video_job")) return completeError ? json({ message: completeError }, 400) : json([{ asset_id: "aaaaaaaa-0000-4000-8000-00000000000a" }]);
    if (url.endsWith("/rpc/worker_wall_video_cleanup_candidates")) return json(claim ? [{ job_id: claim.job_id, source_path: claim.source_path, derivative_path: completeError ? claim.derivative_path : null }] : []);
    if (url.includes("/rpc/")) return json(null);
    if (url.includes("/object/authenticated/wall-video/")) return new Response(new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]), { status: 200 });
    return new Response("{}", { status: 200 });
  };
  return { calls, fetchImpl, backend: { url: "https://upvtrczefcvigxdyuylw.supabase.co", headers: type => ({ apikey: "k", ...(type ? { "Content-Type": type } : {}) }) } };
}
const JOB = { job_id: "11111111-2222-4333-8444-555555555555", owner_user_id: "99999999-8888-4777-8666-555555555555", source_path: "99999999-8888-4777-8666-555555555555/abcabcab-0000-4000-8000-000000000001.mp4", derivative_path: "99999999-8888-4777-8666-555555555555/11111111-2222-4333-8444-555555555555.h264.mp4", source_width: 3840, source_height: 2160 };
const fakeTranscode = async (input, output) => { const { writeFileSync } = await import("node:fs"); writeFileSync(output, Buffer.alloc(1024)); return { result: { video: { width: 3840, height: 2160 } }, encodingMs: 1 }; };

test("T4 worker: claim -> stream the private source -> convert -> upload into the owner's folder of wall-video-derived -> complete with the SAME size -> delete the source", async () => {
  const { calls, fetchImpl, backend } = fakeBackend({ claim: JOB });
  const done = await processOneWallVideoJob(backend, { fetchImpl, transcode: fakeTranscode });
  assert.deepEqual([done.processed, done.width, done.height], [true, 3840, 2160]);
  const upload = calls.find(call => call.method === "POST" && call.url.endsWith('/usage-upload/tus'));
  assert.ok(upload.headers['Upload-Metadata'].includes(`objectName ${btoa(JOB.derivative_path)}`), "only the path the database assigned");
  assert.ok(upload.headers['Upload-Metadata'].includes(`bucketName ${btoa('wall-video-derived')}`));
  const complete = calls.find(call => call.url.endsWith("/rpc/worker_complete_wall_video_job"));
  assert.deepEqual([complete.body.candidate_width, complete.body.candidate_height], [3840, 2160]);
  assert.ok(calls.some(call => call.method === "DELETE" && call.url.endsWith(`/usage-upload/object/wall-video/${JOB.source_path}`)), "the HEVC source is deleted after success");
  assert.ok(!calls.some(call => call.method === "DELETE" && call.url.includes("wall-video-derived")), "the durable derivative is never deleted");
  assert.ok(calls.some(call => call.url.endsWith("/rpc/worker_confirm_wall_video_cleanup")));
});
test("T4 worker: a failed conversion marks the job failed, attaches nothing, and removes the source and any partial derivative; an empty queue does nothing", async () => {
  const failing = fakeBackend({ claim: JOB });
  await assert.rejects(processOneWallVideoJob(failing.backend, { fetchImpl: failing.fetchImpl, transcode: async () => { throw new Error("DERIVATIVE_RESOLUTION_CHANGED"); } }), /DERIVATIVE_RESOLUTION_CHANGED/);
  const fail = failing.calls.find(call => call.url.endsWith("/rpc/worker_fail_wall_video_job"));
  assert.equal(fail.body.candidate_failure_code, "DERIVATIVE_RESOLUTION_CHANGED");
  assert.ok(!failing.calls.some(call => call.url.endsWith("/rpc/worker_complete_wall_video_job")), "never completed");
  assert.ok(failing.calls.some(call => call.method === "DELETE" && call.url.includes("/object/wall-video/")), "source cleaned up");
  const refused = fakeBackend({ claim: JOB, completeError: "WALL_VIDEO_RESOLUTION_CHANGED" });
  await assert.rejects(processOneWallVideoJob(refused.backend, { fetchImpl: refused.fetchImpl, transcode: fakeTranscode }), /WORKER_API_400/);
  assert.ok(refused.calls.some(call => call.method === "DELETE" && call.url.includes("/object/wall-video-derived/")), "a derivative the database refused is removed");
  const idle = fakeBackend();
  assert.deepEqual(await processOneWallVideoJob(idle.backend, { fetchImpl: idle.fetchImpl, transcode: fakeTranscode }), { processed: false });
});
test("T4 the same Cloud Run Job serves both queues; the dispatcher accepts only the two known tables", () => {
  const worker = text("worker/intro-worker.mjs");
  assert.match(worker, /processOneWallVideoJob\(/, "one Job execution drains a Wall video when no Intro is waiting");
  assert.match(text("worker/Dockerfile"), /COPY worker\/wall-video\.mjs/);
  assert.equal(validateWebhookPayload({ type: "INSERT", schema: "public", table: "wall_video_jobs", record: { state: "pending", job_id: "x" } }), true);
  assert.equal(validateWebhookPayload({ type: "INSERT", schema: "public", table: "wall_assets", record: { state: "pending", job_id: "x" } }), false);
});

// ---------- 3. the Edge Function: H.264 fast path, HEVC queue ----------
const USER = "11111111-1111-4111-8111-111111111111";
const PATH = `${USER}/22222222-2222-4222-8222-222222222222.mp4`;
function storage(bytes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? "GET", body: typeof options.body === "string" ? JSON.parse(options.body) : null });
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: USER }), { status: 200 });
    if (url.includes("/rpc/create_wall_video_job")) return new Response(JSON.stringify([{ job_id: "33333333-3333-4333-8333-333333333333", state: "pending" }]), { status: 200 });
    if (url.includes("/rpc/register_verified_wall_asset")) { const b = JSON.parse(options.body); return new Response(JSON.stringify([{ asset_id: "a", storage_path: b.candidate_path, mime_type: b.candidate_mime, width: b.candidate_width, height: b.candidate_height }]), { status: 200 }); }
    if (options.method === "DELETE") return new Response("{}", { status: 200 });
    const m = /bytes=(\d+)-(\d+)/.exec(options.headers?.Range ?? "");
    const [from, to] = m ? [Number(m[1]), Math.min(Number(m[2]), bytes.length - 1)] : [0, bytes.length - 1];
    return new Response(bytes.subarray(from, to + 1), { status: 206, headers: { "content-range": `bytes ${from}-${to}/${bytes.length}` } });
  };
  return { calls, fetchImpl };
}
const request = () => new Request("https://x/functions/v1/wall-asset-register", { method: "POST", headers: { origin: "https://gamid-testing-static.gamid.workers.dev", authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ path: PATH }) });
const env = on => ({ supabaseUrl: "https://project.supabase.co", anonKey: "a", serviceKey: "s", transcodeEnabled: on });

test("T5 HEVC is recognised (with its picture count) - refused as before while the switch is off, QUEUED (202, a job, no asset) when it is on", async () => {
  const hevc = fixture("hevc.mp4");
  const found = await inspectMp4(async (o, l) => new Uint8Array(hevc.subarray(o, o + l)), hevc.length);
  assert.deepEqual([found.ok, found.codec, found.transcode, found.width, found.height, found.samples], [true, "hvc1", true, 64, 36, 10]);
  const off = storage(hevc);
  const refused = await handleWallAssetRegister({ request: request(), env: env(false), fetchImpl: off.fetchImpl });
  assert.deepEqual([refused.status, (await refused.json()).error], [400, "VIDEO_CODEC_UNSUPPORTED"]);
  assert.ok(off.calls.some(call => call.method === "DELETE"), "the refused source is deleted, as before");
  const on = storage(hevc);
  const queued = await handleWallAssetRegister({ request: request(), env: env(true), fetchImpl: on.fetchImpl });
  const body = await queued.json();
  assert.deepEqual([queued.status, body.job.state, body.asset], [202, "pending", undefined]);
  const create = on.calls.find(call => call.url.includes("/rpc/create_wall_video_job")).body;
  assert.deepEqual([create.candidate_owner, create.candidate_path, create.candidate_codec, create.candidate_width, create.candidate_height, create.candidate_frames], [USER, PATH, "hvc1", 64, 36, 10]);
  assert.ok(!on.calls.some(call => call.method === "DELETE"), "the source is kept for the worker");
  assert.ok(!on.calls.some(call => call.url.includes("register_verified_wall_asset")), "nothing is registered before the conversion");
});
test("T5 the H.264 fast path is unchanged: registered directly, never queued, even with conversion on", async () => {
  const h264 = storage(fixture("h264-moov-at-end.mp4"));
  const response = await handleWallAssetRegister({ request: request(), env: env(true), fetchImpl: h264.fetchImpl });
  const body = await response.json();
  assert.deepEqual([response.status, body.asset.mime_type, body.asset.width, body.asset.height], [200, "video/mp4", 64, 36]);
  assert.ok(!h264.calls.some(call => call.url.includes("create_wall_video_job")));
});
test("T5 limits before any job exists: 50 MB source, <= 4096 px, and a conversion budget of ~2 minutes of 4K30; other codecs are still refused", () => {
  const hevc4k = { ok: true, codec: "hvc1", transcode: true, width: 3840, height: 2160, samples: 966 };
  assert.equal(videoProblem(hevc4k, 31_235_249, { transcodeEnabled: true }), null, "the real 32 s 4K30 HEVC background fits");
  assert.equal(videoProblem({ ...hevc4k, samples: 3601 }, 31_000_000, { transcodeEnabled: true }), "VIDEO_TOO_LONG_TO_CONVERT");
  assert.equal(videoProblem(hevc4k, 50 * 1024 * 1024 + 1, { transcodeEnabled: true }), "VIDEO_TOO_LARGE", "the SOURCE upload limit is unchanged");
  assert.equal(videoProblem({ ...hevc4k, width: 7680, height: 4320 }, 10, { transcodeEnabled: true }), "INVALID_WALL_ASSET_SIZE");
  assert.equal(videoProblem({ ok: false, code: "VIDEO_CODEC_UNSUPPORTED" }, 10, { transcodeEnabled: true }), "VIDEO_CODEC_UNSUPPORTED");
});

// ---------- 4. the editor: real processing state, attach only when READY ----------
test("T6 the editor follows the conversion: Processing until the database says READY (then the asset list refreshes), or a clear failure - nothing is attached before", async () => {
  let polls = 0, refreshed = 0;
  const states = ["pending", "processing", "processing", "ready"];
  const api = {
    listWallAssets: async () => { refreshed += 1; return [{ asset_id: "done", storage_path: "u/j.h264.mp4", mime_type: "video/mp4", width: 3840, height: 2160, byte_size: 55_494_483 }]; },
    getMyWallVideoJobs: async () => [{ job_id: "j", state: states[Math.min(polls++, states.length - 1)], asset_id: polls >= 4 ? "done" : null }],
    signWallVideo: async () => null,
    uploadWallVideo: async () => ({ job: { job_id: "j", state: "pending" } }),
  };
  const store = createAssetStore({ api, userId: "u", decodeVideoFile: async () => ({ width: 3840, height: 2160, duration: 32.2 }) });
  const upload = await store.uploadVideo({ type: "video/mp4", size: 31_235_249 });
  assert.deepEqual([upload.ok, upload.job.job_id, upload.asset], [true, "j", undefined], "an HEVC upload returns a job, not an asset");
  const seen = [];
  const done = await store.watchVideoJob("j", { wait: async () => {}, onState: state => seen.push(state) });
  assert.deepEqual(seen, ["pending", "processing", "processing", "ready"]);
  assert.deepEqual([done.state, done.asset.asset_id, done.asset.width, done.asset.height], ["ready", "done", 3840, 2160]);
  assert.equal(refreshed, 1);
  const failedStore = createAssetStore({ api: { ...api, getMyWallVideoJobs: async () => [{ job_id: "j", state: "failed", failure_code: "SOURCE_HDR_UNSUPPORTED" }] }, userId: "u" });
  const failed = await failedStore.watchVideoJob("j", { wait: async () => {} });
  assert.deepEqual(failed, { state: "failed", failureCode: "SOURCE_HDR_UNSUPPORTED" });
  assert.match(describeVideoJobFailure("SOURCE_HDR_UNSUPPORTED"), /HDR/);
  assert.match(describeVideoJobFailure("DERIVATIVE_RESOLUTION_CHANGED"), /Nothing on your Wall changed/);
  const tools = text("dist/wall-editor/tools.js");
  assert.match(tools, /if \(attach\) run\(ops\.setBackground\(doc\(\), target, createVideoBackground\(done\.asset\.asset_id\)\)\)/, "attached only after READY, to the scope chosen at upload");
  assert.match(tools, /Processing video…/);
  const client = text("dist/account/supabase-client.js");
  assert.match(client, /\\\.h264\\\.mp4\$\/\.test\(String\(path\)\) \? "wall-video-derived"/, "converted videos stream from the private derived bucket");
});

// ---------- 5. the database contract (static) ----------
test("T7 the migration: private derived bucket, service-role-only worker RPCs, the database re-checks the resolution, source cleanup, no client table access", () => {
  const sql = text("supabase/migrations/20260930100000_wall_video_transcode.sql").replace(/--.*$/gm, "");
  assert.match(sql, /values \('wall-video-derived', 'wall-video-derived', false, 209715200, array\['video\/mp4'\]\)/);
  assert.doesNotMatch(sql, /for insert to authenticated/, "no client can write the derived bucket");
  assert.match(sql, /candidate_width is distinct from job\.source_width or candidate_height is distinct from job\.source_height[\s\S]{0,120}WALL_VIDEO_RESOLUTION_CHANGED/);
  assert.match(sql, /revoke all on table public\.wall_video_jobs from public, anon, authenticated/);
  assert.match(sql, /grant execute on function private\.get_my_wall_video_jobs_impl\(\), public\.get_my_wall_video_jobs\(\) to authenticated/);
  assert.match(sql, /public\.worker_claim_wall_video_job\(\)[\s\S]*to service_role/);
  assert.match(sql, /case when not j\.source_deleted then j\.source_path end/, "the HEVC source is always cleaned up after the job ends");
  assert.doesNotMatch(sql, /public = true|to anon/i);
});
