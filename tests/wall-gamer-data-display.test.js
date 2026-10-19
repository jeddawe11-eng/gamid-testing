// Favorite Games Display Style (Mazen's task 2026-10-19): an optional per-element `display` ("names" default | "covers") on a Classic section binding whose
// section has game artwork (catalog wall_artwork = 'game'). Names Only is the Phase 2 drawing; Game Covers reuses Classic's own artwork placement.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateGamidDataPayload, renderGamidDataPayload, SECTION_DISPLAYS } from "../dist/wall-kit/gamid-data.js";
import { coverLayout, paintGameCovers, COVER_RATIO } from "../dist/wall-kit/gamid-blocks.js";
import { createArtworkStore } from "../dist/wall-kit/gamid-artwork.js";
import { normalizeGamerData, usesGamerCovers } from "../dist/wall-editor/gamid-data.js";
import { createDocument } from "../dist/wall/schema.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
function createNode(tag) {
  return { tag, className: "", textContent: "", children: [], attributes: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, setAttribute(k, v) { this.attributes[k] = v; },
    append(...nodes) { this.children.push(...nodes); } };
}
const all = (node, cls) => (node.className.split(" ").includes(cls) ? [node] : []).concat(node.children.flatMap(child => all(child, cls)));
const FAVS = normalizeGamerData([{ key: "favorite_games", label: "Favorite Games", icon: "favorite", presentation: "cards", single: true, all: true, order: 40, item_label: "Favorite Game", artwork: "game",
  items: [{ id: "elden_ring", kind: "card", label: "Elden Ring", title: "Elden Ring", sub: "2022" }, { id: "valorant", kind: "card", label: "Valorant", title: "Valorant", private: true }] }], { owner: true })[0];

test("contract: display is optional on both section forms, names | covers only; absent = names (every saved element unchanged)", () => {
  assert.deepEqual(SECTION_DISPLAYS, ["names", "covers"]);
  for (const display of ["names", "covers"]) {
    assert.deepEqual(validateGamidDataPayload({ field: "section", section: "favorite_games", display }), []);
    assert.deepEqual(validateGamidDataPayload({ field: "section", section: "favorite_games", item: "elden_ring", display }), []);
  }
  assert.deepEqual(validateGamidDataPayload({ field: "section", section: "favorite_games", display: "posters" }), ["INVALID_DATA_DISPLAY"]);
  assert.deepEqual(validateGamidDataPayload({ field: "games", display: "covers" }), ["INVALID_DATA_KEY"]);
  assert.equal(renderGamidDataPayload({ field: "section", section: "favorite_games" }).display, "names");
  assert.equal(renderGamidDataPayload({ field: "section", section: "favorite_games", display: "covers" }).display, "covers");
  assert.equal(FAVS.artwork, "game");
  assert.equal(normalizeGamerData([{ ...FAVS, item_label: "x", artwork: "video" }])[0].artwork, null, "only the known capability is kept");
});

test("layout: the largest 2:3 covers that fit the box in both directions, with room for a two-line title", () => {
  for (const [count, width, height] of [[1, 700, 90], [3, 760, 260], [4, 760, 260], [4, 300, 900], [10, 800, 300], [2, 120, 120]]) {
    const { columns, rows, cover, title } = coverLayout(count, width, height, { gap: 12 });
    assert.ok(columns >= 1 && rows === Math.ceil(count / columns) && cover > 0, `${count} in ${width}x${height}`);
    assert.ok(columns * cover + (columns - 1) * 12 <= width + 0.01, "fits the width");
    assert.ok(rows * (cover * COVER_RATIO + title * 1.25 * 2 + 4) + (rows - 1) * 12 <= height + 0.01, "fits the height, titles included");
  }
  assert.equal(coverLayout(4, 760, 260).columns, 4, "a wide box: one row");
  assert.ok(coverLayout(4, 300, 900).columns <= 2, "a tall box: several rows");
});

