// Intro Thumbnail for Discord (Mazen's task 2026-10-26): the worker's share copy (plan, exact ffmpeg graph, validation, the whole job with its failure path),
// its wiring into the existing image / dispatcher / Job order, the Cloudflare Worker's card + share route (B1 unchanged), and the editor's frame picker.
// The database half is tests/intro-discord-thumbnail-db.test.js; the real ffmpeg check is the opt-in native test at the end (GAMID_NATIVE_FFMPEG=1).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SHARE, sharePlan, shareArgs, validateShare, processOneIntroShare, probeShare, videoFrameTimes, shareTools } from "../worker/intro-share.mjs";
import { validateWebhookPayload } from "../worker/intro-dispatcher.mjs";
import worker from "../cf-worker/worker.mjs";
import { DIVIDER_IMAGE_PATH, fetchPublicIntroShare, introShareUrl } from "../cf-worker/discord-card.mjs";
import { describeThumbnail, formatThumbnailTime, normalizeThumbnailMs, mountIntroThumbnailPicker } from "../dist/account/intro-thumbnail.js";
import { hasIntroChanges } from "../dist/account/domain.js";

const text = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const OWNER = "07991366-84e9-4c1a-9a40-3d6d7f1c2b11", JOB = "11111111-2222-4333-8444-555555555555", SHARE_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const SHARE_PATH = `${OWNER}/${JOB}/${SHARE_ID}/bbbbbbbb-cccc-4ddd-8eee-ffffffffffff.webm`;
const frames = (count, fps, start = 0) => Array.from({ length: count }, (_, i) => Number((start + i / fps).toFixed(3)));
const d3Probe = ({ fps = "30/1", duration = 8, audio = true, width = 1920, height = 1080, sar = "1:1" } = {}) => ({
  format: { format_name: "matroska,webm", duration: String(duration) },
  streams: [{ codec_type: "video", codec_name: "vp9", width, height, pix_fmt: "yuv420p", r_frame_rate: fps, avg_frame_rate: fps, sample_aspect_ratio: sar },
    ...(audio ? [{ codec_type: "audio", codec_name: "opus", sample_rate: "48000" }] : [])],
});

// ---------- 1. the plan: the frame a paused browser shows ----------
test("plan: the chosen time selects the LAST frame presented at or before it (as a paused player shows it); audio delay is exactly one frame in samples", () => {
  const plan = sharePlan(d3Probe(), frames(240, 30), 5000);
  assert.equal(plan.ok, true);
  assert.equal(plan.frame, 150);
  assert.equal(plan.delaySamples, 1600, "48 kHz / 30 fps");
  assert.equal(sharePlan(d3Probe(), frames(240, 30), 5020).frame, 150, "between frames: the one still on screen");
  assert.equal(sharePlan(d3Probe(), frames(240, 30), 5034).frame, 151);
  // NTSC 29.97: 2.000 s is still frame 59 (60 / 29.97 = 2.002 s)
  const ntsc = sharePlan(d3Probe({ fps: "30000/1001", duration: 4 }), frames(119, 30000 / 1001), 2000);
  assert.equal(ntsc.frame, 59);
  assert.equal(ntsc.delaySamples, 1602);
  assert.equal(sharePlan(d3Probe({ fps: "60/1" }), frames(480, 60), 2000).delaySamples, 800);
  // ISS-0020: timestamps that do not start at zero are read on the media's own timeline, as Chrome shows a paused video (measured on @black's Intro,
  // first frame at 0.007 s: currentTime 4.402 shows the frame at 4.374, not the one at 4.407)
  const late = frames(240, 30, 0.007);
  assert.equal(late[sharePlan(d3Probe(), late, 5000).frame], 4.974, "the frame still on screen at 5.000, not the one at 5.007");
  assert.equal(sharePlan(d3Probe(), late, 5007).frame, 150, "a frame presented exactly at the chosen time is shown");
  assert.equal(sharePlan(d3Probe(), late, 5006).frame, 149, "one millisecond before it, the previous frame");
  assert.equal(sharePlan(d3Probe(), late, 5).frame, 0, "before the first frame: the first frame");
  const black = [4.307, 4.34, 4.374, 4.407, 4.44];
  assert.equal(black[sharePlan(d3Probe({ duration: 11.04 }), black, 4402).frame], 4.374);
  assert.equal(sharePlan(d3Probe({ sar: "4:3" }), frames(240, 30), 5000).sar, "4/3", "an anamorphic Intro keeps its sample aspect ratio");
});

