// Public Profile responsive height / overflow: the profile sizes itself to its visible content and the PAGE scrolls.
// Root cause (proved against the previous implementation in a browser): the public stage was a position:fixed full-viewport overlay whose iframe was 100% of the viewport,
// inside which the profile had 100svh / min-height / overflow:hidden|auto heights, while the provider panel and Replay Intro were separate position:fixed elements (the
// panel with max-height:40svh + overflow:auto). Content taller than the viewport was clipped or scrolled inside boxes, and on desktop a viewport-tall box held a short profile.
// This file covers the structural fix: flow-layout.js (behavior), the stylesheets (no viewport/fixed sizing in the flow layout), the markup order and the wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFlowLayout, createHeightReporter, FLOW_MAX_HEIGHT } from "../dist/flow-layout.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const publicCss = read("dist/public/public.css");
const publicJs = read("dist/public/public.js");
const publicHtml = read("dist/public/index.html");
const previewCss = read("dist/account/intro-preview.css");
const previewJs = read("dist/account/intro-preview.js");
const baseCss = read("dist/styles.css");

// --------------------------------------------------------------------------------------------------------------- helpers
function fakeHost() {
  const shell = { dataset: { mode: "loading" } };
  const frame = { style: { height: "" } };
  const classes = new Set();
  const root = { classList: { toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); } } };
  const calls = { scrollToTop: 0, entered: 0 };
  const layout = createFlowLayout({ shell, frame, root, scrollToTop: () => { calls.scrollToTop += 1; }, onEnterFlow: () => { calls.entered += 1; } });
  return { shell, frame, classes, calls, layout };
}
const rulesOf = css => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].trim(), body: match[2] }));
const ruleFor = (css, selector) => rulesOf(css).find(rule => rule.selector === selector);

// --------------------------------------------------------------------------------------------------------------- flow-layout.js: the host page
test("the page starts as the full-viewport stage the Intro needs and NEVER guesses a height: showing the profile without a reported height keeps the overlay", () => {
  const h = fakeHost();
  assert.equal(h.layout.mode, "experience");
  h.layout.setProfileShowing(true);
  assert.equal(h.layout.mode, "experience", "no height is known yet, so no flow");
  assert.equal(h.frame.style.height, "", "no height was invented");
  assert.equal(h.shell.dataset.mode, "experience");
  assert.equal(h.classes.has("is-public-flow"), false);
});

test("once the profile is showing AND its real height is known, the page becomes flow and the frame is exactly that tall (height first or profile first)", () => {
  const a = fakeHost();
  a.layout.setProfileShowing(true);
  a.layout.setHeight(612.2);
  assert.equal(a.layout.mode, "flow");
  assert.equal(a.frame.style.height, "613px", "rounded UP so the last pixel of content is never clipped");
  assert.equal(a.shell.dataset.mode, "flow");
  assert.ok(a.classes.has("is-public-flow"));
  const b = fakeHost();
  b.layout.setHeight(480);
  assert.equal(b.layout.mode, "experience", "a known height alone is not enough: the Intro may still be playing");
  b.layout.setProfileShowing(true);
  assert.equal(b.layout.mode, "flow");
  assert.equal(b.frame.style.height, "480px");
});

test("the frame follows the content: it grows when content is added and shrinks when it is removed, with no reserved area and no extra flow entry", () => {
  const h = fakeHost();
  h.layout.setProfileShowing(true);
  const seen = [];
  for (const height of [504, 630, 731, 852, 1232, 731, 630, 504]) { h.layout.setHeight(height); seen.push(h.frame.style.height); }
  assert.deepEqual(seen, ["504px", "630px", "731px", "852px", "1232px", "731px", "630px", "504px"]);
  assert.equal(h.calls.entered, 1, "entering flow is announced once, not on every height change");
  assert.equal(h.calls.scrollToTop, 0);
});

test("anything that is not a sane positive number is ignored: 0, negative, NaN, Infinity, strings, objects and absurd values never change the frame", () => {
  const h = fakeHost();
  h.layout.setProfileShowing(true);
  h.layout.setHeight(700);
  for (const bad of [0, -5, NaN, Infinity, -Infinity, "abc", "", null, undefined, {}, [], FLOW_MAX_HEIGHT, FLOW_MAX_HEIGHT * 10]) h.layout.setHeight(bad);
  assert.equal(h.frame.style.height, "700px");
  assert.equal(h.layout.mode, "flow");
  const fresh = fakeHost();
  fresh.layout.setProfileShowing(true);
  for (const bad of [0, NaN, "x", null]) fresh.layout.setHeight(bad);
  assert.equal(fresh.layout.mode, "experience", "junk never enters flow");
  h.layout.setHeight("845");
  assert.equal(h.frame.style.height, "845px", "a numeric string is accepted");
});

