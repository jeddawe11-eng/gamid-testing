---
id: ISS-0010
title: Intro Preview Skip shows an older-looking DRAFT · PRIVATE profile instead of the current Wall / Classic Profile
status: OPEN
created: 2026-10-11
updated: 2026-10-11
scope: Profile Editor Intro Preview (/account/) and its end-of-Intro destination; comparison with the public visitor Intro on /@<handle>
summary: In the editor's Intro Preview, Skip leads to an older-looking Classic Profile card marked DRAFT · PRIVATE rather than the current Wall or Classic Profile presentation; needs investigation, root cause not confirmed.
related: [REV-0004, DEC-0003, DEC-0005]
save_approval: Mazen 2026-10-11
kind: BUG
authorization: NONE
truth_refs: [your-gamid-editor, intro-identity, classic-profile-desktop, wall-visibility-toggle, public-wall-publishing]
checkpoints: [a1d2eebd5355f8c2ad9c4d7d398348fa0d167cc7]
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

Unresolved. Needs investigation, then a product decision on the intended editor-preview destination. No fix is authorized: wait for Mazen's separate authorization.

## History

- 2026-10-11 OPEN — Mazen reported it during the desktop editor acceptance (REV-0004); recorded for investigation, root cause not confirmed.
