---
id: REV-0026
title: Friends Stickers V1 — Mazen final TESTING acceptance
status: COMPLETED
created: 2026-10-25
updated: 2026-10-25
scope: The whole Friends Stickers V1 system on TESTING (Wall editor and public Wall): sending, owner approval and moderation, display and attribution, dynamic size, clip links, quota, private senders and the private notice, the official Friends Stage background
summary: PASS - Mazen gave his FINAL ACCEPTANCE of the entire Friends Stickers V1 system on TESTING on 2026-10-25, with no remaining feedback or requested changes; Truth friends-stickers ACCEPTED.
related: [DEC-0011, REV-0025, ISS-0017]
save_approval: Mazen 2026-10-25
review_type: ACCEPTANCE
outcome: PASS
reviewer: Mazen (final acceptance); Claude Code (automated tests and deployment verification before it)
truth_refs: [friends-stickers, wall-stage-types, visitor-media-access, public-gamid-profile]
checkpoints: [524939cfda495abb3f90534b53914ffc634038b2, 6a7b89a9a62a23948f6c121ca11734fb36fe1796, 1aba37844405d5c66e7777d453725b308b74a1f6]
sources: [docs/FRIENDS-STICKERS-V1.md, gamid-truth.json, PROJECT_HANDOFF.md]
---

## Subject

Friends Stickers V1 as a whole, as deployed on TESTING (site `1aba378`, run `40182003937`). This is full feature acceptance, not only of the two fixes in REV-0025. It covers:
- **V1** (product `524939c`, run `40079878018`; migration `20261024100000_friends_stickers_v1`):
  - 14 free animated stickers sent to another player's Friends Stage from the editor or from that Wall;
  - owner approval, removal and moving;
  - the sender's current avatar and @username always shown;
  - an optional clip link;
  - dynamic size max(50, 100 − 5 × newer);
  - the official Friends Stage background.
- **Follow-up corrections** (product `6a7b89a`, run `40098732831`; migration `20261025100000_friends_stickers_corrections`):
  - private senders' approved stickers stay, and the avatar and @username open the sender's GamID;
  - a private GamID's `/@handle` shows the private notice;
  - 5 counted sends per player per rolling 24 hours across all recipients;
  - Discord message links accepted, Discord file links refused.
- **Clip button position** (product `1aba378`; cosmetic, REV-0025).

## Method

- **Claude Code, before acceptance (automated; not Mazen's testing):**
  - `npm test` at each checkpoint (latest: 2,205 tests, 0 failures);
  - the database tests for stickers, quota, privacy and clip rules;
  - lab browser suites: editor 59/59 and visitor 46/46 at 6a7b89a and 1aba378;
  - non-regression suites;
  - each migration rehearsed in a rolled-back transaction before it was applied to TESTING.
- **TESTING deployment verification (Claude Code):** each site run succeeded; the changed files were byte-identical live; anonymous live smoke passed (stickers 9/9). Details: PROJECT_HANDOFF.md sections 124–126.
- **Mazen:** explicit FINAL ACCEPTANCE of the entire system on TESTING on 2026-10-25, with no remaining feedback or requested changes. His message names no devices, browsers or scenarios, so none are claimed beyond it. The checklists he was given are in sections 124–126.

## Results

- Friends Stickers V1 is ACCEPTED (Mazen, 2026-10-25). GamID Truth `friends-stickers` is ACCEPTED.
- Its limits, contracts and product checkpoint `6a7b89a` are unchanged. The V1 choices left for his review (who may send; the 384 px files) are accepted as implemented.
- The amendments it made to `visitor-media-access`, `public-gamid-profile` and `wall-stage-types` stand as recorded there. Those capabilities' own statuses are unchanged.
- DEC-0011 gained "Acceptance (2026-10-25)".

## Follow-up

Not built and not accepted:
- sticker expiry, Delete All Stickers and per-friend allowances;
- Writing Stickers;
- the official background catalog and Premium backgrounds;
- Premium, Pro (including 10 stickers per 24 hours), Boost, paid stickers and any subscription;
- clip embedding.

Each needs Mazen's separate authorization. No branch was merged and Production was not touched.

## History

- 2026-10-25 COMPLETED — Mazen's FINAL ACCEPTANCE of Friends Stickers V1 on TESTING; he authorized saving it.
