// Provider-neutral collapsible game list: a library of 200-300+ games must never expand a profile / editor section by default.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_LIST_PREVIEW, buildGameLibrary, gameListCountLabel, gameListToggleLabel, gameListView } from "../dist/account/game-list.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// A minimal fake DOM element (no jsdom in this project): enough to inspect what buildGameLibrary creates.
function fake(tag, className, text) {
  const node = { tag, className: className || "", text: text ?? "", children: [], attrs: {}, dataset: {}, listeners: {}, id: "", type: "" };
  node.append = (...items) => { node.children.push(...items); };
  node.setAttribute = (key, value) => { node.attrs[key] = String(value); };
  node.addEventListener = (event, handler) => { node.listeners[event] = handler; };
  return node;
}
const games = count => Array.from({ length: count }, (_, i) => ({ id: String(i + 1), name: `Game ${i + 1}` }));
const row = game => fake("li", "game-item", game.name);
const find = (node, predicate, out = []) => { if (predicate(node)) out.push(node); for (const child of node.children || []) if (typeof child === "object") find(child, predicate, out); return out; };

test("the default state is compact: only a small bounded preview, whatever the library size", () => {
  assert.ok(GAME_LIST_PREVIEW >= 5 && GAME_LIST_PREVIEW <= 12, "a reasonable limited subset");
  for (const total of [9, 50, 120, 300, 1000, 10000]) {
    const view = gameListView(total, false);
    assert.equal(view.showing, GAME_LIST_PREVIEW);
    assert.equal(view.total, total);
    assert.equal(view.hidden, total - GAME_LIST_PREVIEW);
    assert.ok(view.collapsible && !view.expanded);
  }
});

test("a short list needs no control and is never hidden; nonsense sizes are safe", () => {
  for (const total of [0, 1, 3, GAME_LIST_PREVIEW]) {
    const view = gameListView(total, false);
    assert.equal(view.showing, total);
    assert.equal(view.hidden, 0);
    assert.ok(!view.collapsible);
    assert.ok(!gameListView(total, true).expanded, "nothing to expand");
    assert.equal(gameListToggleLabel(view), "");
  }
  for (const bad of [undefined, null, -5, Number.NaN, 1.5, "12", Infinity]) assert.equal(gameListView(bad, true).total, 0);
});

test("expanding reveals everything and collapsing returns to the preview; the total count is always shown", () => {
  const collapsed = gameListView(243, false), expanded = gameListView(243, true);
  assert.equal(expanded.showing, 243);
  assert.equal(expanded.hidden, 0);
  assert.ok(expanded.expanded && expanded.collapsible);
  assert.equal(gameListCountLabel(collapsed), "243 games");
  assert.equal(gameListCountLabel(expanded), "243 games");
  assert.equal(gameListCountLabel(gameListView(1, false)), "1 game");
  assert.equal(gameListToggleLabel(collapsed), "Show all 243 games");
  assert.equal(gameListToggleLabel(expanded), "Show fewer games");
});

test("collapsed DOM: only the preview rows exist, the count and a chevron toggle with aria-expanded=false are present", () => {
  let toggled = 0;
  const wrap = buildGameLibrary({ element: fake, games: games(300), renderItem: row, expanded: false, onToggle: () => { toggled += 1; }, id: "gameList-x" });
  const items = find(wrap, node => node.tag === "li");
  assert.equal(items.length, GAME_LIST_PREVIEW, "the other 292 games are not even created as DOM nodes");
  assert.equal(wrap.dataset.expanded, "false");
  const count = find(wrap, node => node.className === "game-library-count")[0];
  assert.equal(count.text, "300 games");
  const [toggle] = find(wrap, node => node.tag === "button");
  assert.equal(toggle.attrs["aria-expanded"], "false");
  assert.equal(toggle.attrs["aria-controls"], "gameList-x");
  assert.equal(toggle.type, "button");
  assert.ok(find(toggle, node => node.className === "game-library-chevron").length === 1, "a clear chevron");
  assert.ok(find(toggle, node => node.text === "Show all 300 games").length === 1);
  assert.ok(find(toggle, node => node.text === `${300 - GAME_LIST_PREVIEW} more`).length === 1);
  toggle.listeners.click();
  assert.equal(toggled, 1);
  assert.equal(find(wrap, node => node.tag === "ul")[0].id, "gameList-x");
});

test("expanded DOM: every game is listed, the same control collapses again", () => {
  const wrap = buildGameLibrary({ element: fake, games: games(300), renderItem: row, expanded: true, onToggle: () => {}, id: "gameList-x" });
  assert.equal(find(wrap, node => node.tag === "li").length, 300);
  const [toggle] = find(wrap, node => node.tag === "button");
  assert.equal(toggle.attrs["aria-expanded"], "true");
  assert.ok(find(toggle, node => node.text === "Show fewer games").length === 1);
  assert.equal(find(toggle, node => node.className === "game-library-more").length, 0);
});

test("a short library renders without any toggle", () => {
  const wrap = buildGameLibrary({ element: fake, games: games(3), renderItem: row, expanded: false, onToggle: () => {}, id: "gameList-y" });
  assert.equal(find(wrap, node => node.tag === "button").length, 0);
  assert.equal(find(wrap, node => node.tag === "li").length, 3);
});

test("the list module is provider-neutral: it names no provider and keeps no provider state", () => {
  const source = read("dist/account/game-list.js");
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ""), /steam|xbox|playstation|discord|riot|epic|nintendo|provider_key|source_provider/i);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test("the editor uses it for the ONE My Games library through an expanded set that starts empty (collapsed by default)", () => {
  const account = read("dist/account/account.js");
  assert.match(account, /import \{ buildGameLibrary \} from "\.\/game-list\.js";/);
  assert.match(account, /const gameListExpanded = new Set\(\);/);
  // the library is provider-neutral (Steam-discovered games and games added by hand in one list), so its state key is "library", not a provider
  assert.match(account, /expanded: gameListExpanded\.has\("library"\)/);
  assert.doesNotMatch(account, /gameListExpanded\.has\("steam"\)/);
  assert.doesNotMatch(account, /steamGamesShowAll|STEAM_GAMES_PREVIEW/);
  const css = read("dist/account/account.css");
  const block = css.slice(css.indexOf("/* Provider-neutral game library"), css.indexOf("/* Steam Connection Foundation:"));
  assert.match(block, /\.game-library-toggle\{[^}]*min-height:2\.75rem/, "a real touch target");
  assert.match(block, /\.game-library-chevron\{/);
  assert.match(block, /\.game-library-toggle\[aria-expanded="true"\] \.game-library-chevron\{/);
  assert.doesNotMatch(block, /data-provider/, "the library styles are not scoped to one provider");
  assert.doesNotMatch(block, /text-overflow:ellipsis|white-space:nowrap/);
});

test("each game row keeps its provenance label (Discovered via Steam): the list never hides where a game came from", () => {
  assert.match(read("dist/account/account.js"), /"Discovered via Steam"/);
});
