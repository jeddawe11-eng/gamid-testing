// My Wall Desktop Text & Fonts Upgrade, Phase 2 (Mazen's task 2026-10-18): the 11 new curated fonts (Fantasy & Gothic, Luxury Signature & Script), the font library in the desktop Text
// panel, and the guarantees around them: every existing font keeps its key, label and stack; a saved text element stores only a stable catalog key (no document or database change);
// each bundled font has a recorded OFL licence, a real WOFF2 file and an @font-face; the library is curated (no upload) and loaded lazily.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { validateDocument } from "../dist/wall/validate.js";
import { createDocument } from "../dist/wall/schema.js";
import * as ops from "../dist/wall-kit/ops.js";
import { createTextPayload, validateTextPayload, renderTextPayload } from "../dist/wall-kit/text.js";
import { FONT_CATALOG, FONT_KEY, FALLBACK_FONT_CSS, fontCss, fontKnown } from "../dist/wall-kit/fonts.js";
import "../dist/wall-kit/register.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const kitCss = read("dist/wall-kit/wall-kit.css");
const html = read("dist/wall-editor/index.html");
const tools = read("dist/wall-editor/tools.js");
const baseCss = read("dist/wall-editor/editor.css");
const desktopCss = read("dist/wall-editor/editor-desktop.css");

