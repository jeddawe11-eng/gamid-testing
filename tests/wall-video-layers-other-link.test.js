// MP4 + WebM media layers (Assets) and the "Other" text link (Media & Links) - GamID TESTING.
//   Media layers: an uploaded video is an ordinary artwork element with media:"video" - every artwork control applies (move / resize / rotate / opacity / mask / effects /
//   blend / crop / lock / layers) plus the new Flip H / V and left / right edge Fade (pictures and GIFs get them too). It plays muted, looping, inline; a WebM keeps its
//   alpha (nothing opaque is drawn behind it unless the owner picks a backing colour); an MP4 is never claimed to be transparent. A video is never split.
//   Other: a text element whose words are the link; on the Wall (view mode) it is a real <a target="_blank" rel="noopener noreferrer">; only plain http(s) addresses.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { renderDocument } from "../dist/wall/render.js";
import { paintDocument, paintStage, artworkFade, artworkFlip } from "../dist/wall-kit/paint.js";
import { createImagePayload, isVideoMedia } from "../dist/wall-kit/image.js";
import { createTextPayload, isSafeLinkUrl } from "../dist/wall-kit/text.js";
import { normalizeLinkInput } from "../dist/wall-kit/links.js";
import { createVideoPool } from "../dist/wall-kit/video-background.js";
import { checkVideoFile, isVideoAsset, isVideoFileType } from "../dist/wall-kit/assets.js";
import { createAssetStore } from "../dist/wall-editor/assets.js";
import { detectEmbed } from "../dist/wall-kit/embed/engine.js";
import { INTERACTIVE_ATTR } from "../dist/wall-kit/interaction.js";
import { inspectWebm, parseWebmTracks, handleWallAssetRegister } from "../supabase/functions/_shared/wall-assets.js";
import * as ops from "../dist/wall-kit/ops.js";
import "../dist/wall-kit/register.js";

