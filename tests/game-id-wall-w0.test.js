// GAME ID WALL - W0 risk prototype: deterministic behaviour that the prototype relies on, plus static isolation checks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import * as M from "../dist/prototypes/game-id-wall-w0/js/model.js";
import { createSampleWall } from "../dist/prototypes/game-id-wall-w0/js/sample.js";

const ROOT = new URL("../dist/prototypes/game-id-wall-w0/", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");
const listFiles = async (dir, out = []) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) await listFiles(target, out); else out.push(target);
  }
  return out;
};

const text = (value, extra = {}) => M.sanitizeText({ text: value, ...extra });
const image = () => ({ type: "image", asset: "photo", alt: "x", opacity: 1 });
const yt = (extra = {}) => ({ type: "embed", provider: "youtube", kind: "video", id: "aqz-KE-bpKQ", aspect: "16:9", variant: "standard", ...extra });
const sp = (extra = {}) => ({ type: "embed", provider: "spotify", kind: "playlist", id: "37i9dQZF1DXcBWIGoYBM5M", aspect: "16:9", variant: "standard", ...extra });
const add = (doc, stage, content, x, y, w, h) => M.addNode(doc, stage, content, { x, y, w, h });

// ------------------------------------------------------------------------------------------------ coordinates
test("1000-unit coordinates convert to CSS pixels and back at every supported column width", () => {
  for (const col of [360, 390, 412, 560, 640, 720, 768, 1024]) {
    assert.equal(M.unitsToPx(1000, col), col);
    assert.ok(Math.abs(M.pxToUnits(M.unitsToPx(437.5, col), col) - 437.5) < 1e-9);
    assert.ok(Math.abs(M.stageHeightPx(col) - (col * 16) / 9) < 0.5, "a stage is 9:16 at any width");
  }
  assert.equal(M.STAGE_H, 1778);
  assert.equal(M.wallHeightUnits(3), 3 * 1778);
});

test("wall y and stage-local y round-trip and every stage has the same height (no gap)", () => {
  for (let stage = 0; stage < 3; stage++) {
    const wall = M.wallY(stage, 100);
    assert.deepEqual(M.stageOfWallY(wall), { index: stage, y: 100 });
  }
  assert.equal(M.wallY(1, 0), M.STAGE_H, "stage 2 begins exactly where stage 1 ends");
  assert.equal(M.clampStageIndex(9, 3), 2);
  assert.equal(M.clampStageIndex(-4, 3), 0);
  assert.equal(M.clampStageIndex(Number.NaN, 3), 0);
});

// ------------------------------------------------------------------------------------------------ containment
test("hard containment: moves are clamped so the whole box stays inside its stage", () => {
  const box = { x: 100, y: 100, w: 300, h: 200 };
  assert.deepEqual(M.clampMove(box, -500, -500), { dx: -100, dy: -100 });
  assert.deepEqual(M.clampMove(box, 5000, 5000), { dx: 1000 - 400, dy: M.STAGE_H - 300 });
  assert.deepEqual(M.clampMove(box, 20, -30), { dx: 20, dy: -30 });
  assert.ok(M.insideStage({ x: 0, y: 0, w: 1000, h: M.STAGE_H }));
  assert.ok(!M.insideStage({ x: 0, y: 0, w: 1000.5, h: 10 }));
});

test("resize is limited so a scaled node stays inside the stage", () => {
  const box = { x: 700, y: 1500, w: 200, h: 100 }, anchor = { x: 700, y: 1500 };
  const f = M.fitFactorWithinStage(box, anchor, 10);
  const scaled = { x: 700, y: 1500, w: 200 * f, h: 100 * f };
  assert.ok(M.insideStage(scaled));
  assert.ok(f < 10 && f > 1);
});

// ------------------------------------------------------------------------------------------------ stage-local z-order + move to stage
test("z-order is stage-local and forward/back/front/back-most only reorder inside one stage", () => {
  const doc = M.createDoc();
  const a = add(doc, 0, text("A"), 0, 0, 100, 100), b = add(doc, 0, text("B"), 0, 0, 100, 100), c = add(doc, 0, text("C"), 0, 0, 100, 100);
  const other = add(doc, 1, text("O"), 0, 0, 100, 100);
  M.bringForward(doc, 0, [a]);
  assert.deepEqual(doc.stages[0].children, [b, a, c]);
  M.sendBackward(doc, 0, [c]);
  assert.deepEqual(doc.stages[0].children, [b, c, a]);
  M.bringToFront(doc, 0, [b]);
  assert.deepEqual(doc.stages[0].children, [c, a, b]);
  M.sendToBack(doc, 0, [b]);
  assert.deepEqual(doc.stages[0].children, [b, c, a]);
  assert.deepEqual(doc.stages[1].children, [other], "another stage is never touched");
  assert.deepEqual(M.validateDoc(doc), []);
});

