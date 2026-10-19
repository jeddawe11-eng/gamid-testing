// My Gamer Data Phase 2 (client side): the generic section contract - strict normalisation of the server's projection, the `section` binding (validation,
// rendering, Properties keys), resolution for the owner and for visitors (privacy, removed items, unknown sections), the generic painter, discovery in the
// desktop library, and the visitor page reading the projection only when its Wall binds a section.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeGamerData, usesGamerSections, loadPublicView, loadGamidSnapshot } from "../dist/wall-editor/gamid-data.js";
import { validateGamidDataPayload, renderGamidDataPayload, isDataCollection, isDataText, isSectionItem, DATA_FIELD_INFO } from "../dist/wall-kit/gamid-data.js";
import { resolveGamidData } from "../dist/wall-kit/gamid-data-paint.js";
import { paintGamidSection, sectionItemText } from "../dist/wall-kit/gamid-blocks.js";
import { minSizeOf, setGamidStyle } from "../dist/wall-kit/ops.js";
import { createDocument } from "../dist/wall/schema.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const ABOUT = { key: "about_me", label: "About Me", icon: "about", presentation: "facts", single: true, all: true, order: 30, item_label: "Fact", items: [
  { id: "location", kind: "text", label: "Location", value: "Paris, France", private: false },
  { id: "member_since", kind: "text", label: "Member Since", value: "3 October 2026", private: false },
  { id: "languages", kind: "chips", label: "Languages", values: ["English", "Arabic"], private: true },
] };
const FAVS = { key: "favorite_games", label: "Favorite Games", icon: "favorite", presentation: "cards", single: true, all: true, order: 40, item_label: "Favorite Game", items: [
  { id: "elden_ring", kind: "card", label: "Elden Ring", title: "Elden Ring", sub: "2022", private: false },
  { id: "valorant", kind: "card", label: "Valorant", title: "Valorant", private: false },
] };

// a tiny DOM stand-in for the painter (textContent / className / attributes / children only)
function createNode(tag) {
  return { tag, className: "", textContent: "", children: [], attributes: {}, style: { setProperty() {} }, setAttribute(name, value) { this.attributes[name] = value; },
    append(...nodes) { for (const node of nodes) this.children.push(typeof node === "string" ? { tag: "#text", textContent: node, children: [] } : node); } };
}
const texts = node => [node.textContent, ...node.children.flatMap(texts)].filter(Boolean);
const find = (node, className) => (node.className.split(" ").includes(className) ? [node] : []).concat(node.children.flatMap(child => find(child, className)));

test("normalisation: only the contract's generic shape survives; owner keeps private flags, a visitor never has them", () => {
  const rows = [ABOUT, FAVS,
    { key: "Bad Key", label: "x", presentation: "facts", single: true, all: true, items: [] },
    { key: "html", label: "Html", presentation: "html", single: true, all: true, items: [] },
    { key: "nomode", label: "No mode", presentation: "chips", single: false, all: false, items: [] },
    { ...FAVS, label: "Duplicate" },
    { key: "odd_items", label: "Odd", icon: "<svg>", presentation: "chips", all: true, items: [{ id: "../x", kind: "text", value: "a" }, { id: "ok", kind: "script", value: "a" }, { id: "c1", kind: "chips", values: ["a", 7, "", "b"] }, { id: "c2", kind: "text", value: "" }] },
  ];
  const owner = normalizeGamerData(rows, { owner: true });
  assert.deepEqual(owner.map(row => row.key), ["about_me", "favorite_games", "odd_items"]);
  assert.equal(owner[0].items[2].private, true);
  assert.equal(owner[0].itemLabel, "Fact");
  assert.equal(owner[2].icon, "section", "an unsafe icon key falls back to the generic icon");
  assert.deepEqual(owner[2].items, [{ id: "c1", kind: "chips", label: "c1", values: ["a", "b"] }]);
  assert.ok(normalizeGamerData(rows).every(row => row.items.every(item => !("private" in item))));
  assert.deepEqual(normalizeGamerData("nope"), []);
});