test("plan refusals: not a D3 derivative, unreadable timing, a time outside the Intro", () => {
  assert.equal(sharePlan({ streams: [{ codec_type: "video", codec_name: "h264", width: 2, height: 2, r_frame_rate: "30/1" }], format: { duration: "8" } }, frames(240, 30), 5000).code, "INTRO_NOT_D3");
  assert.equal(sharePlan(d3Probe({ fps: "0/0" }), frames(240, 30), 5000).code, "INTRO_TIMING_UNREADABLE");
  assert.equal(sharePlan(d3Probe(), [], 5000).code, "INTRO_TIMING_UNREADABLE");
  for (const ms of [0, -5, 8000, 9000, null]) assert.equal(sharePlan(d3Probe(), frames(240, 30), ms).code, "THUMBNAIL_OUTSIDE_INTRO", String(ms));
});

// ---------- 2. the exact graph ----------
test("encode: [the chosen frame][the whole Intro shifted by one frame] merged by timestamp, audio delayed by one frame, at the accepted D3 settings", () => {
  const plan = sharePlan(d3Probe(), frames(240, 30), 5000);
  const args = shareArgs("in.webm", "out.webm", plan);
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.deepEqual(args.filter(a => a === "in.webm").length, 2, "the derivative is read twice: the frame, then the whole Intro");
  assert.match(graph, /^\[0:v\]select='eq\(n,150\)',setpts=PTS-STARTPTS,format=yuv420p,setsar=1\/1\[p\];/);
  assert.match(graph, /\[1:v\]setpts=PTS-STARTPTS\+\(1\/\(30\/1\)\)\/TB,format=yuv420p,setsar=1\/1\[i\]/);
  assert.match(graph, /\[p\]\[i\]interleave=nb_inputs=2\[v\]/, "not concat: WebM frames carry no duration, so concat would start the Intro ON the prefix frame");
  assert.match(graph, /\[1:a\]asetpts=PTS-STARTPTS,adelay=1600S:all=1\[a\]$/);
  assert.match(args.join(" "), /-c:v libvpx-vp9 -crf 40 -b:v 0 -deadline good -cpu-used 2 -row-mt 1 -pix_fmt yuv420p/, "the D3 video settings, unchanged");
  assert.match(args.join(" "), /-c:a libopus -b:a 32k -vbr on -application audio/, "the D3 audio settings, unchanged");
  assert.match(text("worker/intro-worker.mjs"), /"-c:v","libvpx-vp9","-crf","40","-b:v","0","-deadline","good","-cpu-used","2","-row-mt","1","-pix_fmt","yuv420p"/, "the D3 encode itself is untouched");
  const silent = shareArgs("in.webm", "out.webm", sharePlan(d3Probe({ audio: false }), frames(240, 30), 5000));
  assert.ok(silent.includes("-an"));
  assert.doesNotMatch(silent.join(" "), /adelay|\[a\]/);
});

