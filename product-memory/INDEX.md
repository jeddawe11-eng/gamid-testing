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
| DEC | Decisions | decisions/ | DEC-0014 |
| IDEA | Ideas | ideas/ | IDEA-0003 |
| ISS | Issues | issues/ | ISS-0020 |
| REV | Reviews | reviews/ | REV-0033 |

## Register

2026-10-30 (DEC-0014, R2 Primary for video): Mazen approved the design direction and saving the record.
- New DEC-0014 (APPROVED): R2 is the primary store for permanent video files; the Supabase database owns metadata and quota. It replaces only DEC-0013's video-store part. DEC-0013 stays APPROVED and is not superseded by this save.
- Authorization: implementation and tests on TESTING only, limited pilot scope. They are NOT complete: phase 1 only (`ac4a2be`, handoff §150, `docs/R2-PRIMARY-MIGRATION.md`). Production is NOT authorized; nothing is accepted.
- GamID Truth unchanged.

2026-10-30 (Architecture F pilot and R2 lifecycle review): Mazen approved documenting the review in Product Memory only.
- New REV-0033 (AUDIT, PARTIAL). The GM-TEST-01 pilot passed replication, verification and delivery on TESTING. Replication and delivery are OFF, the Worker's `MEDIA_R2_DELIVERY` is off, and nothing is on Production.
- Lifecycle findings:
  - removal and replacement void the old replica in the database at once;
  - physical R2 deletion has no guaranteed run;
  - orphans and silent delete failures are possible;
  - the full upload → replace → remove cycle is untested end to end;
  - there is no restore in either direction.
- Proposals only: no decision, no fix authorized. DEC-0013 and GamID Truth are unchanged.

2026-10-28 (DEC-0013 and the quota rule for R2 replicas): Mazen approved both.
- New DEC-0013 (APPROVED, authorization NONE): Architecture F as the approved design for visitor video delivery (evidence in REV-0032).
- Approved rule for the future R2 implementation: internal R2 replicas will not count toward the user's 200 MB storage quota. Current quota enforcement is unchanged.

2026-10-28 (Media Infrastructure Architecture & Cost Optimization Review): Mazen approved saving the review.
- New REV-0032 (DESIGN, PASS): Architecture F, approved by Mazen as a design decision.
  - Supabase stays authoritative.
  - Every visitor-facing video is replicated asynchronously to private R2 when READY.
  - A Cloudflare Worker delivers the verified replica, with Supabase fallback.
- Not implemented and not authorized; not in GamID Truth.

2026-10-28 (Roll Out Public Intro Poster to All TESTING Accounts): Mazen approved both changes.
- ISS-0020 is VERIFIED.
- New REV-0031 (PASS): the public Intro poster's real-Intro visual acceptance on @black and its rollout to every TESTING account (GamID Truth public-intro-poster ACCEPTED).

2026-10-28 (final Discord fix verification): ISS-0020 is FIXED. Both fixes are deployed on TESTING, and @black's share copy, regenerated with Mazen's authorization, starts on the correct frame. VERIFIED awaits Mazen's confirmation.

2026-10-28 (Finish Intro Poster Validation & Discord Frame Bug): Mazen approved saving ISS-0020 and authorized its TESTING fix.
- New ISS-0020 (AUTHORIZED): the Intro share copy, and the poster, used the frame after the chosen one when an Intro's first frame is not at 0. The poster fix is deployed and verified; the share-copy fix (`e52de5a`) awaits the worker redeployment. Existing real-account share copies are not replaced without separate approval.

2026-10-27 (Infrastructure Optimization & Security Hardening V1): Mazen approved recording the infrastructure cost study and the two issues it found.
- New REV-0030 (PARTIAL): the measured bandwidth / caching / cost study and its V1 follow-up measurements; R2 assessed, not implemented.
- New ISS-0018 (FIXED): pg_cron's run log grew without bound; a daily 7-day retention job now bounds it on TESTING.
- New ISS-0019 (FIXED): the public Intro video routes had no rate limit or Range validation; the TESTING Worker now enforces both (GamID Truth public-media-route-protection, PENDING_ACCEPTANCE).