test("binding: a whole section is a block (style, layout), one item is text-like (text); formats and keys are strict", () => {
  assert.deepEqual(validateGamidDataPayload({ field: "section", section: "about_me" }), []);
  assert.deepEqual(validateGamidDataPayload({ field: "section", section: "favorite_games", item: "elden_ring" }), []);
  assert.deepEqual(validateGamidDataPayload({ field: "section", section: "About Me" }), ["INVALID_DATA_SECTION"]);
  assert.deepEqual(validateGamidDataPayload({ field: "section", section: "favorite_games", item: "../x" }), ["INVALID_DATA_ITEM"]);
  assert.deepEqual(validateGamidDataPayload({ field: "section", section: "about_me", item: "location", layout: "card" }), ["INVALID_DATA_KEY"]);
  const whole = renderGamidDataPayload({ field: "section", section: "about_me" });
  assert.deepEqual([whole.section, whole.item, whole.layout, whole.text], ["about_me", undefined, "card", undefined]);
  const one = renderGamidDataPayload({ field: "section", section: "about_me", item: "location" });
  assert.deepEqual([one.item, one.layout, one.text.fontFamily], ["location", undefined, "rajdhani"]);
  assert.ok(isDataCollection({ field: "section", section: "x1" }) && !isDataText({ field: "section", section: "x1" }));
  assert.ok(isSectionItem({ field: "section", section: "x1", item: "a" }) && isDataText({ field: "section", section: "x1", item: "a" }));
  assert.ok(isDataCollection({ field: "roles" }) && isDataText({ field: "bio" }), "the existing fields keep their kinds");
});

test("ops: a whole section takes the block style and the block minimum; one item does not", () => {
  const doc = createDocument();
  doc.stages[0].elements = [
    { id: "a", type: "gamidData", x: 0, y: 0, width: 800, height: 300, z: 0, payload: { field: "section", section: "about_me" } },
    { id: "b", type: "gamidData", x: 0, y: 0, width: 700, height: 90, z: 1, payload: { field: "section", section: "about_me", item: "location" } },
  ];
  assert.deepEqual(minSizeOf(doc.stages[0].elements[0]), DATA_FIELD_INFO.section.minSize);
  assert.ok(setGamidStyle(doc, ["a"], { bgMode: "none" }).ok);
  assert.equal(setGamidStyle(doc, ["b"], { bgMode: "none" }).ok, false);
});

test("resolution: the owner designs with every item (private ones tagged); visitors only get the public projection; gone items are never replaced", () => {
  const owner = { profile: {}, sections: normalizeGamerData([ABOUT, FAVS], { owner: true }), public: { available: true, sections: normalizeGamerData([{ ...ABOUT, items: ABOUT.items.slice(0, 2) }, FAVS]) } };
  const content = payload => renderGamidDataPayload({ field: "section", ...payload });
  assert.deepEqual(resolveGamidData(content({ section: "about_me", item: "location" }), owner, "edit"), { state: "ok", value: "Paris, France" });
  assert.deepEqual(resolveGamidData(content({ section: "about_me", item: "languages" }), owner, "edit"), { state: "ok", value: "English · Arabic", private: true });
  assert.deepEqual(resolveGamidData(content({ section: "about_me", item: "languages" }), owner, "view"), { state: "hidden" }, "private on Classic: nothing for visitors");
  assert.deepEqual(resolveGamidData(content({ section: "favorite_games", item: "halo" }), owner, "edit"), { state: "missing", message: "This is no longer in your Favorite Games." });
  assert.deepEqual(resolveGamidData(content({ section: "favorite_games", item: "halo" }), owner, "view"), { state: "hidden" });
  assert.deepEqual(resolveGamidData(content({ section: "future_section" }), owner, "edit"), { state: "missing", message: "This Classic section is not available on your GamID." });
  assert.deepEqual(resolveGamidData(content({ section: "future_section" }), owner, "view"), { state: "hidden" });
  assert.equal(resolveGamidData(content({ section: "favorite_games" }), owner, "view").value.items.length, 2);
  assert.deepEqual(resolveGamidData(content({ section: "about_me" }), { ...owner, public: { available: false } }, "view"), { state: "hidden" });
  const notPublic = { ...owner, public: { available: false } };
  assert.equal(resolveGamidData(content({ section: "about_me", item: "location" }), notPublic, "edit").private, true, "a GamID that is not public: everything is private");
});

