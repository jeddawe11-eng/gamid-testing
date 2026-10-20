// F6-A live security validation on TESTING (anonymous visitor, read-only). Server state is NEVER changed: unpublished / disabled / private / removed /
// republished states are simulated by rewriting the anonymous RPC responses inside this test browser only. Nothing secret is printed: counts, hashed object
// ids and booleans only. Usage: node scripts/wall-bandwidth/f6a-security.mjs [--playwright <dir>] [--handle black] [--other zshot]
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const require = createRequire(join(opt("playwright", join(process.cwd(), "..", "gamid-monitor")), "package.json"));
const { chromium } = require("playwright");
const SITE = "https://gamid-testing-static.gamid.workers.dev", HANDLE = opt("handle", "black"), OTHER = opt("other", "zshot");
const KEY = "gamid.testing.published-wall-video-urls.v2";
const h = s => createHash("sha256").update(String(s)).digest("hex").slice(0, 10);
let fails = 0; const check = (name, ok, detail) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); };

function instrument(page) {
  const log = { leases: { wall: 0, intro: 0, failed: 0 }, videoObjects: new Map(), console: [], tokenToForeignHost: 0, keyInRequests: 0, pageErrors: [] };
  page.on("request", req => {
    const url = req.url();
    if (/\/functions\/v1\/public-media$/.test(url) && req.method() === "POST") { try { const body = JSON.parse(req.postData() ?? "{}"); if (body.bucket === "intro-media") log.leases.intro++; else log.leases.wall++; } catch {} }
    const m = url.match(/\/storage\/v1\/object\/sign\/(wall-video(?:-derived)?)\/([^?]+)/);
    if (m) { const id = h(decodeURIComponent(m[2])); log.videoObjects.set(id, (log.videoObjects.get(id) ?? 0) + 1); }
    if (/[?&]token=/.test(url) && !/\.supabase\.co$/.test(new URL(url).host)) log.tokenToForeignHost++;
    if (url.includes(KEY) || (req.postData() ?? "").includes(KEY)) log.keyInRequests++;
  });
  page.on("requestfailed", req => { if (/public-media/.test(req.url())) log.leases.failed++; });
  page.on("console", msg => log.console.push(msg.text()));
  page.on("pageerror", err => log.pageErrors.push(String(err).slice(0, 200)));
  return log;
}
const stored = page => page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k) ?? "[]").map(([key]) => JSON.parse(key)); } catch { return "corrupt"; } }, KEY);
const handlesIn = keys => [...new Set((Array.isArray(keys) ? keys : []).map(k => k[3]))].sort();
async function open(page, handle = HANDLE) {
  await page.goto(`${SITE}/@${handle}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let i = 0; i < 90; i++) { const state = await page.evaluate(() => ({ wall: document.documentElement.classList.contains("is-public-wall"), nf: !document.getElementById("notFoundState")?.hidden })); if (state.wall || state.nf) break; await page.waitForTimeout(500); }
  await page.waitForTimeout(3000);
}
const playable = page => page.evaluate(() => [...document.querySelectorAll("#publicWall video")].filter(v => v.getAttribute("src")).map(v => ({ ready: v.readyState, err: v.error?.code ?? null })));
// rewrite one anonymous RPC response in this browser only
const rewrite = (ctx, rpc, change) => ctx.route(`**/rest/v1/rpc/${rpc}`, async route => { const response = await route.fetch(); let body = await response.json(); body = change(body); await route.fulfill({ response, body: JSON.stringify(body) }); });

const dir = mkdtempSync(join(tmpdir(), "gamid-f6a-sec-"));
let ctx = await chromium.launchPersistentContext(dir, { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
try {
  // S1 published Wall, anonymous: entries are scoped to this Wall, publication and asset
  let page = await ctx.newPage(); let log = instrument(page);
  let manifest = null; page.on("response", async r => { if (r.url().endsWith("/rpc/get_public_wall")) { try { const j = await r.json(); manifest = Array.isArray(j) ? j[0] : j; } catch {} } });
  await open(page);
  const videos = (manifest?.assets ?? []).filter(a => /^video\//.test(a.mime_type));
  let keys = await stored(page);
  check("S1 published Wall: one scoped entry per published video (handle, publication, asset id)", Array.isArray(keys) && keys.length === videos.length && keys.every(k => k[3] === HANDLE && k[4] === manifest.published_at && videos.some(v => v.asset_id === k[5] && v.storage_path === k[2])), { entries: keys.length, videos: videos.length });
  check("S1 leases: one per video at most, none failed", log.leases.wall <= videos.length && log.leases.failed === 0, log.leases);
  // S2 same-tab reload
  log = instrument(page); await page.reload({ waitUntil: "domcontentloaded" }); await open(page);
  check("S2 same-tab reload: no new Wall video lease", log.leases.wall === 0, log.leases);
  // S3 new tab
  const tab = await ctx.newPage(); const tabLog = instrument(tab); await open(tab);
  check("S3 new tab: no new Wall video lease (cross-tab reuse)", tabLog.leases.wall === 0, tabLog.leases);
  await tab.close();
  // S4 expiry margin: entries aged past issue + 6 h - 30 min are never used, the page signs again and replaces them
  await page.evaluate(k => { const saved = JSON.parse(localStorage.getItem(k)); for (const item of saved) item[1].issued -= 5.6 * 3600 * 1000; localStorage.setItem(k, JSON.stringify(saved)); }, KEY);
  log = instrument(page); await page.reload({ waitUntil: "domcontentloaded" }); await open(page);
  keys = await stored(page);
  check("S4 an entry inside the 30-minute margin is not reused: every video signed again", log.leases.wall === videos.length && keys.length === videos.length, log.leases);
  // S5 removed media: the manifest no longer lists one video -> its entry leaves the browser and its URL is never requested
  const removed = videos[0];
  await rewrite(ctx, "get_public_wall", body => { const row = Array.isArray(body) ? body[0] : body; if (row) row.assets = row.assets.filter(a => a.asset_id !== removed.asset_id); return body; });
  log = instrument(page); await page.reload({ waitUntil: "domcontentloaded" }); await open(page);
  keys = await stored(page);
  check("S5 removed media: its entry is dropped, its object is not requested, others kept", !keys.some(k => k[5] === removed.asset_id) && keys.length === videos.length - 1 && !log.videoObjects.has(h(removed.storage_path)), { entries: keys.length });
  await ctx.unroute("**/rest/v1/rpc/get_public_wall");
  // S6 republished (new published_at): old-publication entries are not reused
  await rewrite(ctx, "get_public_wall", body => { const row = Array.isArray(body) ? body[0] : body; if (row) row.published_at = "2099-01-01T00:00:00Z"; return body; });
  log = instrument(page); await page.reload({ waitUntil: "domcontentloaded" }); await open(page);
  keys = await stored(page);
  check("S6 republished Wall: a new publication signs again, old-publication entries are gone", log.leases.wall === videos.length && keys.every(k => k[4] === "2099-01-01T00:00:00Z"), log.leases);
  await ctx.unroute("**/rest/v1/rpc/get_public_wall");
  await page.reload({ waitUntil: "domcontentloaded" }); await open(page);   // back to the real publication
  // S7 Wall disabled / unpublished: no manifest -> every entry of this Wall leaves the browser, no video is requested
  await rewrite(ctx, "get_public_wall", () => []);
  log = instrument(page); await page.reload({ waitUntil: "domcontentloaded" }); await open(page);
  keys = await stored(page);
  check("S7 unpublished / disabled Wall: no entry of this Wall remains, no video requested, no lease", !handlesIn(keys).includes(HANDLE) && log.videoObjects.size === 0 && log.leases.wall === 0, { handles: handlesIn(keys), objects: log.videoObjects.size });
  await ctx.unroute("**/rest/v1/rpc/get_public_wall");
  // S8 private profile: the identity is not public -> the same
  await page.reload({ waitUntil: "domcontentloaded" }); await open(page);
  check("S8 setup: entries restored for the published Wall", handlesIn(await stored(page)).includes(HANDLE));
  await rewrite(ctx, "get_public_identity", () => []);
  log = instrument(page); await page.reload({ waitUntil: "domcontentloaded" }); await open(page);
  check("S8 PRIVATE / unknown GamID: every entry of it removed, nothing requested", !handlesIn(await stored(page)).includes(HANDLE) && log.videoObjects.size === 0 && log.leases.wall === 0);
  await ctx.unroute("**/rest/v1/rpc/get_public_identity");
  // S9 a different Wall: its own entries, the first Wall's untouched, no cross-use
  await page.goto(`${SITE}/@${HANDLE}`, { waitUntil: "domcontentloaded" }); await open(page);
  const before = (await stored(page)).filter(k => k[3] === HANDLE).length;
  log = instrument(page); await open(page, OTHER);
  keys = await stored(page);
  check("S9 different Wall: separate entries, the first Wall's kept", handlesIn(keys).includes(OTHER) && keys.filter(k => k[3] === HANDLE).length === before, { handles: handlesIn(keys) });
  // S10 corrupted storage
  await page.evaluate(k => localStorage.setItem(k, "{not json"), KEY);
  log = instrument(page); await open(page);
  keys = await stored(page);
  check("S10 corrupted storage: page works, videos signed again, storage rewritten valid", Array.isArray(keys) && keys.length > 0 && log.pageErrors.length === 0 && log.leases.wall > 0, { leases: log.leases.wall });
  // S11 sign-out clears the shared cache
  await page.evaluate(async () => { const api = await import("/account/supabase-client.js"); await api.signOut().catch(() => {}); });
  check("S11 sign-out removes the cache", (await page.evaluate(k => localStorage.getItem(k), KEY)) === null);
  // S12 leakage: no signed URL in the console, none sent to a non-Supabase host, the cache key never leaves the browser
  await open(page);
  const allLogs = [log, ...[]];
  check("S12 no signed URL in console output, none sent to another host, cache never transmitted", allLogs.every(l => !l.console.some(t => /token=|object\/sign\//.test(t)) && l.tokenToForeignHost === 0 && l.keyInRequests === 0));
  await page.close();
  // S13 concurrent tabs (fresh profile): both tabs at once, entries merged, playback fine
  await ctx.close();
  ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "gamid-f6a-sec2-")), { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
  const [a, b] = [await ctx.newPage(), await ctx.newPage()]; const la = instrument(a), lb = instrument(b);
  await Promise.all([open(a), open(b)]);
  keys = await stored(a);
  check("S13 concurrent tabs: merged entries (one per video), both tabs play, no errors", keys.length === videos.length && la.pageErrors.length === 0 && lb.pageErrors.length === 0 && (await playable(a)).every(v => v.err === null) && (await playable(b)).every(v => v.err === null), { entries: keys.length, leases: la.leases.wall + lb.leases.wall });
  await ctx.close();
  // S14 storage unavailable: localStorage throws -> memory only, page and videos work
  ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "gamid-f6a-sec3-")), { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } }); });
  page = await ctx.newPage(); log = instrument(page); await open(page);
  const vids = await playable(page);
  check("S14 blocked storage: the Wall still plays (memory only), no page errors", log.pageErrors.length === 0 && vids.length > 0 && vids.every(v => v.err === null), { videos: vids.length, errors: log.pageErrors.length });
  await ctx.close();
  // S15 browser restart: same profile closed and reopened -> no new lease
  const restartDir = mkdtempSync(join(tmpdir(), "gamid-f6a-sec4-"));
  ctx = await chromium.launchPersistentContext(restartDir, { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage(); await open(page); await ctx.close();
  ctx = await chromium.launchPersistentContext(restartDir, { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage(); log = instrument(page); await open(page);
  check("S15 browser restart: entries survive, no new Wall video lease", log.leases.wall === 0 && (await stored(page)).length === videos.length, log.leases);
} catch (error) { fails++; console.log("ERROR", String(error).slice(0, 300)); }
finally { await ctx.close().catch(() => {}); }
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