test("Move to Stage moves an element to exactly one stage and it never straddles a boundary", () => {
  const doc = M.createDoc();
  const a = add(doc, 0, text("A"), 900, 1700, 90, 70);
  assert.deepEqual(M.moveToStage(doc, 0, [a], 1).moved, [a]);
  assert.ok(!doc.stages[0].children.includes(a));
  assert.ok(doc.stages[1].children.includes(a));
  assert.equal(doc.stages.filter(s => s.children.includes(a)).length, 1);
  assert.deepEqual(M.validateDoc(doc), []);
  assert.equal(M.moveToStage(doc, 1, [a], 1).error, "INVALID_TARGET_STAGE");
  assert.equal(M.moveToStage(doc, 1, [a], 7).error, "INVALID_TARGET_STAGE");
});

test("stage switching keeps each stage's own content and order independent", () => {
  const doc = createSampleWall();
  const before = doc.stages.map(s => s.children.slice());
  const target = doc.stages[0].children[1];
  M.bringToFront(doc, 0, [target]);
  assert.deepEqual(doc.stages[1].children, before[1]);
  assert.deepEqual(doc.stages[2].children, before[2]);
  assert.equal(doc.stages[0].children.at(-1), target);
});

// ------------------------------------------------------------------------------------------------ groups
test("group / ungroup preserves positions and sizes, keeps stage-local z-order and forbids nesting", () => {
  const doc = M.createDoc();
  const a = add(doc, 0, text("A", { size: 100 }), 100, 200, 300, 120), b = add(doc, 0, image(), 250, 260, 400, 225), c = add(doc, 0, text("C"), 0, 0, 50, 50);
  const originals = [a, b].map(id => ({ id, ...M.geoOf(doc, id) }));
  const { groupId } = M.groupNodes(doc, 0, [a, b]);
  assert.deepEqual(doc.stages[0].children, [groupId, c], "the group takes the z-slot of its top-most member");
  assert.equal(doc.nodes[groupId].type, "group");
  assert.deepEqual(M.nodeBox(doc, groupId), { x: 100, y: 200, w: 550, h: 285 });
  assert.equal(M.validateDoc(doc).length, 0);
  assert.equal(M.groupNodes(doc, 0, [groupId, c]).error, "NESTED_GROUPS_NOT_IN_W0");
  assert.equal(M.groupNodes(doc, 0, [c]).error, "NEED_TWO_ELEMENTS");
  M.ungroupNode(doc, 0, groupId);
  for (const o of originals) assert.deepEqual({ id: o.id, ...M.geoOf(doc, o.id) }, o);
  assert.equal(doc.nodes[groupId], undefined);
  assert.deepEqual(M.validateDoc(doc), []);
});

test("scaling a group then ungrouping bakes the scale into geometry and text size", () => {
  const doc = M.createDoc();
  const a = add(doc, 0, text("A", { size: 100, glow: { color: "#ffffff", radius: 20 } }), 100, 100, 400, 120), b = add(doc, 0, image(), 100, 300, 400, 225);
  const { groupId } = M.groupNodes(doc, 0, [a, b]);
  const anchor = { x: 100, y: 100 };
  const start = { ...M.geoOf(doc, groupId) };
  const result = M.scaledNode(doc.nodes[groupId], start, 1.5, anchor);
  doc.layouts[M.LAYOUT][groupId] = result.geo;
  assert.equal(M.nodeBox(doc, groupId).w, 600);
  M.ungroupNode(doc, 0, groupId);
  assert.equal(M.geoOf(doc, a).w, 600);
  assert.equal(doc.nodes[a].size, 150, "text size takes on the group's scale");
  assert.equal(doc.nodes[a].glow.radius, 30);
  assert.ok(Math.abs(M.geoOf(doc, b).h - 337.5) < 1e-9);
});

