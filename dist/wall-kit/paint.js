// Turns the Wall core's render tree (renderDocument) into DOM nodes. This is the ONE place render-tree data becomes markup, and it is written so a document
// can never inject anything: text is only ever set with textContent, every CSS value is built from a validated number, a validated #rrggbb colour or an
// enumerated keyword (font families come from the built-in catalog by key), and no innerHTML / attribute-from-string is used anywhere.
import { renderDocument } from "../wall/render.js";
import { HEX_COLOR } from "../wall/fields.js";
import { fontCss } from "./fonts.js";
import { isAllowedOpenUrl } from "./embed/engine.js";
import { paintGamidBlock } from "./gamid-blocks.js";
import "./register.js";   // makes sure every element type, background kind and provider is registered wherever documents are painted

const num = value => (Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : "0");
const px = value => `${num(value)}px`;
const hex = value => (typeof value === "string" && HEX_COLOR.test(value) ? value : "#000000");
const gradientCss = gradient => `linear-gradient(${num(gradient.angle)}deg, ${hex(gradient.from)}, ${hex(gradient.to)})`;

function paintRect(node, content, scale, item) {
  const style = node.style;
  style.setProperty("box-sizing", "border-box");
  style.setProperty("background", content.gradient ? gradientCss(content.gradient) : hex(content.fill));
  if (content.opacity !== undefined) style.setProperty("opacity", num(content.opacity));
  if (content.stroke !== undefined && (content.strokeWidth ?? 0) > 0) style.setProperty("border", `${px(content.strokeWidth * scale)} solid ${hex(content.stroke)}`);
  if (content.radius) style.setProperty("border-radius", px(Math.min(content.radius * scale, Math.min(item.width, item.height) / 2)));
}

function paintText(node, content, scale, createNode) {
  const inner = createNode("div");
  inner.className = "wall-text";
  inner.textContent = content.text;   // text only - never markup
  const style = inner.style;
  style.setProperty("font-family", fontCss(content.fontFamily));
  style.setProperty("font-size", px(content.fontSize * scale));
  style.setProperty("font-weight", String(content.fontWeight));
  style.setProperty("font-style", content.italic ? "italic" : "normal");
  style.setProperty("text-decoration", content.underline ? "underline" : "none");
  style.setProperty("text-align", content.align);
  style.setProperty("line-height", num(content.lineHeight));
  style.setProperty("letter-spacing", px(content.letterSpacing * scale));
  style.setProperty("opacity", num(content.opacity));
  style.setProperty("white-space", content.wrap ? "pre-wrap" : "pre");
  style.setProperty("overflow-wrap", content.wrap ? "anywhere" : "normal");
  if (content.direction === "auto") inner.setAttribute("dir", "auto");
  else { inner.setAttribute("dir", content.direction); style.setProperty("direction", content.direction); }

  const shadows = [];
  if (content.shadow) shadows.push(`${px(content.shadow.x * scale)} ${px(content.shadow.y * scale)} ${px(content.shadow.blur * scale)} ${hex(content.shadow.color)}`);
  if (content.glow) {
    shadows.push(`0 0 ${px(content.glow.blur * scale)} ${hex(content.glow.color)}`);
    shadows.push(`0 0 ${px(content.glow.blur * scale * 2)} ${hex(content.glow.color)}`);
  }
  if (shadows.length) style.setProperty("text-shadow", shadows.join(", "));
  if (content.stroke && content.stroke.width > 0) {
    style.setProperty("-webkit-text-stroke", `${px(content.stroke.width * scale)} ${hex(content.stroke.color)}`);
    style.setProperty("paint-order", "stroke fill");
  }
  if (content.gradient) {
    style.setProperty("background-image", gradientCss(content.gradient));
    style.setProperty("-webkit-background-clip", "text");
    style.setProperty("background-clip", "text");
    style.setProperty("-webkit-text-fill-color", "transparent");
    style.setProperty("color", "transparent");
  } else {
    style.setProperty("color", hex(content.color));
  }
  node.appendChild(inner);
}

// ---- pictures, embeds, GamID blocks and backgrounds ------------------------------------------------------------------------------------------------
// `ctx` (all optional): { mode: "edit" | "view", assets: { urlFor(assetId) -> blob: URL | null }, gamid: snapshot | null, players: player manager, wallBackground, stageIndex, stageCount }
//   edit: the editor canvas - nothing interactive, no third-party network (embeds are facades); view: Preview / a visitor - links open, players start on a tap.
//   A picture is ONLY ever shown from ctx.assets.urlFor(), and only a blob: URL is accepted - a document string can never become an image address.
const safeBlobUrl = url => (typeof url === "string" && /^blob:/.test(url) ? url : null);