2026-10-27: Mazen gave his final TESTING acceptance and approved saving two records.
- New REV-0029 (PASS): the Discord Share Card (B1) and the Intro Discord Thumbnail selection from the Classic Editor. GamID Truth discord-share-card and intro-discord-thumbnail are ACCEPTED.
- New DEC-0012 (ACCEPTED): the public Intro waits for Play, with the chosen frame as a full-screen poster, a mandatory Play button, no autoplay, Skip, Replay and Wall / Classic routing. GamID Truth public-intro-manual-play is ACCEPTED.
- The Production release was authorized but not performed: no Production environment exists (PROJECT_HANDOFF.md §139).
- ID note: they were proposed as REV-0030 and DEC-0013. The validator requires consecutive IDs, and REV-0029 and DEC-0012 had only been named in unsaved proposals, so these records take them; those proposals take new IDs if saved. REV-0028 is unchanged.
2026-10-26: At Mazen's request, REV-0028 gained a dated Reconciliation note.
- The stored Intro playback derivative is capped at 1080p / 15 MiB (Truth intro-derivative-d3).
- The record's 4K / 50 MB scenario is hypothetical and does not represent the current Discord Intro delivery.
- No R2 is in use.
- Measurements, limitations and status are unchanged. GamID Truth unchanged.

2026-10-26: Mazen approved saving Claude Code's isolated-lab Discord video cache and bandwidth investigation as a review, not a decision.
- New REV-0028 (INCONCLUSIVE).
- Discord does not cache linked videos: a new preview fetches the file twice, and every play by every viewer fetches it again through Discord's media proxy.
- It records the measurements, limitations, financial assumptions and the proposed R2 + Worker 1080p share-copy architecture (recommendation only, nothing implemented or authorized), and leaves the Cloudflare terms question unresolved.
- GamID Truth unchanged; IDEA-0003 unchanged.

2026-10-25: Mazen gave his FINAL ACCEPTANCE of the current Pro Effects implementation on TESTING (site fb8708e, run 40191766463) and authorized saving it.
- Pro Effects covers Neon, Living Fire, Living Ice V5 and Living Radiation V1.
- New REV-0027 (PASS).
- GamID Truth pro-effects, living-ice-text and living-radiation-text are ACCEPTED; living-fire-text stays ACCEPTED, with its amended editor and live-budget contracts accepted alongside.
- REV-0012 and REV-0013 (Living Fire) are unchanged.

2026-10-25: Mazen gave his FINAL ACCEPTANCE of the entire Friends Stickers V1 system on TESTING (site 1aba378, run 40182003937), with no remaining feedback, and authorized saving it.
- New REV-0026 (PASS) keeps Claude Code's automated tests and deployment verification apart from his acceptance.
- DEC-0011 stays ACCEPTED and gains "Acceptance (2026-10-25)": what of its sticker direction is now implemented and accepted, and what is not (expiry, Delete All Stickers, the background catalog, Premium, Pro).
- GamID Truth friends-stickers is ACCEPTED. REV-0025 and ISS-0017 are unchanged.

2026-10-25: Mazen personally tested and accepted on TESTING 1aba378 (run 40182003937) the Notifications "Mark all as read" fix and the Friends Stickers clip (play) button position, and authorized saving both.
- New ISS-0017 (VERIFIED). In the Wall editor, the stage bar (Wall Stages V2, z-index 45) covered the Notifications panel head (also z-index 45). The panel now sits above it, and the existing bulk read only shows success after the server confirms.
- New REV-0025 (PASS) records both acceptances, separated from Claude Code's automated tests and deployment verification.
- Friends Stickers V1 as a whole stays PENDING_ACCEPTANCE. GamID Truth unchanged.
- ID note: ISS-0017 had earlier been named in an unsaved Mobile Public Wall proposal; that proposal takes a new ID if it is saved.

2026-10-23: F1–F8 documentation reconciliation (Mazen's task; documentation only). REV-0022 keeps its 2026-10-21 findings and decisions. Its summary, `related` and a dated Reconciliation note now record four things: F8-B1 was accepted after it (REV-0023, DEC-0007); the authorized F1–F8 scope is complete; F1's formal acceptance evidence was not found; F6-B, F7-B, the existing-MP4 migration and further F8-B options are deferred and not authorized. No status changed and no new record was created. REV-0023 and DEC-0007 are unchanged.

2026-10-23: Mazen accepted Wall Stages V2 on TESTING a084cb1 (run 39963845626; Wall Stages V2 from 4c97ed9 plus the Add stage at-allowance fix) after manual testing on desktop and Android: stage limit, My / Friends Stage conversion, persistence, and the owner and visitor empty Friends Stage messages. DEC-0011 is ACCEPTED for its implemented scope, and GamID Truth wall-stage-types is ACCEPTED. Friends Stickers, sticker moderation, the official background catalog, Premium and Pro (the Free 3 / Pro 5 direction) stay unimplemented and unaccepted. Mobile Public Wall Visitor V2 is not part of this acceptance.

2026-10-23: DEC-0011 is IMPLEMENTED (not accepted): Wall Stages V2 is on TESTING at 4c97ed9 (product 4be5bfc, run 39821008183) with its two migrations applied and every stored Wall unchanged; GamID Truth wall-stage-types is PENDING_ACCEPTANCE.

2026-10-23: With Mazen's explicit approval, DEC-0011 records that a Friends Stage is optional (3 stages in total: 3/0, 2/1 or 1/2 My/Friends, at least one My Stage; new stages are My Stages; only the owner's explicit action creates a Friends Stage) and that an empty Friends Stage stays visible with a display-only message (visitors: "Good friends leave their mark! ✨"; owner: "Waiting for your squad! 🎮"), gone once approved stickers are visible. No sticker system, Premium or official background catalog is implemented; the future direction stays Free 3 / Pro 5 without Pro. DEC-0011 stays AUTHORIZED until its TESTING deployment is verified.