const PICTURE = "3f2b8c1e-5a4d-4e7b-9c60-1d2e3f4a5b6c", GIF = "aaaaaaaa-0000-4000-8000-000000000002";
const MP4 = "bbbbbbbb-0000-4000-8000-000000000003", WEBM = "bbbbbbbb-0000-4000-8000-000000000004";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const text = path => read(path).toString("utf8");

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.style = { setProperty: (n, v) => this.props.set(n, v) }; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  getAttribute(n) { return this.attrs[n] ?? null; }
  removeAttribute(n) { delete this.attrs[n]; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  addEventListener() {}
  play() { this.played = (this.played ?? 0) + 1; return Promise.resolve(); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
}
const make = tag => new Node(tag);
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const elNode = (stage, id) => all(stage, node => node.attrs["data-el"] === id)[0];
const media = node => all(node, child => child.tag === "img" || child.tag === "video")[0];
const frameOf = node => all(node, child => child.className === "wall-art-frame")[0];
const assets = {
  urlFor: id => (id === PICTURE || id === GIF ? `blob:https://x/${id}` : null),
  videoUrlFor: id => (id === MP4 || id === WEBM ? `https://project.supabase.co/storage/v1/object/sign/wall-video/u/${id}?token=t` : null),
};
const layer = (id, assetId, over = {}, geometry = {}) => createElement({ id, type: "image", x: 100, y: 100, width: 480, height: 270, z: 0, payload: createImagePayload(assetId, { aw: 1920, ah: 1080, ...over }), ...geometry });
const docWith = (...elements) => { const doc = createDocument({ stageCount: 2 }); doc.stages[0].elements = elements.map((element, z) => ({ ...element, z })); return doc; };
const paint = (doc, ctx = {}) => paintDocument(doc, 1000, make, { assets, videos: createVideoPool(), ...ctx }).stages;

// ---------- 1. MP4 ----------
test("M1 an MP4 asset added from Assets is a video layer: muted, looping, inline, autoplay, streamed from the owner's signed address, proportions kept", () => {
  const asset = { asset_id: MP4, mime_type: "video/mp4", width: 1920, height: 1080, byte_size: 4_000_000 };
  assert.equal(isVideoAsset(asset), true);
  const doc = ok(ops.addCustomElement(docWith(), docWith().stages[0].id, { type: "image", payload: createImagePayload(MP4, { aw: 1920, ah: 1080, media: "video" }), width: 640, height: 360 }));
  const element = doc.stages[0].elements[0];
  assert.equal(isVideoMedia(element.payload), true);
  // the video's aspect ratio is never distorted: it starts at its own proportions, and like a picture it FILLS its box ("cover" crops, never stretches) - the box
  // can be reshaped exactly like an image layer's; only the owner's explicit "Stretch" fit would distort it
  assert.deepEqual([element.payload.fit, element.payload.aw, element.payload.ah], ["cover", 1920, 1080]);
  assert.equal(element.width / element.height, 16 / 9, "added at the video's own proportions");
  assert.equal(ops.lockedAspect({ ...element, payload: { ...element.payload, fit: "contain" } }), 1920 / 1080, "Show whole video: the box keeps the video's proportions, like a picture");
  const node = elNode(paint(doc)[0], element.id);
  const video = media(node);
  assert.equal(video.tag, "video");
  assert.equal(node.attrs["data-media"], "video");
  for (const flag of ["muted", "loop", "autoplay", "playsinline"]) assert.ok(flag in video.attrs, flag);
  assert.ok(!("controls" in video.attrs), "no controls");
  assert.match(video.attrs.src, /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/sign\/wall-video\//);
  assert.equal(video.props.get("pointer-events"), "none", "never a tap target");
  assert.deepEqual([video.props.get("object-fit"), video.props.get("object-position"), video.props.get("width"), video.props.get("height")], ["cover", "50% 50%", "100%", "100%"]);
});
function ok(result) { assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(validateDocument(result.doc).valid, true, JSON.stringify(validateDocument(result.doc).errors)); return result.doc; }

test("M2 editing never restarts a video layer: the pool hands the same playing element to every repaint, with every style re-set", () => {
  const videos = createVideoPool();
  const doc = docWith(layer("v", MP4, { media: "video", crop: { x: 0.2, y: 0, w: 0.6, h: 1, preset: "free" } }));
  const first = media(elNode(paintDocument(doc, 1000, make, { assets, videos }).stages[0], "v"));
  assert.equal(first.props.get("position"), "absolute", "cropped");
  return Promise.resolve().then(() => {
    const uncropped = docWith(layer("v", MP4, { media: "video" }, { x: 300 }));
    const again = media(elNode(paintDocument(uncropped, 1000, make, { assets, videos }).stages[0], "v"));
    assert.equal(again, first, "the same element (keeps playing)");
    assert.deepEqual([again.props.get("position"), again.props.get("left"), again.props.get("width"), again.props.get("transform")], ["static", "auto", "100%", "none"], "no crop / flip left over from the earlier look");
  });
});

// ---------- 2. WebM (alpha) ----------
test("W1 a WebM layer plays the same way; with the default transparent backing nothing opaque is drawn behind it, so its alpha shows what is beneath", () => {
  const doc = docWith(createElement({ id: "under", type: "rect", x: 0, y: 0, width: 1000, height: 1000, z: 0, payload: { fill: "#ff0000" } }), layer("w", WEBM, { media: "video" }));
  const stage = paint(doc)[0];
  const node = elNode(stage, "w"), video = media(node);
  assert.equal(video.tag, "video");
  assert.match(video.attrs.src, new RegExp(WEBM));
  assert.equal(frameOf(node).props.get("background"), undefined, "backdrop none: the frame is transparent");
  assert.equal(video.props.get("background"), undefined, "the video element itself paints no background");
  assert.equal(node.props.get("background"), undefined);
  assert.ok(Number(elNode(stage, "w").props.get("z-index")) > Number(elNode(stage, "under").props.get("z-index")), "above the red layer, which shows through its alpha");
  // a backing colour is the owner's explicit choice (it would fill the transparent parts)
  const backed = elNode(paint(docWith(layer("w", WEBM, { media: "video", backdrop: "#112233" })))[0], "w");
  assert.equal(frameOf(backed).props.get("background"), "#112233");
});

test("W2 the server reads a real WebM (VP9 with alpha, VP9, VP8) from its EBML header + Tracks only, and reports the alpha channel", async () => {
  const cases = { "vp9-alpha.webm": ["V_VP9", true], "vp9.webm": ["V_VP9", false], "vp8.webm": ["V_VP8", false] };
  for (const [name, [codec, alpha]] of Object.entries(cases)) {
    const bytes = read(`tests/fixtures/webm/${name}`);
    const reads = [];
    const found = await inspectWebm(async (offset, length) => { reads.push(length); return new Uint8Array(bytes.subarray(offset, offset + length)); }, bytes.length);
    assert.deepEqual([found.ok, found.mime, found.codec, found.width, found.height, found.alpha], [true, "video/webm", codec, 64, 36, alpha], name);
    assert.ok(reads.reduce((sum, n) => sum + n, 0) < bytes.length, `${name}: never read whole`);
  }
});

test("W3 anything that is not a VP8 / VP9 WebM is refused with a typed reason", async () => {
  const reader = bytes => async (offset, length) => new Uint8Array(bytes.subarray(offset, offset + length));
  const mkv = read("tests/fixtures/webm/vp9-matroska.mkv");
  assert.equal((await inspectWebm(reader(mkv), mkv.length)).code, "UNSUPPORTED_VIDEO_TYPE", "Matroska is not WebM");
  const mp4 = read("tests/fixtures/mp4/h264-faststart.mp4");
  assert.equal((await inspectWebm(reader(mp4), mp4.length)).code, "UNSUPPORTED_VIDEO_TYPE", "an MP4 renamed .webm");
  const good = read("tests/fixtures/webm/vp9-alpha.webm");
  assert.equal((await inspectWebm(reader(good), Math.floor(good.length / 2))).code, "INVALID_VIDEO", "a truncated upload");
  // a TrackEntry: TrackType 1 (video), CodecID V_AV1, Video { PixelWidth 64, PixelHeight 36 }
  const av1 = new Uint8Array([0xae, 0x94, 0x83, 0x81, 0x01, 0x86, 0x85, ...Buffer.from("V_AV1"), 0xe0, 0x88, 0xb0, 0x82, 0x00, 0x40, 0xba, 0x82, 0x00, 0x24]);
  assert.equal(parseWebmTracks(av1).code, "WEBM_CODEC_UNSUPPORTED");
  assert.equal(parseWebmTracks(new Uint8Array([0xae, 0x85, 0x83, 0x81, 0x02, 0x86, 0x80])).code, "INVALID_VIDEO", "an audio-only file has no picture");
});

test("W4 the Edge Function registers a .webm from wall-video as video/webm (range reads only) and deletes a refused one", async () => {
  const USER = "11111111-1111-4111-8111-111111111111";
  const backend = bytes => {
    const calls = [];
    return { calls, fetchImpl: async (url, options = {}) => {
      calls.push({ url, method: options.method ?? "GET", range: options.headers?.Range ?? null, body: options.body ?? null });
      if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: USER }), { status: 200 });
      if (url.includes("/rpc/register_verified_wall_asset")) { const body = JSON.parse(options.body); return new Response(JSON.stringify([{ asset_id: WEBM, storage_path: body.candidate_path, mime_type: body.candidate_mime, byte_size: body.candidate_bytes, width: body.candidate_width, height: body.candidate_height }]), { status: 200 }); }
      if (options.method === "DELETE") return new Response("{}", { status: 200 });
      const match = /bytes=(\d+)-(\d+)/.exec(options.headers?.Range ?? "");
      const [from, to] = match ? [Number(match[1]), Math.min(Number(match[2]), bytes.length - 1)] : [0, bytes.length - 1];
      return new Response(bytes.subarray(from, to + 1), { status: 206, headers: { "content-range": `bytes ${from}-${to}/${bytes.length}` } });
    } };
  };
  const request = path => new Request("https://x/functions/v1/wall-asset-register", { method: "POST", headers: { origin: "https://gamid-testing-static.gamid.workers.dev", authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ path }) });
  const env = { supabaseUrl: "https://project.supabase.co", anonKey: "anon", serviceKey: "service" };
  const path = `${USER}/22222222-2222-4222-8222-222222222222.webm`;
  const good = backend(read("tests/fixtures/webm/vp9-alpha.webm"));
  const response = await handleWallAssetRegister({ request: request(path), env, fetchImpl: good.fetchImpl });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual([body.asset.mime_type, body.asset.width, body.asset.height, body.alpha], ["video/webm", 64, 36, true]);
  assert.ok(good.calls.filter(call => call.url.includes("/storage/v1/object/")).every(call => call.url.includes("/object/wall-video/") && call.range), "only ranged reads of the wall-video object");
  assert.equal(JSON.parse(good.calls.find(call => call.url.includes("/rpc/register_verified_wall_asset")).body).candidate_frames, null);
  const bad = backend(read("tests/fixtures/webm/vp9-matroska.mkv"));
  const refused = await handleWallAssetRegister({ request: request(path), env, fetchImpl: bad.fetchImpl });
  assert.deepEqual([refused.status, (await refused.json()).error], [400, "UNSUPPORTED_VIDEO_TYPE"]);
  assert.ok(bad.calls.some(call => call.method === "DELETE" && call.url.includes("/object/wall-video/")), "the refused file is deleted");
});

