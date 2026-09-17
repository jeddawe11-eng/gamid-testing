# GamID — Authoritative Technical Continuation Handoff

Last updated: 2026-09-18

Repository: `jeddawe11-eng/gamid-testing`

Branch: `main`

Authoritative implementation checkpoint: see section 16 for the exact current commit. Public GamID Profile Slice 2/2 (Public Experience + Intro/Transitions) is implemented and TESTING-validated but **not yet formally accepted by Mazen** — see section 7d. It is applied on top of Slice 1/2 (Foundation + Public-Safe Data, section 7b, also not yet formally accepted), the accepted Split Reveal Intro-visibility fix (section 7a), and the Slice 3C implementation checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43`.

This is the authoritative continuation record for Claude Code or any other coding agent. It records what exists, what Mazen accepted, what remains unverified, and what is only future direction. It does not authorize deferred testing, another slice, redesign, deployment, migration, cloud changes, or Production access.

## 1. Status vocabulary

- **IMPLEMENTED AND ACCEPTED** — formally accepted by Mazen; preserve it unless he explicitly authorizes a change.
- **IMPLEMENTED, NOT FORMALLY ACCEPTED** — code may be deployed and technically validated, but formal acceptance was not given.
- **DEFERRED VERIFICATION** — a postponed manual check, not authorization to perform it.
- **APPROVED DIRECTION** — agreed planning direction, not implementation authorization.
- **IDEA ONLY** — requires prioritization, definition, and Mazen's approval.

## 2. Product vision

GamID is a gaming identity platform, not merely a profile page. Its product loop is:

1. **CREATE** — build a personal gaming identity.
2. **WOW** — reveal it through an Intro, transition, and distinctive identity presentation.
3. **SHARE** — take it anywhere through a permanent link, QR, social bio, or message.

The current entity is **SOLO**. **Team**, **Organization**, and **Company** are future direction only; their fields, ownership, membership, and permissions are not authorized for implementation.

## 3. Status at a glance

| Area | Status | Authority |
|---|---|---|
| Slice 1 — Intro / Transition Engine | **IMPLEMENTED AND ACCEPTED** | `f413262c1029b083ca0455d1ca425ae5510498d0`, tag `slice-1-accepted` |
| Slice 2 — Account + SOLO Identity Foundation | **IMPLEMENTED AND ACCEPTED** | Implementation `69f31760509c3632a7a581b8474e72b09dcc7b95`; tag `slice-2-implementation` points to later checkpoint `f0e45aababe9e643121127c508fa223f37916b75`; accepted 2026-09-15 |
| Slice 3A — YOUR GAMID Identity Editor | **IMPLEMENTED, NOT FORMALLY ACCEPTED** | Deployed implementation; preserve it |
| Slice 3B — Gaming Roles + Education & Work | **IMPLEMENTED AND ACCEPTED** | Deployed and accepted by Mazen |
| Slice 3C — Intro Identity Integration | **IMPLEMENTED, NOT FORMALLY ACCEPTED** | Latest implementation checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43` |
| Public GamID Profile — Slice 1/2 (Foundation + Public-Safe Data) | **IMPLEMENTED, NOT FORMALLY ACCEPTED** | TESTING-deployed and validated; see section 7b |
| Public GamID Profile — Slice 2/2 (Public Experience + Intro/Transitions) | **NOT STARTED** | Explicitly deferred; do not begin without Mazen's authorization |
| Post-3C phases | **APPROVED DIRECTION / IDEA ONLY** | See `GAMID_ROADMAP.md`; none is authorized to start |

Mazen intentionally deferred further Slice 3C manual testing and fixes. Do not resume them automatically and do not infer acceptance from technical completion.

## 4. Repository and frontend baseline

