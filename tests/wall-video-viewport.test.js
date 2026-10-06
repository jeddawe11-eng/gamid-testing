import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVideoPool, backgroundVideo } from '../dist/wall-kit/video-background.js';
import { WALL_VIDEO_VIEWPORT_MARGIN } from '../dist/wall-kit/video-viewport.js';
const url = 'https://project.supabase.co/storage/v1/object/sign/wall-video/u/a.mp4?token=t';
function lab(observer = true) {
  const doc = { visibilityState: 'visible', events: {}, addEventListener(k, f) { this.events[k] = f; }, removeEventListener(k) { delete this.events[k]; } };
  const win = { innerWidth: 1000, innerHeight: 600, events: {}, addEventListener(k, f) { this.events[k] = f; }, removeEventListener(k) { delete this.events[k]; }, requestAnimationFrame: f => queueMicrotask(f) };
  let io;
  if (observer) win.IntersectionObserver = class { constructor(fn, options) { io = this; this.fn = fn; this.options = options; this.nodes = []; } observe(n) { this.nodes.push(n); } disconnect() { this.disconnected = true; } };
  const make = () => ({ attrs: {}, listeners: {}, paused: true, isConnected: true, readyState: 1, currentTime: 0, plays: 0, pauses: 0, srcSets: 0,
    setAttribute(k, v) { this.attrs[k] = v; if (k === 'src') this.srcSets++; }, removeAttribute(k) { delete this.attrs[k]; }, addEventListener(k, f) { (this.listeners[k] ??= []).push(f); },
    play() { this.plays++; this.paused = false; return Promise.resolve(); }, pause() { this.pauses++; this.paused = true; }, load() {},
    getBoundingClientRect() { return this.rect ?? { top: 2000, bottom: 2200, left: 0, right: 300 }; }, closest() { return null; },
  });
  const pool = createVideoPool({ viewport: { win, doc } });
  return { pool, make, doc, win, io: () => io, near: (n, yes) => io.fn([{ target: n, isIntersecting: yes }]) };
}
test('F3 far videos: no src, no eager preload/autoplay/play; one shared bounded observer', async () => {
  const l = lab(), videos = Array.from({ length: 5 }, (_, i) => l.pool.take(`el:${i}`, url, l.make));
  await Promise.resolve();
  for (const v of videos) { assert.equal(v.attrs.src, undefined); assert.equal(v.attrs.preload, 'none'); assert.equal(v.autoplay, false); assert.equal(v.plays, 0); }
  assert.deepEqual(l.io().options, { rootMargin: `${WALL_VIDEO_VIEWPORT_MARGIN}px 0px`, threshold: 0 });
  assert.equal(l.io().nodes.length, 5);
});
test('F3 near/visible video attaches source and preserves muted/loop/inline/autoplay; others stay unloaded', () => {
  const l = lab(), a = l.pool.take('el:a', url, l.make), b = l.pool.take('el:b', url, l.make);
  l.near(a, true);
  assert.equal(a.attrs.src, url); assert.equal(a.attrs.preload, 'auto'); assert.equal(a.autoplay, true);
  assert.ok(a.muted && a.defaultMuted && a.loop && a.playsInline); assert.equal(a.controls, false); assert.equal(a.paused, false);
  assert.equal(b.attrs.src, undefined); assert.equal(b.plays, 0);
});
test('F3 leave/canplay/return: pause and guard late events, keep source/time and same pooled node', async () => {
  const l = lab(), a = l.pool.take('el:a', url, l.make); l.near(a, true); a.currentTime = 4;
  l.near(a, false); for (const fn of a.listeners.canplay) fn();
  assert.equal(a.paused, true); assert.equal(a.autoplay, false); assert.equal(a.attrs.preload, 'metadata'); assert.equal(a.attrs.src, url);
  l.near(a, true); assert.equal(a.paused, false); assert.equal(a.currentTime, 4); assert.equal(a.srcSets, 1);
  await Promise.resolve(); assert.equal(l.pool.take('el:a', url, l.make), a); assert.equal(a.srcSets, 1);
});
test('F3 hidden tab and hidden public Wall suspend; resume does not wake far videos', () => {
  const l = lab(), a = l.pool.take('el:a', url, l.make), b = l.pool.take('el:b', url, l.make);
  l.near(a, true); l.doc.visibilityState = 'hidden'; l.doc.events.visibilitychange(); assert.equal(a.paused, true);
  l.doc.visibilityState = 'visible'; l.doc.events.visibilitychange(); assert.equal(a.paused, false); assert.equal(b.attrs.src, undefined);
  l.pool.suspend(); assert.equal(a.paused, true); l.near(a, true); assert.equal(a.paused, true);
  l.pool.resume(); assert.equal(a.paused, false); assert.equal(b.attrs.src, undefined);
});
test('F3 Whole-Wall family copies join active clock; far copies remain source-free', () => {
  const l = lab(), a = l.pool.take('wall:a', url, l.make), b = l.pool.take('wall:a', url, l.make), c = l.pool.take('wall:a', url, l.make);
  l.near(a, true); a.currentTime = 3; l.near(b, true); assert.equal(b.currentTime, 3);
  b.currentTime = 5; for (const fn of b.listeners.canplay) fn(); assert.equal(b.currentTime, 5, "late canplay must not repeatedly seek an already playing sibling");
  l.near(a, false); b.currentTime = 7; l.near(a, true); assert.equal(a.currentTime, 7); assert.equal(c.attrs.src, undefined);
});
test('F3 observer fallback stays lazy and clamps oversized Whole-Wall video to far stage', async () => {
  const l = lab(false), a = l.pool.take('wall:a', url, l.make);
  a.rect = { top: 0, bottom: 4000, left: 0, right: 500 };
  a.closest = selector => selector === '.wall-stage' ? { getBoundingClientRect: () => ({ top: 2000, bottom: 3000, left: 0, right: 500 }) } : null;
  await Promise.resolve(); assert.equal(a.attrs.src, undefined);
  a.closest = () => null; a.rect = { top: 800, bottom: 1000, left: 0, right: 500 };
  l.win.events.scroll(); await Promise.resolve(); assert.equal(a.attrs.src, url);
  a.rect = { top: 1500, bottom: 1700, left: 0, right: 500 }; l.win.events.scroll(); await Promise.resolve(); assert.equal(a.paused, true);
});
test('F3 clearing disconnects observer, drops sources and removes page listeners', () => {
  const l = lab(), a = l.pool.take('el:a', url, l.make); l.near(a, true); l.pool.clear();
  assert.equal(l.io().disconnected, true); assert.equal(a.attrs.src, undefined); assert.equal(l.pool.size, 0); assert.equal(l.doc.events.visibilitychange, undefined);
});
test('F3 opt-in: owner/editor and one-off render retain accepted eager behavior', async () => {
  const l = lab(), pool = createVideoPool(), a = pool.take('el:a', url, l.make); await Promise.resolve();
  assert.equal(a.attrs.src, url); assert.equal(a.attrs.preload, 'auto'); assert.equal(a.autoplay, true); assert.equal(a.paused, false); const one = backgroundVideo(url, l.make); await Promise.resolve(); assert.equal(one.attrs.src, url); assert.equal(one.autoplay, true); assert.equal(one.paused, false); pool.clear();
});
test('F3 visitor integration uses the same pool for layers/backgrounds and suspends on Intro replay; F4 unchanged', () => {
  const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const page = read('dist/public/public-wall.js');
  assert.match(page, /createVideoPool\(\{ viewport: \{ win, doc \} \}\)/); assert.match(page, /videos\?\.suspend\(\)/);
  assert.match(page, /publishedVideoUrls/); assert.match(page, /api.signPublicWallVideo\(path, asset.mime_type\)/);
  assert.match(read('dist/wall-kit/paint.js'), /ctx.videos.take\(`el:\$\{item.id\}`/);
  assert.match(read('dist/wall-kit/paint.js'), /ctx.videos.take\(`\$\{scope\}:\$\{background.assetId\}`/);
  assert.doesNotMatch(read('dist/wall-editor/editor.js'), /createVideoPool\(\{ viewport/);
});
