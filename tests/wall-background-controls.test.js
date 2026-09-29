// Wall BACKGROUND controls (TESTING): image and video backgrounds share Fit / Position / Opacity / Darken and gain Flip horizontal / Flip vertical (a CSS mirror of
// the drawn media, persisted as flipX / flipY - the file is never changed); background assets can be deleted from the Background panel only when unused, after an
// explicit confirmation. Normal canvas elements are untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { paintDocument, backgroundFlip } from "../dist/wall-kit/paint.js";
import { createImageBackground, createVideoBackground } from "../dist/wall-kit/background.js";
import { createImagePayload } from "../dist/wall-kit/image.js";
import { createVideoPool } from "../dist/wall-kit/video-background.js";
import * as ops from "../dist/wall-kit/ops.js";

const IMG = "3f2b8c1e-5a4d-4e7b-9c60-1d2e3f4a5b6c", VID = "bbbbbbbb-0000-4000-8000-000000000003", OTHER = "aaaaaaaa-0000-4000-8000-000000000001";
const text = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this.style = { setProperty: (n, v) => this.props.set(n, v) }; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  addEventListener() {}
  play() { return Promise.resolve(); }
  get textContent() { return this.children.map(child => child.textContent ?? "").join(""); }
  set textContent(_) {}
}
const make = tag => new Node(tag);
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const assets = { urlFor: () => "blob:https://x/img", videoUrlFor: () => "https://project.supabase.co/storage/v1/object/sign/wall-video/v.mp4?token=t" };
const media = stage => all(stage, node => node.tag === "img" || node.tag === "video")[0];

test("B1 flipX / flipY are optional typed booleans on image AND video backgrounds, on the Whole Wall and on a stage; anything else is refused", () => {
  const doc = createDocument({ stageCount: 2 });
  doc.background = createImageBackground(IMG, { flipX: true, flipY: true });
  doc.stages[1].background = createVideoBackground(VID, { flipY: true });
  assert.equal(validateDocument(doc).valid, true);
  const old = createDocument(); old.background = createImageBackground(IMG);
  assert.equal(validateDocument(old).valid, true, "a background saved before (no flip keys) is unchanged and valid");
  for (const bad of ["yes", 1, 0, [], "scaleX(-1)"]) {
    const d = createDocument(); d.background = createImageBackground(IMG, { flipX: bad });
    assert.deepEqual(validateDocument(d).errors, ["BACKGROUND:INVALID_FLIP:wall"], String(bad));
  }
  const video = createDocument(); video.stages[0].background = createVideoBackground(VID, { flipY: "true" });
  assert.deepEqual(validateDocument(video).errors, [`BACKGROUND:INVALID_FLIP:${video.stages[0].id}`]);
});

test("B2 the flip mirrors only the drawn media - image and video alike - and survives the round trip through the saved document", () => {
  assert.equal(backgroundFlip({}), "none");
  assert.equal(backgroundFlip({ flipX: true }), "scale(-1, 1)");
  assert.equal(backgroundFlip({ flipY: true }), "scale(1, -1)");
  assert.equal(backgroundFlip({ flipX: true, flipY: true }), "scale(-1, -1)");
  const doc = createDocument({ stageCount: 2 });
  doc.background = createImageBackground(IMG, { flipY: true, opacity: 0.6, fit: "contain", posX: 20, posY: 80 });
  doc.stages[1].background = createVideoBackground(VID, { flipX: true, opacity: 0.4 });
  const saved = JSON.parse(JSON.stringify(doc));   // Save -> Reload is the stored JSON
  const [wallStage, videoStage] = paintDocument(saved, 400, make, { mode: "view", assets, videos: createVideoPool() }).stages;
  const img = media(wallStage), video = media(videoStage);
  assert.equal(img.tag, "img");
  assert.equal(img.props.get("transform"), "scale(1, -1)", "Whole Wall image flipped vertically (legs at the top)");
  assert.deepEqual([img.props.get("object-fit"), img.props.get("object-position"), img.props.get("opacity")], ["contain", "20% 80%", "0.6"], "Fit, Position and Opacity unchanged");
  assert.equal(video.tag, "video");
  assert.deepEqual([video.props.get("transform"), video.props.get("opacity")], ["scale(-1, 1)", "0.4"], "stage video: flip + opacity");
  const layer = all(videoStage, node => node.className === "wall-bg")[0];
  assert.equal(layer.props.get("transform"), undefined, "the layer itself (and so the stage) is not flipped - only the media");
});

