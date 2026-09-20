// Pure transform for the Game Catalog import (no network, no filesystem): turns what Wikidata says about a video game into the neutral item
// that private.import_game_catalog_batch() understands. Kept separate from the exporter so it can be unit tested.
//
// Source: Wikidata (https://www.wikidata.org), structured data released under CC0 (public domain dedication) and served through its documented
// public SPARQL endpoint. No account, key or scraping is involved. Only the facts GamID needs are read: title, alternative titles, platforms,
// the number of Wikipedia language editions (a popularity signal), and a few provider identifiers.

// Wikidata platform items -> GamID's normalized platform keys (supabase/migrations/20260921210000_game_catalog_manual_games.sql).
// A platform Wikidata lists that GamID does not model (macOS, Linux, PS3, ...) is simply ignored, never mapped to something else.
export const PLATFORM_QIDS = Object.freeze({
  Q1406: "pc",            // Microsoft Windows
  Q5014725: "ps4",        // PlayStation 4
  Q63184502: "ps5",       // PlayStation 5
  Q13361286: "xbox_one",  // Xbox One
  Q98973368: "xbox_series", // Xbox Series X and Series S
  Q19610114: "switch",    // Nintendo Switch
  Q122761124: "switch2",  // Nintendo Switch 2
  Q48493: "ios",          // iOS
  Q94: "android",         // Android
});

// Wikidata properties read as provider identifiers.
export const IDENTIFIER_PROPERTIES = Object.freeze({
  P1733: "steam",       // Steam application ID
  P5794: "igdb",        // IGDB game ID (a slug)
  P6278: "epic_games",  // Epic Games Store ID
});

const STEAM_APP_ID = /^[0-9]{1,10}$/;
const PLAIN_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,126}$/;
const BARE_QID = /^Q[0-9]+$/;
export const MAX_ALIASES = 12;

function cleanTitle(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// input: { qid, label, sitelinks, platformQids: string[], identifiers: [{ property, value }], aliases: string[] }
// returns the neutral catalog item, or null when the entry cannot be offered honestly (no usable title, or no platform GamID can name).
export function buildCatalogItem(input) {
  if (!input || typeof input !== "object") return null;
  const qid = typeof input.qid === "string" && BARE_QID.test(input.qid) ? input.qid : null;
  const name = cleanTitle(input.label);
  if (!qid || name.length < 2 || name.length > 120 || BARE_QID.test(name)) return null;   // an unlabelled item shows up as its bare Q-number

  const platforms = new Set();
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
  return { source: "WIKIDATA", ref: qid, name, popularity: sitelinks, platforms: [...platforms], aliases, ids };
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
