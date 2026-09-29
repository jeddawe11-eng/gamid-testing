// Turns the Wall core's render tree (renderDocument) into DOM nodes. This is the ONE place render-tree data becomes markup, and it is written so a document
// can never inject anything: text is only ever set with textContent, every CSS value is built from a validated number, a validated #rrggbb colour or an
// enumerated keyword (font families come from the built-in catalog by key), and no innerHTML / attribute-from-string is used anywhere.
import { renderDocument } from "../wall/render.js";
import { HEX_COLOR } from "../wall/fields.js";
import { fontCss } from "./fonts.js";
import { isAllowedOpenUrl } from "./embed/engine.js";
import { hasPoster } from "./posters.js";
import { paintGamidBlock } from "./gamid-blocks.js";
import { paintGamidData } from "./gamid-data-paint.js";
import { markInteractive, markPassThrough } from "./interaction.js";
import { safeMediaUrl, backgroundVideo } from "./video-background.js";
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

// ---- the Artwork engine (Round 3): one painter for every picture look - uploaded artwork and the live GamID profile picture alike -------------------------
// Structure:  node (.wall-el: filter effects, blend, opacity)  >  [piece window, a split piece only]  >  frame (.wall-art-frame: mask, corner radius, backdrop)  >  picture
// Every value comes from an enumerated key or a validated number / #rrggbb colour (image.js); nothing from the document is ever used as CSS text.
export const MASK_CLIP = Object.freeze({
  circle: "ellipse(50% 50% at 50% 50%)",
  rounded: "inset(0 round 18%)",
  hexagon: "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)",
  diamond: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
});
export const BLEND_CSS = Object.freeze({ normal: "normal", screen: "screen", multiply: "multiply", overlay: "overlay", "soft-light": "soft-light" });
const clampNum = (value, min, max) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);

// The CSS filter chain for validated effects (bounded again here - the painter never trusts a number blindly). Shadow and glow follow the mask's shape.
export function effectsFilter(effects, scale) {
  if (!effects || typeof effects !== "object") return "";
  const parts = [];
  if (Number.isFinite(effects.brightness) && effects.brightness !== 1) parts.push(`brightness(${num(clampNum(effects.brightness, 0, 2))})`);
  if (Number.isFinite(effects.contrast) && effects.contrast !== 1) parts.push(`contrast(${num(clampNum(effects.contrast, 0, 2))})`);
  if (Number.isFinite(effects.saturation) && effects.saturation !== 1) parts.push(`saturate(${num(clampNum(effects.saturation, 0, 3))})`);
  if (Number.isFinite(effects.blur) && effects.blur > 0) parts.push(`blur(${px(clampNum(effects.blur, 0, 40) * scale)})`);
  const shadow = effects.shadow;
  if (shadow && typeof shadow === "object") parts.push(`drop-shadow(${px(clampNum(shadow.x, -100, 100) * scale)} ${px(clampNum(shadow.y, -100, 100) * scale)} ${px(clampNum(shadow.blur, 0, 100) * scale)} ${hex(shadow.color)})`);
  const glow = effects.glow;
  if (glow && typeof glow === "object") {
    const blur = clampNum(glow.blur, 0, 100) * scale;
    parts.push(`drop-shadow(0 0 ${px(blur / 2)} ${hex(glow.color)})`, `drop-shadow(0 0 ${px(blur)} ${hex(glow.color)})`);
  }
  return parts.join(" ");
}

