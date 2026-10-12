// The Wall `icons` element: an Icon Group (Product Memory DEC-0006) - one Wall element holding several platform icons, each opening its own validated address. It
// registers itself into the Wall core's element registry (importing this module is what makes a document with an Icon Group valid); the core never names it.
//
//   items  1..24 icons, in the owner's order. Each is EITHER the parts of a platform link { providerKey, kind, id } - exactly what an embed stores, checked by the
//          same provider adapters (the Wall link engine; every kind of every provider, not only accounts) - OR an "Other" web address { url }, checked by the same rule
//          as an Other text link (text.js LINK_URL). Nothing else is accepted: no address is ever stored for a platform icon (it is rebuilt by its adapter), and no
//          markup, script or other scheme can pass.
//   size   optional, 40..400 canonical units: the largest icon diameter (default 120)    gap  optional, 0..200 units between icons (default 24)
//   align  optional: left | center | right - how each row lines up (default center)
//
// The icons align and wrap automatically inside the element's box (iconGroupLayout): the owner moves and resizes the group as one element and never places an icon by
// hand; when the box is too small for every icon at `size`, all of them shrink together so none is ever cut off. The database mirrors validateIconsPayload exactly
// (private.wall_icons_payload_errors), kept identical by the shared corpus (tests/wall-w2-corpus.js).
import { elementRegistry } from "../wall/elements.js";
import { isSet, inRange, isPlainObject } from "../wall/fields.js";
import { PROVIDERS, detectEmbed, humanReason } from "./embed/engine.js";
import { isSafeLinkUrl } from "./text.js";
import { normalizeLinkInput, LINK_PROBLEMS } from "./links.js";

export const ICON_LIMITS = Object.freeze({ items: 24, size: [40, 400], gap: [0, 200] });
export const ICON_ALIGNS = Object.freeze(["left", "center", "right"]);
export const ICON_DEFAULTS = Object.freeze({ size: 120, gap: 24, align: "center" });

const PLATFORM_KEYS = ["providerKey", "kind", "id"];
const providerKind = item => {
  const provider = typeof item.providerKey === "string" ? PROVIDERS.get(item.providerKey) : null;
  return provider && typeof item.kind === "string" && Object.hasOwn(provider.kinds, item.kind) ? { provider, kind: provider.kinds[item.kind] } : null;
};
export const isOtherIcon = item => isPlainObject(item) && Object.hasOwn(item, "url");

// One icon of a group: { providerKey, kind, id } validated by its adapter, or { url } validated by the Other link rule - exactly these keys.
export function iconItemOk(item) {
  if (!isPlainObject(item)) return false;
  const keys = Object.keys(item);
  if (keys.length === 1 && keys[0] === "url") return isSafeLinkUrl(item.url);
  if (keys.length !== PLATFORM_KEYS.length || !PLATFORM_KEYS.every(key => keys.includes(key))) return false;
  const found = providerKind(item);
  return !!found && typeof item.id === "string" && new RegExp(found.kind.id).test(item.id);
}

export function validateIconsPayload(payload) {
  if (!isPlainObject(payload)) return ["PAYLOAD_NOT_OBJECT"];
  const errors = [];
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > ICON_LIMITS.items) errors.push("INVALID_ICON_ITEMS");
  else if (!payload.items.every(iconItemOk)) errors.push("INVALID_ICON_ITEM");
  if (isSet(payload.size) && !inRange(payload.size, ...ICON_LIMITS.size)) errors.push("INVALID_ICON_SIZE");
  if (isSet(payload.gap) && !inRange(payload.gap, ...ICON_LIMITS.gap)) errors.push("INVALID_ICON_GAP");
  if (isSet(payload.align) && !ICON_ALIGNS.includes(payload.align)) errors.push("INVALID_ICON_ALIGN");
  return errors;
}

const hostOf = url => { try { return new URL(url).hostname; } catch { return "Link"; } };