test("Replay Intro / a new Intro puts the full-viewport stage back at once (frame height cleared, page returned to the top), and the profile flows again afterwards", () => {
  const h = fakeHost();
  h.layout.setProfileShowing(true);
  h.layout.setHeight(900);
  h.layout.enterExperience();
  assert.equal(h.layout.mode, "experience");
  assert.equal(h.frame.style.height, "", "the frame is 100% of the viewport again");
  assert.equal(h.calls.scrollToTop, 1);
  assert.equal(h.classes.has("is-public-flow"), false);
  h.layout.setProfileShowing(false);            // the Intro's own state broadcast
  assert.equal(h.calls.scrollToTop, 1, "no second scroll reset while already in the overlay");
  h.layout.setProfileShowing(true);             // Intro over; the profile re-reports its height
  h.layout.setHeight(905);
  assert.equal(h.layout.mode, "flow");
  assert.equal(h.frame.style.height, "905px");
  assert.equal(h.calls.entered, 2);
});

test("the Intro and its transition (profile not showing) always use the overlay, whatever height was reported before", () => {
  const h = fakeHost();
  h.layout.setHeight(640);
  for (const showing of [false, false, false]) { h.layout.setProfileShowing(showing); assert.equal(h.layout.mode, "experience"); assert.equal(h.frame.style.height, ""); }
  h.layout.setProfileShowing(true);
  assert.equal(h.layout.mode, "flow");
});

// --------------------------------------------------------------------------------------------------------------- flow-layout.js: the profile document
test("the height reporter sends the content height only when it is measurable and only when it changed (no jitter, no resize loop)", () => {
  const sent = [];
  let active = false;
  let height = 0;
  const report = createHeightReporter({ measure: () => height, active: () => active, post: value => sent.push(value) });
  assert.equal(report(), false, "inactive (Intro playing / frame hidden): nothing is sent");
  active = true;
  assert.equal(report(), false, "a hidden frame measures 0: nothing is sent");
  height = 563.2;
  assert.equal(report(), true);
  assert.deepEqual(sent, [564], "rounded up");
  assert.equal(report(), false, "unchanged");
  assert.equal(report(), false);
  height = 563.9;
  assert.equal(report(), false, "sub-pixel change that rounds to the same value: no message");
  height = 1200;
  assert.equal(report(), true);
  height = 700;
  assert.equal(report(), true);
  assert.deepEqual(sent, [564, 1200, 700]);
  for (const bad of [NaN, -1, Infinity * -1]) { height = bad; assert.equal(report(), false, String(bad)); }
  assert.deepEqual(sent, [564, 1200, 700], "junk measurements are never sent");
});

test("leaving flow makes the reporter forget its last value, so returning to the profile ALWAYS reports again (a Replay cannot leave the host with a stale height)", () => {
  const sent = [];
  let active = true;
  const report = createHeightReporter({ measure: () => 640, active: () => active, post: value => sent.push(value) });
  report();
  active = false;
  report();
  active = true;
  report();
  assert.deepEqual(sent, [640, 640]);
});

test("end to end: content sections change -> the reporter reports -> the host frame is exactly that tall (0, 1, 2, 3 and many providers)", () => {
  const h = fakeHost();
  h.layout.setProfileShowing(true);
  let sections = 0;
  const contentHeight = () => 470 + sections * 118;   // a model of "profile + N provider blocks" (the browser matrix measured the real layout)
  const report = createHeightReporter({ measure: contentHeight, active: () => true, post: value => h.layout.setHeight(value) });
  const frames = [];
  for (const count of [0, 1, 2, 3, 12, 3, 0]) { sections = count; report(); frames.push(h.frame.style.height); }
  assert.deepEqual(frames, ["470px", "588px", "706px", "824px", "1886px", "824px", "470px"]);
});

