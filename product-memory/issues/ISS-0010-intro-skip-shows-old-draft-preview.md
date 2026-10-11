---
id: ISS-0010
title: Intro Preview Skip shows an older-looking DRAFT · PRIVATE profile instead of the current Wall / Classic Profile
status: VERIFIED
created: 2026-10-11
updated: 2026-10-11
scope: Profile Editor Intro Preview (/account/) and its end-of-Intro destination; comparison with the public visitor Intro on /@<handle>
summary: The editor's Intro Preview previously revealed a stale built-in DRAFT · PRIVATE card. Fixed on TESTING so Skip and natural completion return to the existing editor; Mazen manually confirmed Skip and approved the reported results.
related: [REV-0004, DEC-0003, DEC-0005]
save_approval: Mazen 2026-10-11
kind: BUG
authorization: Mazen 2026-10-11 approved editor-preview-only fix
acceptance: Mazen 2026-10-11 confirmed Skip returns to editor on TESTING and accepted reported results including automated natural-end coverage at checkpoint 7373607
truth_refs: [your-gamid-editor, intro-identity, classic-profile-desktop, wall-visibility-toggle, public-wall-publishing]
checkpoints: [a1d2eebd5355f8c2ad9c4d7d398348fa0d167cc7, 737360748eff1b15dca938bb6f6fff2ae999660f]
sources: [dist/account/intro-preview.html, dist/account/intro-preview.js, dist/account/account.js, dist/public/public.js]
---

## Description

**Observed (Mazen, desktop, TESTING `a1d2eeb`, during REV-0004 test 15):** in the Profile Editor's Intro Preview the Intro video plays correctly. Pressing Skip takes him to an older-looking Classic Profile preview marked `DRAFT · PRIVATE`, which does not match the newer profile presentation he expects.

**Expected (to be confirmed by investigation):**
- With My Wall enabled and published, the Intro's destination reflects the current Wall presentation.
- With My Wall disabled (or unpublished), it reflects the current Classic Profile presentation.
- The same question applies when the Intro finishes naturally, not only on Skip.
- Open question: whether the editor preview and the real visitor navigation are meant to use different destinations, and if so, how the editor should label or present that.

**Editor preview vs. the visitor experience:** these are two different hosts of the same Intro frame (`dist/account/intro-preview.html`).
- In the editor it plays inside the Profile Editor's preview.
- For a visitor it plays on the public `/@<handle>` page, which then shows the visitor-facing profile (the desktop Classic Profile at 1280 px and wider, or the published, enabled Wall).
- Only the editor preview has been observed so far. The public visitor flow was not reported as wrong.

## Evidence

**Reproduction (as reported):**
1. On desktop, sign in to TESTING `/account/` with a GamID that has an Intro.
2. Open the Intro Preview in the Profile Editor and start playback; the video plays.
3. Press Skip. The preview shows an older-looking Classic Profile card with `DRAFT · PRIVATE`.
4. To check during investigation:
   - let the Intro finish without Skip;
   - repeat with My Wall enabled and published, and with it disabled;
   - compare with the same GamID on `/@<handle>` as a visitor, at 1280 px and wider and below.

**Read-only code lead (unconfirmed; not a root cause).** The public page passes `publicMode` and, when the desktop profile or a published Wall should appear, `hostReveal` to the frame (`dist/public/public.js`). The frame then hides its own profile card and reveals the host's presentation behind it. The editor's preview config (`currentPreviewConfig` in `dist/account/account.js`) appears to set neither. So at Skip or at the end, the frame shows its own built-in profile card, whose `DRAFT · PRIVATE` chip is static markup in `intro-preview.html`. That would explain an older-looking draft card. Whether this is intended (a draft preview) or a gap is exactly what needs deciding.

## Resolution

Implemented and deployed to TESTING at `7373607` (CI run `38148668016`). The editor preview now requests `hostReveal`, keeping the frame's old profile card hidden; a new preview-end host helper closes the preview through the existing Return-to-editor path after Skip or natural completion. Public visitor behavior remains unchanged. Automated regressions (6/6) and local browser checks cover both completion paths; CI passed. Mazen manually confirmed the Skip path returns to the editor and explicitly approved the reported results on 2026-10-11. Natural completion is supported by automated and local browser tests, not separately confirmed by Mazen in this chat. No further manual test is required for this accepted result unless Mazen requests one.

## History

- 2026-10-11 OPEN — Mazen reported it during the desktop editor acceptance (REV-0004); recorded for investigation, root cause not confirmed.

- 2026-10-11 AUTHORIZED — Mazen approved editor-preview-only return to editor for Skip and natural completion.
- 2026-10-11 FIXED — Commit 7373607 deployed to TESTING; regression and browser tests passed.
- 2026-10-11 VERIFIED — Mazen confirmed Skip returned to the editor and explicitly accepted the reported results, including the tested natural-completion behavior.

