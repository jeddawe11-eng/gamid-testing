// Mobile Public Wall Visitor V2 (Mazen's task 2026-10-22): the published Wall on a phone. The browser E2E is scripts/public-wall-mobile-check.mjs; these checks pin
// the sizing rule, the stage tracking and the scoping that keep tablets, desktops and the Wall's own design unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stageWidthFor, WALL_PHONE_QUERY, WALL_PHONE_BAR_PX, WALL_MAX_WIDTH, WALL_MIN_WIDTH } from "../dist/public/public-wall.js";
import { currentStageIndex, scrollAnchor } from "../dist/public/public-wall-nav.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const css = read("dist/public/public-wall-mobile.css");
const wallJs = read("dist/public/public-wall.js"), navJs = read("dist/public/public-wall-nav.js");
const canvas = { width: 1000, height: 1778 };

test("scope: portrait phones and landscape phones (at most 500px tall, below 1024px wide); tablets and desktops keep the accepted column", () => {
  assert.equal(WALL_PHONE_QUERY, "(max-width: 599px), (orientation: landscape) and (max-height: 500px) and (max-width: 1023px)");
  assert.equal(WALL_MAX_WIDTH, 900);
  assert.equal(WALL_MIN_WIDTH, 280);
  for (const column of [768, 1024, 1280, 1440]) assert.equal(stageWidthFor({ column, viewportHeight: 700, canvas, phone: false, multi: true }), Math.min(900, column), "not a phone: the column width, as before");
  assert.equal(stageWidthFor({ column: 200, viewportHeight: 700, canvas, phone: false }), 280, "the accepted minimum");
});

test("phone sizing: one whole stage fits the screen (above the portrait stage bar), in the Wall's own proportions; landscape Wide fills the column", () => {
  assert.equal(WALL_PHONE_BAR_PX, 64);
  // portrait: typical phones are unchanged (the stage is as wide as the screen)
  assert.equal(stageWidthFor({ column: 390, viewportHeight: 844, canvas, phone: true, multi: true }), 390);
  assert.equal(stageWidthFor({ column: 430, viewportHeight: 932, canvas, phone: true, multi: true }), 430);
  // a short phone: the stage and the bar fit together
  assert.equal(stageWidthFor({ column: 320, viewportHeight: 568, canvas, phone: true, multi: true }), Math.floor((568 - 64) * 1000 / 1778));
  // a one-stage Wall has no bar to leave room for
  assert.equal(stageWidthFor({ column: 320, viewportHeight: 568, canvas, phone: true, multi: false }), 319);
  // landscape: the whole stage (Fit), or the column's width (Wide)
  assert.equal(stageWidthFor({ column: 708, viewportHeight: 390, canvas, phone: true, landscape: true, multi: true }), 219);
  assert.equal(stageWidthFor({ column: 708, viewportHeight: 390, canvas, phone: true, landscape: true, wide: true, multi: true }), 708);
  assert.equal(stageWidthFor({ column: 1000, viewportHeight: 430, canvas, phone: true, landscape: true, wide: true }), 900, "never wider than the desktop column");
  assert.equal(stageWidthFor({ column: 300, viewportHeight: 100, canvas, phone: true, landscape: true }), 120, "a floor for tiny screens");
  // another canvas shape keeps ITS proportions
  assert.equal(stageWidthFor({ column: 800, viewportHeight: 400, canvas: { width: 1600, height: 900 }, phone: true, landscape: true }), 711);
});

test("the stage under the middle of the screen is the current one; a repaint returns to the same stage and place", () => {
  const rects = [{ top: -700, bottom: -7, height: 693 }, { top: -7, bottom: 686, height: 693 }, { top: 686, bottom: 1379, height: 693 }];
  assert.equal(currentStageIndex(rects, 844), 1);
  assert.equal(currentStageIndex([], 844), -1);
  assert.equal(currentStageIndex([{ top: -2000, bottom: -1000 }, { top: -1000, bottom: -100 }], 844), 1, "past the end: the nearest stage");
  assert.deepEqual(scrollAnchor(rects), { index: 1, fraction: 7 / 693 });
  assert.deepEqual(scrollAnchor([{ top: 50, bottom: 743, height: 693 }]), { index: 0, fraction: 0 });
  assert.equal(scrollAnchor([]), null);
});

test("the phone stylesheet: every layout rule is scoped to a phone showing a published Wall; no scroll snapping; 44px controls; safe areas", () => {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(match => match[1].trim()).filter(selector => !/^(@|from|to)/.test(selector));
  const free = [".public-wall-vh", ".wall-stage-nav[hidden],.wall-stage-nav [hidden]", ".public-wall-state"];
  for (const selector of rules) {
    if (free.includes(selector)) continue;
    for (const part of selector.split(",")) assert.match(part.trim(), /^html\.is-public-wall\.is-wall-phone/, selector);
  }
  assert.doesNotMatch(css, /scroll-snap/, "the page scrolls freely (snapping pulled it back from Replay Intro)");
  assert.match(css, /\.wall-stage-nav-btn,html\.is-public-wall\.is-wall-phone \.wall-stage-nav-fit\{display:inline-grid;place-items:center;min-width:2\.75rem;min-height:2\.75rem;/);
  assert.match(css, /env\(safe-area-inset-left\)/); assert.match(css, /env\(safe-area-inset-right\)/); assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.public-wall-vh\{[^}]*height:calc\(100svh - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)/, "the stable height, without sliding toolbars");
  assert.match(css, /\.wall-stage-nav\{position:fixed;z-index:15;/, "above the Wall (z 1), below the Intro (z 20) and Back to @previous (z 30)");
});

test("wiring: the Wall loads its phone stylesheet; the accepted public.css is untouched by it; the navigator only moves the page", () => {
  assert.match(wallJs, /ensureStyles\(doc, \["\.\.\/wall-kit\/wall-kit\.css", "\.\.\/wall-kit\/game-details\.css", "public-wall-mobile\.css"\]\);/);
  assert.doesNotMatch(read("dist/public/public.css"), /wall-stage-nav|is-wall-phone/);
  // rotation and Fit / Wide never interrupt a player: no repaint while fullscreen, an open inline player is scaled (not repainted) until it is closed
  assert.match(wallJs, /if \(fullscreen\(\)\) \{ waiting = true; return; \}/);
  assert.match(wallJs, /if \(column && players\?\.activeProviders\?\.\(\)\.length\) \{ column\.style\.setProperty\("zoom", String\(target \/ paintedWidth\)\); waiting = true; return; \}/);
  // a Wall that cannot be drawn says so (every size)
  assert.match(wallJs, /"This Wall can't be shown right now\. Please try again later\."/);
  // the navigator: no markup strings, no sound, no document change
  assert.doesNotMatch(navJs, /innerHTML|insertAdjacentHTML|new Audio|AudioContext|\.play\(/);
  assert.doesNotMatch(navJs.replace(/\/\/.*$/gm, ""), /paintDocument|session|rpc|fetch\(/);
  assert.match(navJs, /behavior: reduced\(\) \? "auto" : "smooth"/, "reduced motion: instant moves");
});
