# Instructions for AI agents working on GamID

**Before substantial GamID product work, read `gamid-truth.json`.** It is the authoritative current product state: which capabilities exist on TESTING, their status (ACCEPTED / PENDING_ACCEPTANCE / DEPRECATED), authoritative limits, approved product contracts, and the checkpoint that last materially changed each one. `PROJECT_HANDOFF.md` holds the detailed history.

**Update `gamid-truth.json` in the same task** when the task changes:
- whether a capability exists;
- a capability's status;
- an authoritative limit;
- an approved product contract;
- the removal or deprecation of a capability.

No update is needed for ordinary bug fixes that don't change product truth, refactors, cosmetic changes, or test-only changes.

**Never put these in `gamid-truth.json`:**
- known bugs or suspected problems;
- Monitor findings or test results;
- credentials, tokens or any secret;
- temporary debugging information.

It describes product state and approved contracts only, so that independent testing stays blind. `npm test` validates its shape (`tests/gamid-truth.test.js`).
