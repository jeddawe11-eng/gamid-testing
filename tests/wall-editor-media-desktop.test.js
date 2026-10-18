// Desktop Media & Links / Icon Group UI refinement (Mazen's task 2026-10-19): organisation and look only. The Icon Group Properties use the same accordion as the
// text Properties, with every existing control in it; the Media & Links cards are restyled on desktop only (900px and wider); the phone and tablet are unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const controls = read("dist/wall-editor/controls.js");
const tools = read("dist/wall-editor/tools.js");
const desktop = read("dist/wall-editor/editor-desktop.css");

test("Icon Group Properties: five independent sections on desktop with their own remembered state; Move to stage stays the first control", () => {
  assert.match(controls, /const ICON_SECTIONS = \[\["icons", "Icons & Links"\], \["appearance", "Appearance & Spacing"\], \["geometry", "Position & Size"\], \["arrange", "Arrange"\], \["align", "Align to Stage"\]\];/);
  assert.match(controls, /const iconSectionOpen = \{ icons: true, appearance: true, geometry: false, arrange: false, align: false \};/, "separate from the text sections' state");
  assert.match(controls, /if \(types\.length === 1 && types\[0\] === "icons" && single && desktopProps\?\.matches\) \{/, "a single Icon Group, desktop only");
  assert.match(controls, /iconsControls\(sections\.icons, \{ appearanceRoot: sections\.appearance \}\);/);
  assert.match(controls, /actionControls\(sections\.arrange, targets, single, \{ alignRoot: sections\.align \}\);/);
  assert.match(controls, /body\.append\(errorBox\);\n\s*stageMoveControls\(body\);   \/\/ always the first control/, "the accepted post-Round 2 rule");
  assert.equal((controls.match(/stageMoveControls\(/g) ?? []).length, 2, "one definition, one call: never duplicated inside a section");
});

test("Icon Group controls are the same controls: the size / spacing / align part only moves into Appearance & Spacing; limits unchanged", () => {
  assert.match(controls, /function iconsControls\(root, \{ appearanceRoot = null \} = \{\}\) \{/);
  assert.match(controls, /if \(appearanceRoot\) root = appearanceRoot;\n\s*root\.append\(numberSlider\(\{ label: "Icon size", min: ICON_LIMITS\.size\[0\], max: ICON_LIMITS\.size\[1\]/);
  assert.match(controls, /if \(element\.payload\.items\.length < ICON_LIMITS\.items\) \{/, "Add icon only below the 24-icon limit");
  for (const label of ['"Spacing"', '"Align"']) assert.ok(controls.includes(`label: ${label}`), label);
});

test("Media & Links cards: desktop-only styling scoped to the panel; the mode pieces are rendered only on desktop", () => {
  assert.match(desktop, /\[data-tool-panel="media"\] \.ed-providers \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); grid-auto-rows: 1fr;/, "an even two-column grid, every card one height");
  assert.match(desktop, /\[data-tool-panel="media"\] \.ed-provider small \.ed-mode \{ white-space: nowrap; \}/);
  assert.match(tools, /if \(accordionOn\(\)\) small\.replaceChildren\(/, "pieces on desktop");
  assert.match(tools, /else small\.textContent = modes\.join\(" · "\);/, "the phone keeps the plain text it always had");
  assert.match(desktop, /#propsBody \.ed-acc-body \.ed-icon-item \{ grid-template-columns: auto minmax\(0, 1fr\); grid-template-areas: "badge link" "\. actions";/, "the link gets the full width");
});
