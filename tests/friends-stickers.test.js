// Friends Stickers V1 (Mazen's task + addendum, 2026-10-24): the browser side - catalog, served files, geometry, dynamic size, painting (sticker + always-visible
// sender attribution + optional clip link), the stage rules with real sticker counts, notifications and the editor / visitor wiring. The database rules are in
// friends-stickers-db.test.js; the browser checks (desktop / phone, drag, send, review) are scratchpad E2E scripts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { STICKER_CATALOG, STICKER_KEYS, STICKER_AREA, STICKER_BASE, stickerSizePercent, stickerSizes, clampToStickerArea, insideStickerArea, stickerByKey } from "../dist/wall/stickers.js";
import { parseStickerClip, safeStickerClip, stickerClipProvidersText } from "../dist/wall-kit/embed/providers/clip-links.js";
import { paintSticker, stickerView, paintFriendsBackground } from "../dist/wall-kit/sticker-paint.js";
import { createDocument } from "../dist/wall/schema.js";
import { setActiveStickerCounts, activeStickerCount } from "../dist/wall/stage-types.js";
import * as ops from "../dist/wall-kit/ops.js";
import { applyTemplate } from "../dist/wall-kit/templates/apply.js";
import { TEMPLATES } from "../dist/wall-kit/templates/catalog.js";
import { notificationText, destinationOf, DESTINATIONS } from "../dist/notifications/notification-types.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20261024100000_friends_stickers_v1.sql");
const node = tag => {
  const attrs = new Map(), children = [], props = new Map();
  return { tag, attrs, children, text: "", style: { setProperty(name, value) { props.set(name, value); }, props }, setAttribute(name, value) { attrs.set(name, String(value)); },
    append(...items) { children.push(...items); }, set className(value) { attrs.set("class", value); }, get className() { return attrs.get("class") ?? ""; }, set textContent(value) { this.text = value; } };
};
const all = (root, out = []) => { out.push(root); for (const child of root.children ?? []) if (child && typeof child === "object") all(child, out); return out; };
const find = (root, cls) => all(root).find(n => n.className === cls);
const withTypes = (...types) => { const doc = createDocument({ stageCount: types.length }); types.forEach((type, i) => { if (type === "friends") doc.stages[i].type = "friends"; }); return doc; };

test("catalog: the 14 supplied animated stickers, each with its served animated WebP and still, and exactly the keys the database accepts", () => {
  assert.equal(STICKER_CATALOG.length, 14);
  assert.equal(new Set(STICKER_KEYS).size, 14);
  const sqlKeys = [...migration.match(/sticker_key in \(([^)]*)\)/)[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]);
  assert.deepEqual(sqlKeys, [...STICKER_KEYS], "the table's CHECK lists the same keys in the same order");
  for (const block of migration.match(/candidate_sticker_key not in \(([^)]*)\)/g)) assert.deepEqual([...block.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]), [...STICKER_KEYS], "send_wall_sticker accepts the same keys");
  for (const { key, source } of STICKER_CATALOG) {
    assert.match(source, /^P\d{2}_[A-Z0-9_]+$/, "named after the supplied original");
    for (const file of [`dist/wall-kit/stickers/${key}.webp`, `dist/wall-kit/stickers/${key}-still.webp`]) {
      assert.ok(existsSync(file), file);
      assert.equal(readFileSync(file).subarray(8, 12).toString("latin1"), "WEBP", `${file} is a WebP`);
    }
    const animated = readFileSync(`dist/wall-kit/stickers/${key}.webp`);
    assert.ok(animated.includes(Buffer.from("ANIM")) && animated.includes(Buffer.from("ANMF")), `${key}: an animated WebP`);
    assert.ok(statSync(`dist/wall-kit/stickers/${key}.webp`).size < 4_500_000, `${key}: the served copy is the optimized one, never the multi-megabyte original`);
  }
  const manifest = JSON.parse(read("scripts/friends-stickers/assets-manifest.json"));
  assert.deepEqual(manifest.stickers.map(s => s.key), [...STICKER_KEYS]);
  for (const s of manifest.stickers) {
    assert.equal(s.animatedSource.frames, 72, `${s.key}: every frame of the original`);
    assert.equal(s.animatedSource.fps, 24);
    assert.match(s.animatedSource.sha256, /^[0-9a-f]{64}$/, "the original is identified by its hash (kept unchanged)");
  }
});

