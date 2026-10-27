// Infrastructure Optimization & Security Hardening V1 (Mazen's task 2026-10-27): the public Intro still poster (database, worker, player, page), the media
// route hardening of the Cloudflare Worker, and bounded pg_cron log retention.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POSTER, encodePoster, posterArgs, posterColor, posterPlan, processOneIntroPoster, validatePoster } from "../worker/intro-poster.mjs";
import { validateWebhookPayload } from "../worker/intro-dispatcher.mjs";
import worker, { acceptableRange, handleIntroRequest, withinRateLimit } from "../cf-worker/worker.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261027120000_intro_posters.sql");
const retention = read("supabase/migrations/20261027120100_cron_log_retention.sql");
const player = read("dist/account/intro-preview.js");
const client = read("dist/account/supabase-client.js");

const d3 = (over = {}) => ({ streams: [{ codec_type: "video", codec_name: "vp9", pix_fmt: "yuv420p", width: 1280, height: 720, sample_aspect_ratio: "1:1", ...over }], format: { duration: "3.0" } });
const times30 = Array.from({ length: 90 }, (_, i) => i / 30);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// worker: the frame, the colour matrix, the encode and its validation
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
test("poster frame: the last frame presented at or before the time (the share copy's rule); 0 = the first frame", () => {
  assert.equal(posterPlan(d3(), times30, 0).frame, 0);
  assert.equal(posterPlan(d3(), times30, 2000).frame, 60);
  assert.equal(posterPlan(d3(), times30, 2010).frame, 60, "between two frames: the earlier one, as a paused browser shows");
  assert.equal(posterPlan(d3(), times30.map(t => t + 0.007), 2000).frame, 60, "times are relative to the first frame");
  assert.deepEqual(posterPlan(d3(), times30, 3000), { ok: false, code: "THUMBNAIL_OUTSIDE_INTRO" });
});

test("poster colour: the matrix Chrome uses (measured): untagged / BT.709 -> bt709, BT.601 tags -> bt601; HDR, BT.2020 and other tags are refused", () => {
  assert.deepEqual(posterColor({}), { matrix: "bt709", range: "tv" });
  assert.deepEqual(posterColor({ color_space: "bt709", color_primaries: "bt709", color_transfer: "bt709" }), { matrix: "bt709", range: "tv" });
  assert.deepEqual(posterColor({ color_space: "smpte170m", color_primaries: "smpte170m", color_transfer: "smpte170m" }), { matrix: "bt601", range: "tv" });
  assert.deepEqual(posterColor({ color_space: "bt470bg" }), { matrix: "bt601", range: "tv" });
  assert.deepEqual(posterColor({ color_range: "pc" }), { matrix: "bt709", range: "pc" });
  for (const tag of [{ color_transfer: "smpte2084" }, { color_transfer: "arib-std-b67" }, { color_primaries: "bt2020" }, { color_space: "bt2020nc" }, { color_space: "fcc" }]) {
    assert.equal(posterColor(tag), null, JSON.stringify(tag));
  }
  assert.deepEqual(posterPlan(d3({ color_transfer: "smpte2084" }), times30, 0), { ok: false, code: "POSTER_COLOR_UNSUPPORTED" });
});

test("poster plan refuses anything that is not the accepted D3 shape or would need resizing", () => {
  assert.equal(posterPlan(d3({ codec_name: "h264" }), times30, 0).code, "INTRO_NOT_D3");
  assert.equal(posterPlan(d3({ sample_aspect_ratio: "4:3" }), times30, 0).code, "POSTER_NON_SQUARE_PIXELS");
  assert.equal(posterPlan(d3(), times30, 0, { width: 1920, height: 1080 }).code, "INTRO_CHANGED");
  assert.equal(posterPlan(d3(), [], 0).code, "INTRO_TIMING_UNREADABLE");
});

