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
| DEC | Decisions | decisions/ | DEC-0006 |
| IDEA | Ideas | ideas/ | IDEA-0002 |
| ISS | Issues | issues/ | ISS-0014 |
| REV | Reviews | reviews/ | REV-0019 |

## Register

2026-10-20: Mazen explicitly accepted the desktop Wall Editor theme consistency pass (Layers, Assets, Templates, Properties and Stages confirmation; TESTING run 39412009748). REV-0019 records scoped acceptance; GamID Truth unchanged (cosmetic only).

2026-10-20: Mazen explicitly confirmed the global responsive Stages bar and append-only Add Stage work correctly on TESTING and granted final acceptance. REV-0018 records his acceptance; GamID Truth wall-editor-stages-bar ACCEPTED. Product 60ca21c, TESTING run 39382427651. No Production release.

2026-10-20: Mazen gave final TESTING acceptance of Favorite Games Display Style after confirming Save/Reload and Preview; REV-0017 upgraded to PASS. Truth my-gamer-data ACCEPTED; artwork remains TESTING-only pending provider permission.

2026-10-19: Mazen approved saving a scoped visual PASS for Favorite Games Game Covers on TESTING (product e686d7f, run 39261690232): four covers in Classic order, names shown, within the Wall element. REV-0017 records the partial review; save/reload, Preview, Refresh, visitor/privacy and final acceptance remain pending. GamID Truth unchanged.

2026-10-19: Mazen explicitly accepted desktop Background panel visual refinement (product c59a922, TESTING run 39199875542). REV-0016 records scoped acceptance; GamID Truth unchanged because no capability or contract changed. Shapes V2 database parity proposal remains unapplied.

2026-10-19: Mazen explicitly accepted full desktop Shapes V2 following aspect-lock testing and the left-panel accordion correction (TESTING run 39196387512). New REV-0015; Truth wall-shapes-v2 ACCEPTED. The prepared database parity SQL remains unapplied pending separate authorization.

2026-10-19: Mazen explicitly accepted the desktop Media & Links platform-card organization and Icon Group Properties accordions on TESTING (product 0615a4c, run 39153509185). New REV-0014. All existing controls remain; Move to Stage stays first; mobile/tablet unchanged. Truth wall-icons already ACCEPTED; no status or contract change.

2026-10-19: Mazen explicitly granted final acceptance of the full Living Fire V3 capability (Organic, Cinematic, Mythic), following the separately accepted bounding-box fix REV-0012. New REV-0013; Truth living-fire-text ACCEPTED. Existing limits, contracts and product checkpoints unchanged. Documentation only.

2026-10-19: Mazen personally tested and accepted the Living Fire bounding-box fix on TESTING (fix 24e2d78, docs 9893964, run 39150052877): the fire follows the normal text's wrapping, line breaks, alignment and selection box; the three styles keep their approved visuals. New REV-0012. The Living Fire capability (Truth living-fire-text) remains PENDING_ACCEPTANCE. No product changes.

2026-10-17: Mazen gave final acceptance of the Intro landscape hint and fullscreen behavior exactly as implemented (checkpoint 77cfe4f), superseding his provisional approval, and approved saving it. New REV-0011; Truth intro-landscape-hint ACCEPTED. Chrome's fullscreen notice remains a browser limitation. No product changes.

2026-10-17: Mazen explicitly approved saving the final Mobile Public Visitor V2 acceptance already recorded in Truth (public-profile-mobile-v2 ACCEPTED, product ace0982, TESTING 2889d3b). New scoped REV-0010; owner Mobile V2 and Intro landscape hint remain PENDING_ACCEPTANCE. No product changes.

2026-10-17: Mazen manually verified the Mobile V2 visual parity fixes (Intro thumbnail, My Games and My Crew artwork, other parity-audit corrections; product 15e204d, TESTING 4786c59) with his real account in the Android Emulator, confirmed all are correct, and approved saving. New scoped REV-0009; overall Mobile V2 (Truth your-gamid-editor-mobile) remains PENDING_ACCEPTANCE. IDEA-0001 and REV-0004 (Desktop) are unchanged.

