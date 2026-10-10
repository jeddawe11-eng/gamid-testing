---
id: ISS-0009
title: HIGH - anonymous visitors can mint long-lived signed Storage URLs that outlive PRIVATE / detach / unpublish
status: FIXED
created: 2026-10-10
updated: 2026-10-10
scope: Storage read access for visitors - Classic Profile Banner, public Avatar, Intro media, published Wall media (all CONFIRMED, all fixed on TESTING)
summary: HIGH severity. Any anonymous storage SELECT policy also let visitors mint signed URLs of any length that kept working after access should have ended. Confirmed live for Banner, Avatar, Intro and Wall; fixed on TESTING in Phase 1D - only owners can sign, visitors get server-issued leases or server-delivered bytes.
related: [DEC-0005, ISS-0007, ISS-0008]
save_approval: Mazen 2026-10-10
kind: BUG
authorization: Mazen 2026-10-10, explicit task "GamID — Phase 1D: Complete Security Remediation" (TESTING only)
truth_refs: [visitor-media-access, intro-streaming-f5, wall-visibility-toggle, public-wall-publishing, your-gamid-editor]
checkpoints: [f9929e5d2061667963942b3210dc59204613f007, 660d91100a78f94c86288168c279e2b536dcdb0f]
sources: [supabase/migrations/20261010140000_visitor_storage_signing.sql, supabase/migrations/20261010141000_visitor_storage_signing_ban.sql, supabase/functions/_shared/public-media.js, PROJECT_HANDOFF.md]
---

## Description

**Severity: HIGH (privacy).** Supabase Storage's `POST /storage/v1/object/sign/<bucket>/<path>` signed any object the caller could SELECT under Storage RLS, and accepted any expiresIn the caller chose. The resulting URL is checked only by its signature and expiry. Changing visibility, publication or attachment does not revoke it; deleting the object does.

So every storage SELECT policy granted to `anon` let a visitor keep access past the moment the product says access ends.

## Evidence

All live on TESTING, with synthetic files on GM-TEST-01 only; no signed URL was ever created for a real user's file.

- **Banner: CONFIRMED** (Phase 1B), then contained (Phase 1C).
- **Phase 1D, before the fix, CONFIRMED.** A visitor minted a 365-day URL in each case, and it still returned 200 after:
  - the GamID became PRIVATE (Avatar);
  - the Avatar was replaced (the old one);
  - the Wall was disabled, and then unpublished (Wall video);
  - the GamID became PRIVATE (Intro, from the real worker).
- **The operation names** behind the fix were observed with a temporary probe policy that always returned false; it was removed afterwards. Signing is `storage.object.sign` / `storage.object.sign_many`; direct reads are `storage.object.get_authenticated` / `object.get_authenticated_info`.

## Resolution

FIXED on TESTING, checkpoint `660d911`.
- **Migration `20261010141000`:** a restrictive policy lets only the folder owner sign, so visitors and other signed-in users cannot.
- **Migration `20261010140000`:** service-only RPCs (the lease decision with the accepted public predicates, the Banner lookup, rate counters), and Banner compare-and-set conflicts now return HTTP 409.
- **Edge Function `public-media`:** server-issued leases, Intro 120 s and Wall video 6 h, the accepted F5 and F4 lifetimes.
- **Edge Function `profile-banner`:** no-store bytes, re-checked after the read, the same 404 for every refusal, rate limits.
- **The public page** asks `public-media` instead of signing.

Verified live after the fix:
- signing refused for anon (one year, 60 s and batch) and for another persona, on Avatar, Intro, Wall and Banner;
- owners still sign their own objects;
- direct reads unchanged while public and refused at once on PRIVATE, Disable, Unpublish and replacement;
- leases refused in the same cases;
- the public page streams the Intro from a lease (206), with no visitor signing;
- `profile-banner` passes every case;
- regression suites and fixtures pass.

**Residual:**
- (a) URLs minted **before** the fix stay valid until they expire or the object is deleted. They cannot be listed or revoked; the only global option is rotating the project's JWT signing secret, which also ends every session (Mazen's decision). On TESTING, one such test URL remains: for GM-TEST-01's kept Wall test video, which is synthetic.
- (b) Leases already issued are bounded: up to 120 s for an Intro, up to 6 h for a Wall video (the accepted F4 behaviour; shortening it is a product decision).
- (c) The protection relies on Supabase setting `storage.operation()`. If that ever stops, signing would open again silently, so a periodic live check is recommended.
- (d) Owners can still sign their own files.

## History

- 2026-10-10 OPEN — Mazen asked for it to be recorded as a HIGH-severity security issue in Phase 1C.
- 2026-10-10 AUTHORIZED — Mazen authorized Phase 1D (complete security remediation, TESTING only).
- 2026-10-10 FIXED — Confirmed live for Avatar, Intro and Wall, then fixed and verified on TESTING (migrations 20261010140000 and 20261010141000; Edge Functions public-media and profile-banner; checkpoint 660d911; frontend run 38040935387). Not VERIFIED: Mazen's acceptance is pending.
