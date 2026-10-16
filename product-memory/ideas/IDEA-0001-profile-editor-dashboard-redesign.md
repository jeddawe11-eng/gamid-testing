---
id: IDEA-0001
title: Profile Editor gaming-dashboard redesign
status: ACCEPTED
created: 2026-10-09
updated: 2026-10-16
scope: Profile Editor
summary: Mazen accepted the paired-row Desktop editor and subsequently the My Crew reference design and confirmed member-selection removal, preserving drafts, contracts and unrelated mobile sections.
related: [DIS-0003, DEC-0001, REV-0004]
save_approval: Mazen 2026-10-16
authorization: Mazen explicit Desktop redesign implementation and TESTING deployment approvals, finalized single-open layout instruction 2026-10-15; explicit approved My Crew reference implementation and TESTING-only deployment authorization 2026-10-16
acceptance: Mazen 2026-10-15, manually reviewed deployed TESTING 1ec1da3c934d83b27f025c1d6b1a5a2f20225ff2 and explicitly confirmed Everything is approved; REV-0004; Mazen 2026-10-16 explicitly approved latest My Crew design and functionality deployed as c81ad33a38b101e7f77f76ce8eb5ca6a03850c36 in GAMID — FINAL MY CREW ACCEPTANCE, separately authorizing the relevant Product Memory save
checkpoints: [61de6220a37922a776cddd19771b10bdac4fde51, 1ec1da3c934d83b27f025c1d6b1a5a2f20225ff2, 446ba095578299c46f32547ac0f8bd6339e9c0ad, 0f386d379e811d14afcc043a11601d7f459bd402, c81ad33a38b101e7f77f76ce8eb5ca6a03850c36]
supersedes: []
truth_refs: [your-gamid-editor, crew-ux-navigation]
sources: [docs/PROFILE-EDITOR-UX.md, docs/PROFILE-EDITOR-PAIRED-ROWS.md, docs/MY-CREW-UX.md, PROJECT_HANDOFF.md, gamid-truth.json]
---

## Accepted design and rationale (2026-10-15)

The original deferral below was later explicitly reopened and authorized by Mazen. The four GamID-Layout-Proposal-v1 boards guide the implemented Desktop layout from 1024px. Two equal columns have paired compact summaries: Avatar / Intro; Banner / About Me; Connections / My Socials; My Games / Game Display; static Play Together / My Duo; My Wall / My Crew. Only one editing section is open, including selection among About Me's original nested editors. Opening another closes the previous disclosure automatically; returning retains the original unsaved values, Avatar crop and Intro selection. Opening/closing never saves. The selected original editor spans the full editing width below its summary row and grows vertically, moving later rows together without stretching adjacent summaries or creating a long empty peer area.

This balances row boundaries and readable full-width forms while keeping original controls, independent Save Changes, Save All, error/retry behavior, immediate actions, privacy and limits. My Duo stays above My Crew on the right, My Wall opposite Crew. Mobile below 1024px keeps its existing layout and independent disclosures.

**Alternatives rejected:** independent adaptive column stacks lost aligned boundaries; expanding long forms beside unrelated cards stretched peers or left large empty spaces. The visual proposal's earlier multi-open option (including multiple About Me editors) was superseded by Mazen's final explicit single-open instruction. Closing a disclosure must not discard its draft or save it automatically. No new controls, backend or processing services are implied by the boards.

**Implementation and evidence:** product `61de6220a37922a776cddd19771b10bdac4fde51`; TESTING source `1ec1da3c934d83b27f025c1d6b1a5a2f20225ff2`, successful workflow 38690648784; delivery checkpoint `446ba095578299c46f32547ac0f8bd6339e9c0ad`. Recorded implementation validation: 1910 tests, 1909 pass, one opt-in skip; 18 layout cases across 1024/1152/1280/1440/1920/2560; Desktop saves and media drafts at 1024/1440; full existing mobile workflow at 390; mobile 390/1023 screenshots identical to the starting checkpoint; Classic/Wall/privacy and media regressions. Post-deploy fixture reruns passed. These are prior automated results, not tests rerun during acceptance recording.

**Final acceptance:** Mazen manually reviewed the deployed Profile Editor and explicitly confirmed **Everything is approved** on 2026-10-15. The same request separately authorizes saving these updates. See REV-0004; no Android real-device or separate security-issue verification is inferred.

## Accepted My Crew reference follow-up (2026-10-16)

Mazen explicitly authorized implementing Neon My Crew Editing Dashboard.png as the visual specification: compact four-column Desktop members (4+4+4+3 for 15), aligned wider Members / narrower Crew Wall containers, Back to All Crews above and Delete Crew centered below, with Add a GamID and Remove a GamID beside Members. Existing three collapsed artwork summaries, centered remaining count, compact complete Crew selector and original single-Crew management remain.