// ---------- 3. validation ----------
test("validation: every Intro frame exactly one frame later, nothing dropped or added; geometry, codec, audio, size and duration", () => {
  const source = frames(240, 30), plan = sharePlan(d3Probe(), source, 5000);
  const result = d3Probe({ duration: 8.033 }), good = frames(241, 30);
  assert.deepEqual(validateShare(plan, result, good, source, 3_000_000), { durationMs: 8033 });
  assert.throws(() => validateShare(plan, result, frames(240, 30), source, 3_000_000), /SHARE_FRAMES_CHANGED/);
  assert.throws(() => validateShare(plan, result, [0, ...source], source, 3_000_000), /SHARE_PREFIX_TIMING/, "the prefix collides with the Intro's first frame");
  assert.throws(() => validateShare(plan, result, [...good.slice(0, 100), ...good.slice(100).map(t => t + 0.05)], source, 3_000_000), /SHARE_TIMING_CHANGED/);
  assert.throws(() => validateShare(plan, d3Probe({ duration: 8.033, width: 1280, height: 720 }), good, source, 3_000_000), /SHARE_GEOMETRY_CHANGED/);
  assert.throws(() => validateShare(plan, d3Probe({ duration: 8.033, audio: false }), good, source, 3_000_000), /SHARE_AUDIO_NOT_PRESERVED/);
  assert.throws(() => validateShare(plan, result, good, source, SHARE.maxBytes + 1), /SHARE_TOO_LARGE/);
  assert.throws(() => validateShare(plan, d3Probe({ duration: 9 }), good, source, 3_000_000), /SHARE_DURATION_CHANGED/);
});

// ---------- 4. the whole job ----------
const BACKEND = { url: "https://upvtrczefcvigxdyuylw.supabase.co", headers: type => ({ apikey: "service", ...(type ? { "Content-Type": type } : {}) }) };
function fakeBackend({ job = { share_id: SHARE_ID, claim_token: "tok", owner_user_id: OWNER, job_id: JOB, derivative_path: `${OWNER}/${JOB}/intro-d3.webm`, derivative_bytes: 10,
  intro_duration_ms: 8000, intro_width: 1920, intro_height: 1080, intro_has_audio: true, thumbnail_ms: 5000, share_path: SHARE_PATH }, sweep = [] } = {}) {
  const rpcs = [], deletes = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/rest/v1/rpc/")) {
      const name = u.split("/rpc/")[1]; rpcs.push([name, JSON.parse(init.body || "{}")]);
      const body = name === "worker_claim_intro_share" ? (job ? [job] : []) : name === "worker_intro_share_sweep" ? sweep : name === "worker_complete_intro_share" ? [{ share_id: SHARE_ID, state: "ready" }] : null;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("/storage/v1/object/authenticated/intro-media/")) return new Response(new Uint8Array(10), { status: 200 });
    if (init.method === "DELETE") { deletes.push(u); return new Response(null, { status: 200 }); }
    return new Response(null, { status: 404 });
  };
  return { fetchImpl, rpcs, deletes };
}
const fakeTools = (overrides = {}) => ({
  size: async path => (path.endsWith("intro-d3.webm") ? 10 : 3_000_000),
  times: async path => (path.endsWith("intro-d3.webm") ? frames(240, 30) : frames(241, 30)),
  probe: async path => (path.endsWith("intro-d3.webm") ? d3Probe() : d3Probe({ duration: 8.033 })),
  encode: async () => {},
  ...overrides,
});

test("job: claim -> derivative -> plan -> encode -> validate -> upload to the share bucket path -> complete with the measured values", async () => {
  const b = fakeBackend({ sweep: [{ object_path: `${OWNER}/${JOB}/old/old.webm` }] });
  const uploads = [];
  const result = await processOneIntroShare(BACKEND, { fetchImpl: b.fetchImpl, tools: fakeTools(), upload: async args => uploads.push(args) });
  assert.equal(result.state, "ready");
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].path, SHARE_PATH);
  const complete = b.rpcs.find(([name]) => name === "worker_complete_intro_share")[1];
  assert.deepEqual(complete, { candidate_share_id: SHARE_ID, candidate_claim_token: "tok", candidate_path: SHARE_PATH, candidate_bytes: 3_000_000, candidate_width: 1920, candidate_height: 1080, candidate_duration_ms: 8033 });
  assert.deepEqual(b.deletes, [`${BACKEND.url}/storage/v1/object/intro-share-copies/${OWNER}/${JOB}/old/old.webm`], "the sweep deletes exactly what the database lists, in the share bucket");
});

