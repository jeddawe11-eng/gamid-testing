# Infrastructure Optimization & Security Hardening V1 (TESTING, 2026-10-27)

Mazen's task "GAMID — Infrastructure Optimization & Security Hardening V1". It is TESTING only, on branch `feature/discord-share-card-v2`, which is not merged. The starting evidence is the infrastructure cost study (Product Memory REV-0030).

**Status:**
- **Implemented:** product `bcbdc7d`.
- **Applied:** migrations `20261027120000` and `20261027120100`, on TESTING.
- **Deployed:** site and Worker, by run `40507974877`.
- **Not deployed:** the worker image and the dispatcher, which need Mazen in Cloud Shell. The poster is therefore inert for every real account.
- **Truth:** `public-intro-poster` and `public-media-route-protection` are PENDING_ACCEPTANCE.

## 1. Public Intro still poster

**Problem.** The public Intro waits for Play (DEC-0012). Its waiting frame was the playback derivative seeked to the chosen time. That seek downloads part of the video on every visit, even when the visitor never presses Play, and again on every repeat visit, because each visit gets a fresh signed lease.

**Design.** A WebP still of exactly that frame, generated server-side by the existing worker Job.

| Part | Where |
|---|---|
| Queue, registry, storage policy, lookup, worker RPCs, sweep, quota exclusion, dispatch trigger | `supabase/migrations/20261027120000_intro_posters.sql` |
| Generation | `worker/intro-poster.mjs`, run before share copies in `processOneRemoteJob`; in-image smoke `node intro-worker.mjs poster-smoke` |
| Dispatcher allowlist | `worker/intro-dispatcher.mjs` (`intro_posters`) |
| Image build | `worker/Dockerfile`, `worker/cloud-run/usage-testing.gcloudignore` |
| Visitor page | `getPublicIntroPoster` in `dist/account/supabase-client.js`; `dist/public/public.js` |
| Player | `showStill` / `mediaSize` in `dist/account/intro-preview.js` |

**The frame.**
- It is the last frame presented at or before the time, the share copy's rule; 0 means the first frame.
- It is taken at the derivative's own size, never resized or cropped.
- For square pixels only: any other aspect ratio is refused.

**Colour.** Measured in Chrome against the paused video (`poster-lab`). PSNR is the poster vs the video frame, at native size.

| Clip | BT.709 conversion | BT.601 conversion |
|---|---|---|
| Untagged 1920×1080 | 41.7 dB | 28.5 dB |
| Untagged 640×360 | 41.3 dB | 24.5 dB |
| Untagged 1080×1920 | 42.8 dB | 24.3 dB |
| BT.601-tagged 1280×720 | 24.2 dB | **45.2 dB** |

- **Rule:** untagged or BT.709 uses BT.709; smpte170m / bt470bg uses BT.601.
- **Refused:** HDR (PQ/HLG), BT.2020 and other tags, with `POSTER_COLOR_UNSUPPORTED`. The page then keeps seeking.
- **Encoding:** WebP at quality 90, falling back to 75 only if 90 exceeds 1 MiB.
- **Sizes measured:** 12–160 KB.

**Player.**
- With a poster, the same `<video>` element shows it through its `poster` attribute, with `preload="none"` and no seek. Fit, ambient glow and landscape hint come from the poster's size, which is the Intro's own.
- Play sets 0:00 and plays; the poster stays until the first frame.
- Without a poster, or if the lookup or read fails, the behaviour is exactly as before.
- Replay never uses a poster. A lease renewal keeps the poster on screen while it loads.

**Access.**
- `get_public_intro_poster(handle)` keeps the earlier frame decision: the chosen frame while its share copy is ready, else the first frame.
- The poster object is readable anonymously only for a current, ready poster of a PUBLIC GamID.
- It is stored `no-cache`, so every read revalidates and re-checks the policy.
- DRAFT and PRIVATE GamIDs, replaced Intros and changed frames return nothing (verified).

**Lifecycle.**
- Posters are queued only by the database: an Intro becoming active, or a frame being chosen.
- At most 20 per profile per hour.
- They are superseded once no longer current, and deleted by the storage-driven sweep after 10 minutes.
- They do not count toward the 200 MB quota. The 60 assets / 15 videos limits and subscriptions are unchanged.

### Validation (Claude Code)

