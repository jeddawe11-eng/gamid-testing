---
id: DEC-0013
title: Media delivery Architecture F - Supabase authoritative, visitor video replicated to private R2 when READY, Worker delivery with Supabase fallback
status: APPROVED
created: 2026-10-28
updated: 2026-10-28
scope: Storage and delivery of visitor-facing video on TESTING and later Production (public-media leases, Cloudflare Worker, Cloud Run worker, Global Usage quota)
summary: Mazen approved Architecture F as the design for visitor video delivery, and approved that the internal R2 replicas will not count toward a user's 200 MB storage quota; design only - not implemented, not authorized.
related: [REV-0032, REV-0030, REV-0028, DEC-0007]
save_approval: Mazen 2026-10-28
authorization: NONE
supersedes: []
truth_refs: [visitor-media-access, intro-streaming-f5, wall-video-url-reuse, wall-video-renditions, intro-discord-thumbnail, discord-share-card, public-media-route-protection, global-usage]
checkpoints: [10d130c07726c16c9c89b62f429cf82f699295c6]
sources: [product-memory/reviews/REV-0032-media-delivery-architecture-r2-replication.md, docs/INFRA-OPTIMIZATION-V1.md]
---

## Context

- **Where the cost is.** Visitor video (Intro playback, the Discord share copy and Wall video) is delivered from Supabase Storage. Egress there costs $0.09/GB uncached and $0.03/GB cached, and a first visit is always a cache MISS.
- **What was reviewed.** REV-0032 compared every hybrid and migration variant against the current architecture, and recommended Architecture F. That review holds the evidence, costs and risks, which are not repeated here.

## Decision

1. **Supabase stays authoritative.** Supabase Storage remains the source of truth and the upload target.
   - Uploads, quota enforcement, Usage, delete flows and visibility rules are unchanged.
2. **Every visitor-facing video is replicated asynchronously to a private Cloudflare R2 bucket once it is READY.** This covers:
   - the Intro playback derivative;
   - the Discord share copy;
   - Wall video originals;
   - renditions;
   - HEVC-derived copies.

   Each copy is made through the existing database trigger, dispatcher and Cloud Run worker, and is verified by size and SHA-256 before it is used. The bucket has no public access and no r2.dev access.
3. **Delivery.**
   - **Leases:** `public-media` remains the only lease issuer. Its visibility predicate and its server-chosen lifetimes are unchanged (Intro 120 s, Wall video 6 h).
   - **When a replica is ready:** it issues a signed Worker URL, and a Cloudflare Worker serves the verified replica.
   - **Otherwise, and as a fallback:** today's Supabase lease.
   - **Crawler routes:** the Intro crawler routes read the replica as well.
4. **Scope.** Images (posters, avatars, Wall pictures, banners) and fonts stay on Supabase.
5. **Switch.** Delivery from R2 is controlled by a reversible switch and a pilot allowlist. Turning it off returns all delivery to Supabase without touching any original.
6. **Quota rule (Mazen, 2026-10-28).**
   - **The rule:** internal R2 replicas are system-managed copies, not user uploads. They will not count toward the user's 200 MB storage quota and will not appear as extra usage. The original keeps counting exactly as today.
   - **Precedent:** internal renditions (DEC-0007) and Discord share copies already follow this rule.
   - **When it applies:** to the future R2 implementation only. Current quota enforcement is unchanged.
7. **Contracts.** Every accepted contract must keep its behaviour:
   - Intro: poster, manual Play, F5 leases;
   - Wall media: F6-A lease reuse, renditions, fast start;
   - Discord: share card and share copy;
   - route protection, quotas and visibility.

   Truth wording is amended only when the capability is implemented and accepted.

This decision is not an implementation authorization. Each of the following needs its own explicit authorization from Mazen:
- implementation;
- R2 activation;
- buckets, credentials or secrets, IAM;
- deployment, DNS or Cloudflare settings;
- moving media;
- Production.

## Reasoning

- **Lowest practical cost without changing the upload path.** In the typical model, F costs $128 against $307 at 1M visits per month, $999 against $2,892 at 10M, and $12,033 against $30,952 at 100M. It breaks even at about 144k visits per month.
- **It protects against viral and Discord traffic.** A viral heavy Wall (1M visits in a day) costs about $2.4 on R2 + Worker, against $676–2,029 on Supabase. Discord, which does not cache linked video, costs cents instead of hundreds of dollars.
- **It keeps the security model.** The same lease issuer, predicate and lifetimes apply; the Worker only verifies a server-issued signature.
- **It is safe to migrate and to undo.** Supabase is never left as a secondary source, there is a fallback for every request, and rollback is one switch.
- **The quota rule** keeps a user's visible usage equal to what they uploaded, as with renditions and share copies. Duplicate replica storage costs only $0.015 per GB-month.

## Alternatives considered

- **Read-through (copy on first request).** About the same cost. Range requests force a separate full fetch, concurrent first views need locking, and the first viewer, at the peak of a viral moment, is served from Supabase.
- **Replication above a popularity threshold.** It saves less ($1,132–1,970 against $999 at 10M visits) and adds popularity counters, to avoid storage that costs very little.
- **R2 primary for video.** About 10% cheaper than F, but it rewrites upload, quota, delete, fast start, rendition and HEVC flows, and rollback is harder. It remains possible later, by switching the upload target.
- **All media on R2.** Images carry per-read visibility contracts, and the extra saving is small. Deferred.
- **Cloudflare Stream, bunny.net, Backblaze B2 behind Cloudflare.**
  - Stream bills per delivered minute.
  - bunny.net charges $0.01–0.06/GB for egress.
  - B2 is hosted outside Cloudflare, so the CDN video restriction applies.
- **Keeping the current architecture with D2 / D3.** D3 only lowers the rate to $0.03/GB and needs leases shared between visitors; D2 saves no egress under F. Neither is a prerequisite.

## History

- 2026-10-28 APPROVED — Mazen approved Architecture F as a design decision (REV-0032), approved the quota rule for internal R2 replicas, and approved saving this record. Not implemented; authorization NONE.
