// Public Intro manual play (Mazen 2026-10-27): the visitor Intro never starts by itself. The first presentation shows the owner's chosen Discord thumbnail frame
// (else the first frame) in the existing full-screen player and waits for Play; Play starts it from 0:00 with sound; Replay is a click and plays at once; Skip
// stays available; the editor's own Preview Intro and the Discord card are unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const player = read("dist/account/intro-preview.js");
const playerHtml = read("dist/account/intro-preview.html");
const playerCss = read("dist/account/intro-preview.css");
const publicJs = read("dist/public/public.js");
const client = read("dist/account/supabase-client.js");
const account = read("dist/account/account.js");

test("player: a config with awaitPlay shows the Play button and never calls play() until it is pressed", () => {
  assert.match(player, /const awaitPlay=config\.awaitPlay===true;/);
  assert.match(player, /if\(awaitPlay\)els\.previewStart\.hidden=false;else start\(\);els\.previewStart\.onclick=start;/);
  // the only play() of the main Intro video is inside start(), which only the Play button runs while waiting
  assert.equal(player.match(/els\.introVideo\.play\(\)/g).length, 1);
  assert.match(player, /const start=\(\)=>\{if\(current!==token\)return;if\(waiting\)\{/);
  // no autoplay attribute anywhere in the player
  assert.doesNotMatch(playerHtml, /<video[^>]*id="introVideo"[^>]*autoplay/);
  assert.doesNotMatch(player, /introVideo\.autoplay|setAttribute\("autoplay"/);
});

test("player: the waiting poster is the chosen frame in the same video element, and Play starts from 0:00", () => {
  assert.match(player, /els\.introVideo\.currentTime=awaitPlay\?posterSeconds\(config\.posterMs\):0;/);
  assert.match(player, /function posterSeconds\(ms\)\{return Number\.isFinite\(ms\)&&ms>0\?ms\/1000:0;\}/);
  assert.match(player, /leaseTimer=setTimeout\(terminatePlayback,Math\.max\(0,config\.sourceExpiresAt-Date\.now\(\)\)\);\}els\.introVideo\.currentTime=0;\}els\.introVideo\.play\(\)/);
});

test("player: a waiting Intro is not ended by its lease; Play on a lease too short for the Intro asks the host for a fresh one", () => {
  assert.match(player, /if\(Number\.isFinite\(config\.sourceExpiresAt\)&&!awaitPlay\)\{leaseTimer=/);
  assert.match(player, /if\(config\.sourceExpiresAt-Date\.now\(\)<leaseNeededMs\(\)\)\{els\.previewStart\.hidden=true;parent\.postMessage\(\{type:"gamid-intro-preview-play"\},location\.origin\);return;\}/);
  // the same margin the resolver guarantees for every playback, so a renewed lease always suffices (and the renewed config plays without waiting again)
  assert.match(player, /function leaseNeededMs\(\)\{return 35000;\}/);
  assert.match(read("dist/account/intro-source.js"), /const PLAYBACK_MARGIN_MS = 35000;/);
});

test("player: a clear centered Play button with a Play icon and the label Play Intro; Skip stays in the player", () => {
  assert.match(playerHtml, /<button class="preview-start" id="previewStart" type="button" hidden><svg class="preview-start-icon"[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Play Intro<\/button><button class="skip" id="skipButton">/);
  assert.match(playerCss, /\.preview-start\{position:absolute;z-index:12;inset:50% auto auto 50%;transform:translate\(-50%,-50%\)/);
  assert.match(playerCss, /\.preview-start\[hidden\]\{display:none\}/);
  assert.doesNotMatch(playerHtml, /Tap to play/);
});

test("public page: only the first presentation waits for Play; Replay plays at once; a lease renewal never stops the paused Intro first", () => {
  assert.match(publicJs, /let awaitFirstPlay = true, renewLease = false;/);
  assert.match(publicJs, /const awaitPlay = awaitFirstPlay && !renewLease; awaitFirstPlay = false;\n\s*const renewing = renewLease;\n\s*if \(renewLease\) \{ renewLease = false; introRequest\+\+; \} else stopIntro\(\);/);
  assert.match(publicJs, /transitionKey: latestIntroIdentity\.intro_transition_key \|\| "fade", awaitPlay, posterMs, still \};/);
  assert.match(publicJs, /if \(event\.data\?\.type === "gamid-intro-preview-play" && event\.source === frame\.contentWindow && hasIntro && !ownerPreview\) \{ renewLease = true; sendReplay\(\); \}/);
  // the poster is looked up only for a waiting presentation with a signed source, and a failed lookup keeps the first frame
  assert.match(publicJs, /if \(awaitPlay && source\?\.url && latestIntroIdentity\?\.gamid_handle\) \{ try \{ \(\{ posterMs, still \} = await getPublicIntroPoster\(latestIntroIdentity\.gamid_handle\)\); \} catch/);
  // a renewed lease keeps the poster on screen; Replay never shows one
  assert.match(publicJs, /let posterMs = null, still = renewing \? config\.still \?\? null : null;/);
});

test("public poster lookup: the existing anonymous get_public_intro_share, its thumbnail time only (no storage path leaves the function)", () => {
  const fn = client.slice(client.indexOf("export async function getPublicIntroPosterMs"), client.indexOf("export async function getPublicProfileExtras"));
  assert.match(fn, /rpc\("get_public_intro_share", \{ candidate_handle: handle \}, \{ anonymous: true \}\)\)\?\.\[0\]\?\.thumbnail_ms/);
  assert.doesNotMatch(fn, /share_path/);
  assert.match(fn, /return Number\.isFinite\(ms\) && ms > 0 \? ms : null;/);
});

test("the owner's editor Preview Intro is unchanged: it never asks the player to wait", () => {
  assert.doesNotMatch(account, /awaitPlay|posterMs/);
});
