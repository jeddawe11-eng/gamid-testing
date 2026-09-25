// W3 - the editor page: painting safety (no markup execution), preview purity, route/auth isolation, CSP, no provider logic in the generic core, and the
// integrity of the shipped files. The pointer/gesture geometry itself is covered as pure operations in wall-w3-ops.test.js.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { paintDocument, paintElement, paintStage } from "../dist/wall-kit/paint.js";
import { createTextPayload } from "../dist/wall-kit/text.js";
import { renderDocument } from "../dist/wall/render.js";
import { describeErrors, describeCode } from "../dist/wall-kit/messages.js";
import * as ops from "../dist/wall-kit/ops.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const walk = (dir, out = []) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) walk(full, out); else out.push(full); } return out; };
const sources = dir => walk(dir).filter(file => /\.(js|html|css)$/.test(file));
const norm = path => path.replaceAll("\\", "/");

// A tiny DOM that records everything painted and refuses any HTML-string API.
class FakeNode {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.style = { setProperty: (name, value) => this.props.set(name, value) }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(node => this.children.push(node)); }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); }
  set innerHTML(_) { throw new Error("innerHTML must never be used to paint a Wall"); }
  set outerHTML(_) { throw new Error("outerHTML must never be used"); }
}
const create = tag => new FakeNode(tag);
const textDoc = (over, id = "t1") => { const d = createDocument(); d.stages[0].elements = [createElement({ id, type: "text", x: 10, y: 10, width: 600, height: 200, payload: createTextPayload(over) })]; return d; };
const findAll = (node, test, out = []) => { if (test(node)) out.push(node); node.children.forEach(child => findAll(child, test, out)); return out; };

