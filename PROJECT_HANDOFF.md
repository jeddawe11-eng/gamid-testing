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
- Existing private hosted preview remains the Slice 1 publication. Slice 2 was not deployed because Production deployment is explicitly out of scope.

## Slice 2 implementation state

- Preserved implementation checkpoint: `69f31760509c3632a7a581b8474e72b09dcc7b95`
- Git tag: `slice-2-implementation` (pending Mazen acceptance)
- TESTING non-video source publication: `jeddawe11-eng/gamid-testing` on branch `main`
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

Before a future hosted Slice 2 preview, add its exact HTTPS `/account/` URL to Supabase Auth URL Configuration. This was not done in Slice 2 because Production deployment is out of scope and the available connector does not expose Auth URL settings.

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

Database validation completed against the TESTING project with rollback-only temporary users. It verified atomic success, duplicate case-insensitive rejection, reserved rejection, age rejection, no partial rows on failure, same-owner reads, cross-user denial, and clean initial data after test cleanup.

## Known limitations

- The original intro video is preserved locally but is not part of the approved GitHub TESTING publication. Publishing it remains a separate blocker.
- Slice 2 is not deployed. The existing live URL continues to serve accepted Slice 1 only.
- Supabase's built-in email sender returned HTTP 429 during a disposable-address live signup probe, so actual email delivery was not verified from this workspace. Signup is enabled and confirmation is required; the frontend lifecycle is covered by automated tests. Configure custom SMTP before production-scale use.
- The managed workspace has no compatible visual browser preview for this plain static site. Responsive behavior is enforced by mobile-first CSS/static validation, but Mazen still needs a future authorized HTTPS TESTING preview for final phone acceptance.
- The npm registry was unavailable, so the implementation intentionally uses no added dependency. This does not affect the HTTPS Auth/RPC architecture.
- No public profile publication, profile editor, QR rendering, OAuth, handle change, parental consent, multi-entity UI, Team, Organization, or Company functionality exists.

## Continuation boundary

Stop after Slice 2. Do not begin Slice 3 until Mazen tests and explicitly accepts this Slice 2 checkpoint.
