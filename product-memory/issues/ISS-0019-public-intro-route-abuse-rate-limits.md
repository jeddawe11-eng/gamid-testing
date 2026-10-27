---
id: ISS-0019
title: Public Intro video routes had no rate limit, Range validation or HEAD short-cut (egress amplification)
status: FIXED
created: 2026-10-27
updated: 2026-10-27
scope: Cloudflare TESTING Worker (cf-worker/worker.mjs): /@<handle>, /@<handle>/intro.webm, /@<handle>/intro-discord.webm
summary: Any anonymous caller could pull the whole Intro repeatedly through the Worker (uncached, Supabase egress plus 1-2 lookups each), use multi-range or garbage Range headers, or HEAD the full body; the Worker now allows one byte range (else 416), cancels the body on HEAD and rate-limits per IP + handle (Discord crawler tier, page limit), all on the existing plan.
related: [REV-0030, REV-0028]
save_approval: Mazen 2026-10-27
kind: IMPROVEMENT
authorization: Mazen 2026-10-27, task "GAMID — Infrastructure Optimization & Security Hardening V1" (step 5, TESTING only, no paid service)
truth_refs: [public-media-route-protection, discord-share-card, intro-discord-thumbnail]
checkpoints: [bcbdc7d75a26e3750a90db069f9f71a9ab4f5741]
sources: [docs/INFRA-OPTIMIZATION-V1.md, PROJECT_HANDOFF.md]
---

## Description

Link crawlers need these routes: `og:video` and the Discord card. Visitors' browsers play the Intro from their own short signed lease instead.

- **No edge caching.** workers.dev has no edge cache, so every request means:
  - Supabase egress for the bytes;
  - the anonymous identity / share lookups.
- **No limits before V1:**
  - no rate limit;
  - every Range header forwarded unchanged;
  - HEAD streamed the whole Intro and then discarded it.
- **Hotlinking.** Embedding the URL elsewhere costs GamID egress per play.

## Evidence

- **Code before V1** (`cf-worker/worker.mjs`, `handleIntroRequest`):
  - the client's Range header went upstream unchanged;
  - the upstream body was streamed for HEAD too;
  - no limiter was configured in `wrangler.jsonc`.
- **Cost of each request:** Supabase Storage egress (measured Intro files: 1.5–10.4 MB), plus 1–2 anonymous RPCs.

## Resolution

Product `bcbdc7d`, TESTING run `40507974877`. No paid service.

- **Range.** No Range header, or exactly one well-formed byte range; anything else is answered 416 before any lookup.
- **HEAD.** Headers only; the upstream body is cancelled at once.
- **Rate limits.** Workers Rate Limiting binding; approximate, and counted per Cloudflare location.
  - **Video routes:** 120 requests per minute per client IP and handle.
  - **Discord's crawler:** 1,200 (Discordbot user agent).
  - **Pages:** 300 requests per minute per client IP.
  - **Over the limit:** 429 with `Retry-After: 60` and `no-store`, before any lookup.
  - **Shared IPs:** keyed by IP and handle, so a shared IP is limited on one profile only, far above any person's rate.
  - **Failure mode:** a missing or failing limiter never blocks (fail open).
- **Live verification (Claude Code):**
  - multi-range and reversed ranges: 416;
  - a single range: 206;
  - HEAD and the page: 200;
  - a 140-request burst on an unknown handle: 126 × 404, then 14 × 429 with the documented headers;
  - another handle in the same minute: unaffected;
  - the @black page and Discord card metadata: unchanged.

## Remaining

These are not done, and need a decision or a paid / zone feature:
- **Edge caching, WAF and bot rules.** These need a Cloudflare zone (custom domain).
- **A stable cacheable Intro URL.**
- **A UA-independent Discord allowance.** The UA is spoofable, but the limit stays bounded.

## History

- 2026-10-27 OPEN — found by the infrastructure cost study (REV-0030).
- 2026-10-27 AUTHORIZED — Mazen's task "Infrastructure Optimization & Security Hardening V1", step 5.
- 2026-10-27 FIXED — deployed to TESTING (bcbdc7d, run 40507974877) and verified live by Claude Code; awaiting Mazen's verification.
