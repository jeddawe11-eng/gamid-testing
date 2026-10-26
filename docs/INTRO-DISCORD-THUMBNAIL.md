# Intro Thumbnail for Discord

Status: **deployed on TESTING (2026-10-27), PENDING_ACCEPTANCE** (GamID Truth `intro-discord-thumbnail`). Product commit `02c98c5` on `feature/discord-share-card-v2`, under Mazen's task of 2026-10-26, "Implement Intro Thumbnail Selection for Discord". Deployed under his task "Complete Intro Thumbnail Deployment & Acceptance on TESTING"; see [TESTING deployment](#testing-deployment-2026-10-27) below. Final acceptance needs Mazen's personal check. Not merged; Production untouched.

## What it does

The profile owner picks a frame of their saved Intro. When their GamID link is shared on Discord, that frame shows before Play. Play still runs the whole Intro from 0:00, with the audio in sync.

Discord shows a video's **first frame** as its preview; this is observed behaviour, not documented by Discord. GamID therefore makes a **Discord share copy** of the Intro:
- one frame of the chosen thumbnail;
- then every frame of the Intro, unchanged;
- the audio delayed by exactly that one frame.

This is the technique proven in the 2026-10-26 lab (`th01`), which was checked in Discord Web and in Discord's Embed Debugger (Product Memory REV-0028). The Discord desktop app and phones were not tested in the lab.

## Editor (desktop and mobile)

The Intro section of the Profile Editor gains **Discord thumbnail**. Desktop and the mobile deck show the same panel.
- **Loading:** CHOOSE A FRAME loads the saved Intro, only when the owner asks, so opening the editor downloads nothing extra.
- **Picking a frame:** a slider scrubs the Intro, and ‹ › step one frame. The paused video is the preview of the chosen frame. "Use first frame" returns to the default.
- **Saving:** the choice is saved with the section's **Save Changes** and restored when the editor reopens. Its status line shows one of:
  - the first frame (the default);
  - preparing (the page polls every 4 s for up to 4 min);
  - ready;
  - could not be prepared.
- **When the picker is hidden:** while a new Intro is chosen, being removed or still processing. A frame belongs to one Intro.
- **No image upload:** this phase has no image-upload option.
- **Code:** `dist/account/intro-thumbnail.js`, `dist/account/account.js`, `dist/account/index.html` and `dist/account/account.css`, plus `getMyIntroThumbnail` / `setIntroThumbnail` in `supabase-client.js`.

## Database: `supabase/migrations/20261026120000_intro_discord_thumbnail.sql` (applied on TESTING)

- **The selection:** `profile_intro_settings.thumbnail_job_id` + `thumbnail_ms`.
  - A selection counts only while `thumbnail_job_id` is the active Intro. Replacing or removing the Intro therefore voids it at once, and the new Intro starts at its default.
  - `0` / `null` means the first frame, and needs no share copy.
- **Owner RPCs:**
  - `get_my_intro_thumbnail()`;
  - `set_my_intro_thumbnail(job_id, ms)`. It refuses another Intro (`INTRO_THUMBNAIL_INTRO_CHANGED`) and a time outside the Intro (`INVALID_INTRO_THUMBNAIL`). The same frame again is idempotent. At most 20 copies can be queued per profile per hour (`INTRO_THUMBNAIL_RATE_LIMITED`), because each one starts a worker run.
- **`public.intro_share_copies`:** the registry and queue. States are pending, processing, ready, failed and superseded, with at most one live copy per profile.
  - The claim uses SKIP LOCKED and a per-attempt claim token, with a reclaim after 20 minutes and at most 2 attempts.
  - A copy that is no longer the current selection is superseded at claim time and can never complete.
  - Completion re-checks the object, its size (≤ 15 MiB), the geometry and the duration.
