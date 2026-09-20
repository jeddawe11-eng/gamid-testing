// GAME ID WALL - W0 PROTOTYPE - DOM renderer shared by the editor, the overview, the visitor-style preview and the hosting-shape pages.
// Rules kept on purpose (they are part of what W0 tests):
//   * NO innerHTML / no markup from data: every node is built with createElement + textContent
//   * no inline style attributes of any kind: all styling goes through CSSOM setProperty, so a strict meta CSP (style-src 'self') works
//   * every length is `calc(var(--u) * units)`: the document never contains device pixels
import { STAGE_H, UNITS_W, geoOf, groupLocalBox, classifyEmbedPx, EMBED, HEX } from "./model.js?v=w0a";
import { ASSETS, BLOCKS } from "./assets.js?v=w0a";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function css(node, props) { for (const [key, value] of Object.entries(props)) node.style.setProperty(key, value); return node; }
const r2 = value => Math.round(value * 100) / 100;
export const u = units => `calc(var(--u) * ${r2(units)})`;

// ------------------------------------------------------------------------------------------------ backgrounds
export function gradientCss(base) {
  const stops = base.stops.filter(([color, pos]) => HEX.test(color) && Number.isFinite(pos)).map(([color, pos]) => `${color} ${pos}%`).join(", ");
  return `linear-gradient(${Number(base.angle) || 180}deg, ${stops})`;
}
const lastStop = base => base.stops[base.stops.length - 1][0];

function artLayer(asset, mode) {
  const art = el("div", "art");
  css(art, { "background-image": `url("${ASSETS[asset].file}")` });
  art.dataset.mode = mode;
  return art;
}

// One continuous surface behind every stage (visitor preview / overview). Full-bleed gradient, column-wide art.
function buildWallSurface(doc) {
  const surface = el("div", "wall-surface");
  css(surface, { height: u(doc.stages.length * STAGE_H), "background-image": gradientCss(doc.background.base) });
  if (doc.background.art.enabled) surface.append(artLayer(doc.background.art.asset, doc.background.art.mode));
  return surface;
}

// Editing shows ONE stage, so it paints its slice of the same continuous surface (offset by stage index).
function buildEditSlice(doc, index) {
  const slice = el("div", "stage-bg");
  const clone = el("div", "surface-clone");
  css(clone, { top: u(-index * STAGE_H), height: u(doc.stages.length * STAGE_H), "background-image": gradientCss(doc.background.base) });
  if (doc.background.art.enabled) clone.append(artLayer(doc.background.art.asset, doc.background.art.mode));
  slice.append(clone);
  return slice;
}

function buildOwnBackground(stage) {
  const bg = el("div", "stage-own-bg");
  const def = stage.background;
  if (def.kind === "art") { bg.append(artLayer(def.asset, "cover")); css(bg, { "background-image": gradientCss({ angle: 180, stops: [["#1d0f05", 0], ["#5a2408", 100]] }) }); }
  else css(bg, { "background-image": gradientCss(def.base) });
  return bg;
}

// ------------------------------------------------------------------------------------------------ text
function applyTextEffects(t, node) {
  const layers = [];
  if (node.glow) layers.push([0, 0, node.glow.radius * 0.5, node.glow.color], [0, 0, node.glow.radius, node.glow.color]);
  if (node.shadow) layers.push([node.shadow.x, node.shadow.y, node.shadow.blur, node.shadow.color]);
  if (node.gradient) {
    css(t, { "background-image": `linear-gradient(${node.gradient.angle}deg, ${node.gradient.a}, ${node.gradient.b})`, "-webkit-background-clip": "text", "background-clip": "text", "-webkit-text-fill-color": "transparent", color: "transparent" });
    // text-shadow would paint OVER a transparent gradient fill, so gradient text uses drop-shadow filters instead
    if (layers.length) css(t, { filter: layers.map(([x, y, b, c]) => `drop-shadow(${u(x)} ${u(y)} ${u(b)} ${c})`).join(" ") });
  } else if (layers.length) css(t, { "text-shadow": layers.map(([x, y, b, c]) => `${u(x)} ${u(y)} ${u(b)} ${c}`).join(", ") });
  if (node.outline) css(t, { "-webkit-text-stroke-width": u(node.outline.width), "-webkit-text-stroke-color": node.outline.color, "paint-order": "stroke fill" });
}

