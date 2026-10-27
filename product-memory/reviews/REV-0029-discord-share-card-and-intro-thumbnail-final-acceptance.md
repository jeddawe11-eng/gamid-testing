---
id: REV-0029
title: Discord Share Card and Intro Discord Thumbnail — Mazen final TESTING acceptance
status: COMPLETED
created: 2026-10-27
updated: 2026-10-27
scope: The Discord Components V2 share card on public /@<handle> links (Version A, B1 dividers) and the owner's Intro Discord Thumbnail frame selection in the Classic Editor, on TESTING
summary: PASS - Mazen gave his FINAL ACCEPTANCE of the Discord Share Card (B1) and the Intro Discord Thumbnail selection from the Classic Editor on TESTING on 2026-10-27; Truth discord-share-card and intro-discord-thumbnail ACCEPTED. Production not released (no Production environment exists).
related: [REV-0028, DEC-0004, DEC-0012]
save_approval: Mazen 2026-10-27
review_type: ACCEPTANCE
outcome: PASS
reviewer: Mazen (final acceptance on TESTING); Claude Code (automated tests, end-to-end checks and deployment verification before it)
truth_refs: [discord-share-card, intro-discord-thumbnail]
checkpoints: [8306d90b6c69c3c99511bbd84efebdc583bad101, 7507d1243e2465257cb4d6227e503379f9be2d0c, b110f07bf12d67160a6029e27897eb8bb2972f7e, 02c98c5d10cc6bfd47af0eaee05eb37a5a95fca9, ee08a4ac89f6b8816c5ccfdf3210df85108af5d9]
sources: [docs/DISCORD-SHARE-CARD.md, docs/INTRO-DISCORD-THUMBNAIL.md, gamid-truth.json, PROJECT_HANDOFF.md]
---

## Subject

Two features on `feature/discord-share-card-v2` (not merged).

- **The Discord Share Card.**
  - When a `/@<handle>` link is posted in Discord, the page carries a Components V2 card built from public data only: name, handle, roles, Location, avatar tile, Banner, Intro and an Open GamID button.
  - Its design is the Share Card lab design, styled as Version A, with B1 dividers (static purple lines).
  - Commits: first version `8306d90`, Version A `7507d12`, B1 `b110f07`.
- **The Intro Discord Thumbnail.**
  - In the Classic Editor, the owner chooses the Intro frame Discord previews.
  - A thumbnail-first share copy (`/@<handle>/intro-discord.webm?v=<digest>`) is prepared, and the card uses it once it is ready; otherwise it falls back to `/@<handle>/intro.webm`.
  - Product `02c98c5`, with migration `20261026120000`.
  - On TESTING through `ee08a4a` (run `40358104036`). Mazen deployed the worker image and dispatcher.

## Method

- **Claude Code** (before the acceptance; not Mazen's testing):
  - automated tests;
  - an end-to-end check of the thumbnail on the synthetic GM-TEST-01 fixture;
  - Discord previews posted in Mazen's #clips-test with his own session; no message was edited or deleted.
  - Details: `PROJECT_HANDOFF.md` §133–§137.
- **Mazen:** he reviewed both features on TESTING and gave his FINAL ACCEPTANCE on 2026-10-27 (§138). His acceptance names no further devices or scenarios, so none are claimed beyond it.

## Results

- **ACCEPTED** (Mazen, 2026-10-27): GamID Truth `discord-share-card` (B1) and `intro-discord-thumbnail`.
- **Production:** the release was authorized the same day but not performed. No GamID Production environment exists, and creating one was not authorized (§139). Production stays NOT_RELEASED.

## Follow-up

None required for the accepted scope. Recorded limitations, unchanged:
- **Cloudflare terms:** whether Cloudflare's CDN video terms cover the Intro video stream is still open (REV-0028).
- **Discord preview cache:** Discord caches a preview per URL, so a later change may only show when the link is posted again.
- **Not tested by Claude Code:** the Discord desktop app and phone app.
- **Gender:** not shown, because GamID has no such field.

Production needs Mazen's separate decision.

## History

- 2026-10-27 COMPLETED — Mazen's FINAL ACCEPTANCE of the Discord Share Card and the Intro Discord Thumbnail on TESTING. He approved saving this record; it was proposed under a later number and saved under the next free ID (see INDEX.md, 2026-10-27).
