// W3 - the editor session: load/save through the REAL W2 persistence client against a fake server that enforces W2's revision rules, undo/redo history,
// the Saving/Saved/Unsaved/Error/Conflict states, and the "never silently overwrite a newer revision" guarantee.
import test from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { createWallPersistence } from "../dist/wall/persistence.js";
import { createEditorSession } from "../dist/wall-kit/session.js";
import { createHistory, HISTORY_LIMIT } from "../dist/wall-kit/history.js";
import * as ops from "../dist/wall-kit/ops.js";

// A stand-in for the W2 owner RPCs: one row, a revision, optimistic concurrency, and W1 validation on save.
function fakeServer(initial = createDocument()) {
  const server = { document: structuredClone(initial), revision: 1, calls: [], failNext: null, delay: null };
  const row = () => [{ document: structuredClone(server.document), revision: server.revision, created_at: "t0", updated_at: "t1" }];
  server.rpc = async (name, body) => {
    server.calls.push({ name, body: structuredClone(body) });
    if (server.delay) await server.delay;
    if (server.failNext) { const error = server.failNext; server.failNext = null; throw error; }
    if (name === "ensure_my_wall_draft" || name === "get_my_wall_draft") return row();
    if (name === "save_my_wall_draft") {
      if (server.beforeSave) { const hook = server.beforeSave; server.beforeSave = null; hook(); }
      const { valid, errors } = validateDocument(body.candidate_document);
      if (!valid) throw Object.assign(new Error("INVALID_WALL_DOCUMENT"), { payload: { message: "INVALID_WALL_DOCUMENT", details: JSON.stringify(errors) } });
      if (body.candidate_expected_revision !== server.revision) throw Object.assign(new Error("WALL_REVISION_CONFLICT"), { payload: { message: "WALL_REVISION_CONFLICT", details: String(server.revision) } });
      server.document = structuredClone(body.candidate_document);
      server.revision += 1;
      return row();
    }
    throw new Error("unexpected rpc " + name);
  };
  return server;
}
const boot = async (server = fakeServer()) => {
  const session = createEditorSession({ persistence: createWallPersistence({ rpc: server.rpc }) });
  await session.load();
  return { server, session };
};
const addText = session => session.apply(ops.addElement(session.doc, session.state.stageId, "text"), { select: ["el_1"] });
const saves = server => server.calls.filter(call => call.name === "save_my_wall_draft");

// ---------- load ----------
test("load: creates/loads the owner's Wall through W2 and starts Saved and clean", async () => {
  const { server, session } = await boot();
  assert.deepEqual(server.calls.map(call => call.name), ["ensure_my_wall_draft"]);
  assert.equal(session.status, "saved");
  assert.equal(session.dirty, false);
  assert.equal(session.state.revision, 1);
  assert.deepEqual(session.doc, createDocument());
  assert.equal(session.state.stageId, "stage_1");
});
test("load: a previously saved document comes back exactly as stored (same W1 document, no editor-only format)", async () => {
  const stored = ops.addElement(ops.addStage(createDocument()).doc, "stage_2", "text").doc;
  const { session } = await boot(fakeServer(stored));
  assert.deepEqual(session.doc, stored);
  assert.deepEqual(Object.keys(session.doc).sort(), ["canvas", "schemaVersion", "stages"]);
});
test("load: a stored document the Wall core rejects blocks editing instead of guessing, and never saves", async () => {
  const server = fakeServer({ schemaVersion: 1, canvas: { width: 1000, height: 1778 }, stages: [{ id: "s", elements: [{ id: "x", type: "hologram", x: 0, y: 0, width: 1, height: 1, z: 0, payload: {} }] }] });
  const session = createEditorSession({ persistence: createWallPersistence({ rpc: server.rpc }) });
  assert.equal(await session.load(), false);
  assert.equal(session.status, "blocked");
  assert.equal(session.state.errorCode, "STORED_DOCUMENT_INVALID");
  assert.deepEqual(await session.save(), { ok: false, code: "SAVE_NOT_ALLOWED" });
  assert.equal(saves(server).length, 0);
});
test("load: server errors become an error state carrying the typed code", async () => {
  const server = fakeServer();
  server.failNext = new Error("IDENTITY_NOT_FOUND");
  const session = createEditorSession({ persistence: createWallPersistence({ rpc: server.rpc }) });
  assert.equal(await session.load(), false);
  assert.equal(session.status, "error");
  assert.equal(session.state.errorCode, "IDENTITY_NOT_FOUND");
});

