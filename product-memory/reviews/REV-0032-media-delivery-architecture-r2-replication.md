---
id: REV-0032
title: Media delivery architecture review - Supabase authoritative, visitor video replicated to private R2 when READY (Architecture F)
status: COMPLETED
created: 2026-10-28
updated: 2026-10-28
scope: Storage and delivery of every visitor-facing media type on TESTING (Supabase Storage, public-media leases, Cloudflare Worker, Cloud Run worker): R2 hybrid variants vs direct R2 migration, modelled monthly cost at 100k-100M visits, security model, migration and rollback; design only
summary: PASS (design) - Architecture F recommended and approved by Mazen as a design decision on 2026-10-28. Supabase stays authoritative; every visitor-facing video is replicated asynchronously to a private R2 bucket when READY and delivered by a Worker from the verified replica, with Supabase fallback. Modelled typical cost is 58-65% below today ($2,892 -> $999 at 10M visits/month). NOT implemented and NOT authorized.
related: [REV-0030, REV-0028, REV-0031, ISS-0019, ISS-0009, DEC-0007, DEC-0013]
save_approval: Mazen 2026-10-28
review_type: DESIGN
outcome: PASS
reviewer: Claude Code (architecture and cost review); Mazen (design approval)
truth_refs: [visitor-media-access, intro-streaming-f5, wall-video-url-reuse, wall-video-renditions, wall-video-faststart, public-intro-poster, public-intro-manual-play, intro-discord-thumbnail, discord-share-card, public-media-route-protection, global-usage]
checkpoints: [801bb2b7332b6af732d7c6432d49b307855317e5]
sources: [docs/INFRA-OPTIMIZATION-V1.md, product-memory/reviews/REV-0030-infrastructure-cost-study.md, product-memory/reviews/REV-0028-discord-video-cache-bandwidth-investigation.md, supabase/functions/_shared/public-media.js, cf-worker/worker.mjs]
---

## Subject

**Mazen's request.** A research-only task on 2026-10-28, "Media Infrastructure Architecture & Cost Optimization Review". It asked for the cheapest long-term storage and delivery architecture for GamID media that preserves security, quality and every accepted contract.

**The concept to evaluate.** A Supabase-primary store with Cloudflare R2 as a persistent secondary delivery store, together with its variants and alternatives.

**What it built on.** It extends REV-0030, the earlier cost study, without repeating it, and accounts for what is now live on TESTING:
- the public Intro poster for every account (REV-0031);
- F5 / F6-A leases;
- F8-A / F8-B1;
- the route protection (ISS-0019).

## Method

- **State checked.** Truth capabilities and contracts, the delivery code, and the live TESTING state, read-only:
  - Storage: 99 MB in total. The largest buckets are wall-video 57.8 MB, intro-media 25.1 MB, intro-share-copies 6.3 MB and intro-posters 1.0 MB.
  - R2 is still not enabled: `wrangler r2 bucket list` returned code 10042 on 2026-10-28.
  - The delivery code has a single choke point: `public-media` issues every visitor video lease, and the two crawler routes go through the Worker.
- **Provider facts.** From official pages fetched 2026-10-28:
  - R2 and Workers pricing;
  - Supabase egress and Smart CDN;
  - Cloudflare cache behaviour and the Cache API;
  - R2 custom domains;
  - the Application Services and Developer Platform terms;
  - Cloudflare's 2023 terms-update post;
  - bunny.net pricing (as an alternative).
- **Cost model.** The REV-0030 scenarios (low / typical / heavy; users = visits / 100), with the live poster folded in. Every figure is modelled, not an invoice.

## Results

### Verified provider facts

- **R2 Standard:**
  - storage $0.015 per GB-month;
  - Class A operations $4.50 per million, Class B $0.36 per million;
  - **egress $0**;
  - free each month: 10 GB, 1M Class A, 10M Class B.
- **Workers Paid:**
  - $5 per month, including 10M requests, then $0.30 per million;
  - no egress charge;
  - Workers run before the cache, so every request is billed.
- **Workers Free:** 100k requests per day.
- **Supabase egress:**
  - $0.09 per GB uncached and $0.03 per GB cached;
  - after 250 + 250 GB on Pro (5 + 5 GB on Free).
