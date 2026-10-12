// Wall Icon display option and Icon Group (Product Memory DEC-0006). All 14 Media & Links platforms (13 provider adapters + Other) and every URL kind the Wall
// supports can be shown as an Icon; an Icon Group holds several icons in one element that aligns and wraps them by itself. The badges are the accepted Classic
// My Socials badges (kept byte-identical to dist/public/public.css here), every address comes from the Wall link engine, and the database mirrors the validator
// (the shared corpus in tests/wall-w2-corpus.js; the migration shape is pinned below).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { validateDocument } from "../dist/wall/validate.js";
import { createDocument } from "../dist/wall/schema.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { PROVIDERS, detectEmbed, buildEmbedPayload, presentationsFor, validateEmbedData, isAllowedOpenUrl, ICON_SIZE, PRESENTATION_LABELS } from "../dist/wall-kit/embed/index.js";
import { paintDocument, paintElement } from "../dist/wall-kit/paint.js";
import * as ops from "../dist/wall-kit/ops.js";
import { ICON_LIMITS, iconGroupLayout, iconItemFromInput, iconItemOk, validateIconsPayload, renderIconsPayload, scaleIconsPayload, defaultIconGroupSize, createIconsPayload } from "../dist/wall-kit/icons.js";
import { OTHER_ICON, platformIcon, iconKeyFor, MARK_INSET } from "../dist/wall-kit/platform-icons.js";
import { iconHref } from "../dist/wall-kit/icons-paint.js";
import { SOCIAL_PLATFORMS } from "../dist/account/socials.js";
import { CORPUS } from "./wall-w2-corpus.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("dist/public/public.css");

// one real id for EVERY kind of every provider (the test fails if a kind is added without one)
const SAMPLES = {
  youtube: { video: "dQw4w9WgXcQ", playlist: "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf", channel: "@espada" },
  tiktok: { video: "7106594312292453675", profile: "@scout2015" },
  twitch: { channel: "shroud", video: "1234567890", clip: "AwkwardHelplessSalamanderSwiftRage" },
  spotify: { track: "4uLU6hMCjMI75M1A2tKUQC", episode: "512ojhOuo1ktJprKbVcKyQ", album: "1DFixLWuPkv3KT3TnV35m3", playlist: "37i9dQZF1DXcBWIGoYBM5M", show: "5CfCWKI5pZ28U0uOzXkDHe", artist: "0OdUWJ0sBjDrqHygGUXeCF" },
  soundcloud: { track: "forss/flickermood", playlist: "forss/sets/soulhack", profile: "forss" },
  vimeo: { video: "76979871", profile: "staffpicks" },
  kick: { channel: "xqc", video: "xqc/01a0df43-5130-7429-af65-66a176d79e10" },
  facebook: { video: "10153231379946729", reel: "1234567890123", page: "NASA" },
  snapchat: { spotlight: "W7_EDlXWTBiXAEEniNoMPwAAYdWxvYnBhaHR3AaARhNpsAaARhNmWAAAAAQ", profile: "snapchat" },
  x: { post: "1234567890", profile: "espada" },
  instagram: { post: "CuE7nlpNr0b", reel: "CuE7nlpNr0b", profile: "espada.gg" },
  discord: { invite: "abc123", profile: "374102653111762948" },
  steam: { app: "570", profile: "76561197960287930", group: "valve" },
};
const EVERY_KIND = Object.entries(SAMPLES).flatMap(([providerKey, kinds]) => Object.entries(kinds).map(([kind, id]) => ({ providerKey, kind, id })));

// a tiny DOM stand-in, enough for the painter
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.styles = {}; this.textContent = ""; this.className = ""; this.style = { setProperty: (k, v) => { this.styles[k] = v; }, removeProperty: k => { delete this.styles[k]; } }; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); }
}
const make = tag => new Node(tag);
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); for (const child of node.children) all(child, predicate, out); return out; };
const badges = node => all(node, n => n.className === "wall-icon");
const docWith = (...elements) => { const doc = createDocument(); doc.stages[0].elements = elements; return doc; };
const iconEmbed = (id, item, extra = {}) => ({ id, type: "embed", x: 100, y: 100, width: ICON_SIZE, height: ICON_SIZE, z: 0, payload: { providerKey: item.providerKey, data: { kind: item.kind, id: item.id, presentation: "icon" } }, ...extra });
const group = (id, payload, extra = {}) => ({ id, type: "icons", x: 50, y: 50, width: 600, height: 300, z: 0, payload, ...extra });

