// Universal deletion (Mazen's contract 2026-10-21), the editor side: the ops transforms and usage wording, the session's rebase (unsaved edits kept, undo cannot
// bring a deleted reference back), the ONE delete flow every panel uses (immediate / confirm / cancel / failure / conflict / unknown outcome / repeated clicks),
// the confirmation dialog, the account client (RPC body, gateway file delete with retries) and the wiring of every entry point. The database side is in
// universal-delete-db.test.js.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import "../dist/wall-kit/register.js";
import * as ops from "../dist/wall-kit/ops.js";
import { createImagePayload } from "../dist/wall-kit/image.js";
import { createImageBackground, createVideoBackground } from "../dist/wall-kit/background.js";
import { createTextPayload } from "../dist/wall-kit/text.js";
import { createEditorSession } from "../dist/wall-kit/session.js";
import { createDeleteFlow, openDeleteDialog } from "../dist/wall-editor/delete-flow.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const IMG = "0000000a-0000-4000-8000-00000000000a", VID = "0000000b-0000-4000-8000-00000000000b", SPARE = "0000000c-0000-4000-8000-00000000000c";
const FONT = "f0000000-0000-4000-8000-000000000001";
const ASSET = { asset_id: IMG, mime_type: "image/png", width: 640, height: 360, byte_size: 2048, storage_path: "u/img.png" };
const VIDEO = { asset_id: VID, mime_type: "video/mp4", width: 1920, height: 1080, byte_size: 9 * 1024 * 1024, storage_path: "u/vid.mp4" };
const UNUSED = { asset_id: SPARE, mime_type: "image/webp", width: 10, height: 10, byte_size: 900, storage_path: "u/spare.webp" };
const FONT_ROW = { font_id: FONT, display_name: "Neon Sans", in_draft: true, in_published: true };

const picture = (id, assetId, extra = {}) => createElement({ id, type: "image", x: 10, y: 10, width: 200, height: 100, z: 0, payload: createImagePayload(assetId), ...extra });
const words = (id, payload, extra = {}) => createElement({ id, type: "text", x: 30, y: 40, width: 500, height: 120, z: 1, payload: createTextPayload(payload), ...extra });
function wall() {
  const doc = createDocument({ stageCount: 2 });
  doc.background = createVideoBackground(VID);
  doc.stages[0].background = createImageBackground(IMG);
  doc.stages[0].elements = [picture("a", IMG), words("t1", { text: "Hello", fontFamily: "bebas-neue", fontRef: `font:${FONT}` }, { groupId: "g" }), words("t2", { text: "Kept" }, { groupId: "g", z: 2 })];
  doc.stages[1].elements = [picture("b", IMG), picture("c", IMG, { z: 1 }), words("t3", { text: "World", fontRef: `font:${FONT}` }, { z: 2 })];
  return doc;
}

test("ops: removeAssetReferences / removeFontReferences are pure removals that leave a valid document; usage is described in words", () => {
  const doc = wall();
  assert.equal(validateDocument(doc).valid, true);
  assert.deepEqual(ops.assetUsage(doc, IMG), ["Stage 1 background", "an image on Stage 1", "2 images on Stage 2"]);
  assert.deepEqual(ops.fontUsage(doc, FONT), ["a text on Stage 1", "a text on Stage 2"]);
  assert.deepEqual(ops.fontUsage(doc, "f0000000-0000-4000-8000-000000000099"), []);
  const image = ops.removeAssetReferences(doc, IMG);
  assert.deepEqual(image.removed, { elements: 3, backgrounds: 1 });
  assert.equal(validateDocument(image.doc).valid, true);
  assert.deepEqual(image.doc.stages.map(stage => stage.elements.map(element => element.id)), [["t1", "t2"], ["t3"]]);
  assert.deepEqual(image.doc.background, doc.background, "another asset's Whole Wall background stays");
  assert.equal(image.doc.stages[0].background, undefined);
  assert.deepEqual(ops.assetUsage(image.doc, IMG), []);
  assert.deepEqual(doc, wall(), "the input is never mutated");
  assert.equal(ops.removeAssetReferences(doc, VID).doc.background, undefined, "a Whole Wall background asset leaves 'none'");
  const font = ops.removeFontReferences(doc, FONT);
  assert.deepEqual(font.removed, { texts: 2 });
  assert.equal(validateDocument(font.doc).valid, true);
  const t1 = font.doc.stages[0].elements.find(element => element.id === "t1"), before = doc.stages[0].elements.find(element => element.id === "t1");
  assert.deepEqual(t1, { ...before, payload: Object.fromEntries(Object.entries(before.payload).filter(([key]) => key !== "fontRef")) }, "only fontRef goes: text, styling, position, group and the library fallback stay");
  assert.equal(t1.payload.fontFamily, "bebas-neue");
  assert.deepEqual(ops.removeAssetReferences(doc, SPARE).doc, doc, "an unused asset changes nothing");
});