test("W5 the browser side: MP4 and WebM are the video types; a WebM goes up to its own .webm path in wall-video; other types stay refused", async () => {
  assert.deepEqual(["video/mp4", "video/webm", "video/quicktime", "image/gif"].map(isVideoFileType), [true, true, false, false]);
  assert.equal(checkVideoFile({ type: "video/webm", size: 10 }).ok, true);
  assert.equal(isVideoAsset({ mime_type: "video/webm" }), true);
  assert.equal(isVideoAsset({ mime_type: "image/gif" }), false, "a GIF stays a picture");
  const uploads = [];
  const store = createAssetStore({ api: { uploadWallVideo: async (file, user) => { uploads.push([file.type, user]); return { asset_id: WEBM, mime_type: "video/webm", width: 64, height: 36, byte_size: 1811 }; }, signWallVideo: async () => "https://x/sign" }, userId: "u", decodeVideoFile: async () => ({ width: 64, height: 36, duration: 1 }) });
  const result = await store.uploadVideo({ type: "video/webm", size: 1811 });
  assert.deepEqual([result.ok, result.asset.mime_type, store.videos.length, store.images.length], [true, "video/webm", 1, 0]);
  const client = text("dist/account/supabase-client.js");
  assert.match(client, /const WALL_VIDEO_TYPES = \{ "video\/mp4": "mp4", "video\/webm": "webm" \};/);
  assert.match(client, /\/\\\.\(mp4\|webm\)\$\/\.test\(String\(path\)\) \? "wall-video"/, "a .webm lives in wall-video");
});

