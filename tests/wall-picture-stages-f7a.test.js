// F7-A (Mazen's authorization 2026-10-21): on the visitor page, pictures used only by later stages are fetched when their stage comes near; stage 1's and the
// whole-Wall background still load with the Intro. Same RLS-checked anonymous read, same manifest; frames are filled in place (no repaint). Editor / Preview unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import { createImageBackground } from "../dist/wall-kit/background.js";
import { createImagePayload } from "../dist/wall-kit/image.js";
import { pictureStages, createPictureLoader, preparePublicWall } from "../dist/public/public-wall.js";

const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002", C = "cccccccc-0000-4000-8000-000000000003", V = "dddddddd-0000-4000-8000-000000000004";
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.style = { setProperty: (n, v) => this.props.set(n, v) }; }
  setAttribute(n, v) { this.attrs[n] = String(v); } removeAttribute(n) { delete this.attrs[n]; }
  append(...nodes) { this.children.push(...nodes); } appendChild(node) { this.children.push(node); return node; }
  prepend(...nodes) { this.children.unshift(...nodes); } replaceChildren(...nodes) { this.children = [...nodes]; }
  addEventListener() {} play() { return Promise.resolve(); }
  get textContent() { return this._text + this.children.map(child => child.textContent ?? "").join(""); }
  set textContent(v) { this._text = String(v); }
}
const make = tag => new Node(tag);
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
let serial = 0;
const picture = (id, extra = {}) => { serial++; return createElement({ id: `el${serial}`, type: "image", x: 10, y: 10 * serial, width: 200, height: 200, z: serial, payload: { ...createImagePayload(id), ...extra } }); };
function threeStages() {
  const doc = createDocument({ stageCount: 3 });
  doc.stages[0].elements.push(picture(A));
  doc.stages[2].elements.push(picture(B), picture(A));   // A is on stage 1 too: loaded with the Intro
  doc.stages[1].background = createImageBackground(C);
  doc.stages[2].elements.push(picture(V, { media: "video" }));
  return doc;
}

test("F7-A pictureStages: element pictures and stage backgrounds by stage; the whole-Wall background counts as stage 1; videos are not pictures", () => {
  const doc = threeStages();
  doc.background = createImageBackground(B);
  const map = pictureStages(doc);
  assert.deepEqual([...map.get(A)].sort(), [0, 2]);
  assert.deepEqual([...map.get(B)].sort(), [0, 2], "the Wall background is on every stage: stage 1");
  assert.deepEqual([...map.get(C)], [1]);
  assert.equal(map.has(V), false);
  assert.equal(pictureStages(null).size, 0);
});

test("F7-A the loader reads each later picture once, fills every frame, gives a failure the placeholder, and fills late frames at once", async () => {
  let reads = 0;
  const loader = createPictureLoader(async path => { reads++; if (path === "bad") throw new Error("403"); return `blob:https://x/${path}`; });
  loader.defer(B, "b.png", [2]); loader.defer(C, "bad", [1]);
  assert.equal(loader.whenPicture(A, () => {}), false, "not a later picture: the painter keeps its usual placeholder");
  const got = [];
  assert.equal(loader.whenPicture(B, url => got.push(["b1", url])), true);
  loader.whenPicture(B, url => got.push(["b2", url]));
  loader.whenPicture(C, url => got.push(["c", url]));
  assert.equal(loader.pending, 2);
  loader.requestStage(0); await tick();
  assert.equal(reads, 0, "nothing for a stage that has no later picture");
  loader.requestStage(2); loader.requestStage(2); await tick(); await tick();
  assert.equal(reads, 1);
  assert.deepEqual(got, [["b1", "blob:https://x/b.png"], ["b2", "blob:https://x/b.png"]]);
  loader.requestAll(); await tick(); await tick();
  assert.deepEqual(got.at(-1), ["c", null], "a failed read: the frame shows the placeholder");
  assert.equal(loader.pending, 0);
  const late = [];
  loader.whenPicture(B, url => late.push(url)); await tick();
  assert.deepEqual(late, ["blob:https://x/b.png"]);
});

