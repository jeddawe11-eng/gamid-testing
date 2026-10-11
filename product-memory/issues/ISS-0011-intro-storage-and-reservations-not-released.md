---
id: ISS-0011
title: Failed and removed Intro files and abandoned upload reservations were not released
status: FIXED
created: 2026-10-11
updated: 2026-10-11
scope: Intro storage lifecycle (Intro worker cleanup, remove_my_intro, failed jobs) and the usage-upload gateway's upload reservations
summary: Failed Intro sources were never cleaned, a removed Intro's file waited for a worker run that only a new Intro starts, and a resumable upload Storage refused to start kept its reservation for 26 hours; together they blocked a new Intro upload. Fixed on TESTING.
related: [ISS-0012, ISS-0001, ISS-0010, REV-0004]
save_approval: Mazen 2026-10-11
kind: BUG
authorization: Mazen 2026-10-11, explicit task "GAMID — ISS-0011 / ISS-0012: Permanent Intro Storage Fix + Authorized Cleanup" (TESTING only)
truth_refs: [intro-identity, global-usage, your-gamid-editor]
checkpoints: [4b56646e782eefadcc173b64e8aa59f0fab37cd9, 72896d6f5b08dc4b9ea96cd2c7b3e35f2277dbe4]
sources: [supabase/migrations/20261011240000_intro_storage_lifecycle.sql, supabase/functions/_shared/usage-upload.js, dist/account/account.js, tests/intro-storage-lifecycle.test.js, PROJECT_HANDOFF.md]
---

## Description

Mazen removed his Intro. The editor showed "No intro yet", but Global Usage still counted 30.1 MB of Intro storage and 116.3 MB of reserved uploads, and a new Intro upload was refused for insufficient storage.

Three defects caused this:
1. A failed Intro job never made its source cleanup-eligible (`worker_fail_intro_job_impl`), so the source stayed stored and counted indefinitely.
2. Removing an Intro only marks its derivative eligible. Eligible files are deleted only during an Intro worker run, and the worker starts only when a new Intro is queued. A new Intro could not be queued while storage was full, so the cleanup never ran.
3. When Storage refused to start a resumable upload, the gateway kept that attempt's reservation. Nothing could cancel it, because the upload never started, so it held the space until the 26-hour owner reconciliation.

## Evidence

Owner-authorized, read-only inspection on TESTING (2026-10-11), limited to Mazen's account. It was identified as the sole TESTING administrator, and its live numbers matched his report.
- **Usage:** 67.25 MB used, 116.29 MB reserved, 200 MB quota, no active Intro.
- **Intro storage, 30.12 MB:**
  - three failed sources, never eligible: job `06824201` 5.95 MB, job `9c7ef884` 5.95 MB, job `80b489e3` 17.48 MB (all `D3_TIMING_OR_GEOMETRY_MISMATCH`);
  - the removed Intro's derivative (job `0937bebb`, 0.73 MB), eligible since 10:42 UTC and waiting for a worker run.
- **Reservation, 116.29 MB:** one ACTIVE `intro-sources` receipt (`e3c47109`, created 10:41 UTC). It was never bound to a started upload, had no file and no job, and was not yet 26 hours old.
- **Not stale accounting:** Global Usage is computed live from the stored files and the ACTIVE receipts on every Refresh.
- **No connection to the security issues** (ISS-0007, ISS-0009).

## Resolution

FIXED on TESTING. Product checkpoint `4b56646`, deployed with the TESTING head `72896d6` (workflow run 38145293680, full validation passed). Not VERIFIED: Mazen's acceptance is pending.

**Migration `20261011240000_intro_storage_lifecycle`** (rehearsed, then applied; history repaired). It adds `private.storage_lifecycle_policy`:
- `automatic_since` = 2026-10-11 13:55:56 UTC, the deployment cutoff;
- `failed_source_retention` = 1 hour;
- `unbound_receipt_grace` = 15 minutes.

It also changes the following:
- A failed job's source becomes eligible 1 hour after the failure.
- The worker and the owner's cleanup select only items that became due since the cutoff. They never select an active Intro, or the source of a pending or processing job.
- New owner-scoped candidates: `usage_intro_cleanup_candidates`, service role only.
- Owner reconciliation also releases an ACTIVE receipt that was never bound and has no file, after the 15-minute grace (only receipts created since the cutoff).
- New `usage_upload_action` action `release_unbound`. It releases only an ACTIVE, unbound receipt of its own owner with no file; it is idempotent.
- Applying the migration changed no file, receipt or job.

**Gateway (`usage-upload` v9; its deployed source is byte-identical to the repo):**
- When Storage refuses to start an upload, the gateway releases that attempt's own unbound reservation.
- A 413 refusal is returned as `UPLOAD_TOO_LARGE`; any other refusal as `RESUMABLE_CREATE_FAILED`.
- The owner cleanup route also deletes the owner's due Intro files through `authorize_usage_delete`, and records them with `worker_confirm_intro_cleanup`.

**Editor:** it asks for that cleanup after removing an Intro and before uploading a new one. The new codes have clear messages.

**Authorized one-time deletion, Mazen 2026-10-11.** Only the three failed sources were deleted. Each was checked first: owner, FAILED state, not active, no other or live job, no ACTIVE receipt, exact size. Each went through the gateway's DELETE route with worker credentials, and each deletion was recorded.

| Job | Bytes | Result |
|---|---:|---|
| `06824201-9c33-4643-a13c-2bb33a38ecd8` | 5,952,891 | deleted (gateway 200), recorded 13:47 UTC |
| `9c7ef884-9ab8-4e84-84a5-e0a7451ede10` | 5,952,891 | deleted (gateway 200), recorded 13:47 UTC |
| `80b489e3-259e-45ee-a46f-7aca2583d88d` | 17,483,880 | deleted (gateway 200), recorded 13:47 UTC |

Used storage went from 67.25 MB to 37.86 MB (Intro from 30.12 MB to 0.73 MB). Reserved stayed at 116.29 MB.

**Not touched, as instructed:**
- The 0.73 MB removed derivative. It became eligible before the cutoff, so neither automatic path selects it; it waits for Mazen's decision.
- The 116.29 MB reservation. It was created before the cutoff, so it keeps the existing 26-hour rule and releases after 2026-10-12 12:41 UTC, the next time Usage opens or an Intro save runs.

**Tests:**
- `tests/intro-storage-lifecycle.test.js` (8 tests): retention, the cutoff, active and running-job guards, owner scoping, `release_unbound`, the grace rule, the gateway refusal path, protected owner cleanup, and the editor wiring;
- the existing gateway tests;
- 108 related test files;
- CI.

**Remaining for VERIFIED:** Mazen's targeted manual check, then his acceptance.

## History

- 2026-10-11 OPEN — Found by the owner-authorized read-only investigation of Mazen's TESTING account.
- 2026-10-11 AUTHORIZED — Mazen authorized the permanent fix and the deletion of the three failed sources.
- 2026-10-11 FIXED — Migration 20261011240000, usage-upload v9 and frontend 72896d6 deployed on TESTING (run 38145293680); three failed sources deleted under the authorization. Not VERIFIED: Mazen's acceptance is pending.