- **Unit and source tests.** `tests/infra-hardening-v1.test.js`: 17 tests. `npm run build`: 2,279 tests, 0 failures.
- **The worker's real output against Chrome's paused frame.** Five cases, including a time between two frames: 41.3–45.2 dB, at most 0.53% of pixels off by more than 12.
- **End to end on TESTING, fixture GM-TEST-01.**
  - **Setup:**
    - a synthetic 6 s 1280×720 Intro, with D3, share copy and posters made by the same worker code locally;
    - posters completed through the real `worker_claim` / `worker_complete` RPCs;
    - made PUBLIC temporarily, then restored to DRAFT.
  - **Results:**

    | Check | Desktop | Mobile (Pixel 7) |
    |---|---|---|
    | Bytes before Play: poster mode | 33.8 KB, 0 video bytes | 33.8 KB, 0 video bytes |
    | Bytes before Play: earlier seek mode | 1,157 KB of video | 1,216 KB of video |
    | Repeat visit before Play | 0 bytes (revalidated) | 0 bytes (revalidated) |
    | Same frame on screen: whole screen | 46.8 dB | 32.9 dB |
    | Same frame on screen: foreground / ambient | 46.5 / 51.5 dB | 29.1 / 50.3 dB |
    | Play | from 0.004 s, unmuted, audio decoding; the video loads only after Play | from 0.007 s, the same |
    | Intro end | the profile, Replay visible (the fixture has no published Wall, so Classic) | the same |
    | Replay | plays at once, no poster | the same |
    | Skip before Play | 0 video bytes | 0 video bytes |

- **Phone difference.** It is Chrome's image-scaling filter against its video-scaling filter when a 1280-px frame is shown at 1082 device pixels.
  - **Noise floor:** paused video vs paused video is exact (138 dB).
  - **Other clips:** a smooth clip and the repo's prototype clip give 32.8–36.3 dB at phone size and 43 dB on desktop.
  - **Canvas drawing:** drawing the poster on a canvas with bilinear smoothing does not close the gap.
  - **Visibility:** not visible at 2× zoom. Same frame, crop, aspect ratio and layout; only sub-pixel edge filtering differs.
  - **Decision:** for Mazen's visual acceptance.
- **Regression.** @black, anonymous and read-only, has no poster. It waits on its 4.402 s frame exactly as before, with the same Intro bytes and the Discord card and `og:video` unchanged.

### Acceptance gate (migration `20261027140000`, product `5ddb18c`; applied)

Requested by Mazen before the worker deployment: until his visual acceptance, no real account may receive a poster.
- **Who:** `private.intro_poster_activation` lists the profiles that may have posters. It holds the GM-TEST-01 fixture alone, and the migration aborts unless exactly one profile matches.
- **Where it is enforced:**
  - queueing: `enqueue_intro_posters`, which the trigger and the backfill both use;
  - claiming: other profiles' rows are superseded with `INTRO_POSTER_NOT_ACTIVATED`, never claimed;
  - completing: refused with `INTRO_POSTER_NOT_ACTIVATED`;
  - serving: the lookup and the storage read policy.
- **Every other account:** the lookup returns the same frame with no poster, so the page seeks the video exactly as before.
- **Verified:**
  - a rolled-back rehearsal, 11 of 11 checks, including a simulated backfill over every active Intro;
  - the real worker poster code, run locally against TESTING, generated fixture posters only (1000 ms, then 2000 ms, byte-identical to before);
  - the fixture visitor E2E on desktop and mobile;
  - 0 poster rows and 0 poster objects for real accounts.
- **Lifting it:** a later migration making `private.intro_poster_activated` true for every profile. Adding a profile is one insert. Both need Mazen's approval.

### Worker deployment (done 2026-10-28, `PROJECT_HANDOFF.md` §142)

- **Deployment:** Mazen deployed from `7c9b891`.
- **Automatic generation:** for GM-TEST-01, the real dispatcher (202) and Cloud Run worker produced its posters 10–17 s after each frame change, on the first attempt.
- **Visitor E2E:** desktop and mobile pass, with the same results as the table above.
- **Other accounts:** none has a poster.

### Activation (Mazen; step 1 done)

1. In Cloud Shell, run:

   ```
   worker/cloud-run/deploy-intro-poster-testing.sh <checkpoint>
   ```

   - The checkpoint must be `3d55ef9` or later.
   - The gate is in the database, so it applies whatever the image.
   - The script:
     - rebuilds the image with `intro-poster.mjs`, and the dispatcher that accepts `intro_posters`;
     - verifies an image-only update;
     - runs `poster-smoke`, `share-smoke`, `f2-smoke` and `rendition-smoke`.
2. Visually accept on real phones and desktop, on GM-TEST-01. It keeps the synthetic Intro, as a DRAFT.
3. With separate approvals:
   - lift the gate;
   - then queue posters for existing Intros with `worker/cloud-run/intro-poster-backfill.sql`. While the gate is in place, it reaches only GM-TEST-01.

### Rollout to all TESTING accounts (done 2026-10-28, `PROJECT_HANDOFF.md` §146)

- **Authorization:** Mazen accepted the poster on @black (§145) and then authorized the rollout.
- **Migration `20261028120000`** (product `ef1eef2`; applied) adds the switch `private.intro_poster_rollout.all_accounts = true`.
  - While the switch is on, `private.intro_poster_activated` is true for every profile, so new accounts, Intros and frame choices are queued automatically.
  - The review list (GM-TEST-01, @black) still applies when the switch is off.
