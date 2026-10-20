// Summarises harness.mjs runs. Usage: node scripts/wall-bandwidth/analyze.mjs <run.json> [...] [--detail]
import { readFileSync } from "node:fs";
const files = process.argv.slice(2).filter(a => !a.startsWith("--"));
const detail = process.argv.includes("--detail");
const MB = n => (n / 1e6).toFixed(2), MiB = n => (n / 1048576).toFixed(2);
const cat = r => {
  if (r.kind?.startsWith("storage:sign:intro")) return "video:intro";
  if (r.kind?.startsWith("storage:sign:")) return "video:wall";
  if (r.kind === "storage:authenticated:wall-media") return "image:wall-picture";
  if (r.kind === "storage:authenticated:wall-fonts") return "font:custom";
  if (r.kind === "storage:authenticated:avatars") return "image:avatar";
  if (r.kind?.startsWith("api:function:")) return r.kind.replace("api:function:", "api:fn:");
  if (r.kind?.startsWith("api:")) return r.kind;
  if (r.kind === "site") { if (r.type === "Script") return "site:js"; if (r.type === "Stylesheet") return "site:css"; if (r.type === "Document") return "site:html"; if (r.type === "Font") return "site:font"; if (r.type === "Image") return "site:image"; if (r.type === "Media") return "site:media"; return `site:${r.type}`; }
  return `3p:${r.host}`;
};
for (const file of files) {
  const run = JSON.parse(readFileSync(file, "utf8"));
  const reqs = run.requests;
  // recompute from the raw CDP fields (same rule as the harness): wire bytes = encodedDataLength; a cache read = cache-flagged with < 1 KiB from the network
  run.phaseBytes = {};
  for (const r of reqs) {
    const wire = Math.max(r.finished ? (r.encoded ?? 0) : 0, r.chunks ?? 0);
    const flagged = r.memoryCache ? "memory" : r.fromDiskCache ? "disk" : r.fromPrefetchCache ? "prefetch" : r.fromServiceWorker ? "sw" : null;
    r.cache = flagged && wire < 1024 ? flagged : null; r.rangeFill = flagged && wire >= 1024; r.netBytes = r.cache ? 0 : wire;
    if (!r.cache) { let at = 0; for (const [p, n] of Object.entries(r.chunkPhases ?? {})) { run.phaseBytes[p] = (run.phaseBytes[p] ?? 0) + n; at += n; } if (r.netBytes > at) run.phaseBytes[r.startPhase] = (run.phaseBytes[r.startPhase] ?? 0) + r.netBytes - at; }
  }
  const net = reqs.filter(r => !r.cache);
  const total = net.reduce((s, r) => s + r.netBytes, 0);
  console.log(`\n=== ${run.profile} ${run.run} (${run.plan}) handle=@${run.handle} browser=${run.browserVersion} stamp=${run.deployStamp} stages=${run.stages}`);
  console.log(`loads:`, JSON.stringify(run.loads));
  console.log(`TOTAL on the wire: ${MB(total)} MB (${MiB(total)} MiB), ${net.length} network requests, ${reqs.length - net.length} cache reads (${reqs.filter(r => r.cache === "memory").length} memory, ${reqs.filter(r => r.cache === "disk").length} disk)`);
  const by = {};
  for (const r of reqs) { const k = r.type === "Preflight" ? "cors-preflight" : cat(r); by[k] ??= { n: 0, bytes: 0, cached: 0, cachedN: 0, failed: 0 }; if (r.cache) { by[k].cachedN++; } else { by[k].n++; by[k].bytes += r.netBytes; } if (r.failed) by[k].failed++; }
  console.log("by category:"); for (const [k, v] of Object.entries(by).sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`  ${k.padEnd(28)} ${String(v.n).padStart(4)} req  ${MB(v.bytes).padStart(8)} MB  ${(100 * v.bytes / total).toFixed(1).padStart(5)}%  cache-reads ${v.cachedN}  failed/aborted ${v.failed}`);
  console.log("by phase (bytes received while the phase ran):"); for (const p of run.phases) console.log(`  ${p.name.padEnd(24)} ${String((p.t1 - p.t0).toFixed(0)).padStart(4)} s  ${MB(run.phaseBytes[p.name] ?? 0).padStart(8)} MB`);
  // videos: per object
  const vids = reqs.filter(r => cat(r).startsWith("video"));
  console.log(`range fills flagged "disk cache" that still carried network bytes: ${reqs.filter(r => r.rangeFill).length} (${MB(reqs.filter(r => r.rangeFill).reduce((s, r) => s + r.netBytes, 0))} MB, counted as network)`);
  const objects = {};
  for (const r of vids) { const o = objects[r.path] ??= { cat: cat(r), reqs: 0, bytes: 0, statuses: {}, ranges: [], cf: {}, size: null, cacheReads: 0, aborted: 0, phases: {} }; if (r.cache) { o.cacheReads++; continue; } o.reqs++; o.bytes += r.netBytes; o.statuses[r.status ?? r.failed] = (o.statuses[r.status ?? r.failed] ?? 0) + 1; if (r.range) o.ranges.push(r.range); const cf = r.headers?.["cf-cache-status"] ?? r.headersRaw?.["cf-cache-status"] ?? "-"; o.cf[cf] = (o.cf[cf] ?? 0) + 1; const total = (r.headers?.["content-range"] ?? r.headersRaw?.["content-range"] ?? "").split("/")[1]; if (total) o.size = Number(total); if (r.canceled || r.failed) o.aborted++; o.phases[r.startPhase] = (o.phases[r.startPhase] ?? 0) + r.netBytes; }
  console.log("video objects (hashed paths):");
  for (const [path, o] of Object.entries(objects).sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`  ${o.cat.padEnd(12)} ${path.split("/").slice(-2).join("/").padEnd(32)} size ${o.size ? MB(o.size) : "?"} MB  fetched ${MB(o.bytes)} MB (${o.size ? (o.bytes / o.size).toFixed(2) + "x" : "?"})  req ${o.reqs}  status ${JSON.stringify(o.statuses)}  cf ${JSON.stringify(o.cf)}  aborted ${o.aborted}  cacheReads ${o.cacheReads}${detail ? `\n      ranges ${o.ranges.slice(0, 12).join(" ")}\n      by start phase ${JSON.stringify(Object.fromEntries(Object.entries(o.phases).map(([k, v]) => [k, MB(v)])))}` : ""}`);
  // pictures / fonts repeat
  const repeat = {};
  for (const r of reqs.filter(r => r.type !== "Preflight" && /^(image:wall|font:|image:avatar)/.test(cat(r)))) { const o = repeat[r.path] ??= { cat: cat(r), n: 0, bytes: 0, cache: 0, cc: r.headers?.["cache-control"] ?? r.headersRaw?.["cache-control"] ?? "-", cf: r.headers?.["cf-cache-status"] ?? "-" }; if (r.cache) o.cache++; else { o.n++; o.bytes += r.netBytes; } }
  console.log("pictures / fonts / avatar:"); for (const [p, o] of Object.entries(repeat)) console.log(`  ${o.cat.padEnd(18)} ${p.split("/").slice(-1)[0].padEnd(18)} fetched ${o.n}x  ${MB(o.bytes)} MB  cache reads ${o.cache}  cache-control "${o.cc}"  cf ${o.cf}`);
  // video telemetry
  const ev = (run.videoEvents ?? []).flat();
  const count = t => ev.filter(e => e.type === t).length;
  console.log(`video events (last open tab): waiting ${count("waiting")} stalled ${count("stalled")} error ${count("error")} seeking ${count("seeking")}`);
  const last = Object.values(run.playback ?? {}).flat().flatMap(s => s.videos ?? []);
  const uniq = {}; for (const v of last) uniq[v.id] = v;
  console.log("video elements:"); for (const v of Object.values(uniq)) console.log(`  ${v.id} stage ${v.stage} ${v.videoWidth}x${v.videoHeight} shown ${v.box.join("x")} dur ${v.duration}s readyState ${v.readyState} dropped ${v.dropped}/${v.frames} err ${v.error}`);
  if (run.pageErrors?.length) console.log("page errors:", run.pageErrors);
  if (run.error) console.log("RUN ERROR:", run.error);
}