// ---------- editing state ----------
test("editing marks the Wall Unsaved; undoing back to the saved document returns to Saved", async () => {
  const { session } = await boot();
  addText(session);
  assert.equal(session.status, "unsaved");
  assert.equal(session.dirty, true);
  session.undo();
  assert.equal(session.status, "saved");
  session.redo();
  assert.equal(session.status, "unsaved");
});
test("a failed or no-op operation changes nothing: no history entry, no dirty flag", async () => {
  const { session } = await boot();
  const before = session.doc;
  session.apply(ops.deleteElements(session.doc, ["ghost"]));
  session.apply({ ok: true, doc: structuredClone(before) });
  assert.equal(session.canUndo, false);
  assert.equal(session.dirty, false);
  assert.equal(session.doc, before);
});
test("selection is not history: selecting, toggling and clearing never create undo steps or dirty the Wall", async () => {
  const { session } = await boot();
  addText(session);
  session.undo(); session.redo();
  const depth = session.canUndo;
  session.select(["el_1"]); session.toggle("el_1"); session.select(["el_1"]); session.clearSelection();
  assert.equal(session.canUndo, depth);
  session.undo();
  assert.equal(session.dirty, false);
});
test("selecting a group member selects the whole group; toggling adds/removes the whole unit", async () => {
  const { session } = await boot();
  session.apply(ops.addElement(session.doc, "stage_1", "rect"));
  session.apply(ops.addElement(session.doc, "stage_1", "rect"));
  session.apply(ops.addElement(session.doc, "stage_1", "rect"));
  session.apply(ops.groupElements(session.doc, ["el_1", "el_2"]));
  session.select(["el_1"]);
  assert.deepEqual([...session.state.selection].sort(), ["el_1", "el_2"]);
  session.toggle("el_3");
  assert.deepEqual([...session.state.selection].sort(), ["el_1", "el_2", "el_3"]);
  session.toggle("el_2");
  assert.deepEqual(session.state.selection, ["el_3"]);
  session.select(["el_3"], { additive: true });
  session.select(["el_1"], { additive: true });
  assert.equal(session.state.selection.length, 3);
});
test("selection follows the document: elements that no longer exist drop out (undo of an add, delete)", async () => {
  const { session } = await boot();
  addText(session);
  session.select(["el_1"]);
  session.undo();
  assert.deepEqual(session.state.selection, []);
  session.redo();
  session.select(["el_1"]);
  session.apply(ops.deleteElements(session.doc, ["el_1"]));
  assert.deepEqual(session.state.selection, []);
});
test("stage selection: switching stages clears the selection; a removed current stage falls back to the first", async () => {
  const { session } = await boot();
  session.apply(ops.addStage(session.doc));
  session.apply(ops.addElement(session.doc, "stage_1", "rect"), { select: ["el_1"] });
  session.setStage("stage_2");
  assert.deepEqual(session.state.selection, []);
  session.setStage("ghost");
  assert.equal(session.state.stageId, "stage_2");
  session.apply(ops.deleteStage(session.doc, "stage_2"));
  assert.equal(session.state.stageId, "stage_1");
});

