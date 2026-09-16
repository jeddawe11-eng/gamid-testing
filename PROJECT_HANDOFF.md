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

The fix adds no database migration, schema, RLS, RPC, bucket, or storage-model change. Focused crop tests cover portrait, landscape, square, very tall/A4-style, very wide, bounded pan/zoom with no empty crop area, small-source no-upscale behavior, square Canvas output, delayed pending state until APPLY, CANCEL preservation architecture, and the existing handle/DRAFT/private/QR/security invariants.

Mazen's second mobile review exposed a post-refresh lifecycle defect: after APPLY without SAVE, the abandoned local preview correctly disappeared, but the next valid image could hit `createImageBitmap` rejection and be reported as unreadable. Profile restoration cleared `pendingAvatar` but did not comprehensively reset the file input, crop dialog/image, and revoked preview URL for all mobile page-restoration paths; additionally, an available-but-rejecting `createImageBitmap` had no decoder fallback. The client now has one idempotent lifecycle reset used during profile restoration, successful SAVE, and persisted `pageshow`; it closes/releases crop resources, revokes and nulls the abandoned preview URL, clears pending Avatar state, and empties the chooser. Selection copies the `File` reference and clears the input before asynchronous decode, permitting same-file reselection. Image decoding now falls back to the orientation-correct browser `<img>` path when `createImageBitmap` rejects a valid gallery file. APPLY remains local and unsaved; no automatic upload/save was introduced.

Regression coverage explicitly models APPLY → no SAVE → reinitialize/reload → a second valid image, including bitmap-decoder rejection with successful fallback. It also asserts lifecycle reset on profile restoration/mobile `pageshow`, same-file-ready input clearing, CANCEL/APPLY behavior, and all existing security invariants. The full baseline is now 39/39 tests with lint, typecheck, and build passing. Slice 3A remains **AWAITING MAZEN'S ACCEPTANCE**.

Mazen's subsequent Samsung/Android Chrome review showed that valid image opening could still fail intermittently during repeated selections. The remaining root cause was resource ownership across asynchronous decoders. The `<img>` fallback revoked its Blob `object URL` immediately at `onload`, before the crop session finished drawing from it; mobile decoders can discard that resource before Canvas uses it. In addition, concurrent or stale `createImageBitmap`/fallback completions shared the global crop image, so a late completion or error from an older selection could replace or clean resources belonging to the current selection.

The permanent client-side fix gives every decode/crop attempt a monotonically increasing operation generation. Only the current generation may install an image, report failure, export APPLY, or clean current resources. Stale success releases only its own decoded image; stale failure is ignored. CANCEL, lifecycle reset, and profile restoration invalidate outstanding generations. Each fallback Blob URL is now owned by its decoded `<img>` and remains alive until that exact image's crop session is released. No retry, delay, automatic save, dependency, or backend change was introduced.

Deterministic stress coverage now exercises reversed asynchronous completion, stale failure after a newer success, cancel during an in-flight decode, same-file reselection, repeated decoder sessions, bitmap rejection with fallback, and proof that old cleanup cannot release the current image/URL. The complete baseline is now 43/43 tests with lint, typecheck, and build passing. This acceptance fix is deployed to the existing TESTING `/account/` route through the video-safe GitHub Pages workflow. Slice 3A remains **AWAITING MAZEN'S ACCEPTANCE** pending Mazen's repeated real-device verification.

Mazen's next Android/Samsung/Chrome review isolated a dirty-form-correlated reproduction: APPLY → no text edit → reload could fail on the next selection, while an additional unsaved Display Name/Bio edit before reload appeared to avoid it. Code tracing confirmed that both branches already use the same canonical dirty-state path: pending Avatar alone makes `hasProfileChanges()` true, APPLY calls the same `updateProfilePreview()` used by text input, and reload restores both branches from the same saved server snapshot. The text edit therefore did not activate a missing application reset. It altered Chrome's native form-restoration/lifecycle timing and masked the remaining platform-sensitive ownership defect.

The actual divergent boundary was the native file control: its `change` handler copied `input.files[0]` and immediately cleared `input.value` before starting asynchronous decode. Although desktop Blob implementations retain the copied `File`, Samsung gallery selections can be backed by a transient Android content URI whose lifetime remains tied to the native file input. Depending on page/form restoration timing, clearing the control could invalidate that source before `createImageBitmap` or the `<img>` fallback finished opening it. The input now remains the owner of the selected File for the full decode/crop session and is cleared only on APPLY, CANCEL, current-operation failure, SAVE/reset, or abandoned-state restoration. This also preserves same-file reselection after every completed session.

Regression coverage compares both reported branches through dirty state, reload restoration, and successful post-reload crop opening; asserts that APPLY alone is dirty; and proves the file input is not cleared in the selection handler but is cleared at terminal lifecycle points. All prior async generation/object-URL stress tests remain. The complete baseline is now 46/46 tests with lint, typecheck, build, and `git diff --check` passing. Slice 3A remains **AWAITING MAZEN'S ACCEPTANCE** pending Mazen's real-device retest.

Mazen's following Samsung/Android/Chrome test narrowed the remaining intermittent failure to reselecting a Gallery item previously cropped/APPLYed and then revisited after reload; a genuinely new Gallery item generally opens. Repository tracing found no Service Worker, browser/HTTP image cache, IndexedDB, app-side File cache, metadata key, filename key, duplicate input listener, or code that treats a repeated File identity specially. The deterministic tests can create independent operations for `A → A`, `A → B → A`, CANCEL/reselect, APPLY/reselect, reset/reselect, and new `File` objects with identical metadata. Consequently, the device-specific failure mechanism is **NOT YET PROVEN**, and the earlier content-URI lifetime explanation must remain a hypothesis rather than a final root-cause finding.

