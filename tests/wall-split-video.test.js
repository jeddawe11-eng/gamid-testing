// Split hardening + MP4 video backgrounds (TESTING): Remove Split is a clean inverse of Split, split pieces keep the source scale while they move / resize freely,
// and background videos are MP4-only, server-verified, streamed and painted as muted looping inline background media.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import { createImagePayload, validateImagePayload } from "../dist/wall-kit/image.js";
import { createVideoBackground } from "../dist/wall-kit/background.js";
import { createVideoPool, safeMediaUrl } from "../dist/wall-kit/video-background.js";
import { checkVideoFile, checkVideoMetadata } from "../dist/wall-kit/assets.js";
import { createAssetStore } from "../dist/wall-editor/assets.js";
import { inspectMp4, parseMoov, handleWallAssetRegister, WALL_VIDEO_LIMITS } from "../supabase/functions/_shared/wall-assets.js";
import * as ops from "../dist/wall-kit/ops.js";

const UUID = "3f2b8c1e-5a4d-4e7b-9c60-1d2e3f4a5b6c";
const GIF = "aaaaaaaa-0000-4000-8000-000000000002";
const VIDEO = "bbbbbbbb-0000-4000-8000-000000000003";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const text = path => read(path).toString("utf8");
const stageEls = (doc, i = 0) => doc.stages[i].elements;
const rect = (id, z) => createElement({ id, type: "rect", x: 0, y: 0, width: 40, height: 40, z, payload: { fill: "#000000" } });

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.listeners = {}; this.style = { setProperty: (n, v) => this.props.set(n, v) }; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  getAttribute(n) { return this.attrs[n] ?? null; }
  removeAttribute(n) { delete this.attrs[n]; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  play() { this.played = (this.played ?? 0) + 1; return Promise.resolve(); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
}
const make = tag => new Node(tag);
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const elNode = (stage, id) => all(stage, node => node.attrs["data-el"] === id)[0];
const frameOf = node => all(node, child => child.className === "wall-art-frame")[0];

// A fully styled artwork with non-default geometry, between two other layers - everything Remove Split must give back exactly.
const STYLED = { assetId: GIF, fit: "cover", posX: 30, posY: 70, opacity: 0.7, backdrop: "#223344", aw: 1200, ah: 800, alt: "Blade", radius: 24, mask: "hexagon", blend: "screen", clickThrough: true,
  crop: { x: 0.1, y: 0.05, w: 0.8, h: 0.9, preset: "free" }, effects: { shadow: { color: "#000000", blur: 20, x: 4, y: 8 }, glow: { color: "#62e7ff", blur: 30 }, brightness: 1.2, saturation: 1.5 } };
function styledDoc() {
  const doc = createDocument({ stageCount: 2 });
  doc.stages[0].elements = [rect("below", 0), createElement({ id: "art", type: "image", x: 137, y: 222, width: 555, height: 333, z: 1, payload: structuredClone(STYLED) }), rect("above", 2)];
  return doc;
}

// ---------- 1. Remove Split: a clean inverse ----------
for (const dir of ["v", "h"]) {
  test(`R1 Remove Split (${dir}) after uneven boundaries, ungroup, moved / resized pieces and a piece on another stage restores the exact pre-split artwork`, () => {
    const original = styledDoc();
    let doc = ops.splitArtwork(original, "art", 4, dir).doc;
    doc = ops.moveSplitBoundary(doc, "art", 0, 0.4).doc;
    doc = ops.moveSplitBoundary(doc, "art", 2, 0.9).doc;
    doc = ops.ungroupElements(doc, ["art"]).doc;
    const [, second, third, fourth] = ops.splitPieces(doc, "art").map(piece => piece.id);
    doc = ops.moveElements(doc, [second], 60, 90).doc;
    doc = ops.resizeElement(doc, third, "e", 40, 0).doc;
    doc = ops.updatePayload(doc, fourth, { effects: { blur: 6 } }).doc;
    doc = ops.moveElementsToStage(doc, [fourth], doc.stages[1].id).doc;
    const removed = ops.removeSplit(doc, second);
    assert.equal(removed.ok, true, JSON.stringify(removed.errors));
    const restored = removed.doc;
    const art = stageEls(restored).find(element => element.id === "art");
    assert.deepEqual([art.x, art.y, art.width, art.height, art.rotation, art.groupId], [137, 222, 555, 333, undefined, undefined], "exact pre-split geometry");
    assert.deepEqual(art.payload, STYLED, "every artwork property exactly as before - no split state left");
    assert.deepEqual(stageEls(restored).map(element => element.id), ["below", "art", "above"], "its layer slot");
    assert.equal(restored.stages.flatMap(stage => stage.elements).filter(element => element.payload?.slice).length, 0, "no piece left on ANY stage");
    assert.equal(validateDocument(restored).valid, true);
    assert.deepEqual(stageEls(restored), stageEls(original), "the stage is exactly as it was before Split");
    // ... and it can be split again at once
    const again = ops.splitArtwork(restored, "art", 3, dir === "v" ? "h" : "v");
    assert.equal(again.ok, true);
    assert.equal(stageEls(again.doc).filter(element => element.payload.slice).length, 3);
  });
}

test("R1 Equal pieces again = Remove Split + Split: the pieces return to the original's place in equal bands", () => {
  let doc = ops.splitArtwork(styledDoc(), "art", 4, "v").doc;
  doc = ops.moveElements(doc, ["art"], 100, 100).doc;
  const reset = ops.resetSplit(doc, "art");
  const pieces = ops.splitPieces(reset.doc, "art");
  assert.deepEqual(pieces.map(piece => [piece.x, piece.width]), [[137, 139], [276, 139], [415, 138], [553, 139]]);
  assert.ok(pieces.every(piece => piece.y === 222 && piece.height === 333));
});

test("R1 a split saved before this pass (no `src`) still removes cleanly and splits again", () => {
  const legacy = ops.splitArtwork(styledDoc(), "art", 2, "v").doc;
  for (const element of stageEls(legacy)) if (element.payload?.slice) { const { src, scale, ...rest } = element.payload.slice; element.payload.slice = rest; void src; void scale; }
  assert.equal(validateDocument(legacy).valid, true, "old pieces stay valid");
  const removed = ops.removeSplit(legacy, "art");
  const art = stageEls(removed.doc).find(element => element.id === "art");
  assert.deepEqual([art.x, art.y, art.width, art.height], [137, 222, 555, 333]);
  assert.equal(art.payload.slice, undefined);
  assert.equal(ops.splitArtwork(removed.doc, "art", 2).ok, true);
});

test("R1 the Properties panel rebuilds when split state changes, so the Split section returns to Pieces / Cut / Split at once", () => {
  const controls = text("dist/wall-editor/controls.js");
  assert.match(controls, /element\.payload\.slice\?\.set \?\? "-"/, "the rebuild key includes the split set");
  assert.match(controls, /text: "Split", onclick/);
});

// ---------- 2. Preserve source scale / free positioning ----------
const piecesDoc = () => ops.ungroupElements(ops.splitArtwork(styledDoc(), "art", 4, "v").doc, ["art"]).doc;
// where the picture is drawn on the Wall (canonical units): the piece's position + its frame's offset; and the frame's size
const drawn = (doc, id) => {
  const element = doc.stages.flatMap(stage => stage.elements).find(candidate => candidate.id === id);
  const stage = paintDocument(doc, 1000, make, { assets: { urlFor: () => "blob:x/a" } }).stages[doc.stages.findIndex(s => s.elements.includes(element))];
  const frame = frameOf(elNode(stage, id));
  // a piece made before this pass sizes its frame in % of its own box; a preserved-scale piece in units (px at scale 1)
  const n = key => { const value = frame.props.get(key); const number = parseFloat(value); return value.endsWith("%") ? number / 100 * (["left", "width"].includes(key) ? element.width : element.height) : number; };
  return { left: element.x + n("left"), top: element.y + n("top"), width: n("width"), height: n("height") };
};

test("S1 new splits preserve the source scale: moving a piece anywhere (gaps, past the original bounds) never rescales, stretches or re-crops it", () => {
  let doc = piecesDoc();
  const ids = ops.splitPieces(doc, "art").map(piece => piece.id);
  assert.ok(ops.splitPieces(doc, "art").every(piece => piece.payload.slice.scale.w === 555 && piece.payload.slice.scale.h === 333 && piece.payload.slice.src.x === 137));
  const before = ids.map(id => drawn(doc, id));
  // [1]   [2]      [3]   [4] - gaps between the pieces, the last one far past the original's right edge
  const gaps = [0, 40, 140, 200];
  ids.forEach((id, i) => { doc = ops.moveElements(doc, [id], gaps[i], i === 3 ? 300 : 0).doc; });
  ids.forEach((id, i) => {
    const after = drawn(doc, id);
    assert.equal(after.width, before[i].width, "same picture size");
    assert.equal(after.height, before[i].height);
    assert.equal(after.left - before[i].left, gaps[i], "the picture moved with its piece, nothing else changed");
  });
  assert.equal(validateDocument(doc).valid, true);
});

test("S1 resizing a piece shows more / less of the picture - the picture never zooms or stretches, and other pieces are untouched", () => {
  const doc = piecesDoc();
  const [first, second] = ops.splitPieces(doc, "art").map(piece => piece.id);
  const before = drawn(doc, second), other = drawn(doc, first);
  for (const [handle, dx, dy] of [["e", 60, 0], ["w", -50, 0], ["se", 30, 40], ["nw", 20, 25], ["sw", -10, 0]]) {
    const resized = ops.resizeElement(doc, second, handle, dx, dy);
    assert.equal(resized.ok, true, handle);
    const after = drawn(resized.doc, second);
    assert.deepEqual([after.width, after.height], [before.width, before.height], `${handle}: same picture scale`);
    assert.ok(Math.abs(after.left - before.left) < 0.6 && Math.abs(after.top - before.top) < 0.6, `${handle}: the picture stays where it was on the Wall`);
    assert.deepEqual(drawn(resized.doc, first), other, "another piece is untouched");
    assert.equal(validateDocument(resized.doc).valid, true);
  }
  const bigger = ops.resizeElement(doc, second, "e", 60, 0).doc;
  const piece = bigger.stages[0].elements.find(element => element.id === second);
  assert.ok(piece.payload.slice.to > ops.splitPieces(doc, "art")[1].payload.slice.to, "the window shows more of the artwork");
});

test("S1 group resize scales the whole split artwork on purpose; turning the lock off returns to stretch-with-the-box; old pieces can be locked without any visual jump", () => {
  const grouped = ops.splitArtwork(styledDoc(), "art", 2, "h").doc;
  const scaled = ops.resizeGroup(grouped, ["art"], "se", 111, 66);
  const factor = scaled.factor;
  assert.ok(factor > 1);
  assert.ok(ops.splitPieces(scaled.doc, "art").every(piece => Math.abs(piece.payload.slice.scale.w - 555 * factor) < 1));
  const off = ops.setSplitScaleLock(piecesDoc(), ["art"], false);
  assert.equal(off.doc.stages[0].elements.find(element => element.id === "art").payload.slice.scale, undefined);
  // a piece saved before this pass (no scale): turning the lock on keeps exactly what it shows now
  const legacy = piecesDoc();
  for (const element of stageEls(legacy)) if (element.payload?.slice) delete element.payload.slice.scale;
  const id = ops.splitPieces(legacy, "art")[2].id;
  const resizedLegacy = ops.resizeElement(legacy, id, "e", 50, 0).doc;   // old behaviour: the picture stretches with the box
  const stretchedWidth = drawn(resizedLegacy, id).width;
  const locked = ops.setSplitScaleLock(resizedLegacy, [id], true).doc;
  assert.ok(Math.abs(drawn(locked, id).width - stretchedWidth) < 0.01, "no visual jump when the lock is turned on");
  assert.ok(Math.abs(drawn(ops.resizeElement(locked, id, "e", 40, 0).doc, id).width - stretchedWidth) < 0.01, "from then on, resizing no longer rescales");
});

test("S1 split field validation: src / scale / cross are typed and bounded; nothing else is accepted", () => {
  const base = { set: "s", dir: "v", from: 0, to: 0.5 };
  const ok = slice => validateImagePayload(createImagePayload(UUID, { slice })).length === 0;
  assert.equal(ok({ ...base, src: { x: 1, y: 2, w: 3, h: 4 }, scale: { w: 555, h: 333 }, cross: -0.25 }), true);
  for (const bad of [{ src: { x: 1, y: 2, w: 0, h: 4 } }, { src: { x: 1, y: 2, w: 3 } }, { src: { x: 1, y: 2, w: 3, h: 4, r: 0 } }, { scale: { w: 30000, h: 1 } }, { scale: "2x" }, { cross: 1.5 }, { zoom: 2 }]) {
    assert.equal(ok({ ...base, ...bad }), false, JSON.stringify(bad));
  }
});

// ---------- 3. MP4 background: server-side inspection ----------
const rangeReader = bytes => { const reads = []; return { reads, read: async (offset, length) => { reads.push([offset, length]); return new Uint8Array(bytes.subarray(offset, offset + length)); } }; };
test("V1 the server recognises a real H.264 MP4 from its boxes (moov first or last), reading only headers + moov", async () => {
  for (const name of ["h264-faststart.mp4", "h264-moov-at-end.mp4"]) {
    const bytes = read(`tests/fixtures/mp4/${name}`);
    const reader = rangeReader(bytes);
    const found = await inspectMp4(reader.read, bytes.length);
    assert.deepEqual([found.ok, found.mime, found.codec, found.width, found.height], [true, "video/mp4", "avc1", 64, 36], name);
  }
});
test("V1 anything that is not a browser-safe H.264 MP4 is refused with a typed reason", async () => {
  // (HEVC is recognised as a CONVERSION candidate since the transcoding pass - tests/wall-video-transcode.test.js; the Edge Function refuses it unless conversion is on)
  const cases = { "mpeg4-part2.mp4": "VIDEO_CODEC_UNSUPPORTED", "audio-only.mp4": "INVALID_VIDEO", "quicktime.mov": "UNSUPPORTED_VIDEO_TYPE" };
  for (const [name, code] of Object.entries(cases)) {
    const bytes = read(`tests/fixtures/mp4/${name}`);
    assert.equal((await inspectMp4(rangeReader(bytes).read, bytes.length)).code, code, name);
  }
  const png = read("dist/assets/social-card-1200x630.png");
  assert.equal((await inspectMp4(rangeReader(png).read, png.length)).code, "UNSUPPORTED_VIDEO_TYPE", "an image renamed .mp4");
  const good = read("tests/fixtures/mp4/h264-faststart.mp4");
  assert.equal((await inspectMp4(rangeReader(good).read, Math.floor(good.length / 2))).ok, false, "a truncated upload");
  assert.equal(parseMoov(new Uint8Array([0, 0, 0, 99, 116, 114, 97, 107])).code, "INVALID_VIDEO", "malformed box sizes");
});

// the Edge Function's mp4 path, against a stand-in storage that honours Range
function fakeBackend(bytes, { total = bytes.length } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? "GET", range: options.headers?.Range ?? null });
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }), { status: 200 });
    if (url.includes("/rpc/register_verified_wall_asset")) { const body = JSON.parse(options.body); return new Response(JSON.stringify([{ asset_id: VIDEO, storage_path: body.candidate_path, mime_type: body.candidate_mime, byte_size: body.candidate_bytes, width: body.candidate_width, height: body.candidate_height }]), { status: 200 }); }
    if (options.method === "DELETE") return new Response("{}", { status: 200 });
    const match = /bytes=(\d+)-(\d+)/.exec(options.headers?.Range ?? "");
    const [from, to] = match ? [Number(match[1]), Math.min(Number(match[2]), bytes.length - 1)] : [0, bytes.length - 1];
    return new Response(bytes.subarray(from, to + 1), { status: 206, headers: { "content-range": `bytes ${from}-${to}/${total}` } });
  };
  return { calls, fetchImpl };
}
const registerRequest = path => new Request("https://x/functions/v1/wall-asset-register", { method: "POST", headers: { origin: "https://gamid-testing-static.gamid.workers.dev", authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ path }) });
const env = { supabaseUrl: "https://project.supabase.co", anonKey: "anon", serviceKey: "service" };
const VIDEO_PATH = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.mp4";