function fakeSession(doc = wall(), { revision = 5 } = {}) {
  const saved = [];
  const persistence = {
    ensureDraft: async () => ({ document: structuredClone(doc), revision }),
    loadDraft: async () => persistence.latest ?? { document: structuredClone(doc), revision },
    saveDraft: async (document, expected) => { saved.push([document, expected]); return { revision: expected + 1 }; },
  };
  const session = createEditorSession({ persistence });
  return { session, persistence, saved };
}

test("session.rebase: unsaved edits survive, 'Saved' stays 'Saved', the revision follows the server, and undo / redo can never resurrect the deleted reference", async () => {
  const { session } = fakeSession();
  await session.load();
  assert.equal(session.status, "saved");
  const strip = doc => ops.removeAssetReferences(doc, IMG).doc;
  session.rebase(6, strip);
  assert.equal(session.status, "saved", "no other edits: still Saved (the baseline is transformed the same way)");
  assert.equal(session.state.revision, 6);
  assert.deepEqual(ops.assetUsage(session.doc, IMG), []);

  const second = fakeSession();
  await second.session.load();
  second.session.apply(ops.updatePayloadMany(second.session.doc, ["t2"], { text: "My unsaved words" }));
  second.session.apply(ops.deleteElements(second.session.doc, ["c"]));   // an undoable step that removed one of the uses
  assert.equal(second.session.status, "unsaved");
  second.session.rebase(6, strip);
  assert.equal(second.session.status, "unsaved", "the owner's own edits stay unsaved - nothing is saved for them");
  assert.equal(second.session.doc.stages[0].elements.find(element => element.id === "t2").payload.text, "My unsaved words");
  assert.equal(second.session.state.revision, 6);
  while (second.session.undo()) assert.deepEqual(ops.assetUsage(second.session.doc, IMG), [], "no undo step brings it back");
  assert.equal(second.session.doc.stages[0].elements.find(element => element.id === "t2").payload.text, "Kept");
  assert.equal(second.session.status, "saved", "undoing every edit returns to the (resolved) saved state");
  while (second.session.redo()) assert.deepEqual(ops.assetUsage(second.session.doc, IMG), []);
  assert.equal(second.session.rebase(null, strip), true, "null keeps the revision");
  assert.equal(second.session.state.revision, 6);
  assert.equal(second.session.rebase(6.5, strip), false);
});