- **Bucket `intro-share-copies`:** private, WebM only, 15 MiB.
  - Its only read path is a storage policy for the **current ready copy of a PUBLIC GamID** (`private.intro_share_is_public`), the same shape as the Intro's own public read.
  - Only the worker writes and deletes.
  - The copy does **not** count toward the owner's 200 MB quota. The Intro derivative still does.
- **Visitors:** `get_public_intro_share(handle)` returns the current ready copy of a PUBLIC GamID, or nothing.
- **Cleanup:** a storage-driven sweep (`worker_intro_share_sweep`) deletes every share object that is not the current ready copy or an in-flight attempt, once it is older than 10 minutes.
- **Dispatch:** a new row calls the existing dispatcher, with the same Vault secrets.

## Worker: `worker/intro-share.mjs` (same image and Job, redeployed on TESTING)

1. Claim a copy and stream the private D3 derivative.
2. Read its frame timestamps.
3. Pick the frame a paused player shows at the chosen time: the last frame presented at or before it.
4. Encode at the **unchanged D3 settings**: VP9 CRF 40, cpu-used 2, Opus 32k.
   - Video: `[chosen frame][whole Intro shifted by one frame]` merged with `interleave`. `concat` cannot be used, because WebM frames carry no duration, so concat would start the Intro on top of the prefix frame.
   - Audio: `adelay` of one frame, counted in samples.
5. Validate. Every Intro frame must come exactly one frame later, with nothing dropped or added, and the codec, geometry, audio, size and duration must match.
6. Upload with the service role and complete.

Any failure leaves Discord on the unchanged Intro.

- **Run order:** Intros first, then share copies, then Wall conversions and renditions. Intro cleanup also sweeps share copies.
- **Wiring:** the dispatcher accepts `intro_share_copies`. The Dockerfile and the Cloud Build allowlist ship the module, and `share-smoke` is the in-image smoke.
- **Local proof:** the real ffmpeg check (`GAMID_NATIVE_FFMPEG=1`) passed at 30, 29.97 and 60 fps:
  - the first frame is the chosen frame;
  - every Intro frame is identical, one frame later;
  - the audio onsets move by one frame (33.3 / 33.4 / 16.7 ms).

  It ran on ffmpeg 7.1. The image's Debian FFmpeg passed `share-smoke` at deployment, and the live copies were checked the same way (below).

## Cloudflare Worker (deployed on TESTING)