Individual member Remove buttons are replaced by the approved owner-only selection dialog. It reuses existing authorized member/avatar data, excludes the owner and invited/inactive rows, shows selected count, disables an empty Remove Now and requires a separate explicit confirmation. Confirmed selections call the original per-member removal RPC sequentially. This avoids a new backend batch or permission. First failure stops, server state refreshes, and valid unremoved selections remain for retry without repeating successful removals; the operation is not atomic. Native modal focus/Escape and safe breakpoint dismissal do not initiate saves or removals.

The attached reference superseded the previous 1–3-column member presentation for this Crew scope. Separating Members and Crew Wall uses the editing width while keeping both aligned; the original long single stack and fewer member columns no longer match Mazen's chosen reference. Add/Invite, rename, Crew Wall/stages/publication, Delete/Leave, server limits, privacy, Save All, drafts and unrelated editor/mobile sections remain. Compact labels retain full underlying text/title and original media allowlists/fallbacks. Decorative kebab details are not turned into unsupported new actions.

**Implementation and prior evidence:** product `0f386d379e811d14afcc043a11601d7f459bd402`, TESTING source `c81ad33a38b101e7f77f76ce8eb5ca6a03850c36`, successful workflow [38855728905](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38855728905). Prior full build 1913 PASS / one opt-in SKIP / zero failures; 48 focused tests; 30 browser count/width cases; five 15-member long-name cases; final modal/breakpoint follow-ups; original editor functional 1024/1440/390 PASS. Post-deploy four 15-member and three functional cases PASS, with fourteen served files verified exact. Backend browser traffic/writes were intercepted fixtures. These are recorded implementation results, not functional tests repeated by this acceptance-recording task. Technical sources: docs/MY-CREW-UX.md and PROJECT_HANDOFF.md §67–§68.

**Final acceptance and save approval:** Mazen explicitly approved the latest My Crew design and functionality deployed on TESTING `c81ad33` in GAMID — FINAL MY CREW ACCEPTANCE on 2026-10-16. The same request explicitly authorizes saving the relevant approved Product Memory proposal. Truth `crew-ux-navigation` is ACCEPTED with implementation checkpoint `0f386d379e811d14afcc043a11601d7f459bd402` preserved. This final approval supersedes prior pending statements for that Crew scope; original Desktop acceptance and earlier history below remain intact. No new manual test checklist, physical-device result or unrelated capability acceptance is inferred.

This follow-up updates the already ACCEPTED record without a new lifecycle transition or duplicate ID. Saved with Mazen's explicit 2026-10-16 authorization.

## Context

Historical context (2026-10-09); superseded by the accepted design above.

The Profile Editor currently uses independent sections with their own save and feedback lifecycle ([Profile Editor UX](../../docs/PROFILE-EDITOR-UX.md)). Its capability `your-gamid-editor` is PENDING_ACCEPTANCE in GamID Truth. A future visual redesign was discussed.

## Proposal

Original discussion, preserved historically.

- A premium, calm gaming-dashboard appearance for the Profile Editor.
- The active section is shown expanded; the other sections appear as compact cards.

## Reasoning

The direction may raise the editor's visual quality and make long section lists easier to scan. Mazen prefers to keep the current Profile Editor UI unchanged for now and to revisit improvements gradually later. The idea is kept so it isn't lost or proposed again from scratch.

## Reopening and authorization (original deferral, superseded above)

Reopening this deferred redesign for discussion requires a new explicit decision from Mazen. Reopening or discussing it does not authorize implementation; coding requires separate explicit task authorization. Until then, the existing Profile Editor UI remains unchanged.

## Open questions

Original questions, resolved by the accepted design above.

- When to revisit it, as part of gradual later improvements.
- Whether compact cards keep each section's independent save and feedback lifecycle unchanged.
- Visual direction and scope (Profile Editor only, or other authenticated pages too).

## History

- 2026-10-09 DISCUSSION — Recorded on this date; original discussion date not verified. Redesign direction discussed.
- 2026-10-09 DEFERRED — Recorded on this date. Mazen decided to keep the existing Profile Editor UI unchanged for now; not authorized for implementation.

- 2026-10-15 DISCUSSION — Reconciled the separately authorized reopening after the original deferral; prior history preserved.
- 2026-10-15 PROPOSED — Recorded the four-board paired-row direction and its alternatives.
- 2026-10-15 APPROVED — Mazen approved the visual proposal with the final single-open behavior.
- 2026-10-15 AUTHORIZED — Recorded Mazen's explicit implementation and TESTING-only deployment authorization; distinct from memory save approval.
- 2026-10-15 IMPLEMENTED — Reconciled product 61de6220a37922a776cddd19771b10bdac4fde51, deployed 1ec1da3c934d83b27f025c1d6b1a5a2f20225ff2, prior automated evidence in §61 and REV-0004.
- 2026-10-15 ACCEPTED — Mazen manually approved the deployed Desktop editor and separately authorized Product Memory saving in GAMID — FINAL ACCEPTANCE & PRODUCT MEMORY SAVE.
