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
| Steam Connection Foundation (Steam OpenID 2.0 as a Gaming Connection) | **IMPLEMENTED AND ACCEPTED** (Mazen completed the real Steam OpenID sign-in successfully) | Implementation `48efec8857a2773d3b3f678cfc7a2ec9f7cbc04a`, docs `c46a00d162b58f86ac0a4d172beca56dd95a0cd7`; see section 7m |
| Steam My Games (owner-triggered game discovery via the official Steam Web API; private, discovery only) | **IMPLEMENTED; MIGRATION + EDGE FUNCTION + SITE DEPLOYED TO TESTING; BLOCKED ON THE MANUAL `STEAM_WEB_API_KEY` SETUP; AWAITING MAZEN'S REAL LIBRARY CHECK** | Implementation `aa4aa5e03ecaff15f50d86b03ebb8313a6641b95`; see section 7n |
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
| `intro-sources` | 150 MiB (157,286,400 bytes; was 100 MiB — see section 7r) | MP4, QuickTime, or WebM sources |
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
22. `20260920230000_steam_my_games.sql` (provider-neutral discovered games + discovery state + throttle ledger + recognition map; owner-only reads, service-only writes; section 7n; applied to TESTING only)

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

**IMPLEMENTED AND ACCEPTED** (real Steam OpenID sign-in completed by Mazen). See section 7m.

### Steam My Games

**IMPLEMENTED; deployed to TESTING; blocked on the manual Steam Web API key setup, then awaiting Mazen's real library check.** See section 7n.

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

## 7n. Steam My Games — owner-triggered game discovery through Steam's official Web API

**IMPLEMENTED; MIGRATION, EDGE FUNCTION AND SITE DEPLOYED TO TESTING; BLOCKED ON ONE MANUAL STEP: the Steam Web API key (`STEAM_WEB_API_KEY`) is NOT yet configured, so the real "Load My Games" cannot succeed until Mazen registers a key and sets that secret.** Implementation checkpoint `aa4aa5e03ecaff15f50d86b03ebb8313a6641b95`, built on the Steam Connection Foundation documentation checkpoint `c46a00d162b58f86ac0a4d172beca56dd95a0cd7` (Mazen has since completed the real Steam OpenID flow successfully — the connection is intact and was never touched by this slice).

**Discovery only.** For the already-connected Steam account, an explicit button asks Steam which games that account can share, and GamID stores a normalized list labelled `DISCOVERED_FROM_STEAM`. It proves nothing about any in-game profile, character, UID, rank, or stats. Marvel Rivals (Steam App ID `2767030`) is only *recognized* and shown as "Discovered via Steam". Not started: Marvel API/stats/UID/verification, third-party sources (Tracker, OP.GG, …), the Game ID Wall / Profile Canvas, any Public Profile change, any other provider or game, background/scheduled refresh.

### Official source and requirements (checked against Valve's own pages)

- Endpoint: `GET https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` with `key`, `steamid`, `include_appinfo=true` (name + icon), `include_played_free_games=true` (free games the account has played are excluded by default — this matters for free-to-play titles such as Marvel Rivals) and `format=json`. Nothing is scraped; no other Steam endpoint is used.
- **A Web API key is mandatory**: a live, non-credentialed probe of every host/version answers `401 Unauthorized … verify your key= parameter`. Keys are registered at `https://steamcommunity.com/dev/apikey`. Steam API Terms of Use (`https://steamcommunity.com/dev/apiterms`): keep the key confidential and never share it; 100,000 calls per day; retrieve a user's Steam data only as the user requests it and tell the user what is stored (the UI does; the throttle is far below the limit).
- Valve does not document the private-library response. GamID relies on the documented shape (`response.game_count`, `response.games[]`) and treats the commonly observed empty `response` object as "not shared" — see the state table. Anything unexpected becomes MALFORMED or SERVICE_ERROR, never "no games".

### The API key (server-side only)

Read only inside `supabase/functions/_shared/steam-games.js` from the Edge Function environment (`STEAM_WEB_API_KEY`), validated as 32 hex characters, sent only to `api.steampowered.com`, never returned, logged, stored, or included in an error (tests assert this on success and every failure path; a test also scans the repo so the name appears in exactly one source file and no key literal exists). **A missing or malformed key is a safe "not configured" state** that is detected *before* anything is reserved, so it consumes no throttle. Same secret pattern as Discord (`DISCORD_CLIENT_SECRET`): set outside the repo on the TESTING project.

**Manual setup step for Mazen (I never see the key):** (1) signed in to Steam, open `https://steamcommunity.com/dev/apikey`, enter a domain name (for TESTING use `jeddawe11-eng.github.io`), accept the Steam Web API Terms, register, and copy the 32-character key (Steam may refuse to issue a key for a *limited* Steam account — if it says so, that is Steam's rule, not GamID's); (2) add it as an Edge Function secret on the TESTING project only: Supabase Dashboard → project `upvtrczefcvigxdyuylw` → Edge Functions → Secrets → name `STEAM_WEB_API_KEY`, or in a terminal `supabase secrets set STEAM_WEB_API_KEY=<the key> --project-ref upvtrczefcvigxdyuylw`. No redeploy is needed; give it a minute. Do not paste the key into chat, a file, or a commit.

### Flow and security (`steam-games-refresh`, `verify_jwt = true`)

Order of every refresh: (1) origin/method/config; the body must be **exactly** `{"action":"refresh"}` — a `steamid` or any extra field is refused with 400 before anything happens; (2) a Steam key that is missing/malformed ⇒ `not_configured` (503, nothing reserved); (3) **reserve as the caller** (`reserve_steam_games_refresh()`, no parameters, `auth.uid()`): requires a verified email and the owner's own Steam connection (`NOT_CONNECTED` otherwise) and enforces the throttle; (4) a service_role-only `begin_steam_games_fetch(reservation)` returns the SteamID64 **of that owner's stored, authenticated connection** and snapshots it on the reservation (one use); (5) exactly **one** request to Steam, 15 s timeout, redirects never followed, no retries; (6) a service_role-only `save_steam_games_result(reservation, outcome, games)` — it re-checks that the connection is still the same row *and* the same Steam account. The browser only receives a status word (and a game count). Logs are fixed codes only.

- **Throttle (database, before any Steam request, failures count):** at least 120 s between attempts, 6 per hour, 20 per day per identity, serialized with an advisory lock. The ledger is deliberately not tied to the connection row, so disconnect + reconnect cannot reset it. There is no polling, cron, scheduler, or retry loop anywhere; the only timers are the request timeout and a local UI re-render when the cooldown ends.
- **Prevented:** looking up another user's library, SteamID substitution (body, query string, headers), cross-user reads (owner RPCs derive the identity from the JWT), anonymous access, key exposure, repeated refreshes.

### Privacy / availability states (told apart on purpose)

| Result | Meaning | Stored list |
|---|---|---|
| `AVAILABLE` | Steam returned games | replaced (games no longer returned are removed; `first_seen_at` kept) |
| `EMPTY` | accessible library that genuinely has no games (`game_count: 0` / empty list) | cleared |
| `UNAVAILABLE` | Steam did not share the list (private / hidden "Game details") — **not** "zero games" | **kept** |
| `TEMPORARY_ERROR` | 429 / 5xx / timeout / network | **kept** |
| `SERVICE_ERROR` | Steam rejected our request (bad key, 4xx) — a GamID setup problem | **kept** |
| `MALFORMED` | not the documented shape, contradictory counts, no usable game, > 10,000 games | **kept** |

The UI explains the UNAVAILABLE case in plain words ("this does NOT mean you have no games… Steam → profile → Edit Profile → Privacy Settings → set My profile and Game details to Public… GamID never changes anything in Steam") and keeps showing the last successful list. A failed refresh never destroys the last good list, count, or success time (asserted in SQL, in the fake-backend tests, and by deliberately broken variants). **Watch during acceptance:** if a private library were ever answered with `game_count: 0` it would be recorded as EMPTY and clear the list; it can be restored with a refresh after fixing the privacy setting.

### Free-to-play

`include_played_free_games=true` is always sent, so free games the account has played are included (a test asserts the exact parameter set). A free game that has never been played on the account is not returned by Steam and cannot be discovered.

### Data model (migration #22: `20260920230000_steam_my_games.sql`, additive, TESTING only)

Provider-neutral so the future Games system can consume it: `public.discovered_games` (`connection_id`, `entity_id`, `source_provider`, `external_game_id`, `game_name`, `icon_ref`, `playtime_minutes`, `trust_status`, `first_seen_at`, `last_seen_at`; primary key per connection + app id; **no raw Steam response, no credential, no SteamID column**), `public.game_discovery_state` (last outcome, timestamps, count), `private.game_discovery_attempts` (reservation + throttle ledger), and `public.known_game_sources` (a tiny recognition map holding exactly `steam / 2767030 → marvel_rivals / "Marvel Rivals"`). A table CHECK forces `trust_status = 'DISCOVERED_FROM_' || upper(source_provider)`: nothing here can ever be VERIFIED, Marvel Rivals included. Deleting the Steam connection cascades and removes its discovered games and state (private data of the removed link); a reconnect starts empty. RLS is on for all four tables, no client role has any table privilege, the two owner policies are read-only; the three owner RPCs (`reserve_steam_games_refresh`, `get_my_discovered_games`, `get_my_game_discovery_state`) are authenticated-only and the two backend RPCs (`begin_steam_games_fetch`, `save_steam_games_result`) are service_role-only with an in-function guard. Playtime is stored only if Steam returns it (it may be absent if the owner hides it).

**Untouched:** the public boundary (`get_public_identity` still returns the same 14 columns and no game data — asserted live), section visibility, Discord, League, the Steam OpenID foundation and the real connection (no `disconnect`/`complete`/visibility function is called by this slice; a test asserts only the three approved functions are ever called).

### YOUR GAMID