// ---------- undo / redo ----------
test("undo/redo: local only - they never touch the server and never create backend revision history", async () => {
  const { server, session } = await boot();
  const before = server.calls.length;
  addText(session);
  session.apply(ops.moveElements(session.doc, ["el_1"], 10, 10));
  for (let i = 0; i < 5; i += 1) { session.undo(); session.redo(); }
  session.undo(); session.undo();
  assert.equal(server.calls.length, before);
  assert.equal(server.revision, 1);
});
test("undo/redo: walks back and forth through meaningful mutations; a new edit clears redo", async () => {
  const { session } = await boot();
  addText(session);
  session.apply(ops.moveElements(session.doc, ["el_1"], -50, 0));
  session.apply(ops.rotateElement(session.doc, "el_1", 20));
  const at = index => JSON.stringify(session.doc.stages[0].elements[0]);
  const rotated = at();
  session.undo();
  assert.equal(session.doc.stages[0].elements[0].rotation, undefined);
  session.undo();
  const original = at();
  session.undo();
  assert.equal(session.doc.stages[0].elements.length, 0);
  session.redo(); assert.equal(at(), original);
  session.redo(); session.redo();
  assert.equal(at(), rotated);
  assert.equal(session.redo(), false);
  session.undo();
  session.apply(ops.duplicateElements(session.doc, ["el_1"]));
  assert.equal(session.canRedo, false, "a new edit after undo clears the redo stack");
});
test("undo/redo: history is capped at 60 snapshots", () => {
  assert.equal(HISTORY_LIMIT, 60);
  const history = createHistory();
  let doc = createDocument();
  for (let i = 0; i < 100; i += 1) { const next = { ...doc, note: i }; history.record(doc, next); doc = next; }
  assert.equal(history.depth, 60);
  let steps = 0;
  while (history.undo(doc)) steps += 1;
  assert.equal(steps, 60);
});
test("undo/redo: continuous edits (typing, slider drags) coalesce into ONE undo step within a second, but not across fields or after a pause", async () => {
  let clock = 0;
  const server = fakeServer();
  const session = createEditorSession({ persistence: createWallPersistence({ rpc: server.rpc }), now: () => clock });
  await session.load();
  addText(session);
  const type = (text, key, at) => { clock = at; session.apply(ops.updatePayload(session.doc, "el_1", { text }), { coalesce: key }); };
  type("H", "text", 100); type("He", "text", 200); type("Hel", "text", 300); type("Hell", "text", 400);
  assert.equal(session.doc.stages[0].elements[0].payload.text, "Hell");
  session.undo();
  assert.equal(session.doc.stages[0].elements[0].payload.text, "Your text", "all four keystrokes were one step");
  session.redo();
  type("Hello", "text", 5000);   // a pause of more than a second starts a new step
  session.undo();
  assert.equal(session.doc.stages[0].elements[0].payload.text, "Hell");
  session.apply(ops.updatePayload(session.doc, "el_1", { fontSize: 50 }), { coalesce: "fontSize" });
  session.apply(ops.updatePayload(session.doc, "el_1", { fontSize: 60 }), { coalesce: "fontSize" });
  session.apply(ops.updatePayload(session.doc, "el_1", { color: "#ff0000" }), { coalesce: "color" });
  session.undo();
  assert.equal(session.doc.stages[0].elements[0].payload.fontSize, 60, "a different field is a different step");
});

// ---------- save ----------
test("save: sends the exact W1 document with the loaded revision, advances the revision, and returns to Saved", async () => {
  const { server, session } = await boot();
  addText(session);
  const sending = session.doc;
  assert.deepEqual(await session.save(), { ok: true, revision: 2 });
  const [call] = saves(server);
  assert.deepEqual(call.body, { candidate_document: sending, candidate_expected_revision: 1 });
  assert.equal(session.state.revision, 2);
  assert.equal(session.status, "saved");
  assert.deepEqual(server.document, sending);
  assert.equal(server.revision, 2);
});
test("save: save -> reload from the server -> the same document (round trip)", async () => {
  const { server, session } = await boot();
  addText(session);
  session.apply(ops.updatePayload(session.doc, "el_1", { text: "GamID", stroke: { color: "#000000", width: 3 }, gradient: { from: "#62e7ff", to: "#8b5dff", angle: 30 } }));
  session.apply(ops.rotateElement(session.doc, "el_1", 12));
  session.apply(ops.addElement(session.doc, "stage_1", "circle"));
  session.apply(ops.groupElements(session.doc, ["el_2", "el_1"]));
  session.apply(ops.addStage(session.doc));
  const edited = session.doc;
  await session.save();
  const { session: another } = await boot(server);
  assert.deepEqual(another.doc, edited);
  assert.equal(another.state.revision, 2);
});
test("save: edits made while a save is in flight stay Unsaved, and a second save call is ignored while one is running", async () => {
  const { server, session } = await boot();
  addText(session);
  let release;
  server.delay = new Promise(resolve => { release = resolve; });
  const first = session.save();
  assert.equal(session.status, "saving");
  assert.deepEqual(await session.save(), { ok: false, code: "SAVE_NOT_ALLOWED" });
  session.apply(ops.moveElements(session.doc, ["el_1"], 5, 5));
  release();
  await first;
  assert.equal(session.status, "unsaved");
  assert.equal(saves(server).length, 1);
  server.delay = null;
  await session.save();
  assert.equal(session.status, "saved");
  assert.equal(server.revision, 3);
});
test("save: a failed save keeps every edit, reports the typed error, and can be retried", async () => {
  const { server, session } = await boot();
  addText(session);
  server.failNext = new Error("boom");
  const result = await session.save();
  assert.equal(result.ok, false);
  assert.equal(session.status, "error");
  assert.equal(session.state.errorCode, "WALL_PERSISTENCE_FAILED");
  assert.equal(session.dirty, true);
  assert.equal(session.doc.stages[0].elements.length, 1);
  session.retry();
  assert.equal(session.status, "unsaved");
  assert.equal((await session.save()).ok, true);
  assert.equal(session.status, "saved");
});
test("save: an expired session (AUTH_REQUIRED) is a typed error, not a lost document", async () => {
  const { server, session } = await boot();
  addText(session);
  server.failNext = new Error("AUTH_REQUIRED");
  await session.save();
  assert.equal(session.state.errorCode, "AUTH_REQUIRED");
  assert.equal(session.dirty, true);
});
test("save: the client checks W1 before sending, so an invalid document is never sent", async () => {
  const { server, session } = await boot();
  session.state.doc = { ...session.doc, schemaVersion: 2 };   // simulate a corrupted in-memory document
  const result = await session.save();
  assert.equal(result.ok, false);
  assert.equal(saves(server).length, 0);
  assert.equal(session.state.errorCode, "INVALID_WALL_DOCUMENT");
  assert.deepEqual(session.state.validationErrors, ["UNSUPPORTED_SCHEMA_VERSION"]);
});

