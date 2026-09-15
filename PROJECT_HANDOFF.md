# GamID Project Handoff

Last updated: 2026-09-15 (UTC)

## Purpose and scope

GamID is a customizable digital identity/profile platform for the gaming ecosystem, guided by **CREATE → WOW → SHARE**. Work is deliberately divided into approved slices. Do not start a later slice without Mazen's explicit approval.

## Accepted Slice 1 baseline

- Accepted checkpoint: `f413262c1029b083ca0455d1ca425ae5510498d0`
- Accepted tag: `slice-1-accepted`
- Scope: mobile-first Intro + Transition Engine prototype
- Accepted transitions: Cross Fade, Blur Fade, Shrink to Avatar, Slide Away, Split Reveal
- The accepted intro source files were not modified by Slice 2.
- Slice 1 remains the accepted behavior baseline. The current public TESTING GitHub Pages deployment also includes the completed non-video Slice 2 account surface; Production remains out of scope.

## Formally accepted Slice 2 baseline

- Preserved implementation checkpoint: `69f31760509c3632a7a581b8474e72b09dcc7b95`
- Git tag: `slice-2-implementation`
- Acceptance status: **FORMALLY ACCEPTED BY MAZEN**
- Final acceptance date: 2026-09-15 (UTC)
- TESTING non-video source publication: `jeddawe11-eng/gamid-testing` on branch `main`
- TESTING GitHub Pages: `https://jeddawe11-eng.github.io/gamid-testing/`
- TESTING Account route: `https://jeddawe11-eng.github.io/gamid-testing/account/`
- Video publication is intentionally deferred. The original local video asset remains unchanged and must not be processed or re-uploaded without a separate approval.

Slice 2 adds the Account + Solo Identity Foundation:

- Email/password registration with required email confirmation
- Sign in, sign out, password recovery/update, local session persistence, and refresh-token restoration
- Claim-your-GamID onboarding with live availability feedback
- Private date of birth and configurable age policy
- Display name, preferred language, and optional private avatar upload
- Atomic creation of one Solo Entity, ownership membership, Draft Profile, and permanent opaque QR reference
- Returning-session resolution to the existing identity without duplicate creation
- Basic authenticated account settings and Slice 3 placeholder only

Final acceptance validation baseline:

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (25/25)
- `npm run build`: PASS
- Existing TESTING `@BLACK` identity integrity: PASS
- RLS, RPC, and least-privilege boundaries: PASS
- Deferred-video-safe validation architecture: PASS

The mobile account route is `dist/account/index.html` (served as `/account/`). It is a separate surface so the accepted Intro Engine remains unchanged.

## Slice 3A — GamID Identity Foundation

- Implementation status: **COMPLETE IN TESTING; AWAITING MAZEN'S ACCEPTANCE**
- Acceptance status: **NOT YET ACCEPTED**
- Scope: first CREATE-phase editor for an authenticated user's existing SOLO identity
- TESTING review route: `https://jeddawe11-eng.github.io/gamid-testing/account/`

Slice 3A turns the authenticated account identity surface into the mobile-first **YOUR GAMID** experience. Its GamID Identity Card is a live local preview of the existing private avatar, editable display name, permanent read-only `@handle`, and a short editable Bio. Display-name, Bio, and selected-avatar previews update before save. One `SAVE PROFILE` action persists the approved fields and shows a lightweight `Saved ✓` confirmation. Dirty-state tracking enables the browser's standard leave/reload warning and protects explicit sign-out from silently discarding edits. The profile remains `DRAFT`/private; no publish or public-profile behavior exists.

The existing architecture is reused rather than duplicated:

- `public.entities.display_name` remains the display-name source of truth.
- `public.entities.gamid_handle` remains permanent; Slice 3A adds no handle mutation path or editable control.
- `public.entities.avatar_media_reference` and the existing private `avatars` bucket remain the only avatar system. Selected images preview locally, upload through the existing authenticated Storage boundary, and are attached only through the profile RPC.
- The existing Auth/session, SOLO Entity, OWNER membership, `public.profiles`, RLS, and RPC-wrapper/private-implementation pattern remain intact.

The additive migration `20260915170000_slice_3a_identity_foundation.sql` makes the minimum schema change: `public.profiles.bio text not null default ''` with a database `char_length(bio) <= 160` check. Existing profiles, including `@BLACK`, receive an empty Bio without changing identity, membership, handle, visibility, status, account data, or QR reference.

Two authenticated RPCs were added:

- `get_my_identity_profile()` returns only the owner-scoped identity editor fields; it does not return DOB, account-private data, or the opaque QR token.
- `update_my_identity_profile(display_name, bio, optional_avatar_path)` validates display name and Bio server-side, resolves the caller's SOLO/OWNER relationship, verifies any avatar belongs to the caller in the private `avatars` bucket, and updates only display name, Bio, and optional avatar reference. Its public security-invoker wrapper delegates to a private security-definer implementation with an empty search path. Anonymous execution and direct authenticated table mutation remain denied. Handle, DRAFT/private state, and QR data are not mutated.

Focused Slice 3A regression coverage verifies the 160-character UI/domain/database boundary, authenticated RPC grants and anonymous denial, no direct profile mutation grant, permanent non-editable handle, unchanged DRAFT/private state, owner-scoped avatar validation, live-preview wiring, unsaved-change protection, no QR exposure, and inactive future Identity Board labels. The full baseline is now 32/32 tests with lint, typecheck, and build passing through the video-safe validation architecture.

### Slice 3A acceptance fix — Avatar crop / position / zoom

Mazen's first mobile review found that the initial Slice 3A preview passed the selected source image directly to CSS `background-size: cover`, which always imposed a center crop. The acceptance fix adds a dependency-free, browser-native crop stage before an Avatar becomes pending: Canvas performs orientation-aware decoding and normalized export, while Pointer Events provide one-finger drag/pan and two-finger pinch zoom. A touch-friendly range slider provides an additional accessible zoom control. The image is constrained at every zoom/position so no empty area can enter the circular final-Avatar boundary.

`APPLY` exports the chosen square crop WebP-first at quality 0.90 (JPEG 0.92 fallback). Output is capped at 512×512 and reduced below that when the selected source crop has fewer pixels, avoiding unnecessary upscaling. APPLY updates only the local Identity Card preview and marks the profile dirty; the existing `SAVE PROFILE` path performs the private Storage upload and secured RPC attachment. `CANCEL` and the dialog Escape action discard the crop session, reset the chooser, preserve the prior saved or pending Avatar, and upload nothing. EXIF-aware `createImageBitmap(..., { imageOrientation: "from-image" })` is preferred for normal phone gallery/camera orientation, with a browser image-decoder fallback.

The fix adds no database migration, schema, RLS, RPC, bucket, or storage-model change. Focused crop tests cover portrait, landscape, square, very tall/A4-style, very wide, bounded pan/zoom with no empty crop area, small-source no-upscale behavior, square Canvas output, delayed pending state until APPLY, CANCEL preservation architecture, and the existing handle/DRAFT/private/QR/security invariants. The full baseline is now 37/37 tests with lint, typecheck, and build passing. Slice 3A remains **AWAITING MAZEN'S ACCEPTANCE**.

The Identity Board direction remains future-compatible but deliberately non-generic: no `profile_blocks` table or speculative block framework was added. Games, Stats, Connections, and Socials appear only as clearly inactive future labels. Slice 3B, the Gaming Connections Engine, subscriptions/payment, automatic D2/D3 video processing, public profiles, publishing, and Production are **NOT STARTED**. Slice 3A implementation completion is not acceptance; only Mazen can accept it after TESTING review.

## Architecture

### Frontend

The repository remains a dependency-free static ES-module site. `dist/account/supabase-client.js` is a small HTTPS client for Supabase Auth, REST RPC, and Storage. It uses only the public publishable key; no service-role or secret key exists in the repository.

The account flow is split into:

- `account/index.html`: accessible views and forms
- `account/account.css`: mobile-first presentation with tablet/desktop enhancement
- `account/account.js`: view orchestration and form behavior
- `account/domain.js`: pure handle/state rules
- `account/supabase-client.js`: Auth/session/RPC/Storage boundary

### Backend

- Provider: Supabase Auth + PostgreSQL + Storage
- Project: `GamID — TESTING`
- Project reference: `upvtrczefcvigxdyuylw`
- Region: Singapore (`ap-southeast-1`)
- Environment: TESTING only
- Isolation: separate project; no food-platform database, Auth, Storage, credentials, or data were accessed or reused
- Production: not configured or deployed

## Data model

`auth.users` is the human authentication account. It is not an Entity or Profile.

| Schema/table | Purpose |
| --- | --- |
| `private.account_private` | DOB and preferred language; never exposed through the Data API |
| `private.age_policies` | Configurable active minimum-age policy (development default: 13) |
| `private.reserved_handles` | Maintainable system/protected/abusive handle registry |
| `public.entities` | GamID identity; Slice 2 enum permits `SOLO` only |
| `public.entity_memberships` | User-to-Entity ownership foundation; permits future multi-entity management |
| `public.profiles` | One initial `DRAFT` profile per Entity |
| `public.qr_references` | Stable opaque `q_<random>` public reference mapped to an Entity |
| `storage.objects` / `avatars` bucket | Private optional profile-image objects scoped to the user's folder |

