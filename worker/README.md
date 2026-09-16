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
Source uploads are capped at 100 MiB and 30 seconds; derivatives are capped at
15 MiB. Run with concurrency 1 and scale by starting more isolated tasks.

## Hosting status

No external host, billing account, scheduler, webhook, or continuous worker has
been provisioned. The image is deliberately portable. Hosting approval is a
separate Mazen decision.