test("V1 the Edge Function registers an MP4 from the wall-video bucket using range reads only, and deletes a refused file", async () => {
  const good = read("tests/fixtures/mp4/h264-moov-at-end.mp4");
  const ok = fakeBackend(good);
  const response = await handleWallAssetRegister({ request: registerRequest(VIDEO_PATH), env, fetchImpl: ok.fetchImpl });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual([body.asset.mime_type, body.asset.width, body.asset.height, body.asset.byte_size], ["video/mp4", 64, 36, good.length]);
  const storage = ok.calls.filter(call => call.url.includes("/storage/v1/object/"));
  assert.ok(storage.every(call => call.url.includes("/object/wall-video/") && call.range), "only ranged reads of the wall-video object");
  const bad = fakeBackend(read("tests/fixtures/mp4/hevc.mp4"));
  const refused = await handleWallAssetRegister({ request: registerRequest(VIDEO_PATH), env, fetchImpl: bad.fetchImpl });
  assert.deepEqual([refused.status, (await refused.json()).error], [400, "VIDEO_CODEC_UNSUPPORTED"]);
  assert.ok(bad.calls.some(call => call.method === "DELETE" && call.url.includes("/object/wall-video/")), "the refused file is deleted");
  const huge = fakeBackend(good, { total: WALL_VIDEO_LIMITS.maxBytes + 1 });
  const tooBig = await handleWallAssetRegister({ request: registerRequest(VIDEO_PATH), env, fetchImpl: huge.fetchImpl });
  assert.equal((await tooBig.json()).error, "VIDEO_TOO_LARGE");
  const elsewhere = await handleWallAssetRegister({ request: registerRequest("99999999-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.mp4"), env, fetchImpl: ok.fetchImpl });
  assert.equal(elsewhere.status, 400, "only the caller's own folder");
});

