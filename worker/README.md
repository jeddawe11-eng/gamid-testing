# GamID Intro processing worker

This directory is the provider-neutral Slice 3C processing boundary. It is not
deployed yet. The browser uploads an authenticated source and queues a job; an
independent, trusted container claims that job and produces the approved D3
derivative. No FFmpeg or privileged credential runs in the browser.

## Contract

The worker runs one job at a time:

1. `worker_claim_intro_job()` atomically changes one job from `pending` to
   `processing` and returns server-authorized source and destination paths.
2. The worker downloads that private source from `intro-sources`.
3. FFmpeg produces VP9/WebM CRF 40 with Opus at 32 kbps directly from the
   source, preserving source resolution, frame rate, and timing.
4. ffprobe validates container, codecs, pixel format, geometry, frame rate,
   duration, audio presence, and the 15 MiB derivative limit.
5. The worker uploads the derivative to `intro-media` and calls
   `worker_complete_intro_job(...)`. Only then is it made active atomically.
6. A failure calls `worker_fail_intro_job(...)`; the previous active Intro is
   left unchanged.
7. Cleanup processes only paths returned by
   `worker_intro_cleanup_candidates(...)`. A source becomes eligible only after
   successful processing; an obsolete derivative becomes eligible only after
   a successful replacement or explicit removal.

All worker RPCs are executable only by `service_role`. The service-role key is
injected by the future host as the `GAMID_SUPABASE_SERVICE_ROLE_KEY` secret and
must never be shipped to the static site, committed, logged, or accepted from a
browser request. The worker does not accept owner/profile/path values from the
user; those values come from the claimed database row.

## Execution

The container needs Node.js 24, FFmpeg/ffprobe with libvpx-vp9 and libopus,
outbound HTTPS access to the TESTING Supabase API, and these runtime secrets:

- `GAMID_SUPABASE_URL`
- `GAMID_SUPABASE_SERVICE_ROLE_KEY`

Run one remote job and cleanup pass:

```sh
node worker/intro-worker.mjs once
```

Run the approved encoder locally without network access:

```sh
node worker/intro-worker.mjs encode INPUT OUTPUT
```

Recommended initial container allocation is 2 vCPU, 1 GiB RAM (2 GiB gives
safer concurrency/headroom), and at least 512 MiB ephemeral `/tmp` storage.
Source uploads are capped at 150 MiB (157,286,400 bytes) and 30 seconds; derivatives are capped at
15 MiB. Run with concurrency 1 and scale by starting more isolated tasks.

## Google Cloud Run approval and hosting status

Mazen approved Google Cloud Run Jobs in `asia-southeast1`. The scale-to-zero
dispatcher, exact resource plan, least-privilege IAM, and unapplied Supabase
Vault/pg_net trigger template are documented in `cloud-run/README.md`. No Google
project, billing resource, API, service account, secret, image, Job, service, or
webhook has been provisioned because account authorization is still required.

## Wall background video: HEVC/H.265 -> H.264 (same worker, same Job)

`wall-video.mjs` adds a second queue to the SAME worker image and Cloud Run Job.
One execution of `node intro-worker.mjs once` processes one Intro job, or,
when no Intro is waiting, one `wall_video_jobs` row:

1. `worker_claim_wall_video_job()` (service role) returns the private HEVC
   source in `wall-video` and the database-assigned derivative path
   `<owner>/<job>.h264.mp4` in the private `wall-video-derived` bucket.
2. The source is streamed to `/tmp` (never held whole in memory).
3. FFmpeg converts the CODEC ONLY - no scale, crop, pad or aspect change:
   `-map 0:v:0 -c:v libx264 -preset veryfast -crf 20 -profile:v high
   -pix_fmt yuv420p -threads 2 -x264-params rc-lookahead=20
   -fps_mode passthrough -an -sn -dn -map_metadata -1 -movflags +faststart`.
4. ffprobe validates: H.264, yuv420p, MP4, index first (fast start), no audio,
   the SAME width, height and sample aspect as the source, the same frame rate
   and duration, at most 200 MiB. Any resolution change fails the job.
5. The derivative is streamed to storage and
   `worker_complete_wall_video_job(...)` registers it as the owner's video
   asset; the database refuses it if its width / height differ from the
   source's. The HEVC source is then deleted (cleanup candidates). A failed
   job registers nothing and its source / partial derivative are deleted.

Measured on the real 4K background (HEVC Main 3840x2160, 30 fps, 32.2 s,
31.2 MB): 3840x2160 H.264 High@5.1, 966/966 frames, 32.2 s, 55.5 MB, about
42 s with 2 encoder threads on a desktop CPU, peak FFmpeg memory about
1.2 GiB. Cloud Run vCPUs are slower per thread; the expected Job time for
this file is a few minutes, inside the 10-minute timeout. The Edge Function
refuses sources over a budget of 120 s of 4K30 (and anything over 4096 px or
50 MB) before a job exists.

### Enabling it on TESTING (requires Google Cloud access)

Everything in Supabase is deployed; conversion stays OFF (HEVC is refused
exactly as before) until these steps are done by someone with access to the
GamID TESTING Google Cloud project:

1. Build and push a new image from `worker/` (it now also copies
   `wall-video.mjs`) to Artifact Registry `gamid-workers`.
2. Update the Cloud Run Job `gamid-intro-worker-testing` AND the dispatcher
   service `gamid-intro-dispatcher-testing` to that image (the dispatcher now
   also accepts `wall_video_jobs` INSERTs). Resources unchanged: 2 vCPU,
   2 GiB, 10-minute timeout.
3. Run one controlled conversion (`gcloud run jobs execute` after a TESTING
   HEVC upload) and check the Job log, the READY state, the 3840x2160
   derivative and the deleted source.
4. Only then set the Edge Function secret `WALL_VIDEO_TRANSCODE_ENABLED=true`
   (`supabase secrets set ...`) - from that moment HEVC uploads are queued.