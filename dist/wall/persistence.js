// Wall persistence client - the thin, UI-free bridge between the accepted W1 Wall Document and the owner-private draft stored by the database (W2).
//
// The stored document IS the W1 document: this module never wraps, renames or re-shapes it, and adds no ownership or id field to it. Owner, revision and
// timestamps live beside the document in the returned record. The database re-validates every save (private.wall_document_errors, a narrow port of
// validate.js kept in step by tests/game-id-wall-w2.test.js) and resolves the owner from the signed-in session, never from anything this client sends.
//
// This module is deliberately transport-agnostic: `rpc` is injected (dist/account's supabase-client.js exposes exactly this shape), so nothing here imports
// the account app or any UI. It does not autosave and has no public/anonymous entry point. Publishing (owner-only) copies the SAVED draft into the published
// snapshot visitors see; the draft itself stays private (see supabase/migrations/20261002120000_wall_public_publishing.sql).
import { validateDocument } from "./validate.js";

// Typed persistence errors. `code` is the database's typed code (AUTH_REQUIRED, IDENTITY_NOT_FOUND, WALL_DRAFT_NOT_FOUND, INVALID_WALL_DOCUMENT,
// WALL_REVISION_CONFLICT, INVALID_WALL_REVISION, WALL_DOCUMENT_TOO_LARGE, ...). A validation rejection carries the W1 error list in `errors`; a stale save
// carries the current server revision in `currentRevision`.
export class WallPersistenceError extends Error {
  constructor(code, { errors = [], currentRevision = null, cause = null } = {}) {
    super(code);
    this.name = "WallPersistenceError";
    this.code = code;
    this.errors = errors;
    this.currentRevision = currentRevision;
    if (cause) this.cause = cause;
  }
}

const TYPED_CODES = new Set([
  "AUTH_REQUIRED", "IDENTITY_NOT_FOUND", "WALL_DRAFT_NOT_FOUND", "INVALID_WALL_DOCUMENT", "WALL_REVISION_CONFLICT", "INVALID_WALL_REVISION", "WALL_DOCUMENT_TOO_LARGE", "WALL_ASSET_NOT_FOUND", "WALL_ASSET_IN_USE", "WALL_ASSET_KIND_MISMATCH",
]);

function parseDetail(detail) {
  if (typeof detail !== "string" || !detail) return null;
  try { return JSON.parse(detail); } catch { return detail; }
}

// Maps whatever the transport threw (an ApiError carrying the database message/detail, or a plain Error) onto a WallPersistenceError.
export function toPersistenceError(error) {
  if (error instanceof WallPersistenceError) return error;
  const message = String(error?.message ?? "");
  const code = TYPED_CODES.has(message) ? message : (TYPED_CODES.has(error?.payload?.message) ? error.payload.message : null);
  if (!code) return new WallPersistenceError("WALL_PERSISTENCE_FAILED", { cause: error });
  const detail = parseDetail(error?.payload?.details ?? error?.details ?? error?.detail);
  return new WallPersistenceError(code, {
    errors: code === "INVALID_WALL_DOCUMENT" && Array.isArray(detail) ? detail : [],
    currentRevision: code === "WALL_REVISION_CONFLICT" && detail != null && Number.isFinite(Number(detail)) ? Number(detail) : null,
    cause: error,
  });
}

// One record shape everywhere: { document, revision, createdAt, updatedAt }.
export function toDraftRecord(row) {
  if (!row || typeof row !== "object") return null;
  return { document: row.document, revision: Number(row.revision), createdAt: row.created_at, updatedAt: row.updated_at };
}
const firstRow = result => (Array.isArray(result) ? result[0] : result) ?? null;

export function createWallPersistence({ rpc }) {
  if (typeof rpc !== "function") throw new TypeError("createWallPersistence requires an rpc(name, body) function");
  const call = async (name, body) => {
    try { return firstRow(await rpc(name, body)); } catch (error) { throw toPersistenceError(error); }
  };
  return {
    // Creates the owner's draft (the W1 createDocument() default) if none exists, and returns it. Idempotent.
    ensureDraft: async () => toDraftRecord(await call("ensure_my_wall_draft", {})),
    // The owner's draft, or null when none has been created yet.
    loadDraft: async () => toDraftRecord(await call("get_my_wall_draft", {})),
    // Saves `document` against the revision it was loaded at. The document is checked with the real W1 validator first so an obviously bad document never
    // leaves the client, but the database is the authority and re-validates. Rejects; never sanitizes.
    saveDraft: async (document, expectedRevision) => {
      const local = validateDocument(document);
      if (!local.valid) throw new WallPersistenceError("INVALID_WALL_DOCUMENT", { errors: local.errors });
      return toDraftRecord(await call("save_my_wall_draft", { candidate_document: document, candidate_expected_revision: expectedRevision }));
    },
    // ---- publishing (owner-only) ----
    // Which saved draft revision visitors currently see, or null when the Wall is not published.
    loadPublication: async () => toPublicationRecord(await call("get_my_wall_publication", {})),
    // Publishes the saved draft at `expectedRevision` (the one the owner is looking at); a newer saved revision is refused (WALL_REVISION_CONFLICT).
    publish: async expectedRevision => toPublicationRecord(await call("publish_my_wall", { candidate_expected_revision: expectedRevision })),
    // Visitors see the Public Profile again; the draft is untouched. -> whether a published Wall existed
    unpublish: async () => (await call("unpublish_my_wall", {})) === true,
  };
}

// { draftRevision, publishedAt } | null
export function toPublicationRecord(row) {
  if (!row || typeof row !== "object" || row.draft_revision == null) return null;
  return { draftRevision: Number(row.draft_revision), publishedAt: row.published_at ?? null };
}

// What the owner is told about publishing: never published, the saved draft IS what visitors see, or the draft (saved or not) differs from it.
// -> "unpublished" | "published" | "changes"
export function publicationState(publication, { revision, dirty }) {
  if (!publication) return "unpublished";
  return publication.draftRevision === revision && !dirty ? "published" : "changes";
}
