import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLandscapeHint, landscapeHintEligible, HINT_MS, HINT_FADE_MS } from '../dist/account/intro-landscape.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function element() {
  const listeners = {};
  const classes = new Set();
  return {
    hidden: true, dataset: {}, attrs: {}, offsetWidth: 0,
    classList: { add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)), contains: c => classes.has(c) },
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    click() { for (const fn of listeners.click || []) fn({ preventDefault() {}, stopPropagation() {} }); },
  };
}
function world({ fullscreen = true, lock = 'ok' } = {}) {
  const docListeners = {};
  const calls = { request: 0, exit: 0, lock: 0, unlock: 0 };
  const fire = () => (docListeners.fullscreenchange || []).forEach(fn => fn());
  const doc = {
    fullscreenEnabled: fullscreen, fullscreenElement: null,
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    exitFullscreen() { calls.exit++; this.fullscreenElement = null; fire(); return Promise.resolve(); },
  };
  const target = element();
  if (fullscreen) target.requestFullscreen = () => { calls.request++; doc.fullscreenElement = target; fire(); return Promise.resolve(); };
  let now = 0; const timers = [];
  const win = {
    setTimeout(fn, ms) { const t = { at: now + ms, fn, id: timers.length + 1 }; timers.push(t); return t.id; },
    clearTimeout(id) { const t = timers.find(x => x.id === id); if (t) t.cleared = true; },
    advance(ms) { now += ms; for (const t of timers) if (!t.cleared && !t.done && t.at <= now) { t.done = true; t.fn(); } },
    screen: { orientation: { lock: async () => { calls.lock++; if (lock === 'reject') throw Error('NotSupportedError'); }, unlock: () => { calls.unlock++; } } },
  };
  const hint = element(), exit = element();
  const controller = createLandscapeHint({ doc, win, target, hint, exit });
  return { doc, win, target, hint, exit, calls, controller, fire };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('the landscape hint is offered only for landscape videos on a portrait touch screen with known metadata', () => {
  const base = { videoWidth: 1920, videoHeight: 1080, viewportWidth: 390, viewportHeight: 844, coarse: true };
  assert.equal(landscapeHintEligible(base), true);
  assert.equal(landscapeHintEligible({ ...base, videoWidth: 1440, videoHeight: 1080 }), true, '4:3 is landscape');
  assert.equal(landscapeHintEligible({ ...base, videoWidth: 1080, videoHeight: 1920 }), false, 'portrait video');
  assert.equal(landscapeHintEligible({ ...base, videoWidth: 1080, videoHeight: 1080 }), false, 'square video');
  assert.equal(landscapeHintEligible({ ...base, videoWidth: 0, videoHeight: 0 }), false, 'metadata not loaded');
  assert.equal(landscapeHintEligible({ ...base, viewportWidth: 844, viewportHeight: 390 }), false, 'already landscape');
  assert.equal(landscapeHintEligible({ ...base, coarse: false }), false, 'desktop pointer');
});

test('the hint shows once per presentation, stays 6 seconds (fading from 5.5 s) and is gone at 6 seconds', () => {
  assert.equal(HINT_MS, 6000);assert.equal(HINT_FADE_MS, 500);
  const { win, hint, controller } = world();
  assert.equal(controller.show(1), true);
  assert.equal(hint.hidden, false);assert.ok(hint.classList.contains('is-showing'));
  assert.equal(hint.attrs['aria-label'], 'Watch in landscape fullscreen');
  assert.equal(controller.show(1), false, 'no duplicate for the same presentation');
  win.advance(HINT_MS - HINT_FADE_MS);assert.ok(hint.classList.contains('is-leaving'));assert.equal(hint.hidden, false);
  win.advance(HINT_FADE_MS);assert.equal(hint.hidden, true);
  assert.equal(controller.show(1), false, 'never repeated after it went');
  assert.equal(controller.show(2), true, 'a new presentation (replay) may show it once');
  controller.hide();win.advance(HINT_MS);assert.equal(hint.hidden, true, 'cancelled timers do not reopen it');
});

test('tapping the hint enters fullscreen and locks landscape; Exit leaves fullscreen and unlocks; nothing touches playback', async () => {
  const { hint, exit, calls, controller } = world();
  controller.show(1);hint.click();await flush();
  assert.equal(calls.request, 1);assert.equal(calls.lock, 1);assert.equal(controller.active, true);
  assert.equal(hint.hidden, true, 'the hint closes when tapped');assert.equal(exit.hidden, false, 'a clear way back');
  exit.click();await flush();
  assert.equal(calls.exit, 1);assert.equal(calls.unlock, 1);assert.equal(controller.active, false);assert.equal(exit.hidden, true);
  const source = read('dist/account/intro-landscape.js');
  assert.doesNotMatch(source, /\.play\(|\.pause\(|currentTime|\.src\b|\.load\(/, 'the hint never plays, pauses, seeks or reloads the Intro');
});

test('the hint is still tappable while it fades', async () => {
  const { win, hint, calls, controller } = world();
  controller.show(1);win.advance(HINT_MS - HINT_FADE_MS + 200);assert.ok(hint.classList.contains('is-leaving'));assert.equal(hint.hidden, false);
  hint.click();await flush();assert.equal(calls.request, 1);assert.equal(controller.active, true);
});

test('a refused orientation lock keeps fullscreen and playback working, and an external exit cleans up', async () => {
  const { exit, calls, controller, doc, fire } = world({ lock: 'reject' });
  assert.equal(await controller.enter(), true);
  assert.equal(controller.active, true);assert.equal(exit.hidden, false);
  doc.fullscreenElement = null;fire();   // system Back / gesture
  assert.equal(exit.hidden, true);assert.equal(calls.unlock, 0, 'nothing to unlock after a refused lock');
  const ok = world();await ok.controller.enter();ok.doc.fullscreenElement = null;ok.fire();
  assert.equal(ok.calls.unlock, 1, 'leaving fullscreen any way restores the orientation');
});

test('without the Fullscreen API the hint is a manual-rotation cue that only dismisses itself', async () => {
  const { hint, calls, controller } = world({ fullscreen: false });
  controller.show(1);
  assert.equal(hint.dataset.mode, 'rotate');assert.equal(hint.attrs['aria-label'], 'Rotate your phone to watch in landscape');
  hint.click();await flush();
  assert.equal(hint.hidden, true);assert.equal(calls.request, 0);assert.equal(calls.lock, 0);
});

test('the shared Intro player wires the hint without autoplay or a second video', () => {
  const player = read('dist/account/intro-preview.js');
  assert.match(player, /createLandscapeHint\(\{ target: els\.introLayer/);
  assert.match(player, /landscapeHintEligible\(\{videoWidth:media\.width,videoHeight:media\.height/);
  assert.match(player, /function mediaSize\(\)\{const v=els\.introVideo;return v\.videoWidth&&v\.videoHeight\?\{width:v\.videoWidth,height:v\.videoHeight\}:still\?\{width:still\.width,height:still\.height\}:null;\}/);
  assert.match(player, /function releasePlayback\(\)\{[^}]*landscape\.hide\(\);landscape\.leave\(\);/, 'stop, skip, page hide and the end release the hint and fullscreen');
  assert.match(player, /if\(landscape\.active\)\{if\(!endingAfterFullscreen\)/, 'the transition waits until fullscreen has closed');
  const html = read('dist/account/intro-preview.html');
  assert.equal((html.match(/<video\b/g) || []).length, 1, 'one Intro video');
  assert.match(html, /id="landscapeHint" type="button" hidden aria-label="Watch in landscape fullscreen"/);
  assert.match(read('dist/public/index.html'), /id="experienceFrame"[^>]*allow="autoplay; fullscreen"/);
  assert.match(read('dist/account/index.html'), /id="introPreviewFrame"[^>]*allow="autoplay; fullscreen"/);
});
