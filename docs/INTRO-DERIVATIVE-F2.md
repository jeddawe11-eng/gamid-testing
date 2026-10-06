# F2: bounded Intro playback derivatives (TESTING)

## Continuation and verified pipeline

Started from clean, pushed feature/play-together-notifications at 1010df47fbff2292d65af103016287b62389dec0. PROJECT_STATE -> Truth / AGENTS -> F3/F4 records -> Git. F3 is manually ACCEPTED; its deployed product is 3b9d8b1c27fb0c9b3fa6fd0c2ee682dab7618906. F4 remains preserved. Main is da2e020928f546e6b637f38629fd673b15544c2b and is not a deployment target.

The authenticated browser uploads MP4/MOV/WebM (150 MiB source ceiling, 0.5–30 s) through the existing quota-enforced resumable gateway into private intro-sources. queue_my_intro creates a server-owned job. The existing TESTING Cloud Run Job claims it through service-role-only worker_claim_intro_job; FFmpeg reads that authorized source and encodes D3; validation precedes gateway upload into private intro-media and atomic worker_complete_intro_job activation. Failure retains the previous active Intro. Public get_public_identity exposes only the current READY derivative for a PUBLIC identity. loadPublicIntroMedia fetches that derivative into a Blob; Full Preview uses the same derivative. F5 streaming, URLs, authorization, RLS and caching are untouched.

Root cause: the old encoder used VP9 CRF 40 but had no resize filter and explicitly rejected dimensions differing from the source. Thus 4K remained 4K; the 15 MiB ceiling limited bytes, not unnecessary decoding/delivery resolution.

## F2 policy

- Long coded edge <=1920 pixels; short coded edge <=1080. Landscape 4K becomes 1920×1080; portrait becomes 1080×1920; square is <=1080×1080; ultrawide retains its ratio within the long-edge bound.
- Downscale only, Lanczos; no crop/pad/upscale. Even chroma dimensions round down; an extreme narrow edge remains at least two pixels. FFmpeg adjusts sample aspect ratio during resize, preserving display aspect. Its existing autorotation is reflected in expected output geometry.
- VP9/WebM CRF 40, zero target bitrate, good deadline, cpu-used 2, row-mt 1 and opaque yuv420p are unchanged. This isolates resolution optimization rather than introducing a new bitrate/quality tier.
- Preserve source frame rate and timing (existing validation tolerance .02 fps / .25 s); validate bounded dimensions and display aspect within .5%. Audio presence is unchanged: first audio stream encoded to Opus 32 kbps VBR/audio, otherwise no audio.
- Source 150 MiB, derivative 15 MiB, duration 0.5–30 s, quota 200 MB and all Wall limits unchanged. No storage/schema/Edge Function migration is required.
- The accepted presentation uses aspect-safe foreground/ambient treatment and MAX_UPSCALE=1.5. It is unchanged. On very large/high-DPI desktop displays, the foreground cap now applies to the bounded derivative; manual review must judge both sharpness and its apparent size. No identical 4K detail/visual equivalence is claimed.

### Alpha / transparency boundary

CURRENT Intro D3 always uses opaque yuv420p. The accepted Wall WebM alpha path is separate and untouched. F2 does not introduce Intro alpha or silently remove an accepted Intro alpha capability. Native regression uses a real VP9 alpha-tagged input and verifies the same opaque output boundary. If transparent Intro derivatives are desired, that is a separate product policy decision; do not represent this result as preserved Intro transparency.

### Master retention and existing Intros

No master or stored media was modified by this task. The current authoritative pipeline does NOT retain successful Intro sources indefinitely: worker_complete_intro_job marks the source cleanup-eligible, and existing cleanup deletes it after successful activation. This established lifecycle is unchanged; F2 does not add deletion or derive from an existing D3. Masters still present remain subject to the same existing policy.

Only new uploads processed by the updated worker receive F2. Existing READY derivatives remain unchanged. No mass reprocessing, no protected @black/@zshot operation and no account upload was performed. Old oversized derivatives would need an available original/re-upload to benefit; do not re-encode old D3 or change protected identities without Mazen's authorization.

## Bounded local measurement (synthetic, no Supabase bytes)

Generated a deterministic 3-second moving FFmpeg testsrc2 3840×2160/30 fps source, H.264 CRF 18, with AAC sine audio. Encoded once with the exact baseline worker before modification and once through F2. This is representative of the resolution/frame-rate/audio path, not a real gameplay-quality or real @black saving claim.

| Metric | Baseline D3 | F2 D3 |
|---|---:|---:|
| Dimensions | 3840×2160 | 1920×1080 |
| Frame rate | 30 fps | 30 fps |
| Video / container | VP9 / WebM | VP9 / WebM |
| Audio | Opus 32 kbps VBR | Opus 32 kbps VBR |
| Duration | 3.016 s | 3.016 s |
| Bytes | 5,776,053 | 409,804 |
| Total bitrate (including audio/container) | 15,321,095 bps | 1,087,013 bps |
| Local encode time | 10,962 ms | 3,509 ms |