- **Supabase Smart CDN** keys the cache on the signed-URL token. This explains why a first visit to Wall video is always a MISS.
- **Cloudflare cache:**
  - files up to 512 MB are cacheable, and mp4 / webm are cached by default;
  - `cache.put` refuses a 206, but `cache.match` serves a Range from a full cached object;
  - the cache is per data centre;
  - the documentation guarantees the Cache API only on custom domains;
  - r2.dev is for development only.
- **Terms:** Cloudflare's official 2023 post allows video on the CDN when it is hosted by a Cloudflare service, naming Stream, Images or R2. The current legal text names "the Developer Platform" as an example of such paid services. The REV-0028 terms question is therefore largely resolved; a written confirmation remains optional.

### Variants evaluated

| Variant | Verdict |
|---|---|
| B. Read-through (lazy copy on first request) | Rejected; reasons below the table. |
| C. Replication above a popularity threshold | Rejected. The duplicate storage it saves is negligible ($0.015/GB, at most 200 MB per user), unpopular video stays at Supabase rates, and it adds popularity counters. Typical cost at 10M visits is $1,132–1,970, depending on the popularity split. |
| Write-through on upload | Adopted for the outputs the Cloud Run worker produces itself. |
| **F. Asynchronous replicate-on-READY of every visitor-facing video, Supabase authoritative** | **Recommended**, as described in the next section. |
| D. R2 primary for video | Later. About $108/month cheaper than F at 10M visits, but it rewrites upload, quota, delete, fast start, renditions and HEVC conversion, and rollback is harder. It is reachable from F by switching the upload target. |
| E. All media on R2 | Not now. Images carry per-read visibility contracts. It saves about $170–280/month over D at 10M visits. |
| R2 primary with Supabase fallback | Rejected: it combines D's complexity with two sources of truth. |
| Cloudflare Stream, bunny.net, Backblaze B2 behind Cloudflare | Rejected. Stream bills per minute (Wall loops about $24k/month at 100M visits); bunny charges $0.01–0.06/GB; B2 is hosted outside Cloudflare, so the CDN video restriction applies. |

Read-through (B) was rejected because:
- **Same cost:** it costs about the same as F.
- **No complete copy:** browsers send Range requests, so the copy needs a separate full fetch, which doubles the first-view cost exactly when a profile goes viral.
- **More machinery:** it needs locking against concurrent copies and verification of incomplete copies, within Worker time limits.
- **First viewer:** the first viewer is always served from Supabase.

### Modelled monthly cost, typical scenario (USD)

| Visits / month | A current | B | C | D | E | **F** |
|---|---|---|---|---|---|---|
| 100k | 35 | 36 | 36 | 36 | 36 | **36** |
| 1M | 307 | 128 | 151 | 126 | 115 | **128** |
| 10M | 2,892 | 1,047 | 1,341 | 891 | 718 | **999** |
| 100M | 30,952 | 12,519 | 15,455 | 10,951 | 9,151 | **12,033** |

- **Heavy scenario, A → F:**
  - 1M visits: $1,563 → $291;
  - 10M visits: $15,449 → $2,742;
  - 100M visits: $156,531 → $29,483.
- **Low scenario at 10M visits:** $761 → $472.
- **F at 10M visits (typical), by line:**

  | Line | USD / month |
  |---|---|
  | Supabase egress (mostly images and API) | 273 |
  | R2 | 25 |
  | Workers | 10 |
  | Cloud Run (processing and one more upload; assumed) | 366 |
  | Supabase base and compute | 284 |
  | Storage | 40 |

  The remaining cost is compute, processing and images, not video.
- **Break-even (F cheaper than A):**
  - about 144k visits/month (typical);
  - about 21k (heavy);
  - about 800k (low).
- **F savings against A (typical):** $179 / $1,893 / $18.9k per month at 1M / 10M / 100M visits.
- **Events (incremental cost):**

  | Event | Supabase uncached | Supabase best cached | R2 + Worker |
  |---|---|---|---|
  | A viral heavy Wall, 1M visits in a day (about 22.5 TB) | $2,029 | $676 | about $2.4 |
  | Discord: 10k new shares and 500k plays of a 6.3 MB share copy | $437 | $146 | about $0.6 |

### Architecture F (approved design)