// ---------- 3. Transforms (video and picture alike) ----------
test("T1 move, resize, rotate, opacity, layer order, mask, blend and effects apply to a video layer exactly as to a picture", () => {
  let doc = docWith(layer("pic", PICTURE), layer("vid", MP4, { media: "video" }, { y: 100 + 500 }));
  doc = ok(ops.moveElements(doc, ["vid"], 40, -30));
  doc = ok(ops.resizeElement(doc, "vid", "se", 96, 54, { keepAspect: ops.lockedAspect(ops.locate(doc, "vid").element) }));
  doc = ok(ops.rotateElement(doc, "vid", 20));
  doc = ok(ops.updatePayloadMany(doc, ["vid"], { opacity: 0.5, mask: "rounded", blend: "screen", effects: { glow: { color: "#62e7ff", blur: 30 } } }));
  doc = ok(ops.reorderLayers(doc, ["vid"], "back"));
  const element = ops.locate(doc, "vid").element;
  assert.deepEqual([element.x, element.y, element.width, element.height, element.rotation], [140, 570, 576, 324, 20]);
  assert.ok(Math.abs(element.width / element.height - 16 / 9) < 0.01, "proportions kept");
  const node = elNode(paint(doc)[0], "vid");
  assert.deepEqual([node.props.get("transform"), node.props.get("opacity"), node.props.get("mix-blend-mode")], ["rotate(20deg)", "0.5", "screen"]);
  assert.match(node.props.get("filter"), /drop-shadow/);
  assert.equal(frameOf(node).props.get("clip-path"), "inset(0 round 18%)");
  assert.equal(doc.stages[0].elements.find(item => item.id === "vid").z, 0, "sent to the back");
});

test("T2 Flip H / V mirrors the media (never the frame, so masks, fades and the selection box stay put) - with a crop the SAME part of the source is shown, mirrored", () => {
  assert.equal(artworkFlip({}), null);
  assert.equal(artworkFlip({ flipX: true }), "scale(-1, 1)");
  assert.equal(artworkFlip({ flipY: true }), "scale(1, -1)");
  for (const [assetId, extra] of [[MP4, { media: "video" }], [WEBM, { media: "video" }], [PICTURE, {}], [GIF, {}]]) {
    const node = elNode(paint(docWith(layer("m", assetId, { ...extra, flipX: true, flipY: true })))[0], "m");
    assert.equal(media(node).props.get("transform"), "scale(-1, -1)", assetId);
    assert.equal(frameOf(node).props.get("transform"), undefined);
  }
  const crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.6, preset: "free" };
  const plain = media(elNode(paint(docWith(layer("m", MP4, { media: "video", crop })))[0], "m"));
  const flipped = media(elNode(paint(docWith(layer("m", MP4, { media: "video", crop, flipX: true })))[0], "m"));
  assert.deepEqual([plain.props.get("left"), plain.props.get("top")], ["-20%", "-33.333%"]);
  assert.deepEqual([flipped.props.get("left"), flipped.props.get("top")], ["-80%", "-33.333%"], "the window is taken from the mirrored side: source 0.1..0.6 lands in the frame, mirrored");
});

