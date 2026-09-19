// TEMPORARY OP.GG data-source adapter (prototype). The ONLY file in the codebase that knows anything about OP.GG.
//
// OP.GG is not an official API and is not a permanent GamID provider. This adapter makes one ordinary, honest HTTPS GET for a
// public profile page, only when the owner adds a League identity or explicitly presses Refresh (the caller enforces the
// throttle before invoking it). It never crawls, polls, retries, rotates identities, or tries to get around any block: a 403,
// 429, 5xx, timeout, or unexpected page simply means "temporarily unavailable" / "format changed" and is reported as such.
//
// It reads only the schema.org JSON-LD block that the page publishes for search engines (not the page markup or app state) and
// returns a source-neutral LeagueSnapshot (see league-domain.js). Nothing from the page other than those normalized fields is
// kept — no HTML, no response body, no other players.
//
// To replace it with an official source (Riot RSO + Riot API), implement the same `{ sourceKey, lookup }` contract.

import { APEX_TIERS, DIVISIONS, RANK_TIERS } from "./league-domain.js";

export const OPGG_SOURCE_KEY = "OPGG_TEMPORARY";

const HOST = "https://op.gg";
const PATH_PREFIX = "/lol/summoners/";
const USER_AGENT = "GamID-Testing-Prototype (+https://jeddawe11-eng.github.io/gamid-testing/)";
const TIMEOUT_MS = 12000;
const MAX_BODY_BYTES = 3 * 1024 * 1024;

// Riot platform id -> the region segment this source uses in its URLs (the only place this mapping exists).
const REGION_SEGMENT = Object.freeze({
  NA1: "na", EUW1: "euw", EUN1: "eune", KR: "kr", JP1: "jp", BR1: "br", LA1: "lan", LA2: "las", OC1: "oce",
  TR1: "tr", RU: "ru", ME1: "me", SG2: "sg", TW2: "tw", VN2: "vn", PH2: "ph", TH2: "th",
});

export function buildProfileUrl({ gameName, tagLine, platformId }) {
  const segment = REGION_SEGMENT[platformId];
  if (!segment) return null;
  return `${HOST}${PATH_PREFIX}${segment}/${encodeURIComponent(`${gameName}-${tagLine}`)}`;
}

// A redirect is only followed if it stays on the same host and the same kind of profile path.
function safeRedirectTarget(location, base) {
  if (!location) return null;
  try {
    const target = new URL(location, base);
    if (target.toString() === new URL(base).toString()) return null; // a redirect to itself is a loop, not a hop
    return target.origin === HOST && target.pathname.startsWith(PATH_PREFIX) ? target.toString() : null;
  } catch { return null; }
}

async function readCapped(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!response.body?.getReader) {
    const text = await response.text();
    return text.length > MAX_BODY_BYTES ? null : text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) { try { await reader.cancel(); } catch { /* ignore */ } return null; }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toInt = text => Number.parseInt(String(text).replace(/,/g, ""), 10);

function jsonLdNodes(html) {
  const nodes = [];
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const doc = JSON.parse(match[1]);
      if (Array.isArray(doc?.["@graph"])) nodes.push(...doc["@graph"]);
      else if (doc && typeof doc === "object") nodes.push(doc);
    } catch { /* an unparsable block is ignored; the absence of a usable one is reported below */ }
  }
  return nodes;
}