test("painter: the generic presentations draw the items in order, with the block look; PRIVATE only in the owner's view", () => {
  const [about, favs] = normalizeGamerData([ABOUT, FAVS], { owner: true });
  const card = paintGamidSection(about, { layout: "card" }, createNode, { owner: true });
  assert.equal(card.attributes["data-section"], "about_me");
  assert.ok(card.className.includes("wall-gamid wall-gamid-section is-card"));
  assert.deepEqual(texts(card).slice(0, 5), ["ABOUT ME", "Location", "Paris, France", "Member Since", "3 October 2026"]);
  assert.deepEqual(find(card, "wall-gamid-chips")[0].children.map(li => li.textContent), ["English", "Arabic"]);
  assert.equal(find(card, "wall-gamid-private").length, 1, "the private Languages fact is tagged for the owner");
  assert.equal(find(paintGamidSection(about, {}, createNode, { owner: false }), "wall-gamid-private").length, 0);
  const list = paintGamidSection(favs, { layout: "compact" }, createNode);
  assert.deepEqual(texts(list), ["FAVORITE GAMES", "Elden Ring", "2022", "Valorant"]);
  assert.deepEqual(texts(paintGamidSection({ ...favs, items: [] }, {}, createNode)), ["FAVORITE GAMES", "Nothing to show yet."]);
  assert.equal(sectionItemText({ kind: "card", title: "Halo" }), "Halo");
});

test("reads: the editor loads the owner projection with its snapshot; a visitor's page reads the public projection only when its Wall binds a section", async () => {
  const calls = [];
  const api = new Proxy({}, { get: (_, name) => async (...args) => { calls.push(name); if (name === "getIdentity") return { gamid_handle: "alpha", display_name: "A" }; if (name === "getPublicIdentity") return { public_sections: {} };
    if (name === "getMyGamerData") return [ABOUT]; if (name === "getPublicGamerData") return [FAVS]; return null; } });
  const snapshot = await loadGamidSnapshot(api);
  assert.deepEqual(snapshot.sections.map(row => row.key), ["about_me"]);
  assert.deepEqual(snapshot.public.sections.map(row => row.key), ["favorite_games"]);
  calls.length = 0;
  const plain = await loadPublicView(api, "alpha");
  assert.deepEqual(plain.sections, []);
  assert.ok(!calls.includes("getPublicGamerData"), "no extra read for a Wall that binds no section");
  const doc = createDocument();
  assert.equal(usesGamerSections(doc), false);
  doc.stages[0].elements.push({ id: "s", type: "gamidData", payload: { field: "section", section: "favorite_games" } });
  assert.equal(usesGamerSections(doc), true);
  const failing = new Proxy({}, { get: (_, name) => async () => { if (name === "getIdentity") return { gamid_handle: "alpha" }; if (name === "getMyGamerData") throw new Error("PGRST202"); return null; } });
  assert.deepEqual((await loadGamidSnapshot(failing)).sections, [], "before the migration (no RPC) the editor simply has no catalog sections");
  assert.match(read("dist/public/public-wall.js"), /sections: usesGamerSections\(doc\) \}\)\.catch\(\(\) => null\);/);
});

test("library: catalog sections are discovered from the projection (no Wall menu entry per section), placed by catalog order, each choice once", () => {
  const tools = read("dist/wall-editor/tools.js");
  assert.doesNotMatch(tools, /about_me|favorite_games|Favorite Games|About Me/, "no section of the catalog is named in the editor");
  assert.match(tools, /const catalog = \(snapshot\?\.sections \?\? \[\]\)\.filter\(section => !fixed\.has\(section\.key\)\)/);
  assert.match(tools, /return \[\.\.\.GAMER_DATA_SECTIONS, \.\.\.catalog\]\.filter\(section => section\.items\.length \|\| section\.source\)\.sort\(\(a, b\) => a\.order - b\.order\);/);
  assert.match(tools, /if \(!\(section\.key in gdOpen\)\) gdOpen\[section\.key\] = false;/);
  assert.match(read("dist/wall-editor/editor-desktop.css"), /\[data-tool-panel="gamid"\] \.ed-gd-icon \{ --ic: var\(--gd-section\); \}/, "a new section without an icon of its own still has one");
});
