// Turns the Wall core's render tree (renderDocument) into DOM nodes. This is the ONE place render-tree data becomes markup, and it is written so a document
// can never inject anything: text is only ever set with textContent, every CSS value is built from a validated number, a validated #rrggbb colour or an
// enumerated keyword (font families come from the built-in catalog by key), and no innerHTML / attribute-from-string is used anywhere.
import { renderDocument } from "../wall/render.js";
import { HEX_COLOR } from "../wall/fields.js";
import { fontCss } from "./fonts.js";
import "./text.js";   // makes sure the text type is registered wherever documents are painted

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

// One element -> one absolutely positioned node. `order` gives its stacking position (the render tree is already in deterministic z-then-id order).
export function paintElement(item, scale, order, createNode) {
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
  if (item.rotation) { style.setProperty("transform", `rotate(${num(item.rotation)}deg)`); style.setProperty("transform-origin", "center center"); }
  const content = item.content;
  if (content?.kind === "rect") paintRect(node, content, scale, item);
  else if (content?.kind === "text") paintText(node, content, scale, createNode);
  return node;
}

export function paintStage(stageTree, scale, createNode = tag => document.createElement(tag)) {
  const stage = createNode("div");
  stage.className = "wall-stage";
  stage.setAttribute("data-stage", stageTree.id);
  stage.style.setProperty("position", "relative");
  stage.style.setProperty("width", px(stageTree.width));
  stage.style.setProperty("height", px(stageTree.height));
  stage.style.setProperty("overflow", "hidden");
  stageTree.elements.forEach((item, order) => stage.appendChild(paintElement(item, scale, order, createNode)));
  return stage;
}

// Real-pipeline rendering of a whole document (used by Preview): validates, renders through the Wall core, paints every stage. Never mutates `doc`.
export function paintDocument(doc, viewportWidth, createNode = tag => document.createElement(tag)) {
  const tree = renderDocument(doc, { viewportWidth });
  if (!tree.ok) return { ok: false, errors: tree.errors };
  return { ok: true, stages: tree.stages.map(stage => paintStage(stage, tree.scale, createNode)) };
}
