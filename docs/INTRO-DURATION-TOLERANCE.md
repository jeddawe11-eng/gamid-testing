# Intro 30-second boundary tolerance — TESTING only

Product checkpoint: 6e2cbdae9d61f106de806f2d42b99c8209299867.
Branch: feature/play-together-notifications. Base: 5d40853a9f6358098640576f9a6c19583920be79.
Status: implemented and validated; TESTING database applied. Worker/frontend deployment blocked on Cloud Shell browser input / human CAPTCHA. Manual acceptance remains pending.

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

## Exact unfinished deployment state

- Product implementation 6e2cbdae9d61f106de806f2d42b99c8209299867 is pushed. Later validation/docs commits keep application/worker bytes unchanged.
- Supabase TESTING applied intro_duration_tolerance once, live migration version 20261007124147 (repository source 20261007160000_intro_duration_tolerance.sql). All 24 rollback-only database checks passed. Do not apply it again.
- Worker hash to deploy: 5919aa4baba094f5b5ecbd58db8425c36bf248c4badd5ea06ca73249f65be562. Existing F2 image is still active; no new Cloud Build appears in history. No worker rollout or native cloud smoke has been confirmed.
- Live frontend remains accepted 2eacf68. Deliberately do not deploy the relaxed client before the updated worker is confirmed.
- Embedded Cloud Shell accepts pasted text but cannot send Enter through browser automation. Human authorization/Enter confirmations were received, but independent build history still had no new build. Standalone https://shell.cloud.google.com/?project=gamid-testing is blocked by a Google human CAPTCHA. Do not bypass it or assume a prepared command ran.
- Resume only worker deployment through worker/cloud-run/deploy-intro-duration-testing.sh with an exact published checkpoint, then confirm image-only configuration change and synthetic execution/hash. Inspect build history first to avoid duplicate rollout if a human starts it meanwhile. Checkout/fetch the selected SHA explicitly; do not depend on branch tip staying at the implementation commit.
- Then run the existing Cloudflare TESTING deployment workflow on the verified feature checkpoint, check served domain.js/account.js and asset stamp, and run intro-duration-browser.mjs --live from the local evidence directory. Its Supabase backend is intercepted with synthetic data; no real user mutation/uploads.
- Local Chrome file-selection fixture already passed at 30.8 and 31.0; 31.1 rejects with unchanged 30-second message. Tiny manual source clips are local at C:/Users/user/Documents/Codex/2026-09-30/x20/intro-duration-fixtures/. None uploaded.
- Native boundary tests passed locally; portable builds skip this one native test only when FFmpeg/ffprobe is unavailable.