- **Card:** with a ready copy, the card's Intro is `/@<handle>/intro-discord.webm?v=<8-hex digest of the copy's path>`. Every new frame is a new URL, which Discord fetches afresh.
- **Without a copy:** the card uses the same `/@<handle>/intro.webm` as before. That route also falls back to the derivative, so an older Discord message never breaks.
- **What does not change:**
  - **og:video:** it stays the derivative for every other platform.
  - **The `/intro.webm` route:** unchanged.
  - **B1:** the same component sequence, purple line images and accent (tested).
- **Lookups:** the page now makes three anonymous lookups (identity, extras, share copy) for every well-formed handle alike.

## Tests

- **`tests/intro-discord-thumbnail-db.test.js`:** the real migration on the real Slice 3C schema, in PGlite. It covers selection, queue, supersede, replacement and removal, the public read, the sweep, the quota, the rate bound and privileges.
- **`tests/intro-discord-thumbnail.test.js`:** the plan, the exact graph, validation, the whole job and its failures, the wiring, the card and share route with B1 unchanged, the picker, and the opt-in native check.

## TESTING deployment (2026-10-27)

Authorized by Mazen's task "Complete Intro Thumbnail Deployment & Acceptance on TESTING". It used the existing infrastructure only: no new project, service or recurring resource.

1. **Migration** `20261026120000` was rehearsed in a rolled-back transaction, then applied in one transaction and recorded with `migration repair` (never `db push`).
   - The rehearsal found storage usage unchanged for every owner and the 3 existing Intros untouched.
   - Live, the bucket is private (WebM, 15 MiB) and both usage functions are patched.
   - Anonymous callers can use only `get_public_intro_share`; the owner and worker RPCs and the table refuse them.
2. **Worker image, Job and dispatcher:** deployed by Mazen in Cloud Shell with `deploy-intro-share-testing.sh ee08a4ac89f6b8816c5ccfdf3210df85108af5d9`.
   - The worker code is identical to `02c98c5`; the head adds only docs and the script.
   - The script verified an image-only change, and `share-smoke`, `f2-smoke` and `rendition-smoke` passed (`INTRO_SHARE_TESTING_WORKER_AND_DISPATCHER_DEPLOYED`).
3. **Site and Worker:** `ee08a4a` deployed by `deploy-cloudflare-testing.yml` run `40358104036` (success, full validation in the run).

### End-to-end check (GM-TEST-01, synthetic media)

**Method:**
- **Persona:** GM-TEST-01 only.
- **Media:** 6 s 720p30 and 5 s 720p30 synthetic clips with a burned-in timestamp and frame counter.
- **Owner actions:** through the real owner RPCs.
- **Visibility:** temporarily PUBLIC for the visitor and Discord checks, then restored to DRAFT.

**Processing:**
- **The Intro:** it was processed by the new image (ready in about 12 s). Its source was cleaned up as before.
- **The share copy:** with a frame at 3.000 s, the copy was ready about 28 s after saving.
- **Frame check:** the copy has 181 frames for the Intro's 180.
  - Frame 0 is Intro frame 90 (SSIM 0.999; 0.934 against frame 0).
  - Every Intro frame follows exactly one frame later (SSIM ≥ 0.989 after the second encode).
  - The audio moves by 33 ms, one frame.
- **Serving:** the Worker's `/intro-discord.webm` serves the copy's exact bytes, and `/intro.webm` the derivative's.
- **The original Intro derivative** is not changed.

**Discord Web** (Mazen's Chrome, #clips-test):
- The preview before Play shows the chosen frame: `00:00:03.000 / 90`, not `00:00:00.000`.
- Play runs the Intro from its start, with sound.
- Open GamID opens `/@gm_test_01`.
- The card keeps B1's three purple line dividers.
- After the frame changed to 1.500 s, a fresh post showed `00:00:01.500 / 45` with a new `?v=` URL.

**Changes:**
- **Changing the frame:** it supersedes the old copy, and the old copy is refused at once.
- **The same frame again:** idempotent.
- **Errors:** a time outside the Intro is refused (`INVALID_INTRO_THUMBNAIL`), and so is another job (`INTRO_THUMBNAIL_INTRO_CHANGED`).
- **Rate limit:** the 21st copy in an hour is refused (`INTRO_THUMBNAIL_RATE_LIMITED`). This was tested in a rolled-back transaction, so no worker runs were started.
- **Replacing the Intro:** voids the selection. The owner sees the default, and the card returns to `intro.webm`. Older Discord URLs play the current Intro.
- **Removing the Intro:**
  - the copy is refused at once;
  - the card has no Intro part (B1 kept);
  - both routes return 404.

**Cleanup:**
- The sweep deletes each superseded, removed or orphaned share object at the first worker run after its 10-minute grace, leaving other owners' current copies.
- There is no schedule for this. One run was started for the check through the existing dispatcher.

**Quota:** in a rolled-back probe, a share object added 0 bytes to usage, while an Intro object counted in full.

**Not tested by the agent** (the agent never signs in):
- the signed-in editor picker on desktop and on mobile;
- the Discord desktop app;
- Discord on a phone.

These are left for Mazen's personal check.

**Still open:** the Cloudflare video-terms question (REV-0028, proposed ISS-0018). It now also covers the share copy streamed through the Worker.

## Known limits

- **Removing an Intro:** its share object is deleted at the next worker run, not at once. It is never served after removal, because the public read requires the current selection.
- **Second encode:** the share copy is a second VP9 encode of the derivative, at the same CRF 40, so it is slightly softer than the stored Intro.
- **Discord's cache:** Discord caches a preview per message. A changed frame shows when the link is posted again.