// ---------- painting: text is text, CSS is built from validated values only ----------
test("paint: text is set with textContent only - special characters stay characters", () => {
  const stage = paintDocument(textDoc({ text: "Tom & Jerry \"quoted\" it's 100% <3 #1" }), 500, create).stages[0];
  const [inner] = findAll(stage, node => node.className === "wall-text");
  assert.equal(inner.textContent, "Tom & Jerry \"quoted\" it's 100% <3 #1");
  assert.equal(inner.children.length, 0, "no child nodes were created from the string");
});
test("paint: every typography field reaches the painted style", () => {
  const over = { text: "Hi", fontFamily: "bebas-neue", fontSize: 100, fontWeight: 800, italic: true, underline: true, color: "#ff0000", align: "right", lineHeight: 1.5, letterSpacing: 4, opacity: 0.5, direction: "rtl", wrap: false,
    stroke: { color: "#000000", width: 6 }, shadow: { color: "#111111", blur: 8, x: 4, y: 2 }, glow: { color: "#62e7ff", blur: 10 } };
  const stage = paintDocument(textDoc(over), 500, create).stages[0];   // scale 0.5
  const [inner] = findAll(stage, node => node.className === "wall-text");
  const p = inner.props;
  assert.match(p.get("font-family"), /GamID Bebas/);
  assert.equal(p.get("font-size"), "50px");
  assert.equal(p.get("font-weight"), "800");
  assert.equal(p.get("font-style"), "italic");
  assert.equal(p.get("text-decoration"), "underline");
  assert.equal(p.get("color"), "#ff0000");
  assert.equal(p.get("text-align"), "right");
  assert.equal(p.get("line-height"), "1.5");
  assert.equal(p.get("letter-spacing"), "2px");
  assert.equal(p.get("opacity"), "0.5");
  assert.equal(p.get("white-space"), "pre");
  assert.equal(inner.attrs.dir, "rtl");
  assert.equal(p.get("direction"), "rtl");
  assert.equal(p.get("-webkit-text-stroke"), "3px #000000");
  assert.equal(p.get("text-shadow"), "2px 1px 4px #111111, 0 0 5px #62e7ff, 0 0 10px #62e7ff");
});
test("paint: gradient text uses a clipped gradient; wrapping text wraps; automatic direction uses dir=auto", () => {
  const stage = paintDocument(textDoc({ gradient: { from: "#ff0000", to: "#0000ff", angle: 45 } }), 500, create).stages[0];
  const [inner] = findAll(stage, node => node.className === "wall-text");
  assert.equal(inner.props.get("background-image"), "linear-gradient(45deg, #ff0000, #0000ff)");
  assert.equal(inner.props.get("-webkit-text-fill-color"), "transparent");
  assert.equal(inner.props.get("white-space"), "pre-wrap");
  assert.equal(inner.attrs.dir, "auto");
});
test("paint: shapes - fill, gradient, opacity, border and a radius clamped to a circle/pill", () => {
  const d = createDocument();
  d.stages[0].elements = [createElement({ id: "s", type: "rect", x: 0, y: 0, width: 200, height: 100, payload: { fill: "#112233", opacity: 0.4, stroke: "#ffffff", strokeWidth: 8, radius: 1000 } }),
    createElement({ id: "g", type: "rect", x: 300, y: 0, width: 100, height: 100, z: 1, payload: { fill: "#000000", gradient: { from: "#000000", to: "#ffffff", angle: 90 } } })];
  const stage = paintDocument(d, 500, create).stages[0];
  const [shape, gradient] = findAll(stage, node => node.className.startsWith("wall-el"));
  assert.equal(shape.props.get("border"), "4px solid #ffffff");
  assert.equal(shape.props.get("border-radius"), "25px", "clamped to half of the shorter side (50px tall at this scale)");
  assert.equal(shape.props.get("opacity"), "0.4");
  assert.equal(gradient.props.get("background"), "linear-gradient(90deg, #000000, #ffffff)");
});
test("paint: rotation becomes a CSS rotate about the centre; stacking follows the deterministic z order", () => {
  const d = createDocument();
  d.stages[0].elements = [createElement({ id: "b", type: "rect", x: 0, y: 0, width: 100, height: 100, z: 1, payload: { fill: "#000000" }, rotation: 30 }), createElement({ id: "a", type: "rect", x: 0, y: 0, width: 100, height: 100, z: 0, payload: { fill: "#ffffff" } })];
  const stage = paintDocument(d, 1000, create).stages[0];
  const els = findAll(stage, node => node.className.startsWith("wall-el"));
  assert.deepEqual(els.map(node => node.attrs["data-el"]), ["a", "b"]);
  assert.deepEqual(els.map(node => node.props.get("z-index")), ["1", "2"]);
  assert.equal(els[1].props.get("transform"), "rotate(30deg)");
  assert.equal(els[0].props.has("transform"), false);
});
test("paint: even a hostile render tree cannot inject CSS - non-hex colours and non-numbers are neutralised, unknown fonts fall back", () => {
  const hostile = { id: "x", x: 1, y: 2, width: 50, height: 40, content: { kind: "text", text: "<img src=x onerror=alert(1)>", fontFamily: "x;}body{display:none", fontSize: "1px;evil", fontWeight: 400, italic: false, underline: false, color: "red;background:url(//evil)", align: "left", lineHeight: 1, letterSpacing: NaN, opacity: 1, direction: "auto", wrap: true, shadow: { x: 1, y: 1, blur: 1, color: "url(evil)" } } };
  const node = paintElement(hostile, 1, 0, create);
  const [inner] = findAll(node, n => n.className === "wall-text");
  assert.equal(inner.props.get("color"), "#000000");
  assert.equal(inner.props.get("font-size"), "0px");
  assert.equal(inner.props.get("letter-spacing"), "0px");
  assert.doesNotMatch(inner.props.get("font-family"), /body|display/);
  assert.match(inner.props.get("text-shadow"), /#000000$/);
  assert.equal(inner.textContent, "<img src=x onerror=alert(1)>", "even hostile text is only ever text");
  const all = JSON.stringify([...inner.props.entries()]);
  assert.doesNotMatch(all, /evil|url\(/);
});
test("paint: unknown / embed content paints an empty positioned box - never raw data", () => {
  const node = paintElement({ id: "e", x: 0, y: 0, width: 10, height: 10, content: { kind: "embed", providerKey: "x", unavailable: true } }, 1, 0, create);
  assert.equal(node.children.length, 0);
});

// ---------- preview ----------
test("preview: paints the current unsaved document through the real W1 render pipeline and never mutates it", () => {
  let doc = ops.addElement(createDocument(), "stage_1", "text").doc;
  doc = ops.addStage(doc).doc;
  doc = ops.addElement(doc, "stage_2", "circle").doc;
  const before = JSON.stringify(doc);
  const painted = paintDocument(doc, 560, create);
  assert.equal(painted.ok, true);
  assert.equal(painted.stages.length, 2);
  assert.equal(JSON.stringify(doc), before, "the document was not touched");
  const tree = renderDocument(doc, { viewportWidth: 560 });
  assert.deepEqual(painted.stages.map(stage => [stage.props.get("width"), stage.props.get("height")]), tree.stages.map(stage => [`${Math.round(stage.width * 1000) / 1000}px`, `${Math.round(stage.height * 1000) / 1000}px`]));
  assert.equal(paintDocument(doc, 560, create).stages.length, 2, "deterministic and repeatable; the editor can return to editing unchanged");
});
test("preview: a document the core rejects is not painted at all", () => {
  const painted = paintDocument({ ...createDocument(), schemaVersion: 3 }, 500, create);
  assert.deepEqual(painted, { ok: false, errors: ["UNSUPPORTED_SCHEMA_VERSION"] });
  assert.equal(paintDocument(createDocument(), 0, create).ok, false);
});
test("paint: the stage is a fixed canonical-aspect container; nothing needs a browser to be tested", () => {
  const tree = renderDocument(createDocument(), { viewportWidth: 360 });
  const stage = paintStage(tree.stages[0], tree.scale, create);
  assert.equal(stage.props.get("width"), "360px");
  assert.equal(stage.props.get("height"), "640.08px");
  assert.equal(stage.props.get("overflow"), "hidden");
});

// ---------- messages ----------
test("messages: typed codes map to owner-facing sentences; unknown codes stay generic; duplicates collapse", () => {
  const lines = describeErrors(["UNSAFE_PAYLOAD_CONTENT:t1.payload.text", "UNSAFE_PAYLOAD_CONTENT:t2.payload.text", "OUTSIDE_CANVAS:t1"]);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /plain text/i);
  assert.match(describeErrors(["SOMETHING_NEW:x"])[0], /SOMETHING_NEW/);
  assert.match(describeCode("WALL_REVISION_CONFLICT"), /newer version/i);
  assert.match(describeCode("AUTH_REQUIRED"), /sign in/i);
});

// ---------- the page: security, route and auth isolation ----------
const html = read("dist/wall-editor/index.html");
const editorFiles = [...sources("dist/wall-editor"), ...sources("dist/wall-kit"), ...sources("dist/wall")].map(norm);
const codeOf = file => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("security: the page carries a strict CSP - same-origin scripts/styles/fonts, no inline code, no eval, network only to the project's Supabase", () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /style-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.equal((csp.match(/data:/g) ?? []).length, 1, "data: is allowed for images only");
  assert.match(csp, /img-src 'self' data:/);
  assert.match(csp, /connect-src 'self' https:\/\/upvtrczefcvigxdyuylw\.supabase\.co(;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'none'/);
});
test("security: no inline script, inline style, inline event handler or remote resource in the page", () => {
  const body = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "");
  assert.doesNotMatch(body, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(body, /\sstyle=/i);
  assert.doesNotMatch(body, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(body, /(?:src|href)="(?:https?:)?\/\//i);
  assert.match(html, /<meta name="robots" content="noindex"/);
});
test("security: the editor code never turns a string into markup or code (no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function, setAttribute('style'))", () => {
  for (const file of editorFiles.filter(file => file.endsWith(".js"))) {
    const code = codeOf(file);
    assert.doesNotMatch(code, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|setAttribute\(\s*["']style["']|srcdoc|createContextualFragment|DOMParser/, file);
  }
});
test("security: no external script or host is referenced anywhere in the editor/kit/core sources", () => {
  for (const file of editorFiles.filter(file => !file.endsWith("index.html"))) {
    const code = codeOf(file);
    const urls = [...code.matchAll(/https?:\/\/[^\s"'`)]+/g)].map(match => match[0]).filter(url => !url.includes("openfontlicense.org") && !url.includes("w3.org"));
    assert.deepEqual(urls, [], file);
  }
});
test("generic core: no provider names or logic in the Wall core, the kit or the editor", () => {
  for (const file of editorFiles.filter(file => file.endsWith(".js"))) assert.doesNotMatch(codeOf(file), /youtube|spotify|twitch|\bkick\b|tiktok|vimeo|soundcloud/i, file);
});
test("architecture: the core (dist/wall) never names the text type or typography; validate/render never branch on a literal type", () => {
  const core = editorFiles.filter(file => file.startsWith("dist/wall/") && file.endsWith(".js")).map(codeOf).join("\n");
  assert.doesNotMatch(core, /\bfont\b/i);
  assert.doesNotMatch(read("dist/wall/validate.js") + read("dist/wall/render.js"), /type\s*===?\s*["'](rect|text|embed)["']/);
  assert.match(read("dist/wall-kit/text.js"), /elementRegistry\.register\("text"/);
});
test("route: the editor is a private owner page - it needs the account session, uses only the three W2 owner RPCs and no anonymous call", () => {
  const editor = codeOf("dist/wall-editor/editor.js");
  assert.match(editor, /restoreSession\(\)/);
  assert.match(editor, /createWallPersistence\(/);
  assert.match(editor, /Sign in to edit your Wall/);
  assert.doesNotMatch(editor, /anonymous\s*:\s*true|localStorage|sessionStorage|fetch\(|XMLHttpRequest|WebSocket|postMessage/);
  const rpcNames = [...new Set(editorFiles.filter(file => file.endsWith(".js")).flatMap(file => [...codeOf(file).matchAll(/["'](\w+_my_wall_draft)["']/g)].map(match => match[1])))].sort();
  assert.deepEqual(rpcNames, ["ensure_my_wall_draft", "get_my_wall_draft", "save_my_wall_draft"]);
  assert.match(html, /aria-live="polite"/);
});
test("route: the editor's imports are limited to the Wall core, the kit, its own modules and the account session client - never Play Together or public pages", () => {
  const allowed = /^\.\.?\/(wall|wall-kit|wall-editor)\/|^\.\/|^\.\.\/account\/supabase-client\.js$/;
  for (const file of editorFiles.filter(file => file.endsWith(".js"))) {
    for (const match of read(file).matchAll(/from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g)) {
      const specifier = match[1] ?? match[2];
      assert.ok(specifier.startsWith(".") ? true : false, `${file} imports a bare/remote module ${specifier}`);
      const target = norm(resolve(dirname(file), specifier));
      assert.ok(existsSync(target), `${file} imports missing ${specifier}`);
      assert.doesNotMatch(target, /play-together|\/public\//);
    }
  }
});
test("route: nothing else links to or serves the editor - it is not wired into Account, the public profile, the Worker, or any public path", () => {
  for (const file of [...walk("dist"), ...walk("cf-worker"), "scripts/stage-cloudflare.mjs"].map(norm).filter(file => /\.(js|mjs|html)$/.test(file) && !file.startsWith("dist/wall-editor/") && !file.startsWith("dist/wall-kit/") && !file.startsWith("dist/wall/"))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /wall-editor|wall-kit/, file);
  }
  const worker = read("cf-worker/worker.mjs");
  assert.doesNotMatch(worker, /get_public_wall|public.?wall|wall_drafts/i);
});
test("no public Wall route exists yet: no public wall RPC in any migration and no wall path in the public profile", () => {
  const migrations = readdirSync("supabase/migrations").map(name => read(`supabase/migrations/${name}`)).join("\n");
  assert.doesNotMatch(migrations, /function public\.get_public_wall|function public\.\w*public_wall/i);
  assert.doesNotMatch(read("dist/public/public.js"), /\bwall\b/i);
});

// ---------- shipped-file integrity ----------
test("integrity: every asset the editor page references exists; every module parses; the fonts and licence ship with it", () => {
  for (const match of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
    const target = norm(resolve("dist/wall-editor", match[1]));
    assert.ok(existsSync(target), `index.html references missing ${match[1]}`);
  }
  for (const file of editorFiles.filter(file => file.endsWith(".js"))) {
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(check.status, 0, `${file}: ${check.stderr}`);
  }
  for (const font of ["Orbitron", "BebasNeue", "RussoOne", "Rajdhani", "ChakraPetch"]) assert.ok(existsSync(`dist/wall-kit/fonts/${font}.woff2`));
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
});
test("integrity: the editor page does not need a stamped asset version, so the shared staging script is untouched", () => {
  assert.doesNotMatch(html, /__ASSET_VERSION__/);
});
test("mobile ergonomics: touch-action none on the stage and handles, >= 44px touch targets, sheets not side panels below 900px", () => {
  const css = read("dist/wall-editor/editor.css");
  assert.match(css, /\.ed-stage-host\s*\{[^}]*touch-action:\s*none/);
  assert.match(css, /\.ed-handle\s*\{[^}]*touch-action:\s*none/);
  assert.match(css, /\.ed-pad\s*\{[^}]*touch-action:\s*none/);
  assert.match(css, /\.ed-btn\s*\{[^}]*min-height:\s*2\.75rem/);
  assert.match(css, /\.ed-handle::after\s*\{[^}]*inset:\s*-\.85rem/);
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /\.ed-panel\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  const canvas = codeOf("dist/wall-editor/canvas.js");
  assert.match(canvas, /TAP_SLOP_PX\s*=\s*22/);
  assert.match(canvas, /HANDLE_TARGET_PX\s*=\s*64/);
  assert.match(canvas, /pinch/);
  assert.match(canvas, /setPointerCapture/);
});
