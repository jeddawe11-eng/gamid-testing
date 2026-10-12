// Paints the Wall's platform icons (Product Memory DEC-0006): an embed shown as Icon (one badge) and the Icon Group element (several badges that align and wrap by
// themselves). Every badge is the accepted Classic My Socials badge (each provider adapter's `icon`; platform-icons.js). Like the rest of paint.js: text only through textContent, every CSS value from
// a validated number or one of platform-icons.js' fixed constants, and an address is only ever followed after it passes the same check again - a platform icon only
// to that provider's own hosts (isAllowedOpenUrl), an Other icon only by the Other link rule (isSafeLinkUrl). EDIT mode draws the badges without links (taps select).
import { platformIcon, iconKeyFor, MARK_INSET } from "./platform-icons.js";
import { isAllowedOpenUrl } from "./embed/engine.js";
import { isSafeLinkUrl } from "./text.js";
import { iconGroupLayout } from "./icons.js";
import { markInteractive } from "./interaction.js";

const num = value => (Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : "0");
const px = value => `${num(value)}px`;
const JUSTIFY = Object.freeze({ left: "flex-start", center: "center", right: "flex-end" });

// The address a resolved icon may open, or null.
export function iconHref({ platform, providerKey, url }) {
  if (platform === "other") return isSafeLinkUrl(url) ? url : null;
  return providerKey && isAllowedOpenUrl(providerKey, url) ? url : null;
}

// One badge, `diameter` CSS px. `href` set (view mode only) makes it a real link that opens in a new tab with no access back to the Wall.
export function paintIconBadge(createNode, { platform, label }, diameter, href = null) {
  const key = iconKeyFor(platform);
  const icon = platformIcon(key);
  const badge = createNode(href ? "a" : "span");
  badge.className = "wall-icon";
  badge.setAttribute("data-platform", key);
  const style = badge.style;
  for (const [name, value] of [["box-sizing", "border-box"], ["position", "relative"], ["display", "grid"], ["place-items", "center"], ["flex", "none"],
    ["width", px(diameter)], ["height", px(diameter)], ["border-radius", "50%"], ["background", icon.background], ["color", icon.color], ["text-decoration", "none"],
    ["overflow", "hidden"], ["font", `900 ${px(diameter * (icon.glyphScale ?? 0.3))}/1 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`], ["letter-spacing", "-.02em"]]) style.setProperty(name, value);
  if (icon.ring) style.setProperty("box-shadow", `inset 0 0 0 ${px(Math.max(1, diameter * icon.ring.width))} ${icon.ring.color}`);
  if (icon.mark) {
    const mark = createNode("span");
    mark.className = "wall-icon-mark";
    mark.setAttribute("aria-hidden", "true");
    for (const [name, value] of [["position", "absolute"], ["inset", `${num(MARK_INSET * 100)}%`], ["background", icon.color], ["pointer-events", "none"],
      ["-webkit-mask", `${icon.mark} center/contain no-repeat`], ["mask", `${icon.mark} center/contain no-repeat`]]) mark.style.setProperty(name, value);
    badge.append(mark);
  } else {
    const glyph = createNode("span");
    glyph.className = "wall-icon-glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = icon.glyph;
    badge.append(glyph);
  }
  if (href) {
    markInteractive(badge);
    badge.setAttribute("href", href);
    badge.setAttribute("target", "_blank");
    badge.setAttribute("rel", "noopener noreferrer nofollow");
    badge.setAttribute("aria-label", `${label} (opens in a new tab)`);
    badge.setAttribute("title", label);
    style.setProperty("cursor", "pointer");
  } else {
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", label);
  }
  return badge;
}

function iconBox(createNode, column) {
  const box = createNode("div");
  box.className = "wall-icons";
  for (const [name, value] of [["box-sizing", "border-box"], ["display", "flex"], ["flex-direction", column ? "column" : "row"], ["align-items", "center"],
    ["justify-content", "center"], ["width", "100%"], ["height", "100%"]]) box.style.setProperty(name, value);
  return box;
}

// An embed shown as Icon: one badge, as large as the element's shorter side, centred in its box.
export function paintEmbedIcon(node, descriptor, item, createNode, ctx = {}) {
  node.setAttribute("data-provider", descriptor.providerKey);
  node.setAttribute("data-presentation", "icon");
  const href = ctx.mode === "view" ? iconHref({ platform: descriptor.providerKey, providerKey: descriptor.providerKey, url: descriptor.openUrl }) : null;
  const label = descriptor.caption ?? `${descriptor.providerLabel} ${descriptor.contentLabel}`;
  const box = iconBox(createNode, false);
  box.append(paintIconBadge(createNode, { platform: descriptor.providerKey, label }, Math.min(item.width, item.height), href));
  node.append(box);
}

// The Icon Group: rows of badges laid out by iconGroupLayout (all icons always fit; the rows line up by `align`), in the owner's order.
export function paintIcons(node, content, scale, item, createNode, ctx = {}) {
  const items = Array.isArray(content.items) ? content.items : [];
  node.setAttribute("data-icons", String(items.length));
  const layout = iconGroupLayout(items.length, item.width / scale, item.height / scale, { size: content.size, gap: content.gap });
  const box = iconBox(createNode, true);
  box.style.setProperty("gap", px(layout.gap * scale));
  const view = ctx.mode === "view";
  for (let start = 0; start < items.length; start += layout.perRow) {
    const row = createNode("div");
    row.className = "wall-icons-row";
    for (const [name, value] of [["display", "flex"], ["flex-wrap", "nowrap"], ["align-items", "center"], ["justify-content", JUSTIFY[content.align] ?? "center"],
      ["gap", px(layout.gap * scale)], ["width", "100%"]]) row.style.setProperty(name, value);
    for (const icon of items.slice(start, start + layout.perRow)) row.append(paintIconBadge(createNode, icon, layout.size * scale, view ? iconHref(icon) : null));
    box.append(row);
  }
  node.append(box);
}
