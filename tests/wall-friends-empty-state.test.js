// Wall Stages V2 - the empty Friends Stage message (Mazen's UX addition 2026-10-23; DEC-0011). A Friends Stage the owner created that shows no approved sticker
// carries a display-only message: visitor wording on the public Wall, owner wording in the owner's own editor and Preview. Never on a My Stage, never part of the
// Wall Document, its layers, assets or storage. The browser checks (desktop / phone, owner / visitor, switching, reload) are scratchpad E2E scripts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { renderDocument } from "../dist/wall/render.js";
import { isEmptyFriendsStage } from "../dist/wall/stage-types.js";
import * as ops from "../dist/wall-kit/ops.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import { FRIENDS_EMPTY_COPY, paintFriendsEmptyState } from "../dist/wall-kit/friends-stage.js";
import { applyTemplate } from "../dist/wall-kit/templates/apply.js";
import { TEMPLATES } from "../dist/wall-kit/templates/catalog.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
// a minimal DOM node: tag, class, text, attributes, children
const node = tag => {
  const attrs = new Map(), children = [];
  return { tag, attrs, children, text: "", style: { setProperty() {} }, setAttribute(name, value) { attrs.set(name, String(value)); }, append(...items) { children.push(...items); }, appendChild(item) { children.push(item); return item; },
    set className(value) { attrs.set("class", value); }, get className() { return attrs.get("class") ?? ""; }, set textContent(value) { this.text = value; } };
};
const all = (root, out = []) => { out.push(root); for (const child of root.children ?? []) if (child && typeof child === "object") all(child, out); return out; };
const overlaysIn = stage => all(stage).filter(n => n.className === "wall-friends-empty");
const textOf = root => all(root).map(n => n.text).filter(Boolean).join(" | ");
const withTypes = (...types) => { const doc = createDocument({ stageCount: types.length }); types.forEach((type, index) => { if (type === "friends") doc.stages[index].type = "friends"; }); return doc; };
const paint = (doc, ctx = {}) => paintDocument(doc, 360, node, ctx).stages;
const rect = id => createElement({ id, type: "rect", x: 10, y: 10, width: 100, height: 100, payload: { fill: "#aabbcc" } });

test("1. 3 My / 0 Friends: no Friends Stage message anywhere", () => {
  assert.deepEqual(paint(withTypes("my", "my", "my")).map(stage => overlaysIn(stage).length), [0, 0, 0]);
});

test("2. 2 My / 1 Friends: the message only on the Friends Stage", () => {
  assert.deepEqual(paint(withTypes("my", "friends", "my")).map(stage => overlaysIn(stage).length), [0, 1, 0]);
});

test("3. 1 My / 2 Friends: each Friends Stage has its own message, exactly one each", () => {
  const stages = paint(withTypes("friends", "my", "friends"));
  assert.deepEqual(stages.map(stage => overlaysIn(stage).length), [1, 0, 1]);
  assert.notEqual(overlaysIn(stages[0])[0], overlaysIn(stages[2])[0], "two independent messages");
});

test("4. an empty My Stage never shows the Friends message (a Wall is never given a Friends Stage)", () => {
  const empty = createDocument();
  assert.deepEqual(paint(empty).map(stage => overlaysIn(stage).length), [0]);
  assert.equal(isEmptyFriendsStage(empty.stages[0]), false);
  // new stages are My Stages: Add stage never creates or converts one
  const added = ops.addStage(empty, { limit: 3 }).doc;
  assert.deepEqual(added.stages.map(stage => stage.type ?? "my"), ["my", "my"]);
  assert.deepEqual(paint(added).map(stage => overlaysIn(stage).length), [0, 0]);
});

test("5. visitor wording: the default everywhere (the public Wall paints without an audience)", () => {
  const [overlay] = overlaysIn(paint(withTypes("my", "friends"))[1]);
  assert.equal(overlay.attrs.get("data-audience"), "visitor");
  const text = textOf(overlay);
  for (const part of ["Friends Stage", "Good friends leave their mark! ✨", "“This stage is waiting for a little love from friends like you.”", "Stickers coming soon"]) assert.ok(text.includes(part), part);
  assert.doesNotMatch(text, /your squad|Your Friends Stage/i, "no owner wording for visitors");
  assert.deepEqual(FRIENDS_EMPTY_COPY.visitor, { eyebrow: "Friends Stage", title: "Good friends leave their mark! ✨", line: "“This stage is waiting for a little love from friends like you.”", badge: "Stickers coming soon" });
  // anything that is not exactly "owner" gets the visitor wording
  for (const audience of [undefined, "visitor", "OWNER", "admin", true]) assert.equal(paintFriendsEmptyState(node, audience).attrs.get("data-audience"), "visitor", String(audience));
});

