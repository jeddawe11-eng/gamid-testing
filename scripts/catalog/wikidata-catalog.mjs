// Pure transform for the Game Catalog import (no network, no filesystem): turns what Wikidata says about a video game into the neutral item
// that private.import_game_catalog_batch() understands. Kept separate from the exporter so it can be unit tested.
//
// Source: Wikidata (https://www.wikidata.org), structured data released under CC0 (public domain dedication) and served through its documented
// public interfaces. No account, key or scraping is involved. Only the facts GamID needs are read: title, alternative titles, platforms, publication
// dates, the number of Wikipedia language editions (a popularity signal), and a few provider identifiers.
//
// The SAME rules apply to a game that is already in the catalog and to a new one: the importer matches by identifier, so enrichment and new imports
// go through exactly this code.
import { PLATFORM_QIDS } from "./platform-map.mjs";

export { PLATFORM_QIDS };

// Wikidata properties read as provider identifiers.
export const IDENTIFIER_PROPERTIES = Object.freeze({
  P1733: "steam",       // Steam application ID
  P5794: "igdb",        // IGDB game ID (a slug)
  P6278: "epic_games",  // Epic Games Store ID
});

const STEAM_APP_ID = /^[0-9]{1,10}$/;
const PLAIN_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,126}$/;
const BARE_QID = /^Q[0-9]+$/;
export const BARE_TITLE = BARE_QID;
export const MAX_ALIASES = 12;

// A publication date is only used when Wikidata gives it at year precision or better (precision 9 = year, 10 = month, 11 = day) and the year is
// plausible for a video game. Nothing is ever inferred from a title, a decade or free text.
export const MIN_RELEASE_YEAR = 1950;
export const MAX_RELEASE_YEAR = 2100;

function cleanTitle(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// "1996-09-09T00:00:00Z" + precision -> { year, date, precision } or null. The date keeps only what the precision supports (a year-precision date is January 1st).
export function parseRelease(rawDate, rawPrecision) {
  const precision = Number(rawPrecision);
  if (!Number.isInteger(precision) || precision < 9 || precision > 11) return null;
  const match = typeof rawDate === "string" ? /^(\d{4})-(\d{2})-(\d{2})T/.exec(rawDate) : null;   // a BCE / far-past year has a sign or more digits and never matches
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_RELEASE_YEAR || year > MAX_RELEASE_YEAR) return null;
  // a month / day the precision claims to know must be a real one; a year-precision value ignores whatever month/day the source carries
  if (precision >= 10 && !(month >= 1 && month <= 12)) return null;
  if (precision >= 11 && !(day >= 1 && day <= 31)) return null;
  const date = `${match[1]}-${precision >= 10 ? match[2] : "01"}-${precision >= 11 ? match[3] : "01"}`;
  const check = new Date(Date.UTC(year, Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== Number(date.slice(5, 7)) - 1 || check.getUTCDate() !== Number(date.slice(8, 10))) return null;   // 1990-02-31 is not a date
  return { year, date, precision };
}

const earlier = (a, b) => (!b || a.date < b.date || (a.date === b.date && a.precision > b.precision) ? a : b);

// input: { qid, label, sitelinks, platformQids: string[], identifiers: [{ property, value }], aliases: string[],
//          releases: [{ date, precision, platformQid|null }] }
// returns the neutral catalog item, or null when the entry cannot be offered honestly (no usable title, or no platform GamID can name).
export function buildCatalogItem(input) {
  if (!input || typeof input !== "object") return null;
  const qid = typeof input.qid === "string" && BARE_QID.test(input.qid) ? input.qid : null;
  const name = cleanTitle(input.label);
  if (!qid || name.length < 2 || name.length > 120 || BARE_QID.test(name)) return null;   // an unlabelled item shows up as its bare Q-number

  // 1. publication dates: the earliest valid one is the canonical release; a date qualified with a platform is also that platform's release
  let canonical = null;
  const byPlatform = new Map();
  const releasePlatforms = new Set();
  for (const raw of Array.isArray(input.releases) ? input.releases : []) {
    const release = parseRelease(raw?.date, raw?.precision);
    if (!release) continue;
    canonical = earlier(release, canonical);
    const key = raw.platformQid ? PLATFORM_QIDS[raw.platformQid] : null;
    if (key) { releasePlatforms.add(key); byPlatform.set(key, earlier(release, byPlatform.get(key))); }
  }

  // 2. platforms: what the game is listed on, plus a platform a dated release names; anything GamID does not model is ignored, never re-mapped
  const platforms = new Set(releasePlatforms);
  for (const id of input.platformQids || []) { const key = PLATFORM_QIDS[id]; if (key) platforms.add(key); }

  const ids = [];
  const seen = new Set();
  for (const entry of input.identifiers || []) {
    const provider = IDENTIFIER_PROPERTIES[entry?.property];
    const value = typeof entry?.value === "string" ? entry.value.trim() : "";
    if (!provider || !value) continue;
    if (provider === "steam" ? !STEAM_APP_ID.test(value) : !PLAIN_ID.test(value)) continue;
    const key = `${provider}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push({ provider, id: value });
  }
  // A storefront implies the PC context it runs in; the platform is only offered when a store identifier proves the game is sold there.
  if (ids.some(entry => entry.provider === "steam")) { platforms.add("steam"); platforms.add("pc"); }
  if (ids.some(entry => entry.provider === "epic_games")) { platforms.add("epic_games"); platforms.add("pc"); }
  if (platforms.has("steam") || platforms.has("epic_games")) platforms.add("pc");   // a store listed as a platform value carries the same PC context
  if (!platforms.size) return null;

  const lowered = name.toLowerCase();
  const aliases = [];
  for (const raw of input.aliases || []) {
    const alias = cleanTitle(raw);
    if (alias.length < 3 || alias.length > 120 || alias.toLowerCase() === lowered || aliases.some(existing => existing.toLowerCase() === alias.toLowerCase())) continue;
    aliases.push(alias);
    if (aliases.length >= MAX_ALIASES) break;
  }

  const sitelinks = Number.isSafeInteger(input.sitelinks) && input.sitelinks > 0 ? input.sitelinks : 0;
  return {
    source: "WIKIDATA", ref: qid, name, popularity: sitelinks,
    platforms: [...platforms].sort(), aliases, ids,
    release_year: canonical ? canonical.year : null,
    release_date: canonical ? canonical.date : null,
    release_date_precision: canonical ? canonical.precision : null,
    // sorted, so the same source facts always give the identical item whatever order Wikidata answered in
    platform_releases: [...byPlatform.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([platform, release]) => ({ platform, year: release.year, date: release.date, precision: release.precision })),
  };
}

// English label preferred, then the language-neutral ("mul") label Wikidata increasingly uses for game titles.
export function pickLabel(labels) {
  const list = Array.isArray(labels) ? labels : [];
  return list.find(entry => entry?.lang === "en")?.value || list.find(entry => entry?.lang === "mul")?.value || null;
}

// Most notable first: the first game to claim a title gets the clean canonical key, later namesakes get a suffixed one.
export function orderForImport(items) {
  return [...items].sort((a, b) => b.popularity - a.popularity || (a.ref.length - b.ref.length) || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
}

// One SQL file per batch: a single call of the catalog importer with the items as a dollar-quoted JSON literal.
export function batchSql(items) {
  const json = JSON.stringify(items);
  const tag = "gamid_catalog_json";
  if (json.includes(`$${tag}$`)) throw new Error("catalog batch contains the dollar-quote tag");
  return `select private.import_game_catalog_batch($${tag}$${json}$${tag}$::jsonb);\n`;
}