// ---- the flow ------------------------------------------------------------------------------------------------------------------------------------------
function harness({ doc = wall(), server = {}, fail = null, failAfterCommit = false, published = true } = {}) {
  const calls = [], confirms = [], deleted = [];
  const present = new Set([IMG, VID, SPARE]);
  const makeStore = kind => ({
    async deleteResolving(id, options) {
      calls.push([kind, id, options]);
      if (fail) { if (failAfterCommit) present.delete(id); throw fail; }
      const usedOnServer = server[id] ?? { inDraft: false, inPublished: false };
      if ((usedOnServer.inDraft || usedOnServer.inPublished) && !options.resolve) return { deleted: false, ...usedOnServer, draftRevision: null, storageCleanup: "none" };
      present.delete(id);
      return { deleted: true, ...usedOnServer, publishedChanged: usedOnServer.inPublished, draftRevision: usedOnServer.inDraft ? options.expectedRevision + 1 : null, storageCleanup: server.storage ?? "done" };
    },
    async refresh() { calls.push([kind, "refresh"]); },
    has: id => present.has(id),
    state: { failed: false },
  });
  const assets = makeStore("asset"), fonts = makeStore("font");
  const { session, persistence } = fakeSession(doc);
  let answer = "confirm", answer2 = "confirm";
  const flow = createDeleteFlow({
    session, assets, fonts, onDeleted: event => deleted.push(event),
    // the dialog's behaviour: Delete runs `run`; a "confirm-again" outcome shows the new (detailed) details and is confirmed again
    confirm: async (details, run) => {
      confirms.push(details);
      if (answer !== "confirm") return null;
      let outcome = await run();
      while (outcome?.status === "confirm-again") { confirms.push(outcome.details); if (answer2 !== "confirm") return null; outcome = await outcome.run(); }
      return outcome;
    },
  });
  return { flow, session, persistence, calls, confirms, deleted, setAnswer: value => { answer = value; }, setSecondAnswer: value => { answer2 = value; }, published };
}

test("1 / 2 / 3 unused asset: a simple confirmation first (no usage list); Cancel sends nothing and keeps it; Delete deletes it", async () => {
  const cancelled = harness();
  await cancelled.session.load();
  cancelled.setAnswer("cancel");
  assert.equal((await cancelled.flow.deleteAsset(UNUSED)).status, "cancelled");
  assert.equal(cancelled.confirms.length, 1, "the confirmation is always shown");
  assert.deepEqual(cancelled.confirms[0], { kind: "asset", noun: "image", name: "Image · 10×10 · 1 KB", inUse: false, places: [], publishedNote: null, consequence: "" }, "the simple one: no usage warnings");
  assert.deepEqual(cancelled.calls, [], "nothing is sent before the owner confirms");
  assert.deepEqual(cancelled.deleted, []);
  const h = harness();
  await h.session.load();
  const before = structuredClone(h.session.doc);
  const outcome = await h.flow.deleteAsset(UNUSED);
  assert.equal(outcome.status, "deleted");
  assert.match(outcome.message, /was deleted\.$/);
  assert.equal(h.confirms.length, 1);
  assert.deepEqual(h.calls, [["asset", SPARE, { resolve: false }]], "confirmed as unused: the server deletes it only if it is still unused");
  assert.deepEqual(h.session.doc, before);
  assert.equal(h.session.status, "saved");
  assert.deepEqual(h.deleted, [{ kind: "asset", id: SPARE, publishedChanged: false }]);
});
test("2 / 3 / 4 used background + stage images (several places, several stages): one confirmation listing them, then removed everywhere", async () => {
  const h = harness({ server: { [IMG]: { inDraft: true, inPublished: true } } });
  await h.session.load();
  const outcome = await h.flow.deleteAsset(ASSET);
  assert.equal(h.confirms.length, 1);
  const details = h.confirms[0];
  assert.equal(details.name, "Image · 640×360 · 2 KB");
  assert.deepEqual(details.places, ["Stage 1 background", "an image on Stage 1", "2 images on Stage 2"], "the places, from the Wall being edited");
  assert.match(details.consequence, /removes the image from every place it is used/);
  assert.match(details.publishedNote, /published Wall/);
  assert.deepEqual(h.calls, [["asset", IMG, { resolve: true, expectedRevision: 5 }]], "not even asked of the server before the owner confirmed (unsaved uses count)");
  assert.equal(outcome.status, "deleted");
  assert.match(outcome.message, /removed from your saved Wall and your published Wall/);
  assert.deepEqual(ops.assetUsage(h.session.doc, IMG), []);
  assert.equal(h.session.state.revision, 6);
  assert.equal(h.session.status, "saved");
  assert.deepEqual(h.deleted, [{ kind: "asset", id: IMG, publishedChanged: true }]);
  // a video: its own wording, and the Whole Wall background
  const v = harness({ server: { [VID]: { inDraft: true, inPublished: false } } });
  await v.session.load();
  await v.flow.deleteAsset(VIDEO);
  assert.deepEqual(v.confirms[0].places, ["Whole Wall background"]);
  assert.equal(v.confirms[0].name, "MP4 video · 1920×1080 · 9 MB");
  assert.equal(v.session.doc.background, undefined);
});

