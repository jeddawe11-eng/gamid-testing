// Post-manual-QA fixes (media): B card / link / player minimum sizes and never-clipped facades, C the player's "Watch on YouTube" new tab.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { paintDocument, facadeLayout, FACADE } from "../dist/wall-kit/paint.js";
import { createPlayerManager } from "../dist/wall-kit/embed/player.js";
import * as ops from "../dist/wall-kit/ops.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
class PaintNode {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.listeners = {}; this.dataset = {}; this.style = { setProperty: (name, value) => this.props.set(name, value) }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { nodes.forEach(node => this.children.push(node)); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
}
const make = tag => new PaintNode(tag);
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };
const embedEl = (id, providerKey, data, geometry = {}) => createElement({ id, type: "embed", x: 0, y: 0, width: 800, height: 260, z: 0, ...geometry, payload: { providerKey, data } });
const docOf = (...elements) => { const doc = createDocument(); doc.stages[0].elements = elements; return doc; };
const byId = (doc, id) => doc.stages[0].elements.find(element => element.id === id);
const ytCard = { kind: "video", id: "dQw4w9WgXcQ", presentation: "card" };
const ytLink = { kind: "video", id: "dQw4w9WgXcQ", presentation: "link" };
const ytPlayer = { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" };

// The height a facade's content needs, from the same constants the painter uses.
function contentHeight(presentation, layout) {
  if (presentation === "link") return 2 * layout.padding + FACADE.border + FACADE.linkTitle;
  const items = [layout.showChip && FACADE.chip, FACADE.title * layout.titleLines, layout.showHint && FACADE.hint].filter(Boolean);
  return 2 * layout.padding + FACADE.border + (layout.showPlay ? FACADE.play : 0) + items.reduce((sum, h) => sum + h, 0) + FACADE.gap * (items.length - 1);
}

// ---------- B: minimums ----------
test("B minimums: card 300x150, link 300x80, players keep theirs (YouTube 334x195 from its documented tile; others the smallest facade) - all above the 24px touch floor", () => {
  const min = element => { const { width, height } = ops.minSizeOf(element); return [width, height]; };
  assert.deepEqual(min(embedEl("c", "youtube", ytCard)), [300, 150]);
  assert.deepEqual(min(embedEl("c", "steam", { kind: "profile", id: "gabelogannewell", presentation: "card" })), [300, 150], "a profile / no-player card too");
  assert.deepEqual(min(embedEl("l", "youtube", ytLink)), [300, 80]);
  assert.deepEqual(min(embedEl("p", "youtube", ytPlayer)), [334, 195], "the accepted YouTube player minimum is unchanged");
  assert.deepEqual(min(embedEl("p", "youtube", { ...ytPlayer, aspect: "9:16" })), [195, 334]);
  assert.deepEqual(min(embedEl("s", "spotify", { kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC", presentation: "embed" })), [200, 140]);
  for (const [w, h] of [[300, 150], [300, 80], [200, 140]]) assert.ok(w >= ops.pxToMinUnits(24) && h >= ops.pxToMinUnits(24));
});

test("B a CARD cannot be resized into a broken box: every handle, pinch and group resize stops at its minimum (manual-QA bug)", () => {
  const doc = docOf(embedEl("c", "youtube", ytCard, { x: 100, y: 100 }));
  const lock = ops.lockedAspect(byId(doc, "c"));
  for (const [handle, dx, dy] of [["se", -9999, -9999], ["nw", 9999, 9999], ["e", -9999, 0], ["w", 9999, 0]]) {
    const after = byId(ops.resizeElement(doc, "c", handle, dx, dy, { keepAspect: lock }).doc, "c");
    assert.ok(after.width >= 300 && after.height >= 150, `${handle}: ${after.width}x${after.height}`);
  }
  const free = byId(ops.resizeElement(doc, "c", "se", -9999, -9999).doc, "c");
  assert.deepEqual([free.width, free.height], [300, 150], "even an unlocked resize stops at the card minimum");
  const pinched = byId(ops.scaleSelection(doc, ["c"], 0.01).doc, "c");
  assert.ok(pinched.width >= 300 && pinched.height >= 150);
  const typed = byId(ops.updateGeometry(doc, "c", { width: 20, height: 20 }).doc, "c");
  assert.deepEqual([typed.width, typed.height], [300, 150]);
  const link = docOf(embedEl("l", "youtube", ytLink, { width: 640, height: 96 }));
  const tinyLink = byId(ops.resizeElement(link, "l", "se", -9999, -9999).doc, "l");
  assert.deepEqual([tinyLink.width, tinyLink.height], [300, 80]);
  // the YouTube PLAYER keeps its own (accepted) minimum and aspect
  const player = docOf(embedEl("p", "youtube", ytPlayer, { width: 800, height: 450 }));
  const tinyPlayer = byId(ops.resizeElement(player, "p", "se", -9999, -9999, { keepAspect: ops.lockedAspect(byId(player, "p")) }).doc, "p");
  assert.ok(tinyPlayer.width >= 334 && tinyPlayer.height >= 195 && Math.abs(tinyPlayer.width / tinyPlayer.height - 16 / 9) < 0.01);
});

test("B facades are never clipped: at EVERY size from the minimum up, what a card / link / player shows fits inside its box", () => {
  for (const presentation of ["card", "embed", "link"]) {
    const min = presentation === "card" ? ops.CARD_MIN : presentation === "link" ? ops.LINK_MIN : { width: 334, height: 195 };
    for (let h = min.height; h <= 1200; h += 7) {
      const layout = facadeLayout(presentation, min.width, h);
      assert.ok(contentHeight(presentation, layout) <= h, `${presentation} ${min.width}x${h}: needs ${contentHeight(presentation, layout)}`);
      assert.ok(layout.titleLines >= 1, "the title always shows");
    }
  }
  assert.deepEqual(facadeLayout("card", 300, 150), { padding: 20, showChip: true, showHint: false, titleLines: 1, showPlay: false }, "at the minimum: chip + title");
  assert.deepEqual(facadeLayout("card", 800, 260), { padding: 30, showChip: true, showHint: true, titleLines: 2, showPlay: false }, "the default card: chip, two title lines, hint");
  assert.equal(facadeLayout("embed", 334, 195).showChip, false, "a minimum-size player tile keeps its ▶ and title");
  assert.equal(facadeLayout("link", 300, 80).showChip, false);
  assert.equal(facadeLayout("link", 640, 96).showHint, true);
});

test("B painted: a minimum-size card shows its provider and title (no hint) with the title clamped; a default card shows the hint; a link title ellipsizes", () => {
  const doc = docOf(embedEl("small", "steam", { kind: "profile", id: "gabelogannewell", presentation: "card" }, { width: 300, height: 150 }), embedEl("big", "steam", { kind: "profile", id: "gabelogannewell", presentation: "card" }, { y: 300 }), embedEl("link", "youtube", ytLink, { y: 700, width: 300, height: 80 }));
  const [stage] = paintDocument(doc, 1000, make, { mode: "view" }).stages;
  const box = id => stage.children.find(node => node.attrs["data-el"] === id);
  const classes = id => all(box(id), node => typeof node.className === "string" && node.className.startsWith("wall-embed-")).map(node => node.className);
  assert.deepEqual(classes("small"), ["wall-embed-provider", "wall-embed-title"]);
  assert.deepEqual(classes("big"), ["wall-embed-provider", "wall-embed-title", "wall-embed-hint"]);
  const title = all(box("small"), node => node.className === "wall-embed-title")[0];
  assert.equal(title.props.get("-webkit-line-clamp"), "1");
  assert.equal(title.props.get("overflow"), "hidden");
  const linkTitle = all(box("link"), node => node.className === "wall-embed-title")[0];
  assert.deepEqual([linkTitle.props.get("white-space"), linkTitle.props.get("text-overflow"), linkTitle.props.get("min-width")], ["nowrap", "ellipsis", "0"]);
  const anchor = all(box("small"), node => node.tag === "a")[0];
  assert.match(anchor.attrs["aria-label"], /Steam Profile: open/, "the full meaning stays available to assistive tech");
});

// ---------- C: Watch on YouTube ----------
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { props: new Map(), setProperty(name, value) { this.props.set(name, value); }, removeProperty(name) { this.props.delete(name); } }; this.listeners = {}; this.className = ""; this.textContent = ""; this.parent = null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; } }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  focus() {}
}
test("C a player's own 'Watch on YouTube' opens a real, unsandboxed tab: popups escape the sandbox, the player frame itself stays sandboxed and cannot navigate the Wall", () => {
  const doc = new Node("document"); doc.body = new Node("body"); doc.createElement = tag => new Node(tag); doc.removeEventListener = () => {};
  const manager = createPlayerManager({ doc, hostname: "gamid-testing-static.gamid.workers.dev", viewport: () => ({ width: 1200, height: 900 }) });
  const describe = data => elementRegistry.get("embed").render({ providerKey: "youtube", data }).content;
  const box = new Node("div");
  manager.activate(box, describe(ytPlayer), { widthPx: 800, heightPx: 500 });
  const inline = (function find(node) { return node.tag === "iframe" ? node : node.children.map(find).find(Boolean); })(box);
  manager.activate(new Node("div"), describe({ ...ytPlayer, id: "abcdEFGhijk" }), { widthPx: 150, heightPx: 90 });
  const expanded = (function find(node) { return node.tag === "iframe" ? node : node.children.map(find).find(Boolean); })(doc.body);
  for (const frame of [inline, expanded]) {
    const flags = frame.attrs.sandbox.split(" ");
    assert.ok(flags.includes("allow-popups") && flags.includes("allow-popups-to-escape-sandbox"), "a user-opened youtube.com tab (COOP: same-origin-allow-popups) is not refused");
    assert.ok(flags.includes("allow-scripts") && flags.includes("allow-same-origin"));
    assert.equal(flags.some(flag => flag.startsWith("allow-top-navigation")), false, "the player can never navigate the Wall page itself");
    assert.equal(flags.includes("allow-modals"), false);
  }
  manager.destroyAll();
  assert.match(read("dist/wall-kit/embed/player.js"), /ERR_BLOCKED_BY_RESPONSE/, "the reason is documented next to the flag");
});