// What one icon shows and opens: its platform badge key, an accessible label, and the address - rebuilt by the adapter for a platform icon, the stored (validated)
// address for Other. The painter checks the address again before it is ever followed.
export function resolveIconItem(item) {
  if (isOtherIcon(item)) return { platform: "other", label: hostOf(item.url), url: item.url };
  const found = providerKind(item);
  if (!found) return { platform: "other", label: "Link", url: null };
  return { platform: item.providerKey, providerKey: item.providerKey, label: `${found.provider.label} ${found.kind.label}`, url: found.provider.openUrl(item.kind, item.id) };
}

// A plain, JSON-serializable description for the painter. Only known fields are copied.
export function renderIconsPayload(payload) {
  return {
    kind: "icons",
    items: payload.items.map(resolveIconItem),
    size: isSet(payload.size) ? payload.size : ICON_DEFAULTS.size,
    gap: isSet(payload.gap) ? payload.gap : ICON_DEFAULTS.gap,
    align: isSet(payload.align) ? payload.align : ICON_DEFAULTS.align,
  };
}

const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));
// A uniform group resize scales the icon size and spacing with it.
export function scaleIconsPayload(payload, factor) {
  const next = { ...payload };
  if (typeof payload.size === "number") next.size = clamp(Math.round(payload.size * factor), ICON_LIMITS.size);
  if (typeof payload.gap === "number") next.gap = clamp(Math.round(payload.gap * factor), ICON_LIMITS.gap);
  return next;
}

// Automatic alignment and wrapping (canonical units): the largest icon size <= `size` at which ALL `count` icons fit inside the box, with the spacing shrinking in
// proportion. -> { size, gap, perRow, rows }. Pure, so the same document lays out identically everywhere.
export function iconGroupLayout(count, widthUnits, heightUnits, { size = ICON_DEFAULTS.size, gap = ICON_DEFAULTS.gap } = {}) {
  const n = Math.max(1, Math.trunc(count) || 1);
  const fits = s => {
    const g = size > 0 ? gap * (s / size) : 0;
    const perRow = Math.max(1, Math.min(n, Math.floor((widthUnits + g) / (s + g))));
    const rows = Math.ceil(n / perRow);
    return s <= widthUnits && rows * s + (rows - 1) * g <= heightUnits ? { size: s, gap: g, perRow, rows } : null;
  };
  for (let s = Math.floor(size); s >= 1; s -= 1) { const layout = fits(s); if (layout) return layout; }
  return { size: Math.max(1, Math.min(widthUnits, heightUnits / n)), gap: 0, perRow: 1, rows: n };
}

// A new group's starting box: up to 6 icons per row at the default size.
export function defaultIconGroupSize(count) {
  const n = Math.max(1, Math.min(ICON_LIMITS.items, Math.trunc(count) || 1));
  const perRow = Math.min(n, 6), rows = Math.ceil(n / perRow), { size, gap } = ICON_DEFAULTS;
  return { width: perRow * size + (perRow - 1) * gap, height: rows * size + (rows - 1) * gap };
}

export const createIconsPayload = (items, overrides = {}) => ({ items: items.map(item => ({ ...item })), ...overrides });

// What the owner TYPES for an icon -> the item to store, through the Wall's own link engine: a supported platform link becomes that platform's parts (any kind the
// adapters know); any other website becomes an Other icon (the Other link rule). A supported site whose page the adapters cannot express, and anything unsafe, is refused
// with the same words the Media & Links box uses. -> { ok: true, item } | { ok: false, message }
export function iconItemFromInput(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: false, message: LINK_PROBLEMS.empty };
  const detected = detectEmbed(raw);
  if (detected.ok) return { ok: true, item: { providerKey: detected.providerKey, kind: detected.kind, id: detected.id } };
  if (detected.reason !== "UNSUPPORTED_SITE") return { ok: false, message: humanReason[detected.reason] };
  const link = normalizeLinkInput(raw);
  return link.ok ? { ok: true, item: { url: link.url } } : { ok: false, message: LINK_PROBLEMS[link.reason] };
}
// The address an icon opens, for the editor's own fields (never painted from here).
export const iconItemAddress = item => resolveIconItem(item).url ?? "";

elementRegistry.register("icons", { validatePayload: validateIconsPayload, render: renderIconsPayload, scale: scaleIconsPayload });