- **Source of truth.** Supabase Storage stays authoritative, and the upload target. Uploads, quotas, Usage, delete flows and visibility rules are unchanged.
- **Replication when READY.** Each visitor-facing video (Intro derivative, Discord share copy, Wall video original, rendition, HEVC-derived copy) is copied asynchronously to a private R2 bucket. There is no r2.dev access and no public bucket.
  - **How it is copied:** through the existing database trigger, dispatcher and Cloud Run Job. Worker-produced outputs are written directly; Wall originals are copied by a replicate job.
  - **Verification:** size and SHA-256.
  - **State:** recorded in a replica table (pending / ready / failed / superseded).
  - **Cleanup:** extended storage-driven sweeps.
- **Delivery.**
  - **Lease issuer:** `public-media` remains the only lease issuer, with the same `public_media_lease_allowed` predicate and the same server-chosen lifetimes (Intro 120 s, Wall video 6 h).
  - **R2 replica ready:** it returns a Worker URL signed with HMAC over bucket, path and expiry, and the Worker serves the verified replica from an R2 binding with Range, HEAD and ETag.
  - **Replica not ready:** it returns today's Supabase lease. A Supabase fallback is also returned for a failed R2 read.
  - **Crawler routes:** the Intro crawler routes (`intro.webm`, `intro-discord.webm`) read the replica too.
- **Stays on Supabase:** images (posters, avatars, Wall pictures, banner) and fonts.
- **Switch and rollback.** A per-bucket database switch with a pilot allowlist, on the pattern of the poster rollout. Switching it off returns every lease to Supabase at once, without touching any original.
- **Contracts that must keep their behaviour** (their wording is amended only after acceptance):
  - visitor-media-access, intro-streaming-f5, wall-video-url-reuse (F6-A), wall-video-renditions, wall-video-faststart;
  - public-intro-poster, public-intro-manual-play;
  - intro-discord-thumbnail, discord-share-card, public-media-route-protection;
  - global-usage: replicas are internal and not quota-counted, as renditions are; this needs Mazen's approval.

### D2, D3 and D5, evaluated separately

| Proposal | Verdict |
|---|---|
| D3 (CDN-cacheable Supabase Wall leases) | Not needed under F, and it would require leases shared between visitors. |
| D2 (stable Intro URL) | Under F it saves no egress; an optional repeat-visit speed improvement only. |
| D5 (picture and avatar display copies) | Still useful, since images stay on Supabase: about $110/month at 10M visits. Independent of R2. |

None of them is a prerequisite.

### Risks and open points

- **Workers Free limit.** 100k requests/day counts every video Range request: enough for TESTING; Workers Paid is required before Production.
- **No custom domain yet.** Without one there is no edge cache or WAF. That is acceptable for a pilot, because R2 binding reads work on workers.dev and Class B reads are cheap.
- **Worker as the authorization point.**
  - It must verify tokens correctly.
  - An HMAC key leak is mitigated by a dedicated key with a `kid` for rotation.
  - Divergence between the copies is controlled by hash verification and sweeps.
- **Safari / iOS Range behaviour** through the Worker must be tested.
- **Unverified inputs:**
  - the actual Supabase plan and billing on TESTING (not readable);
  - the exact Cloud Run Tier-2 and GCP internet egress prices (modelled at $0.12/GB);
  - whether R2 activation asks for a payment method;
  - Cache API behaviour on workers.dev;
  - the behaviour assumptions carried from REV-0030.

## Follow-up

- **Mazen's decision (2026-10-28).** He approved Architecture F as a design decision, and approved saving this review.
- **Not authorized:**
  - implementation;
  - R2 activation, bucket creation, credentials or secrets, IAM;
  - Worker or Cloud Run deployment, DNS or Cloudflare settings;
  - moving or deleting media;
  - Production.

  Each needs a separate explicit authorization.
- **Smallest pilot (proposed, not authorized).** The Intro and Discord share copy of the GM-TEST-01 fixture only, on TESTING (workers.dev), behind the switch, with Supabase fallback.
- **Not recorded in GamID Truth.** Truth records only capabilities implemented on TESTING, so this approved but unbuilt design is not there. Contract amendments are made only when the capability is implemented and accepted.
- **Decision record.** The decision is recorded as DEC-0013 (2026-10-28, approved by Mazen). That record also holds his approved quota rule: internal R2 replicas will not count toward the 200 MB quota.

## History

- 2026-10-28 COMPLETED — research-only review delivered; Mazen approved Architecture F as a design decision (not implemented, not authorized) and approved saving this record.