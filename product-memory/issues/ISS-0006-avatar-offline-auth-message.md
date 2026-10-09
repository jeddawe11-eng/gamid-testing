---
id: ISS-0006
title: Avatar offline pre-save error mislabels authentication service
status: OPEN
created: 2026-10-09
updated: 2026-10-09
scope: Profile Editor Avatar save and upload feedback
summary: When the browser is offline before Save Changes, a profile-read failure can show an Authentication service error instead of a relevant connection message.
related: [ISS-0001]
save_approval: Mazen 2026-10-09
kind: BUG
authorization: NONE
truth_refs: [your-gamid-editor]
checkpoints: [d2c24b9dede6614a84f98bdec22ca3c7ea11995d]
sources: [dist/account/account.js]
---

## Description

During an Avatar save with the browser already fully offline, the profile read can fail before the avatar upload starts. The displayed message is "Authentication service could not be reached." This suggests an authentication-service problem although the immediate condition is lost connectivity. Retry is shown and works. Expected: a precise, actionable offline/profile-read message, without misclassifying the failure as an authentication outage. Preserve existing upload feedback and retry behavior.

## Evidence

Claude's reported isolated Monitor-based TESTING check (2026-10-09) used GM-TEST-01 with guarded, read-only browser sessions on desktop and mobile. Real browser offline reproduced the misleading text; upload failures and successful retry after reconnection were otherwise mocked. Reported 12/12 scenario/device checks passed, but this observation remains a new copy/UX issue. Scratchpad evidence was local and not independently inspected in this record. No live upload or data mutation occurred.

## Resolution

Unresolved. Do not implement without separate authorization.

## History

- 2026-10-09 OPEN — Mazen approved recording the newly observed offline Avatar error-message issue; no implementation authorized.