test("removed here but still in the saved Wall: the detailed confirmation at once (from the saved draft the editor holds) - nothing is sent first", async () => {
  const h = harness({ server: { [IMG]: { inDraft: true, inPublished: false } } });
  await h.session.load();
  h.session.apply(ops.removeAssetReferences(h.session.doc, IMG));
  assert.equal(h.session.status, "unsaved");
  const outcome = await h.flow.deleteAsset(ASSET);
  assert.equal(h.confirms.length, 1);
  assert.equal(h.confirms[0].inUse, true);
  assert.deepEqual(h.confirms[0].places, ["your saved Wall (you removed it here, but that is not saved yet)"]);
  assert.deepEqual(h.calls.map(call => call[2]), [{ resolve: true, expectedRevision: 5 }]);
  assert.equal(outcome.status, "deleted");
  assert.equal(h.session.status, "saved", "the owner's only edit was that removal, which the server has now made");
});

test("confirmed as unused, but the server finds it used (an older published Wall, another tab): nothing is deleted and the same dialog asks again in detail", async () => {
  const h = harness({ doc: ops.removeAssetReferences(wall(), IMG).doc, server: { [IMG]: { inDraft: false, inPublished: true } } });
  await h.session.load();
  const outcome = await h.flow.deleteAsset(ASSET);
  assert.deepEqual(h.confirms.map(details => details.inUse), [false, true]);
  assert.deepEqual(h.confirms[1].places, ["your published Wall"]);
  assert.equal(h.confirms[1].publishedNote, null, "the server already said where");
  assert.deepEqual(h.calls.map(call => call[2]), [{ resolve: false }, { resolve: true, expectedRevision: 5 }]);
  assert.equal(outcome.status, "deleted");
  const cancelled = harness({ doc: ops.removeAssetReferences(wall(), IMG).doc, server: { [IMG]: { inDraft: false, inPublished: true } } });
  await cancelled.session.load();
  cancelled.setSecondAnswer("cancel");
  assert.equal((await cancelled.flow.deleteAsset(ASSET)).status, "cancelled");
  assert.deepEqual(cancelled.calls.map(call => call[2]), [{ resolve: false }], "the refused first try deleted nothing; Cancel then sends nothing more");
  assert.deepEqual(cancelled.deleted, []);
});
test("5 used font: a warning that text appearance changes (naming the fallback font), then every text falls back; 6 unused font: the simple confirmation", async () => {
  const h = harness({ server: { [FONT]: { inDraft: true, inPublished: true } } });
  await h.session.load();
  const outcome = await h.flow.deleteFont(FONT_ROW);
  const details = h.confirms[0];
  assert.equal(details.noun, "font");
  assert.equal(details.name, "Neon Sans");
  assert.deepEqual(details.places, ["a text on Stage 1", "a text on Stage 2", "your published Wall"]);
  assert.match(details.consequence, /keeps its words, position and other styling, and its appearance changes: it switches to its library font \(Bebas Neue and Orbitron\)/);
  assert.equal(outcome.status, "deleted");
  assert.deepEqual(ops.fontUsage(h.session.doc, FONT), []);
  assert.equal(h.session.doc.stages[0].elements.find(element => element.id === "t1").payload.fontFamily, "bebas-neue");
  const unused = harness();
  await unused.session.load();
  assert.equal((await unused.flow.deleteFont({ ...FONT_ROW, font_id: "f0000000-0000-4000-8000-000000000002", in_draft: false, in_published: false })).status, "deleted");
  assert.deepEqual(unused.confirms.map(details => [details.noun, details.inUse, details.places.length]), [["font", false, 0]]);
  const publishedOnly = harness();
  await publishedOnly.session.load();
  await publishedOnly.flow.deleteFont({ ...FONT_ROW, font_id: "f0000000-0000-4000-8000-000000000003", in_draft: false, in_published: true });
  assert.deepEqual([publishedOnly.confirms[0].inUse, publishedOnly.confirms[0].places], [true, ["your published Wall"]], "My Fonts' own in_published counts as use");
});