// Paints the LOOK onto `node` and returns the frame the picture goes into. `whole` = the size of the whole artwork (a split piece shows one band of it).
export function paintArtworkFrame(node, look, scale, item, createNode) {
  const legacy = look.backdrop === undefined;   // saved before Round 3: the exact old look - dark backing, the picture's own opacity, no effects
  const nodeStyle = node.style;
  nodeStyle.setProperty("overflow", "visible");   // the frame clips; shadow / glow may spread past the box (like text effects - taps never widen)
  const filter = effectsFilter(look.effects, scale);
  if (filter) nodeStyle.setProperty("filter", filter);
  if (look.blend && look.blend !== "normal" && BLEND_CSS[look.blend]) nodeStyle.setProperty("mix-blend-mode", BLEND_CSS[look.blend]);
  if (!legacy && Number.isFinite(look.opacity) && look.opacity !== 1) nodeStyle.setProperty("opacity", num(clampNum(look.opacity, 0, 1)));
  let host = node;
  let wholeW = item.width, wholeH = item.height;
  const slice = look.slice;
  if (slice && Number.isFinite(slice.from) && Number.isFinite(slice.to) && slice.to > slice.from) {
    const pieceWindow = createNode("div");
    pieceWindow.className = "wall-art-piece";
    for (const [name, value] of [["position", "absolute"], ["inset", "0"], ["overflow", "hidden"]]) pieceWindow.style.setProperty(name, value);
    node.append(pieceWindow);
    host = pieceWindow;
    const band = slice.to - slice.from;
    if (slice.dir === "h") wholeH = item.height / band; else wholeW = item.width / band;
  }
  const frame = createNode("div");
  frame.className = "wall-art-frame";
  const style = frame.style;
  const horizontal = slice?.dir === "h";
  const fixed = slice && slice.scale && Number.isFinite(slice.scale.w) && Number.isFinite(slice.scale.h) ? slice.scale : null;
  if (fixed) {
    // "Preserve source scale": the whole artwork keeps ONE size whatever the piece's box is; the piece is only a window onto it (moved by from / cross)
    wholeW = fixed.w * scale; wholeH = fixed.h * scale;
    const cross = Number.isFinite(slice.cross) ? slice.cross : 0;
    const left = horizontal ? -cross * wholeW : -slice.from * wholeW, top = horizontal ? -slice.from * wholeH : -cross * wholeH;
    for (const [name, value] of [["position", "absolute"], ["overflow", "hidden"], ["left", px(left)], ["top", px(top)], ["width", px(wholeW)], ["height", px(wholeH)]]) style.setProperty(name, value);
  } else {
    const offsetPct = slice ? num((-slice.from / (slice.to - slice.from)) * 100) : "0";
    const sizePct = slice ? num(100 / (slice.to - slice.from)) : "100";
    for (const [name, value] of [["position", "absolute"], ["overflow", "hidden"],
      ["left", slice && !horizontal ? `${offsetPct}%` : "0"], ["top", slice && horizontal ? `${offsetPct}%` : "0"],
      ["width", slice && !horizontal ? `${sizePct}%` : "100%"], ["height", slice && horizontal ? `${sizePct}%` : "100%"]]) style.setProperty(name, value);
  }
  const backdrop = legacy ? LEGACY_BACKDROP : look.backdrop;
  if (backdrop !== "none") style.setProperty("background", hex(backdrop));
  if (look.radius) style.setProperty("border-radius", px(Math.min(look.radius * scale, Math.min(wholeW, wholeH) / 2)));
  if (look.mask && MASK_CLIP[look.mask]) style.setProperty("clip-path", MASK_CLIP[look.mask]);
  host.append(frame);
  return frame;
}
const LEGACY_BACKDROP = "#14101f";

// The picture inside the frame. Without a crop: the saved fit / position (as before). With a crop: the source is scaled so the crop window fills the frame exactly
// (the editor keeps the box at the crop's proportions), by percentages only - the same at every size and for every piece of a split.
function artworkPicture(createNode, content, url, legacy) {
  const img = pictureNode(createNode, { url, fit: content.fit, posX: content.posX, posY: content.posY, opacity: legacy ? content.opacity : 1, alt: content.alt });
  const crop = content.crop;
  if (crop && crop.w > 0 && crop.h > 0) {
    const style = img.style;
    for (const [name, value] of [["position", "absolute"], ["max-width", "none"], ["object-fit", "fill"],
      ["width", `${num(100 / crop.w)}%`], ["height", `${num(100 / crop.h)}%`], ["left", `${num((-crop.x / crop.w) * 100)}%`], ["top", `${num((-crop.y / crop.h) * 100)}%`]]) style.setProperty(name, value);
  }
  return img;
}

