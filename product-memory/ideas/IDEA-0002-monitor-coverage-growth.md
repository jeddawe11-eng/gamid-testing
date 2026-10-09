---
id: IDEA-0002
title: Monitor permanent coverage growth and gap detection
status: DISCUSSION
created: 2026-10-09
updated: 2026-10-09
scope: GamID Monitor QA coverage and Gemini AI Observer
summary: Detect missing behavioral test coverage and propose reusable permanent tests instead of one-off scratchpad checks, without altering frozen V2 or allowing autonomous unsafe changes.
related: [ISS-0001, ISS-0006]
save_approval: Mazen 2026-10-09
authorization: NONE
supersedes: []
truth_refs: []
sources: [PROJECT_STATE.md, product-memory/discussions/DIS-0002-gamid-full-list-continuity.md]
---

## Context

Claude reported Monitor's own suite passing 215/215 but no dedicated contracts for three recent upload error cases. An isolated scratchpad test reported 12/12 PASS across desktop and mobile; quota and successful retry paths relied partly on mocked responses. These tests are not durable Monitor coverage. The user wants Monitor to systematically cover GamID features, including error, boundary and security cases.

## Proposal

- Maintain a discoverable coverage registry mapping product behaviors and negative/boundary cases to deterministic tests, evidence, and coverage gaps.
- After product changes or a one-off test, identify uncovered behavior and propose a permanent, repeatable test instead of discarding the scenario.
- Keep PASS, FAIL, SKIP, NOT COVERED and simulated-vs-real evidence distinct. Never claim 215 Monitor unit tests prove product behavior.
- Use Gemini Observer only as a separately authorized, paid second opinion over captured visual evidence; deterministic Monitor owns execution and pass/fail checks.
- Preserve the frozen V2 baseline; consider isolated additions only after separate review and explicit implementation authorization.
- Respect TESTING-only, protected accounts, guardrails, no Production, and safe simulation for writes.

## Reasoning

Systematic coverage makes regressions visible on later runs and reduces repeated manual instructions. Self-improvement means proposing and maintaining reviewed tests, not autonomously changing the product or Monitor's frozen core.

## Open questions

- Where should a coverage registry live, and how should it relate to GamID Truth without feeding Product Memory to Monitor?
- What acceptance process permits a proposed test to become permanent?
- Which upload cases can use real dedicated test fixtures versus safe mocks?
- How should the independent V3 action pilot evolve without broad crawling?

## History

- 2026-10-09 DISCUSSION — Mazen approved saving the Monitor coverage-evolution idea only; no implementation authorized.
