# GamID Project Handoff

Last updated: 2026-09-13 (UTC)

## Purpose and scope

GamID is a customizable digital identity/profile platform for the gaming ecosystem, guided by **CREATE → WOW → SHARE**. Work is deliberately divided into approved slices. Do not start a later slice without Mazen's explicit approval.

## Accepted Slice 1 baseline

- Accepted checkpoint: `f413262c1029b083ca0455d1ca425ae5510498d0`
- Accepted tag: `slice-1-accepted`
- Scope: mobile-first Intro + Transition Engine prototype
- Accepted transitions: Cross Fade, Blur Fade, Shrink to Avatar, Slide Away, Split Reveal
- The accepted intro source files were not modified by Slice 2.
- Slice 1 remains the accepted behavior baseline. The current public TESTING GitHub Pages deployment also includes the completed non-video Slice 2 account surface; Production remains out of scope.

## Slice 2 implementation state

- Preserved implementation checkpoint: `69f31760509c3632a7a581b8474e72b09dcc7b95`
- Git tag: `slice-2-implementation` (pending Mazen acceptance)
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

The mobile account route is `dist/account/index.html` (served as `/account/`). It is a separate surface so the accepted Intro Engine remains unchanged.

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
- Latest Supabase security advisor result: no WARN/ERROR findings; three INFO notices are expected because private tables intentionally have RLS with no policies.

## Migrations

Apply in filename order:

1. `20260912143000_slice_2_account_solo_foundation.sql`
2. `20260912170000_harden_rpc_boundaries.sql`
3. `20260912173500_enforce_least_privilege.sql`

All three are applied to the isolated TESTING project and recorded in its migration history.

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

## Known limitations

- The original intro video is preserved locally but is not part of the approved GitHub TESTING publication. Publishing it remains a separate blocker.
- Slice 2 non-video files are deployed to the TESTING GitHub Pages URLs above. Slice 2 remains pending formal Mazen acceptance.
- Manual TESTING confirmed receipt of a real verification email, confirmation, sign-in, creation of the `@BLACK` Solo identity, and preferred-language saving. Supabase's built-in sender can still be rate-limited; custom SMTP remains a future production-scale concern.
- The managed workspace has no compatible visual browser preview for this plain static site. Responsive behavior is enforced by mobile-first CSS/static validation and Mazen has performed phone testing on the HTTPS TESTING site.
- The npm registry was unavailable, so the implementation intentionally uses no added dependency. This does not affect the HTTPS Auth/RPC architecture.
- No public profile publication, profile editor, QR rendering, OAuth, handle change, parental consent, multi-entity UI, Team, Organization, or Company functionality exists.

## Continuation boundary

Stop after Slice 2. Do not begin Slice 3 until Mazen tests and explicitly accepts this Slice 2 checkpoint.
