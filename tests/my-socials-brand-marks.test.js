// ISS-0013: on the desktop Classic Profile, the My Socials badges of TikTok, Twitch, Kick and Snapchat show recognisable platform marks (like Discord and
// Instagram already did) instead of the letters TT / TW / K / SC. Same mechanism: a static, local CSS mask in the badge's existing text colour; sizes, links,
// accessible names and the mobile text marks are unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOCIAL_PLATFORMS } from "../dist/account/socials.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("dist/public/public.css");
const block = css.slice(css.indexOf("/* My Socials marks"), css.indexOf("}\n.desk-hero{"));
const MARKED = ["discord", "instagram", "tiktok", "twitch", "kick", "snapchat"];

test("ISS-0013: every one of the six platforms has a desktop mark, and the mark replaces the letters (font-size 0, the mask drawn by ::before)", () => {
  for (const p of MARKED) {
    assert.match(block, new RegExp(`html\\.is-public-desktop \\.social-icon\\[data-platform=${p}\\]\\{--social-mark:url\\("data:image/svg\\+xml,%3Csvg xmlns='http://www\\.w3\\.org/2000/svg' viewBox='0 0 24 24'%3E`), p);
    assert.ok(block.split("{position:relative;font-size:0}")[0].includes(`html.is-public-desktop .social-icon[data-platform=${p}]`), `${p}: the letters are hidden on desktop`);
    assert.ok(block.split("{content:\"\";position:absolute;inset:24%;background:#fff;")[0].includes(`html.is-public-desktop .social-icon[data-platform=${p}]::before`), `${p}: drawn by the shared mask rule`);
  }
});

test("ISS-0013: marks use each badge's existing text colour - white on TikTok / Twitch, black on Kick's green and Snapchat's yellow", () => {
  assert.match(block, /html\.is-public-desktop \.social-icon\[data-platform=kick\]::before,html\.is-public-desktop \.social-icon\[data-platform=snapchat\]::before\{background:#000\}/);
  assert.match(css, /\.public-social \.social-icon\[data-platform=kick\]\{background:#53fc18;color:#000\}/);
  assert.match(css, /\.public-social \.social-icon\[data-platform=snapchat\]\{background:#fffc00;color:#000\}/);
  assert.match(css, /\.public-social \.social-icon\[data-platform=tiktok\]\{background:#000;box-shadow:inset 0 0 0 2px #25f4ee\}/);
  assert.match(css, /\.public-social \.social-icon\[data-platform=twitch\]\{background:#9146ff\}/);
});

test("ISS-0013: static and local (no remote asset, no animation); sources and licences recorded; YouTube, X and Facebook keep their glyphs", () => {
  assert.doesNotMatch(block, /animation|keyframes|transition|filter|https?:\/\/(?!www\.w3\.org)/);
  assert.match(block, /simple-icons "tiktok" \/ "twitch" paths \(CC0\)/);
  assert.match(block, /Kick \(its blocky K\) and Snapchat \(the ghost\)\n\s+drawn here \(ISS-0013\)/);
  for (const p of ["youtube", "x", "facebook"]) assert.doesNotMatch(block, new RegExp(`data-platform=${p}\\]`), `${p} unchanged`);
});

test("ISS-0013: the badge markup, link labels, sizes and the mobile text marks are unchanged", () => {
  const glyphs = Object.fromEntries(SOCIAL_PLATFORMS.map(p => [p.key, p.glyph]));
  assert.deepEqual([glyphs.tiktok, glyphs.twitch, glyphs.kick, glyphs.snapchat, glyphs.discord, glyphs.instagram], ["TT", "TW", "K", "SC", "DC", "IG"], "mobile badges keep their accepted text marks");
  const socials = read("dist/account/socials.js");
  assert.match(socials, /icon\.setAttribute\("aria-hidden", "true"\);/);
  assert.match(socials, /a\.setAttribute\("aria-label", `\$\{platform\.label\} \(opens in a new tab\)`\);/);
  assert.match(css, /\.public-social \.social-icon\{display:inline-grid;place-items:center;width:2\.75rem;aspect-ratio:1;border-radius:50%;/);
});