test("job failures: a changed derivative, a frame outside the Intro or a bad encode fail the copy (Discord keeps the unchanged Intro); nothing is uploaded", async () => {
  for (const [tools, code] of [
    [fakeTools({ size: async () => 11 }), "INTRO_CHANGED"],
    [fakeTools({ times: async () => [] }), "INTRO_TIMING_UNREADABLE"],
    [fakeTools({ times: async path => (path.endsWith("intro-d3.webm") ? frames(240, 30) : frames(240, 30)) }), "SHARE_FRAMES_CHANGED"],
    [fakeTools({ encode: async () => { throw new Error("ffmpeg exited 1"); } }), "ffmpeg exited 1"],
  ]) {
    const b = fakeBackend(), uploads = [];
    const result = await processOneIntroShare(BACKEND, { fetchImpl: b.fetchImpl, tools, upload: async args => uploads.push(args) });
    assert.equal(result.state, "failed", code);
    assert.equal(result.code, code);
    assert.equal(uploads.length, 0, code);
    assert.deepEqual(b.rpcs.find(([name]) => name === "worker_fail_intro_share")[1], { candidate_share_id: SHARE_ID, candidate_claim_token: "tok", candidate_code: code });
    assert.equal(b.rpcs.some(([name]) => name === "worker_complete_intro_share"), false);
  }
  const idle = fakeBackend({ job: null });
  assert.deepEqual(await processOneIntroShare(BACKEND, { fetchImpl: idle.fetchImpl, tools: fakeTools() }), { processed: false });
  assert.deepEqual(idle.rpcs.map(([name]) => name), ["worker_claim_intro_share", "worker_intro_share_sweep"]);
});

// ---------- 5. wiring ----------
test("wiring: the dispatcher accepts the share table; the image ships the module; Intros first, then share copies, then Wall conversions and renditions", () => {
  const payload = table => ({ type: "INSERT", schema: "public", table, record: { job_id: "j", state: "pending" } });
  for (const table of ["intro_processing_jobs", "wall_video_jobs", "wall_video_renditions", "intro_share_copies"]) assert.equal(validateWebhookPayload(payload(table)), true, table);
  assert.equal(validateWebhookPayload(payload("profile_intro_settings")), false);
  assert.match(text("worker/Dockerfile"), /COPY worker\/intro-share\.mjs \.\/intro-share\.mjs/);
  assert.match(text("worker/cloud-run/usage-testing.gcloudignore"), /^!worker\/intro-share\.mjs$/m);
  const w = text("worker/intro-worker.mjs");
  const at = needle => w.indexOf(needle);
  assert.ok(at('worker_claim_intro_job') < at("processOneIntroShare({") && at("processOneIntroShare({") < at("processOneWallVideoJob({") && at("processOneWallVideoJob({") < at("processOneWallVideoRendition({"));
  assert.match(w, /sweepIntroShares\(/, "Intro cleanup also sweeps share copies of a replaced or removed Intro");
  assert.match(w, /command === "share-smoke"/);
});

// ---------- 6. the Cloudflare Worker: card + share route ----------
const SUPABASE = "https://upvtrczefcvigxdyuylw.supabase.co";
const shell = text("dist/public/index.html");
const IDENTITY = { gamid_handle: "black", display_name: "Espada", role_catalog: [{ key: "player", label: "Player" }], primary_role_key: "player", role_keys: ["player"],
  avatar_media_reference: "a/avatar.webp", intro_derivative_path: `${OWNER}/${JOB}/intro-d3.webm` };
const assets = { fetch: async request => (new URL(request.url).pathname === "/public/" ? new Response(shell, { status: 200 }) : new Response("passthrough", { status: 200 })) };
async function withFetch(routes, run) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); calls.push({ url: u, init });
    const rpc = u.includes("/rpc/") ? u.split("/rpc/")[1] : null;
    if (rpc) return new Response(JSON.stringify(routes[rpc] ?? []), { status: 200, headers: { "content-type": "application/json" } });
    return routes.storage ? routes.storage(u, init) : new Response("nope", { status: 404 });
  };
  try { return await run(calls); } finally { globalThis.fetch = original; }
}
const card = html => JSON.parse(html.match(/<script id="discord:component-embed" type="application\/json">(.*?)<\/script>/)[1].replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"));
const introMedia = c => c.component.components.filter(x => x.type === 12 && x.items[0].media.url.includes("/@black/")).map(x => x.items[0].media.url);

test("card: with a ready share copy the card's Intro is /@<handle>/intro-discord.webm?v=<digest of the copy>; og:video and the B1 card are otherwise unchanged", async () => {
  const page = async share => withFetch({ get_public_identity: [IDENTITY], get_public_profile_extras: [{ has_banner: true }], get_public_intro_share: share }, async () =>
    (await worker.fetch(new Request("https://gamid-testing-static.gamid.workers.dev/@black"), { ASSETS: assets })).text());
  const before = await page([]), after = await page([{ share_path: SHARE_PATH, thumbnail_ms: 5000 }]);
  assert.match(introMedia(card(before))[0], /\/@black\/intro\.webm\?v=[0-9a-f]{8}$/, "no share copy: the card plays the same URL as og:video");
  assert.match(introMedia(card(after))[0], /^https:\/\/gamid-testing-static\.gamid\.workers\.dev\/@black\/intro-discord\.webm\?v=[0-9a-f]{8}$/);
  assert.equal(introMedia(card(after))[0], await introShareUrl({ path: SHARE_PATH }, "black", "https://gamid-testing-static.gamid.workers.dev"));
  assert.doesNotMatch(after, new RegExp(SHARE_ID), "the copy's storage path never reaches the page");
  const og = html => html.match(/property="og:video" content="([^"]+)"/)[1];
  assert.equal(og(after), og(before), "og:video stays the unchanged derivative for every other platform");
  // B1 exactly as before: the same component sequence, the same purple line images, the same accent
  const shape = c => c.component.components.map(x => (x.type === 12 && x.items[0].media.url.endsWith(DIVIDER_IMAGE_PATH) ? "line" : x.type));
  assert.deepEqual(shape(card(after)), shape(card(before)));
  assert.deepEqual(shape(card(after)), [9, "line", 12, "line", 10, 12, "line", 9]);
  assert.equal(card(after).component.accent_color, 0xb14cff);
  // a new frame -> a new copy path -> a new URL Discord fetches afresh
  const other = await page([{ share_path: SHARE_PATH.replace("bbbbbbbb", "cccccccc"), thumbnail_ms: 1200 }]);
  assert.notEqual(introMedia(card(other))[0], introMedia(card(after))[0]);
});