- **Rollback:** `update private.intro_poster_rollout set all_accounts = false, updated_at = now();`
- **Backfill:** run one profile at a time.
  - @nmk and @zshot: 1 poster each, ready in 18 s and 10 s.
  - @black and GM-TEST-01 already had theirs.
- **Coverage:** 4 of 4 active Intros, 0 failed, 1.0 MB of posters.
- **Measured:** 0 Intro video bytes before Play on desktop and mobile, against 0.11–1.22 MB per visit before for @nmk / @zshot. The table is in §146.
- **Unchanged:** the frame, Play, Skip, Replay and routing.
- **Fallback:** a failed poster read falls back to the paused video.

## 2. Media route hardening (Cloudflare Worker; deployed)

These routes are `/@<handle>/intro.webm` and `/intro-discord.webm`. Only link crawlers need them; visitors use signed leases.

- **Range.** One well-formed byte range or none; anything else is 416 before any lookup.
- **HEAD.** Headers only; the upstream body is cancelled.
- **Rate limits.** The Workers Rate Limiting binding (`wrangler.jsonc` `ratelimits`); approximate, and per Cloudflare location.
  - **Media:** 120 per minute per IP and handle.
  - **Discordbot:** 1,200.
  - **Page:** 300 per minute per IP.
  - **Over the limit:** 429 with `Retry-After: 60` and `no-store`.
  - **Failure mode:** fail open.
- **Plan.** Accepted on the current plan: no paid service.
- **Live checks:**
  - multi-range / reversed ranges: 416;
  - a single range: 206;
  - HEAD and the page: 200;
  - a 140-request burst on an unknown handle: 126 × 404, then 14 × 429;
  - another handle: unaffected.
- **Not configured.** Edge caching, WAF and bot rules need a Cloudflare zone (custom domain). workers.dev has no edge cache.

## 3. pg_cron run log retention (applied)

- **The cause.** `cron.job_run_details` had 38,118 rows / 22 MB, the largest table. They come from the one-minute `play-together-voice-reconcile-testing`, whose frequency is kept per its setup guide.
- **The change.** Migration `20261027120100` adds `gamid-cron-log-retention` at 03:17 UTC daily. It deletes finished rows older than 7 days.
- **Run once:** 38,118 rows went to 10,080, and the oldest is now 2026-10-20. Both jobs are active, and the reconcile keeps running.
- **Space.** Reused through autovacuum; no VACUUM FULL was run.

## 4. Media efficiency: evaluated, not changed

| Item | Measured | Why not changed |
|---|---|---|
| Animated sticker catalog | 14 animated WebP, 1.2–3.3 MB each (33 MB); 13.8 MB on @black's mobile Wall | Served free from Cloudflare static assets, but heavy on phones. Re-encoding changes accepted catalog assets and needs a decoder not available here. Proposal for Mazen. |
| Wall video | 7.6 MB desktop / 20.9 MB mobile after Skip on @black, mostly Supabase MISS | Shared, CDN-cacheable leases are a contract change (visitor-media-leases). |
| Wall pictures, avatars, banners | 2.4 + 0.7 MB on @black, mostly HIT, `private, no-cache` | Display copies / responsive sizes (F7-B) need a decision. |
| Intro encoding | Accepted D3 (VP9 CRF 40, Opus 32k) | Accepted contract; not changed. |

## 5. Cost (modelled; users = visits / 100)

Scenario inputs are assumptions; list prices are official. A = current architecture; A1 = current + poster; B = all media on R2 behind a Worker (needs a custom domain and Workers Paid).

| Visits / month | Low: A | Low: A1 | Low: B | Typical: A | Typical: A1 | Typical: B | Heavy: A | Heavy: A1 | Heavy: B |
|---|---|---|---|---|---|---|---|---|---|
| 100k | $35 | $35 | $35 | $35 | $35 | $35 | $151 | $150 | $38 |
| 1M | $111 | $96 | $84 | $330 | $309 | $107 | $1,598 | $1,579 | $180 |
| 10M | $919 | $770 | $382 | $3,125 | $2,909 | $638 | $15,809 | $15,616 | $1,410 |
| 100M | $11,224 | $9,735 | $5,801 | $33,284 | $31,123 | $8,367 | $160,126 | $158,193 | $16,089 |

- **The poster.** It saves 0.12–0.18 MB per visit, from about 0.4 to 0.03 MB of Intro egress before Play: 1–17% of the total.
- **The dominant cost.** Uncached Wall video and Intro egress from Supabase.
- **R2 break-even.** Around 1M visits/month in the typical scenario, as in the study. Not implemented, not authorized.
