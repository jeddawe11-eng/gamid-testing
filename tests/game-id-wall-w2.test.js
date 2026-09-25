// Wall persistence foundation (W2): keeps the database validator, the W1 validator and the persistence client in agreement, and pins the security shape of
// the migration. The live database behavior (RLS, ownership, revisions, corpus parity through the real validator function) is tests/integration/wall-w2-db.sql,
// generated from the same corpus - this file guarantees that generated test is never stale and that the SQL port cannot silently fall behind W1.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateDocument } from "../dist/wall/validate.js";
import { createDocument } from "../dist/wall/schema.js";
import { CORPUS } from "./wall-w2-corpus.js";
import { buildContractSql, OUTPUT_PATH } from "../scripts/generate-wall-w2-db-contract.mjs";
import { createWallPersistence, WallPersistenceError, toPersistenceError } from "../dist/wall/persistence.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const MIGRATION = "supabase/migrations/20260925120000_wall_persistence_foundation.sql";
const migration = read(MIGRATION);
// the migration text without SQL comments, for "does the code do X" assertions
const migrationCode = migration.replace(/--.*$/gm, "");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "node_modules" && name !== ".git") walk(full, out); } else out.push(full);
  }
  return out;
}

// ---------- the shared corpus ----------
test("corpus: names are unique and both valid and invalid documents are covered", () => {
  const names = CORPUS.map(entry => entry.name);
  assert.equal(new Set(names).size, names.length);
  const valid = CORPUS.filter(entry => validateDocument(entry.doc).valid);
  assert.ok(valid.length >= 8, "enough valid documents");
  assert.ok(CORPUS.length - valid.length >= 60, "enough invalid documents");
});

