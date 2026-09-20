#!/usr/bin/env node
// Exports notable video games from Wikidata (its documented public SPARQL endpoint for platforms / identifiers and the MediaWiki Action API for titles and aliases)
// into SQL batch files for private.import_game_catalog_batch().
// This script only READS Wikidata and only WRITES local files. Loading the files into a database is a separate, explicit step (see PROJECT_HANDOFF).
//
//   node scripts/catalog/wikidata-export.mjs --out <dir> [--min-sitelinks 2] [--max-items 0] [--batch 700] [--chunk 1200] [--first Q1,Q2]
//   --first moves the named Wikidata items to the front of the queue (e.g. a game you want available right away); --max-items caps the run to the most notable N.
//
// Polite by design (https://www.wikidata.org/wiki/Wikidata:Data_access, https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy):
// a descriptive User-Agent, strictly sequential requests with a pause between them, retry with back-off on 429/5xx (honoring Retry-After),
// and every step cached in --out so an interrupted run resumes instead of asking again. No scraping, no private API.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORM_QIDS, IDENTIFIER_PROPERTIES, buildCatalogItem, pickLabel, orderForImport, batchSql } from "./wikidata-catalog.mjs";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "GamID-catalog-import/1.0 (https://jeddawe11-eng.github.io/gamid-testing/; catalog research for a game identity project)";
const PAUSE_MS = 2500;

function options(argv) {
  const out = { out: null, minSitelinks: 2, maxItems: 0, batch: 700, chunk: 1200, page: 6000, first: [] };
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (key === "--out") out.out = value;
    else if (key === "--min-sitelinks") out.minSitelinks = Number(value);
    else if (key === "--max-items") out.maxItems = Number(value);
    else if (key === "--batch") out.batch = Number(value);
    else if (key === "--chunk") out.chunk = Number(value);
    else if (key === "--first") out.first = String(value).split(",").map(id => id.trim()).filter(Boolean);
    else throw new Error(`unknown option ${key}`);
  }
  if (!out.out) throw new Error("--out <dir> is required");
  if (out.first.some(id => !/^Q[0-9]+$/.test(id))) throw new Error("--first takes Wikidata ids like Q125175413");
  for (const name of ["minSitelinks", "maxItems", "batch", "chunk", "page"]) if (!Number.isSafeInteger(out[name]) || out[name] < 0) throw new Error(`bad --${name}`);
  return out;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The query service is shared and is sometimes overloaded (502 / 429 / timeouts). The polite answer is to wait, not to hammer it: back off up to 3 minutes per try.
const MAX_ATTEMPTS = 30;
const backoff = attempt => Math.min(15 * attempt, 180);

