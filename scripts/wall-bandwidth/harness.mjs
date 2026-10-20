// GamID Public Wall bandwidth baseline harness (Playwright + Chrome DevTools Protocol). READ-ONLY: an anonymous visitor of a published Wall on TESTING.
// Usage: node scripts/wall-bandwidth/harness.mjs <profile desktop|mobile> <runLabel> [--plan full|key|revisit] [--simulate-shared-leases] [--throttle] [--handle black] [--out <dir>] [--playwright <dir with node_modules/playwright>]
// Protocol and the 2026-10-20 baseline: docs/WALL-BANDWIDTH-BASELINE.md.
// Output: <outDir>/<profile>-<run>.json - every network request (sanitized: no query strings, no tokens, storage object paths hashed), per-phase byte attribution,
// video element telemetry and page timing. Bytes = CDP encodedDataLength (bytes received from the network incl. headers); cache reads are kept separate.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const profile = args[0] ?? "desktop", runLabel = args[1] ?? "r1";
const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
// Playwright is not a dependency of this repository: it is resolved from --playwright (default: the sibling gamid-monitor checkout)
const require = createRequire(join(opt("playwright") ?? join(process.cwd(), "..", "gamid-monitor"), "package.json"));
const { chromium, devices } = require("playwright");
const plan = opt("plan") ?? "full", handle = opt("handle") ?? "black", throttle = args.includes("--throttle");
// --simulate-shared-leases (research only, F6 planning 2026-10-21): the revisit tab starts with the first tab's F4 URL cache, i.e. what cross-tab lease reuse would do
const simulateSharedLeases = args.includes("--simulate-shared-leases");
const F4_CACHE_KEY = "gamid.testing.published-wall-video-urls.v1";
const SITE = "https://gamid-testing-static.gamid.workers.dev";
const OUT = opt("out") ?? join(tmpdir(), "gamid-wall-bandwidth");   // outside the repository: run files are local evidence (they contain hashed paths only)
mkdirSync(OUT, { recursive: true });

