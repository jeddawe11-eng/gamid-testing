// Provider-neutral Game Catalog search controller (no DOM, no network of its own).
//
// The catalog can hold tens of thousands of games and is NEVER sent to the browser. This controller decides WHEN to ask the server:
//   * nothing is requested until the input holds at least GAME_SEARCH_MIN_CHARS meaningful characters (spaces / punctuation do not count)
//   * typing is debounced: one request per pause, never one per keystroke
//   * an answer that arrives after the user typed something newer is discarded (it can never overwrite fresher results)
//   * an identical query already answered is served from a small in-memory cache instead of asking again
// The server enforces the same 3-character floor and the 12-row ceiling; this is the polite half of that contract.

export const GAME_SEARCH_MIN_CHARS = 3;
export const GAME_SEARCH_DEBOUNCE_MS = 300;
export const GAME_SEARCH_MAX_RESULTS = 10;
export const GAME_SEARCH_MAX_INPUT = 80;
const CACHE_LIMIT = 40;
const GAME_KEY = /^[a-z][a-z0-9_]{1,63}$/;

// Same folding the database uses for search keys: lower-case, apostrophes dropped, every other run of non-letters/digits becomes one space.
export function foldSearchText(text) {
  return String(text ?? "").toLowerCase().replace(/['’`´]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export const compactSearchText = text => foldSearchText(text).replace(/ /g, "");
export const isSearchable = text => compactSearchText(text).length >= GAME_SEARCH_MIN_CHARS && String(text).length <= GAME_SEARCH_MAX_INPUT;

// Anything malformed from the server is dropped; a result can only ever be a canonical game key plus text to display.
export function normalizeSearchResults(rows, limit = GAME_SEARCH_MAX_RESULTS) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const results = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof row.game_key !== "string" || !GAME_KEY.test(row.game_key) || seen.has(row.game_key)) continue;
    const name = typeof row.display_name === "string" ? row.display_name.trim() : "";
    if (!name || name.length > 120) continue;
    const alias = typeof row.matched_alias === "string" && row.matched_alias.trim() && row.matched_alias.trim().length <= 120 ? row.matched_alias.trim() : null;
    seen.add(row.game_key);
    results.push({ gameKey: row.game_key, name, alias });
    if (results.length >= limit) break;
  }
  return results;
}

// status: "idle" (nothing typed) | "short" (typed, but fewer than 3 characters) | "waiting" (debouncing) | "loading" | "results" | "empty" | "error"
export function createGameSearch({ search, onChange, schedule = setTimeout, cancel = clearTimeout, delay = GAME_SEARCH_DEBOUNCE_MS, limit = GAME_SEARCH_MAX_RESULTS }) {
  let state = { status: "idle", query: "", results: [] };
  let timer = null;
  let sequence = 0;
  const cache = new Map();

  const publish = next => { state = next; onChange?.(state); };
  const stopTimer = () => { if (timer !== null) { cancel(timer); timer = null; } };

  async function run(raw, key, mine) {
    publish({ status: "loading", query: raw, results: state.results });
    let rows;
    try { rows = await search(raw.trim(), limit); }
    catch { if (mine === sequence) publish({ status: "error", query: raw, results: [] }); return; }
    if (mine !== sequence) return;   // the user typed something newer
    const results = normalizeSearchResults(rows, limit);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, results);
    publish({ status: results.length ? "results" : "empty", query: raw, results });
  }

  return {
    input(raw) {
      const text = String(raw ?? "");
      sequence += 1;
      stopTimer();
      if (!text.trim()) { publish({ status: "idle", query: "", results: [] }); return; }
      if (!isSearchable(text)) { publish({ status: "short", query: text, results: [] }); return; }
      const key = foldSearchText(text);
      const cached = cache.get(key);
      if (cached) { publish({ status: cached.length ? "results" : "empty", query: text, results: cached }); return; }
      const mine = sequence;
      publish({ status: "waiting", query: text, results: state.results });
      timer = schedule(() => { timer = null; run(text, key, mine); }, delay);
    },
    state: () => state,
    destroy() { sequence += 1; stopTimer(); },
  };
}