// The twelve entries that existed before Phase 2, frozen exactly (key, label, stack, bundled flag). Only their group LABEL "System" became "System & Classic".
const ORIGINAL = [
  ["orbitron", "Orbitron", "Gaming", '"GamID Orbitron", "Segoe UI", system-ui, sans-serif', true],
  ["bebas-neue", "Bebas Neue", "Gaming", '"GamID Bebas", Impact, "Arial Narrow", sans-serif', true],
  ["russo-one", "Russo One", "Gaming", '"GamID Russo", "Arial Black", system-ui, sans-serif', true],
  ["rajdhani", "Rajdhani", "Gaming", '"GamID Rajdhani", "Segoe UI", system-ui, sans-serif', true],
  ["chakra-petch", "Chakra Petch", "Gaming", '"GamID Chakra", "Segoe UI", system-ui, sans-serif', true],
  ["system-sans", "Clean sans", "System & Classic", 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', undefined],
  ["system-rounded", "Rounded", "System & Classic", 'ui-rounded, "SF Pro Rounded", "Trebuchet MS", "Segoe UI", sans-serif', undefined],
  ["system-condensed", "Condensed", "System & Classic", '"Roboto Condensed", "Arial Narrow", "Helvetica Neue Condensed", sans-serif', undefined],
  ["system-display", "Heavy display", "System & Classic", 'Impact, "Arial Black", "Helvetica Neue", sans-serif', undefined],
  ["system-serif", "Serif", "System & Classic", 'Georgia, "Times New Roman", Times, serif', undefined],
  ["system-mono", "Monospace", "System & Classic", 'ui-monospace, SFMono-Regular, Consolas, Menlo, "Courier New", monospace', undefined],
  ["system-handwriting", "Handwriting", "System & Classic", '"Segoe Script", "Bradley Hand", "Comic Sans MS", cursive', undefined],
];
// The eleven new fonts, in the order Mazen listed them: key, label, group, @font-face family, files by weight.
const NEW = [
  ["cinzel-decorative", "Cinzel Decorative", "Fantasy & Gothic", "GamID Cinzel Decorative", { 400: "CinzelDecorative-400", 700: "CinzelDecorative-700", 900: "CinzelDecorative-900" }],
  ["unifraktur-cook", "UnifrakturCook", "Fantasy & Gothic", "GamID UnifrakturCook", { 700: "UnifrakturCook" }],
  ["pirata-one", "Pirata One", "Fantasy & Gothic", "GamID Pirata One", { 400: "PirataOne" }],
  ["eagle-lake", "Eagle Lake", "Fantasy & Gothic", "GamID Eagle Lake", { 400: "EagleLake" }],
  ["metal-mania", "Metal Mania", "Fantasy & Gothic", "GamID Metal Mania", { 400: "MetalMania" }],
  ["great-vibes", "Great Vibes", "Luxury Signature & Script", "GamID Great Vibes", { 400: "GreatVibes" }],
  ["alex-brush", "Alex Brush", "Luxury Signature & Script", "GamID Alex Brush", { 400: "AlexBrush" }],
  ["pinyon-script", "Pinyon Script", "Luxury Signature & Script", "GamID Pinyon Script", { 400: "PinyonScript" }],
  ["italianno", "Italianno", "Luxury Signature & Script", "GamID Italianno", { 400: "Italianno" }],
  ["tangerine", "Tangerine", "Luxury Signature & Script", "GamID Tangerine", { 400: "Tangerine-400", 700: "Tangerine-700" }],
  ["ballet", "Ballet", "Luxury Signature & Script", "GamID Ballet", { 400: "Ballet" }],
];

test("every existing font is preserved exactly: same key, label, stack and bundled flag, in the same order", () => {
  const originalKeys = new Set(ORIGINAL.map(entry => entry[0]));
  const before = FONT_CATALOG.filter(font => originalKeys.has(font.key)).map(font => [font.key, font.label, font.group, font.css, font.bundled]);
  assert.deepEqual(before, ORIGINAL, "all twelve exist, unchanged and in their original relative order");
});

test("the eleven new fonts are in the catalog, in Mazen's order and categories, with stable kebab-case keys and no duplicate of any other font", () => {
  const originalKeys = new Set(ORIGINAL.map(entry => entry[0]));
  const added = FONT_CATALOG.filter(font => !originalKeys.has(font.key));
  assert.deepEqual(added.map(font => [font.key, font.label, font.group]), NEW.map(([key, label, group]) => [key, label, group]));
  assert.equal(FONT_CATALOG.length, ORIGINAL.length + NEW.length);
  assert.equal(new Set(FONT_CATALOG.map(font => font.key)).size, FONT_CATALOG.length, "keys are unique");
  assert.equal(new Set(FONT_CATALOG.map(font => font.label.toLowerCase())).size, FONT_CATALOG.length, "no font is listed twice under different keys");
  for (const font of FONT_CATALOG) assert.match(font.key, FONT_KEY, font.key);
  for (const [key, , , family] of NEW) { const font = FONT_CATALOG.find(entry => entry.key === key); assert.ok(font.bundled); assert.ok(font.css.startsWith(`"${family}", `), `${key}: the stack begins with its own family and keeps a generic fallback`); assert.match(font.css, /(serif|sans-serif|cursive|fantasy)$/, key); }
});

test("categories: Gaming, Fantasy & Gothic, Luxury Signature & Script and System & Classic, in that order, each non-empty", () => {
  assert.deepEqual([...new Set(FONT_CATALOG.map(font => font.group))], ["Gaming", "Fantasy & Gothic", "Luxury Signature & Script", "System & Classic"]);
});

test("saved font identifiers are stable and need no document or database change: the payload validator and the SQL mirror accept exactly the key format, for every new key", () => {
  const sql = read("supabase/migrations/20260925140000_wall_editor_element_types.sql");
  const mirror = new RegExp(sql.match(/\(p ->> 'fontFamily'\) !~ '([^']+)'/)[1]);
  assert.equal(mirror.source, FONT_KEY.source, "the database mirrors the exact same key rule");
  for (const [key] of NEW) {
    assert.ok(mirror.test(key), `${key} passes the database rule`);
    assert.deepEqual(validateTextPayload(createTextPayload({ fontFamily: key })), [], key);
    let doc = createDocument();
    const stageId = doc.stages[0].id;
    const added = ops.addCustomElement(doc, stageId, { type: "text", payload: createTextPayload({ fontFamily: key, text: "Legend" }), width: 800, height: 200 });
    assert.ok(added.ok, key);
    assert.equal(validateDocument(added.doc).valid, true, `a Wall with ${key} is valid`);
    assert.equal(added.doc.stages[0].elements[0].payload.fontFamily, key, "the document stores the key, not a CSS stack or a file");
  }
});

test("rendering: a new key paints with its own family and an unknown or removed key still falls back safely, so existing Walls never break", () => {
  for (const [key, , , family] of NEW) { assert.ok(fontKnown(key)); assert.equal(renderTextPayload(createTextPayload({ fontFamily: key })).fontFamily, key); assert.ok(fontCss(key).includes(`"${family}"`)); }
  assert.equal(fontCss("some-future-font"), FALLBACK_FONT_CSS);
  assert.equal(fontKnown("some-future-font"), false);
  assert.deepEqual(validateTextPayload(createTextPayload({ fontFamily: "some-future-font" })), [], "an unknown (but well-formed) key is still a valid document");
  assert.ok(validateTextPayload(createTextPayload({ fontFamily: "Bad Key!" })).includes("INVALID_FONT_FAMILY"));
});

test("each new font ships: a real WOFF2 file per weight, an @font-face with swap (no invisible text), served from this site only", () => {
  for (const [, , , family, files] of NEW) {
    for (const [weight, name] of Object.entries(files)) {
      const path = `dist/wall-kit/fonts/${name}.woff2`;
      assert.ok(existsSync(path), path);
      const bytes = readFileSync(path);
      assert.equal(bytes.subarray(0, 4).toString("latin1"), "wOF2", `${path} is WOFF2`);
      assert.ok(statSync(path).size > 4000 && statSync(path).size < 120000, `${path} is a latin subset, not a full font`);
      const face = new RegExp(`@font-face \\{ font-family: "${family}"; src: url\\("fonts/${name}\\.woff2"\\) format\\("woff2"\\); font-weight: ${weight}; font-display: swap; \\}`);
      assert.match(kitCss, face, `${family} ${weight}`);
    }
  }
  const faces = [...kitCss.matchAll(/@font-face \{[^}]*\}/g)].map(match => match[0]);
  assert.equal(faces.length, 5 + 14, "five existing faces plus fourteen new faces (eleven families)");
  for (const face of faces) { assert.match(face, /font-display: swap/); assert.doesNotMatch(face, /https?:|\/\//); }
  assert.doesNotMatch(kitCss, /fonts\.googleapis|fonts\.gstatic/, "nothing is loaded from a third-party host at runtime");
});

test("licences: every added font is recorded as SIL OFL 1.1 with its copyright notice, and the full licence text ships with the files", () => {
  const records = read("dist/wall-kit/fonts/LICENSES.txt"), notices = read("dist/wall-kit/fonts/OFL-NOTICES.txt");
  assert.match(records, /SIL Open Font License/);
  for (const [, label] of NEW) assert.ok(records.includes(label), `${label} is named in LICENSES.txt`);
  assert.match(notices, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(notices, /PERMISSION & CONDITIONS/);
  for (const family of ["cinzeldecorative", "unifrakturcook", "pirataone", "eaglelake", "metalmania", "greatvibes", "alexbrush", "pinyonscript", "italianno", "tangerine", "ballet"]) {
    const section = notices.match(new RegExp(`\\[${family}\\]\\n([^\\[]+)`))?.[1] ?? "";
    assert.match(section, /Copyright/, `${family} has its copyright notice`);
  }
  assert.match(notices, /Reserved Font Name/, "Reserved Font Names are recorded where the authors declared them");
  assert.match(records, /users cannot upload fonts/);
});

test("the font library: one card per catalog font by category, a live sample in its own family, search by name only, keyboard-operable buttons, no upload and no My Fonts", () => {
  assert.match(tools, /const fontGroups = \[\.\.\.new Set\(FONT_CATALOG\.map\(font => font\.group\)\)\]/, "the categories and cards come from the catalog: nothing is typed twice");
  assert.match(tools, /h\("button", \{ class: "ed-btn ed-font", type: "button", "data-font": font\.key/, "each card is a real button");
  assert.match(tools, /class: "ed-font-sample", "aria-hidden": "true"/, "the sample is decoration; the button's name is the font's name");
  assert.match(tools, /run\(ops\.updatePayloadMany\(doc\(\), ids, \{ fontFamily: font\.key \}\)\)/, "choosing a font is the same undoable payload update as before");
  assert.match(tools, /notify\("Select a text element first, then choose a font\."\)/, "the existing guidance is kept");
  assert.match(tools, /function applyFontFilter\(\)/);
  assert.match(tools, /font\.label\.toLowerCase\(\)\.includes\(query\) \|\| font\.key\.includes\(query\)/, "search filters the list by name");
  assert.doesNotMatch(tools.slice(tools.indexOf("function applyFontFilter"), tools.indexOf("// The font of the selected text")), /session|run\(|ops\./, "search never touches the canvas or the saved Wall");
  assert.match(tools, /setAttribute\("aria-current", "true"\)/, "the selected font is exposed to assistive technology");
  const panel = html.slice(html.indexOf('data-tool-panel="text"'), html.indexOf('data-tool-panel="media"'));
  assert.match(panel, /id="fontSearch"[^>]*type="search"/);
  assert.doesNotMatch(panel, /type="file"|upload|my fonts/i, "no font upload and no My Fonts feature");
  assert.doesNotMatch(tools.slice(tools.indexOf("const fontList"), tools.indexOf("// ---- Shapes")), /type="file"|FileReader|FontFace\(|upload/i);
});

test("loading is lazy: faces are fetched only when a family is rendered, and a card gets its family only when it is near the visible panel", () => {
  assert.match(tools, /new IntersectionObserver\(/);
  assert.match(tools, /rootMargin: "160px 0px"/);
  assert.match(tools, /if \(lazyFonts\) lazyFonts\.observe\(card\.button\); else applyCardFont\(card\)/, "without IntersectionObserver every card is set at once");
  assert.doesNotMatch(read("dist/wall-kit/fonts.js") + read("dist/wall-editor/editor.js"), /link\s+rel=["']?preload|document\.fonts\.load|new FontFace/, "no eager preloading of the library");
});

test("desktop only: the phone / tablet editor keeps its one-line font buttons (search, samples and note are hidden below 900px); the new look is in the desktop-only stylesheet", () => {
  assert.match(baseCss, /\.ed-font-search, \.ed-font-sample, \.ed-font-empty \{ display: none; \}/);
  assert.match(desktopCss, /\.ed-font-search \{ display: block;/);
  assert.match(desktopCss, /\.ed-fonts \.ed-font \.ed-font-sample \{ display: block;/);
  assert.match(desktopCss, /\.ed-font-empty \{ display: block;/);
  assert.match(desktopCss, /\.ed-fonts \{ grid-template-columns: repeat\(auto-fill, minmax\(7\.2rem, 1fr\)\)/, "two columns where the width permits, one when it does not");
  assert.match(desktopCss, /\.ed-fonts \.ed-font\[aria-current="true"\]/, "a clear selected state");
  assert.match(desktopCss, /\.ed-fonts \.ed-font:hover/);
  assert.match(desktopCss, /\.ed-fonts \.ed-font \{[^}]*overflow-wrap: anywhere/, "long names wrap instead of clipping");
  assert.doesNotMatch(desktopCss, /\.ed-fonts[^{]*\{[^}]*(animation|@keyframes)/, "no continuous animation");
});

test("category accordions (desktop only): real buttons with name, real count and chevron; all collapsed at first; several may be open; search covers collapsed categories and restores the states", () => {
  assert.match(tools, /const desktopFonts = typeof matchMedia === "function" \? matchMedia\("\(min-width: 900px\)"\) : null;/, "the same 900px desktop breakpoint as the editor");
  assert.match(tools, /entry\.open = false;/, "every category starts collapsed");
  assert.match(tools, /h\("button", \{ class: "ed-font-group-toggle", type: "button", "aria-expanded": "false"/, "the heading is a keyboard-operable button exposing its state");
  assert.match(tools, /text: String\(entry\.cards\.length\)/, "the count is the real number of fonts in the category");
  assert.match(tools, /entry\.open = !entry\.open; applyFontFilter\(\);/, "a click toggles only that category, so several can be open");
  assert.match(tools, /button\.hidden = !match \|\| \(accordion && !query && !entry\.open\);/, "a collapsed category hides its cards only while not searching");
  assert.match(tools, /entry\.toggle\.setAttribute\("aria-expanded", String\(query \? visible > 0 : entry\.open\)\);/, "during search matching categories show open; afterwards the stored state returns");
  assert.match(tools, /if \(fontSearching\(\)\) return;/, "a click during search does not change the remembered state");
  assert.match(tools, /else if \(entry\.heading\.classList\.contains\("is-accordion"\)\) \{ entry\.heading\.classList\.remove\("is-accordion"\); entry\.heading\.replaceChildren\(entry\.group\); \}/, "below 900px the heading is the plain text it always was");
  assert.match(tools, /desktopFonts\?\.addEventListener\?\.\("change", relayoutFonts\)/, "crossing the breakpoint switches in place");
  assert.match(desktopCss, /\.ed-font-group-toggle \{[^}]*min-height: 2\.75rem/, "a comfortable target");
  assert.match(desktopCss, /\.ed-font-group-toggle\[aria-expanded="true"\]::after \{ transform: rotate\(90deg\); \}/, "the chevron shows the state");
  assert.match(desktopCss, /@media \(prefers-reduced-motion: reduce\) \{ \.ed-font-group-toggle, \.ed-font-group-toggle::after \{ transition: none; \} \}/);
  assert.doesNotMatch(baseCss, /ed-font-group/, "the phone / tablet stylesheet does not know the accordion");
});