// --------------------------------------------------------------------------------------------------------------- public.css: no viewport / fixed sizing in the flow layout
test("the provider panel and Replay Intro are ordinary content: not fixed, not absolute, no max-height, no internal scrolling, no viewport units", () => {
  const panel = ruleFor(publicCss, ".public-sections");
  const replay = ruleFor(publicCss, ".replay-button");
  assert.ok(panel && replay);
  for (const rule of [panel, replay]) {
    assert.doesNotMatch(rule.body, /position:\s*(fixed|absolute|sticky)/, rule.selector);
    assert.doesNotMatch(rule.body, /max-height|overflow|[^-]height:|\b\d+(\.\d+)?(s|d|l)?vh\b|\bvh\b|svh|dvh/, rule.selector);
    assert.doesNotMatch(rule.body, /(^|;)\s*(top|bottom|left|right)\s*:/, `${rule.selector} has no fixed coordinates`);
  }
  assert.match(panel.body, /position:relative/);
  assert.match(panel.body, /width:min\(38rem,calc\(100% - 2rem\)\)/, "sized against its container, never the viewport");
});

test("no fixed pixel/rem/viewport HEIGHT exists anywhere in the public page stylesheet except the full-viewport overlay the Intro needs", () => {
  // (Public My Games' own components are audited by their own test below: they are `.public-games` / `.pg-*`.)
  const offenders = rulesOf(publicCss).filter(rule => !/^\.public-games|\.pg-/.test(rule.selector)).filter(rule => /(^|;)\s*(min-|max-)?height\s*:/.test(rule.body)).map(rule => `${rule.selector} { ${rule.body.trim()} }`);
  assert.deepEqual(offenders.map(text => text.replace(/\s+/g, " ")), [
    "body { margin:0;min-width:320px;min-height:100svh;background:radial-gradient(circle at 12% 0,#27134e 0,transparent 28rem),var(--bg);color:var(--text) }",   // a FLOOR (the page is never shorter than the viewport), never a cap
    ".site-head { height:4rem;padding:0 1rem;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.07) }",   // the fixed-size header bar
    ".public-shell { min-height:calc(100svh - 4rem);display:grid;place-items:center;padding:2rem 1.1rem }",   // the "loading" / "not found" screens only (overridden once live)
    ".loader { width:2.3rem;height:2.3rem;border:3px solid #292438;border-top-color:var(--cyan);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 1.2rem }",   // the spinner
    ".experience-wrap iframe { display:block;width:100%;height:100%;border:0 }",                                // the Intro overlay
    ".is-public-live .public-shell { display:block;min-height:0;padding:0 }",                                    // resets the loading screen's height
    ".replay-button { position:relative;z-index:1;justify-self:start;margin:1.25rem max(1rem,env(safe-area-inset-left)) calc(1.25rem + env(safe-area-inset-bottom));min-height:2.6rem;padding:.6rem 1rem;border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(10,8,16,.72);color:#fff;font-size:.78rem;font-weight:750 }",   // a touch-target minimum only
  ]);
  assert.doesNotMatch(publicCss, /height:\s*\d{3,}px|height:\s*\d{3,}(\.\d+)?rem/, "no magic height (no 1200px)");
});