test("share lookup fails SAFE: a malformed path, an error or a timeout-shaped failure means no share copy (the card keeps the unchanged Intro)", async () => {
  const lookup = rows => fetchPublicIntroShare("black", { supabaseUrl: SUPABASE, publishableKey: "pk", fetchImpl: async () => new Response(JSON.stringify(rows), { status: 200 }) });
  assert.deepEqual(await lookup([{ share_path: SHARE_PATH }]), { path: SHARE_PATH });
  for (const bad of ["../x.webm", `${OWNER}/${JOB}/intro-d3.webm`, "https://evil.example/a.webm", 42, null]) assert.equal(await lookup([{ share_path: bad }]), null, String(bad));
  assert.equal(await lookup({}), null);
  assert.equal(await fetchPublicIntroShare("black", { supabaseUrl: SUPABASE, publishableKey: "pk", fetchImpl: async () => new Response("x", { status: 500 }) }), null);
  assert.equal(await fetchPublicIntroShare("black", { supabaseUrl: SUPABASE, publishableKey: "pk", fetchImpl: async () => { throw new TypeError("down"); } }), null);
});

test("share route: streams the ready copy from its own bucket (Range passthrough); without one, the unchanged derivative; nothing for a malformed or unknown handle", async () => {
  const storage = (u, init) => new Response("bytes", { status: init.headers?.Range ? 206 : 200, headers: { "content-type": "video/webm", "content-range": init.headers?.Range ? "bytes 0-4/5" : "" } });
  const get = (path, range) => worker.fetch(new Request(`https://gamid-testing-static.gamid.workers.dev${path}`, range ? { headers: { range } } : {}), { ASSETS: assets });
  await withFetch({ get_public_intro_share: [{ share_path: SHARE_PATH }], get_public_identity: [IDENTITY], storage }, async calls => {
    const res = await get("/@black/intro-discord.webm?v=abc", "bytes=0-4");
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-type"), "video/webm");
    const media = calls.filter(c => c.url.includes("/storage/v1/object/"));
    assert.deepEqual(media.map(c => c.url), [`${SUPABASE}/storage/v1/object/authenticated/intro-share-copies/${SHARE_PATH}`]);
    assert.equal(calls.some(c => c.url.endsWith("/rpc/get_public_identity")), false, "with a copy, the identity is not looked up");
  });
  await withFetch({ get_public_intro_share: [], get_public_identity: [IDENTITY], storage }, async calls => {
    assert.equal((await get("/@black/intro-discord.webm")).status, 200);
    assert.deepEqual(calls.filter(c => c.url.includes("/storage/")).map(c => c.url), [`${SUPABASE}/storage/v1/object/authenticated/intro-media/${IDENTITY.intro_derivative_path}`], "an older Discord message keeps playing the Intro");
  });
  await withFetch({ get_public_intro_share: [], get_public_identity: [], storage }, async () => assert.equal((await get("/@nobody/intro-discord.webm")).status, 404));
  await withFetch({ storage }, async calls => { assert.equal((await get("/@__bad/intro-discord.webm")).status, 404); assert.equal(calls.length, 0); });
  // the accepted /intro.webm route is unchanged: always the derivative, one identity lookup
  await withFetch({ get_public_intro_share: [{ share_path: SHARE_PATH }], get_public_identity: [IDENTITY], storage }, async calls => {
    assert.equal((await get("/@black/intro.webm")).status, 200);
    assert.deepEqual(calls.map(c => c.url.replace(/^.*\/(rpc|object)\//, "")), ["get_public_identity", `authenticated/intro-media/${IDENTITY.intro_derivative_path}`]);
  });
});

// ---------- 7. the editor's picker ----------
test("picker copy and the Intro section's dirty state", () => {
  assert.equal(formatThumbnailTime(5033), "0:05.03");
  assert.equal(formatThumbnailTime(61250), "1:01.25");
  assert.equal(normalizeThumbnailMs(0), null);
  assert.equal(normalizeThumbnailMs(5000), 5000);
  const saved = { jobId: JOB, thumbnailMs: 5000, shareState: "ready", durationMs: 8000, fps: 30 };
  assert.match(describeThumbnail(saved, 5000).text, /Discord shows the frame at 0:05\.00/);
  assert.equal(describeThumbnail({ ...saved, shareState: "pending" }, 5000).tone, "processing");
  assert.match(describeThumbnail({ ...saved, shareState: "failed" }, 5000).text, /could not be prepared/);
  assert.match(describeThumbnail({ ...saved, thumbnailMs: null }, null).text, /first frame/);
  assert.match(describeThumbnail(saved, 1200).text, /^Unsaved/);
  assert.equal(hasIntroChanges({ transitionKey: "fade", thumbnailMs: 5000 }, { transitionKey: "fade", thumbnailMs: 5000 }), false);
  assert.equal(hasIntroChanges({ transitionKey: "fade", thumbnailMs: 5000 }, { transitionKey: "fade", thumbnailMs: 1200 }), true);
  assert.equal(hasIntroChanges({ transitionKey: "fade", thumbnailMs: 5000 }, { transitionKey: "fade", thumbnailMs: null }), true);
  assert.equal(hasIntroChanges({ transitionKey: "fade" }, { transitionKey: "fade" }), false, "unchanged callers without a frame keep their behavior");
});

function fakeDocument() {
  const elements = new Map();
  const make = id => {
    const listeners = {}, attrs = {};
    const el = { id, hidden: false, disabled: false, textContent: "", className: "", value: "0", max: "0", step: "1", currentTime: 0, onloadedmetadata: null,
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); }, fire: async type => { for (const fn of listeners[type] || []) await fn(); },
      setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: k => attrs[k] ?? null, removeAttribute: k => { delete attrs[k]; }, load() {}, pause() {} };
    Object.defineProperty(el, "src", { get: () => attrs.src ?? "", set: v => { attrs.src = v; } });
    return el;
  };
  const doc = { visibilityState: "visible", defaultView: { setTimeout: () => 0, clearTimeout() {} }, getElementById: id => { if (!elements.has(id)) elements.set(id, make(id)); return elements.get(id); } };
  return { doc, $: id => doc.getElementById(id) };
}

test("picker: loads the saved Intro only on request, scrubs and steps by frames, previews the chosen frame, resets to the first frame, and stays hidden when disabled", async () => {
  const { doc, $ } = fakeDocument();
  let resolved = 0, changes = 0;
  const picker = mountIntroThumbnailPicker(doc, { resolveSource: async () => { resolved += 1; return { url: "blob:intro" }; }, loadState: async () => null, onChange: () => { changes += 1; } });
  picker.setSaved({ jobId: JOB, thumbnailMs: 5000, shareState: "ready", durationMs: 8000, fps: 30 });
  assert.equal($("introThumbnailPicker").hidden, true, "hidden until enabled");
  picker.setEnabled(true);
  assert.equal($("introThumbnailPicker").hidden, false);
  assert.equal(resolved, 0, "no Intro download just for opening the editor");
  assert.equal(picker.value, 5000, "the saved frame is restored");
  assert.match($("introThumbnailStatus").textContent, /0:05\.00/);
  await $("introThumbnailOpen").fire("click");
  assert.equal(resolved, 1);
  assert.equal($("introThumbnailVideo").src, "blob:intro");
  $("introThumbnailVideo").onloadedmetadata();
  assert.equal($("introThumbnailVideo").currentTime, 5, "the preview shows the saved frame");
  assert.equal($("introThumbnailRange").max, "7999");
  $("introThumbnailRange").value = "2500"; await $("introThumbnailRange").fire("input");
  assert.equal(picker.value, 2500);
  assert.equal($("introThumbnailVideo").currentTime, 2.5);
  await $("introThumbnailForward").fire("click");
  assert.equal(picker.value, 2533, "one frame at 30 fps");
  await $("introThumbnailBack").fire("click"); await $("introThumbnailBack").fire("click");
  assert.equal(picker.value, 2467);
  assert.match($("introThumbnailStatus").textContent, /^Unsaved/);
  await $("introThumbnailReset").fire("click");
  assert.equal(picker.value, null, "the first frame is the default (no share copy)");
  $("introThumbnailRange").value = "99999"; await $("introThumbnailRange").fire("input");
  assert.equal(picker.value, 7999, "clamped inside the Intro");
  assert.ok(changes >= 5);
  // a replaced / removed / processing Intro: hidden, unsaved choice dropped, video unloaded
  picker.setEnabled(false);
  assert.equal($("introThumbnailPicker").hidden, true);
  assert.equal(picker.value, 5000, "a disabled picker reports the saved frame (nothing to save)");
  assert.equal($("introThumbnailVideo").src, "");
  // a different active Intro starts at its default frame
  picker.setEnabled(true);
  picker.setSaved({ jobId: "other-job", thumbnailMs: null, shareState: null, durationMs: 4000, fps: 60 });
  assert.equal(picker.value, null);
  assert.match($("introThumbnailStatus").textContent, /first frame/);
});

test("editor wiring: the picker sits in the Intro section (desktop and mobile share it), saves with Save Changes, and only for the kept active Intro", () => {
  const html = text("dist/account/index.html"), account = text("dist/account/account.js"), client = text("dist/account/supabase-client.js");
  const panel = html.slice(html.indexOf('id="introSectionPanel"'), html.indexOf('id="previewIntroButton"'));
  for (const id of ["introThumbnailPicker", "introThumbnailOpen", "introThumbnailVideo", "introThumbnailRange", "introThumbnailBack", "introThumbnailForward", "introThumbnailReset", "introThumbnailStatus"]) assert.match(panel, new RegExp(`id="${id}"`), id);
  assert.match(account, /thumbnailMs:introThumbnail\.value/);
  assert.match(account, /introChange\.action==='keep'&&introThumbnail\.jobId&&introChange\.thumbnailMs!==savedIntro\?\.thumbnailMs\)await api\.setIntroThumbnail\(introThumbnail\.jobId,introChange\.thumbnailMs\)/);
  assert.match(account, /introThumbnail\.setEnabled\(Boolean\(!pendingIntroSource && introAction === "keep" && savedIntro\?\.activeJobId && !\["pending","processing"\]\.includes\(savedIntro\?\.latestJobState\)\)\)/);
  assert.match(account, /introThumbnail\.setSaved\(thumbnail\?\.jobId === intro\?\.active_job_id \? thumbnail : null\)/);
  assert.match(client, /rpc\("set_my_intro_thumbnail", \{ candidate_job_id:jobId, candidate_thumbnail_ms:thumbnailMs \?\? null \}\)/);
  assert.doesNotMatch(text("dist/account/intro-thumbnail.js").replace(/\/\/.*$/gm, ""), /type="file"|upload|FileReader|toBlob/i, "no image-upload thumbnail option in this phase");
  assert.doesNotMatch(panel.slice(panel.indexOf('id="introThumbnailPicker"')), /type="file"/, "the picker has no file input");
});