test("T3 the left / right edge Fade is a transparency mask on the frame (0..50 % each), for video and picture alike; the file is never changed", () => {
  assert.equal(artworkFade(undefined), null);
  assert.equal(artworkFade({ left: 0, right: 0 }), null);
  assert.equal(artworkFade({ left: 20 }), "linear-gradient(to right, transparent 0%, #000 20%, #000 100%, transparent 100%)");
  assert.equal(artworkFade({ left: 15, right: 30 }), "linear-gradient(to right, transparent 0%, #000 15%, #000 70%, transparent 100%)");
  for (const [assetId, extra] of [[WEBM, { media: "video" }], [GIF, {}]]) {
    const frame = frameOf(elNode(paint(docWith(layer("m", assetId, { ...extra, fade: { left: 15, right: 30 }, flipX: true })))[0], "m"));
    assert.equal(frame.props.get("mask-image"), "linear-gradient(to right, transparent 0%, #000 15%, #000 70%, transparent 100%)");
    assert.equal(frame.props.get("-webkit-mask-image"), frame.props.get("mask-image"), "Safari too");
  }
  const withFade = ok(ops.updatePayloadMany(docWith(layer("m", PICTURE)), ["m"], { fade: { left: 50, right: 50 } }));
  assert.deepEqual(ops.locate(withFade, "m").element.payload.fade, { left: 50, right: 50 });
  assert.equal(ops.updatePayloadMany(withFade, ["m"], { fade: { left: 60 } }).ok, false, "over 50 is refused");
});