- GitHub: `https://github.com/jeddawe11-eng/gamid-testing`
- Branch: `main`
- Implementation checkpoint: `d7466f99e6f5398c5c0e83c029f1d09715c1321f` (Slice 3C backend/timer checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43` plus the accepted Split Reveal Intro-visibility fix; see section 7a)
- Node.js: 20 or newer.
- Frontend: dependency-free static HTML, CSS, and native ES modules under `dist/`.
- Validation: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
- TESTING root: `https://jeddawe11-eng.github.io/gamid-testing/`
- TESTING owner/editor: `https://jeddawe11-eng.github.io/gamid-testing/account/`
- Pages workflow: `.github/workflows/deploy-pages.yml`; it publishes `dist/` and excludes the large development asset `/assets/gamid-intro.mp4`.
- Frontend routing and assets account for the GitHub Pages `/gamid-testing/` base path.

`/account/` is authenticated **owner/editor UI** and must never become the public share profile. Public identity needs a separate non-editing route and privacy model.

Never rewrite Git history, force-push, force-reset, squash accepted checkpoints, or recreate history through an API. Inspect branch, HEAD, worktree, and configuration before changes.

## 5. TESTING backend and infrastructure

Everything here is TESTING. Production is not started or authorized.

### Supabase

- Project: `GamID — TESTING`
- Ref: `upvtrczefcvigxdyuylw`
- Region: Singapore / `ap-southeast-1`
- Auth: email/password registration, confirmation, sign-in/out, password recovery/update, and browser session persistence/refresh. OAuth is not implemented.
- Browser initialization uses the TESTING URL and public anon key. Privileged credentials never belong in the browser.

| Private bucket | Limit | Purpose |
|---|---:|---|
| `avatars` | 5 MiB | Avatar images |
| `intro-sources` | 100 MiB | MP4, QuickTime, or WebM sources |
| `intro-media` | 15 MiB | Processed WebM D3 derivatives |

RLS protects exposed tables. Public-invoker RPCs call private implementations after server-side user/entity authorization. Direct mutations are restricted. Worker claim/completion/failure RPCs are `service_role` only; the browser cannot invoke them.

Repository migrations:

1. `20260912143000_slice_2_account_solo_foundation.sql`
2. `20260912170000_harden_rpc_boundaries.sql`
3. `20260912173500_enforce_least_privilege.sql`
4. `20260915170000_slice_3a_identity_foundation.sql`
5. `20260916130000_slice_3b_roles_education_occupation.sql`
6. `20260916134000_slice_3b_catalog_indexes.sql`
7. `20260916170000_slice_3c_intro_identity.sql`
8. `20260916173000_slice_3c_intro_indexes.sql`
9. `20260916174500_slice_3c_worker_permissions.sql`
10. `20260916180000_slice_3c_dispatch_activation.sql`
11. `20260918120000_public_profile_foundation.sql`
12. `20260918120500_public_profile_rpcs.sql`
13. `20260918121000_public_profile_avatar_read.sql`
14. `20260918121500_public_profile_education_catalog.sql`
15. `20260918122000_public_profile_avatar_policy_fix.sql`
16. `20260918123000_fix_check_handle_availability_anon_grant.sql`

Equivalent applied Slice 3C remote records are `20260916101711`, `20260916101805`, `20260916102030`, and dispatch activation record `20260916150139`. Do not rerun or duplicate them. Migrations 1–10 above were originally applied out-of-band under those different remote version identifiers; on 2026-09-18 their tracking history was reconciled via `supabase migration repair` (metadata-only — no schema or data was touched, verified by direct schema/RLS/function introspection beforehand) so that `supabase db push` could resume normal operation. Migrations 11–15 were applied by `supabase db push` directly and their remote version identifiers match their filenames exactly.

Dispatch boundary:

- `pg_net` is enabled.
- Vault references: `gamid_intro_dispatch_url_testing` and `gamid_intro_dispatch_secret_testing`.
- An audited `AFTER INSERT` trigger dispatches pending `intro_processing_jobs`.
- Public, anon, and authenticated roles cannot execute the privileged dispatch function.
- Never print, log, document, or return Vault or secret values.

### Google Cloud

- Project: `GamID TESTING`
- ID: `gamid-testing`
- Number: `47370703477`
- Region: `asia-southeast1`
- Billing: linked Free Trial at last verification; never activate full paid billing automatically.
- Approved APIs: Cloud Run, Artifact Registry, Cloud Build, Secret Manager.

| Type | Resource | Configuration / boundary |
|---|---|---|
| Artifact Registry | `gamid-workers` | Worker/Dispatcher image repository |
| Image | `slice-3c-testing-2` | Digest `sha256:1ca4e8e4a4565bdfa444ab27ea29218d54bcc8d977a59d811b7bb7ab0dad0bbc` |
| Cloud Run Job | `gamid-intro-worker-testing` | 1 task, 2 vCPU, 2 GiB, 10-minute timeout, 1 retry |
| Dispatcher service | `gamid-intro-dispatcher-testing` | 1 vCPU, 256 MiB, concurrency 20, min 0, max 2 |
| Worker service account | `gamid-intro-worker` | Reads only the Worker Supabase secret |
| Dispatcher service account | `gamid-intro-dispatcher` | Invokes only the fixed Job; reads only the dispatch secret |
| Secret Manager | `gamid-supabase-secret-testing` | Worker Supabase credential reference |
| Secret Manager | `gamid-dispatch-secret-testing` | Dispatch authentication reference |

The dedicated Supabase server credential is named `gamid-intro-worker-testing`; its value exists only through the established Google secret reference. Never expose it. Do not create service-account JSON keys. Neither service account has or should receive Owner or Editor.

The same image runs:

- Worker: `node intro-worker.mjs once`
- Dispatcher: `node intro-dispatcher.mjs`

Supabase `pg_net` cannot mint Google identity tokens, so the Dispatcher has a public Cloud Run invocation boundary protected by the mandatory shared application secret. It returns `202` only after Google `jobs.run` succeeds. The Dispatcher cannot read the Worker secret; the Worker cannot read the dispatch secret.

There is no GPU, VPC connector, persistent disk, or always-running instance. TESTING scales to zero. Some worker-local README prose still describes pre-deployment planning; use it for commands/resource definitions, but use this handoff for current deployment status.

## 6. Slice history

### Slice 1 — Intro / Transition Engine

**IMPLEMENTED AND ACCEPTED.** Established the accepted Intro, visual transition experience, and Transition Engine reused by later previews. Accepted transitions are Cross Fade, Blur Fade, Shrink to Avatar, Slide Away, and Split Reveal. Do not redesign them without explicit authorization.

### Slice 2 — Account + SOLO Identity Foundation

**IMPLEMENTED AND ACCEPTED.** Established Supabase Auth, SOLO entity foundation, permanent-handle protection, opaque QR groundwork, RLS/RPC boundaries, and authenticated owner behavior. The stable handle and opaque `q_<random>` QR identifier are identity foundations; do not expose internal IDs or treat the QR groundwork as a completed public experience.

### Slice 3A — YOUR GAMID Identity Editor

**IMPLEMENTED, NOT FORMALLY ACCEPTED.** Includes Avatar crop/zoom, Display Name, permanent handle presentation, Bio, validation, dirty-state, and save behavior.

Historical Samsung Gallery-backed Avatar files produced `File.arrayBuffer()` / `NotReadableError`, `createImageBitmap` `InvalidStateError`, or fallback decode failures. The implementation snapshots selected bytes into an application-owned Blob while the picker source remains readable. Diagnostics remain opt-in through `?avatarDebug=1`. The fix exists; broader Slice 3A acceptance/stabilization remains deferred.

### Slice 3B — Gaming Roles + Education & Work

**IMPLEMENTED AND ACCEPTED.** Includes optional roles, one primary role, catalog-backed selection, and optional Education/Work. The role catalog includes Gamer, Streamer, Content Creator, Esports Player, Coach, Designer, Developer, Tournament Organizer, Team Manager, Community Manager, Video Editor, and Photographer.

### Slice 3C — Intro Identity Integration

**IMPLEMENTED, DEPLOYED TO TESTING, TECHNICALLY VALIDATED, NOT FORMALLY ACCEPTED.**

| Checkpoint | Purpose |
|---|---|
| `37812de` | Slice 3C foundation |
| `1692e5d` | Cloud Run dispatch preparation |
| `85425db` | Complete TESTING deployment |
| `697f56c` | Safe history reconciliation/publication |
| `50c426a` | Mobile upload/auth error-path and TUS work |
| `e86c995` | Stable Samsung Gallery Intro source snapshot |
| `1c2a22c` | Processing polling and foreground refresh |
| `2fbfe3197f0f409a9c4247760740c61ad4618f43` | Correct browser timer binding; latest implementation |

### Public GamID Profile — Slice 1/2 (Foundation + Public-Safe Data)

**IMPLEMENTED, DEPLOYED TO TESTING, VALIDATED, NOT FORMALLY ACCEPTED.** See section 7b.

### Public GamID Profile — Slice 2/2 (Public Experience + Intro/Transitions)

**IMPLEMENTED, DEPLOYED TO TESTING, VALIDATED, NOT FORMALLY ACCEPTED.** See section 7d.

## 7. Slice 3C exact implementation

### Owner experience

- `YOUR INTRO` accordion; Add, Replace, and Remove Intro.
- Transition selector and accepted Transition Engine integration.
- Full Preview: Intro → selected transition → current real identity.
- Intro/transition participate in dirty state and `SAVE GAMID`.
- No fake progress percentages.
- Replacement keeps the current derivative active until the replacement is READY.
- Failure does not discard the previous active Intro.
- Removal/replacement use the established source and derivative cleanup lifecycle.

### Upload, dispatch, and processing

1. The authenticated browser validates the source.
2. Samsung selection is immediately copied to an application-owned Blob.
3. Supabase Storage TUS uploads it to private `intro-sources`.
4. `queue_my_intro` authorizes the user/entity and creates the pending job.
5. The `pg_net` trigger calls the Vault Dispatcher URL/secret.
6. The Dispatcher authenticates and invokes only `gamid-intro-worker-testing`.
7. The Job starts the Worker with its attached identity.
8. The Worker atomically claims one job with worker-only RPC and `SKIP LOCKED` semantics.
9. It downloads the source, runs FFmpeg, validates via `ffprobe`, and uploads private D3 media.
10. `worker_complete_intro_job` atomically activates the derivative and sets READY.
11. Source/superseded-derivative cleanup follows the existing safety rules.

Malformed, unauthorized, stale, duplicate, cancelled, or already-claimed requests do not gain privilege or safely cause duplicate processing. The current server design enforces one in-flight job per profile.

TUS details:

- Endpoint: `https://upvtrczefcvigxdyuylw.storage.supabase.co/storage/v1/upload/resumable`
- Fixed 6 MiB chunks with creation `POST`, returned `Location`, tracked offsets, `PATCH`, and retries.
- Session token and anon key are headers only, never logs/UI/documentation.
- The historical misleading “Authentication service could not be reached” upload classification was fixed and the supported TUS transport adopted.
- The historical Samsung Intro source-lifetime failure was fixed with the stable Blob snapshot.

Status refresh:

- After `queueIntro`, poll `getMyIntro()` every 3 seconds.
- Render real backend state; stop on `ready`, `failed`, or `cancelled`.
- Maximum duration: 5 minutes.
- Refresh on foreground `visibilitychange`.
- Prevent duplicate loops and clean timers/listeners.
- The Samsung `Illegal invocation` came from native timer functions invoked through an object receiver. `2fbfe319...` wraps `globalThis.setTimeout`/`clearTimeout` so the correct receiver is used.

Recorded validation at `2fbfe3197f0f409a9c4247760740c61ad4618f43`:

- lint: **PASS**
- typecheck: **PASS**
- tests: **88/88 PASS**
- build: **PASS**
- `git diff --check`: **PASS**

These are historical results for that checkpoint, not a fresh run after later changes.

## 7a. Split Reveal Intro-visibility fix — ACCEPTED

**IMPLEMENTED AND ACCEPTED (scoped).** Mazen manually accepted this specific fix on real-device testing on 2026-09-18. This acceptance covers only the Split Reveal defect described below; it does not close the broader Slice 3C deferred verification items in section 9.

**Symptom:** in the real account Preview flow (`/account/` → YOUR INTRO → PREVIEW INTRO), selecting the Split Reveal transition showed a static image for the entire time the Intro was playing, and the same static image kept appearing after the user's Intro video was replaced (Video 1 → Video 2 → Video 3), even though Cross Fade, Blur Fade, Shrink to Avatar, and Slide Away all correctly showed the current video.

**Root cause:** `.split-panel` (Split Reveal's left/right halves, in `dist/styles.css`) becomes `display:block` as soon as the Split Reveal preset is selected — not gated to the transitioning state — and carries an explicit `z-index:4`, while `#introVideo` has no z-index (default/auto stacking tier). The panel's own `background-image` is the hardcoded build-time `assets/gamid-intro-poster.webp`, never derived from the user's actual video. As a result the panel visually covered the real, currently-playing Intro video for the entire pre-transition "intro" phase, every time Split Reveal was selected, regardless of which video was loaded — which is exactly why the same static image appeared to persist across every video replacement.

Two earlier attempts were made and superseded before this root cause was isolated:
- An initial fix (commit `9b41324`) made the intro layer's background transparent during the transition, fixing a separate stuck-black-overlay defect, but the transition itself still used a one-time canvas snapshot (`--split-frame`), which was frozen by design.
- A second fix (commit `f4327d9`) replaced the canvas snapshot with live cloned `<video>` elements synced to the source video, fixing the transition's own motion — but this did not fix what users actually saw, because it only changes content during the `transitioning` state; the poster-covering-video defect above happens entirely during the earlier `intro` state, before any clone exists.
- A speculative change (deriving the clone's source from `config.videoUrl` instead of `introVideo.currentSrc`) was investigated as a possible cause of a reported stale-video-reference symptom, but was not reproducible under rigorous testing and was reverted. It is **not** part of the accepted fix.

**Accepted fix (commit `d7466f99e6f5398c5c0e83c029f1d09715c1321f`):** in `dist/account/intro-preview.css` (loaded only by the real Preview flow; the separately-accepted Slice 1 lab prototype at `dist/index.html` does not load this file and is unaffected):

```css
.preview-only .experience[data-state="intro"] .preset-split .split-panel{opacity:0;pointer-events:none}
```

This hides the panel (and its poster) with `opacity` only while `state="intro"`, so the real video is the top visible content during playback. It does not touch `display`, so the existing `transform` transition still animates smoothly once `state` flips to `transitioning`, at which point the panel reverts to its default `opacity:1` automatically, coinciding with when the live-clone-video mechanism (from `f4327d9`) takes over.

**Validation:** lint PASS, typecheck PASS, tests 88/88 PASS. Verified across three distinct videos in one continuous session: each video's own content (not the poster) is visibly playing during the `intro` state, and each correctly carries into the Split Reveal transition with a clean completion to the `profile` state. Cross Fade, Blur Fade, Shrink to Avatar, and Slide Away reconfirmed unchanged.

## 7b. Public GamID Profile — Slice 1/2 (Foundation + Public-Safe Data)

**IMPLEMENTED, DEPLOYED TO TESTING, VALIDATED — NOT FORMALLY ACCEPTED.** This is the first of exactly two approved implementation slices for the Public GamID Profile roadmap item. **Slice 2/2 (the actual public Intro → Transition → Identity experience) is explicitly deferred and not started.** Do not begin it without Mazen's authorization.

### Goal

Let a SOLO owner explicitly publish/unpublish a read-only public identity, and let an anonymous visitor retrieve only the fields the owner has made public — without ever weakening RLS, without `/account/` becoming the public route, and without building the final public experience or full granular privacy controls (both remain future roadmap items).

### Database changes (5 forward migrations, all applied only to GamID TESTING `upvtrczefcvigxdyuylw`)

| Migration | Purpose |
|---|---|
| `20260918120000_public_profile_foundation.sql` | Adds `'PUBLIC'` as a new value to the existing `public.entity_visibility` enum (previously `DRAFT`/`PRIVATE`, already present but unused by any frontend code). Isolated in its own migration/transaction because Postgres forbids using a freshly added enum value in the same transaction that adds it. |
| `20260918120500_public_profile_rpcs.sql` | Adds `set_my_identity_visibility(candidate_public boolean)` (authenticated-only publish/unpublish, `private`-impl + `public`-invoker pattern, same as every other mutation in this codebase) and `get_public_identity(candidate_handle text)` (anonymous-safe read, gated on `visibility = 'PUBLIC'`). |
| `20260918121000_public_profile_avatar_read.sql` | Adds a `storage.objects` SELECT policy for the `avatars` bucket, initially written as a direct `exists (select 1 from public.entities …)` subquery. |
| `20260918121500_public_profile_education_catalog.sql` | Extends `get_public_identity`'s return columns to also include `education_work_catalog jsonb`, matching the same catalog-label pattern already used for Gaming Roles, so Education/Work renders proper labels instead of raw catalog keys. |
| `20260918122000_public_profile_avatar_policy_fix.sql` | **Fixes a real bug found during live E2E testing**: the storage policy from `20260918121000` failed with `permission denied for table entities` when evaluated as `anon`, because RLS policy subqueries run with the querying role's own table privileges, and `anon` correctly has no direct grant on `public.entities`. Fixed by moving the check into a new `security definer` function `private.avatar_is_public(candidate_path text)`, granted to `anon, authenticated`, and referencing that function from the policy instead of querying `entities` directly. |

No existing table, RLS policy, or function was altered or weakened. `entities`/`profiles`/`profile_gaming_roles` still have **zero** direct `anon` grants — the two new functions plus the one new storage policy are the *only* anonymous-safe boundary, both `security definer` internally and both explicitly scoped to `visibility = 'PUBLIC'`.

**Public-safe fields exposed:** `gamid_handle`, `display_name`, `avatar_media_reference` (path only; actual bytes gated by the storage policy above), `bio`, `role_keys`/`primary_role_key`/`role_catalog` (Gaming Roles), `education_work_status`/`institution`/`field_of_study`/`education_work_catalog` (Education & Work).

**Explicitly never exposed:** email, date of birth, any `auth.*` data, internal `entity_id`/`profile_id`, the raw QR `public_token`, draft/unpublished state, or any Storage/processing internals. Confirmed both by static test assertions (below) and by inspecting the actual live anonymous HTTP response during E2E testing.

### Frontend changes

- `dist/account/supabase-client.js`: added `setMyIdentityVisibility(candidatePublic)`, `getPublicIdentity(handle)` (anonymous RPC call), and `loadPublicAvatar(path)` (avatar fetch with no Authorization header, relying solely on the new anon-safe storage policy).
- `dist/account/index.html` / `account.js` / `account.css`: added a Publish/Unpublish control integrated into the existing YOUR GAMID live-preview card (`#visibilityChip` / `#visibilityToggle`) — no unrelated UI redesigned. The lede copy was updated from "publishing is introduced in a future approved slice" to reflect that it now exists.
- `dist/public/` (new, page-specific, loads only its own two small files): a temporary, reversible TESTING route — `dist/public/index.html?handle=<handle>` — that is read-only, requires no authentication, sends no auth token of any kind, and renders only the public-safe fields above. Handles not-found/unpublished identically (an empty RPC result either way, so the page cannot distinguish "doesn't exist" from "exists but private," which is intentional). **This route/URL is explicitly temporary** — the final permanent share-URL syntax (`GAMID_ROADMAP.md` item 3) and persistent QR resolution (item 4) are separate, unstarted roadmap items and were not decided here.
- `package.json`: added `dist/public/public.js` to the `typecheck` script.
- `tests/public-profile-foundation.test.js` (new, 11 tests, following this repo's existing static-assertion pattern for migrations/HTML): asserts the enum change is isolated, the private/public function split and grants are correct, the public RPC's return columns never include a forbidden field, the storage policy is scoped correctly, and the public route has no forms/file inputs/auth-only controls.

### A pre-existing bug found (not fixed — out of this slice's scope)

While testing real sign-up against TESTING, handle-availability checking failed for a brand-new account with `permission denied for function check_handle_availability_impl`. Inspection showed `private.check_handle_availability_impl`'s live grant is missing `anon` (`{postgres=X,service_role=X,authenticated=X}`), even though its own migration (`20260912170000_harden_rpc_boundaries.sql`, already applied, unchanged) explicitly grants `anon, authenticated`. No later migration touches this function. This is a genuine drift between the migration file's intent and the live database, unrelated to Public Profile — **it currently blocks brand-new user sign-up in TESTING** (existing users signing in are unaffected). Not fixed in this slice per its approved scope boundary; flagged for Mazen's decision. **Fixed separately afterward — see section 7c.**

### Validation

- lint PASS, typecheck PASS, tests **99/99 PASS** (88 existing + 11 new).
- Genuine live E2E against GamID TESTING (real anonymous HTTPS calls, not mocked), using a disposable test account created and fully deleted afterward (entity/profile/roles/QR/auth user cascaded via `DELETE FROM public.entities`, then `DELETE FROM auth.users`; the one associated private avatar Storage object could not be deleted via SQL — Supabase blocks direct storage-table deletion — and was left as a harmless orphan with no owning entity, so the new policy can never match it):
  - New account defaults to `DRAFT`/private; anonymous `get_public_identity` returns `[]`.
  - Owner fills Bio, Gaming Roles (primary + secondary), Education/Work, and an Avatar; saves successfully; existing editor/Slice 3A/3B behavior unaffected.
  - Clicking Publish → anonymous call returns exactly the approved fields with correct catalog labels, and the avatar loads anonymously; response contains no email/DOB/internal IDs/QR token.
  - Clicking Unpublish → anonymous identity call and anonymous avatar fetch both fail/empty immediately (no caching lag observed).
  - The temporary `/public/?handle=` page correctly renders both the "not public" state and the fully published state, entirely signed out.
  - Existing `/account/` sign-in, profile editing, Gaming Roles, Education/Work, and the Intro accordion (all five accepted transitions still listed) reconfirmed working, unaffected by these changes.

## 7c. Sign-up permission drift fix — `check_handle_availability_impl` anon grant

**FIXED.** Mazen authorized fixing exactly the drift identified in section 7b, and only that drift.

**Verification before fixing:** re-confirmed read-only against live GamID TESTING that `private.check_handle_availability_impl`'s ACL was still exactly `{postgres=X,service_role=X,authenticated=X}` (missing `anon`), that the public wrapper `public.check_handle_availability` correctly still had `anon`, that no migration newer than `20260912170000_harden_rpc_boundaries.sql` touches this function, and that an anonymous call still failed with the exact same `permission denied for function check_handle_availability_impl` (HTTP 401) error as originally reported. The observed state matched the previously confirmed issue exactly, so the fix proceeded.

**Fix (commit and migration `20260918123000_fix_check_handle_availability_anon_grant.sql`, applied only to GamID TESTING):**

```sql
grant execute on function private.check_handle_availability_impl(text) to anon;
```

A single-statement forward migration restoring exactly the grant the original, unmodified, already-applied migration already specifies — nothing else. No historical migration was rewritten. No other grant, RLS policy, or table was touched. `authenticated`'s existing correct grant was left alone (only `anon` was missing and only `anon` was added).

**Live validation after the fix**, using a second disposable test account created and fully deleted afterward:

- Handle-availability now succeeds anonymously (`{"available":true}` for a fresh handle) both via a direct HTTPS call and through the real sign-up UI (`@handle is available` now renders live, with no workaround needed).
- A brand-new TESTING user completed sign-up → email confirmation → Solo identity creation entirely through the normal UI flow.
- Existing sign-in continued to work for the pre-existing accounts used earlier in this session.
- YOUR GAMID editing (Bio/Roles/Education) unaffected.
- Public GamID Profile Slice 1/2 Publish/Unpublish re-verified end-to-end: publish exposes exactly the approved public-safe fields anonymously; unpublish immediately removes anonymous access again; no private/internal field appeared in any response.
- The Intro accordion and all five accepted transitions (Cross Fade, Blur Fade, Shrink to Avatar, Slide Away, Split Reveal) confirmed still listed and functioning, unaffected.
- lint PASS, typecheck PASS, tests **101/101 PASS** (99 existing + 2 new, asserting the fix migration is a single minimal grant with no revoke/drop/create/alter statements).

## 7d. Public GamID Profile — Slice 2/2 (Public Experience + Intro/Transitions)

**IMPLEMENTED, DEPLOYED TO TESTING, VALIDATED — NOT FORMALLY ACCEPTED.** Mazen authorized this exact scope: build the actual Intro → Transition → Public Profile visitor experience on top of Slice 1/2's public-safe data boundary, using the accepted Transition Engine and the existing Intro Identity implementation, with no second Intro system, no AI/Cinematic Identity work, and no roadmap items beyond this slice.

### Goal

A visitor opening a published player's public GamID experiences INTRO → SELECTED TRANSITION → PUBLIC PROFILE using the player's existing real GamID identity data — the normal/basic foundation, not the future experimental cinematic/AI identity system.

### Backend changes (2 forward migrations, applied only to GamID TESTING `upvtrczefcvigxdyuylw`)

| Migration | Purpose |
|---|---|
| `20260918130000_public_profile_intro.sql` | Extends `get_public_identity`'s return columns with `intro_transition_key text` and `intro_derivative_path text`, gated on `e.visibility = 'PUBLIC'` and the active intro job's `state = 'ready'`. Returns nothing for these columns when no Intro is configured or it is still processing — the frontend treats an empty path as "no Intro." |
| `20260918130500_public_profile_intro_media_read.sql` | Adds a `storage.objects` SELECT policy for the `intro-media` bucket via a new `security definer` function `private.intro_media_is_public(candidate_path text)`, granted to `anon, authenticated` — written security-definer-first from the start, applying the lesson learned from the avatar policy bug in Slice 1/2 (section 7b) rather than repeating it. |

No table gained a direct `anon` grant. `intro_processing_jobs`, `profile_intro_settings`, and `entities` still have zero direct anonymous access — the RPC and the one new storage policy are the only anonymous-safe boundary, both scoped to `visibility = 'PUBLIC'` and a ready derivative.

**Never returned by the RPC:** `job_id`, `profile_id`, `entity_id`, `owner_user_id`, `source_path`, `failure_code`, or any other Intro processing internal — confirmed by static test assertion and by inspecting the actual anonymous HTTP response during E2E testing.

### Frontend changes

- `dist/account/supabase-client.js`: added `loadPublicIntroMedia(path)`, mirroring the existing `loadPublicAvatar(path)` exactly — anonymous fetch, no `Authorization` header.
- `dist/account/intro-preview.html` / `intro-preview.js`: the same file the owner's own **PREVIEW INTRO** dialog already uses (`account.js`'s existing postMessage contract), reused unmodified for the public route via an `<iframe>`. Extended, not replaced, with:
  - a `publicMode` config flag that hides the owner-only `PREVIEW` badge, `DRAFT · PRIVATE` badge, and the `YOUR GAMID` eyebrow label (`account.js` never sets this flag, so the owner's own preview is provably unaffected — asserted by test);
  - a no-video branch that jumps straight to the revealed profile via the **existing** `SKIP` state-machine event, so a no-Intro profile opens directly with no broken/empty Intro stage instead of needing new state-machine logic;
  - a `gamid-intro-preview-state` broadcast so a host page can show/hide its own Replay control without polling.
- `dist/public/public.js`: rewritten to call `getPublicIdentity(handle)`, build the same config shape `account.js`'s own preview builds, load the avatar and Intro media anonymously in parallel, and post that config into the iframe. Adds an unobtrusive **↻ Replay Intro** button (`dist/public/index.html`, `public.css`) that appears only once the profile is revealed and only when an Intro exists, and replays by re-posting the same config — never `location.reload()`.
- `dist/public/index.html` / `public.css`: the old Slice 1/2 custom `.public-card` markup is removed in favor of the iframe; the loading/not-found states and site header are unchanged. The route is still the same temporary `/public/?handle=` structure from Slice 1/2 — no permanent URL/QR architecture was decided or locked in.

### Two genuine bugs found and fixed during live E2E testing

Both were found by testing the real deployed-shape flow in a browser against live TESTING data (not by static assertions), and both are fixed in the implementation checkpoint below:

1. **Intro never played on first page load.** `public.js` originally attached its `message` listener only *after* `await`ing the identity fetch and the avatar/Intro-media loads. `intro-preview.js` posts its `gamid-intro-preview-ready` signal synchronously as soon as its own script runs, which happens immediately because the iframe is already present in the static HTML. That ready signal reliably arrived before the listener existed and was silently lost, so the config was never sent and the Intro stage stayed permanently blank. Fixed by attaching the listener first, before any `await`, and calling `send()` again once the config resolves.
2. **`DRAFT · PRIVATE` badge stayed visible in public mode despite `hidden=true`.** `intro-preview.css` unconditionally set `.preview-private{display:inline-block}`. That rule has the same CSS specificity as the browser's built-in `[hidden]{display:none}` rule, and being an author style it wins the cascade — so setting the `hidden` property in JavaScript had no visible effect. Fixed with a scoped `.preview-private[hidden]{display:none}` override that changes nothing about the badge's normal (visible) appearance.

A third, lower-severity issue (the static `YOUR GAMID` eyebrow label rendering on a visitor's screen above someone else's identity) was fixed the same way the existing badges are hidden — a new `id="previewEyebrow"` toggled by the same `publicMode` flag — rather than inventing new public-facing copy.

### Validation

- lint PASS, typecheck PASS, tests **115/115 PASS** (112 existing + 3 new, covering the message-listener ordering fix, the `send()` guard, and the CSS/hidden fix).
- Genuine live E2E against GamID TESTING using a disposable account (`slice2test1`, created and fully deleted afterward via the same cascade-delete pattern as sections 7b/7c):
  - Full onboarding → Intro upload → transition selection → Publish, through the real UI.
  - Intro → Transition → Profile confirmed working end-to-end after the fixes above, with the owner-only `PREVIEW`/`DRAFT · PRIVATE`/`YOUR GAMID` chrome correctly absent.
  - **All five accepted transitions individually verified in the public experience**: Cross Fade, Blur Fade, Shrink to Center, Slide Away, and Split Reveal (including its live-video clone mechanism) each reached the `profile` state cleanly.
  - Replay Intro verified: replays Intro → transition → profile with `performance.getEntriesByType("navigation")` confirming no page reload occurred.
  - No-Intro case verified: removing the Intro and republishing opens directly to the revealed profile, no broken/empty Intro stage, Replay button correctly absent.
  - Publish/Unpublish boundary re-verified in this slice's context: unpublishing immediately made `get_public_identity` return nothing and made the Intro-media storage fetch return nothing, and the public route immediately showed its "isn't public" state.
  - Mobile portrait (375×812) and desktop (1440×900) viewports both verified clean, no overflow, no broken layout.
  - Existing owner-side regressions reconfirmed unaffected: sign-in, YOUR GAMID editing (Bio, Display Name), Gaming Roles, Intro upload/replace/remove, the owner's own PREVIEW INTRO dialog (still shows its badges correctly), and handle-availability during sign-up (confirming the section 7c drift fix is still live).

### Deliberately deferred (not part of this slice)

The final permanent public share-URL/QR architecture (`GAMID_ROADMAP.md` items 3–4) was **not** decided or locked in here. The temporary `/public/?handle=` route from Slice 1/2 was preserved as-is because it remained sufficient for this slice's scope. Games, Stats, Gaming Connections, Discord, marketplace, jobs, organizations, teams, companies, and any AI-generated/Cinematic Identity presentation were explicitly out of scope and were not touched.

## 8. Real Samsung / real E2E evidence

A protected Samsung/@BLACK job proved the backend path:

- upload and queue succeeded;
- Dispatcher returned HTTP `202` after successful `jobs.run`;
- Worker started, claimed the job, and completed FFmpeg;
- `worker_complete_intro_job` succeeded and final state became READY;
- source cleanup succeeded;
- the active private derivative exists.

| Boundary | Approximate timing |
|---|---:|
| Queue → READY | 2m40s |
| Cloud Run startup | 21.5s |
| Worker/FFmpeg/completion | 2m18s |

The UI was observed showing **“Intro ready”** and **“Optimized D3 Intro is active.”** This proves real processing and a ready-state render, but not the precise post-`2fbfe319` automatic Processing → Ready transition without refresh; that check remains deferred.

A controlled synthetic TESTING E2E also passed upload → queue → dispatch → Worker → READY. Temporary auth/entity/job/Storage artifacts were cleaned, and protected @BLACK data remained intact. Never use that identity destructively.

## 9. Manual acceptance state

Mazen chose not to spend more time on manual Slice 3C testing/fixes now. Slice 3C is **not formally accepted** despite passing automation, deployment, and real backend E2E.

These are **DEFERRED VERIFICATION**, not active authorization:

- Preview Intro visual review.
- Transition visual review — the Split Reveal preset specifically is now **FIXED AND ACCEPTED** (section 7a, checkpoint `d7466f99e6f5398c5c0e83c029f1d09715c1321f`); Cross Fade, Blur Fade, Shrink to Avatar, and Slide Away were reconfirmed unaffected during that fix, but have not been separately reviewed by Mazen.
- Replace Intro manual regression.
- Remove Intro manual regression.
- Automatic Processing → Ready without refresh after the final timer fix.
- Desktop full-screen visual quality review.

Do not ask for another upload or resume these automatically. Discuss the next priority with Mazen first.

## 10. Known/deferred issue register

| Observation | Status | Meaning |
|---|---|---|
| Split Reveal showed a static poster instead of the playing Intro video, unaffected by video replacement | **FIXED AND ACCEPTED** | `.split-panel` was visible with `z-index:4` above `#introVideo` during the `intro` state; see section 7a, checkpoint `d7466f99e6f5398c5c0e83c029f1d09715c1321f` |
| Brand-new user sign-up blocked in TESTING (`check_handle_availability_impl` missing its `anon` grant) | **FIXED** | Live grant had drifted from the already-applied, unmodified migration's intent; see section 7c, checkpoint `6bad4d583735d1e8c589642911f3decd52d7eff2` |
| Public route's Intro never played on first load (message listener attached after two `await`s, missing the iframe's synchronous ready signal) | **FIXED** | `public.js` now attaches its `message` listener before the identity fetch; see section 7d, checkpoint `ce2018f3ff5b2de0a688d3970d81b0c71d8d5cb7` |
| `DRAFT · PRIVATE` badge stayed visible in the public experience despite `hidden=true` | **FIXED** | `.preview-private{display:inline-block}` had the same CSS specificity as `[hidden]` and won the cascade; see section 7d, checkpoint `ce2018f3ff5b2de0a688d3970d81b0c71d8d5cb7` |
| Samsung Avatar Gallery read/decode failures | **FIXED IMPLEMENTATION; 3A UNACCEPTED** | Stable Blob path exists; broader acceptance deferred |
| Misleading Auth error during Intro upload | **FIXED** | Correct classification and TUS transport exist |
| Samsung Intro source lifetime | **FIXED** | Stable Blob captured during selection |
| Polling `Illegal invocation` | **FIXED** | Timer globals called with correct receiver |
| Cloud Run latency | **OBSERVED** | Scale-to-zero startup ~21.5s; real queue → READY ~2m40s |
| Automatic final Processing → Ready UI transition | **UNVERIFIED** | Backend READY proven; final Samsung no-refresh path unaccepted |
| Desktop Intro appearance | **DEFERRED** | Resolution/scaling matter; no blind CRF change justified |
| Replace/Remove/transition manual regressions | **DEFERRED** | Implemented, but final manual checks incomplete |
| Existing-email Create Account UX | **DEFERRED** | Enumeration-safe Auth behavior can lead an already-registered email into the verification presentation instead of clearly guiding a returning user; do not change it incidentally |
| Supabase Pro / leaked-password protection | **DEFERRED** | A future service-plan/security decision, not current implementation authorization |
| Built-in Supabase email sender limits | **KNOWN PRODUCTION CONCERN** | Real confirmation email worked in TESTING; custom SMTP/rate-limit planning belongs to Production readiness |

## 11. Video processing policy

The source/Master is the derivation source:

- source → D3;
- future source → D2;
- never D2 → D3;
- never D3 → D2.

Current FREE D3:

- VP9/WebM, `-crf 40`, `-b:v 0`;
- `-deadline good`, `-cpu-used 2`, `-row-mt 1`;
- `yuv420p`;
- preserve source resolution, FPS, duration, and timing;
- Opus approximately 32 kbps VBR/audio mode when audio exists;
- derivative ceiling 15 MiB; source ceiling 100 MiB; duration 0.5–30 seconds.

Benchmark using a 576×1024, 20.619s, 30 fps H.264/AAC source:

| Output | Size | Video / total bitrate | SSIM | PSNR |
|---|---:|---:|---:|---:|
| Master | 2,008,480 B | — | Reference | Reference |
| CRF 40 benchmark | 1,073,060 B | ~379.8 / 415.7 kbps | 0.98171 | 42.77 dB |
| Fresh CRF 40 investigation | 1,061,753 B | ~374.3 / 411.3 kbps | 0.981997 | 42.860 dB |
| CRF 36 comparison | 1,355,625 B | ~488.2 / 525.2 kbps | 0.985950 | 44.213 dB |

CRF 36 used ~27.7% more bytes for modest metric improvement and did not solve the dominant desktop issue: a portrait 576px source enlarged across 1920px is ~3.33× upscaled, while `object-fit: cover` crops it. Full Preview was adjusted to contain portrait media in landscape/desktop while preserving mobile portrait behavior. Do not change D3 based on one desktop impression; require representative sources, objective evidence, cost analysis, and approval.

Paid D2 is **APPROVED FUTURE SUBSCRIPTION DIRECTION**, not implemented or authorized here.

## 12. Security, privacy, and cost invariants

- Keep TESTING and Production separate; Production is unauthorized.
- Never expose or commit secrets, tokens, private keys, passwords, authorization codes, trusted server paths, or `service_role` credentials.
- No downloadable service-account JSON keys; preserve least privilege and separate service identities.
- Keep source/derivative Storage private and preserve RLS/private RPC/worker-only boundaries.
- Invalid requests must not trigger unnecessary paid work.
- Protect permanent handles and opaque identifiers.
- Public visibility must be user-controlled; private account data never becomes public automatically.
- No destructive testing against protected identities, especially @BLACK.
- Do not rotate credentials without proven need and explicit approval.

Current TESTING is conservative/on-demand: Dispatcher min 0/max 2; Worker 2 vCPU/2 GiB/10 minutes/1 retry; no GPU, persistent disk, VPC connector, or always-on instance.

Before Production, explicitly design video cost, Storage/retention, bandwidth/CDN, cold starts, rate limiting, denial-of-wallet controls, upload quotas, retries/idempotency, observability, cleanup, regional latency, and free/paid policy. Never activate materially different or fully paid infrastructure automatically.

## 13. Approved future direction — not implementation authorization

### Public identity, link, and QR

Create a public experience separate from `/account/`: Intro → transition → public Identity, then chosen public gaming information. A permanent handle should map to a stable URL usable in TikTok, Instagram, X, Discord, YouTube, Twitch, Snapchat, sites, and messages. A form like `gamid…/@handle` is illustrative; syntax/domain are undecided.

The opaque QR groundwork should become a persistent QR resolving safely to the same public identity/share destination where appropriate, without exposing internal IDs.

### Identity Board

- **Games** — the user's gaming universe/library and selected displayed games.
- **Stats** — verified ranks/stats/history/achievements where official APIs permit.
- **Connections** — gaming/platform account connections.
- **Socials** — public social links/accounts.

These are placeholders/direction, not authorized features.

### Gaming Connections Engine

GamID should become one unified gaming identity through Discord, Steam, PlayStation, Xbox, Riot, and other official APIs where available. Discord can provide identity/discovery/linked accounts and permitted optional presence; it is not a universal source for game history, ranks, achievements, or stats. Use authoritative game/platform APIs when available.

Future data must distinguish:

- **Verified** — confirmed by an authoritative API.
- **Connected** — linked account, verified stats unavailable/limited.
- **Manual** — user-entered.

Users control which discovered accounts, games, and data are public.

### Social links and future profile

Direction includes Snapchat, X/Twitter, Instagram, TikTok, YouTube, Twitch, Discord, and other supported links. A social URL, connected account, and API-verified gaming data are distinct concepts.

A future public identity may show Intro, transition, Avatar, Display Name, Permanent Handle, Bio, Gaming Roles, optionally exposed Education/Work, Games, Verified Stats, Connections, Socials, QR/share, and verification indicators. Every element needs user-controlled privacy.

SOLO remains the only current entity. Avoid unnecessarily blocking Team/Organization/Company, but do not invent their schema or behavior before approval.

## 14. Roadmap authority

`GAMID_ROADMAP.md` is the readable product roadmap and labels each phase. Historical plans used “Slice 3D” for verified gaming data and later labels for connections/socials, the Board/WOW experience, and stabilization. Those labels are historical, not an execution queue.

Analytics, discovery/community, marketplace, jobs, AI, PWA/native, and similar areas are **IDEAS ONLY** unless Mazen defines and authorizes them.

## 15. External-agent continuation rules

Claude Code or another agent must:

1. Read this file completely before acting.
2. Inspect repository, branch, HEAD, worktree, and configuration before changes.
3. Continue the existing project; never restart or reconstruct it.
4. Never recreate/redesign accepted slices without authorization.
5. Never rewrite history, force-push, force-reset, or replace accepted history.
6. Never access Production without Mazen's explicit authorization; work TESTING-first.
7. Never start a future slice because it appears in the roadmap.
8. Treat direction as context, not authorization.
9. Obtain Mazen's approval before a new slice or deferred verification campaign.
10. Preserve accepted UX, contracts, security, and architecture unless authorized.
11. Run lint, typecheck, complete tests, build, and `git diff --check` before code checkpoints.
12. Make small auditable checkpoints and report exact changes.
13. Never expose secrets or ask for them in chat/files/logs/reports.
14. Never rotate credentials without proven need and approval.
15. Never use protected identities destructively.
16. Stop and report material state differences before destructive or paid actions.

## 16. START HERE

Current exact implementation checkpoint: `ce2018f3ff5b2de0a688d3970d81b0c71d8d5cb7` — Public GamID Profile Slice 2/2 (Public Experience + Intro/Transitions), section 7d. Built on top of Public GamID Profile Slice 1/2 (Foundation + Public-Safe Data) `697b6e3773233d4b403becb63a6857893dbe0ea2` (section 7b), the `check_handle_availability_impl` sign-up permission drift fix `6bad4d583735d1e8c589642911f3decd52d7eff2` (section 7c), the accepted Split Reveal Intro-visibility fix `d7466f99e6f5398c5c0e83c029f1d09715c1321f` (section 7a), and the Slice 3C backend/timer checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43`.

Slice 3C exists. Do not restart it. Its backend E2E succeeded and latest automated validation passed. The Split Reveal transition defect within Slice 3C's Full Preview feature is fixed and manually accepted by Mazen (section 7a), but this does not close Slice 3C as a whole — formal acceptance of the rest of Slice 3C was not given, and Mazen intentionally deferred the remaining manual Slice 3C testing/fixes listed in section 9. Do not automatically continue them.

Public GamID Profile Slice 1/2 and Slice 2/2 both exist, are implemented, and are deployed to TESTING (sections 7b and 7d). **Neither has been formally accepted by Mazen.** Both Public Profile slices are now complete — the roadmap's Public GamID Profile item (roadmap section 2) has no remaining unstarted implementation slice. Do not infer authorization to start any adjacent roadmap item (permanent share link, QR sharing, Games/Stats/Connections/Socials, or any AI/Cinematic Identity concept) from either slice's existence or position in the roadmap.

A pre-existing, unrelated bug was found during Slice 1/2 testing (`private.check_handle_availability_impl` missing its live `anon` grant, blocking brand-new user sign-up in TESTING) and has since been fixed under separate authorization — see section 7c.

Two genuine bugs were found and fixed during Slice 2/2's own live E2E testing (a message-listener race condition and a CSS `[hidden]` override) — both fixed within this slice's own authorized scope; see section 7d and the section 10 issue register.

Do not start the next implementation slice. First inspect the repository read-only, then discuss the roadmap and next priority with Mazen. Proceed only after he explicitly chooses and authorizes the next work.
