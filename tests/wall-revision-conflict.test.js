// Two-tab stale revision regression (W3 manual defect 12). Root cause: the conflict was raised with SQLSTATE 40001, which PostgREST retries until the gateway
// times out (504) - the stale save never answered with a conflict. The fix raises PT409 (HTTP 409). These tests run the REAL client stack (supabase-client request path
// -> W2 persistence -> editor session) for two tabs against a fake API that answers exactly as PostgREST does for the real functions.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createDocument } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { createWallPersistence } from "../dist/wall/persistence.js";
import { createEditorSession } from "../dist/wall-kit/session.js";
import * as ops from "../dist/wall-kit/ops.js";

const KEY = "gamid.testing.auth.session.v1";
let counter = 0;
const reply = (status, body) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => body, text: async () => JSON.stringify(body) });

function api() {
  const server = { document: createDocument(), revision: 1, log: [] };
  const row = () => [{ document: structuredClone(server.document), revision: server.revision, created_at: "t", updated_at: "t" }];
  const store = new Map([[KEY, JSON.stringify({ access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3000 })]]);
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  globalThis.location = { hash: "", pathname: "/wall-editor/", search: "", origin: "https://example.invalid" };
  globalThis.history = { replaceState() {} };
  globalThis.fetch = async (url, init) => {
    const name = String(url).split("/rpc/")[1];
    const body = init.body ? JSON.parse(init.body) : {};
    server.log.push(name);
    if (name === "ensure_my_wall_draft" || name === "get_my_wall_draft") return reply(200, row());
    if (name === "save_my_wall_draft") {
      if (!validateDocument(body.candidate_document).valid) return reply(400, { code: "22023", message: "INVALID_WALL_DOCUMENT", details: "[]" });
      // the real function: PT409 (PostgREST custom status) when the revision is stale - NOT a retryable 40001
      if (body.candidate_expected_revision !== server.revision) return reply(409, { code: "PT409", message: "WALL_REVISION_CONFLICT", details: String(server.revision), hint: null });
      server.document = structuredClone(body.candidate_document);
      server.revision += 1;
      return reply(200, row());
    }
    return reply(404, {});
  };
  return server;
}
async function tab() {
  const client = await import(`../dist/account/supabase-client.js?tab=${counter++}`);
  const session = createEditorSession({ persistence: createWallPersistence({ rpc: (name, body) => client.rpc(name, body) }) });
  await session.load();
  return session;
}
const addRect = session => session.apply(ops.addElement(session.doc, "stage_1", "rect"));

test("TWO TABS: A saves, B (stale, same revision) saves -> B gets a conflict, the newest persisted Wall is protected, and B is blocked until it chooses", async () => {
  const server = api();
  const a = await tab(), b = await tab();
  assert.equal(a.state.revision, 1);
  assert.equal(b.state.revision, 1);
  addRect(a);
  assert.deepEqual(await a.save(), { ok: true, revision: 2 });
  const persisted = structuredClone(server.document);
  b.apply(ops.addElement(b.doc, "stage_1", "circle"));
  const result = await b.save();
  assert.deepEqual(result, { ok: false, code: "WALL_REVISION_CONFLICT" });
  assert.equal(b.status, "conflict");
  assert.deepEqual(server.document, persisted, "A's newer Wall was NOT overwritten");
  assert.equal(server.revision, 2);
  const requests = server.log.filter(name => name === "save_my_wall_draft").length;
  assert.equal((await b.save()).code, "SAVE_NOT_ALLOWED");
  assert.equal(server.log.filter(name => name === "save_my_wall_draft").length, requests, "no further save is sent while the conflict is unresolved");
  assert.equal(b.dirty, true, "B's edits are still there to keep or discard");
});

test("LOAD LATEST: B discards its stale edits, takes A's Wall and continues from the newest revision", async () => {
  const server = api();
  const a = await tab(), b = await tab();
  addRect(a); await a.save();
  b.apply(ops.addElement(b.doc, "stage_1", "circle"));
  await b.save();
  assert.equal(await b.reloadLatest(), true);
  assert.deepEqual(b.doc, server.document);
  assert.equal(b.state.revision, 2);
  b.apply(ops.addElement(b.doc, "stage_1", "text"));
  assert.deepEqual(await b.save(), { ok: true, revision: 3 });
});

test("KEEP MINE: an explicit overwrite acknowledges the newer revision first; it never happens silently", async () => {
  const server = api();
  const a = await tab(), b = await tab();
  addRect(a); await a.save();
  b.apply(ops.addElement(b.doc, "stage_1", "circle"));
  const mine = b.doc;
  assert.equal(b.status === "conflict", false);
  await b.save();
  assert.equal(b.status, "conflict");
  assert.equal(server.revision, 2, "still A's revision until B explicitly chooses");
  assert.deepEqual(await b.overwriteWithMine(), { ok: true, revision: 3 });
  assert.deepEqual(server.document, mine);
});

test("a chain of stale saves cannot slip through: every tab that did not see the latest revision is rejected", async () => {
  const server = api();
  const [a, b, c] = [await tab(), await tab(), await tab()];
  addRect(a); await a.save();
  addRect(b); assert.equal((await b.save()).code, "WALL_REVISION_CONFLICT");
  addRect(c); assert.equal((await c.save()).code, "WALL_REVISION_CONFLICT");
  assert.equal(server.revision, 2);
});

test("the conflict is raised with PT409 (HTTP 409), never the retryable 40001 that PostgREST turns into a gateway timeout", () => {
  const files = readdirSync("supabase/migrations").filter(name => /_wall_/.test(name)).sort();
  const latest = files.map(name => ({ name, sql: readFileSync(`supabase/migrations/${name}`, "utf8") })).filter(file => /function private\.save_my_wall_draft_impl/.test(file.sql)).at(-1);
  assert.match(latest.name, /revision_conflict_status|wall_/);
  const body = latest.sql.slice(latest.sql.indexOf("function private.save_my_wall_draft_impl"));
  assert.match(body, /errcode = 'PT409', message = 'WALL_REVISION_CONFLICT'/);
  assert.doesNotMatch(body, /errcode = '40001'/);
  assert.match(body, /current_draft\.revision <> candidate_expected_revision/, "the optimistic check itself is unchanged");
});