test("B3 a pooled background video re-applies its flip on every paint (turning a flip OFF really removes it), and Darken sits above the media unflipped", () => {
  const videos = createVideoPool();
  const doc = createDocument();
  doc.background = createVideoBackground(VID, { flipX: true, overlay: { color: "#000000", opacity: 0.35 } });
  const first = media(paintDocument(doc, 400, make, { assets, videos }).stages[0]);
  assert.equal(first.props.get("transform"), "scale(-1, 1)");
  const layer = all(paintDocument(doc, 400, make, { assets, videos }).stages[0], node => node.className === "wall-bg")[0];
  const overlay = layer.children.at(-1);
  assert.deepEqual([overlay.props.get("background"), overlay.props.get("opacity"), overlay.props.get("transform")], ["#000000", "0.35", undefined]);
  return Promise.resolve().then(() => {
    const unflipped = createDocument(); unflipped.background = createVideoBackground(VID);
    const again = media(paintDocument(unflipped, 400, make, { assets, videos }).stages[0]);
    assert.equal(again, first, "the same playing element");
    assert.equal(again.props.get("transform"), "none");
  });
});

test("B4 normal canvas pictures are untouched: an image ELEMENT never gets a flip from the background", () => {
  const doc = createDocument();
  doc.background = createImageBackground(IMG, { flipX: true });
  doc.stages[0].elements = [createElement({ id: "pic", type: "image", x: 0, y: 0, width: 200, height: 200, z: 0, payload: createImagePayload(OTHER) })];
  const stage = paintDocument(doc, 400, make, { assets }).stages[0];
  const element = all(stage, node => node.attrs["data-el"] === "pic")[0];
  assert.equal(all(element, node => node.tag === "img")[0].props.get("transform"), undefined);
  assert.equal(validateDocument({ ...doc, stages: [{ ...doc.stages[0], elements: [{ ...doc.stages[0].elements[0], payload: { ...doc.stages[0].elements[0].payload, flipX: true } }] }] }).valid, true, "(image elements keep their own schema - flipX there is ignored data, not a new control)");
});