2026-10-22: Mazen authorized implementing DEC-0011 ("GAMID - WALL STAGES V2", TESTING only) and approved its tier direction: 3 stages for everyone today; future Free 3 / Pro 5; Pro not implemented. DEC-0011 is AUTHORIZED (not IMPLEMENTED or ACCEPTED: the work is not yet committed or deployed). The Friends Stickers system, Premium and Pro stay out of scope.

2026-10-22: Mazen approved the Wall Stages design - My Stage and Friends Stage, at most 3 stages with at least one My Stage, owner-approved friends' stickers, official-catalog backgrounds on Friends Stages, and no deletion / conversion of a Friends Stage while it has active stickers - and approved saving it as DEC-0011 (APPROVED, authorization NONE). Design only: nothing implemented; sticker durations, economics and the full Friends Stickers system remain separate work. GamID Truth unchanged (it records implemented product state).
- The ISS-0016 checkpoint was written as the full SHA of the same commit (b91e4e36db47570416adf37cc4071d3b592f5eb2), with Mazen's approval, to fix validation; content unchanged.

2026-10-22: Mazen approved saving ISS-0016 as FIXED after Claude's TESTING deployment of the 900px canvas toolbar and landscape phone fixes (b91e4e3). Manual mobile acceptance remains pending; no GamID Truth change required.

2026-10-22: Mazen accepted Background inside Assets on TESTING after successfully testing the four scenarios requested of him (93a86d9), authorized the final navigation order (Assets directly above Layout; deployed at c832c5b), and approved saving DEC-0010 and REV-0024. GamID Truth wall-assets-background is ACCEPTED.

2026-10-22: With Mazen's explicit authorization, validation-only repairs; no decision, status, approval or acceptance changed:
- DEC-0008, DEC-0009 and ISS-0015 had a History that began at their final status. Their real earlier steps of 2026-10-21 are now recorded (APPROVED → AUTHORIZED → IMPLEMENTED → ACCEPTED; OPEN → AUTHORIZED → FIXED → VERIFIED), from PROJECT_HANDOFF.md §113–§115.
- ISS-0015's short checkpoint is now the full SHA.
- The DEC counter here already counted DEC-0007, which had been saved on the separate F8-B1 branch (feature/f8b1-video-renditions, d41a378) only. DEC-0007 and REV-0023, which it cites, are carried here unchanged except their short checkpoint 764e3b8, now the full SHA (d41a378 itself fails validation on that). The REV counter follows (REV-0023). No branch was merged.
- A blank line that split the Register table was removed.

2026-10-21: Mazen accepted Universal Delete UX on TESTING and approved saving DEC-0008, DEC-0009 and ISS-0015. The two deletion/silent UI capabilities are ACCEPTED in GamID Truth; the existing custom-fonts capability remains independently pending.

2026-10-21: Mazen explicitly approved saving F8-B1's accepted conditional visitor-rendition contract (DEC-0007) and final TESTING acceptance evidence (REV-0023). These document the already accepted scope; no new implementation, deployment or Production authorization. (Saved on feature/f8b1-video-renditions, d41a378.)

2026-10-21: At Mazen's request, IDEA-0003 (Discord LFG Bot, saved earlier the same day with his approval) was corrected to pass validation:
- template sections added, with the content unchanged and moved under subheadings;
- save_approval set to "Mazen 2026-10-21";
- the non-file source "conversation 2026-10-21" moved into Context;
- the Register title aligned with the record;
- the IDEA counter set to IDEA-0003.

Status stays DISCUSSION; there is no implementation authorization.