// ---- 14 platforms, Classic branding ---------------------------------------------------------------------------------------------------------------------------
test("14 platforms: every Media & Links provider adapter declares a badge, and Other has the generic link icon", () => {
  assert.deepEqual([...PROVIDERS.keys()].sort(), ["discord", "facebook", "instagram", "kick", "snapchat", "soundcloud", "spotify", "steam", "tiktok", "twitch", "vimeo", "x", "youtube"]);
  for (const [key, provider] of PROVIDERS) {
    assert.ok(provider.icon && /^(#[0-9a-f]{6}|linear-gradient\()/.test(provider.icon.background) && /^#[0-9a-f]{6}$/.test(provider.icon.color), key);
    assert.ok(!!provider.icon.mark !== !!provider.icon.glyph, `${key}: a mark or a glyph`);
    assert.equal(platformIcon(key), provider.icon);
    assert.equal(iconKeyFor(key), key);
  }
  assert.equal(platformIcon("other"), OTHER_ICON);
  for (const unknown of ["myspace", "", "__proto__", undefined]) { assert.equal(platformIcon(unknown), OTHER_ICON, String(unknown)); assert.equal(iconKeyFor(unknown), "other"); }
  assert.match(OTHER_ICON.mark, /^url\("data:image\/svg\+xml,%3Csvg xmlns='http:\/\/www\.w3\.org\/2000\/svg' viewBox='0 0 24 24'%3E/);
  assert.equal(MARK_INSET, 0.24, "the Classic mark inset (inset:24%)");
});

const norm = value => value.replace(/\s+/g, "").toLowerCase().replace(/#([0-9a-f])([0-9a-f])([0-9a-f])(?![0-9a-f])/g, "#$1$1$2$2$3$3");
test("Classic branding reused, byte for byte: every mark is the Classic My Socials (or My Games Steam) data URI; colours, inner rings and glyphs match the Classic badges", () => {
  const mark = key => {
    const desktop = new RegExp(`html\\.is-public-desktop \\.social-icon\\[data-platform=${key}\\]\\{--social-mark:(url\\("[^"]+"\\))\\}`).exec(css);
    const allWidths = new RegExp(`\\n\\.public-social \\.social-icon\\[data-platform=${key}\\]\\{--social-mark:(url\\("[^"]+"\\))\\}`).exec(css);
    return (desktop ?? allWidths)?.[1] ?? null;
  };
  for (const key of ["discord", "instagram", "tiktok", "twitch", "kick", "snapchat", "spotify", "soundcloud", "vimeo"]) assert.equal(PROVIDERS.get(key).icon.mark, mark(key), `${key}: the Classic mark`);
  assert.equal(PROVIDERS.get("steam").icon.mark, /\.pg-icon\.is-steam\{[^}]*--pg-icon:(url\("[^"]+"\))/.exec(css)[1], "Steam: the Classic My Games mark");
  const glyphs = Object.fromEntries(SOCIAL_PLATFORMS.map(platform => [platform.key, platform.glyph]));
  for (const key of ["youtube", "x", "facebook"]) { assert.equal(PROVIDERS.get(key).icon.glyph, glyphs[key], `${key}: the Classic glyph`); assert.equal(mark(key), null, `${key} has no drawn Classic mark`); }
  for (const platform of SOCIAL_PLATFORMS) {
    const rule = new RegExp(`\\n\\.public-social \\.social-icon\\[data-platform=${platform.key}\\]\\{([^}]*)\\}`).exec(css)[1];
    const background = /background:([^;]+)/.exec(rule)[1];
    assert.equal(norm(PROVIDERS.get(platform.key).icon.background), norm(background), `${platform.key}: the Classic colour`);
    const ring = /box-shadow:inset 0 0 0 ([0-9.]+)px (#[0-9a-f]+)/.exec(rule);
    if (ring) assert.equal(PROVIDERS.get(platform.key).icon.ring?.color, ring[2], `${platform.key}: the Classic inner ring`);
    else assert.equal(PROVIDERS.get(platform.key).icon.ring, undefined, platform.key);
  }
  // the mark / glyph colour: black on Kick's green, Snapchat's yellow and Spotify's green - white elsewhere, as on the Classic badges
  for (const [key, provider] of PROVIDERS) assert.equal(provider.icon.color, ["kick", "snapchat", "spotify"].includes(key) ? "#000000" : "#ffffff", key);
  assert.match(css, /html\.is-public-desktop \.social-icon\[data-platform=kick\]::before,html\.is-public-desktop \.social-icon\[data-platform=snapchat\]::before\{background:#000\}/);
  assert.match(css, /\.public-social \.social-icon\[data-platform=spotify\]::before\{background:#000\}/);
});

test("the Classic Profile itself is untouched: no Classic stylesheet or My Socials code imports the Wall icons", () => {
  for (const file of ["dist/account/socials.js", "dist/public/public.js", "dist/public/discord-card.js"]) assert.doesNotMatch(read(file), /platform-icons|icons-paint|wall-kit\/icons/, file);
  assert.doesNotMatch(css, /wall-icon/);
});

// ---- every URL kind ---------------------------------------------------------------------------------------------------------------------------------------
test("every URL kind of every platform offers Icon (always last), next to its unchanged Player / Card / Link choices", () => {
  const kinds = [...PROVIDERS].flatMap(([providerKey, provider]) => Object.keys(provider.kinds).map(kind => `${providerKey}/${kind}`)).sort();
  assert.deepEqual(EVERY_KIND.map(item => `${item.providerKey}/${item.kind}`).sort(), kinds, "a sample for every kind");
  for (const { providerKey, kind, id } of EVERY_KIND) {
    const spec = PROVIDERS.get(providerKey).kinds[kind];
    const offered = presentationsFor(spec);
    assert.equal(offered.at(-1), "icon", `${providerKey}/${kind}`);
    assert.deepEqual(offered.slice(0, -1), (spec.inline ? ["embed", "card", "link"] : ["card", "link"]).filter(value => !spec.presentations || spec.presentations.includes(value)), `${providerKey}/${kind}: the earlier choices are unchanged`);
    assert.deepEqual(validateEmbedData(PROVIDERS.get(providerKey), { kind, id, presentation: "icon" }), [], `${providerKey}/${kind} as an Icon`);
    assert.ok(iconItemOk({ providerKey, kind, id }), `${providerKey}/${kind} in an Icon Group`);
  }
  assert.equal(PRESENTATION_LABELS.icon, "Icon");
  // a pasted link offers it too, and builds a valid Icon payload
  const detected = detectEmbed("https://discord.com/users/374102653111762948");
  assert.deepEqual(detected.presentations, ["link", "icon"]);
  assert.deepEqual(buildEmbedPayload(detected, { presentation: "icon" }), { payload: { providerKey: "discord", data: { kind: "profile", id: "374102653111762948", presentation: "icon" } }, errors: [] });
  assert.deepEqual(buildEmbedPayload(detected, { presentation: "card" }).errors, ["INVALID_PRESENTATION"], "the Discord profile stays Link-only otherwise");
});

// ---- Single Icon ----------------------------------------------------------------------------------------------------------------------------------------
test("Single Icon: one badge in its own element; on the Wall it opens the adapter-rebuilt address in a new tab; in the editor it is not a link", () => {
  for (const item of EVERY_KIND) {
    const doc = docWith(iconEmbed("e1", item));
    assert.deepEqual(validateDocument(doc).errors, [], `${item.providerKey}/${item.kind}`);
    const view = paintDocument(doc, 1000, make, { mode: "view" });
    const [badge, ...rest] = badges(view.stages[0]);
    assert.equal(rest.length, 0);
    const openUrl = PROVIDERS.get(item.providerKey).openUrl(item.kind, item.id);
    assert.equal(badge.tag, "a");
    assert.deepEqual([badge.attrs.href, badge.attrs.target, badge.attrs.rel, badge.attrs["data-platform"]], [openUrl, "_blank", "noopener noreferrer nofollow", item.providerKey]);
    assert.ok(isAllowedOpenUrl(item.providerKey, openUrl));
    assert.match(badge.attrs["aria-label"], / \(opens in a new tab\)$/);
    assert.equal(badge.styles.width, `${ICON_SIZE}px`, "the badge fills the shorter side at full scale");
    const edit = paintDocument(doc, 1000, make, { mode: "edit" });
    assert.equal(badges(edit.stages[0])[0].tag, "span", "editing: taps select the element, nothing opens");
    assert.equal(badges(edit.stages[0])[0].attrs.href, undefined);
  }
  const doc = docWith(iconEmbed("e1", { providerKey: "youtube", kind: "video", id: "dQw4w9WgXcQ" }, { width: 300, height: 200 }));
  const painted = paintDocument(doc, 500, make, { mode: "view" });
  assert.equal(badges(painted.stages[0])[0].styles.width, "100px", "at half scale the 200-unit side is 100px: a round badge, never stretched");
});

test("Single Icon in the editor: Show as switches Card / Link / Player <-> Icon in one undoable step; the box becomes a square badge and back", () => {
  const card = { id: "e1", type: "embed", x: 100, y: 100, width: 800, height: 260, z: 0, payload: { providerKey: "twitch", data: { kind: "channel", id: "shroud", presentation: "card" } } };
  const toIcon = ops.setEmbedData(docWith(card), "e1", { presentation: "icon" });
  assert.equal(toIcon.ok, true);
  const icon = toIcon.doc.stages[0].elements[0];
  assert.deepEqual([icon.width, icon.height, icon.x + icon.width / 2, icon.y + icon.height / 2], [ICON_SIZE, ICON_SIZE, 500, 230], "square, centred where the card was");
  assert.equal(ops.lockedAspect(icon), 1, "resizing keeps it round");
  assert.deepEqual(ops.minSizeOf(icon), { width: 67, height: 67 }, "a touch target at the narrowest column");
  const back = ops.setEmbedData(toIcon.doc, "e1", { presentation: "link" }).doc.stages[0].elements[0];
  assert.deepEqual([back.width, back.height], [640, 96], "a Link gets its starting size again");
  const player = ops.setEmbedData(toIcon.doc, "e1", { presentation: "embed" });
  assert.equal(player.ok, true);
  assert.ok(player.doc.stages[0].elements[0].width >= ops.minSizeOf(player.doc.stages[0].elements[0]).width, "a Player gets at least its own minimum");
  assert.deepEqual(ops.setEmbedData(docWith(card), "e1", { presentation: "badge" }).errors, ["PROVIDER:INVALID_PRESENTATION:e1"]);
});

// ---- Icon Group -------------------------------------------------------------------------------------------------------------------------------------------
const MIXED = ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", "discord.gg/abc123", "https://discord.com/users/374102653111762948",
  "https://store.steampowered.com/app/570", "https://www.tiktok.com/@scout2015", "https://kick.com/xqc", "https://paypal.me/example"];
test("Icon Group: links typed by the owner go through the Wall link engine - any platform kind keeps its parts, any other website is an Other icon, unsafe input is refused", () => {
  const parsed = MIXED.map(iconItemFromInput);
  assert.ok(parsed.every(result => result.ok));
  assert.deepEqual(parsed.map(result => result.item), [
    { providerKey: "youtube", kind: "video", id: "dQw4w9WgXcQ" }, { providerKey: "spotify", kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC" }, { providerKey: "discord", kind: "invite", id: "abc123" },
    { providerKey: "discord", kind: "profile", id: "374102653111762948" }, { providerKey: "steam", kind: "app", id: "570" }, { providerKey: "tiktok", kind: "profile", id: "@scout2015" },
    { providerKey: "kick", kind: "channel", id: "xqc" }, { url: "https://paypal.me/example" },
  ]);
  for (const bad of ["", "   ", "javascript:alert(1)", "data:text/html,x", "https://user:pw@example.com/", "https://www.youtube.com/feed/trending", "not a link", "ftp://files.example/a", "https://localhost/x"]) assert.equal(iconItemFromInput(bad).ok, false, bad);
  assert.equal(iconItemFromInput("mysite.example/shop").item.url, "https://mysite.example/shop", "a bare address becomes https");
});

test("Icon Group: one element holding up to 24 icons, each validated on its own; invalid or unsafe items are refused (the database refuses the same - see the corpus)", () => {
  const items = MIXED.map(url => iconItemFromInput(url).item);
  assert.deepEqual(validateIconsPayload(createIconsPayload(items)), []);
  assert.deepEqual(validateIconsPayload({ items: Array.from({ length: ICON_LIMITS.items }, () => items[0]) }), []);
  assert.deepEqual(validateIconsPayload({ items: Array.from({ length: ICON_LIMITS.items + 1 }, () => items[0]) }), ["INVALID_ICON_ITEMS"]);
  assert.deepEqual(validateIconsPayload({ items: [] }), ["INVALID_ICON_ITEMS"]);
  for (const bad of [{ url: "javascript:alert(1)" }, { url: "https://a.example/x", label: "x" }, { providerKey: "youtube", kind: "video", id: "nope" }, { providerKey: "youtube", kind: "video" }, { ...items[0], presentation: "icon" }, "https://paypal.me/x", null, [items[0]]]) {
    assert.deepEqual(validateIconsPayload({ items: [items[0], bad] }), ["INVALID_ICON_ITEM"], JSON.stringify(bad));
  }
  assert.deepEqual(validateIconsPayload({ items, size: 39, gap: 201, align: "top" }), ["INVALID_ICON_SIZE", "INVALID_ICON_GAP", "INVALID_ICON_ALIGN"]);
  assert.deepEqual(validateDocument(docWith(group("g1", { items: [{ url: "https://a.example/<script>" }] }))).errors.sort(), ["INVALID_ICON_ITEM:g1", "UNSAFE_PAYLOAD_CONTENT:g1.payload.items[0].url"]);
  // the shared corpus carries the Icon cases, so the database validator is checked against exactly these rules
  const names = CORPUS.map(entry => entry.name);
  assert.ok(names.filter(name => name.startsWith("icons:")).length >= 25 && names.filter(name => name.startsWith("icon:")).length >= 5);
});

test("Icon Group on the Wall: the owner's order, each icon opening its own validated address; rows align and wrap by themselves and every icon always fits", () => {
  const items = MIXED.map(url => iconItemFromInput(url).item);
  const doc = docWith(group("g1", { items }));
  assert.equal(validateDocument(doc).valid, true);
  const painted = paintDocument(doc, 1000, make, { mode: "view" });
  const found = badges(painted.stages[0]);
  assert.deepEqual(found.map(badge => badge.attrs["data-platform"]), ["youtube", "spotify", "discord", "discord", "steam", "tiktok", "kick", "other"], "the owner's order");
  assert.deepEqual(found.map(badge => badge.attrs.href), ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", "https://discord.gg/abc123",
    "https://discord.com/users/374102653111762948", "https://store.steampowered.com/app/570/", "https://www.tiktok.com/@scout2015", "https://kick.com/xqc", "https://paypal.me/example"]);
  for (const badge of found) assert.deepEqual([badge.tag, badge.attrs.target, badge.attrs.rel], ["a", "_blank", "noopener noreferrer nofollow"]);
  assert.equal(found[7].attrs["aria-label"], "paypal.me (opens in a new tab)");
  const rows = all(painted.stages[0], node => node.className === "wall-icons-row");
  assert.deepEqual(rows.map(row => badges(row).length), [4, 4], "600 units hold four 120-unit icons a row: they wrap into a second row");
  // the layout itself: fits the box, shrinks every icon together when it must, never overflows
  for (const [count, w, h] of [[8, 600, 300], [24, 300, 200], [1, 67, 67], [24, 1000, 80], [5, 1000, 1778], [12, 120, 1000]]) {
    const layout = iconGroupLayout(count, w, h, { size: 120, gap: 24 });
    assert.ok(layout.size <= 120 && layout.size * layout.perRow + layout.gap * (layout.perRow - 1) <= w + 1e-9 && layout.rows * layout.size + (layout.rows - 1) * layout.gap <= h + 1e-9, `${count} in ${w}x${h}`);
    assert.equal(layout.rows, Math.ceil(count / layout.perRow));
  }
  assert.deepEqual(iconGroupLayout(3, 1000, 1000, { size: 120, gap: 24 }), { size: 120, gap: 24, perRow: 3, rows: 1 }, "never larger than its size");
  // alignment of each row
  for (const [align, justify] of [["left", "flex-start"], ["center", "center"], ["right", "flex-end"]]) {
    const row = all(paintDocument(docWith(group("g1", { items, align })), 1000, make, { mode: "view" }).stages[0], node => node.className === "wall-icons-row")[0];
    assert.equal(row.styles["justify-content"], justify, align);
  }
  // editing: badges without links
  assert.ok(badges(paintDocument(doc, 1000, make, { mode: "edit" }).stages[0]).every(badge => badge.tag === "span" && !badge.attrs.href));
});

test("Icon Group responsive layout: the same document scales with the Wall width (phone, tablet, desktop) without clipping", () => {
  const items = MIXED.map(url => iconItemFromInput(url).item);
  const doc = docWith(group("g1", { items, size: 120, gap: 24 }));
  for (const width of [360, 768, 1000, 1440]) {
    const painted = paintDocument(doc, width, make, { mode: "view" });
    const scale = width / 1000;
    const node = all(painted.stages[0], n => n.attrs?.["data-el"] === "g1")[0];
    const [boxW, boxH] = [parseFloat(node.styles.width), parseFloat(node.styles.height)];
    const found = badges(painted.stages[0]);
    const size = parseFloat(found[0].styles.width);
    assert.ok(Math.abs(size - 120 * scale) < 0.01, `${width}: icons scale with the Wall`);
    const rows = all(painted.stages[0], n => n.className === "wall-icons-row");
    const gap = parseFloat(rows[0].styles.gap);
    for (const row of rows) assert.ok(badges(row).length * size + (badges(row).length - 1) * gap <= boxW + 0.01, `${width}: a row fits its box`);
    assert.ok(rows.length * size + (rows.length - 1) * gap <= boxH + 0.01, `${width}: the rows fit their box`);
  }
});

test("Icon Group editing: add, remove, reorder and change links as validated, undoable payload edits; a refused link leaves the group unchanged", () => {
  const items = MIXED.slice(0, 3).map(url => iconItemFromInput(url).item);
  let doc = docWith(group("g1", createIconsPayload(items)));
  const itemsOf = d => d.stages[0].elements[0].payload.items;
  const reordered = ops.updatePayload(doc, "g1", { items: [items[2], items[0], items[1]] });
  assert.equal(reordered.ok, true);
  assert.deepEqual(itemsOf(reordered.doc), [items[2], items[0], items[1]], "the new order is kept");
  doc = reordered.doc;
  const added = ops.updatePayload(doc, "g1", { items: [...itemsOf(doc), iconItemFromInput("https://vimeo.com/76979871").item] });
  assert.deepEqual(itemsOf(added.doc).at(-1), { providerKey: "vimeo", kind: "video", id: "76979871" });
  const removed = ops.updatePayload(added.doc, "g1", { items: itemsOf(added.doc).filter((_, index) => index !== 1) });
  assert.equal(itemsOf(removed.doc).length, 3);
  const changed = ops.updatePayload(removed.doc, "g1", { items: itemsOf(removed.doc).map((item, index) => (index === 0 ? iconItemFromInput("https://x.com/espada").item : item)) });
  assert.deepEqual(itemsOf(changed.doc)[0], { providerKey: "x", kind: "profile", id: "espada" });
  const refused = ops.updatePayload(changed.doc, "g1", { items: [...itemsOf(changed.doc), { url: "javascript:alert(1)" }] });
  assert.equal(refused.ok, false);
  assert.equal(refused.doc, changed.doc, "nothing changes");
  assert.equal(ops.updatePayload(changed.doc, "g1", { items: [] }).ok, false, "a group keeps at least one icon");
  // the group moves and resizes as ONE element; a uniform resize of a selection scales its icon size and spacing
  assert.deepEqual(scaleIconsPayload({ items, size: 120, gap: 24 }, 0.5), { items, size: 60, gap: 12 });
  assert.deepEqual(scaleIconsPayload({ items, size: 120, gap: 24 }, 0.1), { items, size: 40, gap: 2 }, "never below the minimum size");
  assert.equal(ops.minSizeOf(changed.doc.stages[0].elements[0]).width, 67);
  assert.equal(ops.lockedAspect(changed.doc.stages[0].elements[0]), null, "the box is free: the icons rewrap");
  assert.deepEqual(defaultIconGroupSize(3), { width: 408, height: 120 });
  assert.deepEqual(defaultIconGroupSize(24), { width: 840, height: 552 });
});

test("security: a painter never follows an address that fails its own check, even from a tampered render tree", () => {
  assert.equal(iconHref({ platform: "other", url: "javascript:alert(1)" }), null);
  assert.equal(iconHref({ platform: "other", url: "https://user@evil.example/" }), null);
  assert.equal(iconHref({ platform: "youtube", providerKey: "youtube", url: "https://evil.example/watch?v=dQw4w9WgXcQ" }), null, "a platform icon only opens its own provider's hosts");
  assert.equal(iconHref({ platform: "youtube", providerKey: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  const tampered = { id: "g1", x: 0, y: 0, width: 600, height: 300, content: { kind: "icons", items: [{ platform: "other", label: "x", url: "javascript:alert(1)" }, { platform: "spotify", providerKey: "spotify", label: "y", url: "https://evil.example/" }], size: 120, gap: 24, align: "center" } };
  const node = paintElement(tampered, 1, 0, make, { mode: "view" });
  assert.ok(badges(node).every(badge => badge.tag === "span" && !badge.attrs.href), "no link is drawn");
  // render data: only known fields, the address rebuilt by the adapter (never stored for a platform icon)
  const rendered = renderIconsPayload({ items: [{ providerKey: "youtube", kind: "video", id: "dQw4w9WgXcQ" }], extra: "<b>x</b>" });
  assert.deepEqual(Object.keys(rendered).sort(), ["align", "gap", "items", "kind", "size"]);
  assert.equal(rendered.items[0].url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(elementRegistry.get("icons").render, renderIconsPayload);
});

// ---- save / load / publish ------------------------------------------------------------------------------------------------------------------------------
test("save, load and publish: an Icon and an Icon Group are ordinary Wall document data - saved as is, reloaded identically, and the published Wall paints them in view mode", () => {
  const doc = docWith(iconEmbed("e1", { providerKey: "steam", kind: "app", id: "570" }), group("g1", createIconsPayload(MIXED.map(url => iconItemFromInput(url).item), { size: 100, gap: 10, align: "left" }), { y: 400 }));
  assert.deepEqual(validateDocument(doc).errors, []);
  const reloaded = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(reloaded, doc, "plain JSON: what is saved is what loads");
  assert.deepEqual(validateDocument(reloaded).errors, []);
  assert.match(read("dist/public/public-wall.js"), /paintDocument\(ready\.doc, target, undefined, \{ mode: "view"/, "the published Wall uses the same painter in view mode");
  assert.equal(badges(paintDocument(reloaded, 400, make, { mode: "view" }).stages[0]).filter(badge => badge.tag === "a").length, 9);
});

test("migration 20261012120000: the database learns exactly the Icon presentation and the Icon Group element - functions only, same signatures, helpers revoked", () => {
  const sql = read("supabase/migrations/20261012120000_wall_icons.sql");
  const code = sql.replace(/--.*$/gm, "");
  assert.deepEqual([...code.matchAll(/create or replace function (private\.\w+)\(/g)].map(match => match[1]), ["private.wall_embed_data_errors", "private.wall_icons_payload_errors", "private.wall_element_payload_errors"]);
  assert.match(code, /\(data ->> 'presentation'\) not in \('link', 'card', 'embed', 'icon'\)/);
  assert.match(code, /elsif element_type = 'icons' then\n    return private\.wall_icons_payload_errors\(payload\);/);
  for (const fragment of ["not between 1 and 24", "private.wall_link_ok(item)", "array['providerKey', 'kind', 'id']", "(item ->> 'id') ~ s.id_pattern", "wall_in_range(p -> 'size', 40, 400)", "wall_in_range(p -> 'gap', 0, 200)", "('left', 'center', 'right')"]) assert.ok(code.includes(fragment), fragment);
  assert.match(code, /revoke all on function private\.wall_icons_payload_errors\(jsonb\) from public, anon, authenticated;/);
  assert.doesNotMatch(code, /\b(drop|truncate|alter table|insert into|update public|delete from|grant)\b/i);
  // the rest of the element validator is the previous definition, unchanged
  const previous = read("supabase/migrations/20261004100000_wall_crews_block.sql");
  const body = text => text.slice(text.indexOf("create or replace function private.wall_element_payload_errors"), text.indexOf("$$;", text.indexOf("create or replace function private.wall_element_payload_errors")) + 3);
  assert.equal(body(sql).replace("  elsif element_type = 'icons' then\n    return private.wall_icons_payload_errors(payload);\n", ""), body(previous));
  const latest = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter(name => /_wall_/.test(name)).sort().reverse().find(name => read(`supabase/migrations/${name}`).includes("function private.wall_element_payload_errors"));
  assert.equal(latest, "20261012120000_wall_icons.sql", "this is the definition the database runs");
});

// ---- editor wiring ------------------------------------------------------------------------------------------------------------------------------------------
test("editor: Icon in the paste flow and in Show as; Other can be an Icon; Icon Group in Media & Links; a group's icons are edited in Properties", () => {
  const tools = read("dist/wall-editor/tools.js"), controls = read("dist/wall-editor/controls.js"), html = read("dist/wall-editor/index.html");
  assert.match(tools, /const labels = PRESENTATION_LABELS;/, "the paste flow labels every presentation the engine offers, Icon included");
  assert.match(tools, /h\("b", \{ text: "Icon Group" \}\)/);
  assert.match(tools, /addCustom\("icons", createIconsPayload\(items\), defaultIconGroupSize\(items\.length\)\)/);
  assert.match(tools, /\[\[false, "Text link"\], \[true, "Icon"\]\]/, "Other: Text link or Icon");
  assert.match(tools, /iconItemFromInput\(value\)/, "group links go through the link engine");
  assert.match(controls, /\["card", "link", "embed", "icon"\]\.filter\(value => offered\.includes\(value\)\)/);
  assert.match(controls, /types\[0\] === "icons" && single\) iconsControls\(body\)/);
  for (const label of ["Move icon", "Remove icon", "Add icon", "Icon size", "Spacing", "Align"]) assert.ok(controls.includes(label), label);
  assert.match(html, /<b>Icon Group<\/b> puts several icons in one element/);
  assert.match(read("dist/wall-editor/editor.js"), /Icon Group: \$\{element\.payload\.items\.length\} icon/);
  for (const code of ["INVALID_ICON_ITEMS", "INVALID_ICON_ITEM", "INVALID_ICON_SIZE", "INVALID_ICON_GAP", "INVALID_ICON_ALIGN"]) assert.match(read("dist/wall-kit/messages.js"), new RegExp(`\\b${code}:`), code);
});

test("Discord safeguard: Discord gets the ordinary Icon; the Classic Discord Profile Card and the Wall's Discord Link / Card are untouched", () => {
  const wallFiles = ["dist/wall-kit/icons.js", "dist/wall-kit/icons-paint.js", "dist/wall-kit/platform-icons.js", "dist/wall-kit/paint.js", "dist/wall-editor/tools.js", "dist/wall-editor/controls.js"];
  for (const file of wallFiles) assert.doesNotMatch(read(file), /discord-card|discord_card|profile_card|get_public_discord/i, file);
  // Discord's Link / Card behaviour is exactly as before
  assert.deepEqual(detectEmbed("discord.gg/abc123").presentations, ["card", "link", "icon"]);
  assert.deepEqual(validateEmbedData(PROVIDERS.get("discord"), { kind: "profile", id: "374102653111762948", presentation: "card" }), ["INVALID_PRESENTATION"]);
  const card = paintDocument(docWith({ id: "e1", type: "embed", x: 0, y: 0, width: 800, height: 260, z: 0, payload: { providerKey: "discord", data: { kind: "invite", id: "abc123", presentation: "card" } } }), 1000, make, { mode: "view" });
  assert.equal(badges(card.stages[0]).length, 0, "a Card is still the facade card");
  assert.equal(all(card.stages[0], node => node.className === "wall-embed").length, 1);
});