test("painter: one card per game in order, Classic's [data-game-cover] slot with initials underneath, the name always shown, PRIVATE for the owner only", () => {
  const owner = paintGameCovers(FAVS, FAVS.items, { layout: "card" }, createNode, { owner: true, width: 760, height: 300 });
  assert.equal(owner.attributes["data-display"], "covers");
  const cards = all(owner, "wall-cover-card");
  assert.deepEqual(cards.map(card => card.attributes["data-game"]), ["elden_ring", "valorant"]);
  assert.deepEqual(all(owner, "wall-cover-art").map(art => art.attributes["data-game-cover"]), ["elden_ring", "valorant"]);
  assert.deepEqual(all(owner, "wall-cover-initials").map(node => node.textContent), ["ER", "V"]);
  assert.deepEqual(all(owner, "wall-cover-title").map(node => node.textContent), ["Elden Ring", "Valorant"]);
  assert.equal(all(owner, "wall-gamid-private").length, 1);
  assert.equal(all(paintGameCovers(FAVS, FAVS.items, {}, createNode, { width: 760, height: 300 }), "wall-gamid-private").length, 0);
  const one = paintGameCovers(FAVS, [FAVS.items[0]], { text: {} }, createNode, { single: true, width: 700, height: 300, titleFont: "x", titleColor: "#ff0000" });
  assert.equal(one.className, "wall-cover-single");
  assert.equal(all(one, "wall-cover-title")[0].style.props.color, "#ff0000", "one game's name takes the element's own text colour");
});

test("artwork: asked for once per page, only when a cover is painted; Refresh asks again; a refused read leaves the fallback", async () => {
  let reads = 0, changed = 0;
  const store = createArtworkStore(async () => { reads += 1; return { enabled: true, artwork: {} }; }, { onChange: () => { changed += 1; } });
  assert.equal(store.state, "idle");
  await Promise.all([store.request(), store.request()]);
  await store.request();
  assert.equal(reads, 1); assert.equal(changed, 1); assert.deepEqual(store.get(), { enabled: true, artwork: {} });
  store.reset(); await store.request();
  assert.equal(reads, 2);
  const failing = createArtworkStore(async () => { throw new Error("offline"); });
  await failing.request();
  assert.equal(failing.get(), null); assert.equal(failing.state, "done");
});

test("wiring: Classic's artwork code is reused as is; the visitor page reads artwork only when its Wall shows covers; Properties offers the choice on desktop only", () => {
  const paint = read("dist/wall-kit/gamid-data-paint.js");
  assert.match(paint, /import \{ applyGameArtwork \} from "\.\.\/public\/game-artwork\.js";/);
  assert.match(paint, /if \(content\.field === "section" && content\.display === "covers" && resolved\.section\?\.artwork === "game"\) \{/);
  assert.doesNotMatch(read("dist/wall-kit/gamid-blocks.js") + read("dist/wall-kit/gamid-artwork.js"), /steamgriddb/i, "the kit names no provider");
  assert.match(read("dist/public/public-wall.js"), /artwork: usesGamerCovers\(doc\) \? createArtworkStore\(\(\) => fetchGameArtwork\(/);
  assert.match(read("dist/wall-editor/editor.js"), /createArtworkStore\(\(\) => \(typeof api\.getMyGameArtwork === "function" \? api\.getMyGameArtwork\(\) : null\)/);
  const controls = read("dist/wall-editor/controls.js");
  assert.match(controls, /if \(gameArt && desktopProps\?\.matches && /);
  assert.match(controls, /set: value => patchAll\(\{ display: value === "covers" \? "covers" : undefined \}\)/, "Names Only stores nothing");
  const doc = createDocument();
  doc.stages[0].elements.push({ id: "a", type: "gamidData", payload: { field: "section", section: "favorite_games" } });
  assert.equal(usesGamerCovers(doc), false);
  doc.stages[0].elements[0].payload.display = "covers";
  assert.equal(usesGamerCovers(doc), true);
  assert.match(read("dist/wall-editor/index.html"), /img-src 'self' data: blob: https:\/\/cdn2\.steamgriddb\.com;/, "the editor may load Classic's covers (Mazen, option A) and nothing else new");
});