// ---------- 8. native (opt-in) ----------
test("native: a real D3 Intro -> share copy whose first frame is the chosen frame, every Intro frame unchanged one frame later, audio one frame later", { skip: process.env.GAMID_NATIVE_FFMPEG !== "1" && "set GAMID_NATIVE_FFMPEG=1 (needs ffmpeg + ffprobe)" }, async () => {
  const { encodeD3 } = await import("../worker/intro-worker.mjs");
  const dir = mkdtempSync(join(tmpdir(), "gamid-intro-share-native-"));
  try {
    for (const fps of ["30", "30000/1001", "60"]) {
      const src = join(dir, "src.mp4"), d3 = join(dir, "d3.webm"), out = join(dir, "share.webm");
      rmSync(src, { force: true }); rmSync(d3, { force: true }); rmSync(out, { force: true });
      // every frame a distinct flat grey (frame identity by luma), a beep at every whole second (sync by onset)
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=black:s=640x360:r=${fps}:d=4,geq=lum='mod(N*3\\,240)+8':cb=128:cr=128`,
        "-f", "lavfi", "-i", "aevalsrc='if(lt(mod(t\\,1)\\,0.05)\\,0.5*sin(2*PI*1000*t)\\,0)':s=48000:d=4", "-c:v", "libx264", "-crf", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", src]);
      await encodeD3(src, d3);
      const times = await videoFrameTimes(d3), plan = sharePlan(await probeShare(d3), times, 2000);
      await shareTools.encode(d3, out, plan);
      validateShare(plan, await probeShare(out), await videoFrameTimes(out), times, statSync(out).size);
      const luma = file => execFileSync("ffprobe", ["-v", "error", "-f", "lavfi", "-i", `movie=${file.replace(/\\/g, "/").replace(":", "\\\\:")},signalstats`, "-show_entries", "frame_tags=lavfi.signalstats.YAVG", "-of", "csv=p=0"]).toString().trim().split(/\r?\n/).map(Number);
      const a = luma(d3), b = luma(out);
      assert.equal(b.length, a.length + 1, fps);
      assert.ok(Math.abs(b[0] - a[plan.frame]) < 1, `${fps}: the first frame is the chosen one`);
      for (let i = 0; i < a.length; i += 1) assert.ok(Math.abs(a[i] - b[i + 1]) < 1, `${fps}: Intro frame ${i} unchanged, one frame later`);
      const onsets = file => { const pcm = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-map", "0:a", "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], { maxBuffer: 64 << 20 });
        const f = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4), found = []; let last = -1e9;
        for (let i = 0; i < f.length; i += 1) if (Math.abs(f[i]) > 0.2) { if (i - last > 24000) found.push(i); last = i; }
        return found; };
      const before = onsets(d3), after = onsets(out);
      assert.equal(after.length, before.length, fps);
      for (let i = 0; i < before.length; i += 1) assert.ok(Math.abs((after[i] - before[i]) / 48 - 1000 / plan.fps) < 1, `${fps}: beep ${i} moved by one frame (${(after[i] - before[i]) / 48} ms)`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
