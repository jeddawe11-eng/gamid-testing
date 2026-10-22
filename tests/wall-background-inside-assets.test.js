// Background inside Assets (Mazen's approved organization, 2026-10-21): Assets is the one home for the owner's uploaded Wall media AND the Wall background.
// Desktop rail and phone More no longer list Background; Assets has two areas (My Assets, Background); every Background control, id and rule is kept; the same
// stored files serve both areas (Add to Canvas / Set as Background, never a copy); old "background" shortcuts open the Background area; deletion stays the
// universal flow and removing a background never deletes a file. Browser E2E of the same (lab editor) is recorded in docs/WALL-BACKGROUND-INSIDE-ASSETS.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const html = read("dist/wall-editor/index.html"), tools = read("dist/wall-editor/tools.js"), editor = read("dist/wall-editor/editor.js"), shell = read("dist/wall-editor/mobile-shell.js");
const desktopCss = read("dist/wall-editor/editor-desktop.css"), baseCss = read("dist/wall-editor/editor.css"), mobileCss = read("dist/wall-editor/editor-mobile.css");
const assetsPanel = html.slice(html.indexOf('<section class="ed-section" data-tool-panel="assets">'), html.indexOf('<section class="ed-section" data-tool-panel="templates">'));

test("navigation: no standalone Background tool on desktop (rail) or phone (More); Assets stays a primary tool", () => {
  assert.doesNotMatch(html, /data-tool="background"|data-tool-panel="background"|data-mw-tool="background"/);
  assert.match(html, /<button type="button" data-tool="assets"><i aria-hidden="true">&#9635;<\/i><span>Assets<\/span><\/button>/);
  assert.match(html, /<button type="button" data-mw="assets"/, "the phone bottom bar keeps Assets");
  assert.match(shell, /const MORE_TOOLS = new Set\(\["text", "media", "shapes", "gamid", "templates"\]\);/);
  assert.doesNotMatch(shell, /background: "Background"/);
  assert.doesNotMatch(baseCss + desktopCss, /data-tool="background"|data-tool-panel="background"/, "no leftover rules for the removed tool");
});

test("final order (Mazen, 2026-10-22): Assets directly above Layout - rail ... My Gamer Data, Assets, Layout, Templates; phone bar Add, Assets, Layers, Stages, More", () => {
  assert.deepEqual([...html.matchAll(/<button type="button" data-tool="([a-z]+)"/g)].map(m => m[1]), ["add", "text", "media", "shapes", "gamid", "assets", "layout", "templates", "props"]);
  assert.deepEqual([...html.matchAll(/<button type="button" data-mw="([a-z]+)"/g)].map(m => m[1]), ["add", "assets", "layout", "stages", "more"]);
});

test("Assets has two areas: My Assets (the library) and Background, switched by one pair of buttons; My Assets first", () => {
  assert.match(assetsPanel, /<div class="ed-seg ed-assets-switch" role="group" aria-label="Assets area">\s*<button type="button" data-assets-show="library" aria-pressed="true" aria-controls="assetsLibrary">My Assets<\/button>\s*<button type="button" data-assets-show="background" aria-pressed="false" aria-controls="assetsBackground">Background<\/button>/);
  assert.match(assetsPanel, /<div id="assetsLibrary" data-assets-area="library" role="region" aria-label="My Assets">/);
  assert.match(assetsPanel, /<div id="assetsBackground" data-assets-area="background" role="region" aria-label="Background" hidden>/);
  const library = assetsPanel.slice(assetsPanel.indexOf('data-assets-area="library"'), assetsPanel.indexOf('data-assets-area="background"'));
  for (const id of ["assetUpload", "assetFile", "assetMessage", "assetBgTarget", "assetGrid"]) assert.match(library, new RegExp(`id="${id}"`), id);
  const background = assetsPanel.slice(assetsPanel.indexOf('data-assets-area="background"'));
  // every Background id and control the panel had, unchanged (renderBackground keeps working on them)
  assert.match(background, /<div class="ed-seg" role="group" aria-label="Where the background applies">\s*<button type="button" data-bg-scope="wall" aria-pressed="true">Whole Wall<\/button>\s*<button type="button" data-bg-scope="stage" aria-pressed="false">This stage only<\/button>\s*<\/div>\s*<div id="bgKinds"/, "the scope choice stays the FIRST .ed-seg of the area (its desktop 2-column rule)");
  for (const id of ["bgKinds", "bgControls", "bgNote"]) assert.equal((html.match(new RegExp(`id="${id}"`, "g")) ?? []).length, 1, id);
  assert.match(tools, /function showAssetsArea\(area\) \{\s*assetsArea = area === "background" \? "background" : "library";/);
  assert.match(tools, /for \(const box of document\.querySelectorAll\("\[data-assets-area\]"\)\) box\.hidden = box\.dataset\.assetsArea !== assetsArea;/);
  assert.match(tools, /return \{\s*addImageElement, uploadFile, showAssetsArea,/);
});

test("old Background shortcuts open Assets on Background, never a missing panel", () => {
  assert.match(editor, /if \(name === "background"\) \{ name = "assets"; tools\?\.showAssetsArea\("background"\); \}/);
  assert.match(editor, /function toggleTool\(name\) \{\s*if \(name === "background"\) \{ openTool\(name\); return; \}/);
});

test("every Background behaviour is kept: the five types, scope, inheritance note, Remove background (never deletes the file), Fit & Position, Appearance", () => {
  assert.match(tools, /\["none", "None"\], \["color", "Colour"\], \["gradient", "Gradient"\], \["image", "Image"\], \["video", "Video"\]/);
  assert.match(tools, /text: "Remove background",[\s\S]{0,200}onclick: \(\) => \{ deleteStatus = ""; setBg\(null\); \}/, "Remove clears the assignment only");
  assert.match(tools, /section\("fit", "Fit & Position", null,/);
  assert.match(tools, /section\("look", "Appearance", null, look\)/);
  assert.match(tools, /This stage uses the Whole Wall background\. Choose one here to give this stage its own\./);
  assert.match(tools, /The Whole Wall background runs continuously across all stages\. A stage can have its own background instead\./);
  // the accepted desktop look (REV-0016) is the same rules, re-scoped from the old panel to its area
  assert.match(desktopCss, /\[data-assets-area="background"\] #bgKinds \{ grid-template-columns: repeat\(6, minmax\(0, 1fr\)\); \}/);
  assert.match(desktopCss, /\[data-tool-panel="assets"\] > \.ed-assets-switch, \[data-assets-area="background"\] \.ed-seg \{ display: grid;/);
  assert.match(desktopCss, /\[data-assets-area="library"\] \.ed-asset \{/, "the library cards keep their own look and never restyle the background cards");
});

test("one shared library: Add to Canvas and Set as Background are two explicit actions on the same stored file; nothing is copied", () => {
  assert.match(tools, /text: "Add to Canvas", "aria-label": `Add this \$\{noun\.toLowerCase\(\)\} to the stage as its own element`, onclick: \(\) => addImageElement\(asset\) \}\)/);
  assert.match(tools, /text: "Set as Background", "aria-label": `Set this \$\{noun\.toLowerCase\(\)\} as the \$\{targetLabel\(\)\} background`, onclick: \(\) => setAsBackground\(asset\) \}\)/);
  const set = tools.slice(tools.indexOf("function setAsBackground(asset)"), tools.indexOf("function renderAssets("));
  assert.match(set, /const next = now\?\.kind === \(video \? "video" : "image"\) \? \{ \.\.\.now, assetId: asset\.asset_id \} : \(video \? createVideoBackground : createImageBackground\)\(asset\.asset_id\);/, "an existing picture / video background keeps its settings");
  assert.match(set, /run\(ops\.setBackground\(doc\(\), scopeId\(\), next\)\)/, "the scope chosen under Background");
  assert.doesNotMatch(set, /upload|api\./, "no upload, no copy, no network");
  assert.match(tools, /Set as Background applies to: \$\{scope === "wall" \? "the Whole Wall" : `\$\{targetLabel\(\)\} only`\} \(choose under Background\)\./);
});

test("uploading for a background uses the SAME asset store and checks (one upload at a time across both areas), and assigns the new file to the intended scope", () => {
  const block = tools.slice(tools.indexOf("const BG_ACCEPT"), tools.indexOf("// the persistent error box for a background upload"));
  assert.match(block, /await assets\.uploadVideo\(file, /);
  assert.match(block, /await assets\.upload\(file\)/);
  assert.doesNotMatch(block, /api\.|fetch\(|uploadWall/, "no second upload mechanism: the asset store's own pipeline");
  assert.match(block, /run\(ops\.setBackground\(doc\(\), target, createImageBackground\(result\.asset\.asset_id\)\)\);/);
  assert.match(block, /run\(ops\.setBackground\(doc\(\), target, createVideoBackground\(result\.asset\.asset_id\)\)\); return; \}/);
  assert.match(block, /if \(videoBusy\(\) \|\| uploading\) \{ notify\("An upload is already in progress\. Wait for it to finish\."\); return; \}/);
  assert.match(tools, /if \(uploading \|\| videoBusy\(\)\) \{ say\("An upload is already in progress\. Wait for it to finish\."\); return null; \}/);
  assert.match(tools, /uploadRow\("Upload image", "image"\)/);
  assert.match(tools, /if \(!bg\) controlsBox\.append\(uploadRow\("Upload image or video", "any"\)\);/);
  assert.match(tools, /else if \(value === "image"\) \{ const first = assets\.images\[0\]; if \(first\) setBg\(createImageBackground\(first\.asset_id\)\); else pickForBackground\("image"\); \}/);
  assert.match(tools, /text: "Upload MP4", onclick: pickVideo/, "the Video type keeps its MP4 upload");
});

test("deleting stays the universal flow in both areas; the phone keeps 44px touch targets in Assets", () => {
  assert.equal((tools.match(/await deleteAssetNow\(asset\)/g) ?? []).length, 2, "My Assets and Background");
  assert.doesNotMatch(tools, /assets\.remove\(|window\.confirm/);
  assert.match(mobileCss, /\[data-tool-panel="assets"\] \.ed-seg button, \[data-tool-panel="assets"\] \.ed-asset \.row \.ed-btn \{ min-height: 2\.75rem; \}/);
  assert.match(baseCss, /\.ed-asset \.row\.ed-asset-actions \{ flex-direction: column; \}/);
});