function paintImage(node, content, scale, item, createNode, ctx) {
  const legacy = content.backdrop === undefined;
  const frame = paintArtworkFrame(node, content, scale, item, createNode);
  if (content.locked) node.setAttribute("data-locked", "true");
  if (content.clickThrough) node.setAttribute("data-click-through", "true");
  if (content.slice) node.setAttribute("data-slice-set", content.slice.set);
  const url = safeBlobUrl(ctx.assets?.urlFor?.(content.assetId));
  if (url) { frame.append(artworkPicture(createNode, content, url, legacy)); return; }
  const missing = createNode("div");
  missing.className = "wall-image-missing";
  missing.textContent = "Image";
  for (const [name, value] of [["display", "grid"], ["place-items", "center"], ["height", "100%"], ["color", "#8f88a3"], ["font", `700 ${px(28 * scale)} system-ui, sans-serif`]]) missing.style.setProperty(name, value);
  frame.append(missing);
}

// The CSS transform for a background's flips (validated booleans only).
export const backgroundFlip = background => {
  const x = background?.flipX === true ? -1 : 1, y = background?.flipY === true ? -1 : 1;
  return x === 1 && y === 1 ? "none" : `scale(${x}, ${y})`;
};

function paintBackgroundLayer(background, { createNode, ctx, width, height, index, count, scale, scope = "wall" }) {
  const layer = createNode("div");
  layer.className = "wall-bg";
  const style = layer.style;
  for (const [name, value] of [["position", "absolute"], ["left", "0"], ["width", px(width)], ["height", px(height * count)], ["top", px(-index * height)], ["overflow", "hidden"], ["z-index", "0"], ["pointer-events", "none"]]) style.setProperty(name, value);
  if (background.kind === "color") style.setProperty("background", hex(background.color));
  else if (background.kind === "gradient") style.setProperty("background", gradientCss(background));
  else if (background.kind === "image" || background.kind === "video") {
    style.setProperty("background", "#0d0b14");
    // Flip horizontal / vertical: a mirror of the drawn media only (CSS transform) - the uploaded file is never changed, re-encoded or copied
    const flip = backgroundFlip(background);
    if (background.kind === "image") {
      const url = safeBlobUrl(ctx.assets?.urlFor?.(background.assetId));
      if (url) {
        const picture = pictureNode(createNode, { url, fit: background.fit, posX: background.posX, posY: background.posY, opacity: background.opacity });
        if (flip !== "none") picture.style.setProperty("transform", flip);
        layer.append(picture);
      }
    } else {
      // a background VIDEO (video-background.js): muted, looping, inline, no controls, never a tap target; the same fit / position / opacity model as an image
      const url = safeMediaUrl(ctx.assets?.videoUrlFor?.(background.assetId));
      if (url) {
        const video = ctx.videos ? ctx.videos.take(`${scope}:${background.assetId}`, url, createNode) : backgroundVideo(url, createNode);
        video.className = "wall-bg-video";
        for (const [name, value] of [["display", "block"], ["width", "100%"], ["height", "100%"], ["object-fit", background.fit === "contain" ? "contain" : "cover"],
          ["object-position", `${num(background.posX)}% ${num(background.posY)}%`], ["opacity", num(background.opacity)], ["pointer-events", "none"],
          ["transform", flip]]) video.style.setProperty(name, value);   // (a pooled element is reused: its flip is always re-set, "none" included)
        layer.append(video);
      }
    }
    if (background.overlay) {
      const overlay = createNode("div");
      for (const [name, value] of [["position", "absolute"], ["inset", "0"], ["background", hex(background.overlay.color)], ["opacity", num(background.overlay.opacity)]]) overlay.style.setProperty(name, value);
      layer.append(overlay);
    }
  }
  void scale;
  return layer;
}