test("the official Friends Stage background: one portrait WebP in the stage's 9:16 proportions, drawn by CSS, never a document element", () => {
  const file = readFileSync("dist/wall-kit/friends/friends-stage-bg.webp");
  assert.equal(file.subarray(8, 12).toString("latin1"), "WEBP");
  // the canvas size: VP8X (extended) keeps it as 24-bit width-1 / height-1 at bytes 24 / 27; plain VP8 as 14-bit values at 26 / 28
  const chunk = file.subarray(12, 16).toString("latin1");
  const [width, height] = chunk === "VP8X" ? [1 + file.readUIntLE(24, 3), 1 + file.readUIntLE(27, 3)] : [file.readUInt16LE(26) & 0x3fff, file.readUInt16LE(28) & 0x3fff];
  assert.deepEqual([width, height], [941, 1672]);
  assert.ok(Math.abs(width / height - 1000 / 1778) < 0.001, "the stage's own proportions: no cropping, no visible stretching");
  const css = read("dist/wall-kit/wall-kit.css");
  assert.match(css, /\.wall-friends-bg \{ position: absolute; inset: 0; z-index: 0; background: #0b0814 url\("friends\/friends-stage-bg\.webp"\) center \/ 100% 100% no-repeat; pointer-events: none; \}/);
  const layer = paintFriendsBackground(node);
  assert.equal(layer.className, "wall-friends-bg");
  assert.equal(layer.attrs.get("aria-hidden"), "true");
});

test("geometry: one placement area keeps the whole group (sticker + attribution) inside the stage at 100% and so at every smaller size; the database uses the same numbers", () => {
  assert.deepEqual({ ...STICKER_AREA }, { minX: 150, maxX: 850, minY: 150, maxY: 1580 });
  assert.equal(STICKER_AREA.minX, STICKER_BASE / 2);
  assert.equal(1000 - STICKER_AREA.maxX, STICKER_BASE / 2);
  assert.match(migration, /pos_x integer not null check \(pos_x between 150 and 850\)/);
  assert.match(migration, /pos_y integer not null check \(pos_y between 150 and 1580\)/);
  assert.deepEqual(clampToStickerArea(0, 9999), { x: 150, y: 1580 });
  assert.deepEqual(clampToStickerArea(512.6, 700.2), { x: 513, y: 700 });
  assert.equal(insideStickerArea(150, 1580), true);
  assert.equal(insideStickerArea(149, 700), false);
  assert.equal(insideStickerArea(500.5, 700), false, "whole stage units only");
});

test("dynamic size: 100% for the newest approved sticker, 5 points off per newer active one, never below 50%; pending / rejected / removed never count", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9, 10, 11, 50].map(stickerSizePercent), [100, 95, 90, 85, 80, 55, 50, 50, 50]);
  const rows = [
    { placement_id: "a", status: "approved", approval_seq: 1 }, { placement_id: "b", status: "approved", approval_seq: 2 }, { placement_id: "c", status: "pending" },
    { placement_id: "d", status: "approved", approval_seq: 3 }, { placement_id: "e", status: "removed", approval_seq: 4 }, { placement_id: "f", status: "approved", approval_seq: 5 },
  ];
  assert.deepEqual([...stickerSizes(rows)], [["f", 100], ["d", 95], ["b", 90], ["a", 85]]);
  // deleting the oldest, a middle one, the newest
  assert.deepEqual([...stickerSizes(rows.filter(r => r.placement_id !== "a"))].map(([, s]) => s), [100, 95, 90]);
  assert.deepEqual(Object.fromEntries(stickerSizes(rows.filter(r => r.placement_id !== "d"))), { f: 100, b: 95, a: 90 });
  assert.deepEqual(Object.fromEntries(stickerSizes(rows.filter(r => r.placement_id !== "f"))), { d: 100, b: 95, a: 90 });
});

const row = (over = {}) => ({ placement_id: "p1", stage_id: "stage_2", sticker_key: "legend", pos_x: 500, pos_y: 700, size_percent: 100, approval_seq: 3, sender_handle: "alice", sender_display_name: "Alice", ...over });

