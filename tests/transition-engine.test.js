import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, clampDuration, computeShrinkTarget, effectiveTransitionDuration, isImmersiveState, nextExperienceState, resolvePreset } from "../dist/transition-engine.js";

test("all five approved presets are available", () => assert.deepEqual(Object.keys(PRESETS), ["fade", "blur", "shrink", "slide", "split"]));
test("intro reaches profile through transition", () => { let s="intro"; s=nextExperienceState(s,"INTRO_COMPLETE"); assert.equal(s,"transitioning"); s=nextExperienceState(s,"TRANSITION_COMPLETE"); assert.equal(s,"profile"); });
test("skip reveals profile immediately", () => assert.equal(nextExperienceState("intro","SKIP"),"profile"));
test("replay resets profile to intro", () => assert.equal(nextExperienceState("profile","REPLAY"),"intro"));
test("duration is configurable and safely bounded", () => { assert.equal(clampDuration(900),900); assert.equal(clampDuration(2),300); assert.equal(clampDuration(20000),10000); });
test("unknown preset safely falls back", () => assert.equal(resolvePreset("future"),PRESETS.fade));
test("reduced motion uses a brief simple reveal", () => { assert.equal(effectiveTransitionDuration(2400,true),180); assert.equal(effectiveTransitionDuration(2400,false),2400); });
test("controls are hidden only during the immersive experience", () => { assert.equal(isImmersiveState("intro"),true); assert.equal(isImmersiveState("transitioning"),true); assert.equal(isImmersiveState("profile"),false); });
test("shrink destination follows the runtime avatar rectangle", () => {
  const target = computeShrinkTarget({ left:0, top:0, width:360, height:800 }, { left:124, top:96, width:112, height:112 });
  assert.deepEqual(target, { x:0, y:-248, scale:112/360, clipRadius:180 });
});
test("shrink lands on the avatar across mobile viewport sizes", () => {
  for (const [width,height] of [[360,800],[390,844],[412,915]]) {
    const avatar = { left:(width-112)/2, top:96, width:112, height:112 };
    const result = computeShrinkTarget({ left:0, top:0, width, height }, avatar);
    assert.equal(width/2 + result.x, avatar.left + avatar.width/2);
    assert.equal(height/2 + result.y, avatar.top + avatar.height/2);
    assert.ok(Math.abs(result.clipRadius * result.scale * 2 - avatar.width) < 0.001);
  }
});