test("7 cancel: nothing is deleted and nothing changes", async () => {
  const h = harness({ server: { [IMG]: { inDraft: true, inPublished: true } } });
  await h.session.load();
  h.setAnswer("cancel");
  const before = structuredClone(h.session.doc);
  const outcome = await h.flow.deleteAsset(ASSET);
  assert.equal(outcome.status, "cancelled");
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.session.doc, before);
  assert.equal(h.session.status, "saved");
  assert.deepEqual(h.deleted, []);
});

test("8 failures: a conflict or a refused / lost request changes nothing; a lost answer for a deletion that DID happen is settled from the authoritative list", async () => {
  const conflict = harness({ fail: new Error("WALL_REVISION_CONFLICT") });
  await conflict.session.load();
  const before = structuredClone(conflict.session.doc);
  const refused = await conflict.flow.deleteAsset(ASSET);
  assert.deepEqual([refused.status, refused.code], ["failed", "WALL_REVISION_CONFLICT"]);
  assert.match(refused.message, /nothing was deleted/);
  assert.deepEqual(conflict.session.doc, before);

  const offline = harness({ fail: Object.assign(new Error("Authentication service could not be reached."), { code: "NETWORK_ERROR" }) });
  await offline.session.load();
  const lost = await offline.flow.deleteAsset(ASSET);
  assert.deepEqual([lost.status, lost.code], ["failed", "NETWORK_ERROR"]);
  assert.ok(offline.calls.some(call => call[1] === "refresh"), "the list was re-read before reporting");
  assert.deepEqual(offline.session.doc, before, "still there -> nothing changed");

  const committed = harness({ fail: Object.assign(new Error("x"), { code: "NETWORK_ERROR" }), failAfterCommit: true });
  await committed.session.load();
  let reloaded = 0;
  const original = committed.session.reloadLatest;
  committed.session.reloadLatest = async () => { reloaded += 1; return original(); };
  committed.persistence.latest = { document: ops.removeAssetReferences(wall(), IMG).doc, revision: 6 };
  const happened = await committed.flow.deleteAsset(ASSET);
  assert.equal(happened.status, "deleted");
  assert.deepEqual(ops.assetUsage(committed.session.doc, IMG), []);
  assert.equal(reloaded, 1, "nothing else unsaved: the server's draft is reloaded");
  assert.equal(committed.session.state.revision, 6);

  const saving = harness({ server: { [IMG]: { inDraft: true, inPublished: false } } });
  await saving.session.load();
  saving.session.state.status = "saving";
  assert.equal((await saving.flow.deleteAsset(ASSET)).code, "SAVE_IN_PROGRESS");
  saving.session.state.status = "conflict";
  assert.equal((await saving.flow.deleteAsset(ASSET)).code, "EDITOR_NOT_READY");
  assert.deepEqual(saving.calls, [], "nothing is sent while the editor does not know its saved revision");
});

test("repeated clicks: one deletion at a time - a second click while one runs does nothing", async () => {
  const h = harness();
  await h.session.load();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = h.flow.deleteAsset({ ...UNUSED });
  const store = h.flow;
  assert.equal(store.busy, true);
  assert.equal((await h.flow.deleteAsset(UNUSED)).status, "busy");
  assert.equal((await h.flow.deleteFont(FONT_ROW)).status, "busy", "across resource types too");
  release();
  await gate;
  assert.equal((await first).status, "deleted");
  assert.equal(h.calls.length, 1);
  assert.equal(h.flow.busy, false);
});

test("10 storage: a file the gateway could not remove yet is reported honestly (the database deletion stands)", async () => {
  const h = harness({ server: { storage: "pending" } });
  await h.session.load();
  const outcome = await h.flow.deleteAsset(UNUSED);
  assert.equal(outcome.status, "deleted");
  assert.match(outcome.message, /still counts toward your storage for now/);
});

