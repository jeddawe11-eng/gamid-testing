// Wall editor - representative still previews for video assets (dist/wall-editor/video-preview.js). Fake video / canvas objects: no browser, no network.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { candidateTimes, frameStats, frameScore, pickFrame, captureRepresentativeFrame, createVideoPreviews, MIN_SCORE, PREVIEW_MAX_SIDE } from "../dist/wall-editor/video-preview.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const W = 20, H = 20;
// frames as functions of time -> RGBA pixels (unpremultiplied)
const fill = (rgba, share = 1) => { const data = new Uint8ClampedArray(W * H * 4); const lit = Math.round(W * H * share); for (let p = 0; p < W * H; p++) data.set(p < lit ? rgba : [0, 0, 0, 0], p * 4); return data; };
const transparent = () => fill([0, 0, 0, 0]);
const pinkArt = (share = 0.5) => fill([240, 40, 180, 255], share);
const opaqueBlack = () => fill([0, 0, 0, 255]);
const scene = () => { const data = new Uint8ClampedArray(W * H * 4); for (let p = 0; p < W * H; p++) data.set([(p * 13) % 256, (p * 7) % 256, (p * 3) % 256, 255], p * 4); return data; };

// a fake <video>: metadata and seeks resolve asynchronously; drawImage reads the frame at currentTime
function fakeVideo({ duration = 4, frameAt, width = W, height = H, fail = null }) {
  const listeners = new Map();
  const fire = name => { for (const fn of [...(listeners.get(name) ?? [])]) fn(); };
  const v = {
    duration, videoWidth: width, videoHeight: height, seeks: [], played: 0, released: false, attrs: {},
    addEventListener: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    removeEventListener: (name, fn) => listeners.set(name, (listeners.get(name) ?? []).filter(x => x !== fn)),
    removeAttribute(name) { if (name === "src") this.released = true; },
    load() {}, play() { this.played += 1; },
    frame() { return frameAt(this._time ?? 0); },
  };
  Object.defineProperty(v, "src", { set(url) { v._src = url; setTimeout(() => fire(fail === "error" ? "error" : fail === "silent" ? "none" : "loadedmetadata"), 0); }, get() { return v._src; } });
  Object.defineProperty(v, "currentTime", { set(t) { v._time = t; v.seeks.push(t); if (fail !== "seek") setTimeout(() => fire("seeked"), 0); }, get() { return v._time ?? 0; } });
  return v;
}
function fakeCanvas({ tainted = false } = {}) {
  const canvas = { width: 0, height: 0, pixels: null, className: "", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  canvas.getContext = () => ({
    clearRect() { canvas.pixels = null; },
    drawImage(source) { canvas.pixels = typeof source.frame === "function" ? source.frame() : source.pixels; },
    getImageData() { if (tainted) throw new DOMException("tainted", "SecurityError"); return { data: canvas.pixels ?? transparent() }; },
  });
  return canvas;
}
const capture = (video, opts = {}) => captureRepresentativeFrame("https://project.supabase.co/storage/v1/object/sign/wall-video/u/a.webm?token=t", { createVideo: () => video, createCanvas: () => fakeCanvas(opts), stepTimeoutMs: opts.stepTimeoutMs ?? 200 });

test("sample points avoid the first and last frame, are deterministic, and handle short / unknown-length videos", () => {
  assert.deepEqual(candidateTimes(4), [2, 1, 3, 0.4, 3.6]);
  for (const d of [4, 0.3, 1, 30, 600]) for (const t of candidateTimes(d)) assert.ok(t > 0 && t < d, `${d}: ${t}`);
  assert.deepEqual(candidateTimes(0.3), [0.15, 0.075, 0.225, 0.03, 0.27]);
  assert.deepEqual(candidateTimes(Infinity), [0.5, 1, 2]);
  assert.deepEqual(candidateTimes(NaN), [0.5, 1, 2]);
});

test("frame statistics: a transparent or uniform frame scores 0; visible artwork over the box background scores; little coverage is penalised", () => {
  assert.equal(frameScore(frameStats(transparent())), 0);
  assert.equal(frameScore(frameStats(opaqueBlack())), 0, "a uniform opaque frame is as empty as a transparent one");
  assert.equal(frameScore(frameStats(fill([200, 200, 200, 255]))), 0);
  const art = frameStats(pinkArt(0.5));
  assert.equal(art.visible, 0.5);
  assert.ok(frameScore(art) >= MIN_SCORE * 4);
  assert.ok(frameScore(frameStats(pinkArt(0.01))) < frameScore(art), "a mostly transparent frame scores lower than a fuller one");
  assert.ok(frameScore(frameStats(scene())) > MIN_SCORE, "an ordinary opaque frame scores");
});

test("frame choice: the first clearly good sample wins; else the best score; nothing above the minimum -> fallback", () => {
  const s = data => frameStats(data);
  assert.deepEqual(pickFrame([{ time: 2, stats: s(scene()) }, { time: 1, stats: s(pinkArt()) }]).time, 2);
  assert.equal(pickFrame([{ time: 2, stats: s(pinkArt(0.02)) }, { time: 1, stats: s(pinkArt(0.08)) }]).time, 1, "best score when none is clearly good");
  assert.equal(pickFrame([{ time: 2, stats: s(transparent()) }, { time: 1, stats: s(opaqueBlack()) }]), null);
  assert.equal(pickFrame([]), null);
});

test("a transparent-first loop (content only between its transparent first and last frames) gets a real frame - frame 0 is never sampled", async () => {
  const video = fakeVideo({ duration: 4, frameAt: t => (t < 0.05 || t > 3.95 ? transparent() : pinkArt(0.6)) });
  const result = await capture(video);
  assert.equal(result.checked, true);
  assert.equal(result.time, 2);
  assert.ok(frameScore(frameStats(result.canvas.pixels)) >= MIN_SCORE, "the kept canvas holds the chosen frame");
  assert.ok(!video.seeks.includes(0));
  assert.deepEqual(video.seeks, [2], "a clearly good frame stops sampling");
  assert.equal(video.played, 0, "never played");
  assert.equal(video.released, true, "the probe is released");
});

test("content that starts late, and a mostly transparent middle frame, pick the better later sample", async () => {
  const late = fakeVideo({ duration: 10, frameAt: t => (t >= 7 ? pinkArt(0.4) : transparent()) });
  assert.equal((await capture(late)).time, 7.5);
  const sparse = fakeVideo({ duration: 4, frameAt: t => (t === 2 ? pinkArt(0.01) : t === 3 ? pinkArt(0.1) : transparent()) });
  const chosen = await capture(sparse);
  assert.equal(chosen.time, 3);
  assert.deepEqual(sparse.seeks, [2, 1, 3, 0.4, 3.6], "all samples are tried when none is clearly good");
});

test("an ordinary opaque video is captured from its first sample; the preview is scaled to at most 320 px", async () => {
  const video = fakeVideo({ duration: 12, width: 1920, height: 1080, frameAt: () => scene() });
  const result = await capture(video);
  assert.deepEqual([result.time, result.canvas.width, result.canvas.height], [6, PREVIEW_MAX_SIDE, 180]);
  assert.deepEqual(video.seeks, [6]);
});

test("fallback (null) for every-frame-transparent, uniform, undecodable, timed-out or sizeless videos - and the probe is always released", async () => {
  for (const [name, video] of [
    ["transparent", fakeVideo({ frameAt: () => transparent() })],
    ["uniform black", fakeVideo({ frameAt: () => opaqueBlack() })],
    ["decode error", fakeVideo({ frameAt: () => scene(), fail: "error" })],
    ["metadata never arrives", fakeVideo({ frameAt: () => scene(), fail: "silent" })],
    ["no picture size", fakeVideo({ frameAt: () => scene(), width: 0, height: 0 })],
    ["seeks never finish", fakeVideo({ frameAt: () => scene(), fail: "seek" })],
  ]) {
    assert.equal(await capture(video, { stepTimeoutMs: 30 }), null, name);
    assert.equal(video.released, true, name);
    assert.equal(video.played, 0, name);
  }
});

test("pixels that cannot be read back (no CORS) still show the first sampled frame, marked unscored", async () => {
  const video = fakeVideo({ duration: 4, frameAt: t => (t < 0.05 ? transparent() : pinkArt()) });
  const result = await capture(video, { tainted: true });
  assert.deepEqual([result.checked, result.time], [false, 2]);
});

// ---- the list controller ----
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const box = () => ({ dataset: {}, children: [], isConnected: true, text: "", replaceChildren(...c) { this.children = c; this.text = ""; }, append(c) { this.children.push(c); }, set textContent(v) { this.children = []; this.text = v; } });
const node = tag => ({ tag, className: "", textContent: "", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
const controller = ({ result = () => ({ canvas: Object.assign(fakeCanvas(), { width: 20, height: 20, pixels: pinkArt() }), checked: true, time: 2 }), observe, maxConcurrent } = {}) => {
  const calls = [];
  let release = [];
  const previews = createVideoPreviews({
    createCanvas: () => fakeCanvas(), createElement: node, maxConcurrent,
    observe: observe ?? ((b, go) => go()),
    capture: url => { calls.push(url); return new Promise(resolve => release.push(() => resolve(result(url)))); },
  });
  return { previews, calls, flush: async () => { await tick(); const r = release; release = []; r.forEach(fn => fn()); await tick(); } };
};

test("the list shows … while loading, then the still frame in place; the result is cached for the page (no second probe)", async () => {
  const { previews, calls, flush } = controller();
  const b = box();
  previews.mount(b, { id: "v1", url: "https://x/v1" });
  await tick();
  assert.deepEqual([b.dataset.preview, b.text, calls.length], ["loading", "…", 1]);
  await flush();
  assert.equal(b.dataset.preview, "ready");
  assert.equal(b.children[0].className, "thumb-frame");
  assert.equal(b.children[0].attrs["aria-hidden"], "true");
  const again = box();
  previews.mount(again, { id: "v1", url: "https://x/v1" });
  assert.equal(again.dataset.preview, "ready", "a repaint shows the cached frame at once");
  assert.equal(calls.length, 1);
});

test("a failed probe shows the deterministic \"▶ Video\" fallback, not an empty box", async () => {
  const { previews, flush } = controller({ result: () => null });
  const b = box();
  previews.mount(b, { id: "v1", url: "https://x/v1" });
  await flush();
  assert.equal(b.dataset.preview, "fallback");
  assert.deepEqual([b.children[0].className, b.children[0].textContent], ["thumb-fallback", "▶ Video"]);
});

test("nothing loads before the signed address exists or before the card is visible; at most two probes run at once", async () => {
  const visible = [];
  const { previews, calls, flush } = controller({ observe: (b, go) => visible.push(go) });
  const b = box();
  previews.mount(b, { id: "v1", url: null });
  assert.deepEqual([calls.length, visible.length], [0, 0], "no address yet: nothing is observed or loaded");
  previews.mount(b, { id: "v1", url: "https://x/v1" });
  assert.deepEqual([calls.length, visible.length], [0, 1], "observed, not loaded while off-screen");
  visible[0]();
  await tick();
  assert.equal(calls.length, 1);
  await flush();
  const many = controller();
  for (let i = 0; i < 5; i++) many.previews.mount(box(), { id: `v${i}`, url: `https://x/v${i}` });
  await tick();
  assert.equal(many.calls.length, 2, "two at a time");
  await many.flush();
  assert.equal(many.calls.length, 4);
  await many.flush();
  assert.equal(many.calls.length, 5);
  await many.flush();
  // a deleted asset's cache entry is dropped
  many.previews.retain(new Set(["v0"]));
  assert.equal(many.previews.stateOf("v1"), null);
  assert.equal(many.previews.stateOf("v0"), "ready");
});

test("wiring: both video lists use the still preview; no list builds a <video>; the module never plays, uploads or fetches", () => {
  const tools = read("dist/wall-editor/tools.js");
  assert.match(tools, /import \{ createVideoPreviews \} from "\.\/video-preview\.js";/);
  assert.equal((tools.match(/videoPreviews\.mount\(thumb, \{ id: asset\.asset_id, url: assets\.videoUrlFor\(asset\.asset_id\) \}\)/g) ?? []).length, 2, "Assets grid and background video list");
  assert.doesNotMatch(tools, /h\("video"/, "no <video> element in a thumbnail list");
  const mod = read("dist/wall-editor/video-preview.js");
  assert.doesNotMatch(mod, /\.play\(|\.autoplay|"autoplay"|fetch\(|\.upload|storage\.from|XMLHttpRequest/);
  assert.match(read("dist/wall-editor/editor.css"), /\.ed-asset \.thumb canvas/);
  assert.match(read("package.json"), /node --check dist\/wall-editor\/video-preview\.js/);
});