function pictureNode(createNode, { url, fit, posX, posY, opacity, alt }) {
  const img = createNode("img");
  img.setAttribute("src", url);
  img.setAttribute("alt", alt ?? "");
  img.setAttribute("draggable", "false");
  img.setAttribute("decoding", "async");
  const style = img.style;
  style.setProperty("display", "block");
  style.setProperty("width", "100%");
  style.setProperty("height", "100%");
  style.setProperty("object-fit", fit);
  style.setProperty("object-position", `${num(posX)}% ${num(posY)}%`);
  if (opacity !== undefined && opacity !== 1) style.setProperty("opacity", num(opacity));
  return img;
}

function paintImage(node, content, scale, item, createNode, ctx) {
  node.style.setProperty("background", "#14101f");
  if (content.radius) node.style.setProperty("border-radius", px(Math.min(content.radius * scale, Math.min(item.width, item.height) / 2)));
  const url = safeBlobUrl(ctx.assets?.urlFor?.(content.assetId));
  if (url) { node.append(pictureNode(createNode, { url, fit: content.fit === "fill" ? "fill" : content.fit, posX: content.posX, posY: content.posY, opacity: content.opacity, alt: content.alt })); return; }
  const missing = createNode("div");
  missing.className = "wall-image-missing";
  missing.textContent = "Image";
  for (const [name, value] of [["display", "grid"], ["place-items", "center"], ["height", "100%"], ["color", "#8f88a3"], ["font", `700 ${px(28 * scale)} system-ui, sans-serif`]]) missing.style.setProperty(name, value);
  node.append(missing);
}

function paintBackgroundLayer(background, { createNode, ctx, width, height, index, count, scale }) {
  const layer = createNode("div");
  layer.className = "wall-bg";
  const style = layer.style;
  for (const [name, value] of [["position", "absolute"], ["left", "0"], ["width", px(width)], ["height", px(height * count)], ["top", px(-index * height)], ["overflow", "hidden"], ["z-index", "0"], ["pointer-events", "none"]]) style.setProperty(name, value);
  if (background.kind === "color") style.setProperty("background", hex(background.color));
  else if (background.kind === "gradient") style.setProperty("background", gradientCss(background));
  else if (background.kind === "image") {
    const url = safeBlobUrl(ctx.assets?.urlFor?.(background.assetId));
    style.setProperty("background", "#0d0b14");
    if (url) layer.append(pictureNode(createNode, { url, fit: background.fit, posX: background.posX, posY: background.posY, opacity: background.opacity }));
    if (background.overlay) {
      const overlay = createNode("div");
      for (const [name, value] of [["position", "absolute"], ["inset", "0"], ["background", hex(background.overlay.color)], ["opacity", num(background.overlay.opacity)]]) overlay.style.setProperty(name, value);
      layer.append(overlay);
    }
  }
  void scale;
  return layer;
}