// ---- the dialog ---------------------------------------------------------------------------------------------------------------------------------------
function fakeDocument() {
  const make = tag => {
    const node = { tag, children: [], attrs: {}, listeners: {}, textContent: "", disabled: false, open: false, removed: false, className: "",
      append(...items) { node.children.push(...items); }, replaceChildren(...items) { node.children = [...items]; }, setAttribute(key, value) { node.attrs[key] = value; }, addEventListener(type, fn) { node.listeners[type] = fn; },
      showModal() { node.open = true; }, close() { node.open = false; }, remove() { node.removed = true; }, focus() { doc.focused = node; } };
    return node;
  };
  const doc = { focused: null, createElement: make, body: make("body") };
  return doc;
}
const walk = (node, out = []) => { out.push(node); for (const child of node.children ?? []) if (typeof child === "object") walk(child, out); return out; };
const DETAILS = { noun: "image", name: "Image · 640×360 · 2 KB", inUse: true, places: ["Stage 1 background", "2 images on Stage 2"], consequence: "Deleting it removes the image.", publishedNote: null };

test("dialog: a modal with the name, the places, the consequence and Delete / Cancel; Cancel is focused; Cancel and Escape change nothing; Delete runs once", async () => {
  const documentRef = fakeDocument();
  let runs = 0;
  const pending = openDeleteDialog(documentRef, DETAILS, async () => { runs += 1; return { status: "deleted" }; });
  const dialog = documentRef.body.children[0];
  assert.equal(dialog.tag, "dialog");
  assert.equal(dialog.open, true, "showModal: the top layer, never clipped by a panel");
  const nodes = walk(dialog), texts = nodes.map(node => node.textContent);
  assert.ok(texts.includes("Delete this image?") && texts.includes(DETAILS.name) && texts.includes("Stage 1 background") && texts.includes("2 images on Stage 2") && texts.includes(DETAILS.consequence));
  assert.ok(texts.some(value => /cannot be undone/.test(value)));
  const [cancel, confirm] = nodes.filter(node => node.tag === "button");
  assert.deepEqual([cancel.textContent, confirm.textContent], ["Cancel", "Delete image"]);
  assert.equal(documentRef.focused, cancel, "the safe choice has the focus");
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  dialog.listeners.cancel(event);
  assert.equal(event.prevented, true);
  assert.equal(await pending, null, "Escape = Cancel");
  assert.equal(runs, 0);
  assert.equal(dialog.removed, true);

  const second = fakeDocument();
  let finish;
  const confirmed = openDeleteDialog(second, DETAILS, () => { runs += 1; return new Promise(resolve => { finish = resolve; }); });
  const buttons = walk(second.body.children[0]).filter(node => node.tag === "button");
  buttons[1].listeners.click();
  buttons[1].listeners.click();
  assert.equal(runs, 1, "a second click while deleting does nothing");
  assert.deepEqual([buttons[0].disabled, buttons[1].disabled, buttons[1].textContent], [true, true, "Deleting…"]);
  buttons[0].listeners.click();
  finish({ status: "deleted", message: "ok" });
  assert.deepEqual(await confirmed, { status: "deleted", message: "ok" }, "Cancel cannot interrupt a deletion in progress");
});

test("dialog, not in use: the simple confirmation - not in use, permanent, cannot be undone, Cancel / Delete image - and no usage list", async () => {
  const documentRef = fakeDocument();
  const simple = { noun: "image", name: "Image · 10×10 · 1 KB", inUse: false, places: [], publishedNote: null, consequence: "" };
  const pending = openDeleteDialog(documentRef, simple, async () => ({ status: "deleted", message: "ok" }));
  const nodes = walk(documentRef.body.children[0]), texts = nodes.map(node => node.textContent);
  for (const line of ["Delete this image?", "This image is not currently in use.", "Are you sure you want to permanently delete it?", "This action cannot be undone."]) assert.ok(texts.includes(line), line);
  assert.equal(nodes.some(node => node.tag === "ul"), false, "no list of affected places");
  assert.equal(texts.some(value => /is in use/.test(value)), false, "no misleading usage warning");
  const [cancel, confirm] = nodes.filter(node => node.tag === "button");
  assert.deepEqual([cancel.textContent, confirm.textContent], ["Cancel", "Delete image"]);
  assert.equal(documentRef.focused, cancel);
  cancel.listeners.click();
  assert.equal(await pending, null, "Cancel changes nothing");
});