Size reduction: 92.9051%, or 5,366,249 fewer bytes for one complete first-time delivery of THIS fixture. Blob loading still downloads the whole derivative, so this is the direct per-view byte difference, excluding headers/retries. No monthly extrapolation or predicted real-media percentage.

Frame-aligned SSIM against the source resized with the same Lanczos filter to 1920×1080: 0.995107. Alignment uses AVTB and N/(30*TB) on both streams, avoiding container timebase/audio-offset mismatch. This evaluates compression at the NEW resolution; it does not prove preservation of original 4K detail or visual equivalence. A same-time before/after frame pair, both presented at 960×540, is saved locally in the evidence directory.

Additional generated fixture outputs: portrait 1440×2560 ->1080×1920, 24 fps, 3 s, 829,249 B (2,211,330 bps), no audio; small 576×1024 ->same dimensions, 30 fps, 3 s, 454,227 B (1,211,272 bps), no audio. The TESTING acceptance page contains these synthetic derivatives only; no master or real user media.

Local detailed metadata, aligned quality log and frame comparison: C:/Users/user/Documents/Codex/2026-09-30/x20/f2-evidence/. Source generation: testsrc2=size=<dimensions>:rate=<fps>:duration=3; H.264 source uses libx264/preset ultrafast/CRF18/threads2. Landscape adds sine frequency440/sample_rate48000/duration3 and AAC128k. New derivatives use node worker/intro-worker.mjs encode INPUT OUTPUT. Baseline source is Git commit 1010df4's worker (unchanged from F3).

## Validation and deployment

Focused suite: 49/49 PASS, including native FFmpeg 7.1.1 fixtures. Eleven F2 tests cover landscape/portrait/square/ultrawide/small/odd geometry, orientation, invalid geometry, encoding/storage/private lifecycle and a native integration case exercising landscape/portrait/small, 60 fps, audio/no audio, rotation, anamorphic SAR, alpha-input boundary, invalid media, oversize source and too-short duration. The opt-in native test uses F2_FFMPEG_TESTS=1; normal portable builds skip it if not opted in. Existing directly conflicting resolution assertions were updated to preserve aspect/timing/codec/size guarantees.

Full local build: lint/typechecks PASS; 1,635 tests, 1,634 PASS, one opt-in native test skipped, zero failures. Native test passed separately. A deployment-only f2-smoke command encodes three local synthetic fixtures and reports worker/module SHA256 and ffmpeg version. It NEVER claims a queued job or calls Supabase.

Deployment status: **DEPLOYED AND TECHNICALLY VERIFIED ON TESTING**, final verification 2026-10-07. Product checkpoint: 04877c20d213f0105fbdc2871146248194eaf773, branch feature/play-together-notifications. Encoding implementation was introduced at 04a67c223e04301fea670f63e40d2e4dce7140d5; later product commits add deployment reproducibility, fixture stamping and directly affected lab guards. No F2 implementation or media test was rerun during final continuation.

