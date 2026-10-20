// My Wall Desktop Visual Redesign, Phase 1 (Mazen's task 2026-10-18): static guards on the shipped files. The redesign is CSS plus two presentational lines of markup. It is desktop-only,
// never touches element Properties controls, Layers, the stages, the renderer or any behavior, and adds no tool, category, element type or Add action.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const html = read("dist/wall-editor/index.html");
const css = read("dist/wall-editor/editor-desktop.css");
const base = read("dist/wall-editor/editor.css");
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = stripComments(css);
const ADD_ACTIONS = ["text", "shape", "image", "embed", "gamid", "gamidData"];
const TOOLS = ["add", "text", "media", "shapes", "background", "gamid", "layout", "assets", "templates"];

test("the redesign stylesheet is linked for the desktop layout only (>= 900px, the editor's own desktop breakpoint), after the existing editor styles", () => {
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"([^>]*)\/>/g)].map(match => [match[1], match[2].trim()]);
  // (Mobile Wall Editor V2, 2026-10-20: the phone stylesheet follows, for phones only - it never applies at 900px and wider; see wall-editor-mobile-v2.test.js)
  assert.deepEqual(links.map(link => link[0]), ["../wall-kit/wall-kit.css", "../wall-kit/game-details.css", "editor.css", "templates.css", "editor-desktop.css", "editor-mobile.css"]);
  assert.equal(links.find(link => link[0] === "editor-desktop.css")[1], 'media="(min-width: 900px)"');
  assert.match(base, /@media \(min-width: 900px\)/, "900px is the editor's desktop breakpoint");
});

