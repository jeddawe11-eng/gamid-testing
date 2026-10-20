// Cross-run baseline table for harness.mjs runs. Usage: node scripts/wall-bandwidth/summary.mjs <run.json> [...]
// Same byte rule as analyze.mjs: wire bytes = CDP encodedDataLength; a cache read = cache-flagged with < 1 KiB from the network.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
const MB = n => (n / 1e6).toFixed(2);
const supabase = host => /\.supabase\.co$/.test(host ?? "");
const rows = [];
for (const file of process.argv.slice(2)) {
  const run = JSON.parse(readFileSync(file, "utf8"));
  const phase = {}, cat = { video: 0, intro: 0, picture: 0, cover3p: 0, js: 0, css: 0, api: 0, other: 0 }, cf = { HIT: 0, MISS: 0, other: 0 }, origin = { supabase: 0, site: 0, thirdParty: 0 };
  let total = 0, requests = 0, cacheReads = 0, preflights = 0;
  for (const r of run.requests) {
    const wire = Math.max(r.finished ? (r.encoded ?? 0) : 0, r.chunks ?? 0);
    const flagged = r.memoryCache || r.fromDiskCache || r.fromPrefetchCache || r.fromServiceWorker;
    if (flagged && wire < 1024) { cacheReads++; continue; }
    if (r.type === "Preflight") preflights++; else requests++;
    total += wire;
    let at = 0; for (const [p, n] of Object.entries(r.chunkPhases ?? {})) { phase[p] = (phase[p] ?? 0) + n; at += n; } if (wire > at) phase[r.startPhase] = (phase[r.startPhase] ?? 0) + wire - at;
    const k = r.kind ?? "";
    if (k.startsWith("storage:sign:intro")) cat.intro += wire; else if (k.startsWith("storage:sign:")) cat.video += wire;
    else if (k === "storage:authenticated:wall-media" || k === "storage:authenticated:avatars") cat.picture += wire;
    else if (/steamgriddb|discordapp/.test(r.host)) cat.cover3p += wire;
    else if (k === "site" && r.type === "Script") cat.js += wire; else if (k === "site" && r.type === "Stylesheet") cat.css += wire;
    else if (k.startsWith("api:")) cat.api += wire; else cat.other += wire;
    if (supabase(r.host)) { origin.supabase += wire; const c = r.headers?.["cf-cache-status"] ?? r.headersRaw?.["cf-cache-status"]; if (c === "HIT") cf.HIT += wire; else if (c === "MISS") cf.MISS += wire; else cf.other += wire; }
    else if (/workers\.dev$/.test(r.host)) origin.site += wire; else origin.thirdParty += wire;
  }
  const sum = (...names) => names.reduce((s, n) => s + (phase[n] ?? 0), 0);
  rows.push({ run: basename(file, ".json"), plan: run.plan, total, requests, preflights, cacheReads,
    beforeInteraction: sum("1-cold:load", "1-cold:settle"), duringIntro: phase["1-cold:load"] ?? 0, allStages: sum("1-cold:load", "1-cold:settle", "3-idle30", "4-stages", "5-return"),
    idle: phase["3-idle30"] ?? 0, returnStages: phase["5-return"] ?? 0, playAll: phase["6-play-all"] ?? 0, replay: phase["7-replay"] ?? 0, pause: phase["8-pause-resume"] ?? 0, seek: phase["9-seek"] ?? 0,
    reload: sum("10-reload:load", "10-reload:settle", "10-reload-play", "10-reload-stages"), secondVisit: sum("11-second-visit:load", "11-second-visit:settle", "11-second-visit-play", "11-second-visit-stages"),
    cat, cf, origin, wallShown: run.loads?.cold?.wallShownAfter, ttfb: run.loads?.cold?.timing?.ttfb, fcp: run.loads?.cold?.timing?.fcp, errors: (run.pageErrors ?? []).length });
}
const cols = [["run", r => r.run], ["total MB", r => MB(r.total)], ["req", r => r.requests], ["cache", r => r.cacheReads], ["pre-interaction", r => MB(r.beforeInteraction)], ["all stages", r => MB(r.allStages)], ["play", r => MB(r.playAll)], ["replay", r => MB(r.replay)], ["pause", r => MB(r.pause)], ["seek", r => MB(r.seek)], ["reload", r => MB(r.reload)], ["2nd visit", r => MB(r.secondVisit)], ["video %", r => (100 * (r.cat.video + r.cat.intro) / r.total).toFixed(1)], ["supabase MB", r => MB(r.origin.supabase)], ["cf HIT", r => MB(r.cf.HIT)], ["cf MISS", r => MB(r.cf.MISS)], ["3p MB", r => MB(r.origin.thirdParty)], ["site MB", r => MB(r.origin.site)], ["wall at s", r => r.wallShown?.toFixed(1)], ["errors", r => r.errors]];
console.log(cols.map(c => c[0]).join(" | "));
for (const r of rows) console.log(cols.map(c => c[1](r)).join(" | "));
console.log("\ncategories (MB): run | wall video | intro | pictures+avatar | 3p covers/discord | js | css | api | other");
for (const r of rows) console.log([r.run, ...Object.values(r.cat).map(MB)].join(" | "));