// What a link / card / player facade shows at a given size, so its content is never cut off: the hint goes first, then the provider chip; the title keeps as many
// lines as fit (at least one, ellipsized). Sizes are canonical units (the facade's type sizes are canonical units too), so the result is the same at every scale.
//   link   a pill: padding 18, one row [chip | title | hint]; title 30 units (35 tall), single line
//   card   a column: padding 30 (20 in a short box); chip 22 (27 tall), title 40 (46 per line), hint 24 (29 tall), gaps 10
//   embed  a player facade: the card column with the ▶ (10 margin + 64 + the 10 gap after it) on top
// Every box also has a 2-unit border on each side.
export const FACADE = Object.freeze({ chip: 27, title: 46, linkTitle: 35, hint: 29, gap: 10, play: 84, border: 4, linkPad: 18, linkChipMinWidth: 420, linkHintMinWidth: 560 });
export function facadeLayout(presentation, widthUnits, heightUnits) {
  if (presentation === "link") return { padding: FACADE.linkPad, showChip: widthUnits >= FACADE.linkChipMinWidth, showHint: widthUnits >= FACADE.linkHintMinWidth, titleLines: 1, showPlay: false };
  const padding = heightUnits < 200 ? 20 : 30;
  const showPlay = presentation === "embed";
  let room = heightUnits - 2 * padding - FACADE.border - (showPlay ? FACADE.play : 0) - FACADE.title;
  const showChip = room >= FACADE.chip + FACADE.gap;
  if (showChip) room -= FACADE.chip + FACADE.gap;
  const showHint = room >= FACADE.hint + FACADE.gap;
  if (showHint) room -= FACADE.hint + FACADE.gap;
  const titleLines = Math.max(1, Math.min(3, 1 + Math.floor(Math.max(0, room) / FACADE.title)));
  return { padding, showChip, showHint, titleLines, showPlay };
}

