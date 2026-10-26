---
id: REV-0028
title: Discord video cache and bandwidth investigation (isolated lab)
status: COMPLETED
created: 2026-10-26
updated: 2026-10-26
scope: Discord link previews of externally hosted Intro share videos; measured in the isolated gamid-social-lab Worker and Mazen's #clips-test channel with synthetic media only
summary: Claude Code measured that Discord does not cache linked videos (a new preview fetches the file twice, every play by every viewer fetches it again through Discord's media proxy) and estimated monthly costs; the proposed R2 + Worker share-copy architecture is a recommendation only, not a decision or authorization, and the Cloudflare terms question is unresolved.
related: [REV-0021, REV-0022, IDEA-0003, DEC-0004]
save_approval: Mazen 2026-10-26
review_type: AUDIT
outcome: INCONCLUSIVE
reviewer: Claude Code (lab measurement and analysis)
truth_refs: [intro-identity]
checkpoints: []
sources: [cf-worker/worker.mjs, docs/WALL-BANDWIDTH-F6-F8-PLAN.md, product-memory/ideas/IDEA-0003-gamid-discord-lfg-bot.md]
---

## Subject

Whether Discord caches externally hosted Intro videos and reuses them across shares, viewers and playback sessions, or keeps downloading them from GamID's infrastructure; what that costs; and which delivery architecture is cheapest while keeping the full share card and inline playback.

Lab only: no TESTING or Production change, no real profiles or videos, no infrastructure or paid-service change. Nothing is implemented, decided or authorized by this record. `outcome: INCONCLUSIVE` because the architecture question stays open until the Cloudflare terms question below is answered.

## Method

- **Lab:** the isolated Worker `gamid-social-lab` (version 0a1194f9) served synthetic 8 s thumbnail-first share copies as Workers Static Assets. The Worker log recorded each request (Discord crawler Discordbot/2.0 vs Discord's media proxy, which reaches the origin from Cloudflare-network addresses), its Range, and the bytes actually streamed.
- **Files:** 1080p H.264 MP4, 1,742,677 B; 4K VP9 WebM, 21,045,962 B. Two cache policies on the same 1080p file: `max-age=300` without ETag, and `max-age=31536000, immutable` with ETag / Last-Modified and 304 support.
- **Discord:** new messages in Mazen's #clips-test on Discord Web, his own existing session (no sign-in, no app or bot created, no existing message edited or deleted). Plays driven in the page.
- **Second viewer:** a logged-out client fetching the same media-proxy URL. No second Discord account was used.
- **Prices:** fetched from the providers' pricing pages on 2026-10-26.

## Results

**Measured (lab):**

| Test | Requests to origin | Bytes |
|---|---|---|
| First share, 1080p | crawler: page, avatar, banner, video twice | 2 × 1,742,677 video + 43,314 images |
| Same URL re-shared twice within about 1 minute | 0 | 0 |
| New page URL, same video URL | crawled again; no conditional request despite the ETag | 1,742,677 video + images |
| First share, 4K WebM | video twice | 42,091,924 |
| First play, 1080p | 3 Range requests through the proxy | 3,491,327 measured (about 2× the file) |
| First play, 4K WebM | 1 request | 21,045,962 (1× the file) |
| Replay; play in another message (same proxy URL) | 0 | 0 (browser cache) |
| Play after reload, 1080p (both cache policies) | 3 each | about 3.49 MB each |
| Play after another reload, 1080p immutable / 4K | 1 / 0 | 853 / 0 |
| Second client, same proxy URL fetched twice | 2 full fetches | 2 × 1,742,677 |

**Confirmed:**
- A new preview downloads the video twice in full. A new page URL is a new preview.
- The crawler never sends conditional requests, so ETag / Last-Modified don't help it.
- Discord's media proxy does not cache video. It passes our Cache-Control, ETag and Last-Modified through, but every request through it reaches the origin.
- A play costs 1× (WebM) to about 2× (MP4) the file. Same-viewer replays are often, not reliably, served by the browser cache; the immutable header did not prevent a re-download after a reload.
- Production delivery today: `cf-worker/worker.mjs` `handleIntroRequest` passes Intro requests through to Supabase Storage with `max-age=60`. Every Discord fetch would therefore be Supabase egress. (Bytes served by a Worker are not billed by Cloudflare; bytes the Worker fetches from Supabase are billed by Supabase.)

**Inferred:**
- Every other viewer costs a full play download (from the second-client test; no second Discord account was tested).
- The two crawler fetches are probably metadata and preview-frame generation.

**Unknown:**
- How long Discord reuses a preview for the same URL (only checked within about 1 minute), and whether it reuses it across servers.
- Real multi-account behaviour.
- Real Intro share-copy sizes (the lab files are 8 s synthetic).
- Which Supabase rate (cached or uncached) applies to the authenticated Intro endpoint.

**Discord documentation (read 2026-10-26, not tested):**
- No documented way for an ordinary link preview to have Discord host the video.
- Attachments: 20 MiB per file by default; signed URLs that expire and that the client refreshes.
- `attachment://` is documented for embed images (jpg, png, webp, gif) and for the File component; whether a Media Gallery item accepts it was not confirmed.
- Components V2 need the IS_COMPONENTS_V2 flag. Webhooks not owned by an application can send only non-interactive components (with `with_components`).
- An attachment flow therefore needs a bot, app or webhook as the message author, not a pasted link, and a 4K copy would not fit the default limit.

**Provider prices (verified 2026-10-26):**
- **Supabase:**
  - Pro: 250 GB uncached + 250 GB cached egress included, then $0.09/GB uncached and $0.03/GB cached.
  - Free: 5 GB + 5 GB, then a grace period.
  - The Pro base price was not re-checked.
- **Cloudflare Workers:**
  - Free plan: 100k requests/day.
  - Paid plan: $5/month including 10M requests, then $0.30 per million.
  - No egress or bandwidth charge; static-asset requests are free.
- **Cloudflare R2:**
  - $0.015/GB-month storage.
  - Class A operations $4.50 per million, Class B $0.36 per million.
  - Free each month: 10 GB storage, 1M Class A and 10M Class B operations.
  - Egress through Workers is free.

**Financial estimate:**

Assumptions:
- A 30 s Intro is about 20 MB as a 1080p share copy and about 50 MB as 4K (the 50 MiB source limit).
- Each share is a new preview (2× the file).
- A play costs 2× the file for 1080p MP4 and 1× for 4K WebM.
- 1,000 profiles × 10 / 100 / 1,000 shares a month gives 10k / 100k / 1M shares.

Bytes fetched from storage per month:

| Plays per share | Format | 10k shares | 100k | 1M |
|---|---|---|---|---|
| 1 | 1080p | 0.8 TB | 8 TB | 80 TB |
| 1 | 4K | 1.5 TB | 15 TB | 150 TB |
| 5 | 1080p | 2.4 TB | 24 TB | 240 TB |
| 5 | 4K | 3.5 TB | 35 TB | 350 TB |

Costs:
- **On today's Supabase path, at the uncached rate after the included 250 GB:**
  - from about $50 / $700 / $7,200 a month (1080p, 1 play per share);
  - to about $290 / $3,100 / $31,500 a month (4K, 5 plays per share);
  - about one third of that if the cached rate applied.
- **R2 behind a Worker:** about $0–$6 a month at every row.
  - Egress is $0.
  - About 8M Worker requests at 1M shares, inside the paid plan's 10M.
  - Class B operations stay inside the free tier.
  - Storage is about $1.
- **Discord-side caching:** saves nothing.

**Proposed architecture (recommendation only; not approved or authorized):**
- **Card:** keep the link-preview share card with inline playback.
- **Video:** serve only a 1080p H.264 thumbnail-first, fast-start share copy, never the 4K file.
- **Storage:** from Cloudflare R2 through a Worker, so Supabase egress is not involved.
- **URLs:** a stable, versioned URL per Intro version with a long-lived immutable cache header, and a stable profile share URL so previews are reused.
- **Not needed for cost:** a Discord bot / attachment flow (IDEA-0003). It would change the UX: an app-authored message, a 20 MiB limit, and expiring URLs.

## Follow-up

- **Unresolved Cloudflare terms question:**
  - Cloudflare's service-specific terms restrict serving video through the CDN without Paid Services and name the Developer Platform, Images and Stream as examples.
  - They do not explicitly mention R2 or Workers.
  - This must be confirmed before any R2 + Worker video delivery is built. It is the same open question recorded in `docs/WALL-BANDWIDTH-F6-F8-PLAN.md`.
- **Open measurements:**
  - the preview cache duration and cross-server reuse;
  - real multi-account plays;
  - real Intro share-copy sizes;
  - the Supabase rate class for the Intro endpoint.
- **Authorization:** any implementation needs Mazen's separate, explicit task authorization.

**Reconciliation (2026-10-26, Mazen's authorized correction, after the read-only storage audit the same day).** The measurements, limitations, assumptions and recommendation above are unchanged and describe the lab investigation.

- **The stored Intro is not 4K.** GamID Truth `intro-identity` / `intro-derivative-d3` caps the stored Intro playback derivative at 1920 × 1080 (VP9/WebM CRF 40) and 15 MiB. Example: @black's is 6,965,053 B.
- **The 4K / 50 MB rows are hypothetical.**
  - "4K" refers only to the lab's synthetic 4K WebM test file and to a hypothetical Intro the size of the 50 MiB *upload* limit.
  - They do not represent the current Discord Intro delivery.
  - Today, `/@<handle>/intro.webm` (`og:video`) passes that ≤1080p, ≤15 MiB derivative through from Supabase Storage.
- **Current costs are bounded by the 15 MiB ceiling.** For current delivery, the per-share and per-play multipliers above (2× per new preview, 1–2× per play) apply to the real derivative size, at most 15 MiB.
- **Not corrected:** the 1080p rows' 20 MB is an assumed share-copy size, unchanged.
- **The audit also confirmed** that no R2 is in use. R2 is not enabled on the visible Cloudflare account, and no branch has an R2 binding.

## History

- 2026-10-26 COMPLETED — Claude Code lab investigation saved with Mazen's explicit approval as a review only; the architecture is a recommendation, nothing implemented or authorized; GamID Truth unchanged.