test("resizing from the START snapshot is never cumulative", () => {
  const node = text("A", { size: 100 }), geo = { x: 100, y: 100, w: 400, h: 100 }, anchor = { x: 100, y: 100 };
  const a = M.scaledNode(node, geo, 2, anchor), b = M.scaledNode(node, geo, 2, anchor);
  assert.deepEqual(a, b);
  assert.equal(a.geo.w, 800);
  assert.equal(a.content.size, 200);
  assert.equal(node.size, 100, "the snapshot is not mutated");
});

test("blocks are indivisible: a group may hold one but the block itself has no children", () => {
  const doc = M.createDoc();
  const block = add(doc, 0, { type: "block", block: "league.rank", variant: "standard" }, 100, 100, 560, 230);
  assert.equal(doc.nodes[block].children, undefined);
  assert.deepEqual(M.validateDoc(doc), []);
});

// ------------------------------------------------------------------------------------------------ embeds
test("YouTube inline-versus-tile classification follows the documented 200x200 minimum", () => {
  assert.equal(M.classifyEmbedPx("youtube", 360, 202.5).mode, "inline", "full-width 16:9 on the narrowest phone is still inline");
  assert.equal(M.classifyEmbedPx("youtube", 300, 169).mode, "overlay", "16:9 at 300 px wide is only 169 px tall");
  assert.equal(M.classifyEmbedPx("youtube", 199, 400).mode, "overlay");
  assert.equal(M.classifyEmbedPx("youtube", 200, 200).mode, "inline");
  assert.equal(M.classifyEmbedPx("youtube", 113, 63).mode, "overlay");
  assert.match(M.classifyEmbedPx("youtube", 130, 73).reason, /larger in-page player/, "a tile above 120x70 stays a valid tile that opens the overlay");
  assert.ok(Math.abs(M.youtubeInlineMinUnits(360, 16 / 9) - 987.65) < 0.1);
  assert.ok(M.youtubeInlineMinUnits(640, 16 / 9) < 560);
});

test("the smallest allowed embed tile is derived from the narrowest column, so it is never below the provider's tile minimum", () => {
  const min = M.embedMinWidthUnits(yt());
  assert.ok(M.unitsToPx(min, M.MIN_COLUMN_PX) >= 120 - 1e-6);
  assert.ok(M.unitsToPx(min, M.MIN_COLUMN_PX) / (16 / 9) >= 70 - 1e-6);
});

test("Spotify has no invented provider minimum: only a tap-target floor", () => {
  assert.equal(M.EMBED.spotify.labFloorPx, 44);
  assert.equal(M.classifyEmbedPx("spotify", 300, 80).mode, "inline");
  assert.equal(M.classifyEmbedPx("spotify", 40, 152).mode, "overlay");
  assert.ok(M.embedAspect(sp({ variant: "free" })) === null, "free variant has no aspect lock");
});

test("embed overlap invariant: nothing stays in front of an embed, things behind are fine", () => {
  const doc = M.createDoc();
  const behind = add(doc, 0, text("behind"), 100, 100, 600, 200);
  const embed = add(doc, 0, yt(), 100, 100, 800, 450);
  const front = add(doc, 0, text("front"), 300, 300, 400, 200);
  assert.deepEqual(M.findEmbedViolations(doc, 0), [{ embed, over: front }], "only what is in FRONT is a violation");
  const moves = M.enforceEmbedOverlap(doc, 0);
  assert.equal(moves.length, 1);
  assert.deepEqual(M.findEmbedViolations(doc, 0), []);
  assert.deepEqual(doc.stages[0].children, [behind, front, embed]);
  assert.deepEqual(M.validateDoc(doc), []);
});

test("embed overlap invariant also holds through groups (the whole group is compared at stage level)", () => {
  const doc = M.createDoc();
  const a = add(doc, 0, text("a"), 100, 100, 200, 100), b = add(doc, 0, image(), 100, 250, 200, 100);
  const { groupId } = M.groupNodes(doc, 0, [a, b]);
  const embed = add(doc, 0, yt(), 50, 50, 500, 300);
  const front = add(doc, 0, text("front"), 120, 120, 200, 80);
  assert.ok(M.findEmbedViolations(doc, 0).some(v => v.embed === embed && v.over === front));
  M.enforceEmbedOverlap(doc, 0);
  assert.deepEqual(M.findEmbedViolations(doc, 0), []);
  assert.ok(doc.stages[0].children.indexOf(embed) > doc.stages[0].children.indexOf(front));
  assert.ok(doc.nodes[groupId]);
});