test("poster encode: ONE frame, the chosen matrix, no resize, lossy WebP q90 (the measured equivalent); q75 only when 90 is over 1 MiB", async () => {
  const plan = posterPlan(d3(), times30, 2000);
  const args = posterArgs("in.webm", "out.webp", plan);
  assert.equal(args[args.indexOf("-vf") + 1], "select=eq(n\\,60),scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24");
  assert.deepEqual(args.slice(args.indexOf("-frames:v"), args.indexOf("-frames:v") + 2), ["-frames:v", "1"]);
  assert.equal(args[args.indexOf("-quality") + 1], "90");
  assert.ok(!args.join(" ").includes("scale=w") && !/scale=\d/.test(args.join(" ")), "never resized");
  const sizes = [POSTER.maxBytes + 1, 400000], used = [];
  const r = await encodePoster("i", "o", plan, { encode: async (_i, _o, _p, q) => used.push(q), size: async () => sizes.shift() });
  assert.deepEqual(used, [90, 75]); assert.deepEqual(r, { quality: 75, bytes: 400000 });
  await assert.rejects(encodePoster("i", "o", plan, { encode: async () => {}, size: async () => POSTER.maxBytes + 1 }), /POSTER_TOO_LARGE/);
  assert.throws(() => validatePoster(plan, { streams: [{ codec_type: "video", codec_name: "webp", width: 640, height: 360 }] }, 10), /POSTER_GEOMETRY_CHANGED/);
  assert.throws(() => validatePoster(plan, { streams: [{ codec_type: "video", codec_name: "png", width: 1280, height: 720 }] }, 10), /INVALID_POSTER_IMAGE/);
});

function fakeBackend(job, calls) {
  const fetchImpl = async (url, init = {}) => {
    calls.push([url.replace("https://upvtrczefcvigxdyuylw.supabase.co", ""), init.method || "GET"]);
    if (url.includes("/rpc/worker_claim_intro_poster")) return Response.json(job ? [job] : []);
    if (url.includes("/rpc/worker_intro_poster_sweep")) return Response.json([{ object_path: "stale/a.webp" }]);
    if (url.includes("/rpc/")) return Response.json([]);
    if (url.includes("/object/authenticated/intro-media/")) return new Response(new Uint8Array(10));
    return new Response(null, { status: 200 });
  };
  return { backend: { url: "https://upvtrczefcvigxdyuylw.supabase.co", headers: ct => (ct ? { apikey: "k", "Content-Type": ct } : { apikey: "k" }) }, fetchImpl };
}
const JOB = { poster_id: "p1", claim_token: "t1", derivative_path: "u/j/intro-d3.webm", derivative_bytes: 10, poster_ms: 2000, poster_path: "u/j/p1/t1.webp", intro_width: 1280, intro_height: 720 };

test("worker: one queued poster end to end -> uploaded and completed with the claim, the Intro's own size and the measured bytes; then a sweep", async () => {
  const calls = [], uploads = [];
  const { backend, fetchImpl } = fakeBackend(JOB, calls);
  const tools = { probe: async p => (p.endsWith(".webp") ? { streams: [{ codec_type: "video", codec_name: "webp", width: 1280, height: 720 }] } : d3()), times: async () => times30,
    size: async p => (p.endsWith(".webp") ? 150000 : 10), encode: async () => {} };
  const r = await processOneIntroPoster(backend, { fetchImpl, tools, upload: async a => uploads.push(a.path) });
  assert.equal(r.state, "ready"); assert.equal(r.metrics.bytes, 150000);
  assert.deepEqual(uploads, ["u/j/p1/t1.webp"]);
  assert.ok(calls.some(([u]) => u === "/rest/v1/rpc/worker_complete_intro_poster"));
  assert.ok(calls.some(([u, m]) => u === "/storage/v1/object/intro-posters/stale/a.webp" && m === "DELETE"), "the storage-driven sweep");
});

test("worker: any failure is a typed fail with the claim token (the page keeps seeking the video); an empty queue only sweeps", async () => {
  const calls = [];
  const { backend, fetchImpl } = fakeBackend(JOB, calls);
  const r = await processOneIntroPoster(backend, { fetchImpl, tools: { probe: async () => d3({ color_transfer: "arib-std-b67" }), times: async () => times30, size: async () => 10, encode: async () => {} }, upload: async () => assert.fail("never uploads") });
  assert.deepEqual([r.state, r.code], ["failed", "POSTER_COLOR_UNSUPPORTED"]);
  assert.ok(calls.some(([u]) => u === "/rest/v1/rpc/worker_fail_intro_poster"));
  const idle = fakeBackend(null, []);
  assert.deepEqual(await processOneIntroPoster(idle.backend, { fetchImpl: idle.fetchImpl }), { processed: false });
});

