---
id: DEC-0014
title: R2 Primary for permanent video files - private R2 is the video store, the Supabase database owns metadata and quota (replaces DEC-0013's video-store part)
status: APPROVED
created: 2026-10-30
updated: 2026-11-01
scope: Storage of permanent user video (Intro derivative, Discord share copy, Wall video originals, HEVC-derived copies, renditions) on TESTING and later Production - upload, Global Usage quota, delete / replace, leases, Cloudflare Worker, Cloud Run worker
summary: Mazen approved R2 Primary as the design direction for permanent video files, replacing the video-store part of DEC-0013 (Supabase authoritative + R2 replicas); implementation and tests are authorized on TESTING only and are NOT complete; Production is NOT authorized; nothing is accepted.
related: [DEC-0013, REV-0033, REV-0032, DEC-0007]
save_approval: Mazen 2026-11-01
authorization: Mazen 2026-10-30 - task "Claude Code - GamID R2 Primary Migration" - implementation and tests on TESTING only, limited pilot scope; Production NOT authorized
supersedes: []
truth_refs: [visitor-media-access, intro-streaming-f5, intro-discord-thumbnail, discord-share-card, wall-video-url-reuse, wall-video-faststart, wall-video-renditions, public-media-route-protection, global-usage]
checkpoints: [ac4a2bed43093c3e0189da1c819ebb64173fc7fc, 10f777334d90afd98beb56210e48b61066b234ee]
sources: [docs/R2-PRIMARY-MIGRATION.md, PROJECT_HANDOFF.md, product-memory/decisions/DEC-0013-media-delivery-architecture-f-r2-replication.md, product-memory/reviews/REV-0033-architecture-f-pilot-and-r2-lifecycle-review.md]
---

## Context

- **What DEC-0013 approved.** Architecture F: Supabase Storage stays authoritative and the upload target, and visitor video is replicated to private R2. The GM-TEST-01 pilot of F passed on TESTING and is switched OFF (§148-§149).
- **What REV-0033 found.** The two-store lifecycle has gaps:
  - physical R2 deletion has no guaranteed run;
  - silent delete failures and orphans are possible;
  - there is no restore in either direction.
- **The research of 2026-10-30.** It found no documented production example of a Supabase original plus an R2 delivery replica; a single store plus a CDN is the norm. F and R2 Primary save about the same egress, and R2 Primary is simpler in the long term.
- **Mazen's positions:**
  - no automatic restore between the stores;
  - deletions and replacements made inside GamID must reach the real file.

## Decision

1. **R2 is the primary store for permanent video files.** The bucket is private (no public access, no r2.dev, no custom domain), and only the Cloudflare Worker reads or writes it.
2. **The Supabase database stays authoritative** for accounts, auth, permissions, file metadata and quota. A GamID-owned object registry holds each video's owner, key, verified size and state, and replaces `storage.objects` as the proof of existence and size for R2 video.
3. **No second permanent video copy in Supabase Storage for delivery.** Temporary storage during processing is allowed, for example an upload landing zone before promotion to R2. It must be cleaned and never become permanent.
4. **Images, fonts and non-video files stay as they are** (avatars, banners, Wall pictures, fonts, Intro posters).
5. **Quota.** The 200,000,000-byte quota is enforced from trustworthy database data, so it can't be bypassed by parallel, oversize or failed partial uploads. Each logical file is counted once. The DEC-0013 / DEC-0007 rule is kept: internal system copies (renditions, Discord share copies) do not count.
6. **Delete and replace.**
   - A user-initiated delete or replace reaches the real file and its dependent records.
   - A deleted or replaced file stops being served at once. A signed R2 Primary lease does not allow serving the video on any new request after its logical delete, even while the lease has not expired. The serving check doesn't depend on the physical R2 delete succeeding.
   - What can't be revoked:
     - a response that started before the delete may complete;
     - bytes the browser already downloaded stay in its cache (F6-A);
     - a short crawler cache.
   - Lease lifetimes are unchanged (Intro 120 s, Wall video 6 h; item 8). Architecture F's existing contracts are unchanged.
   - *Amended 2026-11-01 (Mazen; `PROJECT_HANDOFF.md` §153-§154).* Previously an issued lease kept its unchanged lifetime. The basis is the per-request registry check (`public.media_r2_object_servable`): migration `20261101100000` is applied to TESTING and inert, and the Worker check is local only and NOT deployed (`10f7773`). This is a documentation update only, with no deploy or activation authorized. It's recorded here and in the Register rather than as a History line, because History logs status changes and the status stays APPROVED.
   - Its physical deletion has a guaranteed run, and a failed deletion is never silently dropped.
7. **No automatic restore** between R2 and Supabase when a file is lost outside GamID.
8. **Leases and privacy are kept.** `public-media` stays the only visitor lease issuer, with the same visibility predicates and lifetimes (Intro 120 s, Wall video 6 h), signed as a Worker URL. Owners get an equivalent owner-checked lease.
9. **Every accepted contract must keep its behaviour, proven by tests:**
   - compression, encoding and HEVC conversion; fast start and progressive playback;
   - Intro, Poster and the thumbnail and frame selection;
   - Wall videos and renditions;
   - Discord Share Card and Share Copy;
   - Range, HEAD and temporary links;
   - size limits, quota and Global Usage;
   - error and job handling.

   GamID Truth is amended only when the capability is implemented and the change is real.

**Scope of this decision versus DEC-0013.**
- **Replaced:** only DEC-0013's video-store part, namely items 1 and 2: Supabase as the authoritative upload target, and R2 as a replica.
- **Still in force:** DEC-0013's lease, scope-of-images, quota-rule and contract items, restated above.
- **Kept until proven:** the Architecture F pilot code stays in place and switched OFF, as the rollback position, until R2 Primary is proven. DEC-0013 remains APPROVED until Mazen decides whether to mark it SUPERSEDED.

**State when saved (2026-10-30):**
- Phase 1 is done at `ac4a2be` (`PROJECT_HANDOFF.md` §150): the dependency inventory, an empirical Worker/R2 size probe, and the design in `docs/R2-PRIMARY-MIGRATION.md`.
- Implementation and the TESTING tests are **NOT complete**. Nothing for R2 Primary is implemented, applied, deployed or enabled.
- **Production is NOT authorized.** No final acceptance has been given.
- Each of the following still needs Mazen's separate approval:
  - Job and dispatcher redeploys;
  - enabling the pilot allow-list;
  - making GM-TEST-01 temporarily PUBLIC for E2E;
  - any plan, secret, DNS or Cloudflare / Supabase setting change;
  - Production.

## Reasoning

- **One source of truth per file.** REV-0033's lifecycle gaps (deferred deletion, orphans, out-of-band divergence) come from keeping two stores consistent. With one store, delete and replace act on the only copy, and the registry state is checked on every read.
- **Cost.** Egress savings are about the same as F, with no duplicate storage. DEC-0013 already noted that R2 Primary is about 10% cheaper.
- **Security model kept.** The same lease issuer, predicates and lifetimes apply; the Worker only verifies a server-issued signature (tested in the F pilot).
- **Quota stays enforceable.** The phase 1 probe showed:
  - the Worker sees exactly the bytes declared, and never more;
  - R2 refuses a wrong SHA-256;
  - a request is capped at 100 MB.

  So a database-reserved size can be enforced on writes. Reusing the gateway's existing reservation keeps today's tested protection against parallel and oversize uploads.

## Alternatives considered

- **Keep Architecture F (Supabase authoritative + R2 replicas)** — two stores to keep consistent; REV-0033's deletion, orphan and divergence gaps would need permanent machinery. It stays only as the rollback position during migration.
- **R2 Primary with an automatic Supabase fallback copy** — rejected (REV-0032): two sources of truth plus R2 Primary's complexity, and Mazen does not want automatic restore.
- **Presigned R2 uploads from the browser** — no POST policy (no size range), signed Content-Length enforcement unconfirmed, and new R2 S3 credentials. Not used for quota-safe uploads.
- **All media on R2** — images carry per-read visibility contracts and save little. Out of scope.

## History

- 2026-10-30 APPROVED — Mazen approved R2 Primary as the design direction for permanent video files (replacing DEC-0013's video-store part), authorized implementation and tests on TESTING only, and approved saving this record. Phase 1 done (`ac4a2be`, §150); implementation and tests not complete; Production not authorized; not accepted.