// ---------- revision conflicts ----------
test("conflict: a newer server revision is detected, nothing is overwritten, and no further save is attempted until the owner chooses", async () => {
  const { server, session } = await boot();
  addText(session);
  server.revision = 5; server.document = { ...createDocument(), stages: [{ id: "stage_1", elements: [] }, { id: "elsewhere", elements: [] }] };
  const before = structuredClone(server.document);
  const result = await session.save();
  assert.deepEqual(result, { ok: false, code: "WALL_REVISION_CONFLICT" });
  assert.equal(session.status, "conflict");
  assert.equal(session.state.serverRevision, 5);
  assert.deepEqual(server.document, before, "the newer server version was NOT overwritten");
  const attempts = saves(server).length;
  assert.deepEqual(await session.save(), { ok: false, code: "SAVE_NOT_ALLOWED" });
  assert.deepEqual(await session.save(), { ok: false, code: "SAVE_NOT_ALLOWED" });
  assert.equal(saves(server).length, attempts, "no request is sent while the conflict is unresolved");
  assert.equal(session.dirty, true, "local edits are still there");
});
test("conflict resolution 1: reload the latest - takes the server document and revision, drops local edits, resets history", async () => {
  const { server, session } = await boot();
  addText(session);
  server.revision = 4; server.document = { ...createDocument(), stages: [{ id: "stage_1", elements: [] }, { id: "from_other_device", elements: [] }] };
  await session.save();
  assert.equal(await session.reloadLatest(), true);
  assert.equal(session.status, "saved");
  assert.equal(session.state.revision, 4);
  assert.deepEqual(session.doc, server.document);
  assert.equal(session.canUndo, false);
  addText(session);
  assert.equal((await session.save()).revision, 5, "editing continues from the newer revision");
});
test("conflict resolution 2: overwrite is an explicit action - it reads the CURRENT revision and saves on top, so it can never silently clobber an even newer one", async () => {
  const { server, session } = await boot();
  addText(session);
  server.revision = 4;
  await session.save();
  assert.equal(session.status, "conflict");
  server.revision = 9;   // yet another save lands while the owner is deciding
  const mine = session.doc;
  assert.deepEqual(await session.overwriteWithMine(), { ok: true, revision: 10 });
  assert.deepEqual(server.document, mine);
  assert.equal(session.status, "saved");
  const overwriteSave = saves(server).at(-1);
  assert.equal(overwriteSave.body.candidate_expected_revision, 9, "based on the revision just read, not the stale one");
});
test("conflict resolution 2 is only available in the conflict state", async () => {
  const { session } = await boot();
  addText(session);
  assert.deepEqual(await session.overwriteWithMine(), { ok: false, code: "NO_CONFLICT" });
});
test("conflict: if another save lands between the overwrite's read and its write, that is a conflict again - never a blind overwrite", async () => {
  const { server, session } = await boot();
  addText(session);
  server.revision = 4;
  await session.save();
  server.beforeSave = () => { server.revision += 1; };   // someone saves again right after the overwrite read the revision
  const result = await session.overwriteWithMine();
  assert.deepEqual(result, { ok: false, code: "WALL_REVISION_CONFLICT" });
  assert.equal(session.status, "conflict");
  assert.equal(server.document.stages[0].elements.length, 0, "the server document was not replaced");
});