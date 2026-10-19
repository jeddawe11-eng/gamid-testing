// My Gamer Data, Phase 1 (Mazen's task 2026-10-19): on desktop (900px and wider) the GamID tool is "My Gamer Data", an "Import from Classic" library of the Classic
// data a Wall can already show, in independent accordion sections, each choice once, routed to the existing GamID block / GamID data implementations, with a
// Refresh from Classic control. No new data, contract, schema or phone change.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const tools = read("dist/wall-editor/tools.js");
const editor = read("dist/wall-editor/editor.js");
const html = read("dist/wall-editor/index.html");
const css = read("dist/wall-editor/editor-desktop.css");
const base = read("dist/wall-editor/editor.css");

globalThis.document ??= { querySelectorAll: () => [] };
const { GAMER_DATA_SECTIONS } = await import("../dist/wall-editor/tools.js");
const { GAMID_BLOCKS } = await import("../dist/wall-kit/gamid.js");
const { DATA_FIELDS, DATA_ITEMS } = await import("../dist/wall-kit/gamid-data.js");

test("sections: Profile, Gaming Roles, My Games, Connections, My Duo, My Crews, with the requested choices", () => {
  assert.deepEqual(GAMER_DATA_SECTIONS.map(section => section.label), ["Profile", "Gaming Roles", "My Games", "Connections", "My Duo", "My Crews"]);
  assert.deepEqual(GAMER_DATA_SECTIONS.map(section => section.items.map(item => item.label)), [
    ["Avatar", "Display Name", "@GamID", "Bio", "Profile Card"], ["One Role", "All Roles"], ["One Game", "All Games"], ["One Connection", "All Connections"], ["My Duo"], ["My Crews"],
  ]);
});

test("each choice once, routed to an existing implementation; every GamID block is reachable, and the duplicated collections are offered once (as the block)", () => {
  const items = GAMER_DATA_SECTIONS.flatMap(section => section.items);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.equal(new Set(items.map(item => item.label)).size, items.length);
  for (const item of items) {
    if (item.kind === "block") assert.ok(GAMID_BLOCKS.includes(item.block), item.id);
    else if (item.kind === "pick") assert.ok(DATA_ITEMS.includes(item.field), item.id);
    else { assert.equal(item.kind, "data"); assert.ok(DATA_FIELDS.includes(item.field) && !DATA_ITEMS.includes(item.field), item.id); }
  }
  assert.deepEqual(items.filter(item => item.kind === "block").map(item => item.block).sort(), [...GAMID_BLOCKS].sort());
  assert.ok(!items.some(item => ["roles", "games", "connections"].includes(item.field)), "the data collections are not listed a second time");
  assert.doesNotMatch(JSON.stringify(GAMER_DATA_SECTIONS), /Favorite|About Me|Education|Banner|Socials/, "no Phase 2 / 3 imports");
});

test("the cards add exactly what the phone lists add (same payload builders, same sizes)", () => {
  assert.match(tools, /addCustom\("gamid", createGamidPayload\(item\.block\), GAMID_BLOCK_INFO\[item\.block\]\.size\)\.ok && setTool\("props"\)\)\n\s+: item\.kind === "section" \? addSection\(item\.section\) : item\.kind === "section-item" \? addSection\(item\.section, item\.item\) : addData\(item\.field\)\)/);
  assert.match(tools, /onclick: \(\) => addData\(item\.field, select\.value\) \}\)/);
  assert.match(tools, /const options = itemOptions\(item\.field, snapshot\);/, "the same owner-only options as the phone picker");
});

test("accordion: Profile open, the rest closed, kept for the visit; real heading buttons with name, count and chevron; sections independent", () => {
  assert.match(tools, /const gdOpen = \{ profile: true, roles: false, games: false, connections: false, duo: false, crews: false \};/);
  assert.match(tools, /h\("button", \{ class: "ed-font-group-toggle ed-gd-toggle", type: "button", "aria-expanded": String\(gdOpen\[section\.key\]\), "aria-controls": id,/);
  assert.match(tools, /gdOpen\[section\.key\] = !gdOpen\[section\.key\]; toggle\.setAttribute\("aria-expanded", String\(gdOpen\[section\.key\]\)\); body\.hidden = !gdOpen\[section\.key\];/);
  assert.match(tools, /h\("span", \{ class: "ed-font-group-count", text: String\(section\.items\.length\)/);
});

test("desktop only: the library is hidden markup on the phone, the phone lists and wording are untouched, and the switch follows the breakpoint", () => {
  assert.match(html, /<div id="gamerDataTools" class="ed-gd-tools" hidden>/);
  assert.match(html, /<h2>GamID blocks<\/h2>/);
  assert.match(html, /<button type="button" data-tool="gamid"><i aria-hidden="true">G<\/i><span>GamID<\/span><\/button>/);
  assert.match(tools, /if \(gamidTitle\) gamidTitle\.textContent = desktop \? "Import from Classic" : "GamID blocks";/);
  assert.match(tools, /if \(gamidRailLabel\) gamidRailLabel\.textContent = desktop \? "My Gamer Data" : "GamID";/);
  assert.match(tools, /for \(const node of legacyGamid\) node\.style\.setProperty\("display", desktop \? "none" : ""\);/);
  assert.match(tools, /desktopFonts\?\.addEventListener\?\.\("change", \(\) => \{ gdKey = ""; renderGamerData\(\); \}\);/);
  assert.doesNotMatch(base, /ed-gd-|gamerData/, "nothing new in the shared stylesheet");
});

test("Refresh from Classic: one read at a time, current data kept while loading and on failure, progress / success / error feedback", () => {
  assert.match(editor, /function refreshGamid\(\{ keep = false \} = \{\}\) \{\n  if \(gamidLoading\) return gamidLoading;\n  if \(!keep\) \{ gamidSnapshot = null; scheduleRender\(\); \}/);
  assert.match(editor, /const ok = Boolean\(next\?\.profile\?\.handle\);\n      if \(ok \|\| !keep \|\| !gamidSnapshot\) gamidSnapshot = next;/);
  assert.match(tools, /if \(gdRefreshing\) return;/);
  assert.match(tools, /ok = \(await refreshGamid\(\{ keep: true \}\)\) !== false;/);
  assert.match(tools, /gdFeedback\?\.show\("Refreshing from Classic…", \{ tone: "info", progress: true \}\);/);
  assert.match(tools, /createTransientMessage\(\$\("gamerDataStatus"\)\)/, "the shared transient-message rule (outcomes clear after about 3 s)");
  assert.match(html, /<button id="gamerDataRefresh" class="ed-gd-refresh-btn" type="button">Refresh from Classic<\/button><p id="gamerDataStatus" class="ed-gd-status" role="status" hidden><\/p>/);
});

test("look: scoped to the GamID panel, selected and disabled states, the rail label may wrap", () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...rules.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(selector => /ed-gd-|gamerData/.test(selector));
  assert.ok(selectors.length > 10);
  for (const selector of selectors) for (const part of selector.split(",")) assert.match(part.trim(), /^\[data-tool-panel="gamid"\]/, part);
  assert.match(css, /\[data-tool-panel="gamid"\] \.ed-gd-card\[aria-current="true"\] \{/);
  assert.match(css, /\[data-tool-panel="gamid"\] \.ed-gd-add:disabled \{/);
  assert.match(css, /\.ed-rail button\[data-tool="gamid"\] span \{ white-space: normal;/);
});
