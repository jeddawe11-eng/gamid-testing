# Instructions for AI agents working on GamID

These rules apply to every AI agent working on GamID: Claude, ChatGPT / Work, and any future agent.

`gamid-truth.json` is **GamID Truth**, the authoritative **current** product state. It records:
- which capabilities exist on TESTING;
- their status (ACCEPTED / PENDING_ACCEPTANCE / DEPRECATED);
- authoritative limits;
- approved product contracts;
- the checkpoint that last materially changed each capability.

`PROJECT_HANDOFF.md` and `docs/` hold detailed and historical records.

`PROJECT_STATE.md` is the **entry point** for every new session. It is an index and continuation pointer, not an authoritative source: it points to the sources that own each fact.

## Workflow

**Entry order, before substantial GamID work:** `PROJECT_STATE.md` → `gamid-truth.json` → the task-specific authoritative sources it lists. Then verify the current Git and checkpoint state yourself rather than trusting recorded SHAs. Conversation memory is not an authoritative project source.

**Before substantial GamID work:**
1. Read `gamid-truth.json`.
2. Treat it as the authoritative source of current product state.
3. Reconcile the task's assumptions against it before implementing. If the task or a document contradicts it, say so. Don't silently pick one.

**During and after the task:**

4. If the work changes product truth, update `gamid-truth.json` **in the same task**. An update is required when the work changes:
   - capability existence or removal;
   - a capability's status;
   - an authoritative limit;
   - an approved product contract;
   - the current product state or checkpoint that Truth records.

   An update is **not** required merely for:
   - ordinary bug fixes that don't change product truth;
   - refactors;
   - cosmetic changes;
   - tests;
   - temporary debugging.
5. Validate after any update: `node --test tests/gamid-truth.test.js` (it also runs in `npm test`).
6. Every substantial task's completion report states exactly one of:
   - `GamID Truth: UPDATED`, followed by exactly what changed;
   - `GamID Truth: NO CHANGE REQUIRED`.
7. Update `PROJECT_STATE.md` only when the continuation state materially changes, such as the next task, the current checkpoint pointer, test data or a standing decision. Never put bugs, findings, evidence, changelog entries or secrets there.

## Never put these in GamID Truth

- known bugs or hidden bug lists;
- Monitor findings or test results;
- suspected problems;
- credentials, tokens or any other secret;
- temporary debugging state.

GamID Truth describes product state and approved contracts only, so that independent testing stays blind.

## Conflicts

When current documentation contradicts GamID Truth about a **current** authoritative product fact, flag it and reconcile it: correct the current document, or correct Truth if Truth is the stale one. Never silently follow the stale source.

Historical records describe what was true at the time. They stay as they are and are not rewritten merely because the product changed later.