2026-10-16: Mazen explicitly confirmed personal manual TESTING testing and final approval of Canonical Game Catalog/manual games, current provisional SteamGridDB artwork and the current root Landing Page. New scoped REV-0008 records all three (no existing acceptance review covers them as a whole); prior reviews remain unchanged. Artwork restrictions/provisional designation preserved; no PENDING_ACCEPTANCE capabilities remain in the resulting Truth snapshot.

2026-10-16: REV-0001 items 5 and 6 reconciled with Mazen's explicit STEAM & LEAGUE FINAL ACCEPTANCE and save authorization: Steam real library discovery/My Games manually accepted; League accepted only as the existing private unverified unofficial prototype, with no claimed real-account manual test or official Riot integration. Existing review reused; ID counters unchanged.

2026-10-16: Mazen explicitly accepted the latest My Crew design/functionality on TESTING c81ad33 and authorized saving the approved proposal. Existing IDEA-0001 updated with the Crew rationale, current implementation/deployment checkpoints and final acceptance; original Desktop acceptance/history retained. No new records or IDs.

2026-10-15: REV-0001 item 4 now records Mazen's final Public GamID Profile PASS and ACCEPTED; no further manual testing required for that acceptance. Existing review reused; ID counters unchanged.

2026-10-15: Mazen authorized updates to existing IDEA-0001 (accepted Desktop design and rationale) and REV-0004 (final manual PASS on deployed 1ec1da3); no new IDs or duplicate records. Earlier review and deferral history remains in those records.

| ID | Title | Status | Record |
|---|---|---|---|
| DEC-0001 | Implement the approved Profile Editor notes (My Socials, Save All Changes, Account Settings menu) | IMPLEMENTED | [DEC-0001-implement-profile-editor-notes.md](decisions/DEC-0001-implement-profile-editor-notes.md) |
| DEC-0002 | One social link engine for the Wall and My Socials (Discord personal profiles) | ACCEPTED | [DEC-0002-one-social-link-engine.md](decisions/DEC-0002-one-social-link-engine.md) |
| DEC-0003 | Enable / Disable My Wall without unpublishing | ACCEPTED | [DEC-0003-enable-disable-my-wall.md](decisions/DEC-0003-enable-disable-my-wall.md) |
| DEC-0004 | Discord Profile Card in My Socials from the existing Discord connection | ACCEPTED | [DEC-0004-discord-profile-card.md](decisions/DEC-0004-discord-profile-card.md) |
| DEC-0005 | Classic Profile desktop redesign (Banner, About Me, desktop layout) | ACCEPTED | [DEC-0005-classic-profile-desktop-redesign.md](decisions/DEC-0005-classic-profile-desktop-redesign.md) |
| DEC-0006 | Wall Icon Display Option & Icon Group | ACCEPTED | [DEC-0006-wall-icon-display-option-and-icon-group.md](decisions/DEC-0006-wall-icon-display-option-and-icon-group.md) |
| IDEA-0001 | Profile Editor gaming-dashboard redesign | ACCEPTED | [IDEA-0001-profile-editor-dashboard-redesign.md](ideas/IDEA-0001-profile-editor-dashboard-redesign.md) |
| IDEA-0002 | Monitor permanent coverage growth and gap detection | DISCUSSION | [IDEA-0002-monitor-coverage-growth.md](ideas/IDEA-0002-monitor-coverage-growth.md) |
| ISS-0001 | Unified Upload & Add Error UX | FIXED | [ISS-0001-unified-upload-add-error-ux.md](issues/ISS-0001-unified-upload-add-error-ux.md) |
| ISS-0002 | Wall video limit text says 10 instead of the authoritative 15 | FIXED | [ISS-0002-wall-video-limit-text-stale.md](issues/ISS-0002-wall-video-limit-text-stale.md) |
| ISS-0003 | Wall storage quota error incorrectly suggests retry | FIXED | [ISS-0003-wall-quota-error-suggests-retry.md](issues/ISS-0003-wall-quota-error-suggests-retry.md) |
| ISS-0004 | Intro upload messages reference the removed SAVE GAMID button | FIXED | [ISS-0004-intro-messages-reference-save-gamid.md](issues/ISS-0004-intro-messages-reference-save-gamid.md) |
| ISS-0005 | Replacement Intro processing failure may be hidden | FIXED | [ISS-0005-replacement-intro-failure-hidden.md](issues/ISS-0005-replacement-intro-failure-hidden.md) |
| ISS-0006 | Avatar offline pre-save error mislabels authentication service | OPEN | [ISS-0006-avatar-offline-auth-message.md](issues/ISS-0006-avatar-offline-auth-message.md) |
| ISS-0007 | Avatar upload validation trusts the client-declared MIME type | FIXED | [ISS-0007-avatar-upload-trusts-declared-mime.md](issues/ISS-0007-avatar-upload-trusts-declared-mime.md) |
| ISS-0008 | Nine apparently unreferenced Avatar objects on TESTING | OPEN | [ISS-0008-unreferenced-avatar-objects.md](issues/ISS-0008-unreferenced-avatar-objects.md) |
| ISS-0009 | HIGH - anonymous visitors can mint long-lived signed Storage URLs that outlive PRIVATE / detach / unpublish | VERIFIED | [ISS-0009-anonymous-signed-urls-outlive-visibility.md](issues/ISS-0009-anonymous-signed-urls-outlive-visibility.md) |
| ISS-0010 | Intro Preview Skip shows an older-looking DRAFT · PRIVATE profile instead of the current Wall / Classic Profile | VERIFIED | [ISS-0010-intro-skip-shows-old-draft-preview.md](issues/ISS-0010-intro-skip-shows-old-draft-preview.md) |
| ISS-0011 | Failed and removed Intro files and abandoned upload reservations were not released | VERIFIED | [ISS-0011-intro-storage-and-reservations-not-released.md](issues/ISS-0011-intro-storage-and-reservations-not-released.md) |
| ISS-0012 | Intro sources over 50 MiB cannot be uploaded although the editor, the bucket and Truth allow 150 MiB | VERIFIED | [ISS-0012-intro-upload-limit-mismatch.md](issues/ISS-0012-intro-upload-limit-mismatch.md) |