test("dialog: when the server finds the resource still in use, the same dialog switches to the detailed confirmation and waits again", async () => {
  const documentRef = fakeDocument();
  const simple = { noun: "video", name: "MP4 video · 1920×1080 · 9 MB", inUse: false, places: [], publishedNote: null, consequence: "" };
  const detailed = { noun: "video", name: simple.name, inUse: true, places: ["your published Wall"], publishedNote: null, consequence: "Deleting it removes the video from every place it is used." };
  let second = 0;
  const pending = openDeleteDialog(documentRef, simple, async () => ({ status: "confirm-again", details: detailed, run: async () => { second += 1; return { status: "deleted", message: "done" }; } }));
  const dialog = documentRef.body.children[0];
  const [cancel, confirm] = walk(dialog).filter(node => node.tag === "button");
  await confirm.listeners.click();
  assert.equal(dialog.open, true, "still open: nothing was deleted yet");
  const texts = walk(dialog).map(node => node.textContent);
  assert.ok(texts.includes("This video is in use:") && texts.includes("your published Wall") && texts.includes("This deletes it permanently. It cannot be undone."));
  assert.ok(texts.some(value => /Nothing was deleted/.test(value)));
  assert.deepEqual([cancel.disabled, confirm.disabled, confirm.textContent], [false, false, "Delete video"]);
  await confirm.listeners.click();
  assert.equal(second, 1);
  assert.deepEqual(await pending, { status: "deleted", message: "done" });
});
// ---- the account client -------------------------------------------------------------------------------------------------------------------------------
test("client: one RPC with resolve / expected revision, then the file goes through the usage gateway (right bucket), retried, 404 = gone, else reported pending", async () => {
  const store = new Map([["gamid.testing.auth.session.v1", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "u" } })]]);
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  globalThis.location = { origin: "https://testing.gamid.example", pathname: "/wall-editor/", search: "", hash: "" };
  globalThis.history = { replaceState() {} };
  const calls = [];
  let fileFailures = 0, fileStatus = 500, answer = null;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method, body: options.body });
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/rest/v1/rpc/")) return json([answer]);
    if (url.includes("/usage-upload/object/")) { if (fileFailures > 0) { fileFailures -= 1; return json({ error: "x" }, fileStatus); } return json({ ok: true }); }
    return json({});
  };
  const api = await import(`../dist/account/supabase-client.js?delete=${Date.now()}`);
  const wait = async () => {};
  answer = { deleted: true, in_draft: true, in_published: true, storage_path: "u/clip.h264.mp4", draft_revision: 8, published_changed: true };
  const resolved = await api.deleteWallAssetResolving(VID, { resolve: true, expectedRevision: 7, wait });
  assert.deepEqual(JSON.parse(calls[0].body), { candidate_asset_id: VID, candidate_resolve: true, candidate_expected_revision: 7 });
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/delete_my_wall_asset_resolving$/);
  assert.match(calls[1].url, /\/functions\/v1\/usage-upload\/object\/wall-video-derived\/u\/clip\.h264\.mp4$/);
  assert.equal(calls[1].method, "DELETE");
  assert.deepEqual(resolved, { deleted: true, inDraft: true, inPublished: true, publishedChanged: true, draftRevision: 8, storageCleanup: "done" });
  calls.length = 0; fileFailures = 2;
  answer = { deleted: true, in_draft: false, in_published: false, storage_path: "u/a b.png", draft_revision: 8, published_changed: false };
  const retried = await api.deleteWallAssetResolving(IMG, { wait });
  assert.equal(calls.filter(call => call.url.includes("/usage-upload/object/wall-media/u/a%20b.png")).length, 3, "two failures, then success");
  assert.deepEqual([retried.storageCleanup, retried.draftRevision], ["done", null], "an untouched draft keeps the editor's revision");
  calls.length = 0; fileFailures = 9;
  const pending = await api.deleteWallFontResolving(FONT, { wait });
  assert.match(calls[0].url, /delete_my_wall_font_resolving$/);
  assert.equal(calls.filter(call => call.url.includes("/usage-upload/object/wall-fonts/")).length, 3, "three tries at most");
  assert.equal(pending.storageCleanup, "pending");
  calls.length = 0; fileFailures = 1; fileStatus = 404;
  assert.equal((await api.deleteWallAssetResolving(IMG, { wait })).storageCleanup, "done", "already gone counts as removed");
  calls.length = 0;
  answer = { deleted: false, in_draft: true, in_published: false, storage_path: null, draft_revision: 8, published_changed: false };
  const kept = await api.deleteWallAssetResolving(IMG, { wait });
  assert.deepEqual([kept.deleted, kept.inDraft, kept.storageCleanup], [false, true, "none"]);
  assert.equal(calls.filter(call => call.url.includes("/usage-upload/")).length, 0, "nothing deleted -> no file touched");
  assert.equal(typeof api.deleteWallAsset, "undefined", "one deletion path only (the refusing client calls are gone)");
  assert.equal(typeof api.deleteWallFont, "undefined");
});

