---
id: ISS-0012
title: Intro sources over 50 MiB cannot be uploaded although the editor, the bucket and Truth allow 150 MiB
status: OPEN
created: 2026-10-11
updated: 2026-10-11
scope: Intro source upload size (editor guard, intro-sources bucket, the gateway, Supabase's project-wide Storage file size limit)
summary: The effective upload limit on TESTING is the project-wide 50 MiB (52,428,800 bytes), below the approved 150 MiB Intro source limit; larger Intros fail when the upload tries to start. Confirmed empirically; the infrastructure change that would fix it is not authorized.
related: [ISS-0011]
save_approval: Mazen 2026-10-11
kind: BUG
authorization: NONE
truth_refs: [intro-identity]
checkpoints: [4b56646e782eefadcc173b64e8aa59f0fab37cd9]
sources: [dist/account/domain.js, supabase/functions/_shared/usage-upload.js, PROJECT_HANDOFF.md]
---

## Description

Several layers allow an Intro source of up to 150 MiB: the editor (`INTRO_SOURCE_MAX_BYTES` = 150 MiB, "max 150 MB"), the `intro-sources` bucket (157,286,400 bytes), the queue RPC and table check, and Truth `intro-identity.introSourceMaxBytes`. Storage on TESTING, however, refuses to start any upload larger than 50 MiB. A ~116 MB Intro therefore cannot be uploaded at all. Before ISS-0011 was fixed, each such attempt also left its reservation behind.

## Evidence

Empirical probe on TESTING (2026-10-11). Resumable upload starts were requested directly from Storage with service credentials and declared sizes only. No data was sent, every upload that did start was terminated at once, and no object was created (verified).
- 116,291,584 bytes (110.9 MiB): **413**.
- 52,428,801 bytes (50 MiB + 1 byte): **413**.
- 52,428,800 bytes (50 MiB): 201, terminated with 204.
- 50,000,000 bytes: 201, terminated with 204.

So the effective limit is exactly 52,428,800 bytes, Supabase's project-wide file size limit, below the 150 MiB bucket limit. This matches the history: the largest successful Intro source was 50.6 MB (48.3 MiB). The setting itself could not be read without changing anything; the behaviour is what is confirmed.

## Resolution

Partly mitigated (application side, part of the ISS-0011 fix, checkpoint `4b56646`):
- a refusal is returned as `UPLOAD_TOO_LARGE` (413), with the editor message "This video is larger than the current upload limit. Choose a smaller or shorter video.";
- the attempt's reservation is released at once.

The approved 150 MiB product limit was not lowered.

**Unresolved: needs Mazen's decision.** Either:
- raise the project-wide Storage file size limit to at least 150 MiB. This is a Supabase infrastructure setting, it may depend on the plan, and it needs separate authorization; or
- formally lower the approved Intro source limit to 50 MiB (editor, bucket, RPC, table check and Truth together).

## History

- 2026-10-11 OPEN — Hypothesis from the ISS-0011 investigation, then confirmed by the size probe; awaiting Mazen's decision on the infrastructure setting or the product limit.
