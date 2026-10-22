// Mobile Public Wall Visitor V2 - Chrome review of the real visitor page (/public/, the /@handle page) showing a PUBLISHED Wall, with every anonymous read mocked
// and synthetic data only (scripts/public-wall-fixtures.mjs). The TESTING origin is served from the local dist/ (or, with --live, from TESTING itself while the
// backend stays mocked). No real account, upload or publication is touched.
// Env: GAMID_BROWSER_MODULE (Playwright), GAMID_CHROME_CHANNEL (e.g. chrome), GAMID_BROWSER_OUTPUT (screenshots / report), GAMID_WALL_PHASE (audit | check).
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
import { SCENARIOS, assetsFor, ASSETS, FONT_ID, OWNER } from "./public-wall-fixtures.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.GAMID_BROWSER_MODULE || "playwright");
const jpeg = require("jpeg-js");
const CF = "https://gamid-testing-static.gamid.workers.dev", SUPA = "upvtrczefcvigxdyuylw.supabase.co";
const root = process.env.GAMID_WALL_ROOT ? path.resolve(process.env.GAMID_WALL_ROOT) : fileURLToPath(new URL("../dist/", import.meta.url));   // GAMID_WALL_ROOT: another dist/ (a baseline)
export const out = process.env.GAMID_BROWSER_OUTPUT || process.cwd();
fs.mkdirSync(out, { recursive: true });
const jpg = (w, h, hue) => { const d = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { const x = i % w, y = (i / w) | 0; d[i * 4] = (x * 255 / w + hue) & 255; d[i * 4 + 1] = (y * 200 / h) | 0; d[i * 4 + 2] = (hue * 3 + 80) & 255; d[i * 4 + 3] = 255; } return Buffer.from(jpeg.encode({ width: w, height: h, data: d }, 80).data); };
// a valid 1x1 GIF (magenta); the browser draws a GIF asset as an ordinary <img>, animated or not
const GIF = Buffer.from("R0lGODlhAQABAIABAP8A/wAAACwAAAAAAQABAAACAkQBADs=", "base64");
const MEDIA = { [ASSETS.wallBg.asset_id]: jpg(1080, 1920, 20), [ASSETS.photo.asset_id]: jpg(1200, 860, 120), [ASSETS.lateBg.asset_id]: jpg(900, 1200, 200), [ASSETS.gif.asset_id]: GIF };
const fixtureRoot = fileURLToPath(new URL("../dist/", import.meta.url));   // fixture media always come from this checkout
const VIDEO = fs.readFileSync(path.join(fixtureRoot, "assets/gamid-intro.mp4"));
const FONT = fs.readFileSync(path.join(fixtureRoot, "prototypes/game-id-wall-w0/fonts/BebasNeue.woff2"));
const POSTER = jpg(480, 270, 60);
const identityFor = ({ intro = false } = {}) => ({ entity_id: OWNER, gamid_handle: "fixture_wall", display_name: "Wall Fixture", bio: "Synthetic visitor fixture", visibility: "PUBLIC", avatar_media_reference: null, intro_derivative_path: intro ? `${OWNER}/intro.webm` : null, intro_transition_key: "fade",
  role_catalog: [{ key: "role_0", label: "Streamer" }, { key: "role_1", label: "Coach" }], primary_role_key: "role_0", role_keys: ["role_0", "role_1"], education_work_catalog: [], education_work_status: null, institution: null, field_of_study: null, public_sections: {} });
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".woff2": "font/woff2", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg" };