| DIS-0001 | Existing platform picker and Other link in Wall | CONCLUDED | [DIS-0001-existing-platform-picker-and-other-link.md](discussions/DIS-0001-existing-platform-picker-and-other-link.md) |
| DIS-0002 | GamID full-list navigation and next-chat continuity | CONCLUDED | [DIS-0002-gamid-full-list-continuity.md](discussions/DIS-0002-gamid-full-list-continuity.md) |
| DIS-0003 | Profile Editor visual and social settings notes | CONCLUDED | [DIS-0003-profile-editor-visual-social-notes.md](discussions/DIS-0003-profile-editor-visual-social-notes.md) |
| REV-0001 | Mazen manual acceptance checklist items 1 through 6 | COMPLETED | [REV-0001-manual-acceptance-checklist.md](reviews/REV-0001-manual-acceptance-checklist.md) |
| REV-0002 | CP-01 My Crews panel sizing - Mazen manual acceptance | COMPLETED | [REV-0002-cp01-my-crews-panel-sizing-acceptance.md](reviews/REV-0002-cp01-my-crews-panel-sizing-acceptance.md) |
| REV-0003 | GR-01 Role Suggestions review inside Gaming Roles - Mazen manual acceptance | COMPLETED | [REV-0003-gr01-role-suggestions-placement-acceptance.md](reviews/REV-0003-gr01-role-suggestions-placement-acceptance.md) |
| REV-0004 | YOUR GAMID Editor - Mazen desktop acceptance (original tests and final redesign) | COMPLETED | [REV-0004-your-gamid-editor-desktop-acceptance.md](reviews/REV-0004-your-gamid-editor-desktop-acceptance.md) |
| ISS-0013 | Some My Socials icons show initials instead of logos | VERIFIED | [ISS-0013-my-socials-partial-brand-icons.md](issues/ISS-0013-my-socials-partial-brand-icons.md) |
| ISS-0014 | Desktop Classic Profile could not be scrolled by the user | VERIFIED | [ISS-0014-desktop-classic-profile-cannot-scroll.md](issues/ISS-0014-desktop-classic-profile-cannot-scroll.md) |
| REV-0005 | My Socials visitor links acceptance | COMPLETED | [REV-0005-my-socials-visitor-links-acceptance.md](reviews/REV-0005-my-socials-visitor-links-acceptance.md) |
| REV-0006 | My Socials Spotify, SoundCloud and Vimeo - Mazen acceptance | COMPLETED | [REV-0006-my-socials-spotify-soundcloud-vimeo-acceptance.md](reviews/REV-0006-my-socials-spotify-soundcloud-vimeo-acceptance.md) |
| REV-0007 | Favorite Games - Mazen final acceptance | COMPLETED | [REV-0007-favorite-games-final-acceptance.md](reviews/REV-0007-favorite-games-final-acceptance.md) |
| REV-0008 | Remaining catalog, provisional artwork and landing - Mazen final TESTING acceptance | COMPLETED | [REV-0008-remaining-features-final-acceptance.md](reviews/REV-0008-remaining-features-final-acceptance.md) |
| REV-0009 | Mobile V2 visual parity fixes - Mazen manual acceptance (Android Emulator) | COMPLETED | [REV-0009-mobile-v2-visual-fixes-acceptance.md](reviews/REV-0009-mobile-v2-visual-fixes-acceptance.md) |
| REV-0010 | Mobile Public Visitor V2 - Mazen final acceptance | COMPLETED | [REV-0010-mobile-public-visitor-v2-final-acceptance.md](reviews/REV-0010-mobile-public-visitor-v2-final-acceptance.md) |
| REV-0011 | Intro landscape hint and fullscreen behavior - Final Acceptance | COMPLETED | [REV-0011-intro-landscape-hint-final-acceptance.md](reviews/REV-0011-intro-landscape-hint-final-acceptance.md) |
| REV-0012 | Living Fire bounding box fix - Mazen acceptance | COMPLETED | [REV-0012-living-fire-bounding-box-fix-acceptance.md](reviews/REV-0012-living-fire-bounding-box-fix-acceptance.md) |
| REV-0013 | Living Fire V3 - final capability acceptance | COMPLETED | [REV-0013-living-fire-v3-final-acceptance.md](reviews/REV-0013-living-fire-v3-final-acceptance.md) |
| REV-0014 | Desktop Media & Links and Icon Group UI refinement - Mazen acceptance | COMPLETED | [REV-0014-desktop-media-links-icon-group-acceptance.md](reviews/REV-0014-desktop-media-links-icon-group-acceptance.md) |
| REV-0015 | Shapes V2 - final capability acceptance | COMPLETED | [REV-0015-shapes-v2-final-acceptance.md](reviews/REV-0015-shapes-v2-final-acceptance.md) |
| REV-0019 | My Wall desktop theme consistency — final TESTING acceptance | COMPLETED | [REV-0019-wall-editor-theme-acceptance.md](reviews/REV-0019-wall-editor-theme-acceptance.md) |
| REV-0018 | Global Stages bar and append-only stage creation — Mazen final TESTING acceptance | COMPLETED | [REV-0018-stages-bar-final-acceptance.md](reviews/REV-0018-stages-bar-final-acceptance.md) |
| REV-0017 | Favorite Games Display Style — Mazen final TESTING acceptance | COMPLETED | [REV-0017-favorite-games-cover-visual-check.md](reviews/REV-0017-favorite-games-cover-visual-check.md) |
| REV-0016 | Desktop Background panel redesign - final acceptance | COMPLETED | [REV-0016-desktop-background-final-acceptance.md](reviews/REV-0016-desktop-background-final-acceptance.md) |
