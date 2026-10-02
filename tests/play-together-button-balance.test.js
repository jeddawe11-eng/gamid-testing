// Play Together paired actions (ACCEPT / DECLINE, APPROVE / REJECT, READY / DECLINE) are equal peers, and the Team Room action group is evenly spaced:
// account.css gives .primary a 1rem and .danger a .6rem top margin (which also stretched the negative button taller in a row) and the labels different widths.
// Colours and meanings stay; nothing about behaviour changes. Plus: Avatar is the one profile picture - no second "Profile picture" naming.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA_FIELD_INFO } from "../dist/wall-kit/gamid-data.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("paired Play Together actions share one box: no inherited top margin, equal flex share and minimum width, the same weight / spacing", () => {
  const css = read("dist/play-together/play-together.css");
  assert.match(css, /\.pt-row-actions\{align-items:stretch\}\.pt-row-actions>button\{flex:1 1 0;min-width:7\.5rem;margin:0;font-weight:850;letter-spacing:\.06em\}/);
  assert.match(css, /\.pt-row-actions>\.primary\{border:1px solid transparent;box-shadow:none\}/, "same border box as the bordered negative button");
  assert.match(css, /\.pt-actions>\.primary,\.pt-actions>\.secondary\{margin:0\}/, "Team Room actions spaced by the gap only");
  // the colours that carry the meaning are untouched
  assert.match(css, /\.danger\{border-color:rgba\(255,100,130,\.55\)!important;background:rgba\(150,25,55,\.16\)!important;color:#ffd0da!important\}/);
  // the pairs themselves (labels, classes, actions) are unchanged
  const js = read("dist/play-together/play-together.js");
  for (const [positive, negative] of [["ACCEPT", "DECLINE"], ["APPROVE", "REJECT"], ["READY", "DECLINE"]]) {
    assert.match(js, new RegExp(`button\\("${positive}",[^;]*?"primary compact"\\),button\\("${negative}",[^;]*?"secondary compact danger"\\)`), `${positive} / ${negative}`);
  }
});

test("Avatar is the only profile picture: the Wall's live GamID data calls it Avatar and still binds the same avatar field", () => {
  assert.equal(DATA_FIELD_INFO.avatar.label, "Avatar");
  for (const path of ["dist/wall-kit/gamid-data.js", "dist/wall-kit/image.js", "dist/wall-kit/paint.js", "dist/wall-editor/controls.js", "dist/account/index.html", "dist/account/account.js"]) {
    assert.doesNotMatch(read(path), /profile picture/i, path);
  }
});