test("two embeds may not overlap each other", () => {
  const doc = M.createDoc();
  const a = add(doc, 0, yt(), 0, 0, 500, 281), b = add(doc, 0, sp(), 400, 100, 500, 450);
  assert.deepEqual(M.findEmbedEmbedOverlaps(doc, 0), [[a, b]]);
  assert.ok(M.validateDoc(doc).includes("EMBED_EMBED_OVERLAP:stage1"));
  M.geoOf(doc, b).x = 600; M.geoOf(doc, b).y = 400;
  assert.deepEqual(M.findEmbedEmbedOverlaps(doc, 0), []);
});

test("embed nodes reject anything but a validated provider, kind and resource id", () => {
  const doc = M.createDoc();
  add(doc, 0, yt({ id: "not valid!!!" }), 0, 0, 500, 281);
  add(doc, 0, sp({ kind: "artist" }), 0, 600, 500, 400);
  const errors = M.validateDoc(doc);
  assert.ok(errors.some(e => e.startsWith("EMBED_ID")));
  assert.ok(errors.some(e => e.startsWith("EMBED_KIND")));
});

// ------------------------------------------------------------------------------------------------ facade / active player state
test("at most one active player per provider; opening a second of the same provider deactivates the first", () => {
  const players = new M.ActivePlayers();
  assert.equal(M.facadeState(players, "youtube", "n1"), "facade");
  assert.equal(players.activate("youtube", "n1"), null);
  assert.equal(M.facadeState(players, "youtube", "n1"), "active");
  assert.equal(players.activate("spotify", "n2"), null, "one YouTube and one Spotify may be active together");
  assert.equal(players.count(), 2);
  assert.equal(players.activate("youtube", "n3"), "n1", "the previous YouTube player must be closed");
  assert.equal(M.facadeState(players, "youtube", "n1"), "facade");
  players.deactivate("youtube", "n3");
  assert.equal(players.count(), 1);
  assert.equal(players.activate("spotify", "n2"), null, "re-activating the same player is not a swap");
});

// ------------------------------------------------------------------------------------------------ history
test("undo / redo restore exact snapshots and a new edit discards the redo branch", () => {
  const history = new M.History("a");
  assert.ok(!history.canUndo && !history.canRedo);
  assert.equal(history.commit("a"), false, "identical snapshot is not a new step");
  history.commit("b"); history.commit("c");
  assert.equal(history.undo(), "b");
  assert.equal(history.undo(), "a");
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), "b");
  history.commit("x");
  assert.ok(!history.canRedo);
  assert.equal(history.undo(), "b");
});

// ------------------------------------------------------------------------------------------------ text limits + the sample document
test("text is sanitized: bounded styling only, no arbitrary CSS, no invisible or control characters", () => {
  const clean = M.sanitizeText({ text: "Hi" + String.fromCharCode(0x202e, 0x200b, 0) + " there", font: "comic sans", size: 9999, color: "red; background:url(x)", gradient: { a: "#ffffff", b: "expression(1)" }, glow: { color: "#38e3ff", radius: 999 }, outline: { color: "url(x)", width: 5 } });
  assert.equal(clean.text, "Hi there");
  assert.equal(clean.font, "orbitron");
  assert.equal(clean.size, 420);
  assert.equal(clean.color, "#ffffff");
  assert.equal(clean.gradient, null);
  assert.equal(clean.glow.radius, 60);
  assert.equal(clean.outline, null);
  assert.equal(M.sanitizeText({ text: "x".repeat(900) }).text.length, 500);
});

test("the built-in sample Wall is valid: 3 stages, stage-local content, nothing outside a stage, no embed violations", () => {
  const doc = createSampleWall();
  assert.equal(doc.stages.length, 3);
  assert.deepEqual(M.validateDoc(doc), []);
  assert.ok(doc.stages.every(s => s.children.length > 0));
  assert.equal(doc.stages[2].background.mode, "own", "stage 3 demonstrates the per-stage background override");
  assert.equal(doc.stages[0].background.mode, "inherit");
  assert.ok(Object.values(doc.nodes).some(n => n.type === "group"), "contains a real group");
  assert.ok(Object.values(doc.nodes).some(n => n.type === "block"));
  assert.equal(Object.values(doc.nodes).filter(n => n.type === "embed" && n.provider === "youtube").length, 2, "a large and a small YouTube");
  assert.ok(Object.values(doc.nodes).some(n => n.type === "embed" && n.provider === "spotify"));
  const json = JSON.stringify(doc);
  assert.ok(!/px|https?:|<|javascript:/i.test(json), "the document holds units and ids, never pixels, URLs or markup");
});

