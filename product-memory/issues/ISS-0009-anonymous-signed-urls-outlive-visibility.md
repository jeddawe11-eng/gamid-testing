---
id: ISS-0009
title: HIGH - anonymous visitors can mint long-lived signed Storage URLs that outlive PRIVATE / detach / unpublish
status: VERIFIED
created: 2026-10-10
updated: 2026-10-11
scope: Storage read access for visitors - Classic Profile Banner, public Avatar, Intro media, published Wall media (all CONFIRMED, all fixed on TESTING)
summary: HIGH severity. Any anonymous storage SELECT policy also let visitors mint signed URLs of any length that kept working after access should have ended. Confirmed live for Banner, Avatar, Intro and Wall; fixed on TESTING in Phase 1D - only owners can sign, visitors get server-issued leases or server-delivered bytes.
related: [DEC-0005, ISS-0007, ISS-0008]
save_approval: Mazen 2026-10-10
kind: BUG
authorization: Mazen 2026-10-10, explicit task "GamID — Phase 1D: Complete Security Remediation" (TESTING only)
acceptance: Mazen explicitly accepted the ISS-0009 security remediation on TESTING on 2026-10-11, including the documented residual possibility of unknown historical signed URLs (residual (a)); evidence: Phase 1D live checks (PROJECT_HANDOFF.md §30), the 2026-10-11 closure assessment (§38) and the deletion of the known synthetic URL's object (§39); recorded in §40
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

FIXED on TESTING, checkpoint `660d911`; **VERIFIED 2026-10-11**: Mazen explicitly accepted the remediation, including residual (a) below (PROJECT_HANDOFF.md §40). The residuals stay disclosed here and are not resolved by that acceptance.
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

**Closure assessment (2026-10-11, PROJECT_HANDOFF.md §38-§39; GM-TEST-01 synthetic fixtures only, restored; no real user's file read, signed or changed):**
- Live configuration re-read: the signing ban policy, no public bucket, and no client grant on the lease / Banner / counter RPCs. The deployed `public-media` source is byte-identical to the repo (Intro 120 s, Wall video 21,600 s).
- Rolled-back RLS simulation: anonymous and non-owner callers see 0 objects for `sign` / `sign_many`, and the public objects for direct reads.
- Live through the Storage API:
  - anonymous signing (365 d, 60 s, batch) refused on an Avatar and a Wall video;
  - direct reads served while public, refused at once after detach, PRIVATE, disable and unpublish;
  - leases refused in the same cases;
  - a lease asked for 365 d is exactly 21,600 s;
  - a lease issued earlier keeps serving until it expires (the accepted F4 behaviour).
- S3-compatible access needs a user session JWT and is checked under the same RLS on each request, so it is not an equivalent long-lived bypass. This is by analysis; it was not tested live, because that needs a signed-in account.
- **The known synthetic URL is closed (Mazen-authorized deletion, 2026-10-11).** Its object, GM-TEST-01's synthetic Wall video `wall-video/<GM-TEST-01>/184d21cc-1acd-4e72-ade4-69f4c83d59fe.webm` (105,320 bytes), was positively identified: GM-TEST-01's folder and COMPLETE receipt, no draft / publication / Crew Wall / derived reference, and not needed by the Monitor pilot. It was deleted through the Storage API and verified gone (direct read 400). The URL itself was never retained, so it could not be requested after the deletion. It is invalid because a signed URL is honoured only while its object exists (observed on TESTING in Phase 1B: 400 after deletion). GM-TEST-01 is otherwise unchanged; its Assets entry `wall_assets` 20694c6e now points to a missing file.

**Residual:**
- (a) Any **unknown** URL minted **before** the fix for a then-public object stays valid until it expires or the object is deleted. Such URLs cannot be listed or revoked; the only global option is rotating the project's JWT signing secret, which also ends every session (Mazen's decision; not done). URLs made by the normal pre-fix page were short (Intro ≤ 120 s, Wall video ≤ 6 h) and have expired. There is no evidence either way of deliberately minted long URLs. The one known test URL is closed (above).
- (b) Leases already issued are bounded: up to 120 s for an Intro, up to 6 h for a Wall video (the accepted F4 behaviour; shortening it is a product decision).
- (c) The protection relies on Supabase setting `storage.operation()`. If that ever stops, signing would open again silently, so a periodic live check is recommended.
- (d) Owners can still sign their own files.

## History

- 2026-10-10 OPEN — Mazen asked for it to be recorded as a HIGH-severity security issue in Phase 1C.
- 2026-10-10 AUTHORIZED — Mazen authorized Phase 1D (complete security remediation, TESTING only).
- 2026-10-10 FIXED — Confirmed live for Avatar, Intro and Wall, then fixed and verified on TESTING (migrations 20261010140000 and 20261010141000; Edge Functions public-media and profile-banner; checkpoint 660d911; frontend run 38040935387). Not VERIFIED: Mazen's acceptance is pending.
- 2026-10-11 VERIFIED — Mazen explicitly accepted the security remediation on TESTING, including the residual possibility of unknown historical signed URLs (not revoked; no JWT rotation).
