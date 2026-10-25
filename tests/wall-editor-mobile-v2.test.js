// Mobile Wall Editor V2 (Mazen's task 2026-10-20): a new phone interface over the SAME Wall engine. These checks pin the contracts that make it safe:
// phone-only scope (tablet and desktop untouched), view-only canvas zoom, Save separate from Publish, append-only Add Stage, and no second document format.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHONE_QUERY } from "../dist/wall-editor/phone.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const html = read("dist/wall-editor/index.html");
const base = read("dist/wall-editor/editor.css");
const css = read("dist/wall-editor/editor-mobile.css");
const desktopCss = read("dist/wall-editor/editor-desktop.css");
const shell = read("dist/wall-editor/mobile-shell.js");
const canvas = read("dist/wall-editor/canvas.js");
const editor = read("dist/wall-editor/editor.js");
const controls = read("dist/wall-editor/controls.js");
const code = source => source.replace(/\/\/.*$/gm, "");

test("scope: the phone stylesheet loads with exactly the phone query; tablets (600-899px, taller than 500px) and desktops never get it", () => {
  assert.equal(PHONE_QUERY, "(max-width: 599px), (max-width: 899px) and (max-height: 500px)");
  assert.match(html, new RegExp(`<link rel="stylesheet" href="editor-mobile\\.css" media="${PHONE_QUERY.replace(/[()]/g, "\\$&")}" />`));
  // the base stylesheet hides every phone-shell element on exactly the complement of that query
  assert.match(base, /@media \(min-width: 900px\), \(min-width: 600px\) and \(min-height: 501px\) \{ \.mw-only \{ display: none !important; \} \}/);
  assert.doesNotMatch(desktopCss, /mw-|editor-mobile/, "the desktop stylesheet knows nothing of the phone shell");
  assert.doesNotMatch(css, /@media \(min-width: (6|9)00px\)/, "the phone stylesheet never targets larger screens");
});

test("scope: every phone-shell element in the page is marked phone-only", () => {
  for (const id of ["mwTop", "mwSelBar", "mwBar", "mwStages", "mwMore", "mwWall", "mwZoom", "mwLayerActions"]) {
    assert.match(html, new RegExp(`id="${id}" class="[^"]*\\bmw-only\\b`), id);
  }
  for (const match of html.matchAll(/<div class="mw-sheet-head( mw-only)?">/g)) assert.ok(match[1] || html.lastIndexOf('class="mw-sheet mw-only"', match.index) > html.lastIndexOf("</aside>", match.index), "sheet heads are phone-only");
  for (const match of html.matchAll(/data-mw-add="[a-z]+"/g)) assert.match(html.slice(html.lastIndexOf("<button", match.index), match.index), /class="ed-btn mw-only"/);
  assert.match(html, /<span id="mwStatus" class="ed-stage-status mw-only" role="status" aria-live="polite"><\/span>/);
});

