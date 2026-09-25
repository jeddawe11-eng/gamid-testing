// The unified editor's information architecture and product rules (static contracts on the shipped page): every tool has ONE logical home, the Wall is entered from the
// authenticated GamID identity, nothing infrastructure-shaped is shown to a person, and the reserved/deferred capabilities are honest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ASSET_LIMITS } from "../dist/wall-kit/assets.js";
import { BACKGROUND_KINDS } from "../dist/wall-kit/background.js";
import { PROVIDERS } from "../dist/wall-kit/embed/index.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const html = read("dist/wall-editor/index.html");
const walk = (dir, out = []) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) walk(full, out); else out.push(full); } return out; };
const uiFiles = walk("dist/wall-editor").filter(file => /\.(js|html)$/.test(file));
const TOOLS = ["add", "text", "media", "shapes", "background", "gamid", "layout", "assets", "templates"];

test("information architecture: the tool rail has exactly the nine product sections (+ the phone-only Edit tab), each with its own panel", () => {
  const rail = [...html.matchAll(/<button type="button" data-tool="([a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(rail, [...TOOLS, "props"]);
  for (const tool of TOOLS) assert.equal((html.match(new RegExp(`data-tool-panel="${tool}"`, "g")) ?? []).length, 1, `${tool} has exactly one panel`);
  assert.match(html, /<span>Media &amp; Links<\/span>/);
  assert.match(html, /<span>GamID<\/span>/);
  assert.match(html, /<span>Templates<\/span>/);
  assert.match(html, /id="props"[^>]*aria-label="Properties"/, "the contextual inspector remains");
  assert.match(html, /id="previewBtn"/);
  assert.match(html, /id="saveBtn"/);
  assert.match(html, /id="saveState"/);
  assert.match(html, /id="undoBtn"/);
});
test("ADD offers Text, Shape, Image, Link / Embed and GamID block without exposing schemas or providers", () => {
  const actions = [...html.matchAll(/data-add-action="([a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(actions, ["text", "shape", "image", "embed", "gamid"]);
  const addPanel = html.slice(html.indexOf('data-tool-panel="add"'), html.indexOf('data-tool-panel="text"'));
  assert.match(addPanel, /Link \/ Embed/);
  assert.doesNotMatch(addPanel, /schema|payload|iframe|provider/i);
});
test("Media & Links: paste an address (a URL field, not an embed-code box); supported providers are listed from the registry, not typed into the page", () => {
  const media = html.slice(html.indexOf('data-tool-panel="media"'), html.indexOf('data-tool-panel="shapes"'));
  assert.match(media, /id="mediaUrl"[^>]*type="url"/);
  assert.doesNotMatch(media, /<textarea|iframe|embed code|paste.*html/i);
  assert.match(media, /id="mediaSupported"/);
  for (const provider of PROVIDERS.values()) assert.equal(html.includes(provider.label), false, `${provider.label} is not hard-coded in the page`);
  assert.match(media, /identity[\s\S]*Wall content|Wall content[\s\S]*identity/i, "the identity-vs-content distinction is explained");
});
test("Background: Whole Wall vs This stage, Colour / Gradient / Image, and an honest 'later' for video", () => {
  const panel = html.slice(html.indexOf('data-tool-panel="background"'), html.indexOf('data-tool-panel="gamid"'));
  assert.match(panel, /data-bg-scope="wall"/);
  assert.match(panel, /data-bg-scope="stage"/);
  assert.deepEqual([...BACKGROUND_KINDS], ["color", "gradient", "image"]);
  const tools = read("dist/wall-editor/tools.js");
  assert.match(tools, /\["none", "None"\], \["color", "Colour"\], \["gradient", "Gradient"\], \["image", "Image"\]/);
  assert.match(tools, /Video · later[\s\S]{0,20}|disabled: true, title: "Video backgrounds come in a later update"/);
});
test("Assets: the file picker accepts exactly the allowed raster types; limits are stated; nothing but the owner's own images is offered", () => {
  const input = html.match(/<input id="assetFile"[^>]*>/)[0];
  assert.equal(input.match(/accept="([^"]+)"/)[1], ASSET_LIMITS.types.join(","));
  assert.doesNotMatch(input, /svg/i);
  assert.match(html, /5 MB each/);
  assert.match(html, /private to you/);
});
test("Templates is a deliberate, honest placeholder - no template code, no marketplace", () => {
  const panel = html.slice(html.indexOf('data-tool-panel="templates"'), html.indexOf("</aside>"));
  assert.match(panel, /Coming later/);
  assert.doesNotMatch(read("dist/wall-editor/tools.js") + read("dist/wall-editor/editor.js"), /marketplace|applyTemplate|templateLibrary/i);
});
test("GamID: real blocks only, with the privacy promise stated in the panel", () => {
  const panel = html.slice(html.indexOf('data-tool-panel="gamid"'), html.indexOf('data-tool-panel="layout"'));
  assert.match(panel, /never sample content/);
  assert.match(panel, /Private information stays private/);
  assert.match(panel, /id="gamidBlocks"/);
  const source = (read("dist/wall-kit/gamid.js") + read("dist/wall-editor/gamid-data.js") + read("dist/wall-kit/gamid-blocks.js")).replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /sample|lorem|fake|dummy|placeholder data/i, "no invented content in code (comments may say so)");
});
test("Layout keeps the accepted W3 stage and layer tools (no stage maximum anywhere)", () => {
  for (const id of ["stageChips", "stageAdd", "stageLeft", "stageRight", "stageDelete", "stageConfirm", "layerList", "multiBtn"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const file of uiFiles.concat(walk("dist/wall-kit").filter(f => f.endsWith(".js")), walk("dist/wall").filter(f => f.endsWith(".js")))) assert.doesNotMatch(read(file), /MAX_STAGES|maxStages|stage limit|at most 3 stages/i, file);
});
test("the inspector has type-specific controls for every element type", () => {
  const controls = read("dist/wall-editor/controls.js");
  for (const fn of ["textControls", "shapeControls", "imageControls", "embedControls", "gamidControls", "geometryControls", "actionControls"]) assert.match(controls, new RegExp(`function ${fn}\\(`), fn);
  assert.match(controls, /types\[0\] === "image"\) imageControls/);
  assert.match(controls, /types\[0\] === "embed" && single\) embedControls/);
  assert.match(controls, /types\[0\] === "gamid"\) gamidControls/);
  assert.match(controls, /Hours are hidden unless you turn them on here AND your GamID playtime setting allows them/);
});

test("nothing infrastructure-shaped is shown to a person: no Recovery, GitHub, Cloudflare, session, handoff, Wall version or provider-engineering wording", () => {
  const visible = [html.replace(/<meta[^>]*>/g, "").replace(/<script[^>]*><\/script>/g, ""), read("dist/wall-kit/messages.js"), read("dist/wall-kit/auth-gate.js").slice(read("dist/wall-kit/auth-gate.js").indexOf("export function gateFor"))].join("\n");
  assert.doesNotMatch(visible, /recover|github|cloudflare|handoff|hand-off|token|W0|W1|W2|W3|session check|prototype|lab\b/i);
  assert.doesNotMatch(html, /Recover my existing sign-in/);
  const gateTitles = [...read("dist/wall-editor/editor.js").matchAll(/title: "([^"]+)"/g)].map(match => match[1]);
  for (const title of gateTitles) assert.doesNotMatch(title, /session|handoff|recover|origin/i, title);
});
test("one entry: the Wall is entered from the authenticated GamID identity view; the editor itself needs no second login and no Wall-specific auth", () => {
  const account = read("dist/account/index.html");
  const identityView = account.slice(account.indexOf('id="identityView"'));
  assert.match(identityView, /aria-label="My Wall"/);
  assert.match(identityView, /<a class="primary play-together-link" href="\.\.\/wall-editor\/">EDIT WALL<\/a>/);
  assert.equal(account.slice(0, account.indexOf('id="identityView"')).includes("wall-editor"), false, "the link only exists inside the signed-in identity view");
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /resolveEditorSession\(restoreSession\)/);
  assert.doesNotMatch(editor.replace(/\/\/.*$/gm, ""), /signIn\(|signUp\(|password|createWallLogin|wallToken/i);
});
test("desktop and mobile: a left tool rail + drawer + inspector on desktop; a bottom tool strip and sheets on phones; big touch targets", () => {
  const css = read("dist/wall-editor/editor.css");
  assert.match(css, /grid-template-columns: 5rem 17rem minmax\(0, 1fr\) 20rem/);
  assert.match(css, /\.ed-rail \{[^}]*position: fixed[^}]*overflow-x: auto/);
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*\.ed-rail \{ position: static; z-index: auto; display: flex; flex-direction: column/);
  assert.match(css, /\.ed-rail button \{[^}]*min-width: 4\.6rem/);
  assert.match(css, /\.ed-add-list \.ed-btn \{[^}]*min-height: 3\.2rem/);
  assert.match(css, /body\.is-sheet-open \.ed-viewport \{ padding-bottom: 48dvh; \}/);
  assert.match(css, /\.ed-preview-bar \.ed-seg/);
  assert.match(html, /id="previewMobile"[\s\S]*id="previewDesktop"/, "Desktop/Mobile preview are two views of the ONE Wall");
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /previewMode === "mobile" \? Math\.min\(390, available\) : Math\.min\(900, available\)/);
  assert.match(editor, /paintDocument\(session\.doc, width, undefined, \{ mode: "view"/);
});
test("Preview uses the real renderer in view mode, is torn down on close, and never touches the saved document or the session", () => {
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /players\?\.destroyAll\(\)/);
  const preview = editor.slice(editor.indexOf("function renderPreview"), editor.indexOf("// ---- keyboard"));
  assert.doesNotMatch(preview, /session\.(apply|save|state\.doc)|run\(/);
});
test("save states and the conflict UX are unchanged: Saving / Saved / Unsaved / Error and Load latest / Keep mine", () => {
  assert.match(html, /id="conflictReload"[^>]*>Load the latest \(discard my edits\)/);
  assert.match(html, /id="conflictOverwrite"[^>]*>Keep mine and overwrite/);
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…"/);
  assert.match(editor, /window\.confirm\("Overwrite the newer saved version/);
});
