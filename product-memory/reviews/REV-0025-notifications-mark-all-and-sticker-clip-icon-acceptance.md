---
id: REV-0025
title: Notifications "Mark all as read" fix and Friends Stickers clip icon position — Mazen acceptance
status: COMPLETED
created: 2026-10-25
updated: 2026-10-25
scope: TESTING 1aba378 - the Notifications panel's "Mark all as read" (ISS-0017) and the Friends Stickers clip (play) button position on published Friends Stages
summary: PASS - Mazen personally tested both fixes on TESTING 1aba378 and accepted them on 2026-10-25; Friends Stickers V1 as a whole stays PENDING_ACCEPTANCE.
related: [ISS-0017, DEC-0011]
save_approval: Mazen 2026-10-25
review_type: ACCEPTANCE
outcome: PASS
reviewer: Mazen (manual TESTING acceptance); Claude Code (automated tests and deployment verification)
truth_refs: [notifications, friends-stickers]
checkpoints: [1aba37844405d5c66e7777d453725b308b74a1f6]
sources: [PROJECT_HANDOFF.md, docs/FRIENDS-STICKERS-V1.md, docs/GLOBAL_AUTHENTICATED_SHELL.md]
---

## Subject

Two fixes from Mazen's task "GAMID — Notifications & Friends Stickers UI Fix" (TESTING only), at product `1aba37844405d5c66e7777d453725b308b74a1f6`, run `40182003937`, docs `611af72`:

1. "Mark all as read" in the Notifications panel. Root cause and fix: ISS-0017.
2. The clip (play) button on Friends Stickers sat slightly too far from its sticker.
   - Its top/right inset is now `max(3%, 25% − button size)` of the square sticker box.
   - That is 8% (was 3%) from the corner while the button scales with the sticker (desktop), and unchanged at 3% at its 26 px minimum (phones), where it already touches the artwork.
   - Unchanged: the button's design and behaviour, the clip links, the sender's avatar and @username, saved positions and the sizing.

## Method

- **Claude Code (automated, before acceptance):**
  - `npm test`: 2,205 tests, 0 failures. New tests include the clip inset, and the sender caption's CSS pinned by hash.
  - Notifications database test on TESTING (rolled back): 31/31.
  - Lab browser:
    - notifications 88/88;
    - Friends Stickers editor 59/59 and visitor 46/46, clip links included;
    - a clip-position probe of the 14 stickers at 1440×900, 390×844 and 844×390: no overlap with the caption or other stickers;
    - Mobile Public Wall check 196/196.
- **Deployment verification (Claude Code):** run `40182003937` succeeded; the three changed files are byte-identical live; the live stamp is `1aba378`; live anonymous sticker smoke 9/9.
- **Mazen (manual):** he personally tested both fixes on TESTING. His acceptance does not list devices, browsers or scenarios, so none are claimed beyond it.

## Results

- **Mark all as read:** ACCEPTED by Mazen on 2026-10-25. The button is visible and works correctly. ISS-0017 is VERIFIED.
- **Clip icon position:** ACCEPTED by Mazen on 2026-10-25. The adjusted position is correct and approved.
- This acceptance covers these two fixes only. Friends Stickers V1 (Truth `friends-stickers`) remains PENDING_ACCEPTANCE (PROJECT_HANDOFF.md sections 124–125).
- GamID Truth unchanged: the accepted `notifications` behaviour was restored, and the clip position is cosmetic.

## Follow-up

None for these fixes. Unchanged and outside this review:
- the phone Wall editor has no notifications bell while editing;
- the public Wall has no notifications.

## History

- 2026-10-25 COMPLETED — Mazen personally tested both fixes on TESTING 1aba378 and accepted them; he authorized saving this record and ISS-0017.