// Pure, testable: turns a profile page into a LeagueSnapshot, or refuses. It never guesses a missing value.
export function parseProfilePage(html, { platformId, sourceUrl }) {
  const segment = REGION_SEGMENT[platformId];
  const nodes = jsonLdNodes(html);
  const page = nodes.find(node => node?.["@type"] === "ProfilePage");
  const person = nodes.find(node => node?.["@type"] === "Person");
  if (!page || !person || typeof person.name !== "string" || typeof page.description !== "string") return { ok: false, code: "STRUCTURE_CHANGED" };

  const split = /^(.+)#([^#]+)$/.exec(person.name);
  if (!split) return { ok: false, code: "STRUCTURE_CHANGED" };
  const [, gameName, tagLine] = split;

  const ids = Array.isArray(person.identifier) ? person.identifier : [];
  const region = ids.find(item => item?.name === "region")?.value;
  if (typeof region !== "string" || region.toLowerCase() !== segment) return { ok: false, code: "STRUCTURE_CHANGED" };

  // The description is built from a template around the player's own name. Anchoring on the exact known name and consuming it
  // means a hostile in-game name cannot smuggle a fake rank sentence into the parse.
  const name = person.name;
  const intro = new RegExp(`^${escapeRegExp(name)} is a League of Legends summoner on the [A-Za-z0-9]+ server\\. `);
  const introMatch = intro.exec(page.description);
  if (!introMatch) return { ok: false, code: "STRUCTURE_CHANGED" };
  const rest = page.description.slice(introMatch[0].length);

  let soloRank = { state: "NOT_REPORTED", tier: null, division: null, lp: null, wins: null, losses: null };
  const rankPrefix = `${name}'s current SOLORANKED rank is `;
  if (rest.startsWith(rankPrefix)) {
    const rank = /^([a-z]+) Division ([1-4]) ([\d,]+) LP(?: with ([\d,]+) wins?, ([\d,]+) loss(?:es)?)?/i.exec(rest.slice(rankPrefix.length));
    if (!rank) return { ok: false, code: "STRUCTURE_CHANGED" };
    const tier = rank[1].toUpperCase();
    if (!RANK_TIERS.includes(tier)) return { ok: false, code: "STRUCTURE_CHANGED" };
    const division = APEX_TIERS.includes(tier) ? "I" : DIVISIONS[Number(rank[2]) - 1];
    soloRank = {
      state: "RANKED", tier, division, lp: toInt(rank[3]),
      wins: rank[4] === undefined ? null : toInt(rank[4]),
      losses: rank[5] === undefined ? null : toInt(rank[5]),
    };
  }

  const icon = typeof person.image === "string" ? /^https:\/\/opgg-static\.akamaized\.net\/meta\/images\/profile_icons\/profileIcon(\d{1,6})\.(?:jpg|png)$/.exec(person.image) : null;
  const updated = typeof page.dateModified === "string" && !Number.isNaN(Date.parse(page.dateModified)) ? new Date(page.dateModified).toISOString() : null;

  return {
    ok: true,
    snapshot: { gameName, tagLine, platformId, soloRank, profileIconId: icon ? Number(icon[1]) : null, sourceUrl, sourceUpdatedAt: updated },
  };
}

async function lookup(query, { fetchImpl = fetch } = {}) {
  const sourceUrl = buildProfileUrl(query);
  if (!sourceUrl) return { ok: false, code: "UNAVAILABLE" };

  let target = sourceUrl;
  let response;
  try {
    for (let hops = 0; ; hops += 1) {
      response = await fetchImpl(target, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, Accept: "text/html", "Accept-Language": "en" },
      });
      if (response.status >= 300 && response.status < 400) {
        const next = safeRedirectTarget(response.headers.get("location") || "", target);
        if (hops >= 1 || !next) return { ok: false, code: "UNAVAILABLE" };
        target = next;
        continue;
      }
      break;
    }
  } catch { return { ok: false, code: "UNAVAILABLE" }; }

  if (response.status === 404) return { ok: false, code: "NOT_FOUND" };
  if (response.status !== 200) return { ok: false, code: "UNAVAILABLE" };
  if (!/^text\/html/i.test(response.headers.get("content-type") || "")) return { ok: false, code: "STRUCTURE_CHANGED" };

  let html;
  try { html = await readCapped(response); } catch { return { ok: false, code: "UNAVAILABLE" }; }
  if (html === null) return { ok: false, code: "STRUCTURE_CHANGED" };
  return parseProfilePage(html, { platformId: query.platformId, sourceUrl });
}

export const opggAdapter = Object.freeze({ sourceKey: OPGG_SOURCE_KEY, lookup });
