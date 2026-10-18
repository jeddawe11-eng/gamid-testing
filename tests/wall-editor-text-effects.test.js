// Desktop Text editor upgrade (Mazen's task 2026-10-18): the Text panel's sections (Add Text, Font Library, Text Effects, My Fonts, Upload My Font) and the text Properties
// accordion. Desktop only (>= 900px); the phone editor, the saved Wall format and every existing control are unchanged. Living Fire is listed but NOT integrated (approval gate).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEXT_PRESETS, TEXT_EFFECTS, NEON_GLOW } from "../dist/wall-editor/tools.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const html = read("dist/wall-editor/index.html");
const base = read("dist/wall-editor/editor.css");
const desktop = read("dist/wall-editor/editor-desktop.css");
const tools = read("dist/wall-editor/tools.js");
const controls = read("dist/wall-editor/controls.js");
const panel = html.slice(html.indexOf('data-tool-panel="text"'), html.indexOf('data-tool-panel="media"'));

test("the phone keeps its preset wording; desktop wording says these add text boxes, not fonts", () => {
  assert.deepEqual(TEXT_PRESETS.map(preset => [preset.label, preset.note]), [["Heading", "Big, bold, for your name or title"], ["Text", "A paragraph about you"], ["Gaming title", "Condensed with a neon glow"]]);
  assert.deepEqual(TEXT_PRESETS.map(preset => preset.desktopLabel), ["Heading", "Text", "Gaming Title"]);
  for (const preset of TEXT_PRESETS) assert.match(preset.desktopNote, /box/, preset.key);
  assert.match(tools, /name\.data = desktop \? preset\.desktopLabel : preset\.label; note\.textContent = desktop \? preset\.desktopNote : preset\.note;/);
  assert.match(tools, /fontLibraryTitle\.textContent = desktop \? "Font Library" : "Fonts"/);
  assert.match(panel, /<h2 class="ed-sub" id="fontLibraryTitle">Fonts<\/h2>/, "the phone heading is unchanged in the markup");
});

test("the new Text panel parts are desktop only: hidden by the shared stylesheet, shown by the desktop one", () => {
  assert.match(base, /\.ed-text-sub, \.ed-text-effects \{ display: none; \}/);
  assert.match(desktop, /\[data-tool-panel="text"\] h3\.ed-text-sub \{ display: block;/);
  assert.match(desktop, /\.ed-text-effects \{ display: block;/);
  assert.match(panel, /<section id="fontUploadBox" class="ed-myfonts ed-font-upload"/, "Upload My Font shares the My Fonts desktop-only rule");
});

test("Text Effects: Neon is the existing glow (no new payload field); Living Fire is listed as Coming soon and writes nothing", () => {
  assert.deepEqual(TEXT_EFFECTS.map(effect => effect.key), ["neon", "living-fire"]);
  const [neon, fire] = TEXT_EFFECTS;
  assert.equal(neon.field, "glow");
  assert.deepEqual(NEON_GLOW, TEXT_PRESETS.find(preset => preset.key === "gaming").overrides.glow, "the same neon the Gaming Title preset uses");
  assert.equal(fire.soon, true);
  assert.equal(fire.field, undefined);
  assert.equal(fire.value, undefined);
  assert.match(tools, /disabled: effect\.soon === true/);
  assert.match(tools, /if \(!ids\.length\) \{ notify\("Select a text element first, then choose an effect\."\); return; \}/);
  assert.match(tools, /revealProps\("effects"\);/, "choosing an effect opens Text Effects in Properties");
  assert.match(read("dist/wall-editor/editor.js"), /revealProps: section => properties\.reveal\(section\),/);
  assert.doesNotMatch(tools + controls, /webgl|LivingFire|getContext\("webgl/i, "no fire renderer is integrated before Mazen chooses the V3 variant(s)");
});

test("Properties: five independent text sections on desktop, remembered across selections, keyboard operable; other types and the phone are unchanged", () => {
  assert.match(controls, /const TEXT_SECTIONS = \[\["content", "Content & Typography"\], \["effects", "Text Effects"\], \["geometry", "Position & Size"\], \["arrange", "Arrange"\], \["align", "Align to Stage"\]\];/);
  assert.match(controls, /const textSectionOpen = \{/, "one open / closed state for the whole editor session, not per element");
  assert.match(controls, /"aria-expanded": String\(textSectionOpen\[key\]\), "aria-controls": id/);
  assert.match(controls, /role: "region", "aria-labelledby": `\$\{id\}-head`/);
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) assert.match(controls, new RegExp(`${key}:`));
  assert.match(controls, /if \(types\.length === 1 && types\[0\] === "text" && desktopProps\?\.matches\) \{/, "text-only selections on desktop");
  assert.match(controls, /textControls\(sections\.content, \{ effectsRoot: sections\.effects \}\);/);
  assert.match(controls, /actionControls\(sections\.arrange, targets, single, \{ alignRoot: sections\.align \}\);/);
  // the flat panel (phone, and every other element type) keeps its titles
  assert.match(controls, /else root\.append\(h\("div", \{ class: "ed-group-title", text: "Effects" \}\)\);/);
  assert.match(controls, /if \(titled\) root\.append\(h\("div", \{ class: "ed-group-title", text: "Position and size" \}\)\);/);
  assert.match(controls, /if \(!alignRoot\) root\.append\(h\("div", \{ class: "ed-group-title", text: "Arrange" \}\)\);/);
  assert.match(controls, /\|\$\{desktopProps\?\.matches \? 1 : 0\}`;/, "crossing the breakpoint rebuilds the panel");
});
