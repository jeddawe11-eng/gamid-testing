// Silent UI policy (Mazen, 2026-10-21; temporary, a future audio-design review may change it): GamID's own interface makes no sound. Only the Intro keeps its audio.
// The audit found NO application-owned UI sound (no audio element, Web Audio, oscillator, sound file, speech, vibration or system notification) and no audio
// infrastructure, so the policy is this guard plus the Truth contract `silent-ui-policy`: a new UI sound cannot ship without a deliberate change here.
// It is reversible (change this test and the contract) and touches no audio file, the Intro or any user / provider media.
// User media keeps its own accepted behavior and is not decided here: Wall videos always play muted; third-party players (YouTube, Twitch, Kick, ...) play only
// when the visitor starts them, under the provider's own controls.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const walk = (dir, out = []) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) walk(full, out); else out.push(full); } return out; };
const shipped = walk(join(root, "dist")).map(file => relative(root, file).replace(/\\/g, "/"));
const code = shipped.filter(file => /\.(js|mjs|html)$/.test(file));
const read = file => readFileSync(join(root, file), "utf8");

test("no application-owned UI sound source ships: no audio element, Web Audio, oscillator, speech, vibration or system notification", () => {
  const SOURCES = [/new\s+Audio\s*\(/, /\b(webkit)?AudioContext\b/, /createOscillator/, /<audio\b/i, /createElement\(\s*["']audio["']\s*\)/, /speechSynthesis|SpeechSynthesisUtterance/,
    /navigator\.vibrate/, /new\s+Notification\s*\(/, /showNotification\s*\(/, /Notification\.requestPermission/];
  for (const file of code) {
    const text = read(file).replace(/\/\/.*$/gm, "");
    for (const pattern of SOURCES) assert.doesNotMatch(text, pattern, `${file}: ${pattern} - GamID's interface is silent (silent-ui-policy); only the Intro has audio`);
  }
});

test("no sound file ships with the site", () => {
  assert.deepEqual(shipped.filter(file => /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/i.test(file)), []);
  for (const file of code) assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ""), /["'`][^"'`\s]+\.(mp3|wav|ogg|oga|m4a|aac|flac)["'`]/i, `${file}: references a sound file`);
});

test("every <video> GamID creates is muted or never played - except the Intro, which keeps its audio (its accepted contract)", () => {
  // where a video element is created, and why it is allowed
  const ALLOWED = {
    "dist/account/intro-preview.html": "the Intro player (#introVideo): the Intro keeps its audio - exempt",
    "dist/account/intro-preview.js": "Intro preview: only its split / ambient clones are created here, muted",
    "dist/account/account.js": "reads an Intro source's duration (metadata only, never played)",
    "dist/account/editor-media.js": "muted frame capture",
    "dist/account/index.html": "the Discord thumbnail picker (#introThumbnailVideo): muted, only scrubbed while paused, never played",
    "dist/wall-editor/assets.js": "muted metadata probe of an upload",
    "dist/wall-editor/video-preview.js": "muted still-frame probe, never played",
    "dist/wall-kit/video-background.js": "Wall background / video layers: always muted",
  };
  const uncommented = file => read(file).replace(/\/\/.*$/gm, "").replace(/<!--[\s\S]*?-->/g, "");
  const creators = code.filter(file => !file.startsWith("dist/prototypes/") && (/(createElement|createNode)\(\s*["']video["']\s*\)/.test(uncommented(file)) || /<video\b/.test(uncommented(file))));
  assert.deepEqual(creators.sort(), Object.keys(ALLOWED).sort(), "a new place that creates a <video> needs a silent-UI review");
  for (const file of ["dist/account/editor-media.js", "dist/wall-editor/assets.js", "dist/wall-editor/video-preview.js", "dist/wall-kit/video-background.js"]) assert.match(read(file), /\.muted\s*=\s*true/, file);
  assert.match(read("dist/account/intro-preview.js"), /clone\.muted=true/);
  assert.match(read("dist/account/index.html"), /<video id="introThumbnailVideo" class="intro-thumbnail-frame" muted /, "the thumbnail picker's frame is muted");
  assert.doesNotMatch(read("dist/account/intro-thumbnail.js"), /\.play\(|autoplay|controls/, "the thumbnail picker only seeks a paused video");
  assert.doesNotMatch(read("dist/account/account.js").slice(read("dist/account/account.js").indexOf('const video = document.createElement("video");'), read("dist/account/account.js").indexOf('const video = document.createElement("video");') + 600), /\.play\(/, "the duration probe never plays");
  assert.match(read("dist/account/intro-preview.html"), /<video id="introVideo" playsinline preload="metadata"><\/video>/, "the Intro player is unchanged (not muted by this policy)");
});
