// Intro video presentation: the uploaded video is NEVER stretched. Portrait / landscape / square sources get a deliberate cover-or-contain choice.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AMBIENT_OVERSCAN, AMBIENT_WIDTH, MAX_UPSCALE, MIN_VISIBLE, ambientCanvasSize, ambientCoverScale, drawnRect, isWideSource, resolvePresentation, resolveVideoFit, visibleFraction, wideForeground } from "../dist/video-fit.js";
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
  assert.match(js, /import \{ ambientCanvasSize, ambientCoverScale, resolvePresentation \} from "\.\.\/video-fit\.js";/);
  assert.match(js, /resolvePresentation\(v\.videoWidth,v\.videoHeight,stageW,stageH,window\.devicePixelRatio\|\|1\)/);
  assert.match(js, /const stageW=els\.mediaStage\.clientWidth,stageH=els\.mediaStage\.clientHeight/, "layout size (unaffected by the Shrink transform)");
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

// ------------------------------------------------------------------------------------------------ landscape: sharp foreground + ambient glow
const WIDE_SOURCES = { landscape1080p: [1920, 1080], landscape720p: [1280, 720], landscapeLow: [640, 360], ultrawide: [2560, 1080], square: [1080, 1080] };
const VIEWPORTS = [[412, 892, 2.625], [375, 812, 3], [1366, 657, 1], [1536, 730, 1.25], [1920, 950, 1], [1920, 950, 2], [2560, 1300, 1], [3840, 1900, 1], [3840, 1900, 1.5]];

test("landscape and square sources always get the wide treatment; portrait keeps the original policy and never gets an ambient layer", () => {
  for (const [w, h] of Object.values(WIDE_SOURCES)) assert.ok(isWideSource(w, h));
  assert.ok(!isWideSource(1080, 1920) && !isWideSource(540, 960));
  for (const [bw, bh, dpr] of VIEWPORTS) {
    for (const [vw, vh] of Object.values(WIDE_SOURCES)) {
      const p = resolvePresentation(vw, vh, bw, bh, dpr);
      assert.equal(p.orientation, "wide");
      assert.equal(p.fit, "contain", "a landscape video is never cropped");
      assert.equal(p.ambient, true);
      assert.ok(p.foreground);
    }
    for (const [vw, vh] of [[1080, 1920], [540, 960], [1080, 1350]]) {
      const p = resolvePresentation(vw, vh, bw, bh, dpr);
      assert.equal(p.orientation, "portrait");
      assert.equal(p.fit, resolveVideoFit(vw, vh, bw, bh), "portrait: exactly the previous cover/contain decision");
      assert.equal(p.foreground, null);
      assert.equal(p.ambient, false);
    }
  }
});

test("the landscape foreground keeps its aspect ratio (x and y scale together), is never cropped, and stays inside the stage", () => {
  for (const [bw, bh, dpr] of VIEWPORTS) for (const [vw, vh] of Object.values(WIDE_SOURCES)) {
    const f = wideForeground(vw, vh, bw, bh, dpr);
    assert.ok(Math.abs(f.width / f.height - vw / vh) < 1e-9, `${vw}x${vh} in ${bw}x${bh}`);
    assert.ok(f.width <= bw + 1e-9 && f.height <= bh + 1e-9, "contain: nothing is cut off");
    assert.ok(f.width > 0 && f.scale > 0);
  }
});

test("quality first: the foreground is never enlarged past MAX_UPSCALE device pixels per source pixel; when the cap applies the ambient fills the rest", () => {
  assert.equal(MAX_UPSCALE, 1.5);
  for (const [bw, bh, dpr] of VIEWPORTS) for (const [vw, vh] of Object.values(WIDE_SOURCES)) {
    const f = wideForeground(vw, vh, bw, bh, dpr);
    const fits = Math.min(bw / vw, bh / vh);
    assert.ok(f.deviceUpscale <= Math.max(MAX_UPSCALE, fits * dpr) + 1e-9);
    if (fits * dpr > MAX_UPSCALE) { assert.ok(f.capped); assert.ok(Math.abs(f.deviceUpscale - MAX_UPSCALE) < 1e-9); assert.ok(f.width < bw || f.height < bh, "leftover space exists for the ambient"); }
    else assert.ok(!f.capped);
  }
  // the real Samsung / PC cases for the real 1920x1080 derivative
  assert.ok(Math.abs(wideForeground(1920, 1080, 1920, 950, 1).width - 1688.888) < 0.01, "1080p monitor: fits the height, no enlargement (0.88x)");
  const fourK = wideForeground(1920, 1080, 3840, 1900, 1);
  assert.equal(Math.round(fourK.width), 2880);
  assert.equal(Math.round(fourK.height), 1620);
  const hiDpi = wideForeground(1920, 1080, 1920, 950, 2);
  assert.equal(Math.round(hiDpi.width), 1440, "4K monitor at 200%: 1.5 device px per source px, not 2");
  const phone = wideForeground(1920, 1080, 412, 892, 2.625);
  assert.equal(Math.round(phone.width), 412, "a phone shows the whole width (downscale)");
  assert.ok(!phone.capped);
});

test("a low-resolution clip is still shown at a useful size (the cap is a ratio, not a fixed pixel size)", () => {
  const phone = wideForeground(640, 360, 412, 892, 2.625);
  assert.ok(phone.width >= 350 && phone.width <= 412, `got ${phone.width}`);
  const desktop = wideForeground(640, 360, 1920, 950, 1);
  assert.equal(Math.round(desktop.width), 960);
});

