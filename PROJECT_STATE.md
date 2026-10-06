# GamID Project State

**Entry point for any new session or agent**: Claude, ChatGPT / Work, or any other.

This file is an index and a continuation pointer. It is **not** an authoritative source. Every fact here points to the source that owns it, and **that source wins** whenever the two disagree.

Last reviewed: 2026-10-06.

## 1. Mandatory entry order

1. **Read this file.**
2. **Read GamID Truth:** [`gamid-truth.json`](gamid-truth.json), with its rules in [`AGENTS.md`](AGENTS.md).
3. **Read the specialist source for the task** (section 3).
4. **Verify the current Git and checkpoint state** yourself. The SHAs below are a snapshot and may be stale.
5. **Perform the task.**
6. **Update the authoritative sources** the task changes, such as Truth (per `AGENTS.md`), docs, or Monitor records.
7. **Update this file** only when the continuation state materially changes.

Conversation memory is helpful context, but it is **not** an authoritative project source.

## 2. Environment and safety

- **TESTING** is the working environment. Truth: `environment: TESTING`, `production: NOT_RELEASED`.
- **Production:** never access it without Mazen's explicit authorization.
- **Protected identities:** @black and @zshot are real accounts. Never use, reset, modify or delete them. Monitor enforces this through `protectedIdentities` in `../gamid-monitor/monitor.config.js`.
- **Test personas:** the Monitor's TESTING personas, GM-TEST-01 …, are dedicated test accounts. Don't reset or delete them either.
- **Accepted behaviour:** never change it silently.
- **Detailed rules:** [`AGENTS.md`](AGENTS.md) (Truth workflow) and [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) (status vocabulary, acceptance, what is not authorized).

## 3. Authoritative sources

| Source | Where | Owns |
|---|---|---|
| **A. GamID Truth** | [`gamid-truth.json`](gamid-truth.json), with the rules in [`AGENTS.md`](AGENTS.md) and its validation `tests/gamid-truth.test.js` | Current accepted product state: capabilities, statuses, limits, approved contracts, and the checkpoint per capability. Never bugs, findings or secrets. |
| **B. GamID product repository** | This repository, `jeddawe11-eng/gamid-testing`: `dist/`, `supabase/migrations/`, `tests/` | Implementation, migrations, tests and Git history. |
| **C. gamid-monitor** | Sibling repository `../gamid-monitor` (`jeddawe11-eng/gamid-monitor`). Its records live in `../gamid-monitor/monitor-data/`, which is **git-ignored, local to this machine**. | Testing and inspection: runs, deterministic GM findings, issue lifecycle, coverage, and AI Observer (AO) records. |
| **D. Specialist docs** | GamID: [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) and [`docs/`](docs/). Monitor: `../gamid-monitor/README.md`, `../gamid-monitor/docs/` (e.g. `ARCHITECTURE.md`, `V3-OBSERVER-P1.md`) and `../gamid-monitor/acceptance/v2/FREEZE.md` | Task-specific design, history and acceptance records. |

## 4. Current product checkpoint

Snapshot from 2026-10-06; verify with `git status -sb` and `git log -1`.

- **Working tip:** `feature/play-together-notifications`, tracking its origin branch. It is **not merged** into `main`.
  - It descends from `feature/wall-video-asset-preview` (accepted video preview fix `c932781`), which descends from `feature/gamid-truth`.
- **Latest product commit:** `f2ba4a709ed28dfc2cbaca4984ce05937659a6c7`, the My Crew Account navigation fix, **awaiting Mazen's manual acceptance** (`PROJECT_HANDOFF.md` §10). Later commits are documentation only; check with `git log --oneline f2ba4a7..HEAD`.
  - The preceding Play Together notifications fix `e97594c52d5d341da40fd578c63404ec3b305475` remains **ACCEPTED by Mazen**.
  - The video asset preview fix `c932781`, also ACCEPTED, is in its ancestry.
  - `main` is `da2e020928f546e6b637f38629fd673b15544c2b`, an ancestor of the tip.
- **TESTING serves `f2ba4a7`.**
  - Static site: deployed by workflow run `37407094550`.
  - Database: migration `20261006090000_play_together_notifications` applied and recorded.
  - Per-capability checkpoints are in Truth.

## 5. Monitor: current architecture