test("painting: one group per sticker - the animated sticker (still for reduced motion), the sender's avatar and @username always visible, centred on its stage position", () => {
  const view = stickerView(row(), "blob:avatar");
  const group = paintSticker(view, 0.5, node);
  assert.equal(group.tag, "figure");
  assert.equal(group.attrs.get("data-sticker"), "p1");
  assert.equal(group.style.props.get("width"), "150px", "300 units x 100% x scale 0.5");
  assert.equal(group.style.props.get("left"), "175px", "centred: 500 x 0.5 - 75");
  assert.equal(group.style.props.get("top"), "275px");
  const img = all(group).find(n => n.tag === "img" && /stickers\/legend\.webp$/.test(n.attrs.get("src") ?? ""));
  assert.ok(img, "the animated sticker");
  assert.equal(img.attrs.get("loading"), "lazy");
  const still = all(group).find(n => n.tag === "source");
  assert.equal(still.attrs.get("media"), "(prefers-reduced-motion: reduce)");
  assert.match(still.attrs.get("srcset"), /stickers\/legend-still\.webp$/);
  const caption = find(group, "wall-sticker-by");
  assert.ok(group.children.includes(caption), "the attribution is part of the group: it moves and scales with the sticker");
  assert.equal(find(caption, "wall-sticker-name").text, "@alice");
  assert.equal(all(find(caption, "wall-sticker-avatar")).find(n => n.tag === "img").attrs.get("src"), "blob:avatar");
  assert.equal(find(group, "wall-sticker-clip"), undefined, "no clip, no empty clip indicator");
  assert.match(group.attrs.get("aria-label"), /^Legend sticker from @alice$/);
  // no avatar: the sender's initial, still visible
  assert.equal(find(paintSticker(stickerView(row(), null), 0.5, node), "wall-sticker-avatar").text, "A");
  // shrinking keeps the centre and the attribution
  const small = paintSticker(stickerView(row({ size_percent: 50 })), 0.5, node);
  assert.deepEqual([small.style.props.get("width"), small.style.props.get("left")], ["75px", "212.5px"]);
  assert.ok(find(small, "wall-sticker-by"));
});

