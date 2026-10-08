# Intro 30-second boundary tolerance — TESTING only

Product checkpoint: 6e2cbdae9d61f106de806f2d42b99c8209299867.
Branch: feature/play-together-notifications. Base: 5d40853a9f6358098640576f9a6c19583920be79.
Status: original duration rollout deployed and verified; Android manual acceptance FAILED with D3_TIMING_OR_GEOMETRY_MISMATCH. The isolated frame-timing correction is now deployed to the TESTING worker; exact source hash, F2 smoke and dedicated READY association are verified. Android manual retest remains PENDING. Do not mark ACCEPTED.

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

## Android D3 failure investigation and correction — 2026-10-08

Base documentation HEAD 6c4168382d8117cbf7e084b8d51309a9e35f93ed. Correction product checkpoint 3f72eb23ef483ca29b9076715ec76ab311dcbcfe, feature/play-together-notifications.

Exact failed attempts: 06824201-9c33-4643-a13c-2bb33a38ecd8 (2026-10-07 13:08:16Z) and 9c7ef884-9ab8-4e84-84a5-e0a7451ede10 (13:13:07Z). Each has source_duration_ms=30338 and source_size_bytes=5952891. Read-only Cloud Run logs show failure at intro-worker.mjs:51, the dimensions/average-FPS/duration comparison, not the duration gate or subsequent aspect-ratio check. Pre-fix logs did not contain source/output measurements; failed rows have no output metadata.

The retained latest source was downloaded once through the authenticated TESTING dashboard for isolated local reproduction, without changing stored media or the failed jobs. Local exact-source reproduction rejected with the same error on the deployed code. Measured source: H.264/AAC MP4, 848x360, 30.338 s, 909 video packets/frames, avg_frame_rate=454500/15169 (29.9624233634 fps), r_frame_rate=30/1. D3 output: VP9/Opus WebM, 848x360, 30.343 s, 909 frames, reported average/nominal FPS=30. Source/output normalized video presentation timestamps differ by at most 4 ms. Output is 733037 bytes. The FPS metadata difference 0.0375766 exceeds the old 0.02 comparison even though actual frames/timing are preserved.

Root cause is a pre-existing container average-vs-nominal FPS comparison, exposed when this 30.338-second upload passed the new duration gate. It is not a 31-second derivative ceiling conflict or an Android-only code path. No encoder flags, codec, scaling, audio, F2/F5, UI, duration/size ceiling, database function or Storage policy change is required.

Small fix: normal matching-FPS path stays unchanged. Only when average FPS differs by more than 0.02, ffprobe reads bounded video packet presentation timestamps from source and output. It requires equal nonzero frame counts, finite strictly increasing presentation times and per-frame normalized timing within half a nominal source frame plus one millisecond (existing encoder time-base rounding/WebM precision). Dropped/added frames, drift, unreadable timing and mismatched geometry/duration/aspect still reject. Structured metadata-only diagnostics make this fallback inspectable; no paths, signed URLs or secrets are logged.

Validation: exact-source local D3 now passes; generated tiny fractional-timing fixture reproduces the old rejection and passes new validation. Focused timing/boundary/F2 suites passed; explicit native F2 geometry/audio/rotation/SAR/alpha-input suite 11/11 PASS. Final full build: 1673 tests, 1672 PASS, one existing opt-in skip, zero failures; lint/typecheck/typecheck:voice PASS. Final focused timing fixture safeguards 5/5 PASS. A final Docker/allowlist packaging assertion was added and passed after the full build. No real media was uploaded, activated or reprocessed on the backend.

### Completed correction rollout and READY verification — 2026-10-08

- Exact deployed worker source: 3f72eb23ef483ca29b9076715ec76ab311dcbcfe. Cloud Build cf42e234-99ef-4ded-b66a-9037f5fc72b9 SUCCESS. Existing gamid-intro-worker-testing / asia-southeast1 image: asia-southeast1-docker.pkg.dev/gamid-testing/gamid-workers/intro-processing@sha256:0aad6f21cadc0c6fdd8228ffa0fb162f4e1d21f44c91a709e426eaf5bc3ecec0. Final describe confirmed that exact digest.
- Deployment script confirmed IMAGE ONLY changed. Default command, dispatcher, secrets, service account and all other execution settings stayed intact. No migration or frontend deployment repeated. Cloudflare Account HTTP 200 and original 1517eb1 stamp remain verified.
- F2 synthetic execution gamid-intro-worker-testing-h69z2 SUCCESS. Landscape/audio, portrait and small cases PASS on deployed FFmpeg 5.1.9. Worker SHA256 1152d6c37f5ea0e68bdec561d4a8959ba8271837f79f4fb04ae454fe1f4857c7 matches pinned source; smoke SHA256 fe0506e2c0c253794401079d059ab7dd1d12650942a7c221d2441acde57acf38 unchanged.
- Dedicated normal authenticated gateway upload/queue/dispatcher verification reached READY. Read-only database snapshots confirmed jobs 8473df3d-1431-41c1-b10c-06e40b28780c and 34d27e2e-24fe-4e81-abd4-2f2bef5db7c0: state ready, each profile's active_job_id exactly matches its job, failure_code null; source 2314 bytes / 2000 ms, derivative 1948 bytes / 2000 ms / 64x64 / 30 fps. This tiny Cloud FFmpeg fixture verifies pipeline activation, not the exact 30.338-second source or metadata fallback remotely. Exact failing-source/fallback proof is the completed local reproduction above; Mazen's real-device retest is still required.
- Test harness execution gamid-intro-worker-testing-qrkhf reported FAILED after successful READY because its admin user cleanup hit entities_created_by_user_id_fkey. Cloud Run's existing retry behavior created the second synthetic fixture. No manual rerun occurred. This is a test-harness cleanup limitation, not a processing failure; do NOT describe the wrapper execution as PASS or rerun it unchanged.
- Both fixtures' Storage objects had already been removed by the harness before the user-delete error. Bounded cleanup then removed only the two freshly created, named disposable fixture entities/users, after confirming READY, exact associations and zero remaining objects. Final read-only counts: fixture users=0, entities=0, jobs=0, Storage objects=0. No schema/constraint changes. Original failed real jobs remained unchanged; no protected account, Wall or user media was modified/reprocessed.
- Completed test results were not repeated: full build 1673 tests / 1672 PASS / one existing skip, lint and both typechecks PASS; native F2 11/11; final focused safeguards 5/5. Final documentation/Truth validation follows this record.

### Current continuation

STOP for Mazen's Android Chrome manual retest: use Cloudflare TESTING Account, upload the same nominal 30-second source previously rejected, wait for READY, then Preview and replay; verify normal audio, ending and profile/Wall reveal. User-facing maximum stays 30 seconds, inclusive internal maximum stays 31.0 seconds; above 31 remains rejected. Do not requeue the existing failed real jobs as an agent test. Manual acceptance remains PENDING until Mazen explicitly confirms.

No further deployment, migration, fixture, Android Wall Asset, F6/F7, Monitor, Production or main work. GamID Truth: NO CHANGE REQUIRED; this ordinary validation correction preserves approved timing, 30/31-second, F2 and F5 contracts.
