# Intro 30-second boundary tolerance — TESTING only

Product checkpoint: 6e2cbdae9d61f106de806f2d42b99c8209299867.
Branch: feature/play-together-notifications. Base: 5d40853a9f6358098640576f9a6c19583920be79.
Status: deployed and verified on TESTING. Database, worker and frontend checks PASS. Manual acceptance remains PENDING; do not mark ACCEPTED before Mazen approves.

## End-to-end investigation and smallest change

The browser domain validator, source job CHECK, queue RPC, completion RPC and FFmpeg worker independently enforced 30 seconds. The live queue RPC also contains the accepted Usage upload-ownership extension; copying an older migration would lose it. The new additive migration re-declares the actual current private functions with only their upper duration bound changed, preserving ownership, empty search_path, security definer and privileges.

User-facing labels/errors remain 30 seconds. Internally the inclusive maximum is 31.0 seconds (31,000 ms), minimum 0.5 seconds unchanged. Browser metadata and worker activation use ceiling millisecond conversion so a value above 31 cannot round down. Worker validates finite source and derivative duration independently. Encoding parameters, geometry, audio, F2 and F5 delivery/lease behavior are unchanged; 35-second existing streaming renewal margin still covers the tolerated duration. Existing media is not reprocessed.

Migration: supabase/migrations/20261007160000_intro_duration_tolerance.sql, TESTING only. No bucket, metadata, codec, RLS, storage quota or user-row change. Deployment updates only the existing TESTING worker image, verifies all other execution settings unchanged, and runs existing local-only synthetic F2 smoke, never the normal user-job command.

## Validation

- Boundary suite covers 0.5, 29.999, 30, 30.001, 30.999, 31, immediately above 31, invalid/nonfinite and too-short metadata.
- Tiny native 16×16 synthetic sources: actual 30- and 31-second clips encode successfully; 31.1 is rejected before encoding.
- Focused suites: 39 tests, 38 PASS, one existing opt-in F2 skip.
- Full build: 1,668 tests, 1,667 PASS, one existing F2 skip, zero failures; lint/typecheck/typecheck:voice PASS.
- Live TESTING database integration: all 24 assertions PASS. Queue and service-role completion accept 31,000 ms and refuse 31,001 ms. Anonymous queue remains forbidden; source/derivative size constraints preserved. The always-rolled-back transaction uses a synthetic identity and one processing-only row; pending-only dispatcher cannot fire, no Storage object is created, no real user/job is changed.

## Manual acceptance

On Cloudflare TESTING Account, confirm Intro still says max 30 seconds. On a dedicated acceptance identity, select a nominal 30-second source whose measured duration is slightly above 30 (for example 30.8): save and wait for READY, then Full Preview and replay. A source exactly 31.0 should also pass. Selecting a source measured over 31 (for example 31.1) must immediately show the existing duration error and must not upload/queue it. Check normal reveal, audio and replay remain unchanged. Do not use protected users as agent fixtures.

## Continuation and rollback

Do not mark manually accepted until Mazen approves. Restore the previous worker image and frontend together if rollback is authorized; database narrowing requires checking for tolerated jobs first, so never blindly reapply the old CHECK. F2/F5, Wall/Android MP4, Monitor and main are outside this task.

## Completed TESTING deployment — 2026-10-07

- Product implementation: 6e2cbdae9d61f106de806f2d42b99c8209299867. Exact deployed source: 1517eb179e0fcc5a8c01644c4922efd2d4591c90 (later validation/docs commit; application and worker bytes unchanged).
- Supabase TESTING applied intro_duration_tolerance once, live version 20261007124147 (repository source 20261007160000_intro_duration_tolerance.sql). All 24 rollback-only database assertions passed. Do not apply it again.
- Cloud Build 3e9d872e-01e0-4aa4-96f0-ad6fde84f702: SUCCESS. Existing job gamid-intro-worker-testing, region asia-southeast1, now uses asia-southeast1-docker.pkg.dev/gamid-testing/gamid-workers/intro-processing@sha256:252e509524629c13c86750dec8e722d9035585e54a83cca692b5537e902c6833.
- Before/after execution settings comparison confirmed IMAGE ONLY changed. Secrets, service account, resources, dispatcher, default command and all other execution settings are preserved.
- Synthetic-only execution gamid-intro-worker-testing-vzfgv: Completed=True, succeededCount=1, completed 2026-10-07T12:59:45.587299Z. Existing F2 landscape/audio, portrait and small cases PASS. Deployed worker hash 5919aa4baba094f5b5ecbd58db8425c36bf248c4badd5ea06ca73249f65be562 and unchanged smoke hash fe0506e2c0c253794401079d059ab7dd1d12650942a7c221d2441acde57acf38 verified. No real user job claimed or media reprocessed.
- Cloudflare workflow https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37625207643: SUCCESS, resolved source 1517eb179e0fcc5a8c01644c4922efd2d4591c90, staged artifact verified. Served account/domain.js and account/account.js are byte-equivalent after line-ending normalization; Account asset stamp is 1517eb1.
- Live Cloudflare Chrome file-selection fixture: 30.8 and 31.0 ready to upload; 31.1 rejects with unchanged 30-second duration error. Synthetic backend responses were intercepted; no real identity, upload, saved content or notification mutated. Tiny clips are local at C:/Users/user/Documents/Codex/2026-09-30/x20/intro-duration-fixtures/; none uploaded by the agent.
- Previous full build and focused/native checks remain valid; they were not repeated during rollout. Final Truth/document validation runs after this record is saved. Native boundary tests passed locally; portable builds skip only the native test when FFmpeg/ffprobe is unavailable.
- Historical deployment interruption is resolved: the human completed standalone Cloud Shell authentication. The first prepared command stopped at its exact-checkpoint guard when a newer docs commit was cloned; no build ran from that attempt. The successful rollout explicitly pinned 1517eb1. Log ingestion briefly lagged the successful synthetic execution; its existing logs were read again, without rerunning the job.

Current continuation: STOP for Mazen's duration-boundary manual acceptance. No Android MP4 Wall Asset task, F6/F7, Monitor work, Production access or main merge.