test("T4 a video is never split (its pieces would play out of step); pictures and GIFs still split, and a flipped split mirrors the WHOLE artwork", () => {
  const video = docWith(layer("v", MP4, { media: "video" }));
  assert.deepEqual(ops.splitArtwork(video, "v", 3, "v").errors, ["VIDEO_SPLIT_UNSUPPORTED"]);
  const split = ok(ops.splitArtwork(docWith(layer("g", GIF, { flipX: true })), "g", 3, "v"));
  const pieces = ops.splitPieces(split, "g");
  assert.equal(pieces.length, 3);
  const stage = paint(split)[0];
  for (const piece of pieces) {
    const node = elNode(stage, piece.id);
    assert.equal(media(node).tag, "img");
    assert.equal(media(node).props.get("transform"), "scale(-1, 1)", "each piece's whole-artwork frame holds the mirrored picture");
  }
  const tools = text("dist/wall-editor/controls.js");
  assert.match(tools, /if \(video\) split\.append\(h\("p", \{ class: "ed-hint", text: "A video can't be split/);
});

// ---------- 4. Image / GIF did not regress ----------
test("R1 pictures and GIFs paint exactly as before: an <img> from the owner's blob:, legacy (pre-Round-3) artwork keeps its old opacity and dark backing", () => {
  const stage = paint(docWith(layer("p", PICTURE, { opacity: 0.6 }), createElement({ id: "legacy", type: "image", x: 0, y: 0, width: 100, height: 100, z: 1, payload: { assetId: GIF, fit: "contain", posX: 50, posY: 50, opacity: 0.4 } })))[0];
  const picture = media(elNode(stage, "p"));
  assert.deepEqual([picture.tag, picture.attrs.src, picture.props.get("opacity"), picture.props.get("object-fit")], ["img", `blob:https://x/${PICTURE}`, "1", "cover"]);
  assert.equal(elNode(stage, "p").props.get("opacity"), "0.6", "the artwork's opacity is on the element, as before");
  const legacy = elNode(stage, "legacy");
  assert.deepEqual([media(legacy).props.get("opacity"), frameOf(legacy).props.get("background"), media(legacy).props.get("object-fit")], ["0.4", "#14101f", "contain"]);
  assert.equal(media(legacy).props.get("transform"), "none");
  assert.equal(elNode(stage, "p").attrs["data-media"], undefined);
});

test("R2 a picture layer can never name a video and a video layer never shows a picture (the painter only takes the matching address; the database refuses the mix)", () => {
  const stage = paint(docWith(layer("a", MP4), layer("b", PICTURE, { media: "video" })))[0];
  assert.equal(media(elNode(stage, "a")), undefined, "no blob: for a video asset -> placeholder, never a video in an <img>");
  assert.equal(media(elNode(stage, "b")), undefined, "no signed video address for a picture");
  assert.deepEqual(all(elNode(stage, "a"), node => node.className === "wall-image-missing").map(node => node.textContent), ["Image"]);
  assert.deepEqual(all(elNode(stage, "b"), node => node.className === "wall-image-missing").map(node => node.textContent), ["Video"]);
});

// ---------- 5. Media & Links > Other ----------
test("O1 Other: a normal website or a payment / support page becomes a stored https / http address; bare domains get https://; unsafe schemes are refused", () => {
  assert.deepEqual(normalizeLinkInput("https://mywebsite.com"), { ok: true, url: "https://mywebsite.com/" });
  assert.deepEqual(normalizeLinkInput("https://paypal.me/example"), { ok: true, url: "https://paypal.me/example" });
  assert.deepEqual(normalizeLinkInput("  ko-fi.com/gamer  "), { ok: true, url: "https://ko-fi.com/gamer" });
  assert.deepEqual(normalizeLinkInput("http://mysite.example/a b?q=ü"), { ok: true, url: "http://mysite.example/a%20b?q=%C3%BC" }, "spaces and non-ASCII are percent-encoded");
  assert.deepEqual(normalizeLinkInput("https://mañana.example/"), { ok: true, url: "https://xn--maana-pta.example/" }, "an international host becomes punycode");
  for (const [input, reason] of [["javascript:alert(1)", "scheme"], ["JavaScript:alert(1)", "scheme"], ["data:text/html,<b>x</b>", "scheme"], ["ftp://x.example", "scheme"],
    ["https://user:pw@evil.example", "credentials"], ["https://paypal.com@evil.example", "credentials"], ["", "empty"], ["https://localhost/", "invalid"], ["https://", "invalid"]]) {
    assert.equal(normalizeLinkInput(input).reason, reason, input);
  }
  for (const url of ["javascript:alert(1)", "data:text/plain,x", "https://a.example/<script>", "https://a.example/\"onmouseover=\"x", " https://a.example"]) assert.equal(isSafeLinkUrl(url), false, url);
});

test("O2 Other creates a normal text layer (every text control applies); Display Text and URL can be edited later; Save -> Reload keeps both", () => {
  const empty = docWith();
  const payload = createTextPayload({ text: "Support Me", underline: true, link: { url: "https://paypal.me/example" } });
  let doc = ok(ops.addCustomElement(empty, empty.stages[0].id, { type: "text", payload, width: 800, height: 120 }));
  const id = doc.stages[0].elements[0].id;
  doc = ok(ops.updatePayloadMany(doc, [id], { text: "My Website", fontSize: 80, color: "#ffcc00", glow: { color: "#62e7ff", blur: 16 } }));
  doc = ok(ops.updatePayloadMany(doc, [id], { link: { url: "https://mywebsite.com/" } }));
  assert.equal(ops.updatePayloadMany(doc, [id], { link: { url: "javascript:alert(1)" } }).ok, false, "an unsafe address is refused and changes nothing");
  const reloaded = JSON.parse(JSON.stringify(doc));
  assert.equal(validateDocument(reloaded).valid, true);
  assert.deepEqual([reloaded.stages[0].elements[0].payload.text, reloaded.stages[0].elements[0].payload.link], ["My Website", { url: "https://mywebsite.com/" }]);
  const unlinked = ok(ops.updatePayloadMany(doc, [id], { link: undefined }));
  assert.equal("link" in unlinked.stages[0].elements[0].payload, false, "Remove link: an ordinary text again");
});

test("O3 on the Wall (view mode) the Display Text is a real link: <a href target=_blank rel=noopener noreferrer>, tappable; the address itself is never shown; in the editor it is plain text", () => {
  const doc = docWith(createElement({ id: "t", type: "text", x: 100, y: 100, width: 800, height: 120, z: 0, payload: createTextPayload({ text: "Support Me", link: { url: "https://paypal.me/example" } }) }));
  const view = elNode(paint(doc, { mode: "view" })[0], "t");
  const anchor = all(view, node => node.tag === "a")[0];
  assert.ok(anchor, "a link in view mode");
  assert.deepEqual([anchor.attrs.href, anchor.attrs.target, anchor.attrs.rel, anchor.textContent], ["https://paypal.me/example", "_blank", "noopener noreferrer", "Support Me"]);
  assert.equal(anchor.attrs[INTERACTIVE_ATTR], "true");
  assert.equal(anchor.props.get("pointer-events"), "auto", "the text takes the tap");
  assert.equal(view.props.get("pointer-events"), "none", "the element box around it stays pass-through");
  assert.doesNotMatch(view.textContent, /paypal\.me/, "only the Display Text shows");
  const edit = elNode(paint(doc, { mode: "edit" })[0], "t");
  assert.equal(all(edit, node => node.tag === "a").length, 0, "the editor never navigates: tapping selects / drags");
  // defence in depth: even an address that somehow reached the painter unchecked is never turned into a link
  const tree = renderDocument(doc, { viewportWidth: 1000 });
  tree.stages[0].elements[0].content.link = { url: "javascript:alert(1)" };
  assert.equal(all(paintStage(tree.stages[0], tree.scale, make, { mode: "view" }), node => node.tag === "a").length, 0);
});

test("O4 the paste-a-link detector is unchanged: arbitrary websites and payment pages are NOT platforms (they belong to Other); the existing platforms still detect", () => {
  for (const url of ["https://paypal.me/example", "https://mywebsite.com", "https://www.google.com/search?q=gamid"]) assert.equal(detectEmbed(url).ok, false, url);
  for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.twitch.tv/somechannel", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"]) assert.equal(detectEmbed(url).ok, true, url);
  const tools = text("dist/wall-editor/tools.js");
  assert.match(tools, /h\("b", \{ text: "Other" \}\)/, "one Other tile in the platforms grid");
  assert.match(tools, /h\("span", \{ text: "URL" \}\)/);
  assert.match(tools, /h\("span", \{ text: "Display Text" \}\)/);
  assert.match(tools, /addCustom\("text", createTextPayload\(\{ \.\.\.OTHER_LINK_STYLE, text: shown, link: \{ url: link\.url \} \}\), OTHER_LINK_SIZE\)/, "a text layer - never an embed");
  assert.doesNotMatch(text("dist/wall-kit/embed/engine.js"), /paypal|mywebsite/i);
});

// ---------- 6. The database mirror ----------
test("D1 the migration is additive: storage + registry accept WebM, validators gain the new optional keys, saves know video layers; nothing is dropped or rewritten", () => {
  const sql = text("supabase/migrations/20260930160000_wall_video_layers_other_link.sql").replace(/--.*$/gm, "");
  assert.match(sql, /values \('wall-video', 'wall-video', false, 52428800, array\['video\/mp4', 'video\/webm'\]\)/);
  for (const code of ["INVALID_MEDIA", "INVALID_FLIP", "INVALID_FADE", "INVALID_LINK", "INVALID_SLICE", "INVALID_DATA_TEXT", "WALL_ASSET_KIND_MISMATCH", "WALL_VIDEO_LIMIT"]) assert.ok(sql.includes(`'${code}'`), code);
  assert.match(sql, /@\.kind == "video" \|\| @\.media == "video"/, "a video layer is a video reference");
  // (function BODIES may write - saving a draft, registering an asset - but only when called; the migration itself runs none of that)
  const statements = sql.replace(/\$\$[\s\S]*?\$\$/g, "$$ <body> $$");
  assert.doesNotMatch(statements, /\bdrop\s+(table|column|function|policy|bucket)\b|\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\.|\binsert\s+into\s+public\./i, "no destructive statement, no data written");
  assert.doesNotMatch(sql, /public = true|to anon|grant .* to (anon|public)/i, "nothing becomes public");
  // the link rule is literally the JS one
  const js = String(/^https?:\/\/[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?$/).slice(1, -1).replace(/\\\//g, "/");
  assert.ok(sql.includes(`'${js.replace(/'/g, "''")}'`), "SQL LINK rule == text.js LINK_URL");
  assert.equal(text("dist/wall-kit/text.js").includes(String.raw`export const LINK_URL = /^https?:\/\/[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?$/;`), true);
});
