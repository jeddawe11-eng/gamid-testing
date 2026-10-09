# GamID Project State

**Entry point for any new session or agent**: Claude, ChatGPT / Work, or any other.

This file is an index and a continuation pointer. It is **not** an authoritative source. Every fact here points to the source that owns it, and **that source wins** whenever the two disagree.

Last reviewed: 2026-10-10.

## 1. Mandatory entry order

1. **Read this file.**
2. **Read GamID Truth:** [`gamid-truth.json`](gamid-truth.json).
3. **Read the agent rules:** [`AGENTS.md`](AGENTS.md).
4. **Read the specialist source for the task** (section 3).
5. **Read the Product Memory index** [`product-memory/INDEX.md`](product-memory/INDEX.md), then only the relevant records.
6. **Verify the current Git and checkpoint state** yourself. The SHAs below are a snapshot and may be stale.
7. **Perform the task.**
8. **Update the authoritative sources** the task changes, such as Truth (per `AGENTS.md`), docs, or Monitor records.
9. **Propose Product Memory records** at meaningful conclusions, and save them only after Mazen's explicit approval (Review Before Save, `AGENTS.md`).
10. **Update this file** only when the continuation state materially changes.

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
| **E. GamID Product Memory** | [`product-memory/INDEX.md`](product-memory/INDEX.md), validated by `scripts/product-memory.mjs` | Reasoning: discussions, decisions, ideas, issues and reviews. Never overrides Truth; saved only through Review Before Save. Never passed to the Monitor or Observer. |

## 4. Current product checkpoint

Snapshot from 2026-10-09; verify with `git status -sb` and `git log -1`.

- **Working tip:** `feature/play-together-notifications`, tracking its origin branch. It is **not merged** into `main`.
  - It descends from `feature/wall-video-asset-preview` (accepted video preview fix `c932781`), which descends from `feature/gamid-truth`.
- **Latest frontend product:** `5757c5fcd1be61c5058718d971aef200bb751341`, Discord Profile Card in My Socials (DEC-0004, `PROJECT_HANDOFF.md` §26) on top of Enable / Disable My Wall in the Profile Editor (DEC-0003, §25) on top of one social link engine for the Wall and My Socials with Discord personal profiles (DEC-0002, `PROJECT_HANDOFF.md` §24) on top of the Profile Editor completion (My Socials, Save All Changes, Account Settings in the ⋯ menu; Product Memory DEC-0001, `PROJECT_HANDOFF.md` §23) on top of the unified upload and Add error feedback (`d2c24b9`, ISS-0001..ISS-0005, §22), the Profile Editor independent sections and feedback lifecycle (`8ce1616`), four QA fixes (`58720da`, CSS placement `5e2664e`) and the transient field-validation save notification (`fd9c9a9`), deployed to TESTING; manual acceptance PENDING. Source: `docs/PROFILE-EDITOR-UX.md`, `PROJECT_HANDOFF.md` §20 and §22–§26, Truth `your-gamid-editor`, `my-socials`, `game-id-wall`, `wall-visibility-toggle` and `discord-profile-card`. Subsequent commits are continuation documentation only; verify Git.
  - Prior Intro worker correction `3f72eb23ef483ca29b9076715ec76ab311dcbcfe` remains deployed with READY verification complete; its separate Android duration-boundary manual retest remains PENDING (§19). Cloudflare migration remains ACCEPTED; Pages retirement remains complete.
  - F5 product 4a978ab5e35d6f9d028f1dd9cb80faf0c2b5fd59 remains **manually ACCEPTED by Mazen** (2026-10-07); its Intro delivery is unchanged.
  - F2 product 04877c20d213f0105fbdc2871146248194eaf773 remains manually ACCEPTED by Mazen (2026-10-07); its worker/derivative policy is unchanged.
  - F3 `3b9d8b1c27fb0c9b3fa6fd0c2ee682dab7618906` remains **manually ACCEPTED by Mazen**; its viewport gating is preserved (`docs/WALL-VIDEO-VIEWPORT-F3.md`).
  - F4 `2ccb0f8aeec701bd4c0e6006c36d4c628a9ec091` is **accepted as the implementation baseline by Mazen** in the F3 authorization; its URL reuse remains preserved (`docs/WALL-VIDEO-URL-REUSE-F4.md`).
  - The preceding timing fix `7cbabf08cb43ead23f178c78bfce6b4ebaa5461d` remains **ACCEPTED by Mazen**.
  - The preceding My Crew navigation fix `f2ba4a709ed28dfc2cbaca4984ce05937659a6c7` remains **ACCEPTED by Mazen**.
  - **play-together-marvel-rivals is ACCEPTED by Mazen** (2026-10-06); current status in Truth, manual acceptance record in `PROJECT_HANDOFF.md` §10.
  - **authenticated-shell is ACCEPTED by Mazen** (2026-10-06); current status in Truth, manual acceptance record in `PROJECT_HANDOFF.md` §10.
  - The preceding Play Together notifications fix `e97594c52d5d341da40fd578c63404ec3b305475` remains **ACCEPTED by Mazen**.
  - The video asset preview fix `c932781`, also ACCEPTED, is in its ancestry.
  - `main` is `da2e020928f546e6b637f38629fd673b15544c2b`, an ancestor of the tip.