// A provider embed. EDIT: a facade card only (no iframe, no network). VIEW: link/card open the content; a player starts on a tap (inline, or a larger in-page player when the
// box is below the provider's minimum). Everything shown comes from the adapter's descriptor; the address followed is re-checked against the provider's own hosts.
function paintEmbed(node, descriptor, scale, item, createNode, ctx) {
  const view = ctx.mode === "view";
  const s = value => px(value * scale);
  const make = (tag, className, text) => { const n = createNode(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const openable = isAllowedOpenUrl(descriptor.providerKey, descriptor.openUrl);
  node.setAttribute("data-provider", descriptor.providerKey);
  node.setAttribute("data-presentation", descriptor.presentation);
  const facade = view && openable && descriptor.presentation !== "embed" ? make("a", "wall-embed") : make("div", "wall-embed");
  if (facade.tag === "a" || (view && openable && descriptor.presentation !== "embed")) {
    facade.setAttribute("href", descriptor.openUrl);
    facade.setAttribute("target", "_blank");
    facade.setAttribute("rel", "noopener noreferrer nofollow");
    facade.setAttribute("aria-label", `${descriptor.providerLabel} ${descriptor.contentLabel}: open`);
  }
  for (const [name, value] of [["box-sizing", "border-box"], ["display", "flex"], ["flex-direction", "column"], ["justify-content", "center"], ["align-items", "flex-start"], ["gap", s(10)], ["width", "100%"], ["height", "100%"],
    ["padding", s(descriptor.presentation === "link" ? 18 : 30)], ["color", "#f7f5ff"], ["text-decoration", "none"], ["font-family", "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"],
    ["background", "linear-gradient(135deg, #1b1430, #0f0c1a)"], ["border", `${s(2)} solid rgba(139, 93, 255, .55)`], ["border-radius", s(descriptor.presentation === "link" ? 999 : 28)], ["overflow", "hidden"]]) facade.style.setProperty(name, value);
  if (descriptor.presentation === "link") { facade.style.setProperty("flex-direction", "row"); facade.style.setProperty("align-items", "center"); }
  const chip = make("span", "wall-embed-provider", descriptor.providerLabel.toUpperCase());
  for (const [name, value] of [["font-size", s(22)], ["font-weight", "800"], ["letter-spacing", ".14em"], ["color", "#62e7ff"]]) chip.style.setProperty(name, value);
  const title = make("strong", "wall-embed-title", descriptor.caption ?? (descriptor.profile && descriptor.presentation !== "embed" ? `${descriptor.id.startsWith("@") ? "" : "@"}${descriptor.id}` : descriptor.contentLabel));
  for (const [name, value] of [["font-size", s(descriptor.presentation === "link" ? 30 : 40)], ["line-height", "1.15"], ["overflow-wrap", "anywhere"]]) title.style.setProperty(name, value);
  const hint = make("span", "wall-embed-hint", descriptor.presentation === "embed" ? (view ? "Tap to play" : "Plays in Preview") : `${view ? "Open" : "Opens"} on ${descriptor.providerLabel} ↗`);
  for (const [name, value] of [["font-size", s(24)], ["color", "#aaa4b7"]]) hint.style.setProperty(name, value);
  if (descriptor.presentation === "embed") {
    const play = make("span", "wall-embed-play", "▶");
    for (const [name, value] of [["font-size", s(64)], ["line-height", "1"], ["color", "#ffffff"], ["align-self", "center"], ["margin", `${s(10)} auto 0`]]) play.style.setProperty(name, value);
    facade.append(play);
    facade.style.setProperty("align-items", "center");
    facade.style.setProperty("text-align", "center");
    if (view && ctx.players) {
      facade.setAttribute("role", "button");
      facade.setAttribute("tabindex", "0");
      facade.setAttribute("aria-label", `Play ${descriptor.providerLabel} ${descriptor.contentLabel}`);
      facade.style.setProperty("cursor", "pointer");
      const start = () => ctx.players.activate(node, descriptor, { widthPx: item.width, heightPx: item.height, opener: facade });
      facade.addEventListener?.("click", start);
      facade.addEventListener?.("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault?.(); start(); } });
    }
  }
  facade.append(chip, title, hint);
  node.append(facade);
}

// One element -> one absolutely positioned node. `order` gives its stacking position (the render tree is already in deterministic z-then-id order).
export function paintElement(item, scale, order, createNode, ctx = {}) {
  const node = createNode("div");
  node.className = `wall-el wall-el-${item.content?.kind ?? "empty"}`;
  node.setAttribute("data-el", item.id);
  const style = node.style;
  style.setProperty("position", "absolute");
  style.setProperty("left", px(item.x));
  style.setProperty("top", px(item.y));
  style.setProperty("width", px(item.width));
  style.setProperty("height", px(item.height));
  style.setProperty("z-index", String(order + 1));
  style.setProperty("overflow", "hidden");
  if (ctx.mode === "view") style.setProperty("pointer-events", "auto");
  if (item.rotation) { style.setProperty("transform", `rotate(${num(item.rotation)}deg)`); style.setProperty("transform-origin", "center center"); }
  const content = item.content;
  if (content?.kind === "rect") paintRect(node, content, scale, item);
  else if (content?.kind === "text") paintText(node, content, scale, createNode);
  else if (content?.kind === "image") paintImage(node, content, scale, item, createNode, ctx);
  else if (content?.kind === "embed" && content.content?.kind === "embed") paintEmbed(node, content.content, scale, item, createNode, ctx);
  else if (content?.kind === "gamid") node.append(paintGamidBlock(content, ctx.gamid ?? null, createNode, { scale }));
  return node;
}

export function paintStage(stageTree, scale, createNode = tag => document.createElement(tag), ctx = {}) {
  const stage = createNode("div");
  stage.className = "wall-stage";
  stage.setAttribute("data-stage", stageTree.id);
  stage.style.setProperty("position", "relative");
  stage.style.setProperty("width", px(stageTree.width));
  stage.style.setProperty("height", px(stageTree.height));
  stage.style.setProperty("overflow", "hidden");
  // a stage's own background wins; otherwise the Wall-wide one is laid across ALL stages so it can run continuously from one stage into the next
  if (stageTree.background) stage.append(paintBackgroundLayer(stageTree.background, { createNode, ctx, width: stageTree.width, height: stageTree.height, index: 0, count: 1, scale }));
  else if (ctx.wallBackground) stage.append(paintBackgroundLayer(ctx.wallBackground, { createNode, ctx, width: stageTree.width, height: stageTree.height, index: ctx.stageIndex ?? 0, count: ctx.stageCount ?? 1, scale }));
  stageTree.elements.forEach((item, order) => stage.appendChild(paintElement(item, scale, order, createNode, ctx)));
  return stage;
}

// Real-pipeline rendering of a whole document (used by Preview): validates, renders through the Wall core, paints every stage. Never mutates `doc`.
export function paintDocument(doc, viewportWidth, createNode = tag => document.createElement(tag), ctx = {}) {
  const tree = renderDocument(doc, { viewportWidth });
  if (!tree.ok) return { ok: false, errors: tree.errors };
  const stageCount = tree.stages.length;
  return { ok: true, stages: tree.stages.map((stage, stageIndex) => paintStage(stage, tree.scale, createNode, { ...ctx, wallBackground: tree.background ?? null, stageIndex, stageCount })) };
}