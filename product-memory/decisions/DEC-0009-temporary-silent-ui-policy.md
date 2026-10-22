---
id: DEC-0009
title: Temporary silent GamID interface
status: ACCEPTED
created: 2026-10-21
updated: 2026-10-22
scope: GamID-wide UI feedback and Intro audio
summary: GamID-owned interface interactions remain silent, with Intro audio exempt and user/provider media unchanged.
related: [DEC-0008]
save_approval: Mazen 2026-10-21
authorization: Mazen 2026-10-21 authorized silent-UI policy validation and TESTING deployment
acceptance: Mazen 2026-10-21 confirmed the updated behavior worked on TESTING
supersedes: []
truth_refs: [silent-ui-policy]
checkpoints: [da4cc5a2f1ad785260309cb6022cdebbba6a6dd1]
sources: [docs/UNIVERSAL-DELETE-UX.md, gamid-truth.json]
---

## Context

Mazen reported hearing a deletion tone and requested a quiet product interface for now, except Intro.

## Decision

GamID must not emit app-owned sounds for delete, save, upload, alerts, dialogs, buttons, navigation or other UI feedback. Intro audio remains as currently contracted. User-content audio, third-party embeds and operating-system sounds are outside this UI policy. Preserve visual feedback and accessibility. This is temporary and may be revisited.

## Reasoning

A silent interface avoids distracting effects. The shipped-code audit found no application-owned UI sound source to disable, so a regression guard was added rather than inventing an audio subsystem. Any sound heard from a browser, OS or provider requires separate diagnosis.

## Alternatives considered

- Introduce optional UI sound settings now — deferred to a future audio-design discussion.
- Mute all media including Intro — rejected; Intro is explicitly exempt.

## History

- 2026-10-21 APPROVED — Mazen approved the temporary silent-UI policy, Intro exempt, in his task "Universal Delete UX Final Adjustments + Silent UI Policy" (PROJECT_HANDOFF.md §115).
- 2026-10-21 AUTHORIZED — The same task authorized its implementation and TESTING deployment.
- 2026-10-21 IMPLEMENTED — The shipped-code audit found no application-owned UI sound; the regression guard was deployed with TESTING at da4cc5a2f1ad785260309cb6022cdebbba6a6dd1 (run 39616006123).
- 2026-10-21 ACCEPTED — TESTING deployed at da4cc5a2f1ad785260309cb6022cdebbba6a6dd1; Mazen confirmed the final pass and approved saving.