// Codes W1 can emit (string literals and `CODE:${...}` templates), minus the two that only exist once an embed provider is registered: the adapter
// passthrough (PROVIDER:<code>) and PROVIDER_DATA_NOT_OBJECT (checked only after a provider is found). Zero providers exist in W1 and in the database, so
// neither can occur; the forward migration that registers a real provider must teach the database validator both (and add corpus cases).
const PROVIDER_ONLY = new Set(["PROVIDER", "PROVIDER_DATA_NOT_OBJECT"]);
const w1Codes = () => {
  const w1Source = read("dist/wall/validate.js") + read("dist/wall/elements.js");
  return new Set([...w1Source.matchAll(/["`]([A-Z][A-Z_]{5,})(?::|["`])/g)].map(match => match[1]).filter(code => !PROVIDER_ONLY.has(code)));
};

test("corpus: every W1 error code family is exercised, so the database port is checked against all of them", () => {
  const seen = new Set(CORPUS.flatMap(entry => validateDocument(entry.doc).errors.map(code => code.split(":")[0])));
  for (const code of w1Codes()) assert.ok(seen.has(code), `corpus never produces W1 error ${code}`);
});

test("drift guard: the committed transactional DB test is exactly what the corpus and the real W1 validator generate", () => {
  assert.equal(read(OUTPUT_PATH), buildContractSql().replace(/\r\n/g, "\n"), "run: node scripts/generate-wall-w2-db-contract.mjs");
});

test("drift guard: every W1 error code and every unsafe-content pattern is present in the SQL port", () => {
  const w1Source = read("dist/wall/validate.js") + read("dist/wall/elements.js");
  for (const code of w1Codes()) assert.ok(migrationCode.includes(`'${code}`), `migration does not emit ${code}`);
  // if W1's unsafe patterns ever change this fails until the SQL clauses (and the corpus) are updated to match
  const patterns = w1Source.match(/const UNSAFE_PATTERNS = (\[.*\]);/)[1];
  assert.equal(patterns, String.raw`[/<\s*script/i, /<\s*iframe/i, /<\s*\/?[a-z][\s\S]*>/i, /javascript:/i, /\bon[a-z]+\s*=/i]`);
  for (const fragment of ["'<' || ws || 'script'", "'<' || ws || 'iframe'", "'<' || ws || '/?[a-z].*>'", "'javascript:'", "'(^|[^a-z0-9_])on[a-z]+' || ws || '='"]) {
    assert.ok(migrationCode.includes(fragment), `SQL port is missing unsafe-pattern clause ${fragment}`);
  }
  assert.equal([...migrationCode.matchAll(/candidate ~\* /g)].length, 5, "exactly the five W1 unsafe patterns");
  assert.ok(migrationCode.includes("'^#[0-9a-fA-F]{6}$'"), "rect fill pattern matches W1");
});

test("drift guard: the database's starting document equals the W1 createDocument() default", () => {
  const literal = migrationCode.match(/select '(\{"schemaVersion".*?\})'::jsonb; \$\$/)[1];
  assert.deepEqual(JSON.parse(literal), createDocument());
});

// ---------- migration security shape ----------
test("migration: additive only, TESTING-safe, and a fresh timestamp after the Play Together migrations", () => {
  assert.ok(existsSync(MIGRATION));
  const versions = readdirSync("supabase/migrations").map(name => name.slice(0, 14)).sort();
  assert.equal(versions[versions.length - 1], "20260925120000", "W2 is the newest migration");
  assert.ok(versions.filter(v => v === "20260925120000").length === 1);
  assert.ok(!/\b(drop|truncate)\s+(table|schema|function)\b/i.test(migrationCode), "no destructive statements");
  assert.ok(!/\balter\s+table\s+public\.(entities|entity_memberships|profiles)\b/i.test(migrationCode), "no change to existing tables");
  assert.ok(!/\bdelete\s+from\b|\binsert\s+into\s+public\.(entities|profiles)/i.test(migrationCode), "touches no existing data");
  assert.ok(!/game[-_ ]?id[-_ ]?wall/i.test(migration), "the Steam-slice scope guard reserves that phrase");
});

test("migration: RLS on, no client table grant, RPC-only access for authenticated, nothing for anon", () => {
  assert.match(migrationCode, /alter table public\.wall_drafts enable row level security;/);
  assert.match(migrationCode, /revoke all on table public\.wall_drafts from public, anon, authenticated;/);
  assert.ok(!/grant\s+[^;]*\bon\s+table\b/i.test(migrationCode), "no table grant of any kind");
  assert.ok(!/\bto\b[^;]*\banon\b[^;]*;/i.test(migrationCode.replace(/revoke[^;]*;/gi, "")), "nothing is granted to anon");
  const grants = [...migrationCode.matchAll(/grant execute on function([^;]*?)to ([^;]*);/gi)];
  assert.equal(grants.length, 1);
  assert.equal(grants[0][2].trim(), "authenticated");
  assert.ok(!/wall_document_errors|wall_string_is_unsafe|wall_scan_unsafe|wall_element_payload_errors|wall_new_document|wall_owned_entity_id/.test(grants[0][1]), "helpers are not client-executable");
});

test("migration: definer functions pin an empty search_path; public wrappers are security invoker", () => {
  const functions = migrationCode.split(/\ncreate function /).slice(1);
  assert.ok(functions.length >= 12);
  for (const body of functions) {
    const name = body.slice(0, body.indexOf("("));
    assert.ok(/set search_path = ''/.test(body), `${name} pins search_path`);
    if (name.startsWith("public.")) assert.ok(/security invoker/.test(body) && !/security definer/.test(body), `${name} is a security invoker wrapper`);
  }
  assert.ok(/security definer/.test(migrationCode));
});

test("migration: ownership comes from auth.uid() through the membership architecture, never from a client-supplied id", () => {
  assert.match(migrationCode, /\(select auth\.uid\(\)\)/);
  assert.match(migrationCode, /public\.entity_memberships m/);
  assert.match(migrationCode, /m\.role = 'OWNER' and e\.entity_type = 'SOLO'/);
  const signatures = [...migrationCode.matchAll(/create function public\.(\w+)\(([^)]*)\)/g)];
  assert.equal(signatures.length, 3);
  for (const [, name, args] of signatures) assert.ok(!/entity|owner|user|profile/i.test(args), `${name} takes no owner/identity argument`);
  assert.ok(!/\bvisibility\b|is_public|published/.test(migrationCode), "the draft does not depend on publish state");
});

test("migration: one Wall per identity is a database constraint, race-safe, with a non-destructive path to relax it later", () => {
  assert.match(migrationCode, /constraint wall_drafts_one_per_identity unique \(entity_id\)/);
  assert.match(migrationCode, /on conflict on constraint wall_drafts_one_per_identity do nothing/);
  assert.match(migrationCode, /wall_draft_id uuid primary key/, "own surrogate key: the unique constraint alone encodes the one-Wall rule");
  assert.ok(!/wall_count|wallcount/i.test(migration));
  assert.match(migrationCode, /check \(cardinality\(private\.wall_document_errors\(document\)\) = 0\)/);
});

test("migration: no owner, id or revision field is injected into the stored document", () => {
  assert.ok(!/jsonb_set|\|\| jsonb_build_object|document \|\|/.test(migrationCode), "the document is stored as received");
  assert.match(migrationCode, /set document = candidate_document, revision = d\.revision \+ 1/);
});

// ---------- persistence client ----------
const record = (document, revision = 1) => ({ document, revision, created_at: "2026-09-25T00:00:00Z", updated_at: "2026-09-25T00:00:01Z" });
const fakeRpc = handlers => { const calls = []; const rpc = async (name, body) => { calls.push({ name, body }); return handlers[name](body); }; return { rpc, calls }; };

test("client: ensure and load return one record shape and pass no owner information", async () => {
  const doc = createDocument();
  const { rpc, calls } = fakeRpc({ ensure_my_wall_draft: () => [record(doc)], get_my_wall_draft: () => [record(doc, 4)] });
  const wall = createWallPersistence({ rpc });
  assert.deepEqual(await wall.ensureDraft(), { document: doc, revision: 1, createdAt: "2026-09-25T00:00:00Z", updatedAt: "2026-09-25T00:00:01Z" });
  assert.equal((await wall.loadDraft()).revision, 4);
  assert.deepEqual(calls.map(call => [call.name, call.body]), [["ensure_my_wall_draft", {}], ["get_my_wall_draft", {}]]);
});

test("client: load returns null when the owner has no draft yet", async () => {
  const wall = createWallPersistence({ rpc: async () => [] });
  assert.equal(await wall.loadDraft(), null);
});

test("client: save sends the W1 document unchanged plus the expected revision - nothing else", async () => {
  const doc = createDocument();
  doc.stages[0].elements.push({ id: "r1", type: "rect", x: 1, y: 2, width: 3, height: 4, z: 0, payload: { fill: "#010203" } });
  const { rpc, calls } = fakeRpc({ save_my_wall_draft: body => [record(body.candidate_document, body.candidate_expected_revision + 1)] });
  const saved = await createWallPersistence({ rpc }).saveDraft(doc, 3);
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["candidate_document", "candidate_expected_revision"]);
  assert.equal(calls[0].body.candidate_document, doc, "the very same document, not a wrapped or re-shaped copy");
  assert.equal(calls[0].body.candidate_expected_revision, 3);
  assert.equal(saved.revision, 4);
  assert.deepEqual(saved.document, doc);
  assert.deepEqual(Object.keys(doc).sort(), ["canvas", "schemaVersion", "stages"], "no id/owner/revision leaked into the document");
});

test("client: an invalid or unsafe document is rejected before any request, with the W1 error list", async () => {
  const { rpc, calls } = fakeRpc({ save_my_wall_draft: () => { throw new Error("must not be called"); } });
  const wall = createWallPersistence({ rpc });
  const unsafe = createDocument();
  unsafe.stages[0].elements.push({ id: "r1", type: "rect", x: 1, y: 1, width: 1, height: 1, z: 0, payload: { fill: "#000000", note: "<script>1</script>" } });
  await assert.rejects(() => wall.saveDraft(unsafe, 1), error => error instanceof WallPersistenceError && error.code === "INVALID_WALL_DOCUMENT" && error.errors.includes("UNSAFE_PAYLOAD_CONTENT:r1.payload.note"));
  await assert.rejects(() => wall.saveDraft({ ...createDocument(), schemaVersion: 2 }, 1), error => error.errors[0] === "UNSUPPORTED_SCHEMA_VERSION");
  await assert.rejects(() => wall.saveDraft(null, 1), error => error.errors[0] === "MALFORMED_DOCUMENT");
  assert.equal(calls.length, 0);
});

test("client: database typed errors map to typed domain errors; a stale save carries the current revision", async () => {
  const fail = message => async () => { const error = new Error(message); error.code = "40001"; throw error; };
  for (const code of ["AUTH_REQUIRED", "IDENTITY_NOT_FOUND", "WALL_DRAFT_NOT_FOUND", "INVALID_WALL_REVISION", "WALL_DOCUMENT_TOO_LARGE"]) {
    await assert.rejects(() => createWallPersistence({ rpc: fail(code) }).loadDraft(), error => error instanceof WallPersistenceError && error.code === code);
  }
  const conflict = Object.assign(new Error("WALL_REVISION_CONFLICT"), { payload: { message: "WALL_REVISION_CONFLICT", details: "7" } });
  await assert.rejects(() => createWallPersistence({ rpc: async () => { throw conflict; } }).saveDraft(createDocument(), 2), error => error.code === "WALL_REVISION_CONFLICT" && error.currentRevision === 7);
  const rejected = Object.assign(new Error("INVALID_WALL_DOCUMENT"), { payload: { message: "INVALID_WALL_DOCUMENT", details: '["OUTSIDE_CANVAS:a"]' } });
  assert.deepEqual(toPersistenceError(rejected).errors, ["OUTSIDE_CANVAS:a"]);
  await assert.rejects(() => createWallPersistence({ rpc: fail("boom") }).loadDraft(), error => error.code === "WALL_PERSISTENCE_FAILED");
  assert.throws(() => createWallPersistence({}), TypeError);
});

// ---------- scope: no public surface, no UI, nothing else touched ----------
test("scope: persistence is not wired into any page, route, worker or public path", () => {
  const consumers = [...walk("dist"), ...walk("cf-worker"), "scripts/stage-cloudflare.mjs"].filter(file => /\.(js|mjs|html)$/.test(file) && !file.startsWith(join("dist", "wall")));
  for (const file of consumers) {
    const text = readFileSync(file, "utf8");
    assert.ok(!/wall_drafts|ensure_my_wall_draft|get_my_wall_draft|save_my_wall_draft|wall\/persistence/.test(text), `${file} must not reference Wall persistence`);
  }
  const source = read("dist/wall/persistence.js");
  assert.ok(!/anonymous|publish|autosave|localStorage|fetch\(/i.test(source.replace(/\/\/.*$/gm, "")), "no public/anon/autosave/network code in the persistence module");
  assert.ok(!/from "\.\.\/account/.test(source), "wall persistence does not import the account app");
});