test("layout modes: the stage is a fixed overlay ONLY while the Intro plays; in flow the wrapper is static and the shell is a grid whose row height is the taller of profile and panel", () => {
  assert.match(publicCss, /\.experience-wrap\{position:fixed;inset:0;z-index:20;background:#07060b\}/);
  assert.match(publicCss, /html\.is-public-live:not\(\.is-public-flow\)\{overflow:hidden\}/, "the page does not scroll behind the Intro");
  assert.match(publicCss, /html\.is-public-flow\{scrollbar-gutter:stable\}/, "a page scrollbar appearing cannot change the frame width and re-wrap the text in a loop");
  assert.match(publicCss, /\.is-public-live \.public-shell\{display:block;min-height:0;padding:0\}/);
  const shell = ruleFor(publicCss, '.public-shell[data-mode="flow"]');
  assert.match(shell.body, /display:grid/);
  assert.match(shell.body, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(shell.body, /place-items:stretch/, "the base rule centers items; flow must stretch them or the iframe collapses to 300px");
  const wrap = ruleFor(publicCss, '.public-shell[data-mode="flow"] .experience-wrap');
  assert.match(wrap.body, /position:static/);
  assert.match(wrap.body, /grid-area:1\/1/);
  assert.match(ruleFor(publicCss, '.public-shell[data-mode="flow"] .public-sections').body, /grid-area:2\/1/, "below the profile on narrow screens");
  assert.match(ruleFor(publicCss, '.public-shell[data-mode="flow"] .public-games').body, /grid-area:3\/1/, "My Games follows the connections panel");
  assert.match(ruleFor(publicCss, '.public-shell[data-mode="flow"] .replay-button').body, /grid-area:4\/1/, "Replay Intro follows ALL the content, My Games included");
});

test("Public My Games stays ordinary flow content; only its modal is an overlay, and no component has a guessed height", () => {
  const games = ruleFor(publicCss, ".public-games");
  assert.match(games.body, /position:relative/);
  assert.doesNotMatch(games.body, /position:\s*(fixed|absolute|sticky)|max-height|overflow|[^-]height:|\d(s|d|l)?vh\b|svh|dvh/, "the compact section has no height of its own and no inner scrolling: it grows with its rows");
  assert.match(games.body, /width:min\(38rem,calc\(100% - 2rem\)\)/, "sized against its container, never the viewport");
  // every height-related declaration in a My Games component is one of a few named, bounded kinds
  const kinds = [];
  for (const rule of rulesOf(publicCss).filter(item => /^\.public-games|\.pg-/.test(item.selector))) {
    for (const match of rule.body.matchAll(/(?:^|;)\s*((?:min-|max-)?height)\s*:\s*([^;]+)/g)) kinds.push(`${rule.selector} :: ${match[1]}:${match[2]}`);
  }
  assert.deepEqual(kinds.sort(), [
    ".pg-icon :: height:.85rem",                                    // the provenance glyph
    ".pg-panel :: min-height:0",                                    // flex shrink fixes: the library's list may scroll inside the modal, the page behind it does not
    ".pg-row :: min-height:2.9rem",                                 // touch target
    ".pg-scroll,.pg-detail-body :: min-height:0",
    ".pg-search-input :: min-height:2.75rem",                       // touch target
    ".pg-sr :: height:1px",                                         // the visually hidden search label
    ".pg-view :: min-height:0",
    ".pg-viewall,.pg-more :: min-height:2.75rem",                   // touch target
    ".pg-close,.pg-back :: min-height:2.75rem",                     // touch target
    ".pg-panel :: max-height:min(46rem,90svh)",                     // the desktop modal (inside @media(min-width:40rem)): an overlay bounded by the viewport, like the Intro stage
  ].sort());
  assert.match(publicCss, /@media\(min-width:40rem\)\{\.pg-modal\{[^}]*\}\.pg-panel\{[^}]*max-height:min\(46rem,90svh\)/, "the desktop modal is bounded by the viewport (it is an overlay, like the Intro stage)");
  assert.match(publicCss, /\.pg-modal\{position:fixed;inset:0;/, "on mobile the modal is a full-screen sheet");
  assert.match(publicCss, /html\.is-games-open\{overflow:hidden\}/, "the page behind the open library does not scroll");
});

test("desktop composition is kept without overlap: from 80rem the panel sits in the free area beside the identity in the SAME grid row (so its height counts); below that it follows the identity", () => {
  const wide = publicCss.match(/@media\(min-width:80rem\)\{([^@]*)\}\}/)?.[1] || "";
  assert.ok(wide, "a wide-screen rule exists");
  assert.match(wide, /\.public-shell\[data-mode="flow"\] \.public-sections\{[^}]*grid-area:1\/1[^}]*justify-self:end[^}]*align-self:start[^}]*width:21rem/);
  assert.doesNotMatch(wide, /position:\s*(fixed|absolute)/);
  // the identity column is at most 34rem wide, centered; 21rem + margins fit beside it only from (34 + 2 * 22.5) = 79rem, hence 80rem
  assert.ok(34 + 2 * (21 + 1.5) <= 80);
});