// ---------- 4. MP4 background: document, painter, playback ----------
test("V2 a video background is a typed background (the image background's fields); the painter draws a muted, looping, inline, control-less, tap-free cover video", () => {
  const doc = createDocument({ stageCount: 2 });
  doc.background = createVideoBackground(VIDEO);
  doc.stages[1].background = createVideoBackground(VIDEO, { fit: "contain", posY: 20, opacity: 0.8 });
  assert.equal(validateDocument(doc).valid, true);
  const videos = createVideoPool();
  const painted = paintDocument(doc, 400, make, { mode: "view", assets: { videoUrlFor: () => "https://project.supabase.co/storage/v1/object/sign/wall-video/a.mp4?token=t" }, videos });
  const [wall, own] = painted.stages.map(stage => all(stage, node => node.tag === "video")[0]);
  for (const name of ["muted", "autoplay", "loop", "playsinline", "disablepictureinpicture"]) assert.equal(wall.attrs[name], "", name);
  assert.equal(wall.attrs.controls, undefined);
  assert.equal(wall.muted, true);
  assert.equal(wall.props.get("object-fit"), "cover");
  assert.equal(wall.props.get("pointer-events"), "none");
  assert.equal(own.props.get("object-fit"), "contain");
  assert.equal(own.props.get("object-position"), "50% 20%");
  const layer = all(painted.stages[0], node => node.className === "wall-bg")[0];
  assert.equal(layer.props.get("z-index"), "0", "behind every element");
  assert.equal(layer.props.get("pointer-events"), "none");
  for (const unsafe of ["javascript:alert(1)", "http://evil.example/v.mp4", "data:video/mp4;base64,AAAA", "//evil.example/v.mp4", ""]) {
    const stage = paintDocument(doc, 400, make, { assets: { videoUrlFor: () => unsafe } }).stages[0];
    assert.equal(all(stage, node => node.tag === "video").length, 0, unsafe);
  }
  assert.equal(safeMediaUrl("blob:https://x/1"), "blob:https://x/1");
});