test("painting: a clip link shows only when attached, opens in a new tab without the opener, and only a link that passes the rule again is ever drawn", () => {
  const clip = { clip_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", clip_provider: "youtube" };
  const view = stickerView(row(clip));
  const link = find(paintSticker(view, 1, node, { interactive: true }), "wall-sticker-clip");
  assert.equal(link.tag, "a");
  assert.equal(link.attrs.get("href"), clip.clip_url);
  assert.equal(link.attrs.get("target"), "_blank");
  assert.equal(link.attrs.get("rel"), "noopener noreferrer nofollow");
  assert.match(link.attrs.get("aria-label"), /^Watch @alice's clip on YouTube$/);
  // the owner's editor shows the indicator but it is not a link there
  assert.equal(find(paintSticker(view, 1, node, { interactive: false }), "wall-sticker-clip").tag, "span");
  // a stored value that does not pass the rule (or whose provider does not match) is not drawn
  for (const bad of [{ clip_url: "javascript:alert(1)", clip_provider: "youtube" }, { clip_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", clip_provider: "twitch" }, { clip_url: "https://youtu.be/dQw4w9WgXcQ", clip_provider: "youtube" }])
    assert.equal(find(paintSticker(stickerView(row(bad)), 1, node), "wall-sticker-clip"), undefined, JSON.stringify(bad));
  assert.equal(safeStickerClip("https://medal.tv/clips/abc123XYZ", "medal").url, "https://medal.tv/clips/abc123XYZ");
  assert.equal(stickerClipProvidersText(), "YouTube, Twitch or Medal.tv");
  assert.equal(parseStickerClip("https://cdn.discordapp.com/attachments/1/2/c.mp4").code, "STICKER_CLIP_UNSUPPORTED");
  // what cannot be drawn safely is not drawn
  assert.equal(stickerView(row({ sticker_key: "premium-dragon" })), null);
  assert.equal(stickerView(row({ size_percent: 40 })), null);
  assert.equal(stickerView(row({ sender_handle: "<b>x</b>" })).sender.handle, null, "an unexpected handle is never shown");
  assert.equal(stickerByKey("legend").name, "Legend");
});

test("stage rules with real sticker counts: a Friends Stage holding active stickers can be neither deleted, converted, nor replaced by a whole-Wall template", () => {
  const doc = withTypes("my", "friends", "friends");
  try {
    setActiveStickerCounts(new Map([["stage_2", 2]]));
    assert.equal(activeStickerCount(doc.stages[1]), 2);
    assert.equal(activeStickerCount(doc.stages[2]), 0);
    assert.equal(ops.stageDeletionInfo(doc, "stage_2").stickerCount, 2);
    assert.deepEqual(ops.deleteStage(doc, "stage_2", { force: true }).errors, ["STAGE_HAS_STICKERS"]);
    assert.deepEqual(ops.setStageType(doc, "stage_2", "my").errors, ["STAGE_HAS_STICKERS"]);
    assert.equal(ops.deleteStage(doc, "stage_3", { force: true }).ok, true, "a Friends Stage without active stickers can still go");
    assert.deepEqual(applyTemplate(doc, TEMPLATES[0], { scope: "wall", confirmed: true }).errors, ["STAGE_HAS_STICKERS"]);
  } finally { setActiveStickerCounts(new Map()); }
  assert.equal(activeStickerCount(doc.stages[1]), 0);
  assert.match(migration, /message = 'STAGE_HAS_STICKERS'/, "the server refuses the same save");
});

test("notifications: four sticker types with their words and typed destinations (the owner's request list, the sender's sent list)", () => {
  const types = [...migration.matchAll(/\('(sticker\.[a-z_]+)',\s+'friends_stickers', '([a-z_.]+)'\)/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(types, [["sticker.request_received", "wall.sticker_requests"], ["sticker.approved", "wall.stickers_sent"], ["sticker.rejected", "wall.stickers_sent"], ["sticker.moved", "wall.stickers_sent"]]);
  const note = (type, sticker = "mvp") => ({ type_key: type, actor_handle: "alice", context: { sticker }, destination: types.find(t => t[0] === type)[1] });
  assert.equal(notificationText(note("sticker.request_received")), "@alice sent you a MVP sticker. Review it before it appears on your Wall.");
  assert.equal(notificationText(note("sticker.approved")), "@alice approved your MVP sticker. It's on their Wall now.");
  assert.equal(notificationText(note("sticker.rejected", "<img>")), "@alice didn't approve your friends sticker.", "never free text from context");
  assert.equal(notificationText(note("sticker.moved")), "@alice moved your MVP sticker on their Wall.");
  assert.equal(destinationOf(note("sticker.moved")), "wall.stickers_sent");
  assert.deepEqual(DESTINATIONS["wall.sticker_requests"], { page: "wall-editor", anchor: "stickerRequests", label: "Sticker requests" });
});

test("editor: Templates & Stickers has two separate sections; the Friends Stage panel reviews, lists and sends; a notification opens its section; owner moves are saved once per drop", () => {
  const html = read("dist/wall-editor/index.html"), editor = read("dist/wall-editor/editor.js"), owner = read("dist/wall-editor/stickers-owner.js");
  assert.match(html, /<span>Templates &amp; Stickers<\/span>/);
  assert.match(html, /role="tab" aria-selected="true" aria-controls="tsTemplates">Templates</);
  assert.match(html, /role="tab" aria-selected="false" aria-controls="tsStickers" tabindex="-1">Stickers/);
  assert.match(html, /<div id="tsTemplates" role="tabpanel" aria-labelledby="tsTabTemplates">\s*<div id="templatesBody"><\/div>/, "the templates are where they were");
  for (const id of ["stickerCatalog", "stickerSend", "stickerRequests", "stickerRequestList", "stickersSent", "stickerSentList", "friendsRequests", "friendsApproved", "friendsSend", "railStickerBadge"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(editor, /ownerStickers\.load\(\);\n  openStickerSection\(location\.hash\);/);
  assert.match(editor, /"#stickerRequests": "stickerRequests", "#stickersSent": "stickersSent"/);
  assert.match(editor, /document\.addEventListener\("gamid:notifications-received", event => \{ if \(workspaceVisible && event\.detail\?\.types\?\.some\(type => String\(type\)\.startsWith\("sticker\."\)\)\) ownerStickers\.load\(\); \}\);/, "a new request shows at once (the shared notification centre's signal)");
  // a drag is one request: the move is sent on release only, and a release in the same place sends nothing
  assert.match(owner, /if \(x === row\.pos_x && y === row\.pos_y\) return;/);
  assert.equal((owner.match(/api\.moveWallSticker\(/g) ?? []).length, 1);
  assert.doesNotMatch(owner.slice(owner.indexOf('host.addEventListener("pointermove"'), owner.indexOf("const endDrag")), /moveWallSticker/, "never while dragging");
  // removal asks first (DEC-0008)
  assert.match(owner, /Remove this sticker for good\?/);
  assert.match(read("dist/notifications/notification-center.js"), /new globalThis\.CustomEvent\("gamid:notifications-received", \{ detail: \{ types: fresh\.map\(item => item\.type_key\) \} \}\)/);
});

test("visitor page: approved stickers come from the anonymous sticker read only; Add sticker is offered only to a signed-in visitor who may send, never to the owner; the send flow loads on demand", async () => {
  const wall = read("dist/public/public-wall.js");
  assert.match(wall, /rows = await api\.getPublicWallStickers\(handle\);/);
  assert.match(wall, /const { openStickerComposer } = await import\("\.\.\/wall-kit\/sticker-composer\.js"\);/);
  assert.doesNotMatch(wall, /^import .*sticker-composer/m, "never loaded for a visitor who does not open it");
  const { canAddSticker, prepareWallStickers } = await import("../dist/public/public-wall.js");
  const api = (session, me) => ({ restoreSession: async () => session, getMyStickerSender: async () => me });
  assert.equal(await canAddSticker("wallowner", api(null, null)), false, "anonymous");
  assert.equal(await canAddSticker("wallowner", api({}, { gamid_handle: "alice", can_send: false })), false, "a private GamID");
  assert.equal(await canAddSticker("WallOwner", api({}, { gamid_handle: "wallowner", can_send: true })), false, "the owner");
  assert.equal(await canAddSticker("wallowner", api({}, { gamid_handle: "alice", can_send: true })), true);
  assert.equal(await canAddSticker("wallowner", { restoreSession: async () => { throw new Error("x"); } }), false);
  // stickers grouped by stage, one avatar read per sender, nothing fetched for a Wall without a Friends Stage
  const calls = [];
  const stickerApi = { getPublicWallStickers: async () => { calls.push("stickers"); return [row(), row({ placement_id: "p2", sender_avatar_media_reference: "a/x.jpg" }), row({ placement_id: "p3", sender_avatar_media_reference: "a/x.jpg", stage_id: "stage_3" })]; }, loadPublicAvatar: async path => { calls.push(path); return `blob:${path}`; } };
  const byStage = await prepareWallStickers(withTypes("my", "friends", "friends"), "wallowner", stickerApi);
  assert.deepEqual([...byStage.keys()], ["stage_2", "stage_3"]);
  assert.deepEqual(byStage.get("stage_3")[0].sender.avatarUrl, "blob:a/x.jpg");
  assert.deepEqual(calls, ["stickers", "a/x.jpg"]);
  calls.length = 0;
  assert.equal((await prepareWallStickers(withTypes("my"), "wallowner", stickerApi)).size, 0);
  assert.deepEqual(calls, [], "a Wall with no Friends Stage asks for nothing");
});

test("security: the sticker modules never turn text into markup, never fetch on their own and never name a provider outside the provider module", () => {
  for (const file of ["dist/wall/stickers.js", "dist/wall-kit/sticker-paint.js", "dist/wall-kit/sticker-composer.js", "dist/wall-editor/stickers-owner.js", "dist/public/public-wall.js"]) {
    const code = read(file).replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|fetch\(/, file);
    if (file !== "dist/public/public-wall.js") assert.doesNotMatch(code, /youtube|twitch|medal|discord/i, file);   // (the visitor page's own Wall code is checked by its own tests)
  }
  const composer = read("dist/wall-kit/sticker-composer.js");
  for (const call of composer.matchAll(/api\.(\w+)\(/g)) assert.ok(["restoreSession", "getMyStickerSender", "loadPublicAvatar", "searchStickerRecipients", "getPublicWall", "getPublicWallStickers", "sendWallSticker"].includes(call[1]), call[1]);
  assert.match(composer, /api\.sendWallSticker\(\{ handle: recipientHandle, stageId: state\.stageId, stickerKey: state\.sticker, x: state\.x, y: state\.y, clipUrl: parsed\.clip\?\.url \?\? null \}\)/, "the client never sends an avatar or a name: the server uses the signed-in account");
});
