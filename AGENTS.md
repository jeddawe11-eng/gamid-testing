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

`product-memory/` is **GamID Product Memory**: the reasoning behind the product (discussions, decisions, ideas, issues, reviews), navigated through its single index, `product-memory/INDEX.md`. It never overrides GamID Truth.

## Workflow

**Entry order, before substantial GamID work:**
1. `PROJECT_STATE.md`;
2. `gamid-truth.json`;
3. `AGENTS.md` (this file);
4. the relevant authoritative technical documentation (`PROJECT_HANDOFF.md`, `docs/`) for the task;
5. `product-memory/INDEX.md`;
6. the memory records relevant to the task, not every historical record;
7. verification of the current Git, checkpoint and implementation state yourself, rather than trusting recorded SHAs.

Conversation memory is not an authoritative project source, and agents can't read each other's conversations.

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

   It also states exactly one of:
   - `Product Memory: SAVED`, followed by the record IDs Mazen approved;
   - `Product Memory: PROPOSED`, with the proposals awaiting his approval;
   - `Product Memory: NO CANDIDATES`.
7. Update `PROJECT_STATE.md` only when the continuation state materially changes, such as the next task, the current checkpoint pointer, test data or a standing decision. Never put bugs, findings, evidence, changelog entries or secrets there.

## Never put these in GamID Truth

- known bugs or hidden bug lists;
- Monitor findings or test results;
- suspected problems;
- credentials, tokens or any other secret;
- temporary debugging state.

GamID Truth describes product state and approved contracts only, so that independent testing stays blind. Bugs and improvements that should be remembered go to Product Memory issues (`ISS-####`) instead. The Monitor and its AI Observer read only `gamid-truth.json`: never pass Product Memory to them.

## Product Memory

The format, statuses, transitions and the Register are in `product-memory/INDEX.md`; validation is `node scripts/product-memory.mjs` (it also runs in `npm test`).

**Review Before Save (mandatory, chosen by Mazen).** Recognize meaningful product ideas, decisions, issues and reviews yourself; Mazen should not have to ask. Then:
1. Don't interrupt ordinary discussion repeatedly. Wait for a meaningful conclusion: a decision point, or the end of the task.
2. Check for existing or duplicate records, and note the related ones.
3. Prepare a concise proposed record, or update, in the template's format.
4. Show it to Mazen.
5. Wait for his explicit approval.
6. If he asks for corrections, revise the proposal and show it again.
7. Only then create or update the record, and update `INDEX.md` in the same commit. Set `save_approval: Mazen YYYY-MM-DD`.
8. Never treat silence, ambiguity, or an approval of something else as permission.

This approval applies to Product Memory records only. It never delays the Truth or technical-documentation updates that an explicitly authorized task requires under the rules above.

**Approvals are separate.** Approving a record for saving is not approving its idea. Approving an idea or decision is not implementation authorization: only an explicit task authorization from Mazen permits coding, and the record names it in `authorization`. Implementation is not acceptance: ACCEPTED (and issue VERIFIED) needs evidence, and Mazen's approval where applicable. Never implement an idea from Product Memory as a side effect of another task.

**Lifecycle.**
- At the start of a task: follow the entry order and discover the relevant records (`node scripts/product-memory.mjs list --related <ID>` / `--status` / `--prefix`).
- During the task: track candidate memory updates; don't write unapproved records.
- At a decision point or completion: propose them.
- After approval:
  - create or update the records;
  - update the Register;
  - keep earlier decisions through `superseded_by` / `supersedes` and History lines (records are never deleted, and IDs are never reused);
  - validate;
  - report exactly what changed.

**Authority and conflicts.** Product Memory records reasoning; it never overrides `gamid-truth.json` (current product facts), `PROJECT_STATE.md` (continuation) or `PROJECT_HANDOFF.md` / `docs/` (implementation history). When a record conflicts with them, flag it and resolve it under the Conflicts rules below; don't silently rewrite either side.

**Privacy.** Never store passwords, API keys, OAuth or session tokens, account credentials, sensitive personal information, or full conversation dumps. Keep only the minimum context needed.

**Agents and access.** Claude Code loads these rules through `CLAUDE.md`. Repository files can't make any agent read them. ChatGPT and Work need repository access, and must be directed by Mazen to start with `PROJECT_STATE.md` and follow this file. A saved record is the only way reasoning reaches another agent.

## Conflicts

When current documentation contradicts GamID Truth about a **current** authoritative product fact, flag it and reconcile it: correct the current document, or correct Truth if Truth is the stale one. Never silently follow the stale source.

Historical records describe what was true at the time. They stay as they are and are not rewritten merely because the product changed later.
