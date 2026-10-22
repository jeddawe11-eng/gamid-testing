---
id: ISS-0016
title: Wall editor canvas bar clipped at 900px; landscape phone keyboard sheet and selection bar
status: FIXED
created: 2026-10-22
updated: 2026-10-22
scope: Wall Editor desktop canvas toolbar and mobile landscape interactions
summary: Fixed clipped canvas controls at 900–1199px and landscape keyboard-sheet and selection-bar obstructions; corrected portrait-specific test assumptions.
related: [DEC-0010]
save_approval: Mazen 2026-10-22
kind: BUG
authorization: Mazen 2026-10-22 authorized the focused 900px toolbar and landscape regression fix on TESTING
truth_refs: [wall-editor-mobile-v2, wall-assets-background]
checkpoints: [b91e4e3]
sources: [docs/WALL-EDITOR-900-LANDSCAPE-FIXES.md, PROJECT_STATE.md]
---

## Description

At 900–1199px, the canvas toolbar clipped essential controls, including Unpublish in its widest state. On landscape phones, the keyboard sheet started too low and the selection action bar obstructed part of the Fit stage. Four previously failing landscape E2E checks also contained portrait-specific test geometry assumptions.

## Evidence

Baseline `c832c5ba751dcd1e50771d98482c3ff1d5a898ee` reproduced the toolbar overflow and the landscape sheet and selection-bar defects. Drag, resize and zoom failures were caused by test assumptions, not product failures. After fixes, the local real-editor/fake-backend browser suite passed 81/81 at each of five phone viewports; Background inside Assets 73/73; navigation 40/40; other panels 36/36; full build 2,148 tests, 0 failures, 2 existing skips. Claude reported TESTING deploy run `39709642185`, product checkpoint `b91e4e3`, and unauthenticated smoke checks. No signed-in physical-phone or iOS Safari verification was performed.

## Resolution

Toolbar now wraps while preserving accessible controls. Landscape keyboard sheet fills the available space above the keyboard. Landscape selection actions move into the left gutter so they do not block the Fit stage at tested sizes. E2E test geometry was corrected without weakening its assertions. Existing narrow portrait selection-strip horizontal scrolling and possible selection-bar overlap with a zoomed landscape stage remain known limitations, outside this task.

Status **FIXED**, not VERIFIED: Mazen approved saving the repair record but deferred manual mobile testing and final acceptance. No GamID Truth change was required because existing contracts were restored without altering product truth.

## History

- 2026-10-22 OPEN — Previously reported 900px toolbar overflow and four landscape phone E2E failures were selected for investigation.
- 2026-10-22 AUTHORIZED — Mazen authorized targeted diagnosis, real defect fixes, test corrections and TESTING deployment.
- 2026-10-22 FIXED — Claude reported deployed fixes at `b91e4e3` (run `39709642185`), with automated checks passing; manual acceptance pending. Mazen explicitly approved saving this record as FIXED without claiming final verification.
