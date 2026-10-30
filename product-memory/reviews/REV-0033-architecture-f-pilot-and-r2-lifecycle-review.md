---
id: REV-0033
title: Architecture F TESTING pilot (GM-TEST-01) and the Supabase / R2 file-lifecycle review
status: COMPLETED
created: 2026-10-30
updated: 2026-10-30
scope: The Architecture F R2 pilot on TESTING (GM-TEST-01 Intro + Discord share copy) - its tested results and current switch state, and a read-only code review of how Intro upload, replacement, removal and out-of-band file loss reach Supabase Storage and R2
summary: PARTIAL - the GM-TEST-01 pilot passed replication, verification and delivery on TESTING and is switched off again (replication and delivery OFF, Worker MEDIA_R2_DELIVERY off, nothing on Production). The lifecycle review found that removal and replacement void the old replica in the database at once, but physical R2 deletion has no guaranteed run, orphans and silent delete failures are possible, the full upload-replace-remove cycle is untested end to end, and there is no restore in either direction. Findings and proposals only; no decision.
related: [DEC-0013, REV-0032, REV-0030, REV-0029, ISS-0019]
save_approval: Mazen 2026-10-30
review_type: AUDIT
outcome: PARTIAL
reviewer: Claude Code (pilot tests and read-only code review); Mazen (approved saving this record only)
truth_refs: [visitor-media-access, intro-streaming-f5, intro-discord-thumbnail, public-media-route-protection, global-usage]
checkpoints: [4b325d685ce392f413ee1bbdd97c63fec74e5ba6, 04c1d50f3eff8281a58d6cfc8e514617587536aa, 11dec49e322c6e2537d19b4708cceaeaaa9e372e, 7ef50e750f34857fcc3ab80dacea9c42df8cdcca]
sources: [PROJECT_HANDOFF.md, docs/INFRA-OPTIMIZATION-V1.md, supabase/migrations/20261029100000_media_r2_pilot.sql, supabase/migrations/20261030120000_media_r2_fallback_accounting.sql, supabase/migrations/20260916170000_slice_3c_intro_identity.sql, supabase/migrations/20261011240000_intro_storage_lifecycle.sql, worker/media-r2-replica.mjs, worker/intro-worker.mjs, cf-worker/media-r2.mjs, cf-worker/worker.mjs, supabase/functions/_shared/public-media.js, dist/account/intro-source.js]
---

## Subject

**What this covers:**
- the Architecture F pilot that DEC-0013 / REV-0032 led to: TESTING only, the GM-TEST-01 synthetic fixture only (Intro derivative + Discord share copy);
- Mazen's two consultation questions of 2026-10-30, answered from the code rather than the design:
  - how failures and file loss behave;
  - how a user's upload, replacement and removal of an Intro reach Supabase Storage and R2.

**Mazen's standing position** (from his request, recorded as context, not as a decision record):
- no automatic restore between the two stores when a file is lost or deleted outside GamID;
- deletions and replacements the user makes inside GamID must be reflected correctly in both stores.

The pilot is NOT accepted and NOT released. It is not in GamID Truth.

## Method

