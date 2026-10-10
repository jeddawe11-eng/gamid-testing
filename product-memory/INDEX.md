# GamID Product Memory — Index

The single navigation index for GamID Product Memory. Every agent (Claude Code, ChatGPT, Work, others) uses this one index; there are no per-agent indexes.

Product Memory keeps the **reasoning** behind GamID: discussions, decisions and their alternatives, ideas, issues and improvements, and reviews and acceptance outcomes, linked to each other and to implementation checkpoints. It holds concise records, never chat transcripts. Agents cannot read each other's conversations; a saved record is how reasoning survives between them.

## Authority

Product Memory never overrides GamID Truth. When a record and an authoritative source disagree, flag it and follow [`AGENTS.md`](../AGENTS.md); don't silently rewrite either.

| Source | Owns |
|---|---|
| [`gamid-truth.json`](../gamid-truth.json) | Current product facts: capabilities, statuses, limits, approved contracts, checkpoints. |
| [`PROJECT_STATE.md`](../PROJECT_STATE.md) | Continuation point and operational navigation. |
| [`PROJECT_HANDOFF.md`](../PROJECT_HANDOFF.md), [`docs/`](../docs/) | Implementation history and technical handoffs. |
| [`AGENTS.md`](../AGENTS.md) | Agent operating rules, including the Product Memory process (Review Before Save). |
| `product-memory/` | Reasoning, discussions, decisions, ideas, issues and reviews. |

Issues and bugs belong here, never in GamID Truth. The Monitor and its AI Observer read only `gamid-truth.json`; never pass Product Memory to them, so independent testing stays blind.

## When to read

Entry steps 5–6 of `AGENTS.md`: read this index, then only the records relevant to the task (by scope, ID, status or relation). Don't read every historical record.

## Layout

| Folder | Prefix | Holds | Template |
|---|---|---|---|
| [`discussions/`](discussions/) | DIS | Important product discussions and where they landed | [`discussion.md`](templates/discussion.md) |
| [`decisions/`](decisions/) | DEC | Decisions, alternatives and why | [`decision.md`](templates/decision.md) |
| [`ideas/`](ideas/) | IDEA | Ideas and future feature proposals | [`idea.md`](templates/idea.md) |
| [`issues/`](issues/) | ISS | Bugs (kind BUG) and improvements (kind IMPROVEMENT) | [`issue.md`](templates/issue.md) |
| [`reviews/`](reviews/) | REV | Code, test, acceptance, design and audit reviews | [`review.md`](templates/review.md) |
| [`archive/`](archive/) | any | Closed records moved out of the active folders; they keep their ID | — |

A record is `<folder>/<ID>-<kebab-slug>.md`: a metadata block, then the sections its template defines, ending in a `## History` log.

## Statuses

| Category | Statuses | Allowed transitions |
|---|---|---|
| DEC, IDEA | DISCUSSION, PROPOSED, APPROVED, AUTHORIZED, IMPLEMENTED, ACCEPTED, DEFERRED, REJECTED, SUPERSEDED | DISCUSSION → PROPOSED / DEFERRED / REJECTED; PROPOSED → APPROVED / DISCUSSION / DEFERRED / REJECTED; APPROVED → AUTHORIZED / DEFERRED / REJECTED / SUPERSEDED; AUTHORIZED → IMPLEMENTED / APPROVED / DEFERRED / SUPERSEDED; IMPLEMENTED → ACCEPTED / AUTHORIZED / REJECTED / SUPERSEDED; ACCEPTED → SUPERSEDED; DEFERRED → DISCUSSION / PROPOSED / REJECTED / SUPERSEDED; REJECTED → DISCUSSION / SUPERSEDED |
| DIS | OPEN, CONCLUDED, SUPERSEDED | OPEN ↔ CONCLUDED; either → SUPERSEDED |
| ISS | OPEN, AUTHORIZED, FIXED, VERIFIED, DEFERRED, WONT_FIX, DUPLICATE | OPEN → AUTHORIZED / DEFERRED / WONT_FIX / DUPLICATE; AUTHORIZED → FIXED / OPEN / DEFERRED; FIXED → VERIFIED / OPEN; DEFERRED → OPEN / WONT_FIX / DUPLICATE; VERIFIED, WONT_FIX, DUPLICATE → OPEN (reopened) |
| REV | IN_PROGRESS, COMPLETED, SUPERSEDED (plus `outcome`: PASS, FAIL, PARTIAL, INCONCLUSIVE, PENDING) | IN_PROGRESS → COMPLETED / SUPERSEDED; COMPLETED → SUPERSEDED |

