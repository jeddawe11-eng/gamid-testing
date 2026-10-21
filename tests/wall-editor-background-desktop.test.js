// Desktop Background panel redesign (Mazen's task 2026-10-19): organisation and look only. The uploads and the picture / video settings sit in independent accordion
// sections on desktop (900px and wider); every control, every rule (scope, priority, upload, delete, in-use) and the phone layout are unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const tools = read("dist/wall-editor/tools.js");
const css = read("dist/wall-editor/editor-desktop.css");

test("sections: Images open, Videos closed, Fit & Position and Appearance open; kept for the session; choosing Image / Video opens its section", () => {
  assert.match(tools, /const bgSectionOpen = \{ images: true, videos: false, fit: true, look: true \};/);
  assert.match(tools, /if \(desktop && kind !== lastBgKind\) \{ if \(kind === "image"\) bgSectionOpen\.images = true; if \(kind === "video"\) bgSectionOpen\.videos = true; \}/);
  assert.match(tools, /h\("button", \{ class: "ed-font-group-toggle ed-bg-toggle", type: "button", "aria-expanded": String\(bgSectionOpen\[key\]\), "aria-controls": id,/, "the font library's heading button");
  assert.match(tools, /section\("images", "Images", assets\.images\.length,/);
  assert.match(tools, /section\("videos", "Videos", assets\.videos\.length,/);
  assert.match(tools, /section\("fit", "Fit & Position", null,/);
  assert.match(tools, /section\("look", "Appearance", null, look\)/);
});

test("desktop only: the phone keeps its exact panel (headings, card order, Fit field) and the rebuild key follows the breakpoint", () => {
  assert.match(tools, /const desktop = accordionOn\(\);/);
  assert.match(tools, /if \(assets\.images\.length\) controlsBox\.append\(h\("h4", \{ class: "ed-sub", text: "Images" \}\), imageGrid\(null,/, "phone headings unchanged");
  assert.match(tools, /: h\("div", \{ class: "ed-asset" \}, thumb, h\("div", \{ class: "meta", text: `Video \$\{index \+ 1\} · \$\{size\}` \}\), h\("div", \{ class: "row" \}, use\), \.\.\.remove\)\);/, "phone video card unchanged (its delete controls: In use + Delete since universal deletion)");
  assert.match(tools, /else controlsBox\.append\(h\("label", \{ class: "ed-field" \}, h\("span", \{ text: "Fit" \}\), h\("div", \{ class: "ed-inline" \}, fitSelect\)\), posX, posY\);/, "phone Fit field unchanged");
  assert.match(tools, /JSON\.stringify\(assets\.assets\.map\(asset => \[asset\.asset_id, ops\.assetUsage\(doc\(\), asset\.asset_id\)\]\)\), accordionOn\(\)\]\);/, "the panel rebuilds when where an upload is used changes");
});

test("look: one even grid of type buttons, equal upload cards, Use / Delete in one row, an in-use badge; scoped to the Background area (inside Assets since 2026-10-21)", () => {
  assert.match(css, /\[data-assets-area="background"\] #bgKinds \{ grid-template-columns: repeat\(6, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\[data-assets-area="background"\] \.ed-bg-section-body \.ed-assets \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); grid-auto-rows: 1fr;/);
  assert.match(css, /\[data-assets-area="background"\] \.ed-bg-asset \.thumb \{ width: 100%; height: 5\.2rem;/);
  assert.match(css, /\[data-assets-area="background"\] \.ed-bg-actions \.ed-asset-inuse \{/);
  const background = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(selector => selector.includes("ed-bg") || selector.includes("bgKinds") || selector.includes("bgControls"));
  for (const selector of background) assert.match(selector, /^\[data-assets-area="background"\]/, selector);
});