test("V2 the editor's repaint reuses the SAME video element (no restart); Whole Wall stages in one Preview share one family and timeline", () => {
  const doc = createDocument({ stageCount: 3 });
  doc.background = createVideoBackground(VIDEO);
  const videos = createVideoPool();
  const ctx = { assets: { videoUrlFor: () => "https://project.supabase.co/v.mp4" }, videos };
  const first = all(paintDocument(doc, 400, make, ctx).stages[0], node => node.tag === "video")[0];
  return Promise.resolve().then(() => {
    const again = all(paintDocument(doc, 400, make, ctx).stages[0], node => node.tag === "video")[0];
    assert.equal(again, first, "a repaint hands back the playing element");
  }).then(() => {
    const preview = createVideoPool();
    const stages = paintDocument(doc, 400, make, { ...ctx, videos: preview }).stages.map(stage => all(stage, node => node.tag === "video")[0]);
    assert.equal(new Set(stages).size, 3, "one element per stage in a stacked Preview");
    assert.ok(stages.slice(1).every(video => video.listeners.loadedmetadata?.length), "later stages join the first one's clock");
    const stageOwn = createDocument({ stageCount: 2 });
    stageOwn.stages[0].background = createVideoBackground(VIDEO);
    const painted = paintDocument(stageOwn, 400, make, { ...ctx, videos: createVideoPool() }).stages;
    assert.equal(all(painted[1], node => node.tag === "video").length, 0, "This stage only: another stage keeps its own background");
  });
});