const hash = s => createHash("sha256").update(String(s)).digest("hex").slice(0, 10);
// sanitize: host + path, query dropped; storage object paths -> <bucket>/<hash>.<ext>; edge-function / rpc names kept
function describe(raw) {
  let u; try { u = new URL(raw); } catch { return { host: "?", path: "?", kind: "other" }; }
  if (u.protocol === "blob:" || u.protocol === "data:") return { host: u.protocol, path: "", kind: "local" };
  let path = u.pathname, kind = "other";
  const storage = path.match(/^\/storage\/v1\/object\/(sign|authenticated|public)\/([^/]+)\/(.+)$/);
  if (storage) { const ext = (storage[3].match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase(); path = `/storage/v1/object/${storage[1]}/${storage[2]}/${hash(decodeURIComponent(storage[3]))}.${ext}`; kind = `storage:${storage[1]}:${storage[2]}`; }
  else if (/\/rest\/v1\/rpc\//.test(path)) kind = "api:rpc";
  else if (/\/rest\/v1\//.test(path)) kind = "api:rest";
  else if (/\/functions\/v1\//.test(path)) kind = `api:function:${path.split("/")[3]}`;
  else if (/\/realtime\//.test(path)) kind = "api:realtime";
  else if (/\/auth\/v1\//.test(path)) kind = "api:auth";
  else if (u.host.endsWith("workers.dev")) kind = "site";
  return { host: u.host, path, kind };
}
const KEEP_HEADERS = ["content-type", "content-length", "content-range", "cache-control", "cf-cache-status", "age", "accept-ranges", "content-encoding", "vary", "x-served-by", "server"];
const pick = headers => { const out = {}; for (const [k, v] of Object.entries(headers ?? {})) if (KEEP_HEADERS.includes(k.toLowerCase())) out[k.toLowerCase()] = String(v).slice(0, 120); return out; };

const userDataDir = mkdtempSync(join(tmpdir(), "gamid-bw-"));   // empty profile = cold HTTP cache
const device = profile === "mobile" ? { ...devices["Pixel 7"] } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const ctx = await chromium.launchPersistentContext(userDataDir, { channel: "chrome", headless: true, ...device });
const browserVersion = ctx.browser()?.version() ?? null;
const pages = [];
const requests = new Map();   // key: `${tab}:${requestId}`
const phases = [];            // { name, tab, t0, t1 }
let phase = "setup";
const phaseBytes = {};
const addPhaseBytes = (p, n) => { phaseBytes[p] = (phaseBytes[p] ?? 0) + n; };
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
function setPhase(name) { const last = phases[phases.length - 1]; if (last && last.t1 == null) last.t1 = now(); phases.push({ name, t0: now(), t1: null }); phase = name; console.log(`[${now().toFixed(1)}s] phase ${name}`); }

async function instrument(page, tab) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable", { maxTotalBufferSize: 0, maxResourceBufferSize: 0 });
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  // --throttle: a Fast-4G-like link (9 Mbit/s down, 1.5 Mbit/s up, 150 ms RTT) - Chrome then buffers media less eagerly than on an unthrottled link
  if (throttle) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
  const rec = id => { const key = `${tab}:${id}`; if (!requests.has(key)) requests.set(key, { tab, id, chunks: 0, chunkPhases: {} }); return requests.get(key); };
  cdp.on("Network.requestWillBeSent", e => {
    const r = rec(e.requestId);
    if (e.redirectResponse && r.url) { r.redirects = (r.redirects ?? 0) + 1; }
    Object.assign(r, { ...describe(e.request.url), url: undefined, method: e.request.method, type: e.type, startPhase: r.startPhase ?? phase, t: r.t ?? now(), range: e.request.headers?.Range ?? e.request.headers?.range ?? r.range ?? null, initiator: e.initiator?.type });
  });
  cdp.on("Network.requestWillBeSentExtraInfo", e => { const r = rec(e.requestId); const range = e.headers?.Range ?? e.headers?.range; if (range) r.range = range; });
  cdp.on("Network.responseReceived", e => {
    const r = rec(e.requestId), res = e.response;
    Object.assign(r, { status: res.status, mime: res.mimeType, fromDiskCache: !!res.fromDiskCache, fromServiceWorker: !!res.fromServiceWorker, fromPrefetchCache: !!res.fromPrefetchCache, headers: pick(res.headers), protocol: res.protocol, type: e.type ?? r.type });
  });
  cdp.on("Network.responseReceivedExtraInfo", e => { const r = rec(e.requestId); r.headersRaw = { ...(r.headersRaw ?? {}), ...pick(e.headers) }; r.statusRaw = e.statusCode; });
  cdp.on("Network.requestServedFromCache", e => { rec(e.requestId).memoryCache = true; });
  cdp.on("Network.dataReceived", e => { const r = rec(e.requestId); r.chunks += e.encodedDataLength; r.chunkPhases[phase] = (r.chunkPhases[phase] ?? 0) + e.encodedDataLength; r.decoded = (r.decoded ?? 0) + e.dataLength; });
  cdp.on("Network.loadingFinished", e => { const r = rec(e.requestId); r.finished = true; r.encoded = e.encodedDataLength; r.endPhase = phase; });
  cdp.on("Network.loadingFailed", e => { const r = rec(e.requestId); r.failed = e.errorText; r.canceled = !!e.canceled; r.endPhase = phase; });
  page.on("pageerror", err => pageErrors.push(`${tab}: ${String(err).slice(0, 200)}`));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(`${tab}: ${m.text().replace(/https?:\/\/\S+/g, "<url>").slice(0, 200)}`); });
  return cdp;
}
const pageErrors = [], consoleErrors = [];

// --- page-side telemetry: video events + playback quality, Web Vitals --------------------------------------------------------------------------------------
const TELEMETRY = () => {
  window.__bw = { events: [], vitals: {} };
  const watch = v => {
    if (v.__bwWatched) return; v.__bwWatched = true;
    const id = v.__bwId = `v${(window.__bwN = (window.__bwN ?? 0) + 1)}`;
    for (const type of ["loadstart", "loadedmetadata", "playing", "waiting", "stalled", "error", "ended", "seeking", "seeked", "pause", "suspend", "emptied"]) v.addEventListener(type, () => window.__bw.events.push({ id, type, t: performance.now() / 1000, ct: v.currentTime }));
  };
  new MutationObserver(() => document.querySelectorAll("video").forEach(watch)).observe(document, { childList: true, subtree: true });
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) window.__bw.vitals.lcp = e.startTime / 1000; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.name === "first-contentful-paint") window.__bw.vitals.fcp = e.startTime / 1000; }).observe({ type: "paint", buffered: true }); } catch {}
};
const videoState = page => page.evaluate(() => [...document.querySelectorAll("#publicWall video")].map(v => {
  const stage = v.closest(".wall-stage"); const stages = [...document.querySelectorAll("#publicWall .wall-stage")];
  const played = []; for (let i = 0; i < v.played.length; i++) played.push([+v.played.start(i).toFixed(2), +v.played.end(i).toFixed(2)]);
  const q = v.getVideoPlaybackQuality?.();
  const r = v.getBoundingClientRect();
  return { id: v.__bwId ?? null, stage: stages.indexOf(stage) + 1, hasSrc: !!v.getAttribute("src") || !!v.currentSrc, duration: Number.isFinite(v.duration) ? +v.duration.toFixed(2) : null, ct: +v.currentTime.toFixed(2), paused: v.paused, preload: v.preload, readyState: v.readyState, networkState: v.networkState,
    videoWidth: v.videoWidth, videoHeight: v.videoHeight, box: [Math.round(r.width), Math.round(r.height)], inView: r.bottom > 0 && r.top < innerHeight, played, dropped: q?.droppedVideoFrames ?? null, frames: q?.totalVideoFrames ?? null, error: v.error?.code ?? null, isBackground: !!v.closest(".wall-bg, [data-bg], .wall-stage-bg") };
}));
const wait = (page, ms) => page.waitForTimeout(ms);

