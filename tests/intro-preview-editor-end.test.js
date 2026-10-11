// ISS-0010: in the Profile Editor, Intro Preview ends in the editor - Skip Intro and the natural end both close the preview dialog (the existing Return to editor
// path), and the Intro frame's own built-in profile card (with its DRAFT · PRIVATE badge) is never shown there. The public visitor flow is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEditorPreviewEnd } from "../dist/account/intro-preview-host.js";
import { nextExperienceState } from "../dist/transition-engine.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// the states the Intro frame posts (intro-preview.js setState -> gamid-intro-preview-state), produced by the real experience state machine
function frameStates(events) {
  let state = "profile"; const posted = [];
  for (const event of events) { state = nextExperienceState(state, event); posted.push(state); }
  return posted;
}
function editor() {
  let ended = 0; const end = createEditorPreviewEnd(() => { ended++; });
  return { end, ended: () => ended };
}

test("ISS-0010: Skip Intro during an editor preview returns to the Profile Editor at once (once)", () => {
  const e = editor();
  for (const s of frameStates(["REPLAY", "SKIP"])) e.end.state(s);       // play, then Skip intro
  assert.deepEqual(frameStates(["REPLAY", "SKIP"]), ["intro", "profile"]);
  assert.equal(e.ended(), 1);
});

test("ISS-0010: the natural end of the previewed Intro returns to the Profile Editor after its transition (once)", () => {
  const e = editor();
  const states = frameStates(["REPLAY", "INTRO_COMPLETE", "TRANSITION_COMPLETE"]);
  assert.deepEqual(states, ["intro", "transitioning", "profile"]);
  for (const s of states) { e.end.state(s); if (s !== "profile") assert.equal(e.ended(), 0, "not before the transition has finished"); }
  assert.equal(e.ended(), 1);
});

test("ISS-0010: a stale or unstarted 'profile' never closes anything; each new preview starts fresh; Replay inside one preview is honoured", () => {
  const e = editor();
  e.end.state("profile");                      // a frame that never played / the previous preview being stopped
  assert.equal(e.ended(), 0);
  e.end.state("intro"); e.end.reset(); e.end.state("profile");   // the owner opened a new preview: the old run cannot end it
  assert.equal(e.ended(), 0);
  e.end.state("intro"); e.end.state("profile"); e.end.state("profile");
  assert.equal(e.ended(), 1, "a second profile report after the end does not close again");
});

test("ISS-0010 editor wiring: hostReveal hides the frame's card, the end and the Return to editor button share one close path, and only the preview frame is listened to", () => {
  const account = read("dist/account/account.js");
  assert.match(account, /import \{ createEditorPreviewEnd \} from "\.\/intro-preview-host\.js";/);
  assert.match(account, /pendingPreviewConfig = \{ \.\.\.currentPreviewConfig\(\), hostReveal: true, sourceExpiresAt: source\?\.expiresAt \};/);
  assert.match(account, /function closeIntroPreviewDialog\(\) \{ stopIntroPreview\(\); document\.getElementById\("introPreviewDialog"\)\.close\(\); \}/);
  assert.match(account, /const previewEnd = createEditorPreviewEnd\(\(\) => \{ if \(document\.getElementById\("introPreviewDialog"\)\.open\) closeIntroPreviewDialog\(\); \}\);/);
  assert.match(account, /document\.getElementById\("closeIntroPreview"\)\.addEventListener\("click", closeIntroPreviewDialog\);/);
  assert.match(account, /event\.data\?\.type === "gamid-intro-preview-state" && event\.source === document\.getElementById\("introPreviewFrame"\)\.contentWindow\) previewEnd\.state\(event\.data\.state\);/);
  assert.match(account, /stopIntroPreview\(\); previewEnd\.reset\(\);\n  const current = previewRequest;/, "every new preview starts fresh");
  assert.doesNotMatch(account, /location\.(href|assign|replace)\s*=?[^;\n]*@|window\.open\(/, "no navigation to the public profile");
});

test("ISS-0010: with hostReveal the frame's built-in profile card (and its DRAFT · PRIVATE badge) is hidden; Skip, transitions and playback code are unchanged", () => {
  const frame = read("dist/account/intro-preview.js"), css = read("dist/account/intro-preview.css"), html = read("dist/account/intro-preview.html");
  assert.match(frame, /document\.documentElement\.classList\.toggle\("host-reveal",config\.hostReveal===true\)/);
  assert.match(css, /html\.host-reveal \.profile\{visibility:hidden\}/);
  assert.match(html, /<article class="profile" id="profile"[\s\S]*id="previewPrivate">DRAFT · PRIVATE<\/span>[\s\S]*<\/article>/, "the badge lives inside the hidden card");
  assert.match(frame, /els\.skipButton\.addEventListener\("click",skipIntro\);/);
  assert.match(frame, /els\.introVideo\.onended=\(\)=>begin\(config,current\);/);
  assert.match(frame, /setState\("INTRO_COMPLETE"\)/);
  assert.match(frame, /function finish\(current\)\{ if\(current!==token\)return; setState\("TRANSITION_COMPLETE"\);/);
});

test("ISS-0010: the public visitor Intro is unchanged - it still reveals the Wall or the Classic Profile, and knows nothing of the editor's end handling", () => {
  const pub = read("dist/public/public.js");
  assert.doesNotMatch(pub, /intro-preview-host|createEditorPreviewEnd|closeIntroPreview/);
  assert.match(pub, /config = wall \? \{ \.\.\.built, hostReveal: true \} : built;/);
  assert.match(pub, /if \(desktopActive\(\)\) config = \{ \.\.\.config, hostReveal: true \};/);
  assert.match(pub, /if \(!wall && desktopActive\(\)\) showDesktop\(event\.data\.state\);/);
  assert.match(pub, /if \(wall\) showWall\(event\.data\.state\);/);
});