// (Video media layers task: MP4 AND WebM are accepted - WebM by explicit request, for alpha transparency - and videos are offered in Assets as media layers.
// Everything else this test pinned still holds: other types refused, 50 MB / 4096 px, streamed never downloaded, image BACKGROUNDS list pictures only.)
test("V3 upload rules: MP4 or WebM only, at most 50 MB and 4096 px; videos stream (never downloaded whole) and are never offered as a picture", async () => {
  assert.equal(checkVideoFile({ type: "video/mp4", size: 50 * 1024 * 1024 }).ok, true);
  assert.equal(checkVideoFile({ type: "video/webm", size: 50 * 1024 * 1024 }).ok, true);
  assert.equal(checkVideoFile({ type: "video/mp4", size: 50 * 1024 * 1024 + 1 }).code, "VIDEO_TOO_LARGE");
  assert.equal(checkVideoFile({ type: "video/webm", size: 50 * 1024 * 1024 + 1 }).code, "VIDEO_TOO_LARGE");
  for (const type of ["video/quicktime", "video/x-matroska", "image/gif", ""]) assert.equal(checkVideoFile({ type, size: 10 }).code, "INVALID_VIDEO_TYPE", type);
  assert.equal(checkVideoMetadata({ width: 3840, height: 2160, duration: 8 }).ok, true);
  assert.equal(checkVideoMetadata({ width: 7680, height: 4320, duration: 8 }).ok, false);
  const loads = [], signs = [];
  const api = {
    listWallAssets: async () => [{ asset_id: UUID, storage_path: "u/a.png", mime_type: "image/png", width: 10, height: 10, byte_size: 10 }, { asset_id: VIDEO, storage_path: "u/b.mp4", mime_type: "video/mp4", width: 1920, height: 1080, byte_size: 4_000_000 }],
    loadWallAsset: async path => { loads.push(path); return `blob:x/${path}`; },
    signWallVideo: async path => { signs.push(path); return `https://project.supabase.co/storage/v1/object/sign/wall-video/${path}?token=t`; },
  };
  const store = createAssetStore({ api, userId: "u" });
  await store.refresh();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(loads, ["u/a.png"], "a video is never fetched as a blob");
  assert.deepEqual(signs, ["u/b.mp4"]);
  assert.deepEqual(store.images.map(asset => asset.asset_id), [UUID]);
  assert.deepEqual(store.videos.map(asset => asset.asset_id), [VIDEO]);
  assert.match(store.videoUrlFor(VIDEO), /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/sign\/wall-video\//);
  const tools = text("dist/wall-editor/tools.js");
  assert.match(tools, /for \(const asset of assets\.images\)/, "image backgrounds list pictures only");
  const client = text("dist/account/supabase-client.js");
  assert.match(client, /bucketName: "wall-video"/, "resumable upload into the private wall-video bucket");
  assert.match(client, /relative\.startsWith\(`\/object\/sign\/\$\{bucket\}\/`\)/, "only a signed address of the owner's own wall-video object is used");
});

test("V4 the database mirror: video background kind, wall-video bucket + RLS, MP4 registry limits, and kind-checked saves", () => {
  const sql = text("supabase/migrations/20260929100000_wall_split_video_background.sql").replace(/--.*$/gm, "");
  assert.match(sql, /elsif kind in \('image', 'video'\)/);
  assert.match(sql, /values \('wall-video', 'wall-video', false, 52428800, array\['video\/mp4'\]\)/);
  for (const policy of ["for insert to authenticated", "for select to authenticated", "for delete to authenticated"]) assert.ok(sql.includes(policy), policy);
  assert.match(sql, /WALL_VIDEO_LIMIT/);
  assert.match(sql, /WALL_ASSET_KIND_MISMATCH/);
  assert.doesNotMatch(sql, /public = true|to anon|grant .* to (anon|public)/i, "nothing becomes public");
});
