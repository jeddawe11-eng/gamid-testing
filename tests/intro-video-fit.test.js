// Intro video presentation: the uploaded video is NEVER stretched. Portrait / landscape / square sources get a deliberate cover-or-contain choice.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MIN_VISIBLE, drawnRect, resolveVideoFit, visibleFraction } from "../dist/video-fit.js";
import { PRESETS } from "../dist/transition-engine.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const PHONES = [[360, 640], [375, 812], [390, 844], [412, 915], [412, 892], [360, 800]];   // portrait viewports (CSS px)
const DESKTOPS = [[1280, 720], [1920, 1080], [1366, 768], [2560, 1080], [1024, 768]];     // landscape windows
const SOURCES = { landscape16x9: [1920, 1080], landscape4x3: [1440, 1080], portrait9x16: [1080, 1920], portrait4x5: [1080, 1350], square: [1080, 1080], ultrawide: [2560, 1080] };

test("a landscape source on a portrait phone is contained (whole picture, bars), never zoomed into its middle", () => {
  for (const [w, h] of PHONES) for (const key of ["landscape16x9", "landscape4x3", "square", "ultrawide"]) {
    const [vw, vh] = SOURCES[key];
    assert.equal(resolveVideoFit(vw, vh, w, h), "contain", `${key} on ${w}x${h}`);
    assert.ok(visibleFraction(vw, vh, w, h) < MIN_VISIBLE);
  }
});

test("the old failure: cover would have shown only the middle ~27% of a 16:9 clip on a phone; contain shows all of it", () => {
  const cover = drawnRect("cover", 1920, 1080, 375, 812), contain = drawnRect("contain", 1920, 1080, 375, 812);
  assert.ok(375 / cover.width < 0.3, "cover crops away over 70% of the width");
  assert.ok(cover.scaleX / contain.scaleX > 3, "and draws the picture more than 3x larger than a contain fit would (the blurry zoom Mazen saw)");
  assert.ok(contain.width <= 375 && contain.height <= 812, "contain keeps the entire picture inside the stage");
  assert.equal(Math.round(contain.width), 375);
});

test("a portrait source on a portrait phone fills the screen (cover, small crop only); a portrait source on a desktop window is contained", () => {
  for (const [w, h] of PHONES) for (const key of ["portrait9x16"]) {
    const [vw, vh] = SOURCES[key];
    assert.equal(resolveVideoFit(vw, vh, w, h), "cover", `${key} on ${w}x${h}`);
    assert.ok(visibleFraction(vw, vh, w, h) >= MIN_VISIBLE);
  }
  for (const [w, h] of DESKTOPS) for (const key of ["portrait9x16", "portrait4x5"]) {
    const [vw, vh] = SOURCES[key];
    assert.equal(resolveVideoFit(vw, vh, w, h), "contain", `${key} on ${w}x${h}`);
  }
});

test("a landscape source on a landscape desktop window fills it when the shapes are close and is contained when they are not", () => {
  assert.equal(resolveVideoFit(1920, 1080, 1280, 720), "cover", "identical 16:9 shape: cover is exact, nothing is cropped");
  assert.equal(resolveVideoFit(1920, 1080, 1920, 1080), "cover");
  assert.equal(resolveVideoFit(1920, 1080, 1366, 768), "cover");
  assert.equal(resolveVideoFit(1440, 1080, 2560, 1080), "contain", "a 4:3 clip in an ultrawide window: pillarbox instead of cropping over 40% of the picture");
  assert.equal(resolveVideoFit(1440, 1080, 1280, 720), "cover", "4:3 in 16:9 loses 25% at most, which is inside the limit");
  assert.equal(resolveVideoFit(1080, 1080, 1024, 768), "cover", "a square clip in a 4:3 window loses 25%, inside the limit");
});

test("exact-shape sources are perfect covers whatever the size", () => {
  for (const [w, h] of [...PHONES, ...DESKTOPS]) {
    assert.equal(visibleFraction(w * 3, h * 3, w, h), 1);
    assert.equal(resolveVideoFit(w * 3, h * 3, w, h), "cover");
  }
});