Inside the Steam card, under the connection: **My Games** with a `PRIVATE` chip, an honest data note ("asks Steam only when you press the button, and saves the game names, IDs and playtime Steam returns"), a status line, a **Load My Games** / **Refresh Games** button (`Asking Steam…` while busy, `Available in …` during the cooldown), and a simple list (icon from Steam's media host with a validated app id + hash, `no-referrer`, letter fallback; name; playtime if returned; "Discovered via Steam"), 50 rows until **Show all N games**. Opening the page only *reads the stored list from the database* — it never contacts Steam. Marvel Rivals, when present in the stored list, gets a "DISCOVERED VIA STEAM" callout that says it "does not verify a Marvel account, UID, rank, or stats"; after a successful discovery without it the panel says it was not found ("a free-to-play game is listed only once it has been played on this account"). Not-configured / cooldown / rate-limit / failure messages are fixed allow-listed texts. All server data is rendered as text.

### Validation

- `npm run build`: lint + typecheck (now includes `steam-games.js`) + **437/437** tests (was 379): `tests/steam-games.test.js` (36: official request shape incl. free-to-play, classification of every outcome, malformed/duplicate/sanitization/oversize handling, the full pipeline against a fake backend mirroring the DB contract and a fake Steam — owner-only, SteamID from the stored connection, substitution refused, cross-user isolation, unauthenticated denied, not-configured consumes no throttle, key never leaked, throttling and caps, no polling, failed refresh preserves the list, Marvel recognized but never verified) and `tests/steam-games-contract.test.js` (22: additive migration, untouched public boundary, RLS/privileges, no raw storage, throttle constants, save-branch structure, secret hygiene, official-host-only, UI rules, scope guards). **Older assertions narrowed** (none removed): three "no game library / no Marvel Rivals anywhere" scope checks now say the official API lives in exactly one backend module and Marvel Rivals appears only as recognition; the Steam card note no longer claims that no games are looked at.
- Live DB `tests/integration/steam-games-db.sql` — **61/61**, self-rolling-back with disposable users and connections only (the real Steam connection is never used), also run wrapped with the migration itself **before applying it**: privileges (tables and functions, anon and authenticated), reserve/begin/save rules (unverified email, NOT_CONNECTED, cooldown, once-only begin, expiry, save-before-begin, swapped account), AVAILABLE/EMPTY/UNAVAILABLE/TEMPORARY/SERVICE/MALFORMED handling with last-good preservation, atomic rejection of bad rows, duplicate collapse, `first_seen_at` survival, owner reads and recognition, cross-user isolation, hourly and daily caps, connection-changed and disconnect isolation, throttle surviving reconnect, and the public boundary (14 columns; Steam section unchanged; no game word anywhere). Every earlier live suite still passes against the new schema: Steam connection **68**, Discord connections **47**, discovery **30**, League **54**, section visibility **46**.
- **Mutation testing:** 20 deliberate SQL breakages — all caught (four needed new matrix steps first: late save, swapped account, empty/oversized AVAILABLE) — and 33 JS breakages — all caught except one *equivalent mutant* (accepting a body `steamid` is unreachable because the body guard already rejects it; the header-based substitution variant is caught).
- **Official API probes (no credentials):** all hosts/versions answer 401 without a key. Deployed function: unauthenticated / forged-token / substituted-SteamID calls → 401 at the gateway; the CORS preflight from the GamID site → 204 with that exact origin; the other functions answer as before.
- **Browser (real `dist/` code, scratch mock API):** load contacts Steam zero times (two database reads); every outcome's wording and tone; last list kept through failures; Marvel callout and "not found"; cooldown and rate-limit messages; 50-row preview and Show all; icon host, `lazy`, `no-referrer`, empty `alt`, letter fallback on error; 320 px layout with a 100+-character unbroken name (no overflow, nothing clipped); disconnect clears the panel and leaves Discord alone.
- Real data after everything: the one real Steam connection intact, 1 Discord connection, 1 League profile, `@black` PUBLIC and unchanged, 0 discovered games, 0 attempts, no leftovers; anonymous SELECT on every new table and the new functions is denied; `@black`'s anonymous response still has 14 columns with no game data.

### Deployment (TESTING only)

Migration applied with `supabase db push` (dry run listed only it; project `upvtrczefcvigxdyuylw`). `steam-games-refresh` v1 (`verify_jwt=true`, pinned in `supabase/config.toml`) deployed with `supabase functions deploy … --use-api`; Discord v3/v3, League v2, Steam OpenID v1/v1 unchanged. GitHub Pages deploy succeeded and serves the new code. No Production resource was touched. **Secret `STEAM_WEB_API_KEY` is not set (manual step above).**

### Known limitations / deferred

- Real acceptance is blocked on the API key (above); until it is set the button answers "Steam game lookup isn't set up yet on this TESTING site." and consumes nothing.
- The private-library response is not officially documented; the classification is conservative, and the real behavior will be observed during acceptance.
- Steam privacy also controls playtime ("Always keep my total playtime private…"): playtime can be absent even when games are listed.
- The recognition map holds one entry (Marvel Rivals). Deferred and unstarted: the generic Games/Game-ID model that would consume `discovered_games`, any Marvel account/UID/rank/stats or verification, public display of games, Game ID Wall / Profile Canvas.

### Manual acceptance (Mazen)

After setting the key: YOUR GAMID → Steam → **My Games** → **Load My Games** → your real games appear (or the explained privacy message) → check whether **Marvel Rivals** appears as "Discovered via Steam". Nothing about the connection, Discord, League, or `@black` changes; there is no public display.

## 7o. Game ID Wall — W0 risk prototype (isolated, throwaway, TESTING only)

Not the Wall product and not W1. A deployable, isolated feasibility prototype for the accepted Game ID Wall architecture (1–3 stacked 9:16 stages of 1000 stage-local units, one continuous public Wall, stage-local foreground/groups/z-order, YouTube + Spotify embeds). It lives in `dist/prototypes/game-id-wall-w0/` (deployed with `dist/`; the repo convention keeps `prototypes/` undeployed and `tests/landing-page.test.js` forbids the workflow mentioning "prototypes"), is noindex, unlinked from the product, has a strict meta CSP and sample content only. **No** Supabase, auth, real profile, Discord/Steam/League data, migration, Edge Function or Production access; state is in memory. The real Intro is untouched (W0 has its own tiny *simulated* Intro overlay). Live: `https://jeddawe11-eng.github.io/gamid-testing/prototypes/game-id-wall-w0/`. Its own `README.md` has the page list and the manual test sequence; `tests/game-id-wall-w0.test.js` covers the deterministic rules and asserts the isolation.

Checkpoints on `main`: `d27743b` (implementation), `f1f43c2` and `9d4884f` (sample-layout fixes found during live verification), then the Samsung-feedback correction recorded below.

### Real Samsung / Android evidence (Mazen, real device, Chrome)

**Tested:** real Samsung Android / Chrome. **NOT tested:** iPhone / iOS (no iPhone available) — iOS is neither PASS nor FAIL and nothing about it may be inferred from Android or emulation.

Working on the Samsung: the 3-stage Wall and Overview (three connected stages); the continuous vertically scrolling Wall; normal dragging/resizing; text selection and handles for normal-sized text; real YouTube and Spotify embeds load; the larger in-page YouTube player opens and its external Close button closes it; Shape A (top-level Wall) and Shape B (Wall inside an outer iframe) both ran — Mazen noticed no meaningful practical difference **on this Samsung only** (not evidence for iOS or other browsers); the viewport comparison page ran and the 360 px composition kept the general Wall composition; the diagnostics overlay is W0-only, not product UI.

**Spotify:** Playlist rendered at 360×352, 260×152 and 200×80; Track rendered at 200×80. At very small sizes the Spotify UI is compressed/cropped even though it technically renders. Finding for W1: Spotify accepting an iframe is not the same as a usable layout — W1 needs a PRODUCT minimum or fixed variants chosen by usable appearance, not by provider tolerance.

**YouTube:** a 200×70 box behaves as the overlay/tile case; 200×200 loads inline but is a visually poor, square/cropped presentation for a normal 16:9 video. Meeting the documented inline minimum must not be confused with a good layout. Default YouTube geometry must keep the video's aspect ratio; a deliberately small Wall tile keeps the approved behaviour (small tile/facade → tap → larger in-page player) instead of stretching or cropping the video to satisfy a technical minimum.

### FINAL W0 RESULTS (Mazen, real Samsung Android / Chrome) — authoritative

| Item | Result |
|---|---|
| 3 stages / continuous vertically scrolling Wall + Overview | **PASS on Samsung** for the W0 purpose (supports the 1–3 stage model for the tested environment) |
| Responsive width (360 px composition kept) | **PASS on Samsung**; the W0 diagnostics overlay is test instrumentation only and must never be treated as product UI |
| Tiny element / edge resize recovery (all four handles reachable when very small and at an edge) | **PASS** (re-tested on the Samsung after the fix; do not redesign, only avoid regression) |
| Group resize (Multi → Group → clear group box + four corner handles, resized as one) | **PASS** (re-tested after the fix; same rule) |
| Shape A vs Shape B hosting | **SAMSUNG OBSERVATION — NO PRACTICAL DIFFERENCE OBSERVED.** Not proof that the two architectures behave identically across other devices/browsers |
| YouTube small tile → larger in-page player; external Close control | Worked; the close control closed and destroyed the larger player |
| iPhone / iOS | **NOT TESTED / DEVICE UNAVAILABLE.** Neither PASS nor FAIL; nothing is inferred from Android or emulation |

**Embed product findings (not W1 work):** Spotify Playlist and Track both technically render even at 200×80, but very small boxes crop/compress Spotify's interface — "technically renders" is NOT "acceptable product size", so arbitrary Spotify dimensions must not be allowed in the final product (W1 needs a product minimum or variants by usable appearance). YouTube at 200×200 becomes INLINE but the square result is visually poor/cropped for normal video — the final Wall must preserve an appropriate video aspect ratio instead of treating every technically valid box as acceptable; a small tile keeps the approved tile → tap → larger in-page player. Future UX must keep player closing obvious and easy without forcing an ugly permanent control area into the user's Wall design.

### Two W0 editor bugs found on the Samsung — fixed in W0 (and re-tested PASS)

1. **Tiny element / stage-edge recovery.** A very small element near a stage boundary could not be enlarged (its four 44 px handle hit areas stacked on each other, and outward growth against the edge is blocked). Fix: selection controls now live in screen space — handles are pushed outward until neighbouring centres are ≥ 56 px apart (`handleOffsets`), a box smaller than 44 px gets a centred 44 px move pad, the selection layer sits outside the stage (never clipped by a containment mode) with more padding around the stage, the resize reference distance starts from where the finger landed, and there are two gesture-free recovery paths (Layers → tap the element → Props → Size Smaller / Bigger / 2x, implemented as `scaleAboutCenterInStage`). Small elements are still allowed (per-type minimums only).
2. **Group resize controls.** Reproduced the likely cause: Multi mode stayed ON after Group, and while Multi is on tapping the already-selected group toggles it OFF, so its handles kept disappearing. Fix: Group and Ungroup now switch Multi off; a selected group has the same four corner handles as a normal element plus a distinct dashed gold selection, a "GROUP - drag a corner to resize" tag and outlined children; a multi-selection says "tap Group to move and resize as one". Group resize is uniform, keeps the children's group-local geometry untouched and Ungroup still bakes the scale into positions/text size exactly.

### Product notes recorded from this test (backlog — NOT authorization to implement)

- **Provider-neutral collapsible game lists.** GamID may discover games from Steam, Discord, PlayStation, Xbox and future providers, and libraries can hold 200–300+ games. The profile/Wall must never expand to show every discovered game automatically. Needed: a bounded initial number, a clear expand/collapse control, handling of very large libraries, and it must NOT be Steam-specific. For the Wall, a game-library live block must be placeable without hundreds of games unexpectedly expanding it.
- **Playtime privacy.** Game playtime/hours is HIDDEN by default in the public profile/Wall; the owner may explicitly turn display ON; independent of whether the game itself is shown. Belongs to the future slice that displays games; not implemented now.

### Separate: real Intro bug (NOT W0, NOT fixed here)

The existing real GamID Intro stretches an uploaded **landscape/horizontal** video: it is distorted and looks poor on mobile and on PC (the video is stretched into geometry that does not match its source aspect ratio). Principle for the follow-up fix: never distort the source aspect ratio — preserve the intrinsic ratio and choose the presentation for landscape/portrait sources deliberately (contain / cover / background treatment, etc.). Logged in the issue register (section 10); the real Intro was deliberately not touched by W0. **Fixed afterwards in section 7p.**

## 7p. Remaining profile fixes — Intro aspect ratio, provider-neutral compact game lists, playtime privacy (TESTING only)

Three separate, small changes to the existing TESTING product (no W1, no Wall, no change to the public-safe boundary, Discord, League, Steam OpenID, the Intro engine/transitions or the media pipeline; `@black` and the real Discord/Steam connections untouched).

### 1. Intro video is never stretched (aspect-ratio-safe presentation)

**Root cause (determined before changing anything).** The stretch is a *presentation* matter, not the derivative: (a) the worker's ffmpeg command has no `-vf`/scale/pad/crop/aspect option, so the derivative keeps the source's dimensions and shape (asserted by a test); (b) no stylesheet uses `object-fit:fill` or a non-uniform scale on the video. What the user saw: the Intro page drew the video with `object-fit: cover` in every portrait viewport, so a landscape 16:9 clip on a phone was scaled ~3.8× and cropped to its middle ~27% — a huge, blurry zoom that looks "stretched" — and only landscape *windows* used `contain`. Reproduced in the browser with generated test-pattern videos (a round circle stays round but only its middle is visible). I could not reproduce a true anisotropic (x≠y) stretch anywhere in the code; the real uploaded file (private) was not inspected, so a non-square-pixel source cannot be excluded — the pipeline does not create one.

**Behavior now — portrait sources only after section 7q; landscape/square sources now use a sharp foreground + ambient glow instead** (`dist/video-fit.js`, pure and unit-tested; applied by `dist/account/intro-preview.js`, which is the page used by BOTH the owner's preview dialog and the public route): the video is only ever drawn with `cover` or `contain` — X and Y always scale by the same factor. Choice: `visible = min(videoAspect/stageAspect, stageAspect/videoAspect)`; **cover when at least 70 % of the picture survives** (a portrait clip on a phone, a 16:9 clip in a 16:9 window: fills the screen, small crop at most), **otherwise contain** (a landscape clip on a portrait phone, a portrait/square clip on a desktop window: the whole picture with dark bars). Unknown dimensions resolve to contain. The decision uses the stage's layout size (unaffected by the Shrink transform), is taken on `loadedmetadata` and on resize, and the live Split Reveal clips inherit the same fit (with the poster hidden in the bars). The transition engine and its five presets are unchanged.

**Verified (browser, generated 16:9 / 9:16 / 1:1 videos):** landscape on a 375×812 phone → contain, whole frame visible, circle round; portrait on the phone → cover; landscape on 1280×720 → cover (exact fit, nothing lost); portrait on 1280×720 → contain; square → contain; all five transitions (fade, blur, shrink, slide, split) completed on the phone for both orientations, Skip and Replay worked. Not verified: the real public route → profile handoff with a real Supabase identity (its handshake code and tests are unchanged and pass; the real-device check is Mazen's).

### 2. Provider-neutral compact game list

`dist/account/game-list.js` (no provider name inside) owns one behavior for every provider: **collapsed by default** — only the first **8** games are rendered (the rest are not created as DOM nodes), the **total count** is always shown ("243 games"), and a full-width **chevron** button ("Show all 243 games · 235 more" / "Show fewer games", 44 px high, `aria-expanded` / `aria-controls`) expands and collapses the same list. Lists of 8 or fewer show no control. The expanded state is remembered per provider in the editor (`gameListExpanded`, starts empty) and Steam's My Games panel now uses it (replacing the old Steam-only "50 rows / Show all" behavior). Every row still says where it came from ("Discovered via Steam"); provenance/trust labels are unchanged, and no provider data was invented. A future provider only supplies its games and a row renderer. Styles are provider-neutral (`.game-library*`). The stored list is still read from the database only; nothing contacts Steam.

### 3. Playtime privacy (owner-controlled, OFF by default, provider-neutral)

**Today the public GamID carries no game data and no playtime at all** (`get_public_identity` is unchanged: same 14 columns; discovered games have no public function). This change adds the owner's switch and the single server-side gate any future public game presenter must use, without creating any public game display:

- Migration #23 `20260921000000_game_playtime_visibility.sql` (additive; applied to TESTING only): `profiles.show_game_playtime boolean not null default false` (no backfill, so no existing or future identity — and no provider connection — can turn it on by itself); owner RPCs `get_my_game_display_settings()` and `set_my_game_playtime_visibility(boolean)` (authenticated only, identity from `auth.uid()`, change that one flag only); and `private.public_game_playtime_allowed(entity_id)` — true only when the switch is ON **and** the GamID is published, granted to no client role. The migration names no provider.
- YOUR GAMID: when a game-supplying provider is connected (currently Steam; `GAME_PROVIDERS` is the one place to extend) a **GAME DISPLAY** block shows "Show playtime on my GamID" — **OFF** ("Hidden. Hours played are never shown on your public GamID…"); ON says hours may be shown publicly only where a game is shown and its provider supplied them, and that nothing is public until publishing. It also says honestly that no game list is public yet. The owner always sees their own playtime privately. It is independent of showing any game.
- When ON in the future, presentation may show playtime only where the data exists; when OFF the presenter must omit it entirely (the gate returns false).

### Validation

- `npm run build`: lint + typecheck (adds `game-list.js`, `video-fit.js`) + **506/506** tests (was 475): `tests/intro-video-fit.test.js` (12: never-stretch invariants across phones/desktops/sources, the old failure quantified, safe fallback, worker has no resize, no stylesheet stretches, engine/presets unchanged), `tests/game-list.test.js` (9: bounded preview for 9…10000 games, count, expand/collapse, DOM structure with a fake element, provider-neutral module, editor wiring), `tests/game-playtime-visibility.test.js` (10: additive migration, default false/no backfill, provider-neutral, owner-only grants, gate needs ON + published, public boundary untouched, client/UI rules, never auto-ON). Older assertions narrowed (none removed): the Steam "50 rows" check now asserts the provider-neutral list.
- Live DB `tests/integration/game-playtime-visibility-db.sql` — **15/15**, self-rolling-back with disposable users only; run wrapped with the migration BEFORE applying it, and again after. **6 SQL mutants** (default true, gate ignoring publish, gate ignoring the flag, gate granted to clients, null accepted, anon granted) — all caught. Every earlier live suite still passes against the new schema: section visibility 46, Steam My Games 61, Steam connection 68, Discord connections 47, discovery 30, League 54. Real data: no profile has playtime ON; `@black` and the connections untouched.

### Deployment (TESTING only)

Migration applied with `supabase db push` (dry run listed only it; project `upvtrczefcvigxdyuylw`). Static files deployed by GitHub Pages. No Edge Function, no secret and no Production resource touched. `STEAM_WEB_API_KEY` is still not set (Steam My Games cannot be fully real-data accepted until that manual step).

### Backlog notes preserved (not implemented here)

- Current mobile optional-card / Bio overlap visual bug remains known unless already fixed elsewhere.
- SteamID64 is a backend/internal technical identifier and should not be the normal public-facing Steam identity (the accepted Phase-1 public section still shows it as text when the owner turns Steam ON).
- New connected game/platform visibility stays private / OFF by default unless the owner explicitly enables it.
- Existing real Discord and Steam connections must never be disconnected for testing; never delete/reset/recreate `@black`; never expose private provider data merely to render the Wall.

### Manual acceptance (Mazen)

1. Intro: on the Samsung open YOUR GAMID → Preview Intro (and the public route) with a **landscape** video — the whole picture should be visible with dark bars, not zoomed/cropped; with a **portrait** video it should fill the screen; on PC a landscape clip fills the window, a portrait clip is centered with bars. Check Skip, Replay and the transition into the profile.
2. Games (needs Steam connected and Load My Games once the API key exists): the list shows 8 games, the total count and a chevron; Expand shows all, Collapse returns.
3. YOUR GAMID → GAME DISPLAY (shown once Steam is connected): "Show playtime on my GamID" is OFF by default; switching it changes only that flag.

## 7q. Landscape Intro presentation — sharp foreground + ambient glow (TESTING only)

**Mazen's real-device results after the 7p aspect-ratio fix:** Samsung Android — aspect ratio **PASS** (no stretch/zoom; the landscape video is shown fully with dark empty space above/below). Windows PC — aspect ratio/geometry **PASS**, but the visual quality of a landscape video filling a large desktop viewport is poor/blurry, so **desktop landscape visual quality was NOT accepted**. This slice changes only the *presentation*; the D2/D3 media policy, Cloud Run and FFmpeg were not touched.

### Evidence gathered first (read-only technical metadata of the real active Intro job; no media downloaded, no paths/ids read)

| Item | Finding |
|---|---|
| Master / source | `video/mp4`, 16,663,908 B, 29.533 s (≈ 4.5 Mbps). **The Master no longer exists** (`source_deleted_at` set by the normal cleanup); its dimensions equal the derivative's, because the worker refuses any derivative whose width/height differ from the source |
| Active derivative (D3) | VP9/WebM **1920×1080, 30 fps**, 4,117,925 B, 29.54 s, total ≈ **1.115 Mbps** including Opus audio (the video-only field is recorded as 0 for WebM; ≈ 1.08 Mbps, i.e. ≈ **0.017 bits per pixel** — a very low bit density) |
| What the browser plays | The **D3 derivative** (a blob of the private `intro-media` object). The Master is never served; the only exception is the owner previewing a just-picked, not-yet-saved local file, which plays that local file |
| Upscale factor (device px per source px) | Public/preview page at 7dca99f (`cover` when ≥ 70 % of the picture survives): 1366×657 → ×0.71; 1920×950 @100 % → **×1.00** (and 12 % of the height cropped); 1536×730 @125 % → ×1.00; 2560×1300 → **×1.33**; 1920×950 on a 4K monitor @200 % → **×2.00**; 3840×1900 @100 % → **×2.00**; Samsung 412×892 → ×0.56 (downscale) |

**Root cause of the poor PC quality:** *primarily the derivative's compression*, not the source resolution (1080p is not low) and not scaling alone: D3 keeps only ≈ 25 % of the Master's bitrate (VP9 `-crf 40`), so softness/blocking is visible whenever the picture is large; on a 1080p monitor at 100 % the picture was displayed 1:1 (so scaling was not the cause there), while on 1440p/4K/high-DPI screens presentation scaling (×1.33 – ×2.00 plus the `cover` crop I introduced in 7p for near-16:9 windows) amplified it. I could not measure Mazen's exact viewport/DPR or an objective quality score (the Master is gone and the derivative is private). **No media-processing change was made.** If Mazen still finds a landscape 1080p clip too soft after this presentation fix, the evidence supports testing a Landscape/1080p-specific quality setting (e.g. a lower CRF; the derivative is 4.1 MB against a 15 MiB ceiling), but per the video policy that needs representative sources, objective measurements, a cost analysis and explicit approval **before** any Cloud Run/FFmpeg change — it was deliberately not started.

### Behavior now (`dist/video-fit.js` pure policy, `dist/account/intro-preview.{html,js,css}`; owner preview and public route share it)

- **Landscape and square sources** (width ≥ height): the real video is always the sharp, centered, aspect-correct **foreground** drawn with `contain` (never cropped, X/Y always the same scale) and **never enlarged past 1.5 device pixels per source pixel** (`MAX_UPSCALE`, the cap divides by `devicePixelRatio`). A 1080p clip: 1920×950 monitor → 1689×950 (×0.88); 4K-size window → 2880×1620 (×1.5, capped); 4K monitor @200 % → 1440×810 CSS px (×1.5, capped); phone → full width (downscale). Everything left over is the ambient layer.
- **Ambient / Ambilight glow** (presentation only; nothing baked into any file): a **32 px-wide `<canvas>` copy of the current frame of the SAME `<video>`** (`drawImage`, high-quality downscale, a slight saturation lift and a dark wash), scaled uniformly past the stage and smoothed by the browser, plus a dark radial vignette; the foreground video stays clearly dominant and no second image is readable. No second video element, no second download, no second decoder, no pixel reads, no color analysis, **no CSS blur filter on video** (the softness comes from scaling a 32 px canvas). It is driven by `requestVideoFrameCallback` (presented frames only; `requestAnimationFrame` fallback while playing), draws at most about 11 times a second (**once every 2 s under reduced motion**), and stops when the Intro layer is hidden, skipped or finished. Measured on the desktop machine: ≈ 0.03 ms per draw, ≈ 0.3 ms of main-thread time per second.
- **Portrait sources: unchanged** (cover when ≥ 70 % of the picture survives, otherwise contain; no ambient, no size cap). The transition engine, its five presets, the handshake and Replay/Skip logic are unchanged. **Split Reveal**: the two live clips are sized and positioned to the same foreground box (left clip `left: 100% − fg/2`, right clip `left: −fg/2`), the poster is not used, and the ambient fades out with the panels. Shrink/fade/blur/slide carry the ambient along with the stage.

### Validation

- `npm run build`: lint + typecheck + **515/515** tests (was 506): +9 in `tests/intro-video-fit.test.js` (wide vs portrait policy incl. portrait identical to before, aspect/no-crop invariants across 9 viewports × 5 sources, the upscale cap and the real 1080p cases, low-res sources stay usable, invalid input, ambient size/coverage, page implementation constraints — one video element, no pixel reads, frame-callback driven, reduced motion, wide-only CSS, no blur filter, split alignment — and the untouched D3 command). **10 mutants** (cap removed, cover for wide, DPR ignored, ambient off, portrait treated as wide, non-uniform ambient, CSS blur, `object-fit: fill`, pixel read, no reduced-motion throttle) — all caught.
- Browser (real `dist/` code, generated 1920×1080 / 720×720 / 540×960 / 640×360 videos): landscape on a 375×812 phone → 375×211 sharp foreground centered with a blurred green/orange glow above and below; on 1920×950 → 1689×950 foreground with glow at the sides; on a 3840×1900 window → 2880×1620 capped foreground with glow; portrait → cover, no ambient; all five transitions completed for landscape, square and portrait, the split clips aligned to the foreground box, Skip worked, Replay switched correctly between portrait and landscape. Not verified: real devices (Mazen), the public route → profile handoff against a real identity (its code is unchanged and its tests pass).

### Manual acceptance (Mazen)

Samsung and PC: open a **landscape** Intro (Preview Intro and the public route). The video should be sharp, centered and fully visible with a soft dark glow in its colours filling the rest (no plain black bars, no visible second image), and on a large or high-DPI PC screen it should be a little smaller than the screen instead of blown up. Check each transition (especially Split Reveal), Skip and Replay, and that a **portrait** Intro looks exactly as before.

## 7r. Intro source upload limit raised from 100 MiB to 150 MiB (TESTING only)

One narrow change requested by Mazen: the maximum accepted Intro **source** upload is now **150 MiB = 157,286,400 bytes** (was 100 MiB = 104,857,600 bytes). **Unit convention (unchanged):** limits are counted in 1024×1024-byte units (MiB) and shown to people as "MB", exactly as before and like the 5 MB avatar limit; nothing was silently switched to decimal MB. The Intro **duration limit (0.5–30 s), the allowed source types, the derivative ceiling (15 MiB), D2/D3 policy, FFmpeg settings, Cloud Run configuration, the landscape/ambient presentation and Portrait behavior are all unchanged.**

| Enforcement point | Change |
|---|---|
| Storage bucket `intro-sources` `file_size_limit` (server; Storage rejects a larger object) | 104857600 → **157286400** (new migration #24) |
| RPC `private.queue_my_intro_impl` (server; refuses to queue a larger source, `INTRO_SOURCE_TOO_LARGE`) | re-declared identically except the constant (test proves the body differs only there); grants/security definer/search_path preserved |
| Table CHECK `intro_processing_jobs_source_size_bytes_check` (server; last-line limit on any write path) | `<= 157286400` |
| Worker guard `MAX_SOURCE_BYTES` in `worker/intro-worker.mjs` (`SOURCE_TOO_LARGE`) | 150 MiB in the repository |
| Browser validation `INTRO_SOURCE_MAX_BYTES` (`dist/account/domain.js`, used by `validateIntroSource`) and the second guard before the resumable upload (`uploadIntroSource` in `supabase-client.js`, now importing the same constant) | 150 MiB; message "Intro video must be 150 MB or smaller." |
| UI help text (`index.html`) | "MP4, MOV, or WebM · max 150 MB" |
| TUS/resumable upload (`resumable-upload.js`) | no size constant of its own (chunk size only); nothing to change |
| Docs | section 4 bucket table, section 11 policy, `worker/README.md`, `worker/cloud-run/README.md` |

The historical migration `20260916170000_slice_3c_intro_identity.sql` is untouched (history is never rewritten); migration `20260921100000_intro_source_limit_150mib.sql` is additive and applied to TESTING only. Existing job rows are unchanged.

**Two things the repository change cannot do by itself (report to Mazen):**
1. **The deployed Cloud Run worker still runs image `slice-3c-testing-2`, which contains the OLD 100 MiB guard.** Until that image is rebuilt and the Job/Dispatcher are updated (Google Cloud, needs Mazen's authorization — no `gcloud`/Docker access from here and the task said not to change Cloud Run), a source between 100 MiB and 150 MiB passes the browser, Storage, RPC and table but the worker will mark the job failed with `SOURCE_TOO_LARGE`. No behavior other than this constant changes when the image is rebuilt (2 GiB memory is still ample headroom for a 150 MiB source).
2. **Supabase's project-level Storage upload limit is separate from the bucket limit and could not be read with the available tools.** If the project's global limit (Supabase's Free plan caps it at 50 MB) is lower than the bucket limit, Storage rejects the upload regardless of the bucket setting. This was equally true of the old 100 MiB bucket limit and no >50 MB upload is recorded in this project's history; a real >100 MB upload has not been tested.

**Validation:** `tests/intro-source-limit.test.js` (10) — exact byte boundaries in the browser validation, the second guard, help/error text, duration unchanged in browser/RPC/table/worker, the additive migration, the RPC body differing only in the constant, the worker guard with every D3 setting intact, no remaining old-number enforcement, no unrelated change. Live DB `tests/integration/intro-source-limit-db.sql` — **16/16** (+ summary), self-rolling-back with a disposable user, no job/object created; run wrapped with the migration before applying and again after; **8 SQL mutants** (old bucket limit, old RPC limit, off-by-one, unbounded, old CHECK, CHECK too high, duration changed, derivative bucket touched) all caught. Earlier live suites still pass. The old assertion `size:101 * 1024 * 1024` in `tests/slice-3c-intro-identity.test.js` was narrowed to `151 * 1024 * 1024` (its meaning — a too-large source is refused — is unchanged).

## 7s. Provider-neutral expandable Game Profiles in My Games — foundation (TESTING only)

Approved product rule: My Games supports games discovered from ANY current or future provider, stays compact for 200–300+ games, and a game may optionally carry a small expandable **Game Profile** (Rank / Win Rate / Matches / Main Hero and whatever another game supplies). This slice builds only the **foundation and UI**. It does **not** integrate any stats provider and creates **no** Game Profile data.

**Not done, on purpose (state at this checkpoint):** the MarvelRivalsAPI.com Marvel adapter is **NOT integrated** — the external service was returning Cloudflare 502 / host errors and, per the investigation, is unofficial and unsanctioned by NetEase/Marvel; **Tracker.gg was NOT scraped** and nothing may scrape it; **no API key was created or requested**; **no fake or seeded Marvel data exists anywhere** (a test asserts the product code names no Marvel stats provider, no UID and no player). Marvel Rivals stays exactly what the real Steam discovery showed: a compact row "Marvel Rivals · Discovered via Steam" **with no arrow**, until a real adapter legitimately attaches a profile.

### The model — five separate concepts
| Concept | Where it lives | Notes |
|---|---|---|
| **1. Discovered game** | `public.discovered_games` (unchanged) | "this connected account can access game X", provenance `DISCOVERED_FROM_<PROVIDER>`. Never read by the profile layer. |
| **2. Game identity** | `game_profiles.identity_source` + `identity_ref` | the in-game identity the profile is about (e.g. `MANUAL_UID` + a UID, `MANUAL_RIOT_ID`). |
| **3. Stats provider** | `game_profiles.data_source` + `data_source_class` (`OFFICIAL` / `THIRD_PARTY` / `UNOFFICIAL_TEMPORARY`) | where the numbers came from and how far that source is trusted. |
| **4. Normalized profile** | `game_profiles.fields` | a validated, bounded array (max 12) of `{key, label, value, kind}` (`kind` ∈ text/number/percent/rank). No game-specific columns; one migration serves every future game. |
| **5. Ownership / trust** | `trust_status` `VERIFIED` / `CONNECTED` / `MANUAL` + `verification_basis` | the same vocabulary as `league_profiles`. Table CHECKs: MANUAL carries no basis; CONNECTED needs a basis and a non-temporary source; VERIFIED needs an `OFFICIAL` source and a basis; a temporary/unofficial source can never exceed MANUAL. |

**Attachment.** A profile belongs to `(entity_id, game_key)` (unique constraint `game_profiles_one_per_game`), where `game_key` is the **normalized game** — the same key `known_game_sources` already gives a recognized discovered game (`recognized_game_key`). A discovery row shows the affordance only when a valid profile with that game key exists; discovery never creates, upgrades or verifies a profile (the migration reads no discovery table). **Multiple discovery providers:** the same game discovered through Steam, Discord, PlayStation or Xbox resolves to the ONE profile (the schema has no discovery-provider column, so duplicates cannot be forced); each discovery row keeps its own "Discovered via …" provenance. Provider merging of the list itself is not built.

**Backend.** Migration #25 `20260921200000_game_profiles.sql` (additive; applied to TESTING only): `private.game_profile_fields_valid` (rejects >12 fields, bad/duplicate keys, extra properties, nested values, over-long text, and **any key naming playtime/hours** so the existing "Show playtime on my GamID" switch cannot be bypassed), table `public.game_profiles` (RLS on, **no table grant to any client role**, owner read policy), `public.get_my_game_profiles()` (authenticated only, identity from `auth.uid()`, a database read — never contacts any provider), `public.save_game_profile(...)` (**service_role only**, the slot a future adapter will use; validates through the table constraints, never changes `is_public`, does not look at discovery), and `private.public_game_profiles(entity)` (an ungranted gate for a future public presenter: only `is_public` rows of a published identity, never the identity reference or the verification details). **Private by default:** `is_public` defaults false and nothing in the product can set it. The accepted public boundary (`get_public_identity` / `_by_qr`) is untouched (still exactly 14 columns; asserted live), and the public page renders no Game Profile.

**UI (mobile first).** `dist/account/game-profile.js` (provider-neutral, no provider named): `normalizeGameProfile` fails safe (malformed → no arrow; trust can only be lowered, never raised), `attachGameProfile` adds a **44 px "PROFILE ⌄" button** on the row's right and a collapsed inline panel. Rows without a profile keep the plain compact layout (icon + name + "Discovered via …", no arrow). Tapping expands / collapses **in place** (no re-render: no scroll jump, the Show all / Show fewer control and the bounded 8-row preview are unaffected); **every game toggles independently, nothing starts open, several can be open**; the open state survives Show all / Show fewer. The panel shows UNVERIFIED/CONNECTED/VERIFIED and the stats-source chips, the fields as text, the identity, "Updated <date>" and an honest note that Game Profiles are **private to the owner** (no public game display exists). `dist/account/account.js` loads profiles with the stored games (`getMyGameProfiles`, one owner RPC; **no external request on load or render**). Playtime privacy is unchanged.

**League / OP.GG.** The accepted League implementation is **untouched** (its tables, trust labels, throttle and UI). `dist/account/game-profile-league-compat.js` (the one isolated module that knows OP.GG besides the accepted adapter and UI label) shapes the owner's existing League row as a normalized profile (game key `league_of_legends`, source `OPGG_TEMPORARY` / `UNOFFICIAL_TEMPORARY`, trust `MANUAL` carried over unchanged, fields Rank / LP / Matches / Win rate) to prove the generic model can represent a real stats integration and to document the migration path (a future slice would write it through `save_game_profile`); it renders nothing today. League is not a discovered game, so it cannot attach to a My Games row yet.

**Validation.** `npm run build`: lint + typecheck (adds both modules) + **557/557** tests (was 525): `tests/game-profile.test.js` (21: model, malformed data, trust only lowered, discovery alone cannot verify, MANUAL/UNVERIFIED representable, discovery vs stats provider distinct, no affordance without a profile / affordance with one / expand / collapse / independent per game / restored state, large-library bounded list unaffected, multiple providers → one profile, no network at render, League shape, touch CSS, playtime privacy) and `tests/game-profile-contract.test.js` (11: additive migration, five separate concepts, DB trust rules, private by default, owner scoping and grants, bounded payload, public boundary untouched, one read RPC and no browser write, scope guards: no Marvel provider/Tracker/keys/fake data). One older guard narrowed (none removed): the "OP.GG only in the League adapter + UI label" allow-list also names the isolated compat module. Live DB `tests/integration/game-profiles-db.sql` — **31/31** (self-rolling-back, disposable users, run wrapped with the migration before applying and again after): empty table, RLS, privileges (authenticated and anon denied everywhere), backend save + owner read, isolation, discovery independence, every trust rule, every payload rule, one-per-game upsert that never changes `is_public`, the public gate (private / unpublished / published), the 14-column public boundary, playtime privacy, table checks even for a direct owner-level insert. **15 SQL mutants** and **17 JS mutants** — all caught (four SQL mutants first survived because the test used an invalid one-letter source token; the test was fixed and they are now caught). Every earlier live suite still passes (section visibility 46, Steam My Games 61, Steam connection 68, Discord connections 47, discovery 30, League 54, playtime 15, Intro source limit 16). Real data after everything: **0 Game Profiles**, 82 discovered games and the 4 connections, 2 League profiles and `@black` unchanged.

**Deployment (TESTING only).** Migration applied with `supabase db push` (dry run listed only it); Pages serves the new modules and CSS. No Edge Function, secret, Cloud Run or Production resource touched.

**Manual acceptance (Mazen).** Real data cannot show the affordance yet (no real profile exists, on purpose). Check: (1) YOUR GAMID → Steam → My Games → the list is unchanged — 8 games, "N games", Show all / Show fewer, private playtime, **Marvel Rivals and Dota 2 are plain compact rows with NO arrow**; (2) YOUR GAMID → GAME DISPLAY still says playtime is hidden (OFF); (3) nothing in the page looks different or worse on a 360–412 px phone. The expandable component itself is covered by automated tests and a browser check on neutral sample data; it awaits the Marvel adapter (or a real League-to-Game-Profile migration) to appear on real data.

**Remaining blockers.** The Marvel adapter waits for a reachable, permitted stats provider (MarvelRivalsAPI.com is unofficial, unsanctioned by NetEase, needed an API key Mazen must create himself, and was down), plus the terms/rate-limit/tier confirmation from the investigation. Manual UIDs stay MANUAL / UNVERIFIED; no supported way to prove Marvel UID ownership exists.

## 7t. Canonical Game Catalog + manual game add + multi-platform selection (TESTING only)

Approved product rule: GamID has ONE canonical Game Catalog. The same real-world game resolves to the same canonical game however it entered GamID — discovered through a provider or added by the user — and discovery provenance, platform ownership/play context and canonical identity are three separate things. A user can tap **+ Add Game** in My Games, type at least 3 characters, pick the game, tick one or several platforms, and save; the game appears in the **existing** My Games library (there is no second manual library).

**Not done, on purpose:** no Xbox / PlayStation / Riot / Discord game integration, no Marvel stats or API, no Game ID Wall W1, no fake catalog, game or stats data, and no change to Intro, Publish status, League, Steam connection, Game Profiles or the public boundary. **Production was never accessed.**

### Canonical model (migration #26 `20260921210000_game_catalog_manual_games.sql`, additive, applied to TESTING only)
| Table | Purpose |
|---|---|
| `game_platforms` | normalized platform reference data: `pc`, `steam`, `epic_games`, `ps4`, `ps5`, `xbox_one`, `xbox_series`, `switch`, `switch2`, `ios`, `android`. **PC is not Steam:** `steam` and `epic_games` are storefronts with `parent_platform_key = 'pc'`. `provider_key` names the connection provider whose discovery can establish a platform (`steam` → Steam) — DATA, not code. |
| `game_catalog` | the canonical game: `game_key` (the SAME normalized key `known_game_sources` and `game_profiles` already use: `^[a-z][a-z0-9_]{1,63}$`), `display_name`, `normalized_name`, compact `search_key`, `popularity`, optional `artwork_ref` (unpopulated: no safely licensed artwork source), `is_active`, `catalog_source`. **No provider identifier is a column of the canonical game.** |
| `game_catalog_aliases` | alternative titles, searched together with the name |
| `game_catalog_platforms` | the platforms the catalog RELIABLY lists for a game. Missing data = "not offered", never "assumed". |
| `game_catalog_provider_ids` | provider identifiers (`steam` App ID, `igdb` slug, `epic_games` id, `wikidata` QID; later an Xbox title, a PlayStation product, a Riot id …). Attributes of a canonical game: `primary key (provider, external_id)` — one identifier names exactly one game, many identifiers can name the same game. A Steam App ID is **never** the GamID game id. |
| `entity_game_platforms` | the owner's OWN platform declarations: `(entity_id, game_key, platform_key)` with **`trust_status = 'MANUAL'` enforced by a table CHECK** (never VERIFIED / CONNECTED / "discovered via"), a composite foreign key so the database only accepts a platform the catalog lists for that game, cascade with the identity. Provider discovery is NOT stored here: it stays in `discovered_games`, which no manual function can write. |

RLS is enabled on all six tables and **no client role (authenticated or anon) has any table privilege** — the catalog is not client-writable at all and is never downloaded. All access is through owner-scoped, definer-implemented functions behind the established invoker-wrapper pattern:
`search_game_catalog(query, limit)`, `get_my_game_platform_state(game_key)` (supported / provider-established / manual for the caller), `get_my_manual_games()`, `save_my_manual_game(game_key, platform_keys[])`, `remove_my_manual_game(game_key)` (all `authenticated` only; identity from `auth.uid()`; **no identity parameter**; email verification required to write). `private.import_game_catalog_batch(jsonb)` is granted to **no** role (not even `service_role`); it is run only by the project owner's database session.

### Search
- **Server-side, bounded and indexed:** trigram GIN indexes on the compact name and alias keys; at most **12** rows (the UI asks for 10); the server itself refuses fewer than **3 meaningful characters** (spaces/punctuation do not count) and queries over 80 characters. The full catalog is never sent to the browser.
- **Matching:** lower-case, apostrophes dropped (`Marvel's` → `marvels`), other punctuation/whitespace ignored (`spiderman` finds `Spider-Man`), user-typed `%` / `_` never act as wildcards (the pattern is built from the normalized text). Aliases are searched and the matching alias is returned. **No typo tolerance:** fuzzy matching cannot be made precise enough not to suggest the wrong game, so it was deliberately not added.
- **Ranking:** exact name → name prefix / exact alias → alias prefix / word start → substring; ties by popularity (Wikidata sitelink count), then name.
- **Client (`dist/account/game-search.js`):** nothing is requested below 3 meaningful characters, typing is **debounced (300 ms, one request per pause)**, an answer that arrives after newer input is discarded, identical queries are served from a 40-entry cache, results are sanitized (canonical key shape + text only) and capped at 10. Rendering My Games makes **no** catalog request; only typing in the open Add Game panel searches.

### Manual provenance, merge and edit rules
- A manual game is **MANUAL / user-declared**: labelled "Added by you (manual, not verified)". It is never VERIFIED, CONNECTED or "Discovered via …".
- **No duplicates.** A discovered Steam game is resolved to its canonical key by the accepted recognition map first, then by the catalog's provider identifiers (`get_my_discovered_games_impl` gained that fallback only; same signature, ordering and columns). A manual declaration for the same canonical game **merges into the discovered row**: the row keeps "… · Discovered via Steam" and gains a separate line "Also added by you: PlayStation 5 · Xbox Series X|S". Manual-only games are listed first so a short deliberate list is not buried under a long provider library.
- **Provider provenance is protected.** A platform a provider already established (Steam) is shown **locked** in the editor ("Discovered through your connected account — managed there, not here") and the server refuses to re-declare it (`PLATFORM_ALREADY_DISCOVERED`). The editor can only change manual platforms.
- **Edit:** the row's **Edit** button reopens the platform picker with the declared platforms ticked; saving a smaller set removes the un-ticked manual platforms. Saving with none is refused (removal is its own confirmed action).
- **Remove:** a manual-only game is removed with an inline confirmation ("Remove from My Games"). On a game a provider also discovered, the action is "Remove what I added" and only the manual declarations are deleted — the discovered game stays exactly as it was (asserted live: same provenance, first-seen and playtime).
- **Limits and validation:** at most 300 manual games per identity (editing an existing one still works at the limit); the backend validates the canonical `game_key` and every platform key against the catalog (a display name is never accepted as identity). Errors: `INVALID_GAME`, `NO_PLATFORMS`, `INVALID_PLATFORM`, `PLATFORM_ALREADY_DISCOVERED`, `GAME_LIMIT_REACHED`, `EMAIL_NOT_VERIFIED`.

### Where it lives in the UI
A new provider-neutral **MY GAMES** region (`#myGamesSection`, inside the Connections section, below the connection cards) holds "+ Add Game", the inline Add Game panel and the ONE library (`buildGameLibrary`, expanded state key `"library"`). The Steam card keeps its status / Load My Games / Refresh Games / Marvel recognition controls under the eyebrow **STEAM GAMES** and now points to My Games ("N games from Steam are listed in My Games below"). This relocation is what makes the library usable without a Steam connection; it is the only accepted-layout change. The bounded 8-row preview, total count, Show all / Show fewer, owner-private playtime, "Show playtime on my GamID" (OFF), Game Profile expansion (by canonical key) and Steam behavior are unchanged. Mobile first: 44 px targets, wrapping names, no hover-only affordance; checked with real DOM geometry at 360 and 390 px (no horizontal overflow, long names wrap).

### Catalog source and its status
- **Source: Wikidata** (https://www.wikidata.org), structured data released under **CC0**, read through its **documented public interfaces** — the SPARQL query service (platform and identifier facts) and the MediaWiki Action API (`wbgetentities`: titles and alternative titles). **No key, account, scraping or private API is involved.** `scripts/catalog/wikidata-export.mjs` (polite: descriptive User-Agent, strictly sequential requests with pauses, retry with back-off honoring `Retry-After`, every step cached so an interrupted run resumes) writes SQL batch files; `scripts/catalog/wikidata-catalog.mjs` is the pure, unit-tested transform (Wikidata platform items → GamID platform keys; storefront identifiers prove a store AND its PC context; unlabelled items, items with no modelled platform and malformed identifiers are dropped); `scripts/catalog/load-catalog.ps1` loads the files into the LINKED database and **refuses to run unless the linked project is the TESTING project**.
- **Selection:** video games that have at least 2 Wikipedia language editions ("notable": 28,404 candidates at export time), most notable first. Popularity = the sitelink count. Only platforms GamID models are mapped; macOS / Linux / PS3 / older systems and games with no modelled platform are **not offered** (fail safe). Wikidata is crowd-sourced, so platform data can be incomplete (a game's record can miss a platform; it is then simply not offered until Wikidata is corrected or another source adds it).
- **Import behavior (`private.import_game_catalog_batch`):** idempotent and **merge-first** — an item is matched to an existing canonical game through ANY of its provider identifiers (its own source id, then Steam / IGDB / Epic ids) before a new key is minted; new keys are the slugged title (the more notable game gets the clean key, a namesake gets `<slug>_<qid>`); it only ever adds (platforms, aliases, identifiers, rising popularity) and never removes, renames or deactivates anything. The accepted recognition-map game (Marvel Rivals, Steam App ID 2767030) is seeded into the catalog by the migration itself (`SELECT … FROM known_game_sources`, not a hard-coded row) and later Wikidata data enriches that same row.
- **Loaded into TESTING:** the **4,899 most notable importable games** (every game with at least 7 Wikipedia language editions: 8,100 candidates, of which 4,899 have a title and at least one platform GamID models) plus the recognition-map seed = **4,919 canonical games**, 4,440 aliases, 13,566 provider identifiers (Steam / IGDB / Epic / Wikidata) and 13,715 platform links, about **22 MB**. The remaining ~20,300 candidates (2–6 language editions) were not exported in this session. The catalog is designed to grow: rerunning the exporter with a lower `--min-sitelinks` (or a higher `--max-items`) and the loader only adds. Wikidata's query service was overloaded and rate-limiting during this task (502/429; even trivial queries took 16–48 s), which limited how much could be exported in one session. Extend it any time: `node scripts/catalog/wikidata-export.mjs --out <dir> --min-sitelinks 2 --batch 300` (cached and resumable) then `powershell -File scripts/catalog/load-catalog.ps1 -Dir <dir>`; the load only adds and merges.
- **Alternatives considered:** IGDB (Twitch) — official, with better platform completeness and external ids, but needs a Twitch developer app (client id + secret Mazen would create himself) and its free tier is non-commercial; RAWG — needs a key and attribution; the Steam store/app-list APIs — Steam/PC only, no console platforms. Any of them could be added later as another import source through the same `game_catalog_provider_ids` mapping; **none was integrated**.

### Future provider compatibility
Xbox / PlayStation / Discord / Riot discovery will resolve a discovered title to a canonical game through `game_catalog_provider_ids` (add an `xbox` / `playstation` / … identifier row) exactly like Steam does today, set `game_platforms.provider_key` for the platform it can establish (data, not code), and then enrich the existing game instead of creating a duplicate; a provider-established platform stays protected from the manual editor. A future Game Profile keeps joining on the same `game_key`; a manual game can carry one, and adding a game fabricates no stats, rank, win rate, matches or verification.

### Validation
`npm run build`: lint + typecheck (adds the new modules and both catalog scripts) + **625/625** tests (was 557). New: `tests/game-search.test.js` (13: 3-character floor, debounce, narrowing, stale answers, cache, alias, bounds, honest states), `tests/manual-games.test.js` (31: panel search UX, one / multiple platforms, locked provider platforms, MANUAL wording, edit, confirmed removal, merged-row removal, error handling, merge without duplicates, manual-only first, provenance lines, Show all / Show fewer, Game Profile affordance, playtime privacy, no request at render, provider-neutral modules, mobile CSS, one library) and `tests/game-catalog-contract.test.js` (24: additive migration, one canonical model, platform model, MANUAL as a table rule, RLS/grants, owner scoping, backend validation, discovery untouched, bounded indexed search, idempotent merge-first import, recognition fallback, Game Profiles / public boundary untouched, no fabricated catalog, keyless polite source, no provider integration, transform rules). Four older assertions were updated (none removed or weakened) because the library moved out of the Steam card: the expanded-state key is `"library"` instead of `"steam"` (`tests/game-list.test.js`, `tests/game-profile.test.js`), the retitled Steam-card test, and the "no other provider" scan excludes only the catalog migration's platform *names* (`tests/steam-games-contract.test.js`; the catalog files have their own no-integration guard). Live DB `tests/integration/game-catalog-db.sql` — **69 steps + summary** (self-rolling-back (disposable users and invented "Qzx…" games), run wrapped with the migration before applying and again after against the fully loaded catalog); **15 SQL mutants and 14 JS mutants are all caught** (two survivors — an inactive-game rule and a bad-key drop hidden by the result cap — got new tests and are now caught); every earlier live suite still passes (connection discovery 31, playtime 16, Game Profiles 31, gaming connections 48, Intro limit 17, League 55, section visibility 47, Steam connection 69, Steam My Games 62). **Search performance:** a rolled-back measurement with 100,000 synthetic games took 66–90 ms for the broadest 3-letter query, about 5 ms for a specific one and 3 ms for no match (12 rows returned in every case). Real data after everything: 82 discovered games (31 of them now resolve to a canonical catalog game), the 4 connections, 2 League profiles, 0 Game Profiles and `@black` unchanged; 0 manual rows. Marvel Rivals is ONE canonical row (`marvel_rivals`) with PC, Steam, Epic Games Store, PlayStation 5 and Xbox Series X|S and the identifiers steam:2767030, igdb, epic_games and wikidata Q125175413.

**Deployment (TESTING only).** Migration applied with `supabase db push` (dry run listed only it; linked ref `upvtrczefcvigxdyuylw`); the catalog loaded with `load-catalog.ps1`; Pages serves the new modules. No Edge Function, secret, Cloud Run or Production resource touched.

**Manual acceptance (Mazen).** See the final report's steps A–F (search after 3 characters; add a game on one platform; edit to add a second; remove one manual platform; remove the manual-only game; Marvel Rivals — add a platform, verify no duplicate row, remove it, verify the Steam row remains).

**Remaining blockers.** Catalog completeness is bounded by Wikidata (crowd-sourced; platform lists can be incomplete) and by how much could be exported while its query service was overloaded (about 4,900 of the most notable games are loaded; less notable / niche titles are not searchable yet); better platform completeness would need IGDB (a key Mazen would create himself). No typo tolerance. Artwork is unpopulated. Xbox / PlayStation / Discord discovery, Marvel stats and W1 remain unstarted.
## 7u. Game Catalog expansion — 102 platforms, canonical + per-platform release years, remaining Wikidata games (TESTING only)

A controlled **enrichment of the accepted canonical catalog (section 7t)**: nothing was restarted, redesigned, deleted or duplicated. One catalog, one platform model, one set of rules for games that were already there and games that are new. Source is still **Wikidata only** (no IGDB / IGN / RAWG / Giant Bomb / MobyGames, no new key, no Tracker.gg). **Production was never accessed.**

### What changed (migrations #27 `20260922000000_game_catalog_platforms_release_years.sql` and #28 `20260922010000_game_catalog_import_key_fix.sql`, additive, TESTING only)
- **Platforms 11 → 102.** `scripts/catalog/platform-map.mjs` is the single source of truth (key, name, family, sort order, the Wikidata items that name it, and alias names); `scripts/catalog/print-platform-seed.mjs` prints the migration's seed from it and a test asserts the migration seeds exactly that set. One real system = ONE key however many Wikidata items name it (PlayStation / PS1 / PSX → `ps1`; Genesis / Mega Drive → `genesis`; Famicom, Family Computer and the Famicom Disk System → `nes`; Super Famicom → `snes`; duplicate Wikidata items for the PS2 and the Switch; New Nintendo 3DS → `nintendo_3ds`; DSiWare → `nintendo_dsi`; arcade board items → `arcade` …). The eleven accepted platforms keep their key, name, family, parent and provider (Steam and Epic are still stores under PC; a store identifier still proves the store and its PC context); the only change to them is their position in the list. Families: PC (every computer), PLAYSTATION, XBOX, NINTENDO, SEGA, ATARI, NEC, SNK, MOBILE, OTHER (the family CHECK was widened). Only platforms that are real systems AND occur for at least 10 games in the source were added (plus every platform named in the brief); generic values (a CPU, "cross-platform", "mainframe computer", a Java virtual machine, "mobile phone", "Facebook") are deliberately NOT mapped. All 102 are used by at least one game.
- **Release years (nullable).** `game_catalog.release_year / release_date / release_date_precision` = the EARLIEST legitimate release of the game; `game_catalog_platforms.release_year / release_date / release_date_precision` = the release on that platform, only where Wikidata ties a publication date (P577) to a platform (qualifier P400). Table CHECKs keep year and date consistent (year 1950–2100, precision 9 year / 10 month / 11 day), so a more precise date can be shown later without another migration. A date is used only when Wikidata gives it at year precision or better and it is a real calendar date; nothing is ever inferred from a title, a decade or free text; deprecated statements are ignored; `game_key` never contains a year. The importer keeps the earliest date per game and per platform, never lets a later port replace the first release, never lets a missing date erase a known one, and keeps the invariant "canonical date ≤ every platform date" (checked live: 0 violations). A platform named only by a dated release is also offered (the source states the game was released there).
- **Search** now also returns the canonical release year (the two search functions were recreated with one more column: same 3-character floor, ≤ 12 rows, normalization, aliases, literal `%` / `_`, ranking; authenticated only). The UI shows it as secondary muted text: `Crash Bandicoot (1996)`; with no year it shows just the title (never Unknown / N/A / 0 / empty parentheses; a value that is not an integer 1950–2100 is dropped client-side). `get_my_game_platform_state` also carries each supported platform's own year. Manual add offers only the platforms known for THAT game; everything else (single / multi-platform, edit, remove, Steam locking, manual + discovered merge, MANUAL trust) is unchanged.
- **Migration #28** fixes one importer branch found by the real load: a title such as "Él" (one Latin character) or a title in another script produced a `game_key` outside the accepted shape and aborted the batch. Such a game now gets `g_<source id>` / a `g_` prefix; the title is kept as written and stays searchable. A title with fewer than 2 normalized characters ("N+", "N++") is still not importable.

### Pipeline (resumable, respectful, one source)
`scripts/catalog/wikidata-export.mjs` now caches **raw, unfiltered facts** per game (every platform value, every non-deprecated publication date with precision and platform qualifier, identifiers, titles/aliases) in `raw/NNNN.json`, one file per batch of 400; the mapping and the SQL chunks are built **offline** from that cache (`--no-fetch`), so changing the platform map or re-running never asks Wikidata again. A completed batch is never asked again (a failed batch leaves every earlier one intact); requests are strictly sequential with a pause; 429 / 5xx / timeouts back off up to 3 minutes for up to 30 attempts honoring `Retry-After`; an anonymous "unknown value" node is never treated as a platform. `--audit` counts the platform values in the cache and flags an unmapped item that is a duplicate of a mapped system by its label. Titles/aliases come from the Action API (50 per call); platforms, dates and identifiers from ONE SPARQL query per batch. `scripts/catalog/load-catalog.ps1` (TESTING-only guard) loads the chunks; the whole load is idempotent (a second pass created 0 games from the first 15 chunks).

### Real result (TESTING)
| | before | after |
|---|---|---|
| canonical games | 4,919 | **27,182** (+22,263) |
| aliases | 4,440 | **13,284** |
| provider-id mappings | 13,566 | **61,935** (Wikidata 27,306) |
| normalized platforms | 11 | **102** (+91) |
| game ↔ platform links | 13,715 | **74,935** (+61,220) |
| games with canonical release year | 0 | **26,000 (95.65 %)**; 1,182 without (the source has none) |
| games with ≥ 1 known platform | 4,919 | **27,182 (100 %)** |
| platform-specific release-year records | 0 | **10,240** |

Candidates: the source reports **28,404** notable games (≥ 2 Wikipedia language editions; unchanged from the previous export; Wikidata's query service was healthy this time, about 20 s per batch), all processed (72 raw batches, none unfinished). Offered to the importer 27,308; skipped **1,096** by the transform (177 with no usable title, 919 whose platforms GamID does not model) and **2** by the importer ("N+", "N++": title shorter than 2 normalized characters). The 27,306 imported items became 22,263 new games plus 5,043 merges into an already-existing canonical game (all 4,919 pre-existing games re-encountered through their Wikidata id, and 124 duplicate Wikidata items joined to the game they duplicate). **Existing games:** 3,172 of the 4,919 gained at least one platform (9,175 links added, none taken away) and 4,878 gained a canonical year. **Platform audit:** 513 distinct platform values in the source; 148 mapped, 365 remaining unmapped (43 used by ≥ 5 games — mobile phone, Java virtual machine, Facebook, cross-platform, Virtual Console, mainframe computer, CPU names, PC-FX …; 322 used by 1–4 games); 20,468 games list at least one platform that was unmapped before this task and 13,060 games had no platform at all before and have one now. Years range 1962–2029 (48 games carry a future announced date from the source). Search at 27k games (real, authenticated, 5 runs each): 0.7–4.5 ms median for typical 3+ character queries, 23 ms for the broadest ("the": 3,978 matches); catalog tables 45 MB, database 62 MB.

### Validation
`npm run build`: lint + typecheck + **656/656** tests (was 625): `tests/game-catalog-expansion.test.js` (platform map integrity and every named platform; PS1/PS2/PS3/PSP/Vita, Xbox family, Nintendo, Sega and Dreamcast normalization; alias resolution; multi-platform games; release-year extraction, earliest wins, nullable, invalid and impossible dates, platform-specific years, old = new rules and determinism; the migrations' additive contract and seed = platform map; importer rules; resumable exporter; search-result year and no-year rendering, alias search, manual add with historical platforms, mobile CSS). Older assertions were updated, not weakened: the transform's mapping test (the nine accepted mappings unchanged, now a superset), the item-shape test (new fields), and two search-controller expectations (`year: null`). Live DB `tests/integration/game-catalog-expansion-db.sql` — **47 steps + summary**, run wrapped with the migration before applying and again after against the fully loaded catalog; **14 SQL mutants and 17 JS mutants caught** (two date-validity mutants are equivalent: a second check makes the first redundant); every earlier live suite still passes.

**Data safety.** The two real manual declarations (`@black`: League of Legends / PC, Crash Bandicoot / PC) are unchanged (same rows, same `created_at`); 82 discovered games, the 4 connections, `@black` and 0 Game Profiles are untouched; no game_key changed; nothing was deleted.

**Manual acceptance (Mazen).** Search a game (for example `crash`) and see `Crash Bandicoot (1996)`; several same-titled games are now told apart by year; a game with no known year shows just its title; the platform picker offers only that game's platforms (for example PlayStation (PS1) for Crash Bandicoot); older games and platforms are searchable (Tetris, Doom, Sonic …); nothing else in My Games changed.

**Remaining.** 1,182 games have no year (Wikidata has none); 365 unmapped platform values; games with fewer than 2 Wikipedia editions are not in the catalog; typo tolerance and artwork remain unbuilt; recognition of Steam games still depends on Wikidata's Steam-id coverage.

## 7v. Public Profile responsive height / overflow fix — desktop + mobile (TESTING only; ACCEPTED BY MAZEN)

**Symptom.** The public GamID (`/public/?handle=…`) behaved like a fixed viewport-sized screen: on desktop a huge empty area appeared, on mobile the profile scrolled inside itself, the provider panel scrolled inside itself and Replay Intro floated or was clipped.

**Root cause (proven from the implementation, not guessed).** The public page was ONE fixed full-viewport stage for both the Intro and the profile: `.experience-wrap{position:fixed;inset:0}` with the iframe at `height:100%`, the profile document itself sized to `100svh` (`.prototype-shell` / `.experience` / `.profile` with `height`/`min-height:100svh` and `overflow`), a separate `position:fixed` provider panel (`max-height:40svh;overflow:auto`) and a `position:fixed` Replay button. Nothing in that chain ever depended on the content, so the profile could neither grow the page nor shrink to fit; extra content was clipped/scrolled inside boxes, less content left empty viewport-height space. (Files: `dist/public/public.css`, `dist/public/index.html`, `dist/public/public.js`, `dist/account/intro-preview.css`.)

**Structural fix (smallest robust, no redesign, no magic height).** Two layout modes on `#publicShell[data-mode]`:
- **experience** — exactly the old behavior, only while the Intro / transition plays (fixed overlay, page scroll locked while live).
- **flow** — once the profile shows: the wrapper is static, the shell is a CSS grid; the iframe's height is **the height the profile itself reports**; the provider panel and Replay Intro are ordinary blocks. Content grows → iframe grows → page grows → the PAGE scrolls. Wide screens (≥ 1280 px): panel in the same grid row to the right of the identity; narrower: panel below it; Replay Intro is always the last grid row.
- Parent/child height sync WAS required (the profile lives in a same-origin iframe). New shared, unit-tested `dist/flow-layout.js` (`createHeightReporter`, `createFlowLayout`); new messages `gamid-intro-preview-height` (child → parent) and `gamid-intro-preview-measure` (parent → child), same-origin only, the existing handshake (`ready` / config / `state` / `error`) untouched. The child measures its own content-sized block (`.prototype-shell`), never the frame's height, so there is no resize loop; it reports after render, on `ResizeObserver`, `resize`, `fonts.ready` and on parent measure requests, only when the value really changed; with no measurable height the host keeps the overlay (never a guessed number). The owner Intro Preview in the account editor is unchanged (all child changes are gated by `html[data-flow="on"]`, set only for `publicMode`).
- The provider panel supports 0 / 1 / 2 / 3 / many providers (no hard-coded count, no internal scroll); optional sections toggling grows / shrinks the layout.

**Files.** `dist/flow-layout.js` (new), `dist/public/{index.html,public.css,public.js}`, `dist/account/{intro-preview.js,intro-preview.css}`, `package.json` (typecheck list), tests: `tests/public-profile-responsive-layout.test.js` (new, 23 tests), `tests/public-section-visibility.test.js` (obsolete "fixed overlay panel" assertions replaced by "never an overlay"), `tests/intro-video-fit.test.js` (the wide-source CSS scan now stops at the separate `PUBLIC FLOW` block; portrait/wide assertions unchanged).

**Validation.** `npm run build`: lint + typecheck + **679/679** tests (was 656). Real-browser matrix against the real route with a mocked data layer (scratch harness, not committed): widths 360 / 390 / 430 / 768 / 1024 / 1366 / 1440 / 1920, short and tall viewports, scenarios none / Discord / Discord+Steam / Discord+Steam+League / long content — no horizontal overflow, no internal vertical scroll, no clipping, panel / Replay never overlap the profile; provider count changed live; Intro presets and Replay round trip on mobile and desktop.

**Not touched.** Game Catalog, Manual Games, My Games, migrations, Edge Functions, provenance labels, visibility rules, QR, URL / publish behavior, Intro playback / transitions / Split Reveal. Production is never accessed.

**Manual acceptance (Mazen).** Open the deployed TESTING `@black` public profile on desktop and on a phone: the page scrolls normally, no giant empty area, no inner scrollbar, the Discord / Steam / League panel is fully visible (right of the identity on wide screens, below it on narrow ones), Replay Intro sits after all content; toggle a visibility switch in the account and see the page grow / shrink; Replay Intro still plays and returns to the profile.

## 7w. Public My Games — compact profile library, View all, search, Game Details, source / trust states, playtime and rank privacy (TESTING only; IMPLEMENTED — MANUALLY TESTED — ACCEPTED BY MAZEN)

Starting point: accepted checkpoint `30e55f2` (Public Profile responsive height fix). Nothing accepted was restarted or redesigned; the Game Catalog, Manual Games, My Games (owner side), Steam discovery, the Connections panel and the Intro are unchanged.

**What a visitor gets.** On a published GamID whose owner switched **Show My Games on my GamID** ON: a compact **MY GAMES** section (at most **six** rows + the true count) after the Discord / Steam / League panel and before Replay Intro, and **View all N games** (only when there are more than six) which opens the complete library: a full-screen sheet on phones, a centered panel (max 40rem) on desktop, with **Search games…**, pages of 30 with "Show more", and **Game Details** for any game. Every row has a chevron ›; every chevron opens Game Details. Zero games: no section at all.

**Where the data comes from.** One server function, `private.public_my_games(entity, query, limit, offset)`, is the only place the public library is built. It is reached two ways: as the `my_games` section of `get_public_identity` / `get_public_identity_by_qr` (the first six + counts, so the profile needs no extra request; the public identity keeps exactly its 14 columns) and through the anonymous `get_public_my_games(handle, query, limit, offset)` (pages of at most 50; no row at all for an unknown / unpublished GamID or one with My Games OFF, so those cases cannot be told apart). The library is the identity's OWN games: `public.discovered_games` (provider discovery: today Steam) + `public.entity_game_platforms` (the owner's declarations), merged into ONE row per canonical `game_key` exactly like the private My Games list (recognition map first, then the catalog's provider ids). A discovered game the catalog cannot map stays its own row; a discovered game with no name is not listed; two Steam app ids of one canonical game are one row (playtime is summed). **Discord creates no games** (it is a connection; only `discovered_games` rows create discovered games and only Steam writes them). Search only narrows those rows (by name, the provider's own name, or an alias of an owned game) and never returns a catalog game the identity does not have.

**Preview ordering (deterministic, no private data).** 1) games the owner declared by hand (including a game that is both Steam-discovered and declared) first, A–Z, 2) then provider-discovered games A–Z, 3) canonical key as the tie-break; with a search: relevance first (exact name, name prefix, word start, anything else). Playtime, stats and dates NEVER take part in ordering, filtering or counting (proved with a hidden-playtime reversal test and a mutant that orders by playtime).

**Source / trust presentation (icon + text, never colour alone).** Steam-discovered = Steam mark + "**Steam · Discovered**"; manual = pencil mark + "**Manual · <platform>**" (dashed outline: it also differs from Steam in shape); a game that is both shows BOTH badges on the same row; an unknown future provider renders as "<Provider> · Discovered". **Nothing is ever labelled VERIFIED**: the data cannot produce it (the provenance vocabulary is `DISCOVERED_FROM_<PROVIDER>` and `MANUAL`), there is no checkmark glyph anywhere, and Steam discovery explicitly "does not verify ownership on any other platform". `VERIFIED` stays reserved for a real future verification mechanism. There was no existing Steam icon in the app (the Connections panel uses text chips), so the two marks are tiny inline CSS-mask SVGs (no icon library).

**User platforms vs catalog platforms.** Public rows show the platforms of THIS user's relationship to the game (what a provider established: Steam; what the owner declared), never the catalog's release list (e.g. Final Fantasy VII declared on PS1 shows PS1 only). The library query never reads `game_catalog_platforms`.

**Release year.** The canonical year appears subtly "(1996)"; NULL → omitted entirely (never Unknown / N/A / 0).

**Game Details** shows only what exists: name + year, Platforms, Source(s) (Steam: "Discovered through the connected Steam account…"; each manual platform: "Added manually · Not verified"), Playtime (only if the server sent it), Rank & stats (only if the server sent it). A basic manual game therefore shows just name/year/platform/source. From the profile the details open directly (no request); from the library there is a Back that keeps the search and the loaded page. Escape closes (Back first from a library-opened detail), focus returns to the opener, the page behind does not scroll.

**Privacy: three independent, library-wide owner switches (no per-game switch).** `profiles.show_my_games` and `profiles.show_game_stats` (new, `NOT NULL DEFAULT false`, no backfill: every identity starts OFF; flipped only by the owner through `set_my_public_games_setting('my_games'|'stats', on)`; read with `get_my_public_games_settings()`), plus the existing **Show playtime on my GamID** (`show_game_playtime`, its accepted gate `private.public_game_playtime_allowed` is reused unchanged). Gates: My Games = published AND ON; stats = published AND ON, GLOBAL (it does not need My Games: see the acceptance fixes below); playtime = its accepted gate. **The values are never merely hidden**: when a switch is OFF the key is absent from the SQL result (`playtime_minutes` / `stats` are built with `case when <gate>`), so nothing travels to the browser and the presenter has no "hide" branch. Combinations: playtime OFF + stats ON → stats only; playtime ON + stats OFF → playtime only; both OFF → games, platforms and provenance only; both ON → both. Ranks & stats: League uses its EXISTING row through the existing compatibility layer, only when its own League section switch is public too (so the League switch still governs League data), and keeps **PROTOTYPE / UNVERIFIED** and "Data: OP.GG · Updated …"; other games only through the accepted Game Profile public gate (`private.public_game_profiles`, public rows only). That gate carries no verification basis, so a public profile is shown at UNVERIFIED until it does (trust is lowered, never raised).

**Public data boundary.** The response carries no SteamID / provider account id, Steam app id, icon reference, connection or entity id, token, discovery timestamp, Riot ID or source URL. The gates and the builder have no client grant (`anon` may only call the library function and the unchanged identity functions; the two owner functions are authenticated-only and resolve the identity from `auth.uid()`).

**Owner UI.** Account → Game display now has three switches (Show My Games, Show playtime, Show ranks & stats) with plain hints (including "Nothing is public until you publish your GamID"); the My Games badge reads PRIVATE / PUBLIC / PUBLIC WHEN PUBLISHED. They persist on the server, are re-read after every change and after a refresh, and never touch connections, games, discovery or each other.

**Large libraries.** The DOM is bounded by design: the profile renders six rows, the library one page of 30 per request (server-side pages of at most 50, exact totals), search runs on the server (debounced 250 ms, stale answers ignored). Measured on TESTING with a disposable 1,300-game identity (1,000 manual + 300 Steam): first library page ≈ 41 ms, a search ≈ 240 ms, the whole public identity response (with the six-game preview) ≈ 110 ms and 1.8 KB; the count is exact and paging reaches every game exactly once.

**Layout.** The section is ordinary flow content in the accepted responsive grid (rows: identity, connections panel, My Games, Replay Intro; wide screens keep the panel beside the identity); it has no height of its own. Only the modal is an overlay (viewport-bound, like the Intro stage) and is the one intended inner scroller. Verified in a real browser at 360 / 390 / 430 / 768 / 1024 / 1366 / 1440 / 1920 with long titles, 7 platforms on one game, 0 / 1 / 6 / 7 / 82 / 300 / 1000 games: no horizontal overflow, rows ≥ 62 px tall, modal always inside the viewport, Replay Intro after the section, Intro → profile → Replay → Intro → profile round trip intact.

**Migration (additive, TESTING only):** `20260922100000_public_my_games.sql` — two columns, two owner functions, two gates, the builder, the public function, and `create or replace` of `private.get_public_identity_impl` (same 14 columns) with one more allowlisted section. No existing row changed.

**Validation.** `npm run build`: lint + typecheck + **721/721** tests (was 679): `tests/public-my-games.test.js` (41; the real builders and the library controller run against a small fake DOM: sources, badges, six-row cap, View all, paging, search scoping, stale answers, details, focus, 300 / 1000 / 1500-game bounds, owner switches, migration contract) and 1 new layout contract test; older assertions were UPDATED (not weakened) where they described "the public page shows no games yet": playtime-visibility (the public page's own code still has no playtime logic; the presenter renders only what the server sent), game-profile contract (later migrations may only call the public gate), steam-games contract, the Steam card wording, and the responsive test's grid rows / height audit. Live DB `tests/integration/public-my-games-db.sql` — **67 steps**, run wrapped with the migration before applying and again unwrapped after: every step passes; **16 SQL mutants and 16 JS mutants caught** (the first run showed two survivors — the gate's own published-check and the 50-row cap — and tests were added for both).

**Real @black (read-only measurement, transaction rolled back):** merged library = **5 games**: Crash Bandicoot (Manual · PlayStation (PS1), 1996), League of Legends (Manual · PC, 2009; with stats ON: Bronze IV, 7 LP, 5 matches, 40 % win rate, PROTOTYPE / UNVERIFIED, Data: OP.GG), Tetris (Manual · Game Boy, 1984), Dota 2 (Steam · Discovered, 2013; 20.9 h when playtime is ON), Marvel Rivals (Steam · Discovered, 2024; 4.3 h when playtime is ON). There is currently no game that is both Steam-discovered and manually declared, so the merged case is covered by tests and the disposable-identity SQL run; to see it live, add a platform (for example PS5) to Marvel Rivals in My Games. With five games there is no "View all" (it appears from the seventh). @black's three switches are OFF by default; nothing was changed permanently.

**Manual acceptance (Mazen).** Account → Game display: switch **Show My Games** ON (and, if you want to see them, playtime and ranks & stats). Open the public GamID on a phone and on a desktop: the compact MY GAMES section follows the connections panel with Steam / Manual badges (text + icon), every row opens Game Details, playtime / rank appear only when their own switches are ON, and Replay Intro is still last. Turn Show My Games OFF: the section disappears (and the library cannot be fetched).

**Acceptance fixes (after Mazen's first manual test) — checkpoint after `42eedfa`.**

*A. "Show ranks & stats on my GamID" is a GLOBAL public-GamID privacy control.* Root cause: the League section of `get_public_identity` (older than the switch) always carried `rank_state, tier, division, lp, wins, losses`, and the switch only gated the stats inside Public My Games, so with the switch OFF the public League card still showed "Bronze IV · 7 LP · 2W 3L". Fix (database, migration `20260922200000_public_stats_global_scope.sql`, additive, `create or replace` of two functions, no data touched): (1) `private.public_game_stats_allowed` is now "published AND the owner's stats switch ON" (no longer tied to Show My Games; Public My Games still needs its own Show My Games gate to return anything at all, so nothing new can appear there); (2) the League section carries the League IDENTITY whenever the League section switch is public (Riot ID, region, icon id, trust label, data source, freshness) and adds the six rank / stat fields ONLY `case when private.public_game_stats_allowed(e.entity_id)`; otherwise they are not in the response at all (`rank_state` included, so the response does not even say whether the account is ranked). `public.js` draws the rank line only when the server sent `rank_state`; it has no stats switch and no hide logic. Precedence is unchanged: League "Show on my GamID" OFF → no League section; ON + stats OFF → "LEAGUE OF LEGENDS / Espada black#esp · ME1 / PROTOTYPE / UNVERIFIED / Data: OP.GG · Updated …" and no rank; ON + stats ON → the existing rank / stats as before, still MANUAL / OPGG_TEMPORARY. Surfaces governed by the switch: the League card, Public My Games rows' League stats, Game Details. **Playtime audit:** "Show playtime on my GamID" is global public-playtime privacy; playtime exists on exactly ONE public surface (Public My Games / Game Details, behind `private.public_game_playtime_allowed`); the identity function, the League / Discord / Steam sections and all page code outside `public-games.js` never carry it, so no other surface needed gating and nothing changed there (Mazen's confirmed OFF / ON behavior is untouched). Owner UI: the stats hint now says "anywhere on your public GamID — the League card and a game's details", and the League card note explains that rank follows the stats switch. Note: because the switch defaults to OFF, every existing League card loses its rank line until its owner turns "Show ranks & stats" ON.

*B. Real Steam source icon.* The previous mark was a generic circle-and-dot glyph I drew (there was no Steam asset in the repo). It is replaced by the standard Steam glyph (the simple-icons `steam` path, CC0; the Steam trademark belongs to Valve and is used only to indicate a Steam-sourced game), embedded verbatim as a local data-URI CSS mask (`.pg-icon.is-steam`, 1rem, `currentColor`): no remote image, no font, no dependency, no icon library. It appears wherever Steam provenance is shown (they all use the same badge / source markup): compact preview, View all, search results, and the Steam entry in Game Details, always beside the text "Steam · Discovered" (Game Details: "Steam — Discovered through the connected Steam account…"). It is decorative (`aria-hidden`, no alt text): the words carry the meaning, and the row's accessible name reads "Steam · Discovered". Steam stays DISCOVERED / CONNECTED, never VERIFIED, with no checkmark. The Manual pencil mark, badge layout, merged-row behavior (Steam mark + Manual mark on ONE row) and every other rule are unchanged.

*Validation of the fixes.* `npm run build`: **738/738** tests (was 721): `tests/public-stats-global-scope.test.js` (17; the REAL `public.js` League renderer runs against a fake DOM for stats OFF / ON / unranked, plus migration-contract, playtime-audit, Account wording and Steam-icon tests on the real row / library / details builders) and older assertions updated where they described the previous wording. Live DB `tests/integration/public-stats-global-db.sql` — **32 steps** (identity-only League when stats OFF with tier / division / LP / wins / losses / rank_state each proved absent from the anonymous response and its serialized text; ON returns the same fields as before; League switch stays the first gate; QR route agrees; unranked account; global gate; playtime independent; Discord / Steam sections identical; nothing written) run wrapped before applying and unwrapped after; `public-my-games-db.sql` (67) and `public-section-visibility-db.sql` (47, which now sets the stats switch ON for its League-rank assertions) updated, and every other live suite (12 files) re-run and passing; **10 SQL mutants (incl. "rank fields always sent" and "gate needs My Games again") and 7 of 9 JS mutants caught (one equivalent, one anchor not applicable).**
**ACCEPTANCE RECORD — Public My Games is IMPLEMENTED — MANUALLY TESTED — ACCEPTED BY MAZEN.** Accepted implementation checkpoint: `006b97375a30d0be248d22e021b3588d673e1ee7` (feature `42eedfa` + the acceptance fixes above; the global rank / stats privacy correction and the recognizable Steam icon are included and were manually accepted). Automated baseline at that checkpoint: **738 / 738** tests. Mazen tested the real TESTING identity `@black` and verified: (1) Show My Games ON exposes the library with the real count; (2) with the real library at 7 games the profile shows exactly 6 and the button "View all 7 games"; (3) the seven real games are Manual: Crash Bandicoot (1996, PlayStation (PS1)), Grand Theft Auto: San Andreas (2004, PlayStation 2), League of Legends (2009, PC), Sonic Adventure (1998, Sega Dreamcast), Tetris (1984, Game Boy) and Steam-discovered: Dota 2 (2013), Marvel Rivals (2024); GTA San Andreas and Sonic Adventure were first added to exercise the more-than-six behavior, but Mazen confirmed he really played both, so they are legitimate Manual declarations and must be kept; (4) View all shows all seven with provenance visible; (5) search filters only the owner's library (MA -> Marvel Rivals, SON -> Sonic Adventure), never catalog results; (6) Sonic Adventure details: Platforms Sega Dreamcast, Source "Added manually - Not verified", no playtime / rank / stats; (7) GTA San Andreas details likewise (PlayStation 2); (8) Dota 2 and Marvel Rivals show the recognizable Steam icon beside "Steam - Discovered", never Verified, no checkmark; (9) Show playtime OFF hides Steam playtime in Game Details, ON shows Dota 2 20.9 hours and Marvel Rivals 4.3 hours; (10) "Show ranks & stats on my GamID" is a global public control: with it OFF the public League card keeps its identity (per its own visibility switch) but hides rank / LP / W-L, and the protected fields are absent from the server response, not hidden by CSS; (11) trust is unchanged: Manual = Added manually - Not verified, Steam = Discovered (not ownership verification), League / OP.GG = PROTOTYPE / UNVERIFIED; (12) the section stays in normal page flow (no regression of the accepted responsive-height fix, no inner vertical scrolling of the main profile), View all / Game Details / Back / Close work, and Replay Intro stays naturally after the content. Not started and not authorized by this acceptance: Game ID Wall W1, Xbox, PlayStation integration, Marvel provider, IGDB, Cinematic Profile Engine, further Public My Games features, per-game visibility.
**Not built (by design):** per-game switches, Xbox / PlayStation / IGDB / Marvel stats, filters (All / Steam / Manual / platform: deliberately skipped, not needed for the core feature), typo-tolerant search, game artwork, Wall W1, Cinematic Profile Engine.

## 7x. Universal Social Identity Preview / Share Engine — research, Phase 0a hosting proof, Phase 0b social-preview validation lab (TESTING only; CLOSED — AWAITING MAZEN'S ACCEPTANCE BEFORE PHASE 1)

Trigger: sharing the real permanent URL (`https://jeddawe11-eng.github.io/gamid-testing/@black`) into a real Discord channel produced only a raw link, no rich card. This section documents the research and the two validation phases that followed, all TESTING-only and none of them touching `/@black`, Supabase, Auth/OAuth, Google Cloud, DNS, a domain, or any paid Cloudflare feature.

**Why `@black` has no Discord preview today (confirmed).** GitHub Pages answers `/@black` with **HTTP 404** and no Open Graph/Twitter tags; the redirect to the real profile (`dist/404.html`) runs in client-side JavaScript, which crawlers never execute. Confirmed later in Phase 0b: a 404-with-full-tags page (`n1`) got **no rich preview on either Discord or WhatsApp**, and a same-URL 302 redirect to a direct-200 page (`r1`) **did** get the full preview on both. This is the concrete, tested reason the eventual `/@handle` architecture must answer with a direct HTTP 200, not rely on today's 404 + JS redirect.

**Architecture decision (research only, current official docs).** Cloudflare's own docs now say "Start new projects with Workers" over Pages+Functions; Workers Static Assets covers every capability GamID needs (dynamic `/@handle` via `run_worker_first`, static hosting, custom domains later) and adds observability, gradual deployments and Rate Limiting that Pages lacks. Decision: **Workers + Static Assets**, not Pages. No file was changed for this research step.

### Phase 0a — Cloudflare Workers Static Assets hosting proof (ACCEPTED)

A parallel, temporary deployment of the exact staged `dist/` (same exclusion of `assets/gamid-intro.mp4` and the same `__ASSET_VERSION__` stamping the GitHub Pages workflow does) to a **separate Cloudflare Worker**, `gamid-testing-static`, on the `gamid` workers.dev subdomain (registered with Mazen's explicit authorization; free, no paid feature). GitHub Pages stayed live throughout and was never modified.

- **Added:** `wrangler.jsonc` (assets-only: no Worker script, no bindings, no secrets, no `/@*` logic), `scripts/stage-cloudflare.mjs` (stages `dist/` → `.cloudflare-stage/`, normalizes any CRLF line endings introduced by a Windows checkout to LF so the artifact is byte-identical to what GitHub Pages publishes), `.gitignore` entries for `.cloudflare-stage/` and `.wrangler/`.
- **Validated:** all 61 published files byte-identical on Cloudflare, on the staged artifact and on GitHub Pages; anonymous browsing (landing, `/account/` sign-in/register, the public `@black` profile with Discord/Steam/League/My Games/Replay Intro) verified in a real browser; 738/738 tests before and after.
- **One accepted limitation, left unpatched on purpose (belongs to the future `/@*` Worker, not to this static-only phase):** `/@black` 404s on the Cloudflare host too — Cloudflare's default `html_handling` redirects `/@black` to `/%40black`, and the client-side redirect script looks for a literal `@`, so it never fires there. GitHub Pages remains the link people should share until Phase 1.
- **Accepted implementation checkpoint: `270df4b6e45ea9c73fffed12be83fd4a8a1b43a6`.**

### Phase 0b — social-preview validation lab (manual testing complete; Telegram testing cancelled, not required)

A second, fully isolated Worker, **`gamid-social-lab`**, on the same `gamid` workers.dev subdomain, kept in an **untracked** `social-lab/` folder until this closing checkpoint. It has no Supabase calls, no secrets, no real profile data and no real Intro; every media file is synthetic (ffmpeg test patterns with a burned-in running clock, so "the poster only" and "it actually played" are visually distinguishable), including a made-up 4K VP9/WebM clip built to the same *shape* as the accepted Intro D3 derivative (3840×2160, 30 fps, ~14 MiB) — never the real Intro itself.

**Method.** Seventeen hand-written pages (`/x/<id>`) each return explicit Open Graph/Twitter metadata in the *first* HTTP response (no JavaScript), so what a crawler does can be told apart from what a browser does. Every request was logged (`wrangler tail`, JSON) with method, path, User-Agent, Range header and network operator.

**Test matrix (what each experiment isolates):**

| Group | id | Varies |
|---|---|---|
| static image | s1 | Baseline: 1200×630 PNG, `twitter:card=summary_large_image` |
| static image | s2 | Square 600×600, `twitter:card=summary` |
| redirect | s3 | `og:image` URL itself 302s to the real image |
| redirect | r1 | The **page URL** 302s to `s1` |
| redirect | r2 | The page URL 301s to `s1` |
| redirect | r3 | HTTP 200 with tags + a client-side meta-refresh (the `404.html` pattern, but with tags present) |
| status | n1 | Full tags, but **HTTP 404** (today's real `/@handle` shape) |
| status | n2 | Full tags + `<meta name=robots content=noindex>` (today's real public shell carries this) |
| video | v1 | Baseline MP4 H.264/AAC 720p, `og:video`+`:url`+`:secure_url`+`:type`+dimensions, `og:type=video.other` |
| video | v2 | v1 + `twitter:card=player` (no player URL) |
| video | v3 | Same content as v1, WebM/VP9/Opus instead of MP4 |
| video | v4 | v1's video tags kept, but `og:type=website` (tests whether `video.other` is actually required) |
| video | v5 | ~9.2 MiB MP4 (above the ~8 MB figure quoted for Discord's own uploads) |
| video | v6 | `og:video` URL itself 302s to the real MP4 |
| video | v7 | Synthetic 3840×2160 VP9/Opus WebM, ~14.3 MiB — same shape as the accepted D3 derivative |
| video | v8 | X/Twitter player-card markup: `twitter:player` iframe + `twitter:player:stream` |
| cache | c1 | `Cache-Control: no-store`, a fresh random token in the title on every fetch (refetch/cache probe) |

**Manually observed results (Mazen, real platforms).**

*Discord:* s1 — rich image card. v1–v8 — all rendered as a **playable video embed**; **no autoplay**; a click on Play was required; playback then worked correctly (video and audio). n1 (404 + tags) — **no rich preview**. r1 (302 → s1) — Discord followed the redirect and rendered the full s1 card.

*WhatsApp:* preview generation was noticeably slower than Discord (an initial text-only state before the card populated). s1 — image/title/description rendered after waiting. v1 — rendered as a **static fallback** (poster image + title/description); the video **did not** play inline. n1 (404 + tags) — no rich preview, only bare link/domain text. r1 (302 → s1) — WhatsApp followed the redirect and rendered the full s1 card.

*Telegram, X, Facebook, iMessage, LinkedIn, Slack:* **NOT TESTED.** Telegram testing was planned as the one remaining minimum test but was explicitly cancelled by Mazen and is **not required for Phase 0b acceptance**. Nothing about these platforms is claimed.

**Available crawler-log evidence, and its real limits.** The `wrangler tail` capture process ran only in a background shell tied to this session and did not survive across the gap to Mazen's actual test session, so it captured a short window immediately after deployment, not the manual test run itself. What it did capture (independently confirms part of the Discord result): a real Discordbot UA (`Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)`) fetched `/x/s1`'s page and image, and fetched `/x/v1`'s page, poster and the **entire MP4 with a plain, non-ranged GET** (consistent with Discord's crawler ingesting/transcoding server-side); a few seconds later a separate fetch arrived over Cloudflare's own network with a spoofed old Firefox/Mac User-Agent doing **incremental HTTP Range requests** (`bytes=0-`, then `bytes=65536-`) — the signature of a video player, not a crawler, consistent with "had to press Play, then it played". **No log data exists for v2–v8 individually or for any WhatsApp fetch** — those results rest on Mazen's direct visual observation only, not on log corroboration.

**Distinguishing CONFIRMED / MANUALLY OBSERVED / NOT TESTED:**
- **CONFIRMED (log + observation), Discord s1 and v1 only:** crawler fetches page + media in full; playback is click-to-play, never automatic; a Range-based re-fetch follows a user's Play press.
- **MANUALLY OBSERVED (Mazen, real platforms, no independent log corroboration):** Discord v2–v8 behave the same as v1 (embed, click-to-play, plays correctly) regardless of `twitter:card` value, container/codec, `og:type`, file size to ~9.2 MiB, a redirecting video URL, or the 4K/14 MiB D3-shaped WebM; Discord n1 fails, r1 succeeds; WhatsApp s1 succeeds (slowly), v1 falls back to a static poster with no inline playback, n1 fails, r1 succeeds.
- **NOT TESTED:** Telegram (cancelled), X, Facebook, iMessage, LinkedIn, Slack; the `c1` cache/refetch probe was deployed but never exercised on a real platform; `s2`/`s3`/`n2`/`r2`/`r3` were deployed but not part of Mazen's reported results.

**Cloudflare Range/Content-Length finding (lab-only, applies to Phase 3 planning).** Cloudflare Workers Static Assets served through `env.ASSETS.fetch()` answers every request with **HTTP 200 and no `Content-Length`**, ignoring an incoming `Range` header entirely (GitHub Pages, by contrast, answers a byte range with 206 and `Content-Range`). The lab Worker works around this by buffering each asset (all ≤ 15 MiB) and implementing 206 partial content / 416 out-of-range itself. A future production media path serving larger or real Intro-derived video through a Worker will need the same handling (or a different serving strategy) — this was not a problem in Phase 0a because Phase 0a serves no video.

**Architectural conclusions to carry into Phase 1 design:**
1. The permanent GamID URL must ultimately answer **HTTP 200 directly** with crawler-readable metadata; it must not depend on today's 404 + client-side-redirect.
2. A redirect *can* produce a preview (confirmed on both tested platforms), but that is not the target design — direct 200 remains preferred.
3. Progressive enhancement holds: a rich static Identity Card is the reliable baseline everywhere; video is an enhancement only where a platform is proven to support it.
4. Discord: click-to-play video preview is available (proven).
5. WhatsApp: treat as static-poster/image only; do not depend on inline video there (proven).
6. No autoplay assumption anywhere (Discord explicitly requires a click; nothing tested autoplayed).
7. Telegram, X, Facebook, iMessage, LinkedIn and Slack remain **UNTESTED** — none may be claimed as validated in any future design document.
8. The accepted Intro/D3 pipeline is unchanged and untouched; social-preview media stays an additive concern (a possible future MP4/H.264 derivative, decided in a later phase, not this one).

**Preserved for future phases.** The `social-lab/` folder (Worker, staging script, `wrangler.jsonc`) is committed at this checkpoint so the validation is reproducible; the generated synthetic media files are git-ignored (`social-lab/assets/`, regenerate with `social-lab/generate-assets.ps1`, requires a local `ffmpeg`) rather than committed, to keep the repository small. The `gamid-social-lab` Worker itself is left deployed (free plan) as a live reference; it can be removed at any time with `wrangler delete --name gamid-social-lab`.

**Validation of this closing checkpoint.** `npm run build`: **738/738** tests, unchanged — Phase 0a/0b added no application code and no migration, so no test was added or modified. GitHub Pages and the accepted Phase 0a Worker (`gamid-testing-static.gamid.workers.dev`) both re-verified healthy (200 on the landing page, `/account/`, and the public `@black` profile) after this checkpoint was pushed. Supabase, Auth/OAuth, Google Cloud, DNS, the domain, the Intro pipeline and real user data were not touched by any part of this section. Production was never accessed.

**Status: CLOSED, awaiting Mazen's acceptance before Phase 1** (the `/@*` dynamic Worker, which will resolve the accepted `/@black` limitation from Phase 0a).

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
| Desktop Intro appearance | **PRESENTATION IMPROVED IN TESTING (7q); media quality decision OPEN** | Landscape: sharp capped foreground + ambient glow. Root cause is mainly D3 compression (≈ 1.1 Mbps for 1080p30); no CRF/Cloud Run change made — needs representative sources, measurements, cost analysis and approval |
| Replace/Remove/transition manual regressions | **DEFERRED** | Implemented, but final manual checks incomplete |
| Existing-email Create Account UX | **DEFERRED** | Enumeration-safe Auth behavior can lead an already-registered email into the verification presentation instead of clearly guiding a returning user; do not change it incidentally |
| Supabase Pro / leaked-password protection | **DEFERRED** | A future service-plan/security decision, not current implementation authorization |
| Built-in Supabase email sender limits | **KNOWN PRODUCTION CONCERN** | Real confirmation email worked in TESTING; custom SMTP/rate-limit planning belongs to Production readiness |
| Real Intro stretches an uploaded landscape/horizontal video (distorted, poor quality on mobile and PC) | **ASPECT RATIO FIXED — PASS on Samsung and PC (Mazen); desktop landscape quality follow-up in 7q** | Root cause: presentation (`object-fit: cover` in portrait viewports zoomed a landscape clip ~3.8× and cropped it to its middle 27 %); the pipeline never resizes. Now cover only when ≥ 70 % of the picture survives, otherwise contain; never a non-uniform stretch. See section 7p |
| Large game libraries (200–300+) would expand the editor/profile | **FIXED for the editor list (provider-neutral)** | Collapsed by default: 8 games, total count, chevron expand/collapse; no public game display exists yet. See section 7p |
| Playtime/hours must be private by default | **IMPLEMENTED (owner switch + server gate; no public game display yet)** | `profiles.show_game_playtime` default false, owner-only RPCs, gate needs ON + published. See section 7p |
| Mobile optional-card / Bio overlap visual bug | **KNOWN, NOT FIXED** | Recorded backlog; not part of this change |
| SteamID64 shown as the public Steam identity | **KNOWN, BACKLOG** | Backend/internal technical identifier; should not be the normal public-facing Steam identity |
| W0: tiny/edge element could not be re-enlarged; group had no usable resize handles (real Samsung) | **FIXED AND PASSED on Mazen's Samsung** | Screen-space handles + move pad + Size buttons; Group/Ungroup leave Multi mode. Do not redesign; only avoid regression. See section 7o |
| Game ID Wall W0 on iPhone / iOS | **NOT TESTED / DEVICE UNAVAILABLE** | No iPhone available; neither PASS nor FAIL; do not infer from Android/emulation |
| Marvel Rivals stats (Game Profile) | **NOT INTEGRATED — waiting on a permitted, reachable provider** | MarvelRivalsAPI.com was down (Cloudflare 502) and is unofficial/unsanctioned; Tracker.gg is never to be scraped; no key requested, no fake data. The provider-neutral Game Profile foundation (section 7s) is ready to receive a real adapter. Marvel Rivals stays a compact "Discovered via Steam" row with no arrow |
| Public My Games (compact six-game list, View all, own-library search, Game Details, Steam / Manual source states, playtime and ranks & stats privacy) | **IMPLEMENTED — MANUALLY TESTED — ACCEPTED BY MAZEN (section 7w; accepted implementation checkpoint `006b97375a30d0be248d22e021b3588d673e1ee7`, including the global rank / stats privacy correction and the real Steam icon)** | Default OFF for everyone; three library-wide switches (no per-game switch); Discord is not a game source; nothing is ever labelled VERIFIED; hidden values are absent from the server response, not hidden by CSS. Xbox / PlayStation / IGDB / Marvel stats / W1 not started. |
| Public Profile responsive height / overflow (desktop + mobile) | **ACCEPTED by Mazen (section 7v)** | The profile now sizes to its content (iframe height = height reported by the profile; panel and Replay Intro are ordinary flow blocks; the page scrolls). The fixed viewport stage exists only while the Intro plays. No magic height. The older "Mobile optional-card / Bio overlap" row above is a separate account-side item and was not re-verified here. |
| Universal Social Identity Preview / Share Engine — architecture research + Phase 0a Cloudflare hosting proof + Phase 0b social-preview validation lab | **PHASE 0a ACCEPTED (checkpoint `270df4b`); PHASE 0b CLOSED, AWAITING MAZEN'S ACCEPTANCE BEFORE PHASE 1 (section 7x)** | Architecture: Workers + Static Assets (not Pages). Confirmed: Discord click-to-play video, WhatsApp static-poster-only, both need a direct HTTP 200 (a 404 kills the preview on both; a redirect works but isn't the target design). Telegram/X/Facebook/iMessage/LinkedIn/Slack NOT TESTED. `/@black` itself is unchanged; no dynamic Worker, no domain, no paid feature. |
| Game Catalog completeness (27,182 games, 102 platforms, 95.65 % with a release year; source Wikidata) | **EXPANDED IN TESTING (section 7u); AWAITING MAZEN'S MANUAL ACCEPTANCE** | Notable games only (at least 2 Wikipedia editions); games with fewer editions, 1,182 games without a source date and 365 unmapped platform values are not covered (fail safe). Extend with the resumable exporter + loader (sections 7t, 7u); better platform data would need IGDB (a key Mazen would create). No typo tolerance. |
| Manual game add / edit / remove in My Games (canonical catalog, multi-platform, MANUAL only) | **IMPLEMENTED AND DEPLOYED TO TESTING; AWAITING MAZEN'S MANUAL ACCEPTANCE** | See section 7t. The library moved out of the Steam card into one provider-neutral My Games region. Xbox / PlayStation / Discord discovery, Marvel stats and W1 not started. |
| Spotify/YouTube usable-layout minimums for the Wall | **FINDING FOR W1** | Provider acceptance ≠ good layout (Spotify compresses/crops at ~200×80; YouTube 200×200 is a square crop). W1 needs a product minimum / variants and aspect-preserving defaults. See section 7o |

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
- derivative ceiling 15 MiB; source ceiling **150 MiB** (raised from 100 MiB, section 7r); duration 0.5–30 seconds.

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

### Play Together future architecture decisions (recorded 2026-09-24; not implementation authorization)

Play Together must eventually support **Team vs Team / Squad vs Squad** discovery as a separate intent from filling the host's squad. A complete squad seeking an opponent does not use `seats_wanted`; opponent format and squad size must come from versioned game/mode rules (for example 5v5 or 3v3), never from League-specific core logic.

Riot queue availability is both region-dependent and time-dependent. A later catalog-maintenance capability must represent `Game → Experience → Queue → Region → Availability / Restrictions → Rule Version → Official Source → Last Verified` and should ingest official Riot-supported sources where possible without an application-code deployment for routine rotations or restrictions. If an official source cannot verify current state, preserve `UNVERIFIED`/`REGION_DEPENDENT` rather than inventing `ACTIVE`. Do not implement this synchronization engine, Team vs Team, matching, or later Play Together lifecycle behavior as part of Slice 1.

Current exact implementation checkpoint: `37c2699bc1152cfcbd6922600b8c2ba7a1907929` — fix: retry/ack Intro handshake + deterministic asset versioning (Opera reliability), section 7g. Built on top of the `/@handle` redirect race fix `08f516087fa61fe54025dc16b3e715d338f73f5e` (section 7f), the Permanent Public GamID URL + QR + Sharing implementation `b1caefacf4652e090d134e9e50851572e9a088eb` (section 7f), the mobile Publish-button manual-acceptance fix `5f7f380ab08608630ee4e3e59d45181766083f39` (section 7e), Public GamID Profile Slice 2/2 (Public Experience + Intro/Transitions) `ce2018f3ff5b2de0a688d3970d81b0c71d8d5cb7` (section 7d), Slice 1/2 (Foundation + Public-Safe Data) `697b6e3773233d4b403becb63a6857893dbe0ea2` (section 7b), the `check_handle_availability_impl` sign-up permission drift fix `6bad4d583735d1e8c589642911f3decd52d7eff2` (section 7c), the accepted Split Reveal Intro-visibility fix `d7466f99e6f5398c5c0e83c029f1d09715c1321f` (section 7a), and the Slice 3C backend/timer checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43`.

Slice 3C exists. Do not restart it. Its backend E2E succeeded and latest automated validation passed. The Split Reveal transition defect within Slice 3C's Full Preview feature is fixed and manually accepted by Mazen (section 7a), but this does not close Slice 3C as a whole — formal acceptance of the rest of Slice 3C was not given, and Mazen intentionally deferred the remaining manual Slice 3C testing/fixes listed in section 9. Do not automatically continue them.

Public GamID Profile Slice 1/2, Slice 2/2, and the Permanent Public GamID URL + QR + Sharing slice all exist, are implemented, and are deployed to TESTING (sections 7b, 7d, and 7f). **None has been formally accepted by Mazen.** `GAMID_ROADMAP.md` items 2, 3, and 4 (Public GamID Profile, Permanent share link, QR sharing) now have no remaining unstarted implementation. Do not infer authorization to start any adjacent roadmap item (Games/Stats/Connections/Socials, a custom domain, platform-specific share integrations, or any AI/Cinematic Identity concept) from any of these slices' existence or position in the roadmap.

A pre-existing, unrelated bug was found during Slice 1/2 testing (`private.check_handle_availability_impl` missing its live `anon` grant, blocking brand-new user sign-up in TESTING) and has since been fixed under separate authorization — see section 7c.

Two genuine bugs were found and fixed during Slice 2/2's own live E2E testing (a message-listener race condition and a CSS `[hidden]` override) — both fixed within this slice's own authorized scope; see section 7d and the section 10 issue register.

A third bug was found by Mazen during his own manual acceptance testing on a real Samsung Android mobile browser — the Publish button could not be activated by a real tap — and has since been fixed under this exact authorized scope only; see section 7e. It went undetected by every prior automated pass because those passes used a synthetic `.click()` call that bypasses real hit-testing.

A fourth bug was found only after deploying the Permanent Public GamID URL to real GitHub Pages: the new `/@handle` redirect (through `404.html`) made the public Intro stage stay blank on roughly 3 of 4 attempts, because the iframe could finish loading and broadcast its ready signal before `public.js`'s deferred module even began executing — a deeper layer of the same class of bug fixed in section 7d, not reproducible against a local static server. Fixed by mirroring `account.js`'s own existing dual-trigger pattern (also listening for the iframe's native `load` event); see section 7f.

A read-only diagnosis (requested separately, performed with no code changes) investigated a real-device report that the public Intro behaves differently in Opera than Chrome, and identified two concrete, evidence-backed risks without proving a single exclusive root cause: a still-unproven-safe handshake timing race, and GitHub Pages' unavoidable `Cache-Control: max-age=600` allowing a browser to legitimately run an older deployed build for up to 10 minutes. Both were then closed under explicit follow-up authorization: the one-shot `ready` broadcast became a bounded retry-until-acknowledged handshake (tolerating either execution order, provably capped, never duplicating playback), and every cross-document reference between the public/account parents and the shared Intro iframe now carries a deploy-derived, automatically-stamped version query string so a stale-cached parent can never end up paired with a mismatched-version child. A related identity-safety gap found during this work — Skip Intro could reveal the raw unconfigured placeholder as if it were a loaded profile — was fixed by only revealing the experience once the child's own state broadcast proves real data was applied. See section 7g. **This is a mitigation validated on Chromium-based tooling only — Mazen's manual acceptance on his real Opera browser is still outstanding and is the actual final acceptance test for the original report.**

Gaming Connections Engine — Discord foundation (section 7h) exists at implementation checkpoint `08b7d039bd118513a8e3129a7e8a70d527cd2bfd` and was **manually accepted by Mazen** with real Discord OAuth (the real TESTING GamID is connected to Discord). The Opera reliability work was likewise accepted on his real Opera browser. The Discord `connections` discovery test (section 7i) was run for real and **Discord returned 0 linked accounts, so Riot was not returned**; that route is closed and the stored result is preserved. The current slice is the **League of Legends prototype** (section 7j, implementation `44c7a4455f40088572d165a6de453b73491d6500`): the owner types a Riot ID once and GamID resolves private, **unverified** League details through an isolated, temporary OP.GG adapter (lookups only on Add/Refresh, throttled in the database, never public). It is deployed to TESTING and waits for Mazen's manual acceptance. Do not start public League visibility, Riot RSO/API, Steam/other providers, game discovery, Socials, or Cinematic Identity without authorization, and never add any way around OP.GG blocking or rate limiting. The anonymous TESTING root is now a real **landing page** (section 7k, implementation `3cb0cde7f474cbe7efd194623c6c02853c3de365`) whose Create your GamID / Sign in buttons open the existing `/account/` flow; the old NovaRift/Intro-lab prototype was preserved at `prototypes/slice-1-intro-lab/` and is not deployed. Do not put it back at the root or expose any prototype controls publicly. **Public Profile Expansion Phase 1** (section 7l, implementation `2e0c433eb37458e943dbdd1d3f0d259105ba46a7`) added the per-section "Show on my GamID" switches (Discord, League, Education & Work; all OFF by default except grandfathered Education/Work data) and the server-enforced `public_sections` boundary; the Public Profile redesign and the Cinematic Profile Engine are NOT started. Never widen `public_sections` without an explicit switch, never expose the Discord account id/avatar URL, tokens, diagnostics, League source URL/ledger, and never present the League prototype as verified. **Steam Connection Foundation** (section 7m, implementation `48efec8857a2773d3b3f678cfc7a2ec9f7cbc04a`) added Steam OpenID 2.0 as a second connection provider on TESTING: the SteamID64 is the whole identity result (CONNECTED, never VERIFIED), private by default with its own "Show on my GamID" switch; game-library discovery, Marvel Rivals, other providers, and the Public Profile redesign are NOT started. Never trust a browser-supplied SteamID, never call the Steam Web API or GetOwnedGames without new approval, and keep the Discord/Steam ledger provider guards intact. **Steam My Games** (section 7n, implementation `aa4aa5e03ecaff15f50d86b03ebb8313a6641b95`) lets the owner load the games of their connected Steam account through the official `GetOwnedGames` API on an explicit button press (private, discovery only, `DISCOVERED_FROM_STEAM`, Marvel Rivals only *recognized*); it needs the server-side secret `STEAM_WEB_API_KEY`, which is NOT yet set. Never accept a SteamID from the browser, never expose or commit the key, never treat discovery as verification, and never let a failed/private refresh replace the last good list. Marvel APIs/stats/UID, other sources, the Game ID Wall and the Public Profile redesign are NOT started.

Do not start the next implementation slice. First inspect the repository read-only, then discuss the roadmap and next priority with Mazen. Proceed only after he explicitly chooses and authorizes the next work.
