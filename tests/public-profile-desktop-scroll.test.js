// Public profile scroll bug (2026-10-11): on the desktop Classic Profile (1280 px and wider) the page could not be scrolled by the user. The Intro's scroll lock
// (html.is-public-live:not(.is-public-flow){overflow:hidden}) is lifted only in "flow", which needs a height reported by the Intro frame - but on desktop the page draws
// the profile itself and hides that frame, so no height arrives and the lock stayed. Like the published Wall, the desktop profile now scrolls once it shows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFlowLayout } from "../dist/flow-layout.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("dist/public/public.css"), page = read("dist/public/public.js");
const FIX = "html.is-public-live.is-public-desktop:not(.is-public-desktop-reveal){overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable}";
const LOCK = "html.is-public-live:not(.is-public-flow){overflow:hidden}";
// [ids, classes, types] of a simple compound selector
const specificity = sel => [0, (sel.match(/\.[\w-]+/g) || []).length, (sel.match(/^[a-z]+/) || []).length];
const beats = (a, b) => { const x = specificity(a), y = specificity(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

test("root cause: on desktop the frame is hidden at 'profile', so it can report no height and the frame-driven flow (the only lift of the Intro lock) never starts", () => {
  const shell = { dataset: {} }, frame = { style: {} }, root = { classList: { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); } } };
  const layout = createFlowLayout({ shell, frame, root, scrollToTop() {} });
  layout.setProfileShowing(true);                   // the desktop profile shows, but no height report ever arrives from the hidden frame
  assert.equal(layout.mode, "experience");
  assert.equal(root.classList.set.has("is-public-flow"), false, "so the lock rule keeps applying");
  assert.ok(css.includes(LOCK));
  assert.match(page, /function showDesktop\(state\) \{[\s\S]*?experienceWrap\.hidden = state === "profile";/);
});

test("fix: one rule lifts the lock for the shown desktop profile - stronger than the lock, never during the reveal transition, mirrors the published Wall", () => {
  assert.ok(css.includes(FIX), "the desktop scroll rule");
  assert.ok(css.indexOf(FIX) > css.indexOf(LOCK), "after the lock");
  assert.ok(beats(FIX.slice(0, FIX.indexOf("{")).replace(":not(", ".").replace(")", ""), LOCK.slice(0, LOCK.indexOf("{")).replace(":not(", ".").replace(")", "")), "more specific than the lock");
  assert.match(css, /html\.is-public-live\.is-public-wall\{overflow-x:hidden;overflow-y:auto\}/, "the Wall's equivalent rule is unchanged");
  // the classes that drive it: the desktop profile sets is-public-desktop (reveal only while transitioning); the Intro / Replay Intro removes it
  assert.match(page, /root\.classList\.add\("is-public-desktop"\);/);
  assert.match(page, /root\.classList\.toggle\("is-public-desktop-reveal", state === "transitioning"\);/);
  assert.match(page, /function hideDesktop\(\) \{[^\n]*document\.documentElement\.classList\.remove\("is-public-desktop", "is-public-desktop-reveal"/);
  assert.match(page, /replayButton\.addEventListener\("click", layout\.enterExperience\);/, "Replay Intro still returns to the full-viewport experience");
});

test("no nested scrolling and nothing else changed: the page itself scrolls; mobile / tablet keep the frame-driven flow; the overlay keeps the Intro full-viewport", () => {
  const block = css.slice(css.indexOf(LOCK), css.indexOf(".is-public-live .site-head"));
  assert.equal((block.match(/overflow-y:auto/g) || []).length, 1, "only the root (html) gets a scrollbar");
  assert.match(css, /\.experience-wrap\{position:fixed;inset:0;z-index:20;background:#07060b\}/);
  assert.match(css, /html\.is-public-flow\{scrollbar-gutter:stable\}/);
  assert.match(read("dist/flow-layout.js"), /const flow = wantsFlow && height > 0;/, "the flow layout itself is unchanged");
});