The machine rules (first states, archivable states, required metadata) are in [`scripts/product-memory.mjs`](../scripts/product-memory.mjs). Keep these distinct:
- Approving a record **for saving** (`save_approval`) is not approving the idea.
- APPROVED is not implementation authorization. AUTHORIZED requires `authorization` naming Mazen's explicit task authorization; only that permits coding.
- IMPLEMENTED is not ACCEPTED. ACCEPTED (and ISS VERIFIED) requires `acceptance`: the evidence, and Mazen's approval where applicable.

## Finding records

- **Everything at a glance:** the Register below (ID, title, status, file).
- **Open issues / deferred ideas / any status:** `node scripts/product-memory.mjs list --prefix ISS --status OPEN`, `… list --prefix IDEA --status DEFERRED`.
- **Related decisions and discussions:** `node scripts/product-memory.mjs list --related DEC-0001` lists every record linked to that ID in either direction (`related`, `supersedes`, `superseded_by`, `duplicate_of`, ID mentions in the text).
- **Superseded decisions:** status SUPERSEDED; `superseded_by` points to the replacement, which lists the old ID in `supersedes`. The old record stays, so the history is kept.
- **By area:** search the `scope:` and `truth_refs:` lines.

## Creating or updating a record

Only after Mazen explicitly approves the proposed record (Review Before Save, [`AGENTS.md`](../AGENTS.md)). Then, in one commit:
1. Check for an existing or duplicate record; update it rather than creating a second one.
2. New record: take the ID from `node scripts/product-memory.mjs next <PREFIX>`, copy the template, fill it in, and set `save_approval: Mazen YYYY-MM-DD`.
3. Status change: append a `## History` line, set `status` and `updated`, and keep the earlier lines. Replacing a decision: set the old one to SUPERSEDED with `superseded_by`, and list it in the new one's `supersedes`.
4. Update the Register row (and the ID counter for a new record) in this file.
5. Run `node scripts/product-memory.mjs` (also part of `npm test`).

Rules:
- IDs are never reused. Records are never deleted; a closed record may move to `archive/`, keeping its ID, and its Register link is updated.
- Never store passwords, API keys, OAuth or session tokens, account credentials, sensitive personal information (including email addresses) or conversation dumps. Store only the minimum context.
- Don't bulk-import history; older material is migrated only record by record through Review Before Save.

## ID counters

| Prefix | Category | Folder | Last issued |
|---|---|---|---|
| DIS | Discussions | discussions/ | DIS-0003 |
| DEC | Decisions | decisions/ | DEC-0005 |
| IDEA | Ideas | ideas/ | IDEA-0002 |
| ISS | Issues | issues/ | ISS-0009 |
| REV | Reviews | reviews/ | REV-0001 |

## Register