The current database enum permits only `SOLO`. Future entity types require a later approved migration; no Team, Organization, or Company behavior exists in Slice 2.

## Auth and session behavior

- Registration calls Supabase email/password signup.
- Hosted Supabase configuration has signup enabled, email provider enabled, and email auto-confirm disabled.
- Unverified registrations are directed to check their email.
- Sign-in uses indistinguishable invalid-credential messaging.
- Sessions are stored in browser local storage under a TESTING-specific key and refreshed before expiry.
- Password reset sends a recovery link; a recovery callback accepts the new password.
- Sign-out requests server revocation and always clears the local session.
- Account settings capture the selected preferred language before disabling the form, preventing a null RPC argument during save.
- OAuth is not implemented; the boundary remains compatible with later providers.

The TESTING GitHub Pages root and exact HTTPS `/gamid-testing/account/` URL are the intended Supabase Auth redirect targets. The available connector does not expose Auth URL settings; dashboard configuration remains authoritative. Production Auth configuration remains out of scope.

## Handle rules and concurrency

- Normalized with trim + lowercase
- Globally unique in normalized storage
- 3–24 characters
- ASCII lowercase letters, digits, and single underscores only
- Must start and end with a letter or digit
- Consecutive underscores rejected
- Reserved/protected/unsafe handles enforced from `private.reserved_handles`
- Availability RPC is advisory; final ownership is enforced by the database unique constraint inside the atomic creation transaction
- Handle-changing UI and update privileges are intentionally absent

## Atomic creation and QR foundation

`public.create_solo_identity(...)` is an authenticated RPC wrapper around a private, tightly scoped transaction. It checks caller identity, verified email, one-Solo limit, DOB/age policy, language, display name, format, reserved status, and uniqueness. It then inserts the private account, Entity, ownership membership, Draft Profile, and QR reference in one transaction. An error rolls back the complete operation.

The QR public token is generated from 18 random bytes and is not a raw entity/profile/user UUID. No QR visual generator or share UI exists yet.

## RLS and security

- RLS is enabled on every Slice 2 table.
- Private tables have no client policies or grants (default deny).
- Public identity/profile/QR tables permit authenticated owner reads through membership predicates.
- Direct client insert/update/delete on foundation tables is revoked.
- Entity creation and mutations are limited to authenticated RPCs that verify `auth.uid()`.
- Anonymous callers can only execute the bounded handle-availability check.
- DOB is not included in public tables or `get_my_gamid()` output.
- Avatar bucket is private, 5 MB-limited, MIME-limited, and folder-scoped by authenticated user ID.
- No service-role key or production credential is present in source.
- Expected Supabase Security Advisor state while the TESTING project remains on the Free plan:
  - WARN: `Leaked Password Protection Disabled`. Mazen accepts this as a known Free-plan limitation, not a Slice 2 implementation defect. The feature requires Supabase Pro or higher. Do not attempt a workaround or upgrade automatically; enable and revalidate it only if the TESTING project is later upgraded to a supporting plan.
  - INFO: `private.account_private`, `private.age_policies`, and `private.reserved_handles` have RLS enabled with no client policies. These findings are intentional and are not regressions.

## Migrations

Apply in filename order:

1. `20260912143000_slice_2_account_solo_foundation.sql`
2. `20260912170000_harden_rpc_boundaries.sql`
3. `20260912173500_enforce_least_privilege.sql`
4. `20260915170000_slice_3a_identity_foundation.sql`

All four are applied to the isolated TESTING project and recorded in its migration history.

## Development and validation

Requirements: Node.js 20+; no npm dependencies are required.

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The production-style build command runs validation, syntax checks, all account/schema tests, and all accepted Slice 1 regression tests.

### Deferred-video validation architecture

The former static validator called `fs.access()` on `dist/assets/gamid-intro.mp4`. Although it did not intentionally decode the media, resolving that large deferred workspace file was unnecessary and was the direct validation path associated with repeated stalls. Because `npm run build` invokes `npm run lint`, the access also prevented normal full builds.

The permanent maintenance fix is checkpointed locally at `4d31d7f8c38decb1a0eccd85bef814b74a74b4f2`:

- Static validation checks the required `<source src="assets/gamid-intro.mp4" type="video/mp4">` structure in `dist/index.html`; it does not open, stat, hash, copy, encode, or read the MP4.
- The poster remains independently checked because it is part of the non-video deployment.
- GitHub Pages stages a non-video site tree with an explicit `/assets/gamid-intro.mp4` exclusion before artifact upload. The Pages action no longer receives the unfiltered `dist` directory.
- Regression tests fail if static validation reintroduces direct MP4 file access or if Pages returns to uploading `dist` unfiltered.

After this fix, `lint`, `typecheck`, all 25 tests, and the full `build` complete normally without processing the MP4. This changes validation and packaging only; accepted Intro transitions and runtime behavior are unchanged. Actual video publication remains deferred and requires a separate decision.

Database validation completed against the TESTING project with rollback-only temporary users. It verified atomic success, duplicate case-insensitive rejection, reserved rejection, age rejection, no partial rows on failure, same-owner reads, cross-user denial, and clean initial data after test cleanup.

## Approved future video quality-tier policy (implementation not started)

**Status: APPROVED product/compression policy.** This section records the quality targets for a future user-uploaded video processing system. It does not mean that subscription enforcement, upload/transcoding infrastructure, tier selection, browser fallback delivery, or publication has been implemented. All of those implementation items are **NOT STARTED**.

### Free users — approved D3 target

- Container/codec: WebM with VP9 (`libvpx-vp9`)
- Quality target: CRF 40
- Preserve the source resolution, frame rate, timing, and frame structure
- Pixel format: `yuv420p`
- Preserve audio as Opus using the approved GamID audio methodology
- Do not normalize, remix, EQ, intentionally alter loudness, add effects, or otherwise modify the audio experience

GamID D3 benchmark evidence: 1,073,060 bytes; 46.57% smaller than the current Master; approximately 379.8 kbps video, 32.4 kbps audio, and 415.7 kbps total; average SSIM 0.98171; average PSNR 42.77 dB.

### Paid/Premium users — approved D2 target

- Container/codec: WebM with VP9 (`libvpx-vp9`)
- Quality target: CRF 36
- Preserve the source resolution, frame rate, timing, and frame structure
- Pixel format: `yuv420p`
- Preserve audio as Opus using the same approved GamID audio methodology
- Do not normalize, remix, EQ, intentionally alter loudness, add effects, or otherwise modify the audio experience

GamID D2 benchmark evidence: 1,374,355 bytes; 31.57% smaller than the current Master; approximately 496.8 kbps video, 32.4 kbps audio, and 532.4 kbps total; average SSIM 0.98570; average PSNR 44.12 dB.

### Master-source and future pipeline rules

- The original uploaded/source video remains the immutable Master and source of truth for future re-encoding or codec/profile migration.
- D2 and D3 must never overwrite the Master.
- Free and Paid derivatives must each be generated directly from the Master. Never transcode D2 into D3 or D3 into D2.
- Future automatic selection is: `FREE -> D3 / CRF 40`, `PAID -> D2 / CRF 36`, `MASTER -> retained original source`.
- Browser compatibility and fallback delivery are a separate future architecture decision and must not silently change these approved quality-tier targets.
- Subscription/payment integration: **NOT STARTED**.
- Automatic upload/video-processing pipeline: **NOT STARTED**.
- Replacement or publication of the current Intro: **NOT STARTED** and remains deferred.

## Known limitations

- The original intro video is preserved locally but is not part of the approved GitHub TESTING publication. Publishing it remains a separate blocker.
- Slice 2 non-video files are deployed to the TESTING GitHub Pages URLs above. Slice 2 was formally accepted by Mazen on 2026-09-15.
- Manual TESTING confirmed receipt of a real verification email, confirmation, sign-in, creation of the `@BLACK` Solo identity, and preferred-language saving. Supabase's built-in sender can still be rate-limited; custom SMTP remains a future production-scale concern.
- The managed workspace has no compatible visual browser preview for this plain static site. Responsive behavior is enforced by mobile-first CSS/static validation and Mazen has performed phone testing on the HTTPS TESTING site.
- The npm registry was unavailable, so the implementation intentionally uses no added dependency. This does not affect the HTTPS Auth/RPC architecture.
- No public profile publication, QR rendering, OAuth, handle change, parental consent, multi-entity UI, Team, Organization, or Company functionality exists. Slice 3A includes only the authenticated private identity editor described above.

## Continuation boundary

Slice 2 is formally accepted. Slice 3A implementation is complete in TESTING and **AWAITING MAZEN'S ACCEPTANCE**. Production remains **NOT STARTED / NOT AUTHORIZED**. Slice 3B and every later slice remain **NOT STARTED** and must not begin automatically. The Gaming Connections Engine remains FUTURE DIRECTION ONLY, and the approved video quality-tier implementation remains NOT STARTED.