function buildText(node) {
  const wrap = el("div", "n n-text");
  css(wrap, { "justify-content": node.align === "left" ? "flex-start" : node.align === "right" ? "flex-end" : "center" });
  const t = el("div", `t f-${node.font}`, node.text);
  css(t, { "font-size": u(node.size), "text-align": node.align, color: node.color });
  applyTextEffects(t, node);
  wrap.append(t);
  return wrap;
}

// ------------------------------------------------------------------------------------------------ image
function buildImage(node) {
  const wrap = el("div", "n n-image");
  const img = new Image();
  img.alt = node.alt || "";
  img.decoding = "async";
  img.draggable = false;
  img.src = ASSETS[node.asset].file;
  css(img, { opacity: String(node.opacity ?? 1) });
  wrap.append(img);
  return wrap;
}

// ------------------------------------------------------------------------------------------------ GamID block (FAKE sample data; one indivisible logical element)
function span(cls, text) { return el("span", cls, text); }
function buildBlockContent(node) {
  const root = el("div", `blk blk-${node.block.replace(".", "-")}`);
  if (node.block === "league.rank") {
    const emblem = el("div", "emblem"); emblem.append(span("gem"), span("gem-inner"));
    const copy = el("div", "copy");
    copy.append(span("kicker", "RANKED SOLO/DUO"), span("title", "GOLD II"), span("meta", "64 LP  -  20W 18L"));
    root.append(emblem, copy, span("chip", "SAMPLE DATA - PROTOTYPE / UNVERIFIED"));
  } else {
    const avatar = el("div", "avatar", "S");
    const copy = el("div", "copy");
    copy.append(span("kicker", "GAMID"), span("title", "SP1KA_SAMPLE"), span("meta", "@sp1ka.sample"));
    const roles = el("div", "roles"); roles.append(span("role", "DUELIST"), span("role", "SUPPORT"));
    root.append(avatar, copy, roles, span("chip", "SAMPLE DATA"));
  }
  return root;
}

function buildBlock(node, geo, cum) {
  const natural = BLOCKS[node.block];
  const wrap = el("div", "n n-block");
  const inner = el("div", "block-inner");
  // the whole block scales as ONE unit: its internal pieces are sized in natural units under a single scaled --u
  css(inner, { "--u": `calc(var(--uw) * ${r2((cum * geo.w) / natural.w)})`, width: `calc(var(--u) * ${natural.w})`, height: `calc(var(--u) * ${natural.h})` });
  inner.append(buildBlockContent(node));
  wrap.append(inner);
  return wrap;
}

// ------------------------------------------------------------------------------------------------ embed FACADE (neutral, privacy-clean: no third-party request to draw it)
function buildEmbed(node, id, ctx) {
  const outer = el("div", `n n-embed prov-${node.provider}`);
  outer.dataset.provider = node.provider;
  const facade = ctx.live ? el("button", "facade") : el("div", "facade");
  if (ctx.live) { facade.type = "button"; facade.setAttribute("aria-label", `Play ${EMBED[node.provider].label}: ${node.label || "embedded media"}`); }
  const play = el("span", "f-play");
  facade.append(span("f-badge", EMBED[node.provider].label.toUpperCase()), span("f-title", node.label || ""), play, span("f-hint", ""), span("f-rule", "TOP LAYER ONLY"));
  outer.append(el("div", "player-slot"), facade);
  if (ctx.live) facade.addEventListener("click", () => ctx.embeds?.open(id));
  return outer;
}

// ------------------------------------------------------------------------------------------------ nodes
export function placeBox(node, geo) { css(node, { left: u(geo.x), top: u(geo.y), width: u(geo.w), height: u(geo.h) }); return node; }