2026-10-21: Mazen approved saving Claude Code's F1–F8 final bandwidth benchmark (TESTING 5600d06 vs baseline 22cbc85) with his scoped acceptance decisions. REV-0022: F6-A, F7-A, F7-C ACCEPTED; F8-A FUNCTIONALLY ACCEPTED only (no performance guarantee, repeat-visit saving not proven, existing-MP4 migration not approved). F1–F8 not complete; Truth updated.

2026-10-21: Mazen approved saving Claude Code's measured TESTING Public Wall bandwidth baseline before F6–F8. REV-0021 records actual browser wire bytes, repeated signed-video downloads, caveats and research-only next step. No optimization implemented or accepted; GamID Truth unchanged.

2026-10-20: Mazen granted final TESTING acceptance of YOUR GAMID Mobile V2 Profile Deck. REV-0020 records this acceptance and Truth your-gamid-editor-mobile is ACCEPTED. Mobile Public Profile Visitor V2 was already ACCEPTED; Mobile Wall Editor and Mobile Wall Visitor are explicitly excluded.

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
| IDEA-0003 | GamID Discord LFG Bot as a Play Together growth channel | DISCUSSION | [IDEA-0003-gamid-discord-lfg-bot.md](ideas/IDEA-0003-gamid-discord-lfg-bot.md) |
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
| REV-0020 | YOUR GAMID Mobile V2 Profile Deck — final TESTING acceptance | COMPLETED | [REV-0020-mobile-profile-editor-final-acceptance.md](reviews/REV-0020-mobile-profile-editor-final-acceptance.md) |
| REV-0019 | My Wall desktop theme consistency — final TESTING acceptance | COMPLETED | [REV-0019-wall-editor-theme-acceptance.md](reviews/REV-0019-wall-editor-theme-acceptance.md) |
| REV-0018 | Global Stages bar and append-only stage creation — Mazen final TESTING acceptance | COMPLETED | [REV-0018-stages-bar-final-acceptance.md](reviews/REV-0018-stages-bar-final-acceptance.md) |
| REV-0017 | Favorite Games Display Style — Mazen final TESTING acceptance | COMPLETED | [REV-0017-favorite-games-cover-visual-check.md](reviews/REV-0017-favorite-games-cover-visual-check.md) |
| REV-0016 | Desktop Background panel redesign - final acceptance | COMPLETED | [REV-0016-desktop-background-final-acceptance.md](reviews/REV-0016-desktop-background-final-acceptance.md) |
| REV-0021 | Public Wall bandwidth baseline before F6–F8 | COMPLETED | [REV-0021-public-wall-bandwidth-baseline.md](reviews/REV-0021-public-wall-bandwidth-baseline.md) |
| REV-0022 | F1–F8 Final Bandwidth Benchmark | COMPLETED | [REV-0022-f1-f8-final-bandwidth-benchmark.md](reviews/REV-0022-f1-f8-final-bandwidth-benchmark.md) |
| DEC-0007 | F8-B1 conditional internal visitor renditions — quality and storage contract | ACCEPTED | [DEC-0007-f8b1-conditional-visitor-renditions.md](decisions/DEC-0007-f8b1-conditional-visitor-renditions.md) |
| REV-0023 | F8-B1 conditional video renditions — final TESTING acceptance | COMPLETED | [REV-0023-f8b1-final-testing-acceptance.md](reviews/REV-0023-f8b1-final-testing-acceptance.md) |
| DEC-0008 | Confirm every permanent Wall resource deletion | ACCEPTED | [DEC-0008-universal-permanent-delete-confirmation.md](decisions/DEC-0008-universal-permanent-delete-confirmation.md) |
| DEC-0009 | Temporary silent GamID interface | ACCEPTED | [DEC-0009-temporary-silent-ui-policy.md](decisions/DEC-0009-temporary-silent-ui-policy.md) |
| ISS-0015 | Orphan Wall media file continues counting toward storage | VERIFIED | [ISS-0015-orphan-wall-media-storage-accounting.md](issues/ISS-0015-orphan-wall-media-storage-accounting.md) |
| ISS-0016 | Wall editor canvas bar clipped at 900px; landscape phone keyboard sheet and selection bar | FIXED | [ISS-0016-wall-editor-900-landscape.md](issues/ISS-0016-wall-editor-900-landscape.md) |
| DEC-0010 | Background inside Assets — one home for uploaded Wall media and the Wall background | ACCEPTED | [DEC-0010-background-inside-assets.md](decisions/DEC-0010-background-inside-assets.md) |
| REV-0024 | Background inside Assets — final TESTING acceptance | COMPLETED | [REV-0024-background-inside-assets-final-acceptance.md](reviews/REV-0024-background-inside-assets-final-acceptance.md) |
| DEC-0011 | Wall Stages — My Stage and Friends Stage (stage types, sticker moderation, conversion rules) | ACCEPTED | [DEC-0011-wall-stages-my-stage-friends-stage.md](decisions/DEC-0011-wall-stages-my-stage-friends-stage.md) |
| ISS-0017 | Notifications "Mark all as read" covered by the Wall editor's stage bar | VERIFIED | [ISS-0017-notifications-mark-all-covered-in-wall-editor.md](issues/ISS-0017-notifications-mark-all-covered-in-wall-editor.md) |
| REV-0025 | Notifications "Mark all as read" fix and Friends Stickers clip icon position — Mazen acceptance | COMPLETED | [REV-0025-notifications-mark-all-and-sticker-clip-icon-acceptance.md](reviews/REV-0025-notifications-mark-all-and-sticker-clip-icon-acceptance.md) |
| REV-0026 | Friends Stickers V1 — Mazen final TESTING acceptance | COMPLETED | [REV-0026-friends-stickers-v1-final-acceptance.md](reviews/REV-0026-friends-stickers-v1-final-acceptance.md) |
| REV-0027 | Pro Effects (Neon, Living Fire, Living Ice V5, Living Radiation V1) — Mazen final TESTING acceptance | COMPLETED | [REV-0027-pro-effects-final-acceptance.md](reviews/REV-0027-pro-effects-final-acceptance.md) |
| REV-0028 | Discord video cache and bandwidth investigation (isolated lab) | COMPLETED | [REV-0028-discord-video-cache-bandwidth-investigation.md](reviews/REV-0028-discord-video-cache-bandwidth-investigation.md) |
| REV-0029 | Discord Share Card and Intro Discord Thumbnail — Mazen final TESTING acceptance | COMPLETED | [REV-0029-discord-share-card-and-intro-thumbnail-final-acceptance.md](reviews/REV-0029-discord-share-card-and-intro-thumbnail-final-acceptance.md) |
| DEC-0012 | Public Intro waits for Play — the visitor always decides when the Intro starts | ACCEPTED | [DEC-0012-public-intro-waits-for-play.md](decisions/DEC-0012-public-intro-waits-for-play.md) |
| REV-0030 | Infrastructure, storage, bandwidth and cost study, and its V1 follow-up measurements | COMPLETED | [REV-0030-infrastructure-cost-study.md](reviews/REV-0030-infrastructure-cost-study.md) |
| ISS-0018 | pg_cron run log (cron.job_run_details) grows without bound | FIXED | [ISS-0018-cron-run-log-unbounded-growth.md](issues/ISS-0018-cron-run-log-unbounded-growth.md) |
| ISS-0019 | Public Intro video routes had no rate limit, Range validation or HEAD short-cut (egress amplification) | FIXED | [ISS-0019-public-intro-route-abuse-rate-limits.md](issues/ISS-0019-public-intro-route-abuse-rate-limits.md) |
| ISS-0020 | Intro share copy (and poster) used the frame after the chosen one when an Intro's first frame is not at 0 | VERIFIED | [ISS-0020-share-copy-frame-after-chosen-frame.md](issues/ISS-0020-share-copy-frame-after-chosen-frame.md) |
| REV-0031 | Public Intro poster - real-Intro visual acceptance on @black, then rollout to all TESTING accounts | COMPLETED | [REV-0031-public-intro-poster-acceptance.md](reviews/REV-0031-public-intro-poster-acceptance.md) |
| DEC-0013 | Media delivery Architecture F - Supabase authoritative, visitor video replicated to private R2 when READY, Worker delivery with Supabase fallback | APPROVED | [DEC-0013-media-delivery-architecture-f-r2-replication.md](decisions/DEC-0013-media-delivery-architecture-f-r2-replication.md) |
| DEC-0014 | R2 Primary for permanent video files - private R2 is the video store, the Supabase database owns metadata and quota (replaces DEC-0013's video-store part) | APPROVED | [DEC-0014-r2-primary-for-video.md](decisions/DEC-0014-r2-primary-for-video.md) |
| REV-0032 | Media delivery architecture review - Supabase authoritative, visitor video replicated to private R2 when READY (Architecture F) | COMPLETED | [REV-0032-media-delivery-architecture-r2-replication.md](reviews/REV-0032-media-delivery-architecture-r2-replication.md) |
| REV-0033 | Architecture F TESTING pilot (GM-TEST-01) and the Supabase / R2 file-lifecycle review | COMPLETED | [REV-0033-architecture-f-pilot-and-r2-lifecycle-review.md](reviews/REV-0033-architecture-f-pilot-and-r2-lifecycle-review.md) |
