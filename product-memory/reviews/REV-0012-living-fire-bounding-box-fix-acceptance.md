---
id: REV-0012
title: Living Fire bounding box fix - Mazen acceptance
status: COMPLETED
created: 2026-10-19
updated: 2026-10-19
scope: Living Fire V3 text effect - letters laid out like the painted text so they match the selection box (fix 24e2d78, TESTING run 39150052877)
summary: Mazen personally tested and accepted the Living Fire bounding-box fix on TESTING; this accepts the fix only, and the Living Fire capability itself stays PENDING_ACCEPTANCE.
related: []
save_approval: Mazen 2026-10-19
review_type: ACCEPTANCE
outcome: PASS
reviewer: Mazen
truth_refs: [living-fire-text]
checkpoints: [24e2d78a35cd5e2605014da700ebd568de85e8b7, 9893964b9c7f64ac3262acc82ac42a2a268e04d2]
sources: [docs/WALL-EDITOR-TEXT-EFFECTS.md, PROJECT_HANDOFF.md, gamid-truth.json]
---

## Subject

The bounding-box bug in Living Fire. The fire letters rendered much wider than the blue selection box, while normal text stayed inside it.

- **Fix:** commit `24e2d78a35cd5e2605014da700ebd568de85e8b7`, documented in `9893964`.
- **TESTING delivery:** run `39150052877`.

## Method

- **Root cause:** Living Fire always drew the whole text on one line at full size, ignoring the box width, while the painted text wraps at it.
- **Fix:** the fire letters now use the painted text's own line breaks, alignment and line boxes, and the V3 frame is pinned to the text box. The V3 shader, its tuning and the three styles are unchanged.
- **Agent validation:**
  - box-relative measurements in the editor, Preview and the visitor view;
  - editor walk-throughs (14 / 14 bounding box, 18 / 18 Living Fire);
  - 2002 tests;
  - 59 screen states pixel-identical, phone panels included.

  Details are in `docs/WALL-EDITOR-TEXT-EFFECTS.md` ("Bounding box fix") and handoff §87.
- **Mazen:** he personally tested the fix on TESTING.

## Results

PASS. Mazen explicitly accepted the fix on 2026-10-19. Accepted behaviour:
- Living Fire follows the same text wrapping and line breaks as normal text.
- Letter placement matches the selection box and the alignment.
- Moving, resizing and rotation work correctly.
- Organic, Cinematic and Mythic keep their approved visuals.
- Editor, Preview and published Wall rendering stay consistent.
- Normal text, Neon and the mobile UI are unchanged.

## Follow-up

Final acceptance of the Living Fire capability itself (Truth `living-fire-text`, PENDING_ACCEPTANCE since `5c0371f`) is still Mazen's to give. No code, database or deployment change is authorized by this record.

## History

- 2026-10-19 COMPLETED — Mazen personally tested and accepted the Living Fire bounding-box fix on TESTING, and authorized recording it.
