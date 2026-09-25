// Local editor undo/redo. This is an EDITOR concern only: it keeps in-memory snapshots of the Wall Document (documents are immutable values, so a snapshot is
// just a reference) and never talks to the database - undo/redo can never create backend revision history. Selection changes are not history.
export const HISTORY_LIMIT = 60;   // carried over from the W0 prototype (60 snapshots)

export function createHistory(limit = HISTORY_LIMIT) {
  let past = [];
  let future = [];
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  return {
    // Called with the document as it was BEFORE a meaningful change. A no-op change (identical document) is not recorded.
    record(before, after) {
      if (after !== undefined && same(before, after)) return false;
      past.push(before);
      if (past.length > limit) past.shift();
      future = [];
      return true;
    },
    undo(current) {
      if (!past.length) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      past.push(current);
      return future.pop();
    },
    clear() { past = []; future = []; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    get depth() { return past.length; },
  };
}