export function buildNode(doc, id, ctx, cum = 1) {
  const node = doc.nodes[id], geo = geoOf(doc, id);
  let built;
  if (node.type === "text") built = buildText(node);
  else if (node.type === "image") built = buildImage(node);
  else if (node.type === "block") built = buildBlock(node, geo, cum);
  else if (node.type === "embed") built = buildEmbed(node, id, ctx);
  else if (node.type === "group") {
    const local = groupLocalBox(doc, id);
    built = el("div", "n n-group");
    const inner = el("div", "group-inner");
    css(inner, { "--u": `calc(var(--uw) * ${r2(cum * geo.s)})`, width: `calc(var(--u) * ${r2(local.w)})`, height: `calc(var(--u) * ${r2(local.h)})` });
    for (const childId of node.children) inner.append(buildNode(doc, childId, ctx, cum * geo.s));
    built.append(inner);
    css(built, { left: u(geo.x), top: u(geo.y), width: u(local.w * geo.s), height: u(local.h * geo.s) });
    built.dataset.id = id;
    return built;
  }
  placeBox(built, geo);
  built.dataset.id = id;
  return built;
}

// ------------------------------------------------------------------------------------------------ stages
function buildStage(doc, index, ctx) {
  const stage = el("section", "stage");
  stage.dataset.stage = String(index);
  css(stage, { height: u(STAGE_H) });
  const def = doc.stages[index];
  if (ctx.mode === "edit") stage.append(buildEditSlice(doc, index));
  if (def.background.mode === "own") stage.append(buildOwnBackground(def));
  const fg = el("div", "stage-fg");
  for (const id of def.children) fg.append(buildNode(doc, id, ctx));
  stage.append(fg);
  return stage;
}

// Editing: a single active stage.
export function renderEditStage(doc, index, ctx) {
  const page = el("div", `wall-page mode-edit`);
  const column = el("div", "wall-column");
  column.dataset.contain = ctx.contain || "none";
  column.append(buildStage(doc, index, { ...ctx, mode: "edit", live: false }));
  page.append(column);
  return { page, column };
}

// Visitor preview / overview / hosting pages: every stage stacked with ZERO gap over one continuous surface.
export function renderWallPage(doc, ctx) {
  const page = el("div", `wall-page mode-${ctx.mode}`);
  page.append(buildWallSurface(doc));
  const column = el("div", "wall-column");
  column.dataset.contain = ctx.contain || "none";
  if (ctx.capPx) css(page, { "--cap": `${ctx.capPx}px` });
  css(page, { "background-color": lastStop(doc.background.base) });
  doc.stages.forEach((_, i) => column.append(buildStage(doc, i, ctx)));
  page.append(column);
  return { page, column };
}

// Column width -> the ONE number the whole Wall scales from: --uw = column px / 1000 units.
export function attachColumnSizing(page, column, onSize) {
  const apply = () => {
    const width = column.getBoundingClientRect().width;
    css(page, { "--uw": `${width / UNITS_W}px` });
    onSize?.(width);
  };
  const observer = new ResizeObserver(apply);
  observer.observe(column);
  apply();
  return () => observer.disconnect();
}

export function setColumnPx(page, widthPx) { css(page, { "--uw": `${widthPx / UNITS_W}px` }); }

// Embed hint text depends on the ACTUAL rendered size on this device (inline vs in-page overlay player).
export function updateEmbedModes(root, { live }) {
  root.querySelectorAll(".n-embed").forEach(outer => {
    if (outer.classList.contains("is-live")) return;
    const rect = outer.getBoundingClientRect();
    if (!rect.width) return;
    const provider = outer.dataset.provider;
    const verdict = classifyEmbedPx(provider, rect.width, rect.height);
    outer.dataset.playMode = verdict.mode;
    outer.dataset.size = rect.width < 190 ? "tile" : "normal";
    const hint = outer.querySelector(".f-hint");
    hint.textContent = !live ? "EDIT MODE - FACADE ONLY" : verdict.mode === "inline" ? "TAP TO PLAY" : "TAP - OPENS LARGER PLAYER";
  });
}