**Pilot tests on TESTING** (`PROJECT_HANDOFF.md` §148 and §149, with Mazen's authorization for each step):
- live tests on GM-TEST-01, made temporarily PUBLIC and then restored to DRAFT;
- migration rehearsals inside rolled-back transactions;
- live concurrency tests on fake days, cleaned up afterwards;
- unit tests with a mock R2, and PGlite tests running the real migrations.

**Lifecycle review:** read-only, on `feature/discord-share-card-v2` at `7ef50e7`. Nothing was changed or run that alters data. The 2026-10-30 switch state was re-read before saving.

**Classification used below:**
- **Implemented**: present in the deployed code;
- **Tested**: exercised by the named test;
- **Untested**: implemented but never exercised end to end;
- **Known issue**: a gap found by this review;
- **Proposal**: a recommendation only, never an approved decision.

## Results

### Current state (re-read 2026-10-30)

- **Tested:** on GM-TEST-01, the pilot passed replication, verification and delivery (§148).
  - The existing Intro was replicated through a backfill: READY on attempt 1, 1,525,630 bytes, byte-identical to the Supabase source by SHA-256.
  - The signed lease worked. Range, suffix and clamped ranges, 416 and HEAD all worked. Tampered, expired and unsigned links were refused.
  - The crawler routes were served from R2, and the poster showed before Play.
  - Rollback took effect within 3 s.
- **Tested (§149):** the three fixes.
  - A missing source answers `none` and is never counted.
  - The fallback is counted by the requested range; concurrent requests can't exceed the 100 MiB daily or 1 GiB monthly budget, which is unchanged.
  - A READY Discord share copy can no longer outlive its file.
- **Implemented, state verified:**
  - `replication_enabled` = false, `delivery_enabled` = false, and the Worker's `MEDIA_R2_DELIVERY` = "off";
  - GM-TEST-01 is DRAFT;
  - the verified R2 replica of its Intro is kept but inert.
- **Implemented:** R2 is not enabled on Production; no Production environment exists (§139).
- **Implemented (code), tested in the §148 rehearsal:** while replication is off, nothing is queued and nothing is claimed (`enqueue_media_r2_replicas` and `worker_claim_media_r2_replica` both check the switch). A new Intro is therefore not replicated to R2 at present.

### First Intro upload (pilot profile, replication on)

- **Implemented:**
  1. `queue_my_intro`, then the dispatcher and the Cloud Run Job.
  2. `worker_complete_intro_job` verifies the derivative in `storage.objects`, marks it ready and moves `active_job_id`.
  3. In the same transaction, trigger `queue_media_r2_replicas` runs `enqueue_media_r2_replicas`. It inserts a pending replica only while replication is on, the profile is in the pilot, the daily bound (50) has room and the size is between 1 byte and 15 MiB.
  4. Trigger `dispatch_media_r2_replica` starts another Job run.
  5. `processOneMediaR2Replica` runs last in the Job's order. It reads the source from Supabase, takes its SHA-256 and sends a signed PUT through the Worker. R2 verifies the digest, then `worker_complete_media_r2_replica` marks the replica READY.
  6. Visitors are on Supabase until READY. After that, with delivery on, they get a signed Worker lease.
- **Untested:** this path for a freshly uploaded Intro. Only a backfill of an existing Intro was replicated live.

### Removal and replacement inside GamID

- **Implemented, voided at once:**
  - `remove_my_intro` sets `active_job_id` to null, and a replacement moves `active_job_id`.
  - The same trigger supersedes the old replica in the same transaction, even while replication is off.
  - Delivery stops at once: `intro_media_is_public` and `media_r2_source_profile` no longer match the old path. The only exception is a lease already issued (at most 120 s) or a crawler response held for 60 s.
- **Implemented:** a superseded replica is terminal. No path makes an old job active again, and `enqueue` queues only current sources whose objects exist.
- **Implemented:** a new Intro after a removal gets a new job, a new path and a new R2 key, so it is a new replica.
- **Implemented, deletion deferred:**
  - **Supabase derivative:** deleted later, by `cleanupEligible` in any Job run or by the gateway's owner cleanup.
  - **R2 object:** deleted later, by `sweepMediaR2Replicas`. It handles `failed` and `superseded` replicas whose `completed_at` is more than 10 minutes old, sends a signed DELETE, then records `r2_deleted_at`. The row is kept as history.
- **Known issue:** physical R2 deletion has no guaranteed run.
  - The sweep runs only inside a Cloud Run Job execution, which only queued work starts. A removal starts none, and there is no schedule.
  - On a quiet environment the file can stay physically in R2 for hours or days (it is not served).
  - A run within 10 minutes of the removal leaves it for a later run.
- **Untested:** supersede on removal or replacement, and the real deletion of an R2 object by the sweep. Only a mock test of the sweep and the signed ingest round trip were run; no real replica has been deleted.

### Delete failures and orphans

- **Known issue:** a failed R2 delete is caught silently. The row stays listed and is retried at every later sweep, with no attempt cap and no alert. If the Job loses its ingest configuration, every R2 deletion stops silently.
- **Known issue:** R2 files can be left with no row that references them, and the row-driven sweep never sees them:
  - **a deleted profile row:** replica rows cascade with it and their R2 keys are lost. No product path deletes a profile today;
  - **a reclaimed attempt:** the new attempt's key overwrites the earlier one's on the same row, so an object written by a lost worker is orphaned.

### Out-of-band loss (outside GamID's operations)

- **Implemented, by design:** there is no automatic restore from R2 to Supabase or the reverse. The ingest route only writes into R2, and no code copies back.
- **Known issue: an R2 file disappears outside GamID.**
  - Nothing detects it; the replica stays READY and is never re-queued.
  - With delivery on, the visitor lease and the crawler routes return 404, with no Supabase fallback in the Worker or in `intro-source.js`, until someone intervenes by hand.
  - DEC-0013 describes "a fallback for every request". The pilot does not implement a fallback for a failed R2 read, nor for an exhausted budget, which answers `unavailable`.
- **Known issue: a Supabase original disappears outside GamID.**
  - The delivery decision follows database state, not object existence, so a READY R2 replica keeps being served with delivery on.
  - The owner's counted usage drops, and nothing detects the loss.
- **Implemented, not enforced:** the distinction this needs. An authorized deletion always goes through database state (`active_job_id`, `derivative_deleted_at`, share-copy supersede). A file missing while the database says it is current is out-of-band loss. The code acts on the first and does nothing about the second.
- **Untested:** both out-of-band scenarios.

## Follow-up

These are proposals only. None is approved, authorized or scheduled; each needs Mazen's decision.

1. **Proposal:** an end-to-end lifecycle test on GM-TEST-01 before any activation: upload, replication, replacement, removal, then confirm `r2_deleted_at` and that the object is gone from R2.
2. **Proposal:** a guaranteed R2 deletion run, either a schedule or a Job dispatch when a replica is superseded.
3. **Proposal:** an attempt counter and an alert for failed R2 deletions and for a missing ingest configuration.
4. **Proposal:** keep R2 keys before a profile is deleted, or a storage-driven R2 sweep that compares the bucket with the rows.
5. **Product question for Mazen:** when a Supabase original disappears outside GamID, should R2 stop serving it, so that Supabase stays authoritative? A proposed check: the object exists in `storage.objects` before answering `r2`.
6. **Proposal:** a missing R2 file is served from the Supabase original (serving, not restoring), as DEC-0013 describes, so it is not a 404.

Related open items stay unsaved unless Mazen approves them separately: the possible ISS records for the R2 delete timing / orphans and the budget's anonymous exhaustion, and the earlier §148 E2E review proposal.

Not changed by this record: GamID Truth (the pilot is not a capability), DEC-0013, the code, the database and the infrastructure.

## History

- 2026-10-30 COMPLETED — pilot results, switch state and the read-only lifecycle review recorded; findings and proposals only; saved with Mazen's approval for documentation only.
