import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, clampDuration, effectiveTransitionDuration, nextExperienceState, resolvePreset } from "../dist/transition-engine.js";

test("all five approved presets are available", () => assert.deepEqual(Object.keys(PRESETS), ["fade", "blur", "shrink", "slide", "split"]));
test("intro reaches profile through transition", () => { let s="intro"; s=nextExperienceState(s,"INTRO_COMPLETE"); assert.equal(s,"transitioning"); s=nextExperienceState(s,"TRANSITION_COMPLETE"); assert.equal(s,"profile"); });
test("skip reveals profile immediately", () => assert.equal(nextExperienceState("intro","SKIP"),"profile"));
test("replay resets profile to intro", () => assert.equal(nextExperienceState("profile","REPLAY"),"intro"));
test("duration is configurable and safely bounded", () => { assert.equal(clampDuration(900),900); assert.equal(clampDuration(2),300); assert.equal(clampDuration(20000),10000); });
test("unknown preset safely falls back", () => assert.equal(resolvePreset("future"),PRESETS.fade));
test("reduced motion uses a brief simple reveal", () => { assert.equal(effectiveTransitionDuration(2400,true),180); assert.equal(effectiveTransitionDuration(2400,false),2400); });