// ---- wiring --------------------------------------------------------------------------------------------------------------------------------------------
test("every entry point uses the one flow: Assets, Background images / videos (desktop and phone share these panels), My Fonts; no panel-local delete remains", () => {
  const tools = read("dist/wall-editor/tools.js"), editor = read("dist/wall-editor/editor.js"), css = read("dist/wall-editor/editor.css");
  assert.match(tools, /const deletion = createDeleteFlow\(\{ session, assets, fonts, confirm: \(details, perform\) => openDeleteDialog\(document, details, perform\), onDeleted: onResourceDeleted \}\);/);
  assert.equal((tools.match(/await deleteAssetNow\(asset\)/g) ?? []).length, 2, "Assets + Background");
  assert.match(tools, /const outcome = await deletion\.deleteAsset\(asset\);/);
  assert.match(tools, /const outcome = await deletion\.deleteFont\(font\);/);
  assert.doesNotMatch(tools, /assets\.remove\(|fonts\.remove\(|deleteWallAsset\(|deleteWallFont\(|confirmingDelete|usesFontNow|Delete permanently|Remove it from the Wall first/);
  assert.doesNotMatch(tools, /window\.confirm/, "the deletion confirmation is the accessible dialog, not a browser prompt");
  assert.match(editor, /onResourceDeleted: \(\) => refreshPublication\(\),/, "the publish status follows a deletion that changed the published Wall");
  assert.match(css, /\.ed-delete-dialog \{[^}]*width: min\(30rem, calc\(100vw - 2rem\)\); max-height: calc\(100dvh - 2rem\); overflow: auto;/, "never wider than the screen, scrolls inside itself");
  assert.match(css, /\.ed-delete-dialog::backdrop/);
  const dialogCss = css.slice(css.indexOf(".ed-delete-dialog {"), css.indexOf(".ed-delete-actions .ed-btn { flex: 1 1 8rem; } }"));
  assert.ok(dialogCss.length > 500);
  assert.doesNotMatch(dialogCss, /animation|transition/, "no motion");
  const flow = read("dist/wall-editor/delete-flow.js");
  assert.doesNotMatch(flow, /innerHTML|insertAdjacentHTML/);
  // every permanent deletion is confirmed first (Mazen, 2026-10-21): the server is asked to delete only from inside a confirmation's Delete
  assert.equal((flow.match(/store\.deleteResolving\(/g) ?? []).length, 2, "two calls: the simple confirmation's Delete and the detailed one's (resolveNow)");
  assert.match(flow, /outcome = await confirm\(simple, async \(\) => \{\s*let server;\s*try \{ server = await resource\.store\.deleteResolving\(resource\.id, \{ resolve: false \}\); \}/);
  assert.match(flow, /outcome = await confirm\(usedDetails\([\s\S]{0,160}\), \(\) => resolveNow\(resource\)\);/);
  assert.equal((flow.match(/\(\) => resolveNow\(resource\)/g) ?? []).length, 2, "resolveNow runs only as a confirmation's Delete (detailed, or detailed after the server's refusal)");
  assert.match(read("package.json"), /node --check dist\/wall-editor\/delete-flow\.js/);
});
