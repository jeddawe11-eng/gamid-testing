import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AVATAR_MAX_OUTPUT, AVATAR_PREVIEW_SIZE, AvatarCropState, coverScale } from "../dist/account/avatar-cropper.js";

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