test("NEVER a geometric stretch: whichever fit is chosen, X and Y are scaled by exactly the same factor", () => {
  for (const [bw, bh] of [...PHONES, ...DESKTOPS]) for (const [vw, vh] of Object.values(SOURCES)) {
    const fit = resolveVideoFit(vw, vh, bw, bh);
    const rect = drawnRect(fit, vw, vh, bw, bh);
    assert.equal(rect.scaleX, rect.scaleY);
    assert.ok(Math.abs(rect.width / rect.height - vw / vh) < 1e-9, "the drawn picture keeps the source aspect ratio");
    if (fit === "contain") { assert.ok(rect.width <= bw + 1e-9 && rect.height <= bh + 1e-9, "contain never crops"); assert.ok(rect.x >= -1e-9 && rect.y >= -1e-9); }
    else { assert.ok(rect.width >= bw - 1e-9 && rect.height >= bh - 1e-9, "cover always fills the box"); }
  }
});

test("unknown or invalid dimensions resolve to the safe choice (contain never crops or distorts)", () => {
  for (const args of [[0, 0, 375, 812], [undefined, 100, 375, 812], [640, 360, 0, 0], [Number.NaN, 360, 375, 812], [640, 360, -1, 812], [Infinity, 360, 375, 812]]) assert.equal(resolveVideoFit(...args), "contain");
  assert.equal(visibleFraction(0, 0, 1, 1), 0);
});

test("the limit is a documented constant and can be tuned without changing the logic", () => {
  assert.equal(MIN_VISIBLE, 0.7);
  assert.equal(resolveVideoFit(1080, 1920, 412, 892, 0.99), "contain");
  assert.equal(resolveVideoFit(1080, 1920, 412, 892, 0.5), "cover");
});

test("the Intro page applies it: data-fit from real video dimensions and the stage, on load and resize, including the live Split Reveal clips", () => {
  const js = read("dist/account/intro-preview.js"), css = read("dist/account/intro-preview.css");
  assert.match(js, /import \{ resolveVideoFit \} from "\.\.\/video-fit\.js";/);
  assert.match(js, /resolveVideoFit\(v\.videoWidth,v\.videoHeight,els\.mediaStage\.clientWidth,els\.mediaStage\.clientHeight\)/, "layout size (unaffected by the Shrink transform)");
  assert.match(js, /addEventListener\("loadedmetadata",applyVideoFit\)/);
  assert.match(js, /addEventListener\("resize",applyVideoFit\)/);
  assert.match(js, /clone\.dataset\.fit=els\.introVideo\.dataset\.fit\|\|"contain"/, "split clones inherit the same fit as the main video");
  assert.match(css, /\.media-stage video\[data-fit="cover"\]\{object-fit:cover\}/);
  assert.match(css, /\.media-stage video\[data-fit="contain"\]\{object-fit:contain/);
  assert.match(css, /\.experience\[data-fit="contain"\] \.preset-split \.split-panel\{background-image:none/, "the poster does not show in the letterbox bars");
});

test("no Intro stylesheet ever stretches the video: no object-fit:fill, no non-uniform scale on the video", () => {
  for (const path of ["dist/styles.css", "dist/account/intro-preview.css", "dist/public/public.css", "dist/account/account.css"]) {
    const css = read(path);
    assert.doesNotMatch(css, /object-fit:\s*fill|object-fit:\s*scale-down/, path);
    assert.doesNotMatch(css, /video[^{}]*\{[^}]*scale(X|Y)\(|video[^{}]*\{[^}]*scale\([^)]*,/, path);
  }
});

test("root cause boundary: the processing pipeline does not resize or reshape the video, so the stretch was a presentation matter", () => {
  const worker = read("worker/intro-worker.mjs");
  const ffmpeg = worker.slice(worker.indexOf('run("ffmpeg"'), worker.indexOf('run("ffmpeg"') + 400);
  assert.doesNotMatch(ffmpeg, /"-vf"|scale=|pad=|crop=|setsar|setdar|-aspect|force_original_aspect_ratio/, "the derivative keeps the source dimensions and aspect ratio");
  assert.match(ffmpeg, /libvpx-vp9/);
});

test("the accepted Intro engine and its five transitions are unchanged", () => {
  assert.deepEqual(Object.keys(PRESETS), ["fade", "blur", "shrink", "slide", "split"]);
  const engine = read("dist/transition-engine.js");
  assert.doesNotMatch(engine, /fit|aspect|object-fit/i, "the engine knows nothing about video shape; the policy lives in video-fit.js");
  const js = read("dist/account/intro-preview.js");
  for (const symbol of ["computeShrinkTarget", "effectiveTransitionDuration", "nextExperienceState", "resolvePreset", "armSplitLiveVideo", "gamid-intro-preview-ready", "gamid-intro-preview-state"]) assert.match(js, new RegExp(symbol));
});
