// F7-C (Mazen's choice 2026-10-21): Favorite Games covers offer the provider's own thumbnail of the SAME grid through srcset, the full image stays the fallback
// and the choice for sharp displays; the artwork never changes. Other artwork (icons, grids, heroes) is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { applyGameArtwork, coverThumbUrl, COVER_THUMB_WIDTH, COVER_FULL_WIDTH } from "../dist/public/game-artwork.js";

const CDN = path => `https://cdn2.steamgriddb.com/${path}`;
class El {
  constructor(tag, doc) { this.tag = tag; this.doc = doc; this.children = []; this.attrs = {}; this.listeners = {}; this.className = ""; this.parent = null; this.clientWidth = 0; this.currentSrc = ""; }
  get ownerDocument() { return this.doc; }
  get classList() { const s = this; return { add: n => { if (!s.className.split(/\s+/).includes(n)) s.className = `${s.className} ${n}`.trim(); }, contains: n => s.className.split(/\s+/).includes(n) }; }
  append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(n, v) { this.attrs[n] = String(v); } getAttribute(n) { return this.attrs[n] ?? null; } removeAttribute(n) { delete this.attrs[n]; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); } dispatch(t) { for (const f of [...(this.listeners[t] || [])]) f({ type: t }); }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
  querySelectorAll(sel) { const m = /^\[([a-z-]+)\]$/.exec(sel), cls = /^\.([a-z-]+)$/.exec(sel); return this.all(c => (m ? m[1] in c.attrs : cls ? c.classList.contains(cls[1]) : false)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
const makeDoc = () => { const doc = { createElement: tag => new El(tag, doc) }; return doc; };

test("F7-C the thumbnail is the same grid's own provider thumbnail; anything else has none", () => {
  assert.equal(coverThumbUrl(CDN("grid/425b39abcdef0123456789abcdef0123.png")), CDN("thumb/425b39abcdef0123456789abcdef0123.jpg"));
  assert.equal(coverThumbUrl(CDN("grid/0c9143aa.webp")), CDN("thumb/0c9143aa.jpg"));
  for (const url of [CDN("icon/abc.png"), CDN("hero/abcdef12.png"), CDN("grid/../x.png"), "https://evil.example/grid/abcdef12.png", CDN("grid/ABCDEF12.png"), null, 7]) assert.equal(coverThumbUrl(url), null, String(url));
  assert.equal(COVER_THUMB_WIDTH, 267); assert.equal(COVER_FULL_WIDTH, 600);
});

test("F7-C a cover offers thumbnail + full image (srcset / sizes from the slot); src stays today's full image", () => {
  const doc = makeDoc(), root = doc.createElement("div");
  const cover = doc.createElement("div"); cover.setAttribute("data-game-cover", "mass_effect"); cover.clientWidth = 185;
  const hidden = doc.createElement("div"); hidden.setAttribute("data-game-cover", "rivals");   // clientWidth 0: not laid out
  const tile = doc.createElement("span"); tile.setAttribute("data-game-key", "rivals");
  root.append(cover, hidden, tile);
  const full = CDN("grid/aaaabbbbccccdddd.png"), full2 = CDN("grid/1111222233334444.png");
  const placed = applyGameArtwork(root, { artwork: { mass_effect: { cover: full }, rivals: { cover: full2, icon: CDN("icon/r.png") } } });
  assert.equal(placed, 3);
  const img = cover.querySelector(".game-art");
  assert.equal(img.src, full, "browsers without srcset keep the full image");
  assert.equal(img.getAttribute("srcset"), `${CDN("thumb/aaaabbbbccccdddd.jpg")} 267w, ${full} 600w`);
  assert.equal(img.getAttribute("sizes"), "auto, 185px");
  assert.equal(img.loading, "lazy"); assert.equal(img.referrerPolicy, "no-referrer");
  assert.equal(hidden.querySelector(".game-art").getAttribute("sizes"), "auto, 600px", "an unmeasured slot never gets a soft cover");
  const icon = tile.querySelector(".game-art");
  assert.equal(icon.getAttribute("srcset"), null, "icons / grids / heroes are unchanged");
});

test("F7-C a failing thumbnail falls back to the full image once; a failing full image leaves the initials", () => {
  const doc = makeDoc(), root = doc.createElement("div"), cover = doc.createElement("div");
  cover.setAttribute("data-game-cover", "g"); cover.clientWidth = 185; root.append(cover);
  const full = CDN("grid/abcdefabcdef.png");
  applyGameArtwork(root, { artwork: { g: { cover: full } } });
  const img = cover.querySelector(".game-art");
  img.currentSrc = CDN("thumb/abcdefabcdef.jpg");
  img.dispatch("error");
  assert.equal(img.getAttribute("srcset"), null);
  assert.equal(img.src, full);
  assert.equal(cover.querySelector(".game-art"), img, "still there, now the full image");
  img.currentSrc = full;
  img.dispatch("error");
  assert.equal(cover.querySelector(".game-art"), null, "the initials stay");
});

test("F7-C the full image failing first (no thumbnail chosen) is removed at once, as before", () => {
  const doc = makeDoc(), root = doc.createElement("div"), cover = doc.createElement("div");
  cover.setAttribute("data-game-cover", "g"); cover.clientWidth = 400; root.append(cover);
  const full = CDN("grid/abcdefabcdef.png");
  applyGameArtwork(root, { artwork: { g: { cover: full } } });
  const img = cover.querySelector(".game-art");
  img.currentSrc = full;
  img.dispatch("error");
  assert.equal(cover.querySelector(".game-art"), null);
});