test("F7-A preparePublicWall reads only stage-1 pictures now; later ones wait for their stage; assets outside the manifest are never read", async () => {
  const doc = threeStages(), reads = [];
  const api = { loadPublicWallPicture: async path => { reads.push(path); return `blob:https://x/${path}`; }, signPublicWallVideo: async () => null, getPublicIdentity: async () => null, getPublicMyGames: async () => ({ games: [] }), loadPublicAvatar: async () => null };
  const published = { document: doc, published_at: "p", assets: [
    { asset_id: A, storage_path: "u/a.png", mime_type: "image/png" }, { asset_id: B, storage_path: "u/b.png", mime_type: "image/png" }, { asset_id: C, storage_path: "u/c.png", mime_type: "image/png" }] };
  const ready = await preparePublicWall(published, "fixture", api, null);
  assert.deepEqual(reads, ["u/a.png"]);
  assert.equal(ready.assets.urlFor(A), "blob:https://x/u/a.png");
  assert.equal(ready.assets.urlFor(B), null);
  assert.equal(ready.pictureLoader.deferred, 2);
  const filled = [];
  assert.equal(ready.assets.whenPicture(B, url => filled.push(url)), true);
  ready.pictureLoader.requestStage(2); await tick(); await tick();
  assert.deepEqual(reads, ["u/a.png", "u/b.png"]);
  assert.deepEqual(filled, ["blob:https://x/u/b.png"]);
  // a document picture missing from the manifest is not a later picture and is never read
  const missing = await preparePublicWall({ ...published, assets: published.assets.filter(a => a.asset_id !== C) }, "fixture", api, null);
  assert.equal(missing.pictureLoader.deferred, 1);
  assert.equal(missing.assets.whenPicture(C, () => {}), false);
});

test("F7-A painter: a later picture keeps an empty frame and is filled in place; a later stage background goes under its overlay; editor / Preview resolvers are unchanged", () => {
  const doc = createDocument({ stageCount: 1 });
  doc.stages[0].elements.push(picture(B));
  doc.stages[0].background = { ...createImageBackground(C), overlay: { color: "#000000", opacity: 0.4 } };
  const fills = new Map();
  const assets = { urlFor: () => null, videoUrlFor: () => null, whenPicture: (id, fill) => { fills.set(id, fill); return true; } };
  const stage = paintDocument(doc, 400, make, { mode: "view", assets }).stages[0];
  assert.equal(all(stage, n => n.className === "wall-image-missing").length, 0, "no 'Image' placeholder while it loads");
  assert.equal(all(stage, n => n.tag === "img").length, 0);
  fills.get(B)("blob:https://x/b");
  fills.get(C)("blob:https://x/c");
  const imgs = all(stage, n => n.tag === "img").map(n => n.attrs.src ?? n.src);
  assert.equal(imgs.length, 2);
  const layer = all(stage, n => n.className === "wall-bg")[0];
  assert.equal(layer.children[0].tag === "img" || all(layer.children[0], n => n.tag === "img").length === 1, true, "the background picture is under the overlay");
  // a failed later picture shows the usual placeholder; a non-blob URL is never shown
  const again = paintDocument(doc, 400, make, { mode: "view", assets }).stages[0];
  fills.get(B)("https://evil.example/x.png");
  assert.equal(all(again, n => n.className === "wall-image-missing").length, 1);
  // a resolver without whenPicture (editor, Preview) shows the placeholder at once, exactly as before
  const editor = paintDocument(doc, 400, make, { mode: "edit", assets: { urlFor: () => null, videoUrlFor: () => null } }).stages[0];
  assert.equal(all(editor, n => n.className === "wall-image-missing").length, 1);
});

test("F7-A the visitor view observes painted stages with a one-viewport margin and falls back to loading everything", () => {
  const source = readFileSync(new URL("../dist/public/public-wall.js", import.meta.url), "utf8");
  assert.match(source, /new win\.IntersectionObserver\(entries => \{[\s\S]*loader\.requestStage\(stages\.indexOf\(entry\.target\)\)/);
  assert.match(source, /\{ rootMargin: "100% 0px", threshold: 0 \}/);
  assert.match(source, /if \(typeof win\.IntersectionObserver !== "function"\) \{ loader\.requestAll\(\); return; \}/);
  assert.match(source, /watchStages\(ready\.pictureLoader, painted\.stages\);/);
  assert.match(source, /const later = new Map\(\[\.\.\.pictureStages\(doc\)\]\.filter\(\(\[, stages\]\) => !stages\.has\(0\)\)\);/);
});