test("6. owner wording: only where the owner's editor paints (audience owner)", () => {
  const [overlay] = overlaysIn(paint(withTypes("my", "friends"), { audience: "owner" })[1]);
  assert.equal(overlay.attrs.get("data-audience"), "owner");
  const text = textOf(overlay);
  for (const part of ["Your Friends Stage", "Waiting for your squad! 🎮", "“Your friends will leave their mark here. Every sticker will tell a story.”", "Friends stickers · Coming soon"]) assert.ok(text.includes(part), part);
  assert.match(overlay.attrs.get("aria-label"), /^Your Friends Stage\. Waiting for your squad! 🎮/);
  // the editor (canvas + Preview) is the only painter that passes it; the public Wall never does
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /getPaintContext: \(\) => \(\{ assets: assetStore, gamid: gamidSnapshot, posters, videos: canvasVideos, artwork: gameArtwork, audience: "owner" \}\)/);
  assert.match(editor, /videos: previewVideos, artwork: gameArtwork, audience: "owner" \}\);/);
  assert.doesNotMatch(read("dist/public/public-wall.js") + read("dist/crew/crew-wall.js"), /audience/, "visitor pages never claim the owner audience");
});

test("9. a Friends Stage with visible approved stickers (the future system's count) shows no message", () => {
  const doc = withTypes("my", "friends");
  assert.equal(overlaysIn(paint(doc, { stickerCount: () => 2 })[1]).length, 0);
  assert.equal(overlaysIn(paint(doc, { stickerCount: () => 0 })[1]).length, 1);
  assert.equal(isEmptyFriendsStage(doc.stages[1], 3), false);
  assert.equal(isEmptyFriendsStage(doc.stages[1]), true, "with no sticker system, a Friends Stage has none");
});

test("10. display only: the document, its layers, assets, validity, templates and backgrounds are untouched; nothing in it is interactive", () => {
  const doc = withTypes("my", "friends");
  doc.background = { kind: "color", color: "#ff0000" };
  const before = JSON.stringify(doc);
  const stages = paint(doc, { audience: "owner" });
  assert.equal(JSON.stringify(doc), before, "painting never changes the Wall");
  assert.equal(validateDocument(doc).valid, true);
  assert.deepEqual(renderDocument(doc, { viewportWidth: 360 }).stages[1].elements, [], "not a render element");
  assert.deepEqual(ops.layerList(doc.stages[1]), [], "not a layer");
  assert.equal(ops.assetsInUse(doc).size, 0, "not an asset");
  const overlay = overlaysIn(stages[1])[0];
  assert.ok(!all(overlay).some(n => /wall-el/.test(n.className)), "never a Wall element node");
  assert.ok(!all(overlay).some(n => ["button", "a", "input", "form"].includes(n.tag) || n.attrs.has("data-wall-interactive")), "nothing to click, no sticker submission");
  assert.equal(stages[1].children.length, 1, "no background layer, only the message");
  // templates still never land on a Friends Stage; a whole-Wall template yields My Stages only (no message)
  assert.equal(applyTemplate(doc, TEMPLATES[0], { scope: "stage", stageId: "stage_2", confirmed: true }).ok, false);
  const replaced = applyTemplate(doc, TEMPLATES[0], { scope: "wall", confirmed: true }).doc;
  assert.equal(paint(replaced).flatMap(overlaysIn).length, 0);
  // the message is CSS-only: no network, no image, no asset file
  const module = read("dist/wall-kit/friends-stage.js"), css = read("dist/wall-kit/wall-kit.css");
  assert.doesNotMatch(module.replace(/\/\/.*$/gm, ""), /fetch\(|url\(|src|createElementNS|innerHTML|sticker(s)?\.(add|submit|send)/i);
  const block = css.slice(css.indexOf("/* Wall Stages V2 (DEC-0011, 2026-10-23)"));
  assert.match(block, /\.wall-friends-empty \{ position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; padding: 7cqw; pointer-events: none; \}/);
  assert.doesNotMatch(block, /url\(/, "no external asset");
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{ \.wall-friends-empty-icon \{ animation: none; \} \}/);
  // the editor's old canvas note is gone (one message, never two)
  assert.doesNotMatch(read("dist/wall-editor/index.html"), /friendsStageNote/);
});
