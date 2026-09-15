import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AVATAR_MAX_OUTPUT, AVATAR_PREVIEW_SIZE, AvatarCropState, AvatarDecodeSession, coverScale, loadOrientedImage } from "../dist/account/avatar-cropper.js";

test("portrait, landscape, square, very tall, and very wide images always cover the crop", () => {
  for (const [width, height] of [[900,1600],[1600,900],[1200,1200],[500,3000],[3000,500]]) {
    const state = new AvatarCropState(width, height);
    assert.equal(Math.min(width * state.baseScale, height * state.baseScale), AVATAR_PREVIEW_SIZE);
    state.pan(100000, -100000);
    const rect = state.sourceRect();
    assert.ok(rect.x >= -1e-8 && rect.y >= -1e-8);
    assert.ok(rect.x + rect.size <= width + 1e-8);
    assert.ok(rect.y + rect.size <= height + 1e-8);
  }
});

test("zoom is bounded, supports a smaller selected region, and never creates empty space", () => {
  const state = new AvatarCropState(2400, 3200);
  state.setZoom(999, 60, 80).pan(-9999, 9999);
  assert.equal(state.zoom, state.maxZoom);
  assert.ok(state.sourceRect().size < 2400);
  assert.ok(state.sourceRect().size >= 128);
  assert.ok(state.outputSize() <= AVATAR_MAX_OUTPUT);
});

test("small sources are not upscaled in the normalized output", () => {
  const state = new AvatarCropState(96, 160);
  assert.equal(coverScale(96, 160), AVATAR_PREVIEW_SIZE / 96);
  assert.equal(state.maxZoom, 1);
  assert.equal(state.outputSize(), 96);
});

test("crop export architecture creates a square WebP-first Canvas derivative", async () => {
  const source = await readFile(new URL("../dist/account/avatar-cropper.js", import.meta.url), "utf8");
  assert.match(source, /canvas\.width = outputSize;[\s\S]*canvas\.height = outputSize/);
  assert.match(source, /canvasBlob\(canvas, "image\/webp", \.9\)/);
  assert.match(source, /imageOrientation: "from-image"/);
});

test("valid image decoding remains reusable after an unsaved APPLY and page reinitialization", async () => {
  const first = await loadOrientedImage({ name:"first.jpg" }, {
    createBitmap: async file => ({ decoded:file.name }),
    fallback: async () => { throw new Error("fallback should not run"); },
  });
  assert.equal(first.decoded, "first.jpg");

  // A reload creates a fresh crop lifecycle. If Android's available bitmap decoder
  // transiently rejects the next valid File, the HTML-image decoder must still open it.
  const afterReload = await loadOrientedImage({ name:"second.jpg" }, {
    createBitmap: async () => { throw new Error("transient bitmap decoder failure"); },
    fallback: async file => ({ decoded:file.name, via:"fallback" }),
  });
  assert.deepEqual(afterReload, { decoded:"second.jpg", via:"fallback" });
});

test("stale decoder completion cannot replace or release the current selection", async () => {
  const pending = new Map();
  const released = [];
  const session = new AvatarDecodeSession({
    loader: file => new Promise((resolve, reject) => pending.set(file.name, { resolve, reject })),
    releaser: image => released.push(image.name),
  });
  const first = session.open({ name:"first.jpg" });
  const second = session.open({ name:"second.jpg" });
  pending.get("second.jpg").resolve({ name:"second-image" });
  const current = await second;
  pending.get("first.jpg").resolve({ name:"first-image" });
  const stale = await first;
  assert.equal(current.stale, false);
  assert.equal(stale.stale, true);
  assert.equal(session.activeImage.name, "second-image");
  assert.deepEqual(released, ["first-image"]);
});

test("stale decoder errors are ignored and cannot clean a newer selection", async () => {
  const pending = new Map();
  const session = new AvatarDecodeSession({
    loader: file => new Promise((resolve, reject) => pending.set(file.name, { resolve, reject })),
    releaser: () => assert.fail("the current image must not be released"),
  });
  const first = session.open({ name:"first.jpg" });
  const second = session.open({ name:"second.jpg" });
  pending.get("second.jpg").resolve({ name:"second-image" });
  await second;
  pending.get("first.jpg").reject(new Error("late failure"));
  assert.deepEqual(await first, { stale:true });
  assert.equal(session.activeImage.name, "second-image");
});

test("cancel/reset invalidates an in-flight decoder and repeated selections remain reusable", async () => {
  const completions = [];
  const released = [];
  const session = new AvatarDecodeSession({
    loader: file => new Promise(resolve => completions.push(() => resolve({ name:file.name }))),
    releaser: image => released.push(image.name),
  });
  const cancelled = session.open({ name:"same.jpg" });
  session.reset();
  completions.shift()();
  assert.equal((await cancelled).stale, true);
  assert.deepEqual(released, ["same.jpg"]);

  const selectedAgain = session.open({ name:"same.jpg" });
  completions.shift()();
  assert.equal((await selectedAgain).image.name, "same.jpg");
  session.reset();
  assert.deepEqual(released, ["same.jpg", "same.jpg"]);
});