Because another behavioral workaround would be speculative, a temporary opt-in TESTING diagnostic trace is available only when the account URL includes `?avatarDebug=1`. It records the selection generation, non-content metadata (MIME, byte size, last-modified value), `createImageBitmap` start/success/failure, `<img>` fallback start/load result, session invalidation reason, fallback URL creation/release events (never the URL value), APPLY outcome, and `pageshow`/`pagehide` lifecycle. The trace persists in `sessionStorage` across reload solely for this diagnostic session and can be copied or cleared from an **Avatar test diagnostics** panel. It never records filenames, image bytes/content, object URL values, account data, credentials, Auth tokens, or QR data.

At that diagnostic checkpoint, application-owned Blob snapshotting and file-input DOM replacement were deliberately **NOT IMPLEMENTED** pending real-device evidence showing whether failure occurred before bitmap decode, in both decoders, or before a new `change` event. Existing lifecycle, decoder fallback, generation ownership, object-URL lifetime, and delayed input-reset fixes remained preserved. The diagnostic baseline was 49/49 tests, and the required next action was Mazen's exact reproduction through the diagnostic TESTING URL.

Mazen supplied the real-device trace. It disproved the reused-file/cache hypothesis: the previously selected 1,715,292-byte JPEG reopened successfully after a true reload (`bitmap-success`, crop opened, APPLY succeeded). A later different 386,263-byte JPEG produced a current-generation `createImageBitmap` `InvalidStateError`, followed by `<img>` fallback load failure on the same Gallery-backed `File`. `change` fired, the file passed MIME/size validation, no stale generation intervened, and profile restoration completed first. The proven failure boundary is therefore the Android/Samsung Gallery source object supplied to both decoders—not dirty state, cache, File identity matching, input event suppression, or stale crop state.

The evidence-backed fix snapshots every accepted Gallery `File` exactly once with `arrayBuffer()` into a fresh application-owned `Blob` of the same MIME type before either decoder runs. Both `createImageBitmap` and `<img>` now consume only that independent Blob, so decoding no longer depends on the transient Android content-provider/File lifetime. The snapshot preserves every source byte, including EXIF orientation metadata; remains bounded by the existing 5 MB limit; is memory-only; and is released with the crop session. APPLY remains local, and only SAVE PROFILE uploads the normalized Avatar. The file input DOM node did not require replacement. Diagnostics now distinguish snapshot read failure from bitmap/fallback decode failure and remain temporary pending Mazen's verification. Snapshot independence, repeated reuse, and read-failure boundary tests bring the complete baseline to 52/52 with lint, typecheck, build, and `git diff --check` passing. Slice 3A remains **AWAITING MAZEN'S ACCEPTANCE**.

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
- Sign-in preserves enumeration-safe credential messaging while distinguishing verified safe failure classes such as unconfirmed email and network/service failure.
- Sessions are stored in browser local storage under a TESTING-specific key and refreshed before expiry. If a browser temporarily rejects the local-storage write, successful Supabase authentication remains usable in memory instead of being misreported as a credential failure; persistence resumes when browser storage is available.
- Password reset sends a recovery link; a recovery callback accepts the new password.
- September 16 TESTING Auth verification proved that the existing `@BLACK` email/password is accepted directly by the same Supabase Auth project and that recovery email delivery, the GitHub Pages recovery callback, and password update all complete against the preserved Auth user. The previously deployed UI discarded every sign-in and recovery exception behind generic copy, making a rate limit/network/service failure indistinguishable from invalid credentials and falsely presenting a failed recovery request as eventual success. The client now preserves enumeration-safe behavior while reporting stable safe categories: invalid credentials, unconfirmed email, network failure, recovery rate limit, or a sanitized Supabase error code. A successful recovery notice is shown only after Supabase returns success. No credential is recorded in source, tests, commits, or this handoff.
- Live GitHub Pages verification further isolated a frontend-only failure: Supabase accepted the credential, but a local post-authentication/session-persistence exception was caught by the same broad block and displayed as `AUTH_ERROR`. Sign-in authentication and authenticated account loading are now separate error boundaries, and browser storage failure can no longer turn a successful Auth response into a false sign-in failure. Regression coverage brings the full baseline to 56/56 tests.
- September 16 real-device testing with a newly created and verified TESTING user proved a second shared frontend failure affecting Sign In and Forgot Password while Signup remained healthy. Both failing handlers called `busy(form, true)` before constructing `FormData`; disabling the controls removed their values from `FormData`, so Sign In threw on `undefined.trim()` and recovery threw on `null.trim()` before either Auth request was sent. Both handlers now capture enabled form values before disabling controls. Focused ordering regression coverage protects both paths.
- **Manual real-device Auth verification — PASS (September 16, 2026):** Mazen completed the full deployed GitHub Pages flow on Samsung/Chrome: new-account signup, confirmation-email delivery, email verification, account/identity creation, sign-out, website sign-in, Forgot Password submission, recovery-email delivery, recovery-link callback, password update, and sign-in with the newly reset password all passed. The earlier `400` response for the preserved `jeddawe11@gmail.com` TESTING account was resolved through the legitimate recovery flow and the account then signed in successfully. This confirms the deployed `AUTH_ERROR` regression is resolved; no further Auth behavior change is required. No passwords, tokens, or other secrets are recorded here.
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
