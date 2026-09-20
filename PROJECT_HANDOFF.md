# GamID — Authoritative Technical Continuation Handoff

Last updated: 2026-09-18

Repository: `jeddawe11-eng/gamid-testing`

Branch: `main`

Authoritative implementation checkpoint: see section 16 for the exact current commit. A verified Opera-vs-Chrome public-Intro reliability fix (retry/ack handshake + deterministic asset versioning) is implemented and TESTING-validated but **not yet formally accepted by Mazen** — see section 7g. The Permanent Public GamID URL + QR + Sharing slice is implemented and TESTING-validated but **not yet formally accepted by Mazen** — see section 7f. Public GamID Profile Slice 2/2 (Public Experience + Intro/Transitions) is implemented and TESTING-validated but **not yet formally accepted by Mazen** — see section 7d. A mobile-Publish-button manual-acceptance bug found during Mazen's acceptance testing has since been fixed — see section 7e. It is applied on top of Slice 1/2 (Foundation + Public-Safe Data, section 7b, also not yet formally accepted), the accepted Split Reveal Intro-visibility fix (section 7a), and the Slice 3C implementation checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43`.

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
| Gaming Connections Engine — Discord foundation | **IMPLEMENTED AND MANUALLY ACCEPTED** | Implementation `08b7d039bd118513a8e3129a7e8a70d527cd2bfd`; real Discord OAuth accepted by Mazen; see section 7h |
| Discord `connections` scope + private Riot discovery validation | **COMPLETED — Discord returned 0 linked accounts; Riot not returned** | Implementation `39f97c83c455abe56e8281a9e4b179562ede0cc9`; see section 7i |
| League of Legends prototype (manual Riot ID + temporary OP.GG adapter) | **IMPLEMENTED AND DEPLOYED TO TESTING; PRIVATE / UNVERIFIED; AWAITING MAZEN'S MANUAL ACCEPTANCE** | Implementation `44c7a4455f40088572d165a6de453b73491d6500`; see section 7j |
| Root landing page V1 (replaces the public NovaRift prototype at the TESTING root) | **IMPLEMENTED, DEPLOYED TO TESTING AND VERIFIED LIVE; AWAITING MAZEN'S MANUAL ACCEPTANCE** | Implementation `3cb0cde7f474cbe7efd194623c6c02853c3de365`; see section 7k |
| Public Profile Expansion — Phase 1 (per-section visibility + public-safe data foundation) | **IMPLEMENTED AND ACCEPTED** (Mazen accepted it, stated at the start of the Steam Connection Foundation task) | Implementation `2e0c433eb37458e943dbdd1d3f0d259105ba46a7`, docs `50737ba408d9ab1c3894d4713efa5df5b3743f17`; see section 7l |
| Steam Connection Foundation (Steam OpenID 2.0 as a Gaming Connection) | **IMPLEMENTED, MIGRATION + EDGE FUNCTIONS + SITE DEPLOYED TO TESTING; AWAITING MAZEN'S REAL STEAM SIGN-IN AND MANUAL ACCEPTANCE** | Implementation `48efec8857a2773d3b3f678cfc7a2ec9f7cbc04a`; see section 7m |
| Post-3C phases | **APPROVED DIRECTION / IDEA ONLY** | See `GAMID_ROADMAP.md`; none is authorized to start |

Mazen intentionally deferred further Slice 3C manual testing and fixes. Do not resume them automatically and do not infer acceptance from technical completion.

## 4. Repository and frontend baseline