test("B5 safe deletion: the Background panel knows exactly where an asset is used and never offers Delete for it", () => {
  const doc = createDocument({ stageCount: 3 });
  doc.background = createVideoBackground(VID);
  doc.stages[1].background = createImageBackground(IMG, { flipY: true });
  doc.stages[2].elements = [createElement({ id: "a", type: "image", x: 0, y: 0, width: 100, height: 100, z: 0, payload: createImagePayload(IMG) }), createElement({ id: "b", type: "image", x: 200, y: 0, width: 100, height: 100, z: 1, payload: createImagePayload(IMG) })];
  assert.deepEqual(ops.assetUsage(doc, VID), ["Whole Wall background"]);
  assert.deepEqual(ops.assetUsage(doc, IMG), ["Stage 2 background", "2 images on Stage 3"]);
  assert.deepEqual(ops.assetUsage(doc, OTHER), [], "unused -> deletable (after confirmation)");
  const tools = text("dist/wall-editor/tools.js");
  assert.match(tools, /const usage = ops\.assetUsage\(doc\(\), asset\.asset_id\);\s*if \(usage\.length\) return h\("div", \{ class: "ed-asset-inuse"/, "in use: no Delete, the places are listed");
  assert.match(tools, /Delete this \$\{noun\} permanently\?/, "an explicit confirmation step");
  assert.match(tools, /text: "Delete permanently", onclick: async \(\) => \{\s*const result = await assets\.remove\(asset\.asset_id, doc\(\)\);/, "only the confirm button deletes, through the checked store");
  assert.match(tools, /result\.code === "WALL_ASSET_IN_USE" \? `This \$\{noun\} is still used by your saved Wall/, "the database's refusal (saved Wall still uses it) is explained");
  assert.equal((tools.match(/deleteControls\(asset, "(image|video)"\)/g) ?? []).length, 2, "offered for background images and background videos only");
  const assetsPanel = tools.slice(tools.indexOf("// ---- Assets ---"));
  assert.doesNotMatch(assetsPanel, /deleteControls/, "the normal Assets panel is unchanged by this task");
  assert.match(text("dist/wall-editor/assets.js"), /if \(doc && assetsInUse\(doc\)\.has\(assetId\)\) return \{ ok: false, code: "WALL_ASSET_IN_USE"/, "the store refuses an in-use asset too");
});

test("B7 Remove background clears only the chosen scope's assignment, never the asset; the upload then becomes deletable", () => {
  const doc = createDocument({ stageCount: 2 });
  doc.background = createImageBackground(IMG, { flipY: true });
  doc.stages[1].background = createVideoBackground(VID, { opacity: 0.4 });
  const stage2 = doc.stages[1].id;
  const noStage = ops.setBackground(doc, stage2, null).doc;
  assert.equal(noStage.stages[1].background, undefined, "the stage override is gone - the stage falls back to the Whole Wall background");
  assert.deepEqual(noStage.background, doc.background, "the Whole Wall background is untouched");
  assert.equal(validateDocument(noStage).valid, true);
  assert.deepEqual(ops.assetUsage(noStage, VID), [], "the video is no longer used anywhere -> its Delete is offered");
  const [fallback] = paintDocument(JSON.parse(JSON.stringify(noStage)), 400, make, { assets, videos: createVideoPool() }).stages.slice(1);
  assert.equal(media(fallback).tag, "img", "after Save -> Reload the stage paints the Whole Wall image");
  const noWall = ops.setBackground(doc, "wall", null).doc;
  assert.equal(noWall.background, undefined);
  assert.deepEqual(noWall.stages[1].background, doc.stages[1].background, "the stage override is untouched");
  assert.deepEqual(ops.assetUsage(noWall, IMG), []);
  const tools = text("dist/wall-editor/tools.js");
  assert.match(tools, /text: "Remove background",[\s\S]{0,200}onclick: \(\) => \{ pendingDelete = null; deleteStatus = ""; setBg\(null\); \}/, "Remove only clears the assignment (no assets.remove)");
  assert.match(tools, /if \(!bg && \(assets\.images\.length \|\| assets\.videos\.length\)\)/, "with no background the uploads (and their Delete) stay reachable");
});

test("B6 the Background panel offers the SAME controls for image and video (Fit, Position X / Y, Opacity, Darken, Flip horizontal / vertical)", () => {
  const tools = text("dist/wall-editor/tools.js");
  const shared = tools.slice(tools.indexOf('if (bg?.kind === "image" || bg?.kind === "video") {'), tools.indexOf('const note = $("bgNote");'));
  for (const label of ['"Fit"', '"Position X %"', '"Position Y %"', '"Opacity %"', '"Darken"', '"Flip horizontal", "flipX"', '"Flip vertical", "flipY"']) assert.ok(shared.includes(label), label);
  // browser-found bug: sliders do not rebuild the panel, so a handler that spread the `bg` captured at build time wrote back stale values (Darken reset Opacity)
  const panel = tools.slice(tools.indexOf("const live = () => currentBackground() ?? bg;"), tools.indexOf('const note = $("bgNote");'));
  assert.doesNotMatch(panel, /\{ \.\.\.bg[,.]/, "every background control writes onto the CURRENT background");
  assert.match(panel, /setBg\(toggle\.checked \? \{ \.\.\.live\(\), overlay: \{ color: "#000000", opacity: 0\.35 \} \} : \{ \.\.\.live\(\), overlay: undefined \}\)/, "Darken keeps Opacity / Position / Flip");
  const sql = text("supabase/migrations/20260930120000_wall_background_flip.sql").replace(/--.*$/gm, "");
  assert.match(sql, /INVALID_FLIP/);
  assert.doesNotMatch(sql, /\b(drop|alter|delete|update|insert)\b/i, "the migration only replaces the validator function");
});