test("the sample leaves room below the large YouTube for the Close player control that sits outside the player box", () => {
  const doc = createSampleWall();
  const flat = M.flattenStage(doc, 1), video = flat.find(e => doc.nodes[e.id].type === "embed" && doc.nodes[e.id].provider === "youtube");
  const bottom = video.box.y + video.box.h;
  for (const other of flat) {
    if (other.id === video.id || other.box.y < bottom) continue;
    if (other.box.x < video.box.x + video.box.w && other.box.x + other.box.w > video.box.x) assert.ok(other.box.y - bottom >= 120, `${other.id} starts too close under the player`);
  }
});

test("a doc round-trips through JSON without losing geometry (stage-local units are plain numbers)", () => {
  const doc = createSampleWall();
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc);
});

// ------------------------------------------------------------------------------------------------ static isolation checks
test("W0 is isolated: no backend, no auth, no network access, no dynamic markup, no inline styles", async () => {
  const files = (await listFiles(ROOT)).filter(f => /\.(js|html|css)$/.test(f.pathname));
  assert.ok(files.length >= 14);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const name = file.pathname.split("/").pop();
    assert.ok(!/supabase|service_role|access_token|STEAM_WEB_API_KEY|discord\.com|steamcommunity|localStorage\.setItem\([^)]*profile/i.test(source), `${name} must not reference backend or connection code`);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(source), `${name} must not make network requests`);
    assert.ok(!/\.innerHTML\s*=|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new Function/.test(source), `${name} must not build markup from strings`);
    if (name.endsWith(".html")) {
      assert.ok(!/\sstyle\s*=|<style|onclick=|onload=/i.test(source), `${name} has no inline style or event attributes`);
      assert.ok(/http-equiv="Content-Security-Policy"/.test(source), `${name} carries a strict meta CSP`);
      assert.ok(/noindex/.test(source), `${name} is noindex`);
      assert.ok(!/<script(?![^>]*\bsrc=)/i.test(source), `${name} has no inline script`);
    }
    if (name.endsWith(".js")) assert.ok(!/setAttribute\(\s*["']style["']|\.cssText\s*=/.test(source), `${name} must not write style attributes`);
  }
});

test("W0 iframes only ever come from constants plus a validated id, and use the privacy-enhanced YouTube host", async () => {
  const embeds = await read("js/embeds.js");
  assert.match(embeds, /www\.youtube-nocookie\.com\/embed\//);
  assert.match(embeds, /open\.spotify\.com\/embed\//);
  assert.ok(!/youtube\.com\/embed/.test(embeds.replace(/youtube-nocookie\.com/g, "")), "never the regular youtube.com embed host");
  assert.match(embeds, /strict-origin-when-cross-origin/);
  assert.ok(!/no-referrer/.test(embeds), "YouTube needs a Referer, so referrer must not be disabled globally");
  assert.ok(!/preconnect|dns-prefetch|prefetch|i\.ytimg\.com|img\.youtube\.com|scdn\.co/.test((await read("js/render.js")) + embeds), "facades never request provider thumbnails and there is no preconnect");
  for (const page of ["editor.html", "wall-view.html", "embed-lab.html"]) {
    const html = await read(page);
    assert.ok(!/preconnect|dns-prefetch/.test(html), `${page}: no provider preconnect`);
    assert.match(html, /frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/open\.spotify\.com/);
    assert.match(html, /connect-src 'none'/);
  }
});

test("W0 pages are clearly labelled as a throwaway prototype and the Intro is labelled as a simulation", async () => {
  const hub = await read("index.html"), editor = await read("editor.html"), intro = await read("js/intro-sim.js");
  assert.match(hub, /W0 RISK PROTOTYPE/);
  assert.match(editor, /TEST \/ NOT SAVED/);
  assert.match(intro, /SIMULATED INTRO/);
  assert.match(intro, /not the real Intro/i);
  const render = await read("js/render.js");
  assert.match(render, /SAMPLE DATA/);
});

test("W0 is not linked from the real product and the deploy workflow is unchanged in shape", async () => {
  const landing = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const profile = await readFile(new URL("../dist/public/public.js", import.meta.url), "utf8");
  const account = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
  for (const source of [landing, profile, account]) assert.ok(!/game-id-wall-w0/.test(source));
  const workflow = await readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
  assert.ok(!/prototypes/.test(workflow));
});