- Final worker build: 4f192727-f667-41fc-9693-5d52fc7c9549. Existing Job gamid-intro-worker-testing, project gamid-testing, asia-southeast1. Final image: asia-southeast1-docker.pkg.dev/gamid-testing/gamid-workers/intro-processing@sha256:916d37969a2708673ea88ba672733dedff3241843825a589993b69e1de017498. The rollout reported F2_IMAGE_ONLY_UPDATE_VERIFIED after comparing execution specs with image removed. Current dashboard YAML reconfirms this digest, no persistent command/args override; Docker CMD remains node intro-worker.mjs once. Secrets/service account/resources/dispatcher were not changed.
- Final existing synthetic execution: gamid-intro-worker-testing-ll6kc, created 2026-10-06 22:41:50 Asia/Kuala_Lumpur; task exit 0, no retries, completed 22:42:33. Per-execution arguments: node intro-worker.mjs f2-smoke. It never claims a queued user job or calls Supabase. Stored stdout ok=true, FFmpeg 5.1.9-0+deb12u1. Worker SHA256 ef897fc0cefb915e26b5b1aa1fd3785876f161e15a84880342bf74807bdfb807; smoke SHA256 fe0506e2c0c253794401079d059ab7dd1d12650942a7c221d2441acde57acf38. Both match the product Git blobs.
- Native results: landscape 1920×1080 / 30 fps / 0.611 s / 225,812 B / Opus; portrait 1080×1920 / 24 fps / 0.625 s / 190,942 B / silent; small 320×240 / 60 fps / 0.6 s / 31,678 B / silent. All geometry, codec, audio, timing and frame-rate assertions passed in the deployed image. These short cloud smoke inputs are separate from the three-second comparison/acceptance fixtures above.
- An earlier queued Cloud Shell command also produced build 16d19346-e170-4f9a-ba60-ded611ecb754 and synthetic execution gamid-intro-worker-testing-tl5m9 (succeeded). This duplicate rollout used the same encoder bytes. It did not process real media. Neither deployment nor smoke execution was repeated on final continuation; existing dashboard logs were read instead.
- Frontend: existing Cloudflare TESTING workflow run [37479877416](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37479877416), SUCCESS at 04877c20d213f0105fbdc2871146248194eaf773; Worker version ccfd1e32-9fe3-42a6-b6c0-72eb8d141195. Final deployment build: 1,636 tests, 1,634 PASS, two skips (opt-in F2 native and unavailable CI FFmpeg conversion), zero failures; lint/typechecks PASS. Native F2 already passed separately locally and in the deployed worker.
- Deployment staging initially rejected the new fixture's unstamped HTML; its path was added to the existing Cloudflare/Pages stamping lists. Two historical root-lab exclusions now permit only this dist-owned fixture path. All 68 directly affected tests pass. No hosting redesign or unapproved root lab is published.
- Live fixture HTML/JS, all three synthetic WebMs and existing Intro preview HTML/JS were checked byte-for-byte against 04877c20d213f0105fbdc2871146248194eaf773; HTML stamp 04877c2 was reconfirmed during final continuation. Live landscape/portrait/small reached natural end and synthetic profile reveal; observed dimensions 1920×1080, 1080×1920 and 576×1024; no media or browser errors. Narrow browser-panel screenshot was 540×625, not a real-phone or large-desktop quality acceptance claim.

F2 manual acceptance: **PENDING**. Synthetic output and existing playback mechanics are technically verified; actual phone/desktop quality judgment remains Mazen's. Existing real Intros were not reprocessed. No database, Edge Function, storage policy, quota, Production, main or Monitor change.

GamID Truth: UPDATED — intro-identity checkpoint and D3 derivative processing contract now record bounded dimensions; status remains PENDING_ACCEPTANCE. Source/duration limits and other capability statuses remain unchanged. PROJECT_STATE points to this document; PROJECT_HANDOFF §11 describes the current F2 policy instead of the superseded source-resolution preservation rule. Final documentation/state HEAD is the commit that records this section (resolve with Git; never guess a self-referential SHA).

## Exact manual acceptance (after both deployments)

Open https://gamid-testing-static.gamid.workers.dev/prototypes/intro-derivative-f2/ on phone and desktop. Choose Landscape, Portrait, then Small. If existing autoplay rules show Tap to play, tap it. Check visible quality, smooth motion, no stretch/unexpected crop, natural three-second ending and fade reveal into the synthetic identity. Landscape contains encoded audio: check the tone plays when browser audio permission permits; portrait/small should be silent. Replay each button. The page uses the existing Intro frame/engine, whole-Blob path and no Supabase/real identity. Current Intro output is opaque, so no Intro transparency PASS is requested; accepted Wall alpha remains separate.

Existing real profiles still play their existing derivatives: merely viewing @black does not test F2. No protected reprocessing is authorized. A future fresh source on an explicitly approved dedicated TESTING identity can verify normal upload-to-READY if Mazen requests it; this task's worker smoke verifies actual encoding without real-data writes.

Stop after F2. Remaining F5 (whole-Blob/native streaming), F6 private-media caching, F7 picture derivatives, F8 lightweight previews are NOT implemented. Recommended next discussion is F5 because the current complete-Blob download still gates Intro startup; review F2 quality first. No Monitor or Global Usage acceptance work.

## Exact changed-file inventory

Compared with continuation base 1010df47fbff2292d65af103016287b62389dec0:

- worker/intro-worker.mjs, worker/intro-f2-smoke.mjs, worker/Dockerfile, worker/README.md
- worker/cloud-run/usage-testing.gcloudignore, worker/cloud-run/deploy-intro-f2-testing.sh
- dist/prototypes/intro-derivative-f2/index.html, fixture.js, landscape.webm, portrait.webm, small.webm
- package.json, scripts/stage-cloudflare.mjs, .github/workflows/deploy-pages.yml
- tests/intro-derivative-f2.test.js, tests/intro-source-limit.test.js, tests/intro-video-fit.test.js
- tests/cloudflare-deployment-contract.test.js, tests/game-id-wall-w0.test.js, tests/landing-page.test.js
- docs/INTRO-DERIVATIVE-F2.md, PROJECT_STATE.md, PROJECT_HANDOFF.md, gamid-truth.json

Final continuation changed only the last four documentation/state files. Encoding, deployment and completed tests were not rerun.