async function openWall(page, label) {
  setPhase(`${label}:load`);
  const nav = Date.now();
  await page.goto(`${SITE}/@${handle}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // the Intro plays first; the Wall replaces it after the Intro's transition (html.is-public-wall). A visitor who must tap to start the Intro is simulated by one tap.
  let shown = false, tapped = false;
  for (let i = 0; i < 120 && !shown; i++) {
    shown = await page.evaluate(() => document.documentElement.classList.contains("is-public-wall")).catch(() => false);
    if (!shown && i === 20 && !tapped) { tapped = true; }
    if (!shown) await wait(page, 500);
  }
  const wallShownAfter = (Date.now() - nav) / 1000;
  setPhase(`${label}:settle`);
  await wait(page, 5000);
  const timing = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { ttfb: n ? +(n.responseStart / 1000).toFixed(3) : null, dcl: n ? +(n.domContentLoadedEventEnd / 1000).toFixed(3) : null, load: n ? +(n.loadEventEnd / 1000).toFixed(3) : null, ...window.__bw?.vitals }; });
  return { shown, wallShownAfter, timing };
}
const stageCount = page => page.evaluate(() => document.querySelectorAll("#publicWall .wall-stage").length);
const scrollToStage = (page, i) => page.evaluate(i => { const s = document.querySelectorAll("#publicWall .wall-stage")[i - 1]; if (s) window.scrollTo({ top: s.getBoundingClientRect().top + scrollY, behavior: "instant" }); }, i);
// plays the stage's videos (those with a source) until each one's played ranges cover its whole duration (or a cap), then optionally one more loop
async function playStage(page, i, { extraLoop = false, cap = 120 } = {}) {
  await scrollToStage(page, i); await wait(page, 1500);
  const start = Date.now();
  let vids = [];
  while ((Date.now() - start) / 1000 < cap) {
    vids = (await videoState(page)).filter(v => v.stage === i && v.inView);
    const full = v => v.duration && v.played.reduce((s, [a, b]) => s + (b - a), 0) >= v.duration * 0.97;
    if (vids.length && vids.every(v => v.error || full(v))) break;
    if (!vids.length) break;
    await wait(page, 1000);
  }
  if (extraLoop && vids.length) { const longest = Math.max(...vids.map(v => v.duration ?? 0)); await wait(page, Math.min(cap, longest + 1) * 1000); }
  return { stage: i, seconds: (Date.now() - start) / 1000, videos: await videoState(page).then(all => all.filter(v => v.stage === i)) };
}

const report = { handle, profile, run: runLabel, plan, throttle: throttle ? "9 Mbit/s down, 1.5 Mbit/s up, 150 ms RTT (CDP Network.emulateNetworkConditions)" : "none", site: SITE, browserVersion, device: profile === "mobile" ? "Playwright devices['Pixel 7'] (412x915, DPR 2.625, touch, mobile UA)" : "1440x900 DPR 1", startedAt: new Date().toISOString(), loads: {}, playback: {} };
try {
  const page = await ctx.newPage(); pages.push(page);
  await page.addInitScript(TELEMETRY);
  await instrument(page, "tab1");
  // 1. cold first visit (empty profile)
  report.loads.cold = await openWall(page, "1-cold");
  report.stages = await stageCount(page);
  report.videosAfterCold = await videoState(page);
  report.deployStamp = await page.evaluate(() => [...document.querySelectorAll("script[src],link[href]")].map(n => (n.src || n.href).match(/[?&]v=([0-9a-f]{7,40})/)?.[1]).filter(Boolean)[0] ?? null);
  if (plan === "full") {
    // 3. idle 30 s at the top
    setPhase("3-idle30"); await wait(page, 30000);
    // 4. every stage
    setPhase("4-stages"); for (let i = 1; i <= report.stages; i++) { await scrollToStage(page, i); await wait(page, 8000); await page.screenshot({ path: join(OUT, `${profile}-${runLabel}-stage${i}.png`) }); }
    // 5. back to the visited stages
    setPhase("5-return"); for (let i = report.stages - 1; i >= 1; i--) { await scrollToStage(page, i); await wait(page, 5000); }
    // 6. every video completely
    setPhase("6-play-all"); report.playback.playAll = []; for (let i = 1; i <= report.stages; i++) report.playback.playAll.push(await playStage(page, i));
    // 7. replay (one more full loop per stage)
    setPhase("7-replay"); report.playback.replay = []; for (let i = 1; i <= report.stages; i++) report.playback.replay.push(await playStage(page, i, { extraLoop: true, cap: 60 }));
    // 8. pause / resume (stage 1)
    setPhase("8-pause-resume"); await scrollToStage(page, 1); await wait(page, 1500);
    await page.evaluate(() => document.querySelectorAll("#publicWall video").forEach(v => { if (!v.paused) { v.__bwWasPlaying = true; v.pause(); } }));
    await wait(page, 10000);
    await page.evaluate(() => document.querySelectorAll("#publicWall video").forEach(v => { if (v.__bwWasPlaying) v.play().catch(() => {}); }));
    await wait(page, 8000);
    // 9. seek forward and backward (every video with a source, on its own stage)
    setPhase("9-seek"); for (let i = 1; i <= report.stages; i++) {
      await scrollToStage(page, i); await wait(page, 1500);
      await page.evaluate(i => document.querySelectorAll("#publicWall .wall-stage")[i - 1]?.querySelectorAll("video").forEach(v => { if (Number.isFinite(v.duration) && v.duration > 2) v.currentTime = v.duration * 0.8; }), i); await wait(page, 4000);
      await page.evaluate(i => document.querySelectorAll("#publicWall .wall-stage")[i - 1]?.querySelectorAll("video").forEach(v => { if (Number.isFinite(v.duration) && v.duration > 2) v.currentTime = v.duration * 0.2; }), i); await wait(page, 4000);
    }
    // 2 + 10. warm reload in the same tab (sessionStorage keeps F4's signed URLs) and play everything again
    report.loads.reload = await openWall(page, "10-reload");
    setPhase("10-reload-play"); report.playback.afterReload = []; for (let i = 1; i <= report.stages; i++) report.playback.afterReload.push(await playStage(page, i, { cap: 90 }));
    // second visit: a NEW tab of the same browser profile (warm disk cache, new tab session = new signed URLs)
    const page2 = await ctx.newPage(); pages.push(page2);
    await page2.addInitScript(TELEMETRY);
    await instrument(page2, "tab2");
    await page.close();
    report.loads.secondVisit = await openWall(page2, "11-second-visit");
    setPhase("11-second-visit-play"); report.playback.secondVisit = []; for (let i = 1; i <= report.stages; i++) report.playback.secondVisit.push(await playStage(page2, i, { cap: 90 }));
  } else if (plan === "revisit") {
    // revisit plan: cold load + every stage, then a NEW tab of the same profile + every stage (optionally carrying the F4 URL cache across tabs)
    setPhase("4-stages"); for (let i = 1; i <= report.stages; i++) { await scrollToStage(page, i); await wait(page, 8000); }
    const carried = simulateSharedLeases ? await page.evaluate(k => sessionStorage.getItem(k), F4_CACHE_KEY) : null;
    report.simulatedSharedLeases = simulateSharedLeases ? { carriedEntries: carried ? JSON.parse(carried).length : 0 } : null;
    const page2 = await ctx.newPage(); pages.push(page2);
    await page2.addInitScript(TELEMETRY);
    if (carried) await page2.addInitScript(([k, v]) => { try { sessionStorage.setItem(k, v); } catch {} }, [F4_CACHE_KEY, carried]);
    await instrument(page2, "tab2");
    await page.close();
    report.loads.secondVisit = await openWall(page2, "11-second-visit");
    setPhase("11-second-visit-stages"); for (let i = 1; i <= report.stages; i++) { await scrollToStage(page2, i); await wait(page2, 8000); }
  } else {
    // key plan: cold load, every stage, every video once
    setPhase("4-stages"); for (let i = 1; i <= report.stages; i++) { await scrollToStage(page, i); await wait(page, 8000); }
    setPhase("6-play-all"); report.playback.playAll = []; for (let i = 1; i <= report.stages; i++) report.playback.playAll.push(await playStage(page, i));
    report.loads.reload = await openWall(page, "10-reload");
    setPhase("10-reload-stages"); for (let i = 1; i <= report.stages; i++) { await scrollToStage(page, i); await wait(page, 8000); }
  }
  setPhase("end");
} catch (error) { report.error = String(error).slice(0, 500); console.log("ERROR", report.error); }
finally {
  const last = phases[phases.length - 1]; if (last && last.t1 == null) last.t1 = now();
  report.phases = phases;
  // per-request totals; network bytes only for requests not served from any cache
  const list = [...requests.values()].filter(r => r.kind !== "local" && r.host);
  for (const r of list) {
    // network bytes = what CDP says arrived from the network (encodedDataLength); Chrome flags some media range fills "fromDiskCache" while bytes still arrive,
    // so the flag alone is not a cache read: a cache read is a flagged response with (almost) no network bytes
    const wire = Math.max(r.finished ? (r.encoded ?? 0) : 0, r.chunks ?? 0);
    const flagged = r.memoryCache ? "memory" : r.fromDiskCache ? "disk" : r.fromPrefetchCache ? "prefetch" : r.fromServiceWorker ? "sw" : null;
    r.cache = flagged && wire < 1024 ? flagged : null;
    r.cacheFlaggedWithBytes = flagged && wire >= 1024 ? flagged : null;
    r.netBytes = r.cache ? 0 : wire;
    if (!r.cache) { let attributed = 0; for (const [p, n] of Object.entries(r.chunkPhases)) { addPhaseBytes(p, n); attributed += n; } if (r.netBytes > attributed) addPhaseBytes(r.startPhase, r.netBytes - attributed); }
    delete r.url; delete r.id;
  }
  report.requests = list;
  report.phaseBytes = phaseBytes;
  report.pageErrors = pageErrors; report.consoleErrors = consoleErrors.slice(0, 50);
  report.videoEvents = await Promise.all(pages.filter(p => !p.isClosed()).map(p => p.evaluate(() => window.__bw?.events ?? []).catch(() => [])));
  writeFileSync(join(OUT, `${profile}-${runLabel}.json`), JSON.stringify(report, null, 1));
  const total = list.reduce((s, r) => s + r.netBytes, 0);
  console.log(`DONE ${profile}-${runLabel}: ${list.length} requests, ${(total / 1e6).toFixed(2)} MB on the wire`);
  await ctx.close();
}
