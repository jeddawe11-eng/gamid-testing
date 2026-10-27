---
id: REV-0030
title: Infrastructure, storage, bandwidth and cost study, and its V1 follow-up measurements
status: COMPLETED
created: 2026-10-27
updated: 2026-10-27
scope: GamID TESTING infrastructure (Supabase Storage / database / Edge Functions, Cloudflare Worker, Cloud Run worker, pg_cron): per-visit bytes, caching, abuse exposure and monthly cost at 100k-100M visits; R2 break-even
summary: PARTIAL - measured per-visit bytes and caching on TESTING and modelled monthly cost; the dominant cost is uncached Wall video and Intro egress from Supabase, R2 behind a Worker is the large lever from about 1M visits/month; the V1 poster removes the pre-Play Intro download (measured) but changes the totals only 1-17%. Several model inputs are assumptions.
related: [REV-0021, REV-0023, DEC-0007, REV-0028, DEC-0012, ISS-0018, ISS-0019]
save_approval: Mazen 2026-10-27
review_type: AUDIT
outcome: PARTIAL
reviewer: Claude Code (research study and measurements); Mazen approved recording it
truth_refs: [public-intro-manual-play, public-intro-poster, public-media-route-protection, global-usage]
checkpoints: [21cf0bda80e61fcce50e5ac60a28289abbe18b51, bcbdc7d75a26e3750a90db069f9f71a9ab4f5741]
sources: [docs/INFRA-OPTIMIZATION-V1.md, PROJECT_HANDOFF.md]
---

## Subject

Two tasks on 2026-10-27:
- **The study.** Mazen's research-only task "Comprehensive Infrastructure, Storage, Bandwidth & Cost Optimization Study". It made no code, infrastructure or data change, and was published as a private artifact.
- **The follow-up.** His implementation task "Infrastructure Optimization & Security Hardening V1", which re-measured on TESTING.

## Method

- **Baseline.** A reproducible anonymous browser harness: Chrome through Playwright, desktop at 1440×900 and Pixel 7 emulation. It records CDP wire bytes per phase, category and Supabase `cf-cache-status`, on cold and repeat visits, Skip and Play.
- **Accounts visited.** It only viewed public profiles: @black and @nmk read-only, and the GM-TEST-01 fixture.
- **Other sources.** Live response headers, database table sizes, and official list prices.
- **Cost model.** A script with every input labelled: verified, measured, official price or assumption.

## Results

Measured unless marked.

- **The Intro is downloaded before Play.** Seeking the paused Intro to its waiting frame cost 0.4–1.8 MB per visit, even without Play. Repeat visits always downloaded it again, because each visit uses a new signed lease.
  - @black desktop: 1.79 MB before Play.
  - GM-TEST-01: 1.16–1.22 MB of a 1.53 MB Intro.
- **The Wall dominates bytes.** @black mobile was:
  - 35.6 MB after Skip on a cold visit;
  - of which Wall video was 20.9 MB, mostly MISS;
  - and the animated sticker catalog 13.8 MB, served from Cloudflare static assets (free to host but heavy on phones).
- **The Intro routes for crawlers are unprotected.** `/@<handle>/intro.webm` and `/intro-discord.webm`:
  - stream the whole Intro to any caller;
  - had no rate limit and no Range validation;
  - and a HEAD streamed and then discarded the body.

  This is recorded in ISS-0019.
- **The cron run log grows without bound.** `cron.job_run_details` had 38,106 rows / 22 MB and was the largest table. This is recorded in ISS-0018.
- **Cost (modelled, users = visits / 100):**
  - The current architecture stays inside Supabase Pro's included egress up to about 100k visits/month.
  - It is about $330/month at 1M typical visits, $3.1k at 10M and $33k at 100M.
  - Uncached egress is about 80% of that.
  - Moving media to R2 behind a Worker (B, needs a custom domain and Workers Paid) would be about $107 / $640 / $8.4k. Break-even is around 1M visits/month in the typical scenario.
  - R2 was not implemented and not authorized.
- **After V1 (measured), with a ready poster:**
  - the waiting Intro downloads only a 33.8 KB still;
  - Intro video bytes before Play are zero;
  - a repeat visit downloads 0 bytes (revalidated);
  - modelled totals drop 1–17% (more in low-engagement scenarios).

## Follow-up

- **Open decisions for Mazen (not authorized here):**
  - R2 behind a Worker on a custom domain;
  - a stable, CDN-cacheable Intro URL;
  - shareable Wall video leases;
  - picture display copies (F7-B);
  - compressing the animated sticker catalog;
  - activating the poster (worker image deploy + backfill).

**Caveats:**

- **Assumed inputs.** Engagement rates, Wall sizes, repeat-visit share, the Cloud Run Tier-2 rate and peak sizing are assumptions.
- **No Production.** Production does not exist, so nothing here is a Production measurement.
- **Supabase cache status.** It varied between runs.

## History

- 2026-10-27 IN_PROGRESS — research-only study run and published (no changes).
- 2026-10-27 COMPLETED — V1 follow-up measurements added; Mazen approved recording the study (task "Infrastructure Optimization & Security Hardening V1").
