# F4: published Wall-video signed URL reuse (TESTING)

## Scope and current path

Before this change `preparePublicWall` signed every listed video on every page load. `public.js` already obtains a fresh `get_public_wall` response for the PUBLIC identity's published snapshot. Owner/editor signing is separate and authenticated; the editor already reuses URLs in memory for 5.5 hours. That owner path remains unchanged, including across reloads (owner reloads still sign again).

## Implementation and security boundary

`dist/public/published-video-url-cache.js` retains only anonymous published-Wall video capabilities in tab-scoped `sessionStorage`, with a memory fallback if storage is blocked. The key includes project origin, bucket and exact object path. Source and derived buckets are separate. Concurrent requests for one object share a signing request. The cache is bounded to 120 entries (a cache bound, not an asset limit).

Only assets returned in the current server publication manifest consult the cache. Missing/unpublished Walls and removed manifest entries do not expose cached assets. Owner/draft signers cannot consult this cache; no user access tokens are stored. No RLS, permissions, buckets, database, signing endpoint or lifetime is changed.

Reuse ends 30 minutes before the earlier of the JWT's actual expiry and request-start plus the canonical `WALL_VIDEO_URL_SECONDS` (unchanged: six hours). Invalid, wrong-origin, wrong-object, unknown-expiry, near-expired and expired entries are rejected. Entries are pruned on construction/access; closed tabs discard session storage. A failed sign is not cached, allowing retry. Restoring a cache does not reset its issuance timestamp. Re-signing on a later preparation retains the existing placeholder behavior on failure. Open-page playback/rendering is unchanged; this is not a new continuous playback renewal system.

Signed URLs remain bearer capabilities until their existing expiry, as before. Unpublishing does not cryptographically revoke an already issued capability, but the existing fresh server publication lookup prevents subsequent page preparations from rendering an unpublished asset. Never use this anonymous cache as an authorization decision or for private owner/draft assets.

## Focused verification

77/77 tests passed across URL reuse, publishing, split/video rendering, media-layer/Other links, representative preview, transcode and Truth suites. Seven new F4 tests cover reuse/coalescing, refresh/revisit, 30-minute margin/expiry, exact object/bucket separation, shorter JWT expiry, invalid URL rejection, storage/signing failures, fresh-publication gating and unchanged owner/anonymous/RLS paths. Lint and typecheck passed.

Read-only TESTING measurement used one already-published video without altering its owner, Wall or media. Two original signer calls separated by 2.1 seconds produced different URLs (two signing requests). Cache recreation/revisit performed fresh publication checks, used one signing request and restored the same URL. Two bounded range reads each returned HTTP 206 and 65,536 bytes (131,072 bytes total), content type video/mp4, object size 9,772,751 bytes. Supabase reported CF cache MISS then HIT. `Cache-Control` was absent on these responses. Explicit network probes are not a browser-cache byte-savings measurement; no total video-byte reduction is claimed. Full-video downloads and heavy Monitor scans were not run.

A local browser fixture using the actual production modules and TESTING public RPC/signer verified repeat access and real browser reload with zero video bytes downloaded. The fixture is outside the product repository and is not deployed. Deployment and final browser result are recorded in PROJECT_HANDOFF.md.

## Follow-up recommendation (not implemented)

F3 viewport-gated playback/loading is the next candidate for review: stable URLs alone do not prevent downloading the same media again. The audit's preload/autoplay evidence and the bounded probe's nonzero repeat bytes support addressing unnecessary delivery before encoding/derivative changes. Browser cache savings and full playback acceptance require a separate carefully bounded real-device check. No F2/F3/F5/F6/F7/F8 work was implemented.

GamID Truth: NO CHANGE REQUIRED. This changes request reuse, not visibility, limits or an approved product contract.

## Deployment record

Product commit: 2ccb0f8aeec701bd4c0e6006c36d4c628a9ec091. TESTING workflow 37457286798 succeeded; Worker version 7071cc10-80e7-4aa6-96cf-c565166f741a. Workflow validation: 1,615 tests, 1,614 passed, one skipped, zero failed; lint and typechecks passed. Both served modules matched their source files exactly (line endings normalized); public HTML carried stamp 2ccb0f8. Browser fixture repeat and real reload restored the same media URL; reload performed one fresh publication lookup, zero new signing requests and zero video downloads. Real-device playback remains for Mazen review; automated rendering/playback-path regressions passed. Stop after F4.

