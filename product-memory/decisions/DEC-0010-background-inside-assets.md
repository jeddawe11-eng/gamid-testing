---
id: DEC-0010
title: Background inside Assets — one home for uploaded Wall media and the Wall background
status: ACCEPTED
created: 2026-10-22
updated: 2026-10-22
scope: Wall Editor navigation and the Assets / Background tools, desktop, tablet and phone
summary: Assets is the single tool for uploaded Wall media and background configuration (areas My Assets and Background); the standalone Background tool is removed with every Background capability preserved; the same stored files serve both through explicit Add to Canvas / Set as Background; Assets sits directly above Layout.
related: [REV-0024, REV-0016, DEC-0008]
save_approval: Mazen 2026-10-22
authorization: Mazen 2026-10-21, task "GAMID — BACKGROUND INSIDE ASSETS" (implementation and TESTING deployment); Mazen 2026-10-22, final navigation order adjustment (Assets directly above Layout)
acceptance: Mazen 2026-10-22 manually tested the four scenarios requested of him on TESTING (93a86d9) successfully and accepted the implementation; see REV-0024
supersedes: []
truth_refs: [wall-assets-background, wall-editor-mobile-v2]
checkpoints: [a623067524cbe75a7fbf9a6b3029e2ce7653f68b, 93a86d99240945d144499e1e66e2b68ad3f9771b, c832c5ba751dcd1e50771d98482c3ff1d5a898ee]
sources: [docs/WALL-BACKGROUND-INSIDE-ASSETS.md, gamid-truth.json, PROJECT_HANDOFF.md]
---

## Context

Uploaded media lived in Assets. Backgrounds were configured in a separate Background tool that also listed and uploaded the same files, so two tools managed one library.

## Decision

- **One tool.** Assets has two areas, My Assets and Background, on desktop, tablet and phone. There is no standalone Background tool, and old openers land on Assets › Background.
- **Background is preserved.** Every existing capability is unchanged: Whole Wall / This stage only, the five types, Fit & Position, Appearance and Remove background (which never deletes a file). The accepted desktop look (REV-0016) is kept as the same rules.
- **Shared files, explicit actions.**
  - Add to Canvas creates an element.
  - Set as Background assigns the same file to the chosen scope.
  - Uploading from Background uses the same asset pipeline.
  - Deletion stays the universal confirmed flow (DEC-0008).
- **Final navigation order** (Mazen, 2026-10-22): Assets sits directly above Layout.
  - Rail: My Gamer Data, Assets, Layout, Templates.
  - Phone bar: Add, Assets, Layers, Stages, More.

## Reasoning

A single library avoids duplicate management. It also makes the difference between "place on the canvas", "use as background", "remove the assignment" and "delete the file" explicit.

## Alternatives considered

- Background as a third accordion inside one long Assets list: rejected, because it nests accordions within accordions.
- Keep both tools: rejected by Mazen's approved organization.

## History

- 2026-10-21 APPROVED — Mazen approved the Background-inside-Assets organization in his task "GAMID — BACKGROUND INSIDE ASSETS".
- 2026-10-21 AUTHORIZED — The same task authorized implementation and TESTING deployment (the final navigation order was authorized on 2026-10-22).
- 2026-10-22 IMPLEMENTED — TESTING 93a86d99240945d144499e1e66e2b68ad3f9771b (run 39699314811), then the order adjustment c832c5ba751dcd1e50771d98482c3ff1d5a898ee (run 39702253574).
- 2026-10-22 ACCEPTED — Mazen accepted after successfully testing the four requested scenarios on 93a86d9; see REV-0024.
