// The editor's state machine, with no DOM: the current Wall Document, the selection, undo/redo, and the save lifecycle against W2 persistence. Persistence is
// injected ({ ensureDraft, loadDraft, saveDraft } - see ../wall/persistence.js), so every behavior here is unit-tested with a fake server, including the
// revision-conflict paths.
//
// Save states: loading -> saved | unsaved | saving | error | conflict | blocked
//   conflict: the server holds a newer revision than the one this editor loaded. Nothing is ever sent again until the owner CHOOSES: reload the latest
//   (discarding local edits) or explicitly overwrite with their version. A newer server revision is never silently overwritten.
import { validateDocument } from "../wall/validate.js";
import { createDocument } from "../wall/schema.js";
import { createHistory } from "./history.js";
import { expandSelection, findStage } from "./ops.js";   // ops.js registers the text type as a side effect of importing it

const snapshot = doc => JSON.stringify(doc);

const COALESCE_MS = 1000;

export function createEditorSession({ persistence, onChange = () => {}, now = () => Date.now() } = {}) {
  const history = createHistory();
  const state = {
    doc: createDocument(), stageId: "stage_1", selection: [], status: "loading", revision: null, savedJson: null,
    errorCode: null, serverRevision: null, validationErrors: [],
  };
  let saveInFlight = false;
  let lastCoalesce = { key: null, at: 0 };

  const emit = () => onChange(api);
  const setStatus = (status, extra = {}) => { state.status = status; Object.assign(state, { errorCode: null, serverRevision: null }, extra); emit(); };
  const refreshStatus = () => { if (["saved", "unsaved"].includes(state.status)) state.status = api.dirty ? "unsaved" : "saved"; };
  const keepSelectionValid = () => {
    const stage = findStage(state.doc, state.stageId);
    if (!stage) { state.stageId = state.doc.stages[0].id; state.selection = []; return; }
    const present = new Set(stage.elements.map(element => element.id));
    state.selection = state.selection.filter(id => present.has(id));
  };
  const adopt = (doc, revision) => {
    state.doc = doc; state.revision = revision; state.savedJson = snapshot(doc); state.selection = [];
    if (!findStage(doc, state.stageId)) state.stageId = doc.stages[0].id;
    history.clear();
    lastCoalesce = { key: null, at: 0 };
  };

  const api = {
    state,
    get doc() { return state.doc; },
    get dirty() { return state.savedJson !== null && snapshot(state.doc) !== state.savedJson; },
    get canUndo() { return history.canUndo; },
    get canRedo() { return history.canRedo; },
    get stage() { return findStage(state.doc, state.stageId); },
    get status() { return state.status; },

    // ---- load -------------------------------------------------------------------------------------------------------------------------------------
    async load() {
      setStatus("loading");
      try {
        const draft = await persistence.ensureDraft();
        const { valid, errors } = validateDocument(draft.document);
        if (!valid) { setStatus("blocked", { errorCode: "STORED_DOCUMENT_INVALID", validationErrors: errors }); return false; }
        adopt(draft.document, draft.revision);
        setStatus("saved");
        return true;
      } catch (error) {
        setStatus("error", { errorCode: error.code || "WALL_LOAD_FAILED" });
        return false;
      }
    },

    // ---- editing (every mutation goes through apply) -----------------------------------------------------------------------------------------------
    // `result` is an operation result from ops.js. A failed operation changes nothing and reports its errors.
    // `coalesce`: a key for continuous edits (typing, dragging a slider). Consecutive changes with the same key within a second become ONE undo step.
    apply(result, { select, coalesce = null } = {}) {
      if (!result.ok) return result;
      const merge = coalesce !== null && lastCoalesce.key === coalesce && now() - lastCoalesce.at < COALESCE_MS && history.canUndo;
      lastCoalesce = { key: coalesce, at: now() };
      if (merge ? snapshot(state.doc) !== snapshot(result.doc) : history.record(state.doc, result.doc)) {
        state.doc = result.doc;
        if (select) state.selection = [...select];
        keepSelectionValid();
        refreshStatus();
        emit();
      }
      return result;
    },
    setStage(stageId) {
      if (!findStage(state.doc, stageId)) return;
      state.stageId = stageId; state.selection = []; emit();
    },
    // Selection is not history. Selecting one member of a group selects the whole group.
    select(ids, { additive = false } = {}) {
      const stage = findStage(state.doc, state.stageId);
      const wanted = additive ? [...new Set([...state.selection, ...ids])] : ids;
      state.selection = stage ? expandSelection(stage, wanted).filter(id => stage.elements.some(element => element.id === id)) : [];
      emit();
    },
    toggle(id) {
      const stage = findStage(state.doc, state.stageId);
      if (!stage) return;
      const unit = expandSelection(stage, [id]);
      const selected = new Set(state.selection);
      const allIn = unit.every(member => selected.has(member));
      state.selection = allIn ? state.selection.filter(member => !unit.includes(member)) : [...selected, ...unit.filter(member => !selected.has(member))];
      emit();
    },
    clearSelection() { if (state.selection.length) { state.selection = []; emit(); } },

    undo() {
      const previous = history.undo(state.doc);
      if (!previous) return false;
      lastCoalesce = { key: null, at: 0 };
      state.doc = previous; keepSelectionValid(); refreshStatus(); emit();
      return true;
    },
    redo() {
      const next = history.redo(state.doc);
      if (!next) return false;
      lastCoalesce = { key: null, at: 0 };
      state.doc = next; keepSelectionValid(); refreshStatus(); emit();
      return true;
    },

    // ---- save -------------------------------------------------------------------------------------------------------------------------------------
    async save() {
      if (saveInFlight || state.status === "conflict" || state.status === "blocked" || state.status === "loading") return { ok: false, code: "SAVE_NOT_ALLOWED" };
      const sending = state.doc;
      const json = snapshot(sending);
      saveInFlight = true;
      setStatus("saving");
      try {
        const record = await persistence.saveDraft(sending, state.revision);
        state.revision = record.revision;
        state.savedJson = json;
        setStatus(api.dirty ? "unsaved" : "saved");
        return { ok: true, revision: record.revision };
      } catch (error) {
        if (error.code === "WALL_REVISION_CONFLICT") setStatus("conflict", { serverRevision: error.currentRevision ?? null });
        else setStatus("error", { errorCode: error.code || "WALL_SAVE_FAILED", validationErrors: error.errors || [] });
        return { ok: false, code: error.code || "WALL_SAVE_FAILED" };
      } finally {
        saveInFlight = false;
      }
    },
    // Conflict resolution 1: take the server's latest and drop the local edits.
    async reloadLatest() {
      try {
        const draft = await persistence.loadDraft();
        if (!draft) { setStatus("error", { errorCode: "WALL_DRAFT_NOT_FOUND" }); return false; }
        const { valid, errors } = validateDocument(draft.document);
        if (!valid) { setStatus("blocked", { errorCode: "STORED_DOCUMENT_INVALID", validationErrors: errors }); return false; }
        adopt(draft.document, draft.revision);
        setStatus("saved");
        return true;
      } catch (error) {
        setStatus("error", { errorCode: error.code || "WALL_LOAD_FAILED" });
        return false;
      }
    },
    // Conflict resolution 2 (an explicit owner decision): read the server's current revision and save the local document on top of it.
    async overwriteWithMine() {
      if (state.status !== "conflict") return { ok: false, code: "NO_CONFLICT" };
      try {
        const latest = await persistence.loadDraft();
        if (!latest) { setStatus("error", { errorCode: "WALL_DRAFT_NOT_FOUND" }); return { ok: false, code: "WALL_DRAFT_NOT_FOUND" }; }
        state.revision = latest.revision;
      } catch (error) {
        setStatus("error", { errorCode: error.code || "WALL_LOAD_FAILED" });
        return { ok: false, code: error.code || "WALL_LOAD_FAILED" };
      }
      state.status = "unsaved";
      return api.save();
    },
    // After an error the owner can try again; the document is untouched.
    retry() { if (state.status === "error") { setStatus(api.dirty ? "unsaved" : "saved"); } },
  };
  return api;
}
