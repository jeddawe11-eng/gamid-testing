// Game Catalog search controller: the 3-character floor, debounce, narrowing, stale-answer protection, bounded results, and no request without a reason.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GAME_SEARCH_DEBOUNCE_MS, GAME_SEARCH_MAX_RESULTS, GAME_SEARCH_MIN_CHARS, compactSearchText, createGameSearch, foldSearchText, isSearchable, normalizeSearchResults,
} from "../dist/account/game-search.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// A controllable clock + a search backend that records every request and answers only when told to.
function harness({ catalog = [] } = {}) {
  const requests = [];
  const pending = [];
  const timers = new Map();
  let nextTimer = 1;
  const states = [];
  const search = createGameSearch({
    search: (query, limit) => new Promise((resolve, reject) => { requests.push({ query, limit }); pending.push({ query, resolve, reject }); }),
    onChange: state => states.push(state),
    schedule: (fn, delay) => { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    cancel: id => { timers.delete(id); },
  });
  return {
    search, requests, states,
    timers: () => timers.size,
    fireTimers: () => { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
    answer: async (index, rows) => { pending[index].resolve(rows); await new Promise(resolve => setImmediate(resolve)); },
    fail: async index => { pending[index].reject(new Error("boom")); await new Promise(resolve => setImmediate(resolve)); },
    last: () => states[states.length - 1],
    catalog,
  };
}
const row = (game_key, display_name, matched_alias = null) => ({ game_key, display_name, matched_alias });

test("nothing is requested before 3 meaningful characters: not on typing, not after the debounce, and spaces/punctuation do not count", () => {
  const h = harness();
  for (const text of ["m", "ma", "  m a ", "--'", "M ' A"]) h.search.input(text);
  h.fireTimers();
  assert.equal(h.requests.length, 0);
  assert.equal(h.timers(), 0, "not even a timer is armed below the floor");
  assert.equal(h.last().status, "short");
  h.search.input("");
  assert.equal(h.last().status, "idle");
  assert.equal(GAME_SEARCH_MIN_CHARS, 3);
});

test("the search begins at exactly 3 characters, once, after the debounce - and never before it", async () => {
  const h = harness();
  h.search.input("mar");
  assert.equal(h.requests.length, 0, "the request waits for the pause");
  assert.equal(h.last().status, "waiting");
  h.fireTimers();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.requests[0], { query: "mar", limit: GAME_SEARCH_MAX_RESULTS });
  await h.answer(0, [row("marvel_rivals", "Marvel Rivals")]);
  assert.equal(h.last().status, "results");
  assert.deepEqual(h.last().results, [{ gameKey: "marvel_rivals", name: "Marvel Rivals", alias: null, year: null }]);
});

test("debounce: a burst of keystrokes makes ONE request for the final text, not one per keystroke", () => {
  const h = harness();
  for (const text of ["mar", "marv", "marve", "marvel", "marvel ", "marvel r"]) h.search.input(text);
  assert.equal(h.requests.length, 0);
  assert.equal(h.timers(), 1, "each keystroke replaces the pending timer");
  h.fireTimers();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].query, "marvel r");
  assert.equal(GAME_SEARCH_DEBOUNCE_MS >= 200, true, "a real pause, not a token delay");
});

test("more characters narrow the results: a new query replaces the old answer, and an old answer arriving late is discarded", async () => {
  const h = harness();
  h.search.input("mar");
  h.fireTimers();
  h.search.input("marv");
  h.fireTimers();
  assert.equal(h.requests.length, 2);
  await h.answer(1, [row("marvel_rivals", "Marvel Rivals")]);
  assert.deepEqual(h.last().results.map(r => r.gameKey), ["marvel_rivals"]);
  await h.answer(0, [row("mario", "Mario"), row("mars", "Mars"), row("marvel_rivals", "Marvel Rivals")]);
  assert.deepEqual(h.last().results.map(r => r.gameKey), ["marvel_rivals"], "the slower, older answer for 'mar' must not overwrite the answer for 'marv'");
  assert.equal(h.last().query, "marv");
});

test("typing back below the floor cancels the pending request and ignores an answer already in flight", async () => {
  const h = harness();
  h.search.input("mar");
  h.fireTimers();
  h.search.input("ma");
  assert.equal(h.last().status, "short");
  await h.answer(0, [row("mario", "Mario")]);
  assert.equal(h.last().status, "short");
  assert.deepEqual(h.last().results, []);
  h.search.input("mar");
  h.search.input("m");
  h.fireTimers();
  assert.equal(h.requests.length, 1, "the armed timer was cancelled by the shorter input");
});