test("long provider values cannot force the page wider: the panel and its text wrap and shrink inside their container", () => {
  assert.match(publicCss, /\.public-section\{[^}]*min-width:0/);
  assert.match(publicCss, /\.public-section strong\{[^}]*overflow-wrap:anywhere/);
  assert.match(publicCss, /\.public-section-sub\{[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(publicCss.replace(/\.pg-sr\{[^}]*\}/, ""), /white-space:\s*nowrap|text-overflow:\s*ellipsis/, "legitimate content is never truncated to fit (only the visually hidden search label is nowrap)");
});

// --------------------------------------------------------------------------------------------------------------- intro-preview.css: the profile document
test("in flow mode the profile has NO viewport-based height, min-height or overflow, and only in the public document", () => {
  const flowRules = rulesOf(previewCss).filter(rule => rule.selector.includes('html[data-flow="on"]'));
  assert.ok(flowRules.length >= 4);
  const bodies = Object.fromEntries(flowRules.map(rule => [rule.selector, rule.body]));
  assert.match(bodies['html[data-flow="on"] .preview-only:not(.is-experiencing) .prototype-shell'], /min-height:0/);
  assert.match(bodies['html[data-flow="on"] .preview-only:not(.is-experiencing) .experience'], /height:auto;min-height:0/);
  assert.match(bodies['html[data-flow="on"] .preview-only:not(.is-experiencing) .profile'], /height:auto;min-height:0;overflow:visible/);
  for (const rule of flowRules) assert.doesNotMatch(rule.body.replace("var(--pvh,1vh)", ""), /\dvh|svh|dvh|100%/, rule.selector);
  // every height:auto in this stylesheet is gated to the public flow: an owner's Intro Preview keeps its full-viewport behavior
  for (const rule of rulesOf(previewCss).filter(rule => /height:auto/.test(rule.body))) assert.ok(rule.selector.includes('html[data-flow="on"]'), rule.selector);
  assert.match(previewCss, /\.preview-only \.experience\{width:100%;height:100svh;min-height:100svh;border-radius:0\}/, "the accepted owner preview rule is unchanged");
});

test("the hero keeps its old vertical offset but measured against the HOST viewport (--pvh), so it cannot depend on the frame's own height", () => {
  const hero = ruleFor(previewCss, 'html[data-flow="on"] .preview-only .hero-card');
  assert.match(hero.body, /margin-top:clamp\(1rem,calc\(var\(--pvh,1vh\) \* 9\),6rem\)/);
  assert.doesNotMatch(hero.body.replace("var(--pvh,1vh)", ""), /vh/, "no other viewport unit in the flow rule");
  assert.match(previewCss, /\.preview-only \.hero-card\{margin-top:9vh\}/, "the owner preview keeps its exact offset");
});

test("the shared base stylesheet still describes the accepted Intro layout (this fix adds rules on top, it does not edit them)", () => {
  assert.match(baseCss, /\.is-experiencing \.intro-layer\{position:fixed;inset:0;width:100vw;height:100svh\}/);
  assert.match(baseCss, /body\.is-experiencing\{overflow:hidden;overscroll-behavior:none\}/);
  assert.match(baseCss, /\.experience\{--transition-ms:1400ms;--intro-ms:2500ms;position:relative;width:100%;min-height:100svh;overflow:hidden/);
});

// --------------------------------------------------------------------------------------------------------------- markup + wiring
test("Replay Intro follows the provider panel, which follows the profile; none of them lives inside the fixed stage wrapper", () => {
  const order = ["id=\"experienceWrap\"", "id=\"publicSections\"", "id=\"replayIntroButton\""].map(needle => publicHtml.indexOf(needle));
  assert.ok(order.every(index => index > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "profile, then providers, then Replay Intro");
  const wrap = publicHtml.slice(publicHtml.indexOf('<div id="experienceWrap"'), publicHtml.indexOf("</div>", publicHtml.indexOf('<div id="experienceWrap"')) + 6);
  assert.ok(wrap.includes('id="experienceFrame"'));
  assert.ok(!wrap.includes("replayIntroButton") && !wrap.includes("publicSections"));
  assert.match(publicHtml, /<main id="publicShell" class="public-shell" data-mode="loading">/);
});

test("the host page wires the modes without changing the accepted handshake: same state message, reveal, Replay and sections logic; heights come only from the profile", () => {
  assert.match(publicJs, /import \{ createFlowLayout \} from "\.\.\/flow-layout\.js";/);
  assert.match(publicJs, /if \(!revealed\) \{ revealed = true; loading\.hidden = true; experienceWrap\.hidden = false; \}/);
  assert.match(publicJs, /replayButton\.hidden = !hasIntro \|\| event\.data\.state !== "profile";/);
  assert.match(publicJs, /sectionsPanel\.hidden = !hasSections \|\| event\.data\.state !== "profile";/);
  assert.match(publicJs, /layout\.setProfileShowing\(event\.data\.state === "profile"\);/);
  assert.match(publicJs, /if \(event\.data\?\.type === "gamid-intro-preview-height"\) \{[\s\S]*?layout\.setHeight\(event\.data\.height\);/);
  assert.ok(publicJs.indexOf('replayButton.addEventListener("click", layout.enterExperience)') < publicJs.indexOf('replayButton.addEventListener("click", sendReplay)'), "the overlay is restored BEFORE the Intro config is sent");
  assert.match(publicJs, /document\.documentElement\.classList\.add\("is-public-live"\)/);
  assert.doesNotMatch(publicJs, /style\.height|innerHeight|clientHeight|scrollHeight|\d+px/, "the host never computes or hard-codes a height itself");
  assert.doesNotMatch(publicJs, /location\.reload/);
});

test("the host re-measures after entering flow (bounded, two checks) and asks the profile once it is revealed, because a hidden frame measures 0", () => {
  assert.match(publicJs, /const requestMeasure = \(\) => frame\.contentWindow\?\.postMessage\(\{ type: "gamid-intro-preview-measure" \}, location\.origin\);/);
  assert.match(publicJs, /onEnterFlow: \(\) => \{ setTimeout\(requestMeasure, 250\); setTimeout\(requestMeasure, 1200\); \}/);
  assert.equal([...publicJs.matchAll(/requestMeasure\(\);/g)].length, 1, "one request on reveal");
  assert.doesNotMatch(publicJs, /setInterval|requestAnimationFrame/, "no polling loop");
});

test("the profile document reports its height only in the public document, only through the reporter, and keeps the existing message contract intact", () => {
  assert.match(previewJs, /import \{ createHeightReporter \} from "\.\.\/flow-layout\.js";/);
  assert.match(previewJs, /document\.documentElement\.dataset\.flow=config\.publicMode===true\?"on":"";/);
  assert.match(previewJs, /parent\.postMessage\(\{type:"gamid-intro-preview-state",state\},location\.origin\); reportHeight\(\); \}/);
  assert.match(previewJs, /post:height=>parent\.postMessage\(\{type:"gamid-intro-preview-height",height\},location\.origin\)/);
  assert.match(previewJs, /function flowActive\(\)\{return document\.documentElement\.dataset\.flow==="on"&&!document\.body\.classList\.contains\("is-experiencing"\);\}/, "never while the Intro plays");
  assert.match(previewJs, /measure:\(\)=>flowShell\.getBoundingClientRect\(\)\.height/, "measured on the profile's own content-sized block, never on the document or the frame");
  assert.match(previewJs, /new ResizeObserver\(reportHeight\)\.observe\(flowShell\)/);
  assert.match(previewJs, /addEventListener\("resize",\(\)=>\{syncParentViewport\(\);reportHeight\(\);\}\)/);
  assert.match(previewJs, /gamid-intro-preview-measure/);
  assert.match(previewJs, /parent\.postMessage\(\{type:"gamid-intro-preview-ready"\},location\.origin\)/);
  assert.doesNotMatch(read("dist/account/account.js"), /flow-layout|data-flow|gamid-intro-preview-height|publicMode/, "the owner's Intro Preview (no publicMode) is untouched");
});

test("only same-origin messages are ever accepted or sent, and no cross-origin assumption was introduced", () => {
  assert.match(publicJs, /if \(event\.origin !== location\.origin\) return;/);
  assert.match(previewJs, /event\.origin===location\.origin&&event\.data\?\.type==="gamid-intro-preview-measure"/);
  assert.doesNotMatch(previewJs + read("dist/flow-layout.js"), /postMessage\([^)]*"\*"/);
  assert.match(previewJs, /try\{document\.documentElement\.style\.setProperty\("--pvh"/, "reading the host viewport is guarded");
});

test("nothing about the Intro engine, transitions, provider data or visibility changed: the section renderer and the transition engine are byte-for-byte the accepted ones in behavior", () => {
  for (const symbol of ["renderPublicSections", "leagueRankLine", "PROTOTYPE / UNVERIFIED", "OPGG_TEMPORARY", "SteamID64", "CONNECTED"]) assert.ok(publicJs.includes(symbol), symbol);
  assert.doesNotMatch(read("dist/transition-engine.js"), /flow|gamid-intro-preview-height/);
  assert.match(previewJs, /import \{ computeShrinkTarget, effectiveTransitionDuration, nextExperienceState, resolvePreset \} from "\.\.\/transition-engine\.js";/);
});