const serveRange = (route, body, contentType) => {
  const range = route.request().headers().range, m = /bytes=(\d+)-(\d*)/.exec(range || "");
  const headers = { "Access-Control-Allow-Origin": CF, "Accept-Ranges": "bytes" };
  if (!m) return route.fulfill({ status: 200, contentType, body, headers });
  const start = Number(m[1]), end = Math.min(body.length - 1, m[2] ? Number(m[2]) : body.length - 1);
  return route.fulfill({ status: 206, contentType, body: body.subarray(start, end + 1), headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${body.length}` } });
};

let browser = null;
export async function launch() { browser ??= await chromium.launch({ channel: process.env.GAMID_CHROME_CHANNEL || undefined, headless: true }); return browser; }
export async function close() { await browser?.close(); browser = null; }

// Opens the visitor page for one fixture Wall at one size. -> { context, page, errors, requests } (requests: every mocked read, in order, with its kind)
export async function open(scenario, { width, height, mobile = width < 1024, reducedMotion = "no-preference", live = process.env.GAMID_WALL_LIVE === "1", wall = true, doc: docOverride = null, failMedia = new Set(), drawn = true, intro = false, from = null } = {}) {
  await launch();
  const doc = docOverride ?? SCENARIOS[scenario]();
  const published = wall ? [{ document: doc, assets: assetsFor(doc), published_at: "2026-10-22T00:00:00Z" }] : [];
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion, deviceScaleFactor: mobile ? 2 : 1 });
  await context.routeWebSocket("**/*", ws => ws.close());
  const requests = [], errors = [];
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url()), action = url.pathname.split("/").pop();
    if (url.hostname === SUPA) {
      const p = url.pathname;
      if (p.startsWith("/storage/v1/object/authenticated/wall-media/")) {
        const assetId = Object.values(ASSETS).find(a => p.endsWith(a.storage_path))?.asset_id;
        requests.push({ kind: "picture", asset: Object.values(ASSETS).find(a => a.asset_id === assetId)?.key ?? p });
        if (!assetId || failMedia.has(assetId) || !MEDIA[assetId]) return route.fulfill({ status: 400, body: "" });
        return route.fulfill({ status: 200, contentType: assetId === ASSETS.gif.asset_id ? "image/gif" : "image/jpeg", body: MEDIA[assetId] });
      }
      if (p.startsWith("/storage/v1/object/authenticated/wall-fonts/")) { requests.push({ kind: "font" }); return route.fulfill({ status: 200, contentType: "font/woff2", body: FONT }); }
      if (p === "/functions/v1/public-media") {
        const { bucket, path: objectPath } = JSON.parse(req.postData() || "{}");
        const asset = Object.values(ASSETS).find(a => a.storage_path === objectPath);
        requests.push({ kind: "lease", asset: asset?.key ?? objectPath });
        if (asset && failMedia.has(asset.asset_id)) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
        const token = "h." + Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + (bucket === "intro-media" ? 120 : 21600) })).toString("base64url") + ".fixture";
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ signedURL: `/object/sign/${bucket}/${objectPath}?token=${token}` }) });
      }
      if (p.startsWith("/storage/v1/object/sign/")) { requests.push({ kind: "video-bytes", asset: Object.values(ASSETS).find(a => p.includes(a.asset_id))?.key ?? p, range: req.headers().range ?? null }); return serveRange(route, VIDEO, "video/mp4"); }
      if (p.startsWith("/functions/v1/media-poster")) { requests.push({ kind: "poster" }); return route.fulfill({ status: 200, contentType: "image/jpeg", body: POSTER, headers: { "Access-Control-Allow-Origin": CF } }); }
      if (p.startsWith("/functions/v1/game-artwork/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false }) });
      const bodies = { get_public_identity: [identityFor({ intro })], get_public_wall: published, get_public_wall_fonts: [{ font_id: FONT_ID, storage_path: `${OWNER}/${FONT_ID}.woff2` }], get_public_profile_extras: [{ has_banner: false, member_since_year: 2026 }] };
      requests.push({ kind: "rpc", action });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bodies[action] ?? []) });
    }
    if (url.origin === CF) {
      if (live) return route.continue();
      let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
      if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
      if (!file.startsWith(path.resolve(root) + path.sep)) return route.abort();
      try { return route.fulfill({ status: 200, contentType: types[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) }); } catch { return route.fulfill({ status: 404, body: "" }); }
    }
    requests.push({ kind: "external", host: url.hostname });
    if (/youtube|ytimg|twitch|jtvnw/.test(url.hostname)) return route.fulfill({ status: 200, contentType: url.pathname.match(/\.(jpg|webp)$/) ? "image/jpeg" : "text/html", body: url.pathname.match(/\.(jpg|webp)$/) ? POSTER : "<!doctype html><title>player</title>" });
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${CF}/public/?handle=fixture_wall${from ? `&from=${from}` : ""}`);
  // with an Intro the caller drives it (Skip / the end); the Intro frame shows first
  if (intro) { await page.waitForFunction(() => !document.getElementById("experienceWrap").hidden, null, { timeout: 20000 }).catch(() => {}); return { context, page, errors, requests, doc }; }
  // drawn: wait for painted stages; otherwise (a Wall that cannot be drawn) for the Wall's own state message
  if (wall) await page.waitForFunction(selector => document.documentElement.classList.contains("is-public-wall") && document.querySelector(selector), drawn ? ".public-wall .wall-stage" : ".public-wall .public-wall-state", { timeout: 20000 });
  await page.waitForTimeout(900);
  return { context, page, errors, requests, doc };
}

// the stage geometry the visitor sees
export const geometry = page => page.evaluate(() => {
  const stages = [...document.querySelectorAll(".public-wall .wall-stage")].map(s => { const r = s.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }; });
  const replay = document.getElementById("replayIntroButton"), rr = replay?.getBoundingClientRect();
  return { inner: [innerWidth, innerHeight], scrollHeight: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth > innerWidth, stages,
    replay: replay && !replay.hidden ? [Math.round(rr.left), Math.round(rr.top + scrollY), Math.round(rr.width), Math.round(rr.height)] : null, head: (() => { const h = document.querySelector(".site-head")?.getBoundingClientRect(); return h ? Math.round(h.height) : null; })() };
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) && (process.env.GAMID_WALL_PHASE || "audit") === "audit") {
  const sizes = (process.env.GAMID_WALL_SIZES || "320x568,390x844,430x932,844x390,568x320,932x430,768x1024,1440x900").split(",").map(s => s.split("x").map(Number));
  const report = [];
  try {
    for (const [width, height] of sizes) {
      const { context, page, errors, requests } = await open("mixed", { width, height });
      const g = await geometry(page);
      await page.screenshot({ path: path.join(out, `audit-mixed-${width}x${height}-top.png`) });
      if (g.stages[1]) { await page.evaluate(top => scrollTo(0, top), g.stages[1].top); await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `audit-mixed-${width}x${height}-stage2.png`) }); }
      report.push({ size: `${width}x${height}`, ...g, errors, requests: requests.filter(r => r.kind !== "rpc").map(r => `${r.kind}:${r.asset ?? r.host ?? ""}`) });
      await context.close();
    }
  } finally { await close(); }
  fs.writeFileSync(path.join(out, "audit.json"), JSON.stringify(report, null, 1));
  for (const r of report) console.log(r.size, "stages", r.stages.map(s => `${s.width}x${s.height}@${s.left},${s.top}`).join(" "), "scrollH", r.scrollHeight, "ovX", r.overflowX, "replay", JSON.stringify(r.replay), "head", r.head, "errors", r.errors.length, "\n   ", r.requests.join(" "));
}