test("search is case-insensitive, whitespace- and punctuation-tolerant on the client side of the contract too (same folding as the database)", () => {
  assert.equal(foldSearchText("  Marvel's  Spider-Man™: MILES "), "marvels spider man miles");
  assert.equal(compactSearchText("Spider - Man"), "spiderman");
  assert.equal(isSearchable("MAR"), true);
  assert.equal(isSearchable("m a"), false);
  assert.equal(isSearchable("x".repeat(81)), false, "an oversized query is never sent");
  assert.equal(foldSearchText(null), "");
  assert.equal(foldSearchText("Pokémon Écarlate"), "pokémon écarlate");
});

test("the same query is answered from the small cache (no second request), case and spacing differences included", async () => {
  const h = harness();
  h.search.input("marvel");
  h.fireTimers();
  await h.answer(0, [row("marvel_rivals", "Marvel Rivals")]);
  h.search.input("mar");
  h.fireTimers();
  await h.answer(1, [row("marvel_rivals", "Marvel Rivals"), row("mario", "Mario")]);
  h.search.input("MARVEL");
  assert.equal(h.last().status, "results");
  assert.equal(h.requests.length, 2, "backspacing / retyping a known query asks nothing");
  assert.equal(h.timers(), 0);
});

test("alias matches keep the alias the server reported, so the user can see why a game matched", async () => {
  const h = harness();
  h.search.input("zorkling");
  h.fireTimers();
  await h.answer(0, [row("qzxplore_saga", "Qzxplore Saga", "Zorkling Chronicles")]);
  assert.deepEqual(h.last().results, [{ gameKey: "qzxplore_saga", name: "Qzxplore Saga", alias: "Zorkling Chronicles", year: null }]);
});

test("results are bounded and sanitized: at most the limit, duplicates and malformed rows dropped, nothing but a canonical key plus text survives", async () => {
  const h = harness();
  h.search.input("many");
  h.fireTimers();
  const rows = Array.from({ length: 200 }, (_, i) => row(`game_${String(i).padStart(3, "0")}`, `Game ${i}`));
  await h.answer(0, [...rows, null, {}, { game_key: "Bad Key", display_name: "x" }, { game_key: "game_000", display_name: "dup" }, { game_key: "ok_key", display_name: "" }, { game_key: "x", display_name: "short key" }]);
  assert.equal(h.last().results.length, GAME_SEARCH_MAX_RESULTS);
  assert.equal(normalizeSearchResults(rows, 12).length, 12);
  assert.deepEqual(normalizeSearchResults("nope"), []);
  assert.deepEqual(normalizeSearchResults([{ game_key: "a_game", display_name: "x".repeat(200) }, { game_key: "b_game", display_name: "<img onerror=x>" }]).map(r => r.name), ["<img onerror=x>"], "text is kept as text (it is only ever rendered as text)");
});

test("a server row whose key is not a canonical game key is dropped outright, so it can never be selected or saved", () => {
  assert.deepEqual(normalizeSearchResults([{ game_key: "Bad Key", display_name: "Spaces" }, { game_key: "x", display_name: "Too short" }, { game_key: "9lives", display_name: "Leading digit" }, { game_key: "a".repeat(65), display_name: "Too long" }, { game_key: 5, display_name: "Number" }]), []);
  assert.deepEqual(normalizeSearchResults([{ game_key: "a".repeat(64), display_name: "Longest valid key" }]).map(r => r.gameKey), ["a".repeat(64)]);
});
test("states are honest: empty means 'no matches', an error means 'could not search' and neither pretends to be the other", async () => {
  const h = harness();
  h.search.input("zzzz");
  h.fireTimers();
  await h.answer(0, []);
  assert.equal(h.last().status, "empty");
  h.search.input("yyyy");
  h.fireTimers();
  await h.fail(1);
  assert.equal(h.last().status, "error");
  assert.deepEqual(h.last().results, []);
  h.search.input("wwww");
  h.fireTimers();
  await h.answer(2, [row("w_game", "W Game")]);
  assert.equal(h.last().status, "results", "a later search recovers");
});

test("destroy() cancels the timer and drops any answer still in flight", async () => {
  const h = harness();
  h.search.input("mar");
  h.search.destroy();
  assert.equal(h.timers(), 0);
  h.search.input("marv");
  h.fireTimers();
  const before = h.states.length;
  h.search.destroy();
  await h.answer(0, [row("marvel_rivals", "Marvel Rivals")]);
  assert.equal(h.states.length, before, "nothing is published after destroy()");
});

test("the controller is provider-neutral, makes no request of its own and cannot reach the catalog except through the injected search function", () => {
  const source = read("dist/account/game-search.js").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /steam|xbox|playstation|discord|riot|epic|nintendo|marvel|fetch\(|XMLHttpRequest|WebSocket|setInterval|localStorage|innerHTML/i);
  assert.doesNotMatch(source, /\bsupabase\b|\brpc\b/i);
});