- **TESTING serves `5757c5f`.**
  - Static site: workflow run `37898776747` from ref `feature/play-together-notifications` (its head was exactly `5757c5f`); the Account HTML stamp reads `5757c5f`, and the changed files were verified byte-for-byte. Source: `PROJECT_HANDOFF.md` §26.
  - Intro worker: correction checkpoint 3f72eb2 deployed with image-only update, F2 smoke and dedicated READY verification; exact build/image/execution in `docs/INTRO-DURATION-TOLERANCE.md`. Accepted F2 derivative policy remains unchanged.
  - Database: Discord Profile Card migration `20261009190000_discord_profile_card` applied once (rehearsed; existing connection rows unchanged and OFF), recorded in `PROJECT_HANDOFF.md` §26; Wall visibility migration `20261009170000_wall_public_publishing_toggle` applied once (rehearsed; existing published Walls unchanged and enabled), recorded in `PROJECT_HANDOFF.md` §25; Wall Discord-profile migration `20261009150000` and My Socials link-engine migration `20261009151000` applied once each (rehearsed, history repaired; @black's one My Socials row converted losslessly with Mazen's approval), recorded in `PROJECT_HANDOFF.md` §24; My Socials migration `20261009120000_my_socials` applied once (rehearsed in a rolled-back transaction first; history repaired), recorded in `PROJECT_HANDOFF.md` §23; accepted notifications migration remains applied; Intro duration migration also applied once, recorded in `docs/INTRO-DURATION-TOLERANCE.md`.
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

**Current stop point:** product `5757c5fcd1be61c5058718d971aef200bb751341` (Discord Profile Card in My Socials, on top of Enable / Disable My Wall and one social link engine for the Wall and My Socials with Discord personal profiles and the Profile Editor completion and the QA, save-error and upload-error fixes) is deployed and technically verified. The Discord Profile Card is ACCEPTED by Mazen (2026-10-10, §27; open requirement: a privacy policy for the Discord application). Next: Phase 1 of the Classic Profile desktop redesign (DEC-0005, APPROVED; not authorized until Mazen approves Phase 1). Mazen to test Enable / Disable My Wall, and the Discord personal profile in both the Wall and the Classic Profile. STOP for Mazen desktop/Android manual acceptance (`docs/PROFILE-EDITOR-UX.md`; handoff §20 and §22–§27); `your-gamid-editor`, `my-socials` and `wall-visibility-toggle` remain PENDING_ACCEPTANCE, DEC-0001 to DEC-0003 are IMPLEMENTED, DEC-0004 is ACCEPTED, DEC-0005 is APPROVED, and ISS-0001..ISS-0005 remain FIXED, not VERIFIED. The prior Intro Android duration-boundary retest is separately pending (§19); do not repeat its worker/migration/fixtures. No other task is authorized.

**Product Memory V1** (governance, structure, templates and validation) is committed on the working tip and awaits Mazen's acceptance. Saved records and their statuses are listed only in the Register of [`product-memory/INDEX.md`](product-memory/INDEX.md); rules are in `AGENTS.md` → Product Memory.

**Previously outstanding continuation (not performed in F2/F3/F4):**
1. **Remaining manual acceptance checks for global-usage.** Core accounting PASS; remaining checks are listed in `PROJECT_HANDOFF.md` §10. This capability remains PENDING_ACCEPTANCE in Truth.
2. **Then the landing decision** for `main` (below).

- **Why landing needs a decision:** `main` (`da2e020`) is behind the working tip. A fast-forward would be clean in Git, but would also land work that Truth still marks PENDING_ACCEPTANCE:
  - `global-usage`.

  It would also land the unmerged GamID Truth docs and My Crew, which is accepted but not yet on `main`.
- **Options for Mazen:**
  - accept or defer global-usage, then decide whether to fast-forward `main` to the tip;
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