- GitHub: `https://github.com/jeddawe11-eng/gamid-testing`
- Branch: `main`
- Implementation checkpoint: `d7466f99e6f5398c5c0e83c029f1d09715c1321f` (Slice 3C backend/timer checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43` plus the accepted Split Reveal Intro-visibility fix; see section 7a)
- Node.js: 20 or newer.
- Frontend: dependency-free static HTML, CSS, and native ES modules under `dist/`.
- Validation: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
- TESTING root: `https://jeddawe11-eng.github.io/gamid-testing/` — the static **landing page** (section 7k); the old Slice 1 Intro lab lives at `prototypes/slice-1-intro-lab/` and is not deployed.
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
- Auth: email/password registration, confirmation, sign-in/out, password recovery/update, and browser session persistence/refresh. GamID's own sign-in is email/password only; the only OAuth in the system is the outbound Discord account-connection flow (section 7h), which is a linked account, not a login method.
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
17. `20260919130000_gaming_connections_foundation.sql` (Gaming Connections Engine — Discord foundation, section 7h; applied to TESTING only)
18. `20260919170000_connection_discovery_riot_validation.sql` (private Riot discovery diagnostic, section 7i; applied to TESTING only)
19. `20260920100000_league_profile_prototype.sql` (League prototype: private, unverified, source-neutral; section 7j; applied to TESTING only)
20. `20260920140000_public_section_visibility.sql` (per-section public visibility + `public_sections` in the public-safe boundary; Education/Work grandfathered; section 7l; applied to TESTING only)
21. `20260920190000_steam_connection_foundation.sql` (Steam as a Gaming Connections provider: provider-bound ledger consumption, Steam completion, table CHECK, provider guard on the Discord ledger functions, Steam in the section-visibility/public boundary; section 7m; applied to TESTING only)

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

### Permanent Public GamID URL + QR + Sharing

**IMPLEMENTED, DEPLOYED TO TESTING, VALIDATED, NOT FORMALLY ACCEPTED.** See section 7f.

### Verified public Intro reliability fix (Opera vs Chrome diagnosis follow-up)

**IMPLEMENTED, DEPLOYED TO TESTING, VALIDATED, ACCEPTED BY MAZEN (including real Opera).** See section 7g.

### Gaming Connections Engine — Discord foundation

**IMPLEMENTED AND MANUALLY ACCEPTED (real Discord OAuth).** See section 7h.

### Discord connections scope + private Riot discovery validation

**COMPLETED. Real result: Discord returned 0 linked accounts; Riot not returned.** See section 7i.

### League of Legends prototype (manual Riot ID + temporary OP.GG adapter)

**IMPLEMENTED AND DEPLOYED TO TESTING; private, unverified, prototype only; awaiting Mazen's manual acceptance.** See section 7j.

### Root landing page V1

**IMPLEMENTED, DEPLOYED TO TESTING AND VERIFIED LIVE; awaiting Mazen's manual acceptance.** See section 7k.

### Public Profile Expansion — Phase 1 (visibility + public-safe data)

**IMPLEMENTED AND ACCEPTED.** See section 7l.

### Steam Connection Foundation

**IMPLEMENTED, MIGRATION + EDGE FUNCTIONS + SITE DEPLOYED TO TESTING; awaiting Mazen's real Steam sign-in and manual acceptance.** See section 7m.

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

**Accepted fix (commit `d7466f99e6f5398c5c0e83c029f1d09715c1321f`):** in `dist/account/intro-preview.css` (loaded only by the real Preview flow; the separately-accepted Slice 1 lab prototype (then at `dist/index.html`, now preserved at `prototypes/slice-1-intro-lab/index.html`) does not load this file and is unaffected):

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

## 7e. Manual acceptance bug — Publish button unresponsive to real mobile taps

**FIXED.** Found by Mazen during manual acceptance testing of Public GamID Profile Slice 2/2 on a real Samsung Android mobile browser, blocking acceptance. Fix authorized under this exact scope only.

**Symptom:** on the real deployed TESTING account page, the owner could see the Publish button inside YOUR GAMID / LIVE PREVIEW, but tapping it on a real Samsung Android mobile browser did nothing — the button could not be activated. Desktop and prior browser-automation testing never caught this, including the Slice 2/2 E2E validation in section 7d.

**Root cause:** `.identity-preview::after` (`dist/account/account.css`), a purely decorative circle outline positioned in the bottom-right corner of the LIVE PREVIEW card (`right:-3.5rem;bottom:-3.5rem`), had no `pointer-events:none`. Being `position:absolute`, it paints above the normal-flow `.visibility-row` content within the same stacking context regardless of source order, and its transparent interior still receives pointer events by default. On viewport widths where the Publish/Unpublish button's real position falls under the pseudo-element's box, this silently intercepted the tap before it could reach the button. Confirmed directly: `document.elementFromPoint()` at the exact center of the button's bounding box returned the `.identity-preview` section, not the button.

This had gone undetected through every earlier validation pass (including section 7d's Slice 2/2 sign-off) because all prior automated Publish/Unpublish testing used `document.getElementById("visibilityToggle").click()` — a synthetic DOM method call that invokes the click handler directly and bypasses real hit-testing entirely, so it could never have surfaced an overlapping-element problem. A real tap (or a coordinate-based click that goes through the browser's actual hit-testing) is required to reproduce it, which is exactly the difference between this bug and every prior pass.

**Fix (`dist/account/account.css`, one property on one existing rule):**

```css
.identity-preview::after{content:"";position:absolute;width:8rem;height:8rem;right:-3.5rem;bottom:-3.5rem;border:1px solid rgba(139,93,255,.35);border-radius:50%;pointer-events:none}
```

No markup, layout, event handling, or visual appearance changed — the decorative circle still renders identically; it simply no longer participates in hit-testing. No other file was touched; this is a single-property change confined to a purely cosmetic pseudo-element.

**Validation**, using a disposable TESTING account (`mobilebug1`, created and fully deleted afterward) at a 375×812 mobile viewport with touch emulation, verified via real coordinate-based taps (not synthetic `.click()`):

- `document.elementFromPoint()` at the Publish button's center now returns the button itself, not `.identity-preview`.
- A real tap activates Publish: state visibly changes from `DRAFT · PRIVATE` to `PUBLIC`, confirmed with the existing "Your GamID is now public." confirmation.
- The public `/public/?handle=mobilebug1` route became anonymously accessible immediately after.
- A real tap activates Unpublish the same way, with the existing "Your GamID is private again." confirmation.
- The public route immediately returned to its "isn't public" state after unpublishing.
- Existing editor functionality reconfirmed unaffected: the YOUR INTRO accordion, transition selector, and file inputs all still open/respond correctly.
- The Intro → Transition → Public Profile experience from section 7d is unaffected — this fix is isolated to `dist/account/account.css`, which the public route and `intro-preview.html`/`.js`/`.css` never load.
- No table, RLS policy, RPC, or migration was touched — this is a pure frontend CSS fix with zero backend surface.
- lint PASS, typecheck PASS, tests **116/116 PASS** (115 existing + 1 new, asserting `.identity-preview::after` carries `pointer-events:none`).

## 7f. Permanent Public GamID URL + QR + Sharing

**IMPLEMENTED, DEPLOYED TO TESTING, VALIDATED — NOT FORMALLY ACCEPTED.** This is the next authorized build slice after Public GamID Profile Slice 2/2 (section 7d) and its manual-acceptance fix (section 7e). It completes `GAMID_ROADMAP.md` items 3 (Permanent share link) and 4 (QR sharing) using only the existing permanent handle and the existing, previously-dormant `qr_references` opaque-token foundation from Slice 2 (section 6) — no second identifier system was created.

### Goal

Turn the existing Public GamID Profile into a genuinely shareable identity: a permanent human-readable public URL, a scannable QR that resolves to the same identity, and an owner-facing Share experience (Copy Link, native Share, QR), all built entirely on top of the already-accepted Transition Engine and the already-implemented Public Profile experience (sections 7b/7d) — no second profile page was built.

### 1. Permanent public URL

**Format:** `https://jeddawe11-eng.github.io/gamid-testing/@<handle>` (e.g. `/@black`).

**Why this exact route, and not a bare `/@handle` at the domain root:** this repository is a GitHub Pages *project* site (no `CNAME`/custom domain — confirmed by inspecting the repo before implementing), so every route is necessarily prefixed with `/gamid-testing/`. GitHub Pages is a static host with no server-side rewrite/redirect capability, so a dynamic path segment like `/@<handle>` cannot be served as a real file or directory (handles are created at runtime, not build time). The standard, well-established technique for clean URLs on GitHub Pages — used by countless static-site/SPA deployments — is a custom `404.html` at the site root: GitHub Pages serves this file's contents (with an HTTP 404 status) for any path that doesn't match a real file, and a small inline script inspects `location.pathname` and redirects. This is what `dist/404.html` does:

```js
var match = path.match(/\/@([^/]+)\/?$/);
if (match) {
  var handle = decodeURIComponent(match[1]);
  var base = path.slice(0, path.length - match[0].length);
  location.replace(base + "/public/index.html?handle=" + encodeURIComponent(handle) + location.search);
}
```

It derives the redirect target's base path from the *actual requested path* rather than a hardcoded prefix, so the same file works unmodified whether the site is served under `/gamid-testing/` (today) or from a bare domain root (if a custom domain is ever added later — an undecided, unstarted future infrastructure decision, not part of this slice). Nested paths under `/@handle/...` and unrelated unmatched paths fall through to a plain, self-contained "this GamID link isn't valid" message (no external stylesheet/script references, since a 404.html's relative asset URLs resolve against the *requested* path, not its own location — a well-known GitHub Pages gotcha avoided by inlining everything).

**Backward compatibility preserved:** the temporary `/public/?handle=<handle>` route from Slice 1/2 is untouched and still fully functional — `/@<handle>` is purely an additive redirect *into* it, not a replacement.

**Case handling:** the redirect passes the path segment through unmodified; normalization (lowercasing, trimming) continues to happen exactly once, server-side, in the already-accepted `private.normalize_handle()` — no duplicate client-side normalization logic was added.

No internal IDs or QR tokens appear anywhere in this URL — only the permanent handle.

### 2. GamID QR

**Architecture:** completes the `public.qr_references` foundation from Slice 2 (section 6) — a `qr_reference_id`/`entity_id`/opaque `public_token` (`q_<36 hex chars>`) row created automatically for every SOLO identity, already returned to the *authenticated owner only* by `get_my_gamid`, but until this slice never resolved anywhere. No new table, no new token format, no second QR identity system.

**New migration** (`20260919120000_public_profile_qr_resolution.sql`, TESTING only):

```sql
create function private.get_public_identity_by_qr_impl(candidate_token text)
returns table (...same 13 columns as get_public_identity_impl...)
language sql stable security definer
set search_path = ''
as $$
  select * from private.get_public_identity_impl(
    (select e.gamid_handle
     from public.qr_references q
     join public.entities e on e.entity_id = q.entity_id
     where q.public_token = candidate_token
     limit 1)
  );
$$;

create function public.get_public_identity_by_qr(candidate_token text)
... language sql stable security invoker ...
as $$ select * from private.get_public_identity_by_qr_impl(candidate_token); $$;
```

This resolves the token to a handle and then **delegates entirely to the existing, unmodified `private.get_public_identity_impl`** (the same function `get_public_identity` already uses) rather than re-implementing its own query. Publishing rules (`e.visibility = 'PUBLIC'`) and every forbidden-column exclusion are therefore inherited automatically — a QR for an unpublished identity resolves to zero rows for exactly the same reason an unpublished handle does, with no separate gate to keep in sync. No table gained a direct `anon` grant; `qr_references` keeps its existing owner-only RLS policy untouched, and the new functions are `security definer`/`security invoker` following the same established pattern as every other public RPC in this codebase.

### 3. QR resolution behavior

The public route (`dist/public/`) now accepts **either** `?handle=<handle>` (existing, unchanged) **or** `?qr=<token>` (new) and converges on the exact same rendering path — `dist/public/public.js` gained one small branch (call `getPublicIdentityByQr` instead of `getPublicIdentity` when `?qr=` is present) and nothing else changed. No second profile page, no duplicated iframe/postMessage logic. The QR image itself encodes `<origin>/gamid-testing/public/index.html?qr=<token>` directly — machine-scanned links have no need for the human-readable `/@handle` form.

### 4. Owner Share experience

Inside YOUR GAMID (`dist/account/index.html`), a new **SHARE YOUR GAMID** section sits directly below the Live Preview/Publish card:

- A read-only field showing the permanent URL (`../@<handle>` resolved to an absolute URL via `new URL(...)`, so it works unmodified at any base path).
- **Copy Link** — copies the permanent handle-based URL via `navigator.clipboard.writeText`, falling back to `document.execCommand("copy")` when unavailable.
- **Share** — uses `navigator.share()` where supported (passes the permanent URL, display name, and handle); falls back to Copy Link with a toast when the Web Share API is unavailable (verified on the desktop TESTING browser, which has no `navigator.share`).
- **GamID QR** — opens a `<dialog>` (same `showModal()`/`.close()` pattern as the existing avatar-crop and Intro-preview dialogs) presenting a large, high-contrast QR code (vendored `qrcode.min.js`, MIT-licensed, client-side generation — no third-party QR-rendering API call, so the token is never sent to any outside service) alongside the GamID brand mark, Display Name, and `@handle`, styled for clean scanning (plain white QR panel, no logo overlay or decorative elements inside the code itself).

Copy Link and Share always carry the permanent handle-based URL, never the raw QR token — the token appears only inside the QR image's own encoded destination.

### Validation

- lint PASS, typecheck PASS, tests **129/129 PASS** (116 existing + 13 new, covering: the QR RPC delegates to the existing gated function instead of duplicating it, the migration never widens direct table access, the frontend client mirrors the handle-based lookup, the public route's `?qr=` branch, the `404.html` redirect regex and fallback, the Share UI elements, Web Share/fallback wiring, and that Copy Link/Share never reference the raw QR token).
- Live TESTING E2E using a disposable account (`sharetest1`, created and fully deleted afterward):
  - Live Preview correctly showed the computed permanent URL (`.../@sharetest1`).
  - QR dialog rendered a valid, decodable QR whose encoded destination was confirmed via the library's own `title` attribute to be `.../public/index.html?qr=<token>`.
  - **QR blocked while unpublished**: scanning-equivalent navigation to the QR URL before publishing showed the existing "This GamID isn't public" state — confirmed QR cannot bypass Publish/Unpublish.
  - After Publish, the same QR URL opened the full existing Public Profile experience (Intro/Transition/Profile machinery unchanged and untouched).
  - Copy Link and Share (fallback path, since the TESTING desktop browser has no Web Share support) both verified via genuine trusted clicks to copy the correct permanent URL, with the visible confirmation toast.
  - The temporary `/public/?handle=` route reconfirmed still fully functional (backward compatibility).
  - The `404.html` redirect regex verified directly against `/gamid-testing/@black`, `/gamid-testing/@black/`, a hypothetical bare `/@black` (future custom domain), a nested `/gamid-testing/@black/extra` (correctly rejected), and an underscore handle — all resolved exactly as designed. (GitHub Pages' custom-404 serving cannot be emulated by a local static file server, so the redirect's live behavior is confirmed after deployment below.)
  - Anonymous responses (both `?handle=` and `?qr=` paths) inspected directly and confirmed to contain none of: email, DOB, `entity_id`, `profile_id`, `qr_public_token`, or any other internal/private field.
  - An invalid/garbage QR token returns `null` with no error leakage.
  - Existing owner editor regression-checked: Bio edit + Save persisted correctly; Publish/Unpublish toggled correctly through the same control validated in section 7e.
  - Mobile portrait (375×812) verified: Share section and QR dialog both render cleanly with no overflow; desktop (1024×768) verified likewise.
- Deployed TESTING verification: `dist/account/qrcode.min.js`, the updated `account.js`/`account.css`/`index.html`, `public.js`, and `dist/404.html` all confirmed live via direct fetch against `https://jeddawe11-eng.github.io/gamid-testing/`, and the real GitHub Pages `/@<handle>` redirect verified end-to-end in a live browser (see the final report for the exact confirmed behavior).

### A genuine bug found and fixed only after live deployment

Live-testing the real `/@<handle>` redirect on GitHub Pages (not reproducible against a local static server, since only GitHub Pages actually serves a custom `404.html` for unmatched paths) surfaced a real regression risk: navigating to `/@<handle>` failed to play the Intro on roughly 3 of 4 attempts, while navigating directly to `/public/?handle=<handle>` succeeded every time.

**Root cause:** `public.js`'s `gamid-intro-preview-ready` message listener is attached at the top of its own deferred module script, but the `<iframe src="../account/intro-preview.html">` element starts loading as soon as the HTML parser reaches it — independent of module script timing. If the iframe finishes loading and its own script runs (synchronously broadcasting `ready` as its very last line) before `public.js`'s deferred module even begins executing, the message is dispatched to no listener and lost forever — no ordering fix inside `public.js`'s own execution can catch a message sent before that script runs at all. This is a different, deeper layer of the same class of bug fixed in section 7d; the earlier fix (attaching the listener before the identity-fetch `await`) was necessary but not sufficient, because it only ordered things *within* `public.js`'s own execution, not the race between the iframe and the parent module even starting. The extra network hop through `404.html` shifted timing enough to make this manifest far more often than a direct navigation, though the underlying race was already latent either way.

`account.js`'s own owner-facing Intro Preview dialog uses the identical postMessage contract but has never shown this symptom, because it already guards against exactly this by also listening for the iframe element's native `load` event (dispatched by the browser only after the iframe's document — including its synchronous ready broadcast — has fully executed, so it can never be missed the way a postMessage can).

**Fix (`dist/public/public.js`, one line):**

```js
frame.addEventListener("load", () => { frameReady = true; send(); });
```

Added alongside the existing message-based trigger — no new mechanism invented; this mirrors the existing, already-proven pattern already used by `account.js` in this same codebase.

**Validation:** re-tested the live `/@<handle>` redirect 4 consecutive times in fresh browser tabs after deploying the fix — all 4 reached the `profile` state correctly (versus 1 of 4 before the fix). The `?qr=` path was reconfirmed working as well. lint PASS, typecheck PASS, tests **130/130 PASS** (129 existing + 1 new).

### Deliberately deferred (not part of this slice)

A custom domain (which would allow a bare `/@handle` with no `/gamid-testing/` prefix) was not pursued — infrastructure/Production decision, out of scope for TESTING. Platform-specific share integrations (WhatsApp/Discord/social APIs) were explicitly excluded per this slice's own instructions; the device's native share sheet is the only mechanism. Handle-changing, aliases, redirects, and multiple public handles per identity remain explicitly unsupported — one identity still maps to exactly one permanent `@handle`.

## 7g. Verified public Intro reliability fix (Opera vs Chrome diagnosis follow-up)

**IMPLEMENTED, DEPLOYED TO TESTING, VALIDATED — NOT FORMALLY ACCEPTED.** Follows the read-only Opera-vs-Chrome diagnosis, which established two concrete reliability risks without proving a single root cause: (1) the parent/child Intro-iframe handshake still had a residual, unproven-safe timing race even after the two earlier mitigations (sections 7d, 7f), and (2) GitHub Pages serves every asset with `Cache-Control: max-age=600`, letting a browser legitimately reuse an older deployed version of `public.js`/`intro-preview.js` for up to 10 minutes after any push. This section makes the Intro handshake provably reliable regardless of execution order, and closes the stale-mixed-version window without touching headers this project cannot control.

### Part 1 — retry/acknowledged handshake (`dist/account/intro-preview.js`)

The one-shot `ready` broadcast (`parent.postMessage({type:"gamid-intro-preview-ready"}, ...)`, sent exactly once at script load) is replaced with a bounded, self-stopping retry:

```js
let configReceived=false,readyAttempts=0,readyTimer;
const READY_RETRY_LIMIT=25,READY_RETRY_MS=200;
function announceReady(){if(configReceived){clearInterval(readyTimer);return;}if(readyAttempts>=READY_RETRY_LIMIT){clearInterval(readyTimer);return;}readyAttempts++;parent.postMessage({type:"gamid-intro-preview-ready"},location.origin);}
addEventListener("message",event=>{if(event.origin!==location.origin||event.data?.type!=="gamid-intro-preview")return;configReceived=true;clearInterval(readyTimer);play(event.data.config);});
announceReady();
readyTimer=setInterval(announceReady,READY_RETRY_MS);
```

- The child re-announces readiness every 200ms instead of once, so a parent whose own deferred module script hasn't started executing yet (the exact race that caused sections 7d's and 7f's bugs) will still catch a later retry once its listener attaches — tolerating **either** execution order (parent-first or iframe-first) without any arbitrary fixed delay.
- Receiving a config message immediately sets `configReceived=true` and clears the retry timer **before** calling `play()` — retries stop the instant delivery succeeds, and the ability to *receive* a config (the permanent `addEventListener("message", ...)`) is never time-limited, only the *announcement* is — so a much-later, user-triggered send (e.g. the owner's own "PREVIEW INTRO" button, clicked long after the 5-second/25-attempt retry window has elapsed) still works exactly as before.
- The retry is hard-capped at 25 attempts (~5 seconds) — no infinite message loop even if a parent genuinely never listens.

Because both `dist/public/public.js` (the public route) and `dist/account/account.js` (the owner's own Intro Preview dialog) share this same `intro-preview.js`, a second, matching fix was required on **both** parents to prevent the new repeated `ready` pings from ever triggering a duplicate `play()` call (a duplicate Intro restart is a real regression the naive retry alone would introduce):

- `dist/public/public.js`: `send()` was split into `sendInitial()` (idempotent — posts the config at most once per page load, guarded by `initialSendDone`) and `sendReplay()` (the Replay Intro button's explicit, intentionally-repeatable action). Both the `ready` message handler and the iframe's native `load` event now funnel into `sendInitial()`, so no matter how many redundant signals arrive, the config is delivered exactly once until the user deliberately clicks Replay.
- `dist/account/account.js`: `sendPreviewConfig()` gained the same guard (`previewConfigDelivered`), reset only when the owner opens a **new** preview via the "PREVIEW INTRO" button — the dialog's existing `load`/`ready`/click triggers can no longer cause a duplicate restart either.

### Identity safety — the raw placeholder can no longer be shown as a loaded profile

Live testing during this fix (before this specific change) reproduced the exact reported symptom directly: with the iframe's own message listener attached late enough, `intro-preview.html`'s **static, unconfigured** default markup (`Gamer` / `@handle` / `DRAFT · PRIVATE` — literally the placeholder text baked into the HTML) is what a visitor sees once they click Skip Intro, because Skip unconditionally reveals the profile card regardless of whether `play()` had ever actually run.

`dist/public/public.js` no longer reveals the Intro/Profile experience (`experienceWrap.hidden = false`) as soon as a config is *built* locally — it now waits for the child's own `gamid-intro-preview-state` broadcast, which the shared `intro-preview.js` only ever sends from inside `setState()`, itself only ever called from within `play(config)`. Receiving that message is proof — not an assumption — that the iframe has actually applied this identity's real data:

```js
if (event.data?.type === "gamid-intro-preview-state") {
  if (!revealed) { revealed = true; loading.hidden = true; experienceWrap.hidden = false; }
  replayButton.hidden = !hasIntro || event.data.state !== "profile";
}
```

The `loadingState` spinner ("Loading GamID…") now stays visible the entire time until that confirmation arrives (previously it was hidden as soon as the identity RPC returned, well before the child had necessarily applied anything), so a slow or still-retrying handshake now shows an honest, intentional loading state — never the placeholder, and never a blank gap. No new message type or UI element was added; this reuses the existing `gamid-intro-preview-state` broadcast that `public.js` already listened to for the Replay button.

### Part 2 — deterministic asset versioning (no manual maintenance)

GitHub Pages' `Cache-Control: max-age=600` cannot be changed (no custom headers on the standard hosting product) and was intentionally left alone per this task's scope. Instead, every cross-document reference between the parents (`dist/public/index.html`, `dist/account/index.html`) and the shared Intro iframe (`dist/account/intro-preview.html`, and its own `intro-preview.js`/`intro-preview.css`) now carries a `?v=__ASSET_VERSION__` query string:

```html
<!-- dist/public/index.html -->
<iframe id="experienceFrame" ... src="../account/intro-preview.html?v=__ASSET_VERSION__" ...></iframe>
<script type="module" src="public.js?v=__ASSET_VERSION__"></script>
<!-- dist/account/index.html -->
<iframe id="introPreviewFrame" ... src="intro-preview.html?v=__ASSET_VERSION__" ...></iframe>
<!-- dist/account/intro-preview.html -->
<link rel="stylesheet" href="intro-preview.css?v=__ASSET_VERSION__" />
<script type="module" src="intro-preview.js?v=__ASSET_VERSION__"></script>
```

`.github/workflows/deploy-pages.yml` stamps the real value automatically on every push, entirely in CI, with no manual editing ever required:

```yaml
- name: Stamp deterministic asset version
  run: |
    VERSION="${GITHUB_SHA:0:7}"
    for f in public/index.html account/index.html account/intro-preview.html; do
      sed -i "s/__ASSET_VERSION__/${VERSION}/g" "${RUNNER_TEMP}/gamid-pages/${f}"
    done
```

This runs on the **staged copy** in `${RUNNER_TEMP}`, after rsync and before `upload-pages-artifact`, so the committed `dist/` source keeps the human-readable placeholder and Mazen never has to touch a version string for any deployment — it is deterministically derived from the commit that triggered the deploy, not random and not manually maintained.

**Why this closes the "mixed incompatible versions" risk without controlling headers:** each parent HTML document always names the *exact matching* versioned URL for its own dependencies as of the commit that produced it. If a browser's cached copy of `public/index.html` (or `account/index.html`) is itself stale (still within its own 10-minute window), it references the OLD-but-internally-consistent pair of `public.js?v=OLDSHA` + `intro-preview.html?v=OLDSHA` — never a mix of a fresh parent with a stale iframe or vice versa, which was the actual mechanism by which two independently-cached files could drift out of sync and run incompatible handshake code against each other. Locally (`dist/` served directly, no CI step), the literal `?v=__ASSET_VERSION__` string is harmless — static file servers ignore query strings when resolving a path, so local testing is completely unaffected.

**What remains, honestly:** the underlying `max-age=600` browser-cache window is unchanged and unchangeable on this hosting. A browser can still serve a stale-but-internally-consistent old build for up to 10 minutes after any deploy — this is expected, accepted GitHub Pages behavior for a TESTING static site, not a bug. What is now eliminated is (a) the handshake race that could fail even on a single, fully-current, non-stale build, and (b) any scenario where an old parent and a new child (or vice versa) end up paired together and running mismatched protocol code.

### Validation

- lint PASS, typecheck PASS, tests **141/141 PASS** (130 existing + 11 new in `tests/public-intro-handshake-reliability.test.js`, plus 4 pre-existing assertions in `tests/public-profile-slice-2.test.js` updated to match the new `sendInitial`/`sendReplay` names and versioned iframe `src`).
- A dedicated, throwaway browser test harness (never committed) drove the real, unmodified `intro-preview.html` directly and controlled exactly when its message listener attached relative to iframe creation:
  - **Parent-first** (listener attached before the iframe exists): config applied in 366ms, exactly 1 `ready` needed.
  - **Iframe-first, 800ms-late listener**: config still applied correctly (857ms), proving recovery from the exact race that caused the original bug.
  - **Iframe-first, 4800ms-late listener** (near the 5-second cap): still recovered (4862ms).
  - **Iframe-first, 6000ms-late listener** (past the cap): correctly timed out with zero further `ready` pings sent — proving the retry is genuinely bounded, not disguised as unlimited.
- Live TESTING E2E using a disposable account (`handshaketest1`, created and fully deleted afterward) against the local static server (identical files to what's deployed):
  - Fresh load with Intro configured (Cross Fade default, then Split Reveal) both reached `profile` with the correct identity (`Handshake Test` / `@handshaketest1`), never the placeholder.
  - Clicking Skip Intro as fast as automation allowed after navigation still revealed the correct identity, never the placeholder.
  - Replay Intro replayed correctly with `performance.getEntriesByType("navigation").length === 1` (no reload).
  - No-Intro case (Intro removed) opened directly to the correct profile, Replay button correctly absent.
  - The QR route (`?qr=<token>`) resolved to the correct identity identically to the `?handle=` path.
  - Unpublishing immediately blocked both the `?handle=` and `?qr=` paths.
  - The owner's own "PREVIEW INTRO" dialog (`account.js`) reconfirmed working with no duplicate restart, correctly still showing its `PREVIEW`/`YOUR GAMID`/`DRAFT · PRIVATE` owner-only chrome (publicMode is never set there).
  - `@black` was never modified — only read once, read-only, to confirm it still exists, exactly as required.
- **This automated/Chromium-based validation is not the same as Mazen's final manual acceptance on his real Opera browser**, which remains outstanding and must be performed by him directly.

### Deliberately deferred (not part of this fix)

No `pageshow`/`bfcache`-restoration handling was added to `public.js` (unlike `account.js`, which already has this for an unrelated avatar concern) — the Opera diagnosis flagged this as a *separate*, still-unaddressed architectural gap, not part of the confirmed handshake-race/asset-versioning scope authorized here. Flagged for a future, explicitly-scoped decision rather than folded in silently.

## 7h. Gaming Connections Engine — Discord foundation

**IMPLEMENTED, DEPLOYED TO TESTING, AND MANUALLY ACCEPTED BY MAZEN (real Discord OAuth completed; the real TESTING GamID is CONNECTED to Discord).** Mazen created the Discord application and set `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` as TESTING Edge Function secrets (2026-09-19; verified by name and update time only, values never seen). The scope set was later extended for the Riot discovery validation in section 7i. The functions were deployed fail-closed first and pick the secrets up without redeployment. Implementation checkpoint `08b7d039bd118513a8e3129a7e8a70d527cd2bfd` (built on `706fc58`, previous accepted docs checkpoint; the docs checkpoint is the commit that adds this section). This is the **first foundation slice** of a provider-neutral Gaming Connections system; **only Discord is implemented**. Steam, PlayStation, Xbox, Riot, game discovery, presence, Socials expansion, and Cinematic Identity were not started.

### Product behavior

YOUR GAMID → **CONNECTIONS** (a section inside the existing identity view, not a new page) → Discord → **Connect Discord** → official Discord consent → redirect back to `/account/` → **CONNECTED**. GamID never sees, asks for, stores, or proxies the Discord password; the user authenticates only on `discord.com`.

- Trust state: an OAuth-linked Discord is **CONNECTED**. Nothing here creates VERIFIED data, and Discord is not used as a source of games, ranks, or stats.
- **CONNECTED ≠ PUBLIC.** `gaming_connections.is_public` defaults `false`; no public RPC reads connections; there is no visibility toggle in this slice; the Public Profile was not modified. The owner sees "Private — not shown on your public GamID."
- The connection attaches to the existing authenticated permanent `@handle` identity. No second username/profile/account system.

### Official Discord docs consulted (current, `docs.discord.com/developers`)

`topics/oauth2`, `resources/user`, and `change-log`. Facts relied on: Authorization Code grant; authorize `https://discord.com/oauth2/authorize`; token `https://discord.com/api/oauth2/token`; revoke `https://discord.com/api/oauth2/token/revoke` (revokes the whole grant); identity read `GET https://discord.com/api/v10/users/@me`; the user `id` is a snowflake, `username` is mutable and not unique. **PKCE is not documented for Discord's OAuth2 in the current docs, so it is deliberately not used** (sending `code_challenge` would be simulated security). The compensating controls are below. The documented format for a user-denied authorization was not found, so any `error` on the callback is handled generically (`error=access_denied` is treated as cancellation).

### Scopes (least privilege)

**Superseded by section 7i (2026-09-19): the scope set is now exactly `identify connections`.** Original 7h decision, kept for history: Exactly one: **`identify`** — needed only to read the user's stable Discord id, username/display name, and avatar. **Not** requested: `email`, `connections`, `guilds`, `guilds.members.read`, `bot`, `rpc*`, `activities.*`, `messages.read`, or any "future" scope. The token response is checked to contain exactly `identify`; anything else is revoked and rejected. `prompt=consent` is sent so the user always sees what is being granted.

### Architecture

GitHub Pages is static, so every secret operation lives in two **Supabase Edge Functions** on TESTING (`upvtrczefcvigxdyuylw`, deployed with `supabase functions deploy … --use-api`), with shared logic in `supabase/functions/_shared/discord-oauth.js` (dependency-injected, unit-tested with a fake backend):

| Function | `verify_jwt` | Role |
|---|---|---|
| `discord-connect-start` | **true** (pinned in `supabase/config.toml`) | Requires the owner's GamID session; calls `start_connection_attempt` as that user; returns only `{authorization_url}`. CORS limited to `https://jeddawe11-eng.github.io`. |
| `discord-connect-callback` | **false** (Discord's cross-site redirect carries no GamID credentials) | The exact registered redirect URI. Consumes the state, exchanges the code, reads `/users/@me`, links, revokes, and 302s to `https://jeddawe11-eng.github.io/gamid-testing/account/?connection=discord&result=…[&reason=…]`. |

Redirect URI to register in Discord (exact): `https://upvtrczefcvigxdyuylw.supabase.co/functions/v1/discord-connect-callback`.
Function secrets (set by Mazen, never in Git/frontend/chat): `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform. **Until the two Discord secrets exist, the functions fail closed**: start returns 503 `not_configured` and the callback redirects with `reason=not_configured`; the UI says "Discord connection isn't available yet on this TESTING site."

### OAuth flow and CSRF / replay protection

1. Owner clicks Connect → browser calls `discord-connect-start` with the session token → `private.start_connection_attempt_impl` requires a confirmed-email owner of a SOLO identity, rate-limits (10 attempts per 10 minutes per user), creates a **256-bit random state** (`extensions.gen_random_bytes(32)`, hex), stores **only its SHA-256 hash** bound to `user_id` + `entity_id` with a **10-minute expiry**.
2. Browser is sent to Discord (`response_type=code`, `scope=identify`, exact `redirect_uri`, `state`, `prompt=consent`). The frontend only navigates if the URL starts with `https://discord.com/oauth2/authorize?`.
3. Callback → `consume_connection_attempt` (service_role only) locks the row `for update` and **consumes the state before any Discord call**. Result classes: `INVALID_STATE`, `REPLAYED`, `EXPIRED`, or the bound user/entity. Concurrent/duplicate/replayed callbacks are serialized by the lock; only one can win.
4. **Identity comes only from the DB-bound one-time state.** Any user/entity id present in the callback URL is ignored (tested), so a state cannot be replayed into a different account. The callback cannot rely on a cookie/session (cross-site navigation); this is the honest binding mechanism and is documented rather than disguised.
5. Server-side code exchange with the client secret; token must be `Bearer` with scope exactly `identify`; `/users/@me` read once; the access token is **revoked immediately**; `complete_connection_attempt` links the account. *(Superseded by section 7i: the token must carry exactly `identify connections`, `/users/@me/connections` is also read before the revoke, and only a Riot-only minimized result is recorded.)*
6. Outcomes: `CONNECTED`, `RECONNECTED` (same account again — display fields refreshed), `ACCOUNT_ALREADY_LINKED` (Discord account belongs to another GamID → refused), `OWNER_HAS_OTHER_ACCOUNT` (this GamID already has a different Discord → refused, **never silently overwritten**), `IDENTITY_NOT_FOUND`. Cancellation, provider errors, exchange/network failures, expiry, and unexpected exceptions map to allow-listed `result`/`reason` codes; the UI maps them to fixed messages and never renders query text. Code and state are stripped from the URL by `history.replaceState` and never logged.

### Data model (migration `20260919130000_gaming_connections_foundation.sql`, migration #17)

- `public.connection_provider_catalog` — provider registry (seeded with `discord` only); new providers are catalog rows plus a provider module, not schema redesign.
- `public.gaming_connections` — `connection_id`, `entity_id` (→ `entities`, cascade), `provider_key`, `provider_account_id` (**durable key: the Discord snowflake**, never the mutable username), `provider_username`, `provider_display_name`, `provider_avatar_url` (must be `https://`), `trust_status` (`VERIFIED|CONNECTED|MANUAL`, default `CONNECTED`), `is_public` (default `false`), `connected_at`, `updated_at`. **Unique `(entity_id, provider_key)`** and **unique `(provider_key, provider_account_id)`** — one Discord identity cannot silently link to two GamIDs.
- `private.connection_oauth_attempts` — hashed one-time state ledger (`state_hash` unique, `expires_at`, `consumed_at`, `completed_at`, `outcome`).
- Owner RPCs (`authenticated` only): `start_connection_attempt`, `get_my_connections` (returns **no** `provider_account_id`, connection id, or entity id), `disconnect_my_connection`. Backend RPCs (`service_role` only, additionally guarded by `current_user <> 'service_role'`): `consume_connection_attempt`, `complete_connection_attempt`, `finish_connection_attempt`. Pattern: `private.*_impl` security definer + `public.*` invoker wrapper; revoke-all-then-grant.

### RLS / authorization

RLS is enabled on all three tables. `gaming_connections` has one owner-`select` policy; there are **no** insert/update/delete policies and direct table grants are revoked from `public`, `anon`, and `authenticated`. Anonymous roles have no access to any connections object; no `anon` grant was added or widened; no existing policy or grant was changed. Public Profile RPCs were not touched.

### Token-storage decision

**No OAuth token of any kind is persisted** (no access token, refresh token, or code). The access token lives in memory for one request and is revoked immediately (revoke failure is logged as a code only and never fails the link). Nothing secret is returned to the browser or logged. `dist/` contains no secret material (asserted by a test that scans all of `dist/`).

### Disconnect

Explicit two-step UI (Disconnect → confirm). `disconnect_my_connection` is owner-verified, **idempotent** (`DISCONNECTED` / `NOT_CONNECTED`), hard-deletes the row, and thereby frees the Discord account for another GamID. Because no tokens are retained, there is nothing to revoke at disconnect time (the grant was already revoked at link time). GamID, `@handle`, Intro, and the Public Profile are unaffected. If the user wants Discord's own authorized-app entry gone, that is in Discord → Settings → Authorized Apps (documented limitation).

### Files

`supabase/migrations/20260919130000_gaming_connections_foundation.sql`; `supabase/functions/_shared/discord-oauth.js`; `supabase/functions/discord-connect-start/index.ts`; `supabase/functions/discord-connect-callback/index.ts`; `supabase/config.toml` (new, minimal: pins per-function `verify_jwt` only); `dist/account/{index.html,account.js,account.css,supabase-client.js}`; `tests/gaming-connections-oauth.test.js`; `tests/gaming-connections-ui.test.js`; `tests/integration/gaming-connections-db.sql`; `package.json` (typecheck now includes the shared OAuth module).

### Validation

- `npm run build`: lint + typecheck + **191/191 tests pass** (was 141 before this slice; 36 OAuth behavior tests + 14 static UI/security tests added; no existing test was modified or weakened). `tests/slice-3b-roles-education.test.js` still asserts the placeholder `<span>Connections</span>` in the Identity Board; it was intentionally left untouched.
- Live DB behavior: `tests/integration/gaming-connections-db.sql` (run with `supabase db query --linked -f …`) impersonates roles inside a self-rolling-back block: **48/48 steps** — state creation/hash-only storage/expiry/one-time consumption, replay, invalid state, cross-user isolation, duplicate provider account, other-account refusal, reconnect, disconnect idempotency, RLS/anon denial, private-by-default, public-boundary non-exposure. Nothing persisted.
- OAuth tests use a fake backend and fake Discord `fetch`; they were **mutation-tested** (removing consume-before-Discord, scope check, revoke, state binding, etc. each makes tests fail).
- Deployed runtime was verified with a temporary diagnostic function (since deleted, never committed): platform env present, user-JWT start OK, consume/finish OK, replay/garbage handled. A disposable TESTING identity was used and cleaned up; **`@black` was never touched**; Mazen's real Discord was never connected.
- Frontend was exercised locally against a mocked API module (scratch, not committed) at a 375px mobile viewport: not-connected/connected/error/list-failure states, hostile display names rendered as inert text, authorize-URL rejection, double-click guard, two-step disconnect, return-param handling and URL stripping. **The real end-to-end Discord flow has not been run — it cannot be until Mazen configures Discord.**

### Manual actions still required (Mazen)

1. ~~Create the Discord application and set the two function secrets~~ — **DONE by Mazen 2026-09-19** (never paste them into chat, Git, frontend code, or screenshots).
2. Run the manual acceptance plan on Samsung Android Chrome, Windows Chrome, and Windows Opera with a disposable Discord/TESTING account, then his own account.

### Known limitations / deferred

PKCE unavailable (not documented by Discord). The state is bound in the database, not to a browser cookie. No connection visibility toggle or public display (deferred by design). Only Discord; provider modules for others are unwritten. Rate limiting is per user on attempt creation only. Discord's own Authorized Apps list is managed by the user in Discord. `supabase functions deploy` requires the Supabase CLI login; secrets are managed outside the repo.
## 7i. Discord connections scope + private Riot discovery validation

**COMPLETED. REAL RESULT (manually run by Mazen): Discord authorized `identify + connections` successfully, but `/users/@me/connections` returned 0 linked accounts, so Riot Games was NOT returned. Do not keep trying to discover Riot through Discord; the stored discovery result (`ABSENT`, 0 total) is preserved.** The follow-up League work is section 7j. Original implementation notes follow. Implementation checkpoint `39f97c83c455abe56e8281a9e4b179562ede0cc9` (built on `33cad8dd54375a1ae686091740d88ebb0663554b`). This is a **discovery/validation slice only**: it answers one question — when the real TESTING Discord account authorizes `identify connections`, does Discord's official `GET /users/@me/connections` return the Riot Games connection visible on that Discord profile, and which safe fields does it carry? It does **not** implement Riot OAuth/RSO, call any Riot API, use the Riot development key, touch OP.GG, or look up League rank/server/LP, and it does not change the public profile.

### What the current official docs say (docs.discord.com/developers, fetched for this slice)

`GET /users/@me/connections` requires the `connections` scope. Connection object fields: `id`, `name`, `type`, `revoked`, `integrations`, `verified`, `friend_sync`, `show_activity`, `two_way_link`, `visibility` (0 private / 1 public). **Riot Games is not in Discord's documented Services table**, so Riot's `type` string is unknown and is deliberately not assumed — it is learned from the live response. The docs do not describe how granted scopes change when an already-authorized user re-authorizes; `prompt=consent` forces the consent screen again.

### Exact OAuth scopes now requested

**`identify connections`** (sent as `scope=identify%20connections`). Nothing else. `identify` is unchanged (id, username, display name, avatar). `connections` is the new, explicit, temporary discovery permission. The token response must contain **exactly** these two scopes — more, fewer, or different is revoked and refused (`exchange_failed`). This intentionally applies to every Discord authorization (per the slice brief), not just the owner's; narrowing it back to on-demand only is an open decision for after the validation result (see limitations).

### How `/users/@me/connections` is handled

- Called once in the callback, server-side, with the temporary token, **after** `/users/@me` and **before** the token is revoked. The token is revoked immediately afterwards and is never stored, logged, or returned.
- The payload is reduced **in memory** by `summarizeConnections` (`supabase/functions/_shared/discord-oauth.js`). An entry is treated as Riot only if its `type`, reduced to lowercase alphanumerics, **starts with `riot`** or is `leagueoflegends`/`valorant` (Riot's own game names). Every other entry is discarded; only the total count survives (so "Riot absent" can be told apart from "Discord returned nothing").
- For the (first) Riot entry only, retained: `type` as returned, `name` (control characters stripped, ≤128), the id's **shape** (`uuid`/`digits`/`alnum`/`other`) and **length**, a **SHA-256 fingerprint** of the id (never returned to any client), `verified`/`revoked`/`friend_sync` (booleans only), `visibility` (0–9), the allow-listed **names** of the fields Discord returned, and the number of Riot-typed entries. The raw external id is never stored.
- Never retained/logged/exposed: unrelated accounts, the full payload, the raw id, tokens, codes. The browser receives only `discovery=found|absent|unavailable` in the return URL; the details are read separately through an owner-only RPC.
- The result is recorded **only after the owner's own Discord link succeeds** (`CONNECTED`/`RECONNECTED`) and is bound to the account just linked — never for a refused attempt (`account_in_use`, `other_account_connected`), cancellation, or failed exchange. A connections failure/malformed response never fails the identity link: it is recorded `UNAVAILABLE`. A failure to save the diagnostic never undoes or misreports the link.

### Schema (migration #18: `20260919170000_connection_discovery_riot_validation.sql`, applied to TESTING only)

Additive only; `gaming_connections` and every earlier object are untouched. New `public.connection_discovery_results` (PK `connection_id` + `discovered_provider`, `on delete cascade` from `gaming_connections`, so **Disconnect removes it**); RLS on, all table privileges revoked from `public`/`anon`/`authenticated`, owner-select policy; check constraints so only a `FOUND` row can carry details and a `FOUND` row must carry a type. `record_connection_discovery` is `service_role` only (also guarded by `current_user <> 'service_role'`, requires a consumed+completed attempt whose outcome is `CONNECTED`/`RECONNECTED`, and the account must be the one that attempt linked). `get_my_connection_discovery` is `authenticated` only and does not return the fingerprint. The provider column is generic (`riot` is the only accepted value now).

### UI (owner only, inside the existing YOUR GAMID → Connections → Discord card)

A private panel: **DISCOVERED THROUGH DISCORD — PRIVATE — DISCOVERY TEST**, showing "not run yet" / Riot found (type, name, verified, Discord visibility, friend sync, revoked, id format, field names, when checked) / Riot not returned (with the total number of linked accounts Discord returned) / list unreadable. It always says it is diagnostic and never shown on the public GamID. The button **Grant permission & run Riot discovery test** (later **Run Riot discovery test again**) is the only way to request the extra permission: it reuses the existing OAuth start → consent → callback flow, requires an explicit click, and never disconnects or silently reconnects anything. Because the current connection was granted with `identify` only, the real account shows "not run yet" until Mazen clicks it. Public profile code (`dist/public/*`) does not reference discovery, Riot, or Discord (asserted by a test).

### Validation

- `npm run build`: lint + typecheck + **218/218** tests (was 191). `tests/gaming-connections-oauth.test.js` 36 → 55; `tests/gaming-connections-ui.test.js` 14 → 22. **Existing tests that were legitimately updated** because the contract changed: the authorization-URL scope assertion (`identify` → `identify connections`), the fake token scope, the success-flow Discord call sequence/count (3 → 4 calls: exchange, identity, connections, revoke) and log events, the over-scope test (now also refuses narrower/different scope sets), and the allowed-redirect-keys test (adds `discovery`). No test was removed or weakened.
- Mutation testing: nine deliberate breakages (keep every entry, store the raw id, record on a refused link, loosen the scope check, request `identify` only, put the name in the redirect, let a connections failure fail the link, log the full payload, skip the revoke) — **all nine caught**; the module was restored byte-for-byte.
- Live DB: `tests/integration/connection-discovery-db.sql` — **30/30** steps against TESTING (self-rolling-back); it was also run wrapped with the migration itself **before** applying it (rolled back). The original `gaming-connections-db.sql` still passes (47/47 + summary). After all runs: 1 connection, 3 identities, 0 discovery rows; `@black` untouched.
- Browser: the panel was exercised locally against a scratch mock API (not committed) in all states, with a hostile Riot name rendered as inert text, no navigation without a click, non-Discord authorization URLs refused, and no horizontal overflow at 375px.
- Deployment: migration applied via `supabase db push` (single pending migration); both Edge Functions redeployed (v3, `verify_jwt` pins unchanged); unauthenticated probes confirm the callback still redirects safely (`invalid_state`) and `start` still rejects a missing JWT (401). **The authorization URL a signed-in user receives (scope `identify%20connections`) is proven by tests against the same module, not by a live signed-in call.**

### Fix: real ME1 lookup failure (non-apex rank sentence) — implementation `0b75160eed763aee5713047222df84807308655d`

**Symptom (real, Mazen's account, Middle East / ME1):** Add League Account answered "OP.GG returned something GamID couldn't read reliably" (`STRUCTURE_CHANGED`); a second immediate attempt was correctly stopped by the server-side throttle.

**Diagnosis (one instrumented request through the real adapter):** OP.GG served the ME1 page normally — HTTP 200, no redirect, no block, region identifier `me`, canonical `/lol/summoners/me/…`, "on the ME server", the same JSON-LD structure as KR. So the ME1 URL/region mapping, redirect handling and JSON-LD structure were all **correct**. The actual mismatch was the rank sentence: non-apex tiers are written with their division right after the tier name (`bronze 4 Division 4 7 LP with 2 wins, 3 losses…`), whereas apex tiers are `challenger Division 1 2144 LP…`. The parser required `<tier> Division <n>`, and only apex had been observed live when it was written — the non-apex test fixtures were a wrong guess. **The defect therefore affected every non-apex rank (Iron–Diamond) in every region, not only ME1.**

**Fix (adapter only):** the number after the tier is accepted; when present it must equal the following `Division N`, otherwise the page is refused as `STRUCTURE_CHANGED` (a disagreement or out-of-range number is never resolved by guessing). Apex parsing is unchanged. The domain model, service, database, throttling, UI, Discord and the public profile were not touched; no migration.

**Verification:** the fixed parser was run against the two real captured pages — ME1 now yields `BRONZE IV · 7 LP · 2W 3L · icon 1666` (matching OP.GG's own summary), and the earlier KR apex page is unchanged. Regression tests reproduce the exact live ME1 response shape with a stand-in Riot ID (the real player's ID is deliberately not committed), cover every non-apex tier × division, the refusal cases, and an end-to-end service test using the real adapter (one OP.GG request, correct stored data, throttle unchanged). They **fail against the previous adapter (5 failures)**. Full build: 280/280. `league-lookup` redeployed (v2); the endpoint boots and rejects unauthenticated calls; no lookup was made against the owner's Riot ID after the single diagnostic request. Throttling is byte-for-byte unchanged (60 s spacing, 6 per hour, 10-minute Refresh cooldown — no migration touched).

### UI polish: League card layout — implementation `e4fcc08a3133df85a68daf467e81f5da6d52e2ff`

**Symptom (real, on phones):** the League card's text was cramped, clipped and too close to its borders, especially the lower metadata area.

**Visual root cause (CSS only):** (1) The header reused the Connections row in which the chip is `flex:0 0 auto`; at 320–375 px the "PROTOTYPE / UNVERIFIED" chip took ~162 px and crushed the Riot ID / region column to 0–47 px (ellipsis: "Espada …", "Middle …"), overlapped the "League of Legends" title, and sat ~6 px from the card border; those lines were also `nowrap` + ellipsis, so long Riot IDs clipped. (2) The metadata list is a `<dl>` and inherited the **global** `dl` / `dt` / `dd` rules from an older account panel: a 1 px bordered, 16 px-radius box with `overflow:hidden` and no padding (labels 1 px from the border, the last row cut by the bottom border) and green, letter-spaced, weight-800 values that broke mid-number.

**Fix:** a block appended to `dist/account/account.css`, every rule scoped to `.league-card`: the header row wraps (text column has a 9rem floor; the chip can shrink and drops under the text on narrow cards); Riot ID / region / notes wrap safely; the metadata list drops the inherited box (top divider only), stacks label over value on phones and becomes two columns from 34rem, with normal-colour values; card padding 1rem and more room around the privacy and warning notes. **No JS, markup, wording, League lookup/adapter/throttle/schema, Discord, auth, Intro, or public-profile change**; the shared `.connection-discovery-*` (Discord discovery panel) rules and the global `dl`/`dd` rules were deliberately left as they are.

**Verification:** real-geometry probes (text outside the card padding, overlapping text, truncation, control containment, page scroll) at 320, 375, 600, 768 and 1280 px across the real-shaped profile, a stress profile (32-character name, 15-character tagline, Grandmaster 1,234 LP, 15,000 wins, failed-refresh note), unranked, the not-yet-added form, and the Remove confirmation — all clean; live-checked at 320 px with the deployed stylesheet. `tests/league-card-layout.test.js` (10; 6 fail on the previous CSS); full build 308/308.

**Observation, not fixed (out of scope):** with the *unmodified* CSS the whole account page overflows horizontally at roughly 760–850 px (768 px: the account shell is a `304px 480px` grid = 848 px wide) — independent of the League card. Recorded in section 10. The Discord discovery panel also uses the shared `.connection-discovery-facts` `<dl>` and so has the same inherited box; it was left untouched per the task's scope.

### Manual acceptance still required (Mazen) and known limitations

1. Mazen must click **Grant permission & run Riot discovery test** in the real TESTING account and approve the `connections` permission on Discord; only then does the real answer exist. Do not act on Riot data before that result is reviewed.
2. Riot is matched only by connection `type`. If Discord returns Riot under an unexpected type, this validation reports "not returned" (the total count is shown to help spot that); the type is deliberately not guessed beyond `riot*`, `leagueoflegends`, `valorant`.
3. `connections` is requested on **every** Discord authorization right now (a temporary, deliberate widening of the least-privilege scope set from 7h). After the result is known, decide whether to keep discovery on-demand only.
4. No Riot ID is stored, no Riot API is called, and nothing about Riot is public; OP.GG, League rank/server/LP, and any Riot OAuth/RSO remain unstarted and need separate authorization.

## 7j. League of Legends prototype — manual Riot ID + temporary OP.GG adapter

**IMPLEMENTED, MIGRATION APPLIED AND FUNCTION DEPLOYED TO TESTING. PRIVATE, UNVERIFIED, PROTOTYPE ONLY. AWAITING MAZEN'S MANUAL ACCEPTANCE.** Implementation checkpoint `44c7a4455f40088572d165a6de453b73491d6500` (built on `3a5ce6c82bb3a6d33001054a14eae1991b2c10eb`). Direction change that led here: Mazen's real Discord `identify + connections` authorization returned **0 linked accounts** (section 7i), so Riot cannot be discovered through Discord and that route was dropped. This slice instead lets the owner type their Riot ID **once**, and resolves public League details through an isolated, temporary OP.GG adapter. It does **not** implement Riot RSO, call any Riot API, use the Riot development key, look up other players, or make anything public, and it does not change Discord, the Discord connection, or the Discord discovery result.

### Feasibility checked first (OP.GG is not an official API)

OP.GG's `robots.txt` allows generic crawlers (`User-agent: *  Allow: /`), and profile pages are path-based (`/lol/summoners/{region}/{Name}-{TAG}`). A plain HTTPS GET with an honest User-Agent returned the full page with **no challenge, CAPTCHA or block**, both from a normal connection and from the Supabase Edge runtime (~0.7 s). One early request from the cloud network timed out at 20 s and a retry succeeded, so the adapter uses a bounded 12 s timeout and reports "temporarily unavailable" instead of retrying. **If OP.GG ever blocks or rate-limits, the adapter simply reports unavailable; no bypass is implemented and none may be added.** OP.GG's terms of use were not legally reviewed; this remains a prototype.

### Data source: the page's schema.org JSON-LD (not the page markup)

The adapter reads only the `<script type="application/ld+json">` block that the page publishes for search engines: the `Person` node (name `Game#TAG`, region, icon) and the `ProfilePage` node (a templated description with the Solo/Duo rank sentence, and `dateModified`). The rank sentence is parsed only after consuming the exact known player name, so a hostile in-game name cannot inject a fake rank. Any deviation (missing nodes, unknown tier, division outside 1–4, region mismatch, unexpected template) is `STRUCTURE_CHANGED` — a value is never guessed. A valid profile without the ranked sentence is `NOT_REPORTED` (OP.GG's wording for an unranked player was not observed, so "unranked" is not asserted). The parser was verified against a **real captured profile** (Challenger, 2,144 LP, 395W/321L, icon 6 — matching OP.GG's own display) and the real adapter was run once in the Supabase runtime against live OP.GG (valid snapshot, 783 ms); the temporary check function was deleted.

### League data model (source-neutral)

Migration #19, `20260920100000_league_profile_prototype.sql`, applied to TESTING only. `public.league_profiles` (one per GamID, `on delete cascade`): `game_name`, `tag_line`, `platform_id` (Riot platform ids: NA1, EUW1, EUN1, KR, JP1, BR1, LA1, LA2, OC1, TR1, RU, ME1, SG2, TW2, VN2, PH2, TH2), `identity_source` (`MANUAL_RIOT_ID`), `data_source` (`OPGG_TEMPORARY`), `trust_status` (default `MANUAL`; a DB constraint forbids anything else for the temporary source), `solo_rank_state` (`RANKED`/`UNRANKED`/`NOT_REPORTED`), `solo_tier`, `solo_division`, `solo_lp`, `solo_wins`, `solo_losses`, `profile_icon_id`, `source_url` (https), `source_updated_at`, `fetched_at`, `last_attempt_at`, `last_result`, `is_public` (default false). Tagline format is not assumed (no length/charset rule; only `#`, `/`, `\`, whitespace, `-` and control characters are refused). Not stored: HTML, any response body, the player id (PUUID), other players, tokens. `private.league_lookup_attempts` is the throttle/reservation ledger. Nothing in this schema names OP.GG except the opaque `data_source` value.

### How the adapter is isolated and replaceable

`supabase/functions/_shared/league/`: `league-domain.js` (Riot concepts, input normalization, snapshot validation; no imports), `opgg-adapter.js` (the **only** file that knows OP.GG; exports `{ sourceKey, lookup }`), `league-service.js` (orchestration; takes any adapter and never imports OP.GG). `supabase/functions/league-lookup/index.ts` is glue that wires the two. Replacing the source with Riot RSO + the official API means writing another adapter with the same contract and adding its `data_source` value — the table shape, service, owner card and public-profile model do not change. Tests assert the isolation, including that the OP.GG string exists nowhere else and that a differently-named adapter works unchanged.

### Lookup and refresh behavior

A lookup happens **only** when the owner presses **Add League Account** or **Refresh**. There is no polling, scheduling, background refresh, or retry. Flow: validate/normalize input server-side → `reserve_league_lookup` in the database **as the caller** (proves ownership, enforces the throttle, mints a one-time reservation) → exactly one adapter call → `save_league_lookup` (service_role only, bound to that reservation, re-checks that the returned player equals the reserved one) → the browser receives only a status word (`ok`, `not_found`, `unavailable`, `structure_changed`, `identity_mismatch`) and re-reads the stored data through an owner-only RPC. **Throttle (in the database, before any outbound request):** at least 60 s between lookups, at most 6 per hour (failures count), and Refresh at most once per 10 minutes; remove + add cannot sidestep it (the ledger survives removal). A refresh can only re-check the **stored** identity. A failed refresh keeps the last good data and only records that the last attempt failed. Adding when a League account already exists is refused (Remove first).

### Privacy, trust and security behavior

Private by default (`is_public=false`, no toggle, no public RPC reads it; `dist/public/*` has no League code). RLS on both tables, all table privileges revoked from `public`/`anon`/`authenticated`, owner-select policy; owner RPCs `authenticated` only; save/finish `service_role` only. The Edge Function has `verify_jwt = true` and the database re-authenticates the caller; ids supplied in a request body are ignored. The browser never contacts OP.GG. UI wording is **League of Legends · PROTOTYPE / UNVERIFIED · Data source: OP.GG · Last updated …** and never says Verified by Riot / Official Riot Connection / Riot Verified; the card states the Riot ID was entered manually and is not proof of ownership. The profile icon is stored as an id only (no third-party image is hotlinked). All values are rendered as text.

### Validation

- `npm run build`: lint + typecheck + **274/274** tests (was 218): `tests/league-lookup.test.js` (39) and `tests/league-ui.test.js` (17) added. **Existing tests legitimately updated:** the discovery slice's "no OP.GG anywhere" guard now permits OP.GG only in the isolated adapter (plus its glue and the UI's plain "OP.GG" source label) while still banning official Riot APIs/RSO/keys everywhere; the Connections load-order assertion now allows `loadLeague()`; and `tests/integration/connection-discovery-db.sql` had two global row counts scoped to its own disposable data (a real discovery row now legitimately exists). Nothing was removed or weakened.
- Mutation testing: 13 deliberate breakages (skip throttle, refresh a caller-supplied identity, reserve with the service key, save unvalidated snapshots, log/return looked-up data, skip server-side validation, follow any redirect, allow extra hops, retain page content, add cookie headers, treat 403 as not-found, accept `#` in names, accept any region) — **all caught** (one initially survived; the redirect test was strengthened) and every file restored byte-for-byte.
- Live DB: `tests/integration/league-profile-db.sql` **54/54** (also run wrapped with the migration itself before applying it); the earlier connection/discovery scripts still pass (47/47 and 30/30). After all runs the real data is unchanged: 1 Discord connection, discovery `ABSENT:0`, handles `black,test1,test2`, 0 League rows.
- Browser (scratch mock API, not committed): empty/ranked/unranked/error/cooldown/load-failure states, pasted `Name#TAG`, hammering Refresh (one lookup), two-step Remove, 375 px layout with long names — no overflow.
- Deployment: migration applied via `supabase db push`; `league-lookup` deployed (v1, `verify_jwt` pinned in `supabase/config.toml`; Discord functions untouched at v3); unauthenticated and bogus-JWT requests return 401; GitHub Pages deploy succeeded and serves the League UI with no OP.GG URL in browser code.

### Manual acceptance still required (Mazen) and known limitations

1. Mazen must add his own Riot ID in the real TESTING account and confirm the card, Refresh cooldown and Remove behave; the real signed-in end-to-end path was **not** run by the agent (no credentials).
2. **KR and ME1** have now been exercised against live OP.GG (ME1 is reachable normally and its region mapping `me` is correct). The other regions still rely on the region path segment mapping (notably LA1→`lan`, LA2→`las`); a wrong segment surfaces as "not found" for that region.
3. OP.GG is unofficial: its page format can change without notice (reported as `structure_changed`), it can be unavailable, and its data can lag. Solo/Duo only; wins/losses only when the page states them; one League account per GamID (change = Remove then Add).
4. Not started and needing separate authorization: public League visibility, other queues, ranked history, server-specific extras, Riot RSO/API, Steam/other providers.

## 7k. Root landing page V1 — replace the public NovaRift prototype at the TESTING root

**IMPLEMENTED, DEPLOYED TO TESTING AND VERIFIED LIVE; AWAITING MAZEN'S MANUAL ACCEPTANCE.** Implementation checkpoint `3cb0cde7f474cbe7efd194623c6c02853c3de365` (built on `bba30a382bbc69666b7c5925762401be9a94f284`). A focused product/UX correction: no authentication, RLS, Discord, League/OP.GG, Intro, public-route, or `@black` change.

### Problem and root cause

The anonymous root `https://jeddawe11-eng.github.io/gamid-testing/` served `dist/index.html` + `dist/app.js`: the accepted **Slice 1 "Intro Engine" lab** — a fictional "NovaRift" profile (`@novarift`, Marvel Rivals, Favorite Games, Duo, Team) with prototype controls. It was never meant to be a public entrance, and it let a visitor believe they had opened a real, controllable GamID account. `/account/` (real Create Account / Sign In) was already correct.

### What was done with the old prototype

Moved (`git mv`) to **`prototypes/slice-1-intro-lab/`** (`index.html`, `app.js`, plus a README stating its status). It still runs locally (paths point at `../../dist/…`) but is **not deployed** — the Pages workflow publishes only `dist/`, so it has no public route (the live `/app.js` and `/prototypes/…` return 404). `dist/styles.css`, `dist/transition-engine.js`, and `dist/assets/*` deliberately **stayed** in `dist/`: the real Intro iframe (`account/intro-preview.html` → `../styles.css`), the account preview, and the public profile all use them (the public `/@handle` Intro was re-verified live). `scripts/validate.mjs` and `npm run typecheck` now target the relocated lab and also validate the landing page.

### Landing page structure (`dist/index.html` + `dist/landing.css`)

Static, script-free, form-free, no network calls, no external URLs. Header (GAMID brand + TESTING badge) → hero (`CREATE → WOW → SHARE`, **"Your gaming identity. One GamID."**, one supporting sentence, the two CTAs, "Your GamID stays private until you choose to publish it.") beside a **clearly labelled, non-interactive, `aria-hidden` EXAMPLE identity card** ("Illustration only — not a real profile", generic `@yourhandle` placeholders, no real data) → three short steps (Create / WOW / Share) → a closing CTA block → footer. Mobile-first with breakpoints at 34rem and 56rem; CTAs ≥54 px tall and above the fold at 375 and 320 px; reduced-motion respected. A real 17 px horizontal scroll caused by the spinning ring's bounding box was found in browser testing and fixed (`.showcase{overflow:clip}`).

### Exact CTA behavior

- **Create your GamID** → relative link `account/?auth=register` → the existing `/account/` page, **Create account** tab (already the default there).
- **Sign in** → `account/?auth=signin` → the existing `/account/` page with the **Sign in** tab selected.
- Small, testable UI-only hook: `authTabFromSearch` / `searchWithoutAuth` in `dist/account/domain.js` and a block at the end of `account.js` that clicks the existing tab **only when the auth view is what the visitor is seeing**, then strips only the `auth` parameter (others are preserved; unknown values are ignored). It runs after the normal routing decision and touches no session, so a signed-in owner opening either link goes straight to YOUR GAMID exactly as before. No auth form was duplicated.

### Validation

- `npm run build`: lint + typecheck + **298/298** tests (was 280). `tests/landing-page.test.js` (18) fails against the old root (6 failures) and passes now. **One earlier assertion legitimately updated:** `tests/validation-architecture.test.js` checked the lab's video reference in `validate.mjs` by exact text; the path prefix changed with the relocation (the intent — check the reference without reading the file — is unchanged).
- Browser (local Pages-like copy, then the **live** site, both from a clean anonymous state — 0 stored keys): layout at 320, 375, 768 and 1280 px with real scroll attempts (no horizontal scroll); Sign in and Create your GamID each land on the right tab of the real `/account/`; a bogus `?auth=` value is ignored and `?keep=1` preserved; `/account/` alone still opens on Create account; `/@black` still redirects through `404.html` to `/public/index.html?handle=black` and renders the Intro route; an unknown handle still shows "This GamID isn't public…". The landing shows no `@black`, no emails/ids, no Discord/League/Riot content, and no owner controls.
- Deployment: GitHub Pages deploy succeeded; live root fetched over plain HTTP contains the landing, no NovaRift/prototype markers, 0 scripts/forms/inputs.

### Residual notes

- `dist/account/index.html` still labels its header brand link `aria-label="GamID Intro Lab"` (it points at `../`, now the landing page). It was left untouched because the brief forbade changing the account experience; it is a one-word accessibility label that can be corrected in a later account pass.
- No Supabase/Discord/League/OP.GG code, migration, function, or data was touched by this slice.

## 7l. Public Profile Expansion — Phase 1: per-section visibility + public-safe data foundation

**IMPLEMENTED, MIGRATION APPLIED AND DEPLOYED TO TESTING; AWAITING MAZEN'S MANUAL ACCEPTANCE.** Implementation checkpoint `2e0c433eb37458e943dbdd1d3f0d259105ba46a7` (built on `d79bdc8dc5e8f3d6ae3065a1e971ee3e61f06f2e`). This is the **foundation** for the future expanded / cinematic Public GamID: it adds independent "Show on my GamID" control and a server-enforced public-safe data path for **Discord**, **League of Legends** and **Education & Work**. It is not the Public Profile redesign, not the Cinematic Profile Engine, and adds no game. It supersedes the earlier statements (sections 7h/7j) that connections and League had "no toggle" / "no public display".

### Existing architecture found (before any change)

- **Public boundary:** `get_public_identity(handle)` and `get_public_identity_by_qr(token)` (the QR function delegates to the same `private.get_public_identity_impl`) — fixed-column, security-definer, granted to `anon`, gated **only** by `entities.visibility = 'PUBLIC'`. No other anonymous read path exists: `anon` has no grant on any table, and `authenticated` may only `SELECT` its own `profiles` row.
- **Existing visibility:** only whole-GamID Publish / Unpublish. `gaming_connections.is_public` and `league_profiles.is_public` existed (default `false`) but were never used. **Education/Work had no control and was returned unconditionally for every published GamID** (`public.js` rendered it), i.e. it was already public. The real `@black` was published and has an Education/Work status.

### Two levels of visibility (server-enforced)

1. **Whole GamID** — Publish / Unpublish is unchanged and remains the top gate. Unpublished ⇒ nothing is public regardless of any section switch (handle and QR routes both return no row).
2. **Per section** — each optional section has its own "Show on my GamID" switch, **OFF by default**: `gaming_connections.is_public` (Discord), `league_profiles.is_public` (League), `profiles.show_education_work` (Education & Work). The switch lives on the row it controls, so disconnecting / removing deletes it and **re-connecting or re-adding can never inherit an old ON** (asserted live). A refresh, reconnect or League refresh never writes the switch.

### Schema (migration #20: `20260920140000_public_section_visibility.sql`, applied to TESTING only)

`public.public_section_catalog` (small registry: `discord`, `league`, `education_work`, each with a `section_kind`; a future game is a catalog row plus its own presenter, not a new model; RLS on, no client grants); `profiles.show_education_work boolean not null default false`; owner RPCs `get_my_section_visibility()` / `set_my_section_visibility(section, visible)` (authenticated only); and the four public functions rebuilt with **one added column, `public_sections jsonb`**, containing **only visible sections** — a hidden section is **omitted entirely** (no `visible=false` objects). The existing Education/Work columns return `NULL` while hidden (the values never leave the database). **Education/Work grandfathering:** because it was already public, profiles that already hold Education/Work data were set ON so nothing changes for them until the owner turns it off (only `@black` — its public page is unchanged); all other profiles and every new profile start OFF. No Education/Work data was changed. **Owner action for Mazen:** turn `@black`'s Education & Work OFF if he does not want it public.

### Exact public-safe fields

- **Discord** (`public_sections.discord`): `display_name`, `username`, `trust_status` (`CONNECTED`). **Not exposed:** the Discord account id, the avatar URL (it embeds that id), tokens, timestamps, connection/attempt ids, the Riot discovery diagnostic, any metadata.
- **League** (`public_sections.league`): `game_name`, `tag_line`, `platform_id`, `rank_state`, `tier`, `division`, `lp`, `wins`, `losses`, `profile_icon_id`, `trust_status` (`MANUAL`), `identity_source` (`MANUAL_RIOT_ID`), `data_source` (`OPGG_TEMPORARY`), `updated_at` (the fetch time). Null values are stripped. **Not exposed:** source URL, lookup result/errors, the throttle ledger, reservations, `last_attempt_at`, ids, raw source data. The public output preserves the truth (manual, unverified, temporary source); a DB constraint already forbids a temporary source from being VERIFIED.
- **Education & Work:** the existing `education_work_status` / `institution` / `field_of_study` / `education_work_catalog`, returned only while ON.

### The switch RPC only flips one flag

`set_my_section_visibility` updates exactly one of three flag columns for the caller's own GamID and nothing else: no disconnect, delete, refresh, OP.GG lookup, timestamp change, throttle-ledger row or reservation (asserted live: ledger count, `fetched_at`, `last_attempt_at` and every other League column unchanged across OFF/ON). It refuses sections that are not set up (`SECTION_NOT_SET_UP`), unknown sections and missing values, and takes no caller-supplied identity.

### YOUR GAMID UI

One generic, accessible (`role="switch"`, `aria-checked`, 44 px target) **Show on my GamID** control, placed with the section it controls — the Discord card (under the CONNECTED status), the League card (under its PROTOTYPE / UNVERIFIED details), and inside the Education & Work panel. Hints follow the real publish state ("Private — not shown on your public GamID." / "Shown on your public GamID." / "Will appear on your public GamID once you publish it."; League: "…, marked PROTOTYPE / UNVERIFIED (data: OP.GG)"). The switch calls only the visibility RPC, is not part of the profile form save, disables during a change, and reverts with a clear message if the server refuses. Existing Connect/Disconnect and Add/Refresh/Remove code is unchanged.

### Public page (minimum presentation only)

`public.js` renders a small text panel from `identity.public_sections` (outside the Intro iframe; Intro files are unchanged; `pointer-events:none`; shown only once the profile is revealed). It contains no client-side hiding logic — hidden sections simply are not in the response. The full visual composition is a separate future phase and must not assume a vertical stack of cards.

### Validation

- `npm run build`: lint + typecheck + **330/330** tests (was 308). `tests/public-section-visibility.test.js` (22). **Older assertions updated to the new contract** (none removed or weakened): the Discord and League "public route" guards now allow *presentation* only from the server-gated `public_sections` while still forbidding private machinery/internals/lookups/OP.GG URLs; the OP.GG allow-list now includes the public renderer's plain-text source **label**; and the League-card CSS test's block now ends where the switch styles begin.
- Live DB matrix `tests/integration/public-section-visibility-db.sql` — **46/46**: unpublished + all ON ⇒ nothing public (handle and QR); published + all OFF ⇒ core identity only, empty `public_sections`, Education NULL; Discord and League and Education each ON → OFF → ON (disappears/reappears immediately, without disconnecting, deleting, reconnecting, refreshing or a lookup); exact field sets; no leak of ids/avatar/tokens/diagnostics/source URL/ledger/flag names; QR = handle response; anonymous denied on every hidden table and on the owner RPCs; authenticated cannot write flags directly; ownership isolation; reconnect/re-add start OFF; reconnect and League refresh preserve an explicit ON. Nine deliberate SQL breakages (Discord/League/Education ignoring their switch, publish gate removed, avatar URL leaked, source URL leaked, League presented VERIFIED, toggle not owner-scoped, Education default ON) were **all caught**. All earlier live suites still pass (League 54, discovery 30, connections 47).
- Real data after the migration: `@black` still PUBLIC; Education/Work ON (grandfathered); Discord and League OFF; the anonymous public response for `@black` has `public_sections = {}`, still shows Education as before, and contains no Discord/League data; anonymous access to `gaming_connections`, `league_profiles`, `connection_discovery_results`, `public_section_catalog` and `profiles` returns 401. Browser (scratch mock, real `dist/`): switches, hints, refusal path, single request on triple-click, publish-state hint changes, 320/375 px layout, the public panel with both/one/none sections and a long-value stress case; the live public `@black` page loads normally with no sections panel.

### Deliberately not done / manual acceptance

Not started: the Public Profile redesign, the Cinematic Profile Engine, any other game (including Marvel Rivals), other providers, public link/QR changes. Mazen's acceptance: switch each section ON/OFF in YOUR GAMID and confirm the public page (anonymous window) follows immediately, that turning OFF does not disconnect Discord or delete/refresh League, and decide whether `@black`'s Education & Work should stay public.

## 7m. Steam Connection Foundation — Steam OpenID 2.0 sign-in as a Gaming Connection

**IMPLEMENTED, MIGRATION APPLIED, EDGE FUNCTIONS AND SITE DEPLOYED TO TESTING; AWAITING MAZEN'S REAL STEAM SIGN-IN AND MANUAL ACCEPTANCE.** Implementation checkpoint `48efec8857a2773d3b3f678cfc7a2ec9f7cbc04a`, built on the accepted Phase 1 documentation checkpoint `50737ba408d9ab1c3894d4713efa5df5b3743f17`. It is the second Gaming Connections provider: a signed-in owner connects the **SteamID64 that Steam itself authenticated** to their existing GamID. That is the entire result of this phase.

**Not done, on purpose:** no game-library discovery (`GetOwnedGames` is never called), no playtime/achievements/recently played, no Marvel Rivals, no game ownership, no Steam Web API of any kind, no Public Profile redesign, no other provider. A Steam connection is a **CONNECTED platform identity — never a VERIFIED game profile**, and the schema forbids it.

### Flow

YOUR GAMID → **Connect Steam** → `steam-connect-start` returns the official Steam URL → Steam's own sign-in page (`steamcommunity.com/openid/login`) → Steam redirects the browser to `steam-connect-callback` → the callback validates everything and asks Steam to confirm → the SteamID64 is linked to the owner who started the attempt → 302 back to YOUR GAMID with only a fixed result code → Steam shows **CONNECTED**.

### OpenID security design (`supabase/functions/_shared/steam-openid.js`, provider-isolated, dependency-injected, unit-tested)

- The browser is never trusted with a SteamID. No Steam password, Steam Guard code, or cookie is requested, received, proxied, logged, or stored. No secret exists (OpenID 2.0 has none); only the platform Supabase variables are used.
- **State ledger:** reuses the accepted `private.connection_oauth_attempts` (64-hex state, stored hash-only, bound to user + identity + provider, 10-minute expiry, single-use with a row lock). Steam's OpenID has no `state` parameter, so the state travels inside `openid.return_to`, which Steam **signs** — an assertion issued for one attempt cannot be used with another.
- **Order:** the state is consumed *first*; an unknown, malformed, duplicated, expired, or replayed state is refused **before any request to Steam** (the function is not an open proxy).
- **Local checks (no Steam call if any fails):** `ns`/`mode=id_res`; `op_endpoint` is exactly Steam's; `return_to` equals our exact callback + this attempt's state; `claimed_id` == `identity` and both match `https?://steamcommunity.com/openid/id/<17 digits>`; the ID is in the individual-account SteamID64 range; `openid.signed` covers `op_endpoint, claimed_id, identity, return_to, response_nonce, assoc_handle`; `sig` and `assoc_handle` present; `response_nonce` well-formed and fresh (≤10 min old, ≤5 min ahead); repeated protocol parameters are refused.
- **Steam validates the signature:** direct verification (`openid.mode=check_authentication`) to the **one fixed endpoint** (no OpenID discovery from the identifier — the classic RP bug; a hostile `claimed_id` never causes a request to another host). Exactly one `is_valid:true` line is required; `false`, empty, duplicated, an HTML page, or an error status is a refusal.
- **Ownership:** the owner is derived only from the consumed state, never from the callback's browser. The completion runs in the database (`att.user_id` must still be the identity's OWNER).
- **Outputs:** the callback only ever 302s to `/account/?connection=steam&result=…&reason=…` with fixed codes (`Referrer-Policy: no-referrer`, `no-store`); logs are fixed event codes only (never URLs, states, OpenID fields, or SteamIDs).
- **Cancel** on Steam is recorded (`DENIED`), verified nothing, linked nothing.

### Database (migration #21: `20260920190000_steam_connection_foundation.sql`, additive, applied to TESTING only)

- Registers `steam` in `connection_provider_catalog` and `public_section_catalog` (config rows). No existing row is updated or deleted (the real Discord row is untouched; its new nullable `auth_method` stays NULL — provenance is recorded from Steam onward, not back-filled).
- `gaming_connections.auth_method` (nullable provenance) + a table **CHECK**: a `steam` row must be a 17-digit SteamID64 in range, `trust_status = 'CONNECTED'` (never VERIFIED/MANUAL) and `auth_method = 'STEAM_OPENID_2_0'`. It uses `IS NOT DISTINCT FROM` because a plain `=` lets NULL pass a CHECK — a bug caught while writing the tests.
- `consume_connection_attempt_for(state, expected_provider)` (provider-bound, service_role only) and `complete_steam_connection_attempt(attempt, steam_id)` (service_role only; `CONNECTED` / `RECONNECTED` / `OWNER_HAS_OTHER_ACCOUNT` / `ACCOUNT_ALREADY_LINKED` / `IDENTITY_NOT_FOUND` / `PROVIDER_ERROR`; new rows are private; a same-account re-authentication never flips the visibility switch).
- **Provider isolation of the shared ledger:** the two Discord implementations (`consume_connection_attempt_impl`, `complete_connection_attempt_impl`) are re-declared **identically except for one added guard** so they only accept `discord` attempts (a Steam state can no longer be spent at the Discord callback). A test proves the two differ from their accepted text by exactly that guard. Discord behavior for Discord attempts is unchanged, the Discord Edge Functions were **not redeployed** (still v3), and the accepted Discord live suite passes.
- Steam joined the Phase 1 architecture: `get_my_section_visibility` / `set_my_section_visibility` gained a `steam` branch and `get_public_identity` gained the Steam section (same functions, same 14 columns, same grants — a test proves the rest of each function is unchanged).
- **RLS/privileges:** no table grant added, no policy touched; the new functions are revoked from `public, anon, authenticated` and granted to `service_role` only. `anon` cannot read any connection table; owners read only their own connection (existing policy); another user sees Steam as NOT CONNECTED.

### Uniqueness, disconnect, reconnect

One SteamID64 → one GamID, one GamID → one Steam account (existing unique constraints + the completion function): a second GamID gets `account_in_use`, a different Steam account gets `other_account_connected`; nothing is silently transferred or replaced. Disconnect (generic `disconnect_my_connection('steam')`, behind a deliberate confirmation) deletes only that row — and its visibility switch with it — leaving Discord, League, Intro, publish state, and profile data untouched. A reconnect is a **new** Steam sign-in and starts **OFF**.

### Public visibility (Phase 1 architecture, extended)

"Show on my GamID" for Steam is **OFF by default** and independent of the other sections; the whole-GamID Publish gate stays on top. When ON and published, `public_sections.steam` contains exactly `steam_id` (the SteamID64) and `trust_status` (`CONNECTED`) — nothing else (no ids, timestamps, provenance, ledger, or game data). The owner is told on the card: "Only your SteamID64 is shown." The public page renders it as plain text (`STEAM · <id> · SteamID64 · CONNECTED`; no link, no game claim). Decision to review: exposing the SteamID64 when the owner opts in is deliberate — it is the only identity Steam gives us and the public identifier of a Steam profile; the switch is OFF by default.

### YOUR GAMID

Steam is added to the existing Gaming Connections list (no redesign): `Steam · NOT CONNECTED · Connect Steam`; connected: `CONNECTED`, `SteamID64 …`, the privacy hint, the generic **Show on my GamID** switch (OFF), an honest note ("no games are looked at, and nothing about any game is verified"), and Disconnect behind the same confirmation Discord uses. The SteamID64 wraps (never ellipsized) on narrow screens — a 320 px truncation found in browser testing was fixed with rules scoped to the Steam card. The browser only navigates to a URL that starts with `https://steamcommunity.com/openid/login?` and only reads fixed `result`/`reason` codes from the return URL.

### Validation

- `npm run build`: lint + typecheck (now includes `steam-openid.js`) + **379/379** tests (was 330): `tests/steam-openid.test.js` (31: a fake Steam that really signs and single-use-validates assertions) and `tests/steam-connection.test.js` (18: additive migration, provider isolation, exact-diff guards for the re-declared functions, privileges, UI, public presentation, scope). **Older assertions updated** (none removed or weakened): the connection-UI provider allow-list and official-URL tests now list Steam explicitly; the Phase 1 visibility contract keys its switch by provider; and the "nothing else started" scan no longer forbids the word "steam".
- Live DB `tests/integration/steam-connection-db.sql` — **68/68**, self-rolling-back, also run wrapped with the migration itself **before applying it**. Covers start/hash-only state/expiry, unverified email and anon refusal, client roles cannot consume/complete or write the table, cross-provider state isolation both ways, replay/invalid/expired, bad SteamID64 shapes and ranges, the table CHECK, uniqueness, owner-only read, OFF by default, unpublished + ON ⇒ nothing, published + ON ⇒ exactly `steam_id, trust_status`, ON→OFF→ON without side effects, Discord independence, same-account re-auth preserves the switch, disconnect isolation (Discord row byte-identical), reconnect starts OFF, freed SteamID64 can move only after an explicit disconnect. The earlier live suites still pass against the new schema: Discord connections **47**, discovery **30**, League **54**, section visibility **46** (two of those scripts used `steam` as their example of an *unknown* provider/section and now use `battlenet`; the visibility matrix now expects four registered sections).
- **Mutation testing:** 13 deliberate SQL breakages and 21 JS breakages — all caught except one JS *equivalent mutant* (linking the id from the query instead of the verified value is identical after verification). Two SQL breakages (Discord completion guard removed; range check removed) were caught by the table CHECK aborting the matrix, which is the intended defense in depth.
- **Real Steam probes (no account, no credentials):** a fabricated but locally well-formed assertion sent to Steam's real endpoint returns `ns:…\nis_valid:false`, which the verifier reports as `verification_failed`; Steam accepts our exact sign-in URL and redirects to its normal "Sign In" page, which displays our realm host and no error.
- **Deployed function probes (unauthenticated):** callback with no/unknown/malformed/duplicated state, with a forged assertion, or with a bare SteamID → 302 `invalid_state`; POST → 405; start with no/garbage JWT → 401; the Discord functions answer exactly as before.
- **Browser (real `dist/` code with a scratch mock API, nothing published):** NOT CONNECTED state; Connect navigates to Steam's real sign-in page (credentials not entered); the start call carries only the owner's JWT and `{"provider":"steam"}`; return codes → fixed messages (a smuggled `steamid=` / `openid.*` in the URL is ignored and stripped; Discord return messages unchanged); CONNECTED state; switch ON/OFF; disconnect confirmation + Cancel + confirm; Discord unaffected; 320/375 px and desktop probes; public block ON/OFF.
- Real data after everything: 1 Discord connection untouched (`auth_method` NULL), 0 Steam rows, 0 Steam attempts, League profile intact, `@black` PUBLIC, no leftover disposable users/entities. Anonymous checks: `@black` returns the same 14 columns with no Steam data; every connection/catalog/profile table is 401; the new and owner RPCs are permission-denied.

### Deployment (TESTING only)

Migration applied with `supabase db push` (dry run listed only this migration; linked project `upvtrczefcvigxdyuylw`). `steam-connect-start` v1 (`verify_jwt=true`) and `steam-connect-callback` v1 (`verify_jwt=false`) deployed with `supabase functions deploy … --use-api` (pins in `supabase/config.toml`); Discord v3/v3 and `league-lookup` v2 unchanged. GitHub Pages deploy succeeded and serves the new code. No Production resource was touched.

### Known limitations / for Mazen's review

- The real signed-in Steam sign-in has **not** been performed by me (by instruction). It is Mazen's acceptance step; everything up to Steam's credential page is verified.
- Steam's sign-in page names the requesting site by the **realm host**, which is the Supabase project host (`upvtrczefcvigxdyuylw.supabase.co`), because `return_to` must be under the realm and the callback lives there. A custom domain would fix the wording later.
- No Steam persona name/avatar is shown (that needs the Steam Web API, deliberately not added): the owner sees the SteamID64.
- `response_nonce` is checked for form and freshness but not stored; replay protection comes from the single-use state plus Steam's own single-use assertion.
- The public presentation is the same temporary minimum panel as Phase 1 (no redesign).
- Deferred and unstarted: game-library discovery, Marvel Rivals, any game ownership claim, other providers, the global "Save Changes" visibility UX.

### Manual acceptance (Mazen)

In the real TESTING account: YOUR GAMID → Gaming Connections → Steam should say **NOT CONNECTED** → **Connect Steam** → the official Steam sign-in page (title "Sign In") → sign in / approve on Steam yourself → you return to YOUR GAMID with "Steam connected." → the card shows **CONNECTED**, your SteamID64, **Show on my GamID: OFF**. Check that `/@black` in a private window shows no Steam; switch it ON → it appears; OFF → it disappears; Disconnect Steam (confirmation) → NOT CONNECTED; Discord and League unchanged throughout.

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
| Publish button unresponsive to real taps on real Samsung Android mobile browsers (manual acceptance blocker) | **FIXED** | `.identity-preview::after`'s decorative circle had no `pointer-events:none` and intercepted real hit-testing; prior automated testing used synthetic `.click()`, which bypasses hit-testing and never caught it; see section 7e |
| Public route Intro stage stayed blank via the new `/@handle` redirect on real GitHub Pages (~3 of 4 attempts) | **FIXED** | The iframe could finish loading and broadcast its `ready` message before `public.js`'s deferred module even started executing; only reproducible against a real GitHub Pages 404-redirect hop, not a local static server; see section 7f, checkpoint `08f516087fa61fe54025dc16b3e715d338f73f5e` |
| Public Intro fails intermittently in Opera (real device), recovers temporarily after "Delete Site Data" | **FIXED AND ACCEPTED** (Mazen verified on real Opera without clearing Site Data; accepted checkpoint `706fc58`) | Retry/acknowledged handshake replaces the one-shot ready broadcast (tolerates either execution order, provably bounded); deterministic per-deploy asset versioning prevents an old/new file-version mismatch during GitHub Pages' unavoidable 10-minute `max-age=600` cache window; see section 7g |
| Skip Intro could reveal the raw unconfigured placeholder (`Gamer`/`@handle`/`DRAFT · PRIVATE`) as if it were a loaded profile | **FIXED** | The public route now only reveals the Intro/Profile experience once the child's own state broadcast proves `play()` actually ran with real data, instead of as soon as a config was merely built locally; see section 7g |
| Discord real end-to-end connection | **ACCEPTED** | Mazen completed real Discord OAuth; the real TESTING GamID is CONNECTED (`identify` only at the time); see section 7h |
| Does Discord's `/users/@me/connections` return the Riot Games connection, and with which fields? | **ANSWERED: NO** | Mazen's real authorization returned 0 linked accounts (Riot not returned); Riot cannot be discovered through Discord; see sections 7i and 7j |
| League data source is OP.GG (unofficial, temporary) | **PROTOTYPE / KNOWN RISK** | OP.GG can change its page format, block or lag; only KR was exercised live; results are unverified manual-Riot-ID data, private to the owner; replace with Riot RSO + API before any public/verified use; see section 7j |
| Account page overflows horizontally at ~760–850 px (768 px: shell grid `304px 480px` = 848 px) | **OBSERVED, NOT FIXED (out of scope)** | Pre-existing account-shell layout defect, independent of the League card; found while validating the League card layout fix (section 7j); needs its own small task |
| Discord OAuth has no PKCE | **BY DESIGN / DOCUMENTED** | Not documented by Discord's current OAuth2 docs; compensated by a confidential client, DB-bound one-time hashed state, exact redirect URI, server-side exchange, immediate token revocation; see section 7h |
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

Current exact implementation checkpoint: `37c2699bc1152cfcbd6922600b8c2ba7a1907929` — fix: retry/ack Intro handshake + deterministic asset versioning (Opera reliability), section 7g. Built on top of the `/@handle` redirect race fix `08f516087fa61fe54025dc16b3e715d338f73f5e` (section 7f), the Permanent Public GamID URL + QR + Sharing implementation `b1caefacf4652e090d134e9e50851572e9a088eb` (section 7f), the mobile Publish-button manual-acceptance fix `5f7f380ab08608630ee4e3e59d45181766083f39` (section 7e), Public GamID Profile Slice 2/2 (Public Experience + Intro/Transitions) `ce2018f3ff5b2de0a688d3970d81b0c71d8d5cb7` (section 7d), Slice 1/2 (Foundation + Public-Safe Data) `697b6e3773233d4b403becb63a6857893dbe0ea2` (section 7b), the `check_handle_availability_impl` sign-up permission drift fix `6bad4d583735d1e8c589642911f3decd52d7eff2` (section 7c), the accepted Split Reveal Intro-visibility fix `d7466f99e6f5398c5c0e83c029f1d09715c1321f` (section 7a), and the Slice 3C backend/timer checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43`.

Slice 3C exists. Do not restart it. Its backend E2E succeeded and latest automated validation passed. The Split Reveal transition defect within Slice 3C's Full Preview feature is fixed and manually accepted by Mazen (section 7a), but this does not close Slice 3C as a whole — formal acceptance of the rest of Slice 3C was not given, and Mazen intentionally deferred the remaining manual Slice 3C testing/fixes listed in section 9. Do not automatically continue them.

Public GamID Profile Slice 1/2, Slice 2/2, and the Permanent Public GamID URL + QR + Sharing slice all exist, are implemented, and are deployed to TESTING (sections 7b, 7d, and 7f). **None has been formally accepted by Mazen.** `GAMID_ROADMAP.md` items 2, 3, and 4 (Public GamID Profile, Permanent share link, QR sharing) now have no remaining unstarted implementation. Do not infer authorization to start any adjacent roadmap item (Games/Stats/Connections/Socials, a custom domain, platform-specific share integrations, or any AI/Cinematic Identity concept) from any of these slices' existence or position in the roadmap.

A pre-existing, unrelated bug was found during Slice 1/2 testing (`private.check_handle_availability_impl` missing its live `anon` grant, blocking brand-new user sign-up in TESTING) and has since been fixed under separate authorization — see section 7c.

Two genuine bugs were found and fixed during Slice 2/2's own live E2E testing (a message-listener race condition and a CSS `[hidden]` override) — both fixed within this slice's own authorized scope; see section 7d and the section 10 issue register.

A third bug was found by Mazen during his own manual acceptance testing on a real Samsung Android mobile browser — the Publish button could not be activated by a real tap — and has since been fixed under this exact authorized scope only; see section 7e. It went undetected by every prior automated pass because those passes used a synthetic `.click()` call that bypasses real hit-testing.

A fourth bug was found only after deploying the Permanent Public GamID URL to real GitHub Pages: the new `/@handle` redirect (through `404.html`) made the public Intro stage stay blank on roughly 3 of 4 attempts, because the iframe could finish loading and broadcast its ready signal before `public.js`'s deferred module even began executing — a deeper layer of the same class of bug fixed in section 7d, not reproducible against a local static server. Fixed by mirroring `account.js`'s own existing dual-trigger pattern (also listening for the iframe's native `load` event); see section 7f.

A read-only diagnosis (requested separately, performed with no code changes) investigated a real-device report that the public Intro behaves differently in Opera than Chrome, and identified two concrete, evidence-backed risks without proving a single exclusive root cause: a still-unproven-safe handshake timing race, and GitHub Pages' unavoidable `Cache-Control: max-age=600` allowing a browser to legitimately run an older deployed build for up to 10 minutes. Both were then closed under explicit follow-up authorization: the one-shot `ready` broadcast became a bounded retry-until-acknowledged handshake (tolerating either execution order, provably capped, never duplicating playback), and every cross-document reference between the public/account parents and the shared Intro iframe now carries a deploy-derived, automatically-stamped version query string so a stale-cached parent can never end up paired with a mismatched-version child. A related identity-safety gap found during this work — Skip Intro could reveal the raw unconfigured placeholder as if it were a loaded profile — was fixed by only revealing the experience once the child's own state broadcast proves real data was applied. See section 7g. **This is a mitigation validated on Chromium-based tooling only — Mazen's manual acceptance on his real Opera browser is still outstanding and is the actual final acceptance test for the original report.**

Gaming Connections Engine — Discord foundation (section 7h) exists at implementation checkpoint `08b7d039bd118513a8e3129a7e8a70d527cd2bfd` and was **manually accepted by Mazen** with real Discord OAuth (the real TESTING GamID is connected to Discord). The Opera reliability work was likewise accepted on his real Opera browser. The Discord `connections` discovery test (section 7i) was run for real and **Discord returned 0 linked accounts, so Riot was not returned**; that route is closed and the stored result is preserved. The current slice is the **League of Legends prototype** (section 7j, implementation `44c7a4455f40088572d165a6de453b73491d6500`): the owner types a Riot ID once and GamID resolves private, **unverified** League details through an isolated, temporary OP.GG adapter (lookups only on Add/Refresh, throttled in the database, never public). It is deployed to TESTING and waits for Mazen's manual acceptance. Do not start public League visibility, Riot RSO/API, Steam/other providers, game discovery, Socials, or Cinematic Identity without authorization, and never add any way around OP.GG blocking or rate limiting. The anonymous TESTING root is now a real **landing page** (section 7k, implementation `3cb0cde7f474cbe7efd194623c6c02853c3de365`) whose Create your GamID / Sign in buttons open the existing `/account/` flow; the old NovaRift/Intro-lab prototype was preserved at `prototypes/slice-1-intro-lab/` and is not deployed. Do not put it back at the root or expose any prototype controls publicly. **Public Profile Expansion Phase 1** (section 7l, implementation `2e0c433eb37458e943dbdd1d3f0d259105ba46a7`) added the per-section "Show on my GamID" switches (Discord, League, Education & Work; all OFF by default except grandfathered Education/Work data) and the server-enforced `public_sections` boundary; the Public Profile redesign and the Cinematic Profile Engine are NOT started. Never widen `public_sections` without an explicit switch, never expose the Discord account id/avatar URL, tokens, diagnostics, League source URL/ledger, and never present the League prototype as verified. **Steam Connection Foundation** (section 7m, implementation `48efec8857a2773d3b3f678cfc7a2ec9f7cbc04a`) added Steam OpenID 2.0 as a second connection provider on TESTING: the SteamID64 is the whole identity result (CONNECTED, never VERIFIED), private by default with its own "Show on my GamID" switch; game-library discovery, Marvel Rivals, other providers, and the Public Profile redesign are NOT started. Never trust a browser-supplied SteamID, never call the Steam Web API or GetOwnedGames without new approval, and keep the Discord/Steam ledger provider guards intact.

Do not start the next implementation slice. First inspect the repository read-only, then discuss the roadmap and next priority with Mazen. Proceed only after he explicitly chooses and authorizes the next work.