test("invalid dimensions or DPR fall back safely", () => {
  assert.deepEqual(resolvePresentation(0, 0, 375, 812, 2), { orientation: "unknown", fit: "contain", foreground: null, ambient: false });
  assert.deepEqual(resolvePresentation(640, 360, 0, 0, 2), { orientation: "unknown", fit: "contain", foreground: null, ambient: false });
  for (const dpr of [0, -1, Number.NaN, undefined, null, Infinity]) { const f = wideForeground(1920, 1080, 1920, 950, dpr); assert.ok(Number.isFinite(f.width) && f.width > 0); }
});

test("the ambient layer is tiny and covers the stage uniformly, from the same video", () => {
  assert.equal(AMBIENT_WIDTH, 32);
  for (const [vw, vh] of Object.values(WIDE_SOURCES)) {
    const size = ambientCanvasSize(vw, vh);
    assert.equal(size.width, 32);
    assert.ok(size.height >= 4 && size.height <= 32, "a 32-wide canvas has at most a few hundred pixels");
    assert.ok(size.width * size.height <= 32 * 32, "about a thousand pixels copied per drawn frame");
    assert.ok(Math.abs(size.width / size.height - vw / vh) < vw / vh * 0.15, "the ambient keeps the source shape (rounded to whole pixels)");
    for (const [bw, bh] of VIEWPORTS) {
      const k = ambientCoverScale(size.width, size.height, bw, bh);
      assert.ok(size.width * k >= bw && size.height * k >= bh, "it covers the whole stage");
      assert.ok(k <= Math.max(bw / size.width, bh / size.height) * AMBIENT_OVERSCAN + 1e-9, "uniform scale, only a small overscan");
    }
  }
});

test("the Intro page implements the ambient from the SAME video: one video element, one tiny canvas, no second download, no pixel reads, reduced-motion aware", () => {
  const js = read("dist/account/intro-preview.js"), html = read("dist/account/intro-preview.html");
  assert.equal((html.match(/<video\b/g) || []).length, 1, "the page still has one video element; the ambient is a canvas");
  assert.match(html, /<canvas id="introAmbient" class="intro-ambient" aria-hidden="true"/);
  assert.match(js, /ambientCtx\.drawImage\(v,0,0,ambient\.w,ambient\.h\)/, "a downscaled copy of the current frame of the SAME element");
  assert.doesNotMatch(js, /getImageData|toDataURL|createImageBitmap|new Worker|fetch\(|XMLHttpRequest|createElement\("video"\).*ambient/, "no pixel analysis, no extra media request");
  assert.match(js, /requestVideoFrameCallback/, "driven by presented video frames, not a free-running loop");
  assert.match(js, /const gap=reduceMotion\.matches\?2000:90/, "about 11 draws per second (one every 2 s under reduced motion)");
  assert.match(js, /cancelVideoFrameCallback/);
  assert.match(js, /els\.introLayer\.style\.visibility==="hidden"\)return/, "stops when the Intro is over");
  assert.match(js, /ambient\.on=false/);
});

test("CSS: wide sources only - a contained foreground box, the ambient behind it, split clips aligned to the same box; portrait rules untouched", () => {
  const css = read("dist/account/intro-preview.css");
  const wide = css.slice(css.indexOf("/* LANDSCAPE / square sources"));
  assert.match(wide, /\.preview-only \.experience\[data-orient="wide"\] \.intro-ambient\{display:block/);
  assert.match(wide, /\.media-stage>video\{[^}]*width:var\(--fg-w,100%\);height:var\(--fg-h,100%\)[^}]*object-fit:contain/);
  assert.match(wide, /\.split-left video\{left:calc\(100% - var\(--fg-w,200%\) \/ 2\)/);
  assert.match(wide, /\.split-right video\{left:calc\(0px - var\(--fg-w,200%\) \/ 2\)/);
  assert.match(wide, /\[data-state="transitioning"\]\[data-orient="wide"\] \.preset-split \.intro-ambient/, "the ambient leaves with the split panels");
  for (const selector of [...wide.matchAll(/(^|\})\s*([^{}\/]+)\{/g)].map(m => m[2].trim()).filter(Boolean)) {
    for (const part of selector.split(",")) assert.match(part.trim(), /^\.intro-ambient(-shade)?$|\.experience\[data-orient="wide"\]|\.experience\[data-state="transitioning"\]\[data-orient="wide"\]/, `${part.trim()} only applies to wide sources`);
  }
  assert.doesNotMatch(wide, /object-fit:\s*(fill|cover)/, "the foreground is never stretched or cropped");
  assert.doesNotMatch(wide, /filter:\s*blur|backdrop-filter/, "no full-viewport blur filter on a moving video: the softness comes from scaling a 32 px canvas");
  // the original portrait / generic rules are still present exactly as before
  assert.match(css, /\.preview-only \.media-stage video\[data-fit="cover"\]\{object-fit:cover\}/);
  assert.match(css, /@media \(min-aspect-ratio:1\/1\)\{\.preview-only \.media-stage video\{object-fit:contain/);
});

test("no media policy change: the D3 encode command, its ceilings and the derivative geometry check are untouched", () => {
  const worker = read("worker/intro-worker.mjs");
  assert.match(worker, /"-c:v","libvpx-vp9","-crf","40","-b:v","0","-deadline","good","-cpu-used","2","-row-mt","1","-pix_fmt","yuv420p"/);
  assert.match(worker, /result\.video\.width !== source\.video\.width \|\| result\.video\.height !== source\.video\.height/);
  assert.match(worker, /MAX_OUTPUT_BYTES = 15 \* 1024 \* 1024/);
});