| ID | Title | Status | Record |
|---|---|---|---|
| DEC-0001 | Implement the approved Profile Editor notes (My Socials, Save All Changes, Account Settings menu) | IMPLEMENTED | [DEC-0001-implement-profile-editor-notes.md](decisions/DEC-0001-implement-profile-editor-notes.md) |
| DEC-0002 | One social link engine for the Wall and My Socials (Discord personal profiles) | IMPLEMENTED | [DEC-0002-one-social-link-engine.md](decisions/DEC-0002-one-social-link-engine.md) |
| DEC-0003 | Enable / Disable My Wall without unpublishing | IMPLEMENTED | [DEC-0003-enable-disable-my-wall.md](decisions/DEC-0003-enable-disable-my-wall.md) |
| DEC-0004 | Discord Profile Card in My Socials from the existing Discord connection | ACCEPTED | [DEC-0004-discord-profile-card.md](decisions/DEC-0004-discord-profile-card.md) |
| DEC-0005 | Classic Profile desktop redesign (Banner, About Me, desktop layout) | AUTHORIZED | [DEC-0005-classic-profile-desktop-redesign.md](decisions/DEC-0005-classic-profile-desktop-redesign.md) |
| IDEA-0001 | Profile Editor gaming-dashboard redesign | DEFERRED | [IDEA-0001-profile-editor-dashboard-redesign.md](ideas/IDEA-0001-profile-editor-dashboard-redesign.md) |
| IDEA-0002 | Monitor permanent coverage growth and gap detection | DISCUSSION | [IDEA-0002-monitor-coverage-growth.md](ideas/IDEA-0002-monitor-coverage-growth.md) |
| ISS-0001 | Unified Upload & Add Error UX | FIXED | [ISS-0001-unified-upload-add-error-ux.md](issues/ISS-0001-unified-upload-add-error-ux.md) |
| ISS-0002 | Wall video limit text says 10 instead of the authoritative 15 | FIXED | [ISS-0002-wall-video-limit-text-stale.md](issues/ISS-0002-wall-video-limit-text-stale.md) |
| ISS-0003 | Wall storage quota error incorrectly suggests retry | FIXED | [ISS-0003-wall-quota-error-suggests-retry.md](issues/ISS-0003-wall-quota-error-suggests-retry.md) |
| ISS-0004 | Intro upload messages reference the removed SAVE GAMID button | FIXED | [ISS-0004-intro-messages-reference-save-gamid.md](issues/ISS-0004-intro-messages-reference-save-gamid.md) |
| ISS-0005 | Replacement Intro processing failure may be hidden | FIXED | [ISS-0005-replacement-intro-failure-hidden.md](issues/ISS-0005-replacement-intro-failure-hidden.md) |
| ISS-0006 | Avatar offline pre-save error mislabels authentication service | OPEN | [ISS-0006-avatar-offline-auth-message.md](issues/ISS-0006-avatar-offline-auth-message.md) |
| ISS-0007 | Avatar upload validation trusts the client-declared MIME type | OPEN | [ISS-0007-avatar-upload-trusts-declared-mime.md](issues/ISS-0007-avatar-upload-trusts-declared-mime.md) |
| ISS-0008 | Nine apparently unreferenced Avatar objects on TESTING | OPEN | [ISS-0008-unreferenced-avatar-objects.md](issues/ISS-0008-unreferenced-avatar-objects.md) |
| ISS-0009 | HIGH - anonymous visitors can mint long-lived signed Storage URLs that outlive PRIVATE / detach / unpublish | FIXED | [ISS-0009-anonymous-signed-urls-outlive-visibility.md](issues/ISS-0009-anonymous-signed-urls-outlive-visibility.md) |

| DIS-0001 | Existing platform picker and Other link in Wall | CONCLUDED | [DIS-0001-existing-platform-picker-and-other-link.md](discussions/DIS-0001-existing-platform-picker-and-other-link.md) |
| DIS-0002 | GamID full-list navigation and next-chat continuity | CONCLUDED | [DIS-0002-gamid-full-list-continuity.md](discussions/DIS-0002-gamid-full-list-continuity.md) |
| DIS-0003 | Profile Editor visual and social settings notes | CONCLUDED | [DIS-0003-profile-editor-visual-social-notes.md](discussions/DIS-0003-profile-editor-visual-social-notes.md) |
| REV-0001 | Mazen manual acceptance checklist items 1 through 6 | COMPLETED | [REV-0001-manual-acceptance-checklist.md](reviews/REV-0001-manual-acceptance-checklist.md) |
