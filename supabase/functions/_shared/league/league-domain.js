// League of Legends domain model for GamID — deliberately independent of any data source.
//
// Everything here is expressed in Riot's own concepts (Riot ID = game name + tagline, Riot platform id, Solo/Duo rank) and in
// GamID's own provenance vocabulary. A data source (today a temporary third-party adapter, later possibly Riot RSO + the
// official Riot API) only has to return a `LeagueSnapshot`; nothing in this file, the database schema, or the owner card
// changes when the source is replaced.
//
// LeagueSnapshot = {
//   gameName, tagLine, platformId,
//   soloRank: { state: "RANKED" | "UNRANKED" | "NOT_REPORTED", tier, division, lp, wins, losses },
//   profileIconId, sourceUrl, sourceUpdatedAt
// }

export const LEAGUE_REGIONS = Object.freeze([
  { platformId: "NA1", label: "North America (NA1)" },
  { platformId: "EUW1", label: "Europe West (EUW1)" },
  { platformId: "EUN1", label: "Europe Nordic & East (EUN1)" },
  { platformId: "KR", label: "Korea (KR)" },
  { platformId: "JP1", label: "Japan (JP1)" },
  { platformId: "BR1", label: "Brazil (BR1)" },
  { platformId: "LA1", label: "Latin America North (LA1)" },
  { platformId: "LA2", label: "Latin America South (LA2)" },
  { platformId: "OC1", label: "Oceania (OC1)" },
  { platformId: "TR1", label: "Türkiye (TR1)" },
  { platformId: "RU", label: "Russia (RU)" },
  { platformId: "ME1", label: "Middle East (ME1)" },
  { platformId: "SG2", label: "Singapore (SG2)" },
  { platformId: "TW2", label: "Taiwan (TW2)" },
  { platformId: "VN2", label: "Vietnam (VN2)" },
  { platformId: "PH2", label: "Philippines (PH2)" },
  { platformId: "TH2", label: "Thailand (TH2)" },
]);
export const PLATFORM_IDS = Object.freeze(LEAGUE_REGIONS.map(region => region.platformId));

export const RANK_TIERS = Object.freeze(["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"]);
export const APEX_TIERS = Object.freeze(["MASTER", "GRANDMASTER", "CHALLENGER"]);
export const DIVISIONS = Object.freeze(["I", "II", "III", "IV"]);
export const RANK_STATES = Object.freeze(["RANKED", "UNRANKED", "NOT_REPORTED"]);

// Trust: a manually entered Riot ID is not proof of ownership, so this prototype never claims verification.
export const TRUST_STATUS_MANUAL = "MANUAL";

export const LOOKUP_FAILURES = Object.freeze(["NOT_FOUND", "UNAVAILABLE", "STRUCTURE_CHANGED"]);

const NAME_MAX = 32;
const TAG_MAX = 16;
const codePoints = value => [...value].length;
// \p{C} = control, format, unassigned, private-use and surrogate code points — never valid inside a Riot ID.
const FORBIDDEN_NAME = /[\p{C}#/\\]/u;
const FORBIDDEN_TAG = /[\p{C}#/\\\s-]/u;

function cleanText(value) {
  if (typeof value !== "string") return null;
  return value.normalize("NFC").trim();
}

// Validates and normalizes user-supplied Riot ID input. The tagline format is deliberately NOT assumed (no length-3-to-5 or
// alphanumeric-only rule); only characters that cannot be part of an identifier or that would make a lookup ambiguous are refused.
export function normalizeRiotIdInput(input) {
  const gameName = cleanText(input?.gameName);
  const tagLine = cleanText(input?.tagLine?.replace?.(/^#/, "") ?? input?.tagLine);
  const platformId = typeof input?.platformId === "string" ? input.platformId.trim().toUpperCase() : "";
  if (!gameName || codePoints(gameName) > NAME_MAX || FORBIDDEN_NAME.test(gameName)) return { ok: false, code: "INVALID_GAME_NAME" };
  if (!tagLine || codePoints(tagLine) > TAG_MAX || FORBIDDEN_TAG.test(tagLine)) return { ok: false, code: "INVALID_TAG_LINE" };
  if (!PLATFORM_IDS.includes(platformId)) return { ok: false, code: "INVALID_REGION" };
  return { ok: true, value: { gameName, tagLine, platformId } };
}

const intIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const nullableInt = (value, min, max) => value === null || intIn(value, min, max);

// Defense in depth: whatever a data source returns is re-validated before it can reach the database.
export function validateSnapshot(snapshot) {
  const rank = snapshot?.soloRank;
  if (!snapshot || typeof snapshot !== "object" || !rank || typeof rank !== "object") return false;
  if (typeof snapshot.gameName !== "string" || !snapshot.gameName || codePoints(snapshot.gameName) > NAME_MAX) return false;
  if (typeof snapshot.tagLine !== "string" || !snapshot.tagLine || codePoints(snapshot.tagLine) > TAG_MAX) return false;
  if (!PLATFORM_IDS.includes(snapshot.platformId)) return false;
  if (typeof snapshot.sourceUrl !== "string" || snapshot.sourceUrl.length > 300 || !isHttpsUrl(snapshot.sourceUrl)) return false;
  if (!nullableInt(snapshot.profileIconId, 0, 100000)) return false;
  if (snapshot.sourceUpdatedAt !== null && !(typeof snapshot.sourceUpdatedAt === "string" && !Number.isNaN(Date.parse(snapshot.sourceUpdatedAt)))) return false;
  if (!RANK_STATES.includes(rank.state)) return false;
  if (!nullableInt(rank.wins, 0, 100000) || !nullableInt(rank.losses, 0, 100000)) return false;
  if (rank.state === "RANKED") {
    if (!RANK_TIERS.includes(rank.tier) || !intIn(rank.lp, 0, 10000)) return false;
    if (rank.division !== null && !DIVISIONS.includes(rank.division)) return false;
    if (!APEX_TIERS.includes(rank.tier) && rank.division === null) return false;
  } else if (rank.tier !== null || rank.division !== null || rank.lp !== null) return false;
  return true;
}

export function isHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