// A provider embed. EDIT: a facade card only (no iframe, no network). VIEW: link/card open the content; a player starts on a tap, always inline inside this same element
// (no overlay). Everything shown comes from the adapter's descriptor; the address followed is re-checked against the provider's own hosts.
function paintEmbed(node, descriptor, scale, item, createNode, ctx) {
  const view = ctx.mode === "view";
  const s = value => px(value * scale);
  const make = (tag, className, text) => { const n = createNode(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const openable = isAllowedOpenUrl(descriptor.providerKey, descriptor.openUrl);
  const link = descriptor.presentation === "link";
  const layout = facadeLayout(descriptor.presentation, item.width / scale, item.height / scale);
  node.setAttribute("data-provider", descriptor.providerKey);
  node.setAttribute("data-presentation", descriptor.presentation);
  const facade = view && openable && descriptor.presentation !== "embed" ? make("a", "wall-embed") : make("div", "wall-embed");
  if (view && openable && descriptor.presentation !== "embed") {
    markInteractive(facade);
    facade.setAttribute("href", descriptor.openUrl);
    facade.setAttribute("target", "_blank");
    facade.setAttribute("rel", "noopener noreferrer nofollow");
    facade.setAttribute("aria-label", `${descriptor.providerLabel} ${descriptor.contentLabel}: open`);
  }
  for (const [name, value] of [["box-sizing", "border-box"], ["display", "flex"], ["flex-direction", "column"], ["justify-content", "center"], ["align-items", "flex-start"], ["gap", s(FACADE.gap)], ["width", "100%"], ["height", "100%"],
    ["padding", s(layout.padding)], ["color", "#f7f5ff"], ["text-decoration", "none"], ["font-family", "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"],
    ["background", "linear-gradient(135deg, #1b1430, #0f0c1a)"], ["border", `${s(2)} solid rgba(139, 93, 255, .55)`], ["border-radius", s(link ? 999 : 28)], ["overflow", "hidden"]]) facade.style.setProperty(name, value);
  if (link) { facade.style.setProperty("flex-direction", "row"); facade.style.setProperty("align-items", "center"); }
  const chip = make("span", "wall-embed-provider", descriptor.providerLabel.toUpperCase());
  for (const [name, value] of [["font-size", s(22)], ["font-weight", "800"], ["letter-spacing", ".14em"], ["color", "#62e7ff"], ["flex", "none"], ["white-space", "nowrap"]]) chip.style.setProperty(name, value);
  const title = make("strong", "wall-embed-title", descriptor.caption ?? (descriptor.profile && descriptor.presentation !== "embed" ? `${descriptor.id.startsWith("@") ? "" : "@"}${descriptor.id}` : descriptor.contentLabel));
  const titleStyle = link
    ? [["font-size", s(30)], ["line-height", "1.15"], ["flex", "1 1 auto"], ["min-width", "0"], ["overflow", "hidden"], ["text-overflow", "ellipsis"], ["white-space", "nowrap"]]
    : [["font-size", s(40)], ["line-height", "1.15"], ["max-width", "100%"], ["overflow-wrap", "anywhere"], ["overflow", "hidden"], ["display", "-webkit-box"], ["-webkit-box-orient", "vertical"], ["-webkit-line-clamp", String(layout.titleLines)]];
  for (const [name, value] of titleStyle) title.style.setProperty(name, value);
  const hint = make("span", "wall-embed-hint", descriptor.presentation === "embed" ? (view ? "Tap to play" : "Plays in Preview") : `${view ? "Open" : "Opens"} on ${descriptor.providerLabel} ↗`);
  for (const [name, value] of [["font-size", s(24)], ["color", "#aaa4b7"], ["flex", "none"], ["white-space", "nowrap"]]) hint.style.setProperty(name, value);
  if (descriptor.presentation === "embed") {
    const play = make("span", "wall-embed-play", "▶");
    for (const [name, value] of [["font-size", s(64)], ["line-height", "1"], ["color", "#ffffff"], ["align-self", "center"], ["margin", `${s(10)} auto 0`], ["flex", "none"]]) play.style.setProperty(name, value);
    facade.append(play);
    facade.style.setProperty("align-items", "center");
    facade.style.setProperty("text-align", "center");
    if (view && ctx.players) {
      markInteractive(facade);
      facade.setAttribute("role", "button");
      facade.setAttribute("tabindex", "0");
      facade.setAttribute("aria-label", `Play ${descriptor.providerLabel} ${descriptor.contentLabel}`);
      facade.style.setProperty("cursor", "pointer");
      const start = () => ctx.players.activate(node, descriptor, { widthPx: item.width, heightPx: item.height, opener: facade });
      facade.addEventListener?.("click", start);
      facade.addEventListener?.("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault?.(); start(); } });
    }
  }
  if (layout.showChip) facade.append(chip);
  facade.append(title);
  if (layout.showHint) facade.append(hint);
  if (ctx.posters && hasPoster(descriptor)) (link ? paintLinkThumb : paintPoster)(facade, descriptor, ctx.posters, make, s);
  if (ctx.posters && descriptor.meta && !descriptor.caption) paintMeta(facade, descriptor, ctx.posters, title, layout.showHint ? hint : null, view);
  node.append(facade);
}

// The content's real public name and short line (a Discord server and its member count, a Steam game / profile / group, a Kick VOD title) instead of the generic
// label - before anything is opened. Only where the adapter declares `meta` and the owner wrote no caption of their own; plain text (textContent) only.
function paintMeta(facade, descriptor, posters, title, hint, view) {
  const apply = meta => {
    if (!meta) return;
    if (meta.title) { title.textContent = meta.title; facade.setAttribute("data-meta", "true"); }
    if (meta.subtitle && hint) hint.textContent = `${meta.subtitle} · ${descriptor.presentation === "embed" ? (view ? "Tap to play" : "Plays in Preview") : `${view ? "Open" : "Opens"} ↗`}`;
    if (meta.title && facade.getAttribute?.("aria-label")) facade.setAttribute("aria-label", `${descriptor.providerLabel} ${descriptor.contentLabel}: ${meta.title}${descriptor.presentation === "embed" ? "" : ": open"}`);
  };
  const known = posters.readyMeta?.(descriptor);
  if (known) { apply(known); return; }
  posters.metaFor?.(descriptor)?.then(apply, () => {});
}

// A Link (pill) gets a small square thumbnail at its start (a server icon, an avatar, a game header) - hidden until it has really decoded, removed on failure.
function paintLinkThumb(facade, descriptor, posters, make, s) {
  const img = make("img", "wall-embed-thumb");
  img.setAttribute("alt", "");
  img.setAttribute("aria-hidden", "true");
  img.setAttribute("decoding", "async");
  img.setAttribute("draggable", "false");
  for (const [name, value] of [["flex", "none"], ["width", s(44)], ["height", s(44)], ["border-radius", s(10)], ["object-fit", "cover"], ["opacity", "0"], ["display", "none"], ["pointer-events", "none"]]) img.style.setProperty(name, value);
  facade.prepend ? facade.prepend(img) : facade.append(img);
  const drop = () => img.remove?.();
  img.addEventListener?.("load", () => { img.style.setProperty("opacity", "1"); img.style.setProperty("display", "block"); facade.setAttribute("data-poster", "true"); });
  img.addEventListener?.("error", drop);
  const known = posters.readyFor?.(descriptor);
  if (known) { img.setAttribute("src", known); return; }
  posters.forDescriptor(descriptor).then(url => { if (url) img.setAttribute("src", url); else drop(); }, drop);
}

// The content's real poster behind a card / player facade (posters.js: GamID's own proxy, a blob: URL). It is added hidden and only shown once it has really
// decoded; any failure removes it, so the neutral facade stays - never a broken image. A scrim keeps the chip, title and hint readable on any picture.
function paintPoster(facade, descriptor, posters, make) {
  facade.style.setProperty("position", "relative");
  const img = make("img", "wall-embed-poster");
  img.setAttribute("alt", "");
  img.setAttribute("aria-hidden", "true");
  img.setAttribute("decoding", "async");
  img.setAttribute("draggable", "false");
  for (const [name, value] of [["position", "absolute"], ["inset", "0"], ["width", "100%"], ["height", "100%"], ["object-fit", "cover"], ["opacity", "0"], ["transition", "opacity .2s"], ["pointer-events", "none"], ["z-index", "0"]]) img.style.setProperty(name, value);
  const scrim = make("span", "wall-embed-scrim");
  for (const [name, value] of [["position", "absolute"], ["inset", "0"], ["background", "linear-gradient(to top, rgba(8,6,16,.88), rgba(8,6,16,.35) 55%, rgba(8,6,16,.15))"], ["opacity", "0"], ["pointer-events", "none"], ["z-index", "0"]]) scrim.style.setProperty(name, value);
  for (const child of [...(facade.children ?? [])]) { child.style?.setProperty?.("position", "relative"); child.style?.setProperty?.("z-index", "1"); }
  facade.prepend ? facade.prepend(img, scrim) : facade.append(img, scrim);
  const drop = () => { img.remove?.(); scrim.remove?.(); facade.removeAttribute?.("data-poster"); };
  img.addEventListener?.("load", () => { img.style.setProperty("opacity", "1"); scrim.style.setProperty("opacity", "1"); facade.setAttribute("data-poster", "true"); });
  img.addEventListener?.("error", drop);
  const known = posters.readyFor?.(descriptor);
  if (known) { img.style.removeProperty("transition"); img.setAttribute("src", known); return; }
  posters.forDescriptor(descriptor).then(url => { if (url) img.setAttribute("src", url); else drop(); }, drop);
}

// What an element's box clips, by content kind. Text effects (glow, shadow, outline) are meant to spread past the text box, so text is never clipped by its own box
// (the stage still clips at its edge). Pictures, shapes, provider surfaces and GamID blocks keep their exact geometry. Clipping is only visual: every wrapper is
// pass-through for taps (interaction.js), so a visible glow never widens what a tap can hit, and the editor's selection box is always the element's real box.
export const ELEMENT_OVERFLOW = Object.freeze({ text: "visible" });
export const overflowFor = kind => ELEMENT_OVERFLOW[kind] ?? "hidden";

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
  style.setProperty("overflow", overflowFor(item.content?.kind));
  markPassThrough(node);   // the box itself never takes a tap; only controls marked inside it do (view mode only)
  if (item.rotation) { style.setProperty("transform", `rotate(${num(item.rotation)}deg)`); style.setProperty("transform-origin", "center center"); }
  const content = item.content;
  if (content?.kind === "rect") paintRect(node, content, scale, item);
  else if (content?.kind === "text") paintText(node, content, scale, createNode);
  else if (content?.kind === "image") paintImage(node, content, scale, item, createNode, ctx);
  else if (content?.kind === "embed" && content.content?.kind === "embed") paintEmbed(node, content.content, scale, item, createNode, ctx);
  else if (content?.kind === "gamidData") paintGamidData(node, content, scale, item, createNode, ctx, { paintText, paintArtworkFrame, px });
  else if (content?.kind === "gamid") node.append(paintGamidBlock(content, ctx.gamid ?? null, createNode, { scale, interactive: ctx.mode === "view", details: ctx.details ?? null, posters: ctx.posters ?? null }));
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
  stage.style.setProperty("isolation", "isolate");   // blend modes mix with this stage only
  // a stage's own background wins; otherwise the Wall-wide one is laid across ALL stages so it can run continuously from one stage into the next
  if (stageTree.background) stage.append(paintBackgroundLayer(stageTree.background, { createNode, ctx, width: stageTree.width, height: stageTree.height, index: 0, count: 1, scale, scope: `stage:${stageTree.id}` }));
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