Verify in `../gamid-monitor` (`git status -sb`; `git rev-parse v2-freeze`).

- **V2: deterministic Monitor, FROZEN.**
  - **Version and tag:** Monitor 0.2.2.2; tag `v2-freeze` (tag object `ee21667`) points to freeze commit `a2b4a7b` (`main`).
  - **What was frozen:** the validated code `37a6360`, with record `acceptance/v2/FREEZE.md`.
  - **Its role:** PRODUCT FAILURE and GM-#### findings come only from V2 and stay deterministic.
- **V3 AI Observer: `observer-p1.2`.**
  - **Location:** branch `feature/v3-observer-gemini`, not merged; verify its HEAD with `git log -1`. The prompt is `prompts/observer-p1.2.md` (sha256 `9350dae9…`); the Observer version is `0.3.0-p1.2`.
  - **Its role:** a non-deterministic second opinion over stored evidence (AI_OBSERVATION, AO-####). Every AO needs human review.
  - **Limits:** it never alters V2 health, issues or lifecycle. Every paid call needs Mazen's authorization.
- **Action coverage pilot** (same branch, `src/v3/actions.js` / `src/v3/pilot.js`):
  - **What it does:** deterministic exploration performs one defined action and captures the resulting state for later blind observation.
  - **First pilot:** Wall Editor → Assets (`open-assets`). The architecture was validated end to end.
  - **Distinction:** ACTION COVERED (the action ran and the state was captured) is **not** the same as VISUAL CONTENT COVERED (the state contained the content worth inspecting, which depends on test data).
  - **Scope:** don't expand it into a crawler unless separately approved.

## 6. Current decisions

- No P1.3 now, and no further Observer polishing now.
- No general crawler, and no local Vision AI project, now.
- P1.2 remains an occasional second-opinion layer.
- Deterministic exploration decides which meaningful states are captured. AI inspects the resulting evidence; it does not control navigation.

## 7. Current continuation point

**Next:**
1. **My Crew navigation manual acceptance:** from Account, Open / Preview Crew Wall stays in the same tab; “← Back to Profile” returns to Account. Check the bell remains available. This small navigation change is not yet accepted.
2. **Remaining manual acceptance checks.** The checks still open for each are listed in `PROJECT_HANDOFF.md` §10. All three capabilities remain PENDING_ACCEPTANCE in Truth:
   - authenticated-shell: its earlier failure (missing Play Together notifications) is resolved;
   - global-usage: core accounting PASS;
   - play-together-marvel-rivals: Quick Match, seats and create / cancel PASS.
3. **Next product issue, which needs a separately approved fix task:** in Play Together, with Play Now selected, the Scheduled-only "Start within 3 hours" field stays visible and usable (§10).
4. **Then the landing decision** for `main` (below).

- **Why landing needs a decision:** `main` (`da2e020`) is behind the working tip. A fast-forward would be clean in Git, but would also land work that Truth still marks PENDING_ACCEPTANCE:
  - `authenticated-shell`;
  - `play-together-marvel-rivals`;
  - `global-usage`.

  It would also land the unmerged GamID Truth docs and My Crew, which is accepted but not yet on `main`.
- **Options for Mazen:**
  - accept or defer those capabilities, then fast-forward `main` to the tip;
  - keep integrating on `feature/*` branches, with TESTING deployed from the tip.
- **Until then:** don't rewrite history and don't cherry-pick accepted fixes onto `main`.

## 8. Current test data

- **GM-TEST-01** has one Wall asset, uploaded for the Assets pilot: `pink_red_crown_loop.webm`. It is in Assets only; it is not placed on the saved Wall, which is not published.
  - The acceptance run added it to the stage and undid that before any save, so the saved draft is unchanged.
- **@black and @zshot** were not used for this pilot and remain protected.
- **No credentials or secrets** are stored here or anywhere in either repository. Persona secrets live outside the repositories; see `../gamid-monitor/docs/PERSONAS.md`.

## 9. What this file must NOT become

This file must never become:
- a duplicate of GamID Truth;
- a bug database;
- a Monitor evidence store;
- a changelog;
- a conversation transcript;
- a design backlog;
- a place for secrets;
- a replacement for Git.

When it conflicts with an authoritative or specialist source, **that source wins**: fix this file to point to it. Monitor never sends this file to an AI model; the Observer's product context comes only from `gamid-truth.json`.
