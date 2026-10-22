// 900px canvas toolbar + landscape phone fixes (Mazen's task 2026-10-22). Static guards for the CSS that the lab E2E runs measured
// (docs/WALL-EDITOR-900-LANDSCAPE-FIXES.md): the canvas bar wraps instead of being clipped at 900-1199px; on a landscape phone the keyboard sheet fills
// the space above the keyboard and the selection bar stays in the gutter beside the Fit stage.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const html = read("dist/wall-editor/index.html");
const desktop = read("dist/wall-editor/editor-desktop.css");
const mobile = read("dist/wall-editor/editor-mobile.css");
const landscape = mobile.slice(mobile.indexOf("@media (orientation: landscape) {"), mobile.indexOf("@media (prefers-reduced-motion"));

test("900px canvas bar: the bar wraps onto a second row and its items keep their size and one line (never clipped by the canvas column)", () => {
  assert.match(desktop, /\.ed-canvas-bar \{ flex-wrap: wrap; row-gap: \.4rem; \}/);
  assert.match(desktop, /\.ed-canvas-bar > \* \{ flex: none; white-space: nowrap; \}/);
  // the canvas column itself is unchanged (the side panels keep their widths)
  assert.match(desktop, /grid-template-columns: 5\.1rem 16rem minmax\(0, 1fr\) 16\.5rem;/);
  assert.doesNotMatch(desktop.slice(desktop.indexOf(".ed-canvas-bar {"), desktop.indexOf("@media (max-width: 1099px)")), /overflow-x: (auto|scroll)/, "no hidden horizontal scroll in the bar");
});

test("900px canvas bar: the tighter <= 1099px sizes come after the base rules, so they win (same specificity)", () => {
  const compact = desktop.indexOf("@media (max-width: 1099px) {");
  assert.ok(compact > 0);
  assert.ok(compact > desktop.indexOf(".ed-stage-label {") && compact > desktop.indexOf(".ed-canvas-bar .ed-btn {") && compact > desktop.indexOf(".ed-canvas-bar .ed-mini-text {"));
  assert.match(desktop.slice(compact), /^@media \(max-width: 1099px\) \{[^\n]*\n  \.ed-stage-label \{ padding: \.36rem \.6rem; font-size: \.8rem; letter-spacing: \.06em; \}\n  \.ed-canvas-bar \.ed-btn \{ padding: \.3rem \.6rem; font-size: \.8rem; letter-spacing: \.06em; \}\n\}/);
});

test("900px canvas bar: the same items in the same order (stage, Multi-select, save state, publish state, View public page, Unpublish, selection)", () => {
  const bar = html.slice(html.indexOf('class="ed-canvas-bar"'), html.indexOf("</div>", html.indexOf('id="selInfo"')));
  const ids = [...bar.matchAll(/ id="([A-Za-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids, ["stageLabel", "multiBtn", "saveState", "publishState", "publicLink", "unpublishBtn", "selInfo"]);
});

test("landscape phone keyboard: the open sheet runs from the top toolbar to the keyboard (over the Stages bar, as in portrait)", () => {
  assert.match(landscape, /body\.is-mw-keyboard \.ed-panel, body\.is-mw-keyboard \.mw-sheet \{ top: calc\(var\(--mtop\) \+ var\(--safe-t\)\); bottom: var\(--mw-kb\); height: auto; \}/);
  assert.doesNotMatch(landscape, /is-mw-keyboard[^{]*\{[^}]*--stages/, "the keyboard sheet no longer starts below the Stages bar");
  // portrait is unchanged
  assert.match(mobile, /body\.is-mw-keyboard \.ed-panel, body\.is-mw-keyboard \.mw-sheet \{ bottom: var\(--mw-kb\); height: calc\(var\(--mw-vvh\) - var\(--mtop\) - var\(--safe-t\)\); z-index: 50; \}/);
});

test("landscape phone selection bar: a compact block in the left gutter (name on its own line, actions wrapping), never a strip across the stage", () => {
  assert.match(landscape, /\.mw-selbar:not\(\[hidden\]\) \{ right: auto; width: 12\.75rem; max-width: calc\(50vw - 1rem\); flex-wrap: wrap; overflow-x: visible; \}/);
  assert.match(landscape, /\.mw-selbar \.mw-sel-name \{ flex: 1 0 100%; max-width: none;/);
  // the actions keep their 44px targets; portrait keeps the scrollable strip
  assert.match(mobile, /\.mw-act \{[^}]*min-width: 2\.75rem; min-height: 2\.75rem;/);
  assert.match(mobile, /\.mw-selbar:not\(\[hidden\]\) \{ position: fixed; left: calc\(\.5rem \+ var\(--safe-l\)\); right: calc\(\.5rem \+ var\(--safe-r\)\);[^}]*overflow-x: auto;/);
});
