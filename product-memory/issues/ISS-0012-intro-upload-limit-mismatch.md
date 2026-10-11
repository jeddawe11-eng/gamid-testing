---
id: ISS-0012
title: Intro sources over 50 MiB cannot be uploaded although the editor, the bucket and Truth allow 150 MiB
status: VERIFIED
created: 2026-10-11
updated: 2026-10-12
scope: Intro source upload size (editor guard, intro-sources bucket, the gateway, Supabase's project-wide Storage file size limit)
summary: The effective upload limit on TESTING was the project-wide 50 MiB (52,428,800 bytes), below the then-approved 150 MiB Intro source limit. Mazen resolved the mismatch by standardizing on 50 MiB; this is implemented at every Intro enforcement point and accepted by him as the final limit.
related: [ISS-0011]
save_approval: Mazen 2026-10-12
kind: BUG
authorization: Mazen 2026-10-11, explicit task "GAMID — Align Intro Upload Limit to 50 MiB — TESTING ONLY"
acceptance: Mazen 2026-10-12 formally accepted 50 MiB (52,428,800 bytes) as the final authoritative Intro source upload limit (implementation 5214d9b, migration 20261011260000, deployed af2af0d); this covers the limit decision and its contract only, not the whole Intro identity feature
truth_refs: [intro-identity]
checkpoints: [4b56646e782eefadcc173b64e8aa59f0fab37cd9, 5214d9b6add2629684e9c134f1e637598b90dd97, af2af0d9b213b76df1e5f947847e1459c134470e]
sources: [dist/account/domain.js, supabase/functions/_shared/usage-upload.js, supabase/migrations/20261011260000_intro_source_limit_50mib.sql, tests/intro-source-limit.test.js, PROJECT_HANDOFF.md]
---

## Description

Several layers allowed an Intro source of up to 150 MiB:
- the editor (`INTRO_SOURCE_MAX_BYTES` = 150 MiB, "max 150 MB");
- the `intro-sources` bucket (157,286,400 bytes);
- the queue RPC and the table check;
- Truth `intro-identity.introSourceMaxBytes`.

Storage on TESTING, however, refused to start any upload larger than 50 MiB. A ~116 MB Intro therefore could not be uploaded at all. Before ISS-0011 was fixed, each such attempt also left its reservation behind.

## Evidence

Empirical probe on TESTING (2026-10-11). Resumable upload starts were requested directly from Storage with service credentials and declared sizes only. No data was sent, every upload that did start was terminated at once, and no object was created (verified).
- 116,291,584 bytes (110.9 MiB): **413**.
- 52,428,801 bytes (50 MiB + 1 byte): **413**.
- 52,428,800 bytes (50 MiB): 201, terminated with 204.
- 50,000,000 bytes: 201, terminated with 204.

So the effective limit was exactly 52,428,800 bytes, Supabase's project-wide file size limit, below the 150 MiB bucket limit. This matches the history: the largest successful Intro source was 50.6 MB (48.3 MiB). The setting itself could not be read without changing anything; the behaviour is what is confirmed.

## Resolution

Partly mitigated first (application side, part of the ISS-0011 fix, checkpoint `4b56646`):
- a refusal is returned as `UPLOAD_TOO_LARGE` (413), with the editor message "This video is larger than the current upload limit. Choose a smaller or shorter video.";
- the attempt's reservation is released at once.

The approved 150 MiB product limit was not lowered at that point.

**Resolved by Mazen's decision (2026-10-11): standardize on 50 MiB** instead of raising the Supabase infrastructure setting.
- **Implementation** at `5214d9b`: one value, 52,428,800 bytes, at every Intro enforcement point. Migration `20261011260000` sets the `intro-sources` bucket `file_size_limit`, the `intro_processing_jobs` source-size CHECK and the `queue_my_intro_impl` bound. The editor constant and its messages say "50 MB". Truth `intro-identity.introSourceMaxBytes` = 52428800.
- **Deployment:** the migration was applied, and TESTING was deployed as `af2af0d` (run 38147127030). The served editor showed "max 50 MB" (PROJECT_HANDOFF.md §43).
- **Tests:** `tests/intro-source-limit.test.js`: exactly 52,428,800 bytes is accepted; 52,428,801, 116,291,584 and 150 MiB are refused.
- **Unchanged:** the Intro worker's own 150 MiB `MAX_SOURCE_BYTES` stays a defensive processing ceiling behind the stricter limits.

**Acceptance:** Mazen formally accepted 50 MiB as the final authoritative Intro source upload limit on 2026-10-12. This covers the limit decision and its contract only.

## History

- 2026-10-11 OPEN — Hypothesis from the ISS-0011 investigation, then confirmed by the size probe; awaiting Mazen's decision on the infrastructure setting or the product limit.
- 2026-10-11 AUTHORIZED — Mazen decided to standardize on 50 MiB and authorized it ("GAMID — Align Intro Upload Limit to 50 MiB — TESTING ONLY").
- 2026-10-11 FIXED — 50 MiB at every Intro enforcement point (5214d9b, migration 20261011260000), deployed to TESTING as af2af0d (run 38147127030).
- 2026-10-12 VERIFIED — Mazen formally accepted 50 MiB (52,428,800 bytes) as the final Intro source upload limit.