test("engine reuse: the shell drives the editor's own buttons and the same ops - no second document format, no direct persistence", () => {
  for (const [from, to] of [["mwUndo", "undoBtn"], ["mwRedo", "redoBtn"], ["mwSave", "saveBtn"], ["mwPreview", "previewBtn"], ["mwPublish", "publishBtn"], ["mwUnpublish", "unpublishBtn"], ["mwMulti", "multiBtn"],
    ["mwStageAdd", "stageAdd"], ["mwStageEarlier", "stageLeft"], ["mwStageLater", "stageRight"], ["mwStageDelete", "stageDelete"], ["mwStageConfirmYes", "stageConfirmYes"], ["mwStageConfirmNo", "stageConfirmNo"]]) {
    assert.match(shell, new RegExp(`proxy\\("${from}", "${to}"\\);`), from);
  }
  const body = code(shell);
  assert.doesNotMatch(body, /persistence|rpc\(|session\.save|\.publish\(|addStage\(|deleteStage\(|reorderStage\(|localStorage|sessionStorage|innerHTML/);
  for (const op of ["duplicateElements", "deleteElements", "reorderLayers", "updatePayload", "moveElementsToStage", "stageMoveOptions", "expandSelection"]) assert.match(body, new RegExp(`ops\\.${op}\\(`), op);
  assert.match(editor, /mobile = createMobileShell\(\{ session, canvas, run, openTool, closeTools, toggleTool,/);
});

test("Save and Publish stay separate: the top Save is only the editor's Save; Publish lives in the Wall menu and only runs when tapped", () => {
  assert.match(html, /<button id="mwSave" class="mw-save" type="button" data-state="loading" disabled>/);
  assert.match(html, /<aside id="mwWall"[\s\S]*<button id="mwPublish" class="ed-btn ed-publish mw-wide" type="button" disabled>Publish<\/button>/);
  assert.doesNotMatch(html.slice(html.indexOf('<header id="mwTop"'), html.indexOf("</header>", html.indexOf('<header id="mwTop"'))), /id="[^"]*publish/i, "no Publish button in the top toolbar (only the menu that holds it)");
  assert.match(shell, /\$\("mwSave"\)\.disabled = \$\("saveBtn"\)\.disabled;/);
  assert.match(shell, /\$\("mwPublish"\)\.disabled = \$\("publishBtn"\)\.disabled;/);
});

test("stages: the accepted contract holds on the phone - Add appends at the end (through the same handler), Delete always asks first; stages stay unnamed", () => {
  assert.match(html, /<button id="mwStageAdd" class="ed-btn ed-primary mw-wide" type="button">\+ Add stage at the end<\/button>/);
  assert.match(html, /<div id="mwStageConfirm" class="ed-confirm" role="alertdialog"/);
  assert.match(shell, /\$\("mwStageConfirm"\)\.hidden = \$\("stageConfirm"\)\.hidden;/);
  assert.doesNotMatch(code(shell), /rename|stage\.name|\.title =/i, "no stage names are invented (the model has none)");
  // the editor's own Add handler is still the append-only one
  assert.match(editor, /const result = run\(ops\.addStage\(session\.doc, \{ limit: stageLimit \}\)\);/);   // (Wall Stages V2 2026-10-22: the owner's stage allowance; still no position)
});

test("canvas zoom is view-only and phone-only: it scales the drawing, never the document; desktop pointer handling is unchanged", () => {
  assert.match(canvas, /export const ZOOM_MIN = 1;\nexport const ZOOM_MAX = 6;/);
  assert.match(canvas, /const zoomOn = \(\) => view\?\.enabled\?\.\(\) === true;/);
  assert.match(canvas, /return zoomOn\(\) && zoom > 1 \? Math\.min\(fit \* zoom, Math\.max\(fit, ZOOM_SCALE_MAX\)\) : fit;/);
  assert.match(canvas, /if \(!zoomOn\(\) && !host\.contains\(event\.target\)\) return;/, "off the phone only the stage reacts, as before");
  // the zoom / pan / fit functions only redraw and scroll
  const view = canvas.slice(canvas.indexOf("function applyZoom"), canvas.indexOf("// Events are read on the viewport"));
  assert.doesNotMatch(view, /session\.(apply|select|toggle|clearSelection)|ops\./);
  assert.match(canvas, /if \(gesture\.kind === "zoom"\) \{\n\s+\/\/ the zoom ends when fewer than two fingers remain/);
  assert.match(editor, /view: \{ enabled: isPhoneShell, onChange: state => mobile\?\.zoomChanged\(state\) \},/);
  // interrupted gestures are dropped
  assert.match(editor, /document\.addEventListener\("visibilitychange", \(\) => \{ if \(document\.hidden && canvas\.busy\) canvas\.cancel\(\); \}\);/);
});

test("Properties on a phone: common controls first, Text style, Position & size (with nudge) and Arrange & align collapsible (a Pro Effect's own section: tests/wall-pro-effects.test.js)", () => {
  assert.match(controls, /const phoneProps = typeof matchMedia === "function" \? matchMedia\(PHONE_QUERY\) : null;/);
  assert.match(controls, /if \(phoneProps\?\.matches\) \{ phoneRebuild\(targets, types, single, groupedSelection\); return; \}/);
  for (const label of ["Text style", "Position & size", "Arrange & align"]) assert.match(controls, new RegExp(`later\\("${label}"\\)`), label);
  assert.match(controls, /ops\.moveElements\(session\.doc, session\.state\.selection, dx \* step\(\), dy \* step\(\)\), \{ coalesce: "nudge" \}/);
  // the desktop branches come first and are unchanged
  assert.ok(controls.indexOf('types[0] === "text" && desktopProps?.matches') < controls.indexOf("if (phoneProps?.matches) { phoneRebuild"));
});

test("phone ergonomics: >= 44px targets, safe areas, dynamic viewport, keyboard lift, reduced motion, no emoji icons", () => {
  assert.match(css, /\.mw-btn \{ display: grid; place-items: center; flex: none; width: 2\.75rem; height: 2\.75rem;/);
  assert.match(css, /\.mw-act \{[^}]*min-width: 2\.75rem; min-height: 2\.75rem;/);
  assert.match(css, /--safe-b: env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /--mw-half: 46dvh/);
  assert.match(css, /body\.is-mw-keyboard \.ed-panel, body\.is-mw-keyboard \.mw-sheet \{ bottom: var\(--mw-kb\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(orientation: landscape\)/);
  assert.match(css, /\.ed-viewport, body\.is-sheet-open \.ed-viewport \{ position: relative; z-index: 0; isolation: isolate; display: flex;[^}]*overflow: hidden; touch-action: none;/, "the stage never covers the shell");
  assert.match(shell, /vv\?\.addEventListener\("resize", keyboardChanged\);/);
  assert.doesNotMatch(html.slice(html.indexOf('<header id="mwTop"')), /[\u{1F300}-\u{1FAFF}]/u, "line icons, not emoji");
});