async function sparql(query) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
        body: `query=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(110000),
      });
      if (response.ok) { await sleep(PAUSE_MS); return (await response.json()).results.bindings; }
      if (response.status === 429 || response.status >= 500) {
        const wait = Math.min(Number(response.headers.get("retry-after")) || backoff(attempt), 300);
        console.error(`  HTTP ${response.status}; waiting ${wait}s (attempt ${attempt})`);
        await sleep(wait * 1000);
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      console.error(`  ${error.message}; retrying (attempt ${attempt})`);
      await sleep(backoff(attempt) * 1000);
    }
  }
  throw new Error("unreachable");
}

const qidOf = uri => uri.slice(uri.lastIndexOf("/") + 1);
const values = ids => ids.map(id => `wd:${id}`).join(" ");

async function collectIds(dir, opts) {
  const file = join(dir, "ids.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const found = [];
  let last = 0;
  for (;;) {
    console.error(`ids after Q${last} ...`);
    const rows = await sparql(`SELECT ?n ?s WHERE { ?g wdt:P31 wd:Q7889 . ?g wikibase:sitelinks ?s . FILTER(?s >= ${opts.minSitelinks}) BIND(xsd:integer(STRAFTER(STR(?g),"entity/Q")) AS ?n) FILTER(?n > ${last}) } ORDER BY ?n LIMIT ${opts.page}`);
    for (const row of rows) found.push({ qid: `Q${row.n.value}`, sitelinks: Number(row.s.value) });
    if (rows.length < opts.page) break;
    last = Number(rows[rows.length - 1].n.value);
  }
  writeFileSync(file, JSON.stringify(found));
  return found;
}

// Titles and alternative titles come from the MediaWiki Action API (wbgetentities: 50 entities per call, the documented way to read labels and aliases),
// not from SPARQL, so the query service only has to answer the two cheap indexed lookups below.
const ACTION_API = "https://www.wikidata.org/w/api.php";
async function entityText(qids) {
  const text = new Map();
  for (let start = 0; start < qids.length; start += 50) {
    const ids = qids.slice(start, start + 50);
    const url = `${ACTION_API}?action=wbgetentities&format=json&formatversion=2&props=labels%7Caliases&languages=en%7Cmul&ids=${ids.join("%7C")}`;
    let body = null;
    for (let attempt = 1; attempt <= 6 && !body; attempt += 1) {
      try {
        const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(60000) });
        if (response.status === 429 || response.status >= 500) { await sleep((Number(response.headers.get("retry-after")) || 10 * attempt) * 1000); continue; }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        if (json.error?.code === "maxlag") { await sleep(10000 * attempt); continue; }   // only if the service itself asks us to wait
        if (json.error) throw new Error(json.error.info || json.error.code);
        body = json;
      } catch (error) {
        if (attempt === 6) throw error;
        await sleep(10000 * attempt);
      }
    }
    if (!body) throw new Error("wbgetentities gave no answer");
    for (const id of ids) {
      const entity = body.entities?.[id];
      if (!entity || entity.missing !== undefined) continue;
      const labels = Object.values(entity.labels || {}).map(label => ({ lang: label.language, value: label.value }));
      const aliases = Object.values(entity.aliases || {}).flat().map(alias => alias.value);
      text.set(id, { labels, aliases });
    }
    await sleep(1000);
  }
  return text;
}

async function detailsFor(batch) {
  const list = values(batch.map(entry => entry.qid));
  const platformValues = Object.keys(PLATFORM_QIDS).map(id => `wd:${id}`).join(" ");
  const platformRows = await sparql(`SELECT ?g ?p WHERE { VALUES ?g { ${list} } VALUES ?p { ${platformValues} } ?g wdt:P400 ?p }`);
  const idRows = await sparql(`SELECT ?g ?k ?v WHERE { VALUES ?g { ${list} } { ?g wdt:P1733 ?v BIND("P1733" AS ?k) } UNION { ?g wdt:P5794 ?v BIND("P5794" AS ?k) } UNION { ?g wdt:P6278 ?v BIND("P6278" AS ?k) } }`);
  const text = await entityText(batch.map(entry => entry.qid));

  const byId = new Map(batch.map(entry => [entry.qid, { qid: entry.qid, sitelinks: entry.sitelinks, labels: text.get(entry.qid)?.labels || [], platformQids: [], identifiers: [], aliases: text.get(entry.qid)?.aliases || [] }]));
  for (const row of platformRows) byId.get(qidOf(row.g.value))?.platformQids.push(qidOf(row.p.value));
  for (const row of idRows) if (IDENTIFIER_PROPERTIES[row.k.value]) byId.get(qidOf(row.g.value))?.identifiers.push({ property: row.k.value, value: row.v.value });
  return [...byId.values()].map(game => buildCatalogItem({ ...game, label: pickLabel(game.labels) })).filter(Boolean);
}

async function main() {
  const opts = options(process.argv);
  const dir = opts.out;
  mkdirSync(join(dir, "details"), { recursive: true });
  mkdirSync(join(dir, "chunks"), { recursive: true });

  let ids = await collectIds(dir, opts);
  // Most notable first: an interrupted or capped run still leaves the games people are most likely to search for.
  ids = [...ids].sort((a, b) => b.sitelinks - a.sitelinks || Number(a.qid.slice(1)) - Number(b.qid.slice(1)));
  if (opts.first.length) ids = [...ids.filter(entry => opts.first.includes(entry.qid)), ...ids.filter(entry => !opts.first.includes(entry.qid))];
  if (opts.maxItems) ids = ids.slice(0, opts.maxItems);
  console.error(`${ids.length} candidate games (sitelinks >= ${opts.minSitelinks})`);

  const items = [];
  for (let start = 0, n = 0; start < ids.length; start += opts.batch, n += 1) {
    const file = join(dir, "details", `${String(n).padStart(4, "0")}.json`);
    let part;
    if (existsSync(file)) part = JSON.parse(readFileSync(file, "utf8"));
    else {
      const began = Date.now();
      console.error(`details ${start}-${Math.min(start + opts.batch, ids.length)} of ${ids.length} ...`);
      part = await detailsFor(ids.slice(start, start + opts.batch));
      console.error(`  ${part.length} importable, ${Math.round((Date.now() - began) / 1000)}s`);
      writeFileSync(file, JSON.stringify(part));
    }
    items.push(...part);
  }

  const ordered = orderForImport(items);
  let files = 0;
  for (let start = 0; start < ordered.length; start += opts.chunk) {
    writeFileSync(join(dir, "chunks", `chunk-${String(files).padStart(4, "0")}.sql`), batchSql(ordered.slice(start, start + opts.chunk)));
    files += 1;
  }
  writeFileSync(join(dir, "SUMMARY.json"), JSON.stringify({ candidates: ids.length, offered: ordered.length, chunks: files, minSitelinks: opts.minSitelinks, exportedAt: new Date().toISOString() }));
  console.error(`done: ${ordered.length} importable games in ${files} chunk file(s)`);
}

main().catch(error => { console.error(error); process.exit(1); });