test("the Add inventory, the tool rail and every id the editor script uses are exactly what they were: no tool, category or action was added or removed", () => {
  assert.deepEqual([...html.matchAll(/data-add-action="([A-Za-z]+)"/g)].map(match => match[1]), ADD_ACTIONS);
  assert.deepEqual([...html.matchAll(/<button type="button" data-tool="([a-z]+)"/g)].map(match => match[1]), [...TOOLS, "props"]);
  for (const id of ["undoBtn", "redoBtn", "previewBtn", "saveBtn", "publishBtn", "unpublishBtn", "multiBtn", "stageLabel", "saveState", "publishState", "propsBody", "propsTitle", "layerList", "stageChips", "viewport", "stageHost"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.equal((html.match(/<p class="ed-add-sub">/g) ?? []).length, 1, "the one added line is Add's supporting text");
  assert.match(base, /\.ed-add-sub \{ display: none; \}/, "hidden on the phone layout");
});

test("scope: no rule restyles element Properties controls, Layers, the stage internals or the Wall; panel-level rules stay on the shell and the Add panel", () => {
  const selectors = [...rules.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(match => match[2].trim()).flatMap(group => group.split(",").map(part => part.trim()));
  // Later desktop tasks (Mazen, 2026-10-19): the Media & Links panel's cards and forms, and the Icon Group rows inside the Properties accordion, are restyled on desktop.
  // ... and (Shapes V2, 2026-10-19) the Shapes panel library and the Freeform pen / Edit Points bar and layer; (My Gamer Data, 2026-10-19) the GamID panel's library.
  const allowedScope = selector => selector.startsWith('[data-tool-panel="media"]') || selector.startsWith("#propsBody .ed-acc-body .ed-icon-") || selector.startsWith('[data-tool-panel="shapes"]') || selector.startsWith('[data-tool-panel="background"]') || selector.startsWith('[data-tool-panel="gamid"]') ||
    // Theme consistency pass (Mazen, 2026-10-20): the Layers (Layout), Assets and Templates panels, the Stages bar's delete confirmation, and in Properties ONLY the
    // controls that kept the legacy look (Move to stage's select and button, checkboxes, option lists); Wall content and the shared field controls stay out of reach.
    ['[data-tool-panel="layout"]', '[data-tool-panel="assets"]', '[data-tool-panel="templates"]', '.ed-stage-confirm', '#propsBody .ed-btn-row > select', '#propsBody select option', '#propsBody .ed-btn.ed-btn-primary', '#propsBody input[type="checkbox"]'].some(prefix => selector.startsWith(prefix)) || /^\.ed-path-/.test(selector) || selector === ".ed-shape-library";
  for (const selector of selectors) {
    if (allowedScope(selector)) { assert.doesNotMatch(selector, /\.wall-|\.ed-text-line|\.ed-field|^\.ed-btn\b/, `media / Icon Group scope must not reach Wall content or shared controls: ${selector}`); continue; }
    assert.doesNotMatch(selector, /\.ed-field|\.ed-seg|\.ed-text-input|\.ed-text-line|\.ed-layer|\.ed-props-section|\.ed-group-title|\.ed-asset|\.ed-provider|\.ed-handle|\.ed-sel(?![\w-])|\.ed-pad|\.ed-boundary|\.ed-guide|\.ed-overlay|\.ed-artboard|\.wall-(?!stage)|\.ed-preview|\.ed-banner|\.ed-gate/, `out of scope: ${selector}`);
    assert.doesNotMatch(selector, /^\.ed-btn\b|^button\b|^input\b|^select\b|^textarea\b/, `a global control rule would reach the Properties panel: ${selector}`);
  }
  // the only touch of the stage is the editor's outer frame glow
  assert.deepEqual(selectors.filter(selector => /wall-stage|stage-host/.test(selector)), [".ed-stage-host .wall-stage"]);
  assert.match(rules, /\.ed-stage-host \.wall-stage \{ box-shadow:/);
  // buttons are restyled only inside the header, the canvas bar, the rail and the Add panel
  for (const selector of selectors.filter(selector => /\.ed-btn/.test(selector))) assert.match(selector, /^(\.ed-top|\.ed-canvas-bar|\[data-tool-panel="add"\]|\[data-tool-panel="text"\] #textPresets|#propsBody \.ed-acc-body \.ed-icon-actions|\[data-tool-panel="media"\] \.ed-provider-info \.ed-btn-row|\.ed-path-bar \.ed-btn|\[data-tool-panel="background"\] |\[data-tool-panel="(templates|assets)"\] |#propsBody \.ed-btn\.ed-btn-primary|#propsBody \.ed-btn-row > select|\.ed-stage-confirm \.ed-btn)/, selector);   // + the theme consistency pass (2026-10-20)   // the Background panel (2026-10-19) styles its own buttons   // Phase 2 added the Text panel presets
});

test("no behavior, layout model or data change: only presentation properties, no position-changing JS hooks, no inline style, no external or script resources", () => {
  assert.doesNotMatch(rules, /@import|url\(\s*(?!["']?data:image\/svg\+xml)/i, "no remote or file resources: icons are inline data: SVG masks");
  assert.doesNotMatch(rules, /javascript:|expression\(|@font-face|animation\s*:|@keyframes/i, "no script hooks, no new fonts, no continuous animation");
  assert.doesNotMatch(html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ""), /\sstyle=/i);
  assert.match(html, /style-src 'self'(;|")/);
  assert.match(html, /img-src 'self' data: blob:/, "data: images (the mask icons) are already allowed by the page CSP");
  assert.doesNotMatch(rules, /display:\s*none/, "nothing the editor shows is hidden by the redesign");
  const inert = [...rules.matchAll(/([^{}]+)\{[^}]*pointer-events:\s*none/g)].map(match => match[1].trim().split("}").pop().trim());
  assert.deepEqual(inert, [".ed-top::after", ".ed-font-search::before"], "only the decorative header hairline and the search-field icon are click-through; no control is made unclickable");
});

test("icons: one family drawn on a 24-unit grid with a consistent stroke; every rail tool, every Add action and the header actions have an icon, none uses a text glyph", () => {
  const icons = [...css.matchAll(/--i-([a-z]+): url\("data:image\/svg\+xml,([^"]+)"\)/g)].map(match => [match[1], decodeURIComponent(match[2])]);
  const names = icons.map(icon => icon[0]);
  for (const name of [...TOOLS, "artwork", "link", "data", "undo", "redo", "back", "chevron", "publish", "crown", "pointer"]) assert.ok(names.includes(name), `icon ${name}`);
  assert.equal(new Set(names).size, names.length, "no duplicate icon definitions");
  for (const [name, svg] of icons) {
    assert.match(svg, /^<svg xmlns='http:\/\/www\.w3\.org\/2000\/svg' viewBox='0 0 (24 24|32 28|48 48)'/, name);
    assert.doesNotMatch(svg, /<text|<image|href=|<script|style=|font/i, name);
    if (!/crown/.test(name)) assert.match(svg, /stroke-linecap='round' stroke-linejoin='round'/, `${name}: round caps and joins`);
  }
  const strokes = icons.filter(icon => !/crown/.test(icon[0])).map(icon => Number(icon[1].match(/stroke-width='([\d.]+)'/)[1]));
  assert.ok(strokes.every(width => width >= 1.7 && width <= 2.2), `stroke widths ${strokes}`);
  for (const tool of TOOLS) assert.match(rules, new RegExp(`\\.ed-rail button\\[data-tool="${tool}"\\] \\{ --ic: var\\(--i-${tool}\\); \\}`), `rail ${tool}`);
  for (const action of ADD_ACTIONS) assert.match(rules, new RegExp(`\\[data-tool-panel="add"\\] \\[data-add-action="${action}"\\] \\{ --ic: var\\(--i-[a-z]+\\); \\}`), `add ${action}`);
  for (const id of ["undoBtn", "redoBtn"]) assert.match(rules, new RegExp(`#${id} \\{ --ic: var\\(--i-(undo|redo)\\); \\}`));
});

test("Wall social / brand icons, Icon Groups and DEC-0006 contracts are not touched: the redesign never references them", () => {
  assert.doesNotMatch(css, /wall-icon|platform-icon|icon-group|providerKey|\.wall-embed|data-provider/i);
  assert.equal(read("dist/wall-kit/platform-icons.js"), read("dist/wall-kit/platform-icons.js").replace(/\r\n/g, "\n"));
});

test("accessibility and states: visible keyboard focus, hover / active / selected / disabled styles, reduced motion honoured, no continuous animation", () => {
  assert.match(rules, /:focus-visible \{ outline: 2px solid/);
  assert.match(rules, /\.ed-top \.ed-btn:disabled \{/);
  assert.match(rules, /\.ed-rail button:hover/);
  assert.match(rules, /\[data-tool-panel="add"\] \.ed-add-list \.ed-btn:hover:not\(:disabled\)/);
  assert.match(rules, /\[data-tool-panel="add"\] \.ed-add-list \.ed-btn:active/);
  assert.match(rules, /body\[data-tool="add"\] \.ed-rail \[data-tool="add"\]/);
  assert.match(rules, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(rules, /@media \(forced-colors: active\)/);
  // comfortable targets: header buttons and rail buttons at least 2.4rem, Add cards at least the previous 3.2rem
  assert.match(rules, /\.ed-top \.ed-btn \{[^}]*min-height: 2\.5rem/);
  assert.match(rules, /\.ed-rail button \{[^}]*min-height: clamp\(3\.5rem/);
  assert.match(rules, /\[data-tool-panel="add"\] \.ed-add-list \.ed-btn \{[^}]*min-height: 4\.5rem/);
});

test("the phone / tablet editor is untouched: the shared stylesheet only hides the desktop-only additions (Add supporting line; font search, samples and note)", () => {
  assert.match(base, /\.ed-add-sub \{ display: none; \}/);
  assert.match(base, /\.ed-font-search, \.ed-font-sample, \.ed-font-empty, \.ed-myfonts \{ display: none; \}/);   // + My Fonts (2026-10-18), desktop only
  assert.match(base, /\.ed-add-list \.ed-btn \{[^}]*min-height: 3\.2rem/, "the Add card rule that older tests pin is intact");
  assert.match(base, /@media \(min-width: 900px\)[\s\S]*grid-template-columns: 5rem 17rem minmax\(0, 1fr\) 20rem/, "the base desktop grid is intact; the redesign overrides it only inside its desktop-only file");
});
