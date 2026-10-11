#!/usr/bin/env node
// GeoNames -> SQL batch files for private.import_location_batch() (20261011100000_classic_profile_consolidated.sql).
// Source: GeoNames (https://www.geonames.org), licensed CC BY 4.0 - attribution required wherever the data is shown (docs/LOCATION-DATA.md).
// Input: the unmodified dump files cities15000.txt (cities with a population of at least 15,000) and countryInfo.txt from https://download.geonames.org/export/dump/.
// This script only READS the two local files and only WRITES local SQL files; loading them into a database is a separate, explicit step (docs/LOCATION-DATA.md).
//
//   node scripts/location/geonames-import.mjs --cities <cities15000.txt> --countries <countryInfo.txt> --out <dir> [--batch 1500]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { locationSearchKey, isArabic } from "../../dist/account/location.js";

const SEARCH_MAX = 1200;
const LATIN = /^[\p{Script=Latin}\p{N}\s'’.\-()]+$/u;

export function parseCountries(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const f = line.split("\t");
    const code = f[0], name = (f[4] || "").trim(), geonameId = f[16];
    if (/^[A-Z]{2}$/.test(code) && name.length >= 2 && name.length <= 80) out.push({ code, name, geoname_id: /^[0-9]+$/.test(geonameId || "") ? geonameId : "" });
  }
  return out;
}

// one cities15000 line -> {id, country, name, name_ar, search, population} | null
export function parseCity(line, countryCodes) {
  const f = line.split("\t");
  if (f.length < 15 || !/^[0-9]+$/.test(f[0]) || !countryCodes.has(f[8])) return null;
  const name = f[1].trim(), ascii = (f[2] || "").trim();
  if (!name || name.length > 120) return null;
  const alternates = (f[3] || "").split(",").map(x => x.trim()).filter(x => x && x.length <= 120);
  const arabic = alternates.filter(isArabic);
  const latin = alternates.filter(x => LATIN.test(x));
  const keys = [];
  for (const value of [name, ascii, ...arabic, ...latin]) {
    const key = locationSearchKey(value);
    if (!key || keys.includes(key)) continue;
    if (keys.join("|").length + key.length + 1 > SEARCH_MAX) break;
    keys.push(key);
  }
  if (!keys.length) return null;
  return { id: f[0], country: f[8], name, name_ar: arabic[0] || "", search: keys.join("|"), population: Number.parseInt(f[14], 10) || 0 };
}

export function batchSql(batch) {
  const json = JSON.stringify(batch);
  if (json.includes("$gn$")) throw new Error("unexpected quote tag in data");
  return `select private.import_location_batch($gn$${json}$gn$::jsonb);\n`;
}

function main(argv) {
  const opt = { batch: 1500 };
  for (let i = 2; i < argv.length; i += 2) opt[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!opt.cities || !opt.countries || !opt.out) throw new Error("usage: --cities <file> --countries <file> --out <dir>");
  const countries = parseCountries(readFileSync(opt.countries, "utf8"));
  const codes = new Set(countries.map(c => c.code));
  const cities = readFileSync(opt.cities, "utf8").split(/\r?\n/).filter(Boolean).map(line => parseCity(line, codes)).filter(Boolean);
  mkdirSync(opt.out, { recursive: true });
  const size = Number(opt.batch);
  writeFileSync(join(opt.out, "000-countries.sql"), batchSql({ countries, cities: [] }));
  let n = 0;
  for (let i = 0; i < cities.length; i += size) writeFileSync(join(opt.out, `${String(++n).padStart(3, "0")}-cities.sql`), batchSql({ countries: [], cities: cities.slice(i, i + size) }));
  console.log(JSON.stringify({ countries: countries.length, cities: cities.length, files: n + 1, withArabic: cities.filter(c => c.name_ar).length }));
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("geonames-import.mjs")) main(process.argv);