test("worker image + dispatcher: the poster module ships, runs before the share copy in the same Job, and the dispatcher accepts its queue", () => {
  assert.match(read("worker/Dockerfile"), /COPY worker\/intro-poster\.mjs \.\/intro-poster\.mjs/);
  assert.match(read("worker/cloud-run/usage-testing.gcloudignore"), /^!worker\/intro-poster\.mjs$/m, "the Cloud Build allowlist ships it");
  assert.match(read("worker/cloud-run/deploy-intro-poster-testing.sh"), /for smoke in poster-smoke share-smoke f2-smoke rendition-smoke; do/);
  const w = read("worker/intro-worker.mjs");
  assert.ok(w.indexOf("processOneIntroPoster({") < w.indexOf("processOneIntroShare({"));
  assert.equal(validateWebhookPayload({ type: "INSERT", schema: "public", table: "intro_posters", record: { job_id: "x", state: "pending" } }), true);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// database
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
test("migration: a private WebP-only bucket read ONLY through the current-ready-poster-of-a-PUBLIC-GamID policy; worker RPCs for service_role only", () => {
  assert.match(migration, /values \('intro-posters', 'intro-posters', false, 1048576, array\['image\/webp'\]\)/);
  assert.match(migration, /using \(bucket_id = 'intro-posters' and private\.intro_poster_is_public\(name\)\);/);
  assert.match(migration, /e\.entity_type = 'SOLO' and e\.visibility = 'PUBLIC'\s+and private\.intro_poster_is_current\(r\.poster_id\)/);
  assert.match(migration, /revoke all on table public\.intro_posters from public, anon, authenticated;/);
  const visitorGrant = migration.match(/grant execute on function ([^;]+) to anon, authenticated;/)[1];
  assert.doesNotMatch(visitorGrant, /worker_|enqueue/);
  assert.match(migration, /public\.worker_intro_poster_sweep\(integer\)\nto service_role;/);
});

test("migration: posters are queued only by the database (active Intro / chosen frame), bounded per hour, never backfilled here", () => {
  assert.match(migration, /after insert or update of active_job_id, thumbnail_job_id, thumbnail_ms on public\.profile_intro_settings/);
  assert.match(migration, /interval '1 hour'\) >= 20;/);
  assert.doesNotMatch(migration, /insert into public\.intro_posters[^;]*select/i, "no backfill of existing Intros");
  assert.doesNotMatch(migration, /grant execute on function[^;]*enqueue_intro_posters[^;]*to (anon|authenticated)/);
});

test("migration: the visitor lookup keeps the earlier frame decision (chosen frame only while its share copy is ready) and the quota excludes posters", () => {
  assert.match(migration, /select c\.thumbnail_ms from private\.get_public_intro_share_impl\(candidate_handle\) c limit 1/);
  assert.match(migration, /x\.poster_ms = coalesce\(i\.chosen_ms, 0\) and x\.state = 'ready' and private\.intro_poster_is_current\(x\.poster_id\)/);
  assert.match(migration, /\$n\$o\.bucket_id not in \('wall-video-renditions','intro-share-copies','intro-posters'\)\$n\$/);
  assert.match(migration, /raise exception 'INTRO_POSTER_USAGE_PATCH_FAILED'/);
  assert.match(migration, /candidate_width is distinct from intro\.output_width or candidate_height is distinct from intro\.output_height/);
});

const gate = read("supabase/migrations/20261027140000_intro_poster_activation_gate.sql").replace(/^--.*$/gm, "");
const body = name => gate.slice(gate.indexOf(`create or replace function ${name}(`), gate.indexOf("$$;", gate.indexOf(`create or replace function ${name}(`)));

test("acceptance gate: posters only for activated profiles, seeded with the GM-TEST-01 fixture alone (exactly one or the migration aborts)", () => {
  assert.match(gate, /where e\.gamid_handle = 'gm_test_01' and e\.entity_type = 'SOLO';\s+get diagnostics added = row_count;\s+if added <> 1 then raise exception 'INTRO_POSTER_GATE_FIXTURE_NOT_FOUND'/);
  assert.equal((gate.match(/insert into private\.intro_poster_activation/g) || []).length, 1, "no other profile is activated");
  assert.match(gate, /revoke all on table private\.intro_poster_activation from public, anon, authenticated;/);
  assert.doesNotMatch(gate, /grant /i, "no new privilege");
});

test("acceptance gate: enforced at queueing, claiming, completing and serving", () => {
  assert.match(body("private.enqueue_intro_posters"), /if not private\.intro_poster_activated\(candidate_profile_id\) then return 0; end if;\s+select \* into settings/);
  const claim = body("private.worker_claim_intro_poster_impl");
  assert.match(claim, /set state = 'superseded', failure_code = 'INTRO_POSTER_NOT_ACTIVATED'[^;]+not private\.intro_poster_activated\(r\.profile_id\);/);
  assert.match(claim, /and private\.intro_poster_activated\(r\.profile_id\)\s+order by r\.created_at for update skip locked limit 1;/);
  assert.match(body("private.worker_complete_intro_poster_impl"), /if not private\.intro_poster_activated\(job\.profile_id\) then raise exception using errcode = '22023', message = 'INTRO_POSTER_NOT_ACTIVATED'/);
  assert.match(body("private.intro_poster_is_public"), /and private\.intro_poster_activated\(r\.profile_id\)/);
  const lookup = body("private.get_public_intro_poster_impl");
  assert.match(lookup, /x\.state = 'ready' and private\.intro_poster_activated\(i\.profile_id\)/);
  assert.match(lookup, /select i\.chosen_ms, r\.poster_path/, "poster_ms is unchanged for every account; only the poster is gated");
});

test("cron retention: one daily job deletes only FINISHED run-log rows older than 7 days; the reconcile job is untouched", () => {
  assert.match(retention, /select cron\.schedule\(\s*'gamid-cron-log-retention',\s*'17 3 \* \* \*',\s*\$\$delete from cron\.job_run_details where end_time is not null and end_time < now\(\) - interval '7 days'\$\$\s*\);/);
  const sql = retention.replace(/^--.*$/gm, "");
  assert.doesNotMatch(sql, /cron\.unschedule\(|alter_job|play-together-voice-reconcile-testing/);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// player + page
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
test("player: with a poster the waiting Intro is NOT loaded (preload none, no seek); Play is still the only play() and starts at 0:00", () => {
  assert.match(player, /v\.preload=still&&awaitPlay\?"none":"metadata";if\(still\)\{v\.poster=still\.url;/);
  assert.match(player, /showStill\(config\.still,awaitPlay\);els\.introVideo\.src=config\.videoUrl;/, "preload is set before the source");
  assert.match(player, /if\(awaitPlay&&still\)\{applyVideoFit\(\);offerLandscape\(\);\}else els\.introVideo\.currentTime=awaitPlay\?posterSeconds\(config\.posterMs\):0;/);
  assert.equal(player.match(/els\.introVideo\.play\(\)/g).length, 1);
  assert.match(player, /els\.introVideo\.currentTime=0;\}els\.introVideo\.play\(\)/);
  assert.match(player, /else\{v\.removeAttribute\("poster"\);/, "without a poster (editor, Replay) the element is exactly as before");
});

test("page: the poster is read anonymously through the storage policy as a local image; any failure falls back to the earlier seek", () => {
  const fn = client.slice(client.indexOf("export async function getPublicIntroPoster("), client.indexOf("export async function getPublicProfileExtras"));
  assert.match(fn, /rpc\("get_public_intro_poster", \{ candidate_handle: handle \}, \{ anonymous: true \}\)/);
  assert.match(fn, /catch \{ return \{ posterMs: await getPublicIntroPosterMs\(handle\), still: null \}; \}/);
  assert.match(fn, /\/storage\/v1\/object\/authenticated\/intro-posters\/\$\{encodeStoragePath\(row\.poster_path\)\}`, \{ headers: \{ apikey: PUBLISHABLE_KEY \} \}/);
  assert.match(fn, /if \(!response\.ok\) return \{ posterMs, still: null \};/);
  assert.doesNotMatch(read("dist/account/account.js"), /still:|config\.still|getPublicIntroPoster/, "the editor never uses a poster");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Cloudflare Worker media routes
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
test("Range: exactly one well-formed byte range or none", () => {
  for (const ok of [null, "bytes=0-", "bytes=0-1023", "bytes=100-100", "bytes=-500", " bytes=0-1 "]) assert.equal(acceptableRange(ok), true, String(ok));
  for (const bad of ["bytes=0-1,2-3", "bytes=0-1, 5-", "bytes=5-1", "items=0-1", "bytes=", "bytes=-", "bytes=abc", "bytes=0-1;x", `bytes=${"9".repeat(16)}-`]) assert.equal(acceptableRange(bad), false, bad);
});

const req = (path, { range, ua, ip = "203.0.113.9", method = "GET" } = {}) => new Request(`https://w.test${path}`, { method, headers: { ...(range ? { range } : {}), ...(ua ? { "user-agent": ua } : {}), "cf-connecting-ip": ip } });

test("rate limits: media per IP + handle, page per IP, Discord's crawler on its own higher tier; a missing or failing binding never blocks", async () => {
  const seen = [];
  const limiter = name => ({ limit: async ({ key }) => { seen.push([name, key]); return { success: true }; } });
  const env = { MEDIA_LIMITER: limiter("media"), CRAWLER_LIMITER: limiter("crawler"), PAGE_LIMITER: limiter("page") };
  await withinRateLimit(env, req("/@a/intro.webm"), "media", "a");
  await withinRateLimit(env, req("/@a"), "page");
  await withinRateLimit(env, req("/@a/intro.webm", { ua: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)" }), "media", "a");
  assert.deepEqual(seen, [["media", "media|203.0.113.9|a"], ["page", "page|203.0.113.9|"], ["crawler", "media|203.0.113.9|a"]]);
  assert.equal(await withinRateLimit({}, req("/@a"), "page"), true);
  assert.equal(await withinRateLimit({ PAGE_LIMITER: { limit: async () => { throw new Error("down"); } } }, req("/@a"), "page"), true);
  assert.equal(await withinRateLimit({ PAGE_LIMITER: { limit: async () => ({ success: false }) } }, req("/@a"), "page"), false);
});

test("media routes: a bad Range is 416 and an exceeded limit 429, both before any lookup; the page route is limited too", async (t) => {
  const real = globalThis.fetch; let upstream = 0;
  globalThis.fetch = async () => { upstream += 1; return new Response("[]", { headers: { "content-type": "application/json" } }); };
  t.after(() => { globalThis.fetch = real; });
  const assets = { fetch: async () => new Response("<html></html>") };
  assert.equal((await worker.fetch(req("/@black/intro.webm", { range: "bytes=0-1,5-9" }), { ASSETS: assets })).status, 416);
  assert.equal((await worker.fetch(req("/@black/intro-discord.webm", { range: "bytes=9-1" }), { ASSETS: assets })).status, 416);
  const deny = { limit: async () => ({ success: false }) };
  const limited = await worker.fetch(req("/@black/intro.webm"), { ASSETS: assets, MEDIA_LIMITER: deny });
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60"); assert.equal(limited.headers.get("cache-control"), "no-store");
  assert.equal((await worker.fetch(req("/@black"), { ASSETS: assets, PAGE_LIMITER: deny })).status, 429);
  assert.equal(upstream, 0, "nothing reached Supabase");
});

test("HEAD on a media route cancels the upstream body at once (headers only, no streamed-and-discarded Intro)", async (t) => {
  const real = globalThis.fetch; let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } }), { status: 200, headers: { "content-type": "video/webm", "content-length": "7000000" } });
  t.after(() => { globalThis.fetch = real; });
  const res = await handleIntroRequest(req("/@a/intro.webm", { method: "HEAD" }), { valid: true }, { intro_derivative_path: "u/j/intro-d3.webm" });
  assert.equal(res.status, 200); assert.equal(res.body, null); assert.equal(res.headers.get("content-length"), "7000000"); assert.equal(cancelled, true);